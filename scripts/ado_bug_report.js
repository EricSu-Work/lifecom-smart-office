/**
 * ado_bug_report.js — ADO 工單狀態區塊（供 CEO/CTO 日報使用）
 * 查詢近期 Bug，依 State 加權顯示進度燈號
 * Usage: node ado_bug_report.js [--format slack|text]
 * Output: 印出工單摘要區塊，可 pipe 進日報腳本
 */
const ado = require('./ado_client');

const args = process.argv.slice(2);
const FORMAT = args.includes('--format') ? args[args.indexOf('--format') + 1] : 'slack';

async function main() {
  const today = new Date();
  // 取本週 Monday 開始
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 14); // 近兩週
  const weekAgoStr = weekAgo.toISOString().split('T')[0];

  // 查近兩週新增 Bug（Mar-W1 以內）
  const ids = await ado.wiqlQuery(
    `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${ado.PROJECT}' AND [System.WorkItemType] = 'Bug' AND [System.CreatedDate] >= '${weekAgoStr}' AND [System.State] NOT IN ('Removed') ORDER BY [System.CreatedDate] DESC`,
    100
  );

  if (ids.length === 0) {
    console.log('*(近兩週無新 Bug)*');
    return;
  }

  const bugs = await ado.fetchWorkItems(ids, [
    'System.Id','System.Title','System.State','System.AreaPath',
    'System.AssignedTo','System.CreatedDate','System.ChangedDate',
    'Microsoft.VSTS.Common.Priority','Microsoft.VSTS.Common.Severity',
  ]);

  // 依 State 分組
  const groups = {};
  bugs.forEach((b) => {
    const st = b.fields['System.State'];
    if (!groups[st]) groups[st] = [];
    groups[st].push(b);
  });

  // State 顯示順序
  const STATE_ORDER = ['New', 'Active', 'Code Review', 'Pending', 'Resolved', 'Closed'];
  const STATE_ICON = {
    'New': '🔴', 'Pending': '🟡', 'Active': '🔵',
    'Code Review': '🟠', 'Resolved': '🟡', 'Closed': '✅',
  };

  const lines = [];
  lines.push(`🐛 *工單狀態（近兩週，共 ${bugs.length} 筆）*`);

  // 摘要行
  const summary = STATE_ORDER
    .filter((s) => groups[s] && groups[s].length > 0)
    .map((s) => `${STATE_ICON[s]} ${s} ${groups[s].length}`)
    .join(' | ');
  lines.push(summary);
  lines.push('');

  // 未關閉工單（需要關注）
  const openStates = ['New', 'Active', 'Code Review', 'Pending'];
  const openBugs = bugs.filter((b) => openStates.includes(b.fields['System.State']));

  if (openBugs.length > 0) {
    lines.push('*未關閉工單：*');
    openBugs.forEach((b) => {
      const f = b.fields;
      const st = f['System.State'];
      const icon = STATE_ICON[st] || '⬜';
      const area = (f['System.AreaPath'] || '').replace(/^LifeCOM\\(RD|OP)\\?/, '');
      const assignee = f['System.AssignedTo']
        ? (f['System.AssignedTo'].displayName || '').split(' ')[0] : '未指派';
      const pri = f['Microsoft.VSTS.Common.Priority'] || '';
      const priStr = pri ? ` P${pri}` : '';
      const changed = f['System.ChangedDate'] ? f['System.ChangedDate'].split('T')[0] : '';
      const daysSince = changed ? Math.floor((today - new Date(changed)) / 86400000) : 0;
      const staleStr = daysSince > 3 ? ` ⏰${daysSince}d` : '';
      lines.push(`  ${icon} #${f['System.Id']}${priStr} [${area}] ${f['System.Title'].substring(0, 50)} — ${assignee}${staleStr}`);
    });
  }

  // 本週關閉數
  const closedToday = bugs.filter((b) => {
    if (b.fields['System.State'] !== 'Closed') return false;
    const changed = b.fields['System.ChangedDate'];
    if (!changed) return false;
    return Math.floor((today - new Date(changed)) / 86400000) <= 1;
  });
  if (closedToday.length > 0) {
    lines.push('');
    lines.push(`*今日已關閉：* ${closedToday.length} 筆 ✅`);
  }

  const output = lines.join('\n');
  console.log(output);
}

main().catch(console.error);
