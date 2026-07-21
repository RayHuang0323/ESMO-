// ============================================================================
//  environment/placement/mapDecorPresets.js — 地圖裝飾分區規則（Milestone C）
//
//  用 Rock Pack 的 8 件石頭，依地形分區裝飾地圖（河岸/邊界/崖腳/野區）。
//  zone(): 用「正規化高度 t（0=最低/水，1=最高/台地）、坡度 slope、距邊界 edge」判定。
//  手機優先：以中大型石頭為主、密度受控，避免太碎太高頻。
//  未來 Tree/Bush/Ground Pack 可沿用同一套分區思路（換 assets 與 zone 條件即可）。
// ============================================================================

// 石身亮度微調（乘在頂點色上，近白，不蓋苔色）
const STONE_TINT = { base: [0.96, 0.95, 0.92], vary: 0.05 };

export const DECOR_PRESETS = [
  {
    id: "boundary",           // 地圖邊界：大石＋崖石鑲邊，讓邊界不空
    assets: ["Rock_Large_A", "Rock_Large_B", "Rock_Cliff_A"],
    count: 64, minDist: 2.6, scale: [0.9, 1.25], color: STONE_TINT,
    zone: ({ t, edge }) => edge < 3.2 && t > 0.14,   // 近邊界、不在水裡
  },
  {
    id: "riverbank",          // 河岸：河岸石＋中小石沿水線
    assets: ["Rock_Riverbank_A", "Rock_Medium_B", "Rock_Small_A"],
    count: 54, minDist: 1.5, scale: [0.8, 1.3], color: STONE_TINT,
    zone: ({ t, slope }) => t > 0.1 && t < 0.34 && slope < 0.55,  // 水線略上、不太陡
  },
  {
    id: "cliffbase",          // 崖腳/陡坡：崖石與大石，銜接高低差
    assets: ["Rock_Cliff_A", "Rock_Large_A", "Rock_Medium_A"],
    count: 30, minDist: 2.0, scale: [0.85, 1.25], color: STONE_TINT,
    zone: ({ slope }) => slope > 0.55,               // 陡面
  },
  {
    id: "jungle",             // 野區：中石為主成簇，破除平面測試場感
    assets: ["Rock_Medium_A", "Rock_Medium_B", "Rock_Small_A", "Rock_Small_B"],
    count: 84, minDist: 1.9, scale: [0.8, 1.25], color: STONE_TINT,
    zone: ({ t, slope, edge }) => t > 0.36 && slope < 0.35 && edge > 3.6,  // 內陸平緩高地/場地
  },
];
