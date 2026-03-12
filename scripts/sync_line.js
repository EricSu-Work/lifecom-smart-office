/**
 * sync_line.js — L1 碎片層：LINE session JSONL → line_messages 表
 * 
 * C-04 通訊事件智慧層 v2.0
 * 
 * 用法：node sync_line.js [--full]
 *   --full  忽略 cursor，重新掃描所有檔案
 * 
 * 特性：
 *   - idempotent（msg_id INSERT OR IGNORE）
 *   - incremental（cursor 追蹤每個 session 檔案的 byte offset）
 *   - 不觸發 AI API
 */

const fs = require('fs');
const path = require('path');
const { line, cursor, batchUpsert, db } = require('./lifecom_db');
const { extractLineEvents } = require('./extract_events_rules');
const { getGroupSummary } = require('./line_api');

// ─── Config ───────────────────────────────────────────────────────

const SESSIONS_DIR = path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw', 'agents', 'main', 'sessions');
const SESSIONS_JSON = path.join(SESSIONS_DIR, 'sessions.json');
const KB_PATH = path.join(__dirname, '../data/lifecom-knowledge-base.md');
const CURSOR_PREFIX = 'sync_line:';
const fullMode = process.argv.includes('--full');

// 從知識庫載入客戶名稱列表（用於自動辨識）
let CUSTOMER_KEYWORDS = [];
try {
  const kb = fs.readFileSync(KB_PATH, 'utf8');
  // 提取第一欄（品牌名）和第二欄（公司行號）
  const rows = kb.split('\n').filter(l => l.startsWith('|') && !l.includes('---') && !l.includes('品牌'));
  for (const row of rows) {
    const cols = row.split('|').map(c => c.trim()).filter(Boolean);
    if (cols.length >= 2) {
      // 品牌名（可能含英文+中文）
      const brand = cols[0];
      if (brand && brand.length > 1) {
        CUSTOMER_KEYWORDS.push({ keyword: brand, tag: brand.split(/[\/\s]/)[0] });
        // 如果品牌名含中文子名（如 "施華洛世奇Swarovski"），拆分
        const cn = brand.match(/[\u4e00-\u9fff]+/g);
        const en = brand.match(/[A-Za-z]+/g);
        if (cn) cn.forEach(w => { if (w.length >= 2) CUSTOMER_KEYWORDS.push({ keyword: w, tag: brand }); });
        if (en) en.forEach(w => { if (w.length >= 3) CUSTOMER_KEYWORDS.push({ keyword: w, tag: brand }); });
      }
      // 公司行號
      const company = cols[1];
      if (company && company.length > 2) {
        CUSTOMER_KEYWORDS.push({ keyword: company, tag: brand });
      }
    }
  }
  // 去重
  const seen = new Set();
  CUSTOMER_KEYWORDS = CUSTOMER_KEYWORDS.filter(k => {
    const key = k.keyword.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
} catch (e) {
  console.log('[sync_line] warning: could not load knowledge base for auto-detect');
}

// ─── Main ─────────────────────────────────────────────────────────

async function main() {
  console.log(`[sync_line] start (mode: ${fullMode ? 'full' : 'incremental'})`);

  // 0. Refresh group names from LINE API (authoritative source)
  try {
    const allGroups = line.getAllGroups();
    for (const g of allGroups) {
      const realId = 'C' + g.group_id.substring(1); // DB stores lowercase, LINE API needs uppercase C
      const summary = await getGroupSummary(realId);
      if (summary && summary.groupName && summary.groupName !== g.group_name) {
        db.prepare('UPDATE line_groups SET group_name=? WHERE group_id=?').run(summary.groupName, g.group_id);
        console.log(`[sync_line] group name updated: ${g.group_id.substring(0,12)}... "${g.group_name}" → "${summary.groupName}"`);
      }
    }
  } catch (e) {
    console.log(`[sync_line] warning: group name refresh failed: ${e.message}`);
  }

  // 1. Find all LINE group sessions
  const sessionsRaw = fs.readFileSync(SESSIONS_JSON, 'utf8');
  const sessions = JSON.parse(sessionsRaw);

  const lineSessions = [];
  for (const [key, sess] of Object.entries(sessions)) {
    if (key.startsWith('agent:main:line:group:') && sess.sessionId) {
      const filePath = path.join(SESSIONS_DIR, `${sess.sessionId}.jsonl`);
      if (fs.existsSync(filePath)) {
        lineSessions.push({
          key,
          sessionId: sess.sessionId,
          filePath,
          groupId: sess.groupId || extractGroupId(key),
        });
      }
    }
  }

  console.log(`[sync_line] found ${lineSessions.length} LINE group sessions`);

  let totalInserted = 0;
  let totalSkipped = 0;
  let groupsDiscovered = 0;

  // 2. Process each session
  for (const sess of lineSessions) {
    const cursorKey = CURSOR_PREFIX + sess.sessionId;
    const lastOffset = fullMode ? 0 : parseInt(cursor.get(cursorKey) || '0', 10);
    const fileSize = fs.statSync(sess.filePath).size;

    if (lastOffset >= fileSize) {
      continue; // no new data
    }

    // Read from offset
    const fd = fs.openSync(sess.filePath, 'r');
    const buf = Buffer.alloc(fileSize - lastOffset);
    fs.readSync(fd, buf, 0, buf.length, lastOffset);
    fs.closeSync(fd);

    const content = buf.toString('utf8');
    const lines = content.split('\n').filter(l => l.trim());

    const messages = [];

    for (const rawLine of lines) {
      try {
        const obj = JSON.parse(rawLine);
        if (!obj.message || obj.message.role !== 'user') continue;

        const text = obj.message.content?.[0]?.text;
        if (!text) continue;

        const parsed = parseLineMessage(text, sess.groupId, sess.key);
        if (parsed) {
          messages.push(parsed);
        }
      } catch (e) {
        // skip malformed lines
      }
    }

    // Batch insert
    if (messages.length > 0) {
      const inserted = batchInsertMessages(messages);
      totalInserted += inserted;
      totalSkipped += messages.length - inserted;

      // L2a: 即時事件萃取（只對新插入的訊息）
      if (inserted > 0) {
        try {
          const groupInfo = line.getGroup(sess.groupId);
          const evtIds = extractLineEvents(messages, sess.groupId, groupInfo);
          if (evtIds.length > 0) {
            console.log(`[sync_line] L2a: ${evtIds.length} events extracted from ${sess.groupId.substring(0,12)}...`);
          }
        } catch(e) { /* silent */ }
      }
    }

    // Ensure group exists; auto-detect customer for new groups
    const existing = line.getGroup(sess.groupId);
    if (!existing) {
      line.upsertGroup.run(sess.groupId);
      groupsDiscovered++;
      // Auto-detect customer from message content
      const allMsgs = line.getByGroup(sess.groupId, 50);
      const detected = autoDetectCustomer(allMsgs);
      if (detected) {
        line.updateGroup.run({
          group_id: sess.groupId,
          group_name: detected.suggestedName,
          customer_tag: detected.customerTag,
          category: 'customer',
        });
        console.log(`[sync_line] auto-detected group ${sess.groupId.substring(0,12)}... → ${detected.customerTag} (${detected.confidence})`);
      }
    } else if (!existing.customer_tag) {
      // Re-try detection for untagged groups when new messages arrive
      const allMsgs = line.getByGroup(sess.groupId, 50);
      const detected = autoDetectCustomer(allMsgs);
      if (detected) {
        line.updateGroup.run({
          group_id: sess.groupId,
          group_name: detected.suggestedName,
          customer_tag: detected.customerTag,
          category: 'customer',
        });
        console.log(`[sync_line] auto-tagged group ${sess.groupId.substring(0,12)}... → ${detected.customerTag} (${detected.confidence})`);
      }
    }

    // Update cursor to end of file
    cursor.set(cursorKey, String(fileSize));
  }

  console.log(`[sync_line] done: ${totalInserted} inserted, ${totalSkipped} skipped (dup), ${groupsDiscovered} new groups`);

  // Report untagged groups for agent review
  const untagged = line.getAllGroups().filter(g => !g.customer_tag);
  if (untagged.length > 0) {
    console.log(`[sync_line] ⚠️ ${untagged.length} untagged group(s) need manual review:`);
    for (const g of untagged) {
      const msgs = line.getByGroup(g.group_id, 5);
      const sample = msgs.filter(m => m.media_type === 'text').slice(0, 2).map(m => m.content?.substring(0, 60)).join(' | ');
      console.log(`  ${g.group_id.substring(0,12)}... ${g.group_name || '(unnamed)'} — sample: ${sample}`);
    }
  }

  // Print summary
  const today = new Date().toISOString().split('T')[0];
  const counts = line.countByDate(today);
  if (counts.length > 0) {
    console.log(`[sync_line] today (${today}):`);
    for (const { group_id, cnt } of counts) {
      const grp = line.getGroup(group_id);
      const name = grp?.group_name || grp?.customer_tag || group_id.substring(0, 12) + '...';
      console.log(`  ${name}: ${cnt} messages`);
    }
  }
}

// ─── Parser ───────────────────────────────────────────────────────

function parseLineMessage(text, groupId, sessionKey) {
  // Extract metadata from the structured format
  const msgIdMatch = text.match(/"message_id":\s*"([^"]+)"/);
  const senderIdMatch = text.match(/"sender_id":\s*"([^"]+)"/);
  const senderMatch = text.match(/"sender":\s*"([^"]+)"/);
  const tsMatch = text.match(/"timestamp":\s*"([^"]+)"/);

  if (!senderIdMatch) return null;

  // Extract actual message content (after last ``` block)
  const parts = text.split('```');
  let content = parts[parts.length - 1].trim();
  if (!content) return null;

  // Parse timestamp
  let ts = Date.now();
  if (tsMatch) {
    const parsed = parseTimestamp(tsMatch[1]);
    if (parsed) ts = parsed;
  }

  // Detect media type
  let mediaType = 'text';
  if (content.startsWith('<media:image>')) mediaType = 'image';
  else if (content.includes('[Sent a') && content.includes('sticker')) mediaType = 'sticker';

  // Use message_id if available, otherwise generate from sender+ts
  const msgId = msgIdMatch?.[1] || `${senderIdMatch[1]}_${ts}`;

  return {
    msg_id: msgId,
    group_id: groupId,
    sender_id: senderIdMatch[1],
    sender_name: null, // will be filled by LINE API later
    content: content,
    media_type: mediaType,
    ts: ts,
    session_key: sessionKey,
  };
}

