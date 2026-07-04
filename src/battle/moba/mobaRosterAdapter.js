// ============================================================================
//  mobaRosterAdapter.js — 平台資料 → LogicEngine 正式對接層（Phase 9）
//
//  這是「正式架構」，非 TODO 空殼：buildEngineSlots 內含真實、可測試的
//  轉換邏輯（英雄 lane → LogicEngine role slot 對位、身份與選手綁定）。
//  applyRosterToEngine 為正式注入介面，具能力偵測；未來 LogicEngine 開放
//  注入口（見下方契約）時，本層零改動即可生效。
//
//  ── 對齊依據（來自 LogicEngine 現況，逐一查證，不可臆造）──
//    ROLE_ORDER   = ["top","jungle","mid","adc","sup"]  ← LogicEngine ROLES
//    ROLE_LANE    = { top:top, jungle:mid, mid:mid, adc:bot, sup:bot }
//    LogicEngine player 可注入欄位：role / lane / power / tough（＋身份 name）
//    CHAMPIONS_100 欄位：{ id, zh, arch, lane(中文), diff, color }（⚠ 無戰鬥數值）
//
//  ── 戰力來源（Phase 13 起）──
//    CHAMPIONS_100 本身無戰鬥數值，故不「讀取」英雄數值，而是由既有資料
//    「推導」：英雄 arch/diff（定位）× 選手 16 維 stats（實力，經 calcPower）
//    × 角色基準（LogicEngine 預設）→ calcMobaPower / calcMobaTough。
//    未新增任何 Hero Schema。詳見下方公式模組（設計 Phase 11、驗證 Phase 12）。
//    slot 無英雄時 power/tough 仍為 null（＝沿用引擎預設，向下相容 Phase 10）。
// ============================================================================

/** 對齊 LogicEngine 的角色順序（5 個 slot）。⚠ 必須與 LogicEngine ROLES 一致。 */
export const ROLE_ORDER = ["top", "jungle", "mid", "adc", "sup"];

/** 對齊 LogicEngine ROLE_LANE。 */
export const ROLE_LANE = { top: "top", jungle: "mid", mid: "mid", adc: "bot", sup: "bot" };

/** CHAMPIONS_100 的中文 lane → LogicEngine role。 */
export const LANE_ZH_TO_ROLE = {
  "上路": "top", "打野": "jungle", "中路": "mid", "下路": "adc", "輔助": "sup",
};

// ============================================================================
//  Phase 13：MOBA 戰力公式（calcMobaPower / calcMobaTough）正式套入
//
//  設計＝Phase 11，驗證＝Phase 12（diff/player 機制、錨定、對稱性皆通過）。
//  Battle Engine 應自足、不依賴平台 UI 檔，故下列常數為「鏡像自
//  EsportsGame.jsx」——若平台端的 calcPower 權重/性格/係數調整，需同步此處
//  （已於測試中以真實 INITIAL_ROSTER 值錨定，確保與平台 calcPower 一致）。
//
//  ⚠ 不改 LogicEngine：ROLE_POWER / ROLE_TOUGH 為 LogicEngine 建構子的預設值，
//    公式以此為「錨」，任何偏移都相對於引擎既有基準，可回歸驗證。
// ============================================================================

/** 鏡像 EsportsGame.jsx MOBA_WEIGHTS（16 維權重）。 */
const MOBA_WEIGHTS = { reflex:1.0, accuracy:0.8, apm:1.2, positioning:1.1, mapAware:1.3, tacticalIQ:1.2, decision:1.1, adaptability:0.9, courage:1.0, clutch:0.8, focus:0.9, resilience:0.7, comms:1.0, leadership:0.8, synergy:1.1, learning:0.6 };
const STAT_KEYS = Object.keys(MOBA_WEIGHTS);
/** 鏡像 EsportsGame.jsx PERSONALITY 的 boost/nerf（僅公式所需部分）。 */
const PERS_BN = {
  aggressive:{ b:["courage","reflex"],       n:["decision","focus"] },
  defensive: { b:["positioning","focus"],    n:["courage","apm"] },
  calm:      { b:["clutch","decision"],      n:["courage","apm"] },
  passionate:{ b:["courage","leadership"],   n:["focus","synergy"] },
  genius:    { b:["reflex","learning"],      n:["synergy","resilience"] },
  grinder:   { b:["accuracy","focus"],       n:["adaptability","learning"] },
  shotcaller:{ b:["comms","leadership"],     n:["accuracy","apm"] },
  lonewolf:  { b:["apm","reflex"],           n:["comms","synergy"] },
  steady:    { b:["resilience","positioning"],n:["courage","reflex"] },
  creative:  { b:["adaptability","learning"],n:["focus","resilience"] },
};
const MORALE_EFFECT = (m) => m >= 85 ? 1.08 : m >= 65 ? 1.0 : m >= 45 ? 0.92 : 0.80;
const CONDITION_EFFECT = { "精神飽滿":1.06, "正常":1.0, "疲勞":0.90, "低潮":0.78 };

