// ============================================================================
//  platform/time/worldClock.js — 世界時間契約（Season vNext V1）
//
//  ── 這一層要解決什麼 ──────────────────────────────────────────────────────
//  `meta.days` 一直是唯一的時鐘（寫入點全 repo 只有「週結算」與「開新局」兩處），
//  但它**沒有擁有者**：正式 UI 唯一推得動它的地方是訓練中心的「推進訓練日」，
//  而那顆按鈕第一行是
//        if (training.length === 0) { push("無選手在訓練中"); return; }
//  ⇒ **沒有人在訓練，世界就完全停住。** 不是推得慢，是零。
//  （TD-34 記的是「只靠訓練推進」，實測比記載更嚴重。）
//
//  本檔**不新增第二個時鐘**，只把三件原本靠慣例的事變成可驗證的宣告：
//    ① **誰有權推進**  `ADVANCE_REASONS` / `PRODUCTION_REASONS`
//    ② **哪些活動屬於世界時間**  `WORLD_TIME_COST`
//    ③ **生涯年度邊界**  `CAREER_YEAR` / `careerYearOf`（給未來的年齡系統用）
//
//  ── 為什麼年度邊界要有名字 ────────────────────────────────────────────────
//  專案裡有**兩個同長但不同錨**的「賽季」：
//    · `timeline.deriveTime().season`  世界年度，84 天，錨在第 1 天
//    · `seasonState` 的賽事賽季        `SEASON_DAYS = 84`，錨在**建立當天**
//  `seasonState` 的註解自己承認兩者「本來就會逐季偏移」。
//  未來的年齡系統必須用**世界年度**——賽季容器不得控制選手時間。
//  這裡把它命名出來，並保證與 `deriveTime` 同源。
//
//  ⚠ **常數不在這裡重寫。** 84 是 `DAYS_PER_WEEK × WEEKS_PER_SEASON` 算出來的；
//    改 `timeline.js` 會連動這裡，不會出現兩個 84 各自漂移。
//  ⚠ 純契約：不 import Store / React / localStorage。
//  ⚠ 本輪**不動選手年齡**（沒有 age +1 / 衰退 / 退休），只把邊界立起來。
// ============================================================================
import { DAYS_PER_WEEK, WEEKS_PER_SEASON, deriveTime } from "../economy/timeline.js";

//  ⚠ 年度長度只在這一行算一次。`CAREER_YEAR` 的三個欄位都指回同一組來源，
//    不得出現「`weeksPerYear` 改了但 `daysPerYear` 沒跟著動」這種內部不一致。
const DAYS_PER_CAREER_YEAR = DAYS_PER_WEEK * WEEKS_PER_SEASON;

/** 生涯年度邊界。**由 timeline 常數推導**，不是第二份定義。 */
export const CAREER_YEAR = Object.freeze({
  daysPerWeek: DAYS_PER_WEEK,
  weeksPerYear: WEEKS_PER_SEASON,
  daysPerYear: DAYS_PER_CAREER_YEAR,
});

/**
 * 誰有權推進世界時間。
 *
 * · `training` 訓練中心推進訓練日（既有）
 * · `rest`     休整／什麼都不做也要能過日子 —— **這一條就是解凍的關鍵**
 * · `schedule` 推進到下一場賽程
 * · `dev`      DEV 工具（`DevQuickRecovery`）。**不算正式推進權**，上線前移除
 */
export const ADVANCE_REASONS = Object.freeze({
  training: "training",
  rest: "rest",
  schedule: "schedule",
  dev: "dev",
});

/** 正式玩法可用的推進理由（DEV 不在其中）。 */
export const PRODUCTION_REASONS = Object.freeze([
  ADVANCE_REASONS.training, ADVANCE_REASONS.rest, ADVANCE_REASONS.schedule,
]);

export const isAdvanceReason = (r) => typeof r === "string" && r in ADVANCE_REASONS;
export const isProductionAdvance = (r) => PRODUCTION_REASONS.includes(r);

/**
 * 活動 → 消耗幾天世界時間。
 *
 * ⚠ `competitive: null` 是**明確未定案**，不是漏填也不是 0。
 *   產品要求「一般競技比賽未來要能合理消耗時間，但不要簡單做成打一場 = +1 天」
 *   ⇒ 真正的成本要等 V2 Time Block 才有 Block 可言。用 `null` 而不是 0，
 *   是為了讓之後的人分得出「決定不消耗」與「還沒決定」。
 *
 * ⚠ `official: 0` 不是「正式賽不重要」：賽程日是**日曆帶到**的
 *   （`absoluteDayOf` = 賽季起始日 + 賽程日 − 1），不是比賽去推日曆。
 *   反過來做會讓賽程與世界日期互相追著跑。
 */
export const WORLD_TIME_COST = Object.freeze({
  training: 1,
  rest: 1,
  practice: 0,
  official: 0,
  competitive: null,
});

/** 這個活動會不會消耗世界時間。未定案一律先當成不消耗（保守）。 */
export const consumesWorldTime = (kind) => (Number(WORLD_TIME_COST[kind]) || 0) > 0;

/** 這個活動的時間成本**定案了沒有**。`null` ⇒ 尚未決定。 */
export const isWorldTimeCostDecided = (kind) =>
  kind in WORLD_TIME_COST && WORLD_TIME_COST[kind] !== null;

/**
 * 累計天數 → 生涯年度座標。
 *
 * ⚠ `year` **必須**等於 `deriveTime(days).season`——同一條時間不得有兩種年度。
 *   這裡不自己算，直接沿用 `deriveTime`，只補上「本年度第幾天」。
 */
export function careerYearOf(days) {
  const t = deriveTime(days);
  const d = t.day;
  return {
    year: t.season,
    dayOfYear: ((d - 1) % CAREER_YEAR.daysPerYear) + 1,
    weekOfYear: t.weekOfSeason,
    daysPerYear: CAREER_YEAR.daysPerYear,
  };
}
