/**
 * sync_finance.js — 同步 Google Drive 財務 xlsx 到 lifecom.db
 *
 * xlsx 結構（header:1 陣列模式）：
 *   col[0] = 備注/寄送時間
 *   col[1] = 電子發票收件 email
 *   col[2] = 公司名稱
 *   col[3] = 統編
 *   col[4] = 科目
 *   col[5] = 品項描述
 *   col[6] = 金額（數字才算有效行）
 *
 * 只處理工作表名稱符合 "YYYY年M月" 的 sheet
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { db, finance, cursor } = require('./lifecom_db');

const GOG_ACCOUNT = 'eric@lifecom.com.tw';
const DATA_DIR = path.join(__dirname, '../data');

const SOURCES = [
  { fileId: '11tigABtPo74leRc6jEHk8aycDrQPkgWJ', name: 'lfk_2026', year: 2026 },
  { fileId: '1uKuiXD_PpWg2S2PB9sIAY6qN442V6A9S', name: 'lfk_2025', year: 2025 },
];

const ONE_TIME_KEYWORDS = ['建置費', '系統建置', '專案客製', '客製功能開發', '客製贈品'];

function isValidSheet(name, year) {
  return new RegExp(`^${year}年\\d{1,2}月`).test(name);
}

function extractPeriod(sheetName) {
  const m = sheetName.match(/(\d{4})年(\d{1,2})月/);
  if (!m) return null;
  return m[1] + '-' + String(m[2]).padStart(2, '0');
}

function syncSource(source) {
  const cacheFile = path.join(DATA_DIR, source.name + '.xlsx');

  // 下載（用現有快取 < 4h 則跳過）
  let useCache = false;
  if (fs.existsSync(cacheFile)) {
    const age = Date.now() - fs.statSync(cacheFile).mtimeMs;
    if (age < 4 * 60 * 60 * 1000) useCache = true;
  }

  if (!useCache) {
    try {
      execSync(`gog drive download ${source.fileId} --out "${cacheFile}" --account ${GOG_ACCOUNT} --no-input`, { stdio: 'pipe', timeout: 30000 });
    } catch (e) {
      if (!fs.existsSync(cacheFile)) { console.error('    Download failed:', e.message); return 0; }
    }
  }

  if (!fs.existsSync(cacheFile)) { console.error('    File missing'); return 0; }

  const wb = XLSX.readFile(cacheFile);
  let total = 0;

  // 先清除該來源舊資料，重新寫入（避免累積重複）
  db.prepare(`DELETE FROM finance_records WHERE source = ?`).run(source.name);

  const tx = db.transaction(() => {
    for (const sheetName of wb.SheetNames) {
      if (!isValidSheet(sheetName, source.year)) continue;

      const period = extractPeriod(sheetName);
      if (!period) continue;

      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });

      rows.forEach((r, rowIdx) => {
        // 金額欄（col[6]）必須是正數
        const amt = r[6];
        if (typeof amt !== 'number' || amt <= 0) return;

        const company = String(r[2] || '').trim();
        const taxId   = String(r[3] || '').trim();
        const cat     = String(r[4] || '').trim();
        const desc    = String(r[5] || '').trim();
        const email   = String(r[1] || '').trim();
        const note    = String(r[0] || '').trim();

        // 只要金額存在就保留（不過濾空白公司/科目）

        const isOneTime = ONE_TIME_KEYWORDS.some(kw => desc.includes(kw) || cat.includes(kw));
        const id = `${source.name}_${period}_${rowIdx}`;

        finance.upsert.run({
          id,
          source: source.name,
          period,
          data: JSON.stringify({
            sheet: sheetName,
            period,
            company,
            tax_id: taxId,
            category: cat,
            description: desc,
            email,
            note,
            amount: amt,
            is_recurring: !isOneTime,
          }),
        });
        total++;
      });
    }
  });

  tx();
  cursor.set('finance_' + source.name, new Date().toISOString());
  return total;
}

async function main() {
  console.log('Syncing finance data from Google Drive...');
  for (const source of SOURCES) {
    process.stdout.write('  ' + source.name.padEnd(12) + '... ');
    const n = syncSource(source);
    console.log(n + ' valid records');
  }

  // 驗證：顯示各月份筆數
  console.log('\n驗證 — 各月份記錄數：');
  const summary = db.prepare(`
    SELECT source, period, COUNT(*) as cnt,
           SUM(CAST(json_extract(data,'$.amount') AS REAL)) as total
    FROM finance_records
    GROUP BY source, period
    ORDER BY source, period DESC
    LIMIT 20
  `).all();
  summary.forEach(r => {
    console.log(`  ${r.source}  ${r.period}  ${r.cnt}筆  NT$${Math.round(r.total).toLocaleString()}`);
  });

  console.log('\nDone.');
}

main().catch(console.error);
