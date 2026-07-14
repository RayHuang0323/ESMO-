// ============================================================================
//  battle/moba/mobaPlayerStats.js — 選手 16 項能力 → LogicEngine 行為調整量
//  （Sprint28；純函式，不 import 引擎、不 import React、不持有狀態）
//
//  身分：S24 戰術層的同構物。
//    S24：MobaTacticConfig.toEngineTactic(戰術) → knobs → engine.configureMatch
//    S28：mobaPlayerStats.toEnginePlayerMods(能力) → mods → engine.configurePlayers
//  依 S24 立下的先例，「knobs 形狀由呼叫端準備」——LogicEngine 不 import 本檔，
//  也不認得 16 項能力的鍵名；它只吃已算好的行為偏移量。
//
//  ── 紅線（Sprint28 §2）────────────────────────────────────────────────────
//  能力**只能**改行為傾向 / 決策門檻 / 參與概率 / 撤退門檻 / 路線 / Gank 節奏 /
//  推線深度 / 分推 / 目標集結。**不得**產生 damage / winRate / gold 倍率。
//    → 因此本檔刻意**不**輸出 power / tough：引擎的 p.power 直接乘進傷害式
//      （dmgAmt = p.power * dt * 0.92），注入它等同 damage multiplier ＝ 違規。
//      mobaRosterAdapter.calcMobaPower（Phase 13）算出的 power/tough 仍保留供
//      展示與未來使用，但**不進引擎**。這是本 Sprint 的自覺取捨，不是遺漏。
//
//  ── 中性值與 baseline（Sprint28 §4）──────────────────────────────────────
//  NEUTRAL_STAT = 70（＝ mobaRosterAdapter 的 ANCHOR：無資料選手的中性錨）。
//  u(v) = clamp((v − 70) / 30, −1, +1)  → 70 分 ⇒ u = 0 ⇒ **所有偏移量為 0**。
//  全中性能力 ⇒ mods 與 NEUTRAL_MODS 逐鍵相等 ⇒ 引擎公式加 0 / 乘 1 ⇒
//  逐位元回到 S27 baseline。引擎端另有 playerStatsOn 短路（雙保險）。
//
//  ── 未映射能力（誠實揭露；不虛構作用點）────────────────────────────────
//    · accuracy（精準度）：引擎唯一的「精準」表面是傷害，注入即違反 §2 紅線。
//    · learning（學習力）：引擎無跨場成長迴圈可掛（任務單明示可暫不映射）。
//  兩者仍完整影響 CS 引擎（fpsRoster）與戰術適性；只是 MOBA 引擎無可靠作用點。
// ============================================================================

/** 能力中性值：70 分 ⇒ 零偏移（與 mobaRosterAdapter ANCHOR 同源）。 */
export const NEUTRAL_STAT = 70;
/** 正規化跨距：40 分 → u=−1，100 分 → u=+1。 */
const SPAN = 30;
/** 契約版本（進 snapshot.playerStatsMeta，供 BattleResult 消費者辨識）。 */
export const MOBA_PLAYER_STATS_VERSION = "MobaPlayerStats.v1";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
/** 能力值 → 中性化係數 u ∈ [−1, +1]；缺值 ⇒ 視為中性（u = 0）。 */
const u = (stats, key) => {
  const v = Number.isFinite(stats?.[key]) ? stats[key] : NEUTRAL_STAT;
  return clamp((v - NEUTRAL_STAT) / SPAN, -1, 1);
};

/**
 * 16 項能力 → 9 個引擎作用點的權重表（唯一事實來源；文件與驗證腳本都讀這張表）。
 * 正負號的語意：
 *   retreatAdj ↑ = 更早撤退（門檻拉高）；laneAdj ↑ = 推得更深；
 *   gankIntervalScale ↓ = Gank 更頻繁。
 */
export const STAT_MAP = {
  // 撤退門檻（引擎預設 0.25）：謹慎/判斷 → 早撤；勇氣/抗壓/韌性 → 硬撐
  retreatAdj: { positioning: +0.040, decision: +0.030, focus: +0.020,
                courage: -0.050, clutch: -0.040, resilience: -0.020 },
  // 重返戰場門檻（引擎預設 0.60）：韌性/反應/應變 → 更快回場
  returnAdj: { resilience: -0.050, reflex: -0.040, adaptability: -0.030, positioning: +0.030 },
  // 團戰參與率（引擎預設 0.60 / 戰術 joinFight）
  joinAdj: { courage: +0.050, tacticalIQ: +0.040, synergy: +0.040, comms: +0.030, reflex: +0.030 },
  // 龍/巴龍集結率（引擎預設 0.60 / 戰術 dragonJoin、baronJoin）
  objAdj: { mapAware: +0.050, tacticalIQ: +0.050, focus: +0.040, comms: +0.030 },
  // 推線深度偏移（引擎預設 0；戰術 laneOffset 之上再疊加）
  laneAdj: { courage: +0.020, apm: +0.015, clutch: +0.010,
             positioning: -0.020, decision: -0.010 },
  // 打野 Gank 週期倍率（1 = 原節奏；視野/手速/決策 → 更頻繁）
  gankIntervalScale: { mapAware: -0.120, apm: -0.080, decision: -0.060 },
  // 打野 Gank 停留窗倍率（1 = 原 9 秒）
  gankWindowScale: { mapAware: +0.100, tacticalIQ: +0.050 },
  // 輔助遊走率（戰術 roamRate 之上疊加）
  roamAdj: { mapAware: +0.100, comms: +0.080, apm: +0.060, leadership: +0.050 },
  // 分推承諾度（戰術 splitPush 之上疊加）
  splitAdj: { adaptability: +0.080, decision: +0.060, courage: +0.050, focus: +0.040 },
  // 開局野區入侵率（戰術 invadeChance 之上疊加；只讀該側打野）
  invadeAdj: { courage: +0.080, mapAware: +0.060 },
};

