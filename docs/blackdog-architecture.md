# BlackDog (LifeERPv2) 軟體架構文件

> 最後更新：2026-03-10 | 來源：`bitbucket.org/systemLifecom/newblackdog`

---

## 一、系統概觀

BlackDog 是 LifeCOM 的核心 OMS/WMS 系統，基於 Laravel PHP 框架。
負責**訂單管理、庫存管理、物流出貨、平台串接、發票處理**五大核心業務。

### 技術棧

| 層 | 技術 |
|---|---|
| Framework | Laravel (PHP) |
| 前端 | Blade Templates + 前台 SPA |
| 資料庫 | MySQL (主庫 lifeerp + blackdog + lifeMall + encypt_lifeerp) |
| 外部 DB | PostgreSQL, MongoDB, BizWMS (SQL Server) |
| 佇列 | Laravel Queue (Redis) |
| 排程 | Laravel Scheduler (Kernel.php) |
| 部署 | GCP Cloud Build → K8s (multi-tenant) |

### 規模

| 指標 | 數量 |
|---|---|
| 原始碼檔案 | ~2,360 |
| Models | 107 |
| API Controllers | 24 |
| Platform 整合 | 17 (見下方) |
| Route 檔案 | 8 |
| ERPBD 業務模組 | 36 |
| Git 分支 | 200+ (feature/hotfix) |

---

## 二、系統架構圖

```
┌─────────────────────────────────────────────────────────────┐
│                        前端 / API 層                         │
│  routes/web.php  routes/api.php  routes/lifeerp.php         │
│  routes/frontend.php  routes/adERP.php  routes/digiwin.php  │
├─────────────────────────────────────────────────────────────┤
│                     Controllers 層                           │
│  ┌─────────────────┐  ┌──────────────┐  ┌────────────────┐ │
│  │ api/ (24個)      │  │ OutsideApi/  │  │ Includes/      │ │
│  │ 訂單/庫存/出貨   │  │ Digiwin整合   │  │ Controller/    │ │
│  │ 掃碼/上架/揀貨   │  │ (ERP回寫)     │  │ (前台控制器)   │ │
│  └─────────────────┘  └──────────────┘  └────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│                    ERPBD 業務邏輯層                           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐  │
│  │orderFlow │ │platform  │ │warehouse │ │ purchase     │  │
│  │訂單流程   │ │平台串接   │ │倉儲管理   │ │ 採購管理     │  │
│  ├──────────┤ ├──────────┤ ├──────────┤ ├──────────────┤  │
│  │logistics │ │product   │ │schedule  │ │ reports      │  │
│  │物流配送   │ │商品管理   │ │排程任務   │ │ 報表產出     │  │
│  ├──────────┤ ├──────────┤ ├──────────┤ ├──────────────┤  │
│  │document  │ │upload    │ │scan      │ │ webhookEvent │  │
│  │文件處理   │ │匯入上傳   │ │掃碼作業   │ │ Webhook事件  │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘  │
│  + api/ baseBizwms/ businessModels/ digiwin/ lifeerp/      │
│  + lifeMall/ mappingInfo/ masks/ observer/ operator/        │
│  + orderRules/ orderTools/ productsTool/ scopes/ stockOuput/│
│  + store/ storedProcedure/ supplier/ template/ tools/       │
│  + traits/ validate/                                        │
├─────────────────────────────────────────────────────────────┤
│                    Models 層 (107個)                          │
│  Orders / Inventory / Products / Customers / Documents      │
│  Markets / Collections / Brands / Categories / Functions    │
├─────────────────────────────────────────────────────────────┤
│                    資料庫層                                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐  │
│  │lifeerp   │ │blackdog  │ │lifeMall  │ │bizwms        │  │
│  │(MySQL)   │ │(MySQL)   │ │(MySQL)   │ │(SQL Server)  │  │
│  │核心 OMS  │ │前台商城   │ │電商前台   │ │WMS 倉儲      │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘  │
│  + encypt_lifeerp (加密資料) + PostgreSQL + MongoDB         │
└─────────────────────────────────────────────────────────────┘
```

