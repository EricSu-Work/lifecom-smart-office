/**
 * store_line_group_message.js
 * 
 * LINE 群組訊息存儲腳本
 * 架構：收到 LINE 群組訊息 → 第一個動作就是存 → NO_REPLY
 * 分析和轉拋由排程 cron 負責
 * 
 * 自動客戶比對：新群組註冊時，從群組名稱比對知識庫客戶品牌
 * 
 * Usage: node store_line_group_message.js <json_payload>
 * JSON payload: { groupId, groupName, senderId, senderName, content, messageType, ts }
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { getGroupMemberProfile } = require('./line_api');

const DB_PATH = path.join(__dirname, '..', 'data', 'lifecom.db');
const KB_PATH = path.join(__dirname, '..', 'data', 'lifecom-knowledge-base.md');

/**
 * 自動比對客戶：從群組名稱中找出已知客戶品牌
 * 比對來源：1) 知識庫品牌名 2) DB 裡既有的 customer_tag 3) events 表的 customer_tag
 */
function matchCustomer(groupName, db) {
  if (!groupName || groupName === 'unknown') return null;
  const name = groupName.toLowerCase();

  // 來源 1：知識庫品牌名（從表格第一欄抽取）
  const brands = [];
  try {
    const kb = fs.readFileSync(KB_PATH, 'utf8');
    const rows = kb.split('\n').filter(l => l.startsWith('|') && !l.includes('---') && !l.includes('品牌'));
    for (const row of rows) {
      const cols = row.split('|').map(c => c.trim()).filter(Boolean);
      if (cols[0] && cols[0].length > 1) {
        // 品牌名可能有中英文，例如 "古寶5soap"、"拓華Lab52"
        brands.push(cols[0]);
      }
    }
  } catch (e) { /* 知識庫讀取失敗，跳過 */ }

  // 來源 2：DB 裡既有的 customer_tag
  const existingTags = db.prepare("SELECT DISTINCT customer_tag FROM line_groups WHERE customer_tag IS NOT NULL").all().map(r => r.customer_tag);
  
  // 來源 3：events 表的 customer_tag
  try {
    const eventTags = db.prepare("SELECT DISTINCT customer_tag FROM events WHERE customer_tag IS NOT NULL").all().map(r => r.customer_tag);
    existingTags.push(...eventTags);
  } catch (e) { /* events 表不存在，跳過 */ }

  // 去重
  const allKeywords = [...new Set([...brands, ...existingTags])];

  // 比對：群組名稱包含已知品牌/客戶名
  // 優先匹配最長的（避免 "SFL" 誤匹配 "XSFL"）
  const matches = allKeywords.filter(kw => {
    const kwLower = kw.toLowerCase();
    return name.includes(kwLower) || kwLower.includes(name.replace(/\s*x\s*/gi, '').trim());
  });

  if (matches.length === 0) return null;

  // 取最長匹配（最精確）
  matches.sort((a, b) => b.length - a.length);
  const best = matches[0];

  // 標準化：如果品牌名含中英文，取英文或中文短名作為 tag
  // 例如 "古寶5soap" → "古寶"，"拓華Lab52" → "Lab52"
  // 但如果 existingTags 裡已有這個客戶，用既有的 tag
  const existingMatch = existingTags.find(t => best.toLowerCase().includes(t.toLowerCase()) || t.toLowerCase().includes(best.toLowerCase()));
  if (existingMatch) return existingMatch;

  // 否則用品牌名的中文部分（如果有的話）
  const chineseMatch = best.match(/[\u4e00-\u9fff]+/);
  if (chineseMatch && chineseMatch[0].length >= 2) return chineseMatch[0];

  return best;
}

function ensureTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS line_groups (
      group_id TEXT PRIMARY KEY,
      group_name TEXT,
      customer_tag TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS line_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER,
      group_id TEXT,
      sender_id TEXT,
      sender_name TEXT,
      content TEXT,
      message_type TEXT DEFAULT 'text',
      stored_at TEXT DEFAULT (datetime('now'))
    )
  `);
}

async function run() {
  const input = JSON.parse(process.argv[2] || '{}');
  let { groupId, groupName, senderId, senderName, content, messageType, ts } = input;

  if (!groupId || !content) {
    console.log(JSON.stringify({ ok: false, error: 'Missing groupId or content' }));
    process.exit(1);
  }

  // 解析 sender name：如果沒有提供，從 LINE API 取得
  if (!senderName && senderId && groupId) {
    try {
      const resolved = await getGroupMemberProfile(groupId, senderId);
      if (resolved) senderName = resolved;
    } catch (e) { /* API 失敗不影響存儲 */ }
  }

  const db = new Database(DB_PATH);
  ensureTables(db);

  // 1. 註冊群組（如果不存在）+ 自動比對客戶
  const existing = db.prepare('SELECT group_id, group_name, customer_tag FROM line_groups WHERE group_id = ?').get(groupId);
  let groupRegistered = false;
  let autoMatchedTag = null;
  
  if (!existing) {
    // 新群組：自動比對客戶
    autoMatchedTag = matchCustomer(groupName || '', db);
    db.prepare('INSERT INTO line_groups (group_id, group_name, customer_tag) VALUES (?, ?, ?)').run(groupId, groupName || 'unknown', autoMatchedTag);
    groupRegistered = true;
    console.log(JSON.stringify({ action: 'group_registered', groupId, groupName, autoMatchedTag }));
  } else if (groupName && existing.group_name !== groupName) {
    // 群組名稱更新
    db.prepare('UPDATE line_groups SET group_name = ? WHERE group_id = ?').run(groupName, groupId);
    // 如果沒有 customer_tag，嘗試從新名稱比對
    if (!existing.customer_tag) {
      autoMatchedTag = matchCustomer(groupName, db);
      if (autoMatchedTag) {
        db.prepare('UPDATE line_groups SET customer_tag = ? WHERE group_id = ?').run(autoMatchedTag, groupId);
      }
    }
    console.log(JSON.stringify({ action: 'group_name_updated', groupId, oldName: existing.group_name, newName: groupName, autoMatchedTag }));
  }

  // 2. 存訊息
  const timestamp = ts || Date.now();
  const result = db.prepare(
    'INSERT INTO line_messages (ts, group_id, sender_id, sender_name, content, message_type) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(timestamp, groupId, senderId || null, senderName || null, content, messageType || 'text');

  console.log(JSON.stringify({
    ok: true,
    messageId: result.lastInsertRowid,
    groupRegistered,
    groupId,
    groupName: groupName || existing?.group_name || 'unknown',
    timestamp
  }));

  db.close();
}

run().catch(err => {
  console.error(JSON.stringify({ ok: false, error: err.message }));
  process.exit(1);
});
