// ============================================================================
//  battle/moba/map/coordinateMapping.js — Sim → Visual 座標映射（Milestone D）
//
//  ⚠ 唯一真相來源是 src/gameData.js（模擬與所有渲染共用）。本檔**只轉發**其既有映射，
//    不另建 scale/offset/軸系，也不修改任何模擬常數。
//  · 邏輯座標：x,y ∈ [0,220]，中心 (110,110)，x 右、y 下（gameData.js 註解）。
//  · 3D 世界：worldX(x)=(x-110)*1.7、worldZ(y)=(y-110)*1.7；three.js 的 y 軸為高度。
// ============================================================================
import { worldX, worldZ, WORLD_SCALE, WORLD_BOUNDS } from "../../../gameData.js";

export { worldX, worldZ, WORLD_SCALE, WORLD_BOUNDS };

/** 邏輯 (x,y[,h]) → three.js 世界座標陣列 [wx, h, wz]。 */
export const toWorld = (x, y, h = 0) => [worldX(x), h, worldZ(y)];

/** 邏輯長度 → 世界長度（等比）。 */
export const scaleLen = (u) => u * WORLD_SCALE;
