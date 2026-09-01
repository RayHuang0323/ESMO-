// ============================================================================
//  platform/contracts/cbrDecisionGate.js — CBR 下一步的**決策閘**（V7-2.9）
//
//  ── 為什麼要把決策寫成程式碼 ──────────────────────────────────────────────
//  V7 這條線上已經發生過兩次「差點拿被汙染的證據去調參數」：
//    ① TD-53 的槽位偏差，實際上是 harness 沒對齊 role（n=30 還誤判已歸零）。
//    ② TD-52 的 `starExcess`，第一版數字疊著 +19.25pp 的戰術擁有權優勢。
//  兩次都是靠**事後發現**擋下來的。第三次的風險更大：AWP slot 崩潰
//  （mirage 1.7% / inferno 0.0%）如果是缺陷，而我們拿它校準 role-aware 估值，
//  那個缺陷就會被**編進定價**，而且從此看起來像是「設計」。
//
//  ⇒ 所以把閘寫成常數與斷言，讓「還沒 triage 就開始 role-aware」這件事
//    在 verifier 層失敗，而不是靠人記得。
//
//  ⚠ 本檔**不改變任何 production 行為**。它只宣告狀態與允許的下一步，
//    由 `tools/check_online_valuation_v29.mjs` 強制。
//
//  純函式：不 import React / zustand / localStorage / 亂數 / 時鐘。
// ============================================================================

export const CBR_DECISION_GATE_VERSION = "CbrDecisionGate.v1";

/** AWP slot triage 的三種結果。**由 CS owner 判定，不由本層猜測。** */
export const AWP_TRIAGE = Object.freeze({
  /** 引擎行為是缺陷 ⇒ 等修正，修完只做受限的重新校準。 */
  BUG: "BUG",
  /** 引擎行為是刻意設計 ⇒ 可以開始 role-aware valuation 實驗。 */
  DESIGN: "DESIGN",
  /** 還沒判定 ⇒ CBR 全面 BLOCKED。 */
  UNRESOLVED: "UNRESOLVED",
});

/**
 * **目前狀態。** Codex 正在 triage；在它回報之前，這裡就是 UNRESOLVED。
 *
 * ⚠ 改這個常數等於宣稱 triage 有結果。改之前必須附上 CS owner 的判定，
 *   以及一份符合 `CalibrationEvidence.v1` 的證據。
 */
export const AWP_TRIAGE_STATUS = AWP_TRIAGE.UNRESOLVED;

/**
 * 觀察到的現象本身（不是判定）。留在這裡是為了讓後續讀者不必回頭翻 artifacts。
 */
export const AWP_OBSERVATION = Object.freeze({
  summary: "90 分選手放在 awp 席位、其餘四人 46，對 flat 64×5 幾乎必敗",
  cells: Object.freeze([
    Object.freeze({ map: "mirage", tactic: "t_apalace", winRate: 0.017, ci95: 0.027, n: 120 }),
    Object.freeze({ map: "inferno", tactic: "t_banana", winRate: 0.000, ci95: 0.016, n: 120 }),
  ]),
  contrastCells: Object.freeze([
    Object.freeze({ map: "mirage", tactic: "t_apalace", seat: "entry", winRate: 0.908, n: 120 }),
    Object.freeze({ map: "inferno", tactic: "t_banana", seat: "support", winRate: 0.883, n: 120 }),
  ]),
  evidence: "artifacts/cbr-fairness/td52_slotrot_{mirage,inferno}.json",
  candidateCauses: Object.freeze([
    "AWP 購買成本 × 弱隊友的回合經濟",
    "awp 席位的 route／架點行為",
    "ROLE_GUNS 對 awp 的武器指派與 buy 邏輯交互",
  ]),
});

/** 每個 triage 結果各自解鎖什麼。**這是本檔的重點。** */
export const GATE_PLAN = Object.freeze({
  [AWP_TRIAGE.BUG]: Object.freeze({
    cbrBlocked: true,
    allowRoleAwareValuation: false,
    allowRatingStart: false,
    nextStep: "等 CS owner 修正 runtime → 只對受影響的 cell 做 limited recalibration → 再評 valuation 形狀",
    reason: "拿缺陷行為校準出來的 role 權重，會把缺陷變成定價規則",
  }),
  [AWP_TRIAGE.DESIGN]: Object.freeze({
    cbrBlocked: false,
    allowRoleAwareValuation: true,
    allowRatingStart: false,
    nextStep: "開始 role-aware valuation 實驗；context-aware 需另行決策（tactic 在配對後才選定）",
    reason: "行為是設計 ⇒ 估值必須反映它，否則定價與實際勝負長期分岔",
  }),
  [AWP_TRIAGE.UNRESOLVED]: Object.freeze({
    cbrBlocked: true,
    allowRoleAwareValuation: false,
    allowRatingStart: false,
    nextStep: "等 triage。期間不得調整 starExcess / MATCH_BAND，不得開始 Rating",
    reason: "不知道引擎行為是對是錯之前，任何校準都可能在校準一個缺陷",
  }),
});

/** 目前這個狀態允許做什麼。 */
export function gateStateOf(status = AWP_TRIAGE_STATUS) {
  const plan = GATE_PLAN[status];
  if (!plan) throw new Error(`[CBR_GATE_UNKNOWN_STATUS] ${status}`);
  return Object.freeze({ schema: CBR_DECISION_GATE_VERSION, status, ...plan });
}

/**
 * 守門用：想開始某件事之前先問這裡。
 *
 * @param {"roleAwareValuation"|"ratingStart"|"recalibration"} action
 * @returns {{allowed:boolean, reason:string, nextStep:string}}
 */
export function canStart(action, status = AWP_TRIAGE_STATUS) {
  const g = gateStateOf(status);
  const allowed = action === "roleAwareValuation" ? g.allowRoleAwareValuation
    : action === "ratingStart" ? g.allowRatingStart
      : action === "recalibration" ? !g.cbrBlocked
        : false;
  return { allowed, reason: g.reason, nextStep: g.nextStep };
}
