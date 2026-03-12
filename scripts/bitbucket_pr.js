/**
 * bitbucket_pr.js — Bitbucket PR 查詢工具
 * 
 * 用法：
 *   node bitbucket_pr.js <PR_NUMBER>     查單一 PR 詳情
 *   node bitbucket_pr.js --recent [N]    查最近 N 個 merged PR（預設 5）
 *   node bitbucket_pr.js --search <keyword>  搜尋 PR title
 * 
 * 輸出 JSON 到 stdout
 */
const https = require('https');
const { execSync } = require('child_process');
const path = require('path');

const WORKSPACE = 'systemLifecom';
const REPO_SLUG = 'newblackdog';
const REPO_DIR = 'C:\\Users\\Eric\\dev\\newblackdog';

// 從 git credential manager 取 OAuth token
function getToken() {
  const fs = require('fs');
  const os = require('os');
  const tokenFile = path.join(os.homedir(), '.config', 'bitbucket', 'token');
  
  // 1. 先試檔案快取（token 可能 expire，但通常持續幾小時）
  try {
    const cached = JSON.parse(fs.readFileSync(tokenFile, 'utf8'));
    if (cached.token && cached.ts && (Date.now() - cached.ts < 3600000)) {
      return cached.token;
    }
  } catch (e) { /* no cache */ }
  
  // 2. 透過 cmd 取 git credential
  try {
    const tmpIn = path.join(os.tmpdir(), '_bb_cred_in.txt');
    const tmpOut = path.join(os.tmpdir(), '_bb_cred_out.txt');
    fs.writeFileSync(tmpIn, 'protocol=https\nhost=bitbucket.org\n\n');
    execSync(`cmd /c "git -C "${REPO_DIR}" credential fill < "${tmpIn}" > "${tmpOut}""`, { timeout: 10000 });
    const out = fs.readFileSync(tmpOut, 'utf8');
    const match = out.match(/password=(.+)/);
    if (match) {
      const token = match[1].trim();
      // 快取
      fs.mkdirSync(path.dirname(tokenFile), { recursive: true });
      fs.writeFileSync(tokenFile, JSON.stringify({ token, ts: Date.now() }));
      return token;
    }
  } catch (e) {
    // 3. 最後嘗試：直接讀 Windows Credential Manager (PowerShell)
    try {
      const out = execSync(
        `powershell -NoProfile -Command "[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String((cmdkey /list | Select-String 'git:https://bitbucket.org' -Context 0,3)))"`,
        { encoding: 'utf8', timeout: 5000 }
      );
    } catch (e2) { /* ignore */ }
  }
  
  console.error('Failed to get Bitbucket token. Run: node -e "..." to cache manually');
  return null;
}

