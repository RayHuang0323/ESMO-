// ============================================================================
//  debug/EnvironmentRuntime/rockTestCases.js — Rock Pack 壓測情境（Milestone B）
//
//  沿用既有 Environment Runtime（PlacementGenerator / InstancedLODGroup / lodRings /
//  Debug Panel），只是把假資產換成正式 Rock Pack。不另建第二套 runtime。
// ============================================================================
import { ROCK_NAMES } from "../../environment/assets/rocks/index.js";

// 每件石頭的擺放參數（minDist 依足印；instance color=亮度微調，乘在頂點色上）
export const ROCK_PLACEMENT = {
  Rock_Small_A: { minDist: 0.7, scale: [0.75, 1.35], color: { base: [0.96, 0.95, 0.92], vary: 0.06 } },
  Rock_Small_B: { minDist: 0.7, scale: [0.75, 1.35], color: { base: [0.96, 0.95, 0.92], vary: 0.06 } },
  Rock_Medium_A: { minDist: 1.3, scale: [0.8, 1.3], color: { base: [0.95, 0.94, 0.9], vary: 0.06 } },
  Rock_Medium_B: { minDist: 1.3, scale: [0.8, 1.3], color: { base: [0.95, 0.94, 0.9], vary: 0.06 } },
  Rock_Large_A: { minDist: 2.0, scale: [0.85, 1.25], color: { base: [0.95, 0.93, 0.9], vary: 0.05 } },
  Rock_Large_B: { minDist: 2.0, scale: [0.85, 1.25], color: { base: [0.95, 0.93, 0.9], vary: 0.05 } },
  Rock_Cliff_A: { minDist: 2.0, scale: [0.9, 1.2], color: { base: [0.95, 0.94, 0.92], vary: 0.05 } },
  Rock_Riverbank_A: { minDist: 1.6, scale: [0.85, 1.25], color: { base: [0.94, 0.94, 0.93], vary: 0.05 } },
};

export const ROCK_TEST_CASES = {
  rockSingle: { id: "rockSingle", zh: "石·單一 1000", counts: { Rock_Medium_A: 1000 } },
  rockMix8: {
    id: "rockMix8", zh: "石·8 種混合",
    counts: {
      Rock_Small_A: 500, Rock_Small_B: 400, Rock_Medium_A: 300, Rock_Medium_B: 250,
      Rock_Large_A: 150, Rock_Large_B: 150, Rock_Cliff_A: 130, Rock_Riverbank_A: 120,
    },
  },
  rockStress2600: {
    id: "rockStress2600", zh: "石·2600 混合壓測",
    counts: {
      Rock_Small_A: 700, Rock_Small_B: 600, Rock_Medium_A: 400, Rock_Medium_B: 300,
      Rock_Large_A: 200, Rock_Large_B: 180, Rock_Cliff_A: 120, Rock_Riverbank_A: 100,
    },
  },
  rockShowcase: { id: "rockShowcase", zh: "石·8 件展示", showcase: true },
};
export const ROCK_TEST_ORDER = ["rockSingle", "rockMix8", "rockStress2600", "rockShowcase"];

// 展示模式：8 件各一顆，沿 X 排開（供單獨檢視 / LOD 對照），固定佈局（非亂數）
export function showcaseTransforms() {
  return ROCK_NAMES.map((name, i) => ({
    name,
    transforms: [{ pos: [(i - 3.5) * 4, 0, 0], rotY: 0, scale: 1 }],
  }));
}
