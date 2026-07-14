// ============================================================================
//  talents/playerDerivedStats.js — 選手衍生能力（Sprint27，純函式）
//
//  分層原則：base stats **永不被天賦寫入**。
//    base（訓練系統 applyCourse 直接管理、受 potential 上限）
//      + talent bonus（本檔，由 ranks × effects 推導）
//      = derived stats（clamp 1–99）→ 給消費端（CS 引擎 adapter / MOBA adapter /
//        戰術適性 / 顯示層）。
//    個性(personality)與狀態(morale/condition)修正**不在這裡**——它們由
//    calcPower / FPS 引擎 persStat 在自己那層套用（現況即如此，不重複套）。
//    資料結構已保留擴充位：getStatLayers 回傳 {base, talentBonus, derived}，
//    未來加 training/condition 層只加欄位，不改呼叫端。
//
//  保證：純函式、不改傳入 player、無天賦時 derived === base（逐鍵相等）、
//  損壞 talent state 安全降級（sanitizeTalents）。
// ============================================================================
import { STAT_DEF } from "../../data/playerModel.js";
import { talentById } from "./talentDefinitions.js";
import { sanitizeTalents } from "../contracts/playerTalentState.js";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const STAT_KEYS = STAT_DEF.map((s) => s.key);

/** ranks → 每項能力的天賦加成 { statKey: bonus }（只含 >0 的鍵）。 */
export function getTalentStatBonuses(rawTalents) {
  const { ranks } = sanitizeTalents(rawTalents);
  const bonus = {};
  for (const [id, rank] of Object.entries(ranks)) {
    const def = talentById(id);
    if (!def) continue;
    for (const e of def.effects) {
      if (!STAT_KEYS.includes(e.stat)) continue;   // 防禦：未知鍵不落地
      bonus[e.stat] = (bonus[e.stat] ?? 0) + e.perRank * rank;
    }
  }
  return bonus;
}

/**
 * base + talent → derived stats（16 鍵齊全；clamp 1–99；不修改輸入）。
 * 無天賦（ranks 空）→ 輸出與 player.stats 逐鍵相等。
 */
export function getPlayerDerivedStats(player) {
  const base = player?.stats ?? {};
  const bonus = getTalentStatBonuses(player?.talents);
  const out = { ...base };
  for (const k of Object.keys(bonus)) {
    out[k] = clamp((Number.isFinite(base[k]) ? base[k] : 50) + bonus[k], 1, 99);
  }
  return out;
}

/** UI 顯示用分層視圖：{ base, talentBonus, derived }（未來擴充 training/condition 層）。 */
export function getStatLayers(player) {
  return {
    base: { ...(player?.stats ?? {}) },
    talentBonus: getTalentStatBonuses(player?.talents),
    derived: getPlayerDerivedStats(player),
  };
}

/**
 * 消費端便利包裝：回傳「stats 換成 derived」的選手複本（不動原物件）。
 * calcPower / posFit / fpsRoster / mobaRosterAdapter 等吃 player.stats 的
 * 既有函式，經此包裝即可拿到含天賦的能力，零改動自身簽名。
 */
export function withDerivedStats(player) {
  if (!player) return player;
  return { ...player, stats: getPlayerDerivedStats(player) };
}
