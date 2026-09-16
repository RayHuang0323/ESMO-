// ============================================================================
//  battle/moba/items/itemCatalog.js — MOBA 裝備目錄 v1（M1 Pure Foundation）
//
//  規格來源：docs/design/MOBA_裝備矩陣_v1.md（88 件；v1.0 首發 68 件）。
//  單位：docs/architecture/MOBA_戰鬥屬性契約_v1.md §2。
//
//  【硬規則】
//   · 純資料：不 import 引擎、React、store；不讀時間、不用亂數。
//   · 名稱為 ESMO 原創草案；價格與屬性為預算草案（M3 校準前不得視為定案）。
//   · 目錄是凍結物件：任何消費端都不可能在執行期改到它。
// ============================================================================

export const ITEM_CATALOG_VERSION = "moba-items.catalog.v1";

/** 上線批次（有序）。v1.0 首發；v1.1 在 v1.0 通過全部 gate 後才開。 */
export const ITEM_BATCHES = Object.freeze(["1.0", "1.1"]);
export const LAUNCH_BATCH = "1.0";

export const ITEM_TIERS = Object.freeze(["T1", "T2", "T3", "BOOTS", "STARTER"]);

export const ITEM_FAMILIES = Object.freeze({
  A: "暴擊／射手",
  B: "攻速／On-hit",
  C: "刺客／穿透",
  D: "戰士／鬥士",
  E: "法術爆發",
  F: "法術續戰／功能",
  G: "坦克／防禦",
  H: "輔助／團隊功能",
});

/** CombatStatsV1 可累加的屬性鍵（小數型的百分比一律以小數表示：0.12 = 12%）。 */
export const STAT_KEYS = Object.freeze([
  "hp", "ad", "ap", "armor", "mr",
  "attackSpeed", "critChance", "critDamageAmp", "apAmp",
  "abilityHaste", "moveSpeed",
  "armorPenFlat", "armorPenPct", "magicPenFlat", "magicPenPct",
  "lifesteal", "omnivamp", "healShieldPower", "regenPctPerSec",
]);

/** 引擎席位語彙（starter 限制用）。 */
export const SEAT_ROLES = Object.freeze(["top", "jungle", "mid", "adc", "sup"]);

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

const fx = (type, params, batch = null) => (batch ? { type, params, batch } : { type, params });

const item = (id, tier, name, price, opts = {}) => ({
  id, tier, name, price,
  components: opts.components ?? [],
  stats: opts.stats ?? {},
  effects: opts.effects ?? [],
  unique: opts.unique ?? null,
  family: opts.family ?? null,
  batch: opts.batch ?? LAUNCH_BATCH,
  seat: opts.seat ?? null,
});

// ── T1 基礎組件（18）──────────────────────────────────────────────────────────
const T1 = [
  item("t1_ad_s", "T1", "鍛鐵刃片", 300, { stats: { ad: 8 } }),
  item("t1_ad_l", "T1", "重鍛刀胚", 480, { stats: { ad: 14 } }),
  item("t1_ap_s", "T1", "微光晶屑", 300, { stats: { ap: 15 } }),
  item("t1_ap_l", "T1", "奧光晶塊", 480, { stats: { ap: 25 } }),
  item("t1_hp_s", "T1", "活力石", 300, { stats: { hp: 120 } }),
  item("t1_hp_l", "T1", "厚實心石", 480, { stats: { hp: 190 } }),
  item("t1_ar_s", "T1", "鱗甲片", 300, { stats: { armor: 15 } }),
  item("t1_ar_l", "T1", "重鱗甲片", 480, { stats: { armor: 25 } }),
  item("t1_mr_s", "T1", "靜紋布", 280, { stats: { mr: 15 } }),
  item("t1_mr_l", "T1", "厚靜紋布", 460, { stats: { mr: 25 } }),
  item("t1_as", "T1", "輕羽匕首", 300, { stats: { attackSpeed: 0.12 } }),
  item("t1_crit", "T1", "準星石", 320, { stats: { critChance: 0.08 } }),
  item("t1_ah", "T1", "沉思符文", 300, { stats: { abilityHaste: 6 } }),
  item("t1_ls", "T1", "吸血獠牙", 300, { stats: { lifesteal: 0.06 } }),
  item("t1_apen", "T1", "穿甲釘", 300, { stats: { ad: 4, armorPenFlat: 3 } }),
  item("t1_mpen", "T1", "虛紋針", 300, { stats: { ap: 8, magicPenFlat: 4 } }),
  item("t1_hsp", "T1", "祈光花瓣", 300, { stats: { healShieldPower: 0.05 } }),
  item("t1_regen", "T1", "回春藤", 250, { stats: { regenPctPerSec: 0.0015 } }),
];

