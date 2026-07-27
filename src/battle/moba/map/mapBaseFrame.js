// ============================================================================
//  battle/moba/map/mapBaseFrame.js — 基地骨架：尺寸、出口牆體模組、三個門的方位
//                                     （Milestone G.15-final）
//
//  【為什麼要把這一段抽出來】G.15-fix4 之後，牆體本身已經是「唯一模組 × 三次旋轉」，
//   但畫面上三座高地塔看起來仍然歪斜。量測出來的原因不是塔的座標算錯，而是
//   **門與塔各自為政**：
//
//     lane        門的方位(自平台中心)   塔的方位   塔偏離門軸的側距
//     top         −127.1°                −108.7°    +11.8
//     mid          −63.2°                 −49.8°     +7.3
//     bot           +0.6°                 −15.8°     −8.3
//
//   三座塔分別落在自己那個門的左邊、左邊、右邊，距離也各不相同（35.4/30.5/28.3）。
//   於是「道路 → 入口 → 入口左右牆體 → 高地塔」這條節奏在三個方向長得完全不一樣，
//   肉眼讀起來就是塔歪、牆歪。
//
//  【G.15-final 的作法】把**門的方位**當成基地的唯一骨架，其它東西都掛在它上面：
//    ① 三個門等角排列（間距 = 牆體模組自己的張角 Δ）⇒ 模組首尾相接，牆一件不刪。
//    ② 門扇中軸 φ0 由 minimax 求解：讓「門的方位」與「該路高地塔原本的方位」
//       的最大角差最小（實測 8.14°）。
//    ③ **高地塔的呈現座標貼到自己那個門的軸線上**，距平台中心一律 towerR
//       ⇒ 三座塔與自己出口中心的相對位置完全相同（rotation-only 差異）。
//       ⚠ 只動呈現座標；gameData 的模擬座標 sim{t,x,y} 一個字都沒改
//         （mapTowerLayoutStyle 早有同樣的先例：symmetrizeDisplayPos）。
//    ④ 道路的近基地段改走「主堡 → 內庭轉折 → 城門 → 高地塔」，再接回原本的
//       lane 控制點（mapLaneStyle）⇒ 道路真的從城門長出來，塔也真的站在路上。
//
//  【idempotent 很重要】②的目標函式只吃**角度**（門方位 vs 塔方位），不吃距離。
//   所以把塔貼到門軸之後再算一次，得到的 φ0 完全相同 ⇒ 誰先誰後都不會漂移，
//   mapTerrainShapes 與 tools/check_moba_map.mjs 各自算一次也保證一致。
//
//  ⚠ 純資料、無 THREE/React、不使用 Math.random()、不讀寫 gameData。
// ============================================================================
import { HEIGHT } from "./mapVisualStyle.js";

const LANES = ["top", "mid", "bot"];
const MIRROR = Object.freeze({ top: "bot", mid: "mid", bot: "top" });

/**
 * 基地尺寸（模擬單位）。硬約束（改任何一個都要重跑 `node tools/check_moba_map.mjs`）：
 *
 *   · apronR ≥ offsetToCenter + keepR        主堡台必須完全站在平台上
 *   · C.y + apronR ≤ 220、C.x − apronR ≥ 0   平台不得被地圖邊界切掉
 *   · rimR + rimThick/2 ≤ apronR             城牆必須長在平台上
 *   · 門柱最外角 ≤ apronR                    門樓不得凸出平台外緣
 *   · towerR ≥ 門柱最外角 + plazaR + 餘裕     高地塔不得壓到城牆
 *   · 高地塔距自己主堡 ∈ HIGHGROUND_BAND(30~50)
 */
