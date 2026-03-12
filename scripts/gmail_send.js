/**
 * gmail_send.js ???湔??OAuth2 refresh_token ??Gmail嚗?靘陷 gog
 * Usage:
 *   node gmail_send.js --to a@b.com --subject "Title" --body-file ./msg.txt [--account eric.cafe@gmail.com]
 *   node gmail_send.js --to a@b.com --subject "Title" --body-file ./msg.txt [--cc x@y.com] [--bcc z@w.com]
 *
 * Token files (JSON with refresh_token + client_id + client_secret):
 *   ~/.config/gog/eric.cafe@gmail.com.json
 *   ~/.config/gog/eric@lifecom.com.tw.json
 *
 * Falls back to gogcli credentials.json for client_id/client_secret.
 */

'use strict';
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const https = require('https');

// ?? Parse args ??????????????????????????????????????????????????????????????
const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : null;
}
const to        = flag('--to');
const subject   = flag('--subject');
const bodyFile  = flag('--body-file');
const cc        = flag('--cc');
const bcc       = flag('--bcc');
const account   = flag('--account') || 'eric@lifecom.com.tw';

if (!to || !subject || !bodyFile) {
  console.error('Usage: node gmail_send.js --to <email> --subject <subj> --body-file <path> [--account <email>] [--cc <email>] [--bcc <email>]');
  process.exit(1);
}

const body = fs.readFileSync(bodyFile === '-' ? '/dev/stdin' : bodyFile, 'utf8');

// ?? Load credentials ?????????????????????????????????????????????????????????
const credPath = path.join(os.homedir(), 'AppData', 'Roaming', 'gogcli', 'credentials.json');
const creds    = JSON.parse(fs.readFileSync(credPath, 'utf8'));

// Token store: ~/.config/gog/<account>.json  (auto-updated after refresh)
const tokenDir  = path.join(os.homedir(), '.config', 'gog');
const tokenFile = path.join(tokenDir, account + '.json');

function loadToken() {
  if (fs.existsSync(tokenFile)) {
    return JSON.parse(fs.readFileSync(tokenFile, 'utf8'));
  }
  // First time: export from gog keyring backup
  const gogExport = path.join(os.homedir(), '.openclaw', 'workspace', 'data', 'gmail-token-backup.json');
  if (fs.existsSync(gogExport)) {
    const t = JSON.parse(fs.readFileSync(gogExport, 'utf8'));
    if (t.email === account) {
      saveToken({ refresh_token: t.refresh_token });
      return { refresh_token: t.refresh_token };
    }
  }
  throw new Error(`No token found for ${account}. Run: gog auth add ${account} --services gmail,calendar,sheets`);
}

function saveToken(t) {
  if (!fs.existsSync(tokenDir)) fs.mkdirSync(tokenDir, { recursive: true });
  const existing = fs.existsSync(tokenFile) ? JSON.parse(fs.readFileSync(tokenFile, 'utf8')) : {};
  fs.writeFileSync(tokenFile, JSON.stringify({ ...existing, ...t }, null, 2));
}

// ?? HTTP helpers ??????????????????????????????????????????????????????????????
function post(hostname, path, headers, bodyStr) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path, method: 'POST', headers }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

// ?? Refresh access token ??????????????????????????????????????????????????????
async function refreshAccessToken(refreshToken) {
  const params = new URLSearchParams({
    client_id:     creds.client_id,
    client_secret: creds.client_secret,
    refresh_token: refreshToken,
    grant_type:    'refresh_token'
  }).toString();

  const res = await post('oauth2.googleapis.com', '/token', {
    'Content-Type':   'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(params)
  }, params);

  const data = JSON.parse(res.body);
  if (!data.access_token) {
    throw new Error(`Token refresh failed: ${res.body}`);
  }
  // Google may return a new refresh_token
  if (data.refresh_token) saveToken({ refresh_token: data.refresh_token, access_token: data.access_token });
  else saveToken({ access_token: data.access_token });
  return data.access_token;
}

// ?? Build RFC-2822 email, base64url-encoded ???????????????????????????????????
function buildRawEmail() {
  const headers = [
    `To: ${to}`,
    cc  ? `Cc: ${cc}`  : '',
    bcc ? `Bcc: ${bcc}` : '',
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(body).toString('base64')
  ].filter(Boolean).join('\r\n');

  return Buffer.from(headers).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ?? Send via Gmail API ????????????????????????????????????????????????????????
async function sendEmail(accessToken) {
  const raw      = buildRawEmail();
  const payload  = JSON.stringify({ raw });
  const res = await post('gmail.googleapis.com',
    `/gmail/v1/users/me/messages/send?alt=json`,
    {
      'Authorization':  `Bearer ${accessToken}`,
      'Content-Type':   'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }, payload);

  const data = JSON.parse(res.body);
  if (data.error) throw new Error(JSON.stringify(data.error));
  return data;
}

// ?? Main ??????????????????????????????????????????????????????????????????????
(async () => {
  try {
    const token       = loadToken();
    const accessToken = await refreshAccessToken(token.refresh_token);
    const result      = await sendEmail(accessToken);
    console.log(`sent message_id=${result.id}`);
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
})();
