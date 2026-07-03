// ============================================================================
//  snapshotToBattleResult.js — App.jsx（R3F MOBA）快照 → BattleResult
//
//  純函式：不 import React，不 import App.jsx，不碰任何引擎。
//  只讀 App.jsx LogicEngine snapshot 既有欄位（winner/bK/rK/bGold/rGold/
//  over/ts），聚合成符合 BattleResult 合約的物件。
//
//  對照關係（來自 App.jsx 現況，逐一查證）：
//    winner === "blue"  → 我方（德國海豹＝blue）勝 → win: true
//    winner === "red"   → 對手（赤焰軍團＝red）勝  → win: false
//    bK / rK            → 藍/紅擊殺數 → scoreT / scoreCT（沿用 BattleResult
//                         對 MOBA 的既有映射註解，欄位名不改）
//    ts                 → 對局秒數 → durationSec
//
//  ⚠ MOBA 現況「貧血」：LogicEngine 快照無逐選手 KDA，故 players/ourPlayers
//    留空。這與 BattleResult 合約的「MOBA 最小相容（win + mode 即可）」設計
//    一致；未來 LogicEngine 補選手級數據後再擴充，本檔不需改結構。
// ============================================================================

import { createBattleResult } from "../../platform/contracts/BattleResult.js";

/**
 * @param {Object} snap  App.jsx LogicEngine 的 snapshot（或 store.hud，欄位相容）
 * @param {Object} [meta] 路由層補充：{ seed, teamName, oppName, mapKey }
 * @returns {import("../../platform/contracts/BattleResult.js").BattleResult}
 */
export function snapshotToBattleResult(snap = {}, meta = {}) {
  const win = snap.winner === "blue"; // 我方＝blue（德國海豹）
  const durationSec = Number.isFinite(snap.ts) ? Math.round(snap.ts) : null;

  return createBattleResult({
    // 路由層識別
    gameType: "moba",
    engine: "moba-r3f",
    seed: Number.isFinite(meta.seed) ? meta.seed : null,
    mapKey: meta.mapKey ?? null,
    durationSec,
    // 平台回寫欄位（禁改名；與 recordMatch 相容）
    mode: "MOBA",
    win,
    scoreT: Number.isFinite(snap.bK) ? snap.bK : undefined,  // 藍方擊殺
    scoreCT: Number.isFinite(snap.rK) ? snap.rK : undefined, // 紅方擊殺
    tName: meta.teamName ?? "德國海豹",
    ctName: meta.oppName ?? "赤焰軍團",
    // MOBA 現況無逐選手數據 → players/ourPlayers 不填（合約允許）
    // 透傳原始快照，供除錯 / 未來重播 / 未來擴充
    raw: {
      winner: snap.winner ?? null,
      bK: snap.bK, rK: snap.rK,
      bGold: snap.bGold, rGold: snap.rGold,
      over: !!snap.over,
      ts: snap.ts ?? null,
    },
  });
}

/**
 * 便利判斷：此快照是否代表「對局已結束、可產出結果」。
 * @param {Object} snap
 * @returns {boolean}
 */
export function isBattleOver(snap) {
  return !!(snap && snap.over && (snap.winner === "blue" || snap.winner === "red"));
}