/** 各作用點的限幅（§2「所有映射必須有限幅」）。 */
export const MOD_CLAMP = {
  retreatAdj: 0.10, returnAdj: 0.10, joinAdj: 0.15, objAdj: 0.15,
  laneAdj: 0.04, roamAdj: 0.20, splitAdj: 0.15, invadeAdj: 0.12,
};
/** 倍率型作用點的上下界。 */
export const SCALE_CLAMP = { gankIntervalScale: [0.75, 1.25], gankWindowScale: [0.85, 1.15] };

/**
 * 團隊層級加成：領導力（led）＝「隊伍決策一致性」。
 * 取該側 leadership 平均 → 對**全隊**的 joinAdj / objAdj 各加一小項。
 * 這是 Support（IGL，led 最高）能影響整隊、而非只影響自己的機制（§7 角色公平性）。
 */
const TEAM_LED_JOIN = 0.020;
const TEAM_LED_OBJ = 0.040;

/** 中性 mods（全 70 分的輸出；引擎公式加 0 / 乘 1 ⇒ baseline）。 */
export const NEUTRAL_MODS = Object.freeze({
  retreatAdj: 0, returnAdj: 0, joinAdj: 0, objAdj: 0, laneAdj: 0,
  gankIntervalScale: 1, gankWindowScale: 1, roamAdj: 0, splitAdj: 0, invadeAdj: 0,
});

/** 加權和：Σ w_i × u(stat_i)。 */
const wsum = (stats, table) => {
  let s = 0;
  for (const k in table) s += table[k] * u(stats, k);
  return s;
};
/** 浮點修整：避免 −0 與 1e−17 級尾數污染逐鍵比較。 */
const fix = (v) => Math.round(v * 1e6) / 1e6 + 0;

/**
 * 單一選手能力 → 行為 mods。
 * @param {Object} stats    derived 16 項能力（長鍵；缺鍵 ⇒ 中性）
 * @param {number} teamLedU 該側 leadership 平均的 u 值（團隊層級項）
 */
export function toPlayerMods(stats, teamLedU = 0) {
  const c = (key) => fix(clamp(wsum(stats, STAT_MAP[key]), -MOD_CLAMP[key], MOD_CLAMP[key]));
  const scale = (key) => {
    const [lo, hi] = SCALE_CLAMP[key];
    return fix(clamp(1 + wsum(stats, STAT_MAP[key]), lo, hi));
  };
  const join = clamp(wsum(stats, STAT_MAP.joinAdj) + TEAM_LED_JOIN * teamLedU, -MOD_CLAMP.joinAdj, MOD_CLAMP.joinAdj);
  const obj = clamp(wsum(stats, STAT_MAP.objAdj) + TEAM_LED_OBJ * teamLedU, -MOD_CLAMP.objAdj, MOD_CLAMP.objAdj);
  return {
    retreatAdj: c("retreatAdj"),
    returnAdj: c("returnAdj"),
    joinAdj: fix(join),
    objAdj: fix(obj),
    laneAdj: c("laneAdj"),
    gankIntervalScale: scale("gankIntervalScale"),
    gankWindowScale: scale("gankWindowScale"),
    roamAdj: c("roamAdj"),
    splitAdj: c("splitAdj"),
    invadeAdj: c("invadeAdj"),
  };
}

/**
 * 一側的 stat slots → { engineId: mods }（engine.configurePlayers 的入參形狀）。
 * @param {Array<{id:string, stats:Object}>} slots  mobaRosterAdapter.buildPlayerStatSlots 輸出
 * @returns {Object<string, ReturnType<typeof toPlayerMods>>}  空陣列 ⇒ 回 {}（＝全隊中性）
 */
export function toSideMods(slots = []) {
  const list = Array.isArray(slots) ? slots.filter((s) => s && typeof s.id === "string") : [];
  if (!list.length) return {};
  // 團隊 leadership 平均（缺 leadership 的 slot 以中性 70 計入 → 不因缺資料受懲罰）
  const teamLedU = list.reduce((s, x) => s + u(x.stats, "leadership"), 0) / list.length;
  const out = {};
  for (const s of list) out[s.id] = toPlayerMods(s.stats ?? {}, teamLedU);
  return out;
}

/**
 * 完整注入包：兩側 slots → engine.configurePlayers({ blue, red, meta }) 的入參。
 * 任一側無 slots ⇒ 該側為 {} ⇒ 引擎對該側每位選手取中性（baseline 行為）。
 * @returns {{blue:Object, red:Object, meta:Object}|null}  兩側皆空 ⇒ null（呼叫端據此不呼叫引擎）
 */
export function toEnginePlayerMods({ blue = [], red = [] } = {}) {
  const b = toSideMods(blue);
  const r = toSideMods(red);
  if (!Object.keys(b).length && !Object.keys(r).length) return null;
  return {
    blue: b, red: r,
    meta: {
      version: MOBA_PLAYER_STATS_VERSION,
      neutralStat: NEUTRAL_STAT,
      // 證據欄位：這場實際注入了哪些 engineId（Result / 驗證腳本可查對位）
      blueIds: Object.keys(b), redIds: Object.keys(r),
    },
  };
}
