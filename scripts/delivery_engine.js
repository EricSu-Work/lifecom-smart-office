'use strict';
/**
 * delivery_engine.js — D-00 統一投遞引擎
 *
 * 職責：
 *   1. 讀取 delivery_registry.json 取得訂閱清單
 *   2. 對每筆投遞做 dedup 檢查（同一報表+同一天+同一目標 只送一次）
 *   3. 透過 Slack API / gog CLI 發送
 *   4. 記錄結果到 delivery_log（lifecom.db）
 *
 * 使用方式：
 *   const { deliver, deliverReport } = require('./delivery_engine');
 *
 *   // 方式 A：指定訂閱 ID + 報告內容
 *   await deliverReport('ceo-daily', reportText, { date: '2026-03-09' });
 *
 *   // 方式 B：指定訂閱 ID + 報告檔案路徑
 *   await deliverReport('cto-daily', null, { date: '2026-03-09', filePath: 'data/cto-report-2026-03-09.txt' });
 *
 *   // 方式 C：底層 — 發送到指定 channel/target 並記錄
 *   await deliver({ subscriptionId, channel, target, text, date });
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { execSync } = require('child_process');
const { delivery } = require('./lifecom_db');

const WS = path.join(os.homedir(), '.openclaw/workspace');
const REGISTRY_PATH = path.join(WS, 'data/delivery_registry.json');

// ── Registry ──────────────────────────────────────────────────────────────────
function loadRegistry() {
  return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
}

function getSubscription(subId) {
  const reg = loadRegistry();
  return reg.subscriptions.find(s => s.id === subId);
}

// ── Slack 發送 ────────────────────────────────────────────────────────────────
let _slackToken = null;
function getSlackToken() {
  if (!_slackToken) {
    _slackToken = fs.readFileSync(path.join(os.homedir(), '.config/slack/user_token'), 'utf8').trim();
  }
  return _slackToken;
}

function slackPost(channel, text) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ channel, text });
    const req = https.request({
      hostname: 'slack.com', path: '/api/chat.postMessage', method: 'POST',
      headers: {
        Authorization: 'Bearer ' + getSlackToken(),
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
    });
    req.on('error', reject); req.write(body); req.end();
  });
}

// Slack file upload for long reports (>4000 chars)
function slackUploadFile(channels, content, filename, title) {
  return new Promise((resolve, reject) => {
    const boundary = '----FormBoundary' + Date.now();
    const parts = [];
    parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="channels"\r\n\r\n${channels}`);
    parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="content"\r\n\r\n${content}`);
    parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="filename"\r\n\r\n${filename}`);
    parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\n${title}`);
    parts.push(`--${boundary}--`);
    const payload = parts.join('\r\n');

    const req = https.request({
      hostname: 'slack.com', path: '/api/files.upload', method: 'POST',
      headers: {
        Authorization: 'Bearer ' + getSlackToken(),
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': Buffer.byteLength(payload),
      },
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
    });
    req.on('error', reject); req.write(payload); req.end();
  });
}

// ── Email 發送 ─────────────────────────────────────────────────────────────────
function sendEmail({ to, subject, bodyFile, account = 'eric@lifecom.com.tw', client }) {
  const toFlag = Array.isArray(to) ? to.join(',') : to;
  const clientFlag = client ? ` --client ${client}` : '';
  try {
    execSync(
      `gog gmail send --account "${account}"${clientFlag} --to "${toFlag}" --subject "${subject}" --body-file "${bodyFile}" --no-input`,
      { cwd: WS, stdio: 'pipe', timeout: 30000 }
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message.substring(0, 200) };
  }
}

// ── 取得今天日期 ──────────────────────────────────────────────────────────────
function todayISO() {
  // Asia/Taipei
  const now = new Date(Date.now() + 8 * 3600000);
  return now.toISOString().split('T')[0];
}

// ── 核心：單筆投遞（含 dedup + log）─────────────────────────────────────────
/**
 * @param {object} opts
 * @param {string} opts.subscriptionId  訂閱 ID
 * @param {string} opts.channel         'slack' | 'email'
 * @param {string} opts.target          Slack channel/DM ID 或 email 地址
 * @param {string} opts.text            報告文字（Slack 用）
 * @param {string} [opts.filePath]      報告檔案路徑（Email 用）
 * @param {string} [opts.date]          報表日期 YYYY-MM-DD
 * @param {boolean} [opts.skipDedup]    跳過去重
 * @returns {Promise<{ok: boolean, skipped?: boolean, error?: string}>}
 */
