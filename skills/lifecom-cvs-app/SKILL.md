---
name: lifecom-cvs-app
description: "CVS 超商選店 App 專案背景+架構（SubAgent 必讀）| 任何 CVS App 相關開發任務啟動時"
---

# LifeCOM CVS 超商選店 App — 完整開發 Context

## 專案 SPEC

- **Notion 頁面**：https://www.notion.so/LifeCOM-On-Shopify-CVS-App-SPEC-31ad2a91c732815fa945c17f30023336
- **Phase 1 定位**：Shopify Public App，全家 + 7-11 超商選店，上架 Shopify App Store
- **部署環境**：LifeCOM K8s cluster，namespace `lifecom-shopify`

## MCVS 超商選店規格

### 全家（FamilyMart）
```
MCVS Endpoint: http://ec.mcvs.com.tw/webservice/cvsemap.php
參數:
  cvsname  = 門市帳號（e.g. 0123456005 = 測試帳號）
  cvsid    = session_token（UUID，App 自產，用來 callback 比對）
  cvstemp  = shopify_cart_token（連結門市與購物車）
  charcode = utf8（必帶，否則中文亂碼）
  url      = https://cvs.licodes.net/cvs/callback/family
  type     = 15（日翊店配，全家用這個）

Callback（GET）返回欄位:
  cvsspot  = 門市代碼（e.g. F004698）
  name     = 門市名稱
  addr     = 門市地址
  tel      = 門市電話
  cvsnum   = 服務編號
  cvsid    = 原本的 session_token（回傳比對）
  cvstemp  = 原本的 cart_token（回傳比對）
```

### 7-11
```
同樣走 MCVS，type = 13
Callback URL: /cvs/callback/711
```

## Cart Attributes（前端寫入）
```
pickup_provider      = "family" | "711"
pickup_delivery_type = "cvs" | "home"
pickup_store_spot    = "F004698"
pickup_store_name    = "全家台中逢甲店"
pickup_store_addr    = "台中市..."
pickup_store_tel     = "0421234567"
```

## Order Metafield（下單後 webhook 寫入）
```
namespace: lifecom_cvs
key:       pickup_store
type:      json
value: {
  "provider": "family",
  "spot": "F004698",
  "name": "全家台中逢甲店",
  "addr": "台中市...",
  "tel": "0421234567",
  "cvsnum": "DD27",
  "selected_at": "2026-03-05T03:21:00Z"
}
```

---

## 專案結構

```
C:\Users\Eric\dev\shopify-cvs\
├── app/                           # Remix v2 app
│   ├── routes/
│   │   ├── auth.$.tsx             # OAuth flow
│   │   ├── auth.login/            # Login
│   │   ├── cvs.select.tsx         # 導向 MCVS 選門市
│   │   ├── cvs.callback.family.tsx  # 全家 callback 處理
│   │   ├── cvs.callback.711.tsx     # 7-11 callback 處理
│   │   ├── app._index.tsx         # Embedded Admin 首頁
│   │   ├── app.settings.tsx       # 商家設定頁
│   │   ├── app.additional.tsx     # 額外頁面
│   │   ├── webhooks.orders-create.tsx  # 訂單 webhook → Metafield
│   │   ├── webhooks.app.uninstalled.tsx
│   │   ├── webhooks.app.scopes_update.tsx
│   │   └── health.tsx             # Health check
│   ├── lib/
│   │   ├── db.server.ts           # SQLite (better-sqlite3)
│   │   ├── better-sqlite3-session-storage.server.ts  # Session storage
│   │   ├── session-store.server.ts
│   │   ├── shopify-admin.server.ts  # Admin API helpers
│   │   ├── storefront.server.ts   # Storefront API
│   │   └── mcvs.server.ts        # MCVS 封裝
│   ├── shopify.server.ts          # Shopify App config
│   └── root.tsx
├── extensions/
│   ├── theme-cvs/                 # Theme App Extension（Cart 頁選店）
│   │   ├── blocks/cvs_picker.liquid
│   │   ├── assets/cvs-picker.js
│   │   └── assets/logo-*.png
│   ├── checkout-cvs/              # Checkout UI Extension
│   │   ├── shopify.extension.toml
│   │   ├── package.json + pnpm-lock.yaml
│   │   └── src/index.tsx
│   ├── cvs-delivery/              # [W9 新增] Delivery Customization Function
│   │   ├── shopify.extension.toml
│   │   ├── package.json + pnpm-lock.yaml
│   │   └── src/run.js + run.graphql
│   └── cvs-payment/               # [W9 新增] Payment Customization Function
│       ├── shopify.extension.toml
│       ├── package.json + pnpm-lock.yaml
│       └── src/run.js + run.graphql
├── migrations/
│   ├── 001_initial.sql
│   ├── 002_add_unique_constraint.sql
│   └── 003_cod_settings.sql       # [W9 新增]
├── k8s/                           # Kubernetes manifests
├── prisma/                        # Prisma stub（Shopify CLI 要求）
├── data/app.db                    # SQLite DB 檔案
├── shopify.app.toml               # Shopify App config
├── shopify.web.toml               # Web config
├── package.json                   # Root package
├── pnpm-workspace.yaml            # pnpm workspace config
├── .npmrc                         # npm registry config
└── vite.config.ts
```

