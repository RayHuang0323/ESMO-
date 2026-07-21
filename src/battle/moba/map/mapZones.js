// ============================================================================
//  battle/moba/map/mapZones.js — MOBA 地形層級與分區（Milestone D）
//
//  定義 Blockout 的地形層級（可行走/牆/河/高地/坑）與顏色，以及四個野區象限。
//  純資料（無 THREE/React），供 renderer 與 verifier 共用。顏色沿用 ESMO 地表材質語言。
// ============================================================================

// 地形層級（可行走性）
export const ZONE = Object.freeze({
  LANE: "lane",           // 主要可行走
  JUNGLE: "jungle",       // 次級可行走
  RIVER: "river",         // 低地/不同材質
  HIGHGROUND: "highground", // 基地/高地
  WALL: "wall",           // 不可行走
  PIT: "pit",             // Dragon/Baron 特殊區
});

// 顏色（Visual Bible §3 地表語言）
export const ZONE_COLOR = Object.freeze({
  ground: 0x2c3f1c,       // 底草地（較暗，讓路/河/牆更跳）
  lane: 0xc79a5a,         // 泥土路（亮沙色，一眼可見）
  lane_edge: 0x2a1d0e,    // 路緣深色輪廓
  jungle: 0x33502a,       // 野區草地
  jungle_edge: 0x20331a,  // 野區邊界
  river: 0x2f88a0,        // 河道青綠（較亮）
  river_edge: 0x22483a,   // 河岸輪廓
  highground_blue: 0x2b4a7a,
  highground_red: 0x7a2b2b,
  wall: 0x6f6e69,         // 岩壁灰
  pit_dragon: 0x8b5cf6,   // 龍坑紫
  pit_baron: 0xd9922b,    // 巴龍坑琥珀
  tower_blue: 0x3b82f6,
  tower_red: 0xef4444,
  bush: 0x224e24,
  camp: 0x84cc16,
});

// 四個野區象限（Blue/Red × Top/Bot），中心與半徑為「示意 overlay」用途，
// 依既有 camps 與河道/兵線幾何取點；不是模擬座標，只供分區標示。
export const JUNGLE_QUADRANTS = Object.freeze([
  { id: "blue_top", side: "blue", label: "藍上野", x: 58, y: 78, r: 26 },
  { id: "blue_bot", side: "blue", label: "藍下野", x: 73, y: 155, r: 28 },
  { id: "red_top", side: "red", label: "紅上野", x: 147, y: 65, r: 28 },
  { id: "red_bot", side: "red", label: "紅下野", x: 162, y: 142, r: 26 },
]);
