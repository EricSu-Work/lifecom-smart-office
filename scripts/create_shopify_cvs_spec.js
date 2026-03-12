/**
 * create_shopify_cvs_spec.js
 * 在 Notion 建立「LifeCOM On Shopify — CVS 超商選店 App」專案規格文件
 * 父頁面：LifeCOM Works (4bc121cd-b560-4fb9-acc8-08a9887c42ad)
 */
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const TOKEN = fs.readFileSync(
  path.join(process.env.USERPROFILE, '.config/notion/api_key'), 'utf8'
).trim();

const PARENT_PAGE_ID = '4bc121cd-b560-4fb9-acc8-08a9887c42ad'; // LifeCOM Works

function notionRequest(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const headers = {
      'Authorization': 'Bearer ' + TOKEN,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
    };
    const req = https.request({ hostname: 'api.notion.com', path: endpoint, method, headers }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Helper: heading block
function h1(text) {
  return { object: 'block', type: 'heading_1', heading_1: { rich_text: [{ type: 'text', text: { content: text } }] } };
}
function h2(text) {
  return { object: 'block', type: 'heading_2', heading_2: { rich_text: [{ type: 'text', text: { content: text } }] } };
}
function h3(text) {
  return { object: 'block', type: 'heading_3', heading_3: { rich_text: [{ type: 'text', text: { content: text } }] } };
}
function para(text) {
  return { object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: text } }] } };
}
function bullet(text) {
  return { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ type: 'text', text: { content: text } }] } };
}
function numbered(text) {
  return { object: 'block', type: 'numbered_list_item', numbered_list_item: { rich_text: [{ type: 'text', text: { content: text } }] } };
}
function code(text, lang = 'plain text') {
  return { object: 'block', type: 'code', code: { rich_text: [{ type: 'text', text: { content: text } }], language: lang } };
}
function divider() {
  return { object: 'block', type: 'divider', divider: {} };
}
function callout(text, emoji = '📌') {
  return {
    object: 'block', type: 'callout',
    callout: { rich_text: [{ type: 'text', text: { content: text } }], icon: { type: 'emoji', emoji } }
  };
}

