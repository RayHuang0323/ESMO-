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
//  ── 本 Phase 的誠實邊界 ──
//    CHAMPIONS_100 目前「無戰鬥數值」，且不得修改 LogicEngine 演算法，故
//    slot.power / slot.tough 一律為 null（代表「沿用引擎預設，不覆蓋」）。
//    未來 CHAMPIONS_100 補上數值後，只需在此填入映射，介面與呼叫端不變。
// ============================================================================

/** 對齊 LogicEngine 的角色順序（5 個 slot）。⚠ 必須與 LogicEngine ROLES 一致。 */
export const ROLE_ORDER = ["top", "jungle", "mid", "adc", "sup"];

/** 對齊 LogicEngine ROLE_LANE。 */
export const ROLE_LANE = { top: "top", jungle: "mid", mid: "mid", adc: "bot", sup: "bot" };

/** CHAMPIONS_100 的中文 lane → LogicEngine role。 */
export const LANE_ZH_TO_ROLE = {
  "上路": "top", "打野": "jungle", "中路": "mid", "下路": "adc", "輔助": "sup",
};

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

  return ROLE_ORDER.map((role, i) => {
    const champ = byRole[role] || null;
    const player = roster[i];
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
      // 本 Phase 無數值來源（CHAMPIONS_100 無戰鬥數值、不改 LogicEngine）→ null＝不覆蓋預設
      power: null,
      tough: null,
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
