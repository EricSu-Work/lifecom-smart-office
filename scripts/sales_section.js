'use strict';
/**
 * sales_section.js — S-01 銷售管道分析
 *
 * 資料源：Notion「報價追蹤」DB（31bd8a6f-afc6-81ea-81bc-d9c972abbbb5）
 *   欄位：客戶, 項目, 單號, 金額, 日期, 狀態, 備註, 網址
 *
 * 狀態分組：
 *   🔴 需跟進：尚未報價、已報價
 *   🟡 待請款：已回簽、功能已完成
 *   🟢 完成：完成請款
 *   ⚫ 作廢：作廢
 *
 * 依循 LifeCOM AI 運營架構 (docs/lifecom-ops-blueprint.md) S-01
 */

const { queryDB } = require('./notion_client');

const STATUS_GROUP = {
  '尚未報價':   'follow',
  '已報價':     'follow',
  '已回簽':     'pending',
  '功能已完成': 'pending',
  '完成請款':   'done',
  '作廢':       'skip',
};

function fmt(n) {
  if (!n) return 'NT$0';
  return 'NT$' + Number(n).toLocaleString();
}

function daysSince(dateStr) {
  if (!dateStr) return 0;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

async function generate({ format = 'ceo' } = {}) {
  let rows = [];
  try {
    rows = await queryDB('報價追蹤');
  } catch(e) {
    return { text: '📋 *報價追蹤*\n  ⚠️ 資料讀取失敗：' + e.message, items: [], summary: {} };
  }

  const items = rows.map(r => ({
    客戶:   r['客戶']  || '未知',
    項目:   r['項目']  || '',
    單號:   r['單號']  || '',
    金額:   r['金額']  || 0,
    日期:   r['日期']  || null,
    狀態:   r['狀態']  || '尚未報價',
    備註:   r['備註']  || '',
    網址:   r['網址']  || '',
    group:  STATUS_GROUP[r['狀態']] || 'follow',
    days:   daysSince(r['日期']),
  }));

  const follow  = items.filter(i => i.group === 'follow');
  const pending = items.filter(i => i.group === 'pending');
  const done    = items.filter(i => i.group === 'done');

  const followTotal  = follow.reduce((s, i) => s + i.金額, 0);
  const pendingTotal = pending.reduce((s, i) => s + i.金額, 0);
  const overdue      = follow.filter(i => i.days > 30).sort((a, b) => b.days - a.days);

  const summary = {
    follow_count:  follow.length,
    follow_total:  followTotal,
    pending_count: pending.length,
    pending_total: pendingTotal,
    done_count:    done.length,
    overdue_count: overdue.length,
    items,
  };

  // ── CSM 格式：不顯示金額，只看需跟進客戶 ──────────────────────────────────
  if (format === 'csm') {
    const lines = ['📋 *報價追蹤*'];
    if (!follow.length && !pending.length) {
      lines.push('  ✅ 目前無待跟進報價');
      return { text: lines.join('\n'), summary, items };
    }
    if (follow.length) {
      lines.push(`  🔴 需跟進（${follow.length} 筆）：`);
      const sorted = [...follow].sort((a, b) => b.days - a.days);
      sorted.slice(0, 10).forEach(i => {
        const dayTag = i.days > 30 ? ` ⚠️${i.days}天` : (i.days > 0 ? ` ${i.days}天` : '');
        lines.push(`    • ${i.客戶}｜${i.項目.substring(0, 30)}${dayTag}`);
      });
      if (follow.length > 10) lines.push(`    …等共 ${follow.length} 筆`);
    }
    if (pending.length) {
      lines.push('');
      lines.push(`  🟡 已回簽待請款（${pending.length} 筆）：`);
      pending.slice(0, 5).forEach(i => {
        lines.push(`    • ${i.客戶}｜${i.項目.substring(0, 30)}`);
      });
      if (pending.length > 5) lines.push(`    …等共 ${pending.length} 筆`);
    }
    return { text: lines.join('\n'), summary, items };
  }

  // ── CEO 格式：含金額 ────────────────────────────────────────────────────────
  const lines = ['📊 *銷售管道*'];
  lines.push(
    `  🔴 需跟進 ${follow.length} 筆 ${fmt(followTotal)}` +
    (overdue.length ? ` ⚠️ 其中 ${overdue.length} 筆逾30天` : '') +
    `  🟡 待請款 ${pending.length} 筆 ${fmt(pendingTotal)}`
  );
  lines.push(`  🟢 本季完成 ${done.length} 筆 ${fmt(done.reduce((s,i)=>s+i.金額,0))}`);

  if (overdue.length) {
    lines.push('');
    lines.push('  🔴 *逾期未回（>30天）：*');
    overdue.slice(0, format === 'brief' ? 3 : 8).forEach(i => {
      lines.push(`    • ${i.客戶}｜${i.項目.substring(0, 25)}｜${fmt(i.金額)}｜${i.days}天（${i.狀態}）`);
    });
    if (overdue.length > 8 && format !== 'brief') lines.push(`    …等共 ${overdue.length} 筆`);
  }

  if (pending.length && format === 'ceo') {
    lines.push('');
    lines.push('  🟡 *已回簽待請款：*');
    pending.slice(0, 5).forEach(i => {
      lines.push(`    • ${i.客戶}｜${i.項目.substring(0, 25)}｜${fmt(i.金額)}`);
    });
    if (pending.length > 5) lines.push(`    …等共 ${pending.length} 筆`);
  }

  return { text: lines.join('\n'), summary, items };
}

module.exports = { generate };

if (require.main === module) {
  const fmt = process.argv[2] || 'ceo';
  generate({ format: fmt }).then(r => {
    console.log(r.text);
    console.log(`\n需跟進: ${r.summary.follow_count}筆 | 待請款: ${r.summary.pending_count}筆 | 完成: ${r.summary.done_count}筆`);
  }).catch(console.error);
}
