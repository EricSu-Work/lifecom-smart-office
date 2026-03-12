# lifecom-role-devops

DevOps 工程師的 AI Agent 支援腳本。負責自動化部署、CI/CD 管線、雲端基礎設施，向技術經理回報。

---

## 職務基本資訊

| 欄位 | 內容 |
|------|------|
| 職稱 | DevOps 工程師 |
| 層級 | 執行層（技術團隊） |
| 直屬主管 | 技術經理（TechLead） |
| 技術領域 | CI/CD、容器化、雲端、監控、自動化 |

---

## 核心職責

| 職責 | 比重 |
|------|------|
| CI/CD 管線建置與維護 | 35% |
| 雲端基礎設施管理 | 25% |
| 系統監控與告警設定 | 20% |
| 部署自動化優化 | 10% |
| 安全與合規（DevSecOps） | 10% |

---

## KPI 指標

- **部署成功率**：≥ 99%
- **平均部署時間（MTTR for Deploy）**：< 15 分鐘
- **CI/CD 管線穩定率**：≥ 95%（不因管線問題卡關）
- **告警誤報率（False Positive）**：< 5%
- **雲端成本優化**：每季成本超支 < 10%

---

## 日常工作項目

### 每日
- 確認 IT 日報（Slack C02E37Q1CUD）
- 確認昨日 CI/CD 管線狀況
- 檢查監控告警

### 每週
- 部署報告（成功率、時間趨勢）
- 基礎設施健康度檢查
- 每小時系統快報腳本更新維護

### 每月
- 雲端成本分析報告
- CI/CD 管線效能優化
- 安全掃描報告（Container、Dependency）

---

## 需要的報表/數據

| 報表 | 頻率 | 接收方式 |
|------|------|---------|
| **IT 日報** | 每日 | Slack C02E37Q1CUD |
| **每小時系統快報** | 每小時 | Slack #general（由 DevOps 負責發送） |
| CI/CD 執行記錄 | 即時 | 管線系統 |
| 雲端費用報表 | 每日 | 雲端廠商 |

---

## AI Agent 支援方式

- CI/CD 失敗即時警示與初步診斷
- 部署成功/失敗自動通報（發送至 IT 日報頻道）
- **每小時系統快報自動化**（DevOps 負責腳本，Agent 負責發送）
- 雲端成本異常警示（超過預期 10%）
- Container 漏洞掃描結果摘要推送

## 🔧 引用能力（extends capabilities）

| Skill | 路徑 | 本職務使用情境 |
|-------|------|--------------|
| skill-aws | capabilities/skill-aws/ | CDK 基礎設施管理、ECS/Lambda 部署自動化、成本優化 |
| skill-changelog | capabilities/skill-changelog/ | 每次部署後自動產生 Release Notes 推送至 Slack |
| skill-ffuf | capabilities/skill-ffuf/ | 部署前 API 安全掃描、CI Pipeline 整合模糊測試 |
| skill-k8s | capabilities/skill-k8s/ | LifeCOM K8s cluster：manifests、Ingress、cert-manager、rolling deploy、CI/CD pipeline |
| skill-github | capabilities/skill-github/ | GitHub Actions CI/CD workflow 撰寫、deploy pipeline、release 管理 |
| skill-logging | capabilities/skill-logging/ | 容器 log 收集規範、log level 標準、監控整合 |
---

## 相關 Skills

- `lifecom-slack-ops`：IT 日報頻道、#general 快報發送
- `lifecom-reporting`：每小時系統快報、IT 日報設定
- `lifecom-ado`：部署相關工單
- `lifecom-role-techlead`：向 TechLead 回報
- `lifecom-role-it`：與 IT 工程師協作
- `lifecom-roles`：組織總索引
