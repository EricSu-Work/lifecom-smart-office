'use strict';
/**
 * generate_it_report.js — IT 日報 v2（lifecom.db）
 * 架構：增量同步 ADO → 從 lifecom.db 讀取 → 組裝報表
 */
const { execSync } = require('child_process');
const path = require('path');
const { slackPostAll, getTodayInfo, saveReport } = require('./utils');
const { buildInsightPlaceholder } = require('./management_advisor');
const adoBug     = require('./ado_bug_section_db');
const adoFeature = require('./ado_feature_section_db');
const adoEpic    = require('./ado_epic_section_db');
const storeDev   = require('./store_dev_report_db');

const SLACK_CHANNELS = ['C02E37Q1CUD']; // #IT技術團隊頻道（頻道不發 Email）

async function main() {
  const { dateStr, dow, todayISO } = getTodayInfo();
  console.log('v2: 增量同步 ADO...');
  try {
    execSync('node ' + path.join(__dirname, 'sync_ado.js'), { stdio: 'pipe', timeout: 60000 });
    console.log('v2: ADO sync done');
  } catch(e) { console.warn('ADO sync warn:', e.message.slice(0, 100)); }

  console.log('v2: 從 lifecom.db 讀取...');
  const bugSection     = adoBug.generate({ format: 'cto', dayRange: 14 });
  const featureSection = adoFeature.generate({ format: 'cto' });
  const epicSection    = adoEpic.generate({ format: 'cto' });
  const storeResult    = storeDev.run();
  const storeLines     = storeResult.lines.join('\n');

  const reportBody = [featureSection, '', epicSection, '', storeLines, '', bugSection].join('\n');
  const insight = buildInsightPlaceholder('it', reportBody);

  const report = [
    `🖥️ *LifeCOM IT 日報 — ${dateStr}（週${dow}）*`,
    '各位工程師早安，以下是今日工單與系統狀態，請確認自己負責的項目。',
    '═'.repeat(42),
    '',
    insight,
    '',
    '═'.repeat(42),
    '',
    featureSection,
    '',
    epicSection,
    '',
    storeLines,
    '',
    bugSection,
    '',
    '═'.repeat(42),
    `_資料來源：lifecom.db | 有問題請在對應 thread 回覆_`,
  ].join('\n');

  console.log(report);
  saveReport(report, `it-report-${todayISO}.txt`);
  console.log('IT report saved. Agent will send after inserting insight.');
}

main().catch(console.error);
