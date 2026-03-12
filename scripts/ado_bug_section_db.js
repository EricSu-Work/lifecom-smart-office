/**
 * ado_bug_section_db.js — Bug 狀態區塊（從 lifecom.db 讀取）
 */
const { db } = require('./lifecom_db');

const ADO_BASE = 'https://dev.azure.com/LifeComTW/LifeCOM/_workitems/edit';
function adoLink(id) { return `<${ADO_BASE}/${id}|#${id}>`; }

const STATE_ICON = { 'New':'🔴','Pending':'🟡','Active':'🔵','Code Review':'🟠','Resolved':'🟡','Closed':'✅' };
const STATE_ORDER = ['New','Active','Code Review','Pending','Resolved','Closed'];

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

function generate({ format = 'ceo', dayRange = 14 } = {}) {
  // 與 V1 一致：取當天 00:00 往回 dayRange 天
  const sinceDate = new Date(); sinceDate.setDate(sinceDate.getDate() - dayRange); sinceDate.setHours(0,0,0,0);
  const since = Math.floor(sinceDate.getTime()/1000);

  const bugs = db.prepare(`
    SELECT id, title, state, severity, assigned_to, customer_tag, created_at, updated_at, meta
    FROM ado_workitems
    WHERE type = 'Bug' AND created_at > ?
    ORDER BY created_at DESC
    LIMIT 200
  `).all(since);

  if (!bugs.length) return `🐛 *工單狀態*\n  *(近${dayRange}天無工單)*`;

  const today = Date.now();
  const groups = {};
  bugs.forEach(b => { groups[b.state] = (groups[b.state]||0)+1; });

  const openStates = ['New','Active','Code Review','Pending'];
  const openBugs = bugs.filter(b => openStates.includes(b.state));
  const closedToday = bugs.filter(b => b.state === 'Closed' && (today/1000 - b.updated_at) <= 86400);

  const lines = [];

  if (format === 'ceo') {
    const summary = STATE_ORDER.filter(s=>groups[s])
      .map(s=>`${STATE_ICON[s]} ${s} ${groups[s]}`).join(' | ');
    lines.push(`🐛 *工單狀態（近${dayRange}天，共${bugs.length}筆）*`);
    lines.push(summary);
    const p1 = openBugs.filter(b => { try { return JSON.parse(b.meta)?.priority == 1; } catch(e){return false;} });
    if (p1.length) {
      lines.push(`⚠️ *P1 未關閉（${p1.length}筆）：*`);
      p1.slice(0,3).forEach(b => {
        const c = extractCustomer(b.customer_tag, b.title);
        lines.push(`  • ${adoLink(b.id)} [${c}] ${b.title.substring(0,50)}`);
      });
    }
    if (closedToday.length) lines.push(`✅ 今日關閉 ${closedToday.length} 筆`);

  } else if (format === 'cto') {
    lines.push(`🐛 *Bug 工單（近${dayRange}天）共 ${bugs.length} 筆*`);
    const summary = STATE_ORDER.filter(s=>groups[s])
      .map(s=>`${STATE_ICON[s]} ${s} ${groups[s]}`).join(' | ');
    lines.push(`  ${summary}`);

    // 未關閉依工程師分組
    const byAssignee = {};
    openBugs.forEach(b => {
      const a = b.assigned_to || '未指派';
      if (!byAssignee[a]) byAssignee[a] = [];
      byAssignee[a].push(b);
    });
    lines.push(`\n  *未關閉（${openBugs.length}筆）依工程師：*`);
    Object.entries(byAssignee).sort((a,b)=>b[1].length-a[1].length).forEach(([name,items]) => {
      const slaBreached = items.filter(b => (today/1000 - b.created_at) > 8*3600).length;
      const slaTag = slaBreached > 0 ? ` ⏰${slaBreached}逾期` : '';
      const topIds = items.slice(0,3).map(b=>adoLink(b.id)).join(' ');
      lines.push(`  • ${name}: ${items.length} 筆${slaTag}  ${topIds}`);
    });
    if (closedToday.length) lines.push(`\n  ✅ 今日關閉 ${closedToday.length} 筆`);
  }

  return lines.join('\n');
}

module.exports = { generate };
