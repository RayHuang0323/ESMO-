// ============================================================================
//  battle/moba/sim/detHypot.js — DetHypot.v1: deterministic 2-argument hypot for the MOBA simulation (moba-sim.v26, C2, 2026-11-23)
//
//  Why: ECMAScript leaves Math.hypot "implementation-approximated". V8 (Node, Chrome) and SpiderMonkey / JavaScriptCore (Firefox, WebKit) return
//  different last bits on ~36% of game inputs, which moved tower coordinates from tick 0 (C1 closure, TD-TAC-63).
//  How: fdlibm 5.3 e_hypot.c structure (|x| ≥ |y| order, exact power-of-two scaling for huge/tiny inputs, a² + b² rebuilt from exactly
//  representable partial products) — but the high/low split uses Dekker/Veltkamp splitting (multiply by 2^27 + 1) instead of clearing the low
//  32 bits, so only + − × ÷, Math.sqrt (correctly rounded) and Math.abs are used ⇒ bit-identical on every conforming engine (no FMA contraction
//  is allowed by ECMAScript). Error vs the exact value is measured in tools/check_det_hypot_c2.mjs against a BigInt reference.
//  Special values (ECMAScript order): any ±∞ ⇒ +∞ (even with NaN); otherwise any NaN ⇒ NaN; hypot(±0, ±0) = +0.
//  Pure, no imports, no state. Listed in SIMULATION_SEMANTICS_FILES.
// ============================================================================
export const DET_HYPOT_VERSION = "DetHypot.v1";

const SPLIT = 134217729;            // 2^27 + 1
const P2_600 = 2 ** 600, P2_M600 = 2 ** -600, P2_1022 = 2 ** 1022, P2_M1022 = 2 ** -1022;
const BIG = 2 ** 500, SMALL = 2 ** -500, RATIO = 2 ** -60;

/** hypot(x, y) = √(x² + y²), deterministic. */
export function detHypot(x, y) {
  let a = Math.abs(x), b = Math.abs(y);
  if (a === Infinity || b === Infinity) return Infinity;
  if (a !== a || b !== b) return NaN;
  if (a < b) { const t = a; a = b; b = t; }          // a ≥ b ≥ 0
  if (b === 0) return a;                              // includes (0, 0) ⇒ +0
  if (b < a * RATIO) return a + b;                    // b²/a² < 2^-120: the result rounds to a (fdlibm: x/y > 2^60)
  let scale = 1;
  if (a > BIG) { a *= P2_M600; b *= P2_M600; scale = P2_600; }               // exact: b ≥ a·2^-60 > 2^440
  else if (b < SMALL) {
    if (b < P2_M1022) { a *= P2_1022; b *= P2_1022; scale = P2_M1022; }     // subnormal b: exact (b = m·2^-1074)
    else { a *= P2_600; b *= P2_600; scale = P2_M600; }                      // exact: a < b·2^60 < 2^-440
  }
  const w = a - b;
  let r;
  if (w > b) {
    //  a > 2b: a² = t1² + t2·(a + t1) with a = t1 + t2, t1 has ≤ 26 significant bits ⇒ t1·t1 is exact.
    const c = SPLIT * a, t1 = c - (c - a), t2 = a - t1;
    r = Math.sqrt(t1 * t1 - (b * (-b) - t2 * (a + t1)));
  } else {
    //  b ≤ a ≤ 2b: a² + b² = w² + 2a·b, 2a = t1 + t2, b = y1 + y2 (26-bit high parts) ⇒ t1·y1 is exact.
    const a2 = a + a;
    const cb = SPLIT * b, y1 = cb - (cb - b), y2 = b - y1;
    const ca = SPLIT * a2, t1 = ca - (ca - a2), t2 = a2 - t1;
    r = Math.sqrt(t1 * y1 - (w * (-w) - (t1 * y2 + t2 * b)));
  }
  return scale === 1 ? r : r * scale;
}
