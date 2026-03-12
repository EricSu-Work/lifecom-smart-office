/**
 * check_stale_commitments.js — 承諾逾期偵測（純腳本，0 AI 成本）
 * 
 * 規則：
 * 1. 開放承諾超過 3 天 → 標記 stale
 * 2. 超過 7 天 → 標記 overdue
 * 3. 超過 due_date → 標記 overdue
 * 
 * 輸出：
 * - NO_STALE → 無逾期承諾
 * - JSON → 有需要追蹤的承諾
 */
'use strict';
const { db } = require('./lifecom_db');

const now = Math.floor(Date.now() / 1000);

const open = db.prepare(
  "SELECT * FROM events WHERE category='commitment' AND status='open' ORDER BY date"
).all();

if (!open.length) {
  console.log('NO_STALE');
  process.exit(0);
}

const results = [];

open.forEach(c => {
  const eventTs = new Date(c.date).getTime() / 1000;
  const ageDays = Math.floor((now - eventTs) / 86400);
  
  let urgency = 'normal';
  if (c.due_date && now > new Date(c.due_date).getTime() / 1000) {
    urgency = 'overdue';
  } else if (ageDays > 7) {
    urgency = 'overdue';
  } else if (ageDays > 3) {
    urgency = 'stale';
  }

  if (urgency !== 'normal') {
    results.push({
      id: c.id,
      customer: c.customer_tag,
      action: c.action.substring(0, 80),
      date: c.date,
      ageDays,
      urgency,
      due_date: c.due_date,
    });
  }
});

if (!results.length) {
  console.log('NO_STALE');
  process.exit(0);
}

console.log(JSON.stringify({ count: results.length, commitments: results }, null, 2));
