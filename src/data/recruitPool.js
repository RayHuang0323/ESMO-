// ============================================================================
//  data/recruitPool.js — 球探市場新秀池（Sprint21）
//
//  來源：Legacy EsportsGame.jsx RecruitModule genProspects(line5653) 逐字。
//  性質：純函數 + 固定 seed 的決定性亂數（同一 seed 永遠產生同一批新秀）。
//    → 不是 Store，不寫 localStorage；偵查進度 / 已簽選手存在 profileStore。
//  能力值欄位與 data/playerModel.js STAT_DEF 完全一致，簽約後可直接進 players[]。
// ============================================================================
import {
  STAT_DEF, PERSONALITY, CS_CALIBRATION_STAT_KEYS,
  CS_ROLE_BY_MOBA_ROLE, CS_ROLE_DISTRIBUTION_PROFILES,
} from "./playerModel.js";

/** 潛力分級（Legacy TIERS 逐字） */
export const TIERS = [
  { grade: "S+", label: "世界級天才", color: "#ff6b2b", min: 95 },
  { grade: "S",  label: "天才級",     color: "#fbbf24", min: 90 },
  { grade: "A+", label: "頂尖菁英",   color: "#c084fc", min: 85 },
  { grade: "A",  label: "菁英",       color: "#a855f7", min: 80 },
  { grade: "B+", label: "優秀新星",   color: "#60a5fa", min: 75 },
  { grade: "B",  label: "優秀",       color: "#3b82f6", min: 70 },
  { grade: "C",  label: "潛力股",     color: "#22c55e", min: 60 },
  { grade: "D",  label: "待培養",     color: "#71717a", min: 0 },
];

const ROLES = ["上路", "打野", "中路", "下路", "輔助"];
const FNAMES = ["Zywuu", "Ole", "Fickle", "Gunner", "Kdash", "Maple", "Doggo", "Karsa", "Bin", "Knight", "Rookie", "Scout", "Shadow", "Viper", "Chovy", "Faker", "Showmaker", "Canyon", "Keria", "Ruler", "TheShy", "Deft", "Caps", "Zeus", "Perkz", "Rekkles", "Jankos", "Wunder", "Nemesis", "Hylissang", "Mikyx", "Rookie2", "Doinb", "Tian", "Uzi", "Clearlove", "Scout2", "Ming", "Jackeylove", "Tarzan"];
export const TRAITS = ["天賦異稟", "團隊核心", "大賽型", "穩定輸出", "視野大師", "操作怪物", "戰術理解", "抗壓強", "Carry能力", "新星潛力", "老將經驗", "多位置", "國際賽經驗", "直播人氣"];

/** 定位加成（Legacy roleBoost 逐字） */
const ROLE_BOOST = {
  "上路": ["positioning", "courage", "resilience"],
  "打野": ["reflex", "mapAware", "courage"],
  "中路": ["accuracy", "apm", "decision"],
  "下路": ["accuracy", "positioning", "focus"],
  "輔助": ["comms", "leadership", "synergy"],
};
const CS_CALIBRATION_STAT_SET = new Set(CS_CALIBRATION_STAT_KEYS);

const mkRng = (s) => { let x = s; return () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; }; };

/** R46：以既有 potential/current 為總體基線，只替成熟 CS 素質加入角色偏移。 */
/**
 * 新秀原型（Season vNext V0B）。
 *
 * ── 為什麼要有原型 ────────────────────────────────────────────────────────
 * 改動前 `current` 是 `potential × (0.35–0.75)` ⇒ 起始能力與潛力**同向連動**，
 * 「養成型」與「即戰力」在生成上根本沒有分化，玩家看到的只是同一群人換標籤。
 * 原型先決定「這是哪一種新秀」，再決定起始能力與成長空間，兩者才可能相反。
 *
 * ── 關鍵：`room` 是**直接生成的量** ───────────────────────────────────────
 * 改動前成長空間是「潛力 − 起始能力」的**殘值**，於是被生成時的 clamp 擠掉
 * （見 `genProspectStat` 的註解）。現在 `potential = core + room`，
 * **空間不可能再被夾掉**。
 *
 * ⚠ 全部 **provisional / calibration parameter**，由 Foundation calibration 決定，
 *   不得標為 FINAL。
 */
