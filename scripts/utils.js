'use strict';
/**
 * utils.js — 共用工具模組
 * 所有報表腳本統一 require 此模組，避免重複實作與版本分歧
 */

const fs      = require('fs');
const path    = require('path');
const os      = require('os');
const https   = require('https');
const { execSync } = require('child_process');

// ── 路徑常數 ──────────────────────────────────────────────────────────────────
const WS = path.join(os.homedir(), '.openclaw/workspace');

// ── Slack token（lazy load） ──────────────────────────────────────────────────
let _slackToken = null;
function getSlackToken() {
  if (!_slackToken) {
    _slackToken = fs.readFileSync(
      path.join(os.homedir(), '.config/slack/user_token'), 'utf8'
    ).trim();
  }
  return _slackToken;
}

// ── Slack：發送訊息 ───────────────────────────────────────────────────────────
/**
 * @param {string} channel  Slack channel / DM ID
 * @param {string} text     訊息內容
 * @returns {Promise<object>} Slack API 回應
 */
function slackPost(channel, text) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ channel, text });
    const token = getSlackToken();
    const req = https.request({
      hostname: 'slack.com',
      path: '/api/chat.postMessage',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * 批次發送到多個 channels，回傳成功/失敗摘要
 * @param {string[]} channels
 * @param {string} text
 * @param {string} [label] 顯示用標籤（如 '草稿'）
 */
async function slackPostAll(channels, text, label = '') {
  const tag = label ? `（${label}）` : '';
  for (const ch of channels) {
    const r = await slackPost(ch, text);
    if (r.ok) {
      console.log(`✅ Slack → ${ch}${tag}`);
    } else {
      console.error(`❌ Slack → ${ch}${tag}: ${r.error}`);
    }
  }
}

// ── Gmail：透過 gog CLI 發送 ──────────────────────────────────────────────────
/**
 * @param {object} opts
 * @param {string[]} opts.to        收件人列表
 * @param {string}   opts.subject   主旨
 * @param {string}   opts.bodyFile  報告檔案路徑
 * @param {string}   [opts.account] 寄件帳號（預設 eric@lifecom.com.tw）
 */
function sendEmail({ to, subject, bodyFile, account = 'eric@lifecom.com.tw' }) {
  const toFlag = to.join(',');
  try {
    execSync(
      `gog gmail send --account "${account}" --to "${toFlag}" --subject "${subject}" --body-file "${bodyFile}"`,
      { cwd: WS, stdio: 'inherit' }
    );
    console.log(`✅ Email → ${toFlag}`);
    return true;
  } catch (e) {
    console.error(`❌ Email failed: ${e.message.substring(0, 200)}`);
    return false;
  }
}

// ── 日期工具 ──────────────────────────────────────────────────────────────────
const DOW_ZH = ['日', '一', '二', '三', '四', '五', '六'];

/**
 * 取得今日日期字串與星期
 * @returns {{ dateStr: string, dow: string, todayISO: string }}
 */
function getTodayInfo() {
  const today = new Date();
  const dateStr = today.toLocaleDateString('zh-TW', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const dow = DOW_ZH[today.getDay()];
  const todayISO = today.toISOString().split('T')[0];
  return { today, dateStr, dow, todayISO };
}

// ── 報告輸出 ──────────────────────────────────────────────────────────────────
/**
 * 寫出報告檔
 * @param {string} content
 * @param {string} filename  相對於 workspace/data/
 * @returns {string} 完整路徑
 */
function saveReport(content, filename) {
  const outPath = path.join(WS, 'data', filename);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, content, 'utf8');
  console.log(`💾 Saved: ${outPath}`);
  return outPath;
}

// ── Slack：讀取頻道訊息 ──────────────────────────────────────────────────────
function slackGet(apiPath) {
  return new Promise((resolve, reject) => {
    const token = getSlackToken();
    const req = https.request({
      hostname: 'slack.com',
      path: apiPath,
      method: 'GET',
      headers: { Authorization: 'Bearer ' + token }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    req.end();
  });
}

module.exports = {
  WS,
  getSlackToken,
  slackPost,
  slackPostAll,
  slackGet,
  sendEmail,
  getTodayInfo,
  saveReport,
};
