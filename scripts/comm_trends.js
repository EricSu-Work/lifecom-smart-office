/**
 * comm_trends.js — C-04 跨頻道週趨勢分析
 * 
 * 提供：
 * 1. 週對週問題趨勢（升/降/新增客戶）
 * 2. 跨頻道關聯（同客戶 LINE+Slack 同時出現）
 * 3. 承諾追蹤狀態
 */
'use strict';
const { db } = require('./lifecom_db');

/**
 * 取得指定天數的週趨勢分析
 */
function weeklyTrend({ weeks = 4 } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const results = [];

  for (let w = 0; w < weeks; w++) {
    const start = now - (w + 1) * 7 * 86400;
    const end = now - w * 7 * 86400;
    const weekLabel = w === 0 ? '本週' : w === 1 ? '上週' : `${w + 1} 週前`;

    const rows = db.prepare(`
      SELECT customer_tag, category, count(*) as c 
      FROM events 
      WHERE extracted_at >= ? AND extracted_at < ? AND customer_tag IS NOT NULL
      GROUP BY customer_tag, category
    `).all(start, end);

    const custMap = {};
    let total = 0;
    rows.forEach(r => {
      if (!custMap[r.customer_tag]) custMap[r.customer_tag] = { issues: 0, total: 0 };
      if (r.category === 'issue') custMap[r.customer_tag].issues = r.c;
      custMap[r.customer_tag].total += r.c;
      total += r.c;
    });

    results.push({ weekLabel, total, customers: custMap });
  }

  return results;
}

/**
 * 跨頻道客戶關聯
 */
function crossChannelCorrelation({ days = 7 } = {}) {
  const since = Math.floor(Date.now() / 1000) - days * 86400;

  const rows = db.prepare(`
    SELECT customer_tag, source, count(*) as c
    FROM events
    WHERE extracted_at >= ? AND customer_tag IS NOT NULL
    GROUP BY customer_tag, source
  `).all(since);

  const custSrc = {};
  rows.forEach(r => {
    if (!custSrc[r.customer_tag]) custSrc[r.customer_tag] = {};
    custSrc[r.customer_tag][r.source] = r.c;
  });

  // 有跨頻道的客戶
  const multiChannel = Object.entries(custSrc)
    .filter(([_, src]) => Object.keys(src).length > 1)
    .map(([name, src]) => ({ name, sources: src }));

  return multiChannel;
}

/**
 * 承諾追蹤：找出逾期/即將到期的承諾
 */
function commitmentStatus() {
  const now = Math.floor(Date.now() / 1000);
  const all = db.prepare(
    "SELECT * FROM events WHERE category='commitment' ORDER BY date DESC"
  ).all();

  const open = all.filter(e => e.status === 'open');
  const resolved = all.filter(e => e.status === 'resolved');

  // 逾期判斷：開放超過 3 天且無 due_date，或超過 due_date
  const stale = open.filter(e => {
    const eventDate = new Date(e.date).getTime() / 1000;
    if (e.due_date) {
      return now > new Date(e.due_date).getTime() / 1000;
    }
    return (now - eventDate) > 3 * 86400;
  });

  return { total: all.length, open: open.length, resolved: resolved.length, stale, openItems: open };
}

/**
 * 產出週報文字
 */
function generateWeeklyReport() {
  const trends = weeklyTrend({ weeks: 2 });
  const crossCh = crossChannelCorrelation();
  const commits = commitmentStatus();

  const lines = ['📊 *C-04 通訊週報*', ''];

  // 趨勢
  if (trends.length >= 2) {
    const [thisW, lastW] = trends;
    const delta = thisW.total - lastW.total;
    const pct = lastW.total > 0 ? ((delta / lastW.total) * 100).toFixed(0) : 'N/A';
    lines.push(`*📈 週趨勢*`);
    lines.push(`本週 ${thisW.total} 事件 vs 上週 ${lastW.total}（${delta >= 0 ? '▲ +' : '▼ '}${pct}%）`);

    // 新增的客戶（上週沒有，本週出現）
    const lastCusts = new Set(Object.keys(lastW.customers));
    const newCusts = Object.keys(thisW.customers).filter(c => !lastCusts.has(c));
    if (newCusts.length) {
      lines.push(`新增客戶：${newCusts.join('、')}`);
    }

    // 惡化的客戶（issue 增幅 > 50%）
    const worsening = [];
    Object.entries(thisW.customers).forEach(([name, data]) => {
      const prev = lastW.customers[name]?.issues || 0;
      if (prev > 0 && data.issues > prev * 1.5) {
        worsening.push(`${name}（${prev} → ${data.issues}）`);
      }
    });
    if (worsening.length) {
      lines.push(`⚠️ 惡化中：${worsening.join('、')}`);
    }
    lines.push('');
  }

  // 跨頻道
  if (crossCh.length) {
    lines.push('*🔗 跨頻道客戶*（LINE + Slack 同時出現）');
    crossCh.forEach(c => {
      const parts = Object.entries(c.sources).map(([s, n]) => `${s} ${n}`);
      lines.push(`  • ${c.name}：${parts.join(' + ')}`);
    });
    lines.push('');
  }

  // 承諾
  lines.push(`*🤝 承諾追蹤*`);
  lines.push(`開放 ${commits.open} | 已結 ${commits.resolved} | 逾期 ${commits.stale.length}`);
  if (commits.stale.length) {
    commits.stale.forEach(c => {
      const age = Math.floor((Date.now() / 1000 - new Date(c.date).getTime() / 1000) / 86400);
      lines.push(`  ⚠️ ${c.customer_tag}：${c.action.substring(0, 50)}（${age} 天前）`);
    });
  }

  return lines.join('\n');
}

module.exports = { weeklyTrend, crossChannelCorrelation, commitmentStatus, generateWeeklyReport };
