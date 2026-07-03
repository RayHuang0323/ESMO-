// ============================================================================
//  matchFlows.js — 各 GameType 的賽事流程定義（純資料，資料驅動 Router）
//  新增一款遊戲 = 在這裡加一筆 flow，Router 程式碼零修改。
//
//  流程忠實對照 EsportsGame.jsx 現況：
//    MOBA：prep → matching → draft → tactic → battle →（result*）
//    FPS ：prep → matching → tactic → battle → result
//  * 現行 MOBA 的結算顯示在 MobaModule 內部、無獨立 result 畫面；
//    Router 仍保留 result 階段（resultOptional: true），Phase 3 接線時
//    宿主可選擇跳過，行為與現況一致，不強迫任何 UI 改動。
// ============================================================================

import { STAGE, GAME_TYPE } from "./stages.js";

/**
 * @typedef {Object} MatchFlow
 * @property {string}   gameType        GAME_TYPE 之一
 * @property {string}   label           顯示名稱
 * @property {string[]} stages          階段順序（STAGE 值）
 * @property {boolean}  resultOptional  result 階段是否可由宿主跳過（MOBA 現況）
 * @property {boolean}  placeholder     是否為未來遊戲佔位（尚無引擎）
 */

/** @type {Readonly<Record<string, MatchFlow>>} */
export const MATCH_FLOWS = Object.freeze({
  [GAME_TYPE.MOBA]: Object.freeze({
    gameType: GAME_TYPE.MOBA,
    label: "MOBA",
    stages: Object.freeze([STAGE.PREP, STAGE.MATCHING, STAGE.DRAFT, STAGE.TACTIC, STAGE.BATTLE, STAGE.RESULT]),
    resultOptional: true, // 現行結算在 MobaModule 內，暫不強制獨立 result 畫面
    placeholder: false,
  }),
  [GAME_TYPE.FPS]: Object.freeze({
    gameType: GAME_TYPE.FPS,
    label: "CS / FPS",
    stages: Object.freeze([STAGE.PREP, STAGE.MATCHING, STAGE.TACTIC, STAGE.BATTLE, STAGE.RESULT]),
    resultOptional: false, // 現行有 CSMatchReport
    placeholder: false,
  }),
  [GAME_TYPE.GAME3]: Object.freeze({
    gameType: GAME_TYPE.GAME3,
    label: "Game3（預留）",
    stages: Object.freeze([STAGE.PREP, STAGE.MATCHING, STAGE.TACTIC, STAGE.BATTLE, STAGE.RESULT]),
    resultOptional: false,
    placeholder: true, // 尚無 Battle Engine；Router 可建立流程但 enterBattle 會被擋下
  }),
});

/**
 * 取得指定遊戲類型的流程定義。
 * @param {string} gameType
 * @returns {MatchFlow}
 */
export function getFlow(gameType) {
  const flow = MATCH_FLOWS[gameType];
  if (!flow) throw new Error(`[matchFlows] 未知的 gameType: "${gameType}"（合法值: ${Object.keys(MATCH_FLOWS).join(", ")}）`);
  return flow;
}
