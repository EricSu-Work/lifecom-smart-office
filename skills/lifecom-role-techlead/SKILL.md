# lifecom-role-techlead

技術經理（TechLead）的 AI Agent 支援腳本。協助技術架構決策、產品管理、技術團隊管理，及系統穩定性監控。

---

## 職務基本資訊

| 欄位 | 內容 |
|------|------|
| 職稱 | 技術經理 TechLead |
| 層級 | 管理層 |
| 直屬主管 | CEO |
| 直管下屬 | 後端工程師、前端工程師、IT工程師、DevOps工程師 |

---

## 核心職責

| 職責 | 比重 |
|------|------|
| 技術架構設計與決策 | 30% |
| 產品路線圖管理 | 25% |
| 技術團隊管理與任務分派 | 20% |
| 系統穩定性與 SLA 維護 | 15% |
| 技術債管理與重構規劃 | 10% |

---

## KPI 指標

- **系統可用率（Uptime）**：≥ 99.5%
- **Release 週期**：雙週一次正常 Release
- **Bug 解決時間**：P1 < 4 小時，P2 < 24 小時
- **技術債清理比例**：每季 ≥ 10% 技術債項目完成
- **工程師產出速率（Velocity）**：Sprint 完成率 ≥ 80%

---

## 日常工作項目

### 每日
- 閱讀 CTO 日報（Slack Willy DM）
- 確認系統狀態（Uptime、告警）
- 確認工程師當日任務與阻塞點

### 每週
- 技術週會（四位工程師）
- Sprint Review / Planning
- 產品需求與工程 backlog 整理

### 每月
- 系統穩定性月報
- 技術路線圖更新
- 向 CEO 提交技術月報

---

## 需要的報表/數據

| 報表 | 頻率 | 接收方式 |
|------|------|---------|
| **CTO 日報** | 每日 | Slack Willy DM |
| **每小時系統快報** | 每小時 | Slack #general |
| IT 日報（供參） | 每日 | Slack C02E37Q1CUD |
| 系統告警 | 即時 | DevOps 監控系統 |

---

## AI Agent 支援方式

- 自動彙整 CTO 日報（系統健康、部署狀態、Bug SLA、Sprint 進度）
- P1/P2 Bug 即時警示與升級通知
- 系統 Uptime 異常立即告警
- Sprint 燃盡圖（Burndown）週報自動摘要
- 技術債清單追蹤提醒
- 每小時系統快報異常時自動標記

## 🔧 引用能力（extends capabilities）

| Skill | 路徑 | 本職務使用情境 |
|-------|------|--------------|
| skill-changelog | capabilities/skill-changelog/ | 每次 Sprint 產生 Release Notes，推送給 PM 與客戶 |
| skill-d3 | capabilities/skill-d3/ | 系統依賴架構圖、API 效能趨勢、Sprint Burndown 視覺化 |
| skill-aws | capabilities/skill-aws/ | 架構決策輔助（CDK 最佳實踐、成本優化、無伺服器方案評估） |
| skill-mcp-builder | capabilities/skill-mcp-builder/ | 建立內部工具的 MCP Server（ADO、監控系統、Slack API） |
| skill-xlsx | capabilities/skill-xlsx/ | 工程 KPI 追蹤（Uptime、Bug SLA、部署頻率、技術債清單） |
---

## 相關 Skills

- `lifecom-slack-ops`：報表推送至 Willy DM
- `lifecom-reporting`：CTO 日報設定
- `lifecom-ado`：Bug/工單追蹤
- `lifecom-role-backend`：後端工程師對齊
- `lifecom-role-frontend`：前端工程師對齊
- `lifecom-role-it`：IT 工程師對齊
- `lifecom-role-devops`：DevOps 工程師對齊
- `lifecom-roles`：組織總索引
