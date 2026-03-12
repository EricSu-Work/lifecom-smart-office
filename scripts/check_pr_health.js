'use strict';
/**
 * check_pr_health.js — PR 健康檢查（預檢腳本）
 *
 * 掃描所有活躍 repo 的 open PR，偵測：
 *   1. 殭屍 PR（>30 天）
 *   2. 新增殭屍 PR（上次檢查時還不是殭屍）
 *   3. PR 數量異常（>15 筆 open）
 *
 * 有問題 → 輸出 JSON（供 agentTurn 發送告警）
 * 無問題 → 輸出 "NO_ISSUE"
 */
const fs = require('fs');
const path = require('path');
const bb = require('./bitbucket_client');

const CURSOR_FILE = path.join(__dirname, '..', 'data', 'pr-health-cursor.json');
const ACTIVE_REPOS = ['newblackdog', 'newblackdog_loreal', 'nativedog'];

const ZOMBIE_DAYS = 30;
const WARN_COUNT = 15;

async function main() {
  // 讀取上次已知的殭屍 PR
  let lastZombies = new Set();
  try {
    const cursor = JSON.parse(fs.readFileSync(CURSOR_FILE, 'utf8'));
    lastZombies = new Set(cursor.zombieIds || []);
  } catch (e) { /* first run */ }

  const activePRs = await bb.getAllOpenPRs(ACTIVE_REPOS);

  const zombies = activePRs.filter(pr => pr.ageDays > ZOMBIE_DAYS);
  const newZombies = zombies.filter(pr => !lastZombies.has(`${pr.repo}/${pr.id}`));
  const aging = activePRs.filter(pr => pr.ageDays >= 7 && pr.ageDays <= ZOMBIE_DAYS);

  // 更新 cursor
  const currentZombieIds = zombies.map(pr => `${pr.repo}/${pr.id}`);
  fs.writeFileSync(CURSOR_FILE, JSON.stringify({
    lastCheck: new Date().toISOString(),
    zombieIds: currentZombieIds,
    totalOpen: activePRs.length,
    zombieCount: zombies.length,
  }, null, 2));

  // 判斷是否有需要告警的事
  const issues = [];

  if (newZombies.length > 0) {
    issues.push({
      type: 'new_zombie',
      message: `${newZombies.length} 筆 PR 剛進入殭屍狀態（>30天）`,
      prs: newZombies.map(pr => ({
        repo: pr.repo, id: pr.id, title: pr.title,
        author: pr.author, ageDays: pr.ageDays, link: pr.link,
      })),
    });
  }

  if (activePRs.length > WARN_COUNT) {
    issues.push({
      type: 'high_count',
      message: `Open PR 數量偏高：${activePRs.length} 筆（閾值 ${WARN_COUNT}）`,
      breakdown: ACTIVE_REPOS.map(r => ({
        repo: r,
        count: activePRs.filter(pr => pr.repo === r).length,
      })).filter(x => x.count > 0),
    });
  }

  // PR cycle time（最近 merged PR 的平均天數）
  // 暫時先不算，留給下一版

  if (!issues.length) {
    console.log('NO_ISSUE');
    process.exit(0);
  }

  console.log(JSON.stringify({
    checkTime: new Date().toISOString(),
    totalOpen: activePRs.length,
    zombieCount: zombies.length,
    agingCount: aging.length,
    issues,
    summary: {
      zombies: zombies.map(pr => ({
        repo: pr.repo, id: pr.id, title: pr.title.substring(0, 50),
        author: pr.author, ageDays: pr.ageDays, link: pr.link,
      })),
      aging: aging.map(pr => ({
        repo: pr.repo, id: pr.id, title: pr.title.substring(0, 50),
        author: pr.author, ageDays: pr.ageDays, link: pr.link,
      })),
    },
  }, null, 2));
}

main().catch(e => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