/** LogicEngine 建構子預設（錨基準）。⚠ 必須與 LogicEngine 一致。 */
const ROLE_POWER = { top:30, jungle:34, mid:36, adc:42, sup:18 };
const ROLE_TOUGH = { top:1.6, jungle:1.15, mid:0.9, adc:0.8, sup:1.25 };
/** Phase 11 arch 攻守調節表（ARCH_P 幾何均≈1.0，攻守互償）。 */
const ARCH_P = { "坦克":0.90, "戰士":1.00, "刺客":1.10, "法師":1.06, "射手":1.08, "輔助":0.92 };
const ARCH_T = { "坦克":1.12, "戰士":1.06, "刺客":0.92, "法師":0.95, "射手":0.93, "輔助":1.05 };
/** Phase 11 可調參數（Phase 12 驗證：均無須調整）。 */
const K_PLAYER = 0.5, ANCHOR = 70, K_DIFF = 0.25, K_TOUGH = 0.25;
const CL_P = [0.72, 1.32], CL_T = [0.80, 1.20], CL_PS = [0.80, 1.20], CL_TS = [0.90, 1.10];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * 忠實重現 EsportsGame.jsx 的 calcPower(player,"moba")：16 維 × 權重 × 性格 × 士氣 × 狀態。
 * 選手資料缺失時退化為中性值（stats 缺→50、morale→70、condition→正常），
 * 使公式在資料不全時仍安全收斂，不致 NaN。
 * @returns {number} 綜合戰力（約 1–99 帶修正）
 */
export function calcPlayerMobaPower(player) {
  const stats = (player && player.stats) || {};
  const bn = (player && PERS_BN[player.personality]) || null;
  let total = 0, wsum = 0;
  for (const k of STAT_KEYS) {
    let v = stats[k] != null ? stats[k] : 50;
    if (bn && bn.b.includes(k)) v += 8;
    if (bn && bn.n.includes(k)) v -= 5;
    v = clamp(v, 1, 99);
    total += v * MOBA_WEIGHTS[k];
    wsum += MOBA_WEIGHTS[k];
  }
  const base = total / wsum;
  const morale = (player && player.morale != null) ? player.morale : 70;
  const cond = (player && player.condition) || "正常";
  return Math.round(base * MORALE_EFFECT(morale) * (CONDITION_EFFECT[cond] != null ? CONDITION_EFFECT[cond] : 1));
}

/**
 * calcMobaPower：角色基準 × 英雄 arch 攻擊定位 × 選手實力縮放 × 難度賭注。
 * 四層相乘、最終硬 clamp（power 相對 ROLE_POWER 的 −28%~+32% 帶內）。
 * @param {string} role   LogicEngine role（top/jungle/mid/adc/sup）
 * @param {string} arch   英雄定位（坦克/戰士/刺客/法師/射手/輔助）
 * @param {number} diff   英雄難度（1–3）
 * @param {Object} player 選手物件（stats/personality/morale/condition）
 * @returns {number}
 */
export function calcMobaPower(role, arch, diff, player) {
  const rp = ROLE_POWER[role]; if (rp == null) return null;
  const ap = ARCH_P[arch] != null ? ARCH_P[arch] : 1.0;
  const cp = calcPlayerMobaPower(player);
  const ps = clamp(1 + K_PLAYER * (cp - ANCHOR) / ANCHOR, CL_PS[0], CL_PS[1]);
  const dm = 1 + K_DIFF * ((diff || 2) - 2) * (ps - 1); // 難度放大既有實力差（均值選手＝零淨值）
  const P = rp * ap * ps * dm;
  return +clamp(P, rp * CL_P[0], rp * CL_P[1]).toFixed(2);
}

/**
 * calcMobaTough：角色基準 × 英雄 arch 防守定位 × 選手實力縮放（tough 側係數減半）。
 * @returns {number}
 */
export function calcMobaTough(role, arch, player) {
  const rt = ROLE_TOUGH[role]; if (rt == null) return null;
  const at = ARCH_T[arch] != null ? ARCH_T[arch] : 1.0;
  const cp = calcPlayerMobaPower(player);
  const ts = clamp(1 + K_TOUGH * (cp - ANCHOR) / ANCHOR, CL_TS[0], CL_TS[1]);
  const T = rt * at * ts;
  return +clamp(T, rt * CL_T[0], rt * CL_T[1]).toFixed(3);
}

