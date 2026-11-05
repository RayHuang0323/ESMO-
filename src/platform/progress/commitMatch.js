// ============================================================================
//  platform/progress/commitMatch.js — BP-9 P0-A：一場比賽的提交（MOBA 與 CS 共用規則）
//
//  ── 規則 ──────────────────────────────────────────────────────────
//  **profile 那一次 setItem 就是提交點。** 帳本寫進去才算這場發生；沒寫進去，
//  記憶體要還原成跟磁碟一樣，熟練與 Season 一個字都不能動。
//
//    MOBA  ① 寫日誌 → ② 一次寫完 profile（結算＋賽程回寫）→ ③ 熟練、Season → ④ 刪日誌
//    CS    ② 一次寫完 profile（結算＋賽程回寫＋csHistory）。沒有其他鍵，所以不用日誌
//
//  每個中斷點的結果（`check_bp9_commit_p0a` 逐一驗）：
//    ①失敗／①②之間中斷  profile 沒帳 ⇒ 當作沒發生，可以重試或重打
//    ②失敗              同上
//    ②③之間中斷         profile 有帳 ⇒ 開機補完 ③（有防重，補幾次都一樣）
//    ③失敗              帳已入 ⇒ 留日誌，提示玩家，開機或重試時補完
//
//  ⚠ 日誌只有一格。**已入帳的日誌絕不覆蓋**：寫下一筆之前要先把它補完，補不完就拒絕，
//    開新比賽與推進日曆也會被擋（profileStore._saveBlockedReason）。熟練的防重標記
//    只留最新一場，所以「不會有第二場插隊」是防重成立的前提，不是最佳化。
//
//  ⚠ 這裡不算任何獎勵、不判勝負、不碰模擬。結算還是 settleMatchThroughSession。
//  ⚠ 不自動補償舊存檔已經有的異常（Owner 決定），只由 detectCommitAnomalies 回報。
// ============================================================================
import { useProfileStore } from "../profileStore.js";
import { useHeroProgressStore } from "../../hero/heroProgressStore.js";
import { useSeasonStore } from "../seasonStore.js";
import { SESSION_STATES, isSessionTerminal } from "../contracts/matchSession.js";
import { FIXTURE_TERMINAL } from "../contracts/competition.js";
import { settleMatchThroughSession, outcomeFromBattleResult } from "./settleMatchBoundary.js";
import {
  ALERT_KINDS, JOURNAL_STATES, clearCommitAlert, clearJournal, commitKeyOf, detectCommitAnomalies,
  hasUnfinishedCommit, journalResult, loadCommitAlert, readJournal, registerOutstandingSettler, withJournalRoom, recordAudit, appendAudit, setCommitAlert, useCommitAlertStore, writeJournal,
} from "../persistence/matchCommit.js";

const profile = () => useProfileStore.getState();
const liveSession = () => profile().matchmaking?.session ?? null;
const ledgerHas = (txId) => !!txId && !!(profile().processedMatchTransactions ?? {})[txId];
//  ⚠ 場次已經被放棄或取消（例如棄權）：結算邊界會把它當成「沒有場次」照樣入帳，
//    所以要在這裡擋，否則賽程已棄權的比賽還能拿到獎金。
const sessionGivenUp = () => [SESSION_STATES.abandoned, SESSION_STATES.cancelled].includes(liveSession()?.state);

function fixtureStatusOf(fixtureId) {
  for (const mode of ["moba", "cs"]) {
    const f = (profile().competitionByMode?.[mode]?.fixtures ?? []).find((x) => x.id === fixtureId);
    if (f) return f.status;
  }
  return null;
}

/**
 * ⚠ 重試前一定要確認當時那個場次還在進行。場次換掉之後再送，結算邊界會走「沒有場次」
 *   那條路：獎金入帳但賽程沒有收尾，正好製造出這次要消滅的矛盾。
 */
const retryWhileSessionLive = (p, run) => () => {
  if (p.sessionId) {
    const s = liveSession();
    const live = s?.sessionId === p.sessionId && (s.state === SESSION_STATES.launched || s.state === SESSION_STATES.completed);
    if (!live) {
      useCommitAlertStore.setState({ retry: null });
      return { ok: false, stage: "stale", receipt: null };
    }
  }
  return run();
};

