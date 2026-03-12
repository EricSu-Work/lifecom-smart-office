/**
 * ar_section.js — 應收帳款分析模組
 *
 * 資料源：Notion 公司工作區「尚未到款項」DB
 *   欄位：客戶、費用、付款狀態、備註
 *
 * 輸出：generate(options) → { text, items, summary }
 *   format: 'ceo' | 'csm' | 'brief'
 */

const { queryDB } = require('./notion_client');

function formatAmount(n) {
  if (n == null || n === 0) return 'NT$0';
  return 'NT$' + Number(n).toLocaleString();
}

async function generate(options = {}) {
  const format = options.format || 'ceo';

  let rows = [];
  try {
    rows = await queryDB('尚未到款項');
  } catch (e) {
    return {
      text: '⚠️ 應收帳款資料讀取失敗：' + e.message,
      items: [], summary: { total: 0, total_amount: 0 }
    };
  }

  const items = rows.map(r => ({
    name:    r['客戶']    || '未知客戶',
    amount:  r['費用']    || 0,
    status:  r['付款狀態'] || '',
    note:    r['備註']    || '',
  }));

  const total_amount = items.reduce((s, i) => s + i.amount, 0);
  const summary = { total: items.length, total_amount };

  let lines = [''];

  if (format === 'csm') {
    // CSM 格式：只列客戶名稱 + 備註，不顯示金額
    lines.push('💰 *應收待入帳*');
    lines.push(`共 ${items.length} 筆，請確認入帳時程：`);
    lines.push('');
    items.forEach(i => {
      const notePart = i.note ? `（${i.note}）` : '';
      lines.push(`  🔴 ${i.name}${notePart}`);
    });
    return { text: lines.join('\n'), items, summary };
  }

  lines.push('💰 *應收帳款 — 尚未到款項*');
  lines.push(`共 ${items.length} 筆 | 合計 ${formatAmount(total_amount)}`);
  lines.push('');

  if (format !== 'brief') {
    items.forEach(i => {
      const tag = i.status === '尚未支付' ? '🔴' : '🟡';
      const notePart = i.note ? ` (${i.note})` : '';
      lines.push(`${tag} ${i.name} — ${formatAmount(i.amount)}${notePart}`);
    });
  }

  return { text: lines.join('\n'), items, summary };
}

module.exports = { generate };

if (require.main === module) {
  const fmt = process.argv[2] || 'ceo';
  generate({ format: fmt }).then(r => {
    console.log(r.text);
    console.log('\nSUMMARY:', JSON.stringify(r.summary));
  }).catch(console.error);
}
