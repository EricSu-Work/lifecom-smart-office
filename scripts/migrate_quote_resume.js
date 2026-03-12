'use strict';
/**
 * migrate_quote_resume.js — 補跑未完成的遷移
 * 讀取新 DB 已有記錄（以單號為 key），跳過已遷移的，補跑剩餘
 */
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const XLSX  = require('xlsx');

const TOKEN    = fs.readFileSync(require('os').homedir() + '/.config/notion/company_api_key', 'utf8').trim();
const OLD_DB_ID = '27ad8a6f-afc6-8043-bfca-e995ddd3ac1a';
const BIZ_FILE  = path.join(__dirname, '../data/biz-projects.xlsx');

// 從 quote-db-id.json 讀新 DB ID
const { dbId: NEW_DB_ID } = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/quote-db-id.json'), 'utf8'));
console.log('新 DB ID:', NEW_DB_ID);

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
const notionPost = (p, b) => notionReq('POST', p, b);

async function fetchAllFromDB(dbId) {
  const records = [];
  let cursor;
  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const r = await notionPost(`/v1/databases/${dbId}/query`, body);
    records.push(...r.results);
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);
  return records;
}

function mapStatus(s) {
  const MAP = { '尚未報價':'尚未報價','已報價':'已報價','已回簽':'已回簽','功能已完成':'功能已完成','完成請款':'完成請款','作廢':'作廢' };
  return MAP[s] || '尚未報價';
}

function loadXlsxMap() {
  const map = {};
  try {
    const wb = XLSX.readFile(BIZ_FILE);
    const ws = wb.Sheets['報價單Quote'];
    if (!ws) return map;
    XLSX.utils.sheet_to_json(ws, { header: 1 }).slice(1).filter(r => r[1]).forEach(r => {
      const 單號 = String(r[1] || '').trim();
      const 金額 = Number(r[4]) || 0;
      let 日期 = null;
      if (r[0] && typeof r[0] === 'number') {
        日期 = new Date((r[0] - 25569) * 86400 * 1000).toISOString().slice(0, 10);
      }
      if (單號) map[單號] = { 金額, 日期 };
    });
  } catch(e) { console.warn('xlsx 讀取失敗:', e.message); }
  return map;
}

async function main() {
  // 取新 DB 已有的單號集合
  console.log('讀取新 DB 已有記錄...');
  const existingRows = await fetchAllFromDB(NEW_DB_ID);
  const existingKeys = new Set(existingRows.map(r => {
    const 單號 = r.properties['單號']?.rich_text?.[0]?.plain_text || '';
    const 客戶 = r.properties['客戶']?.title?.[0]?.plain_text || '';
    return `${客戶}__${單號}`;
  }));
  console.log(`  已有 ${existingRows.length} 筆`);

  // 取舊 DB 全部
  console.log('讀取舊 DB...');
  const oldRows = await fetchAllFromDB(OLD_DB_ID);
  console.log(`  共 ${oldRows.length} 筆`);

  const xlsxMap = loadXlsxMap();

  // 過濾出未遷移的
  const pending = oldRows.filter(row => {
    const p = row.properties;
    const 客戶 = p['客戶']?.title?.[0]?.plain_text || '';
    const 單號 = p['單號']?.rich_text?.[0]?.plain_text || '';
    return !existingKeys.has(`${客戶}__${單號}`);
  });
  console.log(`  待補跑 ${pending.length} 筆`);

  let ok = 0, fail = 0;
  for (const row of pending) {
    const p = row.properties;
    const 客戶 = p['客戶']?.title?.[0]?.plain_text || '';
    const 單號 = p['單號']?.rich_text?.[0]?.plain_text || '';
    const 項目 = (p['需求']?.rich_text?.[0]?.plain_text || '').replace(/\n\s*/g, ' ').trim();
    const 狀態 = p['']?.status?.name || '尚未報價';
    const 備註 = p['備註']?.rich_text?.[0]?.plain_text || '';
    const 網址 = p['網址']?.url || null;
    const xlsx = xlsxMap[單號] || {};

    const props = {
      '客戶': { title: [{ text: { content: 客戶 } }] },
      '項目': { rich_text: [{ text: { content: 項目.slice(0, 2000) } }] },
      '單號': { rich_text: [{ text: { content: 單號 } }] },
      '狀態': { select: { name: mapStatus(狀態) } },
      '備註': { rich_text: [{ text: { content: 備註.slice(0, 2000) } }] },
    };
    if (xlsx.金額) props['金額'] = { number: xlsx.金額 };
    if (xlsx.日期) props['日期'] = { date: { start: xlsx.日期 } };
    if (網址) props['網址'] = { url: 網址 };

    try {
      await notionPost('/v1/pages', { parent: { database_id: NEW_DB_ID }, properties: props });
      ok++;
      process.stdout.write(`\r  進度: ${ok + fail}/${pending.length}`);
    } catch(e) {
      fail++;
      console.warn(`\n  ❌ [${客戶}] ${單號}: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 350));
  }

  console.log(`\n✅ 補跑完成：成功 ${ok} | 失敗 ${fail}`);
  console.log(`新 DB 總計：${existingRows.length + ok} 筆`);
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
