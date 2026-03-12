# W9 SPEC：Delivery Customization + Checkout Extension 重構 + Payment Customization

> **狀態**：SPEC → 待 REVIEW
> **前置**：W1-W7 已完成，W8 送審前必須先做 W9
> **Notion SPEC 頁**：待建立（Review 通過後同步）

---

## Eric 確認事項（2026-03-07）

1. ✅ 運費依品牌（全家/711）**分開設定**
2. ✅ Phase 1 **要做 COD**（超商取貨付款）
3. ✅ 未選門市進 Checkout → **顯示提示**（不 block）
4. ⚠️ 目標客戶**不全是 Advanced plan** → Carrier Service API 不適用，改用 Shopify Functions 方案

---

## 問題描述

目前 CVS App 在 Cart 頁選完門市後，進入 Checkout 頁時：

1. **結帳頁沒有顯示「超商取貨」配送選項** — Cart Attributes 只是資料儲存，不是 Shopify 的配送方式
2. **Checkout Extension target 錯誤** — `purchase.checkout.delivery-address.render-before` 只在有配送地址區塊時渲染
3. **缺少金流控制** — 「超商取貨付款（COD）」需要隱藏線上付款方式

---

## ⚠️ Plan 限制分析（方案選擇關鍵）

| 方案 | Plan 需求 | 能力 |
|------|----------|------|
| **Carrier Service API** | Advanced ($399/mo) 或年繳 | 動態回傳自訂運費 — ❌ 客戶不全 Advanced |
| **Delivery Customization Function** | Basic ($39/mo)+ | hide/rename/reorder 已存在的配送 — ✅ |
| **Payment Customization Function** | Basic ($39/mo)+ | hide/reorder 付款方式 — ✅ |
| **Checkout UI Extension** | Basic ($39/mo)+ | UI 渲染 — ✅ |

**結論**：改用「**商家建配送方式 + App 用 Function 控制顯隱**」方案，Basic plan 即可用。

---

## 架構方案

```
前置（一次性）：商家在 Shopify Admin 手動建 Shipping Rate
  ├─ "全家取貨"（固定 NT$60）
  ├─ "7-11取貨"（固定 NT$65）
  ├─ "全家取貨付款"（固定 NT$60）
  └─ "7-11取貨付款"（固定 NT$65）
  （App Admin 設定頁提供 step-by-step 教學 + 一鍵驗證）

Cart 頁（Theme Extension，不動）
  └─ 用戶選門市 → Cart Attributes 寫入 pickup_provider / pickup_store_*
       │
       ▼
Checkout 頁
  ├─ ① Delivery Customization Function（新增）
  │    └─ 讀 Cart Attributes → 動態 hide 不相關配送
  │       • 選全家 → 顯示全家×2，隱藏 711×2
  │       • 選 711 → 顯示 711×2，隱藏全家×2
  │       • 沒選門市 → 隱藏所有超商配送
  │
  ├─ ② Checkout UI Extension（改 target）
  │    └─ shipping-option-list.render-after
  │       • 有門市 → 門市 Banner + 更換連結
  │       • 沒門市 → 提示「請回購物車選門市」
  │
  └─ ③ Payment Customization Function（新增）
       └─ 讀 selected delivery title
          • 「取貨付款」→ 只顯示 COD
          • 「取貨」→ 隱藏 COD
          • 宅配 → 隱藏 COD
```

### 方案對比

| | Carrier Service | 本方案（Functions） |
|---|---|---|
| Plan 需求 | Advanced ($399) | **Basic ($39)** ✅ |
| 配送來源 | App 動態回傳 | 商家手動建 + App 控制顯隱 |
| 運費設定 | App DB | Shopify Admin（商家自訂） |
| Server 端維護 | 需 callback endpoint | **無** ✅ |
| 用戶體驗 | 相同 | **相同** ✅ |

---

## 模組 1：Delivery Customization Function

### 目的
根據 Cart Attributes 的 `pickup_provider`，動態隱藏不相關的超商配送方式。

### Scope 變更

```diff
# shopify.app.toml
[access_scopes]
- scopes = "read_orders,write_orders"
+ scopes = "read_orders,write_orders,read_shipping,write_shipping"
```

### 實作

#### 1a. Extension scaffold

```bash
shopify app generate extension --type delivery_customization --name cvs-delivery --language javascript
```

→ `extensions/cvs-delivery/`

#### 1b. `extensions/cvs-delivery/src/run.js`