export const BASE_GEO = Object.freeze({
  offsetToCenter: 12,   // 平台中心 C 相對主堡往地圖中心推的距離
  apronR: 26.6,         // 高地平台半徑（圓心 C）
  courtR: 18,           // 內庭鋪面半徑（圓心 C）
  keepR: 14,            // 主堡台半徑（圓心 = 主堡；包住泉水 11.31 與門牙塔 11.5）
  keepWallR: 12.4,      // 主堡內圈標稱半徑（層級報告用）

  //  ══ 出口牆體模組的全部尺寸（見 buildBaseExitWallModule）══════════════════
  //  ⚠ 基地的**每一段牆**都出自這份模組：沒有後翼牆、沒有另一圈共用內牆。
  //    外牆長度由 flankSegs 決定、內牆由 shoulderSegs 決定。
  rimR: 23.3,           // 城牆中心線半徑（圓心 C）
  rimThick: 5.6,
  rimStep: 1.4,         // 每一段牆的**弦長**（角步長由 2·asin(step/2r) 反解 ⇒ 各半徑同長）
  gateClear: 10.0,      // 出口淨寬（兩根門柱內緣的側向距離；下限 EXIT_MIN_WIDTH = 8）
  pierArc: 3.6,         // 門柱沿弧方向的寬
  pierRadial: 5.6,      // 門柱沿出口方向的長（門樓的進深）
  //  翼牆段數。左右同值 ⇒ 模組自身左右鏡射；三個模組首尾相接 ⇒ 這個值同時決定
  //  模組張角 Δ，而 Δ 決定三個門與三條 lane 的角差（見檔頭②）。
  //  ⚠ 加大 flankSegs ⇒ Δ 變大 ⇒ 門與塔的角差變大 ⇒ 道路轉折變急。實測 1 段時
  //    角差 8.14°、道路最大轉折 ~24°（與 lane 自身的自然曲率同量級）。
  flankSegs: 2,
  //  肩牆段數（門柱內側、與出口方向平行往內庭延伸）。六道肩牆圍出內庭。
  //  ⚠ 上限由**相鄰模組**決定：肩牆愈往內愈靠近鄰居的出口通道，實測 4 段時
  //    鄰居通道仍有 4.6 幾何淨距（距離場量到約 4.2）。
  shoulderSegs: 4,
  shoulderThick: 3.2,   // 肩牆厚（內牆規格，比外牆薄 ⇒ 門內通道不被夾窄）

  //  高地塔到平台中心的距離。三座塔一律貼在自己那個門的軸線上、距 C 都是這個值
  //  ⇒ 「塔與出口中心的相對位置」三路完全相同。
  towerR: 32.2,

  gateWidth: 10.0,      // 標稱門寬（舊消費端 mapBaseLayoutStyle 的 gaps 用）
  highlandR: 33,        // 高地草地半徑（圓心 C；地表，可被地圖邊界裁切）
  corridorW: 24,        // 高地走廊寬（沿出口軸線，模組的一部分）
  rampW: 8.5,           // 坡道寬
  //  出口淨空通道寬（牆體 / 裝飾岩一律不得進入）。
  //  ⚠ 必須 < 2 × 門柱側距（= gateClear + pierArc = 13.6），否則 mapTerrainShapes
  //    §23 的 inCorridor 會把**模組自己的門柱與肩牆**砍掉。
  exitCorridorW: 9.0,
  fountainPadR: 8.0,
  fountainStepR: 6.4,
  fountainPoolR: 5.0,
  fountainRimR: 6.9,
  fountainRimThick: 3.0,
  fountainWalkW: 7.0,
  keepOutR: 52,         // 基地淨空半徑（圓心 = 主堡）
});

/** 固定弦長的角步長：走一步，兩端點的**直線距離**恆 = chord。 */
export const angStep = (r, chord) => 2 * Math.asin(Math.min(1, chord / (2 * r)));

/** 角度正規化到 (ref−π, ref+π]。 */
export const nearAng = (a, ref) => ref + Math.atan2(Math.sin(a - ref), Math.cos(a - ref));

