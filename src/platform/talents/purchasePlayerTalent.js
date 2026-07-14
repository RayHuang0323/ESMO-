// ============================================================================
//  talents/purchasePlayerTalent.js — 天賦購買服務（Sprint27，唯一入口）
//
//  純 reducer：applyTalentPurchase(player, talentId) → { nextPlayer, receipt }
//    · 不碰 Store / React / localStorage → Node 可測。
//    · cost 一律取自 definitions（不信任外部傳入）。
//    · 失敗 → nextPlayer = null，完全不動資料（無半套狀態）。
//  Store 包裝在 profileStore.purchasePlayerTalent：單一 set() + save，
//  UI 只顯示回傳的 receipt，不自行重算點數與能力。
//
//  ⚠ 天賦投入**不可重置**（正式 UI 無重置鈕）。__debugResetTalents 僅供
//    測試腳本使用，禁止接進任何畫面。
// ============================================================================
import { talentById } from "./talentDefinitions.js";
import { sanitizeTalents, recomputeSpentPoints } from "../contracts/playerTalentState.js";
import { getPlayerDerivedStats } from "./playerDerivedStats.js";

/**
 * @returns {{ nextPlayer: object|null, receipt: object }}
 * receipt = { success, playerId, talentId, previousRank, newRank,
 *             pointsSpent, remainingPoints, statChanges, failureReason }
 */
export function applyTalentPurchase(player, talentId) {
  const fail = (reason, extra = {}) => ({
    nextPlayer: null,
    receipt: {
      success: false, playerId: player?.id ?? null, talentId,
      previousRank: extra.previousRank ?? null, newRank: extra.previousRank ?? null,
      pointsSpent: 0,
      remainingPoints: Math.max(0, Math.floor(player?.talentPoints ?? 0)),
      statChanges: [], failureReason: reason,
    },
  });

  // 1) player / 2) talent 存在
  if (!player || !player.id) return fail("選手不存在");
  const def = talentById(talentId);
  if (!def) return fail("天賦不存在");

  const talents = sanitizeTalents(player.talents);
  const previousRank = talents.ranks[talentId] ?? 0;

  // 3) rank 未達上限
  if (previousRank >= def.maxRank) return fail("已達最高等級", { previousRank });

  // 4) 前置條件
  for (const pre of def.prerequisites) {
    const has = talents.ranks[pre.talentId] ?? 0;
    if (has < pre.minRank) {
      const preDef = talentById(pre.talentId);
      return fail(`需要「${preDef?.name ?? pre.talentId}」達 ${pre.minRank} 級（目前 ${has}）`, { previousRank });
    }
  }

  // 5) 點數足夠（6：cost 只認 definition）
  const cost = def.costPerRank;
  const available = Math.max(0, Math.floor(Number.isFinite(player.talentPoints) ? player.talentPoints : 0));
  if (available < cost) return fail(`天賦點不足（需 ${cost}，剩 ${available}）`, { previousRank });

  // 7–9) 扣點、升 rank、重算 spentPoints —— 一次組出 nextPlayer（不改輸入）
  const beforeStats = getPlayerDerivedStats(player);
  const newRank = previousRank + 1;
  const ranks = { ...talents.ranks, [talentId]: newRank };
  const nextPlayer = {
    ...player,
    talentPoints: available - cost,
    talents: { ranks, spentPoints: recomputeSpentPoints(ranks), updatedAt: Date.now() },
  };
  const afterStats = getPlayerDerivedStats(nextPlayer);

  const statChanges = def.effects.map((e) => ({
    stat: e.stat,
    before: beforeStats[e.stat] ?? 50,
    after: afterStats[e.stat] ?? 50,
    perRank: e.perRank,
  }));

  return {
    nextPlayer,
    receipt: {
      success: true, playerId: player.id, talentId,
      previousRank, newRank,
      pointsSpent: cost,
      remainingPoints: nextPlayer.talentPoints,
      statChanges, failureReason: null,
    },
  };
}

/** ⚠ 僅供測試腳本：清空天賦並退回點數。禁止出現在正式 UI。 */
export function __debugResetTalents(player) {
  const talents = sanitizeTalents(player?.talents);
  return { ...player, talentPoints: Math.max(0, Math.floor(player?.talentPoints ?? 0)) + talents.spentPoints, talents: { ranks: {}, spentPoints: 0, updatedAt: Date.now() } };
}
