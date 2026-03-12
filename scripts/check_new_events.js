/**
 * check_new_events.js — C-04 L2b 預檢腳本
 * 
 * 查 events 表最近 30 分鐘是否有新事件。
 * 有 → 輸出 JSON（數量+摘要）
 * 無 → 輸出 "NO_EVENTS" 並 exit 0
 */
const { db } = require('./lifecom_db');

const since = Math.floor(Date.now() / 1000) - 1800; // 30 min ago
const rows = db.prepare(
  'SELECT id, category, customer_tag, subject FROM events WHERE extracted_at >= ? ORDER BY id'
).all(since);

if (rows.length === 0) {
  console.log('NO_EVENTS');
  process.exit(0);
}

const byCat = {};
for (const r of rows) byCat[r.category] = (byCat[r.category] || 0) + 1;

console.log(JSON.stringify({
  count: rows.length,
  categories: byCat,
  events: rows.map(r => `${r.id} [${r.category}] ${r.customer_tag || '-'}: ${r.subject}`),
}, null, 2));
