// ============================================================================
//  battle/moba/mobaHeroProfile.js — 英雄定位 → LogicEngine 行為調整量（Milestone H）
//
//  身分：S28 `mobaPlayerStats` 的同構物，只是輸入從「選手 16 項能力」換成
//    「英雄定位」。沿用同一條已驗證的管線：
//      S24  戰術   → knobs → engine.configureMatch
//      S28  選手能力 → mods  → engine.configurePlayers
//      H    英雄定位 → mods  → engine.configureHeroes   ← 本檔
//    LogicEngine 不 import 本檔、也不認得 heroDatabase；它只吃算好的偏移量。
//
//  ── 為什麼需要這一層 ──────────────────────────────────────────────────────
//  Ban/Pick 到 Milestone G 為止仍是**純外觀**：`draftRoster.js` 自己寫著引擎
//  loadout 走 `HERO_ASSIGN`，選到的英雄只決定 3D 模型、名字與
//  `BattleResult.heroId`。整個選角畫面不影響勝負。
//
//  ── 紅線（沿用 S28 §2）────────────────────────────────────────────────────
//  英雄定位**只能**改行為傾向：站位距離、目標選擇、進退門檻、參團／目標集結、
//  技能就緒的權重。**不得**乘進 damage / winRate / gold。
//    → 因此本檔刻意**不**輸出 power / tough。`mobaRosterAdapter.calcMobaPower`
//      算得出英雄側的戰力，但它會直接乘進 `dmgAmt = p.power * dt * 0.92`
//      ⇒ 注入即違規。這是自覺取捨，與 S28 對 accuracy 的處理同一個立場。
//
//  ── 對稱性 ────────────────────────────────────────────────────────────────
//  藍紅**都**從自己的 Ban/Pick 取得英雄，兩側走同一張表、同一組限幅
//  ⇒ 不存在陣營特例。無 draft（直接測試進入）⇒ 兩側都用靜態名單的預設英雄。
//
//  ── 中性值 ────────────────────────────────────────────────────────────────
//  未知 arch ⇒ NEUTRAL（全 0 / 全 1）⇒ 引擎公式加 0 / 乘 1 ⇒ 逐位元回到 G。
//  引擎端另有 `heroesOn` 短路（雙保險）。
// ============================================================================

/** 契約版本（進 snapshot.heroMeta，供驗證腳本與 Result 消費者辨識）。 */
export const MOBA_HERO_PROFILE_VERSION = "MobaHeroProfile.v1";

/** 中性 mods：引擎加 0 / 乘 1 ⇒ 與 Milestone H 之前完全相同。 */
export const NEUTRAL_HERO_MODS = Object.freeze({
  engageDistK: 1,     // 交戰保持距離倍率（站位）
  engageAdj: 0,       // 接戰意願（加進決策分數）
  retreatAdj: 0,      // 撤退門檻偏移（↑ = 更早撤）
  focusLowHp: 0,      // 目標選擇：對殘血目標的額外偏好
  joinAdj: 0,         // 參團傾向
  objAdj: 0,          // 龍／巴龍集結傾向
  skillWeight: 1,     // 技能就緒對接戰意願的權重倍率
  protectAdj: 0,      // 保護低血量隊友的傾向（輔助語彙）
});

/**
 * 六定位的行為輪廓（唯一事實來源；文件與驗證腳本都讀這張表）。
 *
 * 設計原則：**同一個定位在不同維度有得有失**，不是單純的強弱表。
 *   坦克站得近、更常開團，但不追殘血也不靠技能時機；
 *   射手站得遠、更晚接戰，但目標選擇最看殘血；
 *   刺客抓單最強、技能時機權重最高，但人數劣勢時最早撤。
 * 這樣才不會讓「選某個定位 = 比較強」，而是「選某個定位 = 打法不同」。
 */
