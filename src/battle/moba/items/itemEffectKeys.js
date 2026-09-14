// ============================================================================
//  battle/moba/items/itemEffectKeys.js — 效果去重鍵與強度（唯一實作，M1）
//
//  ⚠ 物品的 `unique` group 只管「能不能同時持有」（背包合法性），**不**拿來做效果去重。
//    效果去重看效果本身的語意：同一種 primitive、同一個觸發方式／變體才算重複。
//    例：重創鐮（T2）與裂傷刺矛（T3）都是「攻擊通道重傷」⇒ 只算一次；
//        風暴三叉（打當前生命）與碎盾重錘（打最大生命）是不同變體 ⇒ 兩者並存。
//  純函式：combatStatsV1.js 與 itemEffects.js 共用本檔，避免兩份規則分岔。
// ============================================================================

const onHitVariant = (p) => (p.pctCurrent ? "pctCurrent" : p.pctMax ? "pctMax" : "flat");

/** 效果的語意去重鍵。 */
export function effectGroupKey(effect) {
  const p = effect.params ?? {};
  switch (effect.type) {
    case "GRIEVOUS_WOUNDS": return `GRIEVOUS_WOUNDS:${p.trigger}`;
    case "LOW_HP_SHIELD": return `LOW_HP_SHIELD:${p.target}:${p.blocks}`;
    case "ON_HIT": return `ON_HIT:${p.damageType}:${onHitVariant(p)}`;
    case "AURA": return `AURA:${p.moveSpeed ? "moveSpeed" : "resist"}`;
    case "SLOW_ON_HIT": return `SLOW_ON_HIT:${p.trigger}`;
    case "BURN": return `BURN:${p.trigger}`;
    case "RAMPING_STAT": return `RAMPING_STAT:${p.stat}`;
    default: return effect.type;
  }
}

/** 效果強度（同鍵保留較強者；平手保留先出現者）。 */
export function effectStrength(effect) {
  const p = effect.params ?? {};
  switch (effect.type) {
    case "GRIEVOUS_WOUNDS": return p.cut ?? 0;
    case "LOW_HP_SHIELD": return p.shieldPctMaxHp ?? 0;
    case "EXECUTE": return p.bonus ?? 0;
    case "ANTI_CRIT": return p.reduction ?? 0;
    case "SLOW_ON_HIT": return p.slow ?? 0;
    case "ON_HIT": return (p.flat ?? 0) + (p.pctCurrent ?? 0) * 1000 + (p.pctMax ?? 0) * 1000 + (p.ratioAp ?? 0) * 100;
    case "AURA": return (p.armor ?? 0) + (p.mr ?? 0) + (p.moveSpeed ?? 0) * 100;
    case "BURN": return (p.pctMaxHpPerSec ?? 0) * 1000 + (p.flatPerSec ?? 0);
    case "RAMPING_STAT": return p.max ?? 0;
    case "RAMPING_RESIST": return p.max ?? 0;
    case "SUSTAIN_REGEN": return p.regenPctPerSec ?? 0;
    default: return 0;
  }
}
