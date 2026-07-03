// ============================================================================
//  stages.js — 賽事階段（Stage）與遊戲類型（GameType）常數
//  單一真實來源：全平台的 stage 字串一律從這裡 import，禁止散落字串常值。
//  ⚠ 字串值刻意沿用 EsportsGame.jsx 現行 mobaStage / fpsStage 的值
//    （"prep"/"matching"/"draft"/"tactic"/"battle"/"result"），
//    以便 Phase 3 接線時可與既有 UI 無痛對照，不需要改任何畫面。
// ============================================================================

export const STAGE = Object.freeze({
  PREP: "prep",         // 賽前準備（MatchPrep）
  MATCHING: "matching", // 配對中（MatchmakingScreen）
  DRAFT: "draft",       // Ban/Pick 選角（僅 MOBA 使用；DraftModule）
  TACTIC: "tactic",     // 戰術部署（TacticSelect）
  BATTLE: "battle",     // 對戰（Battle Engine 掛載點）
  RESULT: "result",     // 賽後結算（CSMatchReport / 未來 MOBA 戰報）
});

export const GAME_TYPE = Object.freeze({
  MOBA: "moba",
  FPS: "fps",
  GAME3: "game3", // 佔位：未來第三款遊戲（Kart / BR / 自走棋…）
});

/** Router 對外通知的事件類型 */
export const ROUTER_EVENT = Object.freeze({
  STAGE_CHANGE: "stage_change",     // 任何階段切換
  BATTLE_START: "battle_start",     // 進入 battle（宿主此時掛載 Battle Engine）
  BATTLE_COMPLETE: "battle_complete", // 收到 BattleResult（宿主此時 recordMatch 回寫）
  EXIT: "exit",                     // 流程結束 / 退回主選單
  RESET: "reset",
});
