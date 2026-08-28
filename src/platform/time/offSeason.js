// ============================================================================
//  platform/time/offSeason.js — 生涯年度邊界（Season vNext V5-1）
//
//  ── 這一層要解決什麼 ──────────────────────────────────────────────────────
//  V2 建了年度邊界，但它只做一件事（age +1），而且**沒有留下任何紀錄**：
//  跨過去之後，沒有人知道第 N 年度發生過，也沒有地方讓後續的評估掛載。
//  V5-1 把那個瞬間變成**有紀錄、可冪等、可驗證**的邊界。
//
//  ── 為什麼冪等鍵是年度編號 ────────────────────────────────────────────────
//  照抄週結算已經驗證過的形狀（`economy.settledWeeks[week]` ＋ `lastSettledWeek`）。
//  年度編號是**世界時間的推導值**，不是計數器 ⇒ 重整、重讀存檔、重複呼叫，
//  都不可能讓同一年被封存兩次。
//
//  ── 為什麼 `sealedOnDay` 用推導值而不是實際傳進來的 `toDay` ────────────────
//  用 `toDay` 的話，「一次跳 10 天跨過邊界」與「逐日跨過邊界」會寫下不同的數字
//  （89 vs 85）⇒ 快轉與逐日推進的結果就不再逐值相同，V3 好不容易立起來的保證
//  會在這裡破功。⇒ 一律用 `該年度最後一天 + 1`，與怎麼走到那裡無關。
//
//  ⚠ 本檔**只吃 `meta.days`，不吃 mode** ⇒ MOBA / CS 結構上不可能各觸發一次。
//  ⚠ 本輪**只做前兩步**（見 `IMPLEMENTED_STEPS`）。其餘七步是宣告出來的掛載點，
//    刻意先寫進契約，讓後續不必回頭改形狀。
//  ⚠ 純函式：不 import Store / React / localStorage。
// ============================================================================
import { careerYearOf, CAREER_YEAR } from "./worldClock.js";

export const OFF_SEASON_VERSION = "OffSeason.v1";

/**
 * 年度邊界的完整序列。**本輪只實作前兩步**，其餘是宣告出來的掛載點。
 * 名稱刻意用中性詞（`departure*` 而不是 retire）——本輪連那個概念都還沒實作。
 */
export const OFF_SEASON_STEPS = Object.freeze([
  "sealYear",             //  年度封存　　　　✅ 本輪
  "ageRollover",          //  age +1　　　　　✅ 本輪（V2 已有，這裡只是宣告順序）
  "lifecycleEvaluation",  //  生涯評估
  "abilityDrift",         //  能力漂移
  "departureIntent",      //  離隊意向
  "departureResolve",     //  離隊結算
  "worldSync",            //  世界同步（對手世代交替）
  "talentMarket",         //  人才市場更新
  "decisionWindow",       //  決策視窗
]);

/**
 * **真正會執行**的步驟。不假裝九步都做了。
 * V5-1：`sealYear` / `ageRollover`　V5-2 追加：`abilityDrift` / `worldSync`
 */
export const IMPLEMENTED_STEPS = Object.freeze(["sealYear", "ageRollover", "abilityDrift", "departureIntent", "departureResolve", "worldSync"]);

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** 已封存的年度，依年度編號排序。舊存檔沒有這個欄位 ⇒ 空陣列。 */
export const sealedYearsOf = (meta) => {
  const rec = meta?.offSeason?.years;
  if (!rec || typeof rec !== "object") return [];
  return Object.values(rec).sort((a, b) => num(a?.careerYear) - num(b?.careerYear));
};

/** 這一年封存過了沒有。**這就是冪等鍵的查詢**。 */
export const isYearSealed = (meta, year) => Boolean(meta?.offSeason?.years?.[year]);

const averageAgeOf = (players) => {
  const ages = (players ?? []).map((p) => Number(p?.age)).filter((a) => Number.isFinite(a) && a > 0);
  if (!ages.length) return null;
  return Math.round((ages.reduce((s, a) => s + a, 0) / ages.length) * 10) / 10;
};

/**
 * 把 `from` → `to` 之間**跨過的每一個生涯年度**各封存一次。**純 reducer。**
 *
 * ⚠ 沒有跨過任何年度 ⇒ 回傳**同一個 state 參考**，呼叫端可以用 `===` 判斷。
 * ⚠ 已封存的年度直接跳過 ⇒ 重讀存檔、重複呼叫都不會再寫一次。
 *
 * @returns {{state:object, sealed:Array<object>}}
 */
export function sealCareerYears(state, { fromDay, toDay } = {}) {
  const from = Math.max(1, Math.floor(num(fromDay) || 1));
  const to = Math.max(from, Math.floor(num(toDay) || from));
  const fromYear = careerYearOf(from).year;
  const toYear = careerYearOf(to).year;
  const meta = state?.meta ?? {};
  const sealed = [];
  let years = meta.offSeason?.years ?? {};

  for (let y = fromYear; y < toYear; y++) {
    if (isYearSealed(meta, y)) continue;
    const endedOnDay = y * CAREER_YEAR.daysPerYear;
    const entry = {
      careerYear: y,
      endedOnDay,
      //  ⚠ 推導值，不是 `to`——見檔頭「為什麼不用 toDay」。
      sealedOnDay: endedOnDay + 1,
      rosterCount: (state?.players ?? []).length,
      averageAge: averageAgeOf(state?.players),
    };
    years = { ...years, [y]: entry };
    sealed.push(entry);
  }

  if (!sealed.length) return { state, sealed: [] };
  return {
    state: { ...state, meta: { ...meta, offSeason: { years, lastSealedYear: toYear - 1 } } },
    sealed,
  };
}

/** 畫面的**單一讀取點**。畫面不自己從 `meta` 挖紀錄。 */
export function offSeasonViewOf(state) {
  const list = sealedYearsOf(state?.meta);
  return {
    version: OFF_SEASON_VERSION,
    sealedCount: list.length,
    lastSealedYear: num(state?.meta?.offSeason?.lastSealedYear),
    latest: list.length ? list[list.length - 1] : null,
    currentYear: careerYearOf(num(state?.meta?.days) || 1).year,
    //  尚未實作的步驟。畫面據實顯示「這個邊界目前還沒有決策」。
    pendingSteps: OFF_SEASON_STEPS.filter((s) => !IMPLEMENTED_STEPS.includes(s)),
  };
}
