// ============================================================================
//  gameData.js  —  全專案共用的地圖常數、座標工具、職業/顏色定義
//  （LogicEngine 與所有渲染層都從這裡 import，單一真實來源，避免重複定義）
//  座標系：0–100 百分比；x 右、y 下。世界座標映射在 view 層（wx/wz）處理。
// ============================================================================

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const fmtT = (s) => `${Math.floor(s / 60)}:${(Math.floor(s) % 60).toString().padStart(2, "0")}`;

export const LANES = {
  top: [{x:11,y:82},{x:9,y:68},{x:8,y:52},{x:9,y:38},{x:12,y:26},{x:17,y:18},{x:26,y:13},{x:38,y:11},{x:52,y:10},{x:64,y:11},{x:75,y:13},{x:83,y:15}],
  mid: [{x:15,y:85},{x:24,y:76},{x:33,y:67},{x:42,y:58},{x:50,y:50},{x:58,y:42},{x:66,y:34},{x:74,y:26},{x:81,y:19},{x:86,y:15}],
  bot: [{x:15,y:88},{x:30,y:88},{x:45,y:87},{x:60,y:85},{x:73,y:82},{x:82,y:76},{x:87,y:64},{x:89,y:50},{x:89,y:36},{x:88,y:24},{x:86,y:17}],
};
export function posOnLane(lane, t) {
  const pts = LANES[lane]; t = clamp(t, 0, 1);
  const seg = (pts.length - 1) * t, i = Math.floor(seg), f = seg - i;
  const a = pts[Math.min(i, pts.length - 1)], b = pts[Math.min(i + 1, pts.length - 1)];
  return { x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f) };
}

export const OBSTACLES = [
  {x:33,y:32,r:6},{x:74,y:73,r:6},
  {x:40,y:40,r:3.5},{x:46,y:46,r:3},{x:52,y:52,r:3},{x:58,y:58,r:3},{x:65,y:66,r:3.5},
  {x:18,y:18,r:3.5},{x:25,y:16,r:3},{x:30,y:20,r:3},{x:22,y:25,r:3},
  {x:14,y:30,r:3},{x:20,y:35,r:3},{x:26,y:30,r:2.8},
  {x:58,y:16,r:3},{x:65,y:18,r:3},{x:72,y:20,r:3},{x:66,y:25,r:3},
  {x:60,y:28,r:2.8},{x:54,y:24,r:2.8},{x:48,y:20,r:2.8},
  {x:18,y:62,r:3},{x:24,y:66,r:3},{x:30,y:70,r:3},{x:22,y:74,r:3},
  {x:16,y:70,r:2.8},{x:34,y:64,r:2.8},{x:38,y:74,r:3},
  {x:68,y:72,r:3},{x:62,y:66,r:3},{x:78,y:68,r:3},{x:82,y:62,r:3},
  {x:70,y:60,r:2.8},{x:64,y:78,r:2.8},{x:58,y:74,r:2.8},
  {x:16,y:46,r:3.5},{x:84,y:54,r:3.5},
  {x:44,y:30,r:2.5},{x:56,y:70,r:2.5},
  {x:42,y:54,r:2.5},{x:58,y:46,r:2.5},
  {x:36,y:48,r:2.5},{x:64,y:52,r:2.5},
];
export const WATER = OBSTACLES.slice(0, 7);   // 河道 + 龍/巴龍坑（不拉伸成牆）
export const WALLS = OBSTACLES.slice(7);      // 樹林/石牆（垂直拉伸 + 用於英雄避讓）

export const PITS = { dragon: { x:74, y:73 }, baron: { x:33, y:32 } };
export const BASE = { blue: { x:12, y:90 }, red: { x:87, y:16 } };
export const FOUNTAIN = { blue: { x:9, y:93 }, red: { x:91, y:12 } };
export const TOWER_T = { blue: [0.15, 0.33, 0.48], red: [0.85, 0.67, 0.52] };
export const BUSHES = [
  {x:30,y:42,r:4},{x:70,y:58,r:4},{x:42,y:62,r:3.5},{x:58,y:38,r:3.5},
  {x:20,y:50,r:3},{x:80,y:50,r:3},{x:24,y:80,r:3.5},{x:76,y:20,r:3.5},
  {x:46,y:20,r:3},{x:54,y:80,r:3},
];

export const ROLES = ["top", "jungle", "mid", "adc", "sup"];
export const ROLE_LANE = { top: "top", jungle: "mid", mid: "mid", adc: "bot", sup: "bot" };
export const ROLE_NAME = { top: "上路", jungle: "打野", mid: "中路", adc: "射手", sup: "輔助" };
export const TOWER_HP = 2100, NEXUS_HP = 7200;

// 隊色（十六進位；fx 與渲染共用）
export const SIDE = { blue: 0x3b82f6, red: 0xef4444 };
export const GLOW = { blue: 0x9ad0ff, red: 0xffb0b0 };
