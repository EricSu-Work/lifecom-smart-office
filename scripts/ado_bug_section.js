/**
 * ado_bug_section.js — ADO Bug 狀態區塊（可重用模組）
 * Usage: require('./ado_bug_section').generate({ format: 'ceo'|'cto'|'cs', dayRange: 14 })
 */
const ado = require('./ado_client');

const STATE_ICON = {
  'New': '🔴', 'Pending': '🟡', 'Active': '🔵',
  'Code Review': '🟠', 'Resolved': '🟡', 'Closed': '✅',
};
const STATE_ORDER = ['New','Active','Code Review','Pending','Resolved','Closed'];

async function generate({ format = 'ceo', dayRange = 14 } = {}) {
  const today = new Date();
  const since = new Date(today); since.setDate(since.getDate() - dayRange);
  const sinceStr = since.toISOString().split('T')[0];

  const ids = await ado.wiqlQuery(
    `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${ado.PROJECT}' AND [System.WorkItemType] = 'Bug' AND [System.CreatedDate] >= '${sinceStr}' AND [System.State] NOT IN ('Removed') ORDER BY [System.CreatedDate] DESC`,
    200
  );

  if (ids.length === 0) return `🐛 *工單狀態*\n  *(近${dayRange}天無新工單)*`;

  const bugs = await ado.fetchWorkItems(ids, [
    'System.Id','System.Title','System.State','System.AreaPath',
    'System.AssignedTo','System.CreatedDate','System.ChangedDate',
    'Microsoft.VSTS.Common.Priority','Microsoft.VSTS.Common.Severity',
  ]);

  // 分組
  const groups = {};
  bugs.forEach(b => {
    const st = b.fields['System.State'];
    if (!groups[st]) groups[st] = [];
    groups[st].push(b);
  });

  const openStates  = ['New','Active','Code Review','Pending'];
  const openBugs    = bugs.filter(b => openStates.includes(b.fields['System.State']));
  const closedToday = bugs.filter(b => {
    if (b.fields['System.State'] !== 'Closed') return false;
    return Math.floor((today - new Date(b.fields['System.ChangedDate'])) / 86400000) <= 1;
  });

  const lines = [];

  if (format === 'ceo') {
    // 摘要：一行燈號 + 未關閉 P1
    const summary = STATE_ORDER.filter(s => groups[s]?.length)
      .map(s => `${STATE_ICON[s]} ${s} ${groups[s].length}`).join(' | ');
    lines.push(`🐛 *工單狀態（近${dayRange}天，共${bugs.length}筆）*`);
    lines.push(summary);

    const p1 = openBugs.filter(b => b.fields['Microsoft.VSTS.Common.Priority'] == 1);
    if (p1.length > 0) {
      lines.push(`⚠️ *P1 未關閉（${p1.length}筆）：*`);
      p1.forEach(b => {
        const f = b.fields;
        const area = (f['System.AreaPath']||'').replace(/^LifeCOM\\(RD|OP)\\?/,'');
        lines.push(`  🔴 #${f['System.Id']} [${area}] ${f['System.Title'].substring(0,50)} — ${(f['System.AssignedTo']?.displayName||'未指派').split(' ')[0]}`);
      });
    }
    if (closedToday.length > 0) lines.push(`✅ 今日關閉 ${closedToday.length} 筆`);

  } else if (format === 'cto') {
    // 詳細：完整未關閉清單
    lines.push(`🐛 *工單詳情（近${dayRange}天，共${bugs.length}筆）*`);
    const summary = STATE_ORDER.filter(s => groups[s]?.length)
      .map(s => `${STATE_ICON[s]} ${s} ${groups[s].length}`).join(' | ');
    lines.push(summary);
    lines.push('');

    if (openBugs.length > 0) {
      lines.push(`*未關閉（${openBugs.length}筆）：*`);
      openBugs.forEach(b => {
        const f = b.fields;
        const st  = f['System.State'];
        const area = (f['System.AreaPath']||'').replace(/^LifeCOM\\(RD|OP)\\?/,'');
        const assignee = (f['System.AssignedTo']?.displayName||'未指派').split(' ')[0];
        const pri = f['Microsoft.VSTS.Common.Priority'] || '';
        const changed = Math.floor((today - new Date(f['System.ChangedDate'])) / 86400000);
        const staleStr = changed > 2 ? ` ⏰${changed}d` : '';
        lines.push(`  ${STATE_ICON[st]||'⬜'} #${f['System.Id']} P${pri} [${area}] ${f['System.Title'].substring(0,50)} — ${assignee}${staleStr}`);
      });
    }
    if (closedToday.length > 0) {
      lines.push('');
      lines.push(`✅ *今日關閉（${closedToday.length}筆）：*`);
      closedToday.forEach(b => {
        const f = b.fields;
        const area = (f['System.AreaPath']||'').replace(/^LifeCOM\\(RD|OP)\\?/,'');
        lines.push(`  ✅ #${f['System.Id']} [${area}] ${f['System.Title'].substring(0,50)}`);
      });
    }

  } else if (format === 'cs') {
    // 客成：只顯示客戶看得到的問題（排除 Public/Internal）
    const customerBugs = openBugs.filter(b => {
      const area = b.fields['System.AreaPath']||'';
      return !area.includes('\\Public') && !area.includes('\\Internal');
    });
    if (customerBugs.length === 0) {
      return `🐛 *客戶工單*\n  ✅ 目前無未解決客戶工單`;
    }
    lines.push(`🐛 *客戶工單（${customerBugs.length}筆未關閉）*`);
    customerBugs.forEach(b => {
      const f = b.fields;
      const area = (f['System.AreaPath']||'').replace(/^LifeCOM\\(RD|OP)\\?/,'');
      const pri = f['Microsoft.VSTS.Common.Priority'] || '';
      lines.push(`  ${STATE_ICON[f['System.State']]||'⬜'} #${f['System.Id']} P${pri} [${area}] ${f['System.Title'].substring(0,55)}`);
    });
  }

  return lines.join('\n');
}

module.exports = { generate };

if (require.main === module) {
  const fmt = process.argv[2] || 'ceo';
  generate({ format: fmt }).then(console.log).catch(console.error);
}
