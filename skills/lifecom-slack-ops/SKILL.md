# lifecom-slack-ops

## 描述
LifeCOM Slack 操作基礎技能：token 位置、發送模式、讀取頻道、避免 shell 引號問題。

## Token 位置
- **User Token（xoxp）**：`~/.config/slack/user_token`（以 Eric 名義發送）
- **Bot Token**：openclaw.json（以 Bot 名義發送，用 message tool）

## 發送 Slack 訊息（Node.js 腳本）
```js
const fs = require('fs');
const https = require('https');
const token = fs.readFileSync(require('os').homedir() + '/.config/slack/user_token', 'utf8').trim();

function slackPost(channel, text) {
  return new Promise((res, rej) => {
    const body = JSON.stringify({ channel, text });
    const req = https.request({
      hostname: 'slack.com',
      path: '/api/chat.postMessage',
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: 'Bearer ' + token }
    }, r => { let d=''; r.on('data', c=>d+=c); r.on('end', ()=>res(JSON.parse(d))); });
    req.on('error', rej); req.write(body); req.end();
  });
}
```

⚠️ **Shell 引號問題**：PowerShell 發送中文 Slack 訊息有引號問題，務必把文字存入暫存 .js 檔執行，不要用 `-e` inline 字串。

## 讀取頻道訊息
```js
slackGet(`/api/conversations.history?channel=${CHANNEL}&limit=20&oldest=${since}`)
```
- 訊息格式：部分用 `m.text`，部分（LifeERPv2 告警）用 `m.attachments[].fallback`
- 過濾 Bot 訊息：`m.bot_id && getMsgText(m).length > 5`

## 重要頻道 ID
| 頻道名稱 | ID |
|---------|-----|
| #lifeerpv2-production-alert | C03TBQ5891V |
| #general（LifeCOM） | C02ECE2CLDS |
| #上板部署 | C03FSJ3PQKD |
| #工單 Bug（ADO bot）| C02EPMHFSD7 |
| IT 技術團隊 | C02E37Q1CUD |
| CSM+OP 頻道 | C02ED8VT0P6 |

## 重要 DM ID
| 人員 | Slack DM ID |
|------|------------|
| Eric | D0ABWLGLGHY |
| Willy (CTO) | D08LG6196RX |
| OP主管 Lilien | D0757D51W9E |

## utils.js 提供的工具函數
位置：`workspace/scripts/utils.js`
- `slackPost(channel, text)` — 發送單一頻道
- `slackPostAll(channels[], text)` — 批次發送
- `slackGet(apiPath)` — 讀取 API（GET）
- `getSlackToken()` — 取得 token
- `sendEmail(to[], subject, body)` — 發送 Email
- `getTodayInfo()` — 取得日期字串
- `saveReport(text, filename)` — 儲存報表到 data/
