// ============================================================================
//  tools/lib/det_hypot_ref_c2.mjs — exact BigInt reference for hypot error measurement (C2, 2026-11-23).
//  hypotUlpError(x, y, r): |r − √(x² + y²)| in ulps of the exact value, computed with integer arithmetic only:
//  x, y are scaled to a common exact integer grid, S = X² + Y² is exact, √S is taken with ≥ 64 extra bits (integer sqrt), and the result r is
//  compared on the same grid. Returns null for non-finite inputs (special values are checked by contract tables instead).
// ============================================================================
const F64 = new Float64Array(1), U32 = new Uint32Array(F64.buffer);
const HI = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1 ? 1 : 0, LO = 1 - HI;
function decompose(x) {
  F64[0] = x; const h = U32[HI], l = U32[LO], ex = (h >>> 20) & 0x7ff;
  let m = (BigInt(h & 0xfffff) << 32n) | BigInt(l);
  if (ex !== 0) m |= 1n << 52n;
  return { m: (h >>> 31) ? -m : m, e: (ex === 0 ? 1 : ex) - 1075 };
}
function isqrt(n) {
  if (n < 2n) return n;
  let x = 1n << BigInt((n.toString(2).length + 1) >> 1);
  for (;;) { const y = (x + n / x) >> 1n; if (y >= x) { while (x * x > n) x--; while ((x + 1n) * (x + 1n) <= n) x++; return x; } x = y; }
}
const abs = (a) => (a < 0n ? -a : a);

/** H4 overflow class of the exact √(x² + y²): "below" (< MAX), "above" (> MAX·(1 + 2^-53)), else "band". Exact integer comparison of squares. */
export function overflowClass(x, y) {
  const dx = decompose(x), dy = decompose(y);
  const E = Math.min(dx.m ? dx.e : Infinity, dy.m ? dy.e : Infinity);
  if (!Number.isFinite(E)) return "below";
  const X = abs(dx.m) << BigInt(dx.m ? dx.e - E : 0), Y = abs(dy.m) << BigInt(dy.m ? dy.e - E : 0);
  const S = X * X + Y * Y;                                     // exact² = S · 2^(2E)
  const cmp = (m, e) => { const sh = 2 * E - 2 * e; const l = sh >= 0 ? S << BigInt(sh) : S, r = sh >= 0 ? m * m : (m * m) << BigInt(-sh); return l < r ? -1 : l > r ? 1 : 0; };
  if (cmp((1n << 53n) - 1n, 971) < 0) return "below";          // MAX = (2^53 − 1)·2^971
  if (cmp((1n << 106n) - 1n, 918) > 0) return "above";         // MAX·(1 + 2^-53) = (2^106 − 1)·2^918
  return "band";
}

export function hypotUlpError(x, y, r) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(r)) return null;
  const dx = decompose(x), dy = decompose(y), dr = decompose(r);
  if (dx.m === 0n && dy.m === 0n) return r === 0 ? 0 : null;
  //  common exponent E (the smallest), X = mx·2^(ex−E) etc. are exact integers; true = √(X² + Y²)·2^E.
  const E = Math.min(dx.m ? dx.e : Infinity, dy.m ? dy.e : Infinity);
  const X = abs(dx.m) << BigInt(dx.m ? dx.e - E : 0), Y = abs(dy.m) << BigInt(dy.m ? dy.e - E : 0);
  const S = X * X + Y * Y;
  const G = 80n;                                       // extra fraction bits for the root
  const root = isqrt(S << (2n * G));                   // √S · 2^G  (floor)
  //  r on the same grid: r = mr·2^er ⇒ r·2^(G−E) = mr·2^(er − E + G)
  const sh = BigInt(dr.e - E) + G;
  const R = sh >= 0n ? abs(dr.m) << sh : abs(dr.m) >> -sh;
  //  ulp(true) = 2^(floor(log2 true) − 52), but never below the subnormal spacing 2^-1074 ⇒ on the grid (unit 2^(E−G)):
  //  max(bitlen(root) − 1 − 52, −1074 − E + G)
  const ulpShift = BigInt(Math.max(root.toString(2).length - 1 - 52, -1074 - E + Number(G)));
  if (ulpShift < 8n) return null;
  return Number((abs(R - root) << 24n) >> ulpShift) / 2 ** 24;
}