// ── T2 中階組件（16）──────────────────────────────────────────────────────────
const GRIEVOUS_ATTACK = fx("GRIEVOUS_WOUNDS", { trigger: "attack", cut: 0.4, duration: 3 });
const GRIEVOUS_ABILITY = fx("GRIEVOUS_WOUNDS", { trigger: "ability", cut: 0.4, duration: 3 });
const T2 = [
  item("t2_rend", "T2", "裂鋒刃", 950, { components: ["t1_ad_s", "t1_apen"], stats: { ad: 18, armorPenFlat: 8 } }),
  item("t2_gale", "T2", "疾風弩機", 900, { components: ["t1_as", "t1_ad_s"], stats: { attackSpeed: 0.22, ad: 8 } }),
  item("t2_scope", "T2", "精準瞄鏡", 950, { components: ["t1_crit", "t1_as"], stats: { critChance: 0.15, attackSpeed: 0.10 } }),
  item("t2_fang", "T2", "嗜紅牙", 900, { components: ["t1_ad_s", "t1_ls"], stats: { ad: 12, lifesteal: 0.08 } }),
  item("t2_core", "T2", "奧術晶核", 1050, { components: ["t1_ap_l", "t1_ap_s"], stats: { ap: 50 } }),
  item("t2_echo", "T2", "迴響法典", 950, { components: ["t1_ap_s", "t1_ah"], stats: { ap: 25, abilityHaste: 10 } }),
  item("t2_rift", "T2", "虛紋尖晶", 900, { components: ["t1_ap_s", "t1_mpen"], stats: { ap: 22, magicPenFlat: 10 } }),
  item("t2_heart", "T2", "生命護符", 900, { components: ["t1_hp_l", "t1_hp_s"], stats: { hp: 320 } }),
  item("t2_mail", "T2", "鎖環胸甲", 900, { components: ["t1_ar_s", "t1_hp_s"], stats: { armor: 30, hp: 120 } }),
  item("t2_veil", "T2", "靜默斗篷", 880, { components: ["t1_mr_s", "t1_hp_s"], stats: { mr: 30, hp: 120 } }),
  item("t2_belt", "T2", "戰士腰帶", 900, { components: ["t1_hp_s", "t1_ad_s"], stats: { hp: 220, ad: 10 } }),
  item("t2_sigil", "T2", "冷卻徽記", 900, { components: ["t1_ah", "t1_hp_s"], stats: { abilityHaste: 12, hp: 120 } }),
  item("t2_ember", "T2", "灼痕燃石", 1000, {
    components: ["t1_ap_s", "t1_hp_s"], stats: { ap: 20, hp: 150 },
    //  v1.0 只有屬性；小型燃燒屬 v1.1 primitive，隨 v1.1 一併啟用。
    effects: [fx("BURN", { trigger: "ability", pctMaxHpPerSec: 0.005, duration: 2, damageType: "magic" }, "1.1")],
  }),
  item("t2_scythe", "T2", "重創鐮", 900, { components: ["t1_ad_s", "t1_ad_s"], stats: { ad: 15 }, effects: [GRIEVOUS_ATTACK] }),
  item("t2_vial", "T2", "衰敗之瓶", 900, { components: ["t1_ap_s", "t1_ap_s"], stats: { ap: 20 }, effects: [GRIEVOUS_ABILITY] }),
  item("t2_halo", "T2", "守護聖徽", 850, { components: ["t1_hsp", "t1_ah"], stats: { healShieldPower: 0.08, abilityHaste: 8, hp: 100 } }),
];