function bbGet(urlPath, token) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.bitbucket.org',
      path: urlPath,
      headers: {
        'User-Agent': 'LifeCOM-AI',
        'Authorization': `Bearer ${token}`
      }
    };
    https.get(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try { resolve(JSON.parse(d)); } catch (e) { reject(new Error(`JSON parse failed: ${d.substring(0, 200)}`)); }
        } else if (res.statusCode === 302) {
          // Follow redirect for diffstat
          const location = res.headers.location;
          if (location) {
            const url = new URL(location);
            bbGet(url.pathname + url.search, token).then(resolve).catch(reject);
          } else {
            reject(new Error(`HTTP ${res.statusCode} with no redirect`));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${d.substring(0, 200)}`));
        }
      });
    }).on('error', reject);
  });
}

const BASE = `/2.0/repositories/${WORKSPACE}/${REPO_SLUG}`;

// 解析 branch name → ADO work item ID + 類型 + 客戶
function parseBranch(branchName) {
  const result = { raw: branchName, type: null, adoId: null, customer: null, summary: null };
  
  if (!branchName) return result;
  
  // hotfix/HOTFIX44880_getTargetFulfillment_fix
  const hotfixMatch = branchName.match(/hotfix\/HOTFIX(\d+)_(.+)/i);
  if (hotfixMatch) {
    result.type = 'hotfix';
    result.adoId = hotfixMatch[1];
    result.summary = hotfixMatch[2].replace(/_/g, ' ');
    return result;
  }
  
  // feature/VSTS12345_description
  const featureMatch = branchName.match(/feature\/VSTS(\d+)_(.+)/i);
  if (featureMatch) {
    result.type = 'feature';
    result.adoId = featureMatch[1];
    result.summary = featureMatch[2].replace(/_/g, ' ');
    return result;
  }
  
  // 已知客戶名稱抽取
  const customers = [
    'sabon', 'levis', 'emers', 'adastria', 'sfl', 'doe', 'keywear', 'toysrus',
    'owndays', 'momo', 'shopee', 'shopline', '91app', 'yahoo', 'lab52', 'relove',
    'nikegolf', 'natgeo', 'goddess', 'js', 'psk', 'ymc', 'hearth', 'glico',
    'mydress', 'shimamura', 'npc', 'as', 'ucc', 'biocrown', 'chinghwa', 'shim',
    'teamson', 'maersk', 'cyberbiz', 'linegift', 'pcHome', 'jumeng', 'snowiou'
  ];
  const lower = branchName.toLowerCase();
  for (const c of customers) {
    if (lower.includes(c.toLowerCase())) {
      result.customer = c;
      break;
    }
  }
  
  result.summary = branchName.split('/').pop().replace(/_/g, ' ');
  return result;
}

// 生成客戶/OP 可讀的部署描述
function generateReadableDescription(pr, branchInfo, commits, adoItem) {
  const lines = [];
  
  // Header
  const typeEmoji = branchInfo.type === 'hotfix' ? '🔧' : branchInfo.type === 'feature' ? '✨' : '📦';
  const typeLabel = branchInfo.type === 'hotfix' ? '問題修復' : branchInfo.type === 'feature' ? '功能更新' : '版本更新';
  
  lines.push(`${typeEmoji} *${typeLabel}* | PR #${pr.id}`);
  
  // 客戶
  if (branchInfo.customer) {
    lines.push(`👤 客戶：${branchInfo.customer.toUpperCase()}`);
  }
  
  // ADO 工單連結
  if (branchInfo.adoId) {
    lines.push(`🎫 工單：<https://dev.azure.com/LifeComTW/LifeCOM/_workitems/edit/${branchInfo.adoId}|#${branchInfo.adoId}>`);
  }
  
  // ADO 工單標題（如果查到了）
  if (adoItem && adoItem.title) {
    lines.push(`📋 說明：${adoItem.title}`);
  } else if (branchInfo.summary) {
    // 從 branch name 轉成可讀描述
    lines.push(`📋 說明：${branchInfo.summary}`);
  }
  
  // 開發者
  if (pr.author) {
    lines.push(`👨‍💻 開發者：${pr.author}`);
  }
  
  // 審核者
  if (pr.reviewers && pr.reviewers.length > 0) {
    lines.push(`✅ 審核者：${pr.reviewers.join(', ')}`);
  }
  
  // Commit 摘要
  if (commits && commits.length > 0) {
    const realCommits = commits.filter(c => !c.message.startsWith('Merged in'));
    if (realCommits.length > 0) {
      lines.push(`📝 變更（${realCommits.length} 筆 commit）：`);
      realCommits.slice(0, 5).forEach(c => {
        const msg = c.message.split('\n')[0].replace(/_/g, ' ').substring(0, 80);
        lines.push(`   • ${msg}`);
      });
      if (realCommits.length > 5) lines.push(`   ...及其他 ${realCommits.length - 5} 筆`);
    }
  }
  
  // 影響範圍（從 diffstat）
  if (pr.filesChanged) {
    lines.push(`📁 影響範圍：${pr.filesChanged} 個檔案 (+${pr.linesAdded} / -${pr.linesRemoved})`);
  }
  
  // Bitbucket 連結
  lines.push(`🔗 <https://bitbucket.org/${WORKSPACE}/${REPO_SLUG}/pull-requests/${pr.id}|查看 PR 詳情>`);
  
  return lines.join('\n');
}

async function getPRDetail(prNumber, token) {
  const pr = await bbGet(`${BASE}/pullrequests/${prNumber}`, token);
  
  // Get commits
  let commits = [];
  try {
    const cm = await bbGet(`${BASE}/pullrequests/${prNumber}/commits`, token);
    commits = (cm.values || []).map(c => ({
      hash: c.hash?.substring(0, 9),
      message: (c.message || '').trim(),
      author: c.author?.raw || c.author?.user?.display_name,
      date: c.date
    }));
  } catch (e) { /* ignore */ }
  
  // Get diffstat (may redirect)
  let filesChanged = 0, linesAdded = 0, linesRemoved = 0;
  try {
    const ds = await bbGet(`${BASE}/pullrequests/${prNumber}/diffstat`, token);
    if (ds.values) {
      filesChanged = ds.values.length;
      ds.values.forEach(f => {
        linesAdded += f.lines_added || 0;
        linesRemoved += f.lines_removed || 0;
      });
    }
  } catch (e) { /* ignore, diffstat often 302 */ }
  
  const branchInfo = parseBranch(pr.source?.branch?.name);
  
  return {
    id: pr.id,
    title: pr.title,
    description: pr.description || '',
    author: pr.author?.display_name,
    source_branch: pr.source?.branch?.name,
    dest_branch: pr.destination?.branch?.name,
    state: pr.state,
    merge_commit: pr.merge_commit?.hash,
    created_on: pr.created_on,
    updated_on: pr.updated_on,
    reviewers: (pr.reviewers || []).map(r => r.display_name),
    participants: (pr.participants || []).filter(p => p.approved).map(p => p.user?.display_name),
    commits,
    filesChanged,
    linesAdded,
    linesRemoved,
    branchInfo,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const token = getToken();
  if (!token) { console.error('No Bitbucket token'); process.exit(1); }
  
  if (args[0] === '--recent') {
    const count = parseInt(args[1]) || 5;
    const data = await bbGet(`${BASE}/pullrequests?state=MERGED&sort=-updated_on&pagelen=${count}`, token);
    const results = [];
    for (const pr of (data.values || [])) {
      const detail = await getPRDetail(pr.id, token);
      results.push(detail);
    }
    console.log(JSON.stringify(results, null, 2));
  } else if (args[0] === '--search') {
    const keyword = args.slice(1).join(' ');
    const data = await bbGet(`${BASE}/pullrequests?state=MERGED&q=title~"${encodeURIComponent(keyword)}"&sort=-updated_on&pagelen=10`, token);
    const results = (data.values || []).map(pr => ({
      id: pr.id, title: pr.title, author: pr.author?.display_name,
      branch: pr.source?.branch?.name, updated: pr.updated_on
    }));
    console.log(JSON.stringify(results, null, 2));
  } else if (args[0] === '--for-deploy') {
    // 從 Slack 部署訊息中提取 PR 號碼或 branch 名稱，查詢對應 PR
    // stdin 接收 JSON: { deploys: [{text: "..."}] }
    const input = require('fs').readFileSync(0, 'utf8');
    const deployData = JSON.parse(input);
    const results = [];
    
    for (const deploy of (deployData.deploys || [])) {
      const text = deploy.text || '';
      
      // 從 Slack 訊息提取 PR 號碼
      const prMatch = text.match(/pull request #(\d+)/i) || text.match(/PR #?(\d+)/i);
      if (prMatch) {
        try {
          const detail = await getPRDetail(parseInt(prMatch[1]), token);
          const readable = generateReadableDescription(detail, detail.branchInfo, detail.commits);
          results.push({ ...detail, readable });
        } catch (e) {
          results.push({ error: e.message, originalText: text });
        }
      } else {
        // 從訊息提取 branch name
        const branchMatch = text.match(/(?:hotfix|feature)\/[\w\d_-]+/i);
        if (branchMatch) {
          try {
            // Search by branch name
            const searchData = await bbGet(`${BASE}/pullrequests?state=MERGED&q=source.branch.name="${encodeURIComponent(branchMatch[0])}"&sort=-updated_on&pagelen=1`, token);
            if (searchData.values?.length > 0) {
              const detail = await getPRDetail(searchData.values[0].id, token);
              const readable = generateReadableDescription(detail, detail.branchInfo, detail.commits);
              results.push({ ...detail, readable });
            } else {
              const branchInfo = parseBranch(branchMatch[0]);
              results.push({ branchInfo, originalText: text, note: 'PR not found by branch search' });
            }
          } catch (e) {
            results.push({ error: e.message, originalText: text });
          }
        } else {
          results.push({ originalText: text, note: 'No PR number or branch found in message' });
        }
      }
    }
    
    console.log(JSON.stringify(results, null, 2));
  } else if (args[0] && !args[0].startsWith('-')) {
    // Single PR
    const detail = await getPRDetail(parseInt(args[0]), token);
    const readable = generateReadableDescription(detail, detail.branchInfo, detail.commits);
    console.log(JSON.stringify({ ...detail, readable }, null, 2));
  } else {
    console.log('Usage:');
    console.log('  node bitbucket_pr.js <PR_NUMBER>      Get PR details');
    console.log('  node bitbucket_pr.js --recent [N]     Get N recent merged PRs');
    console.log('  node bitbucket_pr.js --search <word>  Search PR by title');
    console.log('  echo JSON | node bitbucket_pr.js --for-deploy  Enrich deploy data');
  }
}

module.exports = { getToken, bbGet, getPRDetail, parseBranch, generateReadableDescription, BASE };

// 只在直接執行時跑 main()
if (require.main === module) {
  main().catch(e => { console.error('Error:', e.message); process.exit(1); });
}
