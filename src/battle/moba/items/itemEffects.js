// ============================================================================
//  battle/moba/items/itemEffects.js — 效果 primitive 登記與純計算（M1）
//
//  規格：docs/design/MOBA_裝備系統_v1.md §5、docs/architecture/MOBA_戰鬥屬性契約_v1.md §4。
//  M1 只提供純計算；**沒有任何一個函式接進 LogicEngine**（那是 M2）。
//
//  【硬規則】
//   · 決定性：暴擊、攻速、on-hit 一律期望值；不呼叫任何亂數。
//   · 不讀時間：需要時間的函式由呼叫端傳入 t。
//   · 不改輸入。
// ============================================================================
import { COMBAT_CONSTANTS, channelWeights } from "./combatStatsV1.js";
import { effectGroupKey, effectStrength } from "./itemEffectKeys.js";

/**
 * primitive 登記表。batch = 最早可用的上線批次。
 * LIFESTEAL／OMNIVAMP／STAT_BONUS 以屬性表示（CombatStatsV1 欄位），不會出現在 effects 陣列。
 * ROLE_* 是 starter 專用 primitive（M1 補齊 M0 未命名的 starter 效果）。
 */
export const PRIMITIVES = Object.freeze({
  STAT_BONUS: Object.freeze({ batch: "1.0", statBased: true }),
  LIFESTEAL: Object.freeze({ batch: "1.0", statBased: true }),
  OMNIVAMP: Object.freeze({ batch: "1.0", statBased: true }),
  ON_HIT: Object.freeze({ batch: "1.0" }),
  GRIEVOUS_WOUNDS: Object.freeze({ batch: "1.0" }),
  LOW_HP_SHIELD: Object.freeze({ batch: "1.0" }),
  EXECUTE: Object.freeze({ batch: "1.0" }),
  ANTI_CRIT: Object.freeze({ batch: "1.0" }),
  AURA: Object.freeze({ batch: "1.0" }),
  SLOW_ON_HIT: Object.freeze({ batch: "1.0" }),
  ROLE_CAMP_DAMAGE: Object.freeze({ batch: "1.0" }),
  ROLE_INCOME_TITHE: Object.freeze({ batch: "1.0" }),
  BURN: Object.freeze({ batch: "1.1" }),
  RAMPING_STAT: Object.freeze({ batch: "1.1" }),
  RAMPING_RESIST: Object.freeze({ batch: "1.1" }),
  SUSTAIN_REGEN: Object.freeze({ batch: "1.1" }),
});

/** 延後到 v1.2 以後，目錄不得引用。 */
export const DEFERRED_PRIMITIVES = Object.freeze(["ON_ABILITY_HIT", "SPELL_PROC", "REVIVE", "ACTIVE", "THORNS", "STRUCTURE_DAMAGE"]);

/** 效果去重鍵與強度的唯一實作在 itemEffectKeys.js（這裡轉出，消費端不必知道檔案位置）。 */
export { effectGroupKey, effectStrength } from "./itemEffectKeys.js";

const effectsOf = (cs, type) => (cs?.effects ?? []).filter((e) => e.type === type);

/**
 * 輸出（契約 §4.1）。D0 = LogicEngine 原本的 dmgAmt，一個係數都不改。
 * 零屬性短路：沒有任何裝備 ⇒ 直接依物理／法術占比拆 D0（不做乘法鏈，避免浮點誤差）。
 * @returns {{ phys, magic }}
 */
export function outgoingDamage({ D0, cs, profile, foe = {}, dt = 0, lateFactor = 1 }) {
  const K = COMBAT_CONSTANTS;
  if (!cs || cs.isEmpty) return { phys: D0 * profile.phys, magic: D0 * profile.magic };
  const w = channelWeights(profile);
  const hasteK = 1 + Math.min(cs.abilityHaste, K.AH_CAP) / 100;
  const critDamageEff = cs.critDamage * (1 - (foe.antiCrit ?? 0));
  const atkK = (1 + cs.ad / K.K_AD) * (1 + cs.attackSpeed) * (1 + cs.critChance * (critDamageEff - 1));
  const abPK = (1 + (cs.ad * K.R_ABILITY_AD) / K.K_AD) * hasteK;
  const maAK = (1 + (cs.ap * K.R_ATTACK_AP) / K.K_AP) * (1 + cs.attackSpeed);
  const maBK = (1 + cs.ap / K.K_AP) * hasteK;
  let phys = D0 * (w.wPA * atkK + w.wPB * abPK);
  let magic = D0 * (w.wMA * maAK + w.wMB * maBK);
  for (const e of effectsOf(cs, "ON_HIT")) {
    const p = e.params;
    const base = (p.flat ?? 0) + (p.ratioAp ?? 0) * cs.ap + (p.pctCurrent ?? 0) * (foe.hp ?? 0) + (p.pctMax ?? 0) * (foe.maxHp ?? 0);
    const amt = base * K.ONHIT_BASE_RATE * (1 + cs.attackSpeed) * dt * lateFactor;
    if (p.damageType === "magic") magic += amt; else phys += amt;
  }
  const execK = executeMultiplier(cs, foe);
  return { phys: phys * execK, magic: magic * execK };
}

