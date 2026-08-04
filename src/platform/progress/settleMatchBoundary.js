// ============================================================================
//  platform/progress/settleMatchBoundary.js — 賽後結算的**唯一邊界**（O7.1）
//
//  ── 為什麼需要這一支 ──────────────────────────────────────────────────────
//  O7 建立了 `MatchResult.v1` 與單次結算，但真實的賽後流程還沒接上：
//    · MOBA 在 `useBattleFeed` 終局分支直接呼叫 `applyMatchProgress`
//    · CS 在 `settleCsMatch` 直接呼叫 `applyMatchProgress`
//  兩條路都繞過了場次綁定與衝突偵測。
//
//  本檔把兩條路收斂成**同一個邊界**：
//      比賽結束 → settleMatchThroughSession() → reportMatchResult()（O7）
//                                            → applyMatchProgress()（S25，唯一入帳）
//
//  ⚠ 仍然**沒有第二套結算**：實際入帳一律是 S25 的 `applyMatchProgress`。
//    O7 這一層只負責「綁定場次、防重送、防衝突、記錄追蹤鏈」。
//
//  ── 沒有場次的情況（誠實揭露）────────────────────────────────────────────
//  debug harness（`?debug=moba-runtime-battle`）或舊存檔殘留的流程可能在
//  **沒有 MatchSession** 的狀態下打完一場。這時仍走 S25 入帳（否則獎勵會憑空消失），
//  但回傳 `viaSession: false` 明確標記——**那一場沒有經過權威驗證**。
//  這是刻意的取捨：寧可標記清楚，也不要讓玩家的獎勵默默不見。
// ============================================================================
import { useProfileStore } from "../profileStore.js";
import { SESSION_STATES } from "../contracts/matchSession.js";

/**
 * 賽後結算的唯一入口。MOBA 與 CS 共用。
 *
 * @param {object} p
 * @param {"moba"|"cs"} p.mode
 * @param {object} p.outcome     { matchId, winner:"us"|"opponent", score:{us,opponent}, durationSec }
 * @param {object} p.transaction MatchProgressTransaction.v1（既有 adapter 產生）
 * @returns {{receipt:object|null, viaSession:boolean, errors:Array}}
 */
export function settleMatchThroughSession({ mode, outcome, transaction }) {
  const store = useProfileStore.getState();
  if (!transaction) {
    return { receipt: null, viaSession: false, errors: [{ code: "no_transaction", message: "無法建立賽後結算交易" }] };
  }
  const session = store.matchmaking?.session ?? null;
  //  ⚠ 必須把 `completed` 也算進來。首次結算會把場次標成 completed，
  //  若這裡只認 `launched`，第二次回報（Result 畫面重整、重送）就會退回 S25 路徑——
  //  雖然 S25 本身冪等不會重複入帳，但**拿不到 O7 的 receipt，也不會偵測衝突**，
  //  等於「同一場送不同勝負」會被默默忽略而不是拒絕。（驗證器 3c/4/5 抓到過）
  const usable = !!session && session.mode === mode &&
    (session.state === SESSION_STATES.launched || session.state === SESSION_STATES.completed);

  if (usable) {
    //  權威路徑：場次綁定 ＋ 防重送 ＋ 防衝突 ＋ 追蹤鏈（實際入帳仍在 S25）
    const r = store.reportMatchResult(outcome, transaction);
    return { receipt: r.receipt, viaSession: true, errors: r.errors ?? [] };
  }

  //  無場次：仍入帳（不讓獎勵消失），但明確標記未經權威驗證
  const receipt = store.applyMatchProgress(transaction);
  return {
    receipt,
    viaSession: false,
    errors: [],
  };
}

/**
 * 由 BattleResult.v2 產生 O7 需要的 outcome。
 * ⚠ 不重新統計：winner / score / duration 全部照抄 BattleResult。
 */
export function outcomeFromBattleResult(br, matchId, home = "blue") {
  const away = home === "blue" ? "red" : "blue";
  return {
    matchId,
    winner: br?.winner === home ? "us" : "opponent",
    score: { us: Number(br?.score?.[home]) || 0, opponent: Number(br?.score?.[away]) || 0 },
    durationSec: Number(br?.duration) || 0,
  };
}

/** 由 CsMatchResult.v1 產生 O7 需要的 outcome。 */
export function outcomeFromCsResult(cr) {
  return {
    matchId: cr?.matchId,
    winner: cr?.winner === "us" ? "us" : "opponent",
    score: { us: Number(cr?.ourScore) || 0, opponent: Number(cr?.enemyScore) || 0 },
    durationSec: Number(cr?.durationSec) || 0,
  };
}
