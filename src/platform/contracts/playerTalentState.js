// ============================================================================
//  playerTalentState.js — 選手天賦狀態契約 v1（Sprint27）
//
//  儲存位置：profileStore.players[].talents = { ranks, spentPoints, updatedAt }
//    · 可用點數**不另存一份**——沿用 S25 的 players[].talentPoints（唯一來源，
//      由賽後結算發放）。本契約的 availablePoints 是讀取時的視圖。
//    · playerId = players[].id（"b1".."b5"/"r…"）——不用名字、不用 index。
//
//  Migration 原則（不信任持久層）：
//    · spentPoints 一律由 definitions 重算（不信任存檔裡的 cost/spent）。
//    · 不存在的 talentId → 忽略；rank 非法（負數/非整數/超過 maxRank）→ 安全修正。
//    · 不重置既有 talentPoints / level / xp。
// ============================================================================
import { TALENT_DEFINITIONS, talentById } from "../talents/talentDefinitions.js";

export const PLAYER_TALENT_STATE_VERSION = "PlayerTalentState.v1";

/** ranks → 已花費點數（唯一算法：Σ rank × costPerRank；不信任持久層的數字）。 */
export function recomputeSpentPoints(ranks = {}) {
  let spent = 0;
  for (const [id, rank] of Object.entries(ranks)) {
    const def = talentById(id);
    if (!def) continue;
    spent += Math.max(0, Math.min(def.maxRank, Math.floor(rank))) * def.costPerRank;
  }
  return spent;
}

/**
 * 清洗持久層的 talents（migration 唯一入口）：
 *   未知 talentId 忽略、rank 修正為 [0, maxRank] 整數、rank 0 不保留、
 *   spentPoints 重算。損壞輸入（null/字串/陣列）→ 空狀態，不炸畫面。
 */
export function sanitizeTalents(raw) {
  const ranks = {};
  const src = raw && typeof raw === "object" && raw.ranks && typeof raw.ranks === "object" ? raw.ranks : {};
  for (const [id, v] of Object.entries(src)) {
    const def = talentById(id);
    if (!def) continue;                                   // 不存在的 talentId → 忽略
    const n = typeof v === "number" ? v : Number(v);
    // 非數字→0；超上限（含 Infinity）→ clamp maxRank；負→0（設計文件 §Migration）
    const rank = Number.isNaN(n) ? 0 : Math.max(0, Math.min(def.maxRank, Math.floor(n)));
    if (rank > 0) ranks[id] = rank;
  }
  return { ranks, spentPoints: recomputeSpentPoints(ranks), updatedAt: Number.isFinite(raw?.updatedAt) ? raw.updatedAt : null };
}

/** player → PlayerTalentState.v1 視圖（availablePoints = players[].talentPoints，不另存）。 */
export function getPlayerTalentState(player) {
  const t = sanitizeTalents(player?.talents);
  return {
    version: PLAYER_TALENT_STATE_VERSION,
    playerId: player?.id ?? null,
    availablePoints: Math.max(0, Number.isFinite(player?.talentPoints) ? Math.floor(player.talentPoints) : 0),
    spentPoints: t.spentPoints,
    ranks: t.ranks,
    updatedAt: t.updatedAt,
  };
}

/** 契約驗證。 */
export function validatePlayerTalentState(s) {
  const errors = [];
  if (!s || typeof s !== "object") return { ok: false, errors: ["state 不是物件"] };
  if (s.version !== PLAYER_TALENT_STATE_VERSION) errors.push(`version 必須為 ${PLAYER_TALENT_STATE_VERSION}`);
  if (!s.playerId || typeof s.playerId !== "string") errors.push("playerId 必須為字串 id（禁止名字/index）");
  if (!Number.isInteger(s.availablePoints) || s.availablePoints < 0) errors.push("availablePoints 必須為非負整數");
  if (!s.ranks || typeof s.ranks !== "object") errors.push("缺 ranks");
  else {
    for (const [id, rank] of Object.entries(s.ranks)) {
      const def = talentById(id);
      if (!def) errors.push(`未知 talentId: ${id}`);
      else if (!Number.isInteger(rank) || rank < 0 || rank > def.maxRank) errors.push(`ranks.${id} 非法: ${rank}`);
    }
    if (s.spentPoints !== recomputeSpentPoints(s.ranks)) errors.push("spentPoints 與 definitions 重算不一致");
  }
  return { ok: errors.length === 0, errors };
}

export { TALENT_DEFINITIONS };
