/**
 * update_shopify_cvs_spec.js
 * 在 Notion CVS App SPEC 頁面追加 SubAgent 架構 + Skills 規劃
 */
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const TOKEN   = fs.readFileSync(path.join(process.env.USERPROFILE, '.config/notion/api_key'), 'utf8').trim();
const PAGE_ID = '31ad2a91-c732-815f-a945-c17f30023336'; // CVS App SPEC 頁面

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
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
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
    divider(),

    h2('🤖 AI-DLC 開發架構 — SubAgent 規劃'),
    callout('本專案採用 AI-DLC 五階段流程（SPEC → REVIEW → BUILD → VERIFY → DEPLOY），以 SubAgent 取代傳統人力執行各工作包。', '🚀'),

    h3('人力類型 → SubAgent 對應'),
    bullet('PM Agent（啊斗）：讀 SPEC、拆 Tasks、協調 SubAgents、DLC 門控、回報進度'),
    bullet('Backend Agent：W1 架手架 + DB、W2 全家串接、W5 Order Metafield、W6 7-11 串接'),
    bullet('Frontend Agent：W3 Cart Theme Extension、W4 Checkout UI Extension、W7 Admin 設定頁'),
    bullet('DevOps Agent：W1 K8s base manifests、W8 CI/CD pipeline、App Store 送審準備'),
    bullet('QA Agent（由 PM Agent 觸發）：全流程 e2e 驗證、Shopify App Review 合規檢查'),

    h3('SubAgent 架構圖'),
    code(
`Eric（REVIEW 門控，人工批准）
    │
    ▼
啊斗（PM Agent — Orchestrator）
    │  ├─ 讀 SPEC（Notion）
    │  ├─ 拆 Tasks → 派發 SubAgent
    │  ├─ 追蹤進度、處理 blockers
    │  └─ VERIFY 後報告 Eric
    │
    ├──▶ [Backend Agent]
    │      skills: lifecom-cvs-app + lifecom-role-backend
    │      → skill-remix / skill-k8s / skill-github / skill-logging
    │
    ├──▶ [Frontend Agent]
    │      skills: lifecom-cvs-app + lifecom-role-frontend
    │      → skill-react / skill-remix / skill-github
    │
    ├──▶ [DevOps Agent]
    │      skills: lifecom-cvs-app + lifecom-role-devops
    │      → skill-k8s / skill-github / skill-logging
    │
    └──▶ [QA Agent]（VERIFY 階段觸發）
           skills: lifecom-cvs-app + skill-playwright
           → 全流程驗證 / Shopify App Review 合規`, 'plain text'),

    h3('各 SubAgent Skills 清單'),
    bullet('Backend Agent — 引用：lifecom-cvs-app、lifecom-role-backend、skill-remix、skill-k8s、skill-github、skill-logging'),
    bullet('Frontend Agent — 引用：lifecom-cvs-app、lifecom-role-frontend、skill-react、skill-remix、skill-github'),
    bullet('DevOps Agent — 引用：lifecom-cvs-app、lifecom-role-devops、skill-k8s、skill-github、skill-logging'),
    bullet('QA Agent — 引用：lifecom-cvs-app、skill-playwright、skill-changelog'),

    h3('新增 Capability Skills（2026-03-05 建立）'),
    bullet('skill-k8s：Kubernetes 容器編排，LifeCOM K8s manifests、Ingress TLS、kubectl、CI/CD deploy 模板'),
    bullet('skill-remix：Remix 全端框架，loaders/actions、OAuth flow、PostgreSQL 整合、Webhook HMAC 驗證、Docker 部署'),
    bullet('skill-react：React 元件、Shopify Polaris Admin UI、Checkout UI Extension（@shopify/ui-extensions-react）、Theme Extension vanilla JS'),
    bullet('skill-github：GitHub CLI（gh）、PR/Issue/CI 管理、GitHub Actions workflow 模板（Node.js + K8s deploy）'),
    bullet('lifecom-cvs-app（專案 Skill）：MCVS/7-11 規格、Shopify 資料模型、App 目錄結構、DB schema、工作包狀態'),
    para('位置：workspace/skills/capabilities/ 及 workspace/skills/lifecom-cvs-app/'),

    h3('SubAgent 啟動 Prompt 格式'),
    code(
`// Backend Agent 啟動範例
讀取 workspace/skills/lifecom-cvs-app/SKILL.md
讀取 workspace/skills/lifecom-role-backend/SKILL.md
讀取 workspace/skills/capabilities/skill-remix/SKILL.md
讀取 workspace/skills/capabilities/skill-k8s/SKILL.md

你是 Backend Agent，負責 CVS 超商選店 App W1 工作包：
- 使用 Shopify CLI + Remix 建立 App 骨架
- 建立 PostgreSQL schema（merchants / merchant_settings / cvs_sessions）
- 建立 K8s base manifests（namespace lifecom-shopify）
- 完成後回報啊斗（PM Agent）

工作目錄：[專案 repo 路徑]`, 'plain text'),

    divider(),
    h2('📅 AI-DLC 工作流程 × SubAgent 對應'),
    bullet('SPEC：啊斗 — 本 Notion 文件（✅ 完成）'),
    bullet('REVIEW：Eric — 人工確認後說「OK 開工」（⏳ 等待中）'),
    bullet('BUILD W1（架手架+DB+K8s base）：Backend Agent + DevOps Agent'),
    bullet('BUILD W2（全家 MCVS callback）：Backend Agent'),
    bullet('BUILD W3（Cart Theme Extension）：Frontend Agent'),
    bullet('BUILD W4（Checkout UI Extension）：Frontend Agent'),
    bullet('BUILD W5（Order Metafield webhook）：Backend Agent'),
    bullet('BUILD W6（7-11 串接）：Backend Agent（規格確認後）'),
    bullet('BUILD W7（Admin 設定頁）：Frontend Agent'),
    bullet('BUILD W8（K8s CI/CD + App Store 送審）：DevOps Agent'),
    bullet('VERIFY：QA Agent — 全流程 e2e + Shopify App Review 合規'),
    bullet('DEPLOY：啊斗協調 DevOps Agent — K8s 部署 + App Store 提交'),
  ];

  const r = await notionRequest('PATCH', `/v1/blocks/${PAGE_ID}/children`, { children: blocks });
  if (r.object === 'error') {
    console.error('❌ 追加失敗:', JSON.stringify(r, null, 2));
    process.exit(1);
  }
  console.log('✅ SubAgent 架構已追加至 Notion 文件');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
