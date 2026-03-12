/**
 * ado_project_section.js — ADO 專案進度區塊
 * 查詢當前 Iteration 的 Epic/Feature，依 State 加權計算進度與燈號
 * Usage: require('./ado_project_section').generate(options)
 * Options: { iteration, dayRange, format: 'ceo'|'cto' }
 */
const ado = require('./ado_client');

const DEV_KEYWORDS = ['上線前','建置','架設新版','獨立系統','K8S','k8s','串接.*建置','上線.*開發'];
function isDevEpic(title) {
  return DEV_KEYWORDS.some((kw) => new RegExp(kw,'i').test(title));
}

async function generate({ format = 'ceo', iterationPath = 'LifeCOM\\\\2026\\\\Mar-W1' } = {}) {
  const today = new Date();

  // ── 1. 查當前 Iteration 的所有工作項目 ───────────────────────────────────
  const ids = await ado.wiqlQuery(
    `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${ado.PROJECT}' AND [System.WorkItemType] IN ('Epic','Feature','User Story') AND [System.IterationPath] = '${iterationPath}' AND [System.State] NOT IN ('Removed') ORDER BY [System.WorkItemType],[System.Id]`,
    500
  );

  if (ids.length === 0) return `*(${iterationPath} 無工作項目)*`;

  const items = await ado.fetchWorkItems(ids);

  // ── 2. 分層：Epic → Feature → Story ──────────────────────────────────────
  const epics    = items.filter(i => i.fields['System.WorkItemType'] === 'Epic');
  const features = items.filter(i => i.fields['System.WorkItemType'] === 'Feature');
  const stories  = items.filter(i => i.fields['System.WorkItemType'] === 'User Story');

  // 計算各層進度
  function summarize(group) {
    const prog = ado.calcProgress(group);
    const light = ado.getLight(prog.weightedRate, 0);
    return { ...prog, light };
  }

  const epicProg    = summarize(epics);
  const featureProg = summarize(features);
  const storyProg   = summarize(stories);

  // ── 3. 找出需要注意的項目（State = New/Pending，距上次更新 > 7天）────────
  const stale = items.filter(i => {
    const st = i.fields['System.State'];
    const changed = new Date(i.fields['System.ChangedDate']);
    const days = Math.floor((today - changed) / 86400000);
    return ['New','Pending'].includes(st) && days > 7;
  });

  // ── 4. 組報告 ─────────────────────────────────────────────────────────────
  const lines = [];
  const iterLabel = iterationPath.split('\\').pop();

  if (format === 'ceo') {
    // CEO：摘要燈號 + 需關注項目
    lines.push(`📋 *專案進度 — ${iterLabel}*`);
    lines.push(`Epic ${epicProg.light} ${epicProg.weightedRate}% | Feature ${featureProg.light} ${featureProg.weightedRate}% | Story ${storyProg.light} ${storyProg.weightedRate}%`);
    lines.push(`Story 總計 ${storyProg.total} 筆：Closed ${storyProg.closed} / 進行中 ${storyProg.breakdown['Active']||0}+${storyProg.breakdown['Code Review']||0} / 未開始 ${storyProg.breakdown['New']||0}`);

    if (stale.length > 0) {
      lines.push(`⚠️ *停滯超過 7 天（${stale.length} 筆）：*`);
      stale.slice(0,5).forEach(i => {
        const f = i.fields;
        const area = (f['System.AreaPath']||'').replace(/^LifeCOM\\(RD|OP)\\?/,'');
        const days = Math.floor((today - new Date(f['System.ChangedDate'])) / 86400000);
        lines.push(`  • #${f['System.Id']} [${area}] ${f['System.Title'].substring(0,40)} — ${f['System.State']} ${days}天`);
      });
      if (stale.length > 5) lines.push(`  …等共 ${stale.length} 筆`);
    }

  } else {
    // CTO：完整 Epic/Feature 明細
    lines.push(`📋 *專案進度詳情 — ${iterLabel}*`);
    lines.push(`Epic: ${epicProg.total}筆 加權${epicProg.weightedRate}% | Feature: ${featureProg.total}筆 加權${featureProg.weightedRate}% | Story: ${storyProg.total}筆 加權${storyProg.weightedRate}%`);
    lines.push('');

    // State breakdown
    const storyBd = Object.entries(storyProg.breakdown||{}).map(([s,c]) => `${s}×${c}`).join(' / ');
    lines.push(`Story State 分佈：${storyBd}`);
    lines.push('');

    // 未關閉 Stories
    const openStories = stories.filter(i => !['Closed'].includes(i.fields['System.State']));
    if (openStories.length > 0) {
      lines.push(`*進行中/未完成 Stories（${openStories.length}筆）：*`);
      const stateOrder = ['Active','Code Review','Resolved','Pending','New'];
      stateOrder.forEach(st => {
        const group = openStories.filter(i => i.fields['System.State'] === st);
        if (group.length === 0) return;
        const icon = {'Active':'🔵','Code Review':'🟠','Resolved':'🟡','Pending':'🟡','New':'⬜'}[st]||'⬜';
        lines.push(`  ${icon} ${st} (${group.length})`);
        group.slice(0,3).forEach(i => {
          const f = i.fields;
          const area = (f['System.AreaPath']||'').replace(/^LifeCOM\\(RD|OP)\\?/,'');
          const changed = Math.floor((today - new Date(f['System.ChangedDate'])) / 86400000);
          const staleStr = changed > 3 ? ` ⏰${changed}d` : '';
          lines.push(`    #${f['System.Id']} [${area}] ${f['System.Title'].substring(0,45)}${staleStr}`);
        });
        if (group.length > 3) lines.push(`    …等 ${group.length} 筆`);
      });
    }
  }

  return lines.join('\n');
}

module.exports = { generate };

// CLI 直接執行
if (require.main === module) {
  const fmt = process.argv[2] || 'ceo';
  generate({ format: fmt }).then(console.log).catch(console.error);
}
