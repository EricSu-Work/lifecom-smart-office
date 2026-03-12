'use strict';
/**
 * customer_tiers.js — 客戶等級配置
 *
 * 等級定義：
 *   S  = 旗艦客戶  年收 > NT$2M（或 SFL 特別指定）
 *   A  = 重要客戶  年收 NT$500K–2M，或 倉儲/WMS/TMS 客戶（系統急迫性）
 *   B  = 一般客戶  年收 NT$100K–500K
 *   C  = 基礎客戶  年收 < NT$100K
 *
 * 資料基準：2025 年度實際收入 + 2026 累計收入（截至 2026-03）
 * 倉儲客戶原則：無論收入高低，優先 A 級；SFL 為 S 級。
 *
 * Key = ADO AreaPath 末段 customer_tag
 */
const TIERS = {
  // ──────────────── S 旗艦（年收 >NT$2M 或集團指定）────────────────
  'SFL':          'S',   // 翔丰物流 NT$2.7M  — WMS+TMS+機房，Eric 指定 S
  'Adastria':     'S',   // 亞洲華敦通商 NT$2.5M
  'adastriab2b':  'S',
  'Loreal':       'S',   // 台灣萊雅 NT$2.5M
  'Lorealv2':     'S',

  // ──────────────── A 重要（年收 NT$500K–2M 或 倉儲/TMS 客戶）──────
  // 倉儲/WMS/TMS 客戶（有急迫性 → 全 A，regardless 收入）
  'Doe':          'A',   // 朵墨 NT$1.2M  — WMS
  '朵墨':          'A',
  '5Soap':        'A',   // 無患子 NT$1.1M  — WMS+機房
  'EZ':           'A',   // 易立國際物流 NT$785K — TMS
  'Baan':         'A',   // 貝恩企業 NT$450K — WMS+機房
  'Ecostyle':     'A',   // 艾可思歐 — 機房（倉儲優先 A）
  'FM':           'A',   // 新澔豐運通 NT$204K — 物流相關（倉儲優先 A）

  // 非倉儲 A 級（年收 NT$500K+）
  'Keywear':      'A',   // 心連天地 NT$50K/月 → NT$600K/年（純 OMS，不是倉儲）
  'KeyWear':      'A',
  'NPC':          'A',   // 欣新網 NT$150K/月 → NT$1.8M/年
  'Biocrown':     'A',   // 捷醫國際 NT$516K/年
  'Tds':          'A',   // 台灣德奈澈 NT$564K/年
  'Working':      'A',   // 易網通物流 NT$600K/年 — WMS（倉儲 A）

  // ──────────────── B 一般（年收 NT$100K–500K）────────────────────
  // 萬泰倉儲底下的子客戶（分散計算）
  'Adapt':        'B',   // 愛戴特 NT$32K/月 → NT$384K/年（掛萬泰倉儲帳）
  'SL Light':     'B',   // 星山 NT$32K/月 → NT$384K/年（掛萬泰倉儲帳）
  '星山':          'B',
  'LIYO':         'B',   // 台灣美立 NT$20K/月 → NT$240K/年（掛萬泰倉儲帳）
  'Eleven':       'B',   // 拾壹瞬間 NT$20K/月 → NT$240K/年（掛萬泰倉儲帳）

  'Relove':       'B',   // 上騰美研 NT$400K+
  'UA':           'B',   // Under Armour — 待確認公司對應
  'Giordano':     'B',   // 全球昕兆 NT$364K
  'Post':         'B',   // 中華郵政 NT$190K
  'EMERS':        'B',   // 艾盟仕 NT$144K
  'emersgroup':   'B',
  'Sabon':        'B',   // 約 NT$200K–400K
  'Vacanza':      'B',
  'vacanza':      'B',
  'Toysrus':      'B',   // 玩具反斗城 NT$144K
  'Skyspring':    'B',   // 天泉草本 NT$144K
  'Hearth':       'B',
  'Elite Beauty': 'B',
  'EBA':          'B',
  'Jumeng':       'B',
  'Fatty':        'B',
  'faithera':     'B',
  'LACOSTE':      'B',
  'Natgeo':       'B',
  'Owndays':      'B',
  'Shopatsnow':   'B',   // 崴海數位 NT$144K
  'Hanfangyupin': 'B',   // 翰方御品 NT$116K
  'Dhin':         'B',   // 鼎恒 NT$144K
  'Nikegolf':     'B',
  'Teamson':      'B',
  'Nishimatsuya': 'B',
  'Shimamura':    'B',
  'Mineacc':      'B',   // 火星生技 NT$436K（推測）
  'Lab52':        'B',   // 良冠生化 NT$116K
  'Perfekt':      'B',

  // ──────────────── C 基礎（年收 < NT$100K 或低頻客戶）────────────
  'Levis':        'C',   // NT$0（HHG代理，無直接合約）
  'JS':           'C',
  'Olive':        'A',   // 奧利芙 NT$80K/月 → A（掛萬泰倉儲帳）
  'ChingHwa':     'C',
  'Umbrella king':'C',   // 雨傘王 NT$108K（接近 C/B 邊界）
  '雨傘王':        'C',
  'Arnest':       'C',   // 亞諾思特 NT$96K
  'PSK':          'C',
  'XOXO':         'C',
  'Airbubu':      'C',
  'Drhold':       'C',
  'Hyphy':        'C',
  'ILSO':         'C',
  'ilso':         'C',
  'Eleven':       'C',
  'Goddess':      'C',
  'Hairslon':     'C',
  'Scalprecovery':'C',
  'Lovelylotol':  'C',
  'As':           'C',
  'Dewang':       'C',
  '15':           'C',
  '3Ctim':        'C',
  'Shopatsnow':   'C',

  // 內部 / 通用 → 報表中過濾不顯示
  'LifeCOM':      'internal',
  'Public':       'internal',
  'RD':           'internal',
  'OP':           'internal',
  'TEST':         'internal',
  'LifeERPv2':    'internal',
  '通用':          'internal',
};

const TIER_ORDER = { S: 0, A: 1, B: 2, C: 3, '?': 4 };
const TIER_LABEL = { S: '⭐S', A: '🔷A', B: '🔹B', C: '▫️C', '?': '❓' };

function getTier(customerTag) {
  if (!customerTag) return '?';
  const tag = customerTag.split('\\').pop().trim();
  return TIERS[tag] || TIERS[customerTag] || '?';
}

function tierOrder(customerTag) {
  return TIER_ORDER[getTier(customerTag)] ?? 4;
}

module.exports = { TIERS, TIER_ORDER, TIER_LABEL, getTier, tierOrder };
