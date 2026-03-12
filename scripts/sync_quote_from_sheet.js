'use strict';
/**
 * sync_quote_from_sheet.js — 從 Kennedy 的 Google Sheet 同步報價資料到 Notion 報價追蹤 DB
 *
 * 來源：Google Sheet 1nrYYHEBNNnhoRqCfkm_n2eG6QqnRPe0Iai0k57FUrto
 * 目標：Notion 報價追蹤 DB (31bd8a6f-afc6-81ea-81bc-d9c972abbbb5)
 *
 * 金額 = 建置費 + 租賃費 + 客製費 + 串接費 + 代運營（各欄加總）
 * 比對鍵：客戶名稱（normalize 後比對）
 * 策略：能匹配的更新金額/日期/狀態；無法匹配的新增
 *
 * 依循 LifeCOM AI 運營架構 S-01
 */

const https  = require('https');
const fs     = require('fs');
const path   = require('path');

const TOKEN    = fs.readFileSync(require('os').homedir() + '/.config/notion/company_api_key', 'utf8').trim();
const { dbId: NEW_DB_ID } = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/quote-db-id.json'), 'utf8'));
const CSV_FILE = path.join(__dirname, '../data/quote-sheet.csv');

// ── CSV 解析 ──────────────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.split('\n').filter(l => l.trim());
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map(line => {
    const vals = parseCSVLine(line);
    const obj = {};
    headers.forEach((h, i) => obj[h] = (vals[i] || '').trim());
    return obj;
  });
}

function parseCSVLine(line) {
  const result = [];
  let cur = '', inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQuote = !inQuote; }
    else if (c === ',' && !inQuote) { result.push(cur); cur = ''; }
    else { cur += c; }
  }
  result.push(cur);
  return result;
}

function parseAmount(str) {
  if (!str) return 0;
  const cleaned = str.replace(/NT\$|,|\s/g, '');
  return parseInt(cleaned, 10) || 0;
}

function parseDate(str) {
  if (!str) return null;
  const m = str.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  return null;
}

// 進度 → Notion 狀態
const STATUS_MAP = {
  '已報價':    '已報價',
  '已回簽':    '已回簽',
  '已請款':    '完成請款',
  '待收款':    '功能已完成',
  '逾期作廢':  '作廢',
  '優化不收費': '作廢',
  '尚未報價':  '尚未報價',
};
function mapStatus(s) { return STATUS_MAP[s] || '尚未報價'; }

// 客戶名稱 normalize
function norm(s) { return (s || '').replace(/\s/g,'').toLowerCase(); }

// ── Notion helpers ─────────────────────────────────────────────────────────────
function notionReqOnce(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'api.notion.com', path: urlPath, method,
      headers: {
        'Authorization': 'Bearer ' + TOKEN,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode === 429) {
          const retryAfter = parseInt(res.headers['retry-after'] || '2', 10);
          reject({ rateLimited: true, retryAfterMs: retryAfter * 1000 });
          return;
        }
        if (res.statusCode >= 400) {
          const preview = d.slice(0, 300);
          reject(new Error(`Notion API HTTP ${res.statusCode} ${method} ${urlPath}: ${preview}`));
          return;
        }
        let r;
        try { r = JSON.parse(d); } catch (parseErr) {
          reject(new Error(`Notion API JSON parse failed (HTTP ${res.statusCode}): ${d.slice(0, 300)}`));
          return;
        }
        if (r.object === 'error') reject(new Error(`${r.message} (${r.code})`));
        else resolve(r);
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function notionReq(method, urlPath, body) {
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await notionReqOnce(method, urlPath, body);
    } catch (e) {
      if (e && e.rateLimited && attempt < MAX_RETRIES) {
        const waitMs = e.retryAfterMs || (2000 * (attempt + 1));
        console.warn(`\n  ⏳ Rate limited, waiting ${waitMs}ms (retry ${attempt + 1}/${MAX_RETRIES})...`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
      throw e;
    }
  }
}
const notionPost  = (p, b) => notionReq('POST',  p, b);
const notionPatch = (p, b) => notionReq('PATCH', p, b);

async function fetchAllNotionRecords() {
  const records = [];
  let cursor;
  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const r = await notionPost(`/v1/databases/${NEW_DB_ID}/query`, body);
    records.push(...r.results);
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);
  return records;
}

