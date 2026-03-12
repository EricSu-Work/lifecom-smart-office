/**
 * generate_hourly_report_v2.js — 每小時系統快報（重構版）
 * 架構：先增量同步 Slack/ADO → 從 lifecom.db 讀取 → 組裝報表
 * 
 * 差異於 v1：不直接打 Slack/ADO API，改走 lifecom.db
 */
const fs   = require('fs');
const path = require('path');
const { db, slack, ado, cursor, batchUpsert } = require('./lifecom_db');
const { slackPost, saveReport } = require('./utils');

const GENERAL_CHANNEL = 'C02ECE2CLDS';
const ALERT_CHANNEL   = 'C03TBQ5891V';
const GCP_CHANNEL     = 'C05A8K75PA5';
const DEPLOY_CHANNEL  = 'C03FSJ3PQKD';
const WS = path.join(__dirname, '..');

// ── 增量同步（只拉新訊息）───────────────────────────────────────────────────
const https = require('https');
const token = fs.readFileSync(require('os').homedir() + '/.config/slack/user_token', 'utf8').trim();

function slackGetApi(apiPath) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'slack.com', path: apiPath, method: 'GET',
      headers: { 'Authorization': 'Bearer ' + token }
    }, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve(JSON.parse(d))); });
    req.on('error', reject); req.end();
  });
}

async function incrementalSync(channelId, limit = 100) {
  const cursorKey = 'slack_' + channelId;
  const lastTs = cursor.get(cursorKey) || '0';
  const res = await slackGetApi(`/api/conversations.history?channel=${channelId}&oldest=${lastTs}&limit=${limit}&inclusive=false`);
  if (!res.ok || !res.messages?.length) return 0;
  const msgs = res.messages.filter(m => m.type === 'message' && m.ts !== lastTs);
  if (!msgs.length) return 0;
  const rows = msgs.map(m => ({
    ts: m.ts, channel_id: channelId,
    user_id: m.user || m.bot_id || '',
    text: m.text || '',
    attachments: m.attachments ? JSON.stringify(m.attachments) : null,
    thread_ts: m.thread_ts || null,
    reactions: m.reactions ? JSON.stringify(m.reactions) : null,
  }));
  batchUpsert(slack.upsert, rows);
  const newestTs = msgs.reduce((max, m) => m.ts > max ? m.ts : max, '0');
  cursor.set(cursorKey, newestTs);
  return rows.length;
}

