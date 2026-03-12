#!/usr/bin/env node
/**
 * op_event_notify.js — 從 events 表讀取未通知 OP 的事件
 * 
 * Usage:
 *   node op_event_notify.js                  # 列出待通知事件
 *   node op_event_notify.js --mark-sent ID1 ID2 ...  # 標記已通知
 * 
 * Output (no --mark-sent):
 *   JSON { events: [...], totalEvents: N }
 *   若無事件：{ events: [], totalEvents: 0 }
 * 
 * 事件來源：LINE + Slack（所有 open 且未 OP 通知的事件）
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'lifecom.db');

function ensureColumn(db) {
  try {
    db.exec('ALTER TABLE events ADD COLUMN op_notified_at INTEGER');
  } catch (e) { /* column already exists */ }
}

function getSourceContext(db, event) {
  // 嘗試從原始訊息表拉取上下文
  const context = { messages: [] };

  if (event.source === 'line' && event.channel_id) {
    // 從 line_messages 取相關訊息（事件前後 30 分鐘）
    const since = (event.extracted_at || Math.floor(Date.now()/1000)) - 1800;
    const until = (event.extracted_at || Math.floor(Date.now()/1000)) + 1800;
    const msgs = db.prepare(`
      SELECT m.ts, m.sender_name, m.content, g.group_name, g.customer_tag
      FROM line_messages m
      LEFT JOIN line_groups g ON LOWER(m.group_id) = LOWER(g.group_id)
      WHERE m.group_id = ? AND m.ts >= ? AND m.ts <= ?
        AND m.content IS NOT NULL AND m.content != ''
      ORDER BY m.ts ASC
      LIMIT 20
    `).all(event.channel_id, since * 1000, until * 1000);
    
    context.messages = msgs.map(m => ({
      time: new Date(m.ts).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false, month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }),
      sender: m.sender_name || '匿名',
      content: m.content
    }));
    context.groupName = msgs[0]?.group_name || null;
    context.customerTag = msgs[0]?.customer_tag || event.customer_tag;
  } else if (event.source === 'slack' && event.source_ref) {
    // Slack 事件：channel + message ref
    const msg = db.prepare(`
      SELECT ts, user_id, text, channel_id 
      FROM slack_messages 
      WHERE channel_id = ? AND ts = ?
    `).get(event.channel_id, event.source_ref);
    
    if (msg) {
      context.messages = [{
        time: new Date(parseFloat(msg.ts) * 1000).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false, month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }),
        sender: msg.user_id || 'system',
        content: msg.text?.substring(0, 500) || ''
      }];
    }
  }

  return context;
}

function run() {
  const args = process.argv.slice(2);
  const markSent = args.includes('--mark-sent');

  const db = new Database(DB_PATH);
  ensureColumn(db);

  if (markSent) {
    // 標記已通知
    const ids = args.filter(a => a !== '--mark-sent' && !a.startsWith('--'));
    if (!ids.length) {
      console.error('No event IDs provided');
      process.exit(1);
    }
    const now = Math.floor(Date.now() / 1000);
    const stmt = db.prepare('UPDATE events SET op_notified_at = ? WHERE id = ?');
    let count = 0;
    for (const id of ids) {
      const r = stmt.run(now, id);
      count += r.changes;
    }
    console.log(JSON.stringify({ marked: count, ids }));
    db.close();
    return;
  }

  // 查詢未通知 OP 的 open 事件（排除 commitment，那是追蹤用）
  const events = db.prepare(`
    SELECT * FROM events 
    WHERE status = 'open' 
      AND op_notified_at IS NULL
      AND category IN ('issue', 'request')
    ORDER BY extracted_at DESC
  `).all();

  if (!events.length) {
    console.log(JSON.stringify({ events: [], totalEvents: 0 }));
    db.close();
    return;
  }

  // 為每個事件補充原始上下文
  const enriched = events.map(evt => {
    const ctx = getSourceContext(db, evt);
    return {
      id: evt.id,
      date: evt.date,
      source: evt.source,
      channel_id: evt.channel_id,
      subject: evt.subject,
      action: evt.action,
      category: evt.category,
      customer_tag: evt.customer_tag || ctx.customerTag || null,
      assignee: evt.assignee,
      ado_workitem_id: evt.ado_workitem_id,
      groupName: ctx.groupName || null,
      context: ctx.messages
    };
  });

  console.log(JSON.stringify({ events: enriched, totalEvents: enriched.length }, null, 0));
  db.close();
}

try { run(); } catch (err) {
  console.error(JSON.stringify({ ok: false, error: err.message }));
  process.exit(1);
}