function raiseMatchAlert(p, stage, retry) {
  //  練習賽沒有賽程要處理，也不該叫玩家去棄權：只要讓他知道沒存到。
  const kind = p.practice ? ALERT_KINDS.save : ALERT_KINDS.match;
  setCommitAlert(
    { kind, commitKey: p.commitKey, mode: p.mode, fixtureId: p.fixtureId ?? null, sessionId: p.sessionId ?? null, stage, at: Date.now(), ...(p.full === true ? { full: true } : {}) },
    { retry: retryWhileSessionLive(p, retry) },
  );
}

function clearAlertFor(p) {
  const a = useCommitAlertStore.getState().alert;
  if (!a) return;
  const same = a.commitKey === p.commitKey || (!!p.fixtureId && a.fixtureId === p.fixtureId);
  if (same || a.kind === ALERT_KINDS.save) clearCommitAlert();
  else reconcileCommitAlert();
}

/** 帳已入，補完熟練與 Season。兩邊都防重，呼叫幾次都一樣。 */
function finishDerived(j, full) {
  const result = full ?? j.result;
  const hero = useHeroProgressStore.getState().applyCommitted(j.commitKey, result);
  let season = useSeasonStore.getState().recordCommitted(j.commitKey, result);
  //  熟練已落盤、只差 Season：日誌讓出空間再試一次。
  if (hero.persisted && !season.persisted) {
    season = withJournalRoom(() => useSeasonStore.getState().recordCommitted(j.commitKey, result)) ?? season;
  }
  if (!hero.persisted || !season.persisted) {
    setCommitAlert(
      { kind: ALERT_KINDS.derived, commitKey: j.commitKey, mode: j.mode, fixtureId: j.fixtureId ?? null, at: Date.now() },
      { retry: retryDerived(j, full) },
    );
    return { ok: false, stage: "derived" };
  }
  clearJournal();
  clearAlertFor(j);
  return { ok: true, stage: "done" };
}

/** ⚠ 只有日誌還是這一筆才能補。否則防重標記可能已被後面的比賽蓋掉，再跑一次就是重複成長。 */
const retryDerived = (j, full) => () => {
  if (j.txId && readJournal()?.txId !== j.txId) {
    useCommitAlertStore.setState({ retry: null });
    reconcileCommitAlert();
    return { ok: false, stage: "stale" };
  }
  return finishDerived(j, full);
};

/**
 * 日誌內容不對（例如沒有 players），算不出熟練與 Season。
 * ⚠ 帳已入，所以不丟日誌、不猜、不補償：留給玩家看得到的提示與按鈕，並記下來供審查。
 */
function raiseUnfinishable(j, e) {
  appendAudit({ code: "journal_unfinishable", commitKey: j.commitKey, message: String(e?.message ?? e).slice(0, 160) });
  setCommitAlert(
    { kind: ALERT_KINDS.derived, stage: "unfinishable", commitKey: j.commitKey, mode: j.mode, fixtureId: j.fixtureId ?? null, at: Date.now() },
    {
      retry: () => {
        if (!settleOutstanding()) return { ok: false, stage: "derived" };
        //  日誌可能已經被別處補完清掉，這時沒有人會來收這個提示。
        reconcileCommitAlert();
        return { ok: true, stage: "done" };
      },
    },
  );
}

/** 上一場已入帳但還沒寫完的話，先補完。回傳 false 代表補不完，新的比賽不能進來。 */
function settleOutstanding() {
  const j = readJournal();
  if (!j || j.corrupt || !ledgerHas(j.txId)) return true;
  //  ⚠ 不能讓開賽與推進的按鈕丟例外。
  try {
    return finishDerived(j, null).ok;
  } catch (e) {
    raiseUnfinishable(j, e);
    return false;
  }
}

registerOutstandingSettler(settleOutstanding);

const notCounted = () => useCommitAlertStore.setState({ notCounted: true });

