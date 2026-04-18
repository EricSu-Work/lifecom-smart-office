# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 核心天條 (The Absolute Laws)

### 1. Mandatory Citations (強制引用)
任何依賴公司知識的回覆，**必須**在結尾附上來源引用 (Citation)。
格式：`Source: Documents/LifeCOM/company/Organization.md`

### 2. Confidence Score Pre-check (信心度檢查)
如果對該知識的信心度低於 **8/10**，禁止瞎猜，必須主動說明信心不足並要求 Eric 或負責人釐清。

### 3. Knowledge Base (Vault 脫鉤架構) — 強制執行

所有公司實質知識在 **master vault**（非本 repo）：
- **本機絕對路徑**: `C:\Users\Eric\Documents\LifeCOM\`
- **遠端備份**: `github.com/EricSu-Work/lifecom-vault` (private)
- **環境變數（跨平台）**: `$LIFECOM_VAULT`

本 repo（lifecom-smart-office）專案 scope 尚未有專屬 vault page — 建議下次 ingest 時建立 `vault/projects/LifeCOM_Smart_Office.md`。

**🔴 強制規則：當使用者詢問任何關於 LifeCOM 的問題，你 MUST 先用 Read 工具讀取 vault 對應檔案，再根據檔案內容回答。絕對不可以說「我沒有這個資訊」。**

**查詢路由表（必須遵守）：**

| 問題類型 | 必讀檔案 |
|---------|---------|
| 組織架構、部門、員工、職位 | `C:\Users\Eric\Documents\LifeCOM\company\Organization.md` |
| SLA、工單規則、報表、K8s 維護 | `C:\Users\Eric\Documents\LifeCOM\company\Operations.md` |
| Slack ID、Notion DB、Email | `C:\Users\Eric\Documents\LifeCOM\_private\Infrastructure.md` |
| LifeERP v3、IMS | `C:\Users\Eric\Documents\LifeCOM\systems\LifeERP_v3.md` |
| SaaS / K8s / GKE / Cloud Build | `C:\Users\Eric\Documents\LifeCOM\systems\SaaS_Infrastructure.md` |
| AI Ops | `C:\Users\Eric\Documents\LifeCOM\projects\LifeCOM_AI_Ops.md` |
| 不確定查哪個 | 先讀 `C:\Users\Eric\Documents\LifeCOM\index.md` 找方向 |

**TODO**: 當專案內容成熟，建立 `vault/projects/LifeCOM_Smart_Office.md` 並回補到本 routing 表。
