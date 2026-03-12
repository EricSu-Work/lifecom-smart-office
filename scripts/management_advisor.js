'use strict';
/**
 * management_advisor.js — AI 管理顧問模塊
 *
 * ⚠️ 重要設計規範（請勿違反）：
 *
 * 1. 【計費】Eric 使用 Claude Max Plan，不含 API 額度。
 *    絕對不可在 Node.js script 裡直接呼叫 Anthropic API（auth.json 的 key 是 API key，用一次收一次費）。
 *
 * 2. 【架構】generate_*.js 腳本只負責「存檔」，不負責「發送」。
 *    - Script：收資料 → 組報告（含 placeholder）→ saveReport() 存檔，結束
 *    - Agent：執行 script → 讀檔 → 填入洞察（替換 placeholder）→ 用 message tool 發送
 *    - 禁止在 script 裡呼叫 slackPostAll() 或 sendEmail()，否則 placeholder 會外露給用戶
 *
 * 3. 【AI 洞察】由 OpenClaw cron agentTurn 本身（Claude）在 agent 執行時生成，零額外費用。
 *
 * 設計模式：
 *   Node.js script 在報告中插入 placeholder：
 *     %%INSIGHT_PLACEHOLDER%%
 *     reportType: ceo
 *     context: <摘要>
 *     %%END_PLACEHOLDER%%
 *
 *   cron agentTurn prompt 偵測到 placeholder → 生成洞察 → 替換 → 發送最終報告
 *
 * 用法（在 generate_*.js 裡）：
 *   const { buildInsightPlaceholder } = require('./management_advisor');
 *   const placeholder = buildInsightPlaceholder('ceo', summaryContext);
 *   // 插到報告頂端，cron agent 會替換成真實洞察並發送
 */

/**
 * 各報告的洞察角度說明（給 agent 看的 system prompt 片段）
 */
const ROLE_FOCUS = {
  ceo:  '角度：客戶風險、營收影響、跨部門瓶頸、決策優先序。',
  cto:  '角度：Bug 趨勢、SLA 達成率、工程師負載、技術債風險。',
  csm:  '角度：高風險客戶、工單積壓、流失信號、客戶健康度趨勢。',
  it:   '角度：系統穩定性、重複告警模式、基礎設施風險。',
  kpi:  '角度：達標/落後指標、工程師績效分佈、本週關鍵異動。',
  coo:  '角度：客服 SLA 達成率、OP 任務進度、系統異常對客服影響、代運營交付品質。',
};

const OUTPUT_FORMAT = `請用繁體中文，輸出以下固定格式：

🧠 *管理洞察*
───────────────────────────────
📌 本週最需關注：[1句話]
💡 建議行動：[1-2個具體行動，每項一行]
📈 趨勢判斷：[↑好轉 / ↓惡化 / →持平，一句話]
───────────────────────────────`;

/**
 * 建立 placeholder 字串，插入報告中
 * cron agentTurn 看到此 placeholder 後會填入真實洞察
 *
 * @param {string} reportType - 'ceo' | 'cto' | 'csm' | 'it' | 'kpi'
 * @param {string} summaryContext - 報告摘要（純文字，100-300字即可）
 * @returns {string}
 */
function buildInsightPlaceholder(reportType, summaryContext) {
  const focus = ROLE_FOCUS[reportType] || ROLE_FOCUS.ceo;
  return [
    '%%INSIGHT_PLACEHOLDER%%',
    `reportType: ${reportType}`,
    `focus: ${focus}`,
    `format: ${OUTPUT_FORMAT}`,
    `context:`,
    summaryContext.substring(0, 500),
    '%%END_PLACEHOLDER%%',
  ].join('\n');
}

/**
 * 從報告文字中提取 placeholder 的 prompt 資訊
 * 供 cron agent 使用
 */
function extractInsightPrompt(reportText) {
  const match = reportText.match(/%%INSIGHT_PLACEHOLDER%%([\s\S]*?)%%END_PLACEHOLDER%%/);
  if (!match) return null;
  return match[1].trim();
}

module.exports = { buildInsightPlaceholder, extractInsightPrompt, ROLE_FOCUS, OUTPUT_FORMAT };
