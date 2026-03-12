/**
 * extract_events_rules.js — L2a 規則式即時事件萃取
 * 
 * 每次 sync 後呼叫，從新進訊息中萃取事件寫入 events 表。
 * 純規則（正則 + 關鍵字），不呼叫 AI API。
 * 
 * 用法：
 *   const { extractSlackEvents, extractLineEvents } = require('./extract_events_rules');
 *   extractSlackEvents(newMessages, channelId, channelName);
 *   extractLineEvents(newMessages, groupId, groupInfo);
 */

const { events, db } = require('./lifecom_db');

// ─── 工具 ─────────────────────────────────────────────────────────

let _eventCounter = null;

function nextEventId(date) {
  if (!_eventCounter || _eventCounter.date !== date) {
    // 查 DB 當天最大序號
    const row = db.prepare(
      `SELECT id FROM events WHERE date=? ORDER BY id DESC LIMIT 1`
    ).get(date);
    let seq = 0;
    if (row && row.id) {
      const m = row.id.match(/-(\d+)$/);
      if (m) seq = parseInt(m[1], 10);
    }
    _eventCounter = { date, seq };
  }
  _eventCounter.seq++;
  return `evt-${date}-${String(_eventCounter.seq).padStart(3, '0')}`;
}

function toDate(ts) {
  // ts can be unix seconds (slack) or ISO string or ms
  let d;
  if (typeof ts === 'string' && ts.includes('T')) {
    d = new Date(ts);
  } else {
    const n = parseFloat(ts);
    d = new Date(n < 1e12 ? n * 1000 : n);
  }
  // Asia/Taipei = UTC+8
  const utc = d.getTime() + d.getTimezoneOffset() * 60000;
  const taipei = new Date(utc + 8 * 3600000);
  return taipei.toISOString().split('T')[0];
}

function writeEvent(evt) {
  // 防重：用 source_ref + subject 做 dedup
  const existing = db.prepare(
    `SELECT id FROM events WHERE date=? AND source=? AND subject=? LIMIT 1`
  ).get(evt.date, evt.source, evt.subject);
  if (existing) return null; // 已存在，跳過

  const id = nextEventId(evt.date);
  const now = Math.floor(Date.now() / 1000);
  events.upsert.run({
    id,
    date: evt.date,
    source: evt.source,
    source_ref: evt.source_ref || '',
    channel_id: evt.channel_id || '',
    subject: evt.subject,
    action: evt.action,
    category: evt.category,
    customer_tag: evt.customer_tag || null,
    assignee: evt.assignee || null,
    ado_workitem_id: evt.ado_workitem_id || null,
    status: evt.status || 'open',
    due_date: evt.due_date || null,
    extracted_at: now,
    resolved_at: null,
  });
  return id;
}

// ─── Slack 規則萃取 ───────────────────────────────────────────────

// 客戶名對應表（從 attachments text 解析站台名）
const SITE_TO_CUSTOMER = {
  'nikegolf': 'NikeGolf', 'emersgroup': 'Emersgroup', 'toysrus': 'ToysRUs',
  'levis': 'Levis', 'sfl': 'SFL', 'adastriab2b': 'Adastria',
  'lab52': 'Lab52', 'relove': 'Relove', 'jumeng': 'Jumeng',
  'snowiou': 'Snowiou', 'drhold': 'DrHold', 'natgeo': 'NatGeo',
  'lorealv2': 'Loreal', 'keyweardep': 'KeyWear', 'owndays': 'Owndays',
};

function detectSite(text) {
  for (const [site, tag] of Object.entries(SITE_TO_CUSTOMER)) {
    if (text.includes(site + '.licodes.net') || text.includes('[' + site + ']')) {
      return tag;
    }
  }
  return null;
}

// 不做事件萃取的頻道（二手消息源）
const SKIP_EXTRACT_CHANNELS = new Set([
  'C02ECE2CLDS', // general（系統快報是二手消息）
  'C02E37Q1CUD', // lifecom-rd（IT日報是二手消息）
  'C03JFHJ2Q8Y', // lifecom-report
  'C02FPLLG6R2', // lifecom-note
]);

