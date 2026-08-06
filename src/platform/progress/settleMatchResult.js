// ============================================================================
//  platform/progress/settleMatchResult.js — 單次結算（Milestone O7）
//
//  ── 這一層要解決什麼 ──────────────────────────────────────────────────────
//  S25 的 `applyMatchProgress` 已經是**唯一發獎入口**，而且以 transactionId
//  冪等。O7 需要的是把它**綁到場次與結果契約**上，並補三件事：
//    ① 結果必須先通過 `MatchResult.v1` 驗證（來源可信、與場次一致、無衝突）
//    ② 結算 receipt、失敗原因與追蹤鏈要被保存下來
//    ③ 結算中斷後可安全重試——**不得重複入帳，也不得只完成一半**
//
//  ⚠ **不建立第二套結算流程**：本檔不自己加錢／加經驗／扣體力，
//    一律委派 `applyProgressToState`。它只負責「該不該讓那一步發生」與「記錄」。
//
//  ── 為什麼重試是安全的 ────────────────────────────────────────────────────
//  `applyProgressToState` 回傳的是一個**完整的 nextState**，呼叫端一次 set()。
//  中途失敗不會留下半套狀態（沒有寫入就是沒有寫入）。
//  重試時 transactionId 相同 ⇒ 已套用過就回既有 receipt，不會二次入帳。
//
//  純函式：不 import React / zustand / localStorage。
// ============================================================================
import { applyProgressToState } from "./applyMatchProgress.js";
import { validateMatchResult, isSameResult } from "../contracts/matchResult.js";
import { completeSession } from "../contracts/matchSession.js";

function hash8(input) {
  const s = typeof input === "string" ? input : JSON.stringify(input);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

/** 結算識別碼：由結果識別碼推導 ⇒ 同一份結果永遠同一個 settlementId。 */
export const settlementIdOf = (result) => `settle:${hash8(result?.resultId ?? "")}`;

/**
 * 純 reducer：結果 + 進度交易 → 單次結算。
 *
 * @param {object} state    profileStore 狀態
 * @param {object} p
 * @param {object} p.result MatchResult.v1
 * @param {object} p.session MatchSession.v1（用來驗證與標記完成）
 * @param {object} p.transaction MatchProgressTransaction.v1（由既有 adapter 產生）
 * @param {number} p.now
 * @returns {{nextState:object|null, receipt:object}}
 *   nextState = null ⇒ **完全沒有寫入**（驗證失敗）或已結算過（回既有 receipt）。
 */
export function settleMatchResultInState(state, { result, session, transaction, now = 0 } = {}) {
  const mm = state.matchmaking ?? {};
  const ledger = mm.settlements ?? {};
  const known = mm.lastResult ?? null;

  //  ① 冪等：同一份結果重送 ⇒ 回既有 receipt，不重複入帳
  const settlementId = settlementIdOf(result);
  const existing = ledger[settlementId];
  if (existing && isSameResult(known, result)) {
    return { nextState: null, receipt: { ...existing, alreadySettled: true } };
  }

  //  ② 驗證結果（來源、與場次一致、與已知結果衝突）
  const v = validateMatchResult(result, { session, known });
  if (!v.ok) {
    const failure = {
      ok: false, settled: false, alreadySettled: false,
      settlementId, resultId: result?.resultId ?? null,
      errors: v.errors,
      //  失敗原因要保存下來（可稽核、可顯示）
      reason: v.errors[0]?.message ?? "結果驗證失敗",
      failedAt: now,
    };
    return {
      nextState: { matchmaking: { ...mm, lastSettlementError: failure } },
      receipt: failure,
    };
  }

  //  ③ 委派 S25 的唯一結算入口（不自己加錢／加經驗／扣體力）
  const applied = applyProgressToState(state, transaction);
  if (!applied.nextState && !applied.receipt?.alreadyApplied) {
    const failure = {
      ok: false, settled: false, alreadySettled: false,
      settlementId, resultId: result.resultId,
      errors: applied.receipt?.errors ?? [{ code: "progress", message: "賽後結算被拒絕" }],
      reason: applied.receipt?.errors?.[0] ?? "賽後結算被拒絕",
      failedAt: now,
    };
    return {
      nextState: { matchmaking: { ...mm, lastSettlementError: failure } },
      receipt: failure,
    };
  }

  const progressReceipt = applied.receipt;
  const receipt = {
    ok: true,
    settled: true,
    alreadySettled: !!progressReceipt.alreadyApplied,
    settlementId,
    //  ── 完整追蹤鏈 ──────────────────────────────────────────────────────
    trace: {
      ticketId: session?.ticketId ?? null,
      assignmentId: session?.assignmentId ?? null,
      roomId: session?.roomId ?? null,
      sessionId: session?.sessionId ?? null,
      matchId: result.matchId,
      resultId: result.resultId,
      settlementId,
      transactionId: transaction?.transactionId ?? null,
    },
    mode: result.mode,
    winner: result.winner,
    seed: result.seed,
    resultSource: result.resultSource,
    //  賽後實際入帳的差額（來自 S25 receipt，不另算一套）
    team: progressReceipt.team ?? null,
    totals: progressReceipt.totals ?? null,
    players: progressReceipt.players ?? [],
    settledAt: now,
    errors: [],
  };

  //  ④ 標記場次完成（形成 session → matchId → resultId → settlementId 的鏈）
  const done = session ? completeSession(session, {
    matchId: result.matchId, resultId: result.resultId, settlementId, now,
  }) : { ok: false, session: null };

  const nextState = {
    //  applied.nextState 可能為 null（S25 已套用過）⇒ 那就只更新結算帳本
    ...(applied.nextState ?? {}),
    matchmaking: {
      ...mm,
      session: done.ok ? done.session : (mm.session ?? null),
      lastResult: result,
      settlements: { ...ledger, [settlementId]: receipt },
      lastSettlementError: null,
    },
  };
  return { nextState, receipt };
}

/** 查詢：這份結果是否已結算過。 */
export function findSettlement(state, result) {
  return (state?.matchmaking?.settlements ?? {})[settlementIdOf(result)] ?? null;
}
