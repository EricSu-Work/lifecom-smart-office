/**
 * ado_epic_section.js — 維運控管維度
 * Epic (WorkItemType=Epic) = 維運工單
 * 以「客戶」為主體分組呈現
 *
 * 客戶名稱萃取順序：
 *   1. AreaPath 最後一段（去掉 LifeCOM\RD\ 或 LifeCOM\OP\）
 *   2. Title 中 [BrandName] 括號樣式
 *   3. Fallback: 'General'
 *
 * generate({ format: 'ceo' | 'cto' })
 */
const ado = require('./ado_client');

// ── 從 AreaPath 萃取客戶 ─────────────────────────────────────────────────────
function extractCustomer(areaPath, title) {
  if (areaPath) {
    // e.g. LifeCOM\RD\Loreal → Loreal
    const parts = areaPath.split('\\').filter(p => p);
    // 去掉 LifeCOM, RD, OP, Public, General 等非客戶段
    const skip = new Set(['lifecom','rd','op','public','general','lifecomtw','erpv2']);
    const customer = parts.reverse().find(p => !skip.has(p.toLowerCase()));
    if (customer && customer !== 'LifeCOM') return customer;
  }
  // Fallback: 從 Title 抓 [Xxx] 第二個括號
  const m = title.match(/\[LifeERP[^\]]*\]\[([^\]]+)\]/i)
         || title.match(/\[WMS\]\[([^\]]+)\]/i)
         || title.match(/^\[([^\]]+)\]/);
  if (m) return m[1];
  return '通用';
}

// ── 燈號（維運角度：進行中工單數 + 上次更新時間）───────────────────────────
function getEpicLight(activeCount, closedCount, daysSince) {
  const total = activeCount + closedCount;
  if (total === 0) return '⚫';
  if (daysSince > 30 && activeCount > 0) return '🔴';
  if (daysSince > 14 && activeCount > 3) return '🟡';
  if (activeCount === 0) return '🟢';
  return '🟢';
}

async function generate({ format = 'ceo' } = {}) {
  // 查 Active/New Epic
  const ids = await ado.wiqlQuery(
    `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${ado.PROJECT}' AND [System.WorkItemType] = 'Epic' AND [System.State] IN ('New','Active') ORDER BY [System.AreaPath],[System.ChangedDate] DESC`,
    100
  );
  if (!ids.length) return '  *(無進行中維運工單)*';

  const epics = await ado.fetchWorkItems(ids, [
    'System.Id','System.Title','System.State',
    'System.AreaPath','System.ChangedDate','System.AssignedTo',
  ]);

  // 以客戶分組
  const byCustomer = {};
  epics.forEach(e => {
    const customer = extractCustomer(
      e.fields['System.AreaPath'],
      e.fields['System.Title']
    );
    if (!byCustomer[customer]) byCustomer[customer] = [];
    byCustomer[customer].push(e);
  });

  // 依客戶名排序
  const customers = Object.keys(byCustomer).sort();

  if (format === 'ceo') {
    const lines = ['*⚙️ 維運工單（依客戶）*'];
    customers.forEach(cust => {
      const items = byCustomer[cust];
      const active = items.filter(e => ['New','Active'].includes(e.fields['System.State'])).length;
      const maxDaysSince = Math.max(...items.map(e =>
        Math.round((Date.now() - new Date(e.fields['System.ChangedDate']).getTime()) / 86400000)
      ));
      const light = getEpicLight(active, 0, maxDaysSince);
      lines.push(`  ${light} *${cust}*：${active} 項進行中，最久 ${maxDaysSince} 天前更新`);
    });
    return lines.join('\n');
  }

  if (format === 'cto') {
    const lines = ['*⚙️ 維運工單詳情（依客戶）*'];
    customers.forEach(cust => {
      const items = byCustomer[cust];
      lines.push(`\n👤 *${cust}*（${items.length} 項）`);
      items.forEach(e => {
        const title    = e.fields['System.Title']
          .replace(/\[LifeERP[^\]]*\]/gi,'').replace(/\[WMS\]/gi,'')
          .replace(/\[[^\]]+\]/g,'').trim();
        const daysSince= Math.round((Date.now() - new Date(e.fields['System.ChangedDate']).getTime()) / 86400000);
        const stale    = daysSince > 14 ? ` ⚠️${daysSince}天未更新` : '';
        const assignee = (e.fields['System.AssignedTo']?.displayName || '未指派').split(' ')[0];
        lines.push(`  • [#${e.id}] ${title}（${assignee}${stale}）`);
      });
    });
    return lines.join('\n');
  }

  return '*(未知格式)*';
}

module.exports = { generate };
