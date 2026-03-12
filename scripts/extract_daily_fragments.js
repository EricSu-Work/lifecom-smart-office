/**
 * extract_daily_fragments.js — 收集指定日期的所有渠道碎片
 * 
 * C-04 通訊事件智慧層 L2 事件萃取的「資料準備」步驟
 * 
 * 用法：node extract_daily_fragments.js [YYYY-MM-DD]
 *       預設為今天
 * 
 * 輸出：JSON 格式，供 agentTurn cron 作為 prompt context
 * 不呼叫 AI API。
 */

const { line, slack, db } = require('./lifecom_db');
const fs = require('fs');
const path = require('path');

const targetDate = process.argv[2] || new Date().toISOString().split('T')[0];
const OUTPUT_DIR = path.join(__dirname, '../data');

function main() {
  const fragments = { date: targetDate, line: [], slack: [], stats: {} };

  // ─── LINE fragments ───────────────────────────────────────────
  const lineGroups = line.getAllGroups();
  const groupMap = {};
  for (const g of lineGroups) {
    groupMap[g.group_id] = g;
  }

  const lineMsgs = line.getByDate(targetDate);
  // Group by group_id
  const byGroup = {};
  for (const m of lineMsgs) {
    if (!byGroup[m.group_id]) byGroup[m.group_id] = [];
    byGroup[m.group_id].push(m);
  }

  for (const [groupId, msgs] of Object.entries(byGroup)) {
    const group = groupMap[groupId] || {};
    const textMsgs = msgs.filter(m => m.media_type === 'text' && m.content);
    if (textMsgs.length === 0) continue;

    fragments.line.push({
      group_id: groupId,
      group_name: group.group_name || '(unnamed)',
      customer_tag: group.customer_tag || null,
      msg_count: msgs.length,
      text_count: textMsgs.length,
      participants: [...new Set(msgs.map(m => m.sender_id))],
      messages: textMsgs.map(m => ({
        sender: m.sender_name || m.sender_id.substring(0, 12),
        time: new Date(m.ts).toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit' }),
        text: m.content.substring(0, 500),
      })),
    });
  }

  // ─── Slack fragments（內部溝通頻道）───────────────────────────
  const commChannels = [
    'C02P1TX3L8N', 'C02ECE2CLDS', 'C08PW86ST46', 'C08E8NJU2GP',
    'C02E37Q1CUD', 'C02DRGK3JHM', 'C02ED8VT0P6', 'C02EM2R2LJW',
    'C073ZDN93FE', 'C03JFHJ2Q8Y', 'C02FPLLG6R2',
    'C03TBQ5891V', 'C03FSJ3PQKD', 'C02EPMHFSD7', 'C05A8K75PA5',
  ];
  const channelNames = {
    'C02P1TX3L8N': 'lifecom-op', 'C02ECE2CLDS': 'general',
    'C08PW86ST46': 'announcement', 'C08E8NJU2GP': 'lifecom-op-discuss',
    'C02E37Q1CUD': 'lifecom-rd', 'C02DRGK3JHM': 'lifecom-rd-discuss',
    'C02ED8VT0P6': 'lifecom-csm', 'C02EM2R2LJW': 'loreal',
    'C073ZDN93FE': '優化維運', 'C03JFHJ2Q8Y': 'lifecom-report',
    'C02FPLLG6R2': 'lifecom-note',
    'C03TBQ5891V': 'production-alert', 'C03FSJ3PQKD': 'release',
    'C02EPMHFSD7': 'lifecom-maintenance', 'C05A8K75PA5': 'gcp-alert',
  };

  for (const chId of commChannels) {
    // Get today's messages using ts range
    const dayStart = new Date(targetDate + 'T00:00:00+08:00').getTime() / 1000;
    const dayEnd = dayStart + 86400;
    const msgs = db.prepare(
      `SELECT * FROM slack_messages WHERE channel_id=? AND CAST(ts AS REAL) >= ? AND CAST(ts AS REAL) < ? ORDER BY ts ASC`
    ).all(chId, String(dayStart), String(dayEnd));

    if (msgs.length === 0) continue;

    fragments.slack.push({
      channel_id: chId,
      channel_name: channelNames[chId] || chId,
      msg_count: msgs.length,
      messages: msgs.map(m => ({
        user: m.user_id,
        time: new Date(parseFloat(m.ts) * 1000).toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit' }),
        text: (m.text || '').substring(0, 500),
      })),
    });
  }

  // ─── Stats ────────────────────────────────────────────────────
  fragments.stats = {
    line_groups_active: fragments.line.length,
    line_total_msgs: lineMsgs.length,
    slack_channels_active: fragments.slack.length,
    slack_total_msgs: fragments.slack.reduce((sum, ch) => sum + ch.msg_count, 0),
  };

  // ─── Output ───────────────────────────────────────────────────
  const outputPath = path.join(OUTPUT_DIR, `fragments-${targetDate}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(fragments, null, 2), 'utf8');
  console.log(`[extract] ${targetDate}: LINE ${fragments.stats.line_total_msgs} msgs / ${fragments.stats.line_groups_active} groups, Slack ${fragments.stats.slack_total_msgs} msgs / ${fragments.stats.slack_channels_active} channels`);
  console.log(`[extract] saved to ${outputPath}`);

  // Also output summary to stdout for agentTurn
  console.log('\n=== FRAGMENTS SUMMARY ===');
  for (const lg of fragments.line) {
    console.log(`LINE | ${lg.group_name} (${lg.customer_tag || '?'}) | ${lg.msg_count} msgs | ${lg.participants.length} people`);
  }
  for (const sc of fragments.slack) {
    console.log(`Slack | #${sc.channel_name} | ${sc.msg_count} msgs`);
  }
}

main();