```javascript
export function run(input) {
  const pickupProvider = input.cart.attribute?.find(a => a.key === 'pickup_provider')?.value;
  const deliveryType = input.cart.attribute?.find(a => a.key === 'pickup_delivery_type')?.value;
  
  const operations = [];
  
  for (const group of input.cart.deliveryGroups) {
    for (const option of group.deliveryOptions) {
      const title = option.title;
      const isCvs = /取貨|cvs|超商/i.test(title);
      const isFamily = /全家|family/i.test(title);
      const is711 = /7-11|711|seven/i.test(title);
      
      let shouldHide = false;
      
      if (deliveryType === 'home' || !pickupProvider) {
        // 宅配模式 or 沒選門市 → 隱藏所有超商配送
        shouldHide = isCvs;
      } else if (pickupProvider === 'family') {
        shouldHide = is711; // 選全家 → 隱藏 711
      } else if (pickupProvider === '711') {
        shouldHide = isFamily; // 選 711 → 隱藏全家
      }
      
      if (shouldHide) {
        operations.push({ hide: { deliveryOptionHandle: option.handle } });
      }
    }
  }
  
  return { operations };
}
```

#### 1c. `extensions/cvs-delivery/input.graphql`

```graphql
query Input {
  cart {
    attribute(key: "pickup_provider") { value }
    attribute(key: "pickup_delivery_type") { value }
    deliveryGroups {
      deliveryOptions {
        handle
        title
      }
    }
  }
}
```

#### 1d. `extensions/cvs-delivery/shopify.extension.toml`

```toml
api_version = "2026-01"

[[extensions]]
  name = "CVS Delivery Customization"
  handle = "cvs-delivery-customization"
  type = "function"

  [[extensions.targeting]]
    target = "purchase.delivery-customization.run"
    input_query = "input.graphql"
    export = "run"
```

#### 1e. App 安裝時自動啟用

`app/lib/delivery-customization.server.ts`：用 `deliveryCustomizationCreate` mutation 自動建立，商家不需手動去 Settings 啟用。

---

## 模組 2：Checkout UI Extension（改 target）

### 變更

#### 2a. `extensions/checkout-cvs/shopify.extension.toml`

```diff
- api_version = "2025-04"
+ api_version = "2026-01"

  [[extensions.targeting]]
    module = "./src/index.tsx"
-   target = "purchase.checkout.delivery-address.render-before"
+   target = "purchase.checkout.shipping-option-list.render-after"
```

#### 2b. `extensions/checkout-cvs/src/index.tsx` 重構

兩種狀態：

**A. 有門市資料** → info Banner：
```
🏪 取貨門市：全家便利商店
台北市信義區松仁路 100 號
電話：02-1234-5678
[↩ 更換取貨門市]
```

**B. 沒門市但選了超商配送** → warning Banner：
```
⚠️ 請回購物車頁面選擇取貨門市
[← 前往購物車]
```

---

## 模組 3：Payment Customization Function

### 實作

#### 3a. Extension scaffold

```bash
shopify app generate extension --type payment_customization --name cvs-payment --language javascript
```

→ `extensions/cvs-payment/`

#### 3b. `extensions/cvs-payment/src/run.js`

```javascript
export function run(input) {
  const operations = [];
  const selectedTitle = input.cart.deliveryGroups?.[0]
    ?.selectedDeliveryOption?.title ?? '';
  
  const isCvsCod = /取貨付款|pickup.*cod/i.test(selectedTitle);
  const isCvsPickup = !isCvsCod && /取貨|cvs|超商/i.test(selectedTitle);
  
  for (const method of input.paymentMethods) {
    const name = method.name;
    const isCod = /cod|貨到付款|到店付款|取貨付款/i.test(name);
    
    if (isCvsCod && !isCod) {
      operations.push({ hide: { paymentMethodId: method.id } });
    } else if ((isCvsPickup || (!isCvsCod && !isCvsPickup)) && isCod) {
      operations.push({ hide: { paymentMethodId: method.id } });
    }
  }
  
  return { operations };
}
```

#### 3c. `extensions/cvs-payment/shopify.extension.toml`

```toml
api_version = "2026-01"

[[extensions]]
  name = "CVS Payment Customization"
  handle = "cvs-payment-customization"
  type = "function"

  [[extensions.targeting]]
    target = "purchase.payment-customization.run"
    input_query = "input.graphql"
    export = "run"
```

---

## 模組 4：Admin 設定頁擴充

`app/routes/app.settings.tsx` 新增：

### 4a. 配送設定教學（Step-by-step）

