// ============================================================================
//  platform/progress/careerStage.js — 生涯階段（Season vNext V4）
//
//  ── 這一層要解決什麼 ──────────────────────────────────────────────────────
//  `ui/playerProfileFoundation.careerStageOf` 一直在讀 `player.careerStage`，
//  但**全 repo 沒有任何地方寫入它** ⇒ 選手頁的「生涯階段」永遠顯示「未啟用」。
//  UI 契約（五個標籤、兩個畫面）早就接好了，缺的只是那個值。
//
//  ── 為什麼是推導，不是欄位 ────────────────────────────────────────────────
//  存一份就有第二份真相：`age` 每年會動、`stats` 每次訓練會動，存下來的階段
//  遲早與它們不同步，而且舊存檔要遷移。⇒ 與 `careerYearOf` 同一個紀律：
//  **算得出來的東西不落盤。**
//
//  ── 判定：age 為主軸，成熟度造成有界偏移 ─────────────────────────────────
//  使用者要求「以 age 為主要依據，但不要硬切成固定年齡模板」。
//  難處是**早熟／晚熟沒有存在選手身上**——`PROSPECT_TWISTS` 是生成時套用的
//  delta（core / room / age / learning），簽約後只剩下結果。
//  ⇒ 所以偏移讀的是「這名選手**現在實際走到哪**」，不是他出生時的標籤：
//
//        maturity      = 定位主能力平均 / 潛力          （runtime 算得出來）
//        offset        = K × (maturity − 同齡期望值)     （有界）
//        effectiveAge  = age + offset
//
//  ⚠ 為什麼要比「同齡期望值」而不是一個固定中性點：
//    `tools/careerstage_calibration.mjs` 實測，maturity 在 24 歲之後就飽和了
//    （p10–p90 只剩 0.05–0.06）。用固定中性點會讓 15 歲的人一律吃到滿格負偏移。
//    比同齡期望值之後，**殘差在青年期大、在成熟期趨近 0 ⇒ 偏移自己淡出**，
//    不需要為年長選手另外寫規則。
//
//  ⚠ 常數的來源全部是實測（見同一支 calibration）：
//    · 期望值表 = 12 年生涯模擬的同齡中位數
//    · `perMaturity` 18 = 讓青年期兩端相差約 ±2 年（青年期殘差跨度 0.22）
//    · 單次課程最大 Δmaturity 實測 0.01 ⇒ effectiveAge 最多動 0.18 年，
//      而最窄的階段區間是 4 年 ⇒ **一次訓練連一階都跳不了。**
//
//  ⚠ **不含「退役」。** 那是後續的生涯事件與 lifecycle state 該決定的事，
//    不得由年齡推導出來——一個 38 歲的人可能還在打，也可能三年前就走了。
//  ⚠ 純函式：不 import Store / React / localStorage。
// ============================================================================
import { growthKeysFor } from "./levelGrowth.js";

/** 五個階段。**唯一來源**——與 `ui/playerProfileFoundation` 的標籤表同名。 */
export const CAREER_STAGES = Object.freeze({
  rookie: "rookie", growth: "growth", peak: "peak", mature: "mature", veteran: "veteran",
});

/**
 * 階段區間，依 `effectiveAge` 由小到大。`until` 為上界（不含）。
 *
 * ⚠ 巔峰期在 **29 歲**結束，而那正是既有 `ageEfficiency` 的轉折點
 *   （28 歲 0.98 → 29 歲 0.87 陡降起點）⇒ 階段與成長曲線說同一個故事，
 *   不會出現「畫面說他還在巔峰、數字說他已經練不動」。
 */
export const STAGE_BANDS = Object.freeze([
  Object.freeze({ id: CAREER_STAGES.rookie, until: 20 }),
  Object.freeze({ id: CAREER_STAGES.growth, until: 24 }),
  Object.freeze({ id: CAREER_STAGES.peak, until: 29 }),
  Object.freeze({ id: CAREER_STAGES.mature, until: 33 }),
  Object.freeze({ id: CAREER_STAGES.veteran, until: Infinity }),
]);

/** 最窄的有界區間（年）。防跳階的判準拿它當分母，不要另外寫死數字。 */
export const NARROWEST_BAND_YEARS = 4;

export const MATURITY = Object.freeze({
  firstAge: 15,
  //  同齡期望 maturity：index 0 = 15 歲，之後逐歲；超出兩端一律取端點。
  expected: Object.freeze([0.67, 0.77, 0.80, 0.82, 0.87, 0.87, 0.90, 0.93, 0.94, 0.95, 0.96, 0.96, 0.97]),
  perMaturity: 18,
  maxOffsetYears: 2.5,
});

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** 年齡，**沒有就是沒有**（不編造）。 */
const ageOf = (player) => {
  if (player?.age == null) return null;
  const a = Number(player.age);
  return Number.isFinite(a) && a > 0 ? a : null;
};

/** 成熟度：定位主能力平均 / 潛力，夾在 0–1。 */
export function maturityOf(player) {
  const pot = Number(player?.potential);
  if (!Number.isFinite(pot) || pot <= 0) return 0;
  const s = player?.stats ?? {};
  //  ⚠ 定位主能力沿用**既有**的 `growthKeysFor`（與 levelGrowth 同一套規則），
  //    不在這裡另寫一份定位對應表。
  const keys = growthKeysFor(player) ?? Object.keys(s).slice(0, 5);
  if (!keys.length) return 0;
  const avg = keys.reduce((acc, k) => acc + (Number(s[k]) || 50), 0) / keys.length;
  return clamp(avg / pot, 0, 1);
}

/** 這個年齡「典型上」應該走到多熟。 */
export function expectedMaturityAt(age) {
  const i = clamp(Math.round(Number(age) || MATURITY.firstAge) - MATURITY.firstAge, 0, MATURITY.expected.length - 1);
  return MATURITY.expected[i];
}

/** 生涯年齡＝實際年齡 ＋ 有界的成熟度偏移。沒有年齡 ⇒ `null`。 */
export function effectiveCareerAgeOf(player) {
  const age = ageOf(player);
  if (age === null) return null;
  const resid = maturityOf(player) - expectedMaturityAt(age);
  return age + clamp(resid * MATURITY.perMaturity, -MATURITY.maxOffsetYears, MATURITY.maxOffsetYears);
}

/** 生涯階段。沒有年齡 ⇒ `null`（呼叫端據實顯示「未啟用」，不猜）。 */
export function careerStageOf(player) {
  const eff = effectiveCareerAgeOf(player);
  if (eff === null) return null;
  return (STAGE_BANDS.find((b) => eff < b.until) ?? STAGE_BANDS[STAGE_BANDS.length - 1]).id;
}