---

## 三、平台整合（17 個電商/物流平台）

| 平台 | 主檔案 | 類型 |
|------|--------|------|
| **Momo** | `MomoClient.php` | 電商平台 |
| **Momo 超級商城** | `MomoStorePlusClient.php` | 電商平台 |
| **蝦皮 Shopee v2** | `ShopeeV2Client.php` | 電商平台 |
| **Shopify** | `ShopifyClient.php` | 電商平台 |
| **Shopline** | `ShoplineClient.php` | 電商平台 |
| **PCHome** | `PCHomeClient.php` | 電商平台 |
| **Yahoo 購物中心** | `YahooShoppingMallClient.php` | 電商平台 |
| **Yahoo 超級商城** | `YahooShoppingMallShopClient.php` | 電商平台 |
| **ETMall** | `ETMallClient.php` | 電商平台 |
| **LINE 禮物** | `LineGiftClient.php` | 電商平台 |
| **91APP** | `NineOneAPPClient.php` | 電商平台 |
| **Cyberbiz** | `CyberbizClient.php` | 電商平台 |
| **Owndays** | `OwndaysClient.php` | 專屬整合 |
| **Adastria** | `AdastriaClient.php` | B2B 整合 |
| **Digiwin (鼎新)** | `DigiwinClient.php` | ERP 整合 |
| **DefaultFile** | `DefaultFileClient.php` | 檔案匯入 |
| **FileWithDataCheck** | `FileClientWithDataCheck.php` | 檔案匯入+驗證 |

### 平台整合架構

```
PlatformInterface.php (抽象介面)
  ├── XxxClient.php (各平台 API 實作)
  │     ├── 訂單同步 (getOrders / updateShipping)
  │     ├── 商品同步 (getProducts / updateStock)
  │     └── 發票回寫 (updateInvoice)
  └── Xxx.php (平台特定商業邏輯)
        ├── 訂單規則映射
        ├── 欄位格式轉換
        └── 異常處理
```

---

## 四、核心業務模組

### 4.1 訂單流程 (`ERPBD/orderFlow/`)
- 訂單建立 → 庫存扣減 → 出貨單產生 → 物流配送 → 完成
- 支援多平台訂單匯入（API / 檔案 / Webhook）
- 訂單規則引擎 (`ERPBD/orderRules/`)

### 4.2 倉儲管理 (`ERPBD/warehouse/`)
- 入庫 / 出庫 / 調撥 / 盤點
- 與 BizWMS (SQL Server) 整合
- 掃碼作業 (`ERPBD/scan/`)
- 揀貨作業 (`Controllers/api/ApiCollectionPickingController.php`)

### 4.3 物流配送 (`ERPBD/logistics/`)
- 多物流商支援
- 取號回壓（配送狀態同步）
- 配達異常處理

### 4.4 商品管理 (`ERPBD/product/`)
- 商品主檔維護
- 多平台商品同步
- 庫存水位管理 (`ERPBD/stockOuput/`)

### 4.5 採購管理 (`ERPBD/purchase/`)
- 採購單建立
- 供應商管理 (`ERPBD/supplier/`)
- 採購入庫

### 4.6 報表 (`ERPBD/reports/`)
- `SysBDReport.php` — 系統排程報表（告警來源之一）
- 各式營運報表

### 4.7 排程任務 (`ERPBD/schedule/` + `Console/Kernel.php`)
- `autoUpdateOrders` — 自動更新訂單狀態
- `clearDatabase` — 資料庫維護
- `queue:prune-batches` — 佇列清理
- 動態排程：從 DB 讀取 task 列表執行

---

## 五、資料庫架構

| 資料庫 | 用途 | 引擎 |
|--------|------|------|
| `lifeerp` | 核心 OMS 資料（訂單/商品/客戶/庫存）| MySQL |
| `blackdog` | 前台系統 | MySQL |
| `lifeMall` | 電商前台 | MySQL |
| `encypt_lifeerp` | 加密敏感資料 | MySQL |
| `bizwms` | WMS 倉儲管理（共用）| SQL Server |
| `pgsql` | 輔助 | PostgreSQL |
| `myMongodb` | 文件/日誌 | MongoDB |

