// ============================================================================
//  environment/placement/mapDecorPlacement.js — 地圖裝飾放置（Milestone C）
//
//  依地形「高度／坡度／距邊界」把石頭放到合理位置（河岸、邊界、野區、崖腳）。
//  · 純邏輯、無 THREE 相依：地形取樣由呼叫端傳入 sampleFn(x,z)→height（runtime 用 raycast，
//    Node 驗證用合成函式），因此可在 Node 單元測試。
//  · 決定性：用 seededRandom，不使用 Math.random()。
//  · 沿用既有放置思路（PLACEMENT_RULES）：不重疊（Poisson）、依地形語意分區。
//  · 輸出 { assetName: transforms[] }，直接餵給既有 InstancedLODGroup（不另建放置系統）。
// ============================================================================
import { makeRng } from "./seededRandom.js";

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * 相機 preset 座標（純函式，可驗證）。mode: "top"（俯視看整張圖）/ "near"（近 3/4）。
 * @returns {{ position:[x,y,z], target:[x,y,z] }}
 */
export function cameraPose(mode, center, size) {
  const [cx, cy, cz] = center;
  const d = size > 0 ? size : 20;
  const position = mode === "top"
    ? [cx + d * 0.02, cy + d * 1.25, cz + d * 0.35]
    : [cx + d * 0.6, cy + d * 0.55, cz + d * 0.6];
  return { position, target: [cx, cy, cz] };
}

/** 對整塊地形取樣建立高度場（一次），之後放置從此快取查詢（快、且能算坡度）。 */
export function buildHeightField(sampleFn, bbox, res = 48) {
  const n = res + 1;
  const grid = new Float32Array(n * n);
  const dx = (bbox.maxX - bbox.minX) / res;
  const dz = (bbox.maxZ - bbox.minZ) / res;
  let min = Infinity, max = -Infinity;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const h = sampleFn(bbox.minX + i * dx, bbox.minZ + j * dz);
      const v = (h == null || !Number.isFinite(h)) ? NaN : h;
      grid[j * n + i] = v;
      if (Number.isFinite(v)) { if (v < min) min = v; if (v > max) max = v; }
    }
  }
  if (!Number.isFinite(min)) { min = 0; max = 1; }
  return { grid, res, n, bbox, dx, dz, min, max };
}

/** 雙線性取樣高度（超界或含空洞回 null）。 */
export function sampleField(hf, x, z) {
  const fi = (x - hf.bbox.minX) / hf.dx, fj = (z - hf.bbox.minZ) / hf.dz;
  const i = Math.floor(fi), j = Math.floor(fj);
  if (i < 0 || j < 0 || i >= hf.res || j >= hf.res) return null;
  const g = (ii, jj) => hf.grid[jj * hf.n + ii];
  const h00 = g(i, j), h10 = g(i + 1, j), h01 = g(i, j + 1), h11 = g(i + 1, j + 1);
  if (![h00, h10, h01, h11].every(Number.isFinite)) return null;
  const u = fi - i, v = fj - j;
  return (h00 * (1 - u) + h10 * u) * (1 - v) + (h01 * (1 - u) + h11 * u) * v;
}

/** 坡度大小（有限差分；1≈45°）。 */
export function slopeField(hf, x, z) {
  const e = Math.max(hf.dx, hf.dz);
  const hx0 = sampleField(hf, x - e, z), hx1 = sampleField(hf, x + e, z);
  const hz0 = sampleField(hf, x, z - e), hz1 = sampleField(hf, x, z + e);
  if ([hx0, hx1, hz0, hz1].some((v) => v == null)) return 0;
  return Math.hypot((hx1 - hx0) / (2 * e), (hz1 - hz0) / (2 * e));
}

const edgeDist = (hf, x, z) =>
  Math.min(x - hf.bbox.minX, hf.bbox.maxX - x, z - hf.bbox.minZ, hf.bbox.maxZ - z);

/**
 * 依 presets 產生裝飾石 transforms（決定性、不重疊、依地形分區）。
 * @returns {{ groups: {assetName:transforms[]}, stats }}
 */
export function generateMapDecor({ hf, seed = 1, presets }) {
  const groups = {};
  const stats = { perZone: {}, perAsset: {}, total: 0 };
  const range = Math.max(1e-3, hf.max - hf.min);

  for (const preset of presets) {
    const rng = makeRng(`${seed}:${preset.id}`);
    const cell = Math.max(preset.minDist, 0.001);
    const occ = new Map();
    const key = (a, b) => a + "," + b;
    const md2 = preset.minDist * preset.minDist;
    let placed = 0, attempts = 0;
    const maxA = preset.count * 40 + 400;

    while (placed < preset.count && attempts < maxA) {
      attempts++;
      const x = hf.bbox.minX + rng() * (hf.bbox.maxX - hf.bbox.minX);
      const z = hf.bbox.minZ + rng() * (hf.bbox.maxZ - hf.bbox.minZ);
      const h = sampleField(hf, x, z);
      if (h == null) continue;
      const t = (h - hf.min) / range;
      const slope = slopeField(hf, x, z);
      const edge = edgeDist(hf, x, z);
      if (!preset.zone({ t, slope, edge, h })) continue;

      const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
      let ok = true;
      for (let ox = -1; ox <= 1 && ok; ox++)
        for (let oz = -1; oz <= 1 && ok; oz++) {
          const arr = occ.get(key(cx + ox, cz + oz));
          if (arr) for (const [px, pz] of arr) {
            if ((px - x) ** 2 + (pz - z) ** 2 < md2) { ok = false; break; }
          }
        }
      if (!ok) continue;
      const bucket = occ.get(key(cx, cz)) || (() => { const a = []; occ.set(key(cx, cz), a); return a; })();
      bucket.push([x, z]);

      const asset = preset.assets[Math.floor(rng() * preset.assets.length)];
      const s = preset.scale[0] + (preset.scale[1] - preset.scale[0]) * rng();
      const rotY = rng() * Math.PI * 2;
      let color;
      if (preset.color) {
        const v = preset.color.vary || 0;
        color = [
          clamp01(preset.color.base[0] + (rng() - 0.5) * 2 * v),
          clamp01(preset.color.base[1] + (rng() - 0.5) * 2 * v),
          clamp01(preset.color.base[2] + (rng() - 0.5) * 2 * v),
        ];
      }
      (groups[asset] || (groups[asset] = [])).push({ pos: [x, h, z], rotY, scale: s, color });
      stats.perAsset[asset] = (stats.perAsset[asset] || 0) + 1;
      placed++;
    }
    stats.perZone[preset.id] = placed;
    stats.total += placed;
  }
  return { groups, stats };
}
