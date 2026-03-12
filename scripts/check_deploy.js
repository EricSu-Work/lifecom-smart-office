/**
 * check_deploy.js — 偵測新部署通知 + Bitbucket PR 豐富化
 * 
 * 1. 讀取 lifecom.db 中 C03FSJ3PQKD 的新訊息
 * 2. 篩選部署相關訊息
 * 3. 從 Bitbucket API 查 PR 詳情（commits, diffstat, branch→ADO 工單）
 * 4. 從 ADO API 查工單標題
 * 5. 產生可讀的部署通知 → 存檔 data/_deploy-notice.txt
 * 
 * 有新部署 → 輸出 DEPLOY_READY + 存檔
 * 無新部署 → 輸出 NO_DEPLOY
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { db } = require('./lifecom_db');
const { getToken, bbGet, getPRDetail, parseBranch, generateReadableDescription, BASE } = require('./bitbucket_pr');

const CURSOR_FILE = path.join(__dirname, '..', 'data', 'deploy-email-cursor.json');
const OUTPUT_FILE = path.join(__dirname, '..', 'data', '_deploy-notice.txt');
const CHANNEL_ID = 'C03FSJ3PQKD';
const ADO_BASE = 'https://dev.azure.com/LifeComTW/LifeCOM/_workitems/edit';

// ── ADO 工單查詢 ──
function getAdoItem(workItemId) {
  const patFile = path.join(require('os').homedir(), '.config', 'azure-devops', 'pat');
  let pat;
  try { pat = fs.readFileSync(patFile, 'utf8').trim(); } catch { return Promise.resolve(null); }
  
  return new Promise((resolve) => {
    const opts = {
      hostname: 'dev.azure.com',
      path: `/LifeComTW/LifeCOM/_apis/wit/workitems/${workItemId}?fields=System.Title,System.State,System.AssignedTo&api-version=7.1`,
      headers: {
        'Authorization': 'Basic ' + Buffer.from(':' + pat).toString('base64')
      }
    };
    https.get(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const item = JSON.parse(d);
          resolve({
            id: item.id,
            title: item.fields?.['System.Title'],
            state: item.fields?.['System.State'],
            assignedTo: item.fields?.['System.AssignedTo']?.displayName
          });
        } catch { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

// ── 解析 Slack 部署訊息（tab-separated 格式） ──
// 格式：```Merged	LifeERP2.0	Developer	Customer	Date	Description -vX.Y.Z```
function parseDeployMessage(text) {
  const clean = text.replace(/```/g, '').replace(/&amp;/g, '&').trim();
  const parts = clean.split('\t');
  
  const result = {
    action: parts[0]?.trim(),       // Merged / Released
    product: parts[1]?.trim(),       // LifeERP2.0
    developer: parts[2]?.trim(),     // John / Luck / Howhow
    customer: parts[3]?.trim(),      // emers / chinghwa
    date: parts[4]?.trim(),          // 2026/3/10
    description: parts[5]?.trim(),   // 描述 + 版本號
    version: null,
    prNumber: null,
  };
  
  // 提取版本號
  if (result.description) {
    const vMatch = result.description.match(/-?v(\d+\.\d+\.\d+)/);
    if (vMatch) result.version = 'v' + vMatch[1];
  }
  
  // 提取 PR 號碼（如有）
  const prMatch = text.match(/pull request #(\d+)/i) || text.match(/PR\s*#?(\d+)/i);
  if (prMatch) result.prNumber = parseInt(prMatch[1]);
  
  return result;
}

// ── 從 Slack 訊息提取 branch name ──
function extractBranch(text) {
  const match = text.match(/((?:hotfix|feature)\/[\w\d_/-]+)/i);
  return match ? match[1] : null;
}

// ── 開發者名稱 mapping（Slack 暱稱 → Bitbucket display_name / nickname）──
const DEVELOPER_MAP = {
  'john': ['劉重慶', '劉重慶'],
  'luck': ['吳昕釗', '吳昕釗'],
  'howhow': ['howard.keo', 'howard.keo'],
  'howard': ['howard.keo', 'howard.keo'],
  'willy': ['willy', 'willy'],
  'rayal': ['rayal', 'rayal'],
};

// ── 生成可讀部署通知 ──
function formatDeployNotice(deploys) {
  const lines = [];
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  
  lines.push(`📢 *LifeCOM 上板部署通知* | ${dateStr}`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  lines.push('');
  
  for (let i = 0; i < deploys.length; i++) {
    const d = deploys[i];
    
    if (i > 0) {
      lines.push('');
      lines.push('──────────────────────────────');
      lines.push('');
    }
    
    // 如果有 Bitbucket PR 資料
    if (d.pr) {
      const pr = d.pr;
      const branch = pr.branchInfo || {};
      const typeEmoji = branch.type === 'hotfix' ? '🔧' : branch.type === 'feature' ? '✨' : '📦';
      const typeLabel = branch.type === 'hotfix' ? '緊急修復 (Hotfix)' : branch.type === 'feature' ? '功能更新 (Feature)' : '版本更新';
      
      lines.push(`${typeEmoji} *#${i+1} ${typeLabel}*`);
      if (d.version) lines.push(`📌 版本：${d.version}`);
      
      // 客戶
      const customer = branch.customer || d.customer;
      if (customer) lines.push(`👤 客戶：${customer.toUpperCase()}`);
      
      // ADO 工單
      if (d.adoItem && d.adoItem.title) {
        lines.push(`🎫 工單：<${ADO_BASE}/${branch.adoId}|#${branch.adoId}> — ${d.adoItem.title}`);
        if (d.adoItem.assignedTo) lines.push(`👷 負責人：${d.adoItem.assignedTo}`);
      } else if (branch.adoId) {
        lines.push(`🎫 工單：<${ADO_BASE}/${branch.adoId}|#${branch.adoId}>`);
      }
      
      // 變更說明
      if (d.adoItem && d.adoItem.title) {
        lines.push(`📋 *變更說明*：${d.adoItem.title}`);
      } else if (branch.summary) {
        lines.push(`📋 *變更說明*：${branch.summary}`);
      }
      
      // 開發者 + 審核
      lines.push(`👨‍💻 開發者：${pr.author || 'unknown'}`);
      if (pr.participants && pr.participants.length > 0) {
        lines.push(`✅ 審核者：${pr.participants.join(', ')}`);
      }
      
      // Commit 摘要（排除 merge commit）
      const realCommits = (pr.commits || []).filter(c => !c.message.startsWith('Merged in'));
      if (realCommits.length > 0) {
        lines.push(`📝 *變更明細*（${realCommits.length} 筆 commit）：`);
        realCommits.slice(0, 5).forEach(c => {
          const msg = c.message.split('\n')[0].replace(/_/g, ' ').trim().substring(0, 80);
          lines.push(`   • ${msg}`);
        });
        if (realCommits.length > 5) lines.push(`   ...及其他 ${realCommits.length - 5} 筆`);
      }
      
      // 影響範圍
      if (pr.filesChanged > 0) {
        lines.push(`📁 影響範圍：${pr.filesChanged} 個檔案（+${pr.linesAdded} / -${pr.linesRemoved} 行）`);
      }
      
      // PR 連結
      lines.push(`🔗 <https://bitbucket.org/systemLifecom/newblackdog/pull-requests/${pr.id}|Bitbucket PR #${pr.id}>`);
      
    } else {
      // 無 Bitbucket 資料，用解析後的結構化資料
      const actionLabel = d.action === 'Merged' ? '合併上版' : d.action === 'Released' ? '正式發布' : '版本更新';
      lines.push(`📦 *#${i+1} ${actionLabel}*`);
      if (d.version) lines.push(`📌 版本：${d.version}`);
      if (d.product) lines.push(`📦 產品：${d.product}`);
      if (d.customer) lines.push(`👤 客戶：${d.customer.toUpperCase()}`);
      if (d.developer) lines.push(`👨‍💻 開發者：${d.developer}`);
      if (d.description) {
        const desc = d.description.replace(/-?v\d+\.\d+\.\d+/, '').trim();
        if (desc) lines.push(`📋 *變更說明*：${desc}`);
      }
    }
  }
  
  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push(`📊 共 ${deploys.length} 筆部署 | 此通知由 LifeCOM AI 自動產生`);
  
  return lines.join('\n');
}

// ══════════════════════════════
// Main
// ══════════════════════════════
async function main() {
  // 讀 cursor
  let lastTs = '0';
  try {
    const cur = JSON.parse(fs.readFileSync(CURSOR_FILE, 'utf8'));
    lastTs = cur.lastTs || '0';
  } catch (e) { /* first run */ }
  
  // 查新訊息
  const msgs = db.prepare(
    `SELECT ts, user_id, text, attachments FROM slack_messages 
     WHERE channel_id=? AND CAST(ts AS REAL) > ? 
     ORDER BY ts ASC`
  ).all(CHANNEL_ID, lastTs);
  
  if (!msgs.length) {
    console.log('NO_DEPLOY');
    fs.writeFileSync(CURSOR_FILE, JSON.stringify({ lastTs, lastCheck: new Date().toISOString() }, null, 2));
    process.exit(0);
  }
  
  // 篩選部署通知
  const DEPLOY_PATTERNS = [
    /Merged/i, /OMS-Release/i, /OMS-HOTFIX/i,
    /開始進行.*Release/, /完成部署/, /Released/i, /v\d+\.\d+\.\d+/,
  ];
  const SKIP_USERS = ['USLACKBOT'];
  
  const deployMsgs = msgs.filter(m => {
    if (SKIP_USERS.includes(m.user_id)) return false;
    const full = (m.text || '') + ' ' + (m.attachments || '');
    return DEPLOY_PATTERNS.some(p => p.test(full));
  });
  
  // 更新 cursor
  const newestTs = msgs.reduce((max, m) => m.ts > max ? m.ts : max, lastTs);
  fs.writeFileSync(CURSOR_FILE, JSON.stringify({ lastTs: newestTs, lastCheck: new Date().toISOString() }, null, 2));
  
  if (!deployMsgs.length) {
    console.log('NO_DEPLOY');
    process.exit(0);
  }
  
  // Bitbucket 豐富化
  const bbToken = getToken();
  const deploys = [];
  
  for (const m of deployMsgs) {
    const text = (m.text || '') + ' ' + (m.attachments || '');
    const parsed = parseDeployMessage(text);
    
    const deploy = {
      ts: m.ts,
      time: new Date(parseFloat(m.ts) * 1000).toISOString(),
      text: text.trim(),
      action: parsed.action,
      product: parsed.product,
      developer: parsed.developer,
      customer: parsed.customer,
      date: parsed.date,
      description: parsed.description,
      version: parsed.version,
      pr: null,
      adoItem: null,
    };
    
    if (bbToken) {
      // 策略 1: 直接 PR 號碼（如有）
      if (parsed.prNumber) {
        try {
          deploy.pr = await getPRDetail(parsed.prNumber, bbToken);
        } catch (e) {
          console.error(`  ⚠️ PR #${parsed.prNumber} lookup failed: ${e.message}`);
        }
      }
      
      // 策略 2: 從訊息裡找 branch name
      if (!deploy.pr) {
        const branch = extractBranch(text);
        if (branch) {
          try {
            const searchData = await bbGet(
              `${BASE}/pullrequests?state=MERGED&q=source.branch.name="${encodeURIComponent(branch)}"&sort=-updated_on&pagelen=1`,
              bbToken
            );
            if (searchData.values?.length > 0) {
              deploy.pr = await getPRDetail(searchData.values[0].id, bbToken);
            }
          } catch (e) { /* ignore */ }
        }
      }
      
      // 策略 3: 搜 Bitbucket 最近 merged PR（by author + 時間範圍）
      if (!deploy.pr && parsed.developer) {
        const bbAuthorNames = DEVELOPER_MAP[parsed.developer.toLowerCase()] || [parsed.developer.toLowerCase()];
        try {
          // 搜尋近 3 天 merged PR
          const searchData = await bbGet(
            `${BASE}/pullrequests?state=MERGED&sort=-updated_on&pagelen=20`,
            bbToken
          );
          // 按 author + 客戶 name 匹配
          const candidates = (searchData.values || []).filter(pr => {
            const nickname = (pr.author?.nickname || '').toLowerCase();
            const displayName = (pr.author?.display_name || '').toLowerCase();
            const authorMatch = bbAuthorNames.some(n => 
              nickname.includes(n.toLowerCase()) || displayName.includes(n.toLowerCase())
            );
            const branchLower = (pr.source?.branch?.name || '').toLowerCase();
            const customerMatch = parsed.customer ? branchLower.includes(parsed.customer.toLowerCase()) : true;
            // 時間範圍：3 天內
            const prDate = new Date(pr.updated_on);
            const now = new Date();
            const daysDiff = (now - prDate) / (1000 * 60 * 60 * 24);
            return authorMatch && customerMatch && daysDiff < 3;
          });
          
          if (candidates.length > 0) {
            // 取最新的
            deploy.pr = await getPRDetail(candidates[0].id, bbToken);
          }
        } catch (e) {
          console.error(`  ⚠️ PR search by author failed: ${e.message}`);
        }
      }
      
      // ADO 工單查詢
      const adoId = deploy.pr?.branchInfo?.adoId;
      if (adoId) {
        deploy.adoItem = await getAdoItem(adoId);
      }
      
      // 補客戶（從 PR branch 或 Slack 訊息）
      if (!deploy.customer && deploy.pr?.branchInfo?.customer) {
        deploy.customer = deploy.pr.branchInfo.customer;
      }
    }
    
    deploys.push(deploy);
  }
  
  // 產生通知
  const notice = formatDeployNotice(deploys);
  fs.writeFileSync(OUTPUT_FILE, notice, 'utf8');
  
  // 輸出結果
  console.log('DEPLOY_READY');
  console.log(JSON.stringify({
    count: deploys.length,
    file: OUTPUT_FILE,
    deploys: deploys.map(d => ({
      version: d.version,
      customer: d.customer,
      pr: d.pr ? `#${d.pr.id}` : null,
      adoId: d.pr?.branchInfo?.adoId || null,
      adoTitle: d.adoItem?.title || null,
      type: d.pr?.branchInfo?.type || 'unknown',
    }))
  }, null, 2));
}

main().catch(e => {
  console.error('\n❌ FATAL:', e && e.message ? e.message : String(e));
  if (e && e.stack) console.error(e.stack);
  process.exit(1);
});
