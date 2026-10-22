// ============================================================================
//  platform/tactics/tacticIndicators.js — 戰術指標（Phase 3a T11；純函式，只給畫面看）
//
//  四個指標都從「解析後的戰術設定」（模板＋覆蓋層＋選擇，與 resolver 同一個合併函式）推導：
//    planProfile        計畫輪廓（六軸，0–1）。是**傾向**，不是量測到的效果。
//    seatMissionFit     五個席位各自的任務，以及這位選手（＋英雄）適不適合。
//    coordinationLoad   這份計畫要求多少配合（load），以及這支隊伍撐得起多少（capacity）。
//    contradictions     計畫裡互相打架的選擇。
//
//  ── 邊界 ────────────────────────────────────────────────────────────────
//   · **不進引擎**：3a 只顯示；引擎效果屬 3b。本檔不 import 引擎、組裝器、store、React。
//   · **不存檔**：全部是決定性推導。換人 ⇒ 適性重算，plan 與 planHash 不變。
//   · 適性的素質係數**只有一個來源**：mobaPlayerStats.js 的 STAT_MAP（選手素質 → 引擎作用點）。
//     本檔只決定「哪個任務看哪些作用點」（MISSION_POINTS），不另寫一份素質權重。
//   · 矛盾提示每一條都要指得出 G-A7 量測表（tools/fixtures/tactic_truth_3a.json）裡的兩筆現象；
//     指不出來的不收錄（gate 逐條對照結果表）。
//   · 英雄資料由呼叫端注入（heroLookup）：本檔不 import heroDatabase（它會連帶載入英雄圖片資料）。
//   · 輸入不合法 ⇒ 回 null（contradictions 回 []），不丟例外。
//
//  ⚠ 計畫輪廓、配合度負擔、英雄適配表裡的加權是**呈現用的設計數字**（Owner Review），沒有引擎意義；
//    要改它們不需要重跑量測，但 tools/check_tactic_indicators_3a.mjs 釘著經典模板的形狀。
// ============================================================================
import { createTacticPlan } from "./tacticPlan.js";
import { templateById } from "./tacticTemplates.js";
import { mergeTacticConfig, tacticBookOptions, leavesOf } from "./tacticChoiceMapping.js";
import { REPLICATION_WITHHELD } from "./capabilityRegistry.js";
import { toEngineTactic, STANDARD_OPP_TACTIC } from "../contracts/MobaTacticConfig.js";
import { STAT_MAP, NEUTRAL_STAT } from "../../battle/moba/mobaPlayerStats.js";