// ── T3 完成裝（44）────────────────────────────────────────────────────────────
const lifeline = (params) => fx("LOW_HP_SHIELD", { target: "self", threshold: 0.3, cooldown: 60, blocks: "all", ...params });
const T3 = [
  // A 暴擊／射手
  //  ── M4c.1 Marksman Power Tuning（2026-09-16）────────────────────────────────
  //  只調**射手族 T3 的暴擊鏈**（critChance／critDamageAmp）。AD、攻速、價格、組件、
  //  unique、效果一律不動；通用鞋 bt_swift、組件 t2_scope／t1_crit、K_AD／K_AP 也不動。
  //  根因（M4c 配對 200 seeds ＋ 離線拆解）：射手攻擊通道是三段相乘——
  //    AD 107（×2.07）× 攻速 0.60（×1.60）× 暴擊 0.45×(2.10−1)（×1.495）
  //  ⇒ 對局每分鐘傷害 OFF→ON 2.46×、離線滿裝 4.01×，都高於 1.8–2.1 的目標；
  //    其他流派只吃單一主因（法師 AP −62%、戰士 AD −40%），只有射手同時吃三段。
  //  ⚠ 同族目前沒被買到的 T3（hunter／reaper／bloodoath／rendspear）一起下修，
  //    否則 AI 會改買它們，等於沒調。
  //  ⚠ 兩段式調整（每次都重跑同一套證據：離線模型 → 屬性拆解 → 配對 200 seeds）：
  //    原始   dawnbow cc 0.25 / amp 0.35、同族 cc 0.20 ⇒ 模型 4.01、對局 2.46
  //    第一次 dawnbow cc 0.15 / amp 0.20、同族 cc 0.10 ⇒ 模型 3.61、對局 2.23（仍 > 2.1）
  //    第二次 dawnbow cc 0.10 / amp 0.10、同族 cc 0.05 ⇒ 模型 3.32（預估對局 ≈ 2.05）
  item("t3_dawnbow", "T3", "破曉長弓", 3100, { family: "A", unique: "critAmp", components: ["t2_scope", "t1_ad_l", "t1_ad_l"], stats: { ad: 45, critChance: 0.10, critDamageAmp: 0.10 } }),
  item("t3_hunter", "T3", "追獵者之瞳", 2800, { family: "A", batch: "1.1", components: ["t2_scope", "t2_gale"], stats: { ad: 30, critChance: 0.05, attackSpeed: 0.25, moveSpeed: 0.05 } }),
  item("t3_reaper", "T3", "收割連弩", 2900, { family: "A", batch: "1.1", unique: "execute", components: ["t2_scope", "t1_ad_l", "t1_ad_s"], stats: { ad: 40, critChance: 0.05 }, effects: [fx("EXECUTE", { threshold: 0.35, bonus: 0.12 })] }),
  item("t3_pierce", "T3", "穿雲破甲弓", 3000, { family: "A", unique: "armorPenPct", components: ["t2_scope", "t2_rend"], stats: { ad: 35, critChance: 0.05, armorPenPct: 0.30 } }),
  item("t3_bloodoath", "T3", "血誓長弓", 3100, { family: "A", batch: "1.1", unique: "lifeline", components: ["t2_scope", "t2_fang"], stats: { ad: 40, critChance: 0.05, lifesteal: 0.10 }, effects: [lifeline({ shieldPctMaxHp: 0.18 })] }),
  item("t3_rendspear", "T3", "裂傷刺矛", 2700, { family: "A", unique: "grievous", components: ["t2_scope", "t2_scythe"], stats: { ad: 30, critChance: 0.05 }, effects: [GRIEVOUS_ATTACK] }),
  // B 攻速／On-hit
  item("t3_stormfork", "T3", "風暴三叉", 3000, { family: "B", unique: "onHitCurrent", components: ["t2_gale", "t1_as", "t1_ad_l"], stats: { attackSpeed: 0.35, ad: 20 }, effects: [fx("ON_HIT", { damageType: "physical", pctCurrent: 0.04 })] }),
  item("t3_thunderfist", "T3", "雷鳴手套", 2600, { family: "B", batch: "1.1", components: ["t2_gale", "t1_as", "t1_mpen"], stats: { attackSpeed: 0.40 }, effects: [fx("ON_HIT", { damageType: "magic", flat: 18 })] }),
  item("t3_torrent", "T3", "奔流護腕", 2900, { family: "B", components: ["t2_gale", "t2_core"], stats: { attackSpeed: 0.30, ap: 45 }, effects: [fx("ON_HIT", { damageType: "magic", flat: 14, ratioAp: 0.12 })] }),
  item("t3_serpent", "T3", "蛇鱗短劍", 2700, { family: "B", batch: "1.1", unique: "ramping", components: ["t2_gale", "t1_ad_l"], stats: { attackSpeed: 0.30, ad: 25 }, effects: [fx("RAMPING_STAT", { stat: "attackSpeed", perSecond: 0.04, max: 0.24 })] }),
  item("t3_shieldbreaker", "T3", "碎盾重錘", 2900, { family: "B", unique: "onHitMax", components: ["t2_gale", "t2_heart"], stats: { attackSpeed: 0.25, hp: 250 }, effects: [fx("ON_HIT", { damageType: "physical", pctMax: 0.02 })] }),
  // C 刺客／穿透
  item("t3_shadowblade", "T3", "暗影刃", 3000, { family: "C", unique: "execute", components: ["t2_rend", "t1_ad_l", "t1_ad_s"], stats: { ad: 45, armorPenFlat: 15 }, effects: [fx("EXECUTE", { threshold: 0.40, bonus: 0.10 })] }),
  item("t3_nightscythe", "T3", "夜幕鐮刀", 2800, { family: "C", components: ["t2_rend", "t1_ah", "t1_ad_l"], stats: { ad: 40, armorPenFlat: 12, abilityHaste: 15 } }),
  item("t3_headsman", "T3", "斷首短刃", 3200, { family: "C", batch: "1.1", unique: "execute", components: ["t2_rend", "t1_ad_l", "t1_ad_s"], stats: { ad: 50, armorPenFlat: 10 }, effects: [fx("EXECUTE", { threshold: 0.30, bonus: 0.16 })] }),
  item("t3_ghostcloak", "T3", "幽影披風", 2700, { family: "C", batch: "1.1", components: ["t2_rend", "t1_ad_l"], stats: { ad: 35, armorPenFlat: 12, moveSpeed: 0.06 } }),
  item("t3_finalstring", "T3", "絕殺弦", 2800, { family: "C", unique: "armorPenPct", components: ["t2_rend", "t1_ad_l"], stats: { ad: 40, armorPenPct: 0.25 } }),
  item("t3_heartpierce", "T3", "碎心匕", 2700, { family: "C", batch: "1.1", unique: "grievous", components: ["t2_rend", "t2_scythe"], stats: { ad: 40, armorPenFlat: 10 }, effects: [GRIEVOUS_ATTACK] }),
  // D 戰士／鬥士
  item("t3_warbringer", "T3", "戰慄巨斧", 2900, { family: "D", components: ["t2_belt", "t2_sigil"], stats: { ad: 35, hp: 350, abilityHaste: 15 } }),
  item("t3_unbroken", "T3", "不屈戰旗", 3000, { family: "D", unique: "lifeline", components: ["t2_belt", "t1_hp_l", "t1_ad_s"], stats: { ad: 30, hp: 300 }, effects: [lifeline({ shieldPctMaxHp: 0.20 })] }),
  item("t3_bloodforge", "T3", "血鑄戰甲", 3000, { family: "D", batch: "1.1", unique: "vamp", components: ["t2_belt", "t2_fang"], stats: { ad: 30, hp: 400, omnivamp: 0.08 } }),
  item("t3_ragemaul", "T3", "狂怒巨槌", 2800, { family: "D", batch: "1.1", unique: "ramping", components: ["t2_belt", "t1_ad_l"], stats: { ad: 40, hp: 250 }, effects: [fx("RAMPING_STAT", { stat: "ad", perSecond: 2, max: 16 })] }),
  item("t3_twinaxe", "T3", "雙刃旋斧", 2800, { family: "D", batch: "1.1", components: ["t2_belt", "t2_gale"], stats: { ad: 30, hp: 300, attackSpeed: 0.20 } }),
  item("t3_bloodplate", "T3", "淬血重甲", 2800, { family: "D", components: ["t2_belt", "t2_mail"], stats: { ad: 25, hp: 300, armor: 35 } }),
  // E 法術爆發
  item("t3_starcrown", "T3", "星隕法冠", 3600, { family: "E", unique: "apAmp", components: ["t2_core", "t1_ap_l", "t1_ap_l"], stats: { ap: 110, apAmp: 0.20 } }),
  item("t3_voidstaff", "T3", "虛空裂杖", 3000, { family: "E", unique: "magicPenPct", components: ["t2_rift", "t2_core"], stats: { ap: 70, magicPenPct: 0.35 } }),
  item("t3_scorchtome", "T3", "灼焰法典", 3000, { family: "E", batch: "1.1", unique: "burn", components: ["t2_ember", "t1_ap_l", "t1_ap_s"], stats: { ap: 75, hp: 200 }, effects: [fx("BURN", { trigger: "ability", pctMaxHpPerSec: 0.015, duration: 3, damageType: "magic" })] }),
  item("t3_thunderorb", "T3", "雷殛法珠", 2900, { family: "E", batch: "1.1", unique: "execute", components: ["t2_echo", "t1_ap_l"], stats: { ap: 80, abilityHaste: 20 }, effects: [fx("EXECUTE", { threshold: 0.35, bonus: 0.10 })] }),
  item("t3_tideedge", "T3", "暗潮法刃", 2800, { family: "E", batch: "1.1", components: ["t2_rift", "t1_ap_l"], stats: { ap: 75, magicPenFlat: 15, moveSpeed: 0.05 } }),
  item("t3_soulrend", "T3", "裂魂法杖", 2700, { family: "E", unique: "grievous", components: ["t2_vial", "t1_ap_l"], stats: { ap: 65 }, effects: [GRIEVOUS_ABILITY] }),
  // F 法術續戰／功能
  item("t3_lifespring", "T3", "生命法泉", 3000, { family: "F", unique: "vamp", components: ["t2_echo", "t2_heart"], stats: { ap: 55, hp: 300, abilityHaste: 15, omnivamp: 0.07 } }),
  item("t3_frostcrown", "T3", "冰霜法冠", 2800, { family: "F", unique: "slow", components: ["t2_core", "t1_hp_l"], stats: { ap: 60, hp: 250 }, effects: [fx("SLOW_ON_HIT", { trigger: "ability", slow: 0.15, duration: 1.5 })] }),
  item("t3_hourglass", "T3", "時序沙漏", 2800, { family: "F", batch: "1.1", components: ["t2_core", "t1_ar_l"], stats: { ap: 65, armor: 40 } }),
  item("t3_orbitring", "T3", "迴旋法戒", 2600, { family: "F", batch: "1.1", components: ["t2_echo", "t1_ah"], stats: { ap: 50, abilityHaste: 25, moveSpeed: 0.05 } }),
  item("t3_psyward", "T3", "靈能護符", 2800, { family: "F", unique: "lifeline", components: ["t2_veil", "t2_core"], stats: { ap: 45, mr: 40 }, effects: [lifeline({ shieldPctMaxHp: 0.20, blocks: "magic" })] }),
  // G 坦克／防禦
  item("t3_thornmail", "T3", "棘刺鎧", 2700, { family: "G", unique: "grievous", components: ["t2_mail", "t1_ar_l"], stats: { armor: 60, hp: 250 }, effects: [fx("GRIEVOUS_WOUNDS", { trigger: "struck", cut: 0.4, duration: 3 })] }),
  item("t3_colossus", "T3", "巨像心核", 3000, { family: "G", batch: "1.1", unique: "regen", components: ["t2_heart", "t1_hp_l", "t1_hp_l"], stats: { hp: 650 }, effects: [fx("SUSTAIN_REGEN", { regenPctPerSec: 0.005, delayReduction: 2 })] }),
  item("t3_bulwark", "T3", "堅壁重盾", 2700, { family: "G", unique: "antiCrit", components: ["t2_mail", "t1_hp_l"], stats: { armor: 55, hp: 300 }, effects: [fx("ANTI_CRIT", { reduction: 0.25 })] }),
  item("t3_calmveil", "T3", "靜海披風", 2700, { family: "G", unique: "lifeline", components: ["t2_veil", "t1_mr_l"], stats: { mr: 60, hp: 300 }, effects: [lifeline({ shieldPctMaxHp: 0.18, blocks: "magic" })] }),
  item("t3_magmacore", "T3", "熔核護甲", 2700, { family: "G", batch: "1.1", unique: "burn", components: ["t2_mail", "t2_ember"], stats: { armor: 40, hp: 350 }, effects: [fx("BURN", { trigger: "aura", radius: 4, flatPerSec: 12, pctBonusHpPerSec: 0.01, damageType: "magic" })] }),
  item("t3_statue", "T3", "不動石像", 2900, { family: "G", batch: "1.1", unique: "ramping", components: ["t2_mail", "t2_veil"], stats: { armor: 35, mr: 35, hp: 250 }, effects: [fx("RAMPING_RESIST", { perSecond: 3, max: 18, decay: 5 })] }),
  // H 輔助／團隊功能
  item("t3_wardaltar", "T3", "守望聖壇", 2300, { family: "H", unique: "aura:resist", components: ["t2_sigil", "t2_halo"], stats: { hp: 250, abilityHaste: 15 }, effects: [fx("AURA", { radius: 8, armor: 8, mr: 8 })] }),
  item("t3_redemption", "T3", "救贖之環", 2300, { family: "H", components: ["t2_halo", "t1_hsp", "t1_hp_l"], stats: { healShieldPower: 0.15, abilityHaste: 15, hp: 200 } }),
  item("t3_warhorn", "T3", "鼓舞號角", 2300, { family: "H", batch: "1.1", unique: "aura:ms", components: ["t2_echo", "t1_ah"], stats: { ap: 35, abilityHaste: 20 }, effects: [fx("AURA", { radius: 10, moveSpeed: 0.04 })] }),
  item("t3_vowshield", "T3", "聖盾誓約", 2300, { family: "H", unique: "lifeline:ally", components: ["t2_mail", "t2_veil"], stats: { armor: 25, mr: 25, hp: 200 }, effects: [fx("LOW_HP_SHIELD", { target: "ally", range: 8, threshold: 0.3, shieldPctMaxHp: 0.15, cooldown: 45, blocks: "all" })] }),
];

