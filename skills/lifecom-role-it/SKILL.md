# lifecom-role-it

IT 工程師的 AI Agent 支援腳本。負責系統維運支援、基礎設施管理，向技術經理回報。

---

## 職務基本資訊

| 欄位 | 內容 |
|------|------|
| 職稱 | IT 工程師 |
| 層級 | 執行層（技術團隊） |
| 直屬主管 | 技術經理（TechLead） |
| 技術領域 | 系統維運、網路、設備管理、帳號管理 |

---

## 核心職責

| 職責 | 比重 |
|------|------|
| 系統維運支援與障礙排除 | 40% |
| 基礎設施管理（伺服器、網路） | 25% |
| 帳號與權限管理 | 15% |
| 設備採購與管理 | 10% |
| IT 安全合規 | 10% |

---

## KPI 指標

- **系統可用率（Uptime）**：≥ 99.5%
- **IT 支援工單解決時間**：一般 < 4 小時，緊急 < 1 小時
- **帳號申請處理時間**：< 2 工作日
- **安全漏洞修補率**：Critical/High 漏洞 < 7 天修補
- **設備管理準確率**：資產清冊準確度 ≥ 99%

---

## 日常工作項目

### 每日
- 確認 IT 日報（Slack C02E37Q1CUD）
- 監控系統狀態與告警
- 處理 IT 支援工單

### 每週
- 系統健康度週報
- 帳號與權限定期審查
- 備份驗證

### 每月
- 基礎設施月度盤點
- 安全漏洞掃描報告
- 設備資產清冊更新

---

## 需要的報表/數據

| 報表 | 頻率 | 接收方式 |
|------|------|---------|
| **IT 日報** | 每日 | Slack C02E37Q1CUD |
| **每小時系統快報** | 每小時 | Slack #general |
| 系統告警 | 即時 | 監控系統 |
| 安全漏洞報告 | 每月 | 掃描工具 |

---

## AI Agent 支援方式

- 系統告警即時通知與初步診斷建議
- IT 工單優先排序
- 帳號申請自動化流程輔助
- 備份驗證失敗警示
- 安全漏洞週報摘要
- 設備到保固期提醒

## 🔧 引用能力（extends capabilities）

| Skill | 路徑 | 本職務使用情境 |
|-------|------|--------------|
| skill-aws | capabilities/skill-aws/ | 雲端資源管理、EC2/S3 維運、IAM 權限設定 |
| skill-ffuf | capabilities/skill-ffuf/ | 內部系統安全掃描、API 端點弱點測試 |
| skill-playwright | capabilities/skill-playwright/ | 系統功能驗證自動化、監控腳本 |
---

## 相關 Skills

- `lifecom-slack-ops`：接收 IT 日報、#general 快報
- `lifecom-ado`：IT 支援工單
- `lifecom-reporting`：IT 日報設定
- `lifecom-role-techlead`：向 TechLead 回報
- `lifecom-role-devops`：與 DevOps 協作
- `lifecom-roles`：組織總索引
