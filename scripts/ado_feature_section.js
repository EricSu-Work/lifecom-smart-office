/**
 * ado_feature_section.js — 專案控管維度
 * 以 Feature 為單位，每個 Feature = 一個專案（Store/需求）
 * Feature.TargetDate = 目標上線日
 * Feature 底下的 Stories 加權算完成率
 *
 * generate({ format: 'ceo' | 'cto' | 'cs' | 'project', iterationPath, epicId })
 * - ceo:     Feature 清單 + 燈號 + 完成率 + TargetDate（摘要）
 * - cto:     Feature + 底下 Story 狀態分佈（詳細）
 * - cs:      僅顯示已逾期或即將到期的 Feature（客戶關注）
 * - project: 依客戶分組，每客戶只顯示燈號數量 + 整體完成率（無客戶標籤者略過）
 */
const ado = require('./ado_client');

// ── 燈號（以 TargetDate + 完成率 為主）──────────────────────────────────────
function getFeatureLight(weightedRate, targetDate) {
  const now = Date.now();
  if (targetDate) {
    const td   = new Date(targetDate).getTime();
    const days = Math.round((td - now) / 86400000);
    if (days < 0 && weightedRate < 100) return '🔴';  // 已逾期
    if (days < 3  && weightedRate < 80)  return '🔴';  // 即將到期但未完成
    if (days < 7  && weightedRate < 60)  return '🟡';  // 接近截止
    if (days < 14 && weightedRate < 30)  return '🟡';
  }
  if (weightedRate >= 80) return '🟢';
  if (weightedRate >= 40) return '🟡';
  if (weightedRate === 0) return '⚫';
  return '🔴';
}

// ── 格式化 TargetDate ────────────────────────────────────────────────────────
function fmtDate(isoStr) {
  if (!isoStr) return '未定';
  const d = new Date(isoStr);
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
}

function daysTo(isoStr) {
  if (!isoStr) return null;
  const diff = new Date(isoStr).getTime() - Date.now();
  return Math.round(diff / 86400000);
}

// ── 取 Feature 底下所有 Story ───────────────────────────────────────────────
async function getFeatureStories(featureId) {
  const r = await ado.adoPost(
    `/${ado.ORG}/${ado.PROJECT}/_apis/wit/wiql?api-version=7.1&$top=200`,
    { query: `SELECT [System.Id] FROM WorkItemLinks WHERE [Source].[System.Id] = ${featureId} AND [System.Links.LinkType] = 'System.LinkTypes.Hierarchy-Forward' AND [Target].[System.WorkItemType] = 'User Story' MODE (MayContain)` }
  );
  const ids = (r.workItemRelations || []).filter(x => x.target).map(x => x.target.id);
  if (!ids.length) return [];
  return ado.fetchWorkItems(ids, ['System.Id','System.Title','System.State','System.ChangedDate']);
}

