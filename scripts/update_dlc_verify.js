const https = require('https');
const fs = require('fs');
const token = fs.readFileSync(require('os').homedir() + '/.config/notion/api_key', 'utf8').trim();

function notionPatch(pageId, blocks) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify({ children: blocks });
    const req = https.request({
      hostname: 'api.notion.com',
      path: '/v1/blocks/' + pageId + '/children',
      method: 'PATCH',
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

function h1(t) { return { object:'block', type:'heading_1', heading_1:{ rich_text:[{type:'text',text:{content:t}}] } }; }
function h2(t) { return { object:'block', type:'heading_2', heading_2:{ rich_text:[{type:'text',text:{content:t}}] } }; }
function h3(t) { return { object:'block', type:'heading_3', heading_3:{ rich_text:[{type:'text',text:{content:t}}] } }; }
function bullet(t) { return { object:'block', type:'bulleted_list_item', bulleted_list_item:{ rich_text:[{type:'text',text:{content:t}}] } }; }
function callout(t, emoji, color) { return { object:'block', type:'callout', callout:{ rich_text:[{type:'text',text:{content:t}}], icon:{type:'emoji',emoji:emoji||'💡'}, color:color||'gray_background' } }; }
function divider() { return { object:'block', type:'divider', divider:{} }; }
function code(t, lang) { return { object:'block', type:'code', code:{ rich_text:[{type:'text',text:{content:t}}], language:lang||'plain text' } }; }
function p(t) { return { object:'block', type:'paragraph', paragraph:{ rich_text:[{type:'text',text:{content:t||''}}] } }; }

const PAGE_ID = '319d2a91-c732-81a2-8d8b-f8651cf1f1aa';

const blocks = [
  divider(),
  h1('六、VERIFY 驗證規範（必做清單）'),
  callout('每個 BUILD 完成後，必須逐項執行以下驗證。驗證未通過不得進入 DEPLOY。這是血淚教訓：資料清洗問題若未在 VERIFY 抓出，會導致所有下游報表數字錯誤。', '🔍', 'red_background'),
  p(''),

  h2('6.1 數據同步驗證（Data Sync）'),
  bullet('行數一致：來源行數 = DB 筆數（不能多也不能少）'),
  bullet('數值一致：聚合計算結果與既有腳本誤差 < 0.1%'),
  bullet('欄位完整：每筆記錄的必要欄位（title / amount / period 等）不為 null'),
  bullet('抽樣驗證：每個來源至少抽 3 筆，人工比對原始資料'),
  code(
`// 標準驗證腳本範本
const { db } = require('./lifecom_db');

// 1. 行數一致
const dbCount = db.prepare('SELECT COUNT(*) as c FROM finance_records WHERE source=? AND period=?').get('lfk_2026','2026-03').c;
const xlsxCount = 68; // 從來源直接計算
console.assert(dbCount === xlsxCount, '行數不一致！DB=' + dbCount + ' xlsx=' + xlsxCount);

// 2. 數值一致（誤差 < 0.1%）
const dbTotal = db.prepare('SELECT SUM(CAST(json_extract(data,\\'$.amount\\') AS REAL)) as t FROM finance_records WHERE source=? AND period=? AND json_extract(data,\\'$.is_recurring\\')=1').get('lfk_2026','2026-03').t;
const expected = 1578732; // 既有腳本已知正確值
console.assert(Math.abs(dbTotal - expected) / expected < 0.001, '數值誤差超標！DB=' + dbTotal + ' expected=' + expected);

// 3. 欄位完整
const nullCnt = db.prepare('SELECT COUNT(*) as c FROM finance_records WHERE json_extract(data,\\'$.company\\') IS NULL OR json_extract(data,\\'$.amount\\') IS NULL').get().c;
console.assert(nullCnt === 0, '有 ' + nullCnt + ' 筆必要欄位為 null');

console.log('✅ 所有驗證通過');`, 'javascript'),

  p(''),
  h2('6.2 資料清洗常見陷阱（已踩過）'),
  callout('以下問題都已在實際開發中踩過，記錄於此避免重犯。', '⚠️', 'yellow_background'),

  h3('陷阱 1｜xlsx 第一列當 column header'),
  bullet('問題：sheet_to_json 預設用第一列當 key，若第一列是說明文字，所有 key 都變成亂碼'),
  bullet('解法：改用 { header: 1 } 陣列模式，用 r[N] 存取固定欄位 index'),
  bullet('驗證：確認第一筆資料的 key 不包含「請於每月」等說明文字'),

  h3('陷阱 2｜過濾條件遺漏有效資料'),
  bullet('問題：用 !company && !cat 過濾空白行，但某些有效行的公司/科目欄位恰好是空的'),
  bullet('解法：只用金額欄 > 0 作為有效行判斷，不加多餘過濾條件'),
  bullet('驗證：來源行數 = DB 筆數，差距為零'),

  h3('陷阱 3｜Notion DB 的 title key 不固定'),
  bullet('問題：各 Notion DB 的 title 欄位名稱不同（品牌 / Task name / 客戶 ...）'),
  bullet('解法：動態找 type === title 的欄位，存成 _title 統一欄位'),
  bullet('驗證：每個 DB 抽樣確認 _title 有正確值，不為 null'),

  h3('陷阱 4｜Notion API 需要 PATCH，不是 POST'),
  bullet('問題：對 /v1/blocks/{id}/children 新增內容要用 PATCH，用 POST 會 400'),
  bullet('解法：append children 用 PATCH，create page 用 POST'),

  h3('陷阱 5｜PowerShell 寫中文會亂碼'),
  bullet('問題：PowerShell here-string 或 echo 中文到 API 時編碼損毀'),
  bullet('解法：所有含中文的 HTTP 請求一律用 Node.js + Buffer.byteLength() 計算 Content-Length'),

  p(''),
  h2('6.3 VERIFY Checklist 模板'),
  code(
`VERIFY Checklist — [模組名稱] [日期]

□ 行數一致：來源 N 筆 = DB N 筆
□ 數值一致：聚合值與既有腳本誤差 < 0.1%
□ 必要欄位：title / amount / period 等無 null
□ 抽樣確認：人工比對 3 筆原始資料
□ 邊界測試：空資料 / API 失敗 / 重複執行 idempotent
□ 與舊版並行：新版輸出與舊版輸出比對（報表重構時必做）

全部打勾才算 VERIFY 通過，才能進入 DEPLOY。`, 'plain text'),
];

(async () => {
  const res = await notionPatch(PAGE_ID, blocks);
  if (res.results) {
    console.log('Added ' + res.results.length + ' blocks to DLC page ✅');
  } else {
    console.log(JSON.stringify(res, null, 2));
  }
})();
