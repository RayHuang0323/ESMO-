// ============================================================================
//  battle/battleResult.js — BattleResult 正式契約（Sprint08）
//  由「終局 snapshot」純函數推導；Hero Progress 的唯一資料來源。
//  無 React/three/zustand 相依 → Node 可驗。
// ============================================================================
import { playerRating, participation, mvpCandidate } from "./battleEvents.js";

/** 終局 snapshot（over===true）→ BattleResult */
export function snapshotToBattleResult(snap) {
  if (!snap.over) throw new Error("snapshotToBattleResult: snapshot 尚未終局（over=false）");
  const mvp = mvpCandidate(snap);
  return {
    winner: snap.winner,
    duration: snap.ts,
    score: { blue: snap.bK, red: snap.rK },
    gold: { blue: snap.bGold, red: snap.rGold },
    mvpId: mvp?.id ?? null,
    players: snap.players.map((p) => ({
      id: p.id, side: p.side, role: p.role,
      k: p.k, d: p.d, a: p.a || 0, gold: p.gold || 0,
      dmg: p.dmg || 0, heal: p.heal || 0, twrDmg: p.twrDmg || 0,
      participation: participation(p, snap),
      rating: playerRating(p),
      won: p.side === snap.winner,
      mvp: mvp?.id === p.id,
    })),
  };
}
