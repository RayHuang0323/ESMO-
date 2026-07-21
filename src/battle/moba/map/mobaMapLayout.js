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
  // 防禦塔：3 路 × 2 方 × 3 座（外/二/高地）＝18，＋2 主堡（Nexus，位於 BASE）＝20，
  // 與 src/LogicEngine.js 的建構方式一致（TOWER_T 沿 lane 的 t → posOnLane）。
  const towers = [];
  for (const lane of ["top", "mid", "bot"]) {
    for (const side of ["blue", "red"]) {
      TOWER_T[side].forEach((t, tier) => {
        const p = posOnLane(lane, t);
        towers.push({
          id: `${side}_${lane}_${tier}`, side, lane, tier,
          x: p.x, y: p.y,
          kind: tier === 0 ? "outer" : tier === 1 ? "inner" : "highground",
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
