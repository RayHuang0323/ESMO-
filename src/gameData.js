// ============================================================================
//  gameData.js  —  全專案共用的地圖常數、座標工具、職業/顏色定義
//  （LogicEngine 與所有渲染層都從這裡 import，單一真實來源，避免重複定義）
//  座標系：WORLD_BOUNDS 內的邏輯世界單位；x 右、y 下。
// ============================================================================

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const fmtT = (s) => `${Math.floor(s / 60)}:${(Math.floor(s) % 60).toString().padStart(2, "0")}`;

// Sprint 29B5：3D / Minimap / Camera / Replay 共用的正式世界 metadata。
export const WORLD_BOUNDS = Object.freeze({
  minX: 0, minY: 0, maxX: 220, maxY: 220,
  width: 220, height: 220, centerX: 110, centerY: 110,
});
export const MAP_BOUNDS = WORLD_BOUNDS;
export const WORLD_SIZE = WORLD_BOUNDS.width;
export const WORLD_SCALE = 1.7;
export const mapNormX = (x, bounds = WORLD_BOUNDS) => (x - bounds.minX) / bounds.width;
export const mapNormY = (y, bounds = WORLD_BOUNDS) => (y - bounds.minY) / bounds.height;
export const worldX = (x) => (x - WORLD_BOUNDS.centerX) * WORLD_SCALE;
export const worldZ = (y) => (y - WORLD_BOUNDS.centerY) * WORLD_SCALE;