function extractSlackEvents(messages, channelId, channelName) {
  const extracted = [];
  if (!messages || !messages.length) return extracted;
  if (SKIP_EXTRACT_CHANNELS.has(channelId)) return extracted;

  for (const msg of messages) {
    const text = msg.text || '';
    const attText = msg.attachments
      ? (Array.isArray(msg.attachments) ? msg.attachments : JSON.parse(msg.attachments))
          .map(a => a.text || a.fallback || '').join(' ')
      : '';
    const full = text + ' ' + attText;
    if (!full.trim()) continue;

    const date = toDate(msg.ts);
    const site = detectSite(full);

    // ── MomoClient.php crash ──
    if (full.includes('MomoClient.php')) {
      const id = writeEvent({
        date, source: 'slack', source_ref: msg.ts,
        channel_id: channelId,
        subject: `MomoClient crash (${site || 'unknown'})`,
        action: full.substring(0, 200),
        category: 'issue', customer_tag: site,
      });
      if (id) extracted.push(id);
      continue;
    }

    // ── WMS 訂單狀態更新失敗（每日聚合：同客戶同天合併為一筆）──
    const wmsMatch = full.match(/WMS訂單狀態更新_存在失敗.*?成功筆數\s*:\s*(\d+).*?失敗筆數\s*:\s*(\d+)/s);
    if (wmsMatch) {
      const ok = parseInt(wmsMatch[1]);
      const fail = parseInt(wmsMatch[2]);
      const total = ok + fail;
      const tag = site || '?';
      const aggSubject = `WMS回寫失敗 ${tag} 每日聚合`;

      // 查是否今天已有聚合事件
      const existing = db.prepare(
        `SELECT id, action FROM events WHERE date=? AND source='slack' AND subject=? LIMIT 1`
      ).get(date, aggSubject);

      if (existing) {
        // 追加到既有聚合事件
        const prev = existing.action || '';
        const batchLine = `${new Date(parseFloat(msg.ts)*1000).toTimeString().substring(0,5)} 總${total}筆 成功${ok}筆 失敗${fail}筆`;
        const updated = prev + '\n' + batchLine;
        // 重算聚合統計
        const batches = updated.split('\n').filter(l => l.match(/總\d+筆/));
        let sumTotal = 0, sumFail = 0;
        for (const b of batches) {
          const tm = b.match(/總(\d+)筆/); const fm = b.match(/失敗(\d+)筆/);
          if (tm) sumTotal += parseInt(tm[1]);
          if (fm) sumFail += parseInt(fm[1]);
        }
        const aggRate = sumTotal > 0 ? Math.round((sumTotal - sumFail) / sumTotal * 100) : 100;
        const newAction = `📊 今日聚合 ${batches.length} 批次 | 總${sumTotal}筆 失敗${sumFail}筆 成功率${aggRate}%\n${updated}`;
        db.prepare('UPDATE events SET action=?, source_ref=? WHERE id=?').run(newAction, msg.ts, existing.id);
        extracted.push(existing.id);
      } else {
        // 第一筆：建新聚合事件
        const successRate = Math.round(ok / total * 100);
        const batchLine = `${new Date(parseFloat(msg.ts)*1000).toTimeString().substring(0,5)} 總${total}筆 成功${ok}筆 失敗${fail}筆`;
        const action = `📊 今日聚合 1 批次 | 總${total}筆 失敗${fail}筆 成功率${successRate}%\n${batchLine}`;
        const id = writeEvent({
          date, source: 'slack', source_ref: msg.ts,
          channel_id: channelId,
          subject: aggSubject,
          action,
          category: 'issue', customer_tag: tag,
        });
        if (id) extracted.push(id);
      }
      continue;
    }

    // ── 採購單轉入失敗（每日聚合）──
    const poMatch = full.match(/採購單轉入_存在失敗.*?成功筆數\s*:\s*(\d+).*?失敗筆數\s*:\s*(\d+)/s);
    if (poMatch) {
      const ok = parseInt(poMatch[1]);
      const fail = parseInt(poMatch[2]);
      const total = ok + fail;
      const tag = site || '?';
      const aggSubject = `採購單轉入失敗 ${tag} 每日聚合`;

      const existing = db.prepare(
        `SELECT id, action FROM events WHERE date=? AND source='slack' AND subject=? LIMIT 1`
      ).get(date, aggSubject);

      if (existing) {
        const batchLine = `${new Date(parseFloat(msg.ts)*1000).toTimeString().substring(0,5)} 總${total}筆 成功${ok}筆 失敗${fail}筆`;
        const updated = (existing.action || '') + '\n' + batchLine;
        const batches = updated.split('\n').filter(l => l.match(/總\d+筆/));
        let sumTotal = 0, sumFail = 0;
        for (const b of batches) {
          const tm = b.match(/總(\d+)筆/); const fm = b.match(/失敗(\d+)筆/);
          if (tm) sumTotal += parseInt(tm[1]);
          if (fm) sumFail += parseInt(fm[1]);
        }
        const aggRate = sumTotal > 0 ? Math.round((sumTotal - sumFail) / sumTotal * 100) : 100;
        db.prepare('UPDATE events SET action=?, source_ref=? WHERE id=?').run(
          `📊 今日聚合 ${batches.length} 批次 | 總${sumTotal}筆 失敗${sumFail}筆 成功率${aggRate}%\n${updated}`,
          msg.ts, existing.id
        );
        extracted.push(existing.id);
      } else {
        const successRate = Math.round(ok / total * 100);
        const batchLine = `${new Date(parseFloat(msg.ts)*1000).toTimeString().substring(0,5)} 總${total}筆 成功${ok}筆 失敗${fail}筆`;
        const id = writeEvent({
          date, source: 'slack', source_ref: msg.ts,
          channel_id: channelId,
          subject: aggSubject,
          action: `📊 今日聚合 1 批次 | 總${total}筆 失敗${fail}筆 成功率${successRate}%\n${batchLine}`,
          category: 'issue', customer_tag: tag,
        });
        if (id) extracted.push(id);
      }
      continue;
    }

    // ── integrateByAPIProcess FAIL ──
    if (full.includes('integrateByAPIProcess::FAIL')) {
      const orderMatch = full.match(/Order ID:\s*(O\w+)/);
      const id = writeEvent({
        date, source: 'slack', source_ref: msg.ts,
        channel_id: channelId,
        subject: `API整合失敗 ${orderMatch ? orderMatch[1] : ''}`,
        action: full.substring(0, 200),
        category: 'issue', customer_tag: site,
      });
      if (id) extracted.push(id);
      continue;
    }

    // ── GCP alerts (CPU / RAM) ──
    if (full.includes('CPU utilization') || full.includes('Memory utilization')) {
      const hostMatch = full.match(/for\s+(\S+\s+\S+)\s+with/);
      const host = hostMatch ? hostMatch[1] : 'unknown';
      const metric = full.includes('CPU') ? 'CPU' : 'RAM';
      const id = writeEvent({
        date, source: 'slack', source_ref: msg.ts,
        channel_id: channelId,
        subject: `GCP ${metric}>85% (${host})`,
        action: full.substring(0, 200),
        category: 'issue', customer_tag: null,
      });
      if (id) extracted.push(id);
      continue;
    }

    // ── SysBDReport.php (排程報表異常) ──
    if (full.includes('SysBDReport.php')) {
      const id = writeEvent({
        date, source: 'slack', source_ref: msg.ts,
        channel_id: channelId,
        subject: `排程報表異常 (${site || 'unknown'})`,
        action: full.substring(0, 200),
        category: 'issue', customer_tag: site,
      });
      if (id) extracted.push(id);
      continue;
    }

    // ── CurlFactory (SSL/連線問題) ──
    if (full.includes('CurlFactory.php')) {
      const id = writeEvent({
        date, source: 'slack', source_ref: msg.ts,
        channel_id: channelId,
        subject: `SSL/連線異常 (${site || 'unknown'})`,
        action: full.substring(0, 200),
        category: 'issue', customer_tag: site,
      });
      if (id) extracted.push(id);
      continue;
    }
  }

  return extracted;
}

