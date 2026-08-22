// ============================================================================
//  data/trainingCalculator.js — Training v1.1 純規則層
//
//  這裡只計算「一門課完成一次」的結果，不讀 Store、不寫 persistence、
//  不碰真實時間。`meta.days` 的推進仍由 profileStore.advanceDay() 負責。
//  UI 預估與 applyCourse 都必須使用 calculateTrainingResult()，避免兩套數字。
// ============================================================================

export const TRAINING_FORMULA_VERSION = "training-growth.v1.1";

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const round1 = (v) => Math.round(v * 10) / 10;
const round3 = (v) => Math.round(v * 1000) / 1000;

/**
 * 年齡只影響訓練效率，不改能力上限、不改選手年齡，也不建立老化系統。
 * 20 歲以下維持小幅學習優勢；28 歲為成熟期基準；之後平滑下降。
 */
export function ageEfficiency(age) {
  const a = Number(age);
  if (!Number.isFinite(a) || a <= 0) return 1;
  if (a <= 20) return 1.08;
  if (a <= 28) return round3(1.08 - (a - 20) * 0.01);
  return round3(Math.max(0.82, 1 - (a - 28) * 0.015));
}

/**
 * learning 以 70 為中性點，限制在溫和範圍，避免變成 2–3 倍成長差。
 */
export function learningEfficiency(learning) {
  const value = clamp(num(learning, 70), 1, 99);
  return round3(clamp(1 + (value - 70) * 0.0035, 0.90, 1.10));
}

/**
 * 狀態由同一份 energy 推導。體力越低效率越差，但仍保留可理解的漸進曲線。
 */
export function conditionEfficiency(energy) {
  const value = clamp(num(energy, 100), 0, 100);
  return round3(0.82 + value * 0.0018);
}

const ageReason = (factor) => factor >= 1.05 ? "年輕" : factor <= 0.92 ? "高齡" : "年齡正常";
const learningReason = (factor) => factor >= 1.04 ? "高學習" : factor <= 0.96 ? "低學習" : "學習正常";
const conditionReason = (factor) => factor >= 0.95 ? "狀態良好" : factor <= 0.86 ? "疲勞" : "狀態正常";

/**
 * 純函式：player + course → TrainingResult。
 *
 * 實際成長：
 *   課程基礎成長 × 潛力空間係數 × 年齡係數 × 學習能力係數 × 狀態係數
 *
 * `statChanges` 的 after 是套用後的實際值；applyCourse 與 UI 預估共用這份結果。
 */
export function calculateTrainingResult(player, course) {
  if (!player || !course?.id) {
    return { version: TRAINING_FORMULA_VERSION, completed: false, courseId: null, statChanges: {}, gains: {}, totalGain: 0 };
  }

  const isRest = course.id === "rest";
  const energyBefore = clamp(num(player.energy, isRest ? 50 : 100), 0, 100);
  if (isRest) {
    const energyAfter = clamp(energyBefore + 30, 0, 100);
    return {
      version: TRAINING_FORMULA_VERSION,
      completed: true,
      courseId: course.id,
      statChanges: {},
      gains: {},
      totalGain: 0,
      energyBefore,
      energyAfter,
      energyDelta: round1(energyAfter - energyBefore),
      staminaCost: 0,
      efficiency: 1,
      modifiers: { age: 1, learning: 1, condition: 1 },
      reasons: ["恢復體力"],
    };
  }

  const potential = clamp(num(player.potential, 80), 1, 99);
  const age = ageEfficiency(player.age);
  const learning = learningEfficiency(player.stats?.learning ?? player.learning);
  const condition = conditionEfficiency(energyBefore);
  const statChanges = {};
  const gains = {};

  for (const key of course.stats ?? []) {
    const before = clamp(num(player.stats?.[key], 50), 0, 99);
    const room = Math.max(0, potential - before);
    const potentialSpace = room > 0 ? Math.min(1, room / 40) : 0;
    const rawGain = num(course.gain) * potentialSpace * age * learning * condition;
    const gain = room > 0 ? Math.min(room, round1(rawGain)) : 0;
    const after = round1(Math.min(potential, Math.min(99, before + gain)));
    const applied = round1(Math.max(0, after - before));
    statChanges[key] = { before, after, gain: applied, potentialSpace: round3(potentialSpace) };
    if (applied > 0) gains[key] = applied;
  }

  const staminaCost = Math.max(0, num(course.energyCost));
  const energyAfter = clamp(energyBefore - staminaCost, 0, 100);
  return {
    version: TRAINING_FORMULA_VERSION,
    completed: true,
    courseId: course.id,
    statChanges,
    gains,
    totalGain: round1(Object.values(gains).reduce((sum, gain) => sum + gain, 0)),
    energyBefore,
    energyAfter,
    energyDelta: round1(energyAfter - energyBefore),
    staminaCost,
    efficiency: round3(age * learning * condition),
    modifiers: { age, learning, condition },
    reasons: [ageReason(age), learningReason(learning), conditionReason(condition)],
  };
}
