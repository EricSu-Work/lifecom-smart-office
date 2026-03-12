/**
 * notion_client.js — Notion API 統一客戶端
 * 
 * 兩個 token：
 *   PERSONAL  = 個人工作區（BP、文件、規格）
 *   COMPANY   = 公司工作區（客戶、人資、AR、授權進度）
 *
 * 已知資料庫 ID：
 *   客戶總覽    1a1d8a6f-afc6-8127-9a49-dc5b2fc2aece
 *   授權進度    1a1d8a6f-afc6-8104-ac38-d5a404244601
 *   尚未到款項  27ed8a6f-afc6-8077-a72e-f27928ebe630
 *   報價追蹤    31bd8a6f-afc6-81ea-81bc-d9c972abbbb5  ← S-01，2026-03-06 建立
 *   人資        2bed8a6f-afc6-80f7-903b-c2e8fd6492bb
 *   CSM費用     1bad8a6f-afc6-800c-b784-dc2edb9d0bbd
 *   OP費用      1b9d8a6f-afc6-8068-b258-cfc4a60fee6b
 *   Tasks       208d8a6f-afc6-81d2-9b26-e616811e03c1
 *   Timeline    208d8a6f-afc6-81a7-b9b4-c711726eae2a
 *   會議記錄    2c0d8a6f-afc6-803a-8789-c2e38ce992bd
 */
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const TOKENS = {
  personal: fs.readFileSync(path.join(process.env.USERPROFILE, '.config/notion/api_key'), 'utf8').trim(),
  company:  fs.readFileSync(path.join(process.env.USERPROFILE, '.config/notion/company_api_key'), 'utf8').trim(),
};

const DB = {
  客戶總覽:   '1a1d8a6f-afc6-8127-9a49-dc5b2fc2aece',
  授權進度:   '1a1d8a6f-afc6-8104-ac38-d5a404244601',
  尚未到款項: '27ed8a6f-afc6-8077-a72e-f27928ebe630',
  報價追蹤:   '31bd8a6f-afc6-81ea-81bc-d9c972abbbb5',
  人資:       '2bed8a6f-afc6-80f7-903b-c2e8fd6492bb',
  CSM費用:    '1bad8a6f-afc6-800c-b784-dc2edb9d0bbd',
  OP費用:     '1b9d8a6f-afc6-8068-b258-cfc4a60fee6b',
  Tasks:      '208d8a6f-afc6-81d2-9b26-e616811e03c1',
  Timeline:   '208d8a6f-afc6-81a7-b9b4-c711726eae2a',
  會議記錄:   '2c0d8a6f-afc6-803a-8789-c2e38ce992bd',
};

// ── HTTP helper ───────────────────────────────────────────────────────────────
function request(token, method, path_, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;
    const headers = {
      'Authorization': 'Bearer ' + token,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    };
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const req = https.request({ hostname: 'api.notion.com', path: path_, method, headers }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// ── 屬性萃取 ─────────────────────────────────────────────────────────────────
function extractProp(prop) {
  if (!prop) return null;
  switch (prop.type) {
    case 'title':      return prop.title?.[0]?.plain_text || null;
    case 'rich_text':  return prop.rich_text?.[0]?.plain_text || null;
    case 'select':     return prop.select?.name || null;
    case 'multi_select': return prop.multi_select?.map(s => s.name) || [];
    case 'date':       return prop.date?.start || null;
    case 'number':     return prop.number ?? null;
    case 'checkbox':   return prop.checkbox;
    case 'people':     return prop.people?.map(p => p.name) || [];
    case 'status':     return prop.status?.name || null;
    case 'formula':    return prop.formula?.number ?? prop.formula?.string ?? null;
    case 'url':        return prop.url || null;
    case 'email':      return prop.email || null;
    case 'phone_number': return prop.phone_number || null;
    case 'relation':   return prop.relation?.map(r => r.id) || [];
    default:           return null;
  }
}

function pageToObject(page) {
  const obj = { _id: page.id, _url: page.url };
  for (const [k, v] of Object.entries(page.properties || {})) {
    obj[k] = extractProp(v);
  }
  return obj;
}

// ── 公開 API ─────────────────────────────────────────────────────────────────
async function queryDB(dbName, options = {}) {
  const dbId = DB[dbName] || dbName;
  const token = options.personal ? TOKENS.personal : TOKENS.company;
  const body = { page_size: options.limit || 100 };
  if (options.filter) body.filter = options.filter;
  if (options.sorts)  body.sorts = options.sorts;

  const results = [];
  let cursor = undefined;
  do {
    if (cursor) body.start_cursor = cursor;
    const r = await request(token, 'POST', `/v1/databases/${dbId}/query`, body);
    if (r.results) results.push(...r.results.map(pageToObject));
    cursor = r.has_more ? r.next_cursor : undefined;
    if (options.limit && results.length >= options.limit) break;
  } while (cursor);

  return results;
}

async function getPage(pageId, options = {}) {
  const token = options.personal ? TOKENS.personal : TOKENS.company;
  const r = await request(token, 'GET', `/v1/pages/${pageId}`, null);
  return pageToObject(r);
}

module.exports = { queryDB, getPage, DB, TOKENS };
