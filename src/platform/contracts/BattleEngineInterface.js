// ============================================================================
//  BattleEngineInterface.js — Battle Engine 介面規範（邊界文件＋純函式）
//
//  鐵律：
//  1. Router「永不」import 任何 Battle Engine（本檔也一樣，零引擎相依）。
//  2. Battle Engine 是一個 React 元件，只接受 BattleConfig 展開後的 props，
//     結束時呼叫一次 onComplete(BattleResult)。除此之外雙方互不知情。
//  3. 掛載哪個引擎由「宿主」（EsportsGame，Phase 3 接線）決定：
//       宿主收到 ROUTER_EVENT.BATTLE_START → 依 gameType 自行 render 引擎
//       引擎 onComplete(result) → 宿主呼叫 router.completeBattle(result)
//     → Router 因此天生支援 2D/3D 引擎並行切換（Strangler）。
//
//  介面（以現役內聯 EsportsFPS3D props 為準；MOBA 引擎未來對齊同一形狀）：
//
//    <AnyBattleEngine
//      roster={cfg.roster} opponent={cfg.opponent}
//      tactic={cfg.tactic} tacticType={cfg.tacticType} ctTactic={cfg.oppTactic}
//      mapKey={cfg.mapKey} seed={cfg.seed}
//      teamName={cfg.teamName} oppName={cfg.oppName}
//      embedded={cfg.embedded}
//      onComplete={(result) => ...}
//    />
// ============================================================================

/**
 * 將 BattleConfig 映射為引擎 props（純函式、無副作用、無引擎相依）。
 * 之所以存在：欄位名對照集中在一處，未來合約演進只改這裡。
 * @param {import("./BattleConfig.js").BattleConfig} cfg
 * @param {(result: import("./BattleResult.js").BattleResult) => void} onComplete
 * @returns {Object} 可直接 spread 給引擎元件的 props
 */
export function toEngineProps(cfg, onComplete) {
  return {
    roster: cfg.roster,
    opponent: cfg.opponent,
    tactic: cfg.tactic,
    tacticType: cfg.tacticType,
    ctTactic: cfg.oppTactic, // 欄位名對照：合約 oppTactic ↔ 現役引擎 prop ctTactic
    mapKey: cfg.mapKey,
    seed: cfg.seed,
    teamName: cfg.teamName,
    oppName: cfg.oppName,
    embedded: cfg.embedded,
    onComplete,
  };
}