function parseTimestamp(tsStr) {
  // Format: "Sat 2026-03-07 14:20 GMT+8"
  const match = tsStr.match(/(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/);
  if (!match) return null;
  const [, date, time] = match;
  // Parse as Asia/Taipei (GMT+8)
  const d = new Date(`${date}T${time}:00+08:00`);
  return d.getTime();
}

function extractGroupId(sessionKey) {
  // "agent:main:line:group:group:cd515655d4d494968f72c861b1e6c2216"
  const parts = sessionKey.split(':');
  return parts[parts.length - 1];
}

// ─── Auto-detect Customer ─────────────────────────────────────────

function autoDetectCustomer(messages) {
  if (!messages.length || !CUSTOMER_KEYWORDS.length) return null;

  // Combine all text content
  const allText = messages
    .filter(m => m.media_type === 'text' && m.content)
    .map(m => m.content)
    .join(' ');

  if (!allText) return null;

  // Count keyword matches
  const scores = {};
  for (const { keyword, tag } of CUSTOMER_KEYWORDS) {
    const regex = new RegExp(escapeRegex(keyword), 'gi');
    const matches = (allText.match(regex) || []).length;
    if (matches > 0) {
      if (!scores[tag]) scores[tag] = { count: 0, keywords: [] };
      scores[tag].count += matches;
      scores[tag].keywords.push(keyword);
    }
  }

  // Also check for WMS/OMS/倉庫 keywords to detect operational context
  const opsKeywords = ['WMS', 'OMS', '出貨', '入庫', '訂單', '配達', '揀貨', '出面單', '刷讀', '條碼'];
  const opsContext = opsKeywords.filter(k => allText.includes(k));

  if (Object.keys(scores).length === 0) return null;

  // Pick highest scoring
  const sorted = Object.entries(scores).sort((a, b) => b[1].count - a[1].count);
  const [topTag, topScore] = sorted[0];
  const confidence = topScore.count >= 3 ? 'high' : topScore.count >= 2 ? 'medium' : 'low';

  // Generate suggested group name
  let suggestedName = topTag;
  if (opsContext.length > 0) {
    suggestedName += '/' + opsContext[0];
  }
  suggestedName += '群';

  return {
    customerTag: topTag,
    suggestedName,
    confidence,
    matchedKeywords: topScore.keywords,
    opsContext,
  };
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── DB Insert ────────────────────────────────────────────────────

function batchInsertMessages(messages) {
  let inserted = 0;
  const tx = db.transaction((msgs) => {
    for (const msg of msgs) {
      const result = line.upsertMsg.run(msg);
      if (result.changes > 0) inserted++;
    }
  });
  tx(messages);
  return inserted;
}

// ─── Run ──────────────────────────────────────────────────────────

main().catch(e => { console.error('[sync_line] FATAL:', e.message); process.exit(1); });
