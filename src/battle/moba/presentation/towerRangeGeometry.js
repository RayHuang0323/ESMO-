// ============================================================================
//  presentation/towerRangeGeometry.js — 射程 → 畫面半徑的**唯一換算**（M1.6）
//
//  抽成純資料模組的理由：verifier（node，不吃 .jsx）必須讀到和渲染層**同一份**
//  換算，才能斷言「引擎判定 == 射程圈」。放在 .jsx 裡就只有瀏覽器讀得到。
// ============================================================================
import { WORLD_SCALE } from "../map/coordinateMapping.js";
import { SIM_RULES } from "../matchProgression.js";

/** 路上塔的射程圈半徑（three.js 單位）。 */
export const towerRangeWorld = (rules = SIM_RULES.v3) => (rules?.towerAggroRange ?? 5.5) * WORLD_SCALE;

/**
 * **逐座**建築的射程半徑。門牙塔／主堡不在 lane 上，用自己的 `nexusGuardRange`，
 * 與引擎的 `LogicEngine.towerRange()` 是同一條規則。
 * M1.6 之前一律畫 `towerAggroRange`，門牙塔的圈因此只有實際範圍的一半不到。
 */
export const structureRangeWorld = (lane, rules = SIM_RULES.v3) =>
  ((lane === "nexus_guard" || lane === "nexus")
    ? (rules?.nexusGuardRange ?? 13) : (rules?.towerAggroRange ?? 5.5)) * WORLD_SCALE;
