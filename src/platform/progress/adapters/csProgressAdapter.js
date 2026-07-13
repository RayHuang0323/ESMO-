// ============================================================================
//  progress/adapters/csProgressAdapter.js — CsMatchResult.v1 → Transaction（Sprint25）
//
//  只讀 CsMatchResult.v1 真實提供的欄位（winner / ourScore / enemyScore /
//  players[].playerId / rating / kast / mvp）。**不修改 CsMatchResult.v1**。
//  不重新解析 UI 文字、不從畫面反推數據。
//
//  matchId：CsMatchResult.v1 **本來就有** matchId（引擎 raw.id）→ 直接用，
//    不需要像 MOBA 那樣做內容雜湊。
//
//  playerId：契約的 players[].playerId 來自 fpsRoster 的 _gid → profileStore.players[].id。
//    引擎內建示範陣容的 playerId 為 null → 不發 XP（不虛構選手）。
// ============================================================================
import { createMatchProgressTransaction } from "../../contracts/matchProgressTransaction.js";
import { calculateLevelProgress, PLAYER_LEVEL_FORMULA_VERSION } from "../playerLevel.js";
import {
  teamRewardsFor, csPerfFactor, playerXpFor,
  CS_REWARD_FORMULA_VERSION, PLAYER_XP_FORMULA_VERSION,
} from "../rewardFormulas.js";

/**
 * CsMatchResult.v1 → MatchProgressTransaction.v1
 * @param {object} cr   CsMatchResult.v1
 * @param {object} ctx  { players, streak, fansNow }
 *   streak = CS 自己的連勝（由呼叫端從 csHistory 推導；不讀 MOBA 戰績）
 */
export function csResultToTransaction(cr, ctx = {}) {
  if (!cr || cr.schema !== "CsMatchResult.v1" || !cr.matchId) return null;

  const roster = ctx.players ?? [];
  const byId = new Map(roster.map((p) => [p.id, p]));
  const win = cr.winner === "us";

  // ── 團隊獎勵：與 MOBA 同一條 updateEconomy（Legacy 逐字），
  //    只有 marginF 依 CS 的比分語意（回合差 / 8）——這正是兩款遊戲不失衡的關鍵。
  const margin = Math.abs((cr.ourScore ?? 0) - (cr.enemyScore ?? 0));
  const marginF = Math.min(margin / 8, 1);
  const team = teamRewardsFor({ win, marginF, streak: ctx.streak ?? 0, fansNow: ctx.fansNow ?? 0 });

  // ── 選手 XP ──
  const mvpId = cr.mvp?.playerId ?? null;
  const playerProgress = [];
  for (const p of cr.players ?? []) {
    if (!p.playerId) continue;               // 引擎示範陣容（非真實選手）→ 不發 XP
    const me = byId.get(p.playerId);
    if (!me) continue;                       // 已離隊 → 不發
    const perf = csPerfFactor(p);
    const isMvp = mvpId != null && p.playerId === mvpId;
    const xpGained = playerXpFor({ win, perf, isMvp });
    const prog = calculateLevelProgress(me.xp ?? 0, xpGained);
    playerProgress.push({
      playerId: p.playerId,
      ...prog,
      reasons: [
        win ? "勝利" : "落敗",
        `表現 ×${perf.toFixed(2)}`,
        `評分 ${Number(p.rating ?? 0).toFixed(2)}`,
        ...(p.kast != null ? [`KAST ${Math.round(p.kast)}%`] : []),
        ...(isMvp ? ["MVP"] : []),
      ],
    });
  }

  return createMatchProgressTransaction({
    matchId: cr.matchId,
    mode: "cs",
    sourceResultVersion: cr.schema,
    teamRewards: { money: team.money, fans: team.fans, reputation: 0 },  // 聲望無經驗證公式 → 0
    playerProgress,
    unlocks: [],
    metadata: {
      winner: win ? "us" : "enemy",
      score: { us: cr.ourScore ?? 0, enemy: cr.enemyScore ?? 0 },
      rewardFormulaVersion: CS_REWARD_FORMULA_VERSION,
      playerXpFormulaVersion: PLAYER_XP_FORMULA_VERSION,
      playerLevelFormulaVersion: PLAYER_LEVEL_FORMULA_VERSION,
    },
  });
}
