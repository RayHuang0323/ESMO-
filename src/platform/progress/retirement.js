// ============================================================================
//  platform/progress/retirement.js — 退休意向與退休（Season vNext V5-3）
//
//  ── 兩段式，預告是結構保證 ───────────────────────────────────────────────
//      第 N 年度邊界   宣布意向（「這可能是我的最後一年」）
//                          │  ← 玩家有**一整個生涯年度**可以找接班人
//      第 N+1 年度邊界  真的退休　或　撤回意向（延役）
//
//  ⚠ **沒有宣布過意向的人，永遠不會退休。** 不是靠自律——`resolveRetirements`
//    只看 `player.retirement.intentYear`，沒有那個欄位就不在候選名單裡。
//
//  ── 出賽率為什麼只能是小幅修正 ────────────────────────────────────────────
//  若出賽率權重夠大，玩家只要一直讓老將先發就能永久免疫退休，世代交替就沒了。
//  ⇒ 修正量有硬上限（`appearanceModifier`），而年齡項沒有上限地持續累加
//    ⇒ **全勤可以延緩，但擋不住年齡**（`check_retirement_v5` §I5 掃 33–45 歲釘住）。
//
//  ── 名單地板為什麼不是「延後退休」────────────────────────────────────────
//  「人不夠就別讓他退休」可以被反向利用：**永遠不補人 ⇒ 永遠沒有人退休**，
//  而且會讓退休失去意義。⇒ 退休**一律照常發生**，人數不足時由**免費但明顯較弱**
//  的青訓補位頂上：破產也不會卡死，而失去一名好手仍然是真的損失。
//
//  ⚠ 本輪不做合約／續約／談判／轉會市場／CS AI。
//  ⚠ 純函式：不 import Store / React / localStorage。
// ============================================================================
import { STAT_DEF } from "../../data/playerModel.js";
import { agingAgeOf } from "./ageDrift.js";

export const RETIREMENT_VERSION = "RetirementIntent.v1";

export const RETIREMENT = Object.freeze({
  /** 老化時鐘超過這裡才可能出現意向（**不是年齡牆**，只是機率的起點）。 */
  intentFromAgingAge: 31,
  /** 每超過一歲增加的機率。年齡是主因。 */
  chancePerYear: 0.10,
  /** 相對潛力每掉 1 點增加的機率。長期能力下滑是另一個主因。 */
  declineWeight: 0.006,
  /** 出賽率的**修正上限**（全勤 −此值，全板凳 +此值）。刻意很小。 */
  appearanceModifier: 0.08,
  maxChance: 0.80,
  /** 宣布過意向後，撤回（延役）的機率。 */
  withdrawChance: 0.28,
  maxRetirementsPerYear: 2,
  /** 可出賽人數的地板。低於此由青訓補位頂上。 */
  rosterFloor: 5,
  /** 青訓補位的能力區間（刻意低於一般新秀）。 */
  academy: Object.freeze({ statLow: 40, statHigh: 52, ageLow: 17, ageHigh: 19, potentialBonus: 22 }),
});

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const hasAge = (p) => p?.age != null && Number.isFinite(Number(p.age));

