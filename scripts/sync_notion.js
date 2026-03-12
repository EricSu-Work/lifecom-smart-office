/**
 * sync_notion.js — 同步 Notion 頁面 + DB 到 lifecom.db
 * 
 * 使用方式：
 *   node sync_notion.js          # 同步全部
 *   node sync_notion.js pages    # 只同步頁面
 *   node sync_notion.js dbs      # 只同步資料庫
 */
const https = require('https');
const fs = require('fs');
const { notion, cursor, batchUpsert } = require('./lifecom_db');

const home = require('os').homedir();
const TOKENS = {
  personal: fs.readFileSync(home + '/.config/notion/api_key', 'utf8').trim(),
  company:  fs.readFileSync(home + '/.config/notion/company_api_key', 'utf8').trim(),
};

// 要同步的頁面（AI 運營計畫相關）
const PAGES = [
  { id: '319d2a91c73281c2b615d169f0ce7ada', title: '溝通稿#1 轉型全景圖',        token: 'personal' },
  { id: '319d2a91c73281ae9708de635c5fe015', title: '溝通稿#2 AI Agent驅動框架',   token: 'personal' },
  { id: '319d2a91c73281ab9697ebb73a307d17', title: '溝通稿#3 Phase2智能層',       token: 'personal' },
  { id: '319d2a91c732815ca2fbc09914e783a8', title: '溝通稿#4 Phase3+4',           token: 'personal' },
  { id: '319d2a91c7328146b827fb448ac0d78c', title: '溝通稿#5 技術棧',             token: 'personal' },
  { id: '319d2a91c73281a28d8bf8651cf1f1aa', title: '溝通稿#6 DLC開發流程',        token: 'personal' },
];

// 要同步的 DB（公司 workspace）
const DATABASES = [
  { id: '1a1d8a6fafc681279a49dc5b2fc2aece', name: '客戶總覽',    token: 'company' },
  { id: '27ed8a6fafc68077a72ef27928ebe630', name: '尚未到款項',  token: 'company' },
  { id: '27ad8a6fafc68043bfcae995ddd3ac1a', name: '報價單',      token: 'company' },
  { id: '2ead8a6fafc68139816dfc88dceb58de', name: '物流方式',    token: 'company' },
  { id: '1bad8a6fafc6800cb784dc2edb9d0bbd', name: 'CSM費用',     token: 'company' },
  { id: '1b9d8a6fafc68068b258cfc4a60fee6b', name: 'OP費用',      token: 'company' },
  { id: '1a1d8a6fafc68104ac38d5a404244601', name: '授權進度',    token: 'company' },
  { id: '208d8a6fafc681d29b26e616811e03c1', name: 'Tasks',       token: 'company' },
  { id: '208d8a6fafc681a7b9b4c711726eae2a', name: 'Timeline',    token: 'company' },
  { id: '2c0d8a6fafc6803a8789c2e38ce992bd', name: '會議記錄',    token: 'company' },
];

function notionGet(path, tokenKey) {
  const token = TOKENS[tokenKey || 'personal'];
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.notion.com', path, method: 'GET',
      headers: { 'Authorization': 'Bearer ' + token, 'Notion-Version': '2022-06-28' }
    }, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve(JSON.parse(d))); });
    req.on('error', reject); req.end();
  });
}

function notionPost(path, body, tokenKey) {
  const token = TOKENS[tokenKey || 'personal'];
  const bodyStr = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.notion.com', path, method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr, 'utf8')
      }
    }, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve(JSON.parse(d))); });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

function extractBlockText(blocks) {
  return blocks.map(b => {
    const type = b.type;
    const block = b[type];
    if (block && block.rich_text) return block.rich_text.map(t => t.plain_text).join('');
    if (type === 'child_page') return '[子頁面: ' + b.child_page.title + ']';
    return '';
  }).filter(Boolean).join('\n');
}

async function syncPage(page) {
  if (!notion.isStale(page.id)) {
    return 'cached';
  }
  const res = await notionGet('/v1/blocks/' + page.id + '/children?page_size=100', page.token);
  if (!res.results) return 'error';

  const content = extractBlockText(res.results);
  notion.upsertPage.run({
    id: page.id,
    title: page.title,
    content: content,
    meta: JSON.stringify({ url: 'https://www.notion.so/' + page.id.replace(/-/g, '') }),
  });

  cursor.set('notion_page_' + page.id, new Date().toISOString());
  return 'synced';
}

async function syncDatabase(database) {
  let allResults = [];
  let startCursor = undefined;

  while (true) {
    const body = { page_size: 100, ...(startCursor ? { start_cursor: startCursor } : {}) };
    const res = await notionPost('/v1/databases/' + database.id + '/query', body, database.token);
    if (!res.results) break;
    allResults.push(...res.results);
    if (!res.has_more) break;
    startCursor = res.next_cursor;
  }

  if (allResults.length === 0) return 0;

  const rows = allResults.map(r => {
    const props = r.properties;
    // 動態找 title 類型欄位
    const titleKey = Object.keys(props).find(k => props[k].type === 'title');
    const titleVal = titleKey ? (props[titleKey]?.title?.[0]?.plain_text || '') : '';
    return {
      id:         r.id,
      db_id:      database.id,
      data:       JSON.stringify({ ...props, _title: titleVal, _db_name: database.name }),
      updated_at: r.last_edited_time ? Math.floor(new Date(r.last_edited_time).getTime()/1000) : null,
    };
  });

  batchUpsert(notion.upsertRecord, rows);
  cursor.set('notion_db_' + database.id, new Date().toISOString());
  return rows.length;
}

async function main() {
  const mode = process.argv[2];

  if (!mode || mode === 'pages') {
    console.log('Syncing Notion pages...');
    for (const page of PAGES) {
      process.stdout.write('  ' + page.title.padEnd(25) + '... ');
      const result = await syncPage(page);
      console.log(result);
    }
  }

  if (!mode || mode === 'dbs') {
    console.log('Syncing Notion databases...');
    for (const db of DATABASES) {
      process.stdout.write('  ' + db.name.padEnd(15) + '... ');
      const n = await syncDatabase(db);
      console.log(n + ' records');
    }
  }

  console.log('Done.');
}

main().catch(console.error);
