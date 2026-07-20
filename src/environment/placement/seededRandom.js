// ============================================================================
//  environment/placement/seededRandom.js — 決定性亂數（Milestone A 工作 3）
//
//  純函式、無相依。同 seed ⇒ 同序列 ⇒ 擺放可重現。
//  ⚠ 禁止在擺放管線用 Math.random()（不可重現）；一律走這裡。
// ============================================================================

/** 字串 → 32-bit 種子（xmur3）。 */
export function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

/** 32-bit 種子 → [0,1) PRNG（mulberry32）。 */
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 由 seed（字串或數字）建立 PRNG。 */
export function makeRng(seed) {
  const s = typeof seed === "string" ? xmur3(seed)() : seed >>> 0;
  return mulberry32(s);
}

/** 從主 seed 衍生子 seed（不同 kit / 用途用不同 salt，仍完全可重現）。 */
export function hashSeed(seed, salt) {
  const base = typeof seed === "string" ? xmur3(seed)() : seed >>> 0;
  const s = (base ^ xmur3(String(salt))()) >>> 0;
  return s;
}

/** 便利：[min,max) 均勻取樣。 */
export const rangeOf = (rng, min, max) => min + (max - min) * rng();
