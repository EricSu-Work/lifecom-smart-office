/**
 * generate_c04_report.js — C-04 通訊事件日報
 * 
 * 用法: node generate_c04_report.js [YYYY-MM-DD]
 * 輸出: 日報文字到 stdout + 存檔到 data/c04-report-{date}.txt
 */
const { db } = require('./lifecom_db');
const fs = require('fs');
const path = require('path');

const targetDate = process.argv[2] || new Date(Date.now() + 8*3600000).toISOString().split('T')[0];
const dow = ['日','一','二','三','四','五','六'][new Date(targetDate + 'T00:00:00+08:00').getDay()];

// ─── 資料查詢 ─────────────────────────────────────────

const todayEvts = db.prepare('SELECT * FROM events WHERE date=? ORDER BY id').all(targetDate);
const byCat = {};
for (const e of todayEvts) byCat[e.category] = (byCat[e.category]||0)+1;

// 客戶維度
const byCustomer = {};
for (const e of todayEvts) {
  const tag = e.customer_tag || '系統/跨客戶';
  if (!byCustomer[tag]) byCustomer[tag] = [];
  byCustomer[tag].push(e);
}

// 近7天趨勢
const weekAgo = new Date(new Date(targetDate).getTime() - 6*86400000).toISOString().split('T')[0];
const trend = db.prepare('SELECT date, COUNT(*) as c FROM events WHERE date>=? AND date<=? GROUP BY date ORDER BY date').all(weekAgo, targetDate);

// Open commitments (全部)
const openCommit = db.prepare("SELECT * FROM events WHERE category='commitment' AND status='open' ORDER BY date DESC LIMIT 10").all();

// Issue 熱點（近7天 by customer）
const hotspots = db.prepare("SELECT customer_tag, COUNT(*) as c FROM events WHERE category='issue' AND date>=? AND date<=? GROUP BY customer_tag ORDER BY c DESC LIMIT 10").all(weekAgo, targetDate);

// LINE 統計
const lineToday = db.prepare("SELECT COUNT(*) as c FROM line_messages WHERE date(ts/1000, 'unixepoch', '+8 hours')=?").get(targetDate);
const lineGroups = db.prepare('SELECT COUNT(*) as c FROM line_groups WHERE active=1').get();

// Slack 今日
const dayStartUnix = new Date(targetDate + 'T00:00:00+08:00').getTime()/1000;
const slackToday = db.prepare('SELECT COUNT(*) as c FROM slack_messages WHERE CAST(ts AS REAL)>=? AND CAST(ts AS REAL)<?').get(String(dayStartUnix), String(dayStartUnix+86400));

// ─── 報告生成 ─────────────────────────────────────────

const lines = [];
const w = (s) => lines.push(s);

w(`:brain: *C-04 通訊事件日報 — ${targetDate}（週${dow}）*`);
w('');
w('*━━ :one: 今日總覽 ━━*');
w(`:red_circle: issue ${byCat.issue||0} | :large_yellow_circle: request ${byCat.request||0} | :blue_circle: commitment ${byCat.commitment||0} | :green_circle: decision ${byCat.decision||0} | :white_circle: info ${byCat.info||0}`);
w(`碎片來源: LINE ${lineToday?.c||0} msgs / Slack ${slackToday?.c||0} msgs`);
w('');

w('*━━ :two: 客戶動態 ━━*');
// 按事件數量排序
const sortedCustomers = Object.entries(byCustomer).sort((a,b) => b[1].length - a[1].length);
for (const [tag, evts] of sortedCustomers) {
  const catIcons = {issue:':red_circle:',request:':large_yellow_circle:',commitment:':blue_circle:',decision:':green_circle:',info:':white_circle:'};
  w(`:small_blue_diamond: *${tag}*（${evts.length} 事件）`);
  for (const e of evts) {
    const icon = catIcons[e.category] || ':grey_question:';
    const assignee = e.assignee ? `（${e.assignee}）` : '';
    w(`  ${icon} ${e.subject}${assignee}`);
  }
}
w('');

w('*━━ :three: Issue 熱點（近7天）━━*');
for (const h of hotspots) {
  const bar = '🔥'.repeat(Math.min(Math.ceil(h.c/5), 5));
  w(`  ${(h.customer_tag||'系統/跨客戶').padEnd(15)} ${String(h.c).padStart(3)} 次 ${bar}`);
}
w('');

w('*━━ :four: 未兌現承諾 ━━*');
if (openCommit.length === 0) {
  w('  :white_check_mark: 無');
} else {
  for (const c of openCommit) {
    const due = c.due_date ? `:date: ${c.due_date}` : ':warning: 未設截止日';
    const assignee = c.assignee ? `（${c.assignee}）` : '';
    w(`  :alarm_clock: [${c.date}] ${c.subject}${assignee} ${due}`);
  }
}
w('');

w('*━━ :five: 7日趨勢 ━━*');
const maxC = Math.max(...trend.map(t=>t.c), 1);
for (const t of trend) {
  const barLen = Math.round(t.c/maxC*10);
  const bar = '▓'.repeat(barLen) + '░'.repeat(10-barLen);
  const isToday = t.date === targetDate ? ' ◀' : '';
  w(`  ${t.date.slice(5)} ${bar} ${t.c}${isToday}`);
}
w('');

w(`_資料來源: lifecom.db C-04 通訊事件智慧層 | LINE ${lineGroups?.c||0} groups + Slack 15 channels_`);

const report = lines.join('\n');
console.log(report);

// 存檔
const outPath = path.join(__dirname, '..', 'data', `c04-report-${targetDate}.txt`);
fs.writeFileSync(outPath, report, 'utf8');
console.log('\n[saved to ' + outPath + ']');
