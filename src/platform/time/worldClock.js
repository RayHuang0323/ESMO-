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
 * 活動 → **額外**消耗幾天世界時間。
 *
 * ⚠ `competitive: 0` 是 **V2 決定的結果**，不是「還沒填」。
 *   V1 時這一格是 `null`（明確未定案）。V2 實跑比較過四種做法：
 *
 *     做法                  凍齡？  一年打 100 場額外老幾天   需要新增什麼
 *     A 每場 +1 天           擋住    +100 天（年度的 119%）   比賽結算要**寫時鐘**
 *     B 每 N 場自動 +1 天     有界    +33 天（39%）           比賽結算要**寫時鐘**
 *     C 每日容量 N 場         擋住    **+0 天**               一個「今天用了幾格」的計數器
 *     D 競技點數條           有界    +0 天                   一條與體力平行的新資源
 *
 *   A / B 讓「愛打競技的人老得特別快」（實測一年多老 84 天），而且**都要在比賽
 *   結算裡推時鐘 ⇒ 第二個時間推進者**，違反 V1 立的規則。D 要再養一條與體力
 *   平行的疲勞資源。⇒ **選 C**：時間不是「一場比賽的價格」，而是
 *   「**一個世界日裡能做多少事**」，成本落在 `COMPETITIVE_BLOCK` 而不是這裡。
 *
 * ⚠ `official: 0` 不是「正式賽不重要」：賽程日是**日曆帶到**的
 *   （`absoluteDayOf` = 賽季起始日 + 賽程日 − 1），不是比賽去推日曆。
 *   反過來做會讓賽程與世界日期互相追著跑，而且一個 BO3 會重複加天。
 */
export const WORLD_TIME_COST = Object.freeze({
  training: 1,
  rest: 1,
  practice: 0,
  official: 0,
  competitive: 0,
});

/**
 * 一般競技比賽的**時間區塊**（V2）。
 *
 * 「一個世界日 = 一個競技時段，時段裡有 N 場容量。」
 * 打滿之後要再打，就得自己推進日曆（走 V1 的 `advanceWorldDays`）
 * ⇒ 刷 XP 必然要付出世界時間，但**不會比不打的人老得快**。
 *
 * ⚠ `matchesPerDay` 是**唯一**的容量常數，balance 之後只改這一處。
 *   目前 3：一個世界日的競技量約等於一次訓練時段，
 *   而體力天花板本來就在 5 場／日 ⇒ 容量會先於體力生效（配額才有意義）。
 * ⚠ 這不是第二條疲勞：它不消耗體力、也不被體力消耗，兩者各自獨立生效。
 * ⚠ V3「大顆時間操作」可以把一個區塊拉長成多天，屆時只需要改這裡的語意，
 *   不必動結算或時鐘。
 */
export const COMPETITIVE_BLOCK = Object.freeze({
  matchesPerDay: 3,
});

/**
 * 今天的競技容量還剩多少。
 *
 * ⚠ **跨日自動歸零**：容量是「(哪一天, 用了幾格)」的推導結果，
 *   不需要在 `advanceDay` 裡寫重置程式——少一個會忘記維護的地方。
 * ⚠ 舊存檔沒有這個欄位 ⇒ 視為「今天還沒用過」，不阻擋任何人。
 *
 * @param {{day:number, used:number}|null} stored `meta.competitiveBlock`
 * @param {number} day 目前的 `meta.days`
 */
export function competitiveBlockOf(stored, day) {
  const today = Math.max(1, Math.floor(Number(day) || 1));
  const used = stored && Number(stored.day) === today
    ? Math.max(0, Math.floor(Number(stored.used) || 0))
    : 0;
  const capacity = COMPETITIVE_BLOCK.matchesPerDay;
  return {
    day: today,
    used: Math.min(used, capacity),
    capacity,
    remaining: Math.max(0, capacity - used),
  };
}

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
