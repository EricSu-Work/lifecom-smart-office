#!/usr/bin/env node
// Usage: node slack_send.js <channel_id> <message_text>
// Sends a Slack message using Eric's user token (appears as Eric)

const fs = require('fs');
const https = require('https');
const os = require('os');

const channel = process.argv[2];
const text = process.argv.slice(3).join(' ');

if (!channel || !text) {
  console.error('Usage: node slack_send.js <channel_id> <message>');
  process.exit(1);
}

const tokenPath = os.homedir() + '/.config/slack/user_token';
const token = fs.readFileSync(tokenPath, 'utf8').trim();

const body = JSON.stringify({ channel, text, mrkdwn: true });

const options = {
  hostname: 'slack.com',
  path: '/api/chat.postMessage',
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  }
};

const req = https.request(options, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const result = JSON.parse(data);
    if (result.ok) {
      console.log('OK ts=' + result.ts);
    } else {
      console.error('FAIL:', result.error);
      process.exit(1);
    }
  });
});
req.on('error', e => { console.error(e); process.exit(1); });
req.write(body);
req.end();
