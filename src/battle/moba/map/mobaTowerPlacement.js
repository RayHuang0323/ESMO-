// ============================================================================
//  battle/moba/map/mobaTowerPlacement.js — 防禦塔位置的**單一真實來源**（Milestone H.2）
//
//  【H.2 之前的問題】同一座塔有兩個位置：
//     · 模擬位置：`posOnLane(lane, TOWER_T[side][tier])`（LogicEngine 用它算推塔／塔攻擊）
//     · 呈現位置：`mapTerrainShapes` 的 `T.towers[].x/y`（Renderer 畫在這裡，
//       G.15 把它對齊到城門軸線與塔基）
//   兩者實測平均差 15.4 單位、最大 25.7，而推塔判定距離只有 9
//   ⇒ **18 座塔裡有 12 座「站在看得見的塔旁邊卻推不到」**。
//   H.1 時這只是資料不一致；H.2 把塔加進碰撞之後，它會讓比賽推不完
//   （實測結束率從 40/40 掉到 12/15）。
//
//  H.2 起：**只有一個塔位** = 地圖的呈現座標。引擎、碰撞、Renderer 全部讀本檔。
//
//  ── 沿路參數 t 怎麼來 ────────────────────────────────────────────────────
//  `t` 只剩一個用途：小兵攻塔的沿路區間判定（`|m.t − tw.t| ≤ minionSiegeBand`）。
//  實測塔幾乎正好落在模擬 lane 折線上（側偏最大 6.0，多數 < 0.5）
//  ⇒ 取「lane 折線上離塔最近的點」的參數即可，小兵與塔仍在同一條路上。
//
//  ── 為什麼還要對稱化 ─────────────────────────────────────────────────────
//  地圖 180° 旋轉會**交換上下路**（`mirror(top,t) == (bot,1−t)`，mid 自我對映），
//  所以真正的鏡像配對是 `blue_top_i ↔ red_bot_i`，不是同一條路的 blue↔red。
//  塔的呈現座標本身已經是精確鏡像（實測誤差 0），但 `gameData.LANES` 的上下路折線
//  彼此有最大 5.66 的不對稱 ⇒ 直接量出來的 t 會有 ~0.01–0.02 的偏差。
//  這裡把每一組鏡像配對強制成 `t_a + t_b = 1`，讓雙方的「小兵攻塔區間」完全公平。
//
//  ⚠ 純資料、純函式；不 import 引擎、不用 Math.random ⇒ 決定性。
//  ⚠ 主堡位置未變（仍是 `BASE[side]`，本來就與呈現一致）。
// ============================================================================
import { posOnLane } from "../../../gameData.js";
import { buildMobaLayout } from "./mobaMapLayout.js";
import { buildTerrainShapes } from "./mapTerrainShapes.js";

/** 180° 旋轉下的對應路線（上下路互換、中路自我對映）。 */
const MIRROR_LANE = { top: "bot", bot: "top", mid: "mid" };

/** 折線上離 p 最近的點的參數（等距取樣 + 局部細分，決定性）。 */
function nearestLaneT(lane, p) {
  let bt = 0, bd = Infinity;
  const scan = (lo, hi, steps) => {
    for (let i = 0; i <= steps; i++) {
      const t = lo + ((hi - lo) * i) / steps;
      const q = posOnLane(lane, t);
      const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
      if (d < bd) { bd = d; bt = t; }
    }
  };
  scan(0, 1, 400);
  scan(Math.max(0, bt - 0.005), Math.min(1, bt + 0.005), 40);
  return bt;
}

let _cache = null;

/**
 * @returns {{ byId: Object, list: Array, guardById: Object, nexusGuards: Array }}
 *   byId[id] = { id, side, lane, tier, x, y, t, laneOffset }
 *   laneOffset = 塔離 lane 折線的側偏（模擬單位；驗收用，證明塔仍在路上）
 */
export function buildTowerPlacement() {
  if (_cache) return _cache;
  const T = buildTerrainShapes(buildMobaLayout());

  const raw = new Map();
  for (const tw of T.towers) {
    const t = nearestLaneT(tw.lane, tw);
    const q = posOnLane(tw.lane, t);
    raw.set(tw.id, {
      id: tw.id, side: tw.side, lane: tw.lane, tier: tw.tier,
      x: tw.x, y: tw.y, tRaw: t,
      laneOffset: Math.hypot(q.x - tw.x, q.y - tw.y),
    });
  }

  //  鏡像配對對稱化：blue_L_i ↔ red_(mirror L)_i ⇒ 強制 t_a + t_b = 1
  const byId = {};
  for (const lane of ["top", "mid", "bot"]) {
    for (let tier = 0; tier < 3; tier++) {
      const a = raw.get(`blue_${lane}_${tier}`);
      const b = raw.get(`red_${MIRROR_LANE[lane]}_${tier}`);
      if (!a || !b) continue;
      const tA = (a.tRaw + (1 - b.tRaw)) / 2;
      byId[a.id] = { ...a, t: tA };
      byId[b.id] = { ...b, t: 1 - tA };
    }
  }
  //  萬一有沒配到對的（未來新增塔），照原值收下，不靜默丟掉
  for (const [id, v] of raw) if (!byId[id]) byId[id] = { ...v, t: v.tRaw };

  // D-fix3：地圖本來就有雙方各兩座門牙塔；另外輸出正式錨點給引擎，
  // 但不混進 `list`（該 list 的既有契約是 18 座兵線塔，nav verifier 會逐座
  // 反算 lane t）。門牙塔沒有單一路線 t，攻城順序由 LogicEngine 管理。
  const guardById = Object.fromEntries((T.nexusTurrets ?? []).map((tw) => [tw.id, {
    id: tw.id, side: tw.side, lane: "nexus_guard", tier: tw.tier,
    x: tw.x, y: tw.y,
  }]));
  _cache = {
    byId, list: Object.values(byId),
    guardById, nexusGuards: Object.values(guardById),
  };
  return _cache;
}

/** 引擎建塔用：id → { x, y, t }。 */
export function towerPlacementById(id) {
  return buildTowerPlacement().byId[id] ?? null;
}

/** D-fix3：門牙塔資料錨點；仍由 mapTerrainShapes 的正式 tower plan 產生。 */
export function nexusGuardPlacementById(id) {
  return buildTowerPlacement().guardById[id] ?? null;
}
