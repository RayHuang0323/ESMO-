// ============================================================================
//  battle/moba/map/mapBushCover.js — 草叢 / Cover 的低模團塊（Milestone G.6）
//
//  【要解決的問題】從 G.1 到 G.4，每一輪的「下一輪建議」都寫著同一句話：
//    「gameData.BUSHES 的 12 個草叢仍完全沒有呈現」。野區因此少了 MOBA 最重要的
//    一種閱讀語言——**可藏人的視野遮蔽**。畫面上只有牆與空地，沒有「草」。
//
//  【G.6 的草叢語言】草叢不是一片平塗綠色，而是**一團可辨識的低模灌木**：
//    · 每一叢 = 中央大叢 + 4~6 顆小叢（決定性偏移）⇒ 俯視也讀得出團塊，不是圓形貼紙。
//    · 高度刻意壓低（世界高度 2.5~4.5）⇒ 英雄 / 野怪 / 塔一律高過草叢，不會被擋住視線。
//    · 顏色低彩度暗綠，比野區草地再暗一階 ⇒ 讀成「陰影下的灌木」。
//
//  【兩種來源】
//   A. gameData.BUSHES（12 叢，本來就成對鏡射）＝**有模擬實體的視野草叢**。
//      這些是引擎真的拿來算視野的草叢，全部保留、不過濾。
//   B. 呈現用 cover（isPresentation:true）＝補在「河道邊 / 路口 / 野區入口 / 後野」
//      的遮蔽節點，讓野區的路線網讀得出「哪裡可以埋伏、哪裡是進出口」。
//      藍方解一組、紅方一律 180° 鏡射 ⇒ 不製造單邊差異。呈現用 cover **沒有模擬實體**。
//
//  ⚠ 草叢是**可穿越**的（本來就是拿來走進去躲的），所以它不是量體、不進 wallItems、
//    不當障礙。但呈現用 cover 的中心仍不得落在路面 / 出口通道 / 水面 / 基地平台上
//    （會看起來像「路中間長了一叢擋路的草」）——這層過濾在 mapTerrainShapes 做。
//  ⚠ 純資料、無 THREE/React、不使用 Math.random()（形狀必須每次相同）。
//  ⚠ 不改 gameData.js、不改任何模擬常數、不新增任何模擬實體。
// ============================================================================
import { BUSHES, WORLD_SIZE } from "../../../gameData.js";
import { hash01, TAU } from "./mapShapePrimitives.js";

/** 草叢的尺寸慣例（模擬單位；高度為世界單位）。
 *  ⚠ blobHK 刻意壓低：草叢最高的一顆仍必須明顯**低於最矮的野怪**（狼營 top≈5.3），
 *    英雄 / 野怪 / 塔才會一律高過草叢、不被草擋住視線。verifier 有硬門檻把關。 */
export const BUSH_SIZE = Object.freeze({ minBlobs: 4, blobHK: 1.15 });

/**
 * 呈現用 cover（藍方；紅方一律取 (220−x,220−y)）。
 * 座標刻意選在**野區內部、離三路與河道都有一段距離**的乾地，
 * 這樣鏡射後兩側都不會落在路帶／水面上（避免只有單邊被過濾掉、破壞對稱）。
 *
 * G.6 v2：每一叢都對應使用者明列的**一個可讀的戰術遮蔽節點**（category），
 * 讓草叢不是隨機撒點，而是「Buff 旁 / 小野旁 / 河道 / 河口·坑口 / 三角」都各有一叢。
 * 紅方鏡射後，巴龍側（藍）↔ 小龍側（紅）自然對稱，兩坑入口都有埋伏草。
 */
const BLUE_COVER = Object.freeze([
  { key: "tri_top", cat: "tri", x: 46, y: 108, r: 5.0, label: "上路口三角草" }, // 上路 ↔ 野區入口
  { key: "river", cat: "river", x: 62, y: 96, r: 5.0, label: "河道草" },         // 巴龍河臂邊埋伏草
  { key: "pit_mouth", cat: "pit_mouth", x: 50, y: 76, r: 4.8, label: "巴龍口草" }, // 巴龍坑口埋伏草
  { key: "buff", cat: "buff", x: 88, y: 158, r: 5.0, label: "藍 Buff 草" },       // 藍 Buff 營地旁
  { key: "small_camp", cat: "small_camp", x: 58, y: 128, r: 4.6, label: "小野營草" }, // 藍側小野營旁
  { key: "back", cat: "back", x: 36, y: 150, r: 4.4, label: "後野草" },           // G.8：後野（基地側）繞行草
  { key: "raptor_side", cat: "raptor", x: 96, y: 64, r: 4.6, label: "上野伏擊草" }, // G.8：藍上野營地旁伏擊草
]);

const mirror = (p) => ({ x: WORLD_SIZE - p.x, y: WORLD_SIZE - p.y });

/**
 * 一叢草的組成：中央大叢 + n 顆環繞小叢（全部決定性）。
 * 回傳 blobs：{ dx, dy, r, h, lit }，dx/dy/r 為模擬單位、h 為世界高度。
 */
function bushBlobs(r, seed) {
  const n = BUSH_SIZE.minBlobs + Math.round(r / 3); // 半徑越大，叢越多（4~6）
  const out = [];
  // 中央大叢（比周圍略高，讀成草叢的核心隆起）
  const rc = r * 0.52;
  out.push({ dx: 0, dy: 0, r: rc, h: rc * BUSH_SIZE.blobHK, lit: true });
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + (seed % 7) * 0.4;
    const rad = r * (0.44 + hash01(i, seed) * 0.34);
    const rb = r * (0.30 + hash01(i, seed + 5) * 0.18);
    out.push({
      dx: Math.cos(a) * rad, dy: Math.sin(a) * rad,
      r: rb, h: rb * BUSH_SIZE.blobHK, lit: i % 2 === 0,
    });
  }
  return out;
}

/**
 * 佔地半徑（含最外一顆小叢），供過濾與 verifier 判斷「放得下 / 不壓路」。
 */
export function bushReach(cluster) {
  return Math.max(...cluster.blobs.map((b) => Math.hypot(b.dx, b.dy) + b.r));
}

/**
 * 建立所有草叢 cluster（未過濾；過濾在 mapTerrainShapes 依禁區進行）。
 * @param L buildMobaLayout() 的輸出
 * @returns [{ id, x, y, r, isPresentation, blobs }]
 */
export function buildBushCover(L) {
  const out = [];

  // ── A. gameData 的視野草叢（有模擬實體，全部保留）────────────────────────
  BUSHES.forEach((b, i) => {
    out.push({
      id: `bush_gd_${i}`, x: b.x, y: b.y, r: b.r,
      isPresentation: false,
      sim: { x: b.x, y: b.y, r: b.r },
      blobs: bushBlobs(b.r, 200 + i * 7),
    });
  });

  // ── B. 呈現用 cover（補路線網的遮蔽節點；藍解一組、紅鏡射）─────────────────
  BLUE_COVER.forEach((spec, i) => {
    for (const side of ["blue", "red"]) {
      const p = side === "blue" ? { x: spec.x, y: spec.y } : mirror(spec);
      out.push({
        id: `bush_${side}_${spec.key}`, x: p.x, y: p.y, r: spec.r,
        isPresentation: true, sim: null, label: spec.label, side, cat: spec.cat,
        blobs: bushBlobs(spec.r, 400 + i * 11 + (side === "red" ? 3 : 0)),
      });
    }
  });

  return out;
}
