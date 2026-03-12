/**
 * store_dev_report_db.js — 開發中 Store 進度（從 lifecom.db 讀取）
 * 對應 store_dev_report.js v1（直接呼叫 ADO API）
 */
const { db } = require('./lifecom_db');

function getFeatureLight(weightedRate, targetDateTs) {
  const now = Date.now();
  if (targetDateTs) {
    const td   = targetDateTs * 1000;
    const days = Math.round((td - now) / 86400000);
    if (days < 0  && weightedRate < 100) return '🔴';
    if (days < 3  && weightedRate < 80)  return '🔴';
    if (days < 7  && weightedRate < 60)  return '🟡';
    if (days < 14 && weightedRate < 30)  return '🟡';
  }
  if (weightedRate >= 80) return '🟢';
  if (weightedRate >= 40) return '🟡';
  if (weightedRate === 0) return '⚫';
  return '🔴';
}

const STATE_WEIGHT = { 'Closed':1,'Resolved':0.8,'Code Review':0.6,'Active':0.3,'Pending':0.2,'New':0 };
const STATE_LABEL  = { 'New':'新建','Active':'進行中','Code Review':'審查中','Pending':'等待','Resolved':'已解決','Closed':'已關閉','User Story':'Story' };

function fmtDate(ts) {
  if (!ts) return '上線日未定';
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
}

function daysTo(ts) {
  if (!ts) return null;
  return Math.round((ts * 1000 - Date.now()) / 86400000);
}

function run({ maxFeatures = 20 } = {}) {
  // 取活躍中的 Feature（有截止日 or 60天內更新）
  const since60 = Math.floor(Date.now()/1000) - 60*86400;
  const features = db.prepare(`
    SELECT id, title, state, target_date, updated_at, parent_id, meta
    FROM ado_workitems
    WHERE type = 'Feature'
      AND state IN ('New','Active','Pending')
      AND (target_date IS NOT NULL OR updated_at > ?)
    ORDER BY target_date ASC NULLS LAST, updated_at DESC
    LIMIT ?
  `).all(since60, maxFeatures);

  if (!features.length) return { lines: ['  *(目前無開發中 Store 專案)*'], rows: [] };

  // 對每個 Feature 查底下的 User Story
  const rows = features.map(f => {
    const stories = db.prepare(`
      SELECT state FROM ado_workitems
      WHERE parent_id = ? AND type = 'User Story'
    `).all(f.id);

    const total = stories.length;
    let weightedSum = 0;
    const breakdown = {};
    stories.forEach(s => {
      weightedSum += STATE_WEIGHT[s.state] || 0;
      breakdown[s.state] = (breakdown[s.state]||0) + 1;
    });
    const weightedRate = total > 0 ? Math.round((weightedSum / total) * 100) : 0;

    const daysSince = Math.round((Date.now()/1000 - f.updated_at) / 86400);
    let light = getFeatureLight(weightedRate, f.target_date);
    if (!f.target_date && daysSince > 30 && weightedRate === 0) light = '⚫';
    if (!f.target_date && daysSince > 14 && weightedRate < 30)  light = '🔴';

    return { fid: f.id, title: f.title, tdate: f.target_date, weightedRate, total, breakdown, light, daysSince };
  });

  const order = { '🔴':0,'🟡':1,'⚫':2,'🟢':3 };
  rows.sort((a,b) => (order[a.light]??9) - (order[b.light]??9));

  const lines = ['*🏪 開發中 Store 專案進度*'];
  rows.forEach(r => {
    const dateStr = r.tdate
      ? (() => {
          const d = daysTo(r.tdate);
          const base = fmtDate(r.tdate);
          if (d < 0)  return `${base} ‼️逾期${Math.abs(d)}天`;
          if (d === 0) return `${base} ⚠️今天截止`;
          return `${base} 剩${d}天`;
        })()
      : `無截止日，${r.daysSince}天前更新`;

    const prog = r.total > 0 ? `${r.weightedRate}%（${r.total}項）` : '尚無工作包';
    lines.push(`  ${r.light} *${r.title}*`);
    lines.push(`     進度 ${prog} | ${dateStr}`);
    if (r.total > 0) {
      const bd = Object.entries(r.breakdown).map(([s,c]) => `${STATE_LABEL[s]||s}:${c}`).join(' / ');
      lines.push(`     ${bd}`);
    }
  });

  return { lines, rows };
}

module.exports = { run };
