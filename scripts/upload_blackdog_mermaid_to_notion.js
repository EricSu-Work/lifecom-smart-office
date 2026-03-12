/**
 * upload_blackdog_mermaid_to_notion.js
 * 
 * 將 BlackDog Mermaid 架構圖上傳到 Notion
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const TOKENS = {
  personal: fs.readFileSync(path.join(process.env.USERPROFILE, '.config/notion/api_key'), 'utf8').trim(),
};

// BlackDog 產品知識庫主頁面
const PARENT_PAGE_ID = '31fd2a91-c732-81bb-bb39-cec8d5301475';

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
          } else { resolve(parsed); }
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// Block builders
function heading1(text) {
  return { object: 'block', type: 'heading_1', heading_1: { rich_text: [{ type: 'text', text: { content: text } }] } };
}
function heading2(text) {
  return { object: 'block', type: 'heading_2', heading_2: { rich_text: [{ type: 'text', text: { content: text } }] } };
}
function heading3(text) {
  return { object: 'block', type: 'heading_3', heading_3: { rich_text: [{ type: 'text', text: { content: text } }] } };
}
function paragraph(text) {
  if (!text || text.trim() === '') return { object: 'block', type: 'paragraph', paragraph: { rich_text: [] } };
  const chunks = [];
  for (let i = 0; i < text.length; i += 2000) chunks.push({ type: 'text', text: { content: text.slice(i, i + 2000) } });
  return { object: 'block', type: 'paragraph', paragraph: { rich_text: chunks } };
}
function codeBlock(text, lang = 'mermaid') {
  const chunks = [];
  for (let i = 0; i < text.length; i += 2000) chunks.push({ type: 'text', text: { content: text.slice(i, i + 2000) } });
  return { object: 'block', type: 'code', code: { rich_text: chunks, language: lang } };
}
function divider() { return { object: 'block', type: 'divider', divider: {} }; }
function callout(text, emoji = '📊') {
  return { object: 'block', type: 'callout', callout: { rich_text: [{ type: 'text', text: { content: text } }], icon: { type: 'emoji', emoji } } };
}
function bulletItem(text) {
  return { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ type: 'text', text: { content: text } }] } };
}

async function createPage(parentId, title, icon, children, token) {
  const body = {
    parent: { page_id: parentId },
    icon: icon ? { type: 'emoji', emoji: icon } : undefined,
    properties: { title: { title: [{ text: { content: title } }] } },
    children: children.slice(0, 100)
  };
  const page = await request(token, 'POST', '/v1/pages', body);
  console.log(`✅ Created: "${title}" → ${page.url}`);
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

async function main() {
  const token = TOKENS.personal;
  console.log('🚀 開始上傳 Mermaid 架構圖到 Notion...\n');

  // ═══════════════════════════════════════════════════════════════
  // 建立主頁面：架構圖集
  // ═══════════════════════════════════════════════════════════════
  const mainPage = await createPage(PARENT_PAGE_ID, '架構圖集（Mermaid）', '📐', [
    callout('BlackDog OMS/WMS 系統全架構圖，使用 Mermaid 語法描述。Notion 原生支援 Mermaid 渲染。', '🗺️'),
    paragraph(''),
    heading2('圖表索引'),
    bulletItem('1. 系統分層架構圖 — 從 Routes 到 Database 的完整分層'),
    bulletItem('2. 訂單狀態機 — 完整的訂單生命週期（30+ 狀態）'),
    bulletItem('3. 訂單處理流程 — 從平台抓單到出貨完成'),
    bulletItem('4. 訂單流程類型 — 6 種 OrderFlow 的差異'),
    bulletItem('5. 電商平台串接架構 — 17 個平台的整合模式'),
    bulletItem('6. WMS 倉儲整合架構 — 多倉庫串接全景'),
    bulletItem('7. 物流出貨流程 — 自出/三方/超取/宅配'),
    bulletItem('8. 排程任務架構 — 動態排程系統'),
    bulletItem('9. 風控引擎流程 — 訂單風險檢查'),
    bulletItem('10. 退貨流程 — 退貨/退款/換貨'),
  ], token);
  await sleep(500);

  // ═══════════════════════════════════════════════════════════════
  // 1. 系統分層架構圖
  // ═══════════════════════════════════════════════════════════════
  await createPage(mainPage.id, '1. 系統分層架構圖', '🏗️', [
    heading2('BlackDog 系統分層架構'),
    codeBlock(`graph TB
    subgraph "🌐 Route Layer"
        R1[api.php<br/>主要 API]
        R2[web.php<br/>SPA + Swagger]
        R3[lifeerp.php<br/>LifeERP 整合]
        R4[digiwin.php<br/>鼎新 ERP]
        R5[adERP.php<br/>adERP 整合]
        R6[frontend.php<br/>前端專用]
    end

    subgraph "🎮 Controller Layer"
        C1[api/<br/>24 Controllers]
        C2[OutsideApi/<br/>5 Controllers]
    end

    subgraph "⚙️ Service Layer"
        S1[Auth]
        S2[MarketSvc]
        S3[Purchase]
        S4[ShipReturn]
        S5[UploadSvc]
    end

    subgraph "🧠 Business Logic Layer ERPBD"
        B1[platform/<br/>17 平台串接]
        B2[warehouse/<br/>17+ 倉庫串接]
        B3[operator/<br/>14 訂單操作器]
        B4[orderFlow/<br/>6 訂單流程]
        B5[orderRules/<br/>11 規則引擎]
        B6[reports/<br/>20+ 報表]
        B7[schedule/<br/>8 排程處理]
        B8[scan/<br/>掃描模組]
    end

    subgraph "📦 Repository Layer"
        RP1[BizModels/]
        RP2[LifeMall/]
        RP3[Market/]
        RP4[Order/]
        RP5[Prod/]
    end

    subgraph "🗃️ Model Layer"
        M1[(Models/<br/>100+ Eloquent)]
        M2[(BizModels/<br/>33 WMS Models)]
        M3[(LifeMallModels/<br/>7 Models)]
        M4[(MongoModels/)]
    end

    subgraph "🔧 Config Layer Eccore"
        CF1[46 個 Info 類<br/>常量 + 狀態碼 + 規則]
    end

    subgraph "💾 Database Layer"
        DB1[(lifeerp<br/>MySQL OMS)]
        DB2[(bizpro_wms<br/>MySQL WMS)]
        DB3[(lifemall<br/>MySQL Mall)]
        DB4[(MongoDB<br/>Log)]
    end

    R1 & R2 & R3 & R4 & R5 & R6 --> C1 & C2
    C1 & C2 --> S1 & S2 & S3 & S4 & S5
    S1 & S2 & S3 & S4 & S5 --> B1 & B2 & B3 & B4 & B5 & B6 & B7 & B8
    B1 & B2 & B3 & B4 & B5 & B6 & B7 & B8 --> RP1 & RP2 & RP3 & RP4 & RP5
    RP1 & RP2 & RP3 & RP4 & RP5 --> M1 & M2 & M3 & M4
    M1 --> DB1
    M2 --> DB2
    M3 --> DB3
    M4 --> DB4
    CF1 -.->|常量定義| B1 & B2 & B3 & B4 & B5`),
    paragraph(''),
    divider(),
    heading2('部署架構圖'),
    codeBlock(`graph LR
    subgraph "Bitbucket Pipeline CI/CD"
        BP[Bitbucket<br/>Pipeline]
    end

    subgraph "Kubernetes Cluster"
        subgraph "Pod"
            NGX[Nginx<br/>Container]
            PHP[PHP-FPM<br/>Container]
        end
        subgraph "Storage"
            PVC[PersistentVolume<br/>shared files]
        end
    end

    subgraph "Database"
        MySQL[(MySQL<br/>lifeerp + bizpro_wms)]
        Mongo[(MongoDB)]
    end

    subgraph "External"
        S3[AWS S3<br/>檔案儲存]
        FTP[FTP/SFTP<br/>檔案交換]
    end

    BP -->|deploy| NGX & PHP
    NGX -->|fastcgi| PHP
    PHP --> PVC
    PHP --> MySQL & Mongo
    PHP --> S3 & FTP`),
  ], token);
  await sleep(500);

  // ═══════════════════════════════════════════════════════════════
  // 2. 訂單狀態機
  // ═══════════════════════════════════════════════════════════════
  await createPage(mainPage.id, '2. 訂單狀態機', '🔄', [
    heading2('訂單主要狀態流（Happy Path）'),
    codeBlock(`stateDiagram-v2
    [*] --> s0: 平台拋單
    s0: 0.未處理
    s0 --> s1: 訂單確認
    s1: 1.已確認
    s1 --> s5: 配貨完成
    s5: 5.預備出貨
    s5 --> s6: 加註備註
    s6: 6.預備出貨#
    s5 --> s7: 風控通過
    s6 --> s7: 風控通過
    s7: 7.風控確認
    s7 --> s8: 轉入倉庫
    s8: 8.已產給倉庫 TOWMS
    s8 --> s220: 出貨完成
    s220: 220.已出貨
    s220 --> s270: 到店
    s270: 270.已到店
    s270 --> s290: 取件
    s220 --> s230: 宅配送達
    s230: 230.送達消費者
    s230 --> s290: 確認收件
    s290: 290.消費者已取件
    s290 --> s300: 結案
    s300: 300.結算
    s300 --> [*]`),
    paragraph(''),
    heading2('訂單異常狀態'),
    codeBlock(`stateDiagram-v2
    state "風控異常群組" as risk {
        s401: 401.收件資料異常
        s402: 402.發票資料異常
        s403: 403.會員資料異常
        s404: 404.黑名單
        s405: 405.付款檢核失敗
        s406: 406.付款資料錯誤
        s407: 407.金額超過風控
        s408: 408.明細金額異常
        s410: 410.贈品併單失敗
        s420: 420.風控訂單規則
        s421: 421.訂單規則異常
        s425: 425.出貨風控訂單規則
    }

    state "倉庫異常群組" as wms {
        s480: 480.倉庫回傳異常
        s485: 485.倉庫重新配貨異常
        s486: 486.倉庫回傳數量異常
        s487: 487.倉庫退貨入庫異常
        s488: 488.WMS 商品異常
    }

    state "系統異常群組" as sys {
        s400: 400.預備缺貨等待
        s431: 431.平台訂單準備中
        s435: 435.平台確認失敗
        s490: 490.發票作廢失敗
        s491: 491.退款失敗
        s411x: 4111.自出門市關轉
        s412x: 4121.自出取號失敗
    }

    state "訂單終止" as cancel {
        s24: 24.訂單取消
        s25: 25.暫停出貨
        s38: 38.訂單取消中
    }`),
    paragraph(''),
    heading2('退貨狀態流'),
    codeBlock(`stateDiagram-v2
    [*] --> s260: 退貨申請
    s260: 260.退貨申請
    s260 --> s267: 退貨風控
    s267: 267.退貨風控確認
    s267 --> s268: 產給倉庫
    s268: 268.退貨已產出給倉庫
    s268 --> s269: 待確認退款
    s269: 269.退貨等待退款確認
    s269 --> s300: 結案
    s300: 300.結算
    s300 --> [*]

    s260 --> s462: 結案異常
    s462: 462.退貨結案異常`),
    paragraph(''),
    heading2('物流狀態流（ship_status）'),
    codeBlock(`stateDiagram-v2
    [*] --> Created: 建立
    Created --> Processing: 處理中
    Processing --> Shipped: 已出貨
    Shipped --> ArrivedStore: 到店
    Shipped --> Arrived: 送達
    ArrivedStore --> PickedUp: 取件
    Arrived --> Finished: 結案
    PickedUp --> Finished: 結案

    Shipped --> ReturnRequested: 退貨申請
    ReturnRequested --> ReturnShipNo: 退貨取號
    ReturnShipNo --> ReturnPickedUp: 退貨取件
    ReturnPickedUp --> ReturnArrived: 退貨到倉
    ReturnArrived --> Returned: 退貨完成
    Returned --> Refunded: 已退款

    Processing --> Abnormal: 異常
    Processing --> ShippingError: 出貨錯誤
    Shipped --> StoreClose: 門市關轉
    Created --> Reset: 重設
    Processing --> Canceled: 取消`),
  ], token);
  await sleep(500);

  // ═══════════════════════════════════════════════════════════════
  // 3. 訂單處理流程
  // ═══════════════════════════════════════════════════════════════
  await createPage(mainPage.id, '3. 訂單處理流程', '📋', [
    heading2('訂單從平台到出貨完整流程'),
    codeBlock(`flowchart TD
    A[電商平台] -->|API/檔案| B[TaskMarkets<br/>平台訂單拋轉]
    B --> C{訂單準備<br/>BasePrepare}
    C --> D[建立訂單<br/>CreateOrder]
    D --> E{OrderRules<br/>規則引擎}
    
    E --> E1[AddressValidation<br/>地址驗證]
    E --> E2[OrderMerge<br/>合併訂單]
    E --> E3[OrderSplit<br/>拆單]
    E --> E4[GiftWithOrder<br/>贈品]
    E --> E5[BuyAGetB<br/>買A送B]
    E --> E6[VolumeChangeShip<br/>材積換物流]
    
    E1 & E2 & E3 & E4 & E5 & E6 --> F{配貨<br/>Assign}
    F -->|有庫存| G[5.預備出貨]
    F -->|無庫存| G1[400.缺貨等待]
    
    G --> H{風控檢查<br/>RiskCheck}
    H -->|通過| I[7.風控確認]
    H -->|異常| H1[401~425<br/>風控異常]
    H1 -->|人工解除| I
    
    I --> J{OrderFlow<br/>流程分派}
    J -->|DefaultFlow| K1[取號 → 確認 → 轉WMS]
    J -->|SFLiiFlow| K2[直接轉WMS<br/>WMS取號]
    J -->|PostFlow| K3[轉WMS → 上傳PDF]
    J -->|ShipCollectFlow| K4[彙總集貨 → 轉WMS]
    
    K1 & K2 & K3 & K4 --> L[8.已產給倉庫]
    L --> M[WMS 揀貨出貨]
    M --> N[220.已出貨]
    N --> O{物流追蹤}
    O -->|宅配| P1[230.送達]
    O -->|超取| P2[270.到店 → 290.取件]
    P1 & P2 --> Q[300.結算]`),
    paragraph(''),
    divider(),
    heading2('排程任務觸發鏈'),
    codeBlock(`flowchart LR
    subgraph "Kernel 動態排程"
        K[tasks 資料表] -->|cron 表達式| S[Laravel Scheduler]
    end

    S --> T1[TaskMarkets<br/>抓單]
    S --> T2[TaskProducts<br/>商品同步]
    S --> T3[TaskWarehouse<br/>倉庫任務]
    S --> T4[TaskReport<br/>報表]
    S --> T5[TaskOrderMonitor<br/>訂單監控]
    S --> T6[TaskSettle<br/>結算]
    S --> T7[TaskStore<br/>門市同步]
    S --> T8[TaskSupplier<br/>供應商]

    T1 --> P1[MarketsProcess]
    T2 --> P2[ProductsProcess]
    T3 --> P3[WarehouseProcess]
    T4 --> P4[ReportsProcess]
    T7 --> P5[StoreProcess]

    P1 -->|各平台| M1[Momo / Shopee / Shopify<br/>Yahoo / 91APP / LINE Gift...]`),
  ], token);
  await sleep(500);

  // ═══════════════════════════════════════════════════════════════
  // 4. 訂單流程類型
  // ═══════════════════════════════════════════════════════════════
  await createPage(mainPage.id, '4. 訂單流程類型（OrderFlow）', '🔀', [
    heading2('6 種 OrderFlow 比較'),
    codeBlock(`flowchart TD
    subgraph "DefaultFlow（標準流程）"
        D1[配貨] --> D2[風控] --> D3[取物流編號] --> D4[平台確認] --> D5[轉WMS] --> D6[出貨]
    end

    subgraph "SFLiiFlow（順豐二倉）"
        S1[配貨<br/>允許無商品] --> S2[風控<br/>僅寫備註] --> S3[直接轉WMS] --> S4[WMS取號+確認] --> S5[出貨]
    end

    subgraph "PostFlow（郵局）"
        P1[配貨] --> P2[風控] --> P3[轉WMS] --> P4[取號] --> P5[確認] --> P6[上傳PDF到WMS] --> P7[出貨]
    end

    subgraph "NoneAssignFlow（免配貨）"
        N1[跳過配貨] --> N2[風控] --> N3[取號] --> N4[確認] --> N5[轉WMS] --> N6[出貨]
    end

    subgraph "AssignToShipFlow（配貨即出貨）"
        A1[配貨] --> A2[風控] --> A3[直接標記出貨] --> A4[出貨完成]
    end

    subgraph "ShipCollectFlow（彙總集貨 B2B）"
        C1[多訂單分組] --> C2[風控] --> C3[彙總轉WMS] --> C4[集貨出貨]
    end`),
    paragraph(''),
    heading2('OrderFlow 配置矩陣'),
    codeBlock(`graph LR
    subgraph "AssignMode 配貨模式"
        AM1[NeedAssign<br/>標準配貨]
        AM2[NoneAssign<br/>跳過配貨<br/>SFLii]
        AM3[NoneAssignV2<br/>不配但更新ID<br/>Post]
        AM4[AssignToShip<br/>配貨即出貨]
    end

    subgraph "RiskChkMode 風控模式"
        RC1[NeedChk<br/>標準風控]
        RC2[OnlyMemo<br/>僅寫備註<br/>SFLii]
        RC3[OnlyRemark2<br/>蝦皮備註]
    end

    AM1 --> RC1
    AM2 --> RC2
    AM3 --> RC1
    AM4 --> RC1`),
  ], token);
  await sleep(500);

  // ═══════════════════════════════════════════════════════════════
  // 5. 電商平台串接架構
  // ═══════════════════════════════════════════════════════════════
  await createPage(mainPage.id, '5. 電商平台串接架構', '🛒', [
    heading2('17 平台整合全景圖'),
    codeBlock(`graph TB
    subgraph "PlatformInterface 統一介面"
        PI[PlatformInterface.php]
    end

    subgraph "API 串接平台"
        direction LR
        P1[Momo<br/>MomoClient]
        P2[Momo超取+<br/>MomoStorePlusClient]
        P3[蝦皮ShopeeV2<br/>ShopeeV2Client]
        P4[Shopify<br/>ShopifyClient]
        P5[Shopline<br/>ShoplineClient]
        P6[Yahoo購物中心<br/>YahooShoppingMallClient]
        P7[Yahoo超級商城<br/>YahooShoppingMallShopClient]
        P8[91APP<br/>NineOneAPPClient]
        P9[LINE禮物<br/>LineGiftClient]
        P10[Cyberbiz<br/>CyberbizClient]
        P11[ETMall<br/>ETMallClient]
        P12[PCHome<br/>PCHomeClient]
        P13[Adastria<br/>AdastriaClient]
        P14[OWNDAYS<br/>OwndaysClient]
    end

    subgraph "ERP 串接"
        E1[Digiwin鼎新<br/>DigiwinClient]
    end

    subgraph "檔案串接"
        F1[Upload<br/>DefaultFileClient]
        F2[Upload+驗證<br/>FileClientWithDataCheck]
    end

    PI --> P1 & P2 & P3 & P4 & P5 & P6 & P7 & P8 & P9 & P10 & P11 & P12 & P13 & P14
    PI --> E1
    PI --> F1 & F2

    subgraph "特殊版本"
        P3a[ShopeeV2SFLii<br/>蝦皮SFL倉]
        P4a[ShopifySFLii<br/>Shopify SFL倉]
        P9a[LineGiftLoreal<br/>LINE禮物萊雅]
    end

    P3 -.-> P3a
    P4 -.-> P4a
    P9 -.-> P9a`),
    paragraph(''),
    heading2('平台串接資料流'),
    codeBlock(`sequenceDiagram
    participant P as 電商平台
    participant BD as BlackDog
    participant WMS as 倉庫系統
    participant LOG as 物流商

    Note over P,BD: 抓單流程
    BD->>P: 拉取訂單（API/檔案）
    P-->>BD: 訂單資料
    BD->>BD: 訂單規則處理
    BD->>BD: 配貨 + 風控

    Note over BD,WMS: 出貨流程
    BD->>LOG: 取物流編號
    LOG-->>BD: 物流編號
    BD->>P: 確認訂單（回壓狀態）
    BD->>WMS: 轉入倉庫
    WMS-->>BD: RSP 出貨回傳
    BD->>BD: 更新出貨狀態

    Note over BD,LOG: 物流追蹤
    BD->>LOG: 查詢物流狀態
    LOG-->>BD: 物流狀態更新
    BD->>P: 回壓物流狀態`),
  ], token);
  await sleep(500);

  // ═══════════════════════════════════════════════════════════════
  // 6. WMS 倉儲整合架構
  // ═══════════════════════════════════════════════════════════════
  await createPage(mainPage.id, '6. WMS 倉儲整合架構', '🏭', [
    heading2('多倉庫串接全景'),
    codeBlock(`graph TB
    subgraph "BlackDog OMS"
        OMS[訂單管理系統]
    end

    subgraph "warehouse/ 倉庫介面層"
        WO[order/<br/>訂單下倉]
        WS[stock/<br/>庫存同步]
        WP[product/<br/>商品同步]
        WV[stockInVoucher/<br/>入庫單]
        WA[asn/<br/>ASN通知]
        WM[stockMove/<br/>庫存調撥]
    end

    subgraph "SFL 順豐系列"
        SFL1[BizWmsSFL V1]
        SFL2[BizWmsSFLV2]
        SFL3[BizWmsSFLV3]
        SFLii[BizWmsSFLii]
        SFLSelf[BizWmsSFLSelf]
        SFLAda[BizWmsSFLAdastria]
    end

    subgraph "BizWms 系列"
        BW1[5soap]
        BW2[Ajpeace]
        BW3[Doe]
        BW4[EZ]
        BW5[JetF]
        BW6[NPC]
        BW7[SDL]
        BW8[TDS]
        BW9[XML]
    end

    subgraph "獨立倉庫"
        IW1[Focus]
        IW2[LES]
        IW3[Maersk]
        IW4[Toysrus]
        IW5[WmsPOST]
    end

    OMS --> WO & WS & WP & WV & WA & WM
    WO & WS & WP & WV --> SFL1 & SFL2 & SFL3 & SFLii & SFLSelf & SFLAda
    WO & WS & WV --> BW1 & BW2 & BW3 & BW4 & BW5 & BW6 & BW7 & BW8 & BW9
    WO & WS & WV --> IW1 & IW2 & IW3 & IW4 & IW5`),
    paragraph(''),
    heading2('WMS 資料流（BizModels）'),
    codeBlock(`erDiagram
    T_ORDHAD ||--o{ T_ORDDEL : "出貨明細"
    T_ORDHAD ||--o{ T_ORDDSTS : "出貨狀態"
    T_ORDHAD ||--o{ T_ORDSSTS : "出貨子狀態"

    T_STOWHAD ||--o{ T_STOWING : "入庫明細"
    T_STOWHAD ||--o{ T_STOWQCH : "品檢頭"
    T_STOWQCH ||--o{ T_STOWQCD : "品檢細"
    T_STOWHAD ||--o{ T_STOWSLOH : "上架頭"
    T_STOWSLOH ||--o{ T_STOWSLOT : "上架細"
    T_STOWHAD ||--o{ T_STOWRSTS : "入庫狀態"

    OCustomer ||--o{ OMerdata : "客戶商品"
    OMerdata ||--o{ OSlotmer : "商品儲位"
    T_Dzone ||--o{ TChslotd : "儲區儲位"

    T_ORDHAD {
        string HDID PK
        string CUST_NO
        string ORDTY
        datetime ORDDT
    }
    T_STOWHAD {
        string HDID PK
        string CUST_NO
        datetime STOWDT
    }
    OMerdata {
        string MER_NO PK
        string CUST_NO
        string MER_NAME
    }`),
  ], token);
  await sleep(500);

  // ═══════════════════════════════════════════════════════════════
  // 7. 物流出貨流程
  // ═══════════════════════════════════════════════════════════════
  await createPage(mainPage.id, '7. 物流出貨流程', '🚚', [
    heading2('物流方式分類'),
    codeBlock(`graph TB
    subgraph "自出物流 SHIP_SELF"
        subgraph "宅配 SHIP_SELF_HOME"
            H1[黑貓 TCat]
            H2[新竹 HCT]
            H3[宅急便 Pelican]
            H4[郵局 Post]
            H5[統一速達 FSDEX]
            H6[黑貓到店 TCatStore]
            H7[大榮 KerryTJ]
            H8[博駿 Bojun]
        end
        subgraph "超取 SHIP_SELF_CSVS"
            C1[7-ELEVEN PCSC]
            C2[全家 Family]
            C3[萊爾富 Hilife]
        end
    end

    subgraph "三方物流 SHIP_THIRD"
        subgraph "三方宅配"
            T1[三方黑貓]
            T2[三方宅急便]
            T3[三方新竹]
            T4[三方黑貓到店]
        end
        subgraph "三方超取"
            T5[三方7-11]
            T6[三方全家]
            T7[三方萊爾富]
            T8[蝦皮店到店]
            T9[三方OKMart]
            T10[三方全家店到店]
        end
        subgraph "三方海外"
            T11[三方順豐 SF]
            T12[三方7-11跨境宅]
            T13[三方7-11跨境店]
        end
    end

    subgraph "特殊物流"
        SP1[專車 PrivateCar]
        SP2[自取 SelfPicking]
        SP3[門市自取 StorePick]
        SP4[波特李 Portlee]
        SP5[佐川 Sagawa]
        SP6[祥益 SYLC]
        SP7[佶傳 Jizhuan]
    end

    subgraph "海外物流"
        OV1[DHL]
        OV2[DEC]
        OV3[FedEx]
        OV4[ACS]
        OV5[SF API]
        OV6[GMJ]
    end`),
    paragraph(''),
    heading2('出貨標籤 PDF 產生流程'),
    codeBlock(`flowchart LR
    A[訂單確認出貨] --> B{物流方式}
    B -->|黑貓| C1[TCat3ModePDF<br/>TCatPackPDF]
    B -->|新竹| C2[HctPackPDF]
    B -->|7-11| C3[SevenPDF6<br/>Seven1015]
    B -->|全家| C4[NineOneFamilyPDF]
    B -->|萊爾富| C5[HilifePDF]
    B -->|郵局| C6[PostPDF]
    B -->|宅急便| C7[Pelican1Of3]
    B -->|門市| C8[Store1015]
    B -->|自出| C9[BaseSelfShipPDF]
    B -->|中華郵政| C10[ChunghwaPostShipPDF]

    C1 & C2 & C3 & C4 & C5 & C6 & C7 & C8 & C9 & C10 --> D[PDF 輸出]
    D --> E1[列印出貨]
    D --> E2[上傳 WMS<br/>PostFlow]`),
  ], token);
  await sleep(500);

  // ═══════════════════════════════════════════════════════════════
  // 8. 排程任務架構
  // ═══════════════════════════════════════════════════════════════
  await createPage(mainPage.id, '8. 排程任務架構', '⏰', [
    heading2('動態排程系統'),
    codeBlock(`flowchart TD
    subgraph "Laravel Kernel"
        K[Console/Kernel.php]
        K -->|查詢| DB[(tasks 資料表)]
        DB -->|enabled + enable_date| K
    end

    K -->|動態註冊| S[Laravel Scheduler]

    subgraph "artisan commands"
        S --> CMD1[TaskMarkets]
        S --> CMD2[TaskProducts]
        S --> CMD3[TaskWarehouse]
        S --> CMD4[TaskReport]
        S --> CMD5[TaskOrderMonitor]
        S --> CMD6[TaskSettle]
        S --> CMD7[TaskStore]
        S --> CMD8[TaskSupplier]
        S --> CMD9[TaskMapMktProd]
        S --> CMD10[TasksCheck]
    end

    subgraph "Schedule Process"
        CMD1 --> SP1[MarketsProcess<br/>各平台訂單抓取]
        CMD2 --> SP2[ProductsProcess<br/>商品同步]
        CMD3 --> SP3[WarehouseProcess<br/>倉庫排程]
        CMD4 --> SP4[ReportsProcess<br/>報表產生]
        CMD7 --> SP5[StoreProcess<br/>門市同步]
        CMD8 --> SP6[SupplierProcess<br/>供應商]
    end

    subgraph "固定排程"
        S --> FIX1[MaintainTool clearDatabase<br/>每月第一個週六 13:00]
    end

    subgraph "任務特性"
        NOTE1[runInBackground]
        NOTE2[withoutOverlapping]
        NOTE3[before/after logging]
    end`),
    paragraph(''),
    heading2('Observer 事件鏈'),
    codeBlock(`flowchart TD
    subgraph "Model Events"
        E1[Orders 變更]
        E2[Products 變更]
        E3[Purchase 變更]
        E4[StockInVoucher 變更]
        E5[T_ORDHAD 變更]
    end

    subgraph "Observer Layer"
        O1[OrdersProductsEvent]
        O2[ProductsEvent<br/>ProductsStockEvent]
        O3[PurchaseEvent<br/>PurchaseHeaderEvent]
        O4[StockInHeaderEvent<br/>StockInBodyEvent]
        O5[T_ORDHADEvent]
    end

    subgraph "Webhook Layer"
        W1[OrdersWebhook]
        W2[PurchaseHeaderWebhook]
    end

    subgraph "外部系統"
        EXT1[客戶系統]
        EXT2[ERP]
    end

    E1 --> O1 --> W1 --> EXT1
    E2 --> O2
    E3 --> O3 --> W2 --> EXT2
    E4 --> O4
    E5 --> O5`),
  ], token);
  await sleep(500);

  // ═══════════════════════════════════════════════════════════════
  // 9. 風控引擎
  // ═══════════════════════════════════════════════════════════════
  await createPage(mainPage.id, '9. 風控引擎流程', '🛡️', [
    heading2('風控檢查流程'),
    codeBlock(`flowchart TD
    A[訂單進入風控] --> B{RiskChkMode}
    B -->|NeedChk 標準| C[BaseRiskCheck]
    B -->|OnlyMemo SFLii| D[僅寫 error_memo<br/>不阻斷流程]
    B -->|OnlyRemark2 蝦皮| E[寫 delivery_memo]

    C --> F{收件資料檢查}
    F -->|異常| F1[401.收件資料異常]
    F -->|正常| G{發票資料檢查}
    G -->|異常| G1[402.發票資料異常]
    G -->|正常| H{會員黑名單}
    H -->|命中| H1[404.黑名單]
    H -->|正常| I{付款資料檢查}
    I -->|異常| I1[405/406.付款異常]
    I -->|正常| J{金額風控}
    J -->|超限| J1[407.金額超過風控]
    J -->|正常| K{訂單明細檢查}
    K -->|異常| K1[408.明細異常]
    K -->|正常| L[風控通過 → 7.風控確認]

    subgraph "OrderRules 風控"
        M[RiskChkModule] --> M1[420.風控訂單規則]
        N[RiskChk2Module] --> N1[進階風控]
        O[RiskChkAfterShipNoModule] --> O1[425.出貨後風控]
    end

    L --> M & N
    
    subgraph "客戶專用風控"
        P1[BaseRiskCheckLoreal<br/>萊雅專用]
        P2[RefundRiskCheck<br/>退款風控]
    end`),
  ], token);
  await sleep(500);

  // ═══════════════════════════════════════════════════════════════
  // 10. 退貨流程
  // ═══════════════════════════════════════════════════════════════
  await createPage(mainPage.id, '10. 退貨 / 退款 / 換貨流程', '↩️', [
    heading2('退貨完整流程'),
    codeBlock(`flowchart TD
    A[退貨申請] --> B{退貨類型<br/>trade_id}
    B -->|退貨 REFUND| C1[260.退貨申請]
    B -->|換貨退 EXCHANGE_REFUND| C2[260.退貨申請]
    B -->|門市退 STORE_REFUND| C3[260.退貨申請]
    B -->|宅配退 HOME_REFUND| C4[260.退貨申請]

    C1 & C2 --> D{退貨風控}
    D -->|通過| E[267.退貨風控確認]
    D -->|異常| D1[退貨風控異常<br/>261/262/263]
    
    E --> F[268.退貨已產出給倉庫]
    F --> G[WMS 退貨入庫]
    G --> H[269.等待退款確認]
    H --> I{退款處理}
    I -->|成功| J[300.結算]
    I -->|失敗| I1[491.退款失敗]

    C3 & C4 --> K[物流退貨<br/>ship_status 更新]
    K --> F`),
    paragraph(''),
    heading2('換貨流程'),
    codeBlock(`flowchart LR
    A[換貨申請] --> B[建立換貨訂單<br/>CreateExchangeOrder]
    B --> C[新訂單走正常出貨流程]
    
    A --> D[建立換貨退貨<br/>CreateExchangeReturn]
    D --> E[退貨走退貨流程]
    
    C --> F[出貨完成]
    E --> G[退貨入庫]
    F & G --> H[換貨結案]`),
    paragraph(''),
    heading2('交易類型總覽（trade_id）'),
    codeBlock(`graph TB
    subgraph "銷售類 SALES"
        T1[1.一般訂單 NORMAL]
        T2[2.員工訂單 EMPLOYEE]
        T3[5.調撥 ALLOCA]
        T4[6.其他 OTHERS]
        T5[7.業務 WORK]
        T6[8.換貨新單 EXCHANGE]
        T7[11.拆單 SPLIT]
        T8[13.補貨 REPLENISH]
        T9[14.重出 RESEND]
        T10[41.平台換貨 API_EXCHANGE]
    end

    subgraph "退貨類 REFUND"
        R1[9.退貨 REFUND]
        R2[10.物退 SHIP_REFUND]
        R3[15.換退 EXCHANGE_REFUND]
        R4[16.門市退 STORE_REFUND]
        R5[17.宅退 HOME_REFUND]
        R6[42.平台換退 API_EXCHANGE_REFUND]
    end

    subgraph "特殊類"
        S1[3.瑕疵 DEFECT]
        S2[4.借出 BORROW]
        S3[12.發票 INVOICE]
        S4[21.門市進貨 POS_PURCHASE]
        S5[22.轉倉 TRANSPORT]
        S6[61.新品 NEW_ITEM]
        S7[62.補貨 OLD_ITEM]
        S8[71.退倉 RETURN_WAREHOUSE]
        S9[81.轉倉出貨 CHG_WAREHOUSE]
        S10[100.門市銷售 POS]
    end`),
  ], token);

  console.log('\n🎉 Mermaid 架構圖全部上傳完成！');
  console.log(`📍 架構圖集：${mainPage.url}`);
}

main().catch(err => {
  console.error('❌ Error:', err.message || err);
  process.exit(1);
});
