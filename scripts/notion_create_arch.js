/**
 * notion_create_arch.js
 * 在 Notion LifeCOM Works 建立「智慧營運架構圖」頁面
 */
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const TOKEN     = fs.readFileSync(path.join(process.env.USERPROFILE, '.config/notion/api_key'), 'utf8').trim();
const PARENT_ID = '4bc121cd-b560-4fb9-acc8-08a9887c42ad'; // LifeCOM Works

function notionPost(apiPath, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request({
      hostname: 'api.notion.com', path: apiPath, method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + TOKEN,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ── Block builders ─────────────────────────────────────────────────────────
const h1  = t => ({ object: 'block', type: 'heading_1',   heading_1:   { rich_text: [{ type: 'text', text: { content: t } }] } });
const h2  = t => ({ object: 'block', type: 'heading_2',   heading_2:   { rich_text: [{ type: 'text', text: { content: t } }] } });
const h3  = t => ({ object: 'block', type: 'heading_3',   heading_3:   { rich_text: [{ type: 'text', text: { content: t } }] } });
const p   = t => ({ object: 'block', type: 'paragraph',   paragraph:   { rich_text: [{ type: 'text', text: { content: t } }] } });
const div = () => ({ object: 'block', type: 'divider', divider: {} });
const code = (lang, content) => ({
  object: 'block', type: 'code',
  code: { language: lang, rich_text: [{ type: 'text', text: { content } }] }
});

// ── Mermaid diagrams ────────────────────────────────────────────────────────
const ARCH_OVERVIEW = `graph TB
    CEO["🧠 CEO 智慧作業系統\\nAI Agent - OpenClaw"]

    subgraph 資料源層
        DS1["📊 立富康發票 xlsx\\n月度財務/應收"]
        DS2["📁 業務專案文件 xlsx\\n客戶/報價/AR/需求"]
        DS3["📝 Notion Company DB\\n維運/授權/人資"]
        DS4["🔧 Azure DevOps\\n工程交付/工單"]
        DS5["💬 Slack\\n系統告警/部署"]
        DS6["📧 Gmail / Calendar\\n郵件/行程"]
    end

    subgraph 模組層
        M1["💰 finance_section.js\\n月度財務/MoM/YoY"]
        M2["📋 ar_section.js\\n應收帳款/帳齡 ✴️待建"]
        M3["📈 sales_section.js\\n銷售管道/報價 ✴️待建"]
        M4["👥 customer_health.js\\n客戶健康燈號 ✴️待建"]
        M5["⚙️ ado_feature/bug/epic\\n工程交付/工單"]
        M6["🗄️ notion_client.js\\n授權進度/人資/費用"]
    end

    subgraph 報告輸出
        R1["📊 CEO 日報\\n每日 08:00"]
        R2["🔧 CTO 日報\\n每日 08:15"]
        R3["👩‍💼 客成日報\\n每日 08:30"]
        R4["📅 月度策略報告\\n每月 1日"]
        R5["🚨 即時告警\\n觸發式"]
    end

    DS1 --> M1
    DS2 --> M2 & M3 & M4
    DS3 --> M4 & M6
    DS4 --> M5
    DS5 --> R5

    M1 & M2 & M3 & M4 & M5 --> R1
    M5 & M6 --> R2
    M4 & M6 --> R3
    R1 & R2 & R3 --> R4`;

const DATAFLOW = `flowchart LR
    subgraph 外部資料
        E1["Google Drive\\nbiz-projects.xlsx"]
        E2["Google Drive\\n立富康 115.xlsx"]
        E3["Notion API"]
        E4["ADO REST API"]
        E5["Slack API"]
    end

    subgraph 本地快取 workspace/data
        C1["biz-projects.xlsx\\n每日更新"]
        C2["invoice_2026.xlsx\\n每4小時"]
        C3["notion DB\\n即時查詢"]
        C4["deploy-cursor.json"]
    end

    subgraph 模組 scripts/
        P1["finance_section.js ✅"]
        P2["ar_section.js 🔧"]
        P3["sales_section.js 🔧"]
        P4["customer_health.js 🔧"]
        P5["ado_feature_section.js ✅"]
        P6["ado_bug_section.js ✅"]
        P7["ado_epic_section.js ✅"]
        P8["notion_client.js ✅"]
    end

    subgraph 報告產生器
        O1["generate_ceo_report.js"]
        O2["generate_cto_report.js"]
        O3["generate_cs_report.js"]
    end

    E1 --> C1 --> P2 & P3 & P4
    E2 --> C2 --> P1
    E3 --> P8 --> P4
    E4 --> P5 & P6 & P7
    E5 --> O1

    P1 & P2 & P3 & P4 & P5 & P6 & P7 --> O1
    P5 & P6 & P7 --> O2
    P4 & P6 --> O3`;

const CUSTOMER_HEALTH = `flowchart TD
    CL["客戶 Client"]

    CL --> D1{"ADO Bug 近14天"}
    CL --> D2{"ADO Epic 維運帳齡"}
    CL --> D3{"應收帳款逾期天數"}
    CL --> D4{"API授權到期狀態"}
    CL --> D5{"Feature 逾期項目"}

    D1 -->|">5筆"| R1["🔴"]
    D1 -->|"1-5筆"| Y1["🟡"]
    D1 -->|"0筆"| G1["🟢"]

    D2 -->|">180天"| R2["🔴"]
    D2 -->|"30-180天"| Y2["🟡"]
    D2 -->|"<30天"| G2["🟢"]

    D3 -->|">90天"| R3["🔴"]
    D3 -->|"30-90天"| Y3["🟡"]
    D3 -->|"<30天"| G3["🟢"]

    D4 -->|"已過期"| R4["🔴"]
    D4 -->|"30天內到期"| Y4["🟡"]
    D4 -->|"正常"| G4["🟢"]

    D5 -->|">3項逾期"| R5["🔴"]
    D5 -->|"1-3項"| Y5["🟡"]
    D5 -->|"0項"| G5["🟢"]

    R1 & R2 & R3 & R4 & R5 --> FINAL{"任一🔴?"}
    FINAL -->|是| RED["🔴 高風險\\n立即通知 CEO"]
    FINAL -->|否| MID{"多個🟡?"}
    MID -->|是| YEL["🟡 需關注\\n含入日報"]
    MID -->|否| GRN["🟢 健康"]`;

const CEO_SEQUENCE = `sequenceDiagram
    participant CR as Cron 08:00
    participant GEN as generate_ceo_report.js
    participant MOD as 各 Section 模組
    participant DS as 資料源
    participant DM as Eric Slack DM
    participant EMAIL as Email

    CR->>GEN: 觸發（--preview 草稿模式）
    GEN->>DS: 並行取資料
    DS-->>MOD: 財務/AR/銷售/客戶/ADO/告警
    MOD-->>GEN: 各區塊內容
    GEN->>DM: 發送草稿
    Note over DM: 草稿底部：有調整嗎？\\n沒問題說「發送」
    DM->>GEN: Eric：「發送」
    GEN->>EMAIL: 正式版 Email 寄出
    GEN->>DM: ✅ 已發送`;

const GANTT = `gantt
    title LifeCOM 智慧營運系統 實作計畫
    dateFormat  YYYY-MM-DD
    section ✅ 已完成
    CEO/CTO/客成日報框架     :done, d1, 2026-02-25, 2026-03-03
    財務模組 finance_section  :done, d2, 2026-03-03, 1d
    Notion API 整合          :done, d3, 2026-03-03, 1d

    section 🔧 Phase 1 本週
    F-01 應收帳款 ar_section  :active, f01, 2026-03-03, 2d
    S-01 銷售管道 sales       :s01, after f01, 2d
    C-01 客戶健康 health      :c01, after s01, 1d
    C-02 API授權到期提醒      :c02, 2026-03-03, 1d

    section 📋 Phase 2 下週
    E-01 工程 KPI 週報        :e01, 2026-03-10, 3d
    E-02 技術債看板           :e02, after e01, 2d
    H-01 工程師負載           :h01, 2026-03-10, 2d

    section 📋 Phase 3 三月底
    F-03 P&L 月報框架         :f03, 2026-03-17, 5d
    薪資費用資料接入          :salary, 2026-03-24, 5d

    section 📋 Phase 4 四月
    月度策略報告              :m01, 2026-04-01, 10d
    OKR 追蹤模組             :okr, 2026-04-01, 7d`;

const PRODUCT_PIE = `pie title 客戶產品使用分布（57家）
    "LifeERPv2" : 23
    "LifeERP" : 11
    "LifeERPv2 + 代運營" : 4
    "WMS" : 4
    "代運營" : 2
    "其他" : 13`;

// ── 建立頁面 ────────────────────────────────────────────────────────────────
async function main() {
  const page = {
    parent: { page_id: PARENT_ID },
    icon: { type: 'emoji', emoji: '🏗️' },
    properties: {
      title: { title: [{ type: 'text', text: { content: 'LifeCOM 智慧營運系統 — 完整架構圖 v1.0' } }] }
    },
    children: [
      p('📅 建立：2026-03-03 | 🔄 版本：v1.0 | 🤖 維護：AI Agent'),
      p('本文件描述以 AI Agent 為核心的智慧營運系統完整架構，涵蓋資料源、模組層、報告輸出與自動化流程。'),
      div(),

      h1('一、系統總覽架構'),
      code('mermaid', ARCH_OVERVIEW),
      div(),

      h1('二、資料流設計'),
      code('mermaid', DATAFLOW),
      div(),

      h1('三、客戶健康燈號邏輯'),
      code('mermaid', CUSTOMER_HEALTH),
      div(),

      h1('四、CEO 日報產生流程'),
      code('mermaid', CEO_SEQUENCE),
      div(),

      h1('五、實作進度甘特圖'),
      code('mermaid', GANTT),
      div(),

      h1('六、產品使用分布'),
      code('mermaid', PRODUCT_PIE),
      div(),

      h1('七、資料源盤點'),
      h2('業務專案文件 xlsx（Google Drive）'),
      p('• 客戶基本資料：57 家（公司行號 / 窗口 / Email / 地址）'),
      p('• 客戶使用產品：LifeERPv2 23家、LifeERP 11家、代運營 5家'),
      p('• 客戶應收催收：NT$2,072,850 應收記錄'),
      p('• 需求單 Feature：40 筆歷史需求'),
      p('• 報價單 Quote：49 筆，11 筆未回簽（潛在 NT$536,400+）'),
      h2('Notion Company DB'),
      p('• 客戶總覽：57 家 | 授權進度：6 筆（3 家 API 已過期）'),
      p('• 尚未到款項：NT$244,614+ | CSM/OP 費用 DB'),
      h2('Azure DevOps'),
      p('• Feature：~100 項，20+ 逾期（最久 355 天）'),
      p('• Epic 維運工單：33 客戶全紅，EMERS 積壓 20 項（371 天）'),
      p('• Bug：近14天 71 筆'),
      h2('立富康財務 xlsx'),
      p('• 2026/03 經常性收入：NT$1,578,732 | MoM ▲3.3% | YoY ▲2.9%'),
      p('• Q1 累計 NT$4,766,116（YoY ▲10.8%）'),
      div(),

      h1('八、立即行動清單'),
      p('🔴 今日：建立 JS/鼎恆/Swarovski Yahoo API 過期 ACT 追蹤'),
      p('🔴 今日：確認天傳/Relove 尚未到款項是否為實際未收'),
      p('🔧 本週：ar_section.js → sales_section.js → customer_health.js'),
      p('📋 下週：工程 KPI 週報、技術債看板、工程師負載'),
      p('📋 三月底：P&L 月報框架（需確認薪資費用資料接入方式）'),
    ]
  };

  const r = await notionPost('/v1/pages', page);
  if (r.id) {
    console.log('✅ 建立成功！');
    console.log('頁面 ID:', r.id);
    console.log('URL:', r.url);
  } else {
    console.error('❌ 失敗:', JSON.stringify(r).substring(0, 500));
  }
}

main().catch(e => console.error('Error:', e.message));