export const PROSPECT_ARCHETYPES = Object.freeze([
  { id: "developmental", label: "養成型", weight: 30, age: [15, 19], core: [34, 50], room: [22, 38] },
  { id: "standard",      label: "一般",   weight: 40, age: [16, 21], core: [42, 58], room: [12, 24] },
  { id: "readymade",     label: "即戰力", weight: 25, age: [19, 23], core: [52, 68], room: [7, 15] },
  { id: "superstar",     label: "超新星", weight: 5,  age: [15, 18], core: [54, 64], room: [26, 36] },
]);

/**
 * 特殊個體（twist）。**這是機率權重，不是規格表。**
 *
 * ── 為什麼需要 ───────────────────────────────────────────────────────────
 * 只有四個原型時，人才市場會變成「看標籤買人」：每個養成型長得都一樣。
 * 量測證實過頭了——320 名新秀裡**晚熟型 0 人、高潛高成長 0 人**。
 * twist 讓玩家偶爾遇到「這年紀怎麼已經這麼強」或「原本不起眼結果成明星」。
 *
 * ⚠ 刻意保持**少數**：加起來約 26%，其餘七成多是普通新秀。
 *   twist 也刻意**有代價**（早熟換空間、晚熟換即戰力），不是純粹的免費加值。
 */
export const PROSPECT_TWISTS = Object.freeze([
  { id: "prodigy",   label: "早熟",     weight: 5, d: { core: +10, room: -6, age: -2 } },
  { id: "lateBloom", label: "晚熟",     weight: 5, d: { core: -8,  room: +12, age: +2 } },
  { id: "quickLearn",label: "領悟力強", weight: 6, d: { learning: +22 } },
  { id: "slowBurn",  label: "大器晚成", weight: 6, d: { learning: -22, room: +6 } },
  { id: "hiddenGem", label: "璞玉",     weight: 4, d: { core: -10, room: +14 } },
]);
const TWIST_WEIGHT_SUM = PROSPECT_TWISTS.reduce((s, t) => s + t.weight, 0);

/**
 * 依權重抽一個原型。`bias` 讓招募等級**適度**提高稀有原型的出現率。
 *
 * ⚠ **兩端永遠都在**：rank 0 仍抽得到超新星，rank 3 仍大量出現一般／即戰力。
 *   招募等級改的是**機率**，不是保證，也不放大任何人的能力。
 */
function pickArchetype(r, superstarBias = 0) {
  const w = PROSPECT_ARCHETYPES.map((a) =>
    (a.id === "superstar" ? a.weight + superstarBias
      : a.id === "developmental" ? a.weight + superstarBias * 0.5
        : a.weight));
  const sum = w.reduce((x, y) => x + y, 0);
  let t = r() * sum;
  for (let i = 0; i < PROSPECT_ARCHETYPES.length; i++) { t -= w[i]; if (t <= 0) return PROSPECT_ARCHETYPES[i]; }
  return PROSPECT_ARCHETYPES[PROSPECT_ARCHETYPES.length - 1];
}

/** 抽 twist；`chanceScale` 讓招募等級**適度**提高特殊個體的出現率。回傳 null = 普通新秀。 */
function pickTwist(r, chanceScale = 1) {
  const total = TWIST_WEIGHT_SUM * chanceScale;
  const roll = r() * 100;
  if (roll >= total) return null;
  let t = roll;
  for (const tw of PROSPECT_TWISTS) { t -= tw.weight * chanceScale; if (t <= 0) return tw; }
  return null;
}

const pick = (r, [lo, hi]) => lo + Math.floor(r() * (hi - lo + 1));
const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Learning（成長速度）**獨立生成**。
 *
 * ── 為什麼不能沿用其餘素質的產生器 ───────────────────────────────────────
 * 改動前 learning 走 `genProspectStat`（＝ `core + 雜訊`）⇒ 與起始能力相關係數
 * **0.87**，等於「起始能力的複製品」；而且與成長空間 **−0.49**——
 * **空間最大的人學得最慢**，正好是最不有趣的組合。
 *
 * 現在：與 potential **弱**正相關（天賦高的人略容易學），主要由獨立亂數決定，
 * **與起始能力無關**。值域刻意涵蓋 `learningEfficiency` 的整個作用帶
 * （它以 70 為中性、0.90–1.10 封頂），否則「長得快 / 長得慢」看不出差別。
 */
function genLearning(r, potential) {
  return clampN(Math.round(58 + (potential - 70) * 0.25 + (r() * 46 - 21)), 25, 95);
}