/**
 * 建立**唯一一份**基地出口牆體模組。
 *
 * 座標系：以高地平台圓心 C 為原點的直角座標，
 *   局部 +x = 該出口的方位（門開向 +x），局部 +y = 面向出口時的**左**側。
 * 三個出口只是把同一份輸出繞 C 旋轉不同角度（見 mapBaseBlueprint.placeExitModule），
 * 因此「三方向結構相同」是剛體變換的結果，不是三段相似的程式碼碰巧一致。
 *
 * 元件（七件，順序 = 畫面由左到右）：
 *   flankLeft  弧牆   繞 C、半徑 rimR，自門柱外緣起 flankSegs 段
 *   pierLeft   門柱   長軸沿 +x 的門樓（len=pierRadial、thick=pierArc）
 *   gate       開口   兩根門柱內緣之間，淨寬 = gateClear（無物件）
 *   pierRight  門柱   pierLeft 對 x 軸的鏡射
 *   flankRight 弧牆   flankLeft 對 x 軸的鏡射
 *   shoulderLeft/Right 肩牆 自門柱內端沿 −x 方向、與出口**平行**往內庭延伸
 *
 * 另外掛在同一條軸線上（同樣三路共用、只差旋轉）：
 *   tower  高地塔站位（距 C = towerR，正對門心）
 *   ramp / corridor / exit line 的中心線都是這條 +x 軸
 */
export function buildBaseExitWallModule(G = BASE_GEO) {
  const r = G.rimR;
  const dTheta = angStep(r, G.rimStep);
  const gateHalf = G.gateClear / 2;
  const pierY = gateHalf + G.pierArc / 2;                 // 門柱中心的側向偏移
  const pierX = Math.sqrt(Math.max(0, r * r - pierY * pierY)); // 門柱站在城牆圓上
  const flankA = Math.asin(Math.min(1, (gateHalf + G.pierArc) / r));
  const half = flankA + G.flankSegs * dTheta;             // 模組半張角
  return {
    rimR: r,
    dTheta,
    flankA,
    half,
    span: 2 * half,                                       // ＝ 相鄰兩門的等角間距 Δ
    gateClear: G.gateClear,
    towerX: G.towerR,                                     // 高地塔的局部 x（y = 0）
    flank: { segs: G.flankSegs, chord: G.rimStep, thick: G.rimThick, h: HEIGHT.base_rim },
    pier: { x: pierX, y: pierY, len: G.pierRadial, thick: G.pierArc, h: HEIGHT.base_gate },
    shoulder: {
      y: pierY, x0: pierX - G.pierRadial / 2,
      segs: G.shoulderSegs, step: G.rimStep, thick: G.shoulderThick, h: HEIGHT.base_keep,
    },
    //  肩牆最內端的半徑；出口通道在內庭的轉折點放在它再往內 2 的地方
    innerX: pierX - G.pierRadial / 2 - G.shoulderSegs * G.rimStep,
    parts: ["flankLeft", "pierLeft", "gate", "pierRight", "flankRight",
      "shoulderLeft", "shoulderRight"],
  };
}

/** 一方基地的骨架（平台中心、扇形中軸、三個門的方位與軸線上的關鍵點）。 */
function frameFor(b, cx, cy, towerBearings, M, G) {
  const A0 = Math.atan2(cy - b.y, cx - b.x);
  const C = { x: b.x + Math.cos(A0) * G.offsetToCenter, y: b.y + Math.sin(A0) * G.offsetToCenter };
  //  依「自平台中心看出去的方位」排序三路，再用 minimax 求 φ0：
  //  vals[i] = 塔方位 − (i−1)Δ ⇒ φ0 取極值中點，最大角差 = (max−min)/2。
  const lanes = LANES
    .map((ln) => ({ lane: ln, bearing: nearAng(towerBearings[ln], A0) }))
    .sort((p, q) => p.bearing - q.bearing);
  const vals = lanes.map((e, i) => e.bearing - (i - 1) * M.span);
  const phi0 = (Math.min(...vals) + Math.max(...vals)) / 2;
  const maxDev = Math.max(...vals.map((v) => Math.abs(v - phi0)));

  const exits = lanes.map((e, i) => {
    const bearing = phi0 + (i - 1) * M.span;
    const at = (t) => ({ x: C.x + Math.cos(bearing) * t, y: C.y + Math.sin(bearing) * t });
    const tower = at(G.towerR);
    return {
      lane: e.lane, bearing,
      bend: at(M.innerX - 2),          // 內庭轉折點（肩牆內端再往內 2）
      gate: at(G.rimR),                // 門心（城牆中心線上）
      tower,                           // 高地塔站位（門軸上，距 C = towerR）
      outer: at(G.towerR + 10),        // 塔再往外 10：道路離開基地的方向
    };
  });
  return { base: b, center: C, axis: A0, fanAxis: phi0, maxDev, module: M, exits };
}

