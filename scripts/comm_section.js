/**
 * comm_section.js — C-04 通訊動態 section（CEO 日報用）
 * 
 * 讀取 events 表，產出管理視角的跨頻道通訊摘要。
 */
'use strict';
const { db } = require('./lifecom_db');

function generate({ days = 7 } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const since = now - days * 86400;
  const todayStr = new Date().toISOString().slice(0, 10);

  // 今日事件
  const todayEvents = db.prepare(
    "SELECT category, customer_tag, subject, source FROM events WHERE date = ? ORDER BY id"
  ).all(todayStr);

  // 近 N 天客戶×類別統計（用事件日期 date，非萃取時間）
  const sinceDate = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const byCustomer = db.prepare(`
    SELECT customer_tag, category, count(*) as c 
    FROM events WHERE date >= ? AND customer_tag IS NOT NULL 
    GROUP BY customer_tag, category ORDER BY c DESC
  `).all(sinceDate);

  // 聚合成客戶維度
  const custMap = {};
  byCustomer.forEach(r => {
    if (!custMap[r.customer_tag]) custMap[r.customer_tag] = { issues: 0, commitments: 0, requests: 0, total: 0 };
    const m = custMap[r.customer_tag];
    if (r.category === 'issue') m.issues = r.c;
    else if (r.category === 'commitment') m.commitments = r.c;
    else if (r.category === 'request') m.requests = r.c;
    m.total += r.c;
  });

  // 排序：issues 最多的在前
  const ranked = Object.entries(custMap)
    .sort((a, b) => b[1].issues - a[1].issues);

  // 跨頻道統計（用事件日期）
  const bySource = db.prepare(
    'SELECT source, count(*) as c FROM events WHERE date >= ? GROUP BY source'
  ).all(sinceDate);
  const srcMap = {};
  bySource.forEach(r => { srcMap[r.source] = r.c; });

  // 開放承諾
  const openCommits = db.prepare(
    "SELECT customer_tag, subject, action, date FROM events WHERE category='commitment' AND status='open' ORDER BY date"
  ).all();

  // 趨勢：本週 vs 上週（用事件日期）
  const weekAgoDate = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const twoWeekAgoDate = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  const thisWeek = db.prepare(
    'SELECT count(*) as c FROM events WHERE date >= ?'
  ).get(weekAgoDate).c;
  const lastWeek = db.prepare(
    'SELECT count(*) as c FROM events WHERE date >= ? AND date < ?'
  ).get(twoWeekAgoDate, weekAgoDate).c;

  // ── 組裝 ──
  const lines = ['══ 6. 通訊動態（LINE + Slack）══════════'];

  // 今日摘要
  if (todayEvents.length) {
    const todayIssues = todayEvents.filter(e => e.category === 'issue').length;
    const todayCommits = todayEvents.filter(e => e.category === 'commitment').length;
    const todayReqs = todayEvents.filter(e => e.category === 'request').length;
    const parts = [];
    if (todayIssues) parts.push(`🔴 ${todayIssues} 個問題`);
    if (todayReqs) parts.push(`🟡 ${todayReqs} 個需求`);
    if (todayCommits) parts.push(`🟢 ${todayCommits} 個承諾`);
    lines.push(`  今日事件：${parts.join('、') || '無'}`);
  } else {
    lines.push('  今日暫無通訊事件');
  }

  // 客戶熱點（Top 5）
  if (ranked.length) {
    lines.push(`  📊 近 ${days} 天客戶問題熱點：`);
    ranked.slice(0, 5).forEach(([name, m], i) => {
      const light = m.issues >= 30 ? '🔴' : m.issues >= 10 ? '🟡' : '⚪';
      const extras = [];
      if (m.commitments) extras.push(`${m.commitments} 承諾`);
      if (m.requests) extras.push(`${m.requests} 需求`);
      const extra = extras.length ? `（${extras.join('、')}）` : '';
      lines.push(`    ${light} ${name}：${m.issues} 個問題${extra}`);
    });
    if (ranked.length > 5) {
      lines.push(`    …另 ${ranked.length - 5} 個客戶有事件`);
    }
  }

  // 開放承諾追蹤
  if (openCommits.length) {
    lines.push(`  🤝 開放承諾（${openCommits.length} 筆）：`);
    openCommits.slice(0, 3).forEach(c => {
      const age = Math.floor((now - new Date(c.date).getTime() / 1000) / 86400);
      const stale = age > 3 ? ' ⚠️逾期' : '';
      lines.push(`    • ${c.customer_tag || '?'}：${c.action.substring(0, 50)}${stale}`);
    });
  }

  // 趨勢
  if (lastWeek > 0) {
    const delta = thisWeek - lastWeek;
    const pct = ((delta / lastWeek) * 100).toFixed(0);
    const trend = delta > 0 ? `▲ +${pct}%` : delta < 0 ? `▼ ${pct}%` : '→ 持平';
    lines.push(`  📈 週趨勢：本週 ${thisWeek} 事件 vs 上週 ${lastWeek}（${trend}）`);
  } else {
    lines.push(`  📈 本週 ${thisWeek} 事件（首週，無對比基準）`);
  }

  // 頻道分布
  const srcParts = [];
  if (srcMap.slack) srcParts.push(`Slack ${srcMap.slack}`);
  if (srcMap.line) srcParts.push(`LINE ${srcMap.line}`);
  if (srcParts.length) lines.push(`  📡 來源：${srcParts.join(' | ')}`);

  return { text: lines.join('\n'), ranked, todayEvents, openCommits };
}

module.exports = { generate };
