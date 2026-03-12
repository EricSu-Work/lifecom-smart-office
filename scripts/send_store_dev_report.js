/**
 * send_store_dev_report.js — 發送開發中 Store 進度報告
 * 資料來源：store_dev_report.js（Feature 專案進度）
 * 發送目標：Eric DM + Willy DM（Slack）+ Email
 */
const fs   = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const storeDev = require('./store_dev_report');

const WS         = path.join(process.env.USERPROFILE, '.openclaw/workspace');
const USER_TOKEN = fs.readFileSync(path.join(process.env.USERPROFILE, '.config/slack/user_token'), 'utf8').trim();

const SLACK_RECIPIENTS = ['D0ABWLGLGHY', 'D08LG6196RX']; // Eric + Willy
const EMAIL_TO = ['eric@lifecom.com.tw', 'willy@licodes.net'];

function slackPost(channel, text) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ channel, text });
    const req = https.request({
      hostname: 'slack.com', path: '/api/chat.postMessage', method: 'POST',
      headers: { Authorization: `Bearer ${USER_TOKEN}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
    }); req.on('error', reject); req.write(body); req.end();
  });
}

async function main() {
  const today   = new Date();
  const dateStr = today.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const dow     = ['日','一','二','三','四','五','六'][today.getDay()];

  console.log('Generating Store Dev Report...');
  const { lines, rows } = await storeDev.run();

  const redCount    = rows.filter(r => r.light === '🔴').length;
  const yellowCount = rows.filter(r => r.light === '🟡').length;
  const greenCount  = rows.filter(r => r.light === '🟢').length;
  const blackCount  = rows.filter(r => r.light === '⚫').length;

  const header = [
    `📊 *開發中 Store 進度報告* ｜ ${dateStr}（${dow}）`,
    `共 ${rows.length} 個專案 | 🔴 ${redCount} 🟡 ${yellowCount} 🟢 ${greenCount} ⚫ ${blackCount}`,
    '─'.repeat(42),
    '',
  ];
  const footer = [
    '',
    '─'.repeat(42),
    '_資料來源：Azure DevOps | LifeCOM Engineering_',
  ];

  const reportText = [...header, ...lines, ...footer].join('\n');
  console.log(reportText);

  const todayISO  = today.toISOString().split('T')[0];
  const dataDir   = path.join(WS, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const reportPath = path.join(dataDir, `store-dev-report-${todayISO}.txt`);
  fs.writeFileSync(reportPath, reportText, 'utf8');
  console.log(`Saved: ${reportPath}`);

  // Slack
  for (const channel of SLACK_RECIPIENTS) {
    const r = await slackPost(channel, reportText);
    console.log(r.ok ? `✅ Slack 已發送到 ${channel}` : `❌ Slack 失敗 ${channel}: ${r.error}`);
  }

  // Email
  const subject = `[LifeCOM] Store 開發進度報告 ${dateStr}`;
  const toArgs  = EMAIL_TO.map(e => `--to "${e}"`).join(' ');
  try {
    execSync(`node scripts/gmail_send.js ${toArgs} --subject "${subject}" --body-file "${reportPath}" --account eric@lifecom.com.tw`, { cwd: WS });
    console.log('✅ Email sent to:', EMAIL_TO.join(', '));
  } catch(e) {
    console.error('❌ Email failed:', e.message.substring(0, 100));
  }

  return { rows, redCount };
}

main().catch(console.error);
