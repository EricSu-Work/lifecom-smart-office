// finance_report.js - Generate CEO financial section from invoice Excel files
// Usage: node finance_report.js
// Output: formatted text block for CEO daily report

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const GOG_ACCOUNT = 'eric@lifecom.com.tw';
const TEMP = process.env.TEMP || '/tmp';

const FILES = {
  '2026': { id: '11tigABtPo74leRc6jEHk8aycDrQPkgWJ', out: path.join(TEMP, 'invoice_2026.xlsx') },
  '2025': { id: '1uKuiXD_PpWg2S2PB9sIAY6qN442V6A9S', out: path.join(TEMP, 'invoice_2025.xlsx') },
};

// One-time / non-recurring keywords to exclude from adjusted totals
const ONE_TIME_KEYWORDS = ['建置費', '系統建置', '專案客製', '客製功能開發', '客製贈品'];

function download(fileId, outPath) {
  try {
    execSync(`gog drive download ${fileId} --out "${outPath}"`, {
      env: { ...process.env, GOG_ACCOUNT }, stdio: 'pipe'
    });
    return true;
  } catch(e) {
    if (fs.existsSync(outPath)) return true; // use cached
    return false;
  }
}

function parseSheet(wb, sheetName) {
  const ws = wb.Sheets[sheetName];
  if (!ws) return null;
  const data = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });
  let total = 0, totalAdj = 0;
  const byCategory = {};

  data.forEach(r => {
    const cat = String(r[4] || '');
    const desc = String(r[5] || '');
    const amt = r[6];
    if (typeof amt !== 'number' || amt <= 0) return;
    total += amt;
    const isOneTime = ONE_TIME_KEYWORDS.some(kw => desc.includes(kw) || cat.includes(kw));
    if (!isOneTime) {
      totalAdj += amt;
      // Normalize category
      const catKey = cat.replace(/技術服務收入-資訊-/, '').replace(/技術服務收入-/, '').replace(/運輸收入-/, '') || '其他';
      byCategory[catKey] = (byCategory[catKey] || 0) + amt;
    }
  });
  return { total: Math.round(total), totalAdj: Math.round(totalAdj), byCategory };
}

function findSheet(wb, year, month) {
  const padded = String(month).padStart(2, '0');
  const m = parseInt(month);
  // Try various naming patterns
  const patterns = [
    `${year}年${m}月`,
    `${year}年${padded}月`,
    `${year}年${m}月(關帳)`,
    `${year}年${padded}月(關帳)`,
    `${year}年${m}月 (關帳)`,
  ];
  for (const p of patterns) {
    if (wb.Sheets[p]) return p;
  }
  return null;
}

async function main() {
  // Download files
  for (const [yr, info] of Object.entries(FILES)) {
    if (!download(info.id, info.out)) {
      console.error(`Failed to download ${yr} file`);
      process.exit(1);
    }
  }

  const wb2026 = xlsx.readFile(FILES['2026'].out);
  const wb2025 = xlsx.readFile(FILES['2025'].out);

  const now = new Date();
  const curMonth = now.getMonth() + 1; // 1-12
  const curYear = now.getFullYear();

  // Get current and previous month data
  const prevMonth = curMonth === 1 ? 12 : curMonth - 1;
  const prevYear = curMonth === 1 ? curYear - 1 : curYear;

  const cur26Sheet = findSheet(wb2026, curYear, curMonth);
  const prev26Sheet = findSheet(curMonth === 1 ? wb2025 : wb2026, prevYear, prevMonth);
  const cur25Sheet = findSheet(wb2025, curYear - 1, curMonth);

  const cur26 = cur26Sheet ? parseSheet(wb2026, cur26Sheet) : null;
  const prev26 = prev26Sheet ? parseSheet(curMonth === 1 ? wb2025 : wb2026, prev26Sheet) : null;
  const cur25 = cur25Sheet ? parseSheet(wb2025, cur25Sheet) : null;

  // Q1 data
  const q1Months = [1, 2, 3].filter(m => {
    if (curYear === 2026) return m <= curMonth;
    return true;
  });
  let q1_26_total = 0, q1_25_total = 0;
  for (const m of [1, 2, 3]) {
    const s26 = findSheet(wb2026, 2026, m);
    const s25 = findSheet(wb2025, 2025, m);
    if (s26) { const d = parseSheet(wb2026, s26); if (d) q1_26_total += d.totalAdj; }
    if (s25) { const d = parseSheet(wb2025, s25); if (d) q1_25_total += d.totalAdj; }
  }

  // Format
  const fmt = n => 'NT$' + Math.round(n).toLocaleString();
  const pct = (a, b) => {
    if (!b) return 'N/A';
    const v = ((a - b) / b * 100).toFixed(1);
    return (v > 0 ? '▲ +' : '▼ ') + v + '%';
  };
  const monthName = ['一','二','三','四','五','六','七','八','九','十','十一','十二'];

  let out = `💰 財務概況 | ${curYear}年${monthName[curMonth-1]}月（截至${now.getMonth()+1}/${now.getDate()}，變動項目待月底計算）\n\n`;

  if (cur26) {
    out += `【本月已確認收入】\n`;
    out += `  固定項目合計：${fmt(cur26.totalAdj)}\n`;
    if (cur26.total !== cur26.totalAdj) {
      out += `  含一次性項目：${fmt(cur26.total)}\n`;
    }
    out += `\n`;
  }

  if (cur26 && prev26) {
    const mom = pct(cur26.totalAdj, prev26.totalAdj);
    out += `【MoM 月增率】\n`;
    out += `  ${monthName[prevMonth-1]}月：${fmt(prev26.totalAdj)} → ${monthName[curMonth-1]}月：${fmt(cur26.totalAdj)}\n`;
    out += `  變動：${mom}\n\n`;
  }

  if (cur26 && cur25) {
    const yoy = pct(cur26.totalAdj, cur25.totalAdj);
    out += `【YoY 年增率（經常性收入）】\n`;
    out += `  2025年${monthName[curMonth-1]}月：${fmt(cur25.totalAdj)}\n`;
    out += `  2026年${monthName[curMonth-1]}月：${fmt(cur26.totalAdj)}（預估）\n`;
    out += `  變動：${yoy}\n\n`;
  }

  if (q1_26_total && q1_25_total) {
    const yoyQ1 = pct(q1_26_total, q1_25_total);
    out += `【Q1 累計 YoY（adj，排除一次性）】\n`;
    out += `  2025 Q1：${fmt(q1_25_total)}\n`;
    out += `  2026 Q1：${fmt(q1_26_total)}（${curMonth < 3 ? '3月待完整' : ''}）\n`;
    out += `  變動：${yoyQ1}\n\n`;
  }

  if (cur26 && Object.keys(cur26.byCategory).length > 0) {
    out += `【主要收入來源（本月，經常性）】\n`;
    const sorted = Object.entries(cur26.byCategory).sort((a,b)=>b[1]-a[1]).slice(0,5);
    const catTotal = sorted.reduce((s,[,v])=>s+v,0);
    sorted.forEach(([k,v]) => {
      const pctStr = ((v/cur26.totalAdj)*100).toFixed(1);
      out += `  ${k}：${fmt(v)}（${pctStr}%）\n`;
    });
  }

  console.log(out);
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
