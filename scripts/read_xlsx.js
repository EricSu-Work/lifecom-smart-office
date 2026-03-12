// read_xlsx.js - Download and parse an Excel file from Google Drive via gog CLI
// Usage: node read_xlsx.js <fileId> [sheetName]
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const FILE_ID = process.argv[2] || '11tigABtPo74leRc6jEHk8aycDrQPkgWJ';
const SHEET_NAME = process.argv[3] || null;
const MAX_ROWS = parseInt(process.argv[4] || '50');
const GOG_ACCOUNT = process.env.GOG_ACCOUNT || 'eric@lifecom.com.tw';

const outPath = path.join(process.env.TEMP || '/tmp', `drive_${FILE_ID}.xlsx`);

// Download via gog CLI
try {
  execSync(`gog drive download ${FILE_ID} --out "${outPath}"`, {
    env: { ...process.env, GOG_ACCOUNT },
    stdio: 'pipe'
  });
} catch(e) {
  // If file exists from previous run, continue
  if (!fs.existsSync(outPath)) {
    console.error('Download failed: ' + e.message);
    process.exit(1);
  }
}

const wb = xlsx.readFile(outPath);
const sheets = wb.SheetNames;

if (!SHEET_NAME) {
  console.log(JSON.stringify({ sheets }, null, 2));
  process.exit(0);
}

const ws = wb.Sheets[SHEET_NAME];
if (!ws) {
  console.error(`Sheet "${SHEET_NAME}" not found. Available: ${sheets.join(', ')}`);
  process.exit(1);
}

const data = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });
console.log(JSON.stringify({ sheet: SHEET_NAME, rows: data.slice(0, MAX_ROWS) }, null, 2));