---

## 開發環境重要設定（血淚教訓）

### pnpm Workspace 結構

- Root `package.json` 有 `"workspaces": {"packages": ["extensions/*"]}`
- `pnpm-workspace.yaml` 存在（內容可能需要修正）
- `.npmrc` 有 `@shopify:registry=https://registry.npmjs.org` 和 `pnpm.allow-build=better-sqlite3,sqlite3`

### Extension 依賴安裝規則（超重要！）

**每個 extension 是獨立的 package，需要在自己的目錄內獨立安裝依賴：**

```powershell
# ❌ 錯：從 root 跑 pnpm install（會被 workspace 吃掉）
cd C:\Users\Eric\dev\shopify-cvs
pnpm install  # 只裝 root 的依賴

# ✅ 對：進 extension 目錄，用 --ignore-workspace 安裝
cd extensions\cvs-delivery
pnpm install --ignore-workspace
```

- `checkout-cvs` 有自己的 `pnpm-lock.yaml` 和 `node_modules`（之前已正確安裝）
- 新 extension 必須比照辦理，各自產生 `pnpm-lock.yaml`

### Shopify Function Extension 必要結構

Shopify Functions（如 Delivery/Payment Customization）需要編譯成 **WebAssembly**：

```
extensions/cvs-delivery/
├── shopify.extension.toml      # 必須有 [extensions.build] 區塊
├── package.json                # 必須有 @shopify/shopify_function + javy 依賴
├── pnpm-lock.yaml              # pnpm install --ignore-workspace 產生
├── node_modules/               # 必須存在
└── src/
    ├── run.js                  # export function run(input) { ... }
    └── run.graphql             # query RunInput { ... }
```

**shopify.extension.toml 正確格式：**
```toml
api_version = "2026-01"

[[extensions]]
name = "CVS Delivery Customization"
handle = "cvs-delivery-customization"
type = "function"

  [[extensions.targeting]]
  target = "purchase.delivery-customization.run"
  input_query = "src/run.graphql"
  export = "run"

  [extensions.build]
  command = "npx shopify app function build"
  path = "dist/function.wasm"
```

**package.json 正確格式：**
```json
{
  "dependencies": {
    "@shopify/shopify_function": "^2.0.0",
    "javy": "^0.1.0"
  }
}
```

> ⚠️ `javy` 最新版只到 `0.1.2`，不要寫 `^0.3.0`（不存在）

### GraphQL Input Query 命名

- JS Function 的 GraphQL query operation name 要用 `RunInput`（Shopify 慣例）
- 檔名放在 `src/run.graphql`
- toml 裡 `input_query = "src/run.graphql"`

### Checkout UI Extension（非 Function）

- 這是 React 元件，不需要 Wasm 編譯
- `package.json` 依賴 `@shopify/ui-extensions`
- Shopify CLI 會自動 bundle（esbuild）

### Dev Server 啟動

```powershell
cd C:\Users\Eric\dev\shopify-cvs
pnpm dev --tunnel-url https://cvs.licodes.net:3456
```

- Cloudflare Named Tunnel ID: `4723eeb4`
- Domain: `cvs.licodes.net`
- Shopify Dev Store: `lifecom-704.myshopify.com`
- Shopify Client ID: `53f4f9d783fd5ee145a8d18387294886`
- Shopify Scopes: `read_orders,write_orders,read_shipping,write_shipping`

### Shopify CLI 版本

- `3.91.1`（透過 pnpm shopify version 確認）

### Prisma Stub

- Shopify CLI 3.91 要求有 Prisma，但 App 用 `better-sqlite3` 直接操作
- 用 stub schema + `prisma.config.ts` 解決（不要刪）

---

## DB Schema（SQLite）

```sql
-- merchants
CREATE TABLE merchants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shop_domain TEXT UNIQUE NOT NULL,
  access_token TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- merchant_settings
CREATE TABLE merchant_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  merchant_id INTEGER REFERENCES merchants(id),
  provider TEXT,           -- 'family' | '711'
  mcvs_cvsname TEXT,       -- MCVS 帳號
  enabled INTEGER DEFAULT 1,
  cod_enabled INTEGER DEFAULT 0,   -- [W9 新增] 取貨付款
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(merchant_id, provider)
);

-- cvs_sessions
CREATE TABLE cvs_sessions (
  session_token TEXT PRIMARY KEY,
  cart_token TEXT NOT NULL,
  shop_domain TEXT NOT NULL,
  provider TEXT,
  status TEXT DEFAULT 'pending',  -- pending | selected | expired
  store_data TEXT,                -- JSON string
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT
);
```

