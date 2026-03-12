# lifecom-reporting

## 描述
LifeCOM 智慧營運系統 — 所有自動化報表的完整設定、腳本對應、收件人與 cron 排程。

## Notion 架構圖
https://www.notion.so/LifeCOM-v1-0-318d2a91c732817c9f34ee27a65dfeb6

---

## 報表清單（完整版）

### 📊 日報類

| 報表名稱 | 腳本 | 時間 | Slack 對象 | Email 對象 |
|---------|------|------|-----------|-----------|
| **早安簡報** | agent 直發 | 07:00 | Eric DM (D0ABWLGLGHY) | 無 |
| **CEO 日報** | `generate_ceo_report.js` | 07:30,19:30 | Eric DM (D0ABWLGLGHY) | eric@lifecom.com.tw |
| **CTO 日報** | `generate_cto_report.js` | 08:00,20:00 | Eric+Willy DM | eric+willy Email |
| **CSM 日報** | `generate_cs_report.js` | 08:30,20:30 | Eric DM | kennedy+alex+lilien+eric Email |
| **COO 日報** | `generate_coo_report.js` | 08:45 | OP主管 DM (D0757D51W9E) + Eric DM | 無 |
| **IT 日報** | `generate_it_report.js` | 07:00,19:00 | IT頻道 (C02E37Q1CUD) | 無 |

### ⚙️ 系統監控類

| 報表名稱 | 腳本 | 時間 | 對象 |
|---------|------|------|------|
| **每小時系統快報** | `generate_hourly_report.js` | 整點 08-20時 | #general (C02ECE2CLDS) |
| **上板部署 Email 通知** | cron (systemEvent) | 每 15 分鐘 | eric/kennedy/alex/lilien (Email) |

---

## 報表視角差異

| 報表 | 視角 | 關鍵內容 |
|------|------|---------|
| CEO | 策略/財務 | 客戶新簽、MRR、需決策事項、重大風險 |
| CTO | 技術摘要（給主管）| 系統健康、RD負載、架構風險 |
| IT  | 工單細節（給團隊）| 工單明細、殭屍率、告警 |
| CSM | 客戶/SLA（給客成OP）| 客戶燈號、出貨異常、SLA狀態 |
| 系統快報 | 即時監控 | 近期告警、GCP狀態、上板記錄 |

---

## 每小時快報設計

- **資料來源**：`C03TBQ5891V`（production-alert）、GCP頻道、上板頻道
- **時間窗口**：08:00 → 12小時（抓昨晚20:00起）；其他 → 70分鐘
- **告警判斷**：`m.bot_id && getMsgText(m).length > 5`（支援 text + attachments 格式）
- **未處理標記**：超過 2 小時無 reaction → `⚠️ 可能未處理，請工程師確認並加 ✅ 或 👍`
- **今日累計**：從當天 00:00 起計算 production-alert 共幾筆

---

## 腳本共用模組

位置：`workspace/scripts/`
- `utils.js` — Slack/Email 工具函數
- `ado_bug_section.js` — ADO Bug 工單摘要
- `ado_feature_section.js` — ADO Feature 進度
- `ado_epic_section.js` — ADO Epic 狀態
- `finance_section.js` — 財務數字
- `notion_client.js` — Notion API（token: `~/.config/notion/api_key`）
- `slack_send.js` — 純 Slack 發送 helper

---

---

## D-00 Delivery Control Layer（2026-03-09）

所有報表投遞走統一治理：
- **投遞清冊**：`data/delivery_registry.json`（誰收什麼，唯一來源）
- **投遞帳本**：`lifecom.db → delivery_log`（UNIQUE 防重複）
- **Phase A（當前）**：cron 發送後呼叫 `delivery_log_hook.js` 記錄
- **SLA 監控**：`check_delivery_sla.js`，每 4h 掃斷報，超時通知 Eric

新增報表不需建 cron — 只要加 registry entry + generate 腳本 + cron 呼叫 hook。

---

## 操作天條

1. **Shell 引號問題**：PowerShell 中文訊息有問題 → 必須存 .js 暫存檔執行
2. **Email 發送**：用 `gog gmail send --body-file` 而非 `--body`（避免 shell 跳脫）
3. **Cron 設計**：
   - 日報（長腳本）→ `sessionTarget: isolated` + `agentTurn`
   - 系統監控（短任務）→ `sessionTarget: main` + `systemEvent`
   - timeout 設 180s 以上，避免多工單 ADO 查詢超時
4. **發送確認**：腳本輸出 `ok: true` 才算成功

---

## Notion 模組狀態（2026-03-04）

| 模組 | 狀態 |
|------|------|
| finance_section.js | ✅ 完成 |
| ado_bug/feature/epic | ✅ 完成 |
| notion_client.js | ✅ 完成 |
| ar_section.js | ❌ 待建（Phase 1）|
| sales_section.js | ❌ 待建（Phase 1）|
| customer_health.js | ❌ 待建（Phase 1）|
| monthly_strategy_report | ❌ 待建（Phase 3）|
