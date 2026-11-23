// ============================================================================
//  tools/lib/det_math_vectors_c1.mjs — deterministic test inputs for DetMath.v1 (C1, 2026-11-23).
//  Self-contained (no imports): the same file is loaded in Node and, as a data: URL module, in headless Chrome, so both sides generate the
//  identical input list from integer-only PRNG state (xorshift128 on uint32, doubles assembled from bit patterns ⇒ no float rounding in generation).
// ============================================================================
const F64 = new Float64Array(1), U32 = new Uint32Array(F64.buffer);
const HI = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1 ? 1 : 0, LO = 1 - HI;
const fromBits = (h, l) => { U32[HI] = h >>> 0; U32[LO] = l >>> 0; return F64[0]; };
const bitsOf = (x) => { F64[0] = x; return [U32[HI], U32[LO]]; };
function rng(seed) { let a = seed >>> 0 || 1, b = 0x9e3779b9, c = 0x243f6a88, d = 0xb7e15162;
  return () => { const t = a ^ (a << 11); a = b; b = c; c = d; d = (d ^ (d >>> 19) ^ (t ^ (t >>> 8))) >>> 0; return d; }; }
/** uniform double in [lo, hi) built from 52 random mantissa bits (exact arithmetic: lo/hi are small binary fractions in our use). */
const unif = (r, lo, hi) => lo + (hi - lo) * (fromBits(0x3ff00000 | (r() & 0xfffff), r()) - 1);
const anyFinite = (r) => { for (;;) { const h = r(), l = r(); if (((h >>> 20) & 0x7ff) !== 0x7ff) return fromBits(h, l); } };
const neighbors = (x) => { const [h, l] = bitsOf(x); const up = l === 0xffffffff ? fromBits(h + 1, 0) : fromBits(h, l + 1); const dn = l === 0 ? fromBits(h - 1, 0xffffffff) : fromBits(h, l - 1); return [dn, x, up]; };
const SPECIAL = [0, -0, Infinity, -Infinity, NaN, 5e-324, -5e-324, 2.2250738585072014e-308, -2.2250738585072014e-308, 1.7976931348623157e308, -1.7976931348623157e308, 1, -1, 0.5, -0.5, 2, -2];
/** Thresholds where fdlibm switches branches (from the high-word constants), each with ±1 ulp neighbours. */
const BRANCH_HI = [0x3e400000, 0x3e46a09e, 0x3e500000, 0x3fdc0000, 0x3fe00000, 0x3fe60000, 0x3fe921fb, 0x3fef3333, 0x3ff00000, 0x3ff30000, 0x4002d97c,
  0x40038000, 0x400f6a7a, 0x4012d97c, 0x4015fdbc, 0x401921fb, 0x401c463b, 0x413921fb, 0x44100000, 0x3c600000];

export const VECTOR_PLAN = Object.freeze({ sin: 420000, cos: 420000, atan2: 320000, acos: 150000, asin: 150000, powInt: 40000 });

/** Inputs for one function: array of argument arrays. Deterministic for a given (fn, count). */
export function vectorsFor(fn, count = VECTOR_PLAN[fn]) {
  const r = rng({ sin: 11, cos: 22, atan2: 33, acos: 44, asin: 55, powInt: 66 }[fn]), out = [];
  const push1 = (x) => out.push([x]);
  const branchVals = []; for (const h of BRANCH_HI) for (const s of [0, 0x80000000]) for (const l of [0, 1, 0xfffff, 0x54442d18]) branchVals.push(...neighbors(fromBits(h | s, l)));
  if (fn === "sin" || fn === "cos") {
    SPECIAL.forEach(push1); branchVals.forEach(push1);
    const PIO2 = 1.5707963267948966;
    for (let k = -64; k <= 64; k++) neighbors(k * PIO2).forEach(push1);
    for (let k = 1; k <= 2000; k++) neighbors(k * 1048576 * PIO2 * (k % 2 ? 1 : -1)).forEach(push1);     // near the medium/large boundary
    while (out.length < count) {
      const c = r() % 10;
      if (c < 4) push1(unif(r, -64, 5120));                         // game range (camp wander phase, angles)
      else if (c < 5) push1(unif(r, -8, 8));
      else if (c < 6) { const k = (r() % 2000000) - 1000000; push1(k * PIO2 + unif(r, -1e-6, 1e-6)); }   // near multiples of π/2
      else if (c < 7) push1(fromBits(((r() % 0x340) + 0x3c00) << 20 | (r() & 0xfffff), r()) * ((r() & 1) ? 1 : -1));   // 2^-64 .. 2^-12
      else push1(anyFinite(r));                                     // any finite double (huge exponents ⇒ BigInt path)
    }
  } else if (fn === "atan2") {
    const S = [0, -0, Infinity, -Infinity, NaN, 1, -1, 5e-324, -5e-324, 1.7976931348623157e308, -1.7976931348623157e308];
    for (const y of S) for (const x of S) out.push([y, x]);
    for (const y of branchVals) out.push([y, 1], [y, -1], [1, y], [-1, y]);
    while (out.length < count) {
      const c = r() % 10;
      if (c < 5) out.push([unif(r, -220, 220), unif(r, -220, 220)]);     // map deltas
      else if (c < 6) out.push([unif(r, -1, 1), unif(r, -1e-3, 1e-3)]);  // steep
      else if (c < 7) { const v = unif(r, -220, 220); out.push([(r() & 1) ? 0 : -0, v], [v, (r() & 1) ? 0 : -0]); }
      else out.push([anyFinite(r), anyFinite(r)]);
    }
  } else if (fn === "acos" || fn === "asin") {
    SPECIAL.forEach(push1); branchVals.forEach(push1);
    for (const v of [1, -1, 0.5, -0.5, 0.975, -0.975]) for (let k = 1; k < 200; k++) { const [h, l] = bitsOf(v); push1(fromBits(h, l - k)); push1(fromBits(h, l + k)); }
    while (out.length < count) {
      const c = r() % 10;
      if (c < 6) push1(unif(r, -1, 1));
      else if (c < 8) push1(((r() & 1) ? 1 : -1) * (1 - unif(r, 0, 1e-6)));     // near ±1
      else if (c < 9) push1(unif(r, -3, 3));                          // includes |x| > 1 ⇒ NaN
      else push1(anyFinite(r));
    }
  } else if (fn === "powInt") {
    for (let n = 0; n <= 12; n++) for (const x of [0, -0, 1, -1, 0.5, 0.7, 0.85, 1.1, 2, NaN, Infinity, -Infinity]) out.push([x, n]);
    while (out.length < count) out.push([unif(r, 0, 2), r() % 16]);
  } else throw new Error(`unknown fn ${fn}`);
  return out.slice(0, count);
}

/** Text for one result: exact bits as hex, every NaN as "NaN" (the contract compares NaN by kind, not payload). */
export function resultKey(v) { if (v !== v) return "NaN"; const [h, l] = bitsOf(v); return h.toString(16).padStart(8, "0") + l.toString(16).padStart(8, "0"); }
/** FNV-1a over result keys, per chunk of `chunk` results ⇒ array of hex hashes (cheap to compare across runtimes). */
export function chunkHashes(results, chunk = 10000) {
  const out = [];
  for (let i = 0; i < results.length; i += chunk) {
    let h = 0x811c9dc5;
    for (let k = i; k < Math.min(i + chunk, results.length); k++) { const s = resultKey(results[k]); for (let j = 0; j < s.length; j++) h = Math.imul(h ^ s.charCodeAt(j), 0x01000193); }
    out.push((h >>> 0).toString(16).padStart(8, "0"));
  }
  return out;
}
