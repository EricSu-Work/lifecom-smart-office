/**
 * resolve_events.js — C-04 事件自動結案
 * 
 * 結案規則（基於事件日期 date，非萃取時間）：
 * 1. issue：事件日期超過 48h 且同 subject pattern 近 48h 無新增 → 結案
 * 2. commitment：不自動結案（由 check_stale_commitments.js 追蹤）
 * 3. request：事件日期超過 72h → 結案
 * 4. info/decision：直接結案
 * 
 * 用法：node resolve_events.js [--dry-run]
 */

const { db } = require('./lifecom_db');

const DRY_RUN = process.argv.includes('--dry-run');
const NOW = new Date();
const NOW_S = Math.floor(NOW.getTime() / 1000);

// 轉換 date string (YYYY-MM-DD) 為 Date 物件（Asia/Taipei midnight）
function dateToMs(dateStr) {
  return new Date(dateStr + 'T00:00:00+08:00').getTime();
}

const H48_MS = 48 * 3600 * 1000;
const H72_MS = 72 * 3600 * 1000;
const NOW_MS = NOW.getTime();

// 取得所有 open events
const openEvents = db.prepare(
  `SELECT id, date, subject, category, customer_tag, extracted_at, source 
   FROM events WHERE status = 'open' ORDER BY date ASC`
).all();

console.log(`Open events: ${openEvents.length}`);

// 建立 normalizedSubject → 最新 event date 的 map
const subjectLatestDate = {};
for (const e of openEvents) {
  const norm = normalizeSubject(e.subject);
  if (!subjectLatestDate[norm] || e.date > subjectLatestDate[norm]) {
    subjectLatestDate[norm] = e.date;
  }
}

let resolved = 0;
let skipped = 0;
const resolveStmt = db.prepare(
  `UPDATE events SET status = 'resolved', resolved_at = ? WHERE id = ?`
);

const resolveMany = db.transaction((toResolve) => {
  for (const { id } of toResolve) {
    resolveStmt.run(NOW_S, id);
  }
});

const toResolve = [];

for (const evt of openEvents) {
  const ageMs = NOW_MS - dateToMs(evt.date);
  const norm = normalizeSubject(evt.subject);
  const latestDate = subjectLatestDate[norm];
  const sinceLast = NOW_MS - dateToMs(latestDate);

  let shouldResolve = false;
  let reason = '';

  switch (evt.category) {
    case 'issue':
      if (ageMs > H48_MS && sinceLast > H48_MS) {
        shouldResolve = true;
        reason = `issue ${evt.date}, no recurrence since ${latestDate}`;
      }
      break;

    case 'request':
      if (ageMs > H72_MS) {
        shouldResolve = true;
        reason = `request ${evt.date} (>72h)`;
      }
      break;

    case 'info':
    case 'decision':
      shouldResolve = true;
      reason = `${evt.category} auto-close`;
      break;

    case 'commitment':
      skipped++;
      break;
  }

  if (shouldResolve) {
    if (DRY_RUN) {
      if (resolved < 10) console.log(`[DRY] ${evt.id} | ${evt.date} | ${evt.subject.substring(0,40)} | ${reason}`);
    }
    toResolve.push(evt);
    resolved++;
  }
}

if (!DRY_RUN && toResolve.length > 0) {
  resolveMany(toResolve);
}

const remaining = openEvents.length - resolved - skipped;
console.log(`\nResolved: ${resolved} | Skipped(commitment): ${skipped} | Remaining open: ${remaining}`);
if (DRY_RUN) console.log('(dry-run, no DB changes)');
if (resolved > 10 && DRY_RUN) console.log(`... and ${resolved - 10} more`);

db.close();

function normalizeSubject(subject) {
  return subject
    .replace(/\d+\/\d+/g, '')
    .replace(/\d+%/g, '')
    .replace(/\(\d+%?\)/g, '')
    .replace(/O\w{10,}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
