// ============================================================================
//  tools/lib/det_hypot_vectors_c2.mjs — registered DetHypot contract vectors (C2_事前登記.md §2, 2026-11-23). Dependency-free: the same module is
//  loaded into Node and into Chrome / Firefox / WebKit (tools/c1/c1_engines.mjs importModule) so every engine sees bit-identical inputs.
//  Powers of two are built from IEEE-754 bit patterns (never `2 ** e`, which ECMAScript leaves implementation-approximated).
// ============================================================================
const F = new Float64Array(1), U = new Uint32Array(F.buffer);
const HI = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1 ? 1 : 0, LO = 1 - HI;
/** Exact 2^e for −1074 ≤ e ≤ 1023. */
export function pow2(e) {
  if (e >= -1022) { U[HI] = (e + 1023) << 20; U[LO] = 0; return F[0]; }
  return pow2(-1022) * pow2(e + 1022);                       // exact: the product is the subnormal 2^e
}
export const MAX = 1.7976931348623157e308;
const xorshift = (seed) => { let s = seed >>> 0; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; };

/** Registered categories: name, seed, count, pair generator (rnd → [x, y]). */
export const CATEGORIES = Object.freeze([
  { name: "H1a", seed: 7201, n: 200000, gen: (r) => [(r() * 2 - 1) * 1024, (r() * 2 - 1) * 1024] },
  { name: "H1b", seed: 7202, n: 200000, gen: (r) => { const x = (r() * 2 - 1) * 1024; return [x, x * (1 + (r() * 2 - 1) * 1e-6)]; } },
  { name: "H1c", seed: 7203, n: 200000, gen: (r) => [Math.floor(r() * 2049) - 1024, Math.floor(r() * 2049) - 1024] },
  { name: "H2", seed: 7204, n: 200000, gen: (r) => [(r() < 0.5 ? -1 : 1) * (1 + r()) * pow2(Math.floor(r() * 2001) - 1000), (r() < 0.5 ? -1 : 1) * (1 + r()) * pow2(Math.floor(r() * 2001) - 1000)] },
  { name: "H3", seed: 7205, n: 100000, gen: (r) => [(r() < 0.5 ? -1 : 1) * (1 + r()) * pow2(-1074 + Math.floor(r() * 74)), (r() < 0.5 ? -1 : 1) * (1 + r()) * pow2(-1074 + Math.floor(r() * 74))] },
  { name: "H4", seed: 7206, n: 100000, gen: (r) => [(r() < 0.5 ? -1 : 1) * (1 + r()) * pow2(1000 + Math.floor(r() * 24)), (r() < 0.5 ? -1 : 1) * (1 + r()) * pow2(1000 + Math.floor(r() * 24))] },
]);
export function vectorsOf(cat) {
  const r = xorshift(cat.seed), out = new Array(cat.n);
  for (let i = 0; i < cat.n; i++) out[i] = cat.gen(r);
  return out;
}

/** H5: 36 registered special inputs with their exact expected result (compared with Object.is; NaN matches NaN). */
export function specials() {
  const I = Infinity, N = NaN, d = pow2(-1074);
  return [
    [I, N, I], [N, I, I], [-I, N, I], [N, -I, I], [I, 0, I], [-I, -I, I], [I, MAX, I],
    [N, 1, N], [1, N, N], [N, 0, N], [N, N, N],
    [0, 0, 0], [-0, -0, 0], [0, -0, 0], [-0, -7, 7], [7, -0, 7],
    [3, 4, 5], [-5, 12, 13], [8, -15, 17], [20, 21, 29], [119, 120, 169],
    [MAX, MAX, I], [MAX, 1, MAX], [MAX, 0, MAX], [MAX, d, MAX],
    [d, d, d], [d, 0, d], [-0, d, d], [3 * d, 4 * d, 5 * d], [5 * pow2(-1050), 12 * pow2(-1050), 13 * pow2(-1050)],
    [3 * pow2(1000), 4 * pow2(1000), 5 * pow2(1000)], [3 * pow2(-1000), 4 * pow2(-1000), 5 * pow2(-1000)],
    [3 * pow2(600), 4 * pow2(600), 5 * pow2(600)], [3 * pow2(-600), 4 * pow2(-600), 5 * pow2(-600)],
    [1, pow2(-60), 1], [1, pow2(-27), 1],
  ];
}
export const same = (a, b) => (a !== a && b !== b) || Object.is(a, b);

/** H8: one hash over every registered output (H1–H4 incl. the H6 symmetric variants for H1/H2, and H5). Two 32-bit lanes over the bit patterns. */
export function outputsHash(hypot) {
  let h1 = 0x811c9dc5 | 0, h2 = 0x01000193 | 0, n = 0;
  const feed = (v) => { F[0] = v; h1 = Math.imul(h1 ^ U[LO], 16777619); h1 = Math.imul(h1 ^ U[HI], 16777619); h2 = Math.imul(h2 ^ U[HI], 2246822519); h2 = Math.imul(h2 ^ U[LO], 3266489917); n++; };
  const nonFinite = { inf: 0, zero: 0, nan: 0 };
  for (const cat of CATEGORIES) {
    const sym = cat.name.startsWith("H1") || cat.name === "H2";
    for (const [x, y] of vectorsOf(cat)) {
      const r = hypot(x, y); feed(r);
      if (r === Infinity) nonFinite.inf++; else if (r === 0) nonFinite.zero++; else if (r !== r) nonFinite.nan++;
      if (sym) { feed(hypot(y, x)); feed(hypot(-x, y)); feed(hypot(x, -y)); }
    }
  }
  for (const [x, y] of specials()) feed(hypot(x, y));
  return { hash: (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0"), outputs: n, nonFinite };
}
