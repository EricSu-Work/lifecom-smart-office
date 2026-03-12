'use strict';
/**
 * bitbucket_section.js — CTO 日報「開發活動」區塊
 *
 * 產出：
 *   1. 昨日 commit 摘要（按作者、含 ADO 工單交叉比對）
 *   2. Open PR 風險看板（殭屍 PR、大量 PR 待 review）
 *   3. 按工程師的程式碼產出
 */
const bb = require('./bitbucket_client');

// 只看活躍 repo（最近 90 天有更新）
const ACTIVE_REPOS = ['newblackdog', 'newblackdog_loreal', 'nativedog'];

// 從 branch name / PR title / commit message 提取 ADO 工單號
function extractAdoIds(text) {
  if (!text) return [];
  const ids = new Set();
  // VSTS{ID} 或 HOTFIX{ID}
  const matches = text.matchAll(/(?:VSTS|HOTFIX|vsts|hotfix)[\s_-]*(\d{4,6})/gi);
  for (const m of matches) ids.add(m[1]);
  return [...ids];
}

const ADO_BASE = 'https://dev.azure.com/LifeComTW/LifeCOM/_workitems/edit';
function adoLink(id) { return `<${ADO_BASE}/${id}|#${id}>`; }

/**
 * 產生開發活動區塊
 * @param {string} dateStr  YYYY-MM-DD（預設昨天，因為日報通常早上跑看昨天資料）
 * @returns {Promise<string>}
 */
async function generate(opts = {}) {
  // 預設取昨天的資料（日報在早上跑）
  const now = new Date();
  const yesterday = new Date(now.getTime() - 86400000);
  const dateStr = opts.date || yesterday.toISOString().slice(0, 10);

  const lines = ['══ 5. 開發活動（Bitbucket）══════════════'];

  // ── 1. 每日 Commit 摘要 ──────────────────────────────────────────────────
  let totalCommits = 0;
  const authorStats = {};  // { author: { commits: N, repos: Set, adoIds: Set } }

  for (const repo of ACTIVE_REPOS) {
    try {
      const activity = await bb.getDailyActivity(repo, dateStr);
      totalCommits += activity.totalCommits;

      for (const [author, commits] of Object.entries(activity.byAuthor)) {
        if (!authorStats[author]) {
          authorStats[author] = { commits: 0, repos: new Set(), adoIds: new Set(), messages: [] };
        }
        authorStats[author].commits += commits.length;
        authorStats[author].repos.add(repo);

        for (const c of commits) {
          const ids = extractAdoIds(c.message);
          ids.forEach(id => authorStats[author].adoIds.add(id));
          authorStats[author].messages.push(c.message);
        }
      }
    } catch (e) {
      // repo 可能沒有該日 commit，靜默跳過
    }
  }

  if (totalCommits === 0) {
    lines.push(`  📝 ${dateStr}：無 commit（假日或維運日）`);
  } else {
    lines.push(`  📝 ${dateStr} commit 摘要：共 ${totalCommits} 筆`);

    const sorted = Object.entries(authorStats).sort((a, b) => b[1].commits - a[1].commits);
    for (const [author, stats] of sorted) {
      const repos = [...stats.repos].join(', ');
      const adoLinks = [...stats.adoIds].slice(0, 5).map(id => adoLink(id)).join(' ');
      const adoTag = adoLinks ? ` → ${adoLinks}` : '';
      lines.push(`    • ${author}：${stats.commits} commits（${repos}）${adoTag}`);
    }
  }

  // ── 2. Open PR 風險看板 ──────────────────────────────────────────────────
  lines.push('');

  try {
    const activePRs = await bb.getAllOpenPRs(ACTIVE_REPOS);

    if (!activePRs.length) {
      lines.push('  🔀 Open PR：✅ 無待處理 PR');
    } else {
      // 分類
      const zombie = activePRs.filter(pr => pr.ageDays > 30);
      const aging  = activePRs.filter(pr => pr.ageDays >= 7 && pr.ageDays <= 30);
      const fresh  = activePRs.filter(pr => pr.ageDays < 7);

      lines.push(`  🔀 Open PR：${activePRs.length} 筆（🔴殭屍${zombie.length} 🟡老化${aging.length} 🟢新鮮${fresh.length}）`);

      // 殭屍 PR 告警
      if (zombie.length) {
        lines.push(`    ⚠️ 殭屍 PR（>30天）：`);
        zombie.slice(0, 5).forEach(pr => {
          const adoIds = extractAdoIds(pr.title + ' ' + (pr.source || ''));
          const adoTag = adoIds.length ? ` → ${adoIds.map(adoLink).join(' ')}` : '';
          lines.push(`      • <${pr.link}|PR#${pr.id}> ${pr.title.substring(0, 40)} — ${pr.ageDays}天 by ${pr.author}${adoTag}`);
        });
        if (zombie.length > 5) lines.push(`      …等共 ${zombie.length} 筆`);
      }

      // 老化 PR（需要 review）
      if (aging.length) {
        lines.push(`    🟡 待 Review（7-30天）：`);
        aging.slice(0, 5).forEach(pr => {
          lines.push(`      • <${pr.link}|PR#${pr.id}> ${pr.title.substring(0, 40)} — ${pr.ageDays}天 by ${pr.author}`);
        });
      }

      // 新鮮 PR 只顯示數量
      if (fresh.length) {
        lines.push(`    🟢 本週新開：${fresh.length} 筆`);
      }
    }
  } catch (e) {
    lines.push(`  🔀 Open PR：⚠️ 查詢失敗（${e.message.substring(0, 50)}）`);
  }

  return lines.join('\n');
}

// ── CLI ─────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const date = process.argv[2]; // optional YYYY-MM-DD
  generate({ date })
    .then(section => console.log(section))
    .catch(e => { console.error('ERROR:', e.message); process.exit(1); });
}

module.exports = { generate, extractAdoIds };
