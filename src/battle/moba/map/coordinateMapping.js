// ============================================================================
//  battle/moba/map/coordinateMapping.js — Runtime Map Coordinate Contract
//                                          （Milestone D 建立、H.1 擴充成單一契約）
//
//  ⚠ 唯一真相來源是 src/gameData.js（模擬與所有渲染共用）。本檔**只轉發**其既有映射，
//    不另建 scale/offset/軸系，也不修改任何模擬常數。
//  · 邏輯座標：x,y ∈ [0,220]，中心 (110,110)，x 右、y 下（gameData.js 註解）。
//  · 3D 世界：worldX(x)=(x-110)*1.7、worldZ(y)=(y-110)*1.7；three.js 的 y 軸為高度。
//
//  ── H.1 為什麼把它升級成「契約」──────────────────────────────────────────
//  接線前，座標換算散落在四個地方：
//    ① gameData.js          worldX/worldZ、mapNormX/mapNormY（真相）
//    ② MobaView3D.jsx       `const wx = worldX, wz = worldZ`（同一份，改個名）
//    ③ MobaMapBlockout.jsx  透過本檔的 toWorld()
//    ④ 小地圖 / HUD          各自呼叫 mapNormX
//  數學其實是同一套，風險在於**換算散落在 JSX 裡**：只要有人在元件內手寫一次
//  (x−110)*1.7，兩套畫面就會分岔。H.1 起，新地圖 Runtime、Runtime Adapter、
//  英雄定位一律走本檔；元件內不得再出現任何座標 magic number。
//
//  【藍紅關係】兩方是**繞地圖中心 180° 旋轉**（不是鏡面翻轉）⇒ mirrorSim()。
// ============================================================================
import {
  worldX, worldZ, WORLD_SCALE, WORLD_BOUNDS,
  LANES, posOnLane, BASE, FOUNTAIN, PITS, CAMPS, RIVER, TOWER_T,
} from "../../../gameData.js";

export { worldX, worldZ, WORLD_SCALE, WORLD_BOUNDS };

/** 邏輯 (x,y[,h]) → three.js 世界座標陣列 [wx, h, wz]。 */
export const toWorld = (x, y, h = 0) => [worldX(x), h, worldZ(y)];

/** 邏輯長度 → 世界長度（等比）。 */
export const scaleLen = (u) => u * WORLD_SCALE;

// ── 契約 API（H.1）─────────────────────────────────────────────────────────

/** sim {x,y} → world {x,y,z}。h 是呈現層決定的高度（模擬沒有高度概念）。 */
export const simToWorld = (p, h = 0) => ({ x: worldX(p.x), y: h, z: worldZ(p.y) });

/** world {x,z} → sim {x,y}（相機邊界、點選命中要用）。 */
export const worldToSim = (w) => ({
  x: w.x / WORLD_SCALE + WORLD_BOUNDS.centerX,
  y: w.z / WORLD_SCALE + WORLD_BOUNDS.centerY,
});

/** 世界長度 → 模擬長度。 */
export const worldLenToSim = (u) => u / WORLD_SCALE;

/** 藍紅鏡射：繞地圖中心 180° 旋轉。 */
export const mirrorSim = (p) => ({
  x: 2 * WORLD_BOUNDS.centerX - p.x,
  y: 2 * WORLD_BOUNDS.centerY - p.y,
});

/** 對手陣營。 */
export const otherSide = (side) => (side === "blue" ? "red" : "blue");

/** 地圖中心。 */
export const MAP_CENTER_SIM = Object.freeze({ x: WORLD_BOUNDS.centerX, y: WORLD_BOUNDS.centerY });
export const MAP_CENTER_WORLD = Object.freeze({
  x: worldX(WORLD_BOUNDS.centerX), y: 0, z: worldZ(WORLD_BOUNDS.centerY),
});

/** 地圖在世界座標的半寬 / 半高（相機平移邊界用）。 */
export const MAP_HALF_WORLD = Object.freeze({
  x: (WORLD_BOUNDS.width / 2) * WORLD_SCALE,
  z: (WORLD_BOUNDS.height / 2) * WORLD_SCALE,
});

/** sim 座標是否有效且落在地圖內（Adapter 用來擋壞座標）。 */
export const inBoundsSim = (p) =>
  !!p && Number.isFinite(p.x) && Number.isFinite(p.y) &&
  p.x >= WORLD_BOUNDS.minX && p.x <= WORLD_BOUNDS.maxX &&
  p.y >= WORLD_BOUNDS.minY && p.y <= WORLD_BOUNDS.maxY;

/** 把座標夾回地圖內（只在資料壞掉時啟用；Adapter 會標記 clamped）。 */
export const clampSim = (p) => ({
  x: Math.min(WORLD_BOUNDS.maxX, Math.max(WORLD_BOUNDS.minX, p.x)),
  y: Math.min(WORLD_BOUNDS.maxY, Math.max(WORLD_BOUNDS.minY, p.y)),
});

// ── 具名地標存取（元件不得自己 import gameData 再算一次）────────────────────

export const LANE_IDS = Object.freeze(["top", "mid", "bot"]);
/** 三路中心線控制點（sim）。 */
export const laneSim = (lane) => LANES[lane];
/** 沿 lane 走 t∈[0,1] 的 sim 座標（＝ gameData.posOnLane，塔位的真相來源）。 */
export const laneAtSim = posOnLane;
/** 主堡 sim 座標。 */
export const baseSim = (side) => BASE[side];
/** 泉水 sim 座標。 */
export const fountainSim = (side) => FOUNTAIN[side];
/** 大型目標坑口 sim 座標（dragon / baron）。 */
export const pitSim = (key) => PITS[key];
/** 野區營地（sim；含 id/type/side）。 */
export const campsSim = () => CAMPS;
/** 河道中心線（sim）。 */
export const riverSim = () => RIVER;
/** 塔在 lane 上的**模擬** t（呈現用的 DISPLAY_T 另見 mapTowerLayoutStyle）。 */
export const towerSimT = TOWER_T;

/**
 * 契約摘要：給文件與 verifier 用，讓「Runtime 與 Debug 是不是同一套座標」
 * 可以被機器檢查，而不是靠人記得。
 */
export const COORDINATE_CONTRACT = Object.freeze({
  version: "h1",
  simBounds: WORLD_BOUNDS,
  worldScale: WORLD_SCALE,
  simToWorldFormula: "world.x = (sim.x - 110) * 1.7 ; world.z = (sim.y - 110) * 1.7",
  mirror: "rotate 180deg about map centre (110,110)",
  source: "src/gameData.js",
});