/** 斬殺倍率：目標血量比例低於門檻時 × (1 + bonus)；多件已由 unique 去重。 */
export function executeMultiplier(cs, foe) {
  if (!foe?.maxHp) return 1;
  const ratio = foe.hp / foe.maxHp;
  let k = 1;
  for (const e of effectsOf(cs, "EXECUTE")) if (ratio < e.params.threshold) k = Math.max(k, 1 + e.params.bonus);
  return k;
}

/** 防守方的反暴擊係數（取最強）。 */
export const antiCritOf = (cs) => effectsOf(cs, "ANTI_CRIT").reduce((m, e) => Math.max(m, e.params.reduction), 0);

/** 減傷（契約 §4.2）。 */
export function mitigate({ phys, magic, attackerCs = null, defenderCs = null, aura = {} }) {
  const K = COMBAT_CONSTANTS;
  const a = attackerCs ?? {};
  const d = defenderCs ?? {};
  const effArmor = Math.max(0, ((d.armor ?? 0) + (aura.armor ?? 0)) * (1 - (a.armorPenPct ?? 0)) - (a.armorPenFlat ?? 0));
  const effMr = Math.max(0, ((d.mr ?? 0) + (aura.mr ?? 0)) * (1 - (a.magicPenPct ?? 0)) - (a.magicPenFlat ?? 0));
  return {
    physTaken: phys * K.RESIST_K / (K.RESIST_K + effArmor),
    magicTaken: magic * K.RESIST_K / (K.RESIST_K + effMr),
    effArmor, effMr,
  };
}

/** 減療取最強，不相加（點燃與重傷共用）。 */
export const healCutOf = (activeCuts) => activeCuts.reduce((m, c) => Math.max(m, c), 0);

export const lifestealHeal = ({ physAttackTaken, cs, healCut = 0 }) => physAttackTaken * (cs?.lifesteal ?? 0) * (1 - healCut);
export const omnivampHeal = ({ totalTaken, cs, healCut = 0 }) => totalTaken * (cs?.omnivamp ?? 0) * (1 - healCut);

/**
 * 低血護盾觸發（決定性）。
 * @param readyAt  上次觸發後的冷卻到期時間（未觸發過傳 -Infinity）
 * @returns {{ triggered, amount, readyAt }}
 */
export function lowHpShield({ effect, hp, maxHp, t, readyAt = -Infinity, healShieldPower = 0 }) {
  const p = effect.params;
  if (!(maxHp > 0) || t < readyAt || hp / maxHp >= p.threshold || hp <= 0) return { triggered: false, amount: 0, readyAt };
  return { triggered: true, amount: maxHp * p.shieldPctMaxHp * (1 + healShieldPower), readyAt: t + p.cooldown, blocks: p.blocks };
}

/**
 * 光環加總：同 group 取最大值（不疊加）。
 * @param sources  [{ effect, group }]（已由呼叫端依距離與席位順序篩好）
 */
export function auraTotals(sources) {
  const best = new Map();
  for (const { effect, group } of sources) {
    const key = group ?? effectGroupKey(effect);
    const prev = best.get(key);
    if (!prev || effectStrength(effect) > effectStrength(prev)) best.set(key, effect);
  }
  let armor = 0, mr = 0, moveSpeed = 0;
  for (const e of best.values()) {
    armor += e.params.armor ?? 0;
    mr += e.params.mr ?? 0;
    moveSpeed += e.params.moveSpeed ?? 0;
  }
  return { armor, mr, moveSpeed };
}

/** 緩速取最強，不相乘；回傳移速倍率。 */
export const slowMultiplier = (slows) => 1 - slows.reduce((m, s) => Math.max(m, s), 0);
