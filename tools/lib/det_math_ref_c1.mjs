// ============================================================================
//  tools/lib/det_math_ref_c1.mjs — high-precision BigInt reference for DetMath.v1 error measurement (C1, 2026-11-23).
//
//  Independent of detMath.js on purpose: π comes from Störmer's formula (π/4 = 44·atan(1/57) + 7·atan(1/239) − 12·atan(1/682) + 24·atan(1/12943)),
//  not Machin's; reduction, series and square roots are done in BigInt fixed point with ≥ 256 fraction bits.
//  ulpError(fn, args, result) returns |result − exact| in units in the last place of the exact value (null where the reference does not apply).
// ============================================================================
const W = 256n;                                    // working fraction bits for series
const BIG_FRAC = 1500n;                            // fraction bits for exact reduction of any double
const F64 = new Float64Array(1), U32 = new Uint32Array(F64.buffer);
const HI = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1 ? 1 : 0, LO = 1 - HI;

function atanInv(k, bits) {
  const one = 1n << bits, k2 = k * k; let term = one / k, sum = term, i = 1n, s = -1n;
  while (term !== 0n) { term /= k2; const t = term / (2n * i + 1n); if (t === 0n) break; sum += s * t; s = -s; i++; }
  return sum;
}
let PI_CACHE = null;
/** π · 2^bits (bits ≤ BIG_FRAC + 2), Störmer's formula. */
export function piFixed(bits = BIG_FRAC + 2n) {
  if (!PI_CACHE) {
    const b = BIG_FRAC + 70n;
    PI_CACHE = (4n * (44n * atanInv(57n, b) + 7n * atanInv(239n, b) - 12n * atanInv(682n, b) + 24n * atanInv(12943n, b)));
  }
  return PI_CACHE >> (BIG_FRAC + 70n - bits);
}
export const PI_HEX_PREFIX = "3243f6a8885a308d313198a2e03707344a4093822299f31d0082efa98ec4e6c89";   // π in hex, 65 digits (published constant)
export function piHexPrefixOk() {
  const p = piFixed(256n).toString(16);           // π · 2^256 ⇒ "3" + 64 hex digits
  return p.slice(0, PI_HEX_PREFIX.length) === PI_HEX_PREFIX;
}

/** Exact decomposition of a finite double: x = m · 2^e (m BigInt, may be negative). */
function decompose(x) {
  F64[0] = x; const h = U32[HI], l = U32[LO], ex = (h >>> 20) & 0x7ff;
  let m = (BigInt(h & 0xfffff) << 32n) | BigInt(l);
  if (ex !== 0) m |= 1n << 52n;
  return { m: (h >>> 31) ? -m : m, e: (ex === 0 ? 1 : ex) - 1075 };
}
/** x · 2^frac as exact BigInt (requires e + frac ≥ 0). */
function fixedOf(x, frac) { const { m, e } = decompose(x); if (m === 0n) return 0n; const s = BigInt(e) + frac; if (s < 0n) throw new Error("fixedOf underflow"); return m << s; }
const abs = (a) => (a < 0n ? -a : a);
function isqrt(n) { if (n < 2n) return n; let x = BigInt(Math.floor(Math.sqrt(Number(n)))); if (x === 0n) x = 1n; // Newton from a rough start
  for (;;) { const y = (x + n / x) >> 1n; if (abs(y - x) <= 1n) { let r = y < x ? y : x; while (r * r > n) r--; while ((r + 1n) * (r + 1n) <= n) r++; return r; } x = y; } }

