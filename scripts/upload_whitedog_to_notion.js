/**
 * 更新 WhiteDog 前端架構圖到 Notion
 * 替換原本錯誤的 WhiteDog 頁面，用實際原始碼分析結果
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const TOKEN = fs.readFileSync(path.join(process.env.USERPROFILE, '.config/notion/api_key'), 'utf8').trim();
// 三狗引擎圖集主頁
const PARENT_PAGE_ID = '31fd2a91-c732-8161-b2e6-edb7a95beb4c';

function notionReq(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'api.notion.com', path: urlPath, method,
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const req = https.request(opts, res => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => {
        if (res.statusCode >= 400) reject(new Error(`Notion ${res.statusCode}: ${b.substring(0, 300)}`));
        else resolve(JSON.parse(b));
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const h = (level, text) => ({ type: `heading_${level}`, [`heading_${level}`]: { rich_text: [{ type: 'text', text: { content: text } }] } });
const p = (text) => ({ type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: text } }] } });
const cd = (lang, content) => ({ type: 'code', code: { rich_text: [{ type: 'text', text: { content: content.substring(0, 2000) } }], language: lang } });
const div = () => ({ type: 'divider', divider: {} });
const bullet = (text) => ({ type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ type: 'text', text: { content: text } }] } });

async function createPage(parentId, title, icon, children) {
  return notionReq('POST', '/v1/pages', {
    parent: { page_id: parentId },
    icon: { type: 'emoji', emoji: icon },
    properties: { title: { title: [{ type: 'text', text: { content: title } }] } },
    children: children.slice(0, 100),
  });
}

const PAGES = [
  {
    title: '4. WhiteDog 前端引擎（React 原始碼分析）',
    icon: '🐕',
    blocks: [
      h(2, 'WhiteDog — React 前端渲染引擎'),
      p('WhiteDog 是 BlackDog 的前端對應，位於 resources/src/。它是一套泛用 React 引擎，不寫死任何頁面 — 所有 UI 從 BlackDog API 的 JSON 動態渲染。'),
      p('技術棧：React (Class Component) + reactstrap + react-router-dom + react-table + jQuery + XLSX'),
      div(),
      h(3, '核心元件架構'),
      cd('mermaid', `graph TB
    subgraph Entry["入口層"]
        Admin["layouts/Admin.js<br/>動態路由載入<br/>從 API 取選單結構"]
        Routes["routes.js<br/>adminRoutes 映射表<br/>component name → React class"]
    end

    subgraph Pages["頁面層（三狗分工）"]
        FP["🐕 FunctionsPages.js<br/>WhiteDog 核心入口<br/>搜尋 / 清單 / 明細"]
        UP["🟡 UploadPages.js<br/>YellowDog 核心入口<br/>上傳 / 檢視"]
        SP["🔍 FunctionScanPage.js<br/>掃碼作業專用頁面"]
        DB["📊 FunctionsDashboard.js<br/>Dashboard 儀表板"]
    end

    subgraph Core["WhiteDog 核心元件"]
        CT["CommonTab.js<br/>Tab 控制器<br/>page_type → 對應元件"]
        CF["CommonForm.js<br/>搜尋表單渲染<br/>field 定義 → 表單欄位"]
        CET["CommonEditTable.js<br/>清單/可編輯表格<br/>含 XLSX 匯出"]
        ET["EditTable.js<br/>React Table 包裝"]
        LI["LabelInput.js<br/>欄位渲染器<br/>text/select/date/checkbox"]
    end

    subgraph Support["支援元件"]
        CM["CommonModal.js<br/>彈窗明細"]
        CMT["CommonModalTab.js<br/>彈窗 Tab"]
        TC["TopCharts.js<br/>圖表渲染"]
        F["Filter.js<br/>篩選器"]
    end

    Admin --> Routes --> Pages
    FP --> CT
    CT --> CF
    CT --> CET
    CET --> ET
    CF --> LI
    CET --> CM --> CMT
    CET --> TC

    classDef whitedog fill:#27AE60,color:#fff
    classDef yellowdog fill:#F39C12,color:#fff
    classDef core fill:#3498DB,color:#fff
    class FP,CT,CF,CET,ET,LI whitedog
    class UP yellowdog
    class SP,DB core`),
      div(),
      h(3, 'WhiteDog 渲染流程（Sequence Diagram）'),
      cd('mermaid', `sequenceDiagram
    participant User as 使用者
    participant Admin as Admin.js (Layout)
    participant FP as FunctionsPages.js
    participant CT as CommonTab.js
    participant CF as CommonForm.js
    participant CET as CommonEditTable.js
    participant API as BlackDog API

    Note over Admin,API: 1. 載入頁面（動態路由）
    Admin->>API: GET /api/function/menu (取選單)
    API-->>Admin: [{ path, name, component, apiUrl }]
    Admin->>FP: render(apiUrl="/api/function/getFrontendDef?menu=X")

    Note over FP,API: 2. 取得頁面定義
    FP->>API: POST apiUrl (getFrontendDef)
    API-->>FP: { function_name, function_page[] }
    FP->>CT: pageData = function_page[]

    Note over CT,API: 3. 渲染 Tab（page_type 決定）
    CT->>CF: page_type="search" → 渲染搜尋表單
    Note over CF: field_type → LabelInput 元件<br/>text / select / date / checkbox

    Note over User,API: 4. 使用者搜尋
    User->>CF: 填寫條件 → 送出
    CF->>API: POST searchList(reqData)
    API-->>CET: { function_page_value: rows[] }

    Note over CT,CET: 5. 渲染清單
    CT->>CET: page_type="result_list" → 渲染表格
    Note over CET: field 定義 → 欄位 header<br/>field_option_def → 值映射<br/>支援 XLSX 匯出

    Note over User,API: 6. 點擊行 → 明細
    User->>CET: 點擊某行
    CET->>API: POST searchDetail(reqData)
    API-->>CT: page_type="result_detail" + children
    CT->>CF: 主表 → 表單（read_only）
    CT->>CET: 子表 → 子表格（可編輯）`),
      div(),
      h(3, 'WhiteDog 檔案結構'),
      cd('plain text', `resources/src/                    # WhiteDog + YellowDog 前端
├── index.js                      # React 進入點
├── routes.js                     # component name → React class 映射
├── layouts/
│   ├── Admin.js                  # 主版面（動態選單 + 路由）
│   └── Auth.js                   # 登入版面
├── views/
│   ├── functions/
│   │   └── FunctionsPages.js     # 🐕 WhiteDog 核心入口
│   ├── upload/
│   │   ├── UploadPages.js        # 🟡 YellowDog 核心入口
│   │   └── components/           # UploadForm + UploadTab + UploadResult
│   ├── components/               # WhiteDog 泛用元件
│   │   ├── CommonTab.js          # Tab 控制（page_type 路由）
│   │   ├── CommonForm.js         # 搜尋/明細表單渲染
│   │   ├── CommonEditTable.js    # 可編輯表格（含 XLSX）
│   │   ├── EditTable.js          # React Table 底層
│   │   ├── LabelInput.js         # 欄位渲染器
│   │   ├── CommonModal.js        # 彈窗明細
│   │   ├── TopCharts.js          # 圖表
│   │   └── Filter.js             # 篩選器
│   ├── FunctionScanPage.js       # 掃碼作業
│   ├── FunctionsDashboard.js     # 儀表板
│   ├── customersChart/           # 圖表元件
│   ├── orders/                   # 訂單專用頁面（已棄用，改走 FunctionsPages）
│   └── pages/                    # 登入/錯誤/個人資料
├── includes/
│   ├── Functions.js              # axiosGet/axiosPost + 工具函式
│   ├── GlobelVar.js              # 全域常數
│   ├── Auth.js                   # JWT 認證
│   ├── ScanProduct.js            # 掃碼邏輯
│   └── PrintPDF.js               # 列印
└── components/                   # UI 框架元件
    ├── Sidebar/                  # 側邊選單
    ├── Navbars/                  # 導航列
    └── ReactTable/               # 表格元件`),
      div(),
      h(3, '關鍵設計原則'),
      bullet('FunctionsPages.js 是 WhiteDog 的唯一入口 — 所有 OMS 功能共用同一個 React Component'),
      bullet('apiUrl 決定一切：不同的 function_url → 不同的頁面定義 → 不同的 UI'),
      bullet('CommonTab 依 page_type 分派：search → CommonForm / result_list → CommonEditTable / result_detail → CommonForm(readonly)'),
      bullet('LabelInput 是最小渲染單元：一個 field 定義 → 一個表單欄位（text/select/date/checkbox/anyOf）'),
      bullet('動態選單：Admin.js 從 API 取選單結構，不是寫死在 routes.js'),
      bullet('Orders 頁面已棄用（被註解），全部改走泛用的 FunctionsPages'),
    ],
  },
  {
    title: '5. YellowDog 上傳引擎（React 原始碼分析）',
    icon: '🟡',
    blocks: [
      h(2, 'YellowDog — React 上傳/檢視引擎'),
      p('YellowDog 負責資料匯入和檢視，位於 resources/src/views/upload/。與 WhiteDog 共存於同一 codebase，但走不同的入口和元件。'),
      div(),
      h(3, 'YellowDog 元件架構'),
      cd('mermaid', `graph TB
    subgraph YD["YellowDog Engine"]
        UP["UploadPages.js<br/>YellowDog 入口<br/>Hooks 寫法（較新）"]
        
        subgraph Components["YellowDog 元件"]
            UF["UploadForm.js<br/>上傳表單<br/>檔案選擇 + 平台選擇"]
            UT["UploadTab.js<br/>Tab 控制<br/>步驟切換"]
            UR["UploadResult.js<br/>匯入結果<br/>成功/失敗/統計"]
        end

        UP --> UT
        UT --> UF
        UT --> UR
    end

    subgraph API["BlackDog API"]
        GetDef["GET uploadDef<br/>取上傳定義<br/>company + mktList + uploadList"]
        PostUpload["POST upload<br/>送出資料"]
    end

    subgraph Flow["上傳流程"]
        S1["Step 1: 選擇上傳類型<br/>（uploadList 定義）"]
        S2["Step 2: 選擇檔案<br/>Excel / CSV"]
        S3["Step 3: 預覽資料<br/>（前端解析）"]
        S4["Step 4: 確認匯入<br/>送 BlackDog API"]
        S5["Step 5: 顯示結果<br/>成功 / 失敗 / 統計"]
    end

    API --> UP
    S1 --> S2 --> S3 --> S4 --> S5

    classDef yd fill:#F39C12,color:#fff
    classDef api fill:#E74C3C,color:#fff
    class UP,UF,UT,UR yd
    class GetDef,PostUpload api`),
      div(),
      h(3, 'WhiteDog vs YellowDog 對比'),
      cd('mermaid', `graph LR
    subgraph WD["🐕 WhiteDog"]
        WD1["FunctionsPages.js<br/>Class Component"]
        WD2["功能：搜尋 / 清單 / 明細"]
        WD3["資料流：API → JSON → 動態渲染"]
        WD4["元件：CommonTab → CommonForm<br/>→ CommonEditTable"]
    end

    subgraph YD["🟡 YellowDog"]
        YD1["UploadPages.js<br/>Function Component (Hooks)"]
        YD2["功能：上傳 / 預覽 / 匯入"]
        YD3["資料流：檔案 → 前端解析 → API"]
        YD4["元件：UploadTab → UploadForm<br/>→ UploadResult"]
    end

    subgraph BD["🐕‍🦺 BlackDog (共用後端)"]
        BD1["getFrontendDef / searchList<br/>searchDetail / updateDetail"]
        BD2["uploadDef / upload"]
    end

    WD -.->|讀取資料| BD1
    YD -.->|寫入資料| BD2

    classDef wd fill:#27AE60,color:#fff
    classDef yd fill:#F39C12,color:#fff
    classDef bd fill:#E74C3C,color:#fff
    class WD1,WD2,WD3,WD4 wd
    class YD1,YD2,YD3,YD4 yd
    class BD1,BD2 bd`),
      div(),
      h(3, 'YellowDog 技術特點'),
      bullet('使用 React Hooks（useState/useEffect），比 WhiteDog 的 Class Component 更新'),
      bullet('前端解析 Excel（XLSX library），不需送到後端才處理'),
      bullet('三步驟流程：選擇類型 → 上傳檔案 → 顯示結果'),
      bullet('平台選擇（mktList）和上傳類型（uploadList）都從 API 動態取得'),
    ],
  },
];

async function main() {
  // 先刪除舊的錯誤頁面（4. WhiteDog 和 5. YellowDog）
  // 取得主頁的子頁面列表
  const children = await notionReq('GET', `/v1/blocks/${PARENT_PAGE_ID}/children?page_size=100`);
  for (const block of children.results) {
    if (block.type === 'child_page') {
      const title = block.child_page?.title || '';
      if (title.includes('4. WhiteDog') || title.includes('5. YellowDog')) {
        console.log(`Archiving old: ${title}`);
        await notionReq('PATCH', `/v1/pages/${block.id}`, { archived: true });
        await new Promise(r => setTimeout(r, 300));
      }
    }
  }

  // 建新頁面
  for (const pg of PAGES) {
    try {
      const page = await createPage(PARENT_PAGE_ID, pg.title, pg.icon, pg.blocks);
      console.log(`✅ ${pg.title}: https://www.notion.so/${page.id.replace(/-/g, '')}`);
      await new Promise(r => setTimeout(r, 500));
    } catch (e) {
      console.error(`❌ ${pg.title}: ${e.message}`);
    }
  }

  console.log(`\n🔗 圖集主頁: https://www.notion.so/${PARENT_PAGE_ID.replace(/-/g, '')}`);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
