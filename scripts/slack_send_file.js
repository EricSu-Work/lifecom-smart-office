#!/usr/bin/env node
/**
 * slack_send_file.js — 從檔案讀取報告內容，發到多個 Slack 頻道/DM
 * Usage: node slack_send_file.js <file_path> <channel1> [channel2] ...
 */
const fs = require('fs');
const https = require('https');
const path = require('path');

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: node slack_send_file.js <file_path> <channel1> [channel2] ...');
  process.exit(1);
}

const filePath = args[0];
const channels = args.slice(1);

const text = fs.readFileSync(filePath, 'utf8');
const tokenPath = path.join(process.env.HOME || process.env.USERPROFILE, '.config', 'slack', 'user_token');
const token = fs.readFileSync(tokenPath, 'utf8').trim();

async function sendToChannel(channel) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ channel, text, mrkdwn: true });
    const req = https.request({
      hostname: 'slack.com',
      path: '/api/chat.postMessage',
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const r = JSON.parse(d);
          if (r.ok) {
            console.log(`✅ Sent to ${channel} ts=${r.ts}`);
            resolve();
          } else {
            console.error(`❌ Failed ${channel}: ${r.error}`);
            reject(new Error(r.error));
          }
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

(async () => {
  for (const ch of channels) {
    await sendToChannel(ch);
    await new Promise(r => setTimeout(r, 500)); // 避免 rate limit
  }
  console.log('All sent.');
})().catch(e => { console.error(e); process.exit(1); });
