'use strict';
/**
 * check_delivery_sla.js — D-00 SLA 斷報偵測（預檢腳本）
 *
 * 每 4 小時由 cron 呼叫。
 * 掃描 delivery_registry.json 的每個訂閱，
 * 檢查 delivery_log 最後成功送達時間是否超過 sla_hours。
 *
 * 週報監控邏輯：
 *   - 有 frequency:"weekly" + schedule_days 的訂閱
 *   - 只在排程日過了 schedule_time 之後才開始計算 SLA
 *   - 非排程日 / 排程日但還沒到 schedule_time → 跳過，不告警
 *   - 從最近一個排程時間點起算 SLA gap
 *
 * 輸出：
 *   - NO_BREACH  → 一切正常
 *   - JSON       → 有 SLA 違規，需要告警
 */

const { delivery } = require('./lifecom_db');
const { loadRegistry } = require('./delivery_engine');

/**
 * 取得最近一個排程時間點（用於週報 SLA 起算）
 * @param {number[]} scheduleDays - [1,5] = 週一、五
 * @param {string} scheduleTime - "08:00"
 * @param {Date} now
 * @returns {Date|null} 最近一個已過的排程時間點，null = 不在 SLA 窗口內
 */
function getLastScheduledTime(scheduleDays, scheduleTime, now) {
  const [hh, mm] = (scheduleTime || '08:00').split(':').map(Number);
  
  // 往回查 7 天，找最近一個排程日+時間已過的時間點
  for (let daysBack = 0; daysBack <= 7; daysBack++) {
    const candidate = new Date(now);
    candidate.setDate(candidate.getDate() - daysBack);
    candidate.setHours(hh, mm, 0, 0);
    
    const dayOfWeek = candidate.getDay(); // 0=Sun, 1=Mon, ...
    
    if (scheduleDays.includes(dayOfWeek) && candidate.getTime() <= now.getTime()) {
      return candidate;
    }
  }
  return null;
}

function checkSLA() {
  const registry = loadRegistry();
  const now = new Date();
  const nowMs = now.getTime();
  const breaches = [];

  for (const sub of registry.subscriptions) {
    if (!sub.enabled) continue;
    if (sub.sla_hours === null || sub.sla_hours === undefined) continue;

    // 週報特殊邏輯
    if (sub.frequency === 'weekly' && sub.schedule_days) {
      const lastScheduled = getLastScheduledTime(sub.schedule_days, sub.schedule_time, now);
      
      if (!lastScheduled) {
        // 不在任何排程窗口內，跳過
        continue;
      }
      
      const lastSent = delivery.lastSent(sub.id);
      const lastSentTime = lastSent?.last_sent ? new Date(lastSent.last_sent).getTime() : 0;
      
      // 如果上次送達在最近排程時間之後 → 本週期已送，OK
      if (lastSentTime >= lastScheduled.getTime()) {
        continue;
      }
      
      // 從排程時間起算 gap
      const gapMs = nowMs - lastScheduled.getTime();
      const gapHours = Math.round(gapMs / 3600000 * 10) / 10;
      
      if (gapHours > sub.sla_hours) {
        breaches.push({
          id: sub.id,
          name: sub.name,
          frequency: 'weekly',
          sla_hours: sub.sla_hours,
          scheduled_at: lastScheduled.toISOString(),
          last_sent: lastSent?.last_sent || null,
          gap_hours: gapHours,
          severity: gapHours > sub.sla_hours * 2 ? 'critical' : 'warning',
        });
      }
      continue;
    }

    // 日報 / 小時報 — 原有邏輯
    const lastSent = delivery.lastSent(sub.id);
    const lastSentTime = lastSent?.last_sent ? new Date(lastSent.last_sent).getTime() : 0;

    if (lastSentTime === 0) {
      breaches.push({
        id: sub.id,
        name: sub.name,
        sla_hours: sub.sla_hours,
        last_sent: null,
        gap_hours: null,
        severity: 'never_sent',
      });
    } else {
      const gapMs = nowMs - lastSentTime;
      const gapHours = Math.round(gapMs / 3600000 * 10) / 10;

      if (gapHours > sub.sla_hours) {
        breaches.push({
          id: sub.id,
          name: sub.name,
          sla_hours: sub.sla_hours,
          last_sent: lastSent.last_sent,
          gap_hours: gapHours,
          severity: gapHours > sub.sla_hours * 2 ? 'critical' : 'warning',
        });
      }
    }
  }

  return breaches;
}

if (require.main === module) {
  const breaches = checkSLA();
  if (breaches.length === 0) {
    console.log('NO_BREACH');
  } else {
    console.log(JSON.stringify(breaches, null, 2));
  }
}

module.exports = { checkSLA };
