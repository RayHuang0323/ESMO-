// ============================================================================
//  environment/placement/lodRings.js — LOD 距離環（Milestone A 工作 2）
//
//  純函式、無相依。依「與鏡頭距離」把實例分成 LOD0 / LOD1 / culled。
//  距離值可依 ESMO 鏡頭比例調整（見 ENVIRONMENT_RUNTIME_REPORT）；三檔 preset：
//  desktop / mobile / mobile-low。地被類（cullOnly）只有 LOD0＋消失（無 LOD1）。
// ============================================================================

export const LOD_PRESETS = {
  desktop: { id: "desktop", zh: "桌面", lod0: 35, lod1: 70, cull: 70 },
  mobile: { id: "mobile", zh: "手機", lod0: 22, lod1: 45, cull: 45 },
  "mobile-low": { id: "mobile-low", zh: "手機低階", lod0: 15, lod1: 30, cull: 30 },
};
export const LOD_ORDER = ["desktop", "mobile", "mobile-low"];

export const presetForLod = (id) => LOD_PRESETS[id] ?? LOD_PRESETS.desktop;

/**
 * 依距離分類。
 * @param {number} dist  與鏡頭距離（世界單位/公尺）
 * @param {object} ring  LOD_PRESETS 之一
 * @param {object} [opts] { cullOnly:bool（地被，只 LOD0）, cullScale:number（消失距離縮放，預設 1） }
 * @returns {"lod0"|"lod1"|"culled"}
 */
export function classifyDistance(dist, ring, opts = {}) {
  const cullScale = opts.cullScale ?? 1;
  const cull = ring.cull * cullScale;
  if (opts.cullOnly) return dist <= cull ? "lod0" : "culled";
  const lod0 = Math.min(ring.lod0, cull);
  if (dist <= lod0) return "lod0";
  if (dist <= cull) return "lod1";
  return "culled";
}
