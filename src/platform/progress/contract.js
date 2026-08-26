// ============================================================================
//  platform/progress/contract.js — 合約生命週期（V6-2）
//
//  ── 現況：欄位早就在，只是沒有人動它 ──────────────────────────────────────
//  `players[].contract`（天）從 Legacy 就存在（開局五人 365/280/400/350/300），
//  `ui/playerProfileFoundation.contractPresentationOf` 也早就在顯示它、
//  在 ≤30 天時標 `attention`。**但全 repo 沒有任何地方讓它倒數。**
//  V6-2 只是把那條線接上，並定義到期會發生什麼。
//
//  ── 關鍵裁決：每天倒數，但**到期只在年度邊界結算** ───────────────────────
//  日中生效等於「選手在某個星期三突然不見」，正是紅線要擋的事。
//  而且退休本來就只在年度邊界發生——兩件事放在同一個點，先後才定義得出來。
//
//  ⇒ **優先順序：退休先於合約到期。**
//    已經退役的人不會再「因為合約到期離隊」（他根本已經不在名單裡）；
//    而宣布過退役意向的人**不得續約**——他要離開這個運動，不只是離開這支隊。
//
//  ── 名單地板 ──────────────────────────────────────────────────────────────
//  沿用 V5-3 的做法：**離隊照發生**，人數不足時由免費補位頂上。
//  「人不夠就別讓他走」可以被反向利用，而且會讓合約失去意義。
//
//  ⚠ 本輪不做轉會市場（V6-3），也不做談判 AI——續約就是一個明碼標價的決定。
//  ⚠ 純函式：不 import Store / React / localStorage。
// ============================================================================
import { STAT_DEF } from "../../data/playerModel.js";
import { marketValueOf } from "../economy/marketValue.js";

export const CONTRACT_VERSION = "ContractLifecycle.v1";

export const CONTRACT = Object.freeze({
  /** 剩餘天數低於此 ⇒ `expiring`（預告）。一個生涯年度 ⇒ 玩家有整整一年可決定。 */
  warnWithinDays: 84,
  /** 續約長度（天）。 */
  renewDays: 365,
  /** 續約金 = 市場價值 × 此比例。年輕高潛比較貴——與 V4 的估值直接接軌。 */
  renewCostRate: 0.5,
  rosterFloor: 5,
  academy: Object.freeze({ statLow: 40, statHigh: 52, ageLow: 17, ageHigh: 19, potentialBonus: 22 }),
});

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const hasContract = (p) => p?.contract != null && Number.isFinite(Number(p.contract));

function hash32(input) {
  const s = String(input);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
const rand = (key) => (hash32(key) % 10_000) / 10_000;

/** 合約剩餘天數。沒有這個欄位 ⇒ `null`（**不憑空給一份合約**）。 */
export const contractDaysOf = (player) => (hasContract(player) ? Math.max(0, num(player.contract)) : null);

/** `none`（沒有合約資料）／`active`／`expiring`（預告中）／`expired`。 */
export function contractStatusOf(player) {
  const d = contractDaysOf(player);
  if (d === null) return "none";
  if (d <= 0) return "expired";
  return d <= CONTRACT.warnWithinDays ? "expiring" : "active";
}

/**
 * 讓合約隨世界時間倒數。**純 reducer。**
 *
 * ⚠ **只倒數，不動名單**——移除是 `resolveContractExpiries` 在年度邊界的事。
 * ⚠ 一次減 N 天 ≡ 逐日各減 1 天 ⇒ 快轉與逐日推進逐值相同。
 */
export function tickContracts(state, { days = 1 } = {}) {
  const n = Math.max(0, Math.floor(num(days)));
  if (n === 0) return { state, ticked: false };
  const players = (state?.players ?? []).map((p) => (
    hasContract(p) ? { ...p, contract: Math.max(0, num(p.contract) - n) } : p
  ));
  return { state: { ...state, players }, ticked: true };
}

/** 續約金（萬）。與 V4 的市場價值同源 ⇒ 年輕高潛比較貴、老將比較便宜。 */
export const renewCostOf = (player) =>
  Math.round(marketValueOf(player) * CONTRACT.renewCostRate * 10) / 10;

/** 免費補位（與 V5-3 的青訓同一個形狀：年輕、明顯較弱）。 */
function academyPlayer(seedKey, index) {
  const a = CONTRACT.academy;
  const stats = {};
  for (const { key } of STAT_DEF) stats[key] = Math.round(a.statLow + rand(`${seedKey}|${index}|${key}`) * (a.statHigh - a.statLow));
  const base = Math.round(Object.values(stats).reduce((s, v) => s + v, 0) / STAT_DEF.length);
  return {
    id: `academy:contract:${seedKey}:${index}`,
    name: `青訓 ${index + 1} 號`, role: "中路",
    age: Math.round(a.ageLow + rand(`${seedKey}|${index}|age`) * (a.ageHigh - a.ageLow)),
    potential: clamp(base + a.potentialBonus, 50, 95),
    lv: 1, xp: 0, energy: 100, morale: 70, stats,
    contract: CONTRACT.renewDays, fromAcademy: true,
  };
}

/**
 * 年度邊界：合約已經歸零的人離隊，然後補足名單地板。**純 reducer、冪等。**
 *
 * ⚠ 必須跑在退休結算**之後**——已經退役的人不在名單裡，不會被結算第二次。
 */
export function resolveContractExpiries(state, { careerYear = 1 } = {}) {
  const departed = [], kept = [];
  for (const p of state?.players ?? []) {
    if (contractStatusOf(p) === "expired") departed.push(p.id);
    else kept.push(p);
  }
  const promoted = [];
  //  ⚠ 缺額要**先算好**。把 `CONTRACT.rosterFloor - kept.length` 直接寫在迴圈條件裡
  //    會邊補邊縮短上界（補一個、缺額少一個）⇒ 只補到一半。
  const short = Math.max(0, CONTRACT.rosterFloor - kept.length);
  for (let i = 0; i < short; i++) {
    const fresh = academyPlayer(`c${careerYear}`, i);
    promoted.push(fresh.id);
    kept.push(fresh);
  }
  if (!departed.length && !promoted.length) return { state, departed: [], promoted: [] };
  return { state: { ...state, players: kept }, departed, promoted };
}

/**
 * 續約。**明碼標價，沒有談判**。
 * @returns {{ok:boolean, state:object, cost:number, reason:string|null}}
 */
export function renewContract(state, playerId, { careerYear = 1 } = {}) {
  const p = (state?.players ?? []).find((x) => x.id === playerId);
  if (!p) return { ok: false, state, cost: 0, reason: "找不到這名選手" };
  //  ⚠ 宣布過退役意向的人不得續約——優先順序在這裡也要成立。
  if (Number.isFinite(Number(p?.retirement?.intentYear))) {
    return { ok: false, state, cost: 0, reason: `${p.name ?? p.id} 已表達退役意向，無法續約` };
  }
  const cost = renewCostOf(p);
  const players = state.players.map((x) => (
    x.id === playerId ? { ...x, contract: num(x.contract) + CONTRACT.renewDays } : x
  ));
  return { ok: true, state: { ...state, players }, cost, reason: null };
}

/** 畫面的單一讀取點。 */
export function contractViewOf(state) {
  const list = (state?.players ?? []).map((p) => ({
    id: p.id, name: p.name ?? p.id, days: contractDaysOf(p), status: contractStatusOf(p),
  }));
  return {
    version: CONTRACT_VERSION,
    expiring: list.filter((x) => x.status === "expiring"),
    expired: list.filter((x) => x.status === "expired"),
  };
}
