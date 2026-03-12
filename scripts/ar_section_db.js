/**
 * ar_section_db.js — 應收帳款分析（從 lifecom.db notion_records 讀取）
 * 對應 ar_section.js（原本打 Notion API）
 */
const { db } = require('./lifecom_db');

function formatAmount(n) {
  if (!n) return 'NT$0';
  return 'NT$' + Number(n).toLocaleString();
}

function extractText(prop) {
  if (!prop) return '';
  if (prop.type === 'rich_text') return (prop.rich_text || []).map(t => t.plain_text).join('');
  if (prop.type === 'title')     return (prop.title || []).map(t => t.plain_text).join('');
  if (prop.type === 'select')    return prop.select?.name || '';
  if (prop.type === 'number')    return prop.number ?? 0;
  return '';
}

function generate(options = {}) {
  const format = options.format || 'ceo';

  const rows = db.prepare(`
    SELECT data FROM notion_records
    WHERE json_extract(data, '$._db_name') = '尚未到款項'
    ORDER BY fetched_at DESC
  `).all();

  if (!rows.length) {
    return { text: '💰 *應收帳款*\n  *(無資料)*', items: [], summary: { total: 0, total_amount: 0 } };
  }

  const items = rows.map(r => {
    const d = JSON.parse(r.data);
    return {
      name:   extractText(d['客戶'])    || d._title || '未知',
      amount: extractText(d['費用'])    || 0,
      status: extractText(d['付款狀態']) || '',
      note:   extractText(d['備註'])    || '',
    };
  });

  const total_amount = items.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const summary = { total: items.length, total_amount };

  const lines = [''];
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
  const r = generate({ format: process.argv[2] || 'ceo' });
  console.log(r.text);
  console.log('\nSUMMARY:', JSON.stringify(r.summary));
}
