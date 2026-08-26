// ============================================================================
//  platform/time/careerYearRollover.js — 生涯年度跨越（Season vNext V2）
//
//  ── 這一層要解決什麼 ──────────────────────────────────────────────────────
//  V1 立好了「84 天 = 一個生涯年度」的邊界，但**沒有人在跨過它的時候做事**。
//  年齡必須跟著**共同的世界年度**走，不得綁在：
//    · MOBA 賽季 rollover
//    · CS 賽季 rollover
//    · 玩家有沒有按「下一季」
//  否則兩個項目各換一次季，年齡就會被推兩次；而不打季賽的人永遠不老。
//
//  ⇒ 觸發點**只有一個**：`profileStore.advanceDay`（唯一的時鐘）。
//    它知道推進前後的 `meta.days`，跨了幾個年度是算出來的，不是猜的。
//
//  ── 為什麼跨越要用「年度編號差」而不是「天數差 / 84」 ─────────────────────
//  天數差會在邊界上算錯：Day 84 → 85 只跨了 1 個年度，但 (85−84)/84 = 0。
//  反過來 Day 1 → 168 是 (168−1)/84 = 1，實際上也是 1，看起來對——
//  但 Day 80 → 90 是 0，實際上跨了。⇒ 一律比**年度編號**，與 `careerYearOf` 同源。
//
//  ⚠ 本輪**只做 age +1**。沒有能力衰退、沒有退休、沒有生涯階段效果、
//    沒有 Off-season，也**不讓 AI 隊伍老化**（AI turnover 是 V6）。
//  ⚠ 純函式：不 import Store / React / localStorage。
// ============================================================================
import { careerYearOf, CAREER_YEAR } from "./worldClock.js";

/**
 * 從 `from` 天推進到 `to` 天，跨過了幾個生涯年度。
 * 倒退或原地一律回 0（世界時間不會倒退，但不得因此炸掉）。
 */
export function careerYearsCrossed(from, to) {
  return Math.max(0, careerYearOf(to).year - careerYearOf(from).year);
}

/**
 * 跨年度時把選手年齡往前推。**純 reducer。**
 *
 * ⚠ 沒跨年度 ⇒ 回傳**同一個 state 參考**，呼叫端可以用 `===` 判斷有沒有事發生。
 * ⚠ 缺 `age` 的舊存檔**不補假年齡**——不虛構資料，欄位原樣帶過。
 *
 * @returns {{state:object, yearsCrossed:number, aged:number, toYear:number}}
 */
export function applyCareerYearRollover(state, { fromDay, toDay } = {}) {
  const yearsCrossed = careerYearsCrossed(fromDay, toDay);
  const toYear = careerYearOf(toDay).year;
  if (yearsCrossed <= 0) return { state, yearsCrossed: 0, aged: 0, toYear };

  let aged = 0;
  const players = (state?.players ?? []).map((p) => {
    //  ⚠ 不能只寫 `!Number.isFinite(Number(p?.age))`：`Number(null)` 是 **0**（有限），
    //    於是 `age: null` 的舊存檔會被悄悄變成 1 歲。先擋掉 null / undefined。
    if (p?.age == null || !Number.isFinite(Number(p.age))) return p;   // 沒有年齡就不編一個
    aged += 1;
    return { ...p, age: Number(p.age) + yearsCrossed };
  });
  return { state: { ...state, players }, yearsCrossed, aged, toYear };
}

/** 跨年度的收件匣通知（決定性內容；id 由呼叫端的 `pushInbox` 決定）。 */
export const careerYearNotice = ({ toYear, aged }) => ({
  type: "season", from: "戰隊管理處",
  subject: `進入第 ${toYear} 生涯年度`,
  text: `世界時間跨過了第 ${CAREER_YEAR.daysPerYear} 天，全隊 ${aged} 名選手年齡 +1。`,
});
