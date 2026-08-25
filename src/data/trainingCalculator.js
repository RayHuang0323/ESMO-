// ============================================================================
//  data/trainingCalculator.js — Training v1.1 純規則層
//
//  這裡只計算「一門課完成一次」的結果，不讀 Store、不寫 persistence、
//  不碰真實時間。`meta.days` 的推進仍由 profileStore.advanceDay() 負責。
//  UI 預估與 applyCourse 都必須使用 calculateTrainingResult()，避免兩套數字。
// ============================================================================

//  ⚠ 只 import 一個 **leaf**（`potentialSpace.js` 自己沒有任何 import）。
//    V0A §G 的規則沒有鬆動：本檔仍**不得** import PCGM（`careerGrowth.js`），
//    否則 PCGM 的任何調整會悄悄改到 Training。
import { potentialSpaceFactor, POTENTIAL_SPACE } from "../platform/progress/potentialSpace.js";

//  ── Foundation Calibration：為什麼從 v1.1 推進到 v1.2 ────────────────────
//  v1.1 有三個經大樣本量測確認的問題，全部在這一版修掉：
//    ① 潛力空間用 `min(1, room/40)` **線性**收斂。V0B 之後新秀主能力空間中位數
//       只有 17.4 點 ⇒ 節流閥入行即只開 43%，且尾巴是漸近線（TD-33）。
//       ⇒ 改為與 `levelGrowth` **共用** `potentialSpaceFactor`（冪次曲線）。
//    ② 年齡係數 28 歲後只以每年 −0.015 下滑、下限 0.82 ⇒ 40 歲仍有 82% 效率，
//       老將可以輕鬆磨到潛力上限。電競生涯本來就短（本作 AI 隊年齡多在 21–26）。
//       ⇒ 29 歲之後改為陡降。**20–28 歲幾乎不動**（age 24 前後都是 1.04），
//         既有陣容不會被打殘。
//    ③ learning 幅度只有 0.90–1.10 ⇒ 四年後高低學習能力只差 4pp，形同不存在。
//       ⇒ 加寬到 0.80–1.22。
//  ⚠ 這一版**不是**衰退系統：能力不會下降，只是成長效率隨年齡改變。
//    真正的 aging / decline / retirement 仍未實作（Season vNext V1）。
export const TRAINING_FORMULA_VERSION = "training-growth.v1.2";

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const round1 = (v) => Math.round(v * 10) / 10;
const round3 = (v) => Math.round(v * 1000) / 1000;

/**
 * 年齡只影響訓練效率，不改能力上限、不改選手年齡，也不建立老化系統。
 *
 * 三段式：
 *   · ≤20 歲    年輕學習優勢（1.10）
 *   · 21–28 歲  平滑下滑到成熟期基準（28 歲 = 0.98）——**這一段與 v1.1 幾乎相同**
 *               （age 24：v1.1 = 1.04、v1.2 = 1.04），既有陣容與 AI 隊不受影響
 *   · ≥29 歲    陡降。電競選手的成長窗口本來就短，v1.1 的 −0.015/年 讓 40 歲
 *               還有 82% 效率，等於任何老將都能被慢慢磨到潛力上限。
 *
 * ⚠ 這**不是**衰退：能力不會下降，只是「還能再進步多少」隨年齡收斂。
 *   下限 0.20 是刻意保留的——歸零會讓老將的訓練畫面出現「永遠 +0」的死路。
 */
export function ageEfficiency(age) {
  const a = Number(age);
  if (!Number.isFinite(a) || a <= 0) return 1;
  if (a <= 20) return 1.10;
  if (a <= 28) return round3(1.10 - (a - 20) * 0.015);
  return round3(Math.max(0.20, 0.98 - (a - 28) * 0.11));
}

/**
 * learning 以 65 為中性點（新秀池的 learning 中位數約 59.5，取 65 讓中位落在
 * 略低於 1.0 的位置，而不是把整池系統性拉低），限制在有界範圍。
 *
 * ⚠ v1.1 的 0.90–1.10 在四年尺度上等於不存在：成長是收斂系統，
 *   純速率差會被「所有人終究逼近自己的上限」抹平（實測 learning 25 vs 95
 *   在 Year 4 只差 4pp）。加寬到 0.80–1.22 之後差距約 9pp，才看得出來。
 *   仍然刻意不做到 2–3 倍——那會讓 learning 蓋過潛力本身。
 */
export function learningEfficiency(learning) {
  const value = clamp(num(learning, 65), 1, 99);
  return round3(clamp(1 + (value - 65) * 0.006, 0.80, 1.22));
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
    //  Foundation Calibration：曲線與 `levelGrowth` **共用同一個函式**，
    //  不再各寫一份線性除法（見 `platform/progress/potentialSpace.js` 檔頭）。
    const potentialSpace = potentialSpaceFactor(room, POTENTIAL_SPACE.trainingRef);
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
