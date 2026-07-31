// ============================================================================
//  data/heroCombatArchetypes.js — Hero Combat Archetype Contract v1（Milestone M）
//
//  這一份回答的是「這隻英雄**打起來**該站多遠、追多遠、用什麼方式攻擊」。
//  和 Milestone L 的 `heroCombatPresentation.js` 是**兩件不同的事**：
//    · heroCombatPresentation → 這一下**看起來**像什麼（顏色、演出模板）
//    · 本檔                   → 這一下**打得到誰、要站哪裡**（引擎行為）
//  兩者都只從既有的 heroDatabase 推導，**沒有第二套英雄身份資料庫**。
//
//  ── 資料來源與推導規則（全部可回溯，不是憑感覺填的）────────────────────────
//   attackType      ← heroDatabase.stats.range。實測值域乾淨地分成兩群：
//                     坦克 150 / 刺客 150 / 戰士 175  ⇒ melee
//                     輔助 500 / 法師 525 / 射手 550  ⇒ ranged
//                     判準：display range ≥ 300 ⇒ ranged。**不是看定位**——
//                     輔助裡的坦克（range 150）就該是近戰。
//   combatClass     ← heroDatabase.arch（與 heroCombatPresentation 同一個映射）
//   baseAttackRange ← 顯示 range 經下面的換算式轉成**引擎世界單位**
//
//  ── ⚠ 顯示 range 不能直接當世界座標 ──────────────────────────────────────
//   圖鑑的 150 / 550 是 Legacy 的展示數字，引擎的世界是 220×220、塔射程 6.0、
//   野怪攻擊 3.2。直接拿 550 當距離會讓射手打半張地圖。換算式：
//
//       engineRange = 4.0 + (displayRange - 150) × 0.011      （夾在 [4.0, 8.6]）
//
//   結果：坦克/刺客 4.00、戰士 4.28、輔助 7.85、法師 8.13、射手 8.40。
//   這條線是刻意這樣定的：
//     · 遠程 ≈ 8，貼近引擎原本對所有人硬編碼的 8 ⇒ 遠程的平衡幾乎不動
//     · 近戰 ≈ 4.0–4.3，**必須真的走進去才打得到** ⇒ 這才是本輪的行為改變
//     · 近戰 4.0 仍明顯大於野怪攻擊距離 3.2 ⇒ 近戰打得到野怪
//     · 遠程 8.4 仍小於塔射程 6.0 + 英雄半徑的安全距離推算 ⇒ 見 §塔相容
//
//  ── 邊界 ────────────────────────────────────────────────────────────────
//   · 不存最終傷害結果（沒有 damage / dps / winrate 欄位）
//   · 不使用亂數、不看時間 ⇒ 同一 heroId 永遠同一份結果（連參考都相同）
//   · 找不到英雄 ⇒ 穩定 fallback，不 throw
//   · 100 位英雄全部解析得出合法契約（verifier 逐隻檢查）
// ============================================================================
import { CHAMPIONS_100, heroById } from "./heroDatabase.js";
import { combatClassOf, COMBAT_CLASSES } from "./heroCombatPresentation.js";

export const COMBAT_ARCHETYPE_CONTRACT_VERSION = "HeroCombatArchetype.v1";

export const ATTACK_TYPES = Object.freeze(["melee", "ranged"]);
export const BASIC_ATTACK_STYLES = Object.freeze([
  "slash", "strike", "heavyImpact", "projectile", "magicBolt", "supportPulse",
]);
/** 移動意圖。決定「站哪裡」，不決定傷害。 */
export const MOVEMENT_PROFILES = Object.freeze(["engage", "hold", "kite", "flank", "protect", "zone"]);
/** 選目標傾向。本輪只影響站位錨點，不改引擎的選敵規則（那仍是「最近的敵人」）。 */
export const TARGETING_PROFILES = Object.freeze(["frontMost", "nearest", "weakest", "backLine", "ally"]);
/** 隊形線位。站位系統用它決定前後排。 */
export const FORMATION_LINES = Object.freeze(["front", "mid", "back", "flank", "support"]);

/** 顯示 range ≥ 這個值 ⇒ 遠程。實測 melee 最高 175、ranged 最低 500，300 是安全分界。 */
export const RANGED_DISPLAY_THRESHOLD = 300;
/** 顯示 range → 引擎世界單位。唯一換算點。 */
export const toEngineRange = (displayRange) => {
  const d = Number.isFinite(displayRange) ? displayRange : 150;
  return Math.min(8.6, Math.max(4.0, Math.round((4.0 + (d - 150) * 0.011) * 100) / 100));
};

