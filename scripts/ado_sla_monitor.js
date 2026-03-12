/**
 * ado_sla_monitor.js — SLA 監控（從 lifecom.db 讀取）
 * SLA 規則：P0=即時(0h)、P1=2h、P2=8h、P3=2工作日(48h)
 * 觸發：逾期 Bug 自動發告警到 Slack
 * Usage: node ado_sla_monitor.js [--dry-run]
 */
const path = require('path');
const https = require('https');
const fs = require('fs');
const { db } = require('./lifecom_db');

const ALERT_CHANNEL = 'C02ECE2CLDS'; // #general 頻道
const ADO_BASE = 'https://dev.azure.com/LifeComTW/LifeCOM/_workitems/edit';
function adoLink(id) { return `<${ADO_BASE}/${id}|#${id}>`; }
const TOKEN_PATH = require('os').homedir() + '/.config/slack/user_token';

// SLA 上限（小時）
const SLA_HOURS = { 1: 0, 2: 2, 3: 8, 4: 48 };
// Severity label
const SEV_LABEL = { '1 - Critical':'P0', '2 - High':'P1', '3 - Medium':'P2', '4 - Low':'P3' };

function getSlaHours(priority, severity) {
  // priority 1→P0, 2→P1, 3→P2, 4→P3
  return SLA_HOURS[priority] ?? SLA_HOURS[3];
}

function slackPost(channel, text) {
  return new Promise((resolve, reject) => {
    const token = fs.readFileSync(TOKEN_PATH, 'utf8').trim();
    const body = JSON.stringify({ channel, text, mrkdwn: true });
    const req = https.request({
      hostname: 'slack.com', path: '/api/chat.postMessage', method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) },
    }, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve(JSON.parse(d))); });
    req.on('error', reject); req.write(body); req.end();
  });
}

function run({ dryRun = false } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const openStates = ['New', 'Active', 'Code Review', 'Pending'];

  // 取近14天未關閉 Bug
  const since = now - 14 * 86400;
  const bugs = db.prepare(`
    SELECT id, title, state, severity, assigned_to, customer_tag, created_at, updated_at, meta
    FROM ado_workitems
    WHERE type = 'Bug'
      AND state IN ('New','Active','Code Review','Pending')
      AND created_at > ?
    ORDER BY created_at ASC
  `).all(since);

  if (!bugs.length) return { breached: [], total: 0 };

  const breached = [];
  bugs.forEach(b => {
    let priority = 3;
    try { priority = JSON.parse(b.meta)?.priority ?? 3; } catch(e) {}
    const slaHours = getSlaHours(priority);
    const ageHours = (now - b.created_at) / 3600;

    if (ageHours > slaHours) {
      const ageH = Math.round(ageHours);
      const overH = Math.round(ageHours - slaHours);
      const customer = (b.customer_tag || '').split('\\').pop() || '通用';
      breached.push({
        id: b.id, title: b.title, state: b.state,
        assigned: b.assigned_to || '未指派',
        priority, slaHours, ageHours: ageH, overHours: overH,
        customer,
      });
    }
  });

  // 依 priority 排序
  breached.sort((a,b) => a.priority - b.priority || b.overHours - a.overHours);

  return { breached, total: bugs.length };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const { breached, total } = run();

  console.log(`檢查 ${total} 筆開放工單，發現 ${breached.length} 筆 SLA 逾期`);

  if (!breached.length) {
    console.log('✅ 所有工單 SLA 正常');
    return;
  }

  // 組告警訊息
  const p0p1 = breached.filter(b => b.priority <= 2);
  const others = breached.filter(b => b.priority > 2);

  const lines = [`⚠️ *SLA 逾期告警（共 ${breached.length} 筆）*`];

  if (p0p1.length) {
    lines.push(`🔴 *高優先度 P0/P1（${p0p1.length} 筆）：*`);
    p0p1.forEach(b => {
      const slaLabel = b.slaHours === 0 ? '即時' : `${b.slaHours}h`;
      lines.push(`  • ${adoLink(b.id)} P${b.priority-1} [${b.customer}] ${b.title.substring(0,50)}`);
      lines.push(`    → ${b.assigned} | SLA:${slaLabel} | 已逾 *${b.overHours}h* | 狀態:${b.state}`);
    });
  }

  if (others.length) {
    lines.push(`🟡 *P2/P3 逾期（${others.length} 筆）：*`);
    others.slice(0, 10).forEach(b => {
      lines.push(`  • ${adoLink(b.id)} P${b.priority-1} [${b.customer}] ${b.title.substring(0,40)} → ${b.assigned}（逾${b.overHours}h）`);
    });
    if (others.length > 10) lines.push(`  …等共 ${others.length} 筆`);
  }

  const text = lines.join('\n');
  console.log('\n' + text);

  if (!dryRun) {
    const r = await slackPost(ALERT_CHANNEL, text);
    console.log(r.ok ? `✅ 告警已發送 ts=${r.ts}` : `❌ 發送失敗: ${r.error}`);
  } else {
    console.log('\n[dry-run] 未實際發送');
  }
}

module.exports = { run };

if (require.main === module) {
  main().catch(console.error);
}
