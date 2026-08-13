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
 * 本場次是否已經有對應這筆 matchId 的結算紀錄。
 *
 * 掃 ledger 而不另建索引：結算一場才掃一次，且**不引入第二份真相**
 * （trace 已經存了 matchId 與 sessionId），舊存檔也不必遷移。
 */
function settledInThisSession(ledger, result) {
  for (const s of Object.values(ledger ?? {})) {
    if (s?.trace?.matchId === result?.matchId && s?.trace?.sessionId === result?.sessionId) return true;
  }
  return false;
}

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
  //  ⚠ 只有在**結果確實屬於當下場次**時才走這條捷徑。否則「拿舊結果去別的場次
  //    重送」會拿到一張 ok:true 的 receipt——下游的賽程完成邊界看 `receipt.ok`
  //    就會被騙。不屬於本場的，一律往下走驗證，由 session_mismatch 拒絕。
  const settlementId = settlementIdOf(result);
  const existing = ledger[settlementId];
  if (existing && isSameResult(known, result) && (!session || result?.sessionId === session.sessionId)) {
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

  //  ③b **跨場次防串**：這筆對戰的進度先前已入帳，但本場次沒有任何對應它的
  //  結算紀錄 ⇒ 這份結果來自**別場**，不是本場打出來的。
  //
  //  為什麼非擋不可：`createMatchResult` 是把「當下場次的身分」蓋到呼叫端遞來的
  //  outcome 上，所以一份舊 BattleResult 重送時會被重新蓋章成一份**形式上完全
  //  合法**的本場結果——contentHash 重算得過、與 session 逐欄相符、與 lastResult
  //  也不衝突（sessionId 不同 ⇒ 衝突偵測不觸發）。錢因為 S25 冪等不會重複發，
  //  但**場次會被舊結果佔用並標成 completed**，本場真正的賽果從此再也結算不進去。
  //  對賽程場次而言，這等同於用別場的勝負去完成這一場。
  //
  //  ⚠ 這道關卡放在此處而不是下游的賽程完成邊界：下游只能決定「要不要寫賽程
  //    紀錄」，擋不住 session 與 lastResult 被寫壞。
  if (applied.receipt?.alreadyApplied && !settledInThisSession(ledger, result)) {
    const failure = {
      ok: false, settled: false, alreadySettled: false,
      settlementId, resultId: result.resultId,
      errors: [{ code: "foreign_result", message: "這份對戰結果屬於另一場比賽，不得用於本場次結算" }],
      reason: "這份對戰結果屬於另一場比賽，不得用於本場次結算",
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