/**
 * 一項成熟 CS 素質（R46 的 role bias 與 cap 完全保留）。
 *
 * ── 與改動前的差別 ────────────────────────────────────────────────────────
 * 舊版 `baseline = 40 + current × 0.58` 有一個 **+40 的地板**，而
 * `generationCap = potential − 2`。潛力 42–70 的新秀 baseline 直接衝破天花板
 * ⇒ **出生就被釘在 potential − 2**（實測主能力 41.5% 被釘住，低潛力族群 73%）。
 * 現在 baseline **就是原型的起始能力 `core`**，天花板由 `core + room` 保證留有空間。
 *
 * ── `spreadScale`：小空間的人比較穩定 ────────────────────────────────────
 * bias + noise 的振幅按 `room` 縮放。即戰力（room 小）能力集中、像成品；
 * 養成型（room 大）能力參差、像半成品。這同時解決一個技術問題：
 * 若振幅不隨 room 縮小，小 room 的新秀又會被 `generationCap` 夾住。
 */
function genCsProfiledStat(r, role, core, room, potential, key) {
  const profile = CS_ROLE_DISTRIBUTION_PROFILES[CS_ROLE_BY_MOBA_ROLE[role]];
  const bias = profile?.bias?.[key] ?? 0;
  const cap = profile?.cap?.[key] ?? 90;
  const noise = Math.floor(r() * 13) - 6;
  const spreadScale = Math.min(1, Math.max(0.3, room / 24));
  //  仍保留至少兩點 potential room（既有規則，不改 applyCourse 的上限）
  const generationCap = Math.max(1, potential - 2);
  return Math.max(1, Math.min(generationCap, cap, 99, Math.round(core + (bias + noise) * spreadScale)));
}

/** 非 CS-calibration 的其餘素質：同樣以 `core` 為中心，振幅同樣隨 room 縮放。 */
function genProspectStat(r, core, room, potential) {
  const spreadScale = Math.min(1, Math.max(0.3, room / 24));
  const noise = (Math.floor(r() * 17) - 8) * spreadScale;
  return Math.max(1, Math.min(Math.max(1, potential - 2), 99, Math.round(core + noise)));
}

/**
 * 產生 40 名新秀（Legacy genProspects 逐字）。
 *   scoutLv：0=未知 1=粗略 2=完全 —— 初始多數未偵查完全，潛力顯示為區間。
 *   cost 單位為「萬」（簽約時由 profileStore.signProspect × WAN 換算成元）。
 */
/**
 * 球探網絡等級 → **資訊品質**的加成。
 *
 * ⚠ **刻意不讓新人變強。** 招募等級提高的是「發現優質人才的機率、選擇品質與
 *   判斷可靠度」，不是新人的能力、潛力或學習能力——那會讓招募變成
 *   「等級越高、天下越強」的單向膨脹，而不是一個選擇問題。
 *
 * 具體作用：把每位新秀的**初始已知程度** `scoutLv` 往上抬。
 * 玩家因此**一眼就看得出誰值得深入偵查**，而不是每個人都得先花天數才知道。
 * 池子本身（年齡／起始能力／潛力／成長空間／learning）**逐值不變**。
 *
 * ⚠ **不得讓高等級直接全開。** 第一版用「rank 3 ⇒ +2」，結果 rank 3 時每一位新秀
 *   都跳到 `scoutLv 2`（完全揭露）⇒ **球探系統整個失去意義**。
 *   改成**依名次的部分揭露**：等級越高，一開始就已知的新秀「越多」，
 *   但永遠有人需要親自派球探。梯度來自涵蓋率，不是來自把每個人都拉滿。
 *
 * rank 0 ⇒ 0%｜rank 1 ⇒ 25%｜rank 2 ⇒ 50%｜rank 3 ⇒ 75% 的新秀獲得 +1 已知度。
 * rank 0 與改動前逐位元相同，舊呼叫端不受影響。
 *
 * @param {number} rank  球探網絡等級
 * @param {number} index 新秀在池中的編號（決定性，不消耗 rng token）
 */
export const scoutInfoBonusFor = (rank, index = 0) =>
  (Math.max(0, Math.floor(rank)) > (index % 4) ? 1 : 0);

/**
 * @param {number} seed
 * @param {object} [opts]
 * @param {number} [opts.scoutNetworkRank] `management_scout_network` 的等級
 *   （呼叫端可直接傳 `teamDevelopmentEffectsOf().scoutDaysReduction`，
 *   該節點每階 amount 為 1 ⇒ 數值即等級）。**只影響資訊，不影響能力。**
 */
