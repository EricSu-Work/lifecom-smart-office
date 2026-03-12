'use strict';
/**
 * generate_ceo_report.js — CEO 管理日報 v3（管理視角重設計）
 *
 * 設計原則：
 *   1. 正常不佔版面，只有異常才出現
 *   2. 業務語言，不說技術術語
 *   3. 最前面放「今天要做什麼決策」
 *   4. 精簡：目標 35 行以內
 */
'use strict';
const { execSync } = require('child_process');
const path = require('path');
const https = require('https');
const fs = require('fs');
const { db, cursor, batchUpsert, slack } = require('./lifecom_db');
const { slackPostAll, sendEmail, getTodayInfo, saveReport } = require('./utils');
const finance        = require('./finance_section');
const ar             = require('./ar_section_db');
const sales          = require('./sales_section');
const customerHealth = require('./customer_health');
const { buildInsightPlaceholder } = require('./management_advisor');
const commSection    = require('./comm_section');

const { dms, emails } = require('./people');
const SLACK_CHANNELS = dms('Eric');
const EMAIL_TO       = emails('Eric');
const ALERT_CHANNEL  = 'C03TBQ5891V';
const DEPLOY_CHANNEL = 'C03FSJ3PQKD';
const MRR_TARGET     = 1600000; // 本月目標（可調整）

const ADO_BASE = 'https://dev.azure.com/LifeComTW/LifeCOM/_workitems/edit';
function adoLink(id) { return `<${ADO_BASE}/${id}|#${id}>`; }

const fmt = n => 'NT$' + Math.round(n || 0).toLocaleString();
const pct = (a, b) => {
  if (!b) return '';
  const v = ((a - b) / b * 100).toFixed(1);
  return (parseFloat(v) >= 0 ? '▲ +' : '▼ ') + v + '%';
};

// ── 增量同步 ──────────────────────────────────────────────────────────────────
const token = fs.readFileSync(require('os').homedir() + '/.config/slack/user_token', 'utf8').trim();
function slackGetApi(p) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname: 'slack.com', path: p, method: 'GET',
      headers: { 'Authorization': 'Bearer ' + token }
    }, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve(JSON.parse(d))); });
    req.on('error', reject); req.end();
  });
}
async function syncSlack(channelId, limit = 50) {
  const key = 'slack_' + channelId;
  const lastTs = cursor.get(key) || '0';
  const res = await slackGetApi(`/api/conversations.history?channel=${channelId}&oldest=${lastTs}&limit=${limit}&inclusive=false`);
  if (!res.ok || !res.messages?.length) return 0;
  const msgs = res.messages.filter(m => m.type === 'message' && m.ts !== lastTs);
  if (!msgs.length) return 0;
  const rows = msgs.map(m => ({ ts: m.ts, channel_id: channelId,
    user_id: m.user || m.bot_id || '', text: m.text || '',
    attachments: m.attachments ? JSON.stringify(m.attachments) : null,
    thread_ts: m.thread_ts || null, reactions: null }));
  batchUpsert(slack.upsert, rows);
  cursor.set(key, msgs.reduce((max, m) => m.ts > max ? m.ts : max, '0'));
  return rows.length;
}

// ── Section 1: 今日需要關注 ───────────────────────────────────────────────────
function getAttentionItems(arItems, storeRows, bugs) {
  const items = [];

  // P0/P1 未關閉 Bug（只看開放中）
  const openBugs = bugs.filter(b => !['Closed','Resolved','Removed'].includes(b.state));
  const p01 = openBugs.filter(b => {
    try { const p = JSON.parse(b.meta)?.priority; return p === 1 || p === 2; } catch(e){ return false; }
  });
  if (p01.length) {
    p01.slice(0, 2).forEach(b => {
      const customer = (b.customer_tag||'').split('\\').pop() || '客戶';
      items.push(`🚨 ${customer} P${(()=>{ try{return JSON.parse(b.meta).priority-1;}catch(e){return 1;}})()}未解決工單：${adoLink(b.id)} ${b.title.replace(/<[^>]*>/g,'').substring(0,35)}（${b.state}）`);
    });
  }

  // 逾期應收 > NT$50,000
  const bigAR = arItems.filter(i => (i.amount||0) > 50000);
  bigAR.slice(0, 2).forEach(i => {
    items.push(`💰 ${i.name} 應收 ${fmt(i.amount)} 尚未入帳（${i.note}）`);
  });

  // 開發逾期 > 14 天
  if (storeRows) {
    const overdue = storeRows.filter(r => r.tdate && r.light === '🔴');
    overdue.slice(0, 2).forEach(r => {
      const days = Math.abs(Math.round((r.tdate * 1000 - Date.now()) / 86400000));
      items.push(`📦 ${r.title.substring(0,35)} 已逾期 ${days} 天（完成率 ${r.weightedRate}%）`);
    });
  }

  if (!items.length) return '  ✅ 今日無須特別關注';
  return items.map(i => `  ${i}`).join('\n');
}