/**
 * 由 BattleConfig（roster + draft）建構「對齊 LogicEngine 的 5 個 slot」。
 * 純函式，不依賴 React / 不依賴引擎；輸出即未來 engine.applyRoster 的入參。
 *
 * @param {import("../../platform/contracts/BattleConfig.js").BattleConfig|null} cfg
 * @returns {Array<{
 *   slot:number, role:string, lane:string,
 *   champion: (Object|null), playerName: (string|null),
 *   power: (number|null), tough: (number|null)
 * }>} 固定長度 5，依 ROLE_ORDER 排列
 */
export function buildEngineSlots(cfg) {
  const picks = (cfg && cfg.draft && cfg.draft.picks && Array.isArray(cfg.draft.picks.blue))
    ? cfg.draft.picks.blue : [];
  const roster = (cfg && Array.isArray(cfg.roster)) ? cfg.roster : [];

  // 先把 picks 依其 lane 歸位到 role；同 lane 溢位者順延填補空缺 slot。
  const byRole = { top: null, jungle: null, mid: null, adc: null, sup: null };
  const overflow = [];
  for (const champ of picks) {
    const role = champ && LANE_ZH_TO_ROLE[champ.lane];
    if (role && !byRole[role]) byRole[role] = champ;
    else overflow.push(champ);
  }
  for (const role of ROLE_ORDER) {
    if (!byRole[role] && overflow.length) byRole[role] = overflow.shift();
  }

  // 選手同樣依「中文 role → LogicEngine role」歸位，確保「該路選手 × 該路英雄」正確配對
  // 計算戰力（而非依陣列索引）。無 role 或對不上者順延填補（向下相容既有索引行為）。
  const byRoleStarter = { top: null, jungle: null, mid: null, adc: null, sup: null };
  const starterOverflow = [];
  for (const p of roster) {
    const role = (p && typeof p === "object" && LANE_ZH_TO_ROLE[p.role]) || null;
    if (role && !byRoleStarter[role]) byRoleStarter[role] = p;
    else starterOverflow.push(p);
  }
  for (const role of ROLE_ORDER) {
    if (!byRoleStarter[role] && starterOverflow.length) byRoleStarter[role] = starterOverflow.shift();
  }

  return ROLE_ORDER.map((role, i) => {
    const champ = byRole[role] || null;
    const player = byRoleStarter[role] || null;

    // ── Phase 13：戰力正式套入 ──
    // 僅當該 slot 有英雄（arch/diff 才有意義）時計算 power/tough；
    // 無英雄 → null＝不覆蓋 LogicEngine 預設（＝ Phase 10 行為，向下相容）。
    const hasChamp = !!champ;
    const power = hasChamp ? calcMobaPower(role, champ.arch, champ.diff, player) : null;
    const tough = hasChamp ? calcMobaTough(role, champ.arch, player) : null;

    return {
      slot: i,
      role,
      lane: ROLE_LANE[role],
      champion: champ ? {
        id: champ.id, zh: champ.zh, arch: champ.arch, lane: champ.lane,
        diff: champ.diff, color: champ.color,
      } : null,
      playerName: (player && typeof player === "object")
        ? (player.name ?? player.zh ?? null)
        : (typeof player === "string" ? player : null),
      power, // 有英雄→calcMobaPower；無英雄→null（沿用引擎預設）
      tough, // 有英雄→calcMobaTough；無英雄→null（沿用引擎預設）
    };
  });
}

/**
 * 正式注入介面（能力偵測）。
 *
 * 契約：未來 LogicEngine 若提供 `engine.applyRoster(slots)`（或 `engine.roster`
 * setter），本函式即呼叫之並回報 applied:true。目前 LogicEngine 尚未開放
 * 注入口，故回報 applied:false 並附原因——這不是失敗，是本 Phase 的預期狀態
 *（「建立資料流，不一定要真正套用到 LogicEngine」）。呼叫端據此決定行為，
 * 引擎現有 tick / 演算法完全不受影響。
 *
 * @param {Object} engine  LogicEngine 實例
 * @param {ReturnType<typeof buildEngineSlots>} slots
 * @returns {{ applied:boolean, reason?:string, slots:Array }}
 */
export function applyRosterToEngine(engine, slots) {
  if (!engine || !Array.isArray(slots)) {
    return { applied: false, reason: "engine 或 slots 無效", slots: slots || [] };
  }
  if (typeof engine.applyRoster === "function") {
    engine.applyRoster(slots); // 未來 LogicEngine 開放此方法時自動生效
    return { applied: true, slots };
  }
  return {
    applied: false,
    reason: "LogicEngine 尚未開放外部 roster 注入口（engine.applyRoster 不存在）；資料流已就緒，等引擎支援即接通。",
    slots,
  };
}
