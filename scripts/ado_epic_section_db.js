/**
 * ado_epic_section_db.js — 維運 Epic 區塊（從 lifecom.db 讀取）
 */
const { db } = require('./lifecom_db');

const ADO_BASE = 'https://dev.azure.com/LifeComTW/LifeCOM/_workitems/edit';
function adoLink(id) { return `<${ADO_BASE}/${id}|#${id}>`; }

const SKIP_AREAS = new Set(['lifecom','rd','op','public','general','lifecomtw','erpv2']);

function extractCustomer(areaPath, title) {
  if (areaPath) {
    const parts = areaPath.split('\\').filter(p=>p);
    const c = parts.reverse().find(p => !SKIP_AREAS.has(p.toLowerCase()));
    if (c && c !== 'LifeCOM') return c;
  }
  const m = title.match(/\[LifeERP[^\]]*\]\[([^\]]+)\]/i) || title.match(/\[WMS\]\[([^\]]+)\]/i) || title.match(/^\[([^\]]+)\]/);
  if (m) return m[1];
  return '通用';
}

function getEpicLight(activeCount, daysSince) {
  if (daysSince > 30 && activeCount > 0) return '🔴';
  if (daysSince > 14 && activeCount > 3) return '🟡';
  if (activeCount === 0) return '🟢';
  return '🟢';
}

function generate({ format = 'ceo' } = {}) {
  const epics = db.prepare(`
    SELECT id, title, state, customer_tag, updated_at
    FROM ado_workitems
    WHERE type = 'Epic' AND state IN ('New','Active')
    ORDER BY customer_tag, updated_at DESC
  `).all();

  if (!epics.length) return '📋 *維運工單*\n  *(無進行中 Epic)*';

  // 依客戶分組
  const byCustomer = {};
  epics.forEach(e => {
    const c = extractCustomer(e.customer_tag, e.title);
    if (!byCustomer[c]) byCustomer[c] = [];
    byCustomer[c].push(e);
  });

  const now = Date.now() / 1000;
  const lines = [`📋 *維運工單（Epic）— ${epics.length} 筆進行中*`];

  if (format === 'ceo') {
    const customerLines = [];
    Object.entries(byCustomer).sort((a,b)=>b[1].length-a[1].length).slice(0,15).forEach(([c,items]) => {
      const daysSince = Math.round((now - Math.max(...items.map(i=>i.updated_at))) / 86400);
      const light = getEpicLight(items.length, daysSince);
      customerLines.push(`  ${light} ${c}：${items.length} 筆（最後更新 ${daysSince}d 前）`);
    });
    lines.push(...customerLines);

  } else if (format === 'cto') {
    Object.entries(byCustomer).sort((a,b)=>b[1].length-a[1].length).forEach(([c, items]) => {
      const daysSince = Math.round((now - Math.max(...items.map(i=>i.updated_at))) / 86400);
      const light = getEpicLight(items.length, daysSince);
      lines.push(`\n  ${light} *${c}*（${items.length} 筆，最後更新 ${daysSince}d 前）`);
      items.slice(0,3).forEach(e => {
        lines.push(`    • ${adoLink(e.id)} ${e.title.substring(0,60)}`);
      });
      if (items.length > 3) lines.push(`    … 另 ${items.length-3} 筆`);
    });
  }

  return lines.join('\n');
}

module.exports = { generate };
