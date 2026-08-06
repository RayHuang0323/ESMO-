// ============================================================================
//  platform/economy/timeline.js — 統一的日／週／賽季時間軸（Milestone N）
//
//  ── 為什麼需要這支 ────────────────────────────────────────────────────────
//  Milestone N 之前，主幹**沒有時鐘**：
//    · `advanceTrainingDay()` 會把 `meta.days` +1 並推導 `meta.week`，
//      但那是訓練功能的副作用，不是時間軸。
//    · `activeSponsor.weeksLeft` 簽約時設好之後**永遠不遞減**，合約不會到期。
//    · `finance.weeklyIncome` / `weeklyCost` **從未入帳**，只是顯示用的種子值。
//  ⇒ 錢只會因為比賽獎金增加，不會因為經營而變動。
//
//  本檔是時間的**唯一換算來源**：day → week → season 全部由 `meta.days` 導出，
//  不另存第二份週次／賽季計數（避免兩邊不同步——那是 S23 team.lv/xp 踩過的坑）。
//
//  純函式：不 import React / zustand / localStorage ⇒ 可直接 Node 測試。
// ============================================================================

/** 一週天數。改這個值會連動所有週結算的節奏。 */
export const DAYS_PER_WEEK = 7;
/** 一個賽季的週數。12 週 ≈ 一般電競賽季長度。 */
export const WEEKS_PER_SEASON = 12;

/**
 * 由「累計天數」導出完整時間座標。
 *
 * `days` 的語意沿用既有 `meta.days`：**第 1 天 = days 1**（種子值是 8，代表第 8 天）。
 * 因此 week / season 都用 (days - 1) 先歸零再除，week 與 season 都從 1 起算。
 *
 * @param {number} days 累計天數（≥1）
 * @returns {{day:number, week:number, season:number, dayOfWeek:number, weekOfSeason:number}}
 *   · day          累計天數
 *   · week         累計週次（1 起算，跨賽季不重置 ⇒ 週結算的冪等鍵用它，全域唯一）
 *   · season       賽季（1 起算）
 *   · dayOfWeek    本週第幾天（1–7）
 *   · weekOfSeason 本賽季第幾週（1–WEEKS_PER_SEASON）
 */
export function deriveTime(days) {
  const d = Math.max(1, Math.floor(Number(days) || 1));
  const week = Math.floor((d - 1) / DAYS_PER_WEEK) + 1;
  const season = Math.floor((week - 1) / WEEKS_PER_SEASON) + 1;
  return {
    day: d,
    week,
    season,
    dayOfWeek: ((d - 1) % DAYS_PER_WEEK) + 1,
    weekOfSeason: ((week - 1) % WEEKS_PER_SEASON) + 1,
  };
}

/**
 * 從 `fromDays` 推進到 `toDays` 之間，**跨過了哪些週的結尾**。
 *
 * 週結算的觸發點定義為「這一週的最後一天結束時」⇒ 回傳的是**已完整結束**的週次。
 * 例：days 7 → 8 跨過第 1 週結尾 ⇒ [1]；days 8 → 22 ⇒ [2, 3]。
 * 這樣一次推進多天也不會漏結算或重複結算。
 *
 * @returns {number[]} 需要結算的週次（遞增；可能為空）
 */
export function weeksCompletedBetween(fromDays, toDays) {
  const a = deriveTime(fromDays).week;
  const b = deriveTime(toDays).week;
  const out = [];
  for (let w = a; w < b; w++) out.push(w);
  return out;
}
