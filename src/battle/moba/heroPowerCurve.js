// ============================================================================
//  heroPowerCurve.js — Hero Early／Mid／Late Power Curve v1（moba-sim.v17，受模擬語意指紋保護）
//
//  每名英雄一條「前期／中期／後期」強度曲線（1–5 分，見 heroPowerCurveTable.js 與推導規則
//  heroPowerCurveDerive.js）。引擎在**唯一**的等級掛點 `_applyMatchLevel` 把它乘進
//  power（普攻與技能共用）與最大生命（半幅）：
//    k(phase) = 1 + AMP × (score(phase) − 三段平均)   ⇒ 三段平均倍率恆為 1（只改「什麼時候強」）
//  階段以**本場等級**判定（實測：5 分鐘≈Lv4、10 分鐘≈Lv7、20 分鐘≈Lv11），段間線性內插：
//    Lv ≤ EARLY_LV ＝前期；Lv = MID_LV ＝中期；Lv ≥ LATE_LV ＝後期
//  決定性：純查表＋等級，不耗 rng；Replay 由 config 的曲線＋frame 的等級還原同一個值。
// ============================================================================
import { HERO_POWER_CURVE_TABLE } from './heroPowerCurveTable.js';

export const HERO_POWER_CURVE_CONTRACT = 'hero-power-curve.v1';
export const POWER_CURVE_AMP = 0.04;        // 每 1 分偏離 ⇒ 戰力 ±4%
export const POWER_CURVE_HP_AMP = 0.02;     // 最大生命半幅
export const EARLY_LV = 4, MID_LV = 7, LATE_LV = 11;
export const PHASE_LABELS = Object.freeze(['前期', '中期', '後期']);

export const powerCurveOf = (heroId) => HERO_POWER_CURVE_TABLE[heroId] ?? null;

/** 曲線（1–5 分）→ 三段倍率 { power:[e,m,l], hp:[e,m,l] }。 */
export function curveMultipliers(curve) {
  const mean = (curve[0] + curve[1] + curve[2]) / 3;
  return {
    power: curve.map((v) => 1 + POWER_CURVE_AMP * (v - mean)),
    hp: curve.map((v) => 1 + POWER_CURVE_HP_AMP * (v - mean)),
  };
}

/** 本場等級 → 內插位置 [0, 2]（0＝前期、1＝中期、2＝後期）。 */
export function phasePosOf(mlv) {
  const lv = Math.max(1, mlv ?? 1);
  if (lv <= EARLY_LV) return 0;
  if (lv < MID_LV) return (lv - EARLY_LV) / (MID_LV - EARLY_LV);
  if (lv < LATE_LV) return 1 + (lv - MID_LV) / (LATE_LV - MID_LV);
  return 2;
}
export const phaseIndexOf = (mlv) => Math.round(phasePosOf(mlv));

/** 三段倍率 × 等級 → 此刻倍率。 */
export function curveKAt(k3, mlv) {
  const pos = phasePosOf(mlv);
  const i = Math.min(1, Math.floor(pos));
  const f = pos - i;
  return k3[i] + (k3[i + 1] - k3[i]) * f;
}

/** 此英雄的強勢期（分數最高的一段；同分取較早）。 */
export function peakPhaseOf(curve) {
  let best = 0;
  for (let i = 1; i < 3; i++) if (curve[i] > curve[best]) best = i;
  return best;
}

/** 名單 → engine.configureHeroPowerCurve 入參；沒有任何曲線 ⇒ null（不呼叫 ⇒ 逐位元不變）。 */
export function toEngineHeroPowerCurve(roster = {}) {
  const players = {};
  for (const [seat, row] of Object.entries(roster ?? {})) {
    const heroId = row?.heroId ?? row?.hero?.id ?? null;
    const entry = powerCurveOf(heroId);
    if (!entry) continue;
    const k = curveMultipliers(entry.curve);
    players[seat] = { heroId, curve: [...entry.curve], power: k.power, hp: k.hp, peak: peakPhaseOf(entry.curve) };
  }
  return Object.keys(players).length ? { version: HERO_POWER_CURVE_CONTRACT, players } : null;
}
