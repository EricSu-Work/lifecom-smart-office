# skill-logging — LifeCOM Log 管理標準

> 所有 workspace 腳本與 gateway 的 Log 必須嚴格遵守此標準。
> 建立日期：2026-03-05，經 Eric 批准。

---

## 1. Log 格式（統一）

```
[YYYY-MM-DD HH:mm:ss.SSS] [LEVEL] [module] message {json_context}
```

範例：
```
[2026-03-05 09:20:00.123] [INFO]  [sync_ado] ADO sync completed {"count":5347,"duration_ms":18420}
[2026-03-05 09:20:01.456] [WARN]  [sync_slack] Rate limit hit, retrying {"attempt":2,"wait_ms":1000}
[2026-03-05 09:20:02.789] [ERROR] [generate_ceo] Script failed {"code":1,"stderr":"ENOENT..."}
```

## 2. Log Levels

| Level | 用途 |
|-------|------|
| `DEBUG` | 開發除錯細節（預設關閉，`LOG_LEVEL=debug` 開啟）|
| `INFO`  | 正常流程里程碑（開始/完成/筆數）|
| `WARN`  | 異常但可繼續（重試、資料缺失、非關鍵失敗）|
| `ERROR` | 失敗，需人工介入（API 錯誤、腳本 crash）|

## 3. 存放路徑

```
C:\Users\Eric\.openclaw\logs\
├── gateway.log              ← gateway stdout redirect（每日 rotate）
├── app-YYYY-MM-DD.log       ← 所有 workspace scripts 統一輸出
└── config-audit.jsonl       ← 現有設定異動記錄（保留不動）
```

## 4. Rotation 規則

- 每日一檔：`app-YYYY-MM-DD.log`
- **保留 30 天**，超過自動刪除（由 memory-cleanup cron 或獨立 cleanup script 執行）
- 單檔上限：50MB（超過強制 rotate，加後綴 `.1`, `.2`）

## 5. 共用 Logger（scripts/logger.js）

使用方式：
```js
const log = require('./logger')('sync_ado');

log.info('ADO sync started');
log.info('ADO sync completed', { count: 5347, duration_ms: 18420 });
log.warn('Rate limit hit', { attempt: 2 });
log.error('Script failed', { code: 1, stderr: err.message });
```

Logger 自動：
- 寫入 `C:\Users\Eric\.openclaw\logs\app-YYYY-MM-DD.log`
- 同時輸出到 stdout（console）
- 自動帶入 timestamp + level + module

## 6. Gateway stdout redirect

`gateway.cmd` 最後一行改為：
```cmd
"C:\Program Files\nodejs\node.exe" C:\Users\Eric\AppData\Roaming\npm\node_modules\openclaw\dist\index.js gateway --port 18789 >> "C:\Users\Eric\.openclaw\logs\gateway.log" 2>&1
```

> ⚠️ `openclaw update` 會重新產生 `gateway.cmd`，更新後需重新套用此修改。

## 7. 禁止事項

- ❌ 不得在 log 中輸出 token、密碼、API key
- ❌ 不得用 `console.log` 直接輸出（一律走 logger）
- ❌ 不得忽略 ERROR 級別不處理
- ❌ 不得在 log 檔案中存放個人識別資訊（PII）

## 8. 適用範圍

所有 `workspace/scripts/*.js` 新增或修改時必須套用，包含：
- `sync_*.js`（slack / ado / notion / finance）
- `generate_*.js`（ceo / cto / cs / it / kpi / hourly report）
- `ado_sla_monitor.js`、`slack_send_file.js` 等工具腳本

---

## 實作 TODO（尚未完成）

- [ ] 建立 `scripts/logger.js`
- [ ] 現有腳本逐步改用 logger（低優先，新功能優先套用）
- [ ] 修改 `gateway.cmd` 加 stdout redirect
- [ ] 建立 log cleanup script（30天 rotation）
