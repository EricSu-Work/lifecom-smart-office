/**
 * upload_blackdog_kb_to_notion.js
 * 
 * 將 BlackDog 產品知識庫上傳到 Notion
 * 建立在 LifeCOM AI 運營計畫 下作為子頁面
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const TOKENS = {
  personal: fs.readFileSync(path.join(process.env.USERPROFILE, '.config/notion/api_key'), 'utf8').trim(),
  company: fs.readFileSync(path.join(process.env.USERPROFILE, '.config/notion/company_api_key'), 'utf8').trim(),
};

// LifeCOM AI 運營計畫 parent
const AI_OPS_PAGE_ID = '319d2a91-c732-81da-b683-f199f150cf3c';

function request(token, method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;
    const headers = {
      'Authorization': 'Bearer ' + token,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    };
    if (data) headers['Content-Length'] = Buffer.byteLength(data, 'utf8');
    const req = https.request({ hostname: 'api.notion.com', path: apiPath, method, headers }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(d);
          if (parsed.object === 'error') {
            console.error(`API Error: ${parsed.status} - ${parsed.message}`);
            reject(new Error(parsed.message));
          } else {
            resolve(parsed);
          }
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// ── Block builders ───────────────────────────────────────────────────────
function heading1(text) {
  return {
    object: 'block', type: 'heading_1',
    heading_1: { rich_text: [{ type: 'text', text: { content: text } }] }
  };
}
function heading2(text) {
  return {
    object: 'block', type: 'heading_2',
    heading_2: { rich_text: [{ type: 'text', text: { content: text } }] }
  };
}
function heading3(text) {
  return {
    object: 'block', type: 'heading_3',
    heading_3: { rich_text: [{ type: 'text', text: { content: text } }] }
  };
}
function paragraph(text) {
  if (!text || text.trim() === '') {
    return { object: 'block', type: 'paragraph', paragraph: { rich_text: [] } };
  }
  // Notion rich_text content max 2000 chars
  const chunks = [];
  for (let i = 0; i < text.length; i += 2000) {
    chunks.push({ type: 'text', text: { content: text.slice(i, i + 2000) } });
  }
  return { object: 'block', type: 'paragraph', paragraph: { rich_text: chunks } };
}
function boldParagraph(text) {
  return {
    object: 'block', type: 'paragraph',
    paragraph: { rich_text: [{ type: 'text', text: { content: text }, annotations: { bold: true } }] }
  };
}
function bulletItem(text) {
  const chunks = [];
  for (let i = 0; i < text.length; i += 2000) {
    chunks.push({ type: 'text', text: { content: text.slice(i, i + 2000) } });
  }
  return {
    object: 'block', type: 'bulleted_list_item',
    bulleted_list_item: { rich_text: chunks }
  };
}
function codeBlock(text, lang = 'plain text') {
  const chunks = [];
  for (let i = 0; i < text.length; i += 2000) {
    chunks.push({ type: 'text', text: { content: text.slice(i, i + 2000) } });
  }
  return {
    object: 'block', type: 'code',
    code: { rich_text: chunks, language: lang }
  };
}
function divider() {
  return { object: 'block', type: 'divider', divider: {} };
}
function tableRow(cells) {
  return {
    type: 'table_row',
    table_row: {
      cells: cells.map(c => [{ type: 'text', text: { content: String(c || '') } }])
    }
  };
}
function table(headers, rows) {
  const width = headers.length;
  return {
    object: 'block', type: 'table',
    table: {
      table_width: width,
      has_column_header: true,
      has_row_header: false,
      children: [
        tableRow(headers),
        ...rows.map(r => tableRow(r))
      ]
    }
  };
}
function callout(text, emoji = '💡') {
  return {
    object: 'block', type: 'callout',
    callout: {
      rich_text: [{ type: 'text', text: { content: text } }],
      icon: { type: 'emoji', emoji }
    }
  };
}

async function createPage(parentId, title, icon, children, token) {
  const body = {
    parent: { page_id: parentId },
    icon: icon ? { type: 'emoji', emoji: icon } : undefined,
    properties: {
      title: { title: [{ text: { content: title } }] }
    },
    children: children.slice(0, 100) // Notion max 100 blocks per create
  };
  const page = await request(token, 'POST', '/v1/pages', body);
  console.log(`✅ Created: "${title}" → ${page.url}`);

  // Append remaining blocks in chunks of 100
  if (children.length > 100) {
    for (let i = 100; i < children.length; i += 100) {
      const chunk = children.slice(i, i + 100);
      await request(token, 'PATCH', `/v1/blocks/${page.id}/children`, { children: chunk });
      console.log(`   ↳ Appended blocks ${i + 1}-${Math.min(i + 100, children.length)}`);
    }
  }
  return page;
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ══════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════
async function main() {
  const token = TOKENS.personal;

  console.log('🚀 開始上傳 BlackDog 產品知識庫到 Notion...\n');

  // ── 1. 建立主頁面 ────────────────────────────────────────────────────
  const mainPage = await createPage(AI_OPS_PAGE_ID, 'BlackDog 產品知識庫（OMS/WMS）', '🐕', [
    callout('LifeCOM 核心 OMS/WMS 系統完整產品知識庫。基於 newblackdog repo 原始碼分析產出。', '📚'),
    paragraph(''),
    heading2('導覽'),
    bulletItem('📊 系統總覽 — 框架、資料庫、版本、部署'),
    bulletItem('🏗️ 系統架構 — 分層結構、核心模組關係'),
    bulletItem('📦 訂單管理 — 狀態流、操作器、規則引擎'),
    bulletItem('🏭 倉儲管理 — WMS 串接、BizModels'),
    bulletItem('🛒 電商平台串接 — 17 個平台整合'),
    bulletItem('🔗 ERP 整合 — Digiwin、LifeERP、SAP'),
    bulletItem('⏰ 排程任務 — 動態排程、artisan commands'),
    bulletItem('📄 報表系統 — 客戶專屬報表'),
    bulletItem('🚚 物流與出貨 — PDF 列印、物流商串接'),
    bulletItem('👥 客戶專屬模組 — 多租戶客製化'),
    paragraph(''),
    divider(),
    heading2('基本資訊'),
    table(
      ['項目', '值'],
      [
        ['框架', 'Laravel 9.x（PHP ^7.3 / ^8.0）'],
        ['專案代號', 'BlackDog（newblackdog）'],
        ['Repo', 'Bitbucket systemLifecom/newblackdog'],
        ['PHP 檔案數', '1,027'],
        ['DB Migrations', '267'],
        ['版本', 'v3.10.x'],
        ['部署', 'Docker + Nginx + PHP-FPM（K8s）'],
        ['認證', 'JWT + Laravel Sanctum'],
      ]
    ),
    paragraph(''),
    heading2('資料庫連線'),
    table(
      ['Connection', 'Driver', '用途'],
      [
        ['lifeerp', 'MySQL（default）', 'OMS 主庫'],
        ['bizpro_wms', 'MySQL', 'WMS 倉儲系統'],
        ['lifemall', 'MySQL', 'LifeMall 自營商城'],
        ['pgsql', 'PostgreSQL', '備用'],
        ['mongodb', 'MongoDB', '日誌/非結構化資料'],
      ]
    ),
  ], token);

  await sleep(500);

  // ── 2. 系統架構 ─────────────────────────────────────────────────────
  await createPage(mainPage.id, '系統架構（分層）', '🏗️', [
    heading2('架構分層圖'),
    codeBlock(
`Routes Layer
  api.php | web.php | lifeerp.php | digiwin.php | adERP.php | frontend.php
      ↓
Controllers Layer
  api/ (24 controllers) | OutsideApi/ (5 controllers)
      ↓
Services Layer (v1/)
  Auth | MarketSvc | Purchase | ShipReturn | UploadSvc
      ↓
Business Logic Layer (ERPBD/)
  Base* 類 (80+) | platform/ | warehouse/ | operator/ | orderFlow/ | orderRules/ | reports/ | schedule/
      ↓
Repository Layer
  BizModels/ | LifeMall/ | Market/ | Order/ | Prod/ | Views/ | MongoRepos/
      ↓
Models Layer
  Models/ (100+ Eloquent) | BizModels/ (WMS 33 models) | LifeMallModels/ (7) | MongoModels/
      ↓
Config Layer (Eccore/)
  46 個 Info 類：定義常量、狀態碼、業務規則`, 'plain text'),
    paragraph(''),
    divider(),
    heading2('目錄結構'),
    table(
      ['目錄', '用途', '檔案數'],
      [
        ['app/Http/Controllers/api/', '內部 API Controllers', '24'],
        ['app/Http/Controllers/OutsideApi/', '外部 API（Digiwin、通用）', '5'],
        ['app/Services/v1/', '服務層', '5 子目錄'],
        ['app/Includes/ERPBD/', '核心業務邏輯', '250+'],
        ['app/Includes/Eccore/', '常量與設定', '46'],
        ['app/Models/', 'Eloquent Models', '100+'],
        ['app/BizModels/', 'WMS Models', '33'],
        ['app/LifeMallModels/', 'LifeMall Models', '7'],
        ['app/Repository/', 'Repository 層', '7 子目錄'],
        ['app/Jobs/', 'Queue Jobs', '7'],
        ['app/Console/Commands/', 'Artisan Commands', '19'],
      ]
    ),
    paragraph(''),
    heading2('API Routes'),
    heading3('api.php（主要 API）'),
    table(
      ['Method', 'Path', '功能'],
      [
        ['POST', '/v1/login', 'JWT 登入'],
        ['GET', '/v1/getRoutes', '路由列表（需 auth）'],
        ['POST', '/v1/token/getToken', '取得 JWT Token'],
        ['POST', '/v2/default/{functionUrl}/searchList', '通用查詢'],
        ['POST', '/v2/default/{functionUrl}/searchDetail', '通用明細'],
        ['POST', '/v2/default/{functionUrl}/updateList', '通用更新'],
        ['POST', '/v2/default/action/{type}', '上傳操作'],
        ['POST', '/v2/orders/confirmReturn', '確認退貨'],
      ]
    ),
    heading3('其他 Route 檔案'),
    table(
      ['檔案', '用途'],
      [
        ['lifeerp.php', 'LifeERP 整合（退貨、訂單）'],
        ['digiwin.php', 'Digiwin ERP 整合'],
        ['adERP.php', 'adERP 整合'],
        ['frontend.php', '前端專用路由'],
        ['web.php', 'Swagger 文件 + 蝦皮 OAuth + SPA'],
      ]
    ),
    heading3('Swagger 文件端點'),
    bulletItem('/doc/digiwinApi — Digiwin API 文件'),
    bulletItem('/doc/defaultApi — 預設 API 文件'),
    bulletItem('/doc/bizproApi — BizPro API 文件'),
    bulletItem('/doc/callbackApi / callbackApiV2 — Callback API 文件'),
  ], token);

  await sleep(500);

  // ── 3. 訂單管理 ─────────────────────────────────────────────────────
  await createPage(mainPage.id, '訂單管理（OMS）', '📦', [
    heading2('訂單狀態流'),
    codeBlock(
`#追蹤 → 0.未處理 → 1.已確認 → 5.預備出貨 → 6.預備出貨# 
→ 7.風控確認 → 8.已產給倉庫(TOWMS) → 220.已出貨 
→ 230.送達消費者 → 235.部分到達

分支：
  → 260.退貨申請
  → 24.訂單取消
  → 25.暫停出貨  
  → 38.訂單取消中
  → 400.預備缺貨等待`, 'plain text'),
    paragraph(''),
    divider(),
    heading2('訂單操作器（operator/）'),
    callout('每個操作器是獨立的 PHP 類，封裝特定的訂單動作邏輯。', '⚙️'),
    table(
      ['Operator', '功能', '檔案'],
      [
        ['CreateOrder', '建立訂單', 'operator/CreateOrder.php'],
        ['CreateExchangeOrder', '建立換貨訂單', 'operator/CreateExchangeOrder.php'],
        ['CreateExchangeReturn', '建立換貨退貨', 'operator/CreateExchangeReturn.php'],
        ['PreShipOrder', '預備出貨', 'operator/PreShipOrder.php'],
        ['PreReturnOrder', '預備退貨', 'operator/PreReturnOrder.php'],
        ['RefundOrder', '退款', 'operator/RefundOrder.php'],
        ['ReShipment', '重新出貨', 'operator/ReShipment.php'],
        ['RePackageOrder', '重新包裝', 'operator/RePackageOrder.php'],
        ['SpliteOrder', '拆單', 'operator/SpliteOrder.php'],
        ['ChangeShipMethod', '變更物流方式', 'operator/ChangeShipMethod.php'],
        ['ResetToPreShip', '重設為預備出貨', 'operator/ResetToPreShip.php'],
        ['CancleOrVoidAssignOrder', '取消/作廢已配貨', 'operator/CancleOrVoidAssignOrder.php'],
        ['UpdateOrdersProducts', '更新訂單商品', 'operator/UpdateOrdersProducts.php'],
        ['ConfirmRefundOnCreateVirtulProds', '退款確認（虛擬商品）', 'operator/ConfirmRefund...php'],
      ]
    ),
    paragraph(''),
    heading2('訂單規則引擎（orderRules/）'),
    callout('可配置的規則引擎，訂單建立後自動執行。', '🔧'),
    table(
      ['規則模組', '功能'],
      [
        ['OrderMergeModule', '合併訂單（同收件人/地址）'],
        ['OrderSplitModule', '拆單（依條件）'],
        ['RiskChkModule', '風控檢查（一般）'],
        ['RiskChk2Module', '風控檢查（進階）'],
        ['RiskChkAfterShipNoModule', '出貨後風控'],
        ['GiftWithOrder', '滿額贈品'],
        ['BuyAGetB', '買A送B'],
        ['AddressValidationModule', '地址驗證'],
        ['VolumeChangeShipMethod', '依材積自動換物流'],
        ['UpdateColumn', '自訂欄位更新'],
        ['OrderCreatedCustomProcess', '訂單建立後客製處理'],
      ]
    ),
    paragraph(''),
    heading2('訂單流程（orderFlow/）'),
    table(
      ['Flow', '描述'],
      [
        ['AssignToShipFlow', '配貨出貨流程（標準）'],
        ['NoneAssignFlow', '免配貨流程'],
        ['PostFlow', '郵寄流程'],
        ['SFLiiFlow', 'SFL 倉出貨流程'],
        ['ShipCollectFlow', '集貨出貨流程'],
      ]
    ),
    paragraph(''),
    heading2('核心檔案索引'),
    bulletItem('BaseOrders.php — 訂單 CRUD 基礎'),
    bulletItem('BaseOrderOperator.php — 訂單操作基礎類'),
    bulletItem('OrdersInfo.php — 訂單狀態碼定義（Eccore）'),
    bulletItem('OrderFlowInfo.php — 訂單流程定義（Eccore）'),
    bulletItem('ApiOrdersController.php — 訂單 API Controller'),
    bulletItem('BaseRiskCheck.php / BaseRiskCheckLoreal.php — 風控引擎'),
  ], token);

  await sleep(500);

  // ── 4. 倉儲管理 ─────────────────────────────────────────────────────
  await createPage(mainPage.id, '倉儲管理（WMS）', '🏭', [
    heading2('WMS 模組架構'),
    callout('所有倉庫串接在 ERPBD/warehouse/ 下，以子目錄分功能（order/stock/product/stockInVoucher/asn/stockMove）。', '📋'),
    table(
      ['子模組', '功能', '實作 Client 數'],
      [
        ['warehouse/order/', '訂單下倉', '17'],
        ['warehouse/stock/', '庫存同步', '17'],
        ['warehouse/stockInVoucher/', '入庫單', '17'],
        ['warehouse/product/', '商品同步', '10'],
        ['warehouse/asn/', 'ASN 進階通知', '4'],
        ['warehouse/stockMove/', '庫存調撥', '1'],
      ]
    ),
    paragraph(''),
    heading2('已串接倉庫列表'),
    heading3('SFL 順豐系列'),
    bulletItem('BizWmsSFL — SFL V1（基礎版）'),
    bulletItem('BizWmsSFLV2 / V2Updated — SFL V2'),
    bulletItem('BizWmsSFLV3 — SFL V3（最新）'),
    bulletItem('BizWmsSFLii — SFL ii'),
    bulletItem('BizWmsSFLSelf — SFL 自出'),
    bulletItem('BizWmsSFLAdastria — SFL Adastria 專用'),
    heading3('BizWms 系列'),
    bulletItem('BizWms5soap / BizWmsAjpeace / BizWmsDoe'),
    bulletItem('BizWmsEZ / BizWmsJetF / BizWmsNPC'),
    bulletItem('BizWmsSDL / BizWmsTDS / BizWmsXML'),
    heading3('其他倉庫'),
    bulletItem('FocusDefault — Focus 倉'),
    bulletItem('LESClient — LES 倉'),
    bulletItem('MaerskDefault / MaerskxLevis — Maersk 倉'),
    bulletItem('ToysrusClient — Toysrus 倉'),
    bulletItem('OwndaysStocks — OWNDAYS 庫存'),
    bulletItem('ShimamuraClient — 島村入庫'),
    bulletItem('ShoplineStocks — Shopline 庫存'),
    bulletItem('WmsPOST — POST 方式倉庫'),
    paragraph(''),
    divider(),
    heading2('BizModels（WMS DB）'),
    callout('WMS 資料庫使用獨立的 bizpro_wms MySQL 連線。', '🗃️'),
    table(
      ['Model', '用途'],
      [
        ['T_ORDHAD', '出貨單 Header'],
        ['T_ORDDEL', '出貨明細'],
        ['T_ORDDSTS / T_ORDSSTS', '出貨狀態'],
        ['T_STOWHAD', '入庫單 Header'],
        ['T_STOWING', '入庫明細'],
        ['T_STOWQCH / T_STOWQCD', '品檢（頭/細）'],
        ['T_STOWSLOH / T_STOWSLOT', '上架（頭/細）'],
        ['T_STOWRSTS', '入庫狀態'],
        ['T_Boxseq', '箱號序號'],
        ['T_Dzone / T_Dzone1', '儲區'],
        ['TPiclist', '揀貨清單'],
        ['TChslotd', '儲位'],
        ['OCustomer', '客戶'],
        ['OMerdata', '商品主檔'],
        ['OSlotmer / OSlotmerBM', '儲位商品對應'],
        ['OSyspar', '系統參數'],
        ['MSysusr', '系統用戶'],
      ]
    ),
  ], token);

  await sleep(500);

  // ── 5. 電商平台串接 ────────────────────────────────────────────────
  await createPage(mainPage.id, '電商平台串接（17 平台）', '🛒', [
    heading2('Platform Interface 架構'),
    callout('所有平台實作 PlatformInterface.php，分為「平台.php（業務邏輯）+ 平台Client.php（API 呼叫）」模式。', '🔌'),
    paragraph(''),
    table(
      ['平台', '類名', '整合方式', '備註'],
      [
        ['Momo', 'Momo + MomoClient', 'API', '⚠️ 已知 null array 問題'],
        ['Momo 超取+', 'MomoStorePlus + MomoStorePlusClient', 'API', ''],
        ['蝦皮 Shopee', 'ShopeeV2 + ShopeeV2Client', 'API V2', ''],
        ['蝦皮 SFL', 'ShopeeV2SFLii', 'API', 'SFL 倉專用'],
        ['Shopify', 'Shopify + ShopifyClient', 'API', ''],
        ['Shopify SFL', 'ShopifySFLii', 'API', 'SFL 倉專用'],
        ['Shopline', 'Shopline + ShoplineClient', 'API', ''],
        ['Yahoo 購物中心', 'YahooShoppingMall + Client', 'API', ''],
        ['Yahoo 超級商城', 'YahooShoppingMallShop + Client', 'API', ''],
        ['91APP', 'NineOneAPP + NineOneAPPClient', 'API', ''],
        ['LINE 禮物', 'LineGift + LineGiftClient', 'API', ''],
        ['LINE 禮物 L\'Oréal', 'LineGiftLoreal', 'API', '客製版'],
        ['Cyberbiz', 'Cyberbiz + CyberbizClient', 'API', ''],
        ['ETMall', 'ETMall + ETMallClient', 'API', ''],
        ['PCHome', 'PCHome + PCHomeClient', 'API', ''],
        ['Adastria', 'AdastriaClient', 'API', '日系'],
        ['OWNDAYS', 'OwndaysClient', 'API', '眼鏡'],
        ['Digiwin', 'DigiwinClient', 'ERP API', '鼎新 ERP'],
        ['Upload', 'DefaultFileClient', '檔案匯入', ''],
      ]
    ),
    paragraph(''),
    heading2('市場類型常量（MarketsInfo）'),
    codeBlock(
`Upload | DigiwinApi | YahooMall | Yahoo(超級商城) | Shopline
MOMO | MOMO_STORE_PLUS | LifeMall | Shopee | XMLFILE
Cyberbiz | Shopify | YSMS | Upload_ds | ETMall
LineGift | PCHome | Upload_b2b`, 'plain text'),
    paragraph(''),
    heading2('蝦皮 OAuth'),
    bulletItem('web.php 中有 /common/shopeeAuth/{markets_no} 路由'),
    bulletItem('ShopeeAuthController 處理 OAuth 授權流程'),
    bulletItem('ShopeeAuthDashboard 提供授權狀態 Dashboard'),
  ], token);

  await sleep(500);

  // ── 6. ERP 整合 ─────────────────────────────────────────────────────
  await createPage(mainPage.id, 'ERP 整合與外部系統', '🔗', [
    heading2('Digiwin 鼎新 ERP'),
    table(
      ['項目', '說明'],
      [
        ['Routes', 'digiwin.php + adERP.php'],
        ['Controllers', 'OutsideApi/DigiwinApi/ — ApiDigiwinOrders, ApiDigiwinPurchases'],
        ['核心', 'ERPBD/digiwin/DigiwinBase.php + DigiwnAuth.php'],
        ['功能', '訂單下推 ERP、採購單同步'],
      ]
    ),
    paragraph(''),
    heading2('LifeERP'),
    table(
      ['項目', '說明'],
      [
        ['Routes', 'lifeerp.php'],
        ['API', 'getOrderDatasForReturn（退貨資料）, setOrderData（設定訂單）'],
        ['核心', 'ERPBD/lifeerp/LifeERPApi.php + LifeERPAuth.php'],
        ['Library', 'libraries/LifeERP_API.php'],
      ]
    ),
    paragraph(''),
    heading2('外部系統整合'),
    table(
      ['系統', '檔案', '用途'],
      [
        ['SAP', 'libraries/Sap.php', 'Levis SAP 整合'],
        ['Siebel', 'libraries/Siebel.php + SiebelMember.php', 'CRM 會員'],
        ['HIP API', 'libraries/HipAPI.php', '物流 API'],
        ['Cetustek 關貿', 'libraries/einv/Cetustek.php', '電子發票'],
        ['Cetustek L\'Oréal', 'libraries/einv/CetustekLoreal.php', 'L\'Oréal 專用發票'],
        ['NewebPay 藍新', 'libraries/payments/newebpay/', '金流'],
        ['Google reCAPTCHA', 'libraries/google/ReCaptchaV3.php', 'V3 驗證'],
        ['LINE ChatBot', 'libraries/lineChatBot/', 'LINE 聊天機器人'],
        ['LifeTMS', 'logistics/LifeTMSApi*.php', '物流 TMS 系統'],
        ['NVR', 'BaseNVR.php', '網路影像錄影'],
      ]
    ),
    paragraph(''),
    heading2('檔案交換系統'),
    table(
      ['格式', 'Library'],
      [
        ['CSV', 'libraries/CSV.php'],
        ['XML', 'libraries/XML.php, XMLMaker.php, XMLTBC.php, XMLCustomers.php, XMLDKSH.php'],
        ['TXT', 'libraries/TXT.php'],
        ['Excel', 'libraries/SpoutExcel.php（box/spout）'],
        ['FTP/SFTP', 'libraries/FTPS.php + FilesExchange.php'],
      ]
    ),
  ], token);

  await sleep(500);

  // ── 7. 排程任務 ─────────────────────────────────────────────────────
  await createPage(mainPage.id, '排程任務系統', '⏰', [
    heading2('排程架構'),
    callout('排程任務從 tasks 資料表動態載入，非硬編碼。每個 task 有自己的 cron 表達式。', '🔑'),
    codeBlock(
`// Console/Kernel.php
$tasks_list = Tasks::where("enable", TaskInfo::TASK_ENABLE)
    ->where("enable_date_ts", "<=", $now)->get();

// 每個 task 動態註冊：
$schedule->command($command)
    ->cron($cron_str)
    ->runInBackground()
    ->withoutOverlapping($maxExecTime);`, 'php'),
    paragraph(''),
    heading2('Artisan Commands'),
    table(
      ['Command', '功能'],
      [
        ['TaskMarkets', '平台訂單拋轉'],
        ['TaskProducts', '商品同步'],
        ['TaskStore', '門市同步'],
        ['TaskWarehouse', '倉庫相關任務'],
        ['TaskReport', '報表產生'],
        ['TaskSettle', '結算任務'],
        ['TaskSupplier', '供應商同步'],
        ['TaskOrderMonitor', '訂單監控'],
        ['TaskMapMktProd', '市場商品對應'],
        ['TasksCheck', '任務健康檢查'],
        ['BizTaskCustNo', '客戶編號任務'],
        ['MaintainTool', '維護工具（含 clearDatabase）'],
        ['MigrateTool', '遷移工具'],
        ['EditAPIYamlTool', 'API YAML 編輯'],
        ['FilesTool', '檔案工具'],
        ['LifeCOMMaintain', 'LifeCOM 維護'],
        ['ChkCode', '編碼檢查'],
        ['LuckTest', '測試用'],
      ]
    ),
    paragraph(''),
    heading2('Schedule Process 類'),
    table(
      ['Process', '功能'],
      [
        ['MarketsProcess', '各平台訂單抓取排程'],
        ['PreShipOrdersProcess', '預備出貨處理排程'],
        ['ProductsProcess', '商品同步排程'],
        ['ReportsProcess', '報表排程'],
        ['StoreProcess', '門市同步排程'],
        ['SupplierProcess', '供應商排程'],
        ['WarehouseProcess', '倉庫排程'],
        ['CustNoProcess', 'WMS 客戶編號排程'],
      ]
    ),
    paragraph(''),
    heading2('固定排程'),
    bulletItem('MaintainTool:run clearDatabase — 每月第一個週六 13:00（清理資料庫）'),
  ], token);

  await sleep(500);

  // ── 8. 報表 + 物流 + 客戶 ──────────────────────────────────────────
  await createPage(mainPage.id, '報表系統 & 物流出貨', '📄', [
    heading2('報表系統（reports/）'),
    callout('實作 ReportInterface，所有報表繼承 AbstractReport。', '📊'),
    table(
      ['報表', '客戶/用途'],
      [
        ['OrderSales', '訂單銷售報表'],
        ['OrdersList', '訂單清單'],
        ['OrdersACS / OrdersDEC / OrdersSF', 'ACS/DEC/SF 訂單'],
        ['OrdersDHLXML / OrdersFedex', 'DHL/FedEx 出貨'],
        ['LevisSapSales / LevisSTKR', 'Levis SAP 銷售/庫存'],
        ['EmersSales', 'Emers 銷售'],
        ['JealousnessSales', 'Jealousness 銷售'],
        ['JollywizSales', 'Jollywiz 銷售'],
        ['ChingHwaSales / DhinChiSales', '慶華/鼎基銷售'],
        ['FivesoapSales', '五皂銷售'],
        ['PSKSales', 'PSK 銷售'],
        ['SWASales / SWAAsn', 'SWA 銷售/ASN'],
        ['TeamsonSales', 'Teamson 銷售'],
        ['ToysrusSales', 'Toysrus 銷售'],
        ['UmbrellaKingSales', '雨傘王銷售'],
        ['SysBDReport', '系統 BD 報表'],
        ['SysCompareStocks / V2', '系統庫存比對'],
        ['SysLowStocks', '低庫存警示'],
      ]
    ),
    paragraph(''),
    divider(),
    heading2('物流出貨 PDF 列印'),
    table(
      ['物流商', 'PDF 類', '備註'],
      [
        ['黑貓 TCat', 'TCat3ModePDF, TCatPackPDF', '3 聯單 / 包裹'],
        ['新竹貨運 HCT', 'HctPackPDF, HctPackNotDetailsPDF', '6 聯可選'],
        ['7-ELEVEN', 'SevenPDF6, Seven1015', '6 聯 / 10×15'],
        ['全家 Family', 'NineOneFamilyPDF, NineOneFamilyPackPDF', '標準 / 包裹'],
        ['萊爾富 Hilife', 'HilifePDF', ''],
        ['郵局 Post', 'PostPDF', '4 聯'],
        ['中華郵政', 'ChunghwaPostShipPDF', ''],
        ['Pelican', 'Pelican1Of3, Pelican3ModePDF3', '1/3 / 3 聯'],
        ['超市', 'SuperMarket4PDF', '4 聯'],
        ['門市 Store', 'Store1015', '10×15 + 集貨'],
        ['自出', 'BaseSelfShipPDF', ''],
        ['NSY', 'NSYLabel1010', '10×10 標籤'],
        ['Portlee', 'Portlee1012', '10×12 標籤'],
        ['A4 通用', 'A4PDF', 'A4 格式'],
      ]
    ),
    paragraph(''),
    heading2('物流串接'),
    bulletItem('ShipmentFactory — 物流工廠模式'),
    bulletItem('MomoShipment — Momo 物流串接'),
    bulletItem('MomoStorePlusShipment — Momo 超取+物流'),
    bulletItem('LifeTMSApi / LifeTMSApiBizWms / LifeTMSApiSFL / LifeTMSApiClient — LifeTMS 物流系統'),
    bulletItem('LifeTMSCustomerClient — LifeTMS 客戶端'),
  ], token);

  await sleep(500);

  // ── 9. 客戶對照表 ──────────────────────────────────────────────────
  await createPage(mainPage.id, '客戶專屬模組 & 對照表', '👥', [
    heading2('客製化架構（Eccore Info 類）'),
    callout('透過 Info 類定義客戶專屬常量，實現多租戶差異化。', '🎯'),
    table(
      ['Info 類', '客戶', '用途'],
      [
        ['AdastriaInfo', 'Adastria', '日系服飾設定'],
        ['LevisInfo', 'Levis', 'Levis 專屬設定'],
        ['NPCInfo', 'NPC', 'NPC 設定'],
        ['NSYInfo', 'NSY', 'NSY 設定'],
        ['OwndaysInfo', 'OWNDAYS', '眼鏡品牌設定'],
        ['SabonInfo', 'Sabon', '保養品設定'],
        ['UCCInfo', 'UCC', 'UCC 設定'],
        ['CustomizedInfo', '通用', '客製化開關'],
      ]
    ),
    paragraph(''),
    heading2('風控模組'),
    bulletItem('BaseRiskCheck.php — 標準風控（所有客戶）'),
    bulletItem('BaseRiskCheckLoreal.php — L\'Oréal 專用風控'),
    bulletItem('RefundRiskCheck.php — 退款風控'),
    bulletItem('orderRules/RiskChkModule — 訂單規則風控'),
    bulletItem('orderRules/RiskChk2Module — 進階風控'),
    bulletItem('orderRules/RiskChkAfterShipNoModule — 出貨後風控'),
    paragraph(''),
    heading2('RSP（Retail Suggested Price）'),
    bulletItem('BaseRSP.php — V1 基礎版'),
    bulletItem('BaseRSPV2.php / BaseRSPV3.php — V2/V3 進化版'),
    bulletItem('BaseRSPDoe.php — Doe 專用'),
    bulletItem('BaseRSPLevis.php — Levis 專用'),
    bulletItem('BaseRSPSabon.php — Sabon 專用'),
    paragraph(''),
    divider(),
    heading2('客戶完整對照表'),
    table(
      ['客戶代碼', '客戶名稱', '主要平台', '專用模組'],
      [
        ['Levis', 'Levis', 'SAP', 'RSP, SAP銷售, STKR'],
        ['Adastria', 'Adastria', '專用', 'SIV, 庫存, 倉儲'],
        ['OWNDAYS', 'OWNDAYS', 'POS', '採購, 庫存'],
        ['Doe', 'Doe', 'Digiwin', '採購, 倉儲'],
        ['L\'Oréal', '萊雅', 'LINE Gift', '風控, 發票'],
        ['UCC', 'UCC', '專用', '商品, 門市'],
        ['SWA', 'SWA', '專用', '銷售, ASN'],
        ['Toysrus', '玩具反斗城', '專用', '銷售, 倉儲'],
        ['Sabon', 'Sabon', '專用', 'RSP'],
        ['NPC', 'NPC', '專用', '倉儲'],
        ['NSY', 'NSY', '專用', '出貨標籤'],
        ['Emers', 'Emers', '專用', '銷售'],
        ['Jealousness', '嫉妒', '專用', '銷售配額'],
        ['Teamson', 'Teamson', '專用', '銷售'],
        ['慶華', 'ChingHwa', '專用', '銷售'],
        ['鼎基', 'DhinChi', '專用', '銷售'],
        ['五皂', 'Fivesoap', '專用', '銷售'],
        ['PSK', 'PSK', '專用', '銷售'],
        ['雨傘王', 'UmbrellaKing', '專用', '銷售'],
        ['Jollywiz', 'Jollywiz', '專用', '銷售'],
        ['島村', 'Shimamura', '專用', '採購, 入庫'],
        ['Portlee', 'Portlee', '專用', '出貨標籤'],
        ['DKSH', 'DKSH', 'XML', 'JSON結果'],
        ['fmshoes', 'FM Shoes', '專用', 'Docker'],
      ]
    ),
  ], token);

  await sleep(500);

  // ── 10. 已知問題 + 部署 ────────────────────────────────────────────
  await createPage(mainPage.id, '部署架構 & 已知問題', '🚀', [
    heading2('部署架構'),
    codeBlock(
`deployment/
├── deployment.sh          # 部署腳本
├── php/
│   ├── Dockerfile         # PHP-FPM 容器
│   └── xdebug.ini         # Xdebug 設定
├── nginx/
│   ├── Dockerfile         # Nginx 容器
│   ├── nginx.conf         # Nginx 主設定
│   └── sites/app.conf     # 站台設定
└── fmshoes/
    └── Dockerfile         # fmshoes 客戶專用`, 'plain text'),
    bulletItem('CI/CD：Bitbucket Pipeline'),
    bulletItem('部署目標：Kubernetes（K8s）'),
    bulletItem('容器化：Docker（PHP-FPM + Nginx 分離）'),
    paragraph(''),
    heading2('關鍵依賴套件'),
    table(
      ['套件', '版本', '用途'],
      [
        ['laravel/framework', '^9.0', '核心框架'],
        ['guzzlehttp/guzzle', '^7.0', 'HTTP Client'],
        ['laravel/sanctum', '^2.11', 'API 認證'],
        ['box/spout', '^3.3', 'Excel 讀寫'],
        ['barryvdh/laravel-dompdf', '^2.0', 'PDF 產生'],
        ['picqer/php-barcode-generator', '^2.2', '條碼產生'],
        ['spatie/browsershot', '^4.3', '瀏覽器截圖'],
        ['spatie/laravel-webhook-server', '^3.8', 'Webhook 發送'],
        ['league/flysystem-aws-s3-v3', '^3.0', 'S3 儲存'],
        ['league/flysystem-ftp/sftp', '^3.0', 'FTP/SFTP'],
        ['awobaz/compoships', '^2.1', '複合主鍵 Eloquent'],
      ]
    ),
    paragraph(''),
    divider(),
    heading2('已知系統問題（常見告警）'),
    callout('這些是目前已知的持續性問題，定期在系統告警中出現。', '⚠️'),
    table(
      ['問題', '來源', '描述', '嚴重度'],
      [
        ['MomoClient.php null array', 'platform/MomoClient', 'Momo API 回傳異常', '中'],
        ['Momo SSL reset', 'platform/Momo', '節假日 SSL 連線重設', '低（自動恢復）'],
        ['TOWMS airbu2 not_mapping_ORDTY', 'warehouse/', 'WMS 訂單類型未對應', '中'],
        ['TOWMS vacanza IMSSP', 'warehouse/', 'WMS 庫存同步問題', '中'],
        ['levis Invalid CRON', 'schedule/', 'Levis 排程 cron 表達式錯誤', '低'],
        ['sfl Route[login]', 'warehouse/BizWmsSFL', 'SFL 登入路由週期性爆發', '中'],
      ]
    ),
    paragraph(''),
    heading2('安全性設計'),
    bulletItem('JWT 認證：所有 API 路由走 auth.jwt middleware'),
    bulletItem('Webhook 簽名驗證（docs/features/webhook-signature-verification-guide.md）'),
    bulletItem('資料加密：EncyptModels/ + libraries/decrypt/'),
    bulletItem('風控引擎：BaseRiskCheck 系列 + orderRules/RiskChk*Module'),
    bulletItem('客戶黑名單：Models/CustomersBlacklist.php'),
    bulletItem('Google reCAPTCHA V3：前端保護'),
    paragraph(''),
    heading2('現有文件（docs/）'),
    bulletItem('features/ — 功能文件（條碼掃描、訂單合併、Webhook 驗簽、每日配貨上限）'),
    bulletItem('guides/ — 開發指南（AI DLC、Code Review、PR 流程、Self Review）'),
    bulletItem('plans/ — 設計規劃（CSV 拆分）'),
    bulletItem('releases/ — Release Notes（v3.10.6 ~ v3.10.58）'),
    bulletItem('setup/ — 設定文件（Bitbucket API、Git 策略）'),
    bulletItem('templates/ — 範本（Slack 公告）'),
    bulletItem('testing/ — 測試指南（地址驗證）'),
  ], token);

  console.log('\n🎉 BlackDog 產品知識庫上傳完成！');
  console.log(`📍 主頁面：${mainPage.url}`);
}

main().catch(err => {
  console.error('❌ Error:', err.message || err);
  process.exit(1);
});
