// ============================================================================
//  battle/moba/map/mobaMapLayout.js — MOBA 地圖結構資料（Milestone D）
//
//  ⚠ 全部座標直接取自 src/gameData.js（模擬唯一真相來源），塔位置以與 LogicEngine
//    相同的公式（TOWER_T × posOnLane）推導。**不複製、不改動任何模擬常數。**
//  純資料（無 THREE/React），renderer 與 verifier 皆可讀取。
// ============================================================================
import {
  BASE, FOUNTAIN, LANES, posOnLane, TOWER_T, PITS, CAMPS, WALLS, BUSHES,
  RIVER, WORLD_BOUNDS,
} from "../../../gameData.js";
import { JUNGLE_QUADRANTS } from "./mapZones.js";

/** 建立完整地圖結構（供 render 與 verifier）。所有 x/y 為模擬邏輯座標。 */
export function buildMobaLayout() {
  // 防禦塔：3 路 × 2 方 × 3 座（高地/內/外）＝18，＋2 主堡（Nexus，位於 BASE）＝20，
  // 與 src/LogicEngine.js 的建構方式一致（TOWER_T 沿 lane 的 t → posOnLane）。
  //
  // ⚠ Milestone G.1 修正「塔的層級命名反了」：
  //   TOWER_T.blue = [0.15, 0.33, 0.48]。t 是「沿 lane 從藍基地往紅基地」的比例，
  //   所以 blue 的 tier 0（t=0.15）**離自己基地最近**（實測 48–56 單位），
  //   tier 2（t=0.48）幾乎在地圖中央（實測 88–123 單位）。
  //   LogicEngine.frontTower 也是 **依 t 排序**（不看 tier 索引）決定先打哪座 ⇒
  //   進攻方一定先碰到 tier 2。也就是說：
  //     tier 2 = 外塔（一塔，最外圍）／ tier 1 = 內塔（二塔）／ tier 0 = 高地塔（最靠基地）。
  //   舊版把 tier 0 標成 "outer"、tier 2 標成 "highground"，畫面上等於把最大的高地塔
  //   擺在地圖中央、最小的外塔擺在基地門口，MOBA 的空間層級整個讀反。
  //   本檔只改「呈現用的 kind 標籤」，不改任何模擬常數與 tier 索引。
  const KIND_BY_TIER = ["highground", "inner", "outer"];
  const towers = [];
  for (const lane of ["top", "mid", "bot"]) {
    for (const side of ["blue", "red"]) {
      TOWER_T[side].forEach((t, tier) => {
        const p = posOnLane(lane, t);
        towers.push({
          id: `${side}_${lane}_${tier}`, side, lane, tier, t,
          x: p.x, y: p.y,
          kind: KIND_BY_TIER[tier] ?? "outer",
        });
      });
    }
  }
  towers.push({ id: "blue_nexus", side: "blue", lane: "nexus", tier: 9, x: BASE.blue.x, y: BASE.blue.y, kind: "nexus" });
  towers.push({ id: "red_nexus", side: "red", lane: "nexus", tier: 9, x: BASE.red.x, y: BASE.red.y, kind: "nexus" });

  return {
    bounds: WORLD_BOUNDS,
    bases: { blue: { ...BASE.blue }, red: { ...BASE.red } },
    fountains: { blue: { ...FOUNTAIN.blue }, red: { ...FOUNTAIN.red } },
    lanes: {
      top: LANES.top.map((p) => ({ ...p })),
      mid: LANES.mid.map((p) => ({ ...p })),
      bot: LANES.bot.map((p) => ({ ...p })),
    },
    towers,
    pits: { dragon: { ...PITS.dragon }, baron: { ...PITS.baron } },
    camps: CAMPS.map((c) => ({ id: c.id, side: c.side, type: c.type, x: c.x, y: c.y })),
    walls: WALLS.map((w) => ({ ...w })),
    bushes: BUSHES.map((b) => ({ ...b })),
    river: { width: RIVER.width, points: RIVER.points.map((p) => ({ ...p })) },
    quadrants: JUNGLE_QUADRANTS.map((q) => ({ ...q })),
  };
}
