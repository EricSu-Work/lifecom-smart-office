'use strict';
/**
 * bitbucket_client.js — Bitbucket Cloud API 工具模組
 * 
 * 提供：repo 列表、commit 歷史、PR 查詢、diff 摘要、branch 資訊
 * 認證：~/.config/bitbucket/{username, token}（Atlassian API token + Basic Auth）
 * 
 * 用法：
 *   const bb = require('./bitbucket_client');
 *   const commits = await bb.getCommits('newblackdog', { limit: 20 });
 *   const prs = await bb.getPullRequests('newblackdog', { state: 'OPEN' });
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');

// ── 認證（OAuth Bearer，自動從 git credential manager 刷新）────────────────
const { execSync } = require('child_process');

const WORKSPACE = 'systemLifecom';
const BASE = 'api.bitbucket.org';
const TOKEN_FILE = path.join(os.homedir(), '.config', 'bitbucket', 'token');
const REPO_DIR = path.join(os.homedir(), 'dev', 'newblackdog');
const TOKEN_TTL = 3600000; // 1 hour

let _cachedToken = null;
let _cachedTokenTs = 0;

function getOAuthToken() {
  // 1. In-memory cache
  if (_cachedToken && (Date.now() - _cachedTokenTs < TOKEN_TTL)) return _cachedToken;

  // 2. File cache (JSON: {token, ts})
  try {
    const raw = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
    // Handle both JSON and plain text format
    if (raw.startsWith('{')) {
      const cached = JSON.parse(raw);
      if (cached.token && cached.ts && (Date.now() - cached.ts < TOKEN_TTL)) {
        _cachedToken = cached.token;
        _cachedTokenTs = cached.ts;
        return _cachedToken;
      }
    }
  } catch (e) { /* no cache */ }

  // 3. Refresh via git credential manager
  try {
    const tmpIn = path.join(os.tmpdir(), '_bb_cred_in.txt');
    const tmpOut = path.join(os.tmpdir(), '_bb_cred_out.txt');
    fs.writeFileSync(tmpIn, 'protocol=https\nhost=bitbucket.org\n\n');
    execSync(`cmd /c "git -C "${REPO_DIR}" credential fill < "${tmpIn}" > "${tmpOut}""`, { timeout: 10000 });
    const out = fs.readFileSync(tmpOut, 'utf8');
    const match = out.match(/password=(.+)/);
    if (match) {
      const token = match[1].trim();
      _cachedToken = token;
      _cachedTokenTs = Date.now();
      fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true });
      fs.writeFileSync(TOKEN_FILE, JSON.stringify({ token, ts: _cachedTokenTs }));
      return token;
    }
  } catch (e) { /* fallback below */ }

  throw new Error('Failed to get Bitbucket OAuth token. Ensure git credentials are configured.');
}

// ── HTTP 請求 ───────────────────────────────────────────────────────────────
function request(urlPath, method = 'GET') {
  const token = getOAuthToken();
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: BASE,
      path: urlPath,
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'User-Agent': 'LifeCOM-AI-Ops/1.0',
      },
    };
    const req = https.request(opts, (res) => {
      let body = '';
      res.on('data', (d) => body += d);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`Bitbucket API ${res.statusCode}: ${body.slice(0, 500)}`));
          return;
        }
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error(`JSON parse error: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

/** 自動分頁：收集所有結果（上限 maxPages） */
async function paginate(urlPath, maxPages = 10) {
  const all = [];
  let nextUrl = urlPath;
  for (let i = 0; i < maxPages && nextUrl; i++) {
    const data = await request(nextUrl);
    if (data.values) all.push(...data.values);
    nextUrl = data.next
      ? data.next.replace(`https://${BASE}`, '')
      : null;
  }
  return all;
}

// ── Repos ───────────────────────────────────────────────────────────────────
/** 列出 workspace 所有 repo */
async function listRepos() {
  return paginate(`/2.0/repositories/${WORKSPACE}?pagelen=50`);
}

// ── Commits ─────────────────────────────────────────────────────────────────
/**
 * 取得 commit 歷史
 * @param {string} repo  repo slug (e.g. 'newblackdog')
 * @param {object} opts  { branch, limit, since (ISO date string) }
 */
async function getCommits(repo, opts = {}) {
  const params = new URLSearchParams();
  if (opts.branch) params.set('include', opts.branch);
  if (opts.limit) params.set('pagelen', String(Math.min(opts.limit, 50)));
  const qs = params.toString();
  const url = `/2.0/repositories/${WORKSPACE}/${repo}/commits${qs ? '?' + qs : ''}`;
  const data = await request(url);
  let commits = data.values || [];

  // 按 since 過濾
  if (opts.since) {
    const sinceDate = new Date(opts.since);
    commits = commits.filter(c => new Date(c.date) >= sinceDate);
  }
  return commits;
}

/** 取得單一 commit 的 diff stat */
async function getCommitDiffStat(repo, hash) {
  return request(`/2.0/repositories/${WORKSPACE}/${repo}/diffstat/${hash}`);
}

// ── Pull Requests ───────────────────────────────────────────────────────────
/**
 * 取得 PR 列表
 * @param {string} repo
 * @param {object} opts  { state: 'OPEN'|'MERGED'|'DECLINED'|'SUPERSEDED', limit }
 */
async function getPullRequests(repo, opts = {}) {
  const state = opts.state || 'OPEN';
  const limit = opts.limit || 25;
  const url = `/2.0/repositories/${WORKSPACE}/${repo}/pullrequests?state=${state}&pagelen=${Math.min(limit, 50)}`;
  const data = await request(url);
  return data.values || [];
}