async function main() {
  const blocks = [
    callout('⏳ 狀態：SPEC 草稿 — 等待 Eric Review 後開工', '🚦'),
    divider(),

    h2('📌 專案概述'),
    para('打造一個 Shopify Public App，讓使用 Shopify 的電商客戶可以在購物車選擇超商取貨門市（7-11 / 全家），並將選擇結果回寫至 Shopify Order Metafield，再同步至 LifeCOM TMS 系統。'),
    para('這是「LifeCOM On Shopify」整體戰略的 Phase 1，目標為優先解決台灣市場超商選店的急迫缺口，並作為後續更多整合的基礎。'),
    divider(),

    h2('🎯 Phase 1 功能範圍'),
    h3('✅ 包含'),
    bullet('購物車頁面「選擇超商」按鈕（Theme App Extension）'),
    bullet('全家超商選店：整合 MCVS 轉址服務（ec.mcvs.com.tw）'),
    bullet('7-11 超商選店：整合 7-11 對應轉址服務（規格 TBD）'),
    bullet('Callback 接收 → Session 比對 → Cart Attributes 寫入'),
    bullet('Checkout 頁顯示已選取貨門市（Checkout UI Extension）'),
    bullet('訂單成立後寫入 Shopify Order Metafield（namespace: lifecom_cvs）'),
    bullet('App Admin 設定頁：綁定運送方式、MCVS 站台設定'),
    bullet('Public App 上架 Shopify App Store（含 GDPR webhook、隱私政策）'),
    bullet('容器化部署：LifeCOM K8s cluster'),
    h3('❌ Phase 1 不包含'),
    bullet('萊爾富 / OK mart 選店（Phase 2 補上）'),
    bullet('物流廠商訂單拋送（Phase 2：與 TMS TOWMS 深度整合）'),
    bullet('退貨 / 換店流程'),
    bullet('Shopify Flow 整合'),
    divider(),

    h2('🏗️ 技術架構'),
    h3('Tech Stack'),
    bullet('App Framework：Shopify CLI 3 + Remix（@shopify/shopify-app-remix）'),
    bullet('Backend：Node.js / Remix，TypeScript'),
    bullet('Database：PostgreSQL（merchant 設定、session token、store 快取）'),
    bullet('Cache：Redis（短暫 session token，TTL 30 分鐘）'),
    bullet('Frontend（Admin UI）：Shopify Polaris + App Bridge'),
    bullet('Cart 整合：Theme App Extension（Liquid + vanilla JS）'),
    bullet('Checkout 整合：Checkout UI Extension（React + Shopify UI Extensions）'),
    bullet('部署：Docker 容器 → LifeCOM K8s cluster（需 HTTPS Ingress）'),
    divider(),

    h3('選店流程（全家 MCVS）'),
    code(
`1. 購物車頁點「選擇超商」
   → 開新視窗，導向 MCVS：
     https://ec.mcvs.com.tw/webservice/cvsemap.php
       ?cvsname={商家站台}
       &cvsid={session_token}      ← App 生成 UUID
       &cvstemp={cart_token}       ← Shopify Cart Token（用來綁定購物車）
       &charcode=utf8
       &url=https://app.lifecom.com/cvs/callback/family

2. 客戶在 MCVS 頁面選完門市
   → MCVS GET callback：
     https://app.lifecom.com/cvs/callback/family
       ?cvsspot=F004698
       &name=全家大發店
       &addr=苗栗縣...
       &tel=037265563
       &cvsnum=DD27
       &cvsid={session_token}
       &cvstemp={cart_token}

3. App Backend：
   → 驗證 session_token 有效
   → 用 cart_token 呼叫 Shopify Storefront API 更新 Cart Attributes：
     pickup_provider = "family"
     pickup_store_spot = "F004698"
     pickup_store_name = "全家大發店"
     pickup_store_addr = "苗栗縣..."
     pickup_store_tel = "037265563"
   → 回傳 HTML 頁面執行 window.opener.postMessage('cvs_selected', '*')
   → 新視窗自動關閉

4. Cart 頁 JS：
   → 收到 postMessage
   → 重新讀取 Cart Attributes 顯示：「✅ 已選：全家大發店」
   → 解鎖「前往結帳」按鈕

5. Checkout 頁（Checkout UI Extension）：
   → 從 Cart Attributes 讀取，顯示取貨門市確認資訊

6. 訂單成立（orders/create webhook）：
   → App Backend 寫入 Order Metafield：
     namespace: lifecom_cvs
     key: pickup_store
     type: json
     {
       "provider": "family",
       "spot": "F004698",
       "name": "全家大發店",
       "addr": "苗栗縣...",
       "tel": "037265563",
       "cvsnum": "DD27",
       "selected_at": "ISO8601"
     }`, 'plain text'),
    divider(),

    h3('7-11 選店流程'),
    callout('7-11 轉址服務規格待確認（Eric 提供後補入）。預計與全家流程相同架構，Callback URL 改為 /cvs/callback/711。', '⚠️'),
    divider(),

    h2('💾 資料模型'),
    h3('PostgreSQL Tables'),
    code(
`-- Merchant 安裝紀錄
CREATE TABLE merchants (
  id           SERIAL PRIMARY KEY,
  shop_domain  VARCHAR(255) UNIQUE NOT NULL,
  access_token TEXT NOT NULL,
  created_at   TIMESTAMP DEFAULT NOW(),
  updated_at   TIMESTAMP DEFAULT NOW()
);

-- Merchant 設定
CREATE TABLE merchant_settings (
  id               SERIAL PRIMARY KEY,
  merchant_id      INT REFERENCES merchants(id),
  provider         VARCHAR(50),   -- 'family' | '711'
  mcvs_cvsname     VARCHAR(255),  -- 全家：商家網址
  enabled_shipping TEXT[],        -- 綁定的運送方式名稱
  created_at       TIMESTAMP DEFAULT NOW()
);

-- CVS 選店 Session（短暫，配合 Redis TTL）
CREATE TABLE cvs_sessions (
  session_token VARCHAR(64) PRIMARY KEY,
  cart_token    VARCHAR(255) NOT NULL,
  shop_domain   VARCHAR(255) NOT NULL,
  provider      VARCHAR(50),
  status        VARCHAR(20) DEFAULT 'pending', -- pending | selected | expired
  store_data    JSONB,
  created_at    TIMESTAMP DEFAULT NOW(),
  expires_at    TIMESTAMP
);`, 'sql'),

    h3('Shopify Order Metafield'),
    code(
`namespace: "lifecom_cvs"
key:       "pickup_store"
type:      "json"
value: {
  "provider":     "family",       // "family" | "711"
  "spot":         "F004698",      // 門市代碼
  "name":         "全家大發店",
  "addr":         "苗栗縣苗栗市...",
  "tel":          "037265563",
  "cvsnum":       "DD27",
  "selected_at":  "2026-03-05T03:21:00Z"
}`, 'json'),
    divider(),

    h2('🐳 K8s 部署架構'),
    bullet('Namespace：lifecom-shopify'),
    bullet('Deployment：shopify-cvs-app（Remix/Node.js，最少 2 replicas）'),
    bullet('Service：ClusterIP + Ingress（需 TLS 憑證，Shopify 要求 HTTPS）'),
    bullet('ConfigMap：環境變數（SHOPIFY_API_KEY, SHOPIFY_API_SECRET, APP_URL...）'),
    bullet('Secret：Shopify API Secret、DB 密碼、Redis 密碼'),
    bullet('PostgreSQL：使用現有 LifeCOM DB cluster 或新建 StatefulSet'),
    bullet('Redis：新建 Redis Deployment 或用現有 instance'),
    callout('App URL 需要固定域名（e.g. shopify-cvs.lifecom.com.tw），Shopify Partner 後台設定 App URL 與 Redirect URLs 必須用這個。', '🔑'),
    divider(),

    h2('📦 開發工作包'),
    numbered('W1（2天）：Shopify Partner 帳號設定、App 架手架（Remix）、DB schema、K8s 基礎部署'),
    numbered('W2（2天）：全家 MCVS callback 串接、Session 管理、Cart Attributes 更新'),
    numbered('W3（2天）：Theme App Extension — Cart 頁選店按鈕 + postMessage 接收 + 已選店鋪顯示'),
    numbered('W4（1天）：Checkout UI Extension — 顯示取貨門市確認'),
    numbered('W5（1天）：orders/create webhook → Order Metafield 寫入'),
    numbered('W6（2天）：7-11 選店串接（規格確認後）'),
    numbered('W7（2天）：App Admin 設定頁（Polaris UI）'),
    numbered('W8（1天）：Shopify App Store 送審文件（隱私政策、GDPR webhook、App listing）'),
    para('總估：約 13 個工作天（不含 Shopify 審核等待時間，約 1-5 個工作日）'),
    divider(),

    h2('📋 開放問題 / 待確認'),
    bullet('【必須】7-11 超商選店轉址服務規格（對應 MCVS 的 endpoint + 參數 + callback 格式）'),
    bullet('【必須】Shopify Partner account — 由誰申請？App 掛在哪個 Partner 組織下？'),
    bullet('【必須】App 域名確認：shopify-cvs.lifecom.com.tw 或其他？'),
    bullet('【確認】K8s cluster：現有 PostgreSQL / Redis 可用，或需新建？'),
    bullet('【確認】全家 MCVS cvsname 參數：使用 LifeCOM 統一站台，還是每個商家自己的？'),
    bullet('【後續】TMS TOWMS 串接規格（Phase 2）'),
    divider(),

    h2('🔗 相關連結'),
    bullet('MCVS 全家超商選店服務：http://ec.mcvs.com.tw/webservice/cvsemap.php'),
    bullet('Shopify App 開發文件：https://shopify.dev/docs/apps'),
    bullet('Checkout UI Extensions：https://shopify.dev/docs/api/checkout-ui-extensions'),
    bullet('Theme App Extensions：https://shopify.dev/docs/apps/online-store/theme-app-extensions'),
  ];

  // Notion API limits: 100 blocks per request
  // Create page first with first 100 blocks, then append rest
  const firstBatch  = blocks.slice(0, 100);
  const secondBatch = blocks.slice(100);

  console.log(`建立頁面（${blocks.length} 個 blocks）...`);

  const page = await notionRequest('POST', '/v1/pages', {
    parent: { type: 'page_id', page_id: PARENT_PAGE_ID },
    icon: { type: 'emoji', emoji: '🛒' },
    properties: {
      title: {
        title: [{ type: 'text', text: { content: 'LifeCOM On Shopify — CVS 超商選店 App SPEC' } }]
      }
    },
    children: firstBatch,
  });

  if (page.object === 'error') {
    console.error('❌ 建立失敗:', JSON.stringify(page, null, 2));
    process.exit(1);
  }

  console.log('✅ 頁面建立成功:', page.url);

  // Append remaining blocks if any
  if (secondBatch.length > 0) {
    console.log(`補充 ${secondBatch.length} 個 blocks...`);
    const append = await notionRequest('PATCH', `/v1/blocks/${page.id}/children`, {
      children: secondBatch,
    });
    if (append.object === 'error') {
      console.error('⚠️ 補充 blocks 失敗:', JSON.stringify(append, null, 2));
    } else {
      console.log('✅ 全部 blocks 寫入完成');
    }
  }

  console.log('\n🔗 Notion 頁面 URL:', page.url);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