export const TACTIC_INDICATORS_VERSION = "tacticIndicators.v1";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const fix = (v) => Math.round(v * 1e6) / 1e6 + 0;
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** binding（或 plan）→ { plan, config }；不合法 ⇒ null。 */
function resolved(binding) {
  try {
    const raw = isObj(binding) && isObj(binding.plan) ? binding.plan : binding;
    const created = createTacticPlan(raw);
    if (!created.ok) return null;
    const plan = created.plan;
    const config = mergeTacticConfig(templateById(plan.templateId), plan.overlayIds, plan.choices);
    return { plan, config };
  } catch {
    return null;
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  1. 計畫輪廓
// ════════════════════════════════════════════════════════════════════════════
export const PROFILE_AXES = Object.freeze(["early", "midControl", "lateTeamfight", "objectives", "splitPressure", "risk"]);

const EARLY_STANCE = { aggressive: 1, standard: 0.5, scaling: 0.25, defensive: 0.15 };
const MID_STANCE = { aggressive: 1, standard: 0.5, scaling: 0.35, defensive: 0.25 };
const LATE_STANCE = { scaling: 1, standard: 0.5, defensive: 0.3 };
const TEMPO = { fast: 1, standard: 0.5, slow: 0 };
const ROAM_FULL = 0.7;       // 八套經典裡最高的輔助遊走率（m6）＝ 滿格

/**
 * 計畫輪廓：六軸各 0–1。
 * @param {object} binding  TacticPlanBinding（或 TacticPlan.v2）
 * @returns {{early:number, midControl:number, lateTeamfight:number, objectives:number, splitPressure:number, risk:number} | null}
 */
export function planProfile(binding) {
  const r = resolved(binding);
  if (!r) return null;
  const { macro: m, objectives: o, economy: e } = r.config;
  const knobs = toEngineTactic(r.config);
  const early = 0.45 * (EARLY_STANCE[m.earlyGame] ?? 0.5) + 0.2 * (TEMPO[m.tempo] ?? 0.5) + 0.2 * m.aggression + 0.15 * clamp(knobs.invadeChance, 0, 1);
  const midControl = 0.35 * (MID_STANCE[m.midGame] ?? 0.5) + 0.25 * o.dragonPriority + 0.2 * clamp(e.supportRoamRate / ROAM_FULL, 0, 1) + 0.2 * m.grouping;
  const lateTeamfight = 0.4 * (LATE_STANCE[m.lateGame] ?? 0.5) + 0.25 * m.grouping + 0.15 * o.baronPriority + 0.2 * (1 - clamp(early, 0, 1));
  const objectives = (o.dragonPriority + o.baronPriority + o.towerPriority) / 3;
  //  帶線機率只有在真的有一路帶線時才有引擎效果（toEngineTactic 的 splitLane）。
  const splitPressure = knobs.splitLane ? m.splitPush : 0;
  const out = { early, midControl, lateTeamfight, objectives, splitPressure, risk: m.riskTolerance };
  for (const k of PROFILE_AXES) out[k] = fix(clamp(out[k], 0, 1));
  return Object.freeze(out);
}

// ════════════════════════════════════════════════════════════════════════════
//  2. 席位任務適性
// ════════════════════════════════════════════════════════════════════════════
export const SEATS = Object.freeze(["b1", "b2", "b3", "b4", "b5"]);
/** 席位 → MobaTacticConfig.lanePlan 的鍵（與引擎席位順序相同：上、野、中、射、輔）。 */
export const SEAT_POSITION = Object.freeze({ b1: "top", b2: "jungle", b3: "mid", b4: "adc", b5: "support" });

const LANE_MISSION = { aggressive: "pressure", standard: "lane", defensive: "hold", split: "split" };
const JUNGLE_MISSION = { gank: "gank", farm: "farm", invade: "invade" };
const SUPPORT_MISSION = { roam: "roam", protect: "protect", standard: "support" };

/**
 * 任務 → 看哪些引擎作用點（[STAT_MAP 的鍵, 方向]）。方向 −1＝該作用點的值越小越符合任務
 * （守線＝推得淺；抓人＝週期短）。素質權重一律取 STAT_MAP，這張表沒有任何素質數字。
 */
export const MISSION_POINTS = Object.freeze({
  split: [["splitAdj", 1]],
  pressure: [["laneAdj", 1]],
  hold: [["laneAdj", -1]],
  lane: [["xpRateScale", 1]],
  gank: [["gankIntervalScale", -1], ["gankWindowScale", 1]],
  farm: [["xpRateScale", 1]],
  invade: [["invadeAdj", 1]],
  roam: [["roamAdj", 1], ["roamSightAdj", 1], ["roamInfoAdj", 1]],
  protect: [["joinAdj", 1]],
  support: [["objAdj", 1]],
});
/** 被指定為核心的席位另外看的作用點（把資源吃乾淨）。 */
export const CORE_POINT = Object.freeze(["xpRateScale", 1]);

/** 英雄移動原型（HeroCombatArchetype.movementProfile）對任務的適配：+1 合適、−1 不合適、沒列＝中性。呈現用。 */
export const MISSION_HERO_FIT = Object.freeze({
  split: { flank: 1, hold: 1, protect: -1 },
  pressure: { engage: 1, kite: 1, protect: -1 },
  hold: { hold: 1, zone: 1, flank: -1 },
  lane: {},
  gank: { engage: 1, flank: 1 },
  farm: {},
  invade: { engage: 1, flank: 1, protect: -1, zone: -1 },
  roam: { engage: 1, flank: 1, hold: -1 },
  protect: { protect: 1, zone: 1, flank: -1 },
  support: {},
});
export const HERO_FIT_STEP = 0.1;
/** 分數 → 等級。全中性（素質全 70、英雄中性）＝ 0 ⇒ B。 */
export const GRADE_FLOORS = Object.freeze([["A", 0.25], ["B", 0], ["C", -0.25]]);
export const gradeOf = (score) => GRADE_FLOORS.find(([, floor]) => score >= floor)?.[0] ?? "D";

const SPAN = 30;   // 與 mobaPlayerStats 的正規化跨距相同（gate 以 toPlayerMods 的輸出反推核對）
/** 素質 → 中性化係數 u ∈ [−1, +1]；缺值＝中性。 */
export const statU = (stats, key) => {
  const v = Number.isFinite(stats?.[key]) ? stats[key] : NEUTRAL_STAT;
  return clamp((v - NEUTRAL_STAT) / SPAN, -1, 1);
};

function statsBySeat(seatPlayers) {
  const out = {};
  if (Array.isArray(seatPlayers)) {
    for (const s of seatPlayers) {
      const seat = s?.seat ?? s?.id;
      if (SEATS.includes(seat) && !Object.hasOwn(out, seat)) out[seat] = isObj(s.stats) ? s.stats : null;
    }
  } else if (isObj(seatPlayers)) {
    for (const seat of SEATS) {
      const s = Object.hasOwn(seatPlayers, seat) ? seatPlayers[seat] : null;
      out[seat] = isObj(s) ? (isObj(s.stats) ? s.stats : null) : null;
    }
  }
  return out;
}

function heroProfileOf(heroLookup, seat) {
  try {
    const v = typeof heroLookup === "function" ? heroLookup(seat) : isObj(heroLookup) && Object.hasOwn(heroLookup, seat) ? heroLookup[seat] : null;
    const p = typeof v === "string" ? v : isObj(v) ? v.movementProfile : null;
    return typeof p === "string" ? p : null;
  } catch {
    return null;
  }
}

/** 設定 → 每個席位的任務與是否為核心。 */
function missionsOf(config) {
  const lp = config.lanePlan, carry = config.economy.carryPriority;
  const out = {};
  for (const seat of SEATS) {
    const pos = SEAT_POSITION[seat];
    const mission = pos === "jungle" ? JUNGLE_MISSION[lp.jungle] ?? "gank"
      : pos === "support" ? SUPPORT_MISSION[lp.support] ?? "support"
      : LANE_MISSION[lp[pos]] ?? "lane";
    out[seat] = { mission, core: carry !== "balanced" && carry === pos };
  }
  return out;
}

/**
 * 席位任務適性。
 * @param {object} o
 * @param {object} o.binding      TacticPlanBinding（或 TacticPlan.v2）
 * @param {Array|object} [o.seatPlayers]  [{ id|seat:"b1", stats }]（buildPlayerStatSlots 的輸出）或 { b1:{ stats } }；缺的席位＝中性
 * @param {Function|object} [o.heroLookup]  (seat) → 英雄的戰鬥原型物件（getHeroCombatArchetype 的回傳）或 movementProfile 字串；可省略
 * @returns {null | Record<string, { mission:string, core:boolean, grade:"A"|"B"|"C"|"D", score:number, strongest:string|null, weakest:string|null, hero:{profile:string|null, fit:number} }>}
 */
export function seatMissionFit({ binding, seatPlayers, heroLookup } = {}) {
  const r = resolved(binding);
  if (!r) return null;
  const stats = statsBySeat(seatPlayers);
  const missions = missionsOf(r.config);
  const out = {};
  for (const seat of SEATS) {
    const { mission, core } = missions[seat];
    const points = [...MISSION_POINTS[mission]];
    if (core && !points.some(([k]) => k === CORE_POINT[0])) points.push(CORE_POINT);
    const contrib = {};
    let total = 0;
    for (const [point, dir] of points) {
      const table = STAT_MAP[point];
      const norm = Object.values(table).reduce((s, w) => s + Math.abs(w), 0);
      for (const key of Object.keys(table)) {
        const c = (dir * table[key] * statU(stats[seat], key)) / norm / points.length;
        contrib[key] = (contrib[key] ?? 0) + c;
        total += c;
      }
    }
    const profile = heroProfileOf(heroLookup, seat);
    const heroFit = profile !== null && Object.hasOwn(MISSION_HERO_FIT[mission], profile) ? MISSION_HERO_FIT[mission][profile] : 0;
    const score = fix(clamp(total + heroFit * HERO_FIT_STEP, -1, 1));
    const keys = Object.keys(contrib).sort();
    let strongest = null, weakest = null;
    for (const k of keys) {
      if (contrib[k] > 1e-9 && (strongest === null || contrib[k] > contrib[strongest] + 1e-12)) strongest = k;
      if (contrib[k] < -1e-9 && (weakest === null || contrib[k] < contrib[weakest] - 1e-12)) weakest = k;
    }
    out[seat] = Object.freeze({ mission, core, grade: gradeOf(score), score, strongest, weakest, hero: Object.freeze({ profile, fit: heroFit }) });
  }
  return Object.freeze(out);
}

// ════════════════════════════════════════════════════════════════════════════
//  3. 配合度負擔
// ════════════════════════════════════════════════════════════════════════════
const STD = STANDARD_OPP_TACTIC;
export const COORDINATION = Object.freeze({
  split: 2, invade: 2, invadeWithMid: 1, roam: 1.5, protect: 0.5, fastTempo: 1, core: 1,
  groupingPerPoint: 4, aggressionPerPoint: 3, objectivePerPoint: 2,
  capacityBase: 5, capacityPerU: 2.5, capacityMin: 1, capacityMax: 10,
});

/**
 * 配合度負擔。3a 只顯示（load > capacity 不會改變比賽）。
 * @returns {null | { load:number, capacity:number, over:boolean, items:Array<{id:string, weight:number}> }}
 *   capacity 由全隊 synergy 與 comms 的平均推導；沒有選手資料＝中性隊伍。
 */
export function coordinationLoad(binding, seatPlayers) {
  const r = resolved(binding);
  if (!r) return null;
  const C = COORDINATION, { macro: m, objectives: o, lanePlan: lp, economy: e } = r.config;
  const knobs = toEngineTactic(r.config);
  const items = [];
  const add = (id, weight) => { if (weight > 1e-9) items.push(Object.freeze({ id, weight: fix(weight) })); };
  add("split", knobs.splitLane ? C.split : 0);
  add("invade", lp.jungle === "invade" ? C.invade : 0);
  add("invadeWithMid", knobs.invadeWithMid ? C.invadeWithMid : 0);
  add("roam", lp.support === "roam" ? C.roam : 0);
  add("protect", lp.support === "protect" ? C.protect : 0);
  add("fastTempo", m.tempo === "fast" ? C.fastTempo : 0);
  add("core", e.carryPriority !== "balanced" ? C.core : 0);
  add("grouping", Math.max(0, m.grouping - STD.macro.grouping) * C.groupingPerPoint);
  add("aggression", Math.max(0, m.aggression - STD.macro.aggression) * C.aggressionPerPoint);
  for (const k of ["dragonPriority", "baronPriority", "towerPriority"]) add(k, Math.max(0, o[k] - STD.objectives[k]) * C.objectivePerPoint);
  const load = fix(items.reduce((s, x) => s + x.weight, 0));
  const stats = statsBySeat(seatPlayers);
  const mean = (key) => SEATS.reduce((s, seat) => s + statU(stats[seat], key), 0) / SEATS.length;
  const capacity = fix(clamp(C.capacityBase + C.capacityPerU * (mean("synergy") + mean("comms")), C.capacityMin, C.capacityMax));
  return Object.freeze({ load, capacity, over: load > capacity, items: Object.freeze(items) });
}

// ════════════════════════════════════════════════════════════════════════════
//  4. 矛盾提示
// ════════════════════════════════════════════════════════════════════════════
//  when：每一項是 [維度, 選擇]；全部成立才提示。「成立」＝這份計畫在該維度的有效選擇（明確選的，否則模板＋覆蓋層自己的）。
//  evidence：G-A7 結果表裡 std／藍方的那一筆（dimension, choice, metric）；gate 逐條核對它存在、方向相符且達到門檻。
//  ⚠ 文案只能轉述那兩筆量到的事（各自往哪個方向變），不得描述「兩個一起選會發生什麼」——兩個選擇同時啟用的結果沒有量過。
const ev = (dimension, choice, metric) => Object.freeze({ dimension, choice, metric });
export const CONTRADICTION_RULES = Object.freeze([
  {
    id: "split_top_vs_aggressive_fights",
    when: [["lanes.top.stance", "split"], ["teamfight.posture", "aggressive"]],
    evidence: [ev("lanes.top.stance", "split", "seatFightEntriesPerMin.b1"), ev("teamfight.posture", "aggressive", "engageDecisionsPerMin")],
    text: "隊伍主動接戰的次數變多，但上路在帶線、參與團戰的次數變少：這兩個選擇的方向相反。",
  },
  {
    id: "split_mid_vs_aggressive_fights",
    when: [["lanes.mid.stance", "split"], ["teamfight.posture", "aggressive"]],
    evidence: [ev("lanes.mid.stance", "split", "seatFightEntriesPerMin.b3"), ev("teamfight.posture", "aggressive", "engageDecisionsPerMin")],
    text: "隊伍主動接戰的次數變多，但中路在帶線、參與團戰的次數變少：這兩個選擇的方向相反。",
  },
  {
    id: "cautious_vs_aggressive_fights",
    when: [["risk.tolerance", "cautious"], ["teamfight.posture", "aggressive"]],
    evidence: [ev("risk.tolerance", "cautious", "retreatStartsPerMin"), ev("teamfight.posture", "aggressive", "engageDecisionsPerMin")],
    text: "隊伍主動接戰的次數變多，同時撤退的次數也變多：這兩個選擇的方向相反。",
  },
  {
    id: "invade_vs_passive_fights",
    when: [["jungle.focus", "invade"], ["teamfight.posture", "passive"]],
    evidence: [ev("jungle.focus", "invade", "invasionsActed"), ev("teamfight.posture", "passive", "engageDecisionsPerMin")],
    text: "打野入侵對方野區的次數變多，但隊伍主動接戰的次數變少：這兩個選擇的方向相反。",
  },
  {
    id: "bot_pressure_vs_farm_jungle",
    when: [["lanes.bot.stance", "aggressive"], ["jungle.focus", "farm"]],
    evidence: [ev("lanes.bot.stance", "aggressive", "laneForward.bot"), ev("jungle.focus", "farm", "ganksPerMin")],
    text: "下路的站位更靠前，但打野出來抓人的次數變少：這兩個選擇的方向相反。",
  },
  {
    id: "siege_vs_passive_fights",
    when: [["objectives.tower", "high"], ["teamfight.posture", "passive"]],
    evidence: [ev("objectives.tower", "high", "siegeWindowsPerMin"), ev("teamfight.posture", "passive", "engageDecisionsPerMin")],
    text: "隊伍集合推塔的次數變多，但主動接戰的次數變少：這兩個選擇的方向相反。",
  },
].map((r) => Object.freeze({ ...r, when: Object.freeze(r.when.map((w) => Object.freeze(w))), evidence: Object.freeze(r.evidence) })));

/** 這份計畫在每個 live 維度的有效選擇（明確選的優先，否則是模板＋覆蓋層自己的；對不到任何選擇＝null）。 */
export function effectiveChoices(binding) {
  const r = resolved(binding);
  if (!r) return null;
  const explicit = Object.fromEntries(leavesOf(r.plan.choices));
  const out = {};
  //  描述的是計畫本身（與規則集無關）⇒ 每時期維度（只在 Director core.v1 可選）也列出；沒選就是不覆寫的本來值。
  for (const row of tacticBookOptions(r.plan.templateId, r.plan.overlayIds, r.plan.choices, { tacticalDirector: "core.v1" })) {
    out[row.dimension] = Object.hasOwn(explicit, row.dimension) ? explicit[row.dimension] : row.own;
  }
  return Object.freeze(out);
}

/**
 * 被複驗撤下的證據 ⇒ 規則不回報（推導式，規則資料原樣保留：複驗清單變了，規則自動恢復）。
 * 一條規則只要有任何一筆 evidence 的（維度, 選擇）在撤下清單裡，文案就會把「複驗沒站住的效果」當事實講，所以整條不回報。
 * @param {ReadonlyArray<{template:string,dimension:string,choice:string}>} withheld  預設＝Registry 的 REPLICATION_WITHHELD（測試可注入）
 */
//  只看「沒站住」的撤下（reason not_replicated；測試注入的清單沒有 reason 時視同）：owner_hold 是複驗 confirmed、Owner 暫緩提供，證據本身成立。
export const ruleSuppressed = (rule, templateId, withheld = REPLICATION_WITHHELD) =>
  rule.evidence.some((e) => withheld.some((w) => (w.reason ?? "not_replicated") === "not_replicated" && w.dimension === e.dimension && w.choice === e.choice && (w.template === "*" || w.template === templateId)));
/** 在這份撤下清單下被抑制的規則 id（規則表順序；gate 用它對 REPLICATION_WITHHELD 推導出的集合）。 */
export const suppressedRuleIds = (templateId = "std", withheld = REPLICATION_WITHHELD) => CONTRADICTION_RULES.filter((r) => ruleSuppressed(r, templateId, withheld)).map((r) => r.id);

/**
 * 矛盾提示。
 * @returns {Array<{ id:string, text:string }>}  規則表的順序（扣掉證據被複驗撤下的規則）；輸入不合法 ⇒ []
 */
export function contradictions(binding, withheld = REPLICATION_WITHHELD) {
  const eff = effectiveChoices(binding);
  if (!eff) return [];
  const templateId = resolved(binding)?.plan?.templateId;
  return CONTRADICTION_RULES
    .filter((rule) => !ruleSuppressed(rule, templateId, withheld))
    .filter((rule) => rule.when.every(([dim, choice]) => eff[dim] === choice))
    .map((rule) => Object.freeze({ id: rule.id, text: rule.text }));
}