/** 取得單一 PR 詳情 */
async function getPullRequest(repo, prId) {
  return request(`/2.0/repositories/${WORKSPACE}/${repo}/pullrequests/${prId}`);
}

/** 取得 PR 的 diff stat（檔案變更摘要） */
async function getPRDiffStat(repo, prId) {
  return paginate(`/2.0/repositories/${WORKSPACE}/${repo}/pullrequests/${prId}/diffstat?pagelen=100`, 5);
}

/** 取得 PR 的 commits */
async function getPRCommits(repo, prId) {
  return paginate(`/2.0/repositories/${WORKSPACE}/${repo}/pullrequests/${prId}/commits?pagelen=50`, 3);
}

// ── Branches ────────────────────────────────────────────────────────────────
async function getBranches(repo) {
  return paginate(`/2.0/repositories/${WORKSPACE}/${repo}/refs/branches?pagelen=50`, 5);
}

// ── Source (檔案瀏覽) ───────────────────────────────────────────────────────
/**
 * 取得 repo 目錄或檔案內容
 * @param {string} repo
 * @param {string} filePath  e.g. '' (root), 'app/routes'
 * @param {string} ref  branch/tag/commit (default: master)
 */
async function getSource(repo, filePath = '', ref = 'master') {
  const encoded = encodeURIComponent(filePath).replace(/%2F/g, '/');
  return request(`/2.0/repositories/${WORKSPACE}/${repo}/src/${ref}/${encoded}`);
}

// ── Webhooks ────────────────────────────────────────────────────────────────
async function listWebhooks(repo) {
  return paginate(`/2.0/repositories/${WORKSPACE}/${repo}/hooks?pagelen=50`);
}

// ── 便利函數 ────────────────────────────────────────────────────────────────

/** 取得某 repo 今日的 commit 活動摘要 */
async function getDailyActivity(repo, dateStr) {
  const date = dateStr || new Date().toISOString().slice(0, 10);
  const commits = await getCommits(repo, { limit: 50, since: `${date}T00:00:00+08:00` });

  // 按作者分組
  const byAuthor = {};
  for (const c of commits) {
    const author = c.author?.user?.display_name || c.author?.raw?.split('<')[0]?.trim() || 'unknown';
    if (!byAuthor[author]) byAuthor[author] = [];
    byAuthor[author].push({
      hash: c.hash?.slice(0, 7),
      message: c.message?.split('\n')[0]?.slice(0, 80),
      date: c.date,
    });
  }

  return {
    repo,
    date,
    totalCommits: commits.length,
    byAuthor,
  };
}

/**
 * 取得 open PR 摘要
 * @param {string[]} repoSlugs  指定 repo slug 列表（預設掃全部）
 */
async function getAllOpenPRs(repoSlugs) {
  const repos = repoSlugs
    ? repoSlugs.map(slug => ({ slug }))
    : await listRepos();
  const results = [];
  for (const r of repos) {
    const prs = await getPullRequests(r.slug, { state: 'OPEN', limit: 10 });
    for (const pr of prs) {
      const age = Math.floor((Date.now() - new Date(pr.created_on)) / 86400000);
      results.push({
        repo: r.slug,
        id: pr.id,
        title: pr.title,
        author: pr.author?.display_name,
        state: pr.state,
        createdOn: pr.created_on,
        updatedOn: pr.updated_on,
        ageDays: age,
        source: pr.source?.branch?.name,
        destination: pr.destination?.branch?.name,
        commentCount: pr.comment_count || 0,
        taskCount: pr.task_count || 0,
        link: pr.links?.html?.href,
      });
    }
  }
  return results.sort((a, b) => b.ageDays - a.ageDays);
}

/** 所有 repo 的每日活動摘要 */
async function getAllDailyActivity(dateStr) {
  const repos = await listRepos();
  const results = [];
  for (const r of repos) {
    try {
      const activity = await getDailyActivity(r.slug, dateStr);
      if (activity.totalCommits > 0) results.push(activity);
    } catch (e) {
      // 跳過失敗的 repo（可能沒有 commit）
    }
  }
  return results;
}

// ── CLI ─────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const cmd = process.argv[2];
  const repo = process.argv[3];

  const commands = {
    repos: () => listRepos().then(r => r.map(x => ({
      name: x.name, slug: x.slug, updated: x.updated_on?.slice(0, 10), size: `${Math.round(x.size / 1048576)}MB`
    }))),
    commits: () => getCommits(repo, { limit: 10 }),
    prs: () => getPullRequests(repo, { state: process.argv[4] || 'OPEN' }),
    'open-prs': () => getAllOpenPRs(),
    branches: () => getBranches(repo),
    activity: () => getDailyActivity(repo, process.argv[4]),
    'all-activity': () => getAllDailyActivity(process.argv[3]),
    webhooks: () => listWebhooks(repo),
  };

  if (!commands[cmd]) {
    console.log('Usage: node bitbucket_client.js <command> [repo] [arg]');
    console.log('Commands:', Object.keys(commands).join(', '));
    process.exit(1);
  }

  commands[cmd]()
    .then(r => console.log(JSON.stringify(r, null, 2)))
    .catch(e => { console.error('ERROR:', e.message); process.exit(1); });
}

// ── Exports ─────────────────────────────────────────────────────────────────
module.exports = {
  WORKSPACE,
  request,
  paginate,
  listRepos,
  getCommits,
  getCommitDiffStat,
  getPullRequests,
  getPullRequest,
  getPRDiffStat,
  getPRCommits,
  getBranches,
  getSource,
  listWebhooks,
  getDailyActivity,
  getAllOpenPRs,
  getAllDailyActivity,
};