function attemptMoba(p, fullResult) {
  useCommitAlertStore.setState({ notCounted: false });
  if (!settleOutstanding()) { notCounted(); return { ok: false, stage: "derived_pending", receipt: null }; }
  if (sessionGivenUp()) { clearJournal(); clearAlertFor(p); notCounted(); return { ok: false, stage: "given_up", receipt: null }; }
  const journaled = p.derived && !!p.txId;
  if (journaled) {
    const w = writeJournal({ ...p, result: journalResult(fullResult), state: JOURNAL_STATES.prepared });
    if (!w.ok) {
      profile().markSaveFailed("journal_write_failed");
      raiseMatchAlert(p, "journal", () => attemptMoba(p, fullResult));
      return { ok: false, stage: "journal", receipt: null };
    }
  }
  const atomic = profile().runAtomicCommit(() => settleMatchThroughSession({ mode: "moba", outcome: p.outcome, transaction: p.transaction }));
  if (!atomic.ok) {
    if (journaled) writeJournal({ ...p, result: journalResult(fullResult), state: JOURNAL_STATES.failed });
    raiseMatchAlert(p, "profile", () => attemptMoba(p, fullResult));
    return { ok: false, stage: "profile", receipt: null };
  }
  const receipt = atomic.value?.receipt ?? null;
  //  結算層自己拒絕（場次對不上、賽果衝突）不是存檔問題：這場本來就不該算，不留日誌。
  if (p.transaction && !receipt?.ok) {
    if (journaled) clearJournal();
    clearAlertFor(p);
    notCounted();
    return { ok: false, stage: "rejected", receipt, errors: atomic.value?.errors ?? [] };
  }
  //  同一筆交易重送：帳早就入了；沒寫完的部分上面已經補過。再寫一次就是重複。
  if (receipt?.alreadySettled || receipt?.alreadyApplied) {
    if (journaled) clearJournal();
    return { ok: true, stage: "duplicate", receipt };
  }
  if (!p.derived) { clearAlertFor(p); return { ok: true, stage: "done", receipt }; }
  return { ...finishDerived({ ...p, result: journalResult(fullResult) }, fullResult), receipt };
}

/**
 * MOBA 比賽完成邊界。`useBattleFeed` 在引擎終局呼叫。
 *
 * @param {object} p.result      BattleResult
 * @param {object} p.transaction MatchProgressTransaction（可為 null）
 * @param {string} p.matchId
 * @param {boolean} p.isPractice 快速練習不進熟練與 Season（V0D）
 */
export function commitMobaMatch({ result, transaction, matchId, isPractice = false }) {
  const session = liveSession();
  const p = {
    mode: "moba",
    commitKey: commitKeyOf(session, matchId),
    matchId,
    sessionId: session?.sessionId ?? null,
    fixtureId: session?.origin?.fixtureId ?? null,
    outcome: outcomeFromBattleResult(result, matchId),
    transaction: transaction ?? null,
    txId: transaction?.transactionId ?? null,
    derived: !isPractice,
    practice: isPractice,
    at: Date.now(),
  };
  //  賽後畫面讀的是「這一場」的成長。這場還沒確定入帳之前，不能留著上一場的明細。
  if (p.derived) useHeroProgressStore.setState({ lastDetail: null });
  //  沒有交易（debug harness）：沒有帳本可以當權威，只靠防重。
  if (p.derived && !p.txId && !sessionGivenUp() && settleOutstanding()) return { ...finishDerived({ ...p, result: journalResult(result) }, result), receipt: null };
  return attemptMoba(p, result);
}

/**
 * CS 比賽完成邊界。`build()` 在同一次寫入裡做完結算與 csHistory。
 *
 * ⚠ CS 只有 profile 一把鍵，一次寫完就是原子的，不需要日誌。
 *   重新整理後賽程還在 launched，玩家重打即可，模擬會得到同一場。
 */
export function commitCsMatch({ matchId, build }) {
  const session = liveSession();
  const p = {
    mode: "cs",
    commitKey: commitKeyOf(session, matchId),
    matchId,
    sessionId: session?.sessionId ?? null,
    fixtureId: session?.origin?.fixtureId ?? null,
    practice: !!profile().matchPracticeContext().inPractice,
  };
  const attempt = () => {
    useCommitAlertStore.setState({ notCounted: false });
    //  ⚠ 不寫日誌也要等：失敗的話提示會把待補那一筆的提示換掉，玩家就沒有按鈕可按了。
    if (!settleOutstanding()) { notCounted(); return { ok: false, stage: "derived_pending", receipt: null }; }
    if (sessionGivenUp()) { clearAlertFor(p); notCounted(); return { ok: false, stage: "given_up", receipt: null }; }
    const atomic = profile().runAtomicCommit(build);
    if (!atomic.ok) {
      raiseMatchAlert(p, "profile", attempt);
      return { ok: false, stage: "profile", receipt: null };
    }
    clearAlertFor(p);
    if (atomic.value?.ok === false) notCounted();
    return { ok: true, stage: "done", receipt: atomic.value };
  };
  return attempt();
}

