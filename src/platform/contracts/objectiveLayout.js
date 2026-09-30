// ============================================================================
//  platform/contracts/objectiveLayout.js — Objective Layout Variant 契約（moba-sim.v16）
//
//  【為什麼要有】Objective Access Symmetry Audit（2026-09-30）：
//    180° 旋轉地圖＋己方視角路線（P0-A）⇒ 巨龍坑緊鄰藍方雙人路、巴龍坑緊鄰紅方雙人路。
//    兩個鏡像坑放的是不同物件 ⇒ 固定配置下藍方第一條巨龍 79%、紅方第一條巴龍 75%。
//    Owner 決策（方案 B）：**每場開局決定一次 Objective Layout，整場固定**。
//      STANDARD ＝巨龍在下方坑（PITS.dragon）、巴龍在上方坑（PITS.baron）——既有配置
//      SWAPPED  ＝兩者交換
//    兩坑的 gameplay 腳印已統一（mapTerrainShapes 的 PIT_FOOTPRINT），所以兩種配置的
//    碰撞／導航完全相同，差別只在「哪個物件在哪個坑」。
//
//  【權威流向】Match config（useLocalServer.start 的唯一推導點）→ LogicEngine.configureObjectiveLayout
//    → snapshot.objectiveLayout → 小地圖／物件 UI／3D 地形視覺／導播／戰報／Replay（replay.objectiveLayout）。
//    AI 在引擎內一律經 `_pitOf()` 取坑位。
//  ⚠ 下游**一律讀欄位**，不得各自用 seed 推導——推導只在開局做一次。
//  ⚠ 缺欄位（舊 snapshot／舊 replay／舊存檔）一律視為 STANDARD（向下相容）。
//  ⚠ 引擎 seed 在正式流程一律被正規化成奇數（`| 1`），所以**不能**用 seed 奇偶，
//    改用雜湊後的位元（決定性、與其他以 seed 驅動的系統去相關）。
// ============================================================================
import { PITS } from "../../gameData.js";

export const OBJECTIVE_LAYOUT = Object.freeze({ STANDARD: "STANDARD", SWAPPED: "SWAPPED" });
export const OBJECTIVE_LAYOUTS = Object.freeze([OBJECTIVE_LAYOUT.STANDARD, OBJECTIVE_LAYOUT.SWAPPED]);

/** 不明／缺值 ⇒ STANDARD（舊資料向下相容）。 */
export function normalizeObjectiveLayout(v) {
  return v === OBJECTIVE_LAYOUT.SWAPPED ? OBJECTIVE_LAYOUT.SWAPPED : OBJECTIVE_LAYOUT.STANDARD;
}

/** murmur3 fmix32：把 seed 打散後取一個位元（對兩邊期望值相同，不是單邊加成）。 */
function mix32(x) {
  let h = (x ^ 0x4f626a4c) >>> 0;   // 常數＝"Objl"：與其他以 seed 派生的雜湊去相關
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/** 由 match seed 決定本場配置。**只在開局呼叫一次**（Match config 推導點），結果要存成欄位往下傳。 */
export function objectiveLayoutForSeed(seed) {
  return (mix32(Number(seed) >>> 0) & 1) ? OBJECTIVE_LAYOUT.SWAPPED : OBJECTIVE_LAYOUT.STANDARD;
}

/** 開局推導：明確指定的值優先（例如恢復進行中的場次、重播），否則由 seed 推導。 */
export function resolveObjectiveLayout({ explicit = null, seed } = {}) {
  if (explicit === OBJECTIVE_LAYOUT.STANDARD || explicit === OBJECTIVE_LAYOUT.SWAPPED) return explicit;
  return objectiveLayoutForSeed(seed);
}

//  物件→坑位座標。回傳**固定的物件參照**（PITS 本身的 dragon／baron 物件），
//  引擎以參照比對判斷熱點是不是大型物件坑，STANDARD 因此與舊版逐位元相同。
const PITS_BY_LAYOUT = Object.freeze({
  [OBJECTIVE_LAYOUT.STANDARD]: Object.freeze({ dragon: PITS.dragon, baron: PITS.baron }),
  [OBJECTIVE_LAYOUT.SWAPPED]: Object.freeze({ dragon: PITS.baron, baron: PITS.dragon }),
});

/** 某配置下，巨龍／巴龍各在哪個坑（模擬座標）。 */
export function objectivePitsFor(layout) {
  return PITS_BY_LAYOUT[normalizeObjectiveLayout(layout)];
}

/** 呈現層便利函式：從 snapshot／frame／replay 讀配置（缺值 ⇒ STANDARD）。 */
export function objectiveLayoutOf(source) {
  return normalizeObjectiveLayout(source?.objectiveLayout);
}

/** 呈現層便利函式：直接取某物件在這一場的坑位。 */
export function objectivePitOf(source, key) {
  return objectivePitsFor(objectiveLayoutOf(source))[key] ?? null;
}
