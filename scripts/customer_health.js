/**
 * customer_health.js — 客戶健康燈號（從 lifecom.db 讀取）
 * 
 * 燈號邏輯：
 *   🔴 紅燈：有 P0/P1 Bug 未關閉 OR 殭屍率 > 60%
 *   🟡 黃燈：有 P2 Bug 未關閉 OR 殭屍率 > 30% OR Epic 30天無更新
 *   🟢 綠燈：無未關閉 Bug OR 殭屍率 <= 30%
 *   ⚫ 無資料：無工單
 *
 * 殭屍率 = 開放工單中超過 7 天無更新的比例
 */
const { db } = require('./lifecom_db');

const SKIP_AREAS = new Set(['lifecom','rd','op','public','general','lifecomtw','erpv2']);

// 內部標籤 → 顯示名稱對應
const DISPLAY_NAME = {
  'test':      '🔬 Research',
  'lifeerpv2': '🏠 內部優化',
  'lifeerpv': '🏠 內部優化',
};

function extractCustomer(areaPath) {
  if (!areaPath) return null;
  const parts = areaPath.split('\\').filter(p => p);
  return parts.reverse().find(p => !SKIP_AREAS.has(p.toLowerCase())) || null;
}

function generate({ dayRange = 30, format = 'ceo' } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const since = now - dayRange * 86400;
  const staleThreshold = now - 7 * 86400; // 7天無更新 = 殭屍

  // 取開放中 Bug
  const bugs = db.prepare(`
    SELECT id, title, state, assigned_to, customer_tag, created_at, updated_at, meta
    FROM ado_workitems
    WHERE type = 'Bug'
      AND state IN ('New','Active','Code Review','Pending')
      AND created_at > ?
  `).all(since);

  // 依客戶分組
  const byCustomer = {};
  bugs.forEach(b => {
    const rawCustomer = extractCustomer(b.customer_tag)
      || (b.title.match(/^\[([^\]]+)\]/) || [])[1]
      || '通用';
    const customer = DISPLAY_NAME[rawCustomer.toLowerCase()] || rawCustomer;

    if (!byCustomer[customer]) byCustomer[customer] = { bugs: [], name: customer };
    byCustomer[customer].bugs.push(b);
  });

  // 計算每個客戶的健康指標
  const results = Object.values(byCustomer).map(({ name, bugs }) => {
    const total = bugs.length;
    const stale = bugs.filter(b => b.updated_at < staleThreshold).length;
    const zombieRate = total > 0 ? Math.round(stale / total * 100) : 0;

    let maxPriority = 99;
    bugs.forEach(b => {
      try { const p = JSON.parse(b.meta)?.priority ?? 3; if (p >= 1 && p < maxPriority) maxPriority = p; } catch(e) {}
    });
    if (maxPriority === 99) maxPriority = 3; // 無優先度資料，視為 P2

    let light;
    if (maxPriority <= 2 || zombieRate > 60)      light = '🔴';
    else if (maxPriority === 3 || zombieRate > 30) light = '🟡';
    else                                           light = '🟢';

    return { name, total, stale, zombieRate, maxPriority, light };
  });

  // 排序：🔴 → 🟡 → 🟢
  const order = { '🔴':0, '🟡':1, '🟢':2, '⚫':3 };
  results.sort((a,b) => (order[a.light]??9) - (order[b.light]??9) || b.total - a.total);

  if (!results.length) {
    return { text: `🏥 *客戶健康燈號*\n  ✅ 近${dayRange}天無開放工單`, rows: [] };
  }

  const red    = results.filter(r => r.light === '🔴');
  const yellow = results.filter(r => r.light === '🟡');
  const green  = results.filter(r => r.light === '🟢');

  const lines = [`🏥 *客戶健康燈號（近${dayRange}天）*`];
  lines.push(`🔴 ${red.length} 客戶  🟡 ${yellow.length} 客戶  🟢 ${green.length} 客戶`);
  lines.push('');

  if (red.length) {
    lines.push('🔴 *需立即關注：*');
    red.forEach(r => {
      const reason = r.maxPriority <= 2 ? `P${r.maxPriority-1}未關閉` : `殭屍率${r.zombieRate}%`;
      lines.push(`  • ${r.name}：${r.total}筆工單（${reason}，${r.stale}筆逾期）`);
    });
    lines.push('');
  }

  if (yellow.length) {
    lines.push('🟡 *需持續追蹤：*');
    yellow.slice(0, format === 'brief' ? 5 : 999).forEach(r => {
      lines.push(`  • ${r.name}：${r.total}筆（殭屍率${r.zombieRate}%）`);
    });
    if (format === 'brief' && yellow.length > 5) lines.push(`  …等共 ${yellow.length} 客戶`);
    lines.push('');
  }

  if (format === 'ceo' && green.length) {
    const greenNames = green.slice(0, 8).map(r => r.name).join('、');
    lines.push(`🟢 *正常（${green.length}客戶）：* ${greenNames}${green.length > 8 ? '…' : ''}`);
  }

  return { text: lines.join('\n'), rows: results };
}

module.exports = { generate };

if (require.main === module) {
  const fmt = process.argv[2] || 'ceo';
  const { text, rows } = generate({ format: fmt });
  console.log(text);
  console.log(`\n共 ${rows.length} 客戶`);
}