// ── 主函式 ──────────────────────────────────────────────────────────────────
async function generate({ format = 'ceo', iterationPath, epicId } = {}) {
  // 1. 查詢 Active/New Feature
  const whereParts = [
    `[System.TeamProject] = '${ado.PROJECT}'`,
    `[System.WorkItemType] = 'Feature'`,
    `[System.State] NOT IN ('Closed','Removed')`,
  ];
  if (iterationPath) whereParts.push(`[System.IterationPath] UNDER '${iterationPath}'`);
  if (epicId)        whereParts.push(`[System.Parent] = ${epicId}`);

  const ids = await ado.wiqlQuery(
    `SELECT [System.Id] FROM WorkItems WHERE ${whereParts.join(' AND ')} ORDER BY [Microsoft.VSTS.Scheduling.TargetDate]`,
    100
  );
  if (!ids.length) return '  *(目前無進行中專案)*';

  const features = await ado.fetchWorkItems(ids, [
    'System.Id','System.Title','System.State','System.AreaPath',
    'System.ChangedDate','Microsoft.VSTS.Scheduling.TargetDate',
    'Microsoft.VSTS.Scheduling.FinishDate',
  ]);

  // 2. 對每個 Feature 取 Story 進度
  const rows = await Promise.all(features.map(async (f) => {
    const fid      = f.id;
    const title    = f.fields['System.Title'];
    const state    = f.fields['System.State'];
    const area     = (f.fields['System.AreaPath'] || '').replace(/^LifeCOM\\(RD|OP)\\?/,'');
    const tdate    = f.fields['Microsoft.VSTS.Scheduling.TargetDate'];
    const changed  = f.fields['System.ChangedDate'];
    const daysSince= Math.round((Date.now() - new Date(changed).getTime()) / 86400000);

    const stories  = await getFeatureStories(fid);
    const { weightedRate, total, breakdown } = ado.calcProgress(stories);
    const light    = getFeatureLight(weightedRate, tdate);
    const days     = daysTo(tdate);

    return { fid, title, area, state, tdate, weightedRate, total, breakdown, light, days, daysSince };
  }));

  // 3. 排序：🔴 → 🟡 → ⚫ → 🟢
  const order = { '🔴':0, '🟡':1, '⚫':2, '🟢':3 };
  rows.sort((a,b) => (order[a.light]??9) - (order[b.light]??9));

  // 4. 依格式輸出
  if (format === 'ceo') {
    const lines = ['*📁 專案進度（Feature 維度）*'];
    rows.forEach(r => {
      const dateStr = r.tdate ? `目標上線：${fmtDate(r.tdate)}${r.days !== null ? (r.days < 0 ? ` ⚠️ 逾期${Math.abs(r.days)}天` : ` (剩${r.days}天)`) : ''}` : '上線日未定';
      const prog    = r.total > 0 ? `${r.weightedRate}%` : '尚無工作包';
      lines.push(`  ${r.light} *${r.title}* — ${prog} | ${dateStr}`);
    });
    return lines.join('\n');
  }

  if (format === 'cto') {
    const lines = ['*📁 專案進度詳情（Feature + Story）*'];
    rows.forEach(r => {
      const dateStr = r.tdate
        ? `${fmtDate(r.tdate)}${r.days !== null ? (r.days < 0 ? ` ‼️逾期${Math.abs(r.days)}天` : ` 剩${r.days}天`) : ''}`
        : '未定';
      lines.push(`${r.light} *[${r.fid}] ${r.title}* (${r.state})`);
      lines.push(`   進度 ${r.weightedRate}%（${r.total} 個 Story）| 上線日 ${dateStr}`);
      if (r.total > 0) {
        const bd = Object.entries(r.breakdown).map(([s,c]) => `${ado.STATE_LABEL[s]||s}×${c}`).join(', ');
        lines.push(`   分佈：${bd}`);
      }
      if (r.daysSince > 3) lines.push(`   ⚠️ 最後更新 ${r.daysSince} 天前`);
    });
    return lines.join('\n');
  }

  if (format === 'cs') {
    // 只顯示需要客成關注的：逾期 or 即將到期 or 有 Story 卡住
    const atRisk = rows.filter(r => r.light === '🔴' || r.light === '🟡');
    if (!atRisk.length) return '  ✅ 所有進行中專案目前進度正常';
    const lines = ['*⚠️ 需關注的專案*'];
    atRisk.forEach(r => {
      const dateStr = r.days !== null
        ? (r.days < 0 ? `已逾期 ${Math.abs(r.days)} 天` : `${r.days} 天後截止`)
        : '截止日未定';
      lines.push(`  ${r.light} *${r.title}* — ${dateStr}，完成 ${r.weightedRate}%`);
    });
    return lines.join('\n');
  }

  // ── project 格式：依客戶分組，只顯示燈號統計 + 整體完成率 ──────────────────
  if (format === 'project') {
    // 提取客戶名（無標籤 → 略過，歸維運）
    function extractCustomer(title) {
      const m = title.match(/\[LifeERP[^\]]*\]\[([^\]]+)\]/);
      return m ? m[1] : null;
    }

    const lightOrd = { '🔴':0, '🟡':1, '⚫':2, '🟢':3 };

    // 依客戶分組
    const groups = {};
    for (const r of rows) {
      const customer = extractCustomer(r.title);
      if (!customer) continue; // 無客戶標籤 → 略過
      if (!groups[customer]) groups[customer] = [];
      groups[customer].push(r);
    }

    if (!Object.keys(groups).length) return '  *(目前無具客戶標籤的進行中專案)*';

    // 每個客戶：worst light、總 Story 加權完成率
    const customers = Object.entries(groups).map(([name, items]) => {
      const worst = Math.min(...items.map(i => lightOrd[i.light] ?? 9));
      const worstLight = Object.keys(lightOrd).find(k => lightOrd[k] === worst) || '🟡';
      const totalStories = items.reduce((s, i) => s + i.total, 0);
      const overallRate = totalStories > 0
        ? Math.round(items.reduce((s, i) => s + i.weightedRate * i.total, 0) / totalStories)
        : null;
      const lights = { '🔴':0, '🟡':0, '⚫':0, '🟢':0 };
      items.forEach(i => { lights[i.light] = (lights[i.light]||0) + 1; });
      const overdueCount = items.filter(i => i.days !== null && i.days < 0).length;
      return { name, items, worst, worstLight, overallRate, lights, overdueCount, totalProjects: items.length };
    });

    // 排序：worst light → overdueCount desc → totalProjects desc
    customers.sort((a,b) =>
      a.worst - b.worst ||
      b.overdueCount - a.overdueCount ||
      b.totalProjects - a.totalProjects
    );

    const lines = ['*📊 專案開發進度（客戶視角）*'];
    customers.forEach(c => {
      const lightSummary = ['🔴','🟡','⚫','🟢']
        .filter(l => c.lights[l] > 0)
        .map(l => `${l}×${c.lights[l]}`)
        .join(' ');
      const rateStr = c.overallRate !== null ? `  完成率 ${c.overallRate}%` : '';
      const overdueStr = c.overdueCount > 0 ? `  ⚠️逾期${c.overdueCount}項` : '';
      lines.push(`  ${c.worstLight} *${c.name}*（${c.totalProjects} 項）${lightSummary}${overdueStr}${rateStr}`);
    });

    // 未填 TargetDate 的異常清單（含無客戶標籤的也一起列）
    const noDate = rows.filter(r => !r.tdate);
    if (noDate.length) {
      lines.push('');
      lines.push(`*📋 未填上線日（需補正，共 ${noDate.length} 項）*`);
      noDate.forEach(r => {
        const customer = extractCustomer(r.title) || '通用';
        const cleanTitle = r.title
          .replace(/^\[LifeERP[^\]]*\]\[[^\]]+\]\s*/, '')
          .replace(/^\[FTP\]\[[^\]]+\]\s*/, '')
          .trim();
        const short = cleanTitle.length > 40 ? cleanTitle.slice(0,40)+'…' : cleanTitle;
        lines.push(`  • [${r.fid}] *${customer}* — ${short}`);
      });
    }

    return lines.join('\n');
  }

  return '  *(未知格式)*';
}

module.exports = { generate };
