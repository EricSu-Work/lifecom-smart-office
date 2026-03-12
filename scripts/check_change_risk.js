'use strict';
/**
 * check_change_risk.js — 變更風險評估 + 告警關聯（Phase F）
 *
 * 偵測：
 *   1. 大型 PR（>300 行變更）→ 標記高風險
 *   2. 變更核心模組（config、migration、routes）→ 標記高風險
 *   3. 近期 merged PR 與系統告警 timeline 關聯
 *
 * 有風險 → 輸出 JSON
 * 無風險 → 輸出 "NO_RISK"
 */
const { db } = require('./lifecom_db');
const bb = require('./bitbucket_client');
const { extractAdoIds } = require('./bitbucket_section');

// nativedog 排除：獨立 app，不走 ADO 工單流程
const ACTIVE_REPOS = ['newblackdog', 'newblackdog_loreal'];

// 核心模組關鍵字（路徑含這些就算高風險）
const CORE_PATHS = [
  'config/', 'database/', 'migration', 'routes/',
  'Kernel.php', 'bootstrap/', '.env', 'composer.json',
  'package.json', 'dockerfile', 'cloudbuild', 'k8s/',
  'deploy/', 'scheduler', 'queue', 'artisan',
];

const LARGE_PR_THRESHOLD = 300; // 行

async function main() {
  const now = Math.floor(Date.now() / 1000);
  const lookback48h = now - 48 * 3600;

  const risks = [];
  const correlations = [];

  for (const repo of ACTIVE_REPOS) {
    // ── 1. 掃描近期 merged PR ──────────────────────────────────────
    let mergedPRs = [];
    try {
      mergedPRs = await bb.getPullRequests(repo, { state: 'MERGED', limit: 15 });
      // 只看 48h 內 merged
      mergedPRs = mergedPRs.filter(pr => new Date(pr.updated_on).getTime() / 1000 > lookback48h);
    } catch (e) { continue; }

    for (const pr of mergedPRs) {
      let diffStats = [];
      try {
        diffStats = await bb.getPRDiffStat(repo, pr.id);
      } catch (e) { continue; }

      const totalLines = diffStats.reduce((s, f) => s + (f.lines_added || 0) + (f.lines_removed || 0), 0);
      const fileCount = diffStats.length;

      // 核心模組變更
      const corePaths = diffStats.filter(f => {
        const p = (f.new?.path || f.old?.path || '').toLowerCase();
        return CORE_PATHS.some(cp => p.includes(cp.toLowerCase()));
      });

      const riskLevel = [];
      if (totalLines > LARGE_PR_THRESHOLD) riskLevel.push(`大型變更 (${totalLines} 行)`);
      if (corePaths.length > 0) riskLevel.push(`核心模組 (${corePaths.length} 檔)`);

      if (riskLevel.length > 0) {
        const adoIds = extractAdoIds(`${pr.title} ${pr.source?.branch?.name || ''}`);
        risks.push({
          repo,
          prId: pr.id,
          title: pr.title,
          author: pr.author?.display_name,
          mergedAt: pr.updated_on,
          url: pr.links?.html?.href,
          totalLines,
          fileCount,
          riskFactors: riskLevel,
          coreFiles: corePaths.slice(0, 5).map(f => f.new?.path || f.old?.path),
          adoIds,
        });
      }

      // ── 2. 告警關聯：merge 後 2h 內是否有系統告警 ──────────────
      const mergeTs = Math.floor(new Date(pr.updated_on).getTime() / 1000);
      const alertWindow = mergeTs + 7200; // 2 hours after merge

      try {
        const alerts = db.prepare(`
          SELECT text, ts FROM slack_messages
          WHERE channel_id = 'C03TBQ5891V'
            AND CAST(ts AS REAL) > ? AND CAST(ts AS REAL) < ?
            AND length(text) > 20
          ORDER BY CAST(ts AS REAL) ASC
          LIMIT 5
        `).all(mergeTs, alertWindow);

        if (alerts.length > 0) {
          correlations.push({
            repo,
            prId: pr.id,
            prTitle: pr.title.substring(0, 50),
            prUrl: pr.links?.html?.href,
            author: pr.author?.display_name,
            mergedAt: pr.updated_on,
            alertCount: alerts.length,
            alerts: alerts.map(a => ({
              text: a.text.replace(/<[^>]+>/g, '').substring(0, 100),
              time: new Date(parseFloat(a.ts) * 1000).toISOString(),
            })),
          });
        }
      } catch (e) { /* DB query failed, skip */ }
    }
  }

  if (!risks.length && !correlations.length) {
    console.log('NO_RISK');
    process.exit(0);
  }

  console.log(JSON.stringify({
    checkTime: new Date().toISOString(),
    highRiskPRs: risks.length,
    alertCorrelations: correlations.length,
    risks,
    correlations,
  }, null, 2));
}

main().catch(e => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
