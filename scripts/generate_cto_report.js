'use strict';
/**
 * generate_cto_report.js — CTO 技術日報 v3（管理視角重設計）
 *
 * 設計原則：
 *   1. 例外管理：只列異常，正常不佔版面
 *   2. 工程師責任制：每人的執行指標一目了然
 *   3. 交付風險優先：逾期 + 本週截止
 *   4. 開頭放需要 CTO 決策的事
 */
const { execSync } = require('child_process');
const path = require('path');
const { db } = require('./lifecom_db');
const { slackPostAll, sendEmail, getTodayInfo, saveReport } = require('./utils');
const { buildInsightPlaceholder } = require('./management_advisor');
const bitbucketSection = require('./bitbucket_section');

const { dms, emails } = require('./people');
const SLACK_CHANNELS = dms('Eric', 'Willy');   // 人員為基礎
const EMAIL_TO       = emails('Eric', 'Willy');

const ADO_BASE = 'https://dev.azure.com/LifeComTW/LifeCOM/_workitems/edit';
function adoLink(id) { return `<${ADO_BASE}/${id}|#${id}>`; }

const STATE_OPEN = ['New', 'Active', 'Code Review', 'Pending'];
const SKIP_AREAS = new Set(['lifecom','rd','op','public','general','lifecomtw','erpv2','lifeerpv2']);
// SLA 規則（小時）
const SLA_HOURS  = { 1: 0, 2: 2, 3: 8, 4: 48 };

function extractCustomer(areaPath, title = '') {
  if (areaPath) {
    const parts = areaPath.split('\\').filter(p => p);
    const c = [...parts].reverse().find(p => !SKIP_AREAS.has(p.toLowerCase()));
    if (c && c !== 'LifeCOM') return c;
  }
  const m = title.match(/\[LifeERP[^\]]*\]\[([^\]]+)\]/i) || title.match(/\[WMS\]\[([^\]]+)\]/i) || title.match(/^\[([^\]]+)\]/);
  return m ? m[1] : '通用';
}

// ── Section 1: 今日需要您處理 ────────────────────────────────────────────────
function getActionItems(openBugs, storeRows) {
  const now = Math.floor(Date.now() / 1000);
  const items = [];

  // P0 未解決（即時 SLA）
  const p0 = openBugs.filter(b => { try { return JSON.parse(b.meta)?.priority === 1; } catch(e){ return false; } });
  p0.forEach(b => {
    const hrs = Math.round((now - b.created_at) / 3600);
    const c = extractCustomer(b.customer_tag, b.title);
    items.push(`🚨 P0 工單 ${adoLink(b.id)} [${c}] ${b.title.replace(/<[^>]*>/g,'').substring(0,35)} — 已 ${hrs}h 未解決（${b.state}）`);
  });

  // SLA P1 逾期超過 24h
  const p1Breach = openBugs.filter(b => {
    try {
      const p = JSON.parse(b.meta)?.priority;
      if (p !== 2) return false;
      return (now - b.created_at) / 3600 > (SLA_HOURS[2] + 24);
    } catch(e) { return false; }
  });
  if (p1Breach.length) {
    items.push(`⚠️ P1 SLA 嚴重逾期 ${p1Breach.length} 筆（超過 26h）— 請確認工程師是否需要支援`);
  }

  // 逾期 > 21 天且完成率 < 50% 的開發專案
  if (storeRows) {
    const blocked = storeRows.filter(r => {
      if (!r.tdate) return false;
      const days = Math.round((Date.now() - r.tdate * 1000) / 86400000);
      return days > 21 && r.weightedRate < 50;
    });
    blocked.slice(0, 2).forEach(r => {
      const days = Math.round((Date.now() - r.tdate * 1000) / 86400000);
      const title = r.title.replace(/\[[^\]]*\]/g, '').trim().substring(0, 30);
      items.push(`📦 ${title} — 逾期 ${days} 天，完成率僅 ${r.weightedRate}%，需評估是否重排`);
    });
  }

  if (!items.length) return '  ✅ 今日無需特別處理';
  return items.map(i => `  ${i}`).join('\n');
}

