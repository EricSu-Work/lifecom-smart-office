'use strict';
/**
 * enrich_deploy.js — 用 Bitbucket 資料豐富部署通知
 *
 * 讀取 check_deploy.js 的輸出（JSON），
 * 從 Bitbucket 找到對應的 PR/commit，取得 diff 摘要。
 *
 * 用法：
 *   node check_deploy.js | node enrich_deploy.js
 *   或
 *   node enrich_deploy.js < deploy.json
 */
const bb = require('./bitbucket_client');

// 解析部署訊息格式：
// "Merged	LifeERP2.0	Howhow	11	2026/3/9	shopify回壓邏輯修改 -v3.11.40"
// "Released	LifeERP2.0	John	emers	2026/1/7	description - v3.11.38"
function parseDeployMsg(text) {
  const clean = text.replace(/```/g, '').trim();
  const parts = clean.split(/\t/);
  if (parts.length < 3) return null;

  const action = parts[0]?.trim();     // Merged / Released
  const product = parts[1]?.trim();    // LifeERP2.0
  const developer = parts[2]?.trim();  // Howhow / John
  const client = parts[3]?.trim();     // client code or number
  const rest = parts.slice(4).join('\t');

  // 提取版本號
  const vMatch = rest.match(/v(\d+\.\d+\.\d+)/);
  const version = vMatch ? vMatch[1] : null;

  // 提取描述（去掉日期和版本）
  const desc = rest.replace(/\d{4}\/\d{1,2}\/\d{1,2}/, '').replace(/-?\s*v\d+\.\d+\.\d+/, '').trim();

  return { action, product, developer, client, version, desc };
}

// BB developer name mapping（deploy msg 用暱稱，BB 用 display_name）
const DEV_MAP = {
  'howhow': 'howard.keo',
  'howard': 'howard.keo',
  'john': '劉重慶',
  'luck': '吳昕釗',
  'rayal': 'Rayal',
  'ray': 'Rayal',
  'maoqing': '陳茂清',
  'chen': '陳茂清',
  'chang': '張嘉珊',
};

// 根據部署資訊找對應的 merged PR
async function findMatchingPR(deploy, repo) {
  try {
    const prs = await bb.getPullRequests(repo, { state: 'MERGED', limit: 20 });
    
    // 策略 1：版本號比對
    if (deploy.version) {
      const match = prs.find(pr => pr.title?.includes(deploy.version));
      if (match) return match;
    }

    // 策略 2：描述關鍵字比對
    if (deploy.desc) {
      const keywords = deploy.desc.split(/[\s_]+/).filter(w => w.length > 3);
      const match = prs.find(pr => {
        const title = (pr.title || '').toLowerCase();
        return keywords.some(k => title.includes(k.toLowerCase()));
      });
      if (match) return match;
    }

    // 策略 3：最近的 merged PR by same developer
    if (deploy.developer) {
      const devKey = deploy.developer.toLowerCase();
      const bbName = DEV_MAP[devKey] || devKey;
      const match = prs.find(pr => {
        const author = (pr.author?.display_name || '').toLowerCase();
        return author.includes(bbName.toLowerCase());
      });
      if (match) return match;
    }

    return null;
  } catch (e) {
    return null;
  }
}

async function enrichDeploy(deployData) {
  const enriched = [];

  for (const d of deployData.deploys) {
    const parsed = parseDeployMsg(d.text);
    if (!parsed) {
      enriched.push({ ...d, enrichment: null });
      continue;
    }

    // 搜尋 newblackdog 和 newblackdog_loreal
    const repos = ['newblackdog', 'newblackdog_loreal'];
    let matchedPR = null;
    let matchedRepo = null;

    for (const repo of repos) {
      const pr = await findMatchingPR(parsed, repo);
      if (pr) {
        matchedPR = pr;
        matchedRepo = repo;
        break;
      }
    }

    let diffSummary = null;
    if (matchedPR) {
      try {
        const diffStats = await bb.getPRDiffStat(matchedRepo, matchedPR.id);
        const totalAdded = diffStats.reduce((s, f) => s + (f.lines_added || 0), 0);
        const totalRemoved = diffStats.reduce((s, f) => s + (f.lines_removed || 0), 0);
        const fileCount = diffStats.length;

        // 分類變更檔案
        const categories = {};
        diffStats.forEach(f => {
          const filePath = f.new?.path || f.old?.path || 'unknown';
          const ext = filePath.split('.').pop()?.toLowerCase() || 'other';
          if (!categories[ext]) categories[ext] = 0;
          categories[ext]++;
        });

        diffSummary = {
          prId: matchedPR.id,
          prTitle: matchedPR.title,
          prUrl: matchedPR.links?.html?.href,
          fileCount,
          linesAdded: totalAdded,
          linesRemoved: totalRemoved,
          fileTypes: categories,
          repo: matchedRepo,
        };
      } catch (e) {
        // diff stat 取得失敗，繼續
      }
    }

    enriched.push({
      ...d,
      parsed,
      enrichment: diffSummary,
    });
  }

  return { count: deployData.count, deploys: enriched };
}

// 格式化豐富後的部署通知
function formatEnrichedDeploy(enrichedData) {
  const lines = [];

  for (const d of enrichedData.deploys) {
    if (!d.parsed) {
      lines.push(d.text);
      continue;
    }

    const p = d.parsed;
    lines.push(`📦 *${p.action}* ${p.product} ${p.version ? `v${p.version}` : ''}`);
    lines.push(`👤 ${p.developer} | 🏢 ${p.client} | ${p.desc}`);

    if (d.enrichment) {
      const e = d.enrichment;
      lines.push(`🔗 <${e.prUrl}|PR#${e.prId}> (${e.repo})`);
      lines.push(`📊 ${e.fileCount} 檔案變更 | +${e.linesAdded} / -${e.linesRemoved} 行`);

      // Top file types
      const types = Object.entries(e.fileTypes)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([ext, n]) => `${ext}(${n})`)
        .join(', ');
      if (types) lines.push(`📁 ${types}`);
    }

    lines.push('');
  }

  return lines.join('\n');
}

// ── CLI ─────────────────────────────────────────────────────────────────────
if (require.main === module) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => input += chunk);
  process.stdin.on('end', async () => {
    try {
      const data = JSON.parse(input);
      const enriched = await enrichDeploy(data);
      console.log(JSON.stringify(enriched, null, 2));
      console.log('\n--- FORMATTED ---');
      console.log(formatEnrichedDeploy(enriched));
    } catch (e) {
      console.error('ERROR:', e.message);
      process.exit(1);
    }
  });
}

module.exports = { enrichDeploy, formatEnrichedDeploy, parseDeployMsg };