function buildNotionProps(row, 金額, 日期) {
  const props = {
    '客戶': { title: [{ text: { content: row['客戶'] } }] },
    '項目': { rich_text: [{ text: { content: row['項目Title'].slice(0, 2000) } }] },
    '狀態': { select: { name: mapStatus(row['進度']) } },
    '備註': { rich_text: [{ text: { content: (row['附註'] || '').slice(0, 2000) } }] },
  };
  if (金額 > 0) props['金額'] = { number: 金額 };
  if (日期)     props['日期'] = { date: { start: 日期 } };
  return props;
}

// ── 主程式 ────────────────────────────────────────────────────────────────────
async function main() {
  // 1. 解析 Google Sheet CSV
  console.log('Step 1: 解析 Google Sheet...');
  const csv = fs.readFileSync(CSV_FILE, 'utf8');
  const sheetRows = parseCSV(csv).filter(r => r['客戶']); // 過濾空行（最後一行合計）
  console.log(`  ✅ 共 ${sheetRows.length} 筆`);

  // 計算各行金額
  sheetRows.forEach(r => {
    r._金額 = parseAmount(r['建置費']) + parseAmount(r['租賃費']) +
              parseAmount(r['客製費']) + parseAmount(r['串接費']) +
              parseAmount(r['代運營']);
    r._日期  = parseDate(r['報價日期']);
    r._norm  = norm(r['客戶']);
  });

  // 2. 取現有 Notion 記錄
  console.log('Step 2: 取 Notion 報價追蹤 DB...');
  const notionRows = await fetchAllNotionRecords();
  console.log(`  ✅ 現有 ${notionRows.length} 筆`);

  // 建 Notion map (客戶 norm → [records])
  const notionMap = {};
  notionRows.forEach(row => {
    const 客戶 = row.properties['客戶']?.title?.[0]?.plain_text || '';
    const key = norm(客戶);
    if (!notionMap[key]) notionMap[key] = [];
    notionMap[key].push(row);
  });

  // 3. 比對並更新/新增
  console.log('Step 3: 同步...');
  let updated = 0, created = 0, skipped = 0, fail = 0;

  for (const row of sheetRows) {
    const 金額 = row._金額;
    const 日期 = row._日期;
    const props = buildNotionProps(row, 金額, 日期);

    // 找 Notion 裡同客戶的記錄
    const candidates = notionMap[row._norm] || [];
    // 找項目描述最接近的（substring 比對）
    const rowItem = norm(row['項目Title']);
    const match = candidates.find(c => {
      const cItem = norm(c.properties['項目']?.rich_text?.[0]?.plain_text || '');
      return cItem && (cItem.includes(rowItem.slice(0,10)) || rowItem.includes(cItem.slice(0,10)));
    });

    try {
      if (match) {
        // 更新現有記錄
        await notionPatch(`/v1/pages/${match.id}`, { properties: props });
        updated++;
        process.stdout.write(`\r  更新 ${updated} 新增 ${created} 跳過 ${skipped}`);
      } else {
        // 新增記錄
        await notionPost('/v1/pages', { parent: { database_id: NEW_DB_ID }, properties: props });
        created++;
        process.stdout.write(`\r  更新 ${updated} 新增 ${created} 跳過 ${skipped}`);
      }
    } catch(e) {
      fail++;
      console.warn(`\n  ❌ [${row['客戶']}] ${row['項目Title']}: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n\n✅ 同步完成：更新 ${updated} 筆 | 新增 ${created} 筆 | 失敗 ${fail} 筆`);
  console.log(`Notion 報價追蹤 DB 總計：${notionRows.length + created} 筆`);
}

main().catch(e => {
  console.error('\n❌ FATAL:', e && e.message ? e.message : String(e));
  if (e && e.stack) console.error(e.stack);
  process.exit(1);
});
