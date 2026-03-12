'use strict';
/**
 * generate_cs_report.js — CSM 日報 v3（客戶等級排序版）
 *
 * 設計原則：
 *  1. 客戶視角優先 — 按客戶分組，不按狀態分組
 *  2. 等級排序 S → A → B → C — 重要客戶永遠在前
 *  3. 異常聚焦 — SLA 逾期、停滯工單明確標出
 *  4. 可行動性 — 今日行動清單讓 CSM 知道該做什麼
 *  5. 附 ADO 連結 — 點擊直接開工單
 */
const { execSync } = require('child_process');
const path = require('path');
const https = require('https');
const { db, cursor, batchUpsert, slack } = require('./lifecom_db');
const { slackPostAll, sendEmail, getTodayInfo, saveReport } = require('./utils');
const { buildInsightPlaceholder } = require('./management_advisor');
const adoTask        = require('./ado_task_section_db');
const customerHealth = require('./customer_health');
const arSection      = require('./ar_section');
const salesSection   = require('./sales_section');
const { getTier, tierOrder, TIER_LABEL, TIERS } = require('./customer_tiers');
const INTERNAL_TIER = 'internal';

const { dms, emails } = require('./people');
const SLACK_CHANNELS = dms('Eric', 'Willy', 'Alex', 'Kennedy');
const EMAIL_TO       = emails('Eric', 'Willy', 'Alex', 'Kennedy');
const DEPLOY_CHANNEL = 'C03FSJ3PQKD';

const ADO_BASE = 'https://dev.azure.com/LifeComTW/LifeCOM/_workitems/edit';
function adoLink(id) { return `<${ADO_BASE}/${id}|#${id}>`; }

const STATE_ICON = { 'New':'🔴','Active':'🔵','Code Review':'🟠','Pending':'🟡','Resolved':'🟢','Closed':'✅' };
const STATE_ZH   = { 'New':'待處理','Active':'處理中','Code Review':'審查中','Pending':'等待回應','Resolved':'待確認','Closed':'已結案' };
const SKIP_AREAS = new Set(['lifecom','rd','op','public','general','lifecomtw','erpv2']);
const SLA_HOURS  = { 1: 0, 2: 2, 3: 8, 4: 48 };

function extractCustomer(areaPath, title) {
  if (areaPath) {
    const parts = areaPath.split('\\').filter(p => p);
    const c = parts.reverse().find(p => !SKIP_AREAS.has(p.toLowerCase()));
    if (c && c !== 'LifeCOM') return c;
  }
  const m = title.match(/\[LifeERP[^\]]*\]\[([^\]]+)\]/i) ||
            title.match(/\[WMS\]\[([^\]]+)\]/i) ||
            title.match(/^\[([^\]]+)\]/);
  if (m) return m[1];
  return '通用';
}

function humanize(text) {
  return text
    .replace(/\[LifeERPv2\]|\[WMS\]|\[LifeMALL\]/gi, '')
    .replace(/\[LifeERP[^\]]*\]/gi, '')
    .replace(/<@[A-Z0-9]+>/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ── 增量同步 Slack ────────────────────────────────────────────────────────────
const token = require('fs').readFileSync(require('os').homedir() + '/.config/slack/user_token', 'utf8').trim();
function slackGet(urlPath) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'slack.com', path: urlPath, method: 'GET',
      headers: { 'Authorization': 'Bearer ' + token },
    }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d))); });
    req.on('error', reject); req.end();
  });
}
async function incrementalSyncSlack(channelId, limit = 50) {
  const key = 'slack_' + channelId;
  const lastTs = cursor.get(key) || '0';
  const res = await slackGet(`/api/conversations.history?channel=${channelId}&oldest=${lastTs}&limit=${limit}&inclusive=false`);
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
  cursor.set(key, newestTs);
  return rows.length;
}

