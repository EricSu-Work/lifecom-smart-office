/**
 * finance_section.js — 財務區塊模組
 * 對外介面：generate({ format: 'ceo' | 'brief' })
 *
 * 資料源：
 *   2026 發票：Drive fileId 11tigABtPo74leRc6jEHk8aycDrQPkgWJ
 *   2025 發票：Drive fileId 1uKuiXD_PpWg2S2PB9sIAY6qN442V6A9S
 *
 * 邏輯：
 *   - 用 gog drive download 下載 xlsx（先用快取）
 *   - 解析當月 / 前月 / 去年同月 / Q1 累計
 *   - 排除一次性項目（建置費、專案客製...）得「經常性收入」
 */
const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const GOG_ACCOUNT = 'eric@lifecom.com.tw';
const CACHE_DIR   = path.join(process.env.USERPROFILE, '.openclaw/workspace/data');
const TEMP        = process.env.TEMP || 'C:\\Windows\\Temp';

const FILES = {
  '2026': { id: '11tigABtPo74leRc6jEHk8aycDrQPkgWJ', out: path.join(CACHE_DIR, 'invoice_2026.xlsx') },
  '2025': { id: '1uKuiXD_PpWg2S2PB9sIAY6qN442V6A9S', out: path.join(CACHE_DIR, 'invoice_2025.xlsx') },
};

const ONE_TIME_KEYWORDS = ['建置費', '系統建置', '專案客製', '客製功能開發', '客製贈品'];
const MONTH_ZH = ['一','二','三','四','五','六','七','八','九','十','十一','十二'];

// ── 下載（超過 4h 的快取視為過期）────────────────────────────────────────────
function download(yr) {
  const { id, out } = FILES[yr];
  const staleMs = 4 * 60 * 60 * 1000;
  if (fs.existsSync(out)) {
    const age = Date.now() - fs.statSync(out).mtimeMs;
    if (age < staleMs) return true; // 使用快取
  }
  try {
    execSync(
      `gog drive download ${id} --out "${out}" --account ${GOG_ACCOUNT} --no-input`,
      { stdio: 'pipe', timeout: 30000 }
    );
    return fs.existsSync(out);
  } catch (e) {
    return fs.existsSync(out); // 失敗時用舊快取
  }
}

// ── 找工作表 ─────────────────────────────────────────────────────────────────
function findSheet(wb, year, month) {
  const m = parseInt(month);
  const pad = String(m).padStart(2, '0');
  for (const n of [
    `${year}年${m}月`, `${year}年${pad}月`,
    `${year}年${m}月(關帳)`, `${year}年${pad}月(關帳)`,
    `${year}年${m}月 (關帳)`,
  ]) {
    if (wb.Sheets[n]) return n;
  }
  return null;
}

// ── 解析工作表 ───────────────────────────────────────────────────────────────
function parseSheet(wb, name) {
  const ws = wb.Sheets[name];
  if (!ws) return null;
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });
  let total = 0, adj = 0;
  const byCat = {};
  rows.forEach(r => {
    const cat  = String(r[4] || '');
    const desc = String(r[5] || '');
    const amt  = r[6];
    if (typeof amt !== 'number' || amt <= 0) return;
    total += amt;
    if (!ONE_TIME_KEYWORDS.some(kw => desc.includes(kw) || cat.includes(kw))) {
      adj += amt;
      const key = cat.replace(/技術服務收入-資訊-/, '').replace(/技術服務收入-/, '').replace(/運輸收入-/, '') || '其他';
      byCat[key] = (byCat[key] || 0) + amt;
    }
  });
  return { total: Math.round(total), adj: Math.round(adj), byCat };
}

// ── 格式化 ────────────────────────────────────────────────────────────────────
const fmt = n => 'NT$' + Math.round(n).toLocaleString();
const pct = (a, b) => {
  if (!b) return 'N/A';
  const v = ((a - b) / b * 100).toFixed(1);
  return (parseFloat(v) >= 0 ? '▲ +' : '▼ ') + v + '%';
};

