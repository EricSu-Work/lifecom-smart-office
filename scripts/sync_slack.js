/**
 * sync_slack.js — 同步 Slack 頻道訊息到 lifecom.db
 * 
 * 使用方式：
 *   node sync_slack.js                    # 同步所有設定頻道
 *   node sync_slack.js C03TBQ5891V        # 只同步指定頻道
 */
const https = require('https');
const fs = require('fs');
const { slack, cursor, batchUpsert } = require('./lifecom_db');
const { extractSlackEvents } = require('./extract_events_rules');

const token = fs.readFileSync(require('os').homedir() + '/.config/slack/user_token', 'utf8').trim();

// 要同步的頻道清單
const CHANNELS = [
  // 系統監控（Phase 1 既有）
  { id: 'C03TBQ5891V', name: 'production-alert',  limit: 100 },
  { id: 'C03FSJ3PQKD', name: 'deploy/release',     limit: 50  },
  { id: 'C02EPMHFSD7', name: 'ado-bug-bot',         limit: 50  },
  { id: 'C05A8K75PA5', name: 'it-alerts',           limit: 50  },
  // 內部溝通（C-04 通訊事件智慧層 v2.0）
  { id: 'C02ECE2CLDS', name: 'general',             limit: 30  },
  { id: 'C02P1TX3L8N', name: 'lifecom-op',          limit: 50  },
  { id: 'C08PW86ST46', name: 'announcement',        limit: 30  },
  { id: 'C08E8NJU2GP', name: 'lifecom-op-discuss',  limit: 50  },
  { id: 'C02E37Q1CUD', name: 'lifecom-rd',          limit: 50  },
  { id: 'C02DRGK3JHM', name: 'lifecom-rd-discuss',  limit: 50  },
  { id: 'C02ED8VT0P6', name: 'lifecom-csm',         limit: 50  },
  { id: 'C02EM2R2LJW', name: 'loreal',              limit: 30  },
  { id: 'C073ZDN93FE', name: '優化維運',              limit: 30  },
  { id: 'C03JFHJ2Q8Y', name: 'lifecom-report',      limit: 30  },
  { id: 'C02FPLLG6R2', name: 'lifecom-note',        limit: 30  },
];

function slackGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'slack.com', path, method: 'GET',
      headers: { 'Authorization': 'Bearer ' + token }
    }, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve(JSON.parse(d))); });
    req.on('error', reject); req.end();
  });
}

async function syncChannel(channelId, limit = 100) {
  const cursorKey = 'slack_' + channelId;
  const lastTs = cursor.get(cursorKey) || '0';

  const res = await slackGet(`/api/conversations.history?channel=${channelId}&oldest=${lastTs}&limit=${limit}&inclusive=false`);

  if (!res.ok) {
    console.error('  Slack error:', res.error);
    return { count: 0, rawMsgs: [] };
  }

  const msgs = (res.messages || []).filter(m => m.type === 'message' && m.ts !== lastTs);
  if (!msgs.length) return { count: 0, rawMsgs: [] };

  const rows = msgs.map(m => ({
    ts:          m.ts,
    channel_id:  channelId,
    user_id:     m.user || m.bot_id || '',
    text:        m.text || '',
    attachments: m.attachments ? JSON.stringify(m.attachments) : null,
    thread_ts:   m.thread_ts || null,
    reactions:   m.reactions ? JSON.stringify(m.reactions) : null,
  }));

  batchUpsert(slack.upsert, rows);

  // 更新 cursor 到最新 ts
  const newestTs = msgs.reduce((max, m) => m.ts > max ? m.ts : max, '0');
  cursor.set(cursorKey, newestTs);

  return { count: rows.length, rawMsgs: msgs };
}

async function main() {
  const targetChannel = process.argv[2];
  const channels = targetChannel
    ? CHANNELS.filter(c => c.id === targetChannel)
    : CHANNELS;

  // 去重（同一個 id 可能重複設定）
  const seen = new Set();
  const unique = channels.filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true; });

  console.log('Syncing ' + unique.length + ' Slack channels...');
  let total = 0;

  let totalEvents = 0;
  for (const ch of unique) {
    process.stdout.write('  ' + ch.name.padEnd(20) + '(' + ch.id + ') ... ');
    const { count, rawMsgs } = await syncChannel(ch.id, ch.limit);
    // L2a: 即時事件萃取
    let evtIds = [];
    if (count > 0) {
      try { evtIds = extractSlackEvents(rawMsgs, ch.id, ch.name); } catch(e) { /* silent */ }
    }
    const evtStr = evtIds.length ? ` → ${evtIds.length} events` : '';
    console.log(count + ' new msgs' + evtStr);
    total += count;
    totalEvents += evtIds.length;
  }

  console.log('Done. Total: ' + total + ' messages synced' + (totalEvents ? ', ' + totalEvents + ' events extracted' : '') + '.');
}

main().catch(console.error);
