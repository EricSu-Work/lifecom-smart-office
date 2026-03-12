const https = require('https');
const fs = require('fs');
const token = fs.readFileSync(require('os').homedir() + '/.config/notion/api_key', 'utf8').trim();

const PAGE_ID = '319d2a91-c732-81a2-8d8b-f8651cf1f1aa';
const path = '/v1/blocks/' + PAGE_ID + '/children';
console.log('PATH:', path);

const body = JSON.stringify({ children: [{ object:'block', type:'paragraph', paragraph:{ rich_text:[{type:'text',text:{content:'test'}}] } }] });

const req = https.request({
  hostname: 'api.notion.com',
  path: path,
  method: 'PATCH',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body, 'utf8')
  }
}, res => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => console.log(d));
});
req.on('error', e => console.error(e));
req.write(body);
req.end();
