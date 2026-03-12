/**
 * sync_ado.js — 同步 ADO 工單到 lifecom.db
 * 
 * 使用方式：
 *   node sync_ado.js           # 同步 Bug + Feature + Epic
 *   node sync_ado.js Bug       # 只同步 Bug
 */
const https = require('https');
const fs = require('fs');
const { ado, cursor, batchUpsert } = require('./lifecom_db');

const PAT = fs.readFileSync(require('os').homedir() + '/.config/azure-devops/pat', 'utf8').trim();
const ORG = 'LifeComTW';
const PROJECT = 'LifeCOM';
const AUTH = Buffer.from(':' + PAT).toString('base64');

function adoPost(path, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const req = https.request({
      hostname: 'dev.azure.com',
      path: '/' + ORG + '/' + PROJECT + path,
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + AUTH,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr)
      }
    }, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve(JSON.parse(d))); });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

function adoGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'dev.azure.com',
      path: '/' + ORG + '/' + PROJECT + path,
      method: 'GET',
      headers: { 'Authorization': 'Basic ' + AUTH }
    }, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve(JSON.parse(d))); });
    req.on('error', reject); req.end();
  });
}

async function syncType(workItemType) {
  // WIQL 查詢：取近90天的工單
  const since = new Date(Date.now() - 90 * 86400 * 1000).toISOString().split('T')[0];
  const wiql = {
    query: `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject]='${PROJECT}' AND [System.WorkItemType]='${workItemType}' AND [System.ChangedDate] >= '${since}' ORDER BY [System.ChangedDate] DESC`
  };

  const res = await adoPost('/_apis/wit/wiql?api-version=7.0', wiql);
  const ids = (res.workItems || []).map(w => w.id);
  if (!ids.length) return { count: 0, ids: [] };

  // 批次取詳細資料（每次最多 200 筆）
  let total = 0;
  const batchSize = 200;
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const fields = [
      'System.Id','System.WorkItemType','System.Title','System.State',
      'Microsoft.VSTS.Common.Severity','System.AssignedTo','System.AreaPath',
      'System.CreatedDate','System.ChangedDate','Microsoft.VSTS.Scheduling.TargetDate',
      'System.Tags','System.Description','System.Parent',
      'Microsoft.VSTS.Common.Priority',
      'Microsoft.VSTS.Common.ActivatedDate',
      'Microsoft.VSTS.Common.ResolvedDate',
      'Microsoft.VSTS.Common.ClosedDate',
      'Microsoft.VSTS.Common.StateChangeDate'
    ].join(',');

    const detail = await adoGet(`/_apis/wit/workitems?ids=${batch.join(',')}&fields=${fields}&api-version=7.0`);
    if (!detail.value) continue;

    const rows = detail.value.map(w => {
      const f = w.fields;
      const assignedTo = f['System.AssignedTo'];
      return {
        id:           f['System.Id'],
        type:         f['System.WorkItemType'],
        title:        f['System.Title'] || '',
        state:        f['System.State'] || '',
        severity:     f['Microsoft.VSTS.Common.Severity'] || '',
        assigned_to:  assignedTo ? (assignedTo.displayName || assignedTo) : '',
        customer_tag: (f['System.AreaPath'] || '').split('\\').pop(),
        created_at:   f['System.CreatedDate'] ? Math.floor(new Date(f['System.CreatedDate']).getTime()/1000) : null,
        updated_at:   f['System.ChangedDate'] ? Math.floor(new Date(f['System.ChangedDate']).getTime()/1000) : null,
        target_date:  f['Microsoft.VSTS.Scheduling.TargetDate'] ? Math.floor(new Date(f['Microsoft.VSTS.Scheduling.TargetDate']).getTime()/1000) : null,
        parent_id:    f['System.Parent'] || null,
        meta:         JSON.stringify({
          tags:             f['System.Tags'],
          description:      (f['System.Description']||'').slice(0,500),
          priority:         f['Microsoft.VSTS.Common.Priority'],
          activated_date:   f['Microsoft.VSTS.Common.ActivatedDate'] || null,
          resolved_date:    f['Microsoft.VSTS.Common.ResolvedDate'] || null,
          closed_date:      f['Microsoft.VSTS.Common.ClosedDate'] || null,
          state_change_date: f['Microsoft.VSTS.Common.StateChangeDate'] || null,
        }),
      };
    });

    batchUpsert(ado.upsert, rows);
    total += rows.length;
  }

  cursor.set('ado_' + workItemType.toLowerCase(), new Date().toISOString());
  return { count: total, ids };
}

// ── 清理已刪除工單 ──────────────────────────────────────────────────────────
// sync 完後，檢查 DB 裡 open 狀態的工單是否還存在於 ADO；404 的標記為 Removed
async function cleanupDeleted(syncedIds) {
  const { db } = require('./lifecom_db');
  const openRows = db.prepare(
    "SELECT id FROM ado_workitems WHERE state NOT IN ('Closed','Resolved','Removed')"
  ).all();

  // 只檢查「本次 sync 沒出現過」的 open 工單（sync 有出現的一定存在）
  const toCheck = openRows.map(r => r.id).filter(id => !syncedIds.has(id));
  if (!toCheck.length) return 0;

  // 逐筆驗證（量不大，通常 < 20 筆）
  const markRemoved = db.prepare(
    "UPDATE ado_workitems SET state='Removed', updated_at=? WHERE id=?"
  );
  const nowSec = Math.floor(Date.now() / 1000);
  let removed = 0;

  for (const id of toCheck) {
    try {
      const r = await new Promise((resolve, reject) => {
        https.get({
          hostname: 'dev.azure.com',
          path: `/${ORG}/${PROJECT}/_apis/wit/workitems/${id}?fields=System.State&api-version=7.0`,
          headers: { 'Authorization': 'Basic ' + AUTH }
        }, res => {
          let d = ''; res.on('data', c => d += c);
          res.on('end', () => resolve({ status: res.statusCode, body: d }));
        }).on('error', reject);
      });

      if (r.status === 404 || r.status === 401) {
        markRemoved.run(nowSec, id);
        removed++;
        console.log(`  🗑️  #${id} → Removed (deleted from ADO)`);
      } else if (r.status === 200) {
        // 存在但不在 90 天 WIQL 範圍內 — 更新狀態
        try {
          const j = JSON.parse(r.body);
          const realState = j.fields?.['System.State'];
          if (realState && realState !== 'Removed') {
            db.prepare('UPDATE ado_workitems SET state=?, updated_at=? WHERE id=?')
              .run(realState, nowSec, id);
          }
        } catch(e) { /* ignore parse errors */ }
      }
    } catch(e) { /* network error, skip */ }
  }

  return removed;
}

async function main() {
  const targetType = process.argv[2];
  const types = targetType ? [targetType] : ['Bug', 'Feature', 'Epic', 'User Story', 'Task'];

  console.log('Syncing ADO work items:', types.join(', '));

  const allSyncedIds = new Set();
  for (const type of types) {
    process.stdout.write('  ' + type.padEnd(10) + '... ');
    const { count, ids } = await syncType(type);
    ids.forEach(id => allSyncedIds.add(id));
    console.log(count + ' items synced');
  }

  // 清理已刪除工單
  const removed = await cleanupDeleted(allSyncedIds);
  if (removed) console.log(`Cleanup: ${removed} deleted items marked as Removed`);

  console.log('Done.');
}

main().catch(console.error);
