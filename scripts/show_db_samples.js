const { db } = require('./lifecom_db');

// notion_records — 各DB取2筆，顯示解析出的 _title
console.log('\n=== notion_records（各DB前2筆）===');
const dbs = [
  { id: '1a1d8a6fafc681279a49dc5b2fc2aece', name: '客戶總覽' },
  { id: '27ed8a6fafc68077a72ef27928ebe630', name: '尚未到款項' },
  { id: '1bad8a6fafc6800cb784dc2edb9d0bbd', name: 'CSM費用' },
  { id: '208d8a6fafc681d29b26e616811e03c1', name: 'Tasks' },
];
for (const d of dbs) {
  const rows = db.prepare(`SELECT id, json_extract(data,'$._title') as title, json_extract(data,'$._db_name') as db_name, updated_at FROM notion_records WHERE db_id=? ORDER BY updated_at DESC LIMIT 2`).all(d.id);
  console.log(`\n[${d.name}]`);
  rows.forEach((r,i) => console.log(`  ${i+1}. ${r.title || '(無標題)'}`));
}

// finance_records — 2026年各月份抽樣
console.log('\n\n=== finance_records（2026年各月取1筆）===');
const months = db.prepare(`SELECT DISTINCT period FROM finance_records WHERE source='lfk_2026' ORDER BY period`).all();
for (const { period } of months) {
  const row = db.prepare(`SELECT json_extract(data,'$.company') as company, json_extract(data,'$.category') as cat, json_extract(data,'$.amount') as amt, json_extract(data,'$.is_recurring') as recurring FROM finance_records WHERE source='lfk_2026' AND period=? LIMIT 1`).get(period);
  if (row) console.log(`  ${period}  ${row.company}  ${row.cat}  NT$${Number(row.amt).toLocaleString()}  ${row.recurring ? '經常性':'一次性'}`);
}

// 交叉驗證：2026-03 經常性合計 vs finance_section.js 的數字
const cur = db.prepare(`SELECT SUM(CAST(json_extract(data,'$.amount') AS REAL)) as total FROM finance_records WHERE source='lfk_2026' AND period='2026-03' AND json_extract(data,'$.is_recurring')=1`).get();
console.log(`\n2026-03 經常性合計: NT$${Math.round(cur.total).toLocaleString()}`);
console.log('(finance_section.js 顯示 NT$1,578,732，差異應 < 5%)');
