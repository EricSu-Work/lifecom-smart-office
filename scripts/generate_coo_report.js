'use strict';
/**
 * generate_coo_report.js — COO 營運日報
 *
 * 視角：OP 主管（營運經理）
 * 關注：客服工單 SLA、OP Task 進度、系統告警對客服影響、代運營交付
 *
 * 設計原則：
 *   1. 營運視角，不講技術（與 CTO 日報互補）
 *   2. 客服 SLA 為核心指標
 *   3. 只列 OP 主管需要行動的事項
 *   4. 精簡：目標 30 行以內
 */

const path = require('path');
const fs = require('fs');
const { db } = require('./lifecom_db');
const { getTodayInfo, saveReport } = require('./utils');
const { buildInsightPlaceholder } = require('./management_advisor');

const ADO_BASE = 'https://dev.azure.com/LifeComTW/LifeCOM/_workitems/edit';
function adoLink(id) { return `<${ADO_BASE}/${id}|#${id}>`; }

const ALERT_CHANNEL = 'C03TBQ5891V';

// ── Section 1: 今日行動清單 ──────────────────────────────────────────────────
function getActionItems(slaBreaches, opTasks, alerts) {
  const items = [];

  // SLA 逾期需即時處理
  const p01 = slaBreaches.filter(b => b.priority <= 2);
  p01.slice(0, 2).forEach(b => {
    items.push(`🚨 ${b.customer} P${b.priority - 1} 工單 SLA 逾期 ${b.overHours}h — 需立即指派或升級`);
  });

  // OP Task 逾期
  const overdueTasks = opTasks.filter(t => {
    if (!t.target_date || t.state === 'Closed' || t.state === 'Removed') return false;
    return t.target_date * 1000 < Date.now();
  });
  if (overdueTasks.length > 0) {
    items.push(`📋 ${overdueTasks.length} 筆 OP 任務已逾期 — 需確認進度或重新排程`);
  }

  // 近 1 小時高頻告警（可能影響客服）
  const recentAlerts = alerts.filter(a => parseFloat(a.ts) > Date.now() / 1000 - 3600);
  if (recentAlerts.length >= 3) {
    items.push(`⚠️ 過去 1 小時 ${recentAlerts.length} 則系統告警 — 客服可能受到客戶詢問`);
  }

  if (!items.length) return '  ✅ 今日無特別需關注事項';
  return items.map(i => `  ${i}`).join('\n');
}

// ── Section 2: 客服工單 SLA ─────────────────────────────────────────────────
function getSLASection(slaBreaches) {
  const now = Math.floor(Date.now() / 1000);
  const since14d = now - 14 * 86400;

  // 近 14 天 Bug 工單統計
  const bugs = db.prepare(`
    SELECT id, title, state, assigned_to, customer_tag, created_at, updated_at, severity, meta
    FROM ado_workitems WHERE type='Bug' AND created_at > ?
    ORDER BY created_at DESC
  `).all(since14d);

  const openBugs = bugs.filter(b => !['Closed', 'Resolved', 'Removed'].includes(b.state));
  const closedBugs = bugs.filter(b => ['Closed', 'Resolved'].includes(b.state));
  const closeRate = bugs.length > 0 ? Math.round(closedBugs.length / bugs.length * 100) : 100;

  // 今日新開 & 今日關閉
  const todayStart = now - (now % 86400) - 8 * 3600; // Asia/Taipei midnight
  const todayNew = bugs.filter(b => b.created_at > todayStart);
  const todayClosed = closedBugs.filter(b => b.updated_at > todayStart);

  const lines = ['══ 1. 客服工單 SLA ═══════════════════════'];

  lines.push(`  近14天工單：${bugs.length} 筆（開放 ${openBugs.length} / 已解 ${closedBugs.length}）`);
  lines.push(`  解決率：${closeRate}%${closeRate >= 90 ? ' 🟢' : closeRate >= 75 ? ' 🟡' : ' 🔴'}`);
  lines.push(`  今日：新開 ${todayNew.length} 筆 / 關閉 ${todayClosed.length} 筆`);

  // SLA 逾期清單
  if (slaBreaches.length > 0) {
    lines.push('');
    lines.push(`  🔴 SLA 逾期工單（${slaBreaches.length} 筆）：`);
    slaBreaches.slice(0, 5).forEach(b => {
      lines.push(`    • ${b.customer} — ${adoLink(b.id)} ${b.title?.substring(0, 35) || '(untitled)'}（逾期 ${b.overHours}h，${b.assigned || '未指派'}）`);
    });
    if (slaBreaches.length > 5) lines.push(`    …等共 ${slaBreaches.length} 筆`);
  } else {
    lines.push('  ✅ 無 SLA 逾期');
  }

  return lines.join('\n');
}