---

## 開發進度

| Week | 內容 | 狀態 |
|------|------|------|
| W1-W5 | Backend, DevOps, Storefront, Theme Ext, Checkout Ext, Webhook | ✅ |
| W6 | 7-11 串接 | ✅（同 MCVS，type=13） |
| W7 | Admin 設定頁 | ✅ |
| W8 | App Store 送審 | ⬜（W9 先做） |
| W9 | Delivery Customization + Payment Customization + Checkout 重構 | 🔄 BUILD 中 |

---

## W9 重點（當前開發）

### 問題

Checkout 頁沒有顯示超商取貨配送選項（Cart Attributes 只是資料，不是 Shopify 配送方式）。

### 方案

- **不用 Carrier Service API**（需 Advanced plan $399/mo，客戶不全是）
- 改用 **Shopify Functions**（Basic plan $39/mo 即可）
- 商家手動建 shipping rate，App 用 Function 控制顯隱

### 四個模組

1. **Delivery Customization Function**（`extensions/cvs-delivery/`）→ 根據 cart attribute 隱藏不相關配送
2. **Payment Customization Function**（`extensions/cvs-payment/`）→ COD 邏輯
3. **Checkout UI Extension 改 target** → `shipping-option-list.render-after`
4. **Admin Settings 擴充** → 配送教學 + 驗證按鈕 + COD toggle

### SPEC 檔案

`docs/cvs-w9-carrier-service-spec.md`（完整 SPEC 含 VERIFY 清單）

---

## DLC 開發流程

遵循 AI-DLC 五階段：**SPEC → REVIEW → BUILD → VERIFY → DEPLOY**

- **REVIEW 通過**：Eric 說「OK 可以做」才進 BUILD
- **VERIFY 必做**：對照 SPEC 的 VERIFY 清單逐項驗證
- **每個 W 完成後**：更新 Notion 進度

---

## 已知環境問題

1. **npm 在此機器壞掉**：`npm install` 會報 `Cannot read properties of null (reading 'matches')`，一律用 pnpm
2. **pnpm-workspace.yaml 內容可能需修正**：目前內容是 `onlyBuiltDependencies` 開頭的列表
3. **Javy 首次 build 很慢**：需要下載 WASM binary，可能花 2-5 分鐘
4. **Shopify CLI generate extension 的 graphql-codegen 會失敗**：npm 環境問題，codegen 步驟失敗但不影響 extension 功能
5. **FortiWall 環境**：某些外部連線可能被擋，測試時注意

---

## 關聯 Skills

- `capabilities/skill-remix/` → App 開發
- `capabilities/skill-react/` → UI Extensions
- `capabilities/skill-k8s/` → K8s 部署
- `capabilities/skill-github/` → PR / CI 流程
- `capabilities/skill-logging/` → Log 標準

---

## ⚠️ Shopify Function 血淚坑（2026-03-11 整理）

> 這段是給未來所有 Shopify Function 開發的累積教訓，每次踩坑都要更新。

### 坑 1：Delivery Customization output key 格式隨 API 版本改變

```js
// ❌ API 2024-10 以前的舊格式（現在會 silent fail）
return { operations: [
  { rename: { deliveryOptionHandle: handle, title: newTitle } },
  { hide: { deliveryOptionHandle: handle } }
] }

// ✅ API 2026-01 新格式
return { operations: [
  { deliveryOptionRename: { deliveryOptionHandle: handle, title: newTitle } },
  { deliveryOptionHide: { deliveryOptionHandle: handle } }
] }
```

**症狀**：Function 沒有任何效果，也沒有 errorHistory。  
**排查**：先確認 API version，再比對 schema 的 Operation type（用 `npx shopify app function schema` 取得）。

---

### 坑 2：Function deploy ≠ Function 啟用

**deploy 只是上傳 WASM 到 Shopify 平台**，不代表 Function 在商店裡啟用。

必須另外建立 admin resource：

```js
// 建立 Delivery Customization（只需做一次，通常在 app install webhook 或設定頁）
const mutation = `
  mutation {
    deliveryCustomizationCreate(deliveryCustomization: {
      functionId: "${FUNCTION_ID}"
      title: "CVS Delivery Customization"
      enabled: true
    }) {
      deliveryCustomization { id }
      userErrors { field message }
    }
  }
`;
```

**驗證**：Shopify Admin → Settings → Shipping → 配送自訂項目，應看到剛建立的項目。  
**注意**：`functionId` 是 Function 的 UUID（非 gid），從 `shopifyFunctions` query 取得。

---

