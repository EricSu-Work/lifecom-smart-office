# LifeCOM Smart Office — AI 智慧營運計畫

> AI Agent 驅動的 CEO / CTO / CSM 智慧作業系統

---

## 專案定位

以 AI Agent 作為 CEO 智慧作業系統，整合所有營運資料，實現「資料驅動決策」的 SaaS 公司管理。

**四層架構**

```
感知層（L1）→ 智能層（L2）→ 行動層（L3）→ 治理層（L4）
Slack/ADO/Notion/LINE    異常偵測/健康燈號    報表/通知/告警    SLA稽核/防重複
```

---

## 模組總覽

### 📊 每日報表（自動發送）

| 報表 | 時間 | 收件對象 | 腳本 |
|------|------|---------|------|
| CEO 日報 | 08:00 | CEO + 主管 | `generate_ceo_report.js` |
| CTO 日報 | 08:15 | CTO + CEO | `generate_cto_report.js` |
| CSM 客成日報 | 08:30 | CSM 全員 | `generate_cs_report.js` |
| C-04 通訊事件報告 | 19:00 | CEO | `generate_c04_report.js` |

### 🔄 資料同步（每小時）

| 腳本 | 資料源 | 說明 |
|------|--------|------|
| `sync_ado.js` | Azure DevOps | 工單/Feature/Bug/PR |
| `sync_notion.js` | Notion Company | 客戶/報價/AR/財務 |
| `sync_finance.js` | Google Drive xlsx | LFK 發票/MRR |
| `sync_line.js` | LINE 群組 | 客成通訊碎片 |
| `sync_slack.js` | Slack 15 頻道 | 系統告警/部署/討論 |
| `sync_quote_from_sheet.js` | Google Sheets | 報價單追蹤 |
| `sync_bitbucket.js`（via `bitbucket_client.js`）| Bitbucket | PR/Commit |

### 🧠 C-04 通訊事件智慧層

**碎片 → 事件 → 主題 → 洞察**，四層萃取。

```
LINE/Slack 訊息碎片
    ↓ extract_events_rules.js（規則式，每 30 分鐘）
events 表（issue / commitment / request / decision / info）
    ↓ resolve_events.js（自動結案）
    ↓ op_event_notify.js（OP 通知）
    ↓ generate_c04_report.js（CEO 洞察報告）
```

### 🚨 即時監控

| 腳本 | 觸發 | 說明 |
|------|------|------|
| `check_deploy.js` | 每 15 分鐘 | 部署通知 → Email + Slack DM |
| `check_delivery_sla.js` | 每 4 小時 | 斷報偵測 |
| `check_pr_health.js` | 每日 09:00 | PR 健康度 |
| `check_change_risk.js` | 每日 09:30 | 高風險變更偵測 |
| `check_node_memory.ps1` | 每 30 分鐘 | Node.exe 記憶體巡檢 |
| `ado_sla_monitor.js` | 每小時 | SLA 逾期告警 |

### 💰 財務 & 業務

| 腳本 | 說明 |
|------|------|
| `finance_section.js` | LFK 發票 / MRR 分析 |
| `ar_section.js` | 應收帳款逾期追蹤 |
| `sales_section.js` | 報價單管道分析 |
| `customer_health.js` | 客戶健康評分 0-100 |

### 📬 D-00 Delivery Control Layer

治理層，防止報表斷報無人知道。

- `delivery_registry.json` — 9 份報表收件清冊
- `delivery_engine.js` — 統一發送入口（dedup + Slack/Email + log）
- `check_delivery_sla.js` — 斷報偵測

---

## 技術棧

- **Runtime**: Node.js v22+
- **DB**: SQLite (better-sqlite3) — `lifecom.db`
- **外部服務**: Azure DevOps / Notion API / Slack API / LINE Messaging API / Google Workspace / Bitbucket Cloud
- **部署**: OpenClaw Gateway + Cron Jobs

---

## 目錄結構

```
lifecom-smart-office/
├── scripts/          # 所有生產腳本
│   ├── lifecom_db.js       # DB 核心（Schema + CRUD）
│   ├── people.js           # 人員/客戶知識庫
│   ├── utils.js            # 共用工具
│   ├── sync_*.js           # 資料同步
│   ├── generate_*.js       # 報表生成
│   ├── check_*.js          # 監控/健康檢查
│   ├── *_section.js        # 報表區塊模組
│   └── ...
├── docs/             # 設計文件
│   ├── lifecom-ops-blueprint.md   # 主計畫書 v2.0
│   └── ...
├── skills/           # Agent Skills（角色 + 能力定義）
│   ├── lifecom-role-*/     # 職務角色 Skills
│   ├── lifecom-lifeerp/    # LifeERPv2 知識庫
│   ├── lifecom-tms/        # TMS 知識庫
│   └── capabilities/       # 技術能力 Skills
└── package.json
```

---

## 設定需求

以下設定檔需自行建立（不 commit 到 git）：

```
~/.config/slack/token          # Slack Bot Token
~/.config/slack/user_token     # Slack User Token（for file upload）
~/.config/notion/api_key       # Notion Personal API Key
~/.config/notion/company_api_key  # Notion Company API Key
~/.config/ado/token            # Azure DevOps PAT
~/.config/bitbucket/username   # Bitbucket username
~/.config/bitbucket/token      # Bitbucket App Password
~/.config/line/channel_secret  # LINE Channel Secret
~/.config/line/access_token    # LINE Access Token
```

---

## Phase 狀態

| Phase | 名稱 | 狀態 |
|-------|------|------|
| Phase 1 | 感知自動化（資料同步 + 每日報表）| ✅ 完成 |
| Phase 2 | 判斷智能化（C-04 事件層 + 客戶健康）| 🔄 進行中 |
| Phase 3 | 行動自主化 | ⬜ 規劃中 |
| Phase 4 | 學習進化 | ⬜ 規劃中 |

---

*Built by LifeCOM Engineering × AI Agent*  
*Blueprint: `docs/lifecom-ops-blueprint.md`*
