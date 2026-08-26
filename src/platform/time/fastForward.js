// ============================================================================
//  platform/time/fastForward.js — 快速推進的規劃器（Season vNext V3）
//
//  ── 這一層要解決什麼 ──────────────────────────────────────────────────────
//  V1 把世界時間解凍、V2 立了每日競技容量與生涯年度邊界，但玩家仍然只能
//  一天一天按。設計文件 §2.4 量過：17 年生涯要按 **556 次**推進
//  ⇒ V1/V2 修好的東西，玩家在體感上根本到不了。
//
//  ── 為什麼是「規劃器」而不是「快轉器」 ────────────────────────────────────
//  本檔**不推進時間，一天都不推**。它只回答一個問題：
//        「從今天算起，下一個值得停下來的日子是第幾天？」
//  真正推進的仍然是 V1 的 `advanceWorldDays`（→ `advanceDay`），
//  沿路的訓練、每日恢復、週結算、生涯年度跨越一步都不會少
//  ——因為那些本來就寫在 `advanceDaysInState` 的逐日迴圈裡。
//
//  ⚠ **這不是第二個時鐘。** `meta.days` 的寫入點仍然只有週結算那一處。
//  ⚠ **規劃器提案，引擎裁決。** 引擎自己的 D15 規則（走得進比賽日，
//    但比賽沒收尾就走不出去）永遠優先——規劃器只能提出更保守的天數，
//    不可能讓玩家越過引擎會擋的東西。
//
//  ── 為什麼吃基本型別而不是整個 state ──────────────────────────────────────
//  專案已經有**唯一**的賽程查找（`seasonState.nextPlayerFixture` ＋
//  `absoluteDayOf`，兩個項目取交集由 `profileStore.worldTimeView()` 負責）。
//  規劃器再寫一份就是第二套賽程邏輯，而兩套遲早會對「下一場在第幾天」
//  給出不同答案。所以本檔只收 `{ day, nextFixtureDay }` 兩個數字。
//
//  ⚠ 本輪不做生涯後期的那些系統（見 V4／V5），也不做任何真人玩法。
//  ⚠ 純函式：不 import Store / React / zustand / localStorage，也不讀真實時間。
// ============================================================================
import { careerYearOf } from "./worldClock.js";

/**
 * 值得停下來的理由。**唯一來源**——呼叫端不得自創第三種。
 *
 * · `playerFixture` 玩家自己的正式賽事。**最高優先**：引擎本來就會擋在這一天，
 *                   規劃器提早停在同一天，玩家才看得到原因而不是「按了沒反應」。
 * · `careerYear`    生涯年度邊界。跨過去就 age +1（V2），值得讓玩家知道。
 */
export const STOP_REASONS = Object.freeze({
  playerFixture: "player_fixture",
  careerYear: "career_year",
  //  V6-3：休賽期是本專案第一個**真的會擋住時間**的狀態——
  //  因為到 V6-2 為止，年度邊界已經長出真實決策（續約／放走／補強）。
  offSeason: "off_season",
});

/**
 * 一次快轉的**硬性天數上限**。
 *
 * ⚠ 必須 ≤ 一個生涯年度（84 天），否則玩家可能一次跨過**兩個**年度邊界，
 *   而 age +1 的通知只會出現一次 ⇒ 有人會在毫無提示下老兩歲。
 * ⚠ 28 天 = 4 週：夠長到不必一直按，短到每次快轉最多只結算 4 次週結算，
 *   玩家還讀得完發生了什麼。
 */
export const MAX_FAST_FORWARD_DAYS = 28;

/** 畫面上的快轉級距。**畫面不得自己寫死天數**，一律讀這裡。 */
export const FAST_FORWARD_STEPS = Object.freeze([1, 7]);

const dayOf = (v) => Math.max(1, Math.floor(Number(v) || 1));

/**
 * 下一個值得停下來的日子。
 *
 * @param {{day:number, nextFixtureDay:number|null}} p
 *        `nextFixtureDay` 來自 `worldTimeView()`，已經是兩個項目取過交集的
 *        絕對天數；`null` = 目前沒有排定的玩家賽事。
 * @returns {{day:number, code:string, label:string, daysAway:number}|null}
 */
export function nextStopOf({ day, nextFixtureDay = null, offSeasonOpen = false } = {}) {
  const today = dayOf(day);
  //  ⚠ 休賽期開著就是**現在**要處理，不必比較誰比較近。
  if (offSeasonOpen) {
    return { day: today, code: STOP_REASONS.offSeason, label: "休賽期尚未結束", daysAway: 0 };
  }
  const stops = [];

  //  ⚠ **含今天**（`>=` 不是 `>`）。站在自己的比賽日上時，下一站就是「今天」，
  //    `daysAway` 為 0。瀏覽器實測抓到的缺陷正是這裡：只認未來的賽程時，
  //    比賽日當天的卡片會顯示「下一站：第 85 天進入第 2 生涯年度（還有 36 天）」
  //    ——但玩家其實**一步都走不了**，畫面等於在說謊。
  //  ⚠ 但**不認過去**的賽程。已經過去而仍未收尾的場次由賽季自己的補判處理，
  //    規劃器不得因為一個過期的數字就把玩家鎖在原地。
  const fx = Number(nextFixtureDay);
  if (Number.isFinite(fx) && fx >= today) {
    stops.push({
      day: fx,
      code: STOP_REASONS.playerFixture,
      label: fx === today ? "今天有你的比賽" : `第 ${fx} 天有你的比賽`,
    });
  }

  //  年度邊界：本年度剩下的天數走完，下一天就是新年度的第 1 天。
  const y = careerYearOf(today);
  const edge = today + (y.daysPerYear - y.dayOfYear) + 1;
  stops.push({ day: edge, code: STOP_REASONS.careerYear, label: `第 ${edge} 天進入第 ${y.year + 1} 生涯年度` });

  stops.sort((a, b) => a.day - b.day);
  const first = stops[0];
  return first ? { ...first, daysAway: first.day - today } : null;
}

/**
 * 這一次該推幾天。
 *
 * ⚠ 回傳 0 代表**今天就要玩家處理**（站在自己的比賽日上）。呼叫端要照實顯示，
 *   不得自己改成 1 硬推——那正是「自動出賽／自動棄權」的入口，規格 D15 否決過。
 *
 * @returns {{days:number, stop:object|null}}
 */
export function planAdvance({ day, nextFixtureDay = null, offSeasonOpen = false } = {}, { maxDays = MAX_FAST_FORWARD_DAYS } = {}) {
  const today = dayOf(day);
  const stop = nextStopOf({ day: today, nextFixtureDay, offSeasonOpen });
  //  下一站就是今天 ⇒ 一天都不規劃，並且**照實回傳那個 stop**。
  //  ⚠ 這裡不可以改成回傳「下下一站」——玩家會看到一個他根本走不到的日子。
  if (stop && stop.daysAway <= 0) return { days: 0, stop };

  const cap = Math.max(1, Math.min(Math.floor(Number(maxDays) || MAX_FAST_FORWARD_DAYS), MAX_FAST_FORWARD_DAYS));
  const want = stop ? stop.daysAway : cap;
  return { days: Math.max(0, Math.min(want, cap)), stop };
}
