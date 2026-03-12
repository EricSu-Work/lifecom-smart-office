/**
 * setup_delivery_plan.js
 * 1. 批次填入 Feature Start Date（從 CSM Gantt）
 * 2. 建立 ADO Delivery Plan（甘特圖 Dashboard）
 */
const ado = require('./ado_client');

const TEAM_ID = '57cfff74-ba68-4080-adb7-19791360b969';
const PROJECT_ID = '77e815a3-847a-4fdb-94de-2fe0f123c652';

// Start Date 對應（同 gantt_to_ado.js 的 start dates）
const START_DATES = [
  { adoId: 38446, start: '2026-02-13' }, // NSY 西松屋
  { adoId: 40177, start: '2026-02-23' }, // AD
  { adoId: 41292, start: '2026-01-12' }, // Relove
  { adoId: 40132, start: '2026-01-30' }, // 景華
  { adoId: 36051, start: '2026-02-25' }, // AS
  { adoId: 38267, start: '2026-02-28' }, // NPC
  { adoId: 40755, start: '2026-01-30' }, // 古寶台北門市
  { adoId: 39588, start: '2026-03-01' }, // 古寶WCS
  { adoId: 42407, start: '2026-04-15' }, // 暖風煦煦
  { adoId: 43327, start: '2026-02-25' }, // KeyWear上線前
  { adoId: 41788, start: '2026-02-11' }, // KeyWear webhook
  { adoId: 38264, start: '2026-01-21' }, // Adapt報表
  { adoId: 38292, start: '2026-01-21' }, // Adapt入庫單
  { adoId: 41492, start: '2026-02-23' }, // LACOSTE
  { adoId: 37501, start: '2026-02-04' }, // Loreal SPACE
  { adoId: 40943, start: '2026-02-09' }, // Loreal Counter Pickup
  { adoId: 39830, start: '2026-02-09' }, // Loreal Cancel & Return
  { adoId: 40946, start: '2026-02-04' }, // Loreal 稽核記錄
  { adoId: 41712, start: '2026-03-15' }, // Loreal 已出貨未配達
  { adoId: 43070, start: '2026-02-09' }, // Loreal LineGift統編
  { adoId: 38725, start: '2026-03-23' }, // 幸福泉
  { adoId: 32979, start: '2026-04-15' }, // 翰方御品
];

async function patchStartDates() {
  console.log('\n── Step 1: 填入 Start Date ──');
  let ok = 0, skip = 0;
  for (const p of START_DATES) {
    try {
      const items = await ado.fetchWorkItems([p.adoId], ['Microsoft.VSTS.Scheduling.StartDate','System.Title']);
      const existing = items[0]?.fields['Microsoft.VSTS.Scheduling.StartDate'];
      if (existing) { console.log(`  ⏭  [${p.adoId}] 已有 StartDate`); skip++; continue; }
      await ado.adoPatch(
        `/${ado.ORG}/${ado.PROJECT}/_apis/wit/workitems/${p.adoId}?api-version=7.1`,
        [{ op: 'add', path: '/fields/Microsoft.VSTS.Scheduling.StartDate', value: p.start }]
      );
      console.log(`  ✅ [${p.adoId}] StartDate → ${p.start}  ${items[0]?.fields['System.Title']?.slice(0,40)}`);
      ok++;
    } catch(e) {
      console.log(`  ❌ [${p.adoId}] ${e.message}`);
    }
  }
  console.log(`  完成：✅${ok} ⏭${skip}`);
}

async function createDeliveryPlan() {
  console.log('\n── Step 2: 建立 Delivery Plan ──');
  const body = {
    name: '專案里程碑甘特圖',
    type: 'deliveryTimelineView',
    properties: {
      teams: [{
        id: TEAM_ID,
        name: 'LifeCOM Team',
        backlogVisibilities: {
          'Microsoft.EpicCategory': false,
          'Microsoft.FeatureCategory': true,
          'Microsoft.RequirementCategory': false,
        },
        teamId: TEAM_ID,
        projectId: PROJECT_ID,
      }],
      startDate: '2025-10-01',
      endDate: '2026-06-30',
    },
  };

  try {
    const r = await ado.adoPost(
      `/${ado.ORG}/${ado.PROJECT}/_apis/work/plans?api-version=7.1`,
      body
    );
    if (r.id) {
      const url = `https://dev.azure.com/${ado.ORG}/${ado.PROJECT}/_boards/deliveryplan?planId=${r.id}`;
      console.log(`  ✅ 建立成功！Plan ID: ${r.id}`);
      console.log(`  🔗 連結：${url}`);
    } else {
      console.log('  ❌ 建立失敗:', JSON.stringify(r).slice(0,300));
    }
  } catch(e) {
    console.log('  ❌', e.message);
  }
}

async function main() {
  await patchStartDates();
  await createDeliveryPlan();
}

main().catch(e => console.error(e.stack));
