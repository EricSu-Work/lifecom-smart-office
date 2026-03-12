'use strict';
/**
 * check_ado_commit_gap.js — ADO ↔ Bitbucket 交叉比對（Phase D）
 *
 * 偵測：
 *   1. ADO 工單狀態 Active/Code Review 但無對應 commit（假性活躍）
 *   2. Bitbucket 有 commit 但 ADO 工單還在 New（忘記更新狀態）
 *   3. PR 已 merged 但 ADO 工單未 Resolved/Closed（忘記結案）
 *
 * 有問題 → 輸出 JSON
 * 無問題 → 輸出 "NO_GAP"
 */
const { db } = require('./lifecom_db');
const bb = require('./bitbucket_client');
const { extractAdoIds } = require('./bitbucket_section');

// nativedog 排除：獨立 app，不走 ADO 工單流程
const ACTIVE_REPOS = ['newblackdog', 'newblackdog_loreal'];
const DAYS_LOOKBACK = 14;

async function main() {
  const now = Math.floor(Date.now() / 1000);
  const since = now - DAYS_LOOKBACK * 86400;

  // ── 1. 收集 Bitbucket 近 N 天的活動 ──────────────────────────────────
  const bbActivity = {};  // { adoId: { repos, authors, lastCommit, hasMergedPR } }

  for (const repo of ACTIVE_REPOS) {
    // 近期 commits
    try {
      const commits = await bb.getCommits(repo, { limit: 50 });
      for (const c of commits) {
        const commitDate = new Date(c.date);
        if (commitDate.getTime() / 1000 < since) continue;

        const msg = c.message || '';
        const adoIds = extractAdoIds(msg);
        const author = c.author?.user?.display_name || c.author?.raw?.split('<')[0]?.trim() || 'unknown';

        for (const id of adoIds) {
          if (!bbActivity[id]) bbActivity[id] = { repos: new Set(), authors: new Set(), lastCommit: null, hasMergedPR: false, prLinks: [] };
          bbActivity[id].repos.add(repo);
          bbActivity[id].authors.add(author);
          if (!bbActivity[id].lastCommit || commitDate > new Date(bbActivity[id].lastCommit)) {
            bbActivity[id].lastCommit = c.date;
          }
        }
      }
    } catch (e) { /* skip */ }

    // 近期 merged PRs
    try {
      const mergedPRs = await bb.getPullRequests(repo, { state: 'MERGED', limit: 30 });
      for (const pr of mergedPRs) {
        const mergedDate = new Date(pr.updated_on);
        if (mergedDate.getTime() / 1000 < since) continue;

        const text = `${pr.title} ${pr.source?.branch?.name || ''}`;
        const adoIds = extractAdoIds(text);

        for (const id of adoIds) {
          if (!bbActivity[id]) bbActivity[id] = { repos: new Set(), authors: new Set(), lastCommit: null, hasMergedPR: false, prLinks: [] };
          bbActivity[id].hasMergedPR = true;
          bbActivity[id].prLinks.push({ repo, id: pr.id, title: pr.title, url: pr.links?.html?.href });
        }
      }
    } catch (e) { /* skip */ }

    // Open PRs
    try {
      const openPRs = await bb.getPullRequests(repo, { state: 'OPEN', limit: 30 });
      for (const pr of openPRs) {
        const text = `${pr.title} ${pr.source?.branch?.name || ''}`;
        const adoIds = extractAdoIds(text);
        for (const id of adoIds) {
          if (!bbActivity[id]) bbActivity[id] = { repos: new Set(), authors: new Set(), lastCommit: null, hasMergedPR: false, prLinks: [] };
          bbActivity[id].repos.add(repo);
        }
      }
    } catch (e) { /* skip */ }
  }

  // 轉換 Set → Array
  for (const id of Object.keys(bbActivity)) {
    bbActivity[id].repos = [...bbActivity[id].repos];
    bbActivity[id].authors = [...bbActivity[id].authors];
  }

  // ── 2. 收集 ADO 工單 ────────────────────────────────────────────────
  const adoItems = db.prepare(`
    SELECT id, title, state, assigned_to, updated_at, customer_tag, type
    FROM ado_workitems
    WHERE type IN ('Bug', 'User Story')
      AND state IN ('New', 'Active', 'Code Review', 'Pending', 'Resolved')
      AND created_at > ?
    ORDER BY id DESC
  `).all(since);

  const adoMap = {};
  for (const item of adoItems) {
    adoMap[String(item.id)] = item;
  }

  // ── 3. 交叉比對 ────────────────────────────────────────────────────
  const issues = [];

  // 3a. ADO Active/Code Review 但 BB 無 commit（假性活躍，>3天）
  const activeStates = ['Active', 'Code Review'];
  for (const item of adoItems) {
    if (!activeStates.includes(item.state)) continue;
    const bb_data = bbActivity[String(item.id)];
    const daysSinceUpdate = Math.round((now - item.updated_at) / 86400);

    if (!bb_data && daysSinceUpdate > 3) {
      issues.push({
        type: 'phantom_active',
        severity: daysSinceUpdate > 7 ? 'high' : 'medium',
        adoId: item.id,
        title: item.title.substring(0, 60),
        state: item.state,
        assignedTo: item.assigned_to,
        daysSinceUpdate,
        message: `ADO #${item.id} 狀態 ${item.state} 但 ${DAYS_LOOKBACK} 天內無對應 commit（${daysSinceUpdate} 天未更新）`,
      });
    }
  }

  // 3b. BB 有 commit 但 ADO 還在 New（忘記更新狀態）
  for (const [adoId, bb_data] of Object.entries(bbActivity)) {
    const ado = adoMap[adoId];
    if (!ado) continue;

    if (ado.state === 'New' && bb_data.lastCommit) {
      issues.push({
        type: 'forgot_update',
        severity: 'medium',
        adoId: parseInt(adoId),
        title: ado.title.substring(0, 60),
        state: ado.state,
        assignedTo: ado.assigned_to,
        bbAuthors: bb_data.authors,
        lastCommit: bb_data.lastCommit,
        message: `ADO #${adoId} 還在 New 但已有 commit（${bb_data.authors.join(', ')}），應更新為 Active`,
      });
    }
  }

  // 3c. PR 已 merged 但 ADO 未 Resolved/Closed（忘記結案）
  for (const [adoId, bb_data] of Object.entries(bbActivity)) {
    if (!bb_data.hasMergedPR) continue;
    const ado = adoMap[adoId];
    if (!ado) continue;

    if (['New', 'Active', 'Code Review', 'Pending'].includes(ado.state)) {
      issues.push({
        type: 'forgot_close',
        severity: 'high',
        adoId: parseInt(adoId),
        title: ado.title.substring(0, 60),
        state: ado.state,
        assignedTo: ado.assigned_to,
        mergedPRs: bb_data.prLinks.map(p => ({ repo: p.repo, id: p.id, url: p.url })),
        message: `ADO #${adoId} 的 PR 已 merged 但工單還在 ${ado.state}，應結案`,
      });
    }
  }

  if (!issues.length) {
    console.log('NO_GAP');
    process.exit(0);
  }

  // 按嚴重度排序
  const severityOrder = { high: 0, medium: 1, low: 2 };
  issues.sort((a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9));

  console.log(JSON.stringify({
    checkTime: new Date().toISOString(),
    totalAdoItems: adoItems.length,
    totalBBTracked: Object.keys(bbActivity).length,
    issueCount: issues.length,
    byType: {
      phantom_active: issues.filter(i => i.type === 'phantom_active').length,
      forgot_update: issues.filter(i => i.type === 'forgot_update').length,
      forgot_close: issues.filter(i => i.type === 'forgot_close').length,
    },
    issues,
  }, null, 2));
}

main().catch(e => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
