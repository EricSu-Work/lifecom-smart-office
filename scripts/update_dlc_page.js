const https = require('https');
const fs = require('fs');
const token = fs.readFileSync(require('os').homedir() + '/.config/notion/api_key', 'utf8').trim();

function notionPost(path, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const req = https.request({
      hostname: 'api.notion.com', path, method: 'PATCH',
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

function h1(text) { return { object:'block', type:'heading_1', heading_1:{ rich_text:[{type:'text',text:{content:text}}] } }; }
function h2(text) { return { object:'block', type:'heading_2', heading_2:{ rich_text:[{type:'text',text:{content:text}}] } }; }
function h3(text) { return { object:'block', type:'heading_3', heading_3:{ rich_text:[{type:'text',text:{content:text}}] } }; }
function p(text) { return { object:'block', type:'paragraph', paragraph:{ rich_text:[{type:'text',text:{content:text||''}}] } }; }
function bullet(text) { return { object:'block', type:'bulleted_list_item', bulleted_list_item:{ rich_text:[{type:'text',text:{content:text}}] } }; }
function callout(text, emoji, color) { return { object:'block', type:'callout', callout:{ rich_text:[{type:'text',text:{content:text}}], icon:{type:'emoji',emoji:emoji||'💡'}, color:color||'gray_background' } }; }
function divider() { return { object:'block', type:'divider', divider:{} }; }
function code(text, lang) { return { object:'block', type:'code', code:{ rich_text:[{type:'text',text:{content:text}}], language: lang||'plain text' } }; }

const PAGE_ID = '319d2a91-c732-81a2-8d8b-f8651cf1f1aa'; // #6 DLC 頁面

// 新增的區塊：重構計畫 + 更新後的 lifecom.db SPEC
const newBlocks = [
  divider(),
  h1('四、重構計畫（現有功能遷移至 lifecom.db）'),
  callout('現有報表直接打各 API，架構升級後需遷移至統一數據中台（lifecom.db）。重構期間新舊並行，驗證無誤後切換。', '🔄', 'blue_background'),
  p(''),

  h2('Step 1｜建立 lifecom.db + 同步腳本'),
  callout('狀態：SPEC 草稿，待 Eric 確認「OK 可以做」', '⏳'),
  bullet('lifecom.db — 統一數據中台 SQLite（取代原 notion.db 設計）'),
  bullet('sync_slack.js — 同步 Slack 告警 / 部署頻道訊息'),
  bullet('sync_ado.js — 同步 ADO Bug / Feature / Epic 工單快照'),
  bullet('sync_notion.js — 同步 Notion 頁面 + 客戶/AR/CSM DB'),
  bullet('sync_finance.js — 同步 Google Drive 財務 xlsx'),
  bullet('sync_cursors 表記錄各來源上次同步位置'),
  p(''),

  h2('Step 2｜現有報表逐一重構（含驗證）'),
  callout('狀態：待 Step 1 完成後開始。新舊並行跑一天，比對輸出，確認無誤後切換。', '⏳'),
  bullet('generate_hourly_report.js → 讀 slack_messages（C03TBQ5891V）【優先，最頻繁】'),
  bullet('generate_cto_report.js → 讀 ado_workitems'),
  bullet('generate_ceo_report.js → 整合 ado_workitems + finance_records + notion_records'),
  bullet('generate_cs_report.js → 讀 notion_records（客戶DB）'),
  bullet('generate_it_report.js → 讀 slack_messages（IT 頻道）'),
  bullet('deploy-email → 讀 slack_messages（C03FSJ3PQKD）'),
  p(''),

  h2('Step 3｜Phase 2 新功能（站在穩固基礎上）'),
  callout('狀態：待 Step 2 驗證完成後開始', '⬜'),
  bullet('ar_section.js — 讀 finance_records + notion_records（應收）'),
  bullet('ado_sla_monitor.js — 讀 ado_workitems（SLA 逾期告警）'),
  bullet('customer_health.js — 整合多來源評分引擎'),

  divider(),
  h1('五、lifecom.db 完整 Schema（更新版）'),
  callout('統一命名 lifecom.db，涵蓋感知層全部五個來源：Slack / ADO / Notion / Google Drive / Gmail', '🗄️', 'yellow_background'),
  code(
`-- Slack
CREATE TABLE slack_messages (
  ts TEXT PRIMARY KEY, channel_id TEXT, user_id TEXT,
  text TEXT, attachments TEXT, thread_ts TEXT, reactions TEXT, indexed_at INTEGER
);
CREATE INDEX idx_slack_channel ON slack_messages(channel_id);
CREATE VIRTUAL TABLE slack_messages_fts USING fts5(text, content=slack_messages);

-- Azure DevOps
CREATE TABLE ado_workitems (
  id INTEGER PRIMARY KEY, type TEXT, title TEXT, state TEXT,
  severity TEXT, assigned_to TEXT, customer_tag TEXT,
  created_at INTEGER, updated_at INTEGER, target_date INTEGER,
  meta TEXT, fetched_at INTEGER
);
CREATE INDEX idx_ado_type ON ado_workitems(type);
CREATE INDEX idx_ado_customer ON ado_workitems(customer_tag);`, 'sql'),

  code(
`-- Notion
CREATE TABLE notion_pages (
  id TEXT PRIMARY KEY, title TEXT, content TEXT, meta TEXT, fetched_at INTEGER
);
CREATE VIRTUAL TABLE notion_pages_fts USING fts5(title, content, content=notion_pages);

CREATE TABLE notion_records (
  id TEXT PRIMARY KEY, db_id TEXT, data TEXT, updated_at INTEGER, fetched_at INTEGER
);
CREATE INDEX idx_notion_db ON notion_records(db_id);

-- 財務 / Google Drive
CREATE TABLE finance_records (
  id TEXT PRIMARY KEY, source TEXT, period TEXT, data TEXT, fetched_at INTEGER
);

-- Gmail（Phase 3）
CREATE TABLE gmail_messages (
  id TEXT PRIMARY KEY, thread_id TEXT, subject TEXT,
  from_addr TEXT, to_addr TEXT, body TEXT, labels TEXT,
  received_at INTEGER, indexed_at INTEGER
);

-- 同步游標（取代分散的 *-cursor.json）
CREATE TABLE sync_cursors (
  source TEXT PRIMARY KEY, last_cursor TEXT, last_sync INTEGER
);`, 'sql'),

  p(''),
  bullet('所有資料均有 fetched_at / indexed_at，方便時效判斷'),
  bullet('JSON 欄位用 json_extract() 查詢（SQLite JSON1 原生支援）'),
  bullet('FTS5 全文搜尋：Slack 訊息 + Notion 頁面'),
  bullet('cursor 統一管理，取代現有各自的 deploy-email-cursor.json 等分散 JSON'),
];

(async () => {
  const res = await notionPost('/v1/blocks/' + PAGE_ID + '/children', { children: newBlocks });
  if (res.results) {
    console.log('Added ' + res.results.length + ' blocks to DLC page');
  } else {
    console.log(JSON.stringify(res, null, 2));
  }
})();
