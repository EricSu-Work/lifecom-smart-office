/**
 * lfk_invoice_fetch.js ??瘥????撖熒 115 ?潛巨???瑼? * 
 * 1. ??refresh_token ??access_token
 * 2. ?? Drive API 銝? xlsx (fileId: 11tigABtPo74leRc6jEHk8aycDrQPkgWJ)
 * 3. ??xlsx 閫????極雿”
 * 4. ?脣? JSON ??data/lfk-invoice-YYYY-MM-DD.json
 * 5. ??銝憭拇?撠?頛詨 diff ??
 * 6. ?交??啣?/霈?潛巨嚗??Slack ?蝯?Eric
 */
const https  = require('https');
const fs     = require('fs');
const path   = require('path');
const XLSX   = require('xlsx');

const WS         = path.join(process.env.USERPROFILE, '.openclaw/workspace');
const GOG_CRED   = path.join(process.env.USERPROFILE, '.config/gog/eric@lifecom.com.tw.json');
const FILE_ID    = '11tigABtPo74leRc6jEHk8aycDrQPkgWJ';
const DATA_DIR   = path.join(WS, 'data');
const SLACK_DM   = 'D0ABWLGLGHY'; // Eric
const USER_TOKEN = fs.readFileSync(path.join(process.env.USERPROFILE, '.config/slack/user_token'), 'utf8').trim();

// ?? OAuth ????????????????????????????????????????????????????????????????????
function getAccessToken() {
  return new Promise((resolve, reject) => {
    const cred = JSON.parse(fs.readFileSync(GOG_CRED, 'utf8'));
    const body = new URLSearchParams({
      client_id:     cred.client_id,
      client_secret: cred.client_secret,
      refresh_token: cred.refresh_token,
      grant_type:    'refresh_token',
    }).toString();

    const req = https.request({
      hostname: 'oauth2.googleapis.com', path: '/token', method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        const j = JSON.parse(d);
        if (j.access_token) resolve(j.access_token);
        else reject(new Error(`OAuth failed: ${JSON.stringify(j)}`));
      });
    });
    req.on('error', reject); req.write(body); req.end();
  });
}

// ?? Drive 銝? ???????????????????????????????????????????????????????????????
function downloadFile(accessToken, fileId) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'www.googleapis.com',
      path: `/drive/v3/files/${fileId}?alt=media`,
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` }
    };
    const req = https.request(opts, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        // Follow redirect
        const loc = res.headers.location;
        const u = new URL(loc);
        const req2 = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: 'GET',
          headers: { Authorization: `Bearer ${accessToken}` }
        }, (res2) => {
          const chunks = [];
          res2.on('data', c => chunks.push(c));
          res2.on('end', () => resolve(Buffer.concat(chunks)));
        });
        req2.on('error', reject); req2.end();
        return;
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (res.statusCode !== 200) reject(new Error(`HTTP ${res.statusCode}: ${buf.slice(0,200)}`));
        else resolve(buf);
      });
    });
    req.on('error', reject); req.end();
  });
}

// ?? Slack ? ???????????????????????????????????????????????????????????????
function slackPost(text) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ channel: SLACK_DM, text });
    const req = https.request({
      hostname: 'slack.com', path: '/api/chat.postMessage', method: 'POST',
      headers: { Authorization: `Bearer ${USER_TOKEN}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve(JSON.parse(d))); });
    req.on('error', reject); req.write(body); req.end();
  });
}

// ?? 銝餅?蝔????????????????????????????????????????????????????????????????????
async function main() {
  const today    = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const yday     = new Date(today - 86400000).toISOString().split('T')[0];

  console.log(`[lfk_invoice_fetch] 銝?蝡?摨瑞蟡券瑼?${todayStr}...`);

  const token = await getAccessToken();
  const buf   = await downloadFile(token, FILE_ID);
  console.log(`  銝?摰?嚗?{buf.length} bytes`);

  // 閫?? xlsx
  const wb = XLSX.read(buf, { type: 'buffer' });
  const result = {};
  wb.SheetNames.forEach(name => {
    const ws = wb.Sheets[name];
    result[name] = XLSX.utils.sheet_to_json(ws, { defval: '' });
  });

  // ?脣?
  const todayPath = path.join(DATA_DIR, `lfk-invoice-${todayStr}.json`);
  fs.writeFileSync(todayPath, JSON.stringify(result, null, 2), 'utf8');
  console.log(`  ?脣?嚗?{todayPath}`);

  // ??交?撠?  const ydayPath = path.join(DATA_DIR, `lfk-invoice-${yday}.json`);
  let diffMsg = '';
  if (fs.existsSync(ydayPath)) {
    const prev = JSON.parse(fs.readFileSync(ydayPath, 'utf8'));
    const lines = [];
    for (const sheet of wb.SheetNames) {
      const curLen  = (result[sheet] || []).length;
      const prevLen = (prev[sheet]   || []).length;
      const diff    = curLen - prevLen;
      if (diff !== 0) lines.push(`  ??${sheet}嚗?{diff > 0 ? `+${diff}` : diff} 蝑???${curLen} 蝑?`);
    }
    diffMsg = lines.length ? `\n*?啣???嚗?\n${lines.join('\n')}` : '\n嚗??冽?詨?嚗霈?嚗?;
  } else {
    diffMsg = `\n嚗?甈∩?頛??∪??亙?瘥?`;
  }

  // 敶?極雿”蝑
  const sheetSummary = wb.SheetNames.map(n => `  ??${n}嚗?{(result[n]||[]).length} 蝑).join('\n');

  const msg = [
    `?? *蝡?摨?115 ?潛巨???瑼???${todayStr}*`,
    `撌乩?銵剁?\n${sheetSummary}`,
    diffMsg,
  ].join('\n');

  console.log(msg);

  // ?芸?????Slack
  if (!diffMsg.includes('?∟???) && !diffMsg.includes('?∪???)) {
    await slackPost(msg);
    console.log('  ??撌脩??Slack ?');
  } else {
    console.log('  ?對? ?∠??銝?');
  }
}

main().catch(e => { console.error('[lfk_invoice_fetch] 憭望?嚗?, e.message); process.exit(1); });
