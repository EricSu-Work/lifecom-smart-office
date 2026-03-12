/**
 * line_op_relay.js
 * 
 * 讀取近期未轉拋的 LINE 群組訊息
 * 輸出：完整原始訊息（按群組分組）+ 結構化資料供 AI 做區段分析
 * 
 * Usage: node line_op_relay.js [--hours N] [--mark-sent]
 * 
 * Output: JSON { groups: [...], report, totalMessages, totalGroups }
 * - report: 格式化的原始訊息文字（第一段）
 * - groups[].conversation: 原始對話（供 AI 分析用）
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'lifecom.db');

function ensureRelayColumn(db) {
  try {
    db.exec('ALTER TABLE line_messages ADD COLUMN relayed_at TEXT');
  } catch (e) { /* column already exists */ }
}

function run() {
  const args = process.argv.slice(2);
  const hoursIdx = args.indexOf('--hours');
  const hours = hoursIdx >= 0 ? parseInt(args[hoursIdx + 1]) || 2 : 2;
  const markSent = args.includes('--mark-sent');

  const db = new Database(DB_PATH);
  ensureRelayColumn(db);

  const since = Date.now() - hours * 3600 * 1000;

  const messages = db.prepare(`
    SELECT m.rowid as id, m.ts, m.group_id, m.sender_id, m.sender_name, m.content, m.media_type,
           g.group_name, g.customer_tag
    FROM line_messages m
    LEFT JOIN line_groups g ON LOWER(m.group_id) = LOWER(g.group_id)
    WHERE m.ts >= ? AND m.relayed_at IS NULL 
      AND m.content IS NOT NULL AND m.content != ''
    ORDER BY m.ts ASC
  `).all(since);

  if (messages.length === 0) {
    console.log(JSON.stringify({ groups: [], report: null, totalMessages: 0, totalGroups: 0 }));
    db.close();
    return;
  }

  // 按群組分組
  const byGroup = {};
  for (const m of messages) {
    const key = m.group_id;
    if (!byGroup[key]) {
      byGroup[key] = {
        groupName: m.group_name || 'unknown',
        customerTag: m.customer_tag || 'unknown',
        messages: [],
        messageIds: []
      };
    }
    const time = new Date(m.ts).toLocaleString('zh-TW', {
      timeZone: 'Asia/Taipei', hour12: false,
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
    });
    byGroup[key].messages.push({ time, sender: m.sender_name || '匿名', content: m.content });
    byGroup[key].messageIds.push(m.id);
  }

  // 第一段：完整原始訊息報告
  let report = '📱 *LINE 群組訊息*\n';
  const groups = [];

  for (const [gid, group] of Object.entries(byGroup)) {
    report += `\n💬 *${group.groupName}*${group.customerTag ? ` (${group.customerTag})` : ''} — ${group.messages.length} 則\n`;
    
    const lines = [];
    for (const m of group.messages) {
      const line = `[${m.time}] ${m.sender}: ${m.content}`;
      report += `  • ${line}\n`;
      lines.push(line);
    }

    groups.push({
      groupName: group.groupName,
      customerTag: group.customerTag,
      messageCount: group.messages.length,
      conversation: lines.join('\n'),
      messageIds: group.messageIds
    });
  }

  report += `\n📊 共 ${messages.length} 則訊息，${Object.keys(byGroup).length} 個群組\n`;
  report += '\n%%AI_ANALYSIS_PLACEHOLDER%%';

  // 標記已轉拋
  if (markSent) {
    const now = new Date().toISOString();
    const allIds = groups.flatMap(g => g.messageIds);
    const stmt = db.prepare('UPDATE line_messages SET relayed_at = ? WHERE rowid = ?');
    for (const id of allIds) { stmt.run(now, id); }
    console.error(`Marked ${allIds.length} messages as relayed`);
  }

  console.log(JSON.stringify({ groups, report, totalMessages: messages.length, totalGroups: groups.length }));
  db.close();
}

try { run(); } catch (err) {
  console.error(JSON.stringify({ ok: false, error: err.message }));
  process.exit(1);
}
