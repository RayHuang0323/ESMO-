// ============================================================================
//  platform/condition/playerCondition.js — 疲勞・狀態（Milestone O2 → 移除受傷）
//
//  ── 為什麼需要這一層 ──────────────────────────────────────────────────────
//  O1 之前，**比賽完全不消耗體力**：只有訓練會扣 `energy`。結果是連續出賽零代價，
//  一隊五人可以無限打下去，替補與輪換沒有任何意義。
//
//  本檔補上最小可用的代價與恢復：
//    · 出賽扣體力，連續出賽累積疲勞（`matchStreak`）
//    · 體力過低 ⇒ **不可出賽**（由 matchSquad 的閘門擋下）
//    · 休息／訓練日與每日自然恢復會回體力
//
//  ── 受傷已被產品取消（不是還沒做，是決定不做）─────────────────────────────
//  O2 曾有一套受傷機制：賽後決定性抽籤決定是否受傷、傷停天數每日 −1、
//  傷停中不可出賽。**產品方向已確定不採用選手隨機受傷／傷停。**
//  因此本檔不再有 injury 的產生、儲存、倒數與閘門，也不再輸出任何 injury API。
//
//  舊存檔仍可能帶著 `injuryDays` / `injured` 等欄位。本檔**刻意不提及**它們：
//  選手物件一律以展開（`...player`）原樣帶過 ⇒ 讀得到、不會炸、也永遠不被使用。
//  實體欄位清除留給未來的 Player schema cleanup（見 docs/09_技術債務清單.md）。
//
//  ⚠ 移除受傷 ≠ 移除選手生命週期。`age` / `condition` / `matchStreak` 全部保留，
//    Season vNext（年齡推進・巔峰・衰退・退休）要站在這些欄位上，別順手刪掉。
//    守門在 `tools/check_no_player_injury.mjs`。
//
//  純函式：不 import React / zustand / localStorage。
// ============================================================================

/** 費率與門檻。要調手感只改這裡。 */
export const CONDITION = Object.freeze({
  /** 每出賽一場扣的體力。 */
  matchEnergyCost: 12,
  /** 連續出賽每多一場，額外多扣的體力（第 N 場多扣 (N-1)×step）。 */
  streakEnergyStep: 3,
  /** 體力低於此 ⇒ 不可出賽（對應 conditionFor 的「低潮」區）。 */
  unfitBelow: 15,
  /** 每日自然恢復（沒有安排訓練時）。 */
  restPerDay: 8,
  /** 連續幾天沒出賽，連續出賽計數歸零。 */
  streakDecayDays: 1,
});

/** 體力 → 狀態文字（與 playerModel.conditionFor 同一組門檻，避免兩套說法）。 */
export const conditionText = (energy) =>
  energy >= 70 ? "精神飽滿" : energy >= 40 ? "正常" : energy >= 15 ? "疲勞" : "低潮";

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const matchStreakOf = (p) => Math.max(0, num(p?.matchStreak));
export const isExhausted = (p) => num(p?.energy ?? 100) < CONDITION.unfitBelow;

/**
 * 這名選手現在能不能出賽。
 *
 * 目前唯一的體力面阻擋是 **exhausted**（體力 < `unfitBelow`）。
 * 其他合法阻擋（未登錄／重複／席位）在 matchSquad 的名單層，不在這裡。
 * ⚠ 舊存檔的 `injuryDays` **不是**阻擋條件——受傷已被產品取消。
 *
 * @returns {{ok:boolean, code:string|null, message:string|null}} message 可直接顯示
 */
export function matchFitness(player) {
  if (!player) return { ok: false, code: "unknown_player", message: "選手不存在" };
  if (isExhausted(player)) {
    return { ok: false, code: "exhausted", message: `${player.name ?? player.id} 體力過低（${Math.round(num(player.energy))}），需要休息` };
  }
  return { ok: true, code: null, message: null };
}
export const isMatchFit = (p) => matchFitness(p).ok;

/**
 * 出賽後的損耗。**只對實際出賽的選手呼叫**（呼叫端＝賽後結算的單一寫入點）。
 *
 * 完全決定性：同一場比賽重算永遠得到同一個結果 ⇒ 伺服器可以獨立驗算客戶端
 * 送回的狀態。這裡沒有亂數，也不再有任何抽籤。
 *
 * @param {object} player
 * @param {string} key  這場比賽的識別（用 `${transactionId}:${playerId}`），只入近期紀錄
 * @returns {{player:object, drained:number}}
 */
export function applyMatchWear(player, key) {
  const streak = matchStreakOf(player);
  //  連續出賽越多，單場損耗越大 ⇒ 輪換有意義
  const drained = CONDITION.matchEnergyCost + streak * CONDITION.streakEnergyStep;
  const energy = clamp(num(player?.energy ?? 100) - drained, 0, 100);

  return {
    player: {
      ...player,
      energy,
      condition: conditionText(energy),
      matchStreak: streak + 1,
      matchesPlayed: num(player?.matchesPlayed) + 1,
      //  近期狀態：最近幾場的簡易紀錄（最新在前，最多 5 筆）。
      //  ⚠ 這不是戰績來源（戰績仍由 BattleResult / seasonStore 唯一提供），
      //    只是選手卡要顯示「最近打了幾場、狀況如何」。
      recentMatches: [{ key, energyAfter: energy }, ...(Array.isArray(player?.recentMatches) ? player.recentMatches : [])].slice(0, 5),
    },
    drained,
  };
}

/**
 * 每日恢復（由統一時鐘每天呼叫一次）。
 *   · 沒有安排訓練的人自然回體力（有訓練的人由 applyCourse 處理）
 *   · 連續 `streakDecayDays` 天沒出賽 ⇒ 連續出賽計數歸零
 *
 * ⚠ 「今天有沒有出賽」目前沒有逐日紀錄，所以用 `restDays` 累計：
 *   出賽時歸零（applyMatchWear 之後由呼叫端重置），每過一天 +1。
 */
export function applyDailyRecovery(player, { skipEnergy = false, recoveryBonus = 0 } = {}) {
  const restDays = num(player?.restDays) + 1;
  const training = player?.training ?? null;
  //  有排訓練的人不在這裡回體力（避免與 applyCourse 重複計算）
  //  skipEnergy：當天剛由 applyCourse 結算過課程 ⇒ 體力已經動過，不再重複加
  const bonus = Number.isFinite(Number(recoveryBonus)) ? Math.max(0, Number(recoveryBonus)) : 0;
  const energy = (training || skipEnergy) ? num(player?.energy ?? 100)
    : clamp(num(player?.energy ?? 100) + CONDITION.restPerDay + bonus, 0, 100);
  const matchStreak = restDays >= CONDITION.streakDecayDays ? 0 : matchStreakOf(player);
  return {
    ...player,
    energy,
    condition: conditionText(energy),
    restDays,
    matchStreak,
  };
}

/** 選手卡要顯示的狀態摘要（畫面不自己算一套）。 */
export function conditionSummary(player) {
  const energy = Math.round(num(player?.energy ?? 100));
  const fit = matchFitness(player);
  return {
    energy,
    condition: conditionText(energy),
    matchStreak: matchStreakOf(player),
    canPlay: fit.ok,
    reason: fit.message,
    recentMatches: Array.isArray(player?.recentMatches) ? player.recentMatches.length : 0,
  };
}