// ── Section 3: OP 任務進度 ─────────────────────────────────────────────────
function getOPTaskSection() {
  const now = Math.floor(Date.now() / 1000);
  const since14d = now - 14 * 86400;

  const tasks = db.prepare(`
    SELECT id, title, state, assigned_to, customer_tag, created_at, updated_at, target_date
    FROM ado_workitems WHERE type='Task' AND created_at > ?
    ORDER BY created_at DESC
  `).all(since14d);

  const open = tasks.filter(t => !['Closed', 'Removed'].includes(t.state));
  const closed = tasks.filter(t => t.state === 'Closed');
  const doneRate = tasks.length > 0 ? Math.round(closed.length / tasks.length * 100) : 100;

  // 逾期
  const overdue = open.filter(t => t.target_date && t.target_date * 1000 < Date.now());

  // 按負責人分組
  const byPerson = {};
  open.forEach(t => {
    const a = t.assigned_to || '未指派';
    byPerson[a] = (byPerson[a] || 0) + 1;
  });
  const topLoad = Object.entries(byPerson).sort((a, b) => b[1] - a[1]).slice(0, 4);

  const lines = ['══ 2. OP 任務進度 ═══════════════════════'];
  lines.push(`  近14天任務：${tasks.length} 筆（完成 ${closed.length} / 進行中 ${open.length}）`);
  lines.push(`  完成率：${doneRate}%${doneRate >= 90 ? ' 🟢' : doneRate >= 75 ? ' 🟡' : ' 🔴'}`);

  if (overdue.length) {
    lines.push(`  🔴 逾期：${overdue.length} 筆`);
    overdue.slice(0, 3).forEach(t => {
      const days = Math.round((Date.now() - t.target_date * 1000) / 86400000);
      const title = t.title?.replace(/\[[^\]]*\]/g, '').trim().substring(0, 35) || '(untitled)';
      lines.push(`    • ${adoLink(t.id)} ${title}（逾期 ${days} 天，${t.assigned_to || '未指派'}）`);
    });
  }

  if (topLoad.length) {
    lines.push(`  人員負載：${topLoad.map(([n, c]) => `${n.split(' ')[0]} ${c}筆`).join('  ')}`);
  }

  return { text: lines.join('\n'), tasks, overdue };
}

