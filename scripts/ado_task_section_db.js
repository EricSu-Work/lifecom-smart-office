/**
 * ado_task_section_db.js — OP Task 工單區塊（從 lifecom.db 讀取）
 *
 * Task = OP 單位日常工單（客服、設定、維護等）
 * 依客戶分組，顯示負責人 + 殭屍率
 */
const { db } = require('./lifecom_db');

const ADO_BASE = 'https://dev.azure.com/LifeComTW/LifeCOM/_workitems/edit';
function adoLink(id) { return `<${ADO_BASE}/${id}|#${id}>`; }

const STATE_ICON = { 'New':'🔴', 'Active':'🔵', 'Closed':'✅', 'Removed':'🗑️' };

function generate({ format = 'cs', dayRange = 14 } = {}) {
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - dayRange);
  sinceDate.setHours(0, 0, 0, 0);
  const since = Math.floor(sinceDate.getTime() / 1000);
  const now = Math.floor(Date.now() / 1000);
  const staleThreshold = now - 7 * 86400; // 7天無更新 = 殭屍

  const tasks = db.prepare(`
    SELECT id, title, state, assigned_to, customer_tag, created_at, updated_at, meta
    FROM ado_workitems
    WHERE type = 'Task'
      AND state NOT IN ('Removed')
      AND created_at > ?
    ORDER BY created_at DESC
  `).all(since);

  if (!tasks.length) return `📋 *OP 工單（近${dayRange}天）*\n  ✅ 無工單`;

  const open   = tasks.filter(t => t.state !== 'Closed');
  const closed = tasks.filter(t => t.state === 'Closed');
  const stale  = open.filter(t => t.updated_at < staleThreshold);

  const lines = [];

  if (format === 'cs' || format === 'ceo') {
    lines.push(`📋 *OP 工單（近${dayRange}天，共${tasks.length}筆）*`);
    lines.push(`  開放中 ${open.length} 筆 | 已關閉 ${closed.length} 筆 | 逾期未更新 ${stale.length} 筆`);

    if (!open.length) {
      lines.push('  ✅ 目前無開放工單');
      return lines.join('\n');
    }

    // 依負責人分組（OP 人員）
    const byAssignee = {};
    open.forEach(t => {
      const a = t.assigned_to || '未指派';
      if (!byAssignee[a]) byAssignee[a] = [];
      byAssignee[a].push(t);
    });

    lines.push('');
    lines.push('  *依 OP 人員：*');
    Object.entries(byAssignee)
      .sort((a, b) => b[1].length - a[1].length)
      .forEach(([name, items]) => {
        const staleCount = items.filter(t => t.updated_at < staleThreshold).length;
        const staleTag   = staleCount > 0 ? ` ⏰${staleCount}逾期` : '';
        lines.push(`  • ${name}：${items.length} 筆${staleTag}`);
      });

    // 依客戶分組（前 8）
    const byCustomer = {};
    open.forEach(t => {
      const c = t.customer_tag || '未分類';
      if (!byCustomer[c]) byCustomer[c] = 0;
      byCustomer[c]++;
    });

    const topCustomers = Object.entries(byCustomer)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    if (topCustomers.length) {
      lines.push('');
      lines.push('  *依客戶（工單數 TOP）：*');
      topCustomers.forEach(([c, cnt]) => lines.push(`  • ${c}：${cnt} 筆`));
      if (Object.keys(byCustomer).length > 8) {
        lines.push(`  • …等共 ${Object.keys(byCustomer).length} 客戶`);
      }
    }

    // 逾期未更新明細（format=ceo 才顯示）
    if (format === 'ceo' && stale.length) {
      lines.push('');
      lines.push(`  ⚠️ *逾期未更新（${stale.length}筆）：*`);
      stale.slice(0, 5).forEach(t => {
        const days = Math.floor((now - t.updated_at) / 86400);
        const title = t.title.replace(/【[^】]*】/g, '').trim().substring(0, 40);
        lines.push(`  • ${adoLink(t.id)} [${t.customer_tag}] ${title} → ${t.assigned_to || '未指派'}（${days}天未更新）`);
      });
      if (stale.length > 5) lines.push(`  • …等共 ${stale.length} 筆`);
    }

  } else if (format === 'brief') {
    const zombieRate = open.length > 0 ? Math.round(stale.length / open.length * 100) : 0;
    const light = zombieRate > 50 ? '🔴' : zombieRate > 20 ? '🟡' : '🟢';
    lines.push(`${light} OP 工單 開放${open.length}筆 殭屍率${zombieRate}%`);
  }

  return lines.join('\n');
}

module.exports = { generate };

if (require.main === module) {
  const fmt = process.argv[2] || 'cs';
  console.log(generate({ format: fmt, dayRange: parseInt(process.argv[3]) || 14 }));
}
