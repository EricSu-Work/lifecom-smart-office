/**
 * generate_cto_report_v2.js — CTO 技術報表（重構版，從 lifecom.db 讀取）
 */
const { execSync } = require('child_process');
const path = require('path');
const { slackPostAll, sendEmail, getTodayInfo, saveReport } = require('./utils');
const adoBug     = require('./ado_bug_section_db');
const adoFeature = require('./ado_feature_section_db');
const adoEpic    = require('./ado_epic_section_db');

const SLACK_CHANNELS = ['D08LG6196RX'];
const EMAIL_TO       = ['willy@licodes.net'];

async function main() {
  const { dateStr, dow, todayISO } = getTodayInfo();
  console.log('v2: Syncing ADO...');

  // 增量同步 ADO（Bug + Feature + Epic + User Story）
  try {
    execSync('node ' + path.join(__dirname, 'sync_ado.js'), { stdio: 'pipe', timeout: 60000 });
    console.log('v2: ADO sync done');
  } catch(e) {
    console.warn('ADO sync warn:', e.message.slice(0,100));
  }

  console.log('v2: Reading from lifecom.db...');

  const bugSection     = adoBug.generate({ format: 'cto', dayRange: 14 });
  const featureSection = adoFeature.generate({ format: 'cto' });
  const epicSection    = adoEpic.generate({ format: 'cto' });

  const report = [
    `🔧 *LifeCOM 技術日報 — ${dateStr}（週${dow}）*`,
    '以下是今日技術團隊工作狀態摘要，請確認各項工單進度。',
    '═'.repeat(42),
    '',
    featureSection,
    '',
    epicSection,
    '',
    bugSection,
    '',
    '═'.repeat(42),
    `_如需進一步說明，請聯繫技術主管 | LifeCOM Engineering_`,
  ].join('\n');

  console.log('\n--- REPORT ---');
  console.log(report);
  console.log('--------------');

  const outPath = saveReport(report, `cto-report-v2-${todayISO}.txt`);
  console.log('\n✅ v2 CTO report generated (comparison mode, not sent)');
}

main().catch(console.error);
