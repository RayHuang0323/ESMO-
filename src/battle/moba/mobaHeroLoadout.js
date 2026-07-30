// ============================================================================
//  battle/moba/mobaHeroLoadout.js — 每名英雄的固定召喚師技能配置（Milestone I）
//
//  現況問題：召喚師技能是**引擎依席位臨時決定**的——`LogicEngine` 建構子裡
//  「打野拿懲戒、其他人第二格 reserved」，而且只有引擎知道。於是：
//    · 賽前完全看不到自己帶什麼技能
//    · 第二格對非打野是空的（面板顯示「未配置」）
//    · Loading／Result／Replay 沒有任何技能資料可讀
//
//  本檔把它變成**一份可攜帶的資料**：每名英雄固定 2 個召喚師技能，
//  由「該英雄的預計位置」推導，打野必定有懲戒。純函式、無狀態、不 import 引擎。
//
//  ⚠ 邊界：本檔**不改引擎的技能行為**。引擎目前只實作 flash（閃現）與
//    smite（懲戒）兩種效果；其餘技能是**賽前配置與呈現層的資料**，
//    面板會明確標示哪些有引擎效果、哪些只是配置（不假裝有 CD）。
//    這樣才不會出現「畫面上有技能、引擎卻不認得」的假資料。
// ============================================================================

/** 契約版本（進 snapshot／Replay config／BattleResult meta，供消費端辨識）。 */
export const HERO_LOADOUT_VERSION = "MobaHeroLoadout.v1";

/**
 * 召喚師技能表。`engine` 標記該技能在 LogicEngine 是否**真的有效果**，
 * 呈現層據此決定要不要顯示冷卻，避免假 CD。
 */
export const SUMMONER_SPELLS = Object.freeze({
  flash: { id: "flash", zh: "閃現", icon: "⚡", engine: true, desc: "短距離瞬間位移，逃生或切入" },
  smite: { id: "smite", zh: "懲戒", icon: "🎯", engine: true, desc: "對野怪造成真實傷害，搶奪大型目標" },
  heal: { id: "heal", zh: "治療", icon: "💚", engine: false, desc: "回復自身與附近隊友生命" },
  barrier: { id: "barrier", zh: "護盾", icon: "🛡", engine: false, desc: "短時間吸收傷害" },
  ignite: { id: "ignite", zh: "點燃", icon: "🔥", engine: false, desc: "持續傷害並降低目標回復" },
  exhaust: { id: "exhaust", zh: "虛弱", icon: "🌀", engine: false, desc: "降低目標傷害與移動速度" },
  teleport: { id: "teleport", zh: "傳送", icon: "🌐", engine: false, desc: "傳送到我方建築或兵線" },
});

/** 五路的預設第二技能（第一格一律閃現；打野第二格一律懲戒）。 */
export const LANE_SECOND_SPELL = Object.freeze({
  上路: "teleport",   // 上路需要支援與帶線能力
  打野: "smite",      // ⚠ 硬性規則：打野必定帶懲戒
  中路: "ignite",     // 中路以擊殺壓制為主
  下路: "heal",       // 下路雙人路的續戰
  輔助: "exhaust",    // 輔助保護後排
});

/** 依定位微調第二技能（只在該位置的預設不適合時覆寫；打野不可覆寫）。 */
const ARCH_OVERRIDE = Object.freeze({
  上路: { 法師: "teleport", 坦克: "teleport" },
  中路: { 輔助: "barrier", 坦克: "barrier" },
  下路: { 法師: "barrier" },
  輔助: { 戰士: "ignite", 坦克: "ignite" },
});

const SEAT_LANE = Object.freeze({ 1: "上路", 2: "打野", 3: "中路", 4: "下路", 5: "輔助" });

/**
 * 單一英雄的召喚師技能配置。
 * @param {{arch?:string, lane?:string}|null} hero  英雄（可為 null ⇒ 只依位置）
 * @param {string} lane 該英雄**實際上場的位置**（不是英雄的擅長位置）
 * @returns {[{id:string,zh:string,icon:string,engine:boolean}, ...]} 固定 2 個
 */
export function spellsFor(hero, lane) {
  const first = SUMMONER_SPELLS.flash;
  //  ⚠ 打野的懲戒是硬性規則，不受任何覆寫影響（沒有懲戒就搶不了大型目標）。
  if (lane === "打野") return [first, SUMMONER_SPELLS.smite];
  const override = ARCH_OVERRIDE[lane]?.[hero?.arch];
  const secondId = override ?? LANE_SECOND_SPELL[lane] ?? "heal";
  return [first, SUMMONER_SPELLS[secondId] ?? SUMMONER_SPELLS.heal];
}

/** 席位 id（b1–b5 / r1–r5）→ 位置中文名。 */
export const laneOfSeat = (seatId) => SEAT_LANE[String(seatId ?? "").slice(1)] ?? null;

/**
 * 整份對戰名單 → 每個席位的技能配置。
 * @param {Object} roster `{ [seatId]: { heroId, hero? } }`
 * @param {Function|null} lookup heroId → hero（呼叫端注入 heroById；本檔不 import heroDatabase）
 * @returns {Object} `{ [seatId]: { lane, heroId, spells: [id, id] } }`
 */
export function buildLoadout(roster = {}, lookup = null) {
  const get = typeof lookup === "function" ? lookup : () => null;
  const out = {};
  for (const [seat, entry] of Object.entries(roster ?? {})) {
    const lane = laneOfSeat(seat);
    if (!lane) continue;
    const heroId = entry?.heroId ?? entry?.hero?.id ?? null;
    const hero = entry?.hero?.arch ? entry.hero : get(heroId);
    out[seat] = { lane, heroId, spells: spellsFor(hero, lane).map((s) => s.id) };
  }
  return out;
}

/** 驗證用：每個席位都恰好 2 個技能，且打野一定有懲戒。 */
export function validateLoadout(loadout = {}) {
  const errors = [];
  for (const [seat, entry] of Object.entries(loadout)) {
    if (!Array.isArray(entry?.spells) || entry.spells.length !== 2) {
      errors.push(`${seat}: 技能數不是 2（${entry?.spells?.length ?? 0}）`);
      continue;
    }
    if (entry.spells.some((id) => !SUMMONER_SPELLS[id])) errors.push(`${seat}: 未知技能 ${entry.spells.join(",")}`);
    if (entry.lane === "打野" && !entry.spells.includes("smite")) errors.push(`${seat}: 打野未帶懲戒`);
    if (new Set(entry.spells).size !== 2) errors.push(`${seat}: 技能重複`);
  }
  return { ok: errors.length === 0, errors };
}
