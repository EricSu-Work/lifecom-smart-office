/**
 * gantt_to_ado.js — Gantt → ADO TargetDate
 * 直接 patch 模式（已修正配對）
 */
const ado = require('./ado_client');

// TargetDate = start + duration
function calcTarget(start, dur) {
  const d = new Date(start.replace(/\//g, '-'));
  d.setDate(d.getDate() + dur);
  return d.toISOString().split('T')[0];
}

// [adoId, targetDate] — 手動修正後的配對
// adoId = null → 找不到對應 Feature，略過
const PATCHES = [
  // SFL — 找不到直接對應的 Feature
  // { adoId: null, target: calcTarget('2026/01/09', 1), note: 'SFL .NET出貨刷讀上線' },

  // 西松屋/NSY
  { adoId: 38446, target: calcTarget('2026/02/13', 1),  note: '西松屋上線 → NSY介面上傳調整' },

  // AD — [40177] 2025/12/10提供的需求項目（含回檔/替代料號）
  { adoId: 40177, target: calcTarget('2026/02/23', 21), note: 'AD 替代料號功能 → [40177]' },

  // Relove
  { adoId: 41292, target: calcTarget('2026/01/12', 5),  note: 'relove 換公司別 → [41292]' },

  // 景華 — [40132] 新版OMS csv格式串接（上線日）
  { adoId: 40132, target: calcTarget('2026/01/30', 4),  note: '景華上線 → [40132]' },

  // AS
  { adoId: 36051, target: calcTarget('2026/02/25', 1),  note: 'AS上線 → [36051]' },

  // NPC
  { adoId: 38267, target: calcTarget('2026/02/28', 1),  note: 'NPC 採購PDF轉JPG → [38267]' },

  // 古寶 台北門市 → [40755]
  { adoId: 40755, target: calcTarget('2026/01/30', 1),  note: '古寶台北門市 → [40755]' },

  // 古寶 WCS串接 → [39588]
  { adoId: 39588, target: calcTarget('2026/03/01', 30), note: '古寶WCS串接 → [39588]' },

  // 暖風煦煦/信仰曆 → [42407] Cyberbiz串接
  { adoId: 42407, target: calcTarget('2026/04/15', 5),  note: '信仰曆Cyberbiz → [42407]' },

  // KeyWear 上線前 → [43327]
  { adoId: 43327, target: calcTarget('2026/02/25', 6),  note: '奇威上線 → [43327]' },

  // KeyWear 採購單 webhook → [41788]（已是獨立系統建置）
  { adoId: 41788, target: calcTarget('2026/02/11', 5),  note: 'KeyWear webhook → [41788]' },

  // Adapt 每日進出異動報表 → [38264]
  { adoId: 38264, target: calcTarget('2026/01/21', 1),  note: 'Adapt每日報表 → [38264]' },

  // Adapt 客製入庫單查詢 → [38292]
  { adoId: 38292, target: calcTarget('2026/01/21', 1),  note: 'Adapt入庫單查詢 → [38292]' },

  // LACOSTE 上線前功能 → [41492]（含多項功能）
  { adoId: 41492, target: calcTarget('2026/02/23', 31), note: 'LACOSTE上線前 → [41492]' },

  // Loreal SPACE API → [37501]
  { adoId: 37501, target: calcTarget('2026/02/04', 21), note: 'Loreal SPACE API → [37501]' },

  // Loreal Counter Pickup → [40943]
  { adoId: 40943, target: calcTarget('2026/02/09', 55), note: 'Loreal Counter Pickup → [40943]' },

  // Loreal Cancel & Return Reason → [39830]
  { adoId: 39830, target: calcTarget('2026/02/09', 55), note: 'Loreal C&R Reason → [39830]' },

  // Loreal 稽核記錄Review → [40946]
  { adoId: 40946, target: calcTarget('2026/02/04', 50), note: 'Loreal 稽核記錄 → [40946]' },

  // Loreal 已出貨未配達報表 → [41712]
  { adoId: 41712, target: calcTarget('2026/03/15', 25), note: 'Loreal 已出貨未配達 → [41712]' },

  // Loreal D2C LineGift 統編 → [43070]
  { adoId: 43070, target: calcTarget('2026/02/09', 7),  note: 'Loreal LineGift統編 → [43070]' },

  // 幸福泉
  { adoId: 38725, target: calcTarget('2026/03/23', 7),  note: '幸福泉舊升新 → [38725]' },

  // 翰方御品
  { adoId: 32979, target: calcTarget('2026/04/15', 15), note: '翰方新官網串接 → [32979]' },
];

async function main() {
  console.log(`\n開始寫入 ${PATCHES.length} 項 TargetDate...\n`);
  let ok = 0, skip = 0, err = 0;

  for (const p of PATCHES) {
    if (!p.adoId) { console.log(`  ⏭  略過: ${p.note}`); skip++; continue; }
    try {
      // 先確認目前有無 TargetDate
      const items = await ado.fetchWorkItems([p.adoId], ['Microsoft.VSTS.Scheduling.TargetDate','System.Title']);
      const existing = items[0]?.fields['Microsoft.VSTS.Scheduling.TargetDate'];
      const title = items[0]?.fields['System.Title']?.slice(0,50);
      if (existing) {
        console.log(`  ⏭  [${p.adoId}] 已有日期 ${existing.split('T')[0]} (${p.note})`);
        skip++;
        continue;
      }
      await ado.adoPatch(
        `/${ado.ORG}/${ado.PROJECT}/_apis/wit/workitems/${p.adoId}?api-version=7.1`,
        [{ op: 'add', path: '/fields/Microsoft.VSTS.Scheduling.TargetDate', value: p.target }]
      );
      console.log(`  ✅ [${p.adoId}] → ${p.target}  ${title}`);
      ok++;
    } catch(e) {
      console.log(`  ❌ [${p.adoId}] ${e.message}`);
      err++;
    }
  }

  console.log(`\n完成：✅${ok} 更新  ⏭${skip} 略過  ❌${err} 錯誤`);
}

main().catch(e => console.error(e.stack));
