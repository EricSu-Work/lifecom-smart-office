/**
 * generate_gantt.js
 * 從 ADO Feature（有 TargetDate）生成 Mermaid Gantt chart
 * 燈號依完成率 + 逾期狀態
 */
const ado = require('./ado_client');

function extractCustomer(title) {
  const m = title.match(/\[LifeERP[^\]]*\]\[([^\]]+)\]/);
  return m ? m[1] : null;
}

function cleanTitle(title) {
  return title.replace(/^\[LifeERP[^\]]*\]\[[^\]]+\]\s*/, '').trim();
}

function fmtDate(isoStr) {
  const d = new Date(isoStr);
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
}

function statusEmoji(weightedRate, targetDate) {
  const now = Date.now();
  if (targetDate) {
    const days = Math.round((new Date(targetDate).getTime() - now) / 86400000);
    if (days < 0 && weightedRate < 100) return '🔴';
    if (days < 7 && weightedRate < 60) return '🟡';
  }
  if (weightedRate >= 80) return '🟢';
  if (weightedRate >= 40) return '🟡';
  if (weightedRate === 0) return '⚫';
  return '🟡';
}

async function getFeatureStories(featureId) {
  const r = await ado.adoPost(
    `/${ado.ORG}/${ado.PROJECT}/_apis/wit/wiql?api-version=7.1&$top=200`,
    { query: `SELECT [System.Id] FROM WorkItemLinks WHERE [Source].[System.Id] = ${featureId} AND [System.Links.LinkType] = 'System.LinkTypes.Hierarchy-Forward' AND [Target].[System.WorkItemType] = 'User Story' MODE (MayContain)` }
  );
  const ids = (r.workItemRelations || []).filter(x => x.target).map(x => x.target.id);
  if (!ids.length) return [];
  return ado.fetchWorkItems(ids, ['System.Id','System.State']);
}

async function main() {
  // 只抓有 TargetDate 且有客戶標籤的 Feature
  const ids = await ado.wiqlQuery(
    `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = 'LifeCOM' AND [System.WorkItemType] = 'Feature' AND [System.State] NOT IN ('Closed','Removed') AND [Microsoft.VSTS.Scheduling.TargetDate] <> '' ORDER BY [System.AreaPath]`,
    200
  );
  if (!ids.length) { console.log('No features with target date'); return; }

  const features = await ado.fetchWorkItems(ids, [
    'System.Id','System.Title','System.State',
    'Microsoft.VSTS.Scheduling.TargetDate',
    'System.CreatedDate','System.AssignedTo',
  ]);

  // 過濾有客戶標籤的
  const withCustomer = features.filter(f => extractCustomer(f.fields['System.Title']));

  // 計算每個 Feature 的進度
  const rows = await Promise.all(withCustomer.map(async f => {
    const title = f.fields['System.Title'];
    const tdate = f.fields['Microsoft.VSTS.Scheduling.TargetDate'];
    const created = f.fields['System.CreatedDate'];
    const assignee = f.fields['System.AssignedTo']?.displayName || '';

    const stories = await getFeatureStories(f.id);
    const { weightedRate } = ado.calcProgress(stories);
    const emoji = statusEmoji(weightedRate, tdate);

    // 計算 start/duration
    const targetMs = new Date(tdate).getTime();
    const createdMs = new Date(created).getTime();
    const durationDays = Math.max(1, Math.round((targetMs - createdMs) / 86400000));
    const startDate = fmtDate(created);

    return {
      customer: extractCustomer(title),
      cleanTitle: cleanTitle(title),
      assignee,
      emoji,
      weightedRate,
      startDate,
      durationDays,
      tdate,
    };
  }));

  // 依客戶分組
  const groups = {};
  for (const r of rows) {
    if (!groups[r.customer]) groups[r.customer] = [];
    groups[r.customer].push(r);
  }

  // 生成 Mermaid Gantt
  const lines = [
    'gantt',
    '  title 專案關鍵里程碑甘特圖',
    '  dateFormat YYYY/MM/DD',
    '  axisFormat %m/%d',
    '',
  ];

  for (const [customer, items] of Object.entries(groups).sort((a,b) => a[0].localeCompare(b[0]))) {
    lines.push(`  section ${customer}`);
    items.sort((a,b) => new Date(a.startDate) - new Date(b.startDate)).forEach((i, idx) => {
      const label = `${i.emoji}${i.cleanTitle}`.slice(0, 60);
      const id = `f${idx}`;
      lines.push(`  ${label} :${id}, ${i.startDate}, ${i.durationDays}d`);
    });
    lines.push('');
  }

  console.log(lines.join('\n'));
}

main().catch(e => console.error(e.stack));