export function genProspects(seed = 7, { scoutNetworkRank = 0 } = {}) {
  const r = mkRng(seed);
  const scoutRank = Math.max(0, Math.floor(scoutNetworkRank));
  //  招募等級對**人才市場**的影響，刻意「適度」：只動機率，不動任何人的能力。
  //  ⚠ 兩端都必須保留——rank 0 仍挖得到天才，rank 3 仍會遇到普通新秀。
  const superstarBias = scoutRank * 1.2;      // 超新星權重 5 → 8.6（rank 3）
  const twistScale = 1 + scoutRank * 0.12;    // 特殊個體 26% → 約 35%（rank 3）
  return Array.from({ length: 40 }, (_, i) => {
    const role = ROLES[Math.floor(r() * 5)];
    //  V0B：先決定原型，再由原型決定起始能力與成長空間。
    //  `potential = core + room` ⇒ 空間是生成出來的，不是相減的殘值。
    const arch = pickArchetype(r, superstarBias);
    const twist = pickTwist(r, twistScale);
    const d = twist?.d ?? {};
    //  twist 是**帶代價的偏移**（早熟換空間、晚熟換即戰力），不是免費加值。
    const core = clampN(pick(r, arch.core) + (d.core ?? 0), 20, 78);
    const room = clampN(pick(r, arch.room) + (d.room ?? 0), 5, 42);
    const potential = Math.min(96, core + room);
    const current = core;                       // 保留既有欄位；現在它真的是「起始能力」
    const age = clampN(pick(r, arch.age) + (d.age ?? 0), 15, 24);
    const tier = TIERS.find((t) => potential >= t.min);
    const learning = clampN(genLearning(r, potential) + (d.learning ?? 0), 25, 95);
    const stats = {};
    for (const s of STAT_DEF) {
      //  ⚠ learning 走**自己的**產生器（與起始能力無關），其餘素質照舊。
      stats[s.key] = s.key === "learning" ? learning
        : CS_CALIBRATION_STAT_SET.has(s.key)
          ? genCsProfiledStat(r, role, core, room, potential, s.key)
          : genProspectStat(r, core, room, potential);
    }
    for (const k of ROLE_BOOST[role] || []) {
      // 仍消耗 legacy roleBoost 的亂數 token，保持後續 personality / cost /
      // scoutLv 的 deterministic stream；成熟 stat 只不再套第二次加成。
      const boost = Math.floor(r() * 8 + 3);
      // 舊 roleBoost 只保留給未進 R46 calibration 的 gameplay-gap stat；
      // 九項成熟 stat 由上面的單一 profile producer 負責，避免雙重加成。
      if (!CS_CALIBRATION_STAT_SET.has(k) && stats[k]) {
        stats[k] = Math.min(potential, stats[k] + boost);
      }
    }
    const pers = PERSONALITY[Math.floor(r() * PERSONALITY.length)];
    //  V0B：價碼同時反映**即戰力**與**長期上限**。
    //  只綁 potential 會讓「起始 46 / 潛力 82」與「起始 70 / 潛力 82」同價，
    //  即戰力型新秀變成純粹的劣等選項——那正是「單一最佳解」。
    const cost = Math.floor(core * 0.8 + potential * 0.8 + r() * 30 + 10);
    //  ⚠ 仍先照原本的方式抽（消耗同一個 rng token）⇒ 池子的其餘部分逐值不變；
    //    球探網絡只把**已知程度**往上抬，不動任何能力數值。
    const scoutLv = Math.min(2, Math.floor(r() * 3) + scoutInfoBonusFor(scoutRank, i));
    const competing = r() > 0.7;
    const traits = [TRAITS[Math.floor(r() * TRAITS.length)], TRAITS[Math.floor(r() * TRAITS.length)]]
      .filter((v, j, a) => a.indexOf(v) === j);
    return {
      id: i,
      name: FNAMES[i % FNAMES.length] + (i >= FNAMES.length ? String(i) : ""),
      role, potential, current, age, tier, stats,
      archetype: arch.id, archetypeLabel: arch.label, growthSpace: room,
      twist: twist?.id ?? null, twistLabel: twist?.label ?? null,
      personality: pers.id, traits, cost, scoutLv, competing,
    };
  });
}

/** 偵查天數（Legacy dispatchScout：淺層 2 天見潛力，深層 4 天見完整） */
export const SCOUT_DAYS = { 1: 2, 2: 4 };
