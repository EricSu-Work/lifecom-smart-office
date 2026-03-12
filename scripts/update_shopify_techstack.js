/**
 * update_shopify_techstack.js
 * 在 Notion CVS App SPEC 頁面追加「技術棧最終確認版」
 */
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const TOKEN   = fs.readFileSync(path.join(process.env.USERPROFILE, '.config/notion/api_key'), 'utf8').trim();
const PAGE_ID = '31ad2a91-c732-815f-a945-c17f30023336';

function req(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const headers = {
      'Authorization': 'Bearer ' + TOKEN,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
    };
    const r = https.request({ hostname: 'api.notion.com', path: endpoint, method, headers }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
    });
    r.on('error', reject);
    r.write(data);
    r.end();
  });
}

const h2 = t => ({ object: 'block', type: 'heading_2', heading_2: { rich_text: [{ type: 'text', text: { content: t } }] } });
const h3 = t => ({ object: 'block', type: 'heading_3', heading_3: { rich_text: [{ type: 'text', text: { content: t } }] } });
const bullet = t => ({ object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ type: 'text', text: { content: t } }] } });
const code = (t, lang = 'plain text') => ({ object: 'block', type: 'code', code: { rich_text: [{ type: 'text', text: { content: t } }], language: lang } });
const divider = () => ({ object: 'block', type: 'divider', divider: {} });
const callout = (t, emoji = '✅') => ({ object: 'block', type: 'callout', callout: { rich_text: [{ type: 'text', text: { content: t } }], icon: { type: 'emoji', emoji } } });

async function main() {
  const blocks = [
    divider(),
    callout('以下為技術棧最終確認版（2026-03-05 Eric 確認），取代上方草稿。', '✅'),

    h2('⚙️ 技術棧最終確認版'),

    h3('Runtime & 語言'),
    bullet('Node.js 20 LTS'),
    bullet('TypeScript 5.x'),
    bullet('pnpm（package manager，Shopify CLI 3.x 推薦）'),

    h3('App Framework'),
    bullet('Shopify CLI 3.x'),
    bullet('@shopify/shopify-app-remix 3.x（Remix v2）'),
    bullet('Shopify API Version：2025-01'),

    h3('資料層'),
    bullet('DB：SQLite（better-sqlite3）+ Kubernetes PersistentVolumeClaim'),
    bullet('DB 策略：single replica（SQLite 不支援多 pod 並發寫入），MVP 後視流量決定是否遷移 PostgreSQL'),
    bullet('Migrations：raw .sql 檔案，啟動時自動執行'),
    bullet('ORM：無，raw SQL（與現有 LifeCOM scripts 一致）'),
    bullet('Session Cache：Redis 7（自建 Redis Deployment，namespace: lifecom-shopify）'),
    bullet('Redis Client：ioredis，session token TTL = 30 分鐘'),

    h3('前端'),
    bullet('Admin UI：Shopify Polaris v12 + @shopify/app-bridge-react v4'),
    bullet('Cart Extension：Theme App Extension（Liquid + vanilla JS，無框架）'),
    bullet('Checkout Extension：@shopify/ui-extensions-react（React 18，API 2025-01）'),

    h3('測試'),
    bullet('Unit / Integration：Vitest'),
    bullet('E2E：Playwright（選店流程端對端驗證）'),

    h3('程式碼品質'),
    bullet('Linting：ESLint + TypeScript rules'),
    bullet('格式化：Prettier'),

    h3('部署架構'),
    bullet('Container：Docker（node:20-alpine，multi-stage build）'),
    bullet('Orchestration：Kubernetes，namespace: lifecom-shopify'),
    bullet('Replicas：1（SQLite 限制）'),
    bullet('外部連線：Cloudflare Tunnel（cloudflared Deployment in K8s）'),
    bullet('DNS / TLS：Cloudflare 管理，cvs.licodes.net，TLS Full mode'),
    bullet('無需 nginx-ingress / cert-manager / 外部 IP'),
    bullet('CI/CD：GitHub Actions（EricSu-Work/shopify-cvs）'),

    h3('Cloudflare Tunnel 架構'),
    code(
`用戶端
    │
    ▼
Cloudflare Edge（cvs.licodes.net）
    │  ← TLS 在此終止（Full mode）
    ▼
cloudflared Deployment（K8s, lifecom-shopify namespace）
    │  ← 長連線 tunnel（outbound only，不需要 public IP）
    ▼
K8s Service → shopify-cvs-app Pod（port 3000）

K8s 元件：
  Deployment: shopify-cvs-app (replicas: 1)
  Deployment: shopify-cvs-redis (replicas: 1)
  Deployment: cloudflared (replicas: 2, tunnel agent)
  PVC: shopify-cvs-sqlite (ReadWriteOnce, 1Gi)
  ConfigMap: shopify-cvs-config
  Secret: shopify-cvs-secret`, 'plain text'),

    h3('GitHub Repository'),
    bullet('Repo：EricSu-Work/shopify-cvs'),
    bullet('Branch 策略：main（production）/ develop（staging）/ feat/* / fix/*'),
    bullet('CI/CD：GitHub Actions → Docker build → K8s rollout via cloudflared'),

    h3('K8s 元件清單（lifecom-shopify namespace）'),
    bullet('Deployment: shopify-cvs-app（app 本體，replicas: 1）'),
    bullet('Deployment: shopify-cvs-redis（Redis 7，replicas: 1）'),
    bullet('Deployment: cloudflared（Cloudflare Tunnel agent，replicas: 2）'),
    bullet('PVC: shopify-cvs-sqlite（SQLite 資料，ReadWriteOnce, 1Gi）'),
    bullet('ConfigMap: shopify-cvs-config（非機敏環境變數）'),
    bullet('Secret: shopify-cvs-secret（API keys、token 等機敏資料）'),
    bullet('Service: shopify-cvs-app（ClusterIP，port 3000）'),
    bullet('Service: shopify-cvs-redis（ClusterIP，port 6379）'),
  ];

  const r = await req('PATCH', `/v1/blocks/${PAGE_ID}/children`, { children: blocks });
  if (r.object === 'error') {
    console.error('❌ 失敗:', JSON.stringify(r, null, 2));
    process.exit(1);
  }
  console.log('✅ 技術棧最終版已寫入 Notion');
}

main().catch(e => { console.error(e); process.exit(1); });
