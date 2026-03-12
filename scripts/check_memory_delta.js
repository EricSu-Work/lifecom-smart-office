/**
 * check_memory_delta.js — memory-agent 預檢腳本
 * 
 * 比對 sessions 是否有新內容（message count delta）。
 * 有 delta → 輸出 JSON（哪些 session 有新訊息）
 * 無 delta → 輸出 "NO_DELTA" 並 exit 0
 */
const fs = require('fs');
const path = require('path');

const CURSOR_FILE = path.join(__dirname, '..', 'state', 'memory-agent-cursor.json');
const SESSIONS_DIR = path.join(__dirname, '..', '..', 'agents', 'main', 'sessions');
const SESSIONS_FILE = path.join(SESSIONS_DIR, 'sessions.json');

// Read cursor
let cursors = {};
try {
  cursors = JSON.parse(fs.readFileSync(CURSOR_FILE, 'utf8'));
} catch (e) { /* first run */ }

// Read sessions
let sessions = {};
try {
  sessions = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
} catch (e) {
  console.log('NO_DELTA');
  process.exit(0);
}

// Check each session for new content by comparing JSONL file size
const deltas = [];
for (const [key, sess] of Object.entries(sessions)) {
  const jsonlPath = path.join(SESSIONS_DIR, sess.id + '.jsonl');
  try {
    const stat = fs.statSync(jsonlPath);
    const lastSize = cursors[key]?.fileSize || 0;
    if (stat.size > lastSize) {
      deltas.push({
        sessionKey: key,
        sessionId: sess.id,
        channel: sess.channel || 'unknown',
        prevSize: lastSize,
        newSize: stat.size,
        deltaBytes: stat.size - lastSize,
      });
    }
  } catch (e) { /* file might not exist yet */ }
}

if (deltas.length === 0) {
  console.log('NO_DELTA');
  process.exit(0);
}

console.log(JSON.stringify({
  count: deltas.length,
  sessions: deltas.map(d => `${d.channel}:${d.sessionKey.substring(0,30)}(+${(d.deltaBytes/1024).toFixed(1)}KB)`),
}, null, 2));