```
📦 超商配送設定

您需要在 Shopify 後台建立超商取貨的運費方案。
App 會自動根據顧客選擇的門市，在結帳頁顯示/隱藏對應的配送方式。

步驟：
1. 前往 Settings → Shipping and delivery
2. 在 Shipping profiles 新增以下費率：
   
   全家：
   ├─ 「全家取貨」— NT$60
   └─ 「全家取貨付款」— NT$60
   
   7-11：
   ├─ 「7-11取貨」— NT$65
   └─ 「7-11取貨付款」— NT$65

3. 按下方「驗證配送設定」確認
```

### 4b. 一鍵驗證按鈕

- 用 Admin GraphQL 讀取 `deliveryProfiles`
- 檢查是否有包含全家/7-11 + 取貨關鍵字的 shipping rate
- 顯示每個 rate 的 ✅ 已找到 / ❌ 未找到

### 4c. COD toggle

- 「啟用超商取貨付款」toggle
- 開啟後教學增加「取貨付款」費率步驟
- 存入 `merchant_settings` 表（新欄位 `cod_enabled`）

### 4d. 配送名稱匹配（進階設定，可摺疊）

- 讓商家自訂 Function 匹配用的關鍵字
- 預設值已覆蓋常見情境，一般不需改

---

## 檔案清單

### 新增

| 檔案 | 說明 |
|------|------|
| `extensions/cvs-delivery/` | Delivery Customization Function |
| `extensions/cvs-payment/` | Payment Customization Function |
| `app/lib/delivery-customization.server.ts` | 自動建立 Delivery Customization |
| `app/lib/payment-customization.server.ts` | 自動建立 Payment Customization |
| `migrations/003_cod_settings.sql` | merchant_settings 加 cod_enabled |

### 修改

| 檔案 | 變更 |
|------|------|
| `shopify.app.toml` | scopes 加 `read_shipping,write_shipping` |
| `extensions/checkout-cvs/shopify.extension.toml` | target → `shipping-option-list.render-after`，API 升 2026-01 |
| `extensions/checkout-cvs/src/index.tsx` | 重寫：條件顯示門市 Banner + 未選門市提示 |
| `app/routes/app.settings.tsx` | 配送教學 + 驗證 + COD toggle + 名稱匹配 |

### 不動

| 檔案 | 原因 |
|------|------|
| Theme Extension | Cart 頁選店不變 |
| MCVS callback routes | 選店流程不變 |
| webhooks.orders-create.tsx | Metafield 不變 |
| DB 現有 tables/columns | 向下相容 |

---

## 依賴

- **無新外部套件**
- **無新 server 端 endpoint**（Functions 跑在 Shopify infrastructure）
- **Plan 需求：Basic ($39/mo)+** ✅

---

## 執行順序

```
Day 1：模組 4（Admin 設定頁）+ Dev store 手動建 shipping rates
Day 1-2：模組 1（Delivery Customization Function）
Day 2-3：模組 2（Checkout Extension 改 target）
Day 3-4：模組 3（Payment Customization Function）
Day 4：整合測試
```

---

## VERIFY 清單

1. ✅ Dev store 有全家/711 取貨 + 取貨付款 4 個 shipping rate
2. ✅ Cart 選全家 → Checkout 只顯示「全家取貨」+「全家取貨付款」+ 宅配
3. ✅ Cart 選 711 → Checkout 只顯示「7-11取貨」+「7-11取貨付款」+ 宅配
4. ✅ 沒選門市 → Checkout 只顯示宅配
5. ✅ 選「全家取貨」→ 門市 Banner + 線上付款 + COD 隱藏
6. ✅ 選「全家取貨付款」→ 門市 Banner + 只有 COD
7. ✅ 選「宅配」→ 無 Banner + COD 隱藏 + 正常付款
8. ✅ 沒選門市但手動選了超商配送（邊界）→ 提示 Banner
9. ✅ Admin 驗證按鈕正確檢測 shipping rates
10. ✅ 下單完成 → Order Metafield 正確

---

## 風險

| 風險 | 緩解 |
|------|------|
| 商家忘記建 shipping rate | 驗證按鈕 + 設定頁大紅提示 |
| Rate 名稱不含關鍵字 | 進階設定讓商家自訂匹配詞 |
| Cart Attributes 在 Function 中不可讀 | 已確認 Delivery Customization API 支援 `cart.attribute` |
| COD 付款名稱各店不同 | 設定頁讓商家指定 |
| Function 最多 25 個/店 | 一般不會衝突 |
