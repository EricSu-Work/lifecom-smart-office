/**
 * 建立 Notion 頁面：BlackDog → 純 API 引擎架構
 * Parent: 架構圖集（Mermaid）31fd2a91c73281129450c42aed3e0902
 */
const { TOKENS } = require('./notion_client.js');
const https = require('https');

const PARENT_PAGE = '31fd2a91-c732-8112-9450-c42aed3e0902'; // 架構圖集

function request(token, method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;
    const headers = {
      'Authorization': 'Bearer ' + token,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    };
    if (data) headers['Content-Length'] = Buffer.byteLength(data, 'utf8');
    const req = https.request({ hostname: 'api.notion.com', path, method, headers }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(new Error(d)); } });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function text(content, opts = {}) {
  const t = { type: 'text', text: { content } };
  if (opts.bold) t.annotations = { ...t.annotations, bold: true };
  if (opts.code) t.annotations = { ...t.annotations, code: true };
  if (opts.link) t.text.link = { url: opts.link };
  return t;
}

function heading2(txt) {
  return { type: 'heading_2', heading_2: { rich_text: [text(txt)] } };
}
function heading3(txt) {
  return { type: 'heading_3', heading_3: { rich_text: [text(txt)] } };
}
function paragraph(...parts) {
  return { type: 'paragraph', paragraph: { rich_text: parts } };
}
function bullet(...parts) {
  return { type: 'bulleted_list_item', bulleted_list_item: { rich_text: parts } };
}
function code(content, language = 'mermaid') {
  return { type: 'code', code: { rich_text: [text(content)], language } };
}
function callout(emoji, ...parts) {
  return { type: 'callout', callout: { icon: { type: 'emoji', emoji }, rich_text: parts } };
}
function divider() {
  return { type: 'divider', divider: {} };
}
function table(headers, rows) {
  const toCell = s => [text(String(s))];
  const headerRow = { type: 'table_row', table_row: { cells: headers.map(toCell) } };
  const dataRows = rows.map(r => ({ type: 'table_row', table_row: { cells: r.map(toCell) } }));
  return {
    type: 'table',
    table: {
      table_width: headers.length,
      has_column_header: true,
      has_row_header: false,
      children: [headerRow, ...dataRows],
    },
  };
}

const mermaidArch = `graph TB
    subgraph "Frontend Clients（自由選擇）"
        F1["🛒 Shopify Storefront / Hydrogen / Liquid"]
        F2["⚛️ 現有 React SPA（持續利用）"]
        F3["📱 Mobile App / React Native / Flutter"]
        F4["🏪 品牌白牌前台 / Next.js / Nuxt / Remix"]
        F5["🔌 第三方系統 / 客戶自有 ERP / POS"]
    end

    subgraph "API Gateway Layer"
        GW["🔐 API Gateway\\nAuth（JWT/OAuth2）| Rate Limit | Versioning\\nMulti-tenant Routing"]
    end

    subgraph "BlackDog API Engine"
        subgraph "API Controllers"
            A1["/api/v2/orders"]
            A2["/api/v2/products"]
            A3["/api/v2/inventory"]
            A4["/api/v2/shipping"]
            A5["/api/v2/customers"]
            A6["/api/v2/reports"]
        end

        subgraph "Service Layer"
            SV1[AuthService]
            SV2[MarketService]
            SV3[PurchaseService]
            SV4[ShipReturnService]
        end

        subgraph "ERPBD 核心業務（不動）"
            E1["orderFlow/ 訂單流程"]
            E2["platform/ 17 平台串接"]
            E3["warehouse/ 倉儲管理"]
            E4["logistics/ 物流配送"]
            E5["orderRules/ 風控規則"]
            E6["schedule/ 排程"]
            E7["reports/ 報表"]
            E8["scan/ 掃碼作業"]
        end
    end

    subgraph "External Integrations"
        EX1["鼎新 Digiwin ERP"]
        EX2["BizWMS 倉儲"]
        EX3["17 電商平台"]
        EX4["物流商"]
        EX5["發票系統"]
    end

    subgraph "Database Layer"
        DB1[("lifeerp MySQL")]
        DB2[("bizpro_wms MySQL")]
        DB3[("lifemall MySQL")]
        DB4[("MongoDB Logs")]
    end

    F1 & F2 & F3 & F4 & F5 -->|REST / GraphQL| GW
    GW --> A1 & A2 & A3 & A4 & A5 & A6
    A1 & A2 & A3 & A4 & A5 & A6 --> SV1 & SV2 & SV3 & SV4
    SV1 & SV2 & SV3 & SV4 --> E1 & E2 & E3 & E4 & E5 & E6 & E7 & E8
    E1 & E2 & E3 & E4 & E5 & E6 & E7 & E8 --> DB1 & DB2 & DB3 & DB4
    E2 --> EX3
    E3 --> EX2
    E4 --> EX4
    E1 --> EX1
    E7 --> EX5`;

