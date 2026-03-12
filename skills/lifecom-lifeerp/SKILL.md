---
name: lifecom-lifeerp
description: "LifeERPv2（BlackDog）OMS+WMS 產品知識庫 — 完整系統架構、模組、平台串接、倉儲、物流、風控、排程。任何 LifeERP / BlackDog / newblackdog 相關開發、除錯、架構討論時必讀。"
---

# LifeERPv2（BlackDog）— 完整產品知識庫

> **BlackDog = LifeERPv2**，LifeCOM 核心 OMS/WMS 系統，支撐所有電商代營運客戶的訂單與倉儲管理。
> Repo: `systemLifecom/newblackdog`（Bitbucket）| 本機: `C:\Users\Eric\dev\newblackdog`
> Notion: [BlackDog 產品知識庫](https://www.notion.so/BlackDog-OMS-WMS-31fd2a91c73281bbbb39cec8d5301475) | [架構圖集](https://www.notion.so/Mermaid-31fd2a91c73281129450c42aed3e0902)

---

## 1. 系統總覽

| 項目 | 值 |
|------|-----|
| **正式名稱** | LifeERPv2（代號 BlackDog） |
| **框架** | Laravel 9.x（PHP ^7.3 / ^8.0） |
| **PHP 檔案數** | 1,027 |
| **DB Migrations** | 267 |
| **版本** | v3.10.x |
| **部署** | Docker + Nginx + PHP-FPM（K8s） |
| **認證** | JWT（auth.jwt middleware）+ Laravel Sanctum |

### 資料庫

| Connection | Driver | 用途 |
|-----------|--------|------|
| `lifeerp` | MySQL（default） | OMS 主庫 |
| `bizpro_wms` | MySQL | WMS 倉儲系統 |
| `lifemall` | MySQL | LifeMall 自營商城 |
| `mongodb` | MongoDB | 日誌/非結構化資料 |

---

## 2. 系統架構

```mermaid
graph TB
    subgraph "Route Layer"
        R1[api.php] & R2[web.php] & R3[lifeerp.php] & R4[digiwin.php] & R5[adERP.php] & R6[frontend.php]
    end
    subgraph "Controller Layer"
        C1[api/ 24個] & C2[OutsideApi/ 5個]
    end
    subgraph "Service Layer v1/"
        S1[Auth] & S2[MarketSvc] & S3[Purchase] & S4[ShipReturn] & S5[UploadSvc]
    end
    subgraph "Business Logic ERPBD/"
        B1[platform/ 17平台] & B2[warehouse/ 17+倉庫] & B3[operator/ 14操作器]
        B4[orderFlow/ 6流程] & B5[orderRules/ 11規則] & B6[reports/ 20+報表]
        B7[schedule/ 8排程] & B8[scan/ 掃描]
    end
    subgraph "Repository"
        RP[BizModels/ LifeMall/ Market/ Order/ Prod/]
    end
    subgraph "Models"
        M1[Models/ 100+] & M2[BizModels/ 33 WMS] & M3[LifeMallModels/ 7]
    end
    subgraph "Config Eccore/"
        CF[46個Info類]
    end
    subgraph "Database"
        DB1[(lifeerp MySQL)] & DB2[(bizpro_wms MySQL)] & DB3[(lifemall MySQL)] & DB4[(MongoDB)]
    end
    R1 & R2 & R3 & R4 & R5 & R6 --> C1 & C2 --> S1 & S2 & S3 & S4 & S5
    S1 & S2 & S3 & S4 & S5 --> B1 & B2 & B3 & B4 & B5 & B6 & B7 & B8 --> RP --> M1 & M2 & M3
    M1 --> DB1
    M2 --> DB2
    M3 --> DB3
```

### 目錄結構

| 目錄 | 用途 | 規模 |
|------|------|------|
| `app/Http/Controllers/api/` | 內部 API | 24 Controllers |
| `app/Http/Controllers/OutsideApi/` | 外部 API（Digiwin） | 5 Controllers |
| `app/Services/v1/` | 服務層 | Auth, MarketSvc, Purchase, ShipReturn, UploadSvc |
| `app/Includes/ERPBD/` | 核心業務邏輯 | 250+ 檔案 |
| `app/Includes/Eccore/` | 常量/設定 | 46 Info 類 |
| `app/Models/` | OMS Models | 100+ |
| `app/BizModels/` | WMS Models | 33 |
| `app/Repository/` | Repository 層 | 7 子目錄 |
| `app/Console/Commands/` | Artisan Commands | 19 |
| `app/Jobs/` | Queue Jobs | 7 |

### API Routes

| 檔案 | 用途 |
|------|------|
| `api.php` | 主 API（v1 login, v2 CRUD） |
| `lifeerp.php` | LifeERP 整合 |
| `digiwin.php` | 鼎新 ERP |
| `adERP.php` | adERP |
| `frontend.php` | 前端 |
| `web.php` | SPA + Swagger + 蝦皮 OAuth |

---

## 3. 訂單管理（OMS）

### 訂單狀態機

```mermaid
stateDiagram-v2
    [*] --> s0: 平台拋單
    s0: 0.未處理
    s0 --> s1: 確認
    s1: 1.已確認
    s1 --> s5: 配貨
    s5: 5.預備出貨
    s5 --> s7: 風控通過
    s7: 7.風控確認
    s7 --> s8: 轉倉庫
    s8: 8.TOWMS
    s8 --> s220: 出貨
    s220: 220.已出貨
    s220 --> s230: 宅配送達
    s220 --> s270: 超取到店
    s230: 230.送達
    s270: 270.已到店
    s270 --> s290: 取件
    s230 --> s290: 確認
    s290: 290.已取件
    s290 --> s300: 結案
    s300: 300.結算
```

**完整狀態碼：**

| 碼 | 狀態 | 碼 | 狀態 |
|----|------|----|------|
| 0 | 未處理 | 220 | 已出貨 |
| 1 | 已確認 | 230 | 送達消費者 |
| 5 | 預備出貨 | 235 | 部分到達 |
| 6 | 預備出貨# | 260 | 退貨申請 |
| 7 | 風控確認 | 267 | 退貨風控確認 |
| 8 | 已產給倉庫 | 268 | 退貨已產給倉庫 |
| 24 | 訂單取消 | 269 | 等待退款確認 |
| 25 | 暫停出貨 | 270 | 已到店 |
| 38 | 取消中 | 290 | 已取件 |
| 400 | 缺貨等待 | 300 | 結算 |
| 401 | 收件資料異常 | 431 | 平台訂單準備中 |
| 402 | 發票資料異常 | 435 | 平台確認失敗 |
| 403 | 會員資料異常 | 462 | 退貨結案異常 |
| 404 | 黑名單 | 480 | 倉庫回傳異常 |
| 405 | 付款檢核失敗 | 485 | 重新配貨異常 |
| 406 | 付款資料錯誤 | 486 | 倉庫數量異常 |
| 407 | 金額超過風控 | 487 | 退貨入庫異常 |
| 408 | 明細金額異常 | 490 | 發票作廢失敗 |
| 410 | 贈品併單失敗 | 491 | 退款失敗 |
| 420 | 風控訂單規則 | 4111 | 自出門市關轉 |
| 421 | 訂單規則異常 | 4121 | 自出取號失敗 |
| 425 | 出貨風控訂單規則 | | |

### 訂單操作器（operator/）

| Operator | 功能 |
|----------|------|
| `CreateOrder` | 建立訂單 |
| `CreateExchangeOrder` | 建立換貨訂單 |
| `CreateExchangeReturn` | 建立換貨退貨 |
| `PreShipOrder` | 預備出貨 |
| `PreReturnOrder` | 預備退貨 |
| `RefundOrder` | 退款 |
| `ReShipment` / `ReShipmentAfterToWMS` | 重新出貨 |
| `RePackageOrder` | 重新包裝 |
| `SpliteOrder` | 拆單 |
| `ChangeShipMethod` | 變更物流 |
| `ResetToPreShip` / `ResetToPreShipAndDel` | 重設 |
| `CancleOrVoidAssignOrder` | 取消/作廢已配貨 |
| `UpdateOrdersProducts` | 更新訂單商品 |
| `ConfirmRefundOnCreateVirtulProds` | 退款確認 |
| `ResetOrderAndReShipment` | 重設並重出 |

### 訂單規則引擎（orderRules/）

```mermaid
flowchart TD
    A[訂單建立] --> B{OrderRules 規則引擎}
    B --> C1[AddressValidationModule 地址驗證]
    B --> C2[OrderMergeModule 合併訂單]
    B --> C3[OrderSplitModule 拆單]
    B --> C4[GiftWithOrder 滿額贈品]
    B --> C5[BuyAGetB 買A送B]
    B --> C6[VolumeChangeShipMethod 材積換物流]
    B --> C7[RiskChkModule 風控]
    B --> C8[RiskChk2Module 進階風控]
    B --> C9[RiskChkAfterShipNoModule 出貨後風控]
    B --> C10[UpdateColumn 欄位更新]
    B --> C11[OrderCreatedCustomProcess 客製處理]
    C1 & C2 & C3 & C4 & C5 & C6 & C7 & C8 & C9 & C10 & C11 --> D[進入配貨]
```

### 訂單流程（OrderFlow）

```mermaid
flowchart TD
    subgraph "DefaultFlow 標準"
        D1[配貨] --> D2[風控] --> D3[取號] --> D4[確認] --> D5[轉WMS] --> D6[出貨]
    end
    subgraph "SFLiiFlow 順豐二倉"
        S1[允許無商品] --> S2[僅寫備註] --> S3[直接轉WMS] --> S4[WMS取號確認]
    end
    subgraph "PostFlow 郵局"
        P1[配貨] --> P2[風控] --> P3[轉WMS] --> P4[取號] --> P5[確認] --> P6[上傳PDF]
    end
    subgraph "NoneAssignFlow 免配貨"
        N1[跳過配貨] --> N2[風控] --> N3[取號] --> N4[轉WMS]
    end
    subgraph "AssignToShipFlow 配貨即出貨"
        A1[配貨] --> A2[風控] --> A3[直接出貨]
    end
    subgraph "ShipCollectFlow 彙總集貨B2B"
        C1[多訂單分組] --> C2[彙總轉WMS] --> C3[集貨出貨]
    end
```

**OrderFlow 配置矩陣：**

| Flow | AssignMode | RiskChkMode | 特性 |
|------|-----------|-------------|------|
| DefaultFlow | NeedAssign | NeedChk | 標準流程 |
| SFLiiFlow | NoneAssign | OnlyMemo | 允許無商品、風控僅備註 |
| PostFlow | NoneAssignV2 | NeedChk | 不配但更新ID、需上傳PDF |
| NoneAssignFlow | NoneAssign | NeedChk | 跳過配貨 |
| AssignToShipFlow | AssignToShip | NeedChk | 配貨完直接出貨 |
| ShipCollectFlow | NeedAssign | NeedChk | B2B 彙總集貨 |

---

## 4. 倉儲管理（WMS）

```mermaid
graph TB
    subgraph "BlackDog OMS"
        OMS[訂單管理]
    end
    subgraph "warehouse/ 介面層"
        WO[order/ 訂單下倉 17個]
        WS[stock/ 庫存同步 17個]
        WP[product/ 商品同步 10個]
        WV[stockInVoucher/ 入庫單 17個]
        WA[asn/ ASN 4個]
        WM[stockMove/ 調撥 1個]
    end
    subgraph "SFL 順豐系列"
        SFL[V1 / V2 / V3 / SFLii / SFLSelf / SFLAdastria]
    end
    subgraph "BizWms 系列"
        BW[5soap / Ajpeace / Doe / EZ / JetF / NPC / SDL / TDS / XML]
    end
    subgraph "獨立倉庫"
        IW[Focus / LES / Maersk / Toysrus / WmsPOST]
    end
    OMS --> WO & WS & WP & WV & WA & WM
    WO & WS & WV --> SFL & BW & IW
```

### BizModels（WMS DB bizpro_wms）

```mermaid
erDiagram
    T_ORDHAD ||--o{ T_ORDDEL : "出貨明細"
    T_ORDHAD ||--o{ T_ORDDSTS : "出貨狀態"
    T_STOWHAD ||--o{ T_STOWING : "入庫明細"
    T_STOWHAD ||--o{ T_STOWQCH : "品檢頭"
    T_STOWQCH ||--o{ T_STOWQCD : "品檢細"
    T_STOWHAD ||--o{ T_STOWSLOH : "上架頭"
    T_STOWSLOH ||--o{ T_STOWSLOT : "上架細"
    OCustomer ||--o{ OMerdata : "客戶商品"
    OMerdata ||--o{ OSlotmer : "商品儲位"
```

---

## 5. 電商平台串接（17 平台）

```mermaid
graph TB
    PI[PlatformInterface] --> P1[Momo + Client]
    PI --> P2[MomoStorePlus + Client]
    PI --> P3[ShopeeV2 + Client]
    PI --> P4[Shopify + Client]
    PI --> P5[Shopline + Client]
    PI --> P6[YahooShoppingMall + Client]
    PI --> P7[YahooShoppingMallShop + Client]
    PI --> P8[NineOneAPP + Client]
    PI --> P9[LineGift + Client]
    PI --> P10[Cyberbiz + Client]
    PI --> P11[ETMall + Client]
    PI --> P12[PCHome + Client]
    PI --> P13[AdastriaClient]
    PI --> P14[OwndaysClient]
    PI --> P15[DigiwinClient ERP]
    PI --> P16[DefaultFileClient Upload]
    P3 -.-> P3a[ShopeeV2SFLii]
    P4 -.-> P4a[ShopifySFLii]
    P9 -.-> P9a[LineGiftLoreal]
```

**架構模式**：`平台.php`（業務邏輯）+ `平台Client.php`（API 呼叫），統一實作 `PlatformInterface.php`。

**市場類型（MarketsInfo）**：Upload, DigiwinApi, YahooMall, Yahoo, Shopline, MOMO, MOMO_STORE_PLUS, LifeMall, Shopee, XMLFILE, Cyberbiz, Shopify, YSMS, Upload_ds, ETMall, LineGift, PCHome, Upload_b2b

### 資料流

```mermaid
sequenceDiagram
    participant P as 電商平台
    participant BD as LifeERPv2
    participant WMS as 倉庫
    participant LOG as 物流商
    BD->>P: 拉取訂單
    P-->>BD: 訂單資料
    BD->>BD: 規則引擎 + 配貨 + 風控
    BD->>LOG: 取物流編號
    BD->>P: 確認訂單
    BD->>WMS: 轉入倉庫
    WMS-->>BD: RSP 出貨回傳
    BD->>LOG: 物流追蹤
    BD->>P: 回壓狀態
```

---

## 6. ERP 整合

| 系統 | 檔案 | 用途 |
|------|------|------|
| **Digiwin 鼎新** | `digiwin/DigiwinBase.php` + routes | 訂單下推、採購同步 |
| **LifeERP** | `lifeerp/LifeERPApi.php` + routes | 退貨資料、訂單設定 |
| **SAP** | `libraries/Sap.php` | Levis SAP 整合 |
| **Siebel** | `libraries/Siebel.php` | CRM 會員 |
| **Cetustek** | `libraries/einv/Cetustek.php` | 電子發票（關貿） |
| **NewebPay** | `libraries/payments/newebpay/` | 藍新金流 |
| **LifeTMS** | `logistics/LifeTMSApi*.php` | 物流 TMS |

---

## 7. 物流出貨

### 物流方式分類

```mermaid
graph TB
    subgraph "自出 SHIP_SELF"
        subgraph "宅配"
            H[黑貓/新竹/宅急便/郵局/統一/黑貓到店/大榮/博駿]
        end
        subgraph "超取"
            C[7-11/全家/萊爾富]
        end
    end
    subgraph "三方 SHIP_THIRD"
        TH[三方宅配: 黑貓/宅急便/新竹/黑貓到店]
        TC[三方超取: 7-11/全家/萊爾富/蝦皮店到店/OKMart/全家店到店]
        TO[三方海外: 順豐/7-11跨境]
    end
    subgraph "特殊"
        SP[專車/自取/門市自取/波特李/佐川/祥益]
    end
    subgraph "海外"
        OV[DHL/DEC/FedEx/ACS/SF API/GMJ]
    end
```

### PDF 列印

| 物流商 | PDF 類 |
|--------|--------|
| 黑貓 | TCat3ModePDF, TCatPackPDF |
| 新竹 | HctPackPDF |
| 7-11 | SevenPDF6, Seven1015 |
| 全家 | NineOneFamilyPDF |
| 萊爾富 | HilifePDF |
| 郵局 | PostPDF |
| 宅急便 | Pelican1Of3 |
| 中華郵政 | ChunghwaPostShipPDF |
| 門市 | Store1015 |
| 自出 | BaseSelfShipPDF |

---

## 8. 排程任務

### 動態排程架構

```mermaid
flowchart TD
    K[Console/Kernel.php] -->|查詢 tasks 表| DB[(tasks 資料表)]
    DB -->|enabled + cron 表達式| S[Laravel Scheduler]
    S --> T1[TaskMarkets 抓單]
    S --> T2[TaskProducts 商品]
    S --> T3[TaskWarehouse 倉庫]
    S --> T4[TaskReport 報表]
    S --> T5[TaskOrderMonitor 訂單監控]
    S --> T6[TaskSettle 結算]
    S --> T7[TaskStore 門市]
    S --> T8[TaskSupplier 供應商]
    S --> T9[TasksCheck 健康檢查]
    S --> T10[MaintainTool 維護]
```

排程從 `tasks` 資料表**動態載入**，非硬編碼。每個 task 有 cron 表達式 + `runInBackground` + `withoutOverlapping`。

### Schedule Process

| Process | 功能 |
|---------|------|
| `MarketsProcess` | 各平台訂單抓取 |
| `PreShipOrdersProcess` | 預備出貨處理 |
| `ProductsProcess` | 商品同步 |
| `ReportsProcess` | 報表產生 |
| `StoreProcess` | 門市同步 |
| `SupplierProcess` | 供應商 |
| `WarehouseProcess` | 倉庫 |
| `CustNoProcess` | WMS 客戶編號 |

---

## 9. 風控引擎

```mermaid
flowchart TD
    A[訂單進入風控] --> B{RiskChkMode}
    B -->|NeedChk| C[BaseRiskCheck]
    B -->|OnlyMemo| D[僅寫備註 不阻斷]
    C --> F{收件} --> G{發票} --> H{黑名單} --> I{付款} --> J{金額} --> K{明細}
    F -->|異常| F1[401]
    G -->|異常| G1[402]
    H -->|命中| H1[404]
    I -->|異常| I1[405/406]
    J -->|超限| J1[407]
    K -->|異常| K1[408]
    K -->|正常| L[7.風控確認]
```

**客戶專用風控：** `BaseRiskCheckLoreal`（萊雅）、`RefundRiskCheck`（退款）

---

## 10. 報表系統（reports/）

所有報表實作 `ReportInterface`，繼承 `AbstractReport`。

| 報表 | 客戶 | 報表 | 客戶 |
|------|------|------|------|
| OrderSales | 通用 | LevisSapSales | Levis |
| EmersSales | Emers | JealousnessSales | Jealousness |
| JollywizSales | Jollywiz | ChingHwaSales | 慶華 |
| DhinChiSales | 鼎基 | FivesoapSales | 五皂 |
| PSKSales | PSK | SWASales | SWA |
| TeamsonSales | Teamson | ToysrusSales | Toysrus |
| UmbrellaKingSales | 雨傘王 | SysCompareStocks | 系統 |
| SysLowStocks | 系統 | SysBDReport | 系統 |

---

## 11. 退貨/換貨流程

```mermaid
flowchart TD
    A[退貨申請 260] --> B{退貨風控}
    B -->|通過| C[267 風控確認]
    B -->|異常| B1[退貨風控異常]
    C --> D[268 已產給倉庫]
    D --> E[WMS 退貨入庫]
    E --> F[269 等待退款確認]
    F --> G[300 結算]

    H[換貨] --> I[CreateExchangeOrder 新單]
    H --> J[CreateExchangeReturn 退舊]
    I --> K[正常出貨流程]
    J --> A
```

### 交易類型（trade_id）

| 銷售類 | 退貨類 | 特殊類 |
|--------|--------|--------|
| 1.一般 | 9.退貨 | 3.瑕疵 |
| 2.員工 | 10.物退 | 4.借出 |
| 5.調撥 | 15.換退 | 21.門市進貨 |
| 6.其他 | 16.門市退 | 22.轉倉 |
| 7.業務 | 17.宅退 | 61.新品 |
| 8.換貨新單 | 42.平台換退 | 71.退倉 |
| 11.拆單 | | 81.轉倉出貨 |
| 14.重出 | | 100.門市銷售 |
| 41.平台換貨 | | |

---

## 12. 客戶專屬模組

### Eccore Info 類（多租戶差異化）

| Info 類 | 客戶 | 專屬模組 |
|---------|------|----------|
| AdastriaInfo | Adastria | SIV, 倉儲, 庫存 |
| LevisInfo | Levis | RSP, SAP銷售, STKR |
| OwndaysInfo | OWNDAYS | 採購, POS |
| SabonInfo | Sabon | RSP |
| NPCInfo | NPC | 倉儲 |
| NSYInfo | NSY | 出貨標籤 |
| UCCInfo | UCC | 商品, 門市 |

### 客戶對照表

| 客戶 | 平台 | 專用模組 |
|------|------|----------|
| Levis | SAP | RSP, SAP銷售, STKR |
| Adastria | 專用 | SIV, 庫存, 倉儲 |
| OWNDAYS | POS | 採購, 庫存 |
| Doe | Digiwin | 採購, 倉儲 |
| L'Oréal | LINE Gift | 風控, 發票 |
| UCC | 專用 | 商品, 門市 |
| SWA | 專用 | 銷售, ASN |
| Toysrus | 專用 | 銷售, 倉儲 |
| Shimamura | 專用 | 採購, 入庫 |
| fmshoes | 專用 | Docker 獨立部署 |

---

## 13. 檔案交換

| 格式 | Library |
|------|---------|
| CSV | `libraries/CSV.php` |
| XML | `XML.php`, `XMLMaker.php`, `XMLTBC.php`, `XMLDKSH.php` |
| TXT | `libraries/TXT.php` |
| Excel | `SpoutExcel.php`（box/spout） |
| FTP/SFTP | `FTPS.php`, `FilesExchange.php` |

---

## 14. Observer / Webhook 事件

| Observer | 監控 |
|----------|------|
| OrdersProductsEvent | 訂單商品變更 |
| ProductsEvent / ProductsStockEvent | 商品/庫存 |
| PurchaseEvent / PurchaseHeaderEvent | 採購 |
| StockInHeader/BodyEvent | 入庫 |
| StockMovementEvent | 調撥 |
| T_ORDHADEvent | WMS 出貨單 |

Webhook: `OrdersWebhook` / `PurchaseHeaderWebhook` → 客戶系統

---

## 15. 已知持續問題

| 問題 | 來源 | 嚴重度 |
|------|------|--------|
| MomoClient.php null array | platform/MomoClient | 中 |
| Momo 節假日 SSL reset | platform/Momo | 低 |
| TOWMS airbu2 not_mapping_ORDTY | warehouse/ | 中 |
| TOWMS vacanza IMSSP | warehouse/ | 中 |
| levis Invalid CRON | schedule/ | 低 |
| sfl Route[login] 週期性爆發 | warehouse/BizWmsSFL | 中 |

---

## 16. 關鍵依賴

| 套件 | 用途 |
|------|------|
| `laravel/framework ^9.0` | 核心 |
| `guzzlehttp/guzzle ^7.0` | HTTP |
| `box/spout ^3.3` | Excel |
| `barryvdh/laravel-dompdf ^2.0` | PDF |
| `spatie/laravel-webhook-server ^3.8` | Webhook |
| `league/flysystem-aws-s3-v3 ^3.0` | S3 |
| `awobaz/compoships ^2.1` | 複合主鍵 |

---

## 17. 安全性

- JWT 認證（auth.jwt middleware）
- Webhook 簽名驗證
- 資料加密（EncyptModels/ + libraries/decrypt/）
- 風控引擎（BaseRiskCheck 系列）
- 客戶黑名單（CustomersBlacklist）
- Google reCAPTCHA V3

---

## 18. 新架構方向：BlackDog → 純 API 引擎（2026-03-11 定案）

> **核心決策**：將 BlackDog 推回純 API 引擎，前台框架完全解耦。
> 現有 React SPA 不廢棄，作為第一個 API consumer 持續利用。

### 架構演進概念

```mermaid
graph TB
    subgraph "Frontend Clients（自由選擇）"
        F1["🛒 Shopify Storefront<br/>Hydrogen / Liquid"]
        F2["⚛️ 現有 React SPA<br/>（持續利用）"]
        F3["📱 Mobile App<br/>React Native / Flutter"]
        F4["🏪 品牌白牌前台<br/>Next.js / Nuxt / Remix"]
        F5["🔌 第三方系統<br/>客戶自有 ERP / POS"]
    end

    subgraph "API Gateway Layer"
        GW["🔐 API Gateway<br/>Auth（JWT/OAuth2）| Rate Limit | Versioning<br/>Multi-tenant Routing"]
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
            SV1[AuthService] & SV2[MarketService] & SV3[PurchaseService] & SV4[ShipReturnService]
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

        subgraph "Repository + Models"
            RP["Repository Layer"]
            MD["Models 100+ | BizModels 33"]
        end
    end

    subgraph "External Integrations"
        EX1["鼎新 Digiwin ERP"]
        EX2["BizWMS 倉儲"]
        EX3["17 電商平台<br/>Momo/蝦皮/Shopify/..."]
        EX4["物流商<br/>宅配/超取"]
        EX5["發票系統"]
    end

    subgraph "Database Layer"
        DB1[("lifeerp<br/>MySQL")]
        DB2[("bizpro_wms<br/>MySQL")]
        DB3[("lifemall<br/>MySQL")]
        DB4[("MongoDB<br/>Logs")]
    end

    F1 & F2 & F3 & F4 & F5 -->|REST / GraphQL| GW
    GW --> A1 & A2 & A3 & A4 & A5 & A6
    A1 & A2 & A3 & A4 & A5 & A6 --> SV1 & SV2 & SV3 & SV4
    SV1 & SV2 & SV3 & SV4 --> E1 & E2 & E3 & E4 & E5 & E6 & E7 & E8
    E1 & E2 & E3 & E4 & E5 & E6 & E7 & E8 --> RP --> MD
    MD --> DB1 & DB2 & DB3 & DB4
    E2 --> EX3
    E3 --> EX2
    E4 --> EX4
    E1 --> EX1
    E7 --> EX5
```

### 現狀 vs 新架構對照

```mermaid
graph LR
    subgraph "現狀（Monolith）"
        direction TB
        NOW_FE["Blade + React SPA<br/>（綁定 Laravel）"]
        NOW_RT["routes/web.php<br/>routes/frontend.php<br/>routes/api.php"]
        NOW_BD["ERPBD 業務邏輯"]
        NOW_DB[("MySQL + MongoDB")]
        NOW_FE --> NOW_RT --> NOW_BD --> NOW_DB
    end

    subgraph "新架構（API Engine）"
        direction TB
        NEW_FE["任意前台框架<br/>React / Shopify / Mobile / ..."]
        NEW_GW["API Gateway<br/>JWT + Rate Limit + Versioning"]
        NEW_API["REST API Controllers<br/>（統一 /api/v2/*）"]
        NEW_BD["ERPBD 業務邏輯<br/>（不動）"]
        NEW_DB[("MySQL + MongoDB")]
        NEW_FE -->|HTTP| NEW_GW --> NEW_API --> NEW_BD --> NEW_DB
    end

    NOW_FE -.->|"演進"| NEW_FE
    NOW_BD -.->|"保留"| NEW_BD
```

### 遷移要點

| 項目 | 說明 |
|------|------|
| **ERPBD 層** | 不動。36 個模組 + 250 檔案是核心價值 |
| **現有 React SPA** | 保留，改打標準 API endpoint（第一個 consumer） |
| **Blade Templates** | 逐步淘汰，業務邏輯下沉到 ERPBD |
| **認證** | 已有 JWT（auth.jwt），擴充 OAuth2 for 第三方 |
| **API 版本** | 統一 `/api/v2/*`，未來 v3 不破壞 v2 |
| **routes/frontend.php** | 邏輯提取到 Service Layer，路由廢棄 |
| **routes/web.php** | 僅保留 OAuth callback / Swagger |
| **Multi-tenant** | 現有 Eccore/ 46 Info 類已支援，API Gateway 層統一路由 |

### 前台選型自由度

| 場景 | 推薦方案 | 理由 |
|------|---------|------|
| 品牌官網 | Shopify Hydrogen / Storefront API | Shopify 生態，SEO 友善 |
| LifeCOM 自營後台 | 現有 React SPA（漸進升級） | 最低成本，已存在 |
| Mobile App | React Native | 前端團隊技術棧一致 |
| 品牌白牌 | Next.js / Remix | SSR + 高自訂 |
| B2B 整合 | 純 API（無前台） | Digiwin/客戶 ERP 直串 |

---

## Notion 連結

- [產品知識庫主頁](https://www.notion.so/BlackDog-OMS-WMS-31fd2a91c73281bbbb39cec8d5301475)
- [架構圖集（Mermaid）](https://www.notion.so/Mermaid-31fd2a91c73281129450c42aed3e0902)
