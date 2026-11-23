// ============================================================================
//  battle/moba/sim/detMath.js — DetMath.v1: deterministic sin / cos / atan2 / acos / asin / integer power for the MOBA simulation (moba-sim.v25, C1)
//
//  Why: ECMAScript only requires Math.sin/cos/atan2/acos/... to be "implementation-approximated". Node 24.18 (V8 13.6) and Chrome 157 differ by
//  1 ulp on a few percent of inputs, and that was enough to change match results (review/tactic-book-3a/v24_sprint2a/r2/模擬一致性診斷_Node與Chrome.md).
//  How: these functions use ONLY operations that ECMAScript defines exactly — + − × ÷ on IEEE 754 binary64 with round-to-nearest-even (no FMA
//  contraction is allowed), Math.sqrt (correctly rounded), Math.abs, comparisons, typed-array bit access and BigInt integer arithmetic.
//  ⇒ every conforming engine produces bit-identical results.
//
//  Algorithms: fdlibm 5.3 (Sun Microsystems, freely redistributable) as refined in musl libc — __sin/__cos kernels, __rem_pio2 (Cody–Waite in
//  three steps for |x| < 2^20·π/2), atan/atan2/asin/acos. Huge arguments (|x| ≥ 2^20·π/2) are reduced exactly with BigInt and a 1,408-bit π
//  (Machin's formula, computed once on first use) instead of fdlibm's Payne–Hanek table. Error vs the exact value: < 1 ulp (measured by
//  tools/check_det_math_c1.mjs against a BigInt reference).
//
//  Special values follow the ECMAScript/IEEE contract: NaN → NaN; sin/cos(±∞) → NaN; sin(±0) → ±0; cos(±0) → 1; atan2 signed zeros and
//  infinities per ECMAScript; acos/asin outside [−1, 1] → NaN; acos(1) → +0.
//
//  Pure: no imports, no state that affects results (the π cache is a pure function of nothing). Listed in SIMULATION_SEMANTICS_FILES.
// ============================================================================

export const DET_MATH_VERSION = "DetMath.v1";

const F64 = new Float64Array(1);
const U32 = new Uint32Array(F64.buffer);
const HI = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1 ? 1 : 0; // index of the high word (little-endian ⇒ 1)
const LO = 1 - HI;
const hiWord = (x) => { F64[0] = x; return U32[HI]; };               // unsigned
const loWord = (x) => { F64[0] = x; return U32[LO]; };
const clearLow = (x) => { F64[0] = x; U32[LO] = 0; return F64[0]; };

// ---------------------------------------------------------------------------- kernels (|x| ≤ ~π/4, x + y is the reduced argument)
const S1 = -1.66666666666666324348e-01, S2 = 8.33333333332248946124e-03, S3 = -1.98412698298579493134e-04,
  S4 = 2.75573137070700676789e-06, S5 = -2.50507602534068634195e-08, S6 = 1.58969099521155010221e-10;
function kSin(x, y, iy) {
  const z = x * x, w = z * z;
  const r = S2 + z * (S3 + z * S4) + z * w * (S5 + z * S6);
  const v = z * x;
  if (iy === 0) return x + v * (S1 + z * r);
  return x - ((z * (0.5 * y - v * r) - y) - v * S1);
}
const C1 = 4.16666666666666019037e-02, C2 = -1.38888888888741095749e-03, C3 = 2.48015872894767294178e-05,
  C4 = -2.75573143513906633035e-07, C5 = 2.08757232129817482790e-09, C6 = -1.13596475577881948265e-11;
function kCos(x, y) {
  const z = x * x, w = z * z;
  const r = z * (C1 + z * (C2 + z * C3)) + w * w * (C4 + z * (C5 + z * C6));
  const hz = 0.5 * z;
  const v = 1.0 - hz;
  return v + (((1.0 - v) - hz) + (z * r - x * y));
}