async function deliver(opts) {
  const { subscriptionId, channel, target, text, filePath, skipDedup = false } = opts;
  const date = opts.date || todayISO();

  // 1. Dedup check
  if (!skipDedup && delivery.isSent(subscriptionId, date, channel, target)) {
    console.log(`⏭️  Dedup skip: ${subscriptionId} → ${channel}:${target} (${date})`);
    return { ok: true, skipped: true };
  }

  // 2. 記錄 pending
  try {
    delivery.log.run({
      subscription_id: subscriptionId, report_date: date,
      channel, target, status: 'pending', sent_at: null, error: null,
      report_path: filePath || null,
    });
  } catch (e) {
    // UNIQUE constraint → already exists, might be a retry
  }

  // 3. 發送
  let result;
  if (channel === 'slack') {
    // 長報告用 file upload，短的用 message
    if (text && text.length > 3800) {
      const fn = `${subscriptionId}-${date}.txt`;
      result = await slackUploadFile(target, text, fn, getSubscription(subscriptionId)?.name || subscriptionId);
    } else if (text) {
      result = await slackPost(target, text);
    } else if (filePath) {
      const content = fs.readFileSync(filePath, 'utf8');
      if (content.length > 3800) {
        const fn = path.basename(filePath);
        result = await slackUploadFile(target, content, fn, getSubscription(subscriptionId)?.name || subscriptionId);
      } else {
        result = await slackPost(target, content);
      }
    } else {
      result = { ok: false, error: 'No text or filePath provided' };
    }
  } else if (channel === 'email') {
    const sub = getSubscription(subscriptionId);
    if (!filePath && text) {
      // 寫暫存檔
      const tmpPath = path.join(WS, 'data', `_tmp_email_${subscriptionId}_${date}.txt`);
      fs.writeFileSync(tmpPath, text, 'utf8');
      result = sendEmail({
        to: sub?.email?.to || [target],
        subject: `${sub?.email?.subject_prefix || subscriptionId} ${date}`,
        bodyFile: tmpPath,
        account: sub?.email?.account,
        client: sub?.email?.client,
      });
    } else if (filePath) {
      result = sendEmail({
        to: sub?.email?.to || [target],
        subject: `${sub?.email?.subject_prefix || subscriptionId} ${date}`,
        bodyFile: filePath,
        account: sub?.email?.account,
        client: sub?.email?.client,
      });
    } else {
      result = { ok: false, error: 'No content for email' };
    }
  } else {
    result = { ok: false, error: `Unknown channel: ${channel}` };
  }

  // 4. 更新 log
  const now = new Date().toISOString();
  delivery.updateStatus.run({
    subscription_id: subscriptionId, report_date: date,
    channel, target,
    status: result.ok ? 'sent' : 'failed',
    sent_at: result.ok ? now : null,
    error: result.ok ? null : (result.error || 'Unknown error'),
  });

  const icon = result.ok ? '✅' : '❌';
  console.log(`${icon} ${subscriptionId} → ${channel}:${target} (${date})`);
  return result;
}

// ── 高階：一次投遞整份報表（依 registry 走）────────────────────────────────────
/**
 * @param {string} subscriptionId  registry 裡的訂閱 ID
 * @param {string|null} reportText 報告文字（null 則從 filePath 讀）
 * @param {object} [opts]
 * @param {string} [opts.date]     報表日期
 * @param {string} [opts.filePath] 報告檔案路徑
 * @param {boolean} [opts.skipDedup] 跳過去重
 * @returns {Promise<{sent: number, skipped: number, failed: number, results: object[]}>}
 */
async function deliverReport(subscriptionId, reportText = null, opts = {}) {
  const sub = getSubscription(subscriptionId);
  if (!sub) throw new Error(`Subscription not found: ${subscriptionId}`);
  if (!sub.enabled) {
    console.log(`⏸️  Subscription disabled: ${subscriptionId}`);
    return { sent: 0, skipped: 0, failed: 0, results: [] };
  }

  const date = opts.date || todayISO();
  const filePath = opts.filePath || null;
  const results = [];
  let sent = 0, skipped = 0, failed = 0;

  // Slack recipients
  for (const r of (sub.recipients || [])) {
    const res = await deliver({
      subscriptionId, channel: 'slack', target: r.target,
      text: reportText, filePath, date, skipDedup: opts.skipDedup,
    });
    results.push({ ...res, channel: 'slack', target: r.target, label: r.label });
    if (res.skipped) skipped++;
    else if (res.ok) sent++;
    else failed++;
  }

  // Email
  if (sub.email && sub.email !== false) {
    const emailFilePath = filePath || (reportText ? null : null);
    const res = await deliver({
      subscriptionId, channel: 'email', target: (sub.email.to || []).join(','),
      text: reportText, filePath: emailFilePath, date, skipDedup: opts.skipDedup,
    });
    results.push({ ...res, channel: 'email', target: sub.email.to?.join(',') });
    if (res.skipped) skipped++;
    else if (res.ok) sent++;
    else failed++;
  }

  console.log(`📦 ${subscriptionId}: sent=${sent} skipped=${skipped} failed=${failed}`);
  return { sent, skipped, failed, results };
}

// ── CLI 測試 ──────────────────────────────────────────────────────────────────
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args[0] === 'status') {
    // 顯示今日投遞狀態
    const date = args[1] || todayISO();
    const rows = delivery.getByDate(date);
    if (!rows.length) {
      console.log(`📭 ${date}: 尚無投遞記錄`);
    } else {
      console.log(`📊 ${date} 投遞記錄（${rows.length} 筆）：`);
      rows.forEach(r => {
        const icon = r.status === 'sent' ? '✅' : r.status === 'failed' ? '❌' : '⏳';
        console.log(`  ${icon} ${r.subscription_id} → ${r.channel}:${r.target} [${r.status}] ${r.sent_at || r.error || ''}`);
      });
    }
  } else if (args[0] === 'test') {
    // deliver test
    console.log('Registry loaded:', loadRegistry().subscriptions.length, 'subscriptions');
    console.log('Today:', todayISO());
  } else {
    console.log('Usage: node delivery_engine.js [status [YYYY-MM-DD] | test]');
  }
}

module.exports = { deliver, deliverReport, loadRegistry, getSubscription, todayISO };
