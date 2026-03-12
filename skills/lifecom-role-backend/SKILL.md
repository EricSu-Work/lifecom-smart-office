# lifecom-role-backend

後端工程師的 AI Agent 支援腳本。負責 API 整合開發、系統功能實作，向技術經理回報。

---

## 職務基本資訊

| 欄位 | 內容 |
|------|------|
| 職稱 | 後端工程師 |
| 層級 | 執行層（技術團隊） |
| 直屬主管 | 技術經理（TechLead） |
| 技術領域 | API 開發、資料庫、系統整合 |

---

## 核心職責

| 職責 | 比重 |
|------|------|
| API 設計與整合開發 | 45% |
| 功能需求開發 | 30% |
| Bug 修復 | 15% |
| 技術文件撰寫 | 10% |

---

## KPI 指標

- **Sprint 任務完成率**：≥ 80%
- **API 回應時間**：P95 < 500ms
- **Bug 修復時間**：P1 < 4 小時，P2 < 24 小時
- **Code Review 通過率（一次）**：≥ 70%
- **技術文件覆蓋率**：新 API ≥ 100% 有文件

---

## 日常工作項目

### 每日
- 確認 IT 日報（Slack C02E37Q1CUD）
- 推進當前 Sprint 任務
- 處理 P1/P2 Bug（優先）

### 每週
- Sprint Review / Planning 參與
- Code Review 參與
- API 文件更新

### 每月
- 技術債盤點
- 效能優化評估

---

## 需要的報表/數據

| 報表 | 頻率 | 接收方式 |
|------|------|---------|
| **IT 日報** | 每日 | Slack C02E37Q1CUD |
| **每小時系統快報** | 每小時 | Slack #general |
| Bug 工單清單 | 即時 | ADO 系統 |

---

## AI Agent 支援方式

- P1/P2 Bug 即時警示
- API 文件草稿生成輔助
- Sprint 任務卡點自動提醒
- 系統快報異常與後端相關問題標記
- Code Review checklist 輔助

## 🔧 引用能力（extends capabilities）

| Skill | 路徑 | 本職務使用情境 |
|-------|------|--------------|
| skill-changelog | capabilities/skill-changelog/ | 從 git commits 產生每次 PR/Sprint 後端版本說明 |
| skill-ffuf | capabilities/skill-ffuf/ | 對自家 API endpoint 進行安全模糊測試，找出潛在注入弱點 |
| skill-mcp-builder | capabilities/skill-mcp-builder/ | 建立 MCP Server 整合 ADO、監控告警、外部 API 等工具 |
| skill-aws | capabilities/skill-aws/ | Lambda/ECS 部署最佳實踐、無伺服器架構設計、成本估算 |
| skill-k8s | capabilities/skill-k8s/ | LifeCOM K8s cluster 容器部署、manifest 撰寫、Ingress TLS 設定 |
| skill-remix | capabilities/skill-remix/ | Remix 全端框架：loaders/actions、OAuth flow、DB 整合、Webhook handler |
| skill-github | capabilities/skill-github/ | PR 建立、CI 狀態查詢、GitHub Actions workflow 撰寫 |
| skill-logging | capabilities/skill-logging/ | 後端 API、Webhook 的 log 格式標準與 log level 規範 |
---

## 相關 Skills

- `lifecom-slack-ops`：接收 IT 日報、#general 快報
- `lifecom-ado`：Bug/工單追蹤
- `lifecom-reporting`：IT 日報設定
- `lifecom-role-techlead`：向 TechLead 回報
- `lifecom-roles`：組織總索引
