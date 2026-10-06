// ============================================================================
//  gameData.js  —  全專案共用的地圖常數、座標工具、職業/顏色定義
//  （LogicEngine 與所有渲染層都從這裡 import，單一真實來源，避免重複定義）
//  座標系：WORLD_BOUNDS 內的邏輯世界單位；x 右、y 下。
// ============================================================================

import { RIFT_EXTENT_RATIO, placeRiftAnchor } from './battle/moba/map/riftMapMetrics.js';
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const fmtT = (s) => `${Math.floor(s / 60)}:${(Math.floor(s) % 60).toString().padStart(2, "0")}`;

// Sprint 29B5：3D / Minimap / Camera / Replay 共用的正式世界 metadata。
export const WORLD_BOUNDS = Object.freeze({
  minX: 0, minY: 0, maxX: 220 * RIFT_EXTENT_RATIO, maxY: 220 * RIFT_EXTENT_RATIO,
  width: 220 * RIFT_EXTENT_RATIO, height: 220 * RIFT_EXTENT_RATIO,
  centerX: 110 * RIFT_EXTENT_RATIO, centerY: 110 * RIFT_EXTENT_RATIO,
});
export const MAP_BOUNDS = WORLD_BOUNDS;
export const WORLD_SIZE = WORLD_BOUNDS.width;
export const WORLD_SCALE = 1.7;
export const mapNormX = (x, bounds = WORLD_BOUNDS) => (x - bounds.minX) / bounds.width;
export const mapNormY = (y, bounds = WORLD_BOUNDS) => (y - bounds.minY) / bounds.height;
export const worldX = (x) => (x - WORLD_BOUNDS.centerX) * WORLD_SCALE;
export const worldZ = (y) => (y - WORLD_BOUNDS.centerY) * WORLD_SCALE;