// ---------------------------------------------------------------------------- argument reduction: x = n·π/2 + (Y0 + Y1)
const TOINT = 1.5 / 2.220446049250313e-16;   // 1.5 / DBL_EPSILON = 6755399441055744
const PIO4 = 7.85398163397448278999e-01;
const INVPIO2 = 6.36619772367581382433e-01;
const PIO2_1 = 1.57079632673412561417e+00, PIO2_1T = 6.07710050650619224932e-11;
const PIO2_2 = 6.07710050630396597660e-11, PIO2_2T = 2.02226624879595063154e-21;
const PIO2_3 = 2.02226624871116645580e-21, PIO2_3T = 8.47842766036889956997e-32;
let Y0 = 0, Y1 = 0;

function remPio2Medium(x, ix) {
  let fn = x * INVPIO2 + TOINT - TOINT;
  let n = fn | 0;
  let r = x - fn * PIO2_1;
  let w = fn * PIO2_1T;
  if (r - w < -PIO4) { n--; fn--; r = x - fn * PIO2_1; w = fn * PIO2_1T; }
  else if (r - w > PIO4) { n++; fn++; r = x - fn * PIO2_1; w = fn * PIO2_1T; }
  Y0 = r - w;
  const ex = ix >>> 20;
  let ey = (hiWord(Y0) >>> 20) & 0x7ff;
  if (ex - ey > 16) {
    let t = r; w = fn * PIO2_2; r = t - w; w = fn * PIO2_2T - ((t - r) - w); Y0 = r - w;
    ey = (hiWord(Y0) >>> 20) & 0x7ff;
    if (ex - ey > 49) { t = r; w = fn * PIO2_3; r = t - w; w = fn * PIO2_3T - ((t - r) - w); Y0 = r - w; }
  }
  Y1 = (r - Y0) - w;
  return n;
}

function remPio2(x) {
  const hx = hiWord(x), sign = hx >>> 31, ix = hx & 0x7fffffff;
  let z;
  if (ix <= 0x400f6a7a) {                    // |x| ~<= 5π/4
    if ((ix & 0xfffff) === 0x921fb) return remPio2Medium(x, ix);   // |x| ~= π/2 or 2π/2
    if (ix <= 0x4002d97c) {                  // |x| ~<= 3π/4
      if (!sign) { z = x - PIO2_1; Y0 = z - PIO2_1T; Y1 = (z - Y0) - PIO2_1T; return 1; }
      z = x + PIO2_1; Y0 = z + PIO2_1T; Y1 = (z - Y0) + PIO2_1T; return -1;
    }
    if (!sign) { z = x - 2 * PIO2_1; Y0 = z - 2 * PIO2_1T; Y1 = (z - Y0) - 2 * PIO2_1T; return 2; }
    z = x + 2 * PIO2_1; Y0 = z + 2 * PIO2_1T; Y1 = (z - Y0) + 2 * PIO2_1T; return -2;
  }
  if (ix <= 0x401c463b) {                    // |x| ~<= 9π/4
    if (ix <= 0x4015fdbc) {                  // |x| ~<= 7π/4
      if (ix === 0x4012d97c) return remPio2Medium(x, ix);         // |x| ~= 3π/2
      if (!sign) { z = x - 3 * PIO2_1; Y0 = z - 3 * PIO2_1T; Y1 = (z - Y0) - 3 * PIO2_1T; return 3; }
      z = x + 3 * PIO2_1; Y0 = z + 3 * PIO2_1T; Y1 = (z - Y0) + 3 * PIO2_1T; return -3;
    }
    if (ix === 0x401921fb) return remPio2Medium(x, ix);           // |x| ~= 4π/2
    if (!sign) { z = x - 4 * PIO2_1; Y0 = z - 4 * PIO2_1T; Y1 = (z - Y0) - 4 * PIO2_1T; return 4; }
    z = x + 4 * PIO2_1; Y0 = z + 4 * PIO2_1T; Y1 = (z - Y0) + 4 * PIO2_1T; return -4;
  }
  if (ix < 0x413921fb) return remPio2Medium(x, ix);               // |x| ~< 2^20·π/2
  return remPio2Large(x);                                          // finite and huge (callers handle NaN/∞)
}

