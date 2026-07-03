// ============================================================================
//  platformToMobaConfig.js — 平台狀態 → MOBA BattleConfig 正式組裝（Phase 9）
//
//  單一入口：把 EsportsGame 的平台資料（先發選手、Draft 結果、隊名）組裝成
//  合約相容的 BattleConfig。取代 EsportsGame 先前的佔位寫法 [1,2,3,4,5]。
//  純函式、可測試、無 React。
//
//  ⚠ 本 Phase 不做 seed 注入：seed 僅作為 BattleConfig 欄位攜帶（供未來），
//    App.jsx 目前仍用其內部 seed，兩者尚未接通（屬後續 Phase）。
// ============================================================================

import { createBattleConfig } from "../../platform/contracts/BattleConfig.js";
import { GAME_TYPE } from "../../platform/router/stages.js";

/**
 * @param {Object} input
 * @param {Array}  [input.starters]     先發選手（平台 roster 主力 5 人）
 * @param {Object} [input.draftResult]  DraftModule 輸出 { picks:{blue,red}, bans }
 * @param {Object} [input.opponent]     對手隊伍資料（可選；MOBA 對手由引擎內部生成）
 * @param {string} [input.teamName]
 * @param {string} [input.oppName]
 * @param {*}      [input.tactic]
 * @param {number} [input.seed]
 * @returns {import("../../platform/contracts/BattleConfig.js").BattleConfig}
 */
export function platformToMobaConfig(input = {}) {
  const starters = Array.isArray(input.starters) ? input.starters : [];
  const oppPicks = (input.draftResult && input.draftResult.picks &&
                    Array.isArray(input.draftResult.picks.red))
    ? input.draftResult.picks.red : [];

  return createBattleConfig({
    gameType: GAME_TYPE.MOBA,
    seed: Number.isFinite(input.seed) ? input.seed : undefined,
    roster: starters,                                   // 我方先發選手（正式資料，非佔位）
    opponent: Array.isArray(input.opponent) ? input.opponent
              : (oppPicks.length ? oppPicks : starters), // 有對手 pick 用之，否則佔位（僅供驗證）
    draft: input.draftResult ?? null,                   // 正式攜帶 Ban/Pick
    tactic: input.tactic ?? null,
    teamName: input.teamName ?? "德國海豹",
    oppName: input.oppName ?? "赤焰軍團",
    embedded: true,
  });
}