export const LANES = {
  top: [{x:26,y:192},{x:18,y:170},{x:15,y:140},{x:17,y:108},{x:24,y:80},{x:38,y:57},{x:58,y:40},{x:82,y:30},{x:110,y:25},{x:138,y:27},{x:162,y:33},{x:184,y:40},{x:194,y:30}],
  mid: [{x:30,y:190},{x:48,y:172},{x:68,y:152},{x:88,y:132},{x:110,y:110},{x:132,y:88},{x:152,y:68},{x:172,y:48},{x:190,y:30}],
  bot: [{x:30,y:194},{x:40,y:184},{x:58,y:187},{x:82,y:193},{x:110,y:195},{x:138,y:190},{x:162,y:180},{x:180,y:162},{x:196,y:140},{x:203,y:112},{x:205,y:80},{x:202,y:50},{x:194,y:28}],
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

export const RIVER = Object.freeze({
  width: 22,
  points: [{x:42,y:38},{x:66,y:62},{x:88,y:84},{x:110,y:110},{x:132,y:136},{x:154,y:158},{x:178,y:182}],
});

// 坑位在雙方基地中垂線上，並互為 180° 鏡射。
export const PITS = {
  dragon: { x:160, y:157.8260869565 },
  baron: { x:60, y:62.1739130435 },
};
export const WATER = [
  { ...PITS.baron, r: 12 }, { ...PITS.dragon, r: 12 },
  {x:82,y:80,r:7.5},{x:110,y:110,r:8},{x:138,y:140,r:7.5},
];
const BLUE_WALLS = [
  {x:34,y:154,r:7},{x:52,y:168,r:6},{x:70,y:176,r:7},{x:88,y:162,r:6},
  {x:42,y:130,r:6},{x:62,y:138,r:7},{x:82,y:146,r:6},{x:98,y:158,r:5},
  {x:52,y:106,r:7},{x:74,y:116,r:6},{x:94,y:128,r:5.5},
  {x:112,y:170,r:6},{x:126,y:184,r:6},{x:100,y:190,r:5},
];
const RED_WALLS = BLUE_WALLS.map((o) => ({ x: WORLD_SIZE - o.x, y: WORLD_SIZE - o.y, r: o.r }));
export const WALLS = [...BLUE_WALLS, ...RED_WALLS];
export const OBSTACLES = [...WATER, ...WALLS];

// S29（公平性修正 2/2）：baron 坑原為 {33,32}，**不在** 兩基地連線的中垂線上
//   ⇒ 藍→baron 61.7、紅→baron 59.2（紅方近 2.4 單位）。引擎的目標爭奪規則是
//   「坑 9 單位內人數多的一方推進」，死亡後回坑的路程直接決定爭奪權 ⇒ 這是紅方的
//   系統性優勢。移到中垂線上的 {33,34} ⇒ 藍 59.8 / 紅 60.0（差 0.2）。
//   ⚠ 對稱判準採「**每個坑對雙方基地等距**」，不是「兩坑互為 180° 鏡像」：
//     引擎中雙方爭奪的是**同一個坑**，等距才是公平性的充要條件。
// S29（公平性修正 1/2）：紅方基地/泉水原本不是藍方的 180° 鏡像——
//   BASE.red 原為 {87,16}（鏡像應為 {88,10}）、FOUNTAIN.red 原為 {91,12}（應為 {91,7}）。
//   紅方基地因此比藍方**離地圖中心近約 6 單位** ⇒ 紅方到 Dragon/Baron 各近 6 單位、
//   死亡後回線更快。實測（修掉「藍方先手」偏差後）紅方勝率因此被推到 ~75%。
//   改為精確鏡像 ⇒ 兩軍到雙目標的距離差 <0.5 單位。
//   ⚠ 這條性質由 check_moba_runtime29 的「地圖對稱」invariant **以規則判定**（比距離，
//     不比座標）——改動 BASE / FOUNTAIN / PITS 若破壞對稱，該測試會直接紅。
export const BASE = { blue: { x:22, y:202 }, red: { x:198, y:18 } };
export const FOUNTAIN = { blue: { x:14, y:210 }, red: { x:206, y:10 } };
export const TOWER_T = { blue: [0.15, 0.33, 0.48], red: [0.85, 0.67, 0.52] };
export const BUSHES = [
  {x:50,y:92,r:7},{x:170,y:128,r:7},{x:88,y:148,r:6},{x:132,y:72,r:6},
  {x:38,y:118,r:6},{x:182,y:102,r:6},{x:48,y:178,r:6},{x:172,y:42,r:6},
  {x:96,y:58,r:5},{x:124,y:162,r:5},{x:78,y:96,r:5},{x:142,y:124,r:5},
];

// ── S29B1：Jungle Camp 座標（單一真實來源：主畫面 / Minimap / Replay / 引擎共用）──
//  選點規則（以腳本掃格驗證，非手感）：兩側 180° 鏡像（100-x,100-y）、距任一障礙
//  ≥ r+1.8（英雄避讓半徑 r+1.4 + 互動餘裕）、距三路路線 ≥5.5、距龍/巴龍坑 ≥8、
//  距草叢 ≥ r+1.5。side 表示「屬於哪一方野區」（該側打野的預設農怪路線）。
export const CAMPS = [
  { id: "camp_blue_buff", side: "blue", type: "buff", presentationKey: "blueBuff", x: 74, y: 154 },
  { id: "camp_blue_a",    side: "blue", type: "camp", presentationKey: "jungleCamp", x: 48, y: 142 },
  { id: "camp_blue_b",    side: "blue", type: "camp", presentationKey: "jungleCamp", x: 96, y: 174 },
  { id: "camp_red_buff",  side: "red",  type: "buff", presentationKey: "redBuff", x: 146, y: 66 },
  { id: "camp_red_a",     side: "red",  type: "camp", presentationKey: "jungleCamp", x: 172, y: 78 },
  { id: "camp_red_b",     side: "red",  type: "camp", presentationKey: "jungleCamp", x: 124, y: 46 },
];

export const OBJECTIVE_PRESENTATION = Object.freeze({
  dragon: Object.freeze({ key: "dragon", label: "Dragon", displayName: "Dragon（巨龍）", color: 0xc084fc, accent: 0x67e8f9, icon: "winged-drake", silhouette: "wide-winged" }),
  baron: Object.freeze({ key: "baron", label: "Baron", displayName: "Baron（巴龍）", color: 0xf59e0b, accent: 0xa78bfa, icon: "crowned-serpent", silhouette: "tall-serpent" }),
  blueBuff: Object.freeze({ key: "blueBuff", label: "Blue Buff", displayName: "Blue Buff", color: 0x38bdf8, accent: 0xdbeafe, icon: "twin-crystal", silhouette: "broad-golem" }),
  redBuff: Object.freeze({ key: "redBuff", label: "Red Buff", displayName: "Red Buff", color: 0xf97316, accent: 0xfef3c7, icon: "horned-flame", silhouette: "horned-beast" }),
  jungleCamp: Object.freeze({ key: "jungleCamp", label: "Jungle Camp", displayName: "Jungle Camp", color: 0x84cc16, accent: 0xecfccb, icon: "pack-claw", silhouette: "creature-pack" }),
});
export const presentationForObjective = (objective) => {
  const key = objective?.presentationKey ?? objective?.id ?? objective?.type;
  if (OBJECTIVE_PRESENTATION[key]) return OBJECTIVE_PRESENTATION[key];
  if (objective?.type === "buff") return OBJECTIVE_PRESENTATION[objective?.side === "red" ? "redBuff" : "blueBuff"];
  return OBJECTIVE_PRESENTATION.jungleCamp;
};

export const INVASION_POINT = { blue: { x:142, y:72 }, red: { x:78, y:148 } };

export const ROLES = ["top", "jungle", "mid", "adc", "sup"];
export const ROLE_LANE = { top: "top", jungle: "mid", mid: "mid", adc: "bot", sup: "bot" };
export const ROLE_NAME = { top: "上路", jungle: "打野", mid: "中路", adc: "射手", sup: "輔助" };
export const TOWER_HP = 2100, NEXUS_HP = 7200;

// 隊色（十六進位；fx 與渲染共用）
export const SIDE = { blue: 0x3b82f6, red: 0xef4444 };
export const GLOW = { blue: 0x9ad0ff, red: 0xffb0b0 };
