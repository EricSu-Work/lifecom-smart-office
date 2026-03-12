const https = require('https');
const fs = require('fs');
const token = fs.readFileSync(require('os').homedir() + '/.config/notion/api_key', 'utf8').trim();

function notionPost(path, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
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

function h1(text) { return { object:'block', type:'heading_1', heading_1:{ rich_text:[{type:'text',text:{content:text}}] } }; }
function h2(text) { return { object:'block', type:'heading_2', heading_2:{ rich_text:[{type:'text',text:{content:text}}] } }; }
function h3(text) { return { object:'block', type:'heading_3', heading_3:{ rich_text:[{type:'text',text:{content:text}}] } }; }
function p(text) { return { object:'block', type:'paragraph', paragraph:{ rich_text:[{type:'text',text:{content:text}}] } }; }
function bullet(text) { return { object:'block', type:'bulleted_list_item', bulleted_list_item:{ rich_text:[{type:'text',text:{content:text}}] } }; }
function numbered(text) { return { object:'block', type:'numbered_list_item', numbered_list_item:{ rich_text:[{type:'text',text:{content:text}}] } }; }
function callout(text, emoji) { return { object:'block', type:'callout', callout:{ rich_text:[{type:'text',text:{content:text}}], icon:{type:'emoji',emoji:emoji||'💡'}, color:'gray_background' } }; }
function divider() { return { object:'block', type:'divider', divider:{} }; }
function code(text, lang) { return { object:'block', type:'code', code:{ rich_text:[{type:'text',text:{content:text}}], language: lang||'plain text' } }; }

const PARENT_ID = '319d2a91c73281dab683f199f150cf3c'; // LifeCOM AI 運營計畫

const blocks = [
  callout('本頁定義 LifeCOM AI Agent 開發的標準生命週期（DLC）。所有新功能、新模組均依此流程推進，確保規格先行、人工確認、可追蹤。', '🔄'),
  divider(),

  h1('一、AI DLC 五階段流程'),
  code(`SPEC → REVIEW → BUILD → VERIFY → DEPLOY`, 'plain text'),
  p(''),

  h2('Stage 1｜SPEC（規格撰寫）'),
  bullet('由 AI 根據需求草擬規格：目標、輸入/輸出、Schema、邊界條件'),
  bullet('小功能：集中寫在本頁對應區塊'),
  bullet('複雜功能（多邏輯）：開子頁面'),
  bullet('產出：可執行的技術規格，不含實作'),

  h2('Stage 2｜REVIEW（人工確認）'),
  bullet('Eric 在 Slack 回覆「OK 可以做」即視為批准'),
  bullet('有疑問在此階段解決，不進入 BUILD'),
  bullet('批准後規格凍結，實作不再改需求'),

  h2('Stage 3｜BUILD（實作）'),
  bullet('AI 根據批准的 Spec 撰寫程式'),
  bullet('每個模組獨立，可單獨測試'),
  bullet('不引入未列於 Spec 的外部依賴'),

  h2('Stage 4｜VERIFY（驗證）'),
  bullet('AI 執行 smoke test，確認輸出正確'),
  bullet('測試邊界條件：空資料、API 失敗、格式異常'),
  bullet('輸出測試結果摘要給 Eric 確認'),

  h2('Stage 5｜DEPLOY（上線）'),
  bullet('更新 cron / config'),
  bullet('更新 Notion 文件（架構圖 + 甘特圖）'),
  bullet('更新 MEMORY.md（長期記憶備份）'),
  bullet('本頁記錄完成狀態 + 日期'),

  divider(),
  h1('二、設計原則'),
  bullet('規格先行：沒有批准的 Spec 不寫 code'),
  bullet('最小依賴：優先用現有工具，不引入新套件除非必要'),
  bullet('可回滾：每個模組獨立，壞掉不影響其他模組'),
  bullet('文件即記憶：Notion 產出 = AI 的長期記憶備份'),

  divider(),
  h1('三、任務看板'),
  p('（依序記錄各功能的 Spec + 狀態）'),
  p(''),

  h2('✅ Phase 1 已完成'),
  bullet('每小時系統快報 generate_hourly_report.js'),
  bullet('CEO / CTO / CSM / IT 日報'),
  bullet('上板部署 Email 自動化'),
  bullet('ADO 工程交付系統（Feature 進度 + 甘特圖）'),
  bullet('CEO 行動追蹤系統'),
  bullet('Skills 知識體系架構（OOP 兩層）'),

  divider(),
  h2('🔄 Phase 2 進行中'),
  p(''),

  h3('[SPEC] notion.db — Notion 本地 SQLite 快取'),
  callout('狀態：SPEC 草稿，待 Eric 確認', '⏳'),
  bullet('目標：將 Notion 頁面與 DB 快取到本地 SQLite，供所有 Agent 快速查詢，不每次重打 API'),
  bullet('技術選型：SQLite + JSON1（Node.js 內建支援）'),
  bullet('套件：better-sqlite3（需 pnpm add）'),
  bullet(''),
  bullet('Schema：'),
  code(
`-- 頁面內容（架構文件、SOP、職務說明）
CREATE TABLE notion_pages (
  id TEXT PRIMARY KEY,
  title TEXT,
  content TEXT,          -- 全文 plain text
  meta TEXT,             -- JSON: { parent_id, tags[], url }
  fetched_at INTEGER     -- unix timestamp
);
CREATE VIRTUAL TABLE notion_pages_fts USING fts5(title, content, content=notion_pages);

-- 結構化資料庫記錄（客戶、AR、CSM費用）
CREATE TABLE notion_records (
  id TEXT PRIMARY KEY,
  db_id TEXT,
  data TEXT,             -- JSON: 完整 properties
  updated_at INTEGER
);
CREATE INDEX idx_records_db ON notion_records(db_id);`, 'sql'),
  bullet('搜尋方式：FTS5 全文搜尋 / json_extract(data, \'$.客戶名稱\') / 時效過濾'),
  bullet('腳本：scripts/notion_db.js（init + CRUD）'),
  bullet('同步：scripts/sync_notion.js（每日 06:00 cron）'),
  bullet('同步範圍：所有 Notion 頁面（#1~#5）+ 客戶/AR/CSM DB'),
  bullet('快取時效：頁面 24h，DB 記錄 1h'),

  p(''),
  h3('[SPEC] ar_section.js — 應收逾期分析'),
  callout('狀態：待 notion.db 完成後開始', '⬜'),
  bullet('輸入：biz-projects.xlsx 應收工作表 + Notion 尚未到款項 DB'),
  bullet('輸出：{ overdue_30, overdue_60, total_ar, items[] }'),
  bullet('接入：CEO 日報 + CSM 日報'),

  p(''),
  h3('[SPEC] customer_health.js — 客戶健康燈號'),
  callout('狀態：待 ar_section 完成後開始', '⬜'),
  bullet('輸入：ADO 工單 + AR 逾期 + Notion CSM 記錄 + 系統告警'),
  bullet('評分維度：Bug(14天) / AR逾期 / 最後接觸日 / P0次數'),
  bullet('輸出：0-100 分 + 🟢🟡🔴 燈號，每日 08:00'),

  divider(),
  h2('⬜ Phase 3 規劃中'),
  bullet('工程師 KPI 週報（每週一 08:00）'),
  bullet('P&L 月報自動化（每月 1 日）'),
  bullet('客戶自助查詢 Email Agent'),
];

(async () => {
  const res = await notionPost('/v1/pages', {
    parent: { page_id: PARENT_ID },
    properties: { title: { title: [{ text: { content: '溝通稿 #6 — AI DLC 開發流程與任務看板' } }] } },
    children: blocks
  });
  if (res.id) {
    console.log('Created page:', res.id);
    console.log('URL:', res.url);
  } else {
    console.log(JSON.stringify(res, null, 2));
  }
})();
