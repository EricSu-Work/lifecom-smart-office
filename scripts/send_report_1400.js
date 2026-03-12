const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const msg = `💬 _「喝杯咖啡，系統不等人，但你們比系統更可靠。」_

🔔 *LifeERPv2 每小時系統快報 2026-03-02 14:00*

*━━━━ 1️⃣ 系統異常摘要（過去 1 小時）━━━━*

🔴 *持續異常*（CRITICAL/ERROR）
• *airbu2.licodes.net* — TOWMS 出貨拋轉失敗 \`not_mapping_ORDTY\` | 訂單 O2601250326271004657, O260203032643295061 | 🔄 持續中（07:40 起）
• *vacanza.licodes.net* — TOWMS 出貨拋轉失敗 \`SQLSTATE[IMSSP]\` SQL 字元轉換錯誤 | 訂單 O260215032433305575 | 🔄 持續中（昨 06:00 起）
• *11.licodes.net* — DB Lock wait timeout \`markets_products\` | 10:57–12:21 多次觸發
• *jumeng.licodes.net* — ShopeeV2 \`empty sender_real_name\` | 11:23, 11:53

🟡 *輕量警告*（WARNING — 過去 1 小時）
• *lab52.licodes.net* — WMS 訂單狀態更新失敗 59/59 筆 | 13:05, 13:45
• *relove.licodes.net* — WMS 訂單狀態更新失敗 5/317 筆 | 13:52
• *nikegolf.licodes.net* — WMS 訂單狀態更新失敗 1/2 筆 | 13:45

🟠 *GCP 監控*
• 無告警

🟣 *上板部署*
• 無上板（最近上板：2/25 v3.11.27–3.11.31）

⚪ *噪音*
• Lorealv2 CRITICAL × 5（昨 23:02，舊訂單 400 重試，已知問題）
• sabon Webhook 最終重試失敗 × 1（12:45）
• cleanclean MomoStorePlusClient \`sizeof null\` × 1（12:41）

*━━━━ 2️⃣ 工單處理進度 ━━━━*

🔴 *逾期未結*（State: New，無 ✅）
• <https://dev.azure.com/LifeComTW/web/wi.aspx?pcguid=5f8ea9d5-b8d5-4f81-8c77-6188ea09dde6&id=44341|#44341> \`P1-High\` [SFL] WRHM 0/228間 → howard.keo | Feb-W4 *⚠️ 逾期 6 天*
• <https://dev.azure.com/LifeComTW/web/wi.aspx?pcguid=5f8ea9d5-b8d5-4f81-8c77-6188ea09dde6&id=44383|#44383> \`P3\` [Vacanza] TOWMS 持續拋轉失敗 → howard.keo | Mar-W1 有 ✅ 回應中

🟡 *今日新增*
• <https://dev.azure.com/LifeComTW/web/wi.aspx?pcguid=5f8ea9d5-b8d5-4f81-8c77-6188ea09dde6&id=44413|#44413> \`P3-Medium\` [景華] 每日宅配匯入檔異常 → howard.keo | Mar-W1
• <https://dev.azure.com/LifeComTW/web/wi.aspx?pcguid=5f8ea9d5-b8d5-4f81-8c77-6188ea09dde6&id=44408|#44408> \`P2-High\` [SFL] 易網通截單異常 → howard.keo | Mar-W1

📊 *負載概況*
• howard.keo：7 張（含 2 張逾期）
• john.liu：9 張
• luck：3 張`;

// Write to temp file and send
const tmpFile = path.join(process.env.TEMP || '/tmp', 'slack_report_1400.txt');
fs.writeFileSync(tmpFile, msg, 'utf8');

const scriptPath = 'C:\\Users\\Eric\\.openclaw\\workspace\\scripts\\slack_send.js';
const channel = 'C02ECE2CLDS';

// Read the message and pass it
const sendScript = `
const fs = require('fs');
const msg = fs.readFileSync(${JSON.stringify(tmpFile)}, 'utf8');
process.argv[2] = ${JSON.stringify(channel)};
process.argv[3] = msg;
`;

const tmpSend = path.join(process.env.TEMP || '/tmp', 'do_send_1400.js');
fs.writeFileSync(tmpSend, `
const fs = require('fs');
const https = require('https');
const tokenFile = require('path').join(process.env.HOME || process.env.USERPROFILE, '.config', 'slack', 'user_token');
const token = fs.readFileSync(tokenFile, 'utf8').trim();
const channel = ${JSON.stringify(channel)};
const text = fs.readFileSync(${JSON.stringify(tmpFile)}, 'utf8');
const body = JSON.stringify({ channel, text });
const req = https.request({ hostname: 'slack.com', path: '/api/chat.postMessage', method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) } }, res => {
  let d = ''; res.on('data', c => d += c); res.on('end', () => { const r = JSON.parse(d); console.log(r.ok ? 'OK' : 'FAIL: ' + r.error); });
});
req.write(body); req.end();
`, 'utf8');

console.log('Ready to send');
