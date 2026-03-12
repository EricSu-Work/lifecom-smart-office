/**
 * ado_client.js — 可重用的 Azure DevOps 工具模組
 * 提供：State 權重、工單查詢、進度計算、燈號判斷
 */
const fs = require('fs');
const https = require('https');
const path = require('path');

const PAT = fs.readFileSync(path.join(process.env.USERPROFILE, '.config/azure-devops/pat'), 'utf8').trim();
const TOKEN = Buffer.from(`:${PAT}`).toString('base64');
const ORG = 'LifeComTW';
const PROJECT = 'LifeCOM';

// ── State 進度權重 ──────────────────────────────────────────────────────────
const STATE_WEIGHT = {
  'New':          0,
  'Pending':     20,
  'Active':      50,
  'Code Review': 80,
  'Resolved':    90,
  'Closed':     100,
  'Removed':   null,   // 不計入分母
};

// State → 中文標籤
const STATE_LABEL = {
  'New':          '未開始',
  'Pending':      '等待中',
  'Active':       '進行中',
  'Code Review':  '審查中',
  'Resolved':     '已解決',
  'Closed':       '已完成',
  'Removed':      '已取消',
};

// 燈號判斷（用於單一工單或整體 Epic 進度）
// @param weightedRate  0–100 加權完成率
// @param daysSinceChange  距上次更新天數
// @param state  若為單一工單可直接傳 state 覆蓋
function getLight(weightedRate, daysSinceChange, state) {
  if (state && STATE_WEIGHT[state] === 100) return '🟢'; // Closed
  if (state && STATE_WEIGHT[state] === null) return '⚫'; // Removed
  if (weightedRate >= 90) return '🟢';
  if (daysSinceChange > 30 && weightedRate === 0) return '⚫';  // 停滯
  if (daysSinceChange > 14 || weightedRate < 30) return '🔴';
  if (daysSinceChange > 7  || weightedRate < 60) return '🟡';
  return '🟢';
}

const LIGHT_LABEL = { '🟢': '正常', '🟡': '注意', '🔴': '警示', '⚫': '停滯' };

// ── HTTP 工具 ───────────────────────────────────────────────────────────────
function adoRequest(urlPath) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: 'dev.azure.com', path: urlPath, method: 'GET',
        headers: { Authorization: `Basic ${TOKEN}`, 'Content-Type': 'application/json' } },
      (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

function adoPost(urlPath, body) {
  return new Promise((resolve, reject) => {
    const bs = JSON.stringify(body);
    const req = https.request(
      { hostname: 'dev.azure.com', path: urlPath, method: 'POST',
        headers: { Authorization: `Basic ${TOKEN}`, 'Content-Type': 'application/json',
                   'Content-Length': Buffer.byteLength(bs) } },
      (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
      }
    );
    req.on('error', reject);
    req.write(bs);
    req.end();
  });
}

// ── 批次取工單詳情（每批最多 200）──────────────────────────────────────────
async function fetchWorkItems(ids, fields = [
  'System.Id','System.Title','System.WorkItemType','System.State',
  'System.AreaPath','System.AssignedTo','System.ChangedDate',
  'Microsoft.VSTS.Common.Priority','Microsoft.VSTS.Scheduling.TargetDate',
  'Microsoft.VSTS.Scheduling.FinishDate'
]) {
  const results = [];
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200).join(',');
    const r = await adoRequest(
      `/${ORG}/${PROJECT}/_apis/wit/workitems?ids=${chunk}&fields=${fields.join(',')}&api-version=7.1`
    );
    if (r.value) results.push(...r.value);
  }
  return results;
}

// ── WIQL 查詢，回傳工單 ID 清單 ────────────────────────────────────────────
async function wiqlQuery(query, top = 500) {
  const r = await adoPost(
    `/${ORG}/${PROJECT}/_apis/wit/wiql?api-version=7.1&$top=${top}`,
    { query }
  );
  return (r.workItems || []).map((w) => w.id);
}

// ── 計算一批工單的加權完成率 ────────────────────────────────────────────────
function calcProgress(items) {
  const counted = items.filter((i) => STATE_WEIGHT[i.fields['System.State']] !== null);
  if (counted.length === 0) return { total: 0, weightedRate: 0, breakdown: {} };
  let sum = 0;
  const breakdown = {};
  counted.forEach((i) => {
    const st = i.fields['System.State'];
    sum += STATE_WEIGHT[st] ?? 0;
    breakdown[st] = (breakdown[st] || 0) + 1;
  });
  return {
    total: counted.length,
    closed: counted.filter((i) => i.fields['System.State'] === 'Closed').length,
    weightedRate: Math.round(sum / counted.length),
    breakdown,
  };
}

// ── 取 Epic 的所有子 Story/Feature ─────────────────────────────────────────
async function getEpicChildren(epicId) {
  const r = await adoPost(
    `/${ORG}/${PROJECT}/_apis/wit/wiql?api-version=7.1&$top=200`,
    { query: `SELECT [System.Id] FROM WorkItemLinks WHERE [Source].[System.Id] = ${epicId} AND [System.Links.LinkType] = 'System.LinkTypes.Hierarchy-Forward' AND [Target].[System.WorkItemType] IN ('Feature','User Story') MODE (MayContain)` }
  );
  const ids = (r.workItemRelations || []).filter((x) => x.target).map((x) => x.target.id);
  if (ids.length === 0) return [];
  return fetchWorkItems(ids, ['System.Id','System.Title','System.WorkItemType','System.State','System.ChangedDate']);
}

function adoPatch(urlPath, body) {
  return new Promise((resolve, reject) => {
    const bs = JSON.stringify(body);
    const req = https.request(
      { hostname: 'dev.azure.com', path: urlPath, method: 'PATCH',
        headers: { Authorization: `Basic ${TOKEN}`,
                   'Content-Type': 'application/json-patch+json',
                   'Content-Length': Buffer.byteLength(bs) } },
      (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
      }
    );
    req.on('error', reject);
    req.write(bs);
    req.end();
  });
}

module.exports = {
  STATE_WEIGHT, STATE_LABEL, LIGHT_LABEL,
  getLight, adoRequest, adoPost, adoPatch,
  fetchWorkItems, wiqlQuery, calcProgress, getEpicChildren,
  ORG, PROJECT,
};
