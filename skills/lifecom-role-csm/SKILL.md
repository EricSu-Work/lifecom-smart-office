# lifecom-role-csm

CSM（客戶成功經理）的 AI Agent 支援腳本。協助客戶成功策略制定、續約/Up-sell 管理、B 級新客開發，及客成團隊日常管理。

---

## 職務基本資訊

| 欄位 | 內容 |
|------|------|
| 職稱 | 客戶成功經理 CSM |
| 層級 | 管理層 |
| 直屬主管 | CEO |
| 直管下屬 | 客成專員A、客成專員B |

---

## 核心職責

| 職責 | 比重 |
|------|------|
| 客戶成功策略與健康度管理 | 30% |
| 續約談判 + Up-sell 推進 | 25% |
| B 級新客開發 | 20% |
| 客成團隊管理與輔導 | 15% |
| 客戶問題升級處理 | 10% |

---

## KPI 指標

- **客戶續約率（Renewal Rate）**：≥ 90%
- **Up-sell 達成率**：每季達成目標 80%+
- **B 級新客簽約數**：每季 ≥ 3 家
- **客戶健康度（Health Score）平均**：≥ 75 分
- **客成專員 NPS**：客戶滿意度 ≥ 4.0/5.0

---

## 日常工作項目

### 每日
- 閱讀 CSM 日報（Slack C02ED8VT0P6）
- 查看客戶健康度警示
- 確認客成專員工作進度

### 每週
- 客成團隊週會（與 A/B 專員同步）
- 高風險客戶（Health < 60）深入追蹤
- B 級新客進度確認

### 每月
- 全客戶健康度月報產出
- 續約管道（Pipeline）審閱
- Up-sell 機會清單更新
- 向 CEO 提交客成月報

---

## 需要的報表/數據

| 報表 | 頻率 | 接收方式 |
|------|------|---------|
| **CSM 日報** | 每日 | Slack C02ED8VT0P6 + Willy DM |
| **每小時系統快報** | 每小時 | Slack #general |
| 客戶健康度週報 | 每週 | 客成專員提供 |
| 續約管道報表 | 每月 | 自行彙整 |

---

## AI Agent 支援方式

- 自動彙整 CSM 日報（客戶健康、續約狀態、Up-sell 機會、專員進度）
- 高風險客戶（Health Score 低）自動警示
- 續約到期前 60/30/14 天提醒
- Up-sell 機會自動識別（使用量成長、功能請求）
- B 級新客開發進度追蹤
- 客成專員工單/問題摘要

## 🔧 引用能力（extends capabilities）

| Skill | 路徑 | 本職務使用情境 |
|-------|------|--------------|
| skill-docx | capabilities/skill-docx/ | 客戶提案書、CSM SOP、Up-sell 提案文件撰寫 |
| skill-pdf | capabilities/skill-pdf/ | 客戶合約摘要、合約到期日查核 |
| skill-pptx | capabilities/skill-pptx/ | QBR 季度業務回顧簡報製作 |
| skill-xlsx | capabilities/skill-xlsx/ | 客戶健康度追蹤表、續約管理 Pipeline、Up-sell 機會清單 |
---

## 相關 Skills

- `lifecom-slack-ops`：報表推送至 C02ED8VT0P6 + Willy DM
- `lifecom-reporting`：CSM 日報設定
- `lifecom-ado`：客戶工單 SLA 追蹤
- `lifecom-role-csa-a`：客成專員 A 工作對齊
- `lifecom-role-csa-b`：客成專員 B 工作對齊
- `lifecom-roles`：組織總索引