// ── Section 2: 系統健康 ──────────────────────────────────────────────────────
function getSystemSection(openBugs) {
  const now = Math.floor(Date.now() / 1000);

  // SLA 分析
  const breached = openBugs.filter(b => {
    try {
      const p = JSON.parse(b.meta)?.priority ?? 3;
      const sla = SLA_HOURS[p] ?? SLA_HOURS[3];
      return (now - b.created_at) / 3600 > sla;
    } catch(e) { return false; }
  });

  const all14d = db.prepare(`SELECT count(*) as c FROM ado_workitems WHERE type='Bug' AND created_at > ?`).get(now - 14*86400);
  const slaRate = openBugs.length > 0 ? Math.round((1 - breached.length / openBugs.length) * 100) : 100;
  const slaLight = slaRate >= 95 ? '🟢' : slaRate >= 80 ? '🟡' : '🔴';

  // 持續性異常（slack alerts）
  const persistent = db.prepare(`
    SELECT text FROM slack_messages
    WHERE channel_id = 'C03TBQ5891V'
      AND CAST(ts AS REAL) > ? AND CAST(ts AS REAL) > ?
      AND length(text) > 30
    ORDER BY CAST(ts AS REAL) DESC LIMIT 6
  `).all(now - 86400, now - 7*86400);

  const seen = new Set();
  const uniqueAlerts = persistent.filter(r => {
    const k = r.text.substring(0, 40);
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });

  const lines = ['══ 1. 系統健康 ══════════════════════════'];
  lines.push(`  SLA 達標率：${slaRate}%（開放 ${openBugs.length} 筆 / 逾期 ${breached.length} 筆）${slaLight}`);

  const p0open = openBugs.filter(b => { try { return JSON.parse(b.meta)?.priority === 1; } catch(e){ return false; } });
  const p1open = openBugs.filter(b => { try { return JSON.parse(b.meta)?.priority === 2; } catch(e){ return false; } });
  if (p0open.length || p1open.length) {
    lines.push(`  P0 未解決：${p0open.length} 筆  |  P1 未解決：${p1open.length} 筆`);
  } else {
    lines.push(`  ✅ 無 P0/P1 未解決工單`);
  }

  if (uniqueAlerts.length) {
    lines.push(`  今日告警：${uniqueAlerts.length} 則（持續中問題）`);
    uniqueAlerts.slice(0, 2).forEach(r => {
      const txt = r.text.replace(/<[^>]+>/g, '').replace(/\n.*/,'').substring(0, 65);
      lines.push(`    • ${txt}`);
    });
  } else {
    lines.push(`  今日告警：✅ 無新增`);
  }

  return lines.join('\n');
}

// ── Section 3: 工程師執行力 ──────────────────────────────────────────────────
function getEngineerSection(openBugs) {
  const now = Math.floor(Date.now() / 1000);
  const stale7d = now - 7 * 86400;

  const engMap = {};
  openBugs.forEach(b => {
    const a = b.assigned_to || '未指派';
    if (!engMap[a]) engMap[a] = { open: 0, sla: 0, stale: 0 };
    engMap[a].open++;
    // SLA 逾期
    try {
      const p = JSON.parse(b.meta)?.priority ?? 3;
      const sla = SLA_HOURS[p] ?? SLA_HOURS[3];
      if ((now - b.created_at) / 3600 > sla) engMap[a].sla++;
    } catch(e) {}
    // 殭屍（7天無更新）
    if (b.updated_at < stale7d) engMap[a].stale++;
  });

  // 關閉工單（近14天）
  const closed14d = db.prepare(`
    SELECT assigned_to, count(*) as cnt FROM ado_workitems
    WHERE type='Bug' AND state='Closed' AND updated_at > ?
    GROUP BY assigned_to
  `).all(now - 14*86400);
  const closedMap = {};
  closed14d.forEach(r => { closedMap[r.assigned_to || '未指派'] = r.cnt; });

  const lines = ['══ 2. 工程師執行力（近14天）════════════'];

  const engineers = Object.entries(engMap)
    .sort((a, b) => b[1].sla - a[1].sla || b[1].open - a[1].open);

  if (!engineers.length) {
    lines.push('  ✅ 所有工程師工單正常');
    return lines.join('\n');
  }

  engineers.forEach(([name, m]) => {
    const zombieRate = m.open > 0 ? Math.round(m.stale / m.open * 100) : 0;
    const light = m.sla > 2 || zombieRate > 50 ? '🔴' : m.sla > 0 || zombieRate > 20 ? '🟡' : '🟢';
    const closed = closedMap[name] || 0;
    const shortName = name.split(' ')[0];
    const slaTag    = m.sla > 0 ? ` ⏰SLA逾期${m.sla}` : '';
    const staleTag  = zombieRate > 0 ? ` 殭屍${zombieRate}%` : '';
    lines.push(`  ${light} ${shortName}：開放${m.open}筆${slaTag}${staleTag} | 近14天關閉${closed}筆`);
  });

  return lines.join('\n');
}

