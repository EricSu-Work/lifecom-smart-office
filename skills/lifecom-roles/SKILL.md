## Skills 架構說明

採用 OOP 風格，分兩層：
- **capabilities/**：基礎能力定義（只寫一次），來源 awesome-claude-skills
- **lifecom-role-*/**: 職務層，只描述職責 + 引用 capabilities

讀取 Role SKILL.md 時，如需能力細節，讀對應的 capabilities/skill-*/SKILL.md。

---
# lifecom-roles（組織職務總索引）

LifeCOM 14 人精簡組織的 AI Agent 職務技能總索引。AI Agent 可透過此索引快速定位正確的職務 Skill，了解各職務的職責、報表接收與聯絡方式。

---

## 組織架構概覽

```
CEO（決策層）
├── CSM 客成經理（管理層）
│   ├── 客成專員A（執行層）
│   └── 客成專員B（執行層）
├── 營運經理 OpsM（管理層）
│   ├── 客服專員A（執行層）
│   ├── 客服專員B（執行層）
│   ├── 客服專員C（執行層）
│   └── 設計統籌（執行層）→ 管理設計外包 10-15 人
└── 技術經理 TechLead（管理層）
    ├── 後端工程師（執行層）
    ├── 前端工程師（執行層）
    ├── IT 工程師（執行層）
    └── DevOps 工程師（執行層）

外包層（CEO Office 管理）：財務、人事、行政、法務
```

---

## 職務 Skill 目錄

| 職務 | Skill 路徑 | 層級 | 簡介 |
|------|-----------|------|------|
| **CEO** | `skills/lifecom-role-ceo/SKILL.md` | 決策層 | 策略決策、TOP10客戶、A級新客、直管三主管 |
| **CSM 客成經理** | `skills/lifecom-role-csm/SKILL.md` | 管理層 | 客戶成功策略、續約/Up-sell、B級新客、管理客成團隊 |
| **營運經理 OpsM** | `skills/lifecom-role-opsm/SKILL.md` | 管理層 | 代運營管理、客服+外包管理、流程優化 |
| **技術經理 TechLead** | `skills/lifecom-role-techlead/SKILL.md` | 管理層 | 技術架構、產品管理、技術團隊、系統穩定性 |
| **客成專員A** | `skills/lifecom-role-csa-a/SKILL.md` | 執行層 | 35家客戶、onboarding、健康度監控 |
| **客成專員B** | `skills/lifecom-role-csa-b/SKILL.md` | 執行層 | 50家客戶、常規維護、問題回報 |
| **客服專員A** | `skills/lifecom-role-cs-a/SKILL.md` | 執行層 | A+B級客戶服務、SLA 管控 |
| **客服專員B** | `skills/lifecom-role-cs-b/SKILL.md` | 執行層 | C級客戶服務、FAQ 導引 |
| **客服專員C** | `skills/lifecom-role-cs-c/SKILL.md` | 執行層 | 機動支援 + 行政助理 |
| **設計統籌** | `skills/lifecom-role-design/SKILL.md` | 執行層 | 設計外包（10-15人）管理 |
| **後端工程師** | `skills/lifecom-role-backend/SKILL.md` | 執行層 | API 整合開發 |
| **前端工程師** | `skills/lifecom-role-frontend/SKILL.md` | 執行層 | 介面開發、UX 實作 |
| **IT 工程師** | `skills/lifecom-role-it/SKILL.md` | 執行層 | 系統維運支援 |
| **DevOps 工程師** | `skills/lifecom-role-devops/SKILL.md` | 執行層 | 自動化部署、CI/CD、監控 |

---

## 報表發送對應關係

| 報表名稱 | 頻率 | 發送對象 | Slack 目標 |
|---------|------|---------|-----------|
| CEO 日報 | 每日 | CEO | Eric DM |
| CSM 日報 | 每日 | CSM + 營運經理 | C02ED8VT0P6 + Willy DM |
| CTO 日報 | 每日 | 技術經理 | Willy DM |
| IT 日報 | 每日 | 技術團隊（四人） | C02E37Q1CUD |
| 每小時系統快報 | 每小時 | 全員 | #general |

---

## AI Agent 使用此索引的方式

1. **識別對話對象的職務** → 在上表找到對應職務
2. **讀取對應 SKILL.md** → 了解職務職責、KPI、日常工作
3. **確認報表接收設定** → 使用 `lifecom-reporting` + `lifecom-slack-ops`
4. **執行 AI 支援** → 依 SKILL.md 中「AI Agent 支援方式」執行

---

## 相關核心 Skills

- `lifecom-slack-ops`：Slack token、頻道 ID、DM ID
- `lifecom-reporting`：所有日報腳本與 cron 設定
- `lifecom-ado`：ADO API、工單查詢、SLA 追蹤