/** sin, cos of a fixed-point r (|r| ≤ ~0.8, W fraction bits). */
function sinCosFixed(r) {
  const one = 1n << W, r2 = (r * r) >> W;
  let t = r, s = r, n = 1n;
  for (;;) { t = -(t * r2 >> W) / ((n + 1n) * (n + 2n)); if (t === 0n) break; s += t; n += 2n; }
  let tc = one, c = one; n = 0n;
  for (;;) { tc = -(tc * r2 >> W) / ((n + 1n) * (n + 2n)); if (tc === 0n) break; c += tc; n += 2n; }
  return { s, c };
}
/** Exact reduction of a finite double: returns { q (BigInt), r (W fraction bits) } with x = q·π/2 + r, |r| ≤ π/4. */
function reduce(x) {
  const X = fixedOf(Math.abs(x), BIG_FRAC), P = piFixed(BIG_FRAC) >> 1n;    // π/2 · 2^BIG_FRAC
  let q = X / P, rem = X - q * P;
  if (2n * rem > P) { q += 1n; rem -= P; }
  let r = rem >> (BIG_FRAC - W);
  if (x < 0) { q = -q; r = -r; }
  return { q, r };
}
export function sinRef(x) { const { q, r } = reduce(x), { s, c } = sinCosFixed(r); const k = Number(((q % 4n) + 4n) % 4n); return [s, c, -s, -c][k]; }
export function cosRef(x) { const { q, r } = reduce(x), { s, c } = sinCosFixed(r); const k = Number(((q % 4n) + 4n) % 4n); return [c, -s, -c, s][k]; }

/** atan of a fixed-point t (W fraction bits, any magnitude). */
function atanFixed(t) {
  const one = 1n << W;
  if (t < 0n) return -atanFixed(-t);
  if (t > one) return (piFixed(W) >> 1n) - atanFixed((one << W) / t);
  // two half-angle steps: t' = t / (1 + sqrt(1 + t²)) ⇒ atan(t) = 2·atan(t')
  let u = t;
  for (let i = 0; i < 2; i++) u = (u << W) / (one + isqrt(one * one + u * u));
  const u2 = (u * u) >> W; let term = u, sum = u, k = 1n, sg = -1n;
  for (;;) { term = (term * u2) >> W; const tt = term / (2n * k + 1n); if (tt === 0n) break; sum += sg * tt; sg = -sg; k++; }
  return sum * 4n;
}
/** atan2(y, x) for finite nonzero-ratio inputs with |log2|y/x|| ≤ 120; null otherwise. */
export function atan2Ref(y, x) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || x === 0 || y === 0) return null;
  const dy = decompose(y), dx = decompose(x), de = dy.e - dx.e;
  if (Math.abs(de) > 120) return null;
  // t = y/x · 2^W  = my·2^ey / (mx·2^ex) · 2^W
  const shift = BigInt(de) + W;
  const t = shift >= 0n ? (dy.m << shift) / dx.m : dy.m / (dx.m << -shift);
  const at = atanFixed(abs(t));                     // atan(|y/x|)
  const pi = piFixed(W);
  if (x > 0) return y > 0 ? at : -at;
  return y > 0 ? pi - at : at - pi;
}
export function acosRef(x) { if (!(Math.abs(x) <= 1) || (x !== 0 && Math.abs(x) < 2 ** -190)) return null;   // below 2^-190: outside the fixed-point range (acos ≈ π/2)
  const X = fixedOf(x, W), one = 1n << W, s = isqrt(one * one - X * X);
  if (X === 0n) return piFixed(W) >> 1n; if (s === 0n) return x > 0 ? 0n : piFixed(W);
  const at = atanFixed(abs((s << W) / X)); return X > 0n ? at : piFixed(W) - at; }
export function asinRef(x) { if (!(Math.abs(x) <= 1) || Math.abs(x) < 2 ** -190) return null;   // below 2^-190: asin(x) = x within 2^-380 relative
  const X = fixedOf(x, W), one = 1n << W, s = isqrt(one * one - X * X);
  if (s === 0n) return x > 0 ? piFixed(W) >> 1n : -(piFixed(W) >> 1n); const at = atanFixed(abs((X << W) / s)); return X >= 0n ? at : -at; }

/** |result − ref| in ulps of ref (ref in W fraction bits). null if ref is null or too small to judge at W bits. */
export function ulpError(result, ref) {
  if (ref === null || !Number.isFinite(result)) return null;
  const a = abs(ref); if (a === 0n) return result === 0 ? 0 : null;
  const e = a.toString(2).length - 1 - Number(W);   // floor(log2 |ref|)
  const ulpShift = e - 52 + Number(W);              // ulp(ref) = 2^(e-52) ⇒ in W-fraction units 2^(e-52+W)
  if (ulpShift < 8) return null;                    // not enough reference bits below one ulp
  const R = fixedOf(result, W), D = abs(R - ref);
  return Number((D << 24n) >> BigInt(ulpShift)) / 2 ** 24;
}
