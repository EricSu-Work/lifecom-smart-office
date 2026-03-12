/**
 * lifecom_db.js — 統一數據中台 SQLite
 * data/lifecom.db
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../data/lifecom.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS slack_messages (
  ts TEXT PRIMARY KEY, channel_id TEXT, user_id TEXT,
  text TEXT, attachments TEXT, thread_ts TEXT, reactions TEXT,
  indexed_at INTEGER DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_slack_channel ON slack_messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_slack_ts ON slack_messages(ts);

CREATE TABLE IF NOT EXISTS ado_workitems (
  id INTEGER PRIMARY KEY, type TEXT, title TEXT, state TEXT,
  severity TEXT, assigned_to TEXT, customer_tag TEXT,
  created_at INTEGER, updated_at INTEGER, target_date INTEGER,
  parent_id INTEGER, meta TEXT,
  fetched_at INTEGER DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_ado_type ON ado_workitems(type);
CREATE INDEX IF NOT EXISTS idx_ado_customer ON ado_workitems(customer_tag);
CREATE INDEX IF NOT EXISTS idx_ado_state ON ado_workitems(state);

CREATE TABLE IF NOT EXISTS notion_pages (
  id TEXT PRIMARY KEY, title TEXT, content TEXT, meta TEXT,
  fetched_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS notion_records (
  id TEXT PRIMARY KEY, db_id TEXT, data TEXT,
  updated_at INTEGER, fetched_at INTEGER DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_notion_db ON notion_records(db_id);

CREATE TABLE IF NOT EXISTS finance_records (
  id TEXT PRIMARY KEY, source TEXT, period TEXT, data TEXT,
  fetched_at INTEGER DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_finance_period ON finance_records(period);

CREATE TABLE IF NOT EXISTS gmail_messages (
  id TEXT PRIMARY KEY, thread_id TEXT, subject TEXT,
  from_addr TEXT, to_addr TEXT, body TEXT, labels TEXT,
  received_at INTEGER, indexed_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS sync_cursors (
  source TEXT PRIMARY KEY, last_cursor TEXT,
  last_sync INTEGER DEFAULT (strftime('%s','now'))
);

-- ─── C-04 通訊事件智慧層（v2.0）────────────────────────

-- L1 碎片層：LINE 訊息
CREATE TABLE IF NOT EXISTS line_messages (
  msg_id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  sender_name TEXT,
  content TEXT,
  media_type TEXT,
  ts INTEGER NOT NULL,
  session_key TEXT,
  indexed_at INTEGER DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_line_group ON line_messages(group_id);
CREATE INDEX IF NOT EXISTS idx_line_ts ON line_messages(ts);
CREATE INDEX IF NOT EXISTS idx_line_sender ON line_messages(sender_id);

-- L1 碎片層：LINE 群組對照
CREATE TABLE IF NOT EXISTS line_groups (
  group_id TEXT PRIMARY KEY,
  group_name TEXT,
  customer_tag TEXT,
  category TEXT,
  active INTEGER DEFAULT 1
);

-- D-00 Delivery Control Layer
CREATE TABLE IF NOT EXISTS delivery_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscription_id TEXT NOT NULL,
  report_date TEXT NOT NULL,
  channel TEXT NOT NULL,
  target TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  sent_at TEXT,
  error TEXT,
  report_path TEXT,
  UNIQUE(subscription_id, report_date, channel, target)
);
CREATE INDEX IF NOT EXISTS idx_delivery_sub ON delivery_log(subscription_id);
CREATE INDEX IF NOT EXISTS idx_delivery_date ON delivery_log(report_date);
CREATE INDEX IF NOT EXISTS idx_delivery_status ON delivery_log(status);

-- L2 事件萃取層
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  source TEXT NOT NULL,
  source_ref TEXT,
  channel_id TEXT,
  subject TEXT,
  action TEXT,
  category TEXT,
  customer_tag TEXT,
  assignee TEXT,
  ado_workitem_id INTEGER,
  status TEXT DEFAULT 'open',
  due_date TEXT,
  extracted_at INTEGER,
  resolved_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
CREATE INDEX IF NOT EXISTS idx_events_customer ON events(customer_tag);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_category ON events(category);
CREATE INDEX IF NOT EXISTS idx_events_assignee ON events(assignee);
`);

// ─── C-04 Unified View ────────────────────────────────────────────
const hasUnifiedView = db.prepare("SELECT name FROM sqlite_master WHERE type='view' AND name='channel_messages_unified'").get();
if (!hasUnifiedView) {
  db.exec(`
    CREATE VIEW channel_messages_unified AS
    SELECT 'line' as channel, group_id as channel_id, sender_id,
           sender_name, content as text, ts, NULL as thread_ts
    FROM line_messages
    UNION ALL
    SELECT 'slack', channel_id, user_id,
           NULL, text, CAST(REPLACE(ts,'.','') AS INTEGER), thread_ts
    FROM slack_messages
  `);
}

// FTS5（全文搜尋）
const hasFtsSlack  = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='slack_messages_fts'").get();
const hasFtsNotion = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='notion_pages_fts'").get();
if (!hasFtsSlack)  db.exec(`CREATE VIRTUAL TABLE slack_messages_fts  USING fts5(ts UNINDEXED, text, content=slack_messages,  content_rowid=rowid)`);
if (!hasFtsNotion) db.exec(`CREATE VIRTUAL TABLE notion_pages_fts    USING fts5(id UNINDEXED, title, content, content=notion_pages, content_rowid=rowid)`);

// ─── CRUD helpers ─────────────────────────────────────────────────

const slack = {
  upsert: db.prepare(`INSERT OR REPLACE INTO slack_messages (ts,channel_id,user_id,text,attachments,thread_ts,reactions,indexed_at) VALUES (@ts,@channel_id,@user_id,@text,@attachments,@thread_ts,@reactions,strftime('%s','now'))`),
  getLatest: (channel_id) => db.prepare(`SELECT ts FROM slack_messages WHERE channel_id=? ORDER BY ts DESC LIMIT 1`).get(channel_id),
  getSince:  (channel_id, since_ts) => db.prepare(`SELECT * FROM slack_messages WHERE channel_id=? AND ts>? ORDER BY ts ASC`).all(channel_id, since_ts),
  search:    (query) => db.prepare(`SELECT s.* FROM slack_messages_fts f JOIN slack_messages s ON s.rowid=f.rowid WHERE f.text MATCH ? LIMIT 50`).all(query),
};

const ado = {
  upsert: db.prepare(`INSERT OR REPLACE INTO ado_workitems (id,type,title,state,severity,assigned_to,customer_tag,created_at,updated_at,target_date,parent_id,meta,fetched_at) VALUES (@id,@type,@title,@state,@severity,@assigned_to,@customer_tag,@created_at,@updated_at,@target_date,@parent_id,@meta,strftime('%s','now'))`),
  getByType:     (type) => db.prepare(`SELECT * FROM ado_workitems WHERE type=? ORDER BY updated_at DESC`).all(type),
  getByCustomer: (tag)  => db.prepare(`SELECT * FROM ado_workitems WHERE customer_tag LIKE ? ORDER BY updated_at DESC`).all('%'+tag+'%'),
  getOpen:       ()     => db.prepare(`SELECT * FROM ado_workitems WHERE state NOT IN ('Closed','Resolved') ORDER BY severity ASC, created_at ASC`).all(),
};

const notion = {
  upsertPage:   db.prepare(`INSERT OR REPLACE INTO notion_pages (id,title,content,meta,fetched_at) VALUES (@id,@title,@content,@meta,strftime('%s','now'))`),
  upsertRecord: db.prepare(`INSERT OR REPLACE INTO notion_records (id,db_id,data,updated_at,fetched_at) VALUES (@id,@db_id,@data,@updated_at,strftime('%s','now'))`),
  getPage:      (id)    => db.prepare(`SELECT * FROM notion_pages WHERE id=?`).get(id),
  getByDb:      (db_id) => db.prepare(`SELECT * FROM notion_records WHERE db_id=? ORDER BY updated_at DESC`).all(db_id),
  isStale:      (id, maxAge=86400) => { const r = db.prepare(`SELECT fetched_at FROM notion_pages WHERE id=?`).get(id); return !r || (Date.now()/1000 - r.fetched_at) > maxAge; },
};

const finance = {
  upsert:      db.prepare(`INSERT OR REPLACE INTO finance_records (id,source,period,data,fetched_at) VALUES (@id,@source,@period,@data,strftime('%s','now'))`),
  getByPeriod: (period) => db.prepare(`SELECT * FROM finance_records WHERE period=? ORDER BY id`).all(period),
};

const cursor = {
  get: (source) => { const r = db.prepare(`SELECT last_cursor FROM sync_cursors WHERE source=?`).get(source); return r ? r.last_cursor : null; },
  set: (source, last_cursor) => db.prepare(`INSERT OR REPLACE INTO sync_cursors (source,last_cursor,last_sync) VALUES (?,?,strftime('%s','now'))`).run(source, last_cursor),
};

// ─── C-04 CRUD helpers ────────────────────────────────────────────

const line = {
  upsertMsg: db.prepare(`INSERT OR IGNORE INTO line_messages (msg_id,group_id,sender_id,sender_name,content,media_type,ts,session_key,indexed_at) VALUES (@msg_id,@group_id,@sender_id,@sender_name,@content,@media_type,@ts,@session_key,strftime('%s','now'))`),
  getByGroup: (group_id, limit=100) => db.prepare(`SELECT * FROM line_messages WHERE group_id=? ORDER BY ts DESC LIMIT ?`).all(group_id, limit),
  getByDate: (date) => db.prepare(`SELECT * FROM line_messages WHERE date(ts/1000,'unixepoch','+8 hours')=? ORDER BY ts ASC`).all(date),
  getByGroupDate: (group_id, date) => db.prepare(`SELECT * FROM line_messages WHERE group_id=? AND date(ts/1000,'unixepoch','+8 hours')=? ORDER BY ts ASC`).all(group_id, date),
  countByDate: (date) => db.prepare(`SELECT group_id, COUNT(*) as cnt FROM line_messages WHERE date(ts/1000,'unixepoch','+8 hours')=? GROUP BY group_id`).all(date),
  upsertGroup: db.prepare(`INSERT OR IGNORE INTO line_groups (group_id) VALUES (?)`),
  updateGroup: db.prepare(`UPDATE line_groups SET group_name=@group_name, customer_tag=@customer_tag, category=@category WHERE group_id=@group_id`),
  getGroup: (group_id) => db.prepare(`SELECT * FROM line_groups WHERE group_id=?`).get(group_id),
  getAllGroups: () => db.prepare(`SELECT * FROM line_groups WHERE active=1`).all(),
};

const events = {
  upsert: db.prepare(`INSERT OR REPLACE INTO events (id,date,source,source_ref,channel_id,subject,action,category,customer_tag,assignee,ado_workitem_id,status,due_date,extracted_at,resolved_at) VALUES (@id,@date,@source,@source_ref,@channel_id,@subject,@action,@category,@customer_tag,@assignee,@ado_workitem_id,@status,@due_date,@extracted_at,@resolved_at)`),
  getByDate: (date) => db.prepare(`SELECT * FROM events WHERE date=? ORDER BY extracted_at ASC`).all(date),
  getOpen: () => db.prepare(`SELECT * FROM events WHERE status IN ('open','in_progress') ORDER BY due_date ASC NULLS LAST, extracted_at ASC`).all(),
  getByCustomer: (tag) => db.prepare(`SELECT * FROM events WHERE customer_tag=? ORDER BY date DESC, extracted_at DESC`).all(tag),
  getByAssignee: (assignee) => db.prepare(`SELECT * FROM events WHERE assignee=? AND status IN ('open','in_progress') ORDER BY due_date ASC NULLS LAST`).all(assignee),
  getByCategory: (cat) => db.prepare(`SELECT * FROM events WHERE category=? ORDER BY date DESC LIMIT 50`).all(cat),
  resolve: db.prepare(`UPDATE events SET status='resolved', resolved_at=strftime('%s','now') WHERE id=?`),
  updateStatus: db.prepare(`UPDATE events SET status=? WHERE id=?`),
  getStale: (days=7) => db.prepare(`SELECT * FROM events WHERE status='open' AND extracted_at < strftime('%s','now') - ? * 86400 ORDER BY extracted_at ASC`).all(days),
};

// ─── D-00 Delivery CRUD ───────────────────────────────────────────
const delivery = {
  // 記錄一筆投遞（dedup：UNIQUE constraint 自動防重複）
  log: db.prepare(`INSERT OR IGNORE INTO delivery_log (subscription_id, report_date, channel, target, status, sent_at, error, report_path) VALUES (@subscription_id, @report_date, @channel, @target, @status, @sent_at, @error, @report_path)`),
  // 更新狀態
  updateStatus: db.prepare(`UPDATE delivery_log SET status=@status, sent_at=@sent_at, error=@error WHERE subscription_id=@subscription_id AND report_date=@report_date AND channel=@channel AND target=@target`),
  // 查某份報表今天是否已送達
  isSent: (sub_id, date, channel, target) => {
    const r = db.prepare(`SELECT status FROM delivery_log WHERE subscription_id=? AND report_date=? AND channel=? AND target=? AND status='sent'`).get(sub_id, date, channel, target);
    return !!r;
  },
  // 取得某訂閱最後成功送達時間
  lastSent: (sub_id) => {
    return db.prepare(`SELECT MAX(sent_at) as last_sent FROM delivery_log WHERE subscription_id=? AND status='sent'`).get(sub_id);
  },
  // SLA 檢查：列出超過 sla_hours 沒成功送達的訂閱
  getAll: () => db.prepare(`SELECT * FROM delivery_log ORDER BY id DESC LIMIT 200`).all(),
  // 取得某日所有投遞狀態
  getByDate: (date) => db.prepare(`SELECT * FROM delivery_log WHERE report_date=? ORDER BY id`).all(date),
  // 取得失敗或 pending 的
  getPending: () => db.prepare(`SELECT * FROM delivery_log WHERE status IN ('pending','failed') ORDER BY id`).all(),
};

function batchUpsert(stmt, rows) {
  const tx = db.transaction(items => { for (const item of items) stmt.run(item); });
  tx(rows);
  return rows.length;
}

module.exports = { db, slack, ado, notion, finance, line, events, delivery, cursor, batchUpsert };

if (require.main === module) {
  const tables = ['slack_messages','ado_workitems','notion_pages','notion_records','finance_records','gmail_messages','sync_cursors','line_messages','line_groups','events'];
  console.log('lifecom.db ready:', DB_PATH);
  tables.forEach(t => {
    const c = db.prepare('SELECT COUNT(*) as c FROM ' + t).get();
    console.log('  ' + t.padEnd(24) + c.c + ' rows');
  });
}