// ── Boots（6）───────────────────────────────────────────────────────────────
const BOOTS = [
  item("bt_base", "BOOTS", "輕步靴", 300, { stats: { moveSpeed: 0.06 } }),
  item("bt_iron", "BOOTS", "鐵步靴", 1000, { components: ["bt_base"], stats: { moveSpeed: 0.08, armor: 25 } }),
  item("bt_quiet", "BOOTS", "靜步靴", 950, { components: ["bt_base"], stats: { moveSpeed: 0.08, mr: 25 } }),
  item("bt_swift", "BOOTS", "迅擊靴", 950, { components: ["bt_base"], stats: { moveSpeed: 0.08, attackSpeed: 0.25 } }),
  item("bt_arcane", "BOOTS", "奧術靴", 1000, { components: ["bt_base"], stats: { moveSpeed: 0.08, magicPenFlat: 12 } }),
  item("bt_focus", "BOOTS", "沉思靴", 900, { components: ["bt_base"], stats: { moveSpeed: 0.08, abilityHaste: 12 } }),
];

// ── Role／Starter（4）──────────────────────────────────────────────────────
const STARTERS = [
  item("st_blade", "STARTER", "鬥志補給刃", 450, { stats: { ad: 7, hp: 70, lifesteal: 0.03 } }),
  item("st_tome", "STARTER", "啟蒙法卷", 450, { stats: { ap: 12, hp: 70, regenPctPerSec: 0.001 } }),
  item("st_hunter", "STARTER", "獵人護符", 400, { seat: "jungle", effects: [fx("ROLE_CAMP_DAMAGE", { campDamageBonus: 0.20 })] }),
  item("st_tithe", "STARTER", "守護徽章", 400, { seat: "sup", effects: [fx("ROLE_INCOME_TITHE", { passivePerSec: 1.2, minionShareTransfer: 0.5 })] }),
];