// ---- huge arguments: exact reduction with BigInt
const FRAC = 1344;                 // fraction bits of the fixed-point π/2 (enough for |x| up to 2^1024 and the closest approach to n·π/2)
let PIO2_BIG = null;               // floor(π/2 · 2^FRAC)
function atanInvBig(k, bits) {     // atan(1/k) · 2^bits, k a positive BigInt; alternating series, truncating division
  const one = 1n << bits, k2 = k * k;
  let term = one / k, sum = term, i = 1n, sgn = -1n;
  while (term !== 0n) { term /= k2; const t = term / (2n * i + 1n); if (t === 0n) break; sum += sgn * t; sgn = -sgn; i++; }
  return sum;
}
function pio2Big() {
  if (PIO2_BIG === null) {
    const G = 64n, bits = BigInt(FRAC) + G;
    const pi = 16n * atanInvBig(5n, bits) - 4n * atanInvBig(239n, bits);   // π · 2^bits (error ≪ 2^-FRAC)
    PIO2_BIG = pi >> (G + 1n);                                              // π/2 · 2^FRAC
  }
  return PIO2_BIG;
}
function bitLength(a) { return a === 0n ? 0 : a.toString(2).length; }
function pow2(k) {                 // exact 2^k for −1022 ≤ k ≤ 1023
  F64[0] = 0; U32[HI] = (k + 1023) << 20; U32[LO] = 0; return F64[0];
}
function bigToDouble(b) {          // b · 2^-FRAC, nearest after a 64-bit truncation (deterministic; Y1 carries the rest)
  if (b === 0n) return 0;
  const neg = b < 0n, a = neg ? -b : b, sh = Math.max(0, bitLength(a) - 64);
  const v = Number(a >> BigInt(sh)) * pow2(sh - FRAC);
  return neg ? -v : v;
}
function doubleToBig(y) {          // y · 2^FRAC as an exact BigInt (y finite, |y| ≥ 2^-FRAC)
  if (y === 0) return 0n;
  const h = hiWord(y), l = loWord(y), e = (h >>> 20) & 0x7ff;
  let m = (BigInt(h & 0xfffff) << 32n) | BigInt(l);
  if (e !== 0) m |= 1n << 52n;
  const sh = (e === 0 ? 1 : e) - 1075 + FRAC;
  const v = sh >= 0 ? m << BigInt(sh) : m >> BigInt(-sh);
  return (h >>> 31) ? -v : v;
}
function remPio2Large(x) {
  const P = pio2Big(), neg = x < 0, X = doubleToBig(neg ? -x : x);
  let q = X / P, r = X - q * P;
  if (2n * r > P) { q += 1n; r -= P; }
  let y0 = bigToDouble(r), y1 = bigToDouble(r - doubleToBig(y0));
  const n = Number(q & 3n);
  if (neg) { y0 = -y0; y1 = -y1; Y0 = y0; Y1 = y1; return -n; }
  Y0 = y0; Y1 = y1; return n;
}

// ---------------------------------------------------------------------------- sin / cos
export function detSin(x) {
  const ix = hiWord(x) & 0x7fffffff;
  if (ix <= 0x3fe921fb) {                    // |x| ~< π/4
    if (ix < 0x3e500000) return x;           // |x| < 2^-26 (keeps −0)
    return kSin(x, 0.0, 0);
  }
  if (ix >= 0x7ff00000) return x - x;        // NaN or ±∞ ⇒ NaN
  const n = remPio2(x);
  switch (n & 3) {
    case 0: return kSin(Y0, Y1, 1);
    case 1: return kCos(Y0, Y1);
    case 2: return -kSin(Y0, Y1, 1);
    default: return -kCos(Y0, Y1);
  }
}
export function detCos(x) {
  const ix = hiWord(x) & 0x7fffffff;
  if (ix <= 0x3fe921fb) {
    if (ix < 0x3e46a09e) return 1.0;         // |x| < 2^-27·√2
    return kCos(x, 0.0);
  }
  if (ix >= 0x7ff00000) return x - x;
  const n = remPio2(x);
  switch (n & 3) {
    case 0: return kCos(Y0, Y1);
    case 1: return -kSin(Y0, Y1, 1);
    case 2: return -kCos(Y0, Y1);
    default: return kSin(Y0, Y1, 1);
  }
}