// ─── LINE 規則萃取 ────────────────────────────────────────────────

const ISSUE_KEYWORDS = [
  '異常', '錯誤', '失敗', '無法', '不行', '太慢', '跑不出來',
  '當掉', '卡住', '掛了', '出錯', '壞了', '不見了', '消失', '沒反應',
  '斷線', '超時', '逾時', '噴錯',
];
// 「問題」太常見，從 issue 移出；只有「出了問題」「有問題」才算 issue
const ISSUE_PHRASES = ['出了問題', '有問題', '問題很嚴重', '問題還在'];

const REQUEST_KEYWORDS = [
  '調整', '希望', '能否', '可以改', '要求', '請問', '是不是可以',
  '建議', '想要', '需要', '麻煩', '幫忙', '能不能', '可否',
  '請幫', '拜託', '請協助', '可以幫',
];
const COMMITMENT_KEYWORDS = [
  '我會', '我這邊會', '我來', '沒問題', '收到了', '了解',
  '調整完畢', '馬上處理', '今天會', '明天會', '下午會',
  '我處理', '我來看', '我查', '等我', '我先', '我去',
  '已修復', '已處理', '已完成', '已調整', '已更新', '改好了', '修好了',
  '部署完成', '上線了',
];
// 「好的」「收到」「處理」太泛，不單獨計分
const COMMITMENT_BOOSTERS = ['好的', '收到', '處理', '了解', '確認'];