// ── 部署區塊 ─────────────────────────────────────────────────────────────────
function getDeploySection() {
  const weekAgo = Math.floor(Date.now() / 1000) - 7 * 86400;
  const rows = db.prepare(`
    SELECT ts, text FROM slack_messages
    WHERE channel_id = ? AND CAST(ts AS REAL) > ?
    ORDER BY CAST(ts AS REAL) DESC LIMIT 30
  `).all(DEPLOY_CHANNEL, weekAgo);

  const deployMsgs = rows.filter(r =>
    r.text && (r.text.includes('Merged') || r.text.includes('Release'))
  );
  if (!deployMsgs.length) return null;

  const items = [];
  deployMsgs.slice(0, 3).forEach(r => {
    const merged = r.text.match(/Merged\t[^\t]+\t[^\t]+\t([^\t]+)\t([^\t]+)\t(.+?)(?:\s*-\s*v[\d.]+)?$/mg);
    if (merged) {
      merged.forEach(line => {
        const parts = line.split('\t');
        if (parts.length >= 6) {
          const store = parts[3]?.trim();
          const desc  = humanize(parts[5] || '');
          if (store && desc && !store.toLowerCase().includes('public')) {
            items.push({ store, desc });
          }
        }
      });
    }
  });

  if (!items.length) return null;
  const lines = ['🚀 *本週系統功能更新*', '以下功能已完成更新，請通知相關客戶：'];
  items.forEach(({ store, desc }) => lines.push(`  • 【${store}】${desc}`));
  return lines.join('\n');
}

