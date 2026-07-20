// ============================================================================
//  environment/placement/PlacementGenerator.js — 決定性擺放器（工作 3）
//
//  純函式、無 THREE 相依（可在 Node 單元測試）。
//  seed + count + minDist → transforms（位置/旋轉/縮放/顏色）。
//  · 不重疊：spatial-hash 加速的最小距離拒絕取樣（Poisson-disk 風格）。
//  · 完全可重現：同 seed ⇒ 同結果（無 Math.random()）。
//  本階段用矩形測試區；未來接 PLACEMENT_RULES.md 的坡度/高度/距河（傳入 accept 回呼即可）。
// ============================================================================
import { makeRng, rangeOf } from "./seededRandom.js";

/**
 * @param {object} cfg
 *   seed        {string|number}
 *   count       {number}                目標數量
 *   area        {x0,z0,x1,z1}           擺放矩形（世界單位）
 *   y           {number}                擺放高度（本階段平面測試，預設 0）
 *   minDist     {number}                同類最小間距（不重疊）
 *   scale       {[min,max]}             等比縮放範圍
 *   rotate      {boolean}               隨機 Z(Yaw) 旋轉
 *   color       {base:[r,g,b], vary}    可選：顏色與抖動幅度
 *   accept      {(x,z)=>bool}           可選：地形規則過濾（本階段可省）
 * @returns {{transforms:Array, stats:object}}
 */
export function generate(cfg) {
  const {
    seed = 1, count = 100, area = { x0: 0, z0: -20, x1: 20, z1: 0 },
    y = 0, minDist = 1, scale = [1, 1], rotate = true, color = null, accept = null,
  } = cfg;
  const rng = makeRng(seed);
  const w = area.x1 - area.x0, d = area.z1 - area.z0;
  const cell = Math.max(minDist, 0.001);
  const cols = Math.max(1, Math.ceil(w / cell));
  const grid = new Map();                          // "cx,cz" -> [ [x,z], ... ]
  const key = (cx, cz) => cx + "," + cz;
  const transforms = [];
  const minD2 = minDist * minDist;
  const maxAttempts = count * 30 + 200;
  let attempts = 0, rejectedDist = 0, rejectedRule = 0;

  while (transforms.length < count && attempts < maxAttempts) {
    attempts++;
    const x = area.x0 + rng() * w;
    const z = area.z0 + rng() * d;
    if (accept && !accept(x, z)) { rejectedRule++; continue; }
    const cx = Math.floor((x - area.x0) / cell), cz = Math.floor((z - area.z0) / cell);
    let ok = true;
    for (let ox = -1; ox <= 1 && ok; ox++) {
      for (let oz = -1; oz <= 1 && ok; oz++) {
        const arr = grid.get(key(cx + ox, cz + oz));
        if (!arr) continue;
        for (const [px, pz] of arr) {
          const dx = px - x, dz = pz - z;
          if (dx * dx + dz * dz < minD2) { ok = false; break; }
        }
      }
    }
    if (!ok) { rejectedDist++; continue; }
    const g = grid.get(key(cx, cz)) || [];
    g.push([x, z]); grid.set(key(cx, cz), g);

    const s = rangeOf(rng, scale[0], scale[1]);
    const rotY = rotate ? rng() * Math.PI * 2 : 0;
    const t = { pos: [x, y, z], rotY, scale: s };
    if (color) {
      const v = color.vary ?? 0;
      t.color = [
        clamp01(color.base[0] + (rng() - 0.5) * 2 * v),
        clamp01(color.base[1] + (rng() - 0.5) * 2 * v),
        clamp01(color.base[2] + (rng() - 0.5) * 2 * v),
      ];
    }
    transforms.push(t);
  }
  return {
    transforms,
    stats: {
      requested: count, placed: transforms.length,
      attempts, rejectedDist, rejectedRule, minDist,
      area, seed,
    },
  };
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