const mermaidCompare = `graph LR
    subgraph "現狀（Monolith）"
        direction TB
        NOW_FE["Blade + React SPA\\n（綁定 Laravel）"]
        NOW_RT["routes/web.php\\nroutes/frontend.php\\nroutes/api.php"]
        NOW_BD["ERPBD 業務邏輯"]
        NOW_DB[("MySQL + MongoDB")]
        NOW_FE --> NOW_RT --> NOW_BD --> NOW_DB
    end

    subgraph "新架構（API Engine）"
        direction TB
        NEW_FE["任意前台框架\\nReact / Shopify / Mobile / ..."]
        NEW_GW["API Gateway\\nJWT + Rate Limit + Versioning"]
        NEW_API["REST API Controllers\\n（統一 /api/v2/*）"]
        NEW_BD["ERPBD 業務邏輯\\n（不動）"]
        NEW_DB[("MySQL + MongoDB")]
        NEW_FE -->|HTTP| NEW_GW --> NEW_API --> NEW_BD --> NEW_DB
    end

    NOW_FE -.->|演進| NEW_FE
    NOW_BD -.->|保留| NEW_BD`;

async function main() {
  const token = TOKENS.personal;

  const children = [
    callout('🎯', text('核心決策：將 BlackDog 推回純 API 引擎，前台框架完全解耦。現有 React SPA 不廢棄，作為第一個 API consumer 持續利用。', { bold: true })),
    paragraph(text('決策日期：2026-03-11 | 狀態：規劃中')),
    divider(),

    heading2('完整架構圖'),
    paragraph(text('BlackDog 作為純 API Engine，所有前台 consumer 透過 API Gateway 接入。')),
    code(mermaidArch, 'mermaid'),
    divider(),

    heading2('現狀 vs 新架構對照'),
    code(mermaidCompare, 'mermaid'),
    divider(),

    heading2('遷移要點'),
    table(
      ['項目', '說明'],
      [
        ['ERPBD 層', '不動。36 個模組 + 250 檔案是核心價值'],
        ['現有 React SPA', '保留，改打標準 API endpoint（第一個 consumer）'],
        ['Blade Templates', '逐步淘汰，業務邏輯下沉到 ERPBD'],
        ['認證', '已有 JWT（auth.jwt），擴充 OAuth2 for 第三方'],
        ['API 版本', '統一 /api/v2/*，未來 v3 不破壞 v2'],
        ['routes/frontend.php', '邏輯提取到 Service Layer，路由廢棄'],
        ['routes/web.php', '僅保留 OAuth callback / Swagger'],
        ['Multi-tenant', '現有 Eccore/ 46 Info 類已支援，API Gateway 層統一路由'],
      ]
    ),
    divider(),

    heading2('前台選型自由度'),
    table(
      ['場景', '推薦方案', '理由'],
      [
        ['品牌官網', 'Shopify Hydrogen / Storefront API', 'Shopify 生態，SEO 友善'],
        ['LifeCOM 自營後台', '現有 React SPA（漸進升級）', '最低成本，已存在'],
        ['Mobile App', 'React Native', '前端團隊技術棧一致'],
        ['品牌白牌', 'Next.js / Remix', 'SSR + 高自訂'],
        ['B2B 整合', '純 API（無前台）', 'Digiwin/客戶 ERP 直串'],
      ]
    ),
    divider(),

    heading2('架構優勢'),
    bullet(text('前台技術棧自由', { bold: true }), text(' — 不再被 Laravel Blade 綁定，任何框架都能接')),
    bullet(text('團隊分工明確', { bold: true }), text(' — 前端不碰 PHP，後端專注 API 品質')),
    bullet(text('多通路統一', { bold: true }), text(' — Shopify、Mobile、品牌官網、B2B 都是 API client')),
    bullet(text('ERPBD 核心不動', { bold: true }), text(' — 17 平台串接 + 倉儲物流 + 風控引擎完整保留')),
    bullet(text('CVS App 是活案例', { bold: true }), text(' — Shopify checkout + Carrier Service API，已驗證此架構可行')),
    divider(),

    heading3('關鍵考量'),
    bullet(text('API 邊界重新設計', { bold: true }), text(' — 現有 24 API controllers 是內部 SPA 設計，需加 API Gateway facade')),
    bullet(text('Blade 邏輯下沉', { bold: true }), text(' — routes/frontend.php 和 Blade template 中的商業邏輯要移到 ERPBD 層')),
    bullet(text('認證切換', { bold: true }), text(' — 從 Laravel session-based 切到純 token-based（JWT/OAuth2）')),
    bullet(text('文件化', { bold: true }), text(' — API 需要 OpenAPI/Swagger spec，第三方才能串接')),
  ];

  // Notion API max 100 children per request
  const res = await request(token, 'POST', '/v1/pages', {
    parent: { page_id: PARENT_PAGE },
    icon: { type: 'emoji', emoji: '🏗️' },
    properties: {
      title: { title: [{ text: { content: 'BlackDog → 純 API 引擎架構（2026-03-11 定案）' } }] },
    },
    children,
  });

  if (res.id) {
    console.log(`✅ 頁面建立成功: https://www.notion.so/${res.id.replace(/-/g, '')}`);
  } else {
    console.error('❌ 建立失敗:', JSON.stringify(res, null, 2));
  }
}

main().catch(e => { console.error('❌', e); process.exit(1); });
