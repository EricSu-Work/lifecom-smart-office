const fs = require('fs');
const https = require('https');
const os = require('os');

const token = fs.readFileSync(os.homedir() + '/.config/slack/user_token', 'utf8').trim();

const text = `🔔 *LifeERPv2 每小時系統快報 2026-03-02 09:55*

*━━━━ 1️⃣ 系統異常摘要（最新動態）━━━━*

🔴 *持續/新增異常*
- \`airbu2\` TOWMS 拋轉失敗（not_mapping_ORDTY）× 3次 — 07:40/08:00/08:40，訂單 O2601250326271004657、O260203032643295061（*持續未修*）
- \`vacanza\` TOWMS 拋轉失敗（SQLSTATE IMSSP）× 3次 — 06:00/07:00/08:00，訂單 O260215032433305575（*持續未修*）
- \`relove\` TOWMS 拋轉失敗（empty_products）× 1次 — 09:40，訂單 O260228030647335635（*新增*）
- \`airbu2\` DB 事務錯誤（There is no active transaction）× 1次 — 09:46
- \`Lorealv2\` CRITICAL API 400 × 5次 — 昨 23:02-23:06，舊訂單持續重試

🟡 *輕量警告*
- \`airbu2\` 採購單轉入 1/107 筆失敗（08:32，WARNING）

⚪ *噪音通知*
- sfl × 6 報表無資料、adastriab2b × 2 報表無資料、sllight × 2 報表無資料、npcorp × 1 報表無資料
- levis AbstractReport::outputBySysReports null（14:10）
- emersgroup Arr::isAssoc null（15:15）

*━━━━ 2️⃣ 工單處理進度━━━━*

🔴 *逾期未結（需今日跟進）*
- #44341 [SFL] WRHM 228間 → howard.keo，P1-High，Feb-W4，逾期 *~4天*，無 ✅
- #44293 [Sabon] 沖銷 POS 異常 → john.liu，P2-Medium，Feb-W4，僅 👀 無回應

🟡 *今日新增*
- #44392 [Loreal] 抓取 Lancome 櫃點清單 → luck，P2-Medium，Mar-W1（已 ✅）
- #44383 [Vacanza] TOWMS 拋轉 → howard.keo，P3-Medium，Mar-W1（已 ✅）

✅ *本週已結案（有 ✅）*
- #44392 luck ✅ | #44383 howard.keo ✅ | #44371 john.liu ✅ | #44369 john.liu ✅ | #44361 howard.keo ✅ | #44315 howard.keo ✅ | #44306 Willy ✅ | #44303 john.liu ✅ | #44297 john.liu ✅ | #44295 john.liu ✅ | #44291 luck ✅ | #44289 john.liu ✅ | #44287 john.liu ✅ | #44280 john.liu ✅ | #44276 howard.keo ✅ | #44268 howard.keo ✅ | #44261 howard.keo ✅ | #44258 howard.keo ✅

📊 *負載概況* — howard.keo: 21 🔴 | john.liu: 21 🔴 | Willy: 2 🟢 | luck: 2 🟢`;

const body = JSON.stringify({ channel: 'C02ECE2CLDS', text, mrkdwn: true });
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
  res.on('data', c => data += c);
  res.on('end', () => {
    const r = JSON.parse(data);
    if (r.ok) console.log('OK ts=' + r.ts);
    else { console.error('FAIL:', r.error); process.exit(1); }
  });
});
req.on('error', e => { console.error(e); process.exit(1); });
req.write(body);
req.end();