/**
 * 兩方基地骨架。**藍方算一次，紅方一律由藍方繞地圖中心 180° 鏡射**
 * ⇒ 兩邊的門方位 / 塔站位逐點互為鏡射，不是「各自算完剛好一樣」。
 *
 * @param L         buildMobaLayout() 輸出
 * @param towerPlan buildTowerPlan() 輸出（laneTowers；只讀高地塔的方位）
 */
export function buildBaseFan(L, towerPlan, G = BASE_GEO) {
  const cx = L.bounds.centerX, cy = L.bounds.centerY;
  const M = buildBaseExitWallModule(G);
  const b = L.bases.blue;
  const A0 = Math.atan2(cy - b.y, cx - b.x);
  const C0 = { x: b.x + Math.cos(A0) * G.offsetToCenter, y: b.y + Math.sin(A0) * G.offsetToCenter };
  const towerBearings = {};
  for (const ln of LANES) {
    const t = towerPlan.find((x) => x.side === "blue" && x.lane === ln && x.kind === "highground");
    towerBearings[ln] = Math.atan2(t.y - C0.y, t.x - C0.x);
  }
  const blue = frameFor(b, cx, cy, towerBearings, M, G);
  const mp = (p) => ({ x: 2 * cx - p.x, y: 2 * cy - p.y });
  const red = {
    base: mp(blue.base), center: mp(blue.center),
    axis: blue.axis + Math.PI, fanAxis: blue.fanAxis + Math.PI,
    maxDev: blue.maxDev, module: M,
    exits: blue.exits.map((e) => ({
      lane: MIRROR[e.lane], bearing: e.bearing + Math.PI,
      bend: mp(e.bend), gate: mp(e.gate), tower: mp(e.tower), outer: mp(e.outer),
    })),
  };
  return { blue, red, module: M };
}

/**
 * 把三座高地塔的**呈現座標**貼到自己那個門的軸線上（距平台中心 = towerR）。
 *
 * 這是本輪讓「塔看起來不歪」的關鍵：貼完之後三座塔在模組局部座標裡是同一點
 * (towerR, 0)，與門心、門柱、翼牆、肩牆的相對位置三路完全相同。
 *
 * ⚠ 只改 x / y / distToOwnBase / distToCenter；sim{t,x,y}（gameData 模擬座標）不動。
 * ⚠ 直接修改傳入的 towerPlan 陣列元素（呼叫端在 buildTowerPlan 之後、
 *   建立基地與道路之前呼叫一次）。
 *
 * @returns buildBaseFan() 的結果（供呼叫端直接使用，不必再算一次）
 */
export function alignHighgroundTowers(L, towerPlan, G = BASE_GEO) {
  const fan = buildBaseFan(L, towerPlan, G);
  const cx = L.bounds.centerX, cy = L.bounds.centerY;
  for (const side of ["blue", "red"]) {
    const b = L.bases[side];
    for (const e of fan[side].exits) {
      const t = towerPlan.find((x) => x.side === side && x.lane === e.lane && x.kind === "highground");
      if (!t) continue;
      t.x = e.tower.x; t.y = e.tower.y;
      t.distToOwnBase = Math.hypot(t.x - b.x, t.y - b.y);
      t.distToCenter = Math.hypot(t.x - cx, t.y - cy);
      t.alignedToGate = true;
    }
  }
  return fan;
}

export { LANES as BASE_LANES, MIRROR as BASE_MIRROR_LANE };