const RAW = [...T1, ...T2, ...T3, ...BOOTS, ...STARTERS];

/** 目錄固定順序（字典序以外的「文件順序」，AI 平手裁決用）。 */
export const ITEM_IDS = Object.freeze(RAW.map((i) => i.id));
export const ITEM_CATALOG = deepFreeze(Object.fromEntries(RAW.map((i) => [i.id, i])));

export const getItem = (id, catalog = ITEM_CATALOG) => (typeof id === "string" && Object.prototype.hasOwnProperty.call(catalog, id) ? catalog[id] : null);
export const isBoots = (id, catalog = ITEM_CATALOG) => getItem(id, catalog)?.tier === "BOOTS";
export const isStarter = (id, catalog = ITEM_CATALOG) => getItem(id, catalog)?.tier === "STARTER";
export const isCompleted = (id, catalog = ITEM_CATALOG) => getItem(id, catalog)?.tier === "T3";

/** 物品批次在 activeBatch 下是否可用（未知批次一律不可用）。 */
export function batchAllows(itemBatch, activeBatch = LAUNCH_BATCH) {
  const a = ITEM_BATCHES.indexOf(itemBatch);
  const b = ITEM_BATCHES.indexOf(activeBatch);
  return a >= 0 && b >= 0 && a <= b;
}

/** activeBatch 下可購買的 id（依目錄固定順序）。 */
export function itemsForBatch(activeBatch = LAUNCH_BATCH, catalog = ITEM_CATALOG) {
  return ITEM_IDS.filter((id) => catalog[id] && batchAllows(catalog[id].batch, activeBatch));
}
