// ============================================================================
//  src/platform/index.js — 平台層對外唯一出口
//  未來 EsportsGame.jsx（Phase 3 接線）只從這裡 import，
//  內部檔案怎麼重組都不影響宿主。
// ============================================================================

export { STAGE, GAME_TYPE, ROUTER_EVENT } from "./router/stages.js";
export { MATCH_FLOWS, getFlow } from "./router/matchFlows.js";
export { GameRouter } from "./router/GameRouter.js";
export { createBattleConfig, validateBattleConfig } from "./contracts/BattleConfig.js";
export { createBattleResult, validateBattleResult } from "./contracts/BattleResult.js";
export { toEngineProps } from "./contracts/BattleEngineInterface.js";