// ── Section 4: 系統異常摘要（客服影響面）────────────────────────────────────
function getAlertSection() {
  const now = Math.floor(Date.now() / 1000);
  const since24h = now - 86400;

  const alerts = db.prepare(`
    SELECT ts, text, user_id FROM slack_messages
    WHERE channel_id = ? AND CAST(ts AS REAL) > ?
      AND length(text) > 30
    ORDER BY CAST(ts AS REAL) DESC LIMIT 20
  `).all(ALERT_CHANNEL, since24h);

  const since1h = now - 3600;
  const recentAlerts = alerts.filter(r => parseFloat(r.ts) > since1h);

  // 去重（前40字）
  const seen = new Set();
  const unique = alerts.filter(r => {
    const k = r.text.substring(0, 40);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // 分類：與訂單/出貨/金流相關的對客服影響大
  const impactKeywords = ['訂單', 'order', '出貨', 'shipping', '金流', 'payment', '發票', 'invoice', 'API', 'timeout', 'error', 'fail'];
  const csImpact = unique.filter(r => impactKeywords.some(kw => r.text.toLowerCase().includes(kw.toLowerCase())));

  const lines = ['══ 3. 系統異常（客服影響面）═══════════════'];

  if (!unique.length) {
    lines.push('  ✅ 過去 24 小時無系統告警');
  } else {
    lines.push(`  24h 告警：${unique.length} 則${recentAlerts.length ? `（近1h ${recentAlerts.length} 則）` : ''}`);

    if (csImpact.length) {
      lines.push(`  ⚠️ 可能影響客服的告警（${csImpact.length} 則）：`);
      csImpact.slice(0, 3).forEach(r => {
        const txt = r.text.replace(/<[^>]+>/g, '').replace(/\n.*/g, '').substring(0, 60);
        lines.push(`    • ${txt}`);
      });
    } else {
      lines.push('  ✅ 均為技術性告警，不影響客服');
    }
  }

  return { text: lines.join('\n'), alerts };
}

// ── Section 5: 客戶出貨異常 ──────────────────────────────────────────────────
function getShippingSection() {
  const now = Math.floor(Date.now() / 1000);

  // 從 events 表找出貨/訂單相關 issue
  const shippingEvents = db.prepare(`
    SELECT * FROM events
    WHERE status IN ('open', 'in_progress')
      AND (category = 'issue')
      AND (subject LIKE '%出貨%' OR subject LIKE '%訂單%' OR subject LIKE '%物流%' OR subject LIKE '%shipping%')
    ORDER BY date DESC LIMIT 5
  `).all();

  const lines = ['══ 4. 客戶出貨/訂單異常 ══════════════════'];

  if (!shippingEvents.length) {
    lines.push('  ✅ 無出貨/訂單相關待處理問題');
  } else {
    lines.push(`  ⚠️ 待處理（${shippingEvents.length} 筆）：`);
    shippingEvents.forEach(e => {
      const customer = e.customer_tag || '未標記';
      lines.push(`    • ${customer} — ${e.subject?.substring(0, 40)}（${e.date}）`);
    });
  }

  return lines.join('\n');
}

// ── 主流程 ────────────────────────────────────────────────────────────────────
async function main() {
  const { today, dateStr, dow, todayISO } = getTodayInfo();
  const preview = process.argv.includes('--preview');

  console.log('Generating COO report...');

  // SLA 資料
  let slaBreaches = [];
  try {
    const { run: slaRun } = require('./ado_sla_monitor');
    const slaResult = slaRun();
    slaBreaches = slaResult.breached || [];
  } catch (e) {
    console.error('SLA monitor error:', e.message);
  }

  // 各 section
  const actionItems = getActionItems(slaBreaches, getOPTasks(), getAlerts());
  const slaSection = getSLASection(slaBreaches);
  const { text: opSection } = getOPTaskSection();
  const { text: alertSection, alerts } = getAlertSection();
  const shippingSection = getShippingSection();

  // 報告本體
  const reportBody = [
    '🔔 *今日需要您關注*',
    actionItems,
    '',
    slaSection,
    '',
    opSection,
    '',
    alertSection,
    '',
    shippingSection,
  ].join('\n');

  const insight = buildInsightPlaceholder('coo', reportBody);

  const report = [
    `📋 *LifeCOM 營運日報 — ${dateStr}（週${dow}）*`,
    '══════════════════════════════════════',
    '',
    insight,
    '',
    '══════════════════════════════════════',
    '',
    '🔔 *今日需要您關注*',
    actionItems,
    '',
    slaSection,
    '',
    opSection,
    '',
    alertSection,
    '',
    shippingSection,
    '',
    '══════════════════════════════════════',
    `_營運日報 | ${today.toLocaleTimeString('zh-TW')}_`,
  ].join('\n');

  console.log('\n--- COO REPORT ---');
  console.log(report);
  console.log('------------------');

  const outPath = saveReport(report, `coo-report-${todayISO}.txt`);

  if (preview) {
    console.log('📝 草稿模式，不發送。');
  } else {
    console.log('COO report saved. Agent will send after inserting insight.');
  }
}

// helpers for getActionItems (need raw data before sections format them)
function getOPTasks() {
  const now = Math.floor(Date.now() / 1000);
  return db.prepare(`
    SELECT id, title, state, assigned_to, target_date
    FROM ado_workitems WHERE type='Task' AND created_at > ? AND state NOT IN ('Closed','Removed')
  `).all(now - 14 * 86400);
}

function getAlerts() {
  const since24h = Math.floor(Date.now() / 1000) - 86400;
  return db.prepare(`
    SELECT ts, text FROM slack_messages
    WHERE channel_id = ? AND CAST(ts AS REAL) > ?
      AND length(text) > 30
    ORDER BY CAST(ts AS REAL) DESC LIMIT 20
  `).all(ALERT_CHANNEL, since24h);
}

main().catch(console.error);