function extractLineEvents(messages, groupId, groupInfo) {
  const extracted = [];
  if (!messages || !messages.length) return extracted;

  const textMsgs = messages.filter(m => m.media_type === 'text' && m.content && m.content.length > 5);
  if (textMsgs.length === 0) return extracted;

  const groupCustomerTag = groupInfo?.customer_tag || null;
  const groupName = groupInfo?.group_name || groupId.substring(0, 12);

  // 客戶品牌關鍵字（用於內部群 per-message 客戶辨識）
  const BRAND_KEYWORDS = {
    ...SITE_TO_CUSTOMER,
    // 中文品牌名
    '天泉': '天泉', '古寶': '古寶', '眾星': '眾星', '新澔豐': '新澔豐',
    'Lacoste': 'Lacoste', 'lacoste': 'Lacoste',
    'Sabon': 'Sabon', 'sabon': 'Sabon',
    'EnamoR': 'EnamoR', 'enamor': 'EnamoR',
    'NPC': 'NPC', 'Adastria': 'Adastria',
  };
  function detectCustomerFromText(text) {
    for (const [kw, tag] of Object.entries(BRAND_KEYWORDS)) {
      if (text.includes(kw)) return tag;
    }
    return null;
  }

  for (const msg of textMsgs) {
    const text = msg.content;
    const date = toDate(msg.ts);
    const sender = msg.sender_name || msg.sender_id?.substring(0, 12) || '?';

    // 計算匹配度（commitment/request 優先，因為更具行動意義）
    let issueScore = ISSUE_KEYWORDS.filter(k => text.includes(k)).length;
    issueScore += ISSUE_PHRASES.filter(p => text.includes(p)).length;
    const requestScore = REQUEST_KEYWORDS.filter(k => text.includes(k)).length;
    let commitScore = COMMITMENT_KEYWORDS.filter(k => text.includes(k)).length;
    // Boosters: 單獨出現不計分，但搭配其他 commitment keyword 加 0.5
    if (commitScore > 0) {
      commitScore += COMMITMENT_BOOSTERS.filter(k => text.includes(k)).length * 0.5;
    }

    const maxScore = Math.max(issueScore, requestScore, commitScore);
    if (maxScore === 0) continue;
    // 降低門檻：1 個關鍵字 + 文字 > 10 chars 就建 event
    if (maxScore < 1 || (maxScore === 1 && text.length < 10)) continue;

    // 優先序：commitment > request > issue（行動 > 需求 > 問題）
    let category, subject;
    if (commitScore > 0 && commitScore >= requestScore) {
      category = 'commitment';
      subject = `${groupName} 承諾事項`;
    } else if (requestScore > 0 && requestScore >= issueScore) {
      category = 'request';
      subject = `${groupName} 調整需求`;
    } else {
      category = 'issue';
      subject = `${groupName} 反映問題`;
    }

    // Per-message 客戶辨識：群組有 tag 就用，沒有就從文字推斷
    const customerTag = groupCustomerTag || detectCustomerFromText(text);

    const id = writeEvent({
      date, source: 'line', source_ref: msg.msg_id || msg.ts,
      channel_id: groupId,
      subject,
      action: `[${sender}] ${text.substring(0, 200)}`,
      category,
      customer_tag: customerTag,
      assignee: category === 'commitment' ? sender : null,
    });
    if (id) extracted.push(id);
  }

  return extracted;
}

module.exports = { extractSlackEvents, extractLineEvents };
