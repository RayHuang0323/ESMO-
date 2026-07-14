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
// ── S29：弧長參數化（公平性修正）─────────────────────────────────────────────
//  舊版 posOnLane 以「線段索引」內插：t 均分到 (pts.length−1) 段，而各段長度不等
//  ⇒ t 與「沿路實際距離」不成比例。後果（實測）：
//    · 中路 10 點，中心 {50,50} 落在索引 4/9 ＝ **t 0.444，不是 0.5**
//      ⇒ t=0.3 與 t=0.7 距中心並不對稱；塔的 t（藍 0.15/0.33/0.48 vs 紅 0.85/0.67/0.52）
//        是假設「中心 = 0.5」才對稱的，實際上兩邊塔距不等。
//    · 紅方泉水到其對線點只有 29.9 單位，藍方要 44.3 ⇒ 紅方每次死亡/撤退回線快 ~6 秒，
//      複利成系統性優勢（原本被「藍方先手」偏差抵銷，S29 修掉先手後才浮現）。
//  改為弧長參數化後：t 正比於沿路距離、t=0.5 就是路徑中點、對稱 t 值 ⇒ 對稱世界位置。
//  副作用（刻意）：小兵以固定 dt 前進 ⇒ 現在是**等速世界移動**（原本忽快忽慢）。
const LANE_ARC = {};
for (const [name, pts] of Object.entries(LANES)) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  LANE_ARC[name] = { cum, total: cum[cum.length - 1] };
}
/** 沿路線的第 t 比例處（t 依**弧長**，非線段索引）。 */
export function posOnLane(lane, t) {
  const pts = LANES[lane], { cum, total } = LANE_ARC[lane];
  t = clamp(t, 0, 1);
  const target = t * total;
  let i = 1;
  while (i < cum.length - 1 && cum[i] < target) i++;
  const segLen = cum[i] - cum[i - 1];
  const f = segLen > 0 ? (target - cum[i - 1]) / segLen : 0;
  const a = pts[i - 1], b = pts[i];
  return { x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f) };
}
/** 路線總長（單位）——供校準與驗證使用。 */
export const laneLength = (lane) => LANE_ARC[lane].total;

export const OBSTACLES = [
  {x:33,y:34,r:6},{x:74,y:73,r:6},   // ⚠ [0]=baron 坑、[1]=dragon 坑：座標須與 PITS 一致
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

// S29（公平性修正 2/2）：baron 坑原為 {33,32}，**不在** 兩基地連線的中垂線上
//   ⇒ 藍→baron 61.7、紅→baron 59.2（紅方近 2.4 單位）。引擎的目標爭奪規則是
//   「坑 9 單位內人數多的一方推進」，死亡後回坑的路程直接決定爭奪權 ⇒ 這是紅方的
//   系統性優勢。移到中垂線上的 {33,34} ⇒ 藍 59.8 / 紅 60.0（差 0.2）。
//   ⚠ 對稱判準採「**每個坑對雙方基地等距**」，不是「兩坑互為 180° 鏡像」：
//     引擎中雙方爭奪的是**同一個坑**，等距才是公平性的充要條件。
export const PITS = { dragon: { x:74, y:73 }, baron: { x:33, y:34 } };
// S29（公平性修正 1/2）：紅方基地/泉水原本不是藍方的 180° 鏡像——
//   BASE.red 原為 {87,16}（鏡像應為 {88,10}）、FOUNTAIN.red 原為 {91,12}（應為 {91,7}）。
//   紅方基地因此比藍方**離地圖中心近約 6 單位** ⇒ 紅方到小龍/巴龍各近 6 單位、
//   死亡後回線更快。實測（修掉「藍方先手」偏差後）紅方勝率因此被推到 ~75%。
//   改為精確鏡像 ⇒ 兩軍到雙目標的距離差 <0.5 單位。
//   ⚠ 這條性質由 check_moba_runtime29 的「地圖對稱」invariant **以規則判定**（比距離，
//     不比座標）——改動 BASE / FOUNTAIN / PITS 若破壞對稱，該測試會直接紅。
export const BASE = { blue: { x:12, y:90 }, red: { x:88, y:10 } };
export const FOUNTAIN = { blue: { x:9, y:93 }, red: { x:91, y:7 } };
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
