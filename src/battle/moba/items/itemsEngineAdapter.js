// ============================================================================
//  battle/moba/items/itemsEngineAdapter.js — roster → engine.configureItems 的唯一形狀轉換點（M2）
//
//  沿用 toEngineHeroMods／toEngineArchetypes／toEngineSpells 的慣例：
//   · 引擎不 import heroDatabase、不認得 heroId；形狀由呼叫端準備。
//   · 資料缺漏 ⇒ 決定性 fallback（不使用亂數）；沒有 roster ⇒ 回 null ⇒ 不呼叫 ⇒ legacy 逐位元不變。
//  ⚠ M2 沒有任何正式流程呼叫本檔（只有驗證工具與 DEV Item Inspector）。
// ============================================================================
import { correctedArch } from "../../../data/heroClassification.js";
import { BUILD_STRATEGIES } from "./buildPolicy.js";

export const ITEMS_ENGINE_CONFIG_VERSION = "moba-items.engine-config.v1";

/** 治療型英雄的技能語彙（敵方治療 profile 用；與 heroClassification 的輔助語彙同源）。 */
const HEAL_RX = /治療|復甦|庇護|回復|吸取/;

const skillText = (hero) => [hero?.P, hero?.Q, hero?.W, hero?.E, hero?.R]
  .map((s) => (typeof s === "string" ? s : s?.name ?? ""))
  .join(" ");

/**
 * @param roster      { [playerId]: { heroId } }
 * @param heroLookup  heroId → hero（通常是 heroDatabase.heroById）
 * @param strategies  { [playerId]: strategy }（未指定 ⇒ defaultStrategy）
 * @returns {{ players, meta } | null}
 */
export function toEngineItems({ roster, heroLookup, strategies = {}, defaultStrategy = "standard" } = {}) {
  if (!roster || typeof heroLookup !== "function") return null;
  const players = {};
  for (const [pid, entry] of Object.entries(roster)) {
    const hero = entry?.heroId ? heroLookup(entry.heroId) : null;
    const strategy = strategies[pid] ?? defaultStrategy;
    players[pid] = {
      heroId: entry?.heroId ?? null,
      arch: hero ? correctedArch(hero) : null,
      healer: hero ? HEAL_RX.test(skillText(hero)) : false,
      strategy: BUILD_STRATEGIES.includes(strategy) ? strategy : "standard",
    };
  }
  return Object.keys(players).length ? { players, meta: { version: ITEMS_ENGINE_CONFIG_VERSION } } : null;
}