//  ⚠ H.2：上下路必須互為**精確 180° 旋轉鏡像**（`mirror(top, t) == (bot, 1−t)`，
//  繞地圖中心 (110,110)）。原本是手繪的，上下路互差最大 5.66 單位；H.2 把英雄碰撞
//  接上真實地圖幾何之後，這點不對稱直接變成藍紅不公平——實測順序偏差從 2.5pp 惡化到
//  15pp、藍方勝率掉到 15%。這裡的座標是「原值與其鏡像的中點」，最大位移 2.83 單位，
//  `check:mobamap` 3553 條與 regress/regress2 皆重跑通過。
//  **改任何一條路線的折線時，必須同時改鏡像側**，否則公平性立刻壞掉
//  （守門的驗收：`node tools/check_moba_nav_h2.mjs` 的 C3 鏡像航段路徑長）。
export const LANES = {
  top: [{x:26,y:192},{x:18,y:170},{x:15,y:140},{x:17,y:108},{x:24,y:80},{x:39,y:57.5},{x:58,y:40},{x:82,y:30},{x:110,y:25},{x:138,y:27},{x:162,y:33},{x:182,y:38},{x:192,y:28}],
  mid: [{x:30,y:190},{x:48,y:172},{x:68,y:152},{x:88,y:132},{x:110,y:110},{x:132,y:88},{x:152,y:68},{x:172,y:48},{x:190,y:30}],
  bot: [{x:28,y:192},{x:38,y:182},{x:58,y:187},{x:82,y:193},{x:110,y:195},{x:138,y:190},{x:162,y:180},{x:181,y:162.5},{x:196,y:140},{x:203,y:112},{x:205,y:80},{x:202,y:50},{x:194,y:28}],
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
for (const name of Object.keys(LANES)) LANES[name] = LANES[name].map(placeRiftAnchor);
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

//  Topology Final（2026-10-06）：河道改成**貫通上下路**的完整河道（LoL 的河道語言：
//  上路河口 → 巴龍坑 → 中路涉水點 → 小龍坑 → 下路河口），中心線就是兩主堡的中垂線
//  y = 110 + (176/184)(x − 110)。兩端延伸到三路外側，流進邊界崖壁底下。
//  舊版河只存在於兩坑之間（G.1「河不貫穿全圖」），側路沒有河口、坑緊貼側路轉角。
export const RIVER = Object.freeze({
  width: 20,
  points: [{x:34,y:37.3043478261},{x:47,y:49.7391304348},{x:76,y:77.4782608696},{x:93,y:93.7391304348},{x:110,y:110},
    {x:127,y:126.2608695652},{x:144,y:142.5217391304},{x:173,y:170.2608695652},{x:186,y:182.6956521739}].map(placeRiftAnchor),
});

// 坑位在雙方基地中垂線上，並互為 180° 鏡射。
//  Topology Final：沿中垂線往河道中段移（巴龍 x 60 → 76）。舊位置距上路轉角只有 21 單位，
//  坑壁幾乎貼著兵線、坑口直接開在路上；LoL 的坑在河道中段、兩側有河道與野區入口。
//  ⚠ 仍在中垂線上 ⇒ 每個坑對兩主堡等距（runtime29 的地圖對稱 invariant 不變）。
export const PITS = {
  dragon: { x:144, y:142.5217391304 },
  baron: { x:76, y:77.4782608696 },
};
for (const side of Object.keys(PITS)) PITS[side] = placeRiftAnchor(PITS[side]);
export const WATER = [
  { ...PITS.baron, r: 12 }, { ...PITS.dragon, r: 12 },
  ...[{x:82,y:80,r:7.5},{x:110,y:110,r:8},{x:138,y:140,r:7.5}].map(placeRiftAnchor),
];
const BLUE_WALLS = [
  {x:34,y:154,r:7},{x:52,y:168,r:6},{x:70,y:176,r:7},{x:88,y:162,r:6},
  {x:42,y:130,r:6},{x:62,y:138,r:7},{x:82,y:146,r:6},{x:98,y:158,r:5},
  {x:52,y:106,r:7},{x:74,y:116,r:6},{x:94,y:128,r:5.5},
  {x:112,y:170,r:6},{x:126,y:184,r:6},{x:100,y:190,r:5},
];
const SCALED_BLUE_WALLS = BLUE_WALLS.map(placeRiftAnchor);
const RED_WALLS = SCALED_BLUE_WALLS.map((o) => ({ x: WORLD_SIZE - o.x, y: WORLD_SIZE - o.y, r: o.r }));
export const WALLS = [...SCALED_BLUE_WALLS, ...RED_WALLS];
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
//  Topology Final：草叢全部是**有模擬實體**的視野草叢（舊版另有 14 叢只存在於畫面的
//  「呈現用 cover」，英雄不會把它們當草叢）。v6 精修：每一叢都放在有戰術價值的節點上
//  （藍方 15 叢，紅方 180° 鏡射），不在空地上散點：
//    三角草 ×2（上／下路河口三岔）            Gank 出口 ×4（上路、下路、中路兩側）
//    巴龍坑口視野爭奪 ×2（西口、南口）        小龍坑口視野爭奪 ×2（西北口、南口）
//    河道中段草 ×1（坑與中路之間的視野）       野區伏擊 ×3（深林腹地、狼營旁、Buff→三角路）
//    下路內側隱蔽側路 ×1
const BLUE_BUSHES = [
  {x:44,y:92,r:5},{x:131,y:173,r:5},                                // tri ×2
  {x:30,y:116,r:4},{x:99,y:184,r:4},{x:78,y:121,r:4},{x:97,y:137,r:4}, // gank mouths
  {x:51,y:86,r:4.2},{x:66,y:100,r:4},                               // Baron chokes
  {x:122,y:138,r:4.2},{x:135,y:166,r:4.2},                          // Dragon chokes
  {x:96,y:97,r:4},                                                  // mid-river
  {x:64,y:113,r:4.5},{x:40,y:129,r:4},{x:119,y:162,r:4.5},          // jungle ambush
  {x:112,y:180,r:4},                                                // bot-lane flank
];
export const BUSHES = [...BLUE_BUSHES, ...BLUE_BUSHES.map((b) => ({ x: 220 - b.x, y: 220 - b.y, r: b.r }))];

// ── S29B1 / Milestone C：Jungle Camp 座標（引擎與呈現共用單一真實來源）──
//  選點規則（以腳本掃格驗證，非手感）：兩側 180° 鏡像（100-x,100-y）、距任一障礙
//  ≥ r+1.8（英雄避讓半徑 r+1.4 + 互動餘裕）、距三路路線 ≥5.5、距龍/巴龍坑 ≥8、
//  距草叢 ≥ r+1.5。side 表示「屬於哪一方野區」（該側打野的預設農怪路線）。
//  Topology Final（2026-10-06）：營地移到 LoL 的野區深度。舊座標距己方主堡只有 62–76
//  單位（LoL 換算約 84–110），野區因此很淺、Buff 擠在中路與下路之間的窄帶上、
//  石甲蟲貼著兵線。新座標都坐在 mapJungleTopology 的營地房間中心（BLUE_ROOMS），
//  距主堡：Buff 100.5、狼 81.6、石甲蟲 78.8；仍 180° 鏡像（x+x'=220、y+y'=220）。
//  ⚠ 下方保留的舊註解描述的是 2026-09-10 的歷史修正，座標已被本節取代。
export const CAMPS = [
  // Buff 原座標 (74,154)/(146,66) 落在中路視覺帶；G.4 曾只在 renderer 位移，
  // 導致可攻擊實體與畫面相差 17.1。Milestone C 上線動態野怪後統一到淨空座標。
  { id: "camp_blue_buff", side: "blue", type: "buff", presentationKey: "blueBuff", x: 108, y: 150 },
  { id: "camp_blue_a",    side: "blue", type: "camp", presentationKey: "jungleCamp", x: 46, y: 124 },
  //  ⚠ 2026-09-10 修正：原座標 y:193 距**下路路線只有 1.0 單位**（規則要求 ≥5.5），
  //    營地整個壓在兵線上。根因不是變換也不是 renderer：
  //      · 營地座標定於 2026-07-15（Sprint 29B1），對**當時的**路線是合規的。
  //      · `LANES` 在 2026-07-16（Sprint 29B5 世界尺度調整）被重新塑形，
  //        路線從營地底下移走，而營地沒有跟著重新驗證。
  //      · `placeRiftAnchor` 是純平移（x+55, y+55），營地與路線平移同一個量
  //        ⇒ 相對距離不變 ⇒ 變換不可能是原因。
  //    新座標由掃格求解（照本區塊開頭那條選點規則），取「合規且離原位最近」，
  //    並多要 8.0 的餘裕而不是剛好 5.5——卡在最小值的位置，路線下次再動就又壓線。
  //    結果：距路線 1.0 → 8.0，導航淨空 12.2 → 19.2，鏡像仍精確（96+124=220、186+34=220）。
  { id: "camp_blue_b",    side: "blue", type: "camp", presentationKey: "jungleCamp", x: 96, y: 175 },
  { id: "camp_red_buff",  side: "red",  type: "buff", presentationKey: "redBuff", x: 112, y: 70 },
  { id: "camp_red_a",     side: "red",  type: "camp", presentationKey: "jungleCamp", x: 174, y: 96 },
  //  ⚠ 同一個錯誤的 180° 鏡像：它壓在**上路**線上（也是 1.0）。
  //    Owner 只回報了下路那座，但兩座是同一個原因、必須一起修，
  //    否則地圖會變成不對稱——而對稱是 runtime29 用規則在守的 invariant。
  { id: "camp_red_b",     side: "red",  type: "camp", presentationKey: "jungleCamp", x: 124, y: 45 },
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

//  入侵點＝敵方 Buff 房間朝河道的出口（Topology Final 隨 Buff 一起移動；仍 180° 鏡像）。
export const INVASION_POINT = { blue: { x:106, y:78 }, red: { x:114, y:142 } };
for (const points of [BASE, FOUNTAIN, INVASION_POINT]) {
  for (const side of Object.keys(points)) points[side] = placeRiftAnchor(points[side]);
}
for (const points of [BUSHES, CAMPS]) {
  for (let i = 0; i < points.length; i++) points[i] = placeRiftAnchor(points[i]);
}

export const ROLES = ["top", "jungle", "mid", "adc", "sup"];
/**
 * 戰術 lane 採己方視角："top" 是從己方基地出發的上側路線。
 * 地圖以 180° 旋轉對稱，因此紅方 canonical top 對應 world bot，反之亦然。
 */
export const MIRROR_LANE = Object.freeze({ top: "bot", mid: "mid", bot: "top" });
export const ROLE_LANE = { top: "top", jungle: "mid", mid: "mid", adc: "bot", sup: "bot" };
export const worldLaneForSide = (side, lane) => side === "red" ? MIRROR_LANE[lane] : lane;
export const sideRelativeLane = (side, worldLane) => side === "red" ? MIRROR_LANE[worldLane] : worldLane;
export const toSideRelativePoint = (side, point) => side === "red" ? {
  x: WORLD_BOUNDS.minX + WORLD_BOUNDS.maxX - point.x,
  y: WORLD_BOUNDS.minY + WORLD_BOUNDS.maxY - point.y,
} : { x: point.x, y: point.y };
// 180° 旋轉是自身的反函式。
export const fromSideRelativePoint = toSideRelativePoint;
export const ROLE_NAME = { top: "上路", jungle: "打野", mid: "中路", adc: "射手", sup: "輔助" };
export const TOWER_HP = 2100, NEXUS_HP = 7200;

// 隊色（十六進位；fx 與渲染共用）
export const SIDE = { blue: 0x3b82f6, red: 0xef4444 };
export const GLOW = { blue: 0x9ad0ff, red: 0xffb0b0 };
