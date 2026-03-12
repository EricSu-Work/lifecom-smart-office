'use strict';
/**
 * delivery_log_hook.js — Phase A: 被動記錄投遞結果
 *
 * Migration Phase A：不改現有發送邏輯，只在發送成功後記錄到 delivery_log。
 * 現有 cron agent 在 message tool 發送成功後，呼叫此 hook 記錄。
 *
 * 用法（在 cron agentTurn prompt 末尾加一行）：
 *   node scripts/delivery_log_hook.js <subscription_id> <channel> <target> [status] [date]
 *
 * 範例：
 *   node scripts/delivery_log_hook.js ceo-daily slack D0ABWLGLGHY sent
 *   node scripts/delivery_log_hook.js cto-daily email eric@lifecom.com.tw,willy@licodes.net sent
 *   node scripts/delivery_log_hook.js ceo-daily slack D0ABWLGLGHY failed 2026-03-09
 */

const { delivery } = require('./lifecom_db');
const { todayISO } = require('./delivery_engine');

const [subId, channel, target, status = 'sent', date] = process.argv.slice(2);

if (!subId || !channel || !target) {
  console.log('Usage: node delivery_log_hook.js <sub_id> <channel> <target> [sent|failed] [YYYY-MM-DD]');
  process.exit(1);
}

const reportDate = date || todayISO();

try {
  delivery.log.run({
    subscription_id: subId,
    report_date: reportDate,
    channel,
    target,
    status,
    sent_at: status === 'sent' ? new Date().toISOString() : null,
    error: status === 'failed' ? 'reported via hook' : null,
    report_path: null,
  });
  console.log(`📝 logged: ${subId} → ${channel}:${target} [${status}] (${reportDate})`);
} catch (e) {
  // UNIQUE constraint = already logged, fine
  if (e.message.includes('UNIQUE')) {
    console.log(`⏭️  already logged: ${subId} (${reportDate})`);
  } else {
    console.error('Log error:', e.message);
    process.exit(1);
  }
}
