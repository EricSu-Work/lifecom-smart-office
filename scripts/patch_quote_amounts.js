'use strict';
/**
 * patch_quote_amounts.js — 從 Drive 業務文件.xlsx 補金額/日期到 Notion 報價追蹤 DB
 *
 * 流程：
 *  1. 讀 biz-docs-drive.xlsx → 報價單Quote，建 單號→{金額,日期,項目} 對照表
 *  2. 查 Notion 報價追蹤 DB，找出金額為 null 或 0 的記錄
 *  3. 依單號比對，PATCH 補入金額 + 日期
 *
 * 依循 LifeCOM AI 運營架構 S-01
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');
const XLSX  = require('xlsx');

const TOKEN   = fs.readFileSync(require('os').homedir() + '/.config/notion/company_api_key', 'utf8').trim();
const { dbId: NEW_DB_ID } = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/quote-db-id.json'), 'utf8'));
const BIZ_FILE = path.join(__dirname, '../data/biz-docs-drive.xlsx');

console.log('新 DB ID:', NEW_DB_ID);

// ── Notion helpers ─────────────────────────────────────────────────────────────
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
        if (r.object === 'error') reject(new Error(`${r.message} (${r.code})`));
        else resolve(r);
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}
const notionPost  = (p, b) => notionReq('POST',  p, b);
const notionPatch = (p, b) => notionReq('PATCH', p, b);

// ── Step 1：建 xlsx 對照表 ────────────────────────────────────────────────────
function loadXlsxMap() {
  console.log('Step 1: 讀 Drive xlsx...');
  const map = {}; // key: 單號字串, value: { 金額, 日期 }
  const wb = XLSX.readFile(BIZ_FILE);
  const ws = wb.Sheets['報價單Quote'];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }).slice(1);

  let validCount = 0;
  rows.forEach(r => {
    const 單號Raw = r[1];
    if (!單號Raw) return;
    const 單號 = String(單號Raw).trim();
    const 金額Raw = r[4];
    // 金額可能是數字或字串（例如 "517500+8000"），只取純數字
    let 金額 = null;
    if (typeof 金額Raw === 'number' && 金額Raw > 0) {
      金額 = 金額Raw;
    } else if (typeof 金額Raw === 'string') {
      // 取第一個數字段（忽略 +8000 之類的附加）
      const m = 金額Raw.match(/^[\d,]+/);
      if (m) 金額 = parseInt(m[0].replace(/,/g, ''), 10) || null;
    }
    // 日期：Excel serial
    let 日期 = null;
    if (r[0] && typeof r[0] === 'number') {
      日期 = new Date((r[0] - 25569) * 86400 * 1000).toISOString().slice(0, 10);
    }
    if (單號 && (金額 || 日期)) {
      map[單號] = { 金額, 日期 };
      if (金額) validCount++;
    }
  });

  console.log(`  ✅ xlsx 共 ${rows.length} 筆，有金額 ${validCount} 筆`);
  return map;
}

// ── Step 2：取 Notion DB 全部記錄 ─────────────────────────────────────────────
async function fetchAllNotionRecords() {
  console.log('Step 2: 取 Notion 報價追蹤 DB...');
  const records = [];
  let cursor;
  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const r = await notionPost(`/v1/databases/${NEW_DB_ID}/query`, body);
    records.push(...r.results);
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);
  console.log(`  ✅ 共 ${records.length} 筆`);
  return records;
}

// ── Step 3：比對並 PATCH ──────────────────────────────────────────────────────
async function patchRecords(records, xlsxMap) {
  console.log('Step 3: 比對並補金額/日期...');

  // 找需要更新的：金額為 null 或 0，且 xlsx 有對應資料
  const toUpdate = [];
  for (const row of records) {
    const p = row.properties;
    const 單號  = p['單號']?.rich_text?.[0]?.plain_text?.trim() || '';
    const 金額現有 = p['金額']?.number;
    const 日期現有 = p['日期']?.date?.start;

    if (!單號) continue;
    const xlsx = xlsxMap[單號];
    if (!xlsx) continue;

    const needAmount = (!金額現有 || 金額現有 === 0) && xlsx.金額;
    const needDate   = !日期現有 && xlsx.日期;
    if (!needAmount && !needDate) continue;

    toUpdate.push({ pageId: row.id, 單號, xlsx, needAmount, needDate });
  }

  console.log(`  需更新 ${toUpdate.length} 筆（金額或日期缺失）`);

  let ok = 0, fail = 0;
  for (const item of toUpdate) {
    const props = {};
    if (item.needAmount && item.xlsx.金額) props['金額'] = { number: item.xlsx.金額 };
    if (item.needDate   && item.xlsx.日期)  props['日期'] = { date: { start: item.xlsx.日期 } };

    try {
      await notionPatch(`/v1/pages/${item.pageId}`, { properties: props });
      ok++;
      process.stdout.write(`\r  進度: ${ok + fail}/${toUpdate.length}  [${item.單號}]`);
    } catch(e) {
      fail++;
      console.warn(`\n  ❌ ${item.單號}: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 350));
  }

  console.log(`\n  ✅ 更新完成：成功 ${ok} | 失敗 ${fail}`);
  return { ok, fail };
}

// ── 主程式 ────────────────────────────────────────────────────────────────────
async function main() {
  const xlsxMap = loadXlsxMap();
  const records = await fetchAllNotionRecords();
  const { ok, fail } = await patchRecords(records, xlsxMap);

  console.log('\n========================================');
  console.log(`✅ patch_quote_amounts 完成！更新 ${ok} 筆，失敗 ${fail} 筆`);
  console.log('========================================');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