### 坑 3：Cloud Runtime 永遠呼叫 WASM export `run`（與 TOML export 欄位無關）

這是最難發現的坑，**症狀是 Function 沒有任何效果，也沒有 errorHistory**。

**Shopify Cloud Runtime 的行為（2026-03-11 實測確認）**：
- **Cloud Runtime 永遠呼叫 WASM export 名為 `run` 的函數**
- TOML 的 `export` 欄位**只影響本地 CLI function-runner 測試**（`--export <name>`），不影響 cloud 執行
- Shopify 官方 docs 的所有範例也都是 `export function run(input)` + `export = "run"`

**正確格式（唯一對的方式）**：

```toml
# shopify.extension.toml
[[extensions.targeting]]
target = "cart.delivery-options.transform.run"
export = "run"   # ← 只能是 "run"，不是 kebab-case 的 target 名稱
```

```js
// src/index.js
export function run(input) {   // ← 必須叫 run
  return { operations: [...] }
}
```

**為什麼容易踩**：
- Shopify GraphQL schema 裡 MutationRoot field 是 `cartDeliveryOptionsTransformRun`（這是 API type 名稱，和 WASM export 無關）
- 如果寫成 `export function cartDeliveryOptionsTransformRun(input)` + `export = "cart-delivery-options-transform-run"`，WASM 裡就沒有 `run` export → cloud 找不到進入點 → 靜默失敗
- **local function-runner test 還是可以通過**（因為你手動指定 `--export cart-delivery-options-transform-run`），讓你誤以為邏輯沒問題

**API 版本對照**：

| API 版本 | Target | TOML export | JS function name | Operation keys |
|---------|--------|-------------|-----------------|----------------|
| pre-2026 | `purchase.delivery-customization.run` | `run` | `run` | `rename` / `hide` / `move` |
| 2026-01+ | `cart.delivery-options.transform.run` | `run` | `run` | `deliveryOptionRename` / `deliveryOptionHide` / `deliveryOptionMove` |

**排查方法**：
1. 用 Node.js WebAssembly API 直接檢查 WASM exports：
   ```js
   const bytes = fs.readFileSync('dist/index.wasm');
   const module = await WebAssembly.compile(bytes);
   WebAssembly.Module.exports(module).forEach(e => console.log(e.kind, e.name));
   // 必須看到: function run
   ```
2. Local test 必須帶 `--export run`（不帶的話 CLI 會從 TOML 讀，應該也是 run）
3. 本地通過不代表 cloud 通過 — 本地 OK 但 cloud 不動 → 99% 是 WASM 沒有 `run` export

---

### 坑 4：DeliveryCustomization resource 在 target 改變後的相容性（待驗證）

當 Function 的 target 從舊版改為新版後，已建立的 `DeliveryCustomization` resource 是否需要重建，尚未完全驗證。  
**暫時建議**：target 改版後，建議刪除並重新建立 DeliveryCustomization resource。

---

### 排查流程 SOP（Delivery Customization 沒生效時）

```
1. Admin > Settings > Shipping > 配送自訂項目
   → 有看到項目嗎？沒有 → 先建立 resource（坑 2）

2. 查 errorHistory
   → deliveryCustomization { errorHistory { errorsFirstOccurredAt } }
   → 有錯誤 → target/export 不配套（坑 3），或 output schema 格式錯（坑 1）

3. 看 target + export 是否配套（坑 3）
   → npx shopify app function schema 確認 MutationRoot field 名稱

4. 看 output operation key（坑 1）
   → 對照當前 API version 的 schema

5. 本地測試
   → npx shopify app function run --path extensions/cvs-delivery
   → 輸入 test-input.json，看 output 是否正確
   → 注意：PowerShell 下要用 Get-Content pipe，不能用 < redirect

6. Debug 版本測試
   → 在 function 裡加 hardcode rename 所有選項（無條件），確認 Function 有在執行
   → 若 hardcode 沒效 → resource 問題（坑 2/4）
   → 若 hardcode 有效 → logic 問題或 cart attribute 讀取問題
```

---

### Shopify Function 開發通用規則

1. **Script 優於 App Route**：Admin API 操作（建立/查詢 Customization resource）用 `.cjs` 腳本直接呼叫，比跑 dev server 跑 route 更可靠
2. **每次 deploy 後等 CDN 傳播**：至少等 90 秒再測，且必須用全新 checkout session（不是舊的）
3. **PowerShell 限制**：`<` input redirect 不支援，pipe 用 `Get-Content file | command`
4. **Function ID 不變**：target 改版後 function UUID 不變，DeliveryCustomization 的 functionId 連結不斷，但 result type 驗證可能受影響
5. **apiType 仍是 delivery_customization**：不管 target 新舊，shopifyFunctions query 回傳的 apiType 都是 `delivery_customization`，不能用這個判斷 target 版本
