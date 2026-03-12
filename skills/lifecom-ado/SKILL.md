# lifecom-ado

## 描述
Azure DevOps（ADO）整合技能：查詢工單、Bug、Feature、Epic。

## 連線設定
- **Organization**：lifecom（或從 `scripts/utils.js` 取得）
- **Token**：`~/.config/ado/token`（PAT）
- **Project**：LifeCOM

## 腳本位置
- `scripts/ado_bug_section.js` — Bug/工單摘要（含殭屍率）
- `scripts/ado_feature_section.js` — Feature 進度
- `scripts/ado_epic_section.js` — Epic 狀態

## 工單優先級對應
| ADO Severity | 內部 Priority | SLA |
|-------------|--------------|-----|
| 1 - Critical | P0 | 立即/CTO |
| 2 - High | P1 | 2小時/技術主管 |
| 3 - Medium | P2 | 8小時/工程師 |
| 4 - Low | P3 | 2工作日 |

## 主要工程師
- **john.liu**：Willy 下屬，RD 區主要處理者
- **howard.keo**：多筆 SLA 逾期
- **luck**：負載正常

## 殭屍工單定義
New 狀態超過 7 天未更新 → 殭屍工單