// ---------------------------------------------------------------------------- atan / atan2
const ATANHI = [4.63647609000806093515e-01, 7.85398163397448278999e-01, 9.82793723247329054082e-01, 1.57079632679489655800e+00];
const ATANLO = [2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17];
const AT = [3.33333333333329318027e-01, -1.99999999998764832476e-01, 1.42857142725034663711e-01, -1.11111104054623557880e-01,
  9.09088713343650656196e-02, -7.69187620504482999495e-02, 6.66107313738753120669e-02, -5.83357013379057348645e-02,
  4.97687799461593236017e-02, -3.65315727442169155270e-02, 1.62858201153657823623e-02];
export function detAtan(x) {
  const hx = hiWord(x), sign = hx >>> 31, ix = hx & 0x7fffffff;
  let id;
  if (ix >= 0x44100000) {                    // |x| ≥ 2^66 (or NaN/∞)
    if (x !== x) return x;
    return sign ? -ATANHI[3] : ATANHI[3];
  }
  if (ix < 0x3fdc0000) {                     // |x| < 0.4375
    if (ix < 0x3e400000) return x;           // |x| < 2^-27
    id = -1;
  } else {
    x = Math.abs(x);
    if (ix < 0x3ff30000) {                   // |x| < 1.1875
      if (ix < 0x3fe60000) { id = 0; x = (2.0 * x - 1.0) / (2.0 + x); }
      else { id = 1; x = (x - 1.0) / (x + 1.0); }
    } else if (ix < 0x40038000) { id = 2; x = (x - 1.5) / (1.0 + 1.5 * x); }
    else { id = 3; x = -1.0 / x; }
  }
  const z = x * x, w = z * z;
  const s1 = z * (AT[0] + w * (AT[2] + w * (AT[4] + w * (AT[6] + w * (AT[8] + w * AT[10])))));
  const s2 = w * (AT[1] + w * (AT[3] + w * (AT[5] + w * (AT[7] + w * AT[9]))));
  if (id < 0) return x - x * (s1 + s2);
  const r = ATANHI[id] - ((x * (s1 + s2) - ATANLO[id]) - x);
  return sign ? -r : r;
}
const PI = 3.1415926535897931160E+00, PI_LO = 1.2246467991473531772E-16;
export function detAtan2(y, x) {
  if (x !== x || y !== y) return x + y;
  const hx = hiWord(x), lx = loWord(x), hy = hiWord(y), ly = loWord(y);
  if (((hx - 0x3ff00000) | lx) === 0) return detAtan(y);           // x = 1.0
  const m = ((hy >>> 31) & 1) | ((hx >>> 30) & 2);                  // 2·sign(x) + sign(y)
  const ix = hx & 0x7fffffff, iy = hy & 0x7fffffff;
  if ((iy | ly) === 0) {                                             // y = ±0
    if (m === 0 || m === 1) return y;
    return m === 2 ? PI : -PI;
  }
  if ((ix | lx) === 0) return (m & 1) ? -PI / 2 : PI / 2;           // x = ±0
  if (ix === 0x7ff00000) {                                           // x = ±∞
    if (iy === 0x7ff00000) {
      if (m === 0) return PI / 4;
      if (m === 1) return -PI / 4;
      if (m === 2) return 3 * PI / 4;
      return -3 * PI / 4;
    }
    if (m === 0) return 0.0;
    if (m === 1) return -0.0;
    if (m === 2) return PI;
    return -PI;
  }
  if (ix + (64 << 20) < iy || iy === 0x7ff00000) return (m & 1) ? -PI / 2 : PI / 2;   // |y/x| > 2^64
  let z;
  if ((m & 2) && iy + (64 << 20) < ix) z = 0;                        // |y/x| < 2^-64, x < 0
  else z = detAtan(Math.abs(y / x));
  if (m === 0) return z;
  if (m === 1) return -z;
  if (m === 2) return PI - (z - PI_LO);
  return (z - PI_LO) - PI;
}

