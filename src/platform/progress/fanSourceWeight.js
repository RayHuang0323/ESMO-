// ============================================================================
//  platform/progress/fanSourceWeight.js — 粉絲來源權重（Fan System F1）
//
//  ── 這一層要解決什麼 ──────────────────────────────────────────────────────
//  F1 之前，練習賽與正式聯賽給的粉絲**一模一樣**：兩者走同一支 `fanGain`、
//  同一個係數。造成兩個問題——刷練習賽是最有效率的漲粉手段，而正式比賽不特別。
//
//  本檔只做一件事：把「這場比賽是怎麼來的」對應到一個**粉絲倍率**。
//    練習 / 自由對戰 < 正式聯賽 < Major / 大型賽
//
//  ── 為什麼放在這裡，而不是別處 ────────────────────────────────────────────
//  · **不新增契約欄位**：來源資訊本來就在 `MatchOrigin.v1` 裡，這裡只是讀它。
//    `BattleResult.v2` / `CsMatchResult.v1` / `MatchProgressTransaction.v1`
//    三支契約檔是逐位元凍結的（`check_talent27` §26–28），一個位元都不動。
//  · **MOBA / CS 共用同一份**：`teamRewardsFor()` 本來就是共用的，權重也必須共用。
//    兩個項目各寫一套 = 第二套粉絲公式，那正是規格禁止的事。
//  · **畫面不得決定倍率**：本檔是純函式，只吃 origin，不吃任何 UI 狀態。
//
//  ⚠ 這裡的數字是 **calibration target**，不是契約。
//    驗證器只守**順序不變式**（practice < league < major），不硬編絕對值——
//    否則每次調數值都要改 gate，gate 就會變成阻力而不是保護。
//    數值依據見 `tools/fan_calibration.mjs` 與 `docs/design/粉絲系統架構.md` §4.2。
//
//  純函式：不 import React / zustand / localStorage / 任何 Store。
// ============================================================================

/** 粉絲來源分類。**唯一來源**——呼叫端不得自創第四種。 */
export const FAN_SOURCE = Object.freeze({
  practice: "practice",
  league: "league",
  major: "major",
});

/**
 * 來源倍率。乘在既有 `fanGain` 上，**只影響粉絲**——
 * 獎金（`prizeGain`）不受來源權重影響，那是競技成績的事（Addendum §5）。
 *
 * 為什麼是這三個數字（`tools/fan_calibration.mjs` 可重跑）：
 *   典型一勝（marginF≈0.4、streak≈0）的基礎 `fanGain` ≈ 176
 *     練習 ×1.0 ≈ 176      → 目標「數百」✅
 *     聯賽 ×5.0 ≈ 880      → 目標「800–1500」✅
 *     Major ×8.5 ≈ 1,500   → 目標「1500–2500」✅（帶連勝時往上走）
 */
export const FAN_SOURCE_WEIGHT = Object.freeze({
  [FAN_SOURCE.practice]: 1.0,
  [FAN_SOURCE.league]: 5.0,
  [FAN_SOURCE.major]: 8.5,
});

/**
 * 賽事層級 → 粉絲來源。
 *
 * `competition.tier` 目前實際存在的值（2026-08-23 全 repo 盤點）：
 *   `regular`（常規賽／聯賽）、`major`（Major）、`championship`（年度總決賽）、
 *   `qualifier`（尚未有生產者，只在 csSeasonConfig 的未來規劃註解裡）。
 *
 * ⚠ `championship` 刻意併進 `major` 桶，**不另開第四級**：
 *   規格只定義三級（Practice / League / Major），F1 不發明第四級。
 *   年度總決賽要不要比 Major 更高，是之後的校準題，不是 F1 的。
 */
const TIER_TO_SOURCE = Object.freeze({
  regular: FAN_SOURCE.league,
  major: FAN_SOURCE.major,
  championship: FAN_SOURCE.major,
  qualifier: FAN_SOURCE.league,
});

/**
 * 從 `competition.id` 取出 tier。
 *
 * id 格式由 `contracts/competition.js → createCompetition()` 決定：
 *   `comp:{gameMode}:s{season}:{organizerId}:{tier}`   ← **tier 是最後一段**
 * 這個慣例本來就被其他模組依賴（見 `csMajor.js` 的
 * 「Major 的層級標籤（`competition.id` 的最後一段）」）。
 *
 * ⚠ 由 `check_fan_system.mjs` 守住格式：`createCompetition` 若改了 id 組成，
 *   gate 會紅，而不是讓這裡靜默把所有比賽降級成練習賽。
 */
export function tierFromCompetitionId(competitionId) {
  if (typeof competitionId !== "string" || !competitionId.startsWith("comp:")) return null;
  const parts = competitionId.split(":");
  return parts.length >= 5 ? parts[parts.length - 1] : null;
}

/**
 * MatchOrigin.v1 → 粉絲來源。
 *
 * · 沒有 origin（debug harness、舊流程）⇒ 練習賽。**保守而不是慷慨**：
 *   拿不到來源時給最低倍率，避免「來源查不到就當大賽算」的漏發反向漏洞。
 * · `kind: "ticket"`（玩家自己排隊配對）⇒ 練習賽。
 * · `kind: "fixture"`（賽程排定）⇒ 依 `competitionId` 的 tier 決定聯賽或 Major。
 *   tier 認不得時同樣退回聯賽（fixture 至少是正式比賽，不該掉回練習賽）。
 */
export function fanSourceFromOrigin(origin) {
  if (!origin || typeof origin !== "object") return FAN_SOURCE.practice;
  if (origin.kind !== "fixture") return FAN_SOURCE.practice;
  const tier = tierFromCompetitionId(origin.competitionId);
  return TIER_TO_SOURCE[tier] ?? FAN_SOURCE.league;
}

/** 來源 → 倍率。認不得的來源一律回練習賽倍率（同樣是保守方向）。 */
export function fanWeightForSource(source) {
  return FAN_SOURCE_WEIGHT[source] ?? FAN_SOURCE_WEIGHT[FAN_SOURCE.practice];
}

/** 便利組合：origin → 倍率。Adapter 用這一支。 */
export function fanWeightForOrigin(origin) {
  return fanWeightForSource(fanSourceFromOrigin(origin));
}