//  ── 每個職業的行為輪廓 ────────────────────────────────────────────────────
//  只有六筆，因為差異的來源是**職業**，不是逐隻英雄手寫。
//  preferK / chaseK / retreatK 是相對 baseAttackRange 的倍率 ⇒ 射程一改，
//  站位自動跟著走，不會有兩份數字要同步。
const CLASS_PROFILE = Object.freeze({
  tank: Object.freeze({
    line: "front", movement: "engage", targeting: "frontMost", style: "heavyImpact",
    preferK: 0.92, chaseK: 1.9, retreatK: 0.0, spread: 2.4,
  }),
  fighter: Object.freeze({
    line: "front", movement: "engage", targeting: "nearest", style: "slash",
    preferK: 0.80, chaseK: 2.4, retreatK: 0.0, spread: 1.9,
  }),
  assassin: Object.freeze({
    line: "flank", movement: "flank", targeting: "weakest", style: "slash",
    preferK: 0.62, chaseK: 2.9, retreatK: 0.0, spread: 1.5,
  }),
  mage: Object.freeze({
    line: "back", movement: "zone", targeting: "nearest", style: "magicBolt",
    preferK: 0.93, chaseK: 1.15, retreatK: 0.52, spread: 2.1,
  }),
  marksman: Object.freeze({
    line: "back", movement: "kite", targeting: "nearest", style: "projectile",
    preferK: 0.88, chaseK: 1.10, retreatK: 0.58, spread: 1.8,
  }),
  support: Object.freeze({
    line: "support", movement: "protect", targeting: "ally", style: "supportPulse",
    preferK: 0.95, chaseK: 1.05, retreatK: 0.62, spread: 2.6,
  }),
});

/** 彈道輪廓。只有遠程有；近戰一律 null（**不建立假彈道**）。 */
const PROJECTILE_PROFILE = Object.freeze({
  marksman: Object.freeze({ id: "bolt", speed: 34, width: 0.55, arc: 0 }),
  mage: Object.freeze({ id: "orb", speed: 22, width: 0.95, arc: 0.18 }),
  support: Object.freeze({ id: "pulse", speed: 26, width: 0.8, arc: 0.1 }),
});

const build = (heroId) => {
  const h = heroById(heroId);
  const combatClass = combatClassOf(heroId);
  const display = Number.isFinite(h?.stats?.range) ? h.stats.range : 150;
  const attackType = display >= RANGED_DISPLAY_THRESHOLD ? "ranged" : "melee";
  const baseAttackRange = toEngineRange(display);
  const cp = CLASS_PROFILE[combatClass] ?? CLASS_PROFILE.fighter;
  //  近戰不做假彈道；遠程依職業給不同輪廓（射手細快、法師厚慢）
  const projectileProfile = attackType === "ranged"
    ? (PROJECTILE_PROFILE[combatClass] ?? PROJECTILE_PROFILE.mage) : null;
  //  近戰的攻擊風格再依職業細分：坦克重擊、戰士／刺客揮砍
  const basicAttackStyle = attackType === "melee"
    ? (combatClass === "tank" ? "heavyImpact" : "slash")
    : cp.style;
  return Object.freeze({
    heroId,
    source: "authored",
    combatClass,
    attackType,
    displayRange: display,
    baseAttackRange,
    //  站位：想站在離目標多遠的地方
    preferredDistance: Math.round(baseAttackRange * cp.preferK * 100) / 100,
    //  追擊：離開這個距離就放手（近戰追得遠、遠程幾乎不追）
    chaseDistance: Math.round(baseAttackRange * cp.chaseK * 100) / 100,
    //  拉距：敵人比這個近就往後挪（近戰為 0 ⇒ 不拉距）
    retreatDistance: Math.round(baseAttackRange * cp.retreatK * 100) / 100,
    basicAttackStyle,
    projectileProfile,
    movementProfile: cp.movement,
    targetingProfile: cp.targeting,
    formationLine: cp.line,
    //  同一條線上的英雄彼此散開的半徑 ⇒ 團戰不會疊成一點
    formationSpread: cp.spread,
  });
};

const TABLE = Object.freeze(Object.fromEntries(
  CHAMPIONS_100.map((c) => [c.id, build(c.id)]),
));