// ── Section 4: 交付風險 ──────────────────────────────────────────────────────
function getDeliverySection(storeRows) {
  const now = Date.now();
  const lines = ['══ 3. 交付風險 ══════════════════════════'];

  if (!storeRows || !storeRows.length) {
    lines.push('  *(無進行中開發專案)*');
    return lines.join('\n');
  }

  const overdue  = storeRows.filter(r => r.light === '🔴' && r.tdate);
  const atRisk   = storeRows.filter(r => r.tdate && (() => {
    const days = Math.round((r.tdate * 1000 - now) / 86400000);
    return days >= 0 && days <= 7 && r.weightedRate < 80;
  })());
  const noDate   = storeRows.filter(r => !r.tdate && r.weightedRate < 30 && r.light !== '🟢');

  if (!overdue.length && !atRisk.length) {
    lines.push('  ✅ 無逾期或高風險專案');
  }

  if (overdue.length) {
    lines.push(`  🔴 *逾期（${overdue.length} 件）*`);
    overdue.slice(0, 4).forEach(r => {
      const days = Math.round((now - r.tdate * 1000) / 86400000);
      const prog = r.total > 0 ? `${r.weightedRate}%` : '尚無工作包';
      const title = r.title.replace(/\[[^\]]*\]/g, '').trim().substring(0, 30);
      lines.push(`    • ${title} — 逾${days}天 | 進度${prog}`);
    });
    if (overdue.length > 4) lines.push(`    …等共 ${overdue.length} 件`);
  }

  if (atRisk.length) {
    lines.push(`  🟡 *本週截止高風險（${atRisk.length} 件）*`);
    atRisk.forEach(r => {
      const days = Math.round((r.tdate * 1000 - now) / 86400000);
      const title = r.title.replace(/\[[^\]]*\]/g, '').trim().substring(0, 28);
      lines.push(`    • ${title} — 剩${days}天 | ${r.weightedRate}%`);
    });
  }

  if (noDate.length) {
    lines.push(`  ⚫ 無截止日長期停滯（${noDate.length} 件）— 建議確認是否需要排期`);
  }

  return lines.join('\n');
}

