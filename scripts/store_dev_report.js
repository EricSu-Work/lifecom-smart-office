/**
 * store_dev_report.js — 開發中 Store 進度報告
 * 以 Feature（專案）為單位，每個 Feature = 一個 Store 建置專案
 * Feature.TargetDate = 目標上線日
 * 底下 Story 加權計算完成率 → 燈號
 *
 * 篩選條件：
 *   - WorkItemType = Feature
 *   - State IN ('New','Active','Pending')
 *   - TargetDate 不為空（代表有上線目標）OR Title 含特定關鍵字
 *   - 可選：指定 epicId 限定在某個維運 Epic 底下
 */
const ado = require('./ado_client');

// 燈號（Feature 維度：TargetDate + 完成率）
function getFeatureLight(weightedRate, targetDate) {
  const now = Date.now();
  if (targetDate) {
    const td   = new Date(targetDate).getTime();
    const days = Math.round((td - now) / 86400000);
    if (days < 0  && weightedRate < 100) return '🔴';  // 逾期
    if (days < 3  && weightedRate < 80)  return '🔴';
    if (days < 7  && weightedRate < 60)  return '🟡';
    if (days < 14 && weightedRate < 30)  return '🟡';
  } else {
    // 無截止日：用更新天數判斷
    // 由呼叫端用 daysSince 判斷
  }
  if (weightedRate >= 80) return '🟢';
  if (weightedRate >= 40) return '🟡';
  if (weightedRate === 0) return '⚫';
  return '🔴';
}

function fmtDate(isoStr) {
  if (!isoStr) return '上線日未定';
  const d = new Date(isoStr);
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
}

function daysTo(isoStr) {
  if (!isoStr) return null;
  return Math.round((new Date(isoStr).getTime() - Date.now()) / 86400000);
}

// 取 Feature 底下的 Stories
async function getStories(featureId) {
  const r = await ado.adoPost(
    `/${ado.ORG}/${ado.PROJECT}/_apis/wit/wiql?api-version=7.1&$top=200`,
    { query: `SELECT [System.Id] FROM WorkItemLinks WHERE [Source].[System.Id] = ${featureId} AND [System.Links.LinkType] = 'System.LinkTypes.Hierarchy-Forward' AND [Target].[System.WorkItemType] = 'User Story' MODE (MayContain)` }
  );
  const ids = (r.workItemRelations||[]).filter(x=>x.target).map(x=>x.target.id);
  if (!ids.length) return [];
  return ado.fetchWorkItems(ids, ['System.Id','System.State','System.ChangedDate','System.Title']);
}

async function run({ epicId, maxFeatures = 20 } = {}) {
  // 查詢有 TargetDate 或開發中的 Feature
  const whereParts = [
    `[System.TeamProject] = '${ado.PROJECT}'`,
    `[System.WorkItemType] = 'Feature'`,
    `[System.State] IN ('New','Active','Pending')`,
  ];
  if (epicId) whereParts.push(`[System.Parent] = ${epicId}`);

  // 先查有 TargetDate 的
  const idsWithDate = await ado.wiqlQuery(
    `SELECT [System.Id] FROM WorkItems WHERE ${whereParts.join(' AND ')} AND [Microsoft.VSTS.Scheduling.TargetDate] <> '' ORDER BY [Microsoft.VSTS.Scheduling.TargetDate]`,
    maxFeatures
  );

  // 也查最近有動靜的 (無 TargetDate 但 Active)
  const idsActive = await ado.wiqlQuery(
    `SELECT [System.Id] FROM WorkItems WHERE ${whereParts.join(' AND ')} AND [Microsoft.VSTS.Scheduling.TargetDate] = '' AND [System.ChangedDate] >= '${new Date(Date.now()-60*86400000).toISOString().split('T')[0]}' ORDER BY [System.ChangedDate] DESC`,
    maxFeatures
  );

  const allIds = [...new Set([...idsWithDate, ...idsActive])];
  if (!allIds.length) return { lines: ['  *(目前無開發中 Store 專案)*'], rows: [] };

  const features = await ado.fetchWorkItems(allIds, [
    'System.Id','System.Title','System.State','System.AreaPath',
    'System.ChangedDate','Microsoft.VSTS.Scheduling.TargetDate',
  ]);

  // 對每個 Feature 算進度
  const rows = await Promise.all(features.map(async f => {
    const fid      = f.id;
    const title    = f.fields['System.Title'];
    const tdate    = f.fields['Microsoft.VSTS.Scheduling.TargetDate'];
    const changed  = f.fields['System.ChangedDate'];
    const daysSince= Math.round((Date.now() - new Date(changed).getTime()) / 86400000);

    const stories  = await getStories(fid);
    const { weightedRate, total, breakdown } = ado.calcProgress(stories);

    let light = getFeatureLight(weightedRate, tdate);
    // 無截止日但長期未更新
    if (!tdate && daysSince > 30 && weightedRate === 0) light = '⚫';
    if (!tdate && daysSince > 14 && weightedRate < 30)  light = '🔴';

    return { fid, title, tdate, weightedRate, total, breakdown, light, daysSince };
  }));

  // 排序：🔴 → 🟡 → ⚫ → 🟢
  const order = { '🔴':0,'🟡':1,'⚫':2,'🟢':3 };
  rows.sort((a,b) => (order[a.light]??9) - (order[b.light]??9));

  const lines = ['*🏪 開發中 Store 專案進度*'];
  rows.forEach(r => {
    const dateStr = r.tdate
      ? (() => {
          const d = daysTo(r.tdate);
          const base = fmtDate(r.tdate);
          if (d < 0)  return `${base} ‼️逾期${Math.abs(d)}天`;
          if (d === 0) return `${base} ⚠️今天截止`;
          return `${base} 剩${d}天`;
        })()
      : `無截止日，${r.daysSince}天前更新`;

    const prog  = r.total > 0 ? `${r.weightedRate}%（${r.total}項）` : '尚無工作包';
    lines.push(`  ${r.light} *${r.title}*`);
    lines.push(`     進度 ${prog} | ${dateStr}`);
    if (r.total > 0) {
      const bd = Object.entries(r.breakdown).map(([s,c]) => `${ado.STATE_LABEL[s]||s}:${c}`).join(' / ');
      lines.push(`     ${bd}`);
    }
  });

  return { lines, rows };
}

module.exports = { run };