/** 玩家按重試。沒有可重試的內容時回 false，畫面只留「重打或棄權」。 */
export function retryPendingCommit() {
  const run = useCommitAlertStore.getState().retry;
  if (!run) return { ok: false, stage: "nothing_pending" };
  //  ⚠ 這是畫面按鈕的 onClick：丟出去只會變成沒反應的按鈕，提示還留著就好。
  try {
    return run();
  } catch (e) {
    appendAudit({ code: "retry_failed", message: String(e?.message ?? e).slice(0, 160) });
    return { ok: false, stage: "derived" };
  }
}

/** 警示對應的場次或賽程已經不在了，就不該再留著。 */
export function reconcileCommitAlert() {
  const a = useCommitAlertStore.getState().alert;
  if (!a) return;
  if (a.kind === ALERT_KINDS.derived) { if (!hasUnfinishedCommit(profile().processedMatchTransactions)) clearCommitAlert(); return; }
  if (a.kind !== ALERT_KINDS.match) return;
  if (a.fixtureId) {
    const status = fixtureStatusOf(a.fixtureId);
    if (status === null || FIXTURE_TERMINAL.includes(status)) clearCommitAlert();
    return;
  }
  const s = liveSession();
  if (!a.sessionId || s?.sessionId !== a.sessionId || isSessionTerminal(s)) clearCommitAlert();
}

/**
 * 開機恢復。只做兩件事：讀回警示、處理留下來的日誌。**可以重複呼叫。**
 *
 * ⚠ 判斷只看 profile 帳本。不猜、不補償、不改已經存在的歷史。
 */
export function recoverPendingCommits() {
  //  ⚠ 這裡在畫面第一次渲染時跑。丟例外就是每次開遊戲都白畫面，而存檔還在：記下來，繼續開。
  try {
    return runRecovery();
  } catch (e) {
    appendAudit({ code: "recovery_failed", message: String(e?.message ?? e).slice(0, 160) });
    //  帳已入的那一筆補不完時，開賽與推進會擋住，所以開機就要讓玩家看到原因。
    try {
      const j = readJournal();
      if (j && !j.corrupt && ledgerHas(j.txId)) raiseUnfinishable(j, e);
    } catch { /* noop: 這裡再失敗也不能擋開機；推進時還會再試並提示 */ }
    return { recovered: false, aborted: false, kept: true, corrupt: false, failed: true };
  }
}

function runRecovery() {
  loadCommitAlert();
  const out = { recovered: false, aborted: false, kept: false, corrupt: false };
  const j = readJournal();
  if (j?.corrupt) {
    clearJournal();
    out.aborted = true;
    out.corrupt = true;
  } else if (j && ledgerHas(j.txId)) {
    const done = finishDerived(j, null);
    out.recovered = done.ok;
    out.kept = !done.ok;
  } else if (j) {
    const s = liveSession();
    if (j.sessionId && s?.sessionId === j.sessionId && s.state === SESSION_STATES.launched) {
      //  帳沒進，場次還在：賽果還能重試。⚠ 這份賽果沒有 timeline，只有恢復這條路會這樣。
      //  ⚠ 只接比賽類提示的階段：這一筆帳沒進，不能沿用「已入帳」那類提示的階段。
      const prior = useCommitAlertStore.getState().alert;
      const stage = (prior?.kind === ALERT_KINDS.match ? prior.stage : null) ?? "interrupted";
      //  ⚠ 剛開機配額旗標是空的：沿用落盤提示記下的「已滿」，不然上限較小的瀏覽器會退回一般文案。
      raiseMatchAlert({ ...j, full: prior?.kind === ALERT_KINDS.match && prior.full === true }, stage, () => attemptMoba(j, j.result));
      out.kept = true;
    } else {
      clearJournal();
      out.aborted = true;
    }
  }
  reconcileCommitAlert();
  const audit = detectCommitAnomalies({
    profile: profile(),
    heroProgress: useHeroProgressStore.getState().progress,
    seasonHistory: useSeasonStore.getState().history,
    now: Date.now(),
  });
  if (out.corrupt) audit.findings.push({ code: "journal_corrupt" });
  recordAudit(audit);
  out.audit = audit;
  return out;
}
