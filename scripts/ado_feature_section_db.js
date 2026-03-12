/**
 * ado_feature_section_db.js — Feature 專案進度區塊（從 lifecom.db 讀取）
 * Feature → User Story 的父子關係透過 parent_id 欄位
 */
const { db } = require('./lifecom_db');

const ADO_BASE = 'https://dev.azure.com/LifeComTW/LifeCOM/_workitems/edit';
function adoLink(id) { return `<${ADO_BASE}/${id}|#${id}>`; }

const STATE_WEIGHT = { 'Closed':1, 'Resolved':0.8, 'Code Review':0.6, 'Active':0.3, 'Pending':0.2, 'New':0 };

function getFeatureLight(weightedRate, targetDate) {
  const now = Date.now();
  if (targetDate) {
    const td = new Date(targetDate * 1000).getTime();
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

function fmtDate(unixTs) {
  if (!unixTs) return '未定';
  const d = new Date(unixTs * 1000);
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
}

function generate({ format = 'ceo' } = {}) {
  // 取 Active/New Feature
  const features = db.prepare(`
    SELECT id, title, state, customer_tag, target_date, updated_at
    FROM ado_workitems
    WHERE type = 'Feature' AND state IN ('New','Active','Pending')
    ORDER BY target_date ASC NULLS LAST, updated_at DESC
    LIMIT 100
  `).all();

  if (!features.length) return '📊 *專案進度*\n  *(無進行中 Feature)*';

  // 取所有相關 User Story
  const featureIds = features.map(f=>f.id);
  const stories = featureIds.length
    ? db.prepare(`
        SELECT id, state, parent_id
        FROM ado_workitems
        WHERE type = 'User Story' AND parent_id IN (${featureIds.join(',')})
      `).all()
    : [];

  // 建立 Feature → Stories 映射
  const storyMap = {};
  stories.forEach(s => {
    if (!storyMap[s.parent_id]) storyMap[s.parent_id] = [];
    storyMap[s.parent_id].push(s);
  });

  const lines = [];

  if (format === 'project') {
    // 依客戶分組，顯示燈號統計
    const byCustomer = {};
    features.forEach(f => {
      const c = f.customer_tag || '通用';
      if (!byCustomer[c]) byCustomer[c] = { green:0, yellow:0, red:0, black:0, total:0 };
      const ss = storyMap[f.id] || [];
      const total = ss.length;
      const weighted = total > 0 ? ss.reduce((s,st) => s + (STATE_WEIGHT[st.state]||0), 0) / total * 100 : 0;
      const light = getFeatureLight(weighted, f.target_date);
      byCustomer[c].total++;
      if (light==='🟢') byCustomer[c].green++;
      else if (light==='🟡') byCustomer[c].yellow++;
      else if (light==='🔴') byCustomer[c].red++;
      else byCustomer[c].black++;
    });
    lines.push(`📊 *專案進度（Feature，依客戶）*`);
    Object.entries(byCustomer).sort((a,b)=>b[1].total-a[1].total).forEach(([c,s]) => {
      lines.push(`  ${c}：🟢${s.green} 🟡${s.yellow} 🔴${s.red} ⚫${s.black} / 共${s.total}項`);
    });

  } else {
    // ceo / cto：列出各 Feature
    const label = format === 'cto' ? '專案進度（Feature 詳細）' : '專案進度';
    lines.push(`📊 *${label}*`);

    features.slice(0, format==='cto' ? 20 : 10).forEach(f => {
      const ss = storyMap[f.id] || [];
      const total = ss.length;
      const weighted = total > 0 ? ss.reduce((s,st) => s+(STATE_WEIGHT[st.state]||0),0)/total*100 : 0;
      const light = getFeatureLight(weighted, f.target_date);
      const pct = total > 0 ? `${Math.round(weighted)}%` : '無Story';
      const dateStr = fmtDate(f.target_date);

      if (format === 'cto') {
        const customer = f.customer_tag || '通用';
        lines.push(`  ${light} ${adoLink(f.id)} [${customer}] ${f.title.substring(0,45)} — ${pct} | 上線日：${dateStr}`);
        if (ss.length) {
          const stateGroups = {};
          ss.forEach(s => { stateGroups[s.state] = (stateGroups[s.state]||0)+1; });
          const stateStr = Object.entries(stateGroups).map(([s,c])=>`${s}×${c}`).join(' ');
          lines.push(`    Stories(${ss.length}): ${stateStr}`);
        }
      } else {
        lines.push(`  ${light} ${adoLink(f.id)} ${f.title.substring(0,50)} — ${pct} | ${dateStr}`);
      }
    });

    if (features.length > (format==='cto' ? 20 : 10)) {
      lines.push(`  …另 ${features.length - (format==='cto' ? 20 : 10)} 個 Feature`);
    }
  }

  return lines.join('\n');
}

module.exports = { generate };
