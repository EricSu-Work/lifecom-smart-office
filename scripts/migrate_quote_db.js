'use strict';
/**
 * migrate_quote_db.js — S-01 報價追蹤 DB 建立與遷移
 *
 * 流程：
 *  1. 在「報價」頁面下建立新 DB（報價追蹤）
 *  2. 從舊 DB (27ad8a6f-afc6-8043) 取所有記錄
 *  3. 從 biz-projects.xlsx 補金額、日期（依單號比對）
 *  4. 寫入新 DB
 *  5. 輸出新 DB ID（供 notion_client.js 更新用）
 *
 * 依循 LifeCOM AI 運營架構 (docs/lifecom-ops-blueprint.md)
 * S-01 銷售管道模組
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');
const XLSX  = require('xlsx');

const TOKEN    = fs.readFileSync(require('os').homedir() + '/.config/notion/company_api_key', 'utf8').trim();
const PARENT_PAGE_ID = '27ad8a6f-afc6-8078-8114-cc2fb62b1415'; // 「報價」頁面
const OLD_DB_ID      = '27ad8a6f-afc6-8043-bfca-e995ddd3ac1a'; // 現有 New database
const BIZ_FILE       = path.join(__dirname, '../data/biz-projects.xlsx');

// ── Notion API helpers ────────────────────────────────────────────────────────
function notionReq(method, urlPath, body) {
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
        const r = JSON.parse(d);
        if (r.object === 'error') reject(new Error(`Notion API: ${r.message} (${r.code}) path=${urlPath}`));
        else resolve(r);
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}
const notionGet  = (p)    => notionReq('GET',   p, null);
const notionPost = (p, b) => notionReq('POST',  p, b);

// ── Step 1：建立新 DB ─────────────────────────────────────────────────────────
async function createNewDB() {
  console.log('Step 1: 建立新 DB「報價追蹤」...');
  const db = await notionPost('/v1/databases', {
    parent: { type: 'page_id', page_id: PARENT_PAGE_ID },
    title: [{ type: 'text', text: { content: '報價追蹤' } }],
    properties: {
      '客戶':  { title: {} },
      '項目':  { rich_text: {} },
      '單號':  { rich_text: {} },
      '金額':  { number: { format: 'number' } },
      '日期':  { date: {} },
      '狀態':  {
        select: {
          options: [
            { name: '尚未報價', color: 'gray'   },
            { name: '已報價',   color: 'yellow' },
            { name: '已回簽',   color: 'blue'   },
            { name: '功能已完成', color: 'purple' },
            { name: '完成請款', color: 'green'  },
            { name: '作廢',     color: 'red'    },
          ],
        },
      },
      '備註':  { rich_text: {} },
      '網址':  { url: {} },
    },
  });
  console.log('  ✅ 新 DB ID:', db.id);
  return db.id;
}

// ── Step 2：讀舊 DB 全部記錄 ──────────────────────────────────────────────────
async function fetchOldRecords() {
  console.log('Step 2: 讀舊 DB 記錄...');
  const records = [];
  let cursor = undefined;
  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const r = await notionPost(`/v1/databases/${OLD_DB_ID}/query`, body);
    r.results.forEach(row => {
      const p = row.properties;
      records.push({
        客戶: p['客戶']?.title?.[0]?.plain_text || '',
        單號: p['單號']?.rich_text?.[0]?.plain_text || '',
        項目: p['需求']?.rich_text?.[0]?.plain_text?.replace(/\n\s*/g, ' ').trim() || '',
        狀態: p['']?.status?.name || '尚未報價',
        備註: p['備註']?.rich_text?.[0]?.plain_text || '',
        網址: p['網址']?.url || null,
      });
    });
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);
  console.log(`  ✅ 共 ${records.length} 筆`);
  return records;
}

