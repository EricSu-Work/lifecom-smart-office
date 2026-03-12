'use strict';
/**
 * generate_kpi_report.js — RD 工程師週效能報告 v1
 *
 * 設計原則：異常聚焦，只列「需要關注的人」
 * 發送：Eric DM + Willy DM，每週一 08:00
 * 資料：lifecom.db（ado_workitems）
 */
const { db } = require('./lifecom_db');
const { slackPostAll, getTodayInfo, saveReport } = require('./utils');
const { buildInsightPlaceholder } = require('./management_advisor');
const { dms } = require('./people');

const SLACK_CHANNELS = dms('Eric', 'Willy');

const ADO_BASE = 'https://dev.azure.com/LifeComTW/LifeCOM/_workitems/edit';
function adoLink(id) { return `<${ADO_BASE}/${id}|#${id}>`; }

// 過濾內部 / 非工程師帳號
const SKIP_ASSIGNEES = new Set(['', '未指派', 'kennedy', 'alex', 'lilien']);

function getWeekRange() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  monday.setHours(0, 0, 0, 0);
  const lastMonday = new Date(monday);
  lastMonday.setDate(monday.getDate() - 7);
  return {
    weekStart: Math.floor(lastMonday.getTime() / 1000),
    weekEnd:   Math.floor(monday.getTime() / 1000),
    label:     `${lastMonday.getMonth()+1}/${lastMonday.getDate()} – ${monday.getMonth()+1}/${monday.getDate()-1}`,
  };
}