// ---------------------------------------------------------------------------- asin / acos
const PIO2_HI = 1.57079632679489655800e+00, PIO2_LO = 6.12323399573676603587e-17;
const PS0 = 1.66666666666666657415e-01, PS1 = -3.25565818622400915405e-01, PS2 = 2.01212532134862925881e-01,
  PS3 = -4.00555345006794114027e-02, PS4 = 7.91534994289814532176e-04, PS5 = 3.47933107596021167570e-05,
  QS1 = -2.40339491173441421878e+00, QS2 = 2.02094576023350569471e+00, QS3 = -6.88283971605453293030e-01, QS4 = 7.70381505559019352791e-02;
function R(z) {
  const p = z * (PS0 + z * (PS1 + z * (PS2 + z * (PS3 + z * (PS4 + z * PS5)))));
  const q = 1.0 + z * (QS1 + z * (QS2 + z * (QS3 + z * QS4)));
  return p / q;
}
export function detAcos(x) {
  const hx = hiWord(x), ix = hx & 0x7fffffff;
  if (ix >= 0x3ff00000) {                    // |x| ≥ 1 or NaN
    if (((ix - 0x3ff00000) | loWord(x)) === 0) return (hx >>> 31) ? 2 * PIO2_HI : 0;
    return NaN;
  }
  if (ix < 0x3fe00000) {                     // |x| < 0.5
    if (ix <= 0x3c600000) return PIO2_HI;    // |x| < 2^-57
    return PIO2_HI - (x - (PIO2_LO - x * R(x * x)));
  }
  if (hx >>> 31) {                           // x < −0.5
    const z = (1.0 + x) * 0.5, s = Math.sqrt(z), w = R(z) * s - PIO2_LO;
    return 2 * (PIO2_HI - (s + w));
  }
  const z = (1.0 - x) * 0.5, s = Math.sqrt(z), df = clearLow(s);   // x > 0.5
  const c = (z - df * df) / (s + df);
  const w = R(z) * s + c;
  return 2 * (df + w);
}
export function detAsin(x) {
  const hx = hiWord(x), ix = hx & 0x7fffffff;
  if (ix >= 0x3ff00000) {
    if (((ix - 0x3ff00000) | loWord(x)) === 0) return x * PIO2_HI;  // ±π/2
    return NaN;
  }
  if (ix < 0x3fe00000) {                     // |x| < 0.5
    if (ix < 0x3e500000 && ix >= 0x00100000) return x;
    return x + x * R(x * x);
  }
  const z = (1 - Math.abs(x)) * 0.5, s = Math.sqrt(z), r = R(z);
  let v;
  if (ix >= 0x3fef3333) v = PIO2_HI - (2 * (s + s * r) - PIO2_LO);  // |x| > 0.975
  else {
    const f = clearLow(s), c = (z - f * f) / (s + f);
    v = 0.5 * PIO2_HI - (2 * s * r - (PIO2_LO - 2 * c) - (0.5 * PIO2_HI - 2 * f));
  }
  return (hx >>> 31) ? -v : v;
}

// ---------------------------------------------------------------------------- integer power (replaces `x ** n` for small integer n ≥ 0)
/** x^n by left-to-right repeated multiplication. n must be a non-negative safe integer; anything else throws (det.v1 never needs it). */
export function detPowInt(x, n) {
  if (!Number.isInteger(n) || n < 0 || n > 1024) throw new RangeError(`detPowInt: unsupported exponent ${n}`);
  let r = 1;
  for (let i = 0; i < n; i++) r *= x;
  return r;
}

/** The functions the det.v1 kernel replaces, by Math name (used by LogicEngine and by the C1 tools). */
export const DET_MATH = Object.freeze({ sin: detSin, cos: detCos, atan2: detAtan2, acos: detAcos, asin: detAsin, atan: detAtan, powInt: detPowInt });