// ── Section 5: 技術債 ────────────────────────────────────────────────────────
function getTechDebtSection() {
  const now = Math.floor(Date.now() / 1000);

  // Epic 長期停滯
  const staleEpics = db.prepare(`
    SELECT customer_tag, count(*) as cnt, min(updated_at) as oldest
    FROM ado_workitems
    WHERE type='Epic' AND state NOT IN ('Closed','Removed') AND updated_at < ?
    GROUP BY customer_tag
    ORDER BY oldest ASC LIMIT 5
  `).all(now - 60 * 86400);

  // 持續性系統問題（從 slack alerts 找連續出現的）
  const recurring = db.prepare(`
    SELECT substr(text, 1, 50) as key, count(*) as cnt
    FROM slack_messages
    WHERE channel_id = 'C03TBQ5891V'
      AND CAST(ts AS REAL) > ?
      AND length(text) > 30
    GROUP BY key
    HAVING cnt >= 3
    ORDER BY cnt DESC LIMIT 3
  `).all(now - 7 * 86400);

  const lines = ['══ 4. 技術債觀察 ════════════════════════'];

  if (staleEpics.length) {
    lines.push(`  Epic 長期停滯（>60天，${staleEpics.length} 客戶）：`);
    staleEpics.forEach(e => {
      const days = Math.floor((now - e.oldest) / 86400);
      const c = (e.customer_tag||'').split('\\').pop();
      lines.push(`    • ${c}：${e.cnt} 筆，最長 ${days} 天無更新`);
    });
  }

  if (recurring.length) {
    lines.push(`  持續重複告警（本週）：`);
    recurring.forEach(r => {
      const txt = r.key.replace(/<[^>]+>/g,'').substring(0, 50);
      lines.push(`    • "${txt}…" × ${r.cnt}次`);
    });
  }

  if (!staleEpics.length && !recurring.length) {
    lines.push('  ✅ 無明顯技術債積壓');
  }

  return lines.join('\n');
}

// ── 主流程 ────────────────────────────────────────────────────────────────────
async function main() {
  const { dateStr, dow, todayISO } = getTodayInfo();

  console.log('v3: Syncing ADO...');
  try { execSync('node ' + path.join(__dirname,'sync_ado.js'), { stdio:'pipe', timeout:60000 }); } catch(e) {}
  console.log('v3: Reading from lifecom.db...');

  const since14d = Math.floor(Date.now()/1000) - 14*86400;
  const openBugs = db.prepare(`
    SELECT id, title, state, assigned_to, customer_tag, created_at, updated_at, meta
    FROM ado_workitems
    WHERE type='Bug' AND state IN ('New','Active','Code Review','Pending')
      AND created_at > ?
    ORDER BY created_at ASC
  `).all(since14d);

  const { run: storeRun } = require('./store_dev_report_db');
  const { rows: storeRows } = storeRun();

  const actionSection    = getActionItems(openBugs, storeRows);
  const systemSection    = getSystemSection(openBugs);
  const engineerSection  = getEngineerSection(openBugs);
  const deliverySection  = getDeliverySection(storeRows);
  const techDebtSection  = getTechDebtSection();

  // Bitbucket 開發活動（async）
  let codeSection = '';
  try {
    codeSection = await bitbucketSection.generate();
    console.log('v3: Bitbucket section generated');
  } catch (e) {
    console.warn('Bitbucket section warn:', e.message.slice(0, 100));
    codeSection = '══ 5. 開發活動（Bitbucket）══════════════\n  ⚠️ 資料取得失敗，下次重試';
  }

  const reportBody = [
    '🔔 *今日需要您處理*',
    actionSection,
    '',
    systemSection,
    '',
    engineerSection,
    '',
    deliverySection,
    '',
    techDebtSection,
    '',
    codeSection,
  ].join('\n');

  const insight = buildInsightPlaceholder('cto', reportBody);

  const report = [
    `🔧 *LifeCOM 技術日報 — ${dateStr}（週${dow}）*`,
    '══════════════════════════════════════',
    '',
    insight,
    '',
    '══════════════════════════════════════',
    '',
    '🔔 *今日需要您處理*',
    actionSection,
    '',
    systemSection,
    '',
    engineerSection,
    '',
    deliverySection,
    '',
    techDebtSection,
    '',
    codeSection,
    '',
    '══════════════════════════════════════',
    `_詳細工單請至 ADO | 有問題請在 thread 回覆_`,
  ].join('\n');

  console.log('\n--- CTO REPORT v3 ---');
  console.log(report);
  console.log('---------------------');

  saveReport(report, `cto-report-${todayISO}.txt`);
  console.log('CTO report saved. Agent will send after inserting insight.');
}

main().catch(console.error);