export const HERO_ARCH_PROFILE = Object.freeze({
  "坦克": { engageDistK: 0.72, engageAdj: +0.10, retreatAdj: -0.05, focusLowHp: -0.10,
    joinAdj: +0.07, objAdj: +0.05, skillWeight: 0.85, protectAdj: +0.06 },
  "戰士": { engageDistK: 0.82, engageAdj: +0.07, retreatAdj: -0.03, focusLowHp: +0.05,
    joinAdj: +0.05, objAdj: +0.02, skillWeight: 0.95, protectAdj: 0 },
  "刺客": { engageDistK: 0.88, engageAdj: +0.03, retreatAdj: +0.05, focusLowHp: +0.22,
    joinAdj: -0.04, objAdj: -0.03, skillWeight: 1.20, protectAdj: -0.04 },
  "法師": { engageDistK: 1.12, engageAdj: -0.03, retreatAdj: +0.03, focusLowHp: +0.10,
    joinAdj: +0.03, objAdj: +0.05, skillWeight: 1.18, protectAdj: 0 },
  "射手": { engageDistK: 1.20, engageAdj: -0.08, retreatAdj: +0.06, focusLowHp: +0.15,
    joinAdj: -0.02, objAdj: +0.03, skillWeight: 1.05, protectAdj: -0.03 },
  "輔助": { engageDistK: 1.05, engageAdj: -0.05, retreatAdj: +0.02, focusLowHp: -0.05,
    joinAdj: +0.08, objAdj: +0.08, skillWeight: 0.90, protectAdj: +0.20 },
});

/** 各維度限幅（§「所有映射必須有限幅」）。 */
export const HERO_MOD_CLAMP = Object.freeze({
  engageDistK: [0.7, 1.25],
  engageAdj: 0.12,
  retreatAdj: 0.08,
  focusLowHp: 0.25,
  joinAdj: 0.10,
  objAdj: 0.10,
  skillWeight: [0.8, 1.25],
  protectAdj: 0.22,
});

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const fix = (v) => Math.round(v * 1e6) / 1e6 + 0;

/**
 * 單一英雄 → 行為 mods。
 * @param {{arch?:string}|null} hero heroDatabase 物件（只讀 arch；缺 ⇒ 中性）
 */
export function toHeroMods(hero) {
  const profile = HERO_ARCH_PROFILE[hero?.arch];
  if (!profile) return { ...NEUTRAL_HERO_MODS };
  const c = (key) => {
    const lim = HERO_MOD_CLAMP[key];
    const raw = profile[key] ?? NEUTRAL_HERO_MODS[key];
    return fix(Array.isArray(lim) ? clamp(raw, lim[0], lim[1]) : clamp(raw, -lim, lim));
  };
  return {
    engageDistK: c("engageDistK"), engageAdj: c("engageAdj"), retreatAdj: c("retreatAdj"),
    focusLowHp: c("focusLowHp"), joinAdj: c("joinAdj"), objAdj: c("objAdj"),
    skillWeight: c("skillWeight"), protectAdj: c("protectAdj"),
  };
}

/**
 * 對戰名單（席位 → 英雄）→ engine.configureHeroes 的入參。
 *
 * @param {Object} roster    `{ [seatId]: { heroId, hero? } }`（draftRoster / buildBattleRoster 的輸出）
 * @param {Function} lookup  heroId → hero 物件（呼叫端注入 heroById；本檔不 import heroDatabase）
 * @returns {{blue:Object, red:Object, meta:Object}|null}  全中性 ⇒ 回 null（呼叫端據此不呼叫引擎）
 */
export function toEngineHeroMods(roster = {}, lookup = null) {
  const get = typeof lookup === "function" ? lookup : () => null;
  const blue = {}, red = {}, arch = {};
  let anyNonNeutral = false;
  for (const [seat, entry] of Object.entries(roster ?? {})) {
    const heroId = entry?.heroId ?? entry?.hero?.id ?? null;
    const hero = entry?.hero && entry.hero.arch ? entry.hero : get(heroId);
    const mods = toHeroMods(hero);
    if (hero?.arch && HERO_ARCH_PROFILE[hero.arch]) { anyNonNeutral = true; arch[seat] = hero.arch; }
    (seat[0] === "r" ? red : blue)[seat] = mods;
  }
  if (!anyNonNeutral) return null;
  return {
    blue, red,
    meta: { version: MOBA_HERO_PROFILE_VERSION, arch },
  };
}