function hash32(input) {
  const s = String(input);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
/** 決定性 [0,1)：同一個（選手, 年度, 用途）永遠得到同一個數。 */
const roll = (playerId, year, tag) => (hash32(`${playerId}|${year}|${tag}`) % 10_000) / 10_000;

const overallOf = (p) => {
  const s = p?.stats ?? {};
  const keys = STAT_DEF.map((d) => d.key);
  return keys.reduce((acc, k) => acc + (num(s[k]) || 50), 0) / keys.length;
};

/**
 * 這名選手今年宣布退休意向的機率。
 * @param {{appearanceRatio?:number}} [ctx] 近一年出賽比例 0–1（**小幅**修正）
 */
export function intentChanceOf(player, { appearanceRatio = 0.5 } = {}) {
  if (!hasAge(player)) return 0;
  const over = agingAgeOf(player) - RETIREMENT.intentFromAgingAge;
  if (over <= 0) return 0;
  const gap = Math.max(0, num(player.potential) - overallOf(player));
  const base = over * RETIREMENT.chancePerYear + gap * RETIREMENT.declineWeight;
  //  ⚠ 出賽率只**平移**，不縮放 ⇒ 年齡項繼續無上限累加，全勤也擋不住。
  const shifted = base - (clamp(appearanceRatio, 0, 1) - 0.5) * 2 * RETIREMENT.appearanceModifier;
  return clamp(Math.round(shifted * 1000) / 1000, 0, RETIREMENT.maxChance);
}

/**
 * 年度邊界：評估誰宣布退休意向。**純 reducer、決定性。**
 * @returns {{state:object, declared:string[]}}
 */
export function evaluateIntents(state, { careerYear = 1, appearanceOf = null } = {}) {
  const declared = [];
  const players = (state?.players ?? []).map((p) => {
    if (p?.retirement?.intentYear) return p;                 // 已宣布過，不重複宣布
    const ratio = typeof appearanceOf === "function" ? appearanceOf(p) : 0.5;
    const chance = intentChanceOf(p, { appearanceRatio: ratio });
    if (chance <= 0 || roll(p?.id, careerYear, "intent") >= chance) return p;
    declared.push(p.id);
    return { ...p, retirement: { intentYear: careerYear } };
  });
  if (!declared.length) return { state, declared: [] };
  return { state: { ...state, players }, declared };
}

/** 青訓補位：免費、年輕、**明顯較弱**。 */
function academyPlayer(seedKey, index) {
  const a = RETIREMENT.academy;
  const r = (t) => (hash32(`${seedKey}|${index}|${t}`) % 10_000) / 10_000;
  const stats = {};
  for (const { key } of STAT_DEF) stats[key] = Math.round(a.statLow + r(key) * (a.statHigh - a.statLow));
  const base = Math.round(Object.values(stats).reduce((s, v) => s + v, 0) / STAT_DEF.length);
  return {
    id: `academy:${seedKey}:${index}`,
    name: `青訓 ${index + 1} 號`,
    role: "中路",
    age: Math.round(a.ageLow + r("age") * (a.ageHigh - a.ageLow)),
    potential: clamp(base + a.potentialBonus, 50, 95),
    lv: 1, xp: 0, energy: 100, morale: 70, stats,
    fromAcademy: true,
  };
}

/**
 * 年度邊界：把**去年（或更早）就宣布過意向**的人結算掉——退休或延役，
 * 然後補足名單地板。**純 reducer、決定性、同一年重跑不會退兩批。**
 *
 * @returns {{state, retired:string[], withdrew:string[], promoted:string[]}}
 */
export function resolveRetirements(state, { careerYear = 1 } = {}) {
  //  ⚠ 年度守衛（形狀與 `offSeason` 的封存冪等鍵一致）。
  //    沒有它，被「每年上限」延後的人會在第二次呼叫時又被結算一次
  //    ——Store 那邊雖然已由 V5-1 的封存冪等擋住，但這支是純函式，
  //    重複呼叫本來就該是 no-op，不該依賴呼叫端小心。
  if (num(state?.meta?.retirement?.lastResolvedYear) >= careerYear) {
    return { state, retired: [], withdrew: [], promoted: [] };
  }
  const retired = [], withdrew = [];
  const kept = [];
  for (const p of state?.players ?? []) {
    const declaredYear = Number(p?.retirement?.intentYear);
    //  ⚠ 紅線：沒宣布過 ⇒ 不在候選名單裡。同一年宣布同一年退休也不允許。
    if (!Number.isFinite(declaredYear) || declaredYear >= careerYear) { kept.push(p); continue; }
    if (retired.length >= RETIREMENT.maxRetirementsPerYear) { kept.push(p); continue; }
    if (roll(p.id, careerYear, "withdraw") < RETIREMENT.withdrawChance) {
      withdrew.push(p.id);
      const { retirement, ...rest } = p;                     // 撤回意向，人留下
      kept.push(rest);
      continue;
    }
    retired.push(p.id);
  }
  const promoted = [];
  const short = RETIREMENT.rosterFloor - kept.length;
  for (let i = 0; i < short; i++) {
    const fresh = academyPlayer(`y${careerYear}`, i);
    promoted.push(fresh.id);
    kept.push(fresh);
  }
  const meta = { ...(state?.meta ?? {}), retirement: { lastResolvedYear: careerYear } };
  return { state: { ...state, players: kept, meta }, retired, withdrew, promoted };
}

/** 畫面的單一讀取點：誰宣布了、宣布在哪一年。 */
export function retirementViewOf(state) {
  const pending = (state?.players ?? [])
    .filter((p) => Number.isFinite(Number(p?.retirement?.intentYear)))
    .map((p) => ({ id: p.id, name: p.name ?? p.id, age: num(p.age), intentYear: Number(p.retirement.intentYear) }));
  return { version: RETIREMENT_VERSION, pending, pendingCount: pending.length };
}
