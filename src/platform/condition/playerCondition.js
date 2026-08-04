// ============================================================================
//  platform/condition/playerCondition.js — 疲勞・狀態・受傷（Milestone O2）
//
//  ── 為什麼需要這一層 ──────────────────────────────────────────────────────
//  O1 之前，**比賽完全不消耗體力**：只有訓練會扣 `energy`。結果是連續出賽零代價，
//  一隊五人可以無限打下去，替補與輪換沒有任何意義。
//
//  本檔補上最小可用的代價與恢復：
//    · 出賽扣體力，連續出賽累積疲勞（`matchStreak`）
//    · 體力過低或受傷 ⇒ **不可出賽**（由 matchSquad 的閘門擋下）
//    · 休息／訓練日與每日自然恢復會回體力、消化傷勢
//
//  **刻意不做**複雜醫療系統（沒有部位、療程、復健、二次傷害）。傷勢只有
//  「還要幾天」一個數字。
//
//  ── 決定性（伺服器要能重算）────────────────────────────────────────────────
//  受傷判定**不用亂數**：以 `transactionId + playerId` 做 FNV-1a 雜湊推導。
//  同一場比賽重算永遠得到同一個結果 ⇒ 伺服器可以獨立驗算客戶端送回的狀態，
//  不必信任前端提交的數值。這與 S25 發獎、Milestone O 招募是同一套手法。
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
  injury: Object.freeze({
    /** 基礎受傷機率。 */
    base: 0.02,
    /** 體力低於此時改用高風險機率。 */
    lowEnergyBelow: 30,
    lowEnergy: 0.12,
    /** 連續出賽每多一場加的機率。 */
    perStreak: 0.02,
    /** 機率上限（再累也不會必定受傷）。 */
    max: 0.35,
    /** 傷停天數區間（決定性抽樣）。 */
    minDays: 2,
    maxDays: 6,
  }),
});

/** 體力 → 狀態文字（與 playerModel.conditionFor 同一組門檻，避免兩套說法）。 */
export const conditionText = (energy) =>
  energy >= 70 ? "精神飽滿" : energy >= 40 ? "正常" : energy >= 15 ? "疲勞" : "低潮";

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * FNV-1a → [0, 1)。決定性偽亂數：同一個 key 永遠同一個值。
 * 伺服器用同一個 key 重算會得到逐位元相同的結果。
 */
export function deterministicRoll(key) {
  let h = 0x811c9dc5;
  const s = String(key);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h / 0x100000000;
}

export const matchStreakOf = (p) => Math.max(0, num(p?.matchStreak));
export const injuryDaysOf = (p) => Math.max(0, num(p?.injuryDays));
export const isInjured = (p) => injuryDaysOf(p) > 0;
export const isExhausted = (p) => num(p?.energy ?? 100) < CONDITION.unfitBelow;

/**
 * 這名選手現在能不能出賽。
 * @returns {{ok:boolean, code:string|null, message:string|null}} message 可直接顯示
 */
export function matchFitness(player) {
  if (!player) return { ok: false, code: "unknown_player", message: "選手不存在" };
  if (isInjured(player)) {
    return { ok: false, code: "injured", message: `${player.name ?? player.id} 傷停中（還需 ${injuryDaysOf(player)} 天）` };
  }
  if (isExhausted(player)) {
    return { ok: false, code: "exhausted", message: `${player.name ?? player.id} 體力過低（${Math.round(num(player.energy))}），需要休息` };
  }
  return { ok: true, code: null, message: null };
}
export const isMatchFit = (p) => matchFitness(p).ok;

/**
 * 出賽後的損耗。**只對實際出賽的選手呼叫**（呼叫端＝賽後結算的單一寫入點）。
 *
 * @param {object} player
 * @param {string} key  決定性種子（用 `${transactionId}:${playerId}`）
 * @returns {{player:object, drained:number, injured:boolean, injuryDays:number, roll:number, chance:number}}
 */
export function applyMatchWear(player, key) {
  const streak = matchStreakOf(player);
  //  連續出賽越多，單場損耗越大 ⇒ 輪換有意義
  const drained = CONDITION.matchEnergyCost + streak * CONDITION.streakEnergyStep;
  const energy = clamp(num(player?.energy ?? 100) - drained, 0, 100);
  const nextStreak = streak + 1;

  //  受傷機率：體力低 ⇒ 高風險基準；連續出賽再加。上限避免必定受傷。
  const base = energy < CONDITION.injury.lowEnergyBelow ? CONDITION.injury.lowEnergy : CONDITION.injury.base;
  const chance = Math.min(CONDITION.injury.max, base + streak * CONDITION.injury.perStreak);
  const roll = deterministicRoll(key);
  const injured = roll < chance;
  //  傷停天數也用決定性抽樣（第二個雜湊，避免與是否受傷同源而相關）
  const span = CONDITION.injury.maxDays - CONDITION.injury.minDays + 1;
  const injuryDays = injured
    ? CONDITION.injury.minDays + Math.floor(deterministicRoll(`${key}:days`) * span)
    : 0;

  return {
    player: {
      ...player,
      energy,
      condition: conditionText(energy),
      matchStreak: nextStreak,
      matchesPlayed: num(player?.matchesPlayed) + 1,
      injuryDays: injured ? injuryDays : injuryDaysOf(player),
      //  近期狀態：最近幾場的簡易紀錄（最新在前，最多 5 筆）。
      //  ⚠ 這不是戰績來源（戰績仍由 BattleResult / seasonStore 唯一提供），
      //    只是選手卡要顯示「最近打了幾場、狀況如何」。
      recentMatches: [{ key, energyAfter: energy, injured }, ...(Array.isArray(player?.recentMatches) ? player.recentMatches : [])].slice(0, 5),
    },
    drained,
    injured,
    injuryDays,
    roll,
    chance,
  };
}

/**
 * 每日恢復（由統一時鐘每天呼叫一次）。
 *   · 傷停天數 −1
 *   · 沒有安排訓練的人自然回體力（有訓練的人由 applyCourse 處理）
 *   · 連續 `streakDecayDays` 天沒出賽 ⇒ 連續出賽計數歸零
 *
 * ⚠ 「今天有沒有出賽」目前沒有逐日紀錄，所以用 `restDays` 累計：
 *   出賽時歸零（applyMatchWear 之後由呼叫端重置），每過一天 +1。
 */
export function applyDailyRecovery(player, { skipEnergy = false } = {}) {
  const injuryDays = Math.max(0, injuryDaysOf(player) - 1);
  const restDays = num(player?.restDays) + 1;
  const training = player?.training ?? null;
  //  有排訓練的人不在這裡回體力（避免與 applyCourse 重複計算）
  //  skipEnergy：當天剛由 applyCourse 結算過課程 ⇒ 體力已經動過，不再重複加
  const energy = (training || skipEnergy) ? num(player?.energy ?? 100)
    : clamp(num(player?.energy ?? 100) + CONDITION.restPerDay, 0, 100);
  const matchStreak = restDays >= CONDITION.streakDecayDays ? 0 : matchStreakOf(player);
  return {
    ...player,
    energy,
    condition: conditionText(energy),
    injuryDays,
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
    injuryDays: injuryDaysOf(player),
    injured: isInjured(player),
    canPlay: fit.ok,
    reason: fit.message,
    recentMatches: Array.isArray(player?.recentMatches) ? player.recentMatches.length : 0,
  };
}
