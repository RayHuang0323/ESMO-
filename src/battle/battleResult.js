// ============================================================================
//  battle/battleResult.js — BattleResult 正式契約 v2（Sprint09）
//  唯一計算點：useBattleFeed 於終局呼叫一次；EndScreen / HeroProgress /
//  Season / History / Analytics 一律消費本結果，禁止各自重新統計。
//  推導來源：終局 snapshot + 事件 log（log 由快照流純推導 → 仍是單一來源）。
// ============================================================================
import { playerRating, participation, mvpCandidate, towersDestroyedBy } from "./battleEvents.js";
import { TEAMS, HERO_ASSIGN } from "../data/roster.js";

const countBy = (events, type) => {
  const n = { blue: 0, red: 0 };
  for (const e of events) if (e.type === type && (e.side === "blue" || e.side === "red")) n[e.side]++;
  return n;
};

/**
 * 終局 snapshot（over===true）+ 完整事件 log → BattleResult v2
 * @param {object} snap  終局快照
 * @param {object[]} events  完整事件記錄（battleStore.log）；可為 []（欄位仍完整，計數為 0）
 */
export function snapshotToBattleResult(snap, events = [], { heroAssign = HERO_ASSIGN, teams = TEAMS } = {}) {
  if (!snap.over) throw new Error("snapshotToBattleResult: snapshot 尚未終局（over=false）");
  const mvp = mvpCandidate(snap);
  return {
    schema: "BattleResult.v2",
    mode: "moba",
    teams: { blue: { ...teams.blue }, red: { ...teams.red } },
    winner: snap.winner,
    duration: snap.ts,
    score: { blue: snap.bK, red: snap.rK },
    gold: { blue: snap.bGold, red: snap.rGold },
    towers: { blue: towersDestroyedBy(snap, "blue"), red: towersDestroyedBy(snap, "red") },
    dragon: countBy(events, "DRAGON_SLAIN"),
    baron:  countBy(events, "BARON_SLAIN"),
    // S24（附加欄位，無戰術 = null，結構向下相容）：
    //   tactic = { tacticId, tacticName, version, opponentTacticId }（引擎 configureMatch meta）
    //   tacticExecution = { blue, red } 引擎真實執行統計（Gank/入侵/會戰/分推/龍巴龍/推塔波次）
    tactic: snap.tacticMeta ?? null,
    tacticExecution: snap.tacticExec ?? null,
    timeline: events.map((e) => ({ t: e.t, type: e.type, side: e.side, text: e.text, data: e.data ?? null })),
    mvpId: mvp?.id ?? null,
    players: snap.players.map((p) => ({
      id: p.id, side: p.side, role: p.role,
      heroId: heroAssign[p.id] ?? null,          // MOBA：Player 操作 Hero
      lv: p.lv ?? 1,
      k: p.k, d: p.d, a: p.a || 0, gold: p.gold || 0,
      dmg: p.dmg || 0, heal: p.heal || 0, twrDmg: p.twrDmg || 0,
      participation: participation(p, snap),      // 共用純函數（非 UI 重新統計）
      rating: playerRating(p),                    // 共用純函數（非 UI 重新統計）
      won: p.side === snap.winner,
      mvp: mvp?.id === p.id,
    })),
  };
}
