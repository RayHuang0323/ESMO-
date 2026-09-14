// ============================================================================
//  battle/moba/items/combatStatsV1.js — CombatStatsV1 純函式（M1）
//
//  契約：docs/architecture/MOBA_戰鬥屬性契約_v1.md §2–§3。
//  inventory ＋ 目錄 ⇒ 凍結的 CombatStatsV1。M1 不接引擎、不改 power／tough。
//
//  【硬規則】純函式：同輸入必得同輸出；不改輸入；不讀時間；不用亂數；
//    不 import React／store／LogicEngine。
// ============================================================================
import { ITEM_CATALOG, LAUNCH_BATCH, STAT_KEYS, batchAllows, getItem } from "./itemCatalog.js";
import { effectGroupKey, effectStrength } from "./itemEffectKeys.js";

export const COMBAT_STATS_SCHEMA = "CombatStatsV1";

/** 契約 §2 常數（草案，M3 校準前不得視為定案）。 */
export const COMBAT_CONSTANTS = Object.freeze({
  K_AD: 100,
  K_AP: 150,
  R_ABILITY_AD: 0.6,
  R_ATTACK_AP: 0.3,
  CRIT_BASE: 1.75,
  AH_CAP: 60,
  ONHIT_BASE_RATE: 1.0,
  RESIST_K: 100,
});

/** 英雄主定位 → 傷害 profile（契約 §3）。 */
export const ARCHETYPES = Object.freeze(["坦克", "戰士", "刺客", "法師", "射手", "輔助"]);
export const DAMAGE_PROFILE_BY_ARCH = Object.freeze({
  坦克: Object.freeze({ phys: 0.70, magic: 0.30, attack: 0.50, ability: 0.50 }),
  戰士: Object.freeze({ phys: 0.85, magic: 0.15, attack: 0.55, ability: 0.45 }),
  刺客: Object.freeze({ phys: 0.80, magic: 0.20, attack: 0.35, ability: 0.65 }),
  法師: Object.freeze({ phys: 0.05, magic: 0.95, attack: 0.20, ability: 0.80 }),
  射手: Object.freeze({ phys: 0.90, magic: 0.10, attack: 0.80, ability: 0.20 }),
  輔助: Object.freeze({ phys: 0.30, magic: 0.70, attack: 0.30, ability: 0.70 }),
});

/** 四通道權重（總和 = 1）。 */
export function channelWeights(profile) {
  return {
    wPA: profile.phys * profile.attack,
    wPB: profile.phys * profile.ability,
    wMA: profile.magic * profile.attack,
    wMB: profile.magic * profile.ability,
  };
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}


/**
 * @param itemIds  背包格內容（可含 null）；順序即格位順序
 * @param opts.batch   啟用批次（v1.0 只允許 1.0 物品與 1.0 效果）
 * @returns 凍結的 CombatStatsV1；含 v1.x 物品時丟出錯誤（不默默忽略）
 */
export function computeCombatStats(itemIds, { catalog = ITEM_CATALOG, batch = LAUNCH_BATCH } = {}) {
  const sums = Object.fromEntries(STAT_KEYS.map((k) => [k, 0]));
  const byGroup = new Map();
  const order = [];
  let count = 0;
  for (const id of itemIds) {
    if (id === null || id === undefined) continue;
    const it = getItem(id, catalog);
    if (!it) throw new Error(`CombatStatsV1：未知物品 ${id}`);
    if (!batchAllows(it.batch, batch)) throw new Error(`CombatStatsV1：${id} 屬批次 ${it.batch}，目前批次 ${batch}`);
    count++;
    for (const [k, v] of Object.entries(it.stats)) {
      if (!STAT_KEYS.includes(k)) throw new Error(`CombatStatsV1：${id} 有未知屬性 ${k}`);
      sums[k] += v;
    }
    for (const effect of it.effects) {
      if (!batchAllows(effect.batch ?? it.batch, batch)) continue;
      //  效果去重看效果語意，不看物品 unique（unique 只管背包合法性）。
      const key = effectGroupKey(effect);
      const prev = byGroup.get(key);
      if (!prev) { byGroup.set(key, effect); order.push(key); }
      else if (effectStrength(effect) > effectStrength(prev)) byGroup.set(key, effect);
    }
  }
  const K = COMBAT_CONSTANTS;
  return deepFreeze({
    schema: COMBAT_STATS_SCHEMA,
    batch,
    itemCount: count,
    isEmpty: count === 0,
    hp: sums.hp,
    ad: sums.ad,
    ap: sums.ap * (1 + sums.apAmp),
    armor: sums.armor,
    mr: sums.mr,
    attackSpeed: sums.attackSpeed,
    critChance: Math.min(1, sums.critChance),
    critDamage: K.CRIT_BASE + sums.critDamageAmp,
    abilityHaste: sums.abilityHaste,
    moveSpeed: sums.moveSpeed,
    armorPenFlat: sums.armorPenFlat,
    armorPenPct: Math.min(1, sums.armorPenPct),
    magicPenFlat: sums.magicPenFlat,
    magicPenPct: Math.min(1, sums.magicPenPct),
    lifesteal: sums.lifesteal,
    omnivamp: sums.omnivamp,
    healShieldPower: sums.healShieldPower,
    regenPctPerSec: sums.regenPctPerSec,
    effects: order.map((k) => byGroup.get(k)),
  });
}
