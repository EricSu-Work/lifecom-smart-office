/**
 * upload_blackdog_3dogs_to_notion.js
 * 
 * BlackDog 三狗引擎 Mermaid 架構圖 → Notion 子頁面
 * 目標頁：31fd2a91-c732-81bb-bb39-cec8d5301475（LifeERPv2 產品知識庫）
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const PARENT_PAGE_ID = '31fd2a91-c732-81bb-bb39-cec8d5301475';
const TOKEN_PATH = path.join(process.env.USERPROFILE || process.env.HOME, '.config/notion/api_key');
const TOKEN = fs.readFileSync(TOKEN_PATH, 'utf8').trim();

function notionRequest(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'api.notion.com',
      path: urlPath,
      method,
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const req = https.request(opts, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`Notion ${res.statusCode}: ${body.substring(0, 300)}`));
        } else {
          resolve(JSON.parse(body));
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function heading(level, text) {
  return {
    type: `heading_${level}`,
    [`heading_${level}`]: {
      rich_text: [{ type: 'text', text: { content: text } }],
    },
  };
}

function paragraph(text) {
  return {
    type: 'paragraph',
    paragraph: {
      rich_text: [{ type: 'text', text: { content: text } }],
    },
  };
}

function code(language, content) {
  // Notion code block max 2000 chars
  return {
    type: 'code',
    code: {
      rich_text: [{ type: 'text', text: { content: content.substring(0, 2000) } }],
      language,
    },
  };
}

function divider() {
  return { type: 'divider', divider: {} };
}

async function createPage(parentId, title, icon, children) {
  return notionRequest('POST', '/v1/pages', {
    parent: { page_id: parentId },
    icon: { type: 'emoji', emoji: icon },
    properties: {
      title: { title: [{ type: 'text', text: { content: title } }] },
    },
    children: children.slice(0, 100),
  });
}

async function appendChildren(pageId, children) {
  // Notion limits 100 blocks per request
  for (let i = 0; i < children.length; i += 100) {
    const batch = children.slice(i, i + 100);
    await notionRequest('PATCH', `/v1/blocks/${pageId}/children`, { children: batch });
  }
}

// ─── Mermaid 圖定義 ───────────────────────────────────────────────

const DIAGRAMS = [
  {
    title: '1. 三狗引擎總覽',
    icon: '🐕',
    blocks: [
      heading(2, '三狗引擎架構總覽'),
      paragraph('BlackDog（後端引擎）+ WhiteDog（前端搜尋/清單/明細）+ YellowDog（前端上傳/檢視）三者透過 JSON API 協作，全部由 DB Metadata 驅動。'),
      code('mermaid', `graph TB
    subgraph DB["lifeerp Database（元資料層）"]
        FM[function_menu<br/>功能定義]
        FP[function_page<br/>頁面定義<br/>search / result_list / result_detail]
        FPF[function_page_field<br/>欄位定義<br/>table.column / type / options]
        FPA[function_page_action<br/>操作定義<br/>action_url / method]
        FM --> FP
        FP --> FPF
        FP --> FPA
    end

    subgraph BD["🐕‍🦺 BlackDog Engine（後端）"]
        API[ApiFunctionController]
        BF[BaseFunction<br/>元資料→SQL→JSON]
        BDC[BaseBDConnectorDefault<br/>業務邏輯連接器]
        API --> BDC --> BF
    end

    subgraph WD["🐕 WhiteDog Engine（前端）"]
        WD_S[搜尋頁面<br/>Search]
        WD_L[清單頁面<br/>List]
        WD_D[明細頁面<br/>Detail]
    end

    subgraph YD["🐕 YellowDog Engine（前端）"]
        YD_U[上傳頁面<br/>Upload]
        YD_V[檢視頁面<br/>View]
    end

    DB -.->|讀取元資料| BD
    BD ==>|JSON API| WD
    BD ==>|JSON API| YD
    WD -.->|用戶操作| BD
    YD -.->|資料寫入| BD

    classDef dbStyle fill:#4A90D9,color:#fff,stroke:#2D5F8A
    classDef bdStyle fill:#E74C3C,color:#fff,stroke:#C0392B
    classDef wdStyle fill:#27AE60,color:#fff,stroke:#1E8449
    classDef ydStyle fill:#F39C12,color:#fff,stroke:#D68910
    class FM,FP,FPF,FPA dbStyle
    class API,BF,BDC bdStyle
    class WD_S,WD_L,WD_D wdStyle
    class YD_U,YD_V ydStyle`),
      divider(),
    ],
  },
  {
    title: '2. BlackDog 引擎核心流程',
    icon: '🐕‍🦺',
    blocks: [
      heading(2, 'BlackDog 引擎核心流程'),
      paragraph('BlackDog 的核心是「元資料驅動」：從 function_menu 讀取定義 → 動態組裝 SQL → 回傳 JSON。不寫死任何欄位或查詢。'),
      code('mermaid', `sequenceDiagram
    participant WD as WhiteDog (React)
    participant API as ApiFunctionController
    participant BDC as BaseBDConnectorDefault
    participant BF as BaseFunction
    participant DB as lifeerp DB

    Note over WD,DB: Step 1: 取得頁面定義
    WD->>API: GET /api/function/getFrontendDef?menu=getOrderList
    API->>BF: getFunctionMenuDetail(url)
    BF->>DB: SELECT function_menu + pages + fields + actions
    DB-->>BF: 元資料（欄位定義、選項、驗證規則）
    BF-->>API: JSON Schema
    API-->>WD: { pages, fields, actions }

    Note over WD,DB: Step 2: 搜尋/清單查詢
    WD->>API: POST /api/function/searchList?menu=getOrderList
    API->>BDC: searchList(url, reqData)
    BDC->>BF: 讀取 page(type=search) 的 fields
    BF->>DB: 動態 SQL（WHERE 條件來自 reqData + field 定義）
    DB-->>BF: 查詢結果
    BF-->>BDC: data[]
    BDC-->>API: { data, pagination }
    API-->>WD: JSON（清單資料）

    Note over WD,DB: Step 3: 明細查詢
    WD->>API: POST /api/function/searchDetail?menu=getOrderList
    API->>BDC: searchDetail(url, reqData)
    BDC->>BF: 讀取 page(type=result_detail) + 子頁面
    BF->>DB: 主表 + 關聯表遞迴查詢
    DB-->>BF: 明細 + 子表資料
    BF-->>BDC: detailData
    BDC-->>WD: JSON（明細 + 子表）`),
      divider(),
    ],
  },
  {
    title: '3. Metadata 四表結構',
    icon: '📋',
    blocks: [
      heading(2, 'Metadata 四表結構（ER Diagram）'),
      paragraph('BlackDog 引擎的核心 = 這四張表。一個功能 = 一組 metadata，不是一組 code。'),
      code('mermaid', `erDiagram
    function_menu {
        int id PK
        string function_url UK "唯一功能識別（如 getOrderList）"
        string function_name "功能顯示名稱"
        int parent_id FK "父選單"
        int sort_order
        timestamp created_at
        timestamp deleted_at
    }

    function_page {
        int id PK
        int function_menu_id FK
        string page_type "search / result_list / result_detail"
        string page_name "頁面名稱"
        string page_main_model "對應 Eloquent Model"
        int parent_id FK "子頁面層級"
        json custom_relations "自定義 JOIN"
        int sort_order
        boolean is_show
    }

    function_page_field {
        int id PK
        int function_menu_id FK
        int function_page_id FK
        string field_table "資料表名"
        string field_column "欄位名"
        string field_type "text / select / date / TopChart..."
        string field_option_def "選項定義（CFG / LANG / 靜態）"
        string field_value_def "預設值"
        string field_url "關聯 URL"
        boolean required
        boolean read_only
        boolean is_show
        int sort_order
    }

    function_page_action {
        int id PK
        int function_menu_id FK
        int function_page_id FK
        string action_name "按鈕名稱"
        string action_url "對應 API endpoint"
        string action_method "GET / POST / PUT / DELETE"
        int sort_order
    }

    function_menu ||--o{ function_page : "has"
    function_page ||--o{ function_page_field : "has"
    function_page ||--o{ function_page_action : "has"
    function_menu ||--o{ function_page_field : "belongs to"
    function_menu ||--o{ function_page_action : "belongs to"`),
      divider(),
    ],
  },
  {
    title: '4. WhiteDog 前端渲染流程',
    icon: '🐕',
    blocks: [
      heading(2, 'WhiteDog 前端渲染流程'),
      paragraph('WhiteDog 是泛用前端引擎：不寫死任何頁面，所有 UI 從 BlackDog 的 JSON Schema 動態渲染。三種頁面模式對應三種 page_type。'),
      code('mermaid', `graph LR
    subgraph BlackDog["BlackDog API Response"]
        Schema["JSON Schema<br/>pages + fields + actions"]
    end

    subgraph WhiteDog["WhiteDog React Engine"]
        Router[Router<br/>function_url 路由]
        
        subgraph SearchPage["搜尋頁面 (page_type=search)"]
            SF[field 定義 → 搜尋表單<br/>text / select / date / range]
            SB[action 定義 → 搜尋按鈕]
        end

        subgraph ListPage["清單頁面 (page_type=result_list)"]
            LH[field 定義 → 表頭]
            LR[API 資料 → 表格行]
            LA[action 定義 → 行操作按鈕<br/>編輯/刪除/詳情]
            LP[分頁控制]
        end

        subgraph DetailPage["明細頁面 (page_type=result_detail)"]
            DM[主表欄位 → 表單]
            DS[子頁面 → 子表格<br/>遞迴渲染 children]
            DA[action 定義 → 操作按鈕<br/>儲存/取消/列印]
        end

        Router --> SearchPage
        SearchPage -->|搜尋結果| ListPage
        ListPage -->|點擊行| DetailPage
    end

    Schema ==> Router

    classDef search fill:#3498DB,color:#fff
    classDef list fill:#2ECC71,color:#fff
    classDef detail fill:#E67E22,color:#fff
    class SF,SB search
    class LH,LR,LA,LP list
    class DM,DS,DA detail`),
      divider(),
    ],
  },
  {
    title: '5. YellowDog 上傳/檢視引擎',
    icon: '🟡',
    blocks: [
      heading(2, 'YellowDog 上傳/檢視引擎'),
      paragraph('YellowDog 負責資料匯入（Excel/CSV 上傳）和資料檢視。同樣由 DB metadata 驅動欄位映射和驗證規則。'),
      code('mermaid', `graph TB
    subgraph YD["YellowDog Engine"]
        Upload[上傳模組]
        Validate[驗證模組]
        Preview[預覽模組]
        Import[匯入模組]
        View[檢視模組]
        
        Upload -->|解析檔案| Validate
        Validate -->|驗證通過| Preview
        Preview -->|確認匯入| Import
        Import -->|寫入 DB| Result[匯入結果]
    end

    subgraph Meta["DB Metadata"]
        FieldDef[field 定義<br/>欄位映射規則]
        ValidRule[驗證規則<br/>required / format / range]
        Template[匯入模板<br/>Excel 範本]
    end

    subgraph Source["資料來源"]
        Excel[Excel / CSV 檔案]
        API_In[API 匯入]
        Platform[平台資料同步<br/>Momo / Shopee / Shopify...]
    end

    Meta -.-> YD
    Source --> Upload
    
    subgraph ViewMode["檢視模式"]
        View --> TableView[表格檢視]
        View --> ChartView[圖表檢視<br/>TopChart / Charts]
        View --> ReportView[報表檢視<br/>SysBDReport]
    end

    classDef ydStyle fill:#F39C12,color:#fff
    classDef metaStyle fill:#8E44AD,color:#fff
    class Upload,Validate,Preview,Import,View ydStyle
    class FieldDef,ValidRule,Template metaStyle`),
      divider(),
    ],
  },
  {
    title: '6. 新功能建立流程',
    icon: '🔧',
    blocks: [
      heading(2, '新功能建立流程（Metadata-Driven）'),
      paragraph('新增一個 OMS 功能不需要寫 code：在 DB 四張表新增 metadata → 前端自動渲染。cpBlackDog() 可以一鍵複製整套功能。'),
      code('mermaid', `flowchart TD
    Start([需要新功能]) --> Choice{全新 or 複製?}
    
    Choice -->|複製既有| CP[cpBlackDog API<br/>指定 source function_url]
    CP --> CP1[複製 function_menu]
    CP1 --> CP2[複製所有 function_page]
    CP2 --> CP3[複製所有 field + action<br/>自動替換 URL]
    CP3 --> Done

    Choice -->|全新建立| New[function_menu<br/>定義 function_url + 名稱]
    New --> Pages[function_page<br/>建立頁面<br/>search + result_list + result_detail]
    Pages --> Fields[function_page_field<br/>定義每個欄位<br/>table.column + type + options]
    Fields --> Actions[function_page_action<br/>定義操作按鈕<br/>action_url + method]
    Actions --> Done

    Done([完成！前端自動渲染]) --> Test{測試}
    Test -->|OK| Deploy[上線]
    Test -->|調整| Fields

    style Start fill:#27AE60,color:#fff
    style Done fill:#27AE60,color:#fff
    style CP fill:#3498DB,color:#fff
    style New fill:#E67E22,color:#fff`),
      divider(),
    ],
  },
  {
    title: '7. 平台整合架構',
    icon: '🔌',
    blocks: [
      heading(2, '平台整合架構（17 個電商/物流平台）'),
      paragraph('所有平台整合都走 PlatformInterface 抽象介面，每個平台一組 Client（API 呼叫）+ 業務邏輯（規則映射）。'),
      code('mermaid', `graph TB
    subgraph Core["BlackDog OMS Core"]
        OF[OrderFlow<br/>訂單流程引擎]
        WH[Warehouse<br/>倉儲管理]
        LG[Logistics<br/>物流配送]
    end

    subgraph Interface["PlatformInterface 抽象層"]
        PI[getOrders / updateShipping<br/>getProducts / updateStock<br/>updateInvoice]
    end

    subgraph Platforms["電商平台 (11)"]
        P1[Momo + MomoStorePlus]
        P2[Shopee V2]
        P3[Shopify]
        P4[Shopline]
        P5[PCHome]
        P6[Yahoo 購物 + 超商]
        P7[ETMall]
        P8[LINE Gift]
        P9[91APP]
        P10[Cyberbiz]
    end

    subgraph B2B["B2B / ERP (3)"]
        B1[Adastria]
        B2[Digiwin 鼎新]
        B3[Owndays]
    end

    subgraph File["檔案匯入 (2)"]
        F1[DefaultFileClient]
        F2[FileClientWithDataCheck]
    end

    subgraph WMS["WMS 整合"]
        W1[BizWMS<br/>SQL Server]
        W2[LifeTMS<br/>物流管理]
    end

    Core <--> Interface
    Interface <--> Platforms
    Interface <--> B2B
    Interface <--> File
    Core <--> WMS

    classDef core fill:#E74C3C,color:#fff
    classDef plat fill:#3498DB,color:#fff
    classDef b2b fill:#8E44AD,color:#fff
    classDef wms fill:#27AE60,color:#fff
    class OF,WH,LG core
    class P1,P2,P3,P4,P5,P6,P7,P8,P9,P10 plat
    class B1,B2,B3 b2b
    class W1,W2 wms`),
      divider(),
    ],
  },
  {
    title: '8. 資料庫架構',
    icon: '🗄️',
    blocks: [
      heading(2, '資料庫架構（7 個資料庫連線）'),
      paragraph('BlackDog 連接 7 個資料庫，主要業務在 lifeerp（MySQL），WMS 在 bizwms（SQL Server），前台在 lifeMall + blackdog。'),
      code('mermaid', `graph TB
    subgraph App["BlackDog Laravel App"]
        Config[config/database.php<br/>7 connections]
    end

    subgraph MySQL["MySQL Cluster"]
        DB1[(lifeerp<br/>核心 OMS<br/>訂單/商品/客戶/庫存<br/>+ 元資料四張表)]
        DB2[(blackdog<br/>前台系統)]
        DB3[(lifeMall<br/>電商前台)]
        DB4[(encypt_lifeerp<br/>加密敏感資料)]
    end

    subgraph External["外部資料庫"]
        DB5[(bizwms<br/>SQL Server<br/>WMS 倉儲管理)]
        DB6[(pgsql<br/>PostgreSQL<br/>輔助)]
        DB7[(myMongodb<br/>MongoDB<br/>文件/日誌)]
    end

    Config --> DB1
    Config --> DB2
    Config --> DB3
    Config --> DB4
    Config --> DB5
    Config --> DB6
    Config --> DB7

    DB1 -.->|元資料驅動| App
    DB5 -.->|WMS 整合| App

    classDef mysql fill:#00758F,color:#fff
    classDef ext fill:#4DB33D,color:#fff
    class DB1,DB2,DB3,DB4 mysql
    class DB5,DB6,DB7 ext`),
      divider(),
    ],
  },
  {
    title: '9. 部署架構',
    icon: '🚀',
    blocks: [
      heading(2, '部署架構（GCP Cloud Build + K8s Multi-Tenant）'),
      paragraph('每個客戶一組 K8s deployment，共用程式碼，靠環境變數隔離。部署透過 Bitbucket → GCP Cloud Build → K8s。'),
      code('mermaid', `graph LR
    subgraph Dev["開發"]
        FE[feature/VSTS* branch]
        HF[hotfix/HOTFIX* branch]
    end

    subgraph Git["Bitbucket"]
        DEV[develop branch]
        MASTER[master branch]
        FE -->|PR merge| DEV
        HF -->|PR merge| MASTER
    end

    subgraph Build["GCP Cloud Build"]
        CB[cloudbuild.yaml<br/>Docker Build + Push]
    end

    subgraph K8s["Kubernetes Cluster"]
        subgraph T1["Tenant: Relove"]
            D1[Deployment<br/>env: RELOVE]
            R1[Redis]
        end
        subgraph T2["Tenant: SFL"]
            D2[Deployment<br/>env: SFL]
            R2[Redis]
        end
        subgraph T3["Tenant: NikeGolf"]
            D3[Deployment<br/>env: NIKEGOLF]
            R3[Redis]
        end
        TN["... 20+ tenants"]
    end

    subgraph Notify["通知"]
        Slack[Slack #deploy<br/>C03FSJ3PQKD]
    end

    DEV --> CB
    MASTER --> CB
    CB --> K8s
    CB --> Notify

    classDef dev fill:#9B59B6,color:#fff
    classDef build fill:#E67E22,color:#fff
    classDef k8s fill:#2ECC71,color:#fff
    class FE,HF dev
    class CB build
    class D1,D2,D3 k8s`),
      divider(),
    ],
  },
];

// ─── Main ─────────────────────────────────────────────────────────

async function main() {
  console.log(`Creating ${DIAGRAMS.length} pages under ${PARENT_PAGE_ID}...`);
  
  // Create main index page
  const indexChildren = [
    heading(1, '🐕 BlackDog 三狗引擎架構圖集'),
    paragraph('BlackDog OMS 的核心設計是 Metadata-Driven Architecture：一個功能 = 一組 metadata，不是一組 code。'),
    paragraph('三狗引擎：BlackDog（後端 DB→JSON）+ WhiteDog（前端 JSON→UI）+ YellowDog（上傳/檢視）'),
    divider(),
    heading(2, '架構圖索引'),
  ];

  for (const d of DIAGRAMS) {
    indexChildren.push(paragraph(`${d.icon} ${d.title}`));
  }
  
  indexChildren.push(divider());
  indexChildren.push(paragraph('更新日期：2026-03-10'));

  const mainPage = await createPage(PARENT_PAGE_ID, '三狗引擎架構圖集（Mermaid）', '🐕', indexChildren);
  const mainPageId = mainPage.id;
  console.log(`Main page: https://www.notion.so/${mainPageId.replace(/-/g, '')}`);

  // Create sub-pages
  for (const d of DIAGRAMS) {
    try {
      const page = await createPage(mainPageId, d.title, d.icon, d.blocks);
      console.log(`  ✅ ${d.title}: https://www.notion.so/${page.id.replace(/-/g, '')}`);
      // Rate limit
      await new Promise(r => setTimeout(r, 500));
    } catch (e) {
      console.error(`  ❌ ${d.title}: ${e.message}`);
    }
  }

  console.log(`\n🔗 Main page: https://www.notion.so/${mainPageId.replace(/-/g, '')}`);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
