// ============================================================================
//  battle/moba/map/mapZones.js — MOBA 地形層級與野區分區（Milestone D → F）
//
//  定義 Blockout 的地形層級（可行走/牆/河/高地/坑）與四個野區象限。
//  純資料（無 THREE/React），供 renderer 與 verifier 共用。
//
//  ⚠ Milestone F 起，**顏色一律定義在 `mapVisualStyle.js`**（PALETTE / VOLUME_COLOR）。
//    本檔原有的 ZONE_COLOR 已移除：兩份調色盤並存必然會分歧，
//    而畫面、俯視圖工具、verifier 三方必須吃同一份色票。
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

// 四個野區象限（Blue/Red × Top/Bot），中心與半徑為「示意 overlay」用途，
// 依既有 camps 與河道/兵線幾何取點；不是模擬座標，只供分區標示。
export const JUNGLE_QUADRANTS = Object.freeze([
  { id: "blue_top", side: "blue", label: "藍上野", x: 58, y: 78, r: 26 },
  { id: "blue_bot", side: "blue", label: "藍下野", x: 73, y: 155, r: 28 },
  { id: "red_top", side: "red", label: "紅上野", x: 147, y: 65, r: 28 },
  { id: "red_bot", side: "red", label: "紅下野", x: 162, y: 142, r: 26 },
]);