// ── 主函式 ───────────────────────────────────────────────────────────────────
async function generate({ format = 'ceo' } = {}) {
  // 嘗試下載
  const ok26 = download('2026');
  const ok25 = download('2025');

  if (!ok26 && !ok25) return '💰 *財務*\n  *(無法取得發票資料)*';

  const wb26 = ok26 ? xlsx.readFile(FILES['2026'].out) : null;
  const wb25 = ok25 ? xlsx.readFile(FILES['2025'].out) : null;

  const now       = new Date();
  const curYear   = now.getFullYear();
  const curMonth  = now.getMonth() + 1;
  const prevMonth = curMonth === 1 ? 12 : curMonth - 1;
  const prevYear  = curMonth === 1 ? curYear - 1 : curYear;

  const curSheet  = wb26 ? findSheet(wb26, curYear, curMonth) : null;
  const prevSheet = prevMonth <= 12 && wb26 ? findSheet(curMonth === 1 ? wb25 : wb26, prevYear, prevMonth) : null;
  const lySheet   = wb25 ? findSheet(wb25, curYear - 1, curMonth) : null;

  const cur  = curSheet  ? parseSheet(wb26, curSheet)  : null;
  const prev = prevSheet ? parseSheet(curMonth === 1 ? wb25 : wb26, prevSheet) : null;
  const ly   = lySheet   ? parseSheet(wb25, lySheet) : null;

  // Q1 累計
  let q1cur = 0, q1ly = 0;
  for (const m of [1, 2, 3]) {
    if (m > curMonth) break;
    if (wb26) { const s = findSheet(wb26, curYear, m); if (s) { const d = parseSheet(wb26, s); if (d) q1cur += d.adj; } }
    if (wb25) { const s = findSheet(wb25, curYear - 1, m); if (s) { const d = parseSheet(wb25, s); if (d) q1ly += d.adj; } }
  }

  if (format === 'brief') {
    const parts = [];
    if (cur) parts.push(`本月經常性：${fmt(cur.adj)}`);
    if (cur && prev) parts.push(`MoM ${pct(cur.adj, prev.adj)}`);
    if (cur && ly)   parts.push(`YoY ${pct(cur.adj, ly.adj)}`);
    return `💰 *財務* — ${parts.join(' | ') || '*(無資料)*'}`;
  }

  // CEO 完整格式
  const mn = MONTH_ZH[curMonth - 1];
  const lines = [`💰 *財務概況 — ${curYear}年${mn}月*`];

  if (cur) {
    lines.push(`  本月已確認（經常性）：${fmt(cur.adj)}`);
    if (cur.total !== cur.adj) lines.push(`  含一次性：${fmt(cur.total)}`);
  } else {
    lines.push(`  *(本月工作表尚未建立)*`);
  }

  if (cur && prev) {
    lines.push(`  MoM：${fmt(prev.adj)} → ${fmt(cur.adj)}（${pct(cur.adj, prev.adj)}）`);
  }
  if (cur && ly) {
    lines.push(`  YoY：2025年${mn}月 ${fmt(ly.adj)} → ${pct(cur.adj, ly.adj)}`);
  }
  if (q1cur) {
    const q1line = `  Q1 累計（adj）：${fmt(q1cur)}`;
    lines.push(q1ly ? `${q1line}  vs 2025 Q1 ${fmt(q1ly)}（${pct(q1cur, q1ly)}）` : q1line);
  }

  // 收入來源 Top5
  if (cur && Object.keys(cur.byCat).length) {
    lines.push(`  *收入結構（前5項）：*`);
    Object.entries(cur.byCat)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([k, v]) => {
        const p = ((v / cur.adj) * 100).toFixed(1);
        lines.push(`    • ${k}：${fmt(v)}（${p}%）`);
      });
  }

  return lines.join('\n');
}

module.exports = { generate };