const FALLBACK = Object.freeze({
  ...build("ironclad"), heroId: "", source: "fallback",
});
const fallbackCache = new Map();
const cachedFallback = (id) => {
  const key = typeof id === "string" ? id : "";
  if (!fallbackCache.has(key)) {
    fallbackCache.set(key, Object.freeze({ ...FALLBACK, heroId: key }));
  }
  return fallbackCache.get(key);
};

const own = (id) => typeof id === "string" && Object.prototype.hasOwnProperty.call(TABLE, id);

/** 取得英雄的戰鬥原型。找不到 ⇒ 穩定 fallback，不 throw、不回 null。 */
export function getHeroCombatArchetype(heroId) {
  return own(heroId) ? TABLE[heroId] : cachedFallback(heroId);
}
export const isRanged = (heroId) => getHeroCombatArchetype(heroId).attackType === "ranged";
export const listArchetypeHeroIds = () => Object.freeze(Object.keys(TABLE).slice().sort());

/**
 * roster → 引擎可直接吃的 per-player 戰鬥參數。
 * 這是 Adapter 的**唯一**出口：引擎不 import 本檔、不認得 heroId，
 * 只收 `{ playerId: { engageRange, preferredDistance, ... } }`。
 * 沿用 configureMatch / configurePlayers / configureHeroes / configureSpells
 * 建立的 opt-in 慣例：**不呼叫 = 逐位元回到舊行為**。
 */
export function toEngineArchetypes(roster) {
  const out = {};
  for (const [playerId, entry] of Object.entries(roster ?? {})) {
    const heroId = entry?.hero?.id ?? entry?.heroId ?? entry?.id ?? null;
    const a = getHeroCombatArchetype(heroId);
    out[playerId] = Object.freeze({
      heroId: a.heroId || null,
      combatClass: a.combatClass,
      attackType: a.attackType,
      engageRange: a.baseAttackRange,
      preferredDistance: a.preferredDistance,
      chaseDistance: a.chaseDistance,
      retreatDistance: a.retreatDistance,
      formationLine: a.formationLine,
      formationSpread: a.formationSpread,
      movementProfile: a.movementProfile,
    });
  }
  return Object.freeze(out);
}

/** 資料完整性驗證（verifier 用）。 */
export function validateHeroCombatArchetypes() {
  const errors = [];
  const known = new Set(CHAMPIONS_100.map((c) => c.id));
  const FORBIDDEN = ["damage", "dmg", "dps", "winrate", "hp", "power", "cooldown", "cd", "accuracy"];
  for (const id of Object.keys(TABLE)) {
    const a = TABLE[id];
    if (!known.has(id)) errors.push(`${id}：不在 heroDatabase`);
    if (!COMBAT_CLASSES.includes(a.combatClass)) errors.push(`${id}.combatClass 不合法`);
    if (!ATTACK_TYPES.includes(a.attackType)) errors.push(`${id}.attackType 不合法`);
    if (!BASIC_ATTACK_STYLES.includes(a.basicAttackStyle)) errors.push(`${id}.basicAttackStyle 不合法`);
    if (!MOVEMENT_PROFILES.includes(a.movementProfile)) errors.push(`${id}.movementProfile 不合法`);
    if (!TARGETING_PROFILES.includes(a.targetingProfile)) errors.push(`${id}.targetingProfile 不合法`);
    if (!FORMATION_LINES.includes(a.formationLine)) errors.push(`${id}.formationLine 不合法`);
    if (!(a.baseAttackRange > 0)) errors.push(`${id}.baseAttackRange 非正數`);
    if (a.attackType === "melee" && a.projectileProfile !== null) errors.push(`${id}：近戰不得有彈道輪廓`);
    if (a.attackType === "ranged" && !a.projectileProfile) errors.push(`${id}：遠程缺彈道輪廓`);
    if (a.chaseDistance < a.baseAttackRange) errors.push(`${id}：追擊距離小於攻擊距離`);
    for (const k of Object.keys(a)) {
      if (FORBIDDEN.includes(k)) errors.push(`${id}.${k}：戰鬥原型不得存平衡結果`);
    }
  }
  //  近戰的攻擊距離必須全部小於所有遠程
  const meleeMax = Math.max(...Object.values(TABLE).filter((a) => a.attackType === "melee").map((a) => a.baseAttackRange));
  const rangedMin = Math.min(...Object.values(TABLE).filter((a) => a.attackType === "ranged").map((a) => a.baseAttackRange));
  if (meleeMax >= rangedMin) errors.push(`近戰最大 ${meleeMax} 未小於遠程最小 ${rangedMin}`);
  return { ok: errors.length === 0, errors, meleeMax, rangedMin };
}