// ── 時間窗口計算 ──────────────────────────────────────────────────────────────
function getWindowSeconds() {
  const h = parseInt(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei', hour: 'numeric', hour12: false }));
  return h === 8 ? 12 * 3600 : 70 * 60;
}

// ── 激勵語輪播 ────────────────────────────────────────────────────────────────
function getMotivation() {
  try {
    const qPath = path.join(WS, 'data', 'motivational-quotes.json');
    const data  = JSON.parse(fs.readFileSync(qPath, 'utf8'));
    const q     = data.quotes[data.index % data.quotes.length];
    data.index  = (data.index + 1) % data.quotes.length;
    fs.writeFileSync(qPath, JSON.stringify(data, null, 2), 'utf8');
    return `_「${q}」_`;
  } catch(e) { return ''; }
}

// ── 系統告警（從 DB 讀）──────────────────────────────────────────────────────
function getAlerts() {
  const windowSec = getWindowSeconds();
  const since = (Date.now() / 1000 - windowSec).toFixed(6);
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayTs = (todayStart.getTime() / 1000).toFixed(6);

  function getMsgText(m) {
    if (m.text?.length > 5) return m.text;
    if (m.attachments) {
      try {
        const att = JSON.parse(m.attachments);
        return att.map(a => a.fallback || a.text || '').join(' ');
      } catch(e) {}
    }
    return '';
  }

  // 窗口內告警（bot 訊息）
  const windowMsgs = db.prepare(`
    SELECT * FROM slack_messages
    WHERE channel_id = ? AND ts > ? AND user_id LIKE 'B%'
    ORDER BY ts DESC LIMIT 50
  `).all(ALERT_CHANNEL, since);

  const msgs = windowMsgs.filter(m => getMsgText(m).length > 5);

  // 今日累計
  const todayCount = db.prepare(`
    SELECT COUNT(*) as c FROM slack_messages
    WHERE channel_id = ? AND ts > ? AND user_id LIKE 'B%'
  `).get(ALERT_CHANNEL, todayTs).c;

  if (!msgs.length) return { lines: [`  ✅ 無異常（今日累計 ${todayCount} 筆）`], hasError: false };

  const twoHoursAgo = Date.now() / 1000 - 7200;
  const seen = new Set();
  const errors = [], warnings = [];

  msgs.forEach(m => {
    const raw = getMsgText(m);
    const key = raw.substring(0, 60);
    if (seen.has(key)) return; seen.add(key);
    const txt = raw.replace(/<[^>]+>/g, '').replace(/\n.*/,'').substring(0, 85);
    const reactions = m.reactions ? JSON.parse(m.reactions) : [];
    const noReaction = !reactions.length;
    const old = parseFloat(m.ts) < twoHoursAgo;
    const unhandled = noReaction && old ? ' ⚠️ 可能未處理，請工程師確認並加 ✅ 或 👍' : '';
    if (raw.includes('CRITICAL') || raw.includes('ERROR')) errors.push(`  🔴 ${txt}${unhandled}`);
    else warnings.push(`  🟡 ${txt}${unhandled}`);
  });

  const lines = [];
  if (errors.length)   lines.push(...errors.slice(0, 4));
  if (warnings.length) lines.push(...warnings.slice(0, 2));
  if (msgs.length > 6) lines.push(`  …等共 ${msgs.length} 筆`);
  lines.push(`  📊 今日累計 ${todayCount} 筆`);
  return { lines, hasError: errors.length > 0 };
}

// ── GCP 告警（從 DB 讀）──────────────────────────────────────────────────────
function getGcpAlerts() {
  const since = (Date.now() / 1000 - getWindowSeconds()).toFixed(6);
  const msgs = db.prepare(`
    SELECT text FROM slack_messages
    WHERE channel_id = ? AND ts > ? AND length(text) > 5
    ORDER BY ts DESC LIMIT 20
  `).all(GCP_CHANNEL, since);
  if (!msgs.length) return '  ✅ 無告警';
  return msgs.slice(0, 3).map(m => `  🟠 ${m.text.replace(/<[^>]+>/g,'').substring(0, 80)}`).join('\n');
}

// ── 上板部署（從 DB 讀）──────────────────────────────────────────────────────
function getDeployments() {
  const since = (Date.now() / 1000 - getWindowSeconds()).toFixed(6);
  const msgs = db.prepare(`
    SELECT text FROM slack_messages
    WHERE channel_id = ? AND ts > ?
      AND user_id != 'USLACKBOT' AND user_id != 'B01'
      AND (text LIKE '%Merged%' OR text LIKE '%Release%' OR text LIKE '%上板%')
    ORDER BY ts DESC LIMIT 10
  `).all(DEPLOY_CHANNEL, since);
  if (!msgs.length) return '  無上板';
  return msgs.slice(0, 3).map(m =>
    `  🚀 ${m.text.replace(/<[^>]+>/g,'').replace(/\n.*/,'').substring(0, 80)}`
  ).join('\n');
}

// ── ADO Bug 快照（從 DB 讀）──────────────────────────────────────────────────
function getBugSnapshot() {
  const since14d = Math.floor(Date.now() / 1000) - 14 * 86400;
  const STATE_ICON = { 'New':'🔴','Active':'🔵','Code Review':'🟠','Pending':'🟡','Resolved':'🟡','Closed':'✅' };

  const bugs = db.prepare(`
    SELECT state, meta FROM ado_workitems
    WHERE type = 'Bug'
      AND created_at > ?
      AND state NOT IN ('Removed', 'Closed')
    ORDER BY created_at DESC
    LIMIT 200
  `).all(since14d);

  if (!bugs.length) return '  ✅ 無未關閉工單';

  const groups = {};
  bugs.forEach(b => { groups[b.state] = (groups[b.state] || 0) + 1; });
  const summary = Object.entries(groups)
    .map(([s, c]) => `${STATE_ICON[s]||'⬜'} ${s} ${c}`)
    .join(' | ');

  // P1 工單（meta JSON 內）
  const p1 = bugs.filter(b => {
    try { return JSON.parse(b.meta)?.priority == 1; } catch(e) { return false; }
  });
  const p1Str = p1.length ? `\n  ⚠️ P1 未關閉 ${p1.length} 筆` : '';
  return `  ${summary}${p1Str}`;
}

// ── 主流程 ────────────────────────────────────────────────────────────────────
async function main() {
  const now = new Date();
  const timeStr = now.toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });

  console.log('v2: Syncing channels + ADO...');
  const { execSync } = require('child_process');
  await Promise.all([
    incrementalSync(ALERT_CHANNEL, 100),
    incrementalSync(GCP_CHANNEL, 20),
    incrementalSync(DEPLOY_CHANNEL, 20),
  ]);
  // ADO 增量同步（只同步 Bug，最快）
  try {
    execSync('node ' + path.join(__dirname, 'sync_ado.js') + ' Bug', { stdio: 'pipe', timeout: 30000 });
  } catch(e) { console.warn('ADO sync warn:', e.message.slice(0,80)); }

  console.log('v2: Reading from lifecom.db...');
  const alerts    = getAlerts();
  const gcpStr    = getGcpAlerts();
  const deployStr = getDeployments();
  const bugStr    = getBugSnapshot();
  const motivation = getMotivation();

  const lines = [];
  if (motivation) lines.push(motivation, '');
  lines.push(`🔔 *LifeCOM 系統快報 ${timeStr}*`);
  lines.push('');
  lines.push('*━━ 1️⃣ 系統異常 ━━*');
  lines.push(...alerts.lines);
  lines.push('');
  lines.push('*━━ 2️⃣ GCP 監控 ━━*');
  lines.push(gcpStr);
  lines.push('');
  lines.push('*━━ 3️⃣ 上板部署 ━━*');
  lines.push(deployStr);
  lines.push('');
  lines.push('*━━ 4️⃣ 工單狀態（近2週未關閉）━━*');
  lines.push(bugStr);

  const report = lines.join('\n');
  console.log('\n--- REPORT ---');
  console.log(report);
  console.log('--------------');

  const r = await slackPost(GENERAL_CHANNEL, report);
  console.log(r.ok ? `✅ Sent to #general (${GENERAL_CHANNEL})` : `❌ Failed: ${r.error}`);
  saveReport(report, `hourly-report-${now.toISOString().replace(/[:.]/g,'-').substring(0,16)}.txt`);
}

main().catch(console.error);
