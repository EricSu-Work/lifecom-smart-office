const ado = require('./ado_client');

function extractCustomer(title) {
  const m = title.match(/\[LifeERP[^\]]*\]\[([^\]]+)\]/);
  if (m) return m[1];
  if (title.startsWith('[FTP]')) return 'FTP工具';
  return '通用';
}

function cleanTitle(title) {
  return title
    .replace(/^\[LifeERP[^\]]*\]\[[^\]]+\]\s*/, '')
    .replace(/^\[FTP\]\[[^\]]+\]\s*/, '')
    .trim();
}

async function main() {
  const ids = await ado.wiqlQuery(
    `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = 'LifeCOM' AND [System.WorkItemType] = 'Feature' AND [System.State] NOT IN ('Closed','Removed') AND [Microsoft.VSTS.Scheduling.TargetDate] = '' ORDER BY [System.AreaPath]`,
    300
  );
  if (!ids.length) { console.log('✅ 所有 Feature 均已填寫上線日期'); return; }

  const features = await ado.fetchWorkItems(ids, [
    'System.Id','System.Title','System.State','System.AssignedTo'
  ]);

  // 依客戶分組
  const groups = {};
  for (const f of features) {
    const title = f.fields['System.Title'];
    const customer = extractCustomer(title);
    if (!groups[customer]) groups[customer] = [];
    groups[customer].push({
      id: f.id,
      title: cleanTitle(title),
      state: f.fields['System.State'],
      assignee: (f.fields['System.AssignedTo']?.displayName || '未指派'),
    });
  }

  // 輸出（依客戶名排序）
  const lines = [`*📋 專案 Feature 未填上線日期（共 ${ids.length} 項）*`, ''];
  const sorted = Object.entries(groups).sort((a,b) => b[1].length - a[1].length);
  for (const [customer, items] of sorted) {
    lines.push(`*${customer}*（${items.length} 項）`);
    for (const i of items) {
      const short = i.title.length > 45 ? i.title.slice(0,45)+'…' : i.title;
      lines.push(`  • [${i.id}] ${short}  _(${i.state} / ${i.assignee})_`);
    }
    lines.push('');
  }
  console.log(lines.join('\n'));
}

main().catch(e => console.error(e.stack));
