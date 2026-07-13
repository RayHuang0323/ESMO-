// ============================================================================
//  matchProgressTransaction.js — 賽後回寫交易契約 v1（Sprint25）
//
//  身分：**不是**第三種 MatchResult。BattleResult.v2 與 CsMatchResult.v1 仍是
//    各自遊戲的正式結果契約，本檔完全不取代、不合併它們。
//
//  這是「回寫交易單」：各遊戲的 Reward Adapter 讀自己的 Result，
//  產出同一種 Transaction，交給單一 Progress Service 套用。
//
//      BattleResult.v2 ──> mobaProgressAdapter ─┐
//                                                ├─> MatchProgressTransaction.v1
//      CsMatchResult.v1 ─> csProgressAdapter ───┘            │
//                                                            ▼
//                                            applyMatchProgress（唯一寫入點）
//                                                            │
//                                                            ▼
//                                                   Transaction Receipt
//
//  設計約束：
//    · 所有數值必須為**有限數字**（validate 會擋 NaN / Infinity）。
//    · 不適用欄位一律用 0（不混用 null / undefined 語意）。
//    · playerId 一律是 profileStore.players[].id（"b1".."b5" / "r…"）。
//      **禁止用 index 或選手名字當識別**（改名會壞、順序會變）。
//    · transactionId 是冪等鍵，必須由「比賽身分」決定性推導，不可用 Date.now()。
// ============================================================================

import { TALENT_POINTS_PER_LEVEL } from "../progress/playerLevel.js";

export const MATCH_PROGRESS_TX_VERSION = "MatchProgressTransaction.v1";

/** 冪等鍵：同一場比賽永遠得到同一個 transactionId。 */
export function makeTransactionId(mode, matchId) {
  return `${mode}:${matchId}:progress-v1`;
}

/**
 * 建立一張交易單（工廠：補齊所有欄位，缺的給 0，不留 undefined）。
 * Adapter 只負責算數值，欄位齊全由本工廠保證。
 */
export function createMatchProgressTransaction({
  matchId,
  mode,                       // "moba" | "cs"
  sourceResultVersion,        // "BattleResult.v2" | "CsMatchResult.v1"
  recordedAt = Date.now(),
  teamRewards = {},
  playerProgress = [],
  unlocks = [],
  metadata = {},
}) {
  return {
    version: MATCH_PROGRESS_TX_VERSION,
    transactionId: makeTransactionId(mode, matchId),
    matchId,
    mode,
    sourceResultVersion,
    recordedAt,

    teamRewards: {
      money: num(teamRewards.money),           // 單位：元（不是「萬」）
      fans: num(teamRewards.fans),
      reputation: num(teamRewards.reputation), // 目前無經 Legacy 驗證的公式 → 一律 0
    },

    playerProgress: playerProgress.map((p) => ({
      playerId: p.playerId,
      xpGained: num(p.xpGained),
      previousXp: num(p.previousXp),
      newXp: num(p.newXp),
      previousLevel: num(p.previousLevel),
      newLevel: num(p.newLevel),
      levelsGained: num(p.levelsGained),
      talentPointsGained: num(p.talentPointsGained),
      reasons: Array.isArray(p.reasons) ? p.reasons : [],
    })),

    unlocks: Array.isArray(unlocks) ? unlocks : [],

    metadata: {
      winner: metadata.winner ?? null,          // "us" | "enemy"（兩種模式統一語意）
      score: metadata.score ?? null,            // { us, enemy }
      rewardFormulaVersion: metadata.rewardFormulaVersion ?? null,
      playerXpFormulaVersion: metadata.playerXpFormulaVersion ?? null,
      playerLevelFormulaVersion: metadata.playerLevelFormulaVersion ?? null,
    },
  };
}

/** 任何非有限值 → 0（契約要求所有數值皆為有限數字）。 */
function num(v) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

const finite = (v) => typeof v === "number" && Number.isFinite(v);

/**
 * 契約驗證。Progress Service 套用前一定要跑；不合法一律拒絕（不半套寫入）。
 */
export function validateMatchProgressTransaction(t) {
  const errors = [];
  if (!t || typeof t !== "object") return { ok: false, errors: ["transaction 不是物件"] };

  if (t.version !== MATCH_PROGRESS_TX_VERSION) errors.push(`version 必須為 ${MATCH_PROGRESS_TX_VERSION}`);
  if (!t.transactionId) errors.push("缺 transactionId");
  if (!t.matchId) errors.push("缺 matchId");
  if (t.mode !== "moba" && t.mode !== "cs") errors.push(`mode 必須為 moba/cs，收到 ${t.mode}`);
  if (!t.sourceResultVersion) errors.push("缺 sourceResultVersion");
  if (!finite(t.recordedAt)) errors.push("recordedAt 必須為有限數字");
  if (t.transactionId !== makeTransactionId(t.mode, t.matchId)) errors.push("transactionId 與 mode/matchId 不一致（冪等鍵必須可決定性推導）");

  const tr = t.teamRewards;
  if (!tr || typeof tr !== "object") errors.push("缺 teamRewards");
  else {
    for (const k of ["money", "fans", "reputation"]) {
      if (!finite(tr[k])) errors.push(`teamRewards.${k} 必須為有限數字（收到 ${tr[k]}）`);
      else if (tr[k] < 0) errors.push(`teamRewards.${k} 不可為負`);
    }
  }

  if (!Array.isArray(t.playerProgress)) errors.push("playerProgress 必須為陣列");
  else {
    const seen = new Set();
    t.playerProgress.forEach((p, i) => {
      if (!p.playerId || typeof p.playerId !== "string") errors.push(`playerProgress[${i}].playerId 必須為字串 id`);
      else if (seen.has(p.playerId)) errors.push(`playerProgress 有重複 playerId: ${p.playerId}`);
      else seen.add(p.playerId);

      for (const k of ["xpGained", "previousXp", "newXp", "previousLevel", "newLevel", "levelsGained", "talentPointsGained"]) {
        if (!finite(p[k])) errors.push(`playerProgress[${i}].${k} 必須為有限數字（收到 ${p[k]}）`);
      }
      if (finite(p.xpGained) && p.xpGained < 0) errors.push(`playerProgress[${i}].xpGained 不可為負`);
      if (finite(p.newXp) && finite(p.previousXp) && p.newXp < p.previousXp) errors.push(`playerProgress[${i}] XP 倒退`);
      if (finite(p.newLevel) && finite(p.previousLevel) && p.newLevel < p.previousLevel) errors.push(`playerProgress[${i}] 等級倒退`);
      if (finite(p.levelsGained) && finite(p.talentPointsGained) && p.talentPointsGained !== p.levelsGained * TALENT_POINTS_PER_LEVEL) {
        errors.push(`playerProgress[${i}] 天賦點必須 = 升級數 × ${TALENT_POINTS_PER_LEVEL}（收到 ${p.talentPointsGained} / ${p.levelsGained} 級）`);
      }
    });
  }

  if (!Array.isArray(t.unlocks)) errors.push("unlocks 必須為陣列");
  if (!t.metadata || typeof t.metadata !== "object") errors.push("缺 metadata");

  return { ok: errors.length === 0, errors };
}
