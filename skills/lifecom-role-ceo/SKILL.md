# lifecom-role-ceo

作為 CEO 角色的 AI Agent 支援腳本。協助執行長處理策略決策、大客戶管理、日報閱覽與跨部門指揮。

---

## 職務基本資訊

| 欄位 | 內容 |
|------|------|
| 職稱 | 執行長 CEO |
| 層級 | 決策層 |
| 直屬主管 | 董事會 / 股東 |
| 直管下屬 | CSM（客成經理）、營運經理（OpsM）、技術經理（TechLead） |
| 外包管理 | 財務外包、人事外包、行政外包、法務外包 |

---

## 核心職責

| 職責 | 比重 |
|------|------|
| 策略決策與公司方向 | 30% |
| TOP10 大客戶關係維護 | 25% |
| A 級新客戶開發 | 20% |
| 技術 + 營運方向定調 | 15% |
| 三位主管管理與輔導 | 10% |

---

## KPI 指標

- **TOP10 客戶 NRR**：Net Revenue Retention ≥ 110%
- **A 級新客簽約數**：每季 ≥ 2 家
- **整體公司 MRR 成長率**：MoM ≥ 5%
- **主管 OKR 完成率**：每季三位主管平均 ≥ 80%
- **策略決策落地率**：季度目標達成 ≥ 85%

---

## 日常工作項目

### 每日
- 閱讀 CEO 日報（Eric DM）
- 查看 TOP10 客戶動態
- 確認三位主管無卡點

### 每週
- 三位主管 1:1 同步
- 審閱財務週報
- A 級客戶開發進度追蹤

### 每月
- 公司全員 All-hands
- 月度 MRR / 財務審閱
- 外包廠商績效確認（財務/人事/法務/行政）
- 策略方向複盤與調整

---

## 需要的報表/數據

| 報表 | 頻率 | 接收方式 |
|------|------|---------|
| **CEO 日報** | 每日 | Slack DM（Eric） |
| **每小時系統快報** | 每小時 | Slack #general |
| 財務週報 | 每週 | 財務外包提供 |
| 客戶健康度月報 | 每月 | CSM 提供 |

---

## AI Agent 支援方式

- 自動彙整 CEO 日報（MRR、客戶健康、工單 SLA、系統狀態）
- TOP10 客戶動態摘要與異常警示
- A 級新客開發進度追蹤提醒
- 三位主管 OKR 狀態快照
- 策略文件草擬輔助
- 外包廠商月結提醒

## 🔧 引用能力（extends capabilities）

| Skill | 路徑 | 本職務使用情境 |
|-------|------|--------------|
| skill-xlsx | capabilities/skill-xlsx/ | P&L 損益分析、AR 帳齡追蹤、季度預算管控 |
| skill-pptx | capabilities/skill-pptx/ | 董事會簡報、投資人更新、策略提案 |
| skill-pdf | capabilities/skill-pdf/ | 合約快速摘要、財報閱讀 |
| skill-d3 | capabilities/skill-d3/ | 業績趨勢圖、客戶組合視覺化 |
| skill-changelog | capabilities/skill-changelog/ | 客戶更版通知 Email |
---

## 相關 Skills

- `lifecom-slack-ops`：報表推送至 Eric DM
- `lifecom-reporting`：CEO 日報內容設定
- `lifecom-role-csm`：客成策略對齊
- `lifecom-role-opsm`：營運方向對齊
- `lifecom-role-techlead`：技術方向對齊
- `lifecom-roles`：組織總索引
