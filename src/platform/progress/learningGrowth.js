// ============================================================================
//  platform/progress/learningGrowth.js — CS 跨場 Learning 經驗吸收（R55）
//
//  Learning 只在正式賽果已成立、進入 progress settlement 後消費。
//  它不讀 simulator，不進 combatSkill，不建立單場 RNG；缺少 Learning
//  時以 50 作為 baseline，讓舊存檔維持原本的 XP 吸收量。
// ============================================================================

export const CS_LEARNING_LIFECYCLE_FORMULA_VERSION = "cs-learning-lifecycle.v1";
export const LEARNING_BASELINE = 50;
export const LEARNING_XP_SLOPE = 0.002;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const finite = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * Learning 對賽後經驗吸收的 deterministic multiplier。
 * 每 +10 Learning = +2 percentage points；50 為 neutral baseline。
 */
export function learningMultiplierFor(learning) {
  const value = clamp(finite(learning, LEARNING_BASELINE), 0, 100);
  return 1 + (value - LEARNING_BASELINE) * LEARNING_XP_SLOPE;
}

/**
 * 將既有 CS XP reward 套用 Learning 吸收倍率；仍為整數 XP，避免存檔
 * round-trip 產生小數漂移。
 */
export function learningAdjustedXp({ baseXp, learning }) {
  const base = Math.max(0, Math.round(finite(baseXp, 0)));
  return Math.max(0, Math.round(base * learningMultiplierFor(learning)));
}
