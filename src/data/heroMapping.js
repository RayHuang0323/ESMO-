// ============================================================================
//  data/heroMapping.js  —  Hero Mapping Layer（身份映射層）
//  將 LogicEngine 的「以位置區分的 10 名玩家」對應到 CHAMPIONS_100 的一位英雄。
//
//  設計原則：
//   - 純函式、零相依（除了讀 CHAMPIONS_100）；不 import React / three / zustand。
//   - 只提供「身份」：名稱、（未來）頭像、（未來）技能資訊。
//   - 不接觸任何戰鬥數值，不影響 LogicEngine / snapshot / 模擬行為。
//   - 決定性：相同 (players, seed) → 相同結果；同場不重複；位置與路線吻合。
//
//  使用：開局時 assignRoster(boot.players, seed) → 存入 store.roster；
//        view 以 getHero(roster, playerId) 讀取身份（名稱等）。
// ============================================================================

import { CHAMPIONS_100 } from "./heroes.js";

// 位置（gameData ROLES 英文）→ 英雄名單的路線（CHAMPIONS_100 的 lane 中文）
export const ROLE_TO_LANE = {
  top: "上路",
  jungle: "打野",
  mid: "中路",
  adc: "下路",
  sup: "輔助",
};

// 預先建好各路線英雄池（依 lane 分組；不改動原資料）
const POOL_BY_LANE = CHAMPIONS_100.reduce((acc, c) => {
  (acc[c.lane] ||= []).push(c);
  return acc;
}, {});

// 與 LogicEngine 同款的 LCG，確保決定性且與引擎風格一致
function makeRng(seed) {
  let x = (seed | 0) || 1;
  return () => ((x = (x * 1664525 + 1013904223) & 0xffffffff) >>> 0) / 0xffffffff;
}

/**
 * 為一組玩家指派英雄身份。
 * @param {Array<{id:string, role:string, side?:string}>} players  通常來自 snapshot.players 或 engine.players
 * @param {number} seed  決定性種子（建議傳入與該場 LogicEngine 相同的 seed）
 * @returns {Object<string, object>}  { [playerId]: championObject }（championObject 為 CHAMPIONS_100 的元素淺拷貝）
 */
export function assignRoster(players, seed = 1) {
  const rng = makeRng(seed);
  // 複製各路線池，邊指派邊移除 → 同場不重複
  const pools = {};
  for (const lane in POOL_BY_LANE) pools[lane] = POOL_BY_LANE[lane].slice();

  const roster = {};
  for (const p of players) {
    const lane = ROLE_TO_LANE[p.role];
    const pool = pools[lane];
    let champ;
    if (pool && pool.length) {
      champ = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    } else {
      // 防禦性後備（理論上不會發生：每路線 20 位、每場每路線僅需 2 位）
      champ = CHAMPIONS_100[Math.floor(rng() * CHAMPIONS_100.length)];
    }
    roster[p.id] = { ...champ };
  }
  return roster;
}

// ── 讀取輔助（view / UI 使用）────────────────────────────────────────────────
export function getHero(roster, playerId) {
  return (roster && roster[playerId]) || null;
}

export function heroName(roster, playerId, lang = "zh") {
  const h = getHero(roster, playerId);
  if (!h) return "";
  return lang === "en" ? h.en : h.zh;
}