// ── Step 3：從 xlsx 補金額、日期 ──────────────────────────────────────────────
function loadXlsxMap() {
  console.log('Step 3: 讀 biz-projects.xlsx 補金額/日期...');
  const map = {}; // key: 單號, value: { amount, date }
  try {
    const wb = XLSX.readFile(BIZ_FILE);
    const ws = wb.Sheets['報價單Quote'];
    if (!ws) { console.warn('  ⚠️ 找不到報價單Quote 工作表，金額/日期全部留空'); return map; }
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }).slice(1).filter(r => r[1]); // 有單號才算
    rows.forEach(r => {
      const 單號  = String(r[1] || '').trim();
      const 金額  = Number(r[4]) || 0;
      const 日期Serial = r[0];
      let 日期 = null;
      if (日期Serial && typeof 日期Serial === 'number') {
        const d = new Date((日期Serial - 25569) * 86400 * 1000);
        日期 = d.toISOString().slice(0, 10);
      }
      if (單號) map[單號] = { 金額, 日期 };
    });
    console.log(`  ✅ xlsx 共 ${Object.keys(map).length} 筆單號可比對`);
  } catch(e) {
    console.warn('  ⚠️ xlsx 讀取失敗:', e.message);
  }
  return map;
}

// 狀態對映（舊 status → 新 select）
function mapStatus(s) {
  const MAP = {
    '尚未報價': '尚未報價',
    '已報價':   '已報價',
    '已回簽':   '已回簽',
    '功能已完成': '功能已完成',
    '完成請款': '完成請款',
    '作廢':     '作廢',
  };
  return MAP[s] || '尚未報價';
}

// ── Step 4：寫入新 DB ─────────────────────────────────────────────────────────
async function migrateRecords(newDbId, records, xlsxMap) {
  console.log(`Step 4: 遷移 ${records.length} 筆至新 DB...`);
  let ok = 0, matched = 0, fail = 0;

  for (const rec of records) {
    const xlsx = xlsxMap[rec.單號] || {};
    const 金額 = xlsx.金額 || null;
    const 日期 = xlsx.日期 || null;
    if (xlsx.金額) matched++;

    const props = {
      '客戶': { title: [{ text: { content: rec.客戶 } }] },
      '項目': { rich_text: [{ text: { content: rec.項目.slice(0, 2000) } }] },
      '單號': { rich_text: [{ text: { content: rec.單號 } }] },
      '狀態': { select: { name: mapStatus(rec.狀態) } },
      '備註': { rich_text: [{ text: { content: rec.備註.slice(0, 2000) } }] },
    };
    if (金額) props['金額'] = { number: 金額 };
    if (日期) props['日期'] = { date: { start: 日期 } };
    if (rec.網址) props['網址'] = { url: rec.網址 };

    try {
      await notionPost('/v1/pages', {
        parent: { database_id: newDbId },
        properties: props,
      });
      ok++;
      if (ok % 10 === 0) console.log(`  ... ${ok}/${records.length}`);
    } catch(e) {
      fail++;
      console.warn(`  ❌ [${rec.客戶}] ${rec.單號}: ${e.message}`);
    }

    // Rate limit：Notion 每秒約 3 req
    await new Promise(r => setTimeout(r, 350));
  }

  console.log(`  ✅ 成功 ${ok} 筆 | xlsx 補到金額 ${matched} 筆 | 失敗 ${fail} 筆`);
}

// ── 主程式 ────────────────────────────────────────────────────────────────────
async function main() {
  try {
    const newDbId = await createNewDB();
    const records = await fetchOldRecords();
    const xlsxMap = loadXlsxMap();
    await migrateRecords(newDbId, records, xlsxMap);

    console.log('\n========================================');
    console.log('✅ 遷移完成！');
    console.log('新 DB ID:', newDbId);
    console.log('請更新 notion_client.js 加入：');
    console.log(`  '報價追蹤': '${newDbId}'`);
    console.log('並更新 sales_section.js 改讀 Notion DB');
    console.log('========================================');

    // 輸出 ID 供後續使用
    fs.writeFileSync(
      path.join(__dirname, '../data/quote-db-id.json'),
      JSON.stringify({ dbId: newDbId, createdAt: new Date().toISOString() }, null, 2)
    );
  } catch(e) {
    console.error('❌ 遷移失敗:', e.message);
    process.exit(1);
  }
}

main();
