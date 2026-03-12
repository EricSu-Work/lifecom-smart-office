# lifecom-role-csa-a

客成專員A 的 AI Agent 支援腳本。負責 35 家客戶的 onboarding、健康度監控與問題處理，向 CSM 回報。

---

## 職務基本資訊

| 欄位 | 內容 |
|------|------|
| 職稱 | 客戶成功專員 A |
| 層級 | 執行層（客成團隊） |
| 直屬主管 | CSM（客成經理） |
| 負責客戶數 | 35 家（含 onboarding 中客戶） |

---

## 核心職責

| 職責 | 比重 |
|------|------|
| 客戶 Onboarding 執行 | 35% |
| 健康度監控與主動觸達 | 30% |
| 客戶問題排查與回報 | 20% |
| 客戶培訓與教育 | 10% |
| 資料更新與 CRM 維護 | 5% |

---

## KPI 指標

- **Onboarding 完成率**：≥ 90%（30 天內完成）
- **健康度紅燈客戶比例**：≤ 10%（< 60 分）
- **主動觸達頻率**：每家客戶每月 ≥ 1 次
- **客戶問題首次回應時間**：< 2 小時
- **CRM 資料完整率**：≥ 95%

---

## 日常工作項目

### 每日
- 確認 35 家客戶健康度儀表板
- 處理客戶來信 / 工單
- 更新 Onboarding 進度

### 每週
- 向 CSM 回報高風險客戶
- 對新 onboarding 客戶進行週進度 check-in
- 更新 CRM 客戶資料

### 每月
- 客戶月報彙整（給 CSM）
- 健康度趨勢分析

---

## 需要的報表/數據

| 報表 | 頻率 | 接收方式 |
|------|------|---------|
| **每小時系統快報** | 每小時 | Slack #general |
| 我負責客戶的健康度快照 | 每日 | 系統儀表板 |
| Onboarding 進度表 | 每週 | CRM 系統 |

---

## AI Agent 支援方式

- 每日自動提醒健康度異常客戶（< 60 分）
- Onboarding Checklist 進度追蹤與卡點提醒
- 客戶問題分類摘要（依緊急程度）
- 主動觸達排程提醒（距上次聯繫 > 14 天）
- CRM 更新缺漏提醒

## 🔧 引用能力（extends capabilities）

| Skill | 路徑 | 本職務使用情境 |
|-------|------|--------------|
| skill-docx | capabilities/skill-docx/ | 客戶 Onboarding SOP、會議紀錄、工作說明書 |
| skill-xlsx | capabilities/skill-xlsx/ | 35 家客戶健康度追蹤表、KPI 數據整理 |
| skill-pdf | capabilities/skill-pdf/ | 客戶合約摘要、操作手冊提取重點 |
---

## 相關 Skills

- `lifecom-slack-ops`：接收 #general 系統快報
- `lifecom-ado`：客戶工單查詢
- `lifecom-role-csm`：向 CSM 回報問題
- `lifecom-roles`：組織總索引