---

## 六、外部 API 整合

### 6.1 Digiwin (鼎新 ERP)
- 路由：`routes/digiwin.php`
- Controller：`OutsideApi/ApiDigiwinOrders.php`, `ApiDigiwinPurchases.php`
- 用途：訂單/採購單回寫鼎新 ERP

### 6.2 LifeERP 內部 API
- 路由：`routes/lifeerp.php`
- 用途：內部系統間資料交換

### 6.3 adERP
- 路由：`routes/adERP.php`
- 用途：Adastria B2B 專用 API

---

## 七、部署架構

```
Bitbucket (newblackdog)
  │
  ├── feature/* → develop → GCP Cloud Build
  ├── hotfix/*  → master  → GCP Cloud Build
  │
  └── Cloud Build → Docker → K8s (multi-tenant)
       ├── 客戶 A 實例 (環境變數隔離)
       ├── 客戶 B 實例
       └── ...
```

- Multi-tenant：每個客戶一組 K8s deployment，共用程式碼，靠環境變數切換
- Slack 部署通知：部署完成後推 `C03FSJ3PQKD`
- 最新 PR：#4114 Cloudbuild multi tenant（Rayal, 2026-03-10）

---

## 八、已知系統問題（從告警頻道觀測）

| 問題 | 來源 | 頻率 |
|------|------|------|
| `MomoClient.php` null array crash | Momo API 回傳異常 | 每日數次 |
| Momo SSL reset（節假日） | 平台端 | 節假日 |
| `SysBDReport.php` 排程報表異常 | 排程執行失敗 | 偶發 |
| WMS 訂單狀態回寫失敗 | BizWMS 整合 | 每日（低失敗率 <5%）|
| `levis` Invalid CRON | 排程設定問題 | 週期性 |
| `sfl` Route[login] 驗證失敗 | 登入 session 問題 | 週期性爆發 |

---

## 九、分支策略

| 分支 | 用途 |
|------|------|
| `master` | 正式版（hotfix 合併目標）|
| `develop` | 開發版（feature 合併目標）|
| `feature/VSTS{ID}_*` | 功能開發（對應 ADO 工單）|
| `hotfix/HOTFIX{ID}_*` | 緊急修復（對應 ADO 工單）|
| `cloudbuild-multi-tenant` | 基礎建設分支 |

命名規則：分支名含 ADO 工單 ID（`VSTS` 前綴），可交叉比對。

---

## 十、檔案結構

```
newblackdog/
├── app/
│   ├── Console/Kernel.php           # 排程定義
│   ├── Http/
│   │   └── Controllers/
│   │       ├── api/                  # 24 個 API Controller
│   │       └── OutsideApi/           # Digiwin 整合
│   ├── Includes/
│   │   ├── Controller/               # 前台控制器
│   │   ├── Eccore/bizwms/            # WMS 整合
│   │   ├── ERPBD/                    # 36 個業務模組（核心）
│   │   │   ├── orderFlow/            # 訂單流程
│   │   │   ├── platform/             # 17 個平台串接
│   │   │   ├── warehouse/            # 倉儲管理
│   │   │   ├── logistics/            # 物流配送
│   │   │   ├── product/              # 商品管理
│   │   │   ├── purchase/             # 採購管理
│   │   │   ├── reports/              # 報表
│   │   │   ├── schedule/             # 排程任務
│   │   │   └── ...                   # 其他 28 個子模組
│   │   └── Functions/                # 共用函式
│   └── Models/                       # 107 個 Eloquent Model
├── routes/
│   ├── api.php                       # REST API 路由
│   ├── web.php                       # Web 路由
│   ├── lifeerp.php                   # 內部 API
│   ├── digiwin.php                   # 鼎新 ERP
│   ├── adERP.php                     # Adastria B2B
│   └── frontend.php                  # 前台路由
├── config/
│   └── database.php                  # 7 個資料庫連線
├── database/migrations/              # DB migration
└── cloudbuild.yaml                   # GCP Cloud Build
```