function generate() {
  const now = Math.floor(Date.now() / 1000);
  const { weekStart, weekEnd, label } = getWeekRange();
  const staleThreshold = now - 7 * 86400;
  const prevWeekStart  = weekStart - 7 * 86400;

  // ── 本週已關閉 Bug（含上週對比）────────────────────────────────
  const closedThisWeek = db.prepare(`
    SELECT COUNT(*) as cnt FROM ado_workitems
    WHERE type='Bug' AND state='Closed'
      AND updated_at >= ? AND updated_at < ?
  `).get(weekStart, weekEnd).cnt;

  const closedLastWeek = db.prepare(`
    SELECT COUNT(*) as cnt FROM ado_workitems
    WHERE type='Bug' AND state='Closed'
      AND updated_at >= ? AND updated_at < ?
  `).get(prevWeekStart, weekStart).cnt;

  const trend = closedThisWeek > closedLastWeek ? `↑ +${closedThisWeek - closedLastWeek}`
              : closedThisWeek < closedLastWeek ? `↓ -${closedLastWeek - closedThisWeek}`
              : '→ 持平';
  const trendIcon = closedThisWeek >= closedLastWeek ? '🟢' : '🟡';

  // ── 所有開放 Bug（近 30 天）────────────────────────────────────
  const since30 = now - 30 * 86400;
  const openBugs = db.prepare(`
    SELECT id, title, state, assigned_to, customer_tag, created_at, updated_at, meta
    FROM ado_workitems
    WHERE type='Bug' AND state NOT IN ('Closed','Removed','Resolved')
      AND created_at > ?
    ORDER BY created_at ASC
  `).all(since30);

  // 過濾內部標籤
  const INTERNAL = new Set(['Public','TEST','RD','OP','LifeCOM','LifeERPv2','通用']);
  const customerBugs = openBugs.filter(b => !INTERNAL.has(b.customer_tag));

  // ── 依工程師分組 ────────────────────────────────────────────────
  const byEng = {};
  customerBugs.forEach(b => {
    const name = b.assigned_to || '未指派';
    if (!byEng[name]) byEng[name] = { open: [], stale: [], unresponded: [] };
    byEng[name].open.push(b);

    // 殭屍：7天未更新
    if (b.updated_at < staleThreshold) byEng[name].stale.push(b);

    // 未接手：state=New + 無 activated_date + 超過 P1=2h / P2=8h
    let priority = 3;
    try { priority = JSON.parse(b.meta||'{}')?.priority ?? 3; } catch(e) {}
    const slaH = priority <= 2 ? 2 : 8;
    let activated = null;
    try { activated = JSON.parse(b.meta||'{}')?.activated_date; } catch(e) {}
    const ageH = (now - b.created_at) / 3600;
    if (b.state === 'New' && !activated && ageH > slaH) {
      byEng[name].unresponded.push(b);
    }
  });

  // ── 本週 Feature Story 交付（逾期項目）────────────────────────
  const INTERNAL_TAGS = new Set(['Public','TEST','RD','OP','LifeCOM','LifeERPv2','通用','public']);
  const overdueFeatures = db.prepare(`
    SELECT id, title, customer_tag, target_date
    FROM ado_workitems
    WHERE type='Feature' AND state IN ('New','Active','Pending')
      AND target_date IS NOT NULL AND target_date < ?
    ORDER BY target_date ASC
    LIMIT 20
  `).all(now).filter(f => !INTERNAL_TAGS.has(f.customer_tag))
    .slice(0, 10);

  // ── 組報表 ─────────────────────────────────────────────────────
  const { dateStr, dow } = getTodayInfo();
  // ISO 週數
  const d = new Date(); const dayOfYear = Math.floor((d - new Date(d.getFullYear(),0,0)) / 86400000);
  const weekNum = Math.ceil(dayOfYear / 7);

  const lines = [
    `📊 *RD 週效能報告 — ${dateStr} W${String(weekNum).padStart(2,'0')} (${label})*`,
    '',
    `⚡ *本週出貨：關閉 Bug ${closedThisWeek} 筆*（${trendIcon} ${trend} vs 上週 ${closedLastWeek} 筆）`,
    '',
  ];

  // ── 需要關注的人 ───────────────────────────────────────────────
  const attention = [];
  Object.entries(byEng).forEach(([name, data]) => {
    if (SKIP_ASSIGNEES.has(name.toLowerCase())) return;
    if (data.stale.length > 0 || data.unresponded.length > 0) {
      attention.push({ name, ...data });
    }
  });

  if (attention.length) {
    lines.push(`⚠️ *需要關注（${attention.length} 人有停滯或未回應工單）*`);
    attention.sort((a, b) => (b.stale.length + b.unresponded.length * 2) - (a.stale.length + a.unresponded.length * 2));
    attention.forEach(({ name, open, stale, unresponded }) => {
      const tags = [];
      if (unresponded.length) tags.push(`🔴 未接手 P1/P2 ${unresponded.length} 筆`);
      if (stale.length) tags.push(`⏰ 殭屍工單 ${stale.length} 筆`);
      lines.push(`  • *${name}*  開放 ${open.length} 筆  ${tags.join('  ')}`);
      // 最嚴重的 2 筆（去重）
      const seenIds = new Set();
      const worst = [...unresponded, ...stale].filter(b => { if (seenIds.has(b.id)) return false; seenIds.add(b.id); return true; }).slice(0, 2);
      worst.forEach(b => {
        const days = Math.floor((now - b.updated_at) / 86400);
        const cust = b.customer_tag || '通用';
        const title = b.title.replace(/\[LifeERPv2\]|\[WMS\]|\[LifeERP[^\]]*\]/gi,'').trim().substring(0, 40);
        lines.push(`    → ${adoLink(b.id)} [${cust}] ${title}（${days}天未動）`);
      });
    });
  } else {
    lines.push('✅ *本週所有工程師無停滯工單，SLA 正常*');
  }

  // ── 正常工程師（一行帶過）─────────────────────────────────────
  const attentionNames = new Set(attention.map(a => a.name));
  const normalEngs = Object.entries(byEng)
    .filter(([name]) => !attentionNames.has(name) && !SKIP_ASSIGNEES.has(name.toLowerCase()))
    .map(([name, data]) => `${name}(${data.open.length}筆)`)
    .join(' · ');
  if (normalEngs) {
    lines.push('');
    lines.push(`✅ *正常：* ${normalEngs}`);
  }

  // ── 未指派工單 ─────────────────────────────────────────────────
  const unassigned = byEng['未指派'];
  if (unassigned?.open.length) {
    lines.push('');
    lines.push(`❓ *未指派工單：${unassigned.open.length} 筆*（需分配責任人）`);
    unassigned.open.slice(0, 3).forEach(b => {
      const cust = b.customer_tag || '通用';
      const title = b.title.replace(/\[LifeERPv2\]|\[WMS\]/gi,'').trim().substring(0, 35);
      lines.push(`  → ${adoLink(b.id)} [${cust}] ${title}`);
    });
  }

  // ── Feature 逾期 ───────────────────────────────────────────────
  if (overdueFeatures.length) {
    lines.push('');
    lines.push(`📦 *Feature 逾期（${overdueFeatures.length} 件）*`);
    overdueFeatures.slice(0, 5).forEach(f => {
      const days = Math.floor((now - f.target_date) / 86400);
      const cust = f.customer_tag || '通用';
      const title = f.title.replace(/\[LifeERPv2\]|\[WMS\]|\[LifeERP[^\]]*\]/gi,'').replace(/\[[^\]]+\]/g,'').trim().substring(0, 40);
      lines.push(`  🔴 ${adoLink(f.id)} [${cust}] ${title} — 逾 ${days} 天`);
    });
    if (overdueFeatures.length > 5) lines.push(`  …等共 ${overdueFeatures.length} 件`);
  }

  lines.push('');
  lines.push(`_資料來源：lifecom.db | 如需工單詳情請至 ADO_`);

  return lines.join('\n');
}

async function main() {
  const preview = process.argv.includes('--preview');
  const reportBody = generate();

  const insight = buildInsightPlaceholder('kpi', reportBody);

  // 找標題行後插入洞察
  const lines = reportBody.split('\n');
  const titleEnd = lines.findIndex((l, i) => i > 0 && l.startsWith('═'));
  const insertAt = titleEnd >= 0 ? titleEnd + 1 : 1;
  lines.splice(insertAt, 0, '', insight, '');
  const report = lines.join('\n');

  console.log(report);
  if (preview) return;

  const { todayISO } = getTodayInfo();
  saveReport(report, `kpi-report-${todayISO}.txt`);
  console.log('KPI report saved. Agent will send after inserting insight.');
}

main().catch(console.error);
