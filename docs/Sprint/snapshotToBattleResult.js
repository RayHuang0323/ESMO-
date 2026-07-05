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

  // Sprint 03：從逐英雄統計聚合 players / ourPlayers / theirPlayers / MVP。
  const allPlayers = Array.isArray(snap.players) ? snap.players : [];
  const nameOf = (p) => (p.playerName || (p.champion && p.champion.zh) || p.id);
  const toStat = (p) => {
    const k = p.k || 0, d = p.d || 0, a = p.a || 0;
    const kdaRatio = (k + a) / Math.max(1, d);
    // KDA 為主 + 參團微調；封頂於合理區間（不受絕對傷害量級影響）
    const rating = +Math.max(0.3, Math.min(3.5, 0.7 + kdaRatio * 0.35 + (p.participation || 0) / 300)).toFixed(2);
    return {
      id: p.id, side: p.side, role: p.role, name: nameOf(p),
      champion: p.champion || null, behavior: p.behavior || null,
      k, d, a, kda: `${k}/${d}/${a}`,
      damage: p.dmg || 0, healing: p.heal || 0, towerDamage: p.twr || 0,
      gold: p.gold || 0, participation: p.participation || 0,
      rating,
    };
  };
  const our = allPlayers.filter((p) => p.side === "blue").map(toStat);
  const their = allPlayers.filter((p) => p.side === "red").map(toStat);
  // MVP＝我方 rating 最高（同分取 K+A 高）
  const ourMvp = our.slice().sort((a, b) => b.rating - a.rating || (b.k + b.a) - (a.k + a.a))[0] || null;

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
    // Sprint 03：逐英雄數據 + MVP + timeline
    players: [...our, ...their],
    ourPlayers: our,
    theirPlayers: their,
    ourMvp: ourMvp ? { name: ourMvp.name, id: ourMvp.id, champion: ourMvp.champion, k: ourMvp.k, d: ourMvp.d, a: ourMvp.a, kda: ourMvp.kda, damage: ourMvp.damage, healing: ourMvp.healing, participation: ourMvp.participation, rating: ourMvp.rating } : null,
    timeline: Array.isArray(snap.timeline) ? snap.timeline : [],
    // 我方出戰陣容（選手×英雄，含本場統計，供 Hero Progress）
    lineup: Array.isArray(meta.lineup) ? meta.lineup.map((s) => {
      const st = our.find((o) => o.playerName === s.playerName || (o.champion && o.champion.id === s.heroId));
      return st ? { ...s, k: st.k, d: st.d, a: st.a, damage: st.damage, healing: st.healing, towerDamage: st.towerDamage, isMvp: ourMvp && ourMvp.id === st.id } : s;
    }) : undefined,
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