// ── Section 2: 財務健康 ────────────────────────────────────────────────────────
function getFinanceSection(financeText, arItems) {
  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

  // 從 lifecom.db 讀本月數字
  const rows = db.prepare(`
    SELECT data FROM finance_records WHERE period = ? AND source LIKE 'lfk_%'
  `).all(period);

  let mrr = 0, total = 0;
  rows.forEach(r => {
    try {
      const d = JSON.parse(r.data);
      const amt = Number(d.amount) || 0;
      total += amt;
      if (d.is_recurring) mrr += amt;
    } catch(e) {}
  });

  // 前月
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevPeriod = `${prevDate.getFullYear()}-${String(prevDate.getMonth()+1).padStart(2,'0')}`;
  const prevRows = db.prepare(`SELECT data FROM finance_records WHERE period = ? AND source LIKE 'lfk_%'`).all(prevPeriod);
  let prevMrr = 0;
  prevRows.forEach(r => { try { const d=JSON.parse(r.data); if(d.is_recurring) prevMrr+=Number(d.amount)||0; } catch(e){} });

  // 去年同月
  const lyPeriod = `${now.getFullYear()-1}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const lyRows = db.prepare(`SELECT data FROM finance_records WHERE period = ? AND source LIKE 'lfk_%'`).all(lyPeriod);
  let lyMrr = 0;
  lyRows.forEach(r => { try { const d=JSON.parse(r.data); if(d.is_recurring) lyMrr+=Number(d.amount)||0; } catch(e){} });

  const targetGap = mrr - MRR_TARGET;
  const targetTag = targetGap >= 0
    ? `達成率 ${((mrr/MRR_TARGET)*100).toFixed(1)}% ✅`
    : `距目標差 ${fmt(Math.abs(targetGap))} ⚠️`;

  // ── 資料一致性稽核 ──────────────────────────────────────────────────────────
  const dataWarnings = [];

  // 1. 筆數異常：本月筆數 < 前月 70%（且已過月中）
  const dayOfMonth = now.getDate();
  if (dayOfMonth >= 15 && prevRows.length > 0 && rows.length < prevRows.length * 0.7) {
    dataWarnings.push(`⚠️ 本月財務記錄僅 ${rows.length} 筆，前月 ${prevRows.length} 筆（差 ${prevRows.length - rows.length} 筆），Excel 可能尚未更新完整`);
  }

  // 2. MRR 異常跳水：本月比前月少超過 15%
  if (prevMrr > 0 && mrr > 0 && mrr < prevMrr * 0.85) {
    dataWarnings.push(`⚠️ MRR 較前月驟降 ${Math.round((1 - mrr/prevMrr)*100)}%（${fmt(prevMrr)} → ${fmt(mrr)}），請確認是否有帳款尚未入帳或客戶異動`);
  }

  // 3. Notion AR 與 finance 對帳：AR 待入帳金額超過 MRR 的 20% 視為異常
  const totalAr = arItems.reduce((s, i) => s + (i.amount || 0), 0);
  if (mrr > 0 && totalAr > mrr * 0.2) {
    dataWarnings.push(`⚠️ AR 待入帳 ${fmt(totalAr)} 達 MRR 的 ${Math.round(totalAr/mrr*100)}%，應收帳款積壓偏高`);
  }

  // 4. 資料完全缺失
  if (rows.length === 0) {
    dataWarnings.push(`🔴 本月財務資料完全缺失（period=${period}），sync_finance.js 可能失敗或 Google Drive 連線異常`);
  }

  const lines = ['══ 1. 財務健康 ══════════════════════════'];

  // 先輸出稽核警告
  if (dataWarnings.length > 0) {
    lines.push('  📋 *資料品質稽核*');
    dataWarnings.forEach(w => lines.push('  ' + w));
    lines.push('');
  }

  if (mrr > 0) {
    lines.push(`  本月經常性收入：${fmt(mrr)}（目標 ${fmt(MRR_TARGET)}）`);
    lines.push(`  ${targetTag}`);
    if (prevMrr) lines.push(`  MoM：${pct(mrr, prevMrr)}  |  YoY：${lyMrr ? pct(mrr, lyMrr) : 'N/A'}`);
    lines.push(`  本月總收入（含一次性）：${fmt(total)}，其中一次性 ${fmt(total - mrr)}`);
  } else {
    // fallback 用 finance_section 輸出
    lines.push(financeText.split('\n').slice(1, 4).join('\n'));
  }

  // 應收逾期（只列有金額的）
  const overdue = arItems.filter(i => (i.amount||0) > 0);
  if (overdue.length) {
    lines.push('');
    lines.push(`  💰 應收待入帳（${overdue.length} 筆，合計 ${fmt(overdue.reduce((s,i)=>s+(i.amount||0),0))}）`);
    overdue.slice(0, 3).forEach(i => {
      const urgency = (i.amount||0) > 100000 ? '🔴' : (i.amount||0) > 30000 ? '🟡' : '⚪';
      lines.push(`    ${urgency} ${i.name}  ${fmt(i.amount)}  ${i.note}`);
    });
    if (overdue.length > 3) lines.push(`    …等共 ${overdue.length} 筆`);
  }

  return lines.join('\n');
}

// ── Section 3: 客戶風險 ────────────────────────────────────────────────────────
function getCustomerRiskSection(bugs) {
  const now = Math.floor(Date.now() / 1000);
  const SKIP = new Set(['lifecom','rd','op','public','general','lifecomtw','erpv2','lifeerpv2']);

  // Epic 長期無更新（30天以上）
  const staleEpics = db.prepare(`
    SELECT title, customer_tag, updated_at
    FROM ado_workitems
    WHERE type = 'Epic' AND state NOT IN ('Closed','Removed')
      AND updated_at < ?
    ORDER BY updated_at ASC LIMIT 10
  `).all(now - 30 * 86400);

  // 依客戶分組異常工單（只看真正開放中）
  const riskMap = {};
  bugs.filter(b => !['Closed','Resolved','Removed'].includes(b.state)).forEach(b => {
    const parts = (b.customer_tag||'').split('\\').filter(p=>p);
    const c = parts.reverse().find(p => !SKIP.has(p.toLowerCase())) || '通用';
    if (!riskMap[c]) riskMap[c] = { bugs: [], epicDays: 0, name: c };
    riskMap[c].bugs.push(b);
  });

  staleEpics.forEach(e => {
    const parts = (e.customer_tag||'').split('\\').filter(p=>p);
    const c = parts.reverse().find(p => !SKIP.has(p.toLowerCase())) || '通用';
    const days = Math.floor((now - e.updated_at) / 86400);
    if (!riskMap[c]) riskMap[c] = { bugs: [], epicDays: 0, name: c };
    if (days > riskMap[c].epicDays) riskMap[c].epicDays = days;
  });

  const red = [], yellow = [];
  Object.values(riskMap).forEach(r => {
    const hasP01 = r.bugs.some(b => { try { return JSON.parse(b.meta)?.priority <= 2; } catch(e){return false;} });
    // 紅燈：P0/P1 開放工單，或維運 60 天無進展
    if (hasP01 || r.epicDays > 60) red.push(r);
    // 黃燈：有開放工單 + 維運停滯，或 epicDays 30-60
    else if ((r.bugs.length > 0 && r.epicDays > 14) || r.epicDays > 30) yellow.push(r);
  });

  const lines = ['══ 2. 客戶風險 ══════════════════════════'];
  if (!red.length && !yellow.length) {
    lines.push('  ✅ 所有客戶狀態正常');
    return lines.join('\n');
  }

  if (red.length) {
    lines.push(`  🔴 高風險（${red.length} 客戶）— 建議本週跟進`);
    red.slice(0, 4).forEach(r => {
      const reasons = [];
      const p01 = r.bugs.filter(b => { try{return JSON.parse(b.meta)?.priority<=2;}catch(e){return false;} });
      if (p01.length) reasons.push(`P${(()=>{try{return JSON.parse(p01[0].meta).priority-1;}catch(e){return 1;}})()}未解決`);
      if (r.epicDays > 60) reasons.push(`維運 ${r.epicDays} 天無進展`);
      lines.push(`    • ${r.name}：${reasons.join('、')}`);
    });
  }

  if (yellow.length) {
    lines.push(`  🟡 需觀察（${yellow.length} 客戶）`);
    yellow.slice(0, 4).forEach(r => {
      const reasons = [];
      if (r.bugs.length) reasons.push(`${r.bugs.length} 筆開放工單`);
      if (r.epicDays > 30) reasons.push(`維運 ${r.epicDays} 天未更新`);
      lines.push(`    • ${r.name}：${reasons.join('、')}`);
    });
  }

  return lines.join('\n');
}

// ── Section 4: 系統可靠度 ──────────────────────────────────────────────────────
function getReliabilitySection() {
  const since1h  = Math.floor(Date.now()/1000) - 3600;
  const since24h = Math.floor(Date.now()/1000) - 86400;

  // 今日新增告警
  const newAlerts = db.prepare(`
    SELECT ts, text FROM slack_messages
    WHERE channel_id = ? AND CAST(ts AS REAL) > ?
      AND length(text) > 30
    ORDER BY CAST(ts AS REAL) DESC LIMIT 5
  `).all(ALERT_CHANNEL, since24h);

  // 過去1小時
  const recentAlerts = newAlerts.filter(r => parseFloat(r.ts) > since1h);

  // SLA 違反數
  const { run: slaRun } = require('./ado_sla_monitor');
  const { breached } = slaRun();
  const p01Breach = breached.filter(b => b.priority <= 2);

  const lines = ['══ 3. 系統可靠度 ══════════════════════'];

  if (!newAlerts.length && !p01Breach.length) {
    lines.push('  ✅ 今日無異常事件');
  } else {
    if (p01Breach.length) {
      lines.push(`  🔴 P0/P1 SLA 逾期：${p01Breach.length} 筆`);
      p01Breach.slice(0, 2).forEach(b => {
        lines.push(`    • ${b.customer} P${b.priority-1} 逾期 ${b.overHours}h（${b.assigned}）`);
      });
    }

    if (newAlerts.length) {
      const seen = new Set();
      const unique = newAlerts.filter(r => {
        const k = r.text.substring(0, 40);
        if (seen.has(k)) return false;
        seen.add(k); return true;
      });
      lines.push(`  🟡 今日告警 ${unique.length} 則${recentAlerts.length ? `（過去1小時 ${recentAlerts.length} 則）` : '（近1小時無新增）'}`);
      unique.slice(0, 2).forEach(r => {
        const txt = r.text.replace(/<[^>]+>/g,'').replace(/\n.*/,'').substring(0, 60);
        lines.push(`    • ${txt}`);
      });
    }
  }

  if (breached.length) {
    const total = db.prepare(`SELECT count(*) as c FROM ado_workitems WHERE type='Bug' AND state NOT IN ('Closed','Removed') AND created_at > ?`).get(Math.floor(Date.now()/1000)-14*86400);
    const slaRate = total.c > 0 ? Math.round((1 - breached.length / total.c) * 100) : 100;
    lines.push(`  SLA 達標率：${slaRate}%（${total.c - breached.length}/${total.c}）${slaRate >= 95 ? '🟢' : slaRate >= 80 ? '🟡' : '🔴'}`);
  }

  return lines.join('\n');
}

// ── Section 5: 交付進度 ────────────────────────────────────────────────────────
function getDeliverySection() {
  const weekAgo = Math.floor(Date.now()/1000) - 7*86400;
  const deploys = db.prepare(`
    SELECT text FROM slack_messages
    WHERE channel_id = ? AND CAST(ts AS REAL) > ?
      AND (text LIKE '%Merged%' OR text LIKE '%Released%')
    ORDER BY CAST(ts AS REAL) DESC LIMIT 5
  `).all(DEPLOY_CHANNEL, weekAgo);

  const { run: storeRun } = require('./store_dev_report_db');
  const { rows } = storeRun();
  const overdue  = (rows||[]).filter(r => r.light === '🔴' && r.tdate);
  const ontrack  = (rows||[]).filter(r => r.light !== '🔴' && r.tdate);

  const lines = ['══ 4. 交付進度 ══════════════════════════'];

  // 本週上線
  if (deploys.length) {
    const versions = [];
    deploys.forEach(r => {
      const m = r.text.match(/v3\.\d+\.\d+/g);
      if (m) versions.push(...m);
    });
    const uniq = [...new Set(versions)];
    if (uniq.length) lines.push(`  ✅ 本週上線：${uniq.slice(0,4).join('、')}${uniq.length>4?'…':''}`);
  } else {
    lines.push('  本週暫無上線記錄');
  }

  // 逾期專案
  if (overdue.length) {
    lines.push(`  🔴 逾期專案（${overdue.length} 件）：`);
    overdue.slice(0, 3).forEach(r => {
      const days = Math.abs(Math.round((r.tdate*1000 - Date.now()) / 86400000));
      const title = r.title.replace(/\[LifeERP[^\]]*\]/g,'').replace(/\[[^\]]+\]/,'').trim().substring(0,30);
      lines.push(`    • ${title} — 逾期 ${days} 天，完成率 ${r.weightedRate}%`);
    });
  }

  // 下週即將截止
  const upcoming = (rows||[]).filter(r => {
    if (!r.tdate) return false;
    const days = Math.round((r.tdate*1000 - Date.now()) / 86400000);
    return days >= 0 && days <= 14;
  });
  if (upcoming.length) {
    lines.push(`  🟡 14天內截止（${upcoming.length} 件）：${upcoming.slice(0,2).map(r=>{
      const days = Math.round((r.tdate*1000-Date.now())/86400000);
      return r.title.replace(/\[[^\]]*\]/g,'').trim().substring(0,20)+'（'+days+'天）';
    }).join('、')}`);
  }

  return lines.join('\n');
}

// ── Section 6: 團隊效能 ────────────────────────────────────────────────────────
function getTeamSection(bugs) {
  const now = Math.floor(Date.now() / 1000);
  const stale7d = now - 7 * 86400;

  const openBugs = bugs.filter(b => b.state !== 'Closed');
  const staleBugs = openBugs.filter(b => b.updated_at < stale7d);
  const bugZombie = openBugs.length > 0 ? Math.round(staleBugs.length / openBugs.length * 100) : 0;

  // OP Task
  const tasks14d = db.prepare(`
    SELECT state, updated_at FROM ado_workitems
    WHERE type='Task' AND state NOT IN ('Removed') AND created_at > ?
  `).all(now - 14 * 86400);
  const openTasks = tasks14d.filter(t => t.state !== 'Closed');
  const taskDone = tasks14d.length > 0 ? Math.round((tasks14d.length - openTasks.length) / tasks14d.length * 100) : 100;

  // 工程師負載
  const byEng = {};
  openBugs.forEach(b => {
    const a = b.assigned_to || '未指派';
    byEng[a] = (byEng[a]||0) + 1;
  });
  const topEng = Object.entries(byEng).sort((a,b)=>b[1]-a[1]).slice(0,3);

  const bugLight  = bugZombie > 30 ? '🔴' : bugZombie > 15 ? '🟡' : '🟢';
  const taskLight = taskDone  < 90 ? '🟡' : '🟢';

  const lines = ['══ 5. 團隊效能 ══════════════════════════'];
  lines.push(`  RD 工單殭屍率：${bugZombie}%（${staleBugs.length}/${openBugs.length} 筆超過7天）${bugLight}`);
  lines.push(`  OP 工單處理率：${taskDone}%（近14天）${taskLight}`);

  if (topEng.length) {
    lines.push(`  工程師負載：${topEng.map(([n,c])=>`${n.split(' ')[0]} ${c}筆`).join('  ')}`);
  }

  return lines.join('\n');
}

// ── 主流程 ────────────────────────────────────────────────────────────────────
async function main() {
  const { today, dateStr, dow, todayISO } = getTodayInfo();
  const preview   = process.argv.includes('--preview');
  const emailOnly = process.argv.includes('--email-only');

  if (emailOnly) {
    const outPath = path.join(require('os').homedir(), `.openclaw/workspace/data/ceo-report-${todayISO}.txt`);
    sendEmail({ to: EMAIL_TO, subject: `[LifeCOM] CEO 管理日報 ${dateStr}`, bodyFile: outPath });
    return;
  }

  // 增量同步
  console.log('Syncing...');
  try { execSync('node ' + path.join(__dirname,'sync_ado.js'),     { stdio:'pipe', timeout:60000 }); } catch(e) {}
  try { execSync('node ' + path.join(__dirname,'sync_finance.js'), { stdio:'pipe', timeout:60000 }); } catch(e) {}
  try { execSync('node ' + path.join(__dirname,'sync_notion.js') + ' dbs', { stdio:'pipe', timeout:90000 }); } catch(e) {}
  try { await syncSlack(ALERT_CHANNEL, 50); } catch(e) {}
  try { await syncSlack(DEPLOY_CHANNEL, 20); } catch(e) {}

  // 取共用資料
  const since14d = Math.floor(Date.now()/1000) - 14*86400;
  const bugs = db.prepare(`
    SELECT id, title, state, assigned_to, customer_tag, created_at, updated_at, meta
    FROM ado_workitems WHERE type='Bug' AND created_at > ?
    ORDER BY created_at DESC
  `).all(since14d);

  const arResult   = ar.generate({ format: 'ceo' });
  const arItems    = arResult.items || [];
  const financeRaw = await finance.generate({ format: 'brief' });

  const { run: storeRun } = require('./store_dev_report_db');
  const { rows: storeRows } = storeRun();

  // 組裝報告
  const attentionSection  = getAttentionItems(arItems, storeRows, bugs);
  const financeSection    = getFinanceSection(financeRaw, arItems);
  const salesSection      = sales.generate({ format: 'ceo' }).text;
  const customerSection   = customerHealth.generate({ format: 'ceo' }).text;
  const reliabilitySection= getReliabilitySection();
  const deliverySection   = getDeliverySection();
  const teamSection       = getTeamSection(bugs);
  const commText          = commSection.generate({ days: 7 }).text;

  // 先組裝報告本體，再生成 AI 洞察
  const reportBody = [
    '🔔 *今日需要您關注*',
    attentionSection,
    '',
    financeSection,
    '',
    salesSection,
    '',
    customerSection,
    '',
    reliabilitySection,
    '',
    deliverySection,
    '',
    teamSection,
    '',
    commText,
  ].join('\n');

  const insight = buildInsightPlaceholder('ceo', reportBody);

  const report = [
    `📊 *LifeCOM 管理日報 — ${dateStr}（週${dow}）*`,
    '══════════════════════════════════════',
    '',
    insight,
    '',
    '══════════════════════════════════════',
    '',
    '🔔 *今日需要您關注*',
    attentionSection,
    '',
    financeSection,
    '',
    salesSection,
    '',
    customerSection,
    '',
    reliabilitySection,
    '',
    deliverySection,
    '',
    teamSection,
    '',
    commText,
    '',
    '══════════════════════════════════════',
    `_如需詳細報告請聯繫 Willy / Kennedy | ${today.toLocaleTimeString('zh-TW')}_`,
  ].join('\n');

  console.log('\n--- CEO REPORT v3 ---');
  console.log(report);
  console.log('---------------------');

  const outPath = saveReport(report, `ceo-report-${todayISO}.txt`);

  if (preview) {
    console.log('📝 草稿模式，不發送。');
  } else {
    console.log('CEO report saved. Agent will send after inserting insight.');
  }
}

main().catch(console.error);
