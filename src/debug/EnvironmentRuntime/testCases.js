// ============================================================================
//  debug/EnvironmentRuntime/testCases.js — 壓測情境定義（Milestone A 工作 5）
//
//  每個情境 = 一組 { asset -> count }。擺放區為 60×60m 測試場（比單塊地圖大，
//  好觀察 LOD/cull 環）。密度由 count 決定，實際落點由 PlacementGenerator（seed）產生。
// ============================================================================

export const TEST_AREA = { x0: -30, z0: -30, x1: 30, z1: 30 };

// 各假資產的最小間距（不重疊）與縮放/顏色
export const ASSET_PLACEMENT = {
  rock: { minDist: 1.1, scale: [0.7, 1.4], color: { base: [0.44, 0.43, 0.41], vary: 0.06 } },
  tree: { minDist: 1.8, scale: [0.8, 1.3], color: { base: [0.13, 0.30, 0.14], vary: 0.05 } },
  grass: { minDist: 0.5, scale: [0.7, 1.3], color: { base: [0.30, 0.48, 0.22], vary: 0.08 } },
  bush: { minDist: 1.5, scale: [0.9, 1.3], color: { base: [0.14, 0.34, 0.16], vary: 0.05 } },
};

export const TEST_CASES = {
  terrainOnly: { id: "terrainOnly", zh: "只有地形", counts: {} },
  rocks: { id: "rocks", zh: "地形＋假石", counts: { rock: 300 } },
  trees: { id: "trees", zh: "地形＋假樹", counts: { tree: 300 } },
  ground: { id: "ground", zh: "地形＋假地被", counts: { grass: 1500 } },
  A: { id: "A", zh: "壓測 A：1000 石", counts: { rock: 1000 } },
  B: { id: "B", zh: "壓測 B：1000 樹", counts: { tree: 1000 } },
  C: { id: "C", zh: "壓測 C：3000 地被", counts: { grass: 3000 } },
  D: { id: "D", zh: "壓測 D：混合", counts: { rock: 200, tree: 300, grass: 2000, bush: 100 } },
  E: { id: "E", zh: "壓測 E：手機密度(D 的 50%)", counts: { rock: 100, tree: 150, grass: 1000, bush: 50 } },
};
export const TEST_ORDER = ["terrainOnly", "rocks", "trees", "ground", "A", "B", "C", "D", "E"];