// ── 主核心：客戶工單全覽（依等級排序）────────────────────────────────────────
function getCustomerBugSection() {
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - 14);
  sinceDate.setHours(0, 0, 0, 0);
  const since = Math.floor(sinceDate.getTime() / 1000);
  const now   = Math.floor(Date.now() / 1000);

  const allBugs = db.prepare(`
    SELECT id, title, state, assigned_to, customer_tag, created_at, updated_at, meta
    FROM ado_workitems
    WHERE type = 'Bug'
      AND state NOT IN ('Closed','Removed')
      AND created_at > ?
    ORDER BY created_at DESC
    LIMIT 100
  `).all(since);

  // 過濾內部工單（TEST / Public / RD / OP）
  const bugs = allBugs.filter(b => getTier(b.customer_tag) !== INTERNAL_TIER);

  if (!bugs.length) {
    return { text: '📋 *客戶工單全覽*\n  ✅ 目前所有客戶問題均已結案', urgent: [], actions: [] };
  }

  // 依客戶分組
  const byCustomer = {};
  bugs.forEach(b => {
    const c = extractCustomer(b.customer_tag, b.title);
    if (!byCustomer[c]) byCustomer[c] = [];
    byCustomer[c].push(b);
  });

  // 排序：S > A > B > C > ?，同等級按工單數倒序
  const sorted = Object.entries(byCustomer).sort((a, b) => {
    const ta = tierOrder(a[0]), tb = tierOrder(b[0]);
    if (ta !== tb) return ta - tb;
    return b[1].length - a[1].length;
  });

  const urgent  = [];  // 今日行動清單素材
  const lines   = [`📋 *客戶工單全覽（開放中 ${bugs.length} 筆）*`];

  sorted.forEach(([customer, items]) => {
    const tier      = getTier(customer);
    const tierLabel = TIER_LABEL[tier] || '？';
    const maxAge    = Math.max(...items.map(i => now - i.created_at));
    const stale     = items.filter(i => (now - i.updated_at) > 3 * 86400);

    // 客戶行
    const staleTag  = stale.length ? ` ⏰${stale.length}筆停滯` : '';
    lines.push(`\n  ${tierLabel} *${customer}*  ${items.length} 筆${staleTag}`);

    // 各工單明細（依優先度排序）
    const sorted2 = [...items].sort((a, b) => {
      const pa = (()=>{ try{ return JSON.parse(a.meta)?.priority ?? 9; }catch(e){ return 9; } })();
      const pb = (()=>{ try{ return JSON.parse(b.meta)?.priority ?? 9; }catch(e){ return 9; } })();
      return pa - pb;
    });

    sorted2.forEach(b => {
      const m      = parseMeta(b);
      const pNum   = m.priority ?? 9;
      const pLabel = pNum <= 4 ? `P${pNum - 1}` : '';
      const sl     = slaStatus(b, now);
      const ageStr = sl.ageH >= 24 ? `${Math.floor(sl.ageH/24)}天` : `${Math.round(sl.ageH)}h`;
      const assignee = b.assigned_to ? ` → ${b.assigned_to.split(' ')[0]}` : '';
      const title  = humanize(b.title).substring(0, 45);

      // 標籤組合
      let tags = '';
      if (sl.responseBreached) {
        tags += ` 🔴未接手逾${Math.round(sl.ageH)}h`;
      } else if (sl.staleBreached) {
        tags += ` ⏰${Math.floor(sl.stateAgeH/24)}天未推進`;
      }

      lines.push(`    ${STATE_ICON[b.state]||'⬜'} ${adoLink(b.id)} ${pLabel ? `\`${pLabel}\`` : ''} ${title}${assignee}（登打${ageStr}前）${tags}`);

      // 需要行動的加入清單
      if (sl.responseBreached || sl.staleBreached) {
        urgent.push({ customer, tier, id: b.id, title, priority: pNum, assignee: b.assigned_to,
          slaBreached: sl.responseBreached, staleH: sl.stateAgeH });
      }
    });
  });

  return { text: lines.join('\n'), urgent };
}

// ── SLA 判斷工具 ──────────────────────────────────────────────────────────────
// Response SLA：只針對 state=New 且沒有 activated_date（尚無人接手）
// Stale 判斷：state_change_date 超過閾值（接了但沒推進）
const STALE_HOURS = { 1: 4, 2: 8, 3: 24, 4: 72 }; // 每級「停滯」門檻（小時）

function parseMeta(b) {
  try { return JSON.parse(b.meta || '{}'); } catch(e) { return {}; }
}
function slaStatus(b, now) {
  const m = parseMeta(b);
  const p = m.priority ?? 3;
  const slaH = SLA_HOURS[p] ?? 8;
  const staleH = STALE_HOURS[p] ?? 24;
  const ageH = (now - b.created_at) / 3600;
  const activatedTs = m.activated_date ? Math.floor(new Date(m.activated_date).getTime()/1000) : null;
  const stateChangeTs = m.state_change_date ? Math.floor(new Date(m.state_change_date).getTime()/1000) : b.updated_at;
  const stateAgeH = (now - stateChangeTs) / 3600;

  // Response SLA breach：New 狀態 + 沒人接 + 超過 SLA 時限
  const responseBreached = b.state === 'New' && !activatedTs && ageH > slaH;

  // 停滯：接了之後超過停滯門檻沒有狀態推進
  const staleBreached = b.state !== 'New' && stateAgeH > staleH;

  return { p, slaH, staleH, ageH, stateAgeH, activatedTs, responseBreached, staleBreached };
}

// ── 工單健康快照 ──────────────────────────────────────────────────────────────
function getHealthSnapshot(bugs, totalClosed) {
  const now = Math.floor(Date.now() / 1000);
  const todayCutoff = now - 86400;
  const newToday = bugs.filter(b => b.created_at > todayCutoff).length;

  // 只算客戶工單（過濾內部）
  const customerBugs = bugs.filter(b => getTier(b.customer_tag) !== 'internal');
  const slaItems = customerBugs.filter(b => {
    const m = parseMeta(b);
    return m.priority >= 1 && m.priority <= 4;
  });

  // Response SLA：state=New 未接手
  const responseBreached = slaItems.filter(b => slaStatus(b, now).responseBreached);
  // 停滯：接了但沒推進
  const staleBreached = slaItems.filter(b => slaStatus(b, now).staleBreached);
  const responseRate = slaItems.length
    ? Math.round((1 - responseBreached.length / slaItems.length) * 100)
    : 100;
  const slaLight = responseRate >= 90 ? '🟢' : responseRate >= 70 ? '🟡' : '🔴';

  const lines = [
    `📊 *工單健康快照*`,
    `  開放中 *${customerBugs.length}* 筆（客戶）| 今日新增 ${newToday} 筆 | 今日結案 ${totalClosed} 筆`,
    `  回應 SLA 達標：${slaLight} *${responseRate}%*（${responseBreached.length} 筆未接手逾時）${staleBreached.length > 0 ? ` · ⏰ ${staleBreached.length} 筆停滯中` : ''}`,
  ];
  return lines.join('\n');
}

// ── 今日行動清單 ──────────────────────────────────────────────────────────────
function getActionList(urgent) {
  if (!urgent.length) return null;
  // 依等級 + 嚴重度排序
  const sorted = urgent.sort((a, b) => {
    const ta = ['S','A','B','C','?'].indexOf(a.tier);
    const tb = ['S','A','B','C','?'].indexOf(b.tier);
    if (ta !== tb) return ta - tb;
    return (a.priority ?? 9) - (b.priority ?? 9);
  });

  const lines = [`✅ *今日行動清單（${sorted.length} 項）*`];
  sorted.slice(0, 8).forEach((item, i) => {
    const tierLabel = TIER_LABEL[item.tier] || '';
    const reason = item.slaBreached ? '🔴 SLA 逾期' : '⏰ 工單停滯';
    const who = item.assignee ? `  跟催：${item.assignee.split(' ')[0]}` : '';
    lines.push(`  ${i + 1}. ${reason}｜${tierLabel} ${item.customer}  ${adoLink(item.id)}${who}`);
  });
  if (sorted.length > 8) lines.push(`  …等共 ${sorted.length} 項`);
  return lines.join('\n');
}

// ── 主程式 ────────────────────────────────────────────────────────────────────
async function main() {
  const preview = process.argv.includes('--preview');
  const { dateStr, dow, todayISO } = getTodayInfo();

  if (!preview) {
    console.log('v3: 增量同步 ADO...');
    try {
      execSync('node ' + path.join(__dirname, 'sync_ado.js'), { stdio: 'pipe', timeout: 60000 });
    } catch(e) { console.warn('ADO sync warn:', e.message.slice(0, 100)); }
    try {
      execSync('node ' + path.join(__dirname, 'sync_notion.js') + ' dbs', { stdio: 'pipe', timeout: 90000 });
    } catch(e) { console.warn('Notion sync warn:', e.message.slice(0, 100)); }
    console.log('v3: 同步 Slack 部署頻道...');
    try { await incrementalSyncSlack(DEPLOY_CHANNEL, 50); } catch(e) { console.warn(e.message); }
  }

  console.log('v3: 組裝報表...');

  // 取開放工單 + 今日結案數
  const since14 = Math.floor((Date.now() - 14 * 86400000) / 1000);
  const now     = Math.floor(Date.now() / 1000);
  const openBugs = db.prepare(`
    SELECT id, title, state, assigned_to, customer_tag, created_at, updated_at, meta
    FROM ado_workitems
    WHERE type='Bug' AND state NOT IN ('Closed','Removed') AND created_at > ?
  `).all(since14).filter(b => getTier(b.customer_tag) !== INTERNAL_TIER);

  const closedToday = db.prepare(`
    SELECT COUNT(*) as cnt FROM ado_workitems
    WHERE type='Bug' AND state='Closed' AND updated_at > ?
  `).get(now - 86400).cnt;

  // 各區塊
  const healthSnap              = getHealthSnapshot(openBugs, closedToday);
  const healthLights            = customerHealth.generate({ format: 'brief' }).text;
  const { text: bugSection, urgent } = getCustomerBugSection();
  const actionList              = getActionList(urgent);
  const taskSection             = adoTask.generate({ format: 'cs', dayRange: 14 });
  const deploySection           = getDeploySection();
  const arResult                = await arSection.generate({ format: 'csm' });
  const { text: salesText }     = await salesSection.generate({ format: 'csm' });

  const HR = '━'.repeat(42);
  const lines = [
    `👥 *LifeCOM 客成日報 — ${dateStr}（週${dow}）*`,
    '',
    '__AI_INSIGHT__',
    '',
    healthSnap,
    '',
    healthLights,
    '',
    HR,
    '',
    bugSection,
    '',
    HR,
    '',
    taskSection,
  ];

  if (deploySection) { lines.push(''); lines.push(HR); lines.push(''); lines.push(deploySection); }

  if (actionList) { lines.push(''); lines.push(HR); lines.push(''); lines.push(actionList); }

  // 報價追蹤 + 應收追蹤
  lines.push('');
  lines.push(HR);
  lines.push('');
  lines.push(salesText);
  lines.push('');
  lines.push(arResult.text);

  lines.push('');
  lines.push(HR);
  lines.push('_資料來源：lifecom.db | LifeCOM 客戶成功團隊_');

  const reportBody = lines.join('\n');

  const insight = buildInsightPlaceholder('csm', reportBody.replace('__AI_INSIGHT__', ''));
  const report = reportBody.replace('__AI_INSIGHT__', insight);
  console.log('\n' + report);

  if (preview) return;

  saveReport(report, `cs-report-${todayISO}.txt`);
  console.log('CS report saved. Agent will send after inserting insight.');
}

main().catch(console.error);
