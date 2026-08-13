// ============================================================================
//  screens/common/useMatchFlow.js — 賽前配對流程的**單一狀態來源**
//
//  ── 正式環境驗收發現的根因（我上一輪造成的）────────────────────────────
//  `MatchPrepFrame` 這樣訂閱 store：
//        const view = useProfileStore((s) => s.matchmakingView)();
//  它訂閱的是**選擇器函式本身**。那個函式的身分永遠不變 ⇒ zustand 從來不會
//  通知這個元件 ⇒ **底部主按鈕永遠停在第一次算出來的樣子**。
//
//  症狀全部由此而來：
//    · 已經在配對中，底部還寫「確認陣容 → 開始配對」
//    · 找到對手後永遠顯示等待中，按不到「我方確認」⇒ 進不了 Ban/Pick
//    · 逾時後按「重新配對」沒有反應
//  （上一輪把主要動作全搬到底部按鈕，而那顆按鈕是凍結的，所以流程整條斷掉。）
//
//  `MatchQueuePanel` 沒事，是因為它另外訂閱了 `s.matchmaking?.ticket?.state`
//  這種**會變的原始值**，被動地觸發了重繪。
//
//  ── 本檔的做法 ────────────────────────────────────────────────────────────
//  ① 只訂閱**原始值**（字串／布林／數字），保證狀態一變就重繪。
//  ② 輪詢、開房、簽發場次、自動進場**只在這裡做一次**，
//     元件不得再各自 setInterval 或各自呼叫 store。
//  ③ 對外只吐出：四步流程狀態、唯一可執行操作、以及 debug 用的內部識別。
//
//  ⚠ 沒有第二套配對流程：每個動作都是既有的 store action
//    （`enqueueMatch` / `confirmMatchReady` / `launchMatchSession` /
//     `requeueMatch` / `cancelMatchmaking` / `cancelMatchRoom`）。
// ============================================================================
import { useEffect, useRef, useState } from "react";
import { useProfileStore } from "../../platform/profileStore.js";
import { TICKET_STATES } from "../../platform/contracts/matchmaking.js";
import { selectOpponentName } from "../../platform/matchTeamNames.js";
import { primaryActionFor, flowStatusText, flowStepOf } from "./matchPrepAction.js";

/**
 * @param {"moba"|"cs"} mode
 * @param {() => void} onEnterBattle 雙方確認完成、場次啟動成功後要做的事
 *        （＝既有 MOBA flow 的下一頁：Ban/Pick）
 */
export function useMatchFlow(mode = "moba", onEnterBattle = null) {
  //  ── 只訂閱原始值：這是「狀態一變就重繪」的保證 ──────────────────────
  const ticketState = useProfileStore((s) => s.matchmaking?.ticket?.state ?? null);
  const ticketId = useProfileStore((s) => s.matchmaking?.ticket?.ticketId ?? null);
  const roomState = useProfileStore((s) => s.matchmaking?.room?.state ?? null);
  const roomId = useProfileStore((s) => s.matchmaking?.room?.roomId ?? null);
  const usReady = useProfileStore((s) => !!s.matchmaking?.room?.confirmations?.us);
  const oppReady = useProfileStore((s) => !!s.matchmaking?.room?.confirmations?.opponent);
  const sessionId = useProfileStore((s) => s.matchmaking?.session?.sessionId ?? null);
  const sessionState = useProfileStore((s) => s.matchmaking?.session?.state ?? null);
  //  陣容改動也要讓主按鈕跟著變（補滿第五人後按鈕要立刻可按）
  const lineupSig = useProfileStore((s) => JSON.stringify(mode === "cs" ? s.csLineup : s.lineup));
  const playerSig = useProfileStore((s) => (s.players ?? []).length);

  //  倒數與等待秒數需要每秒重算 ⇒ 一個 tick 就夠，不必訂閱時間
  const [tick, setTick] = useState(0);
  const [err, setErr] = useState(null);

  const store = useProfileStore.getState();
  //  view 每次 render 現算（上面的原始值保證了 render 會發生）
  const entry = store.matchEntry(mode);
  const check = store.squadCheck(mode);
  const view = store.matchmakingView();
  const room = store.matchRoomView();
  const session = store.matchSessionView();

  const live = ticketState === TICKET_STATES.queued
    || ticketState === TICKET_STATES.validating
    || roomState === "waiting" || roomState === "ready_check";

  //  ── 唯一的輪詢處（元件不得再自己 setInterval）───────────────────────
  useEffect(() => {
    if (!live) return undefined;
    const id = setInterval(() => {
      const st = useProfileStore.getState();
      if (st.matchmaking?.ticket?.state === TICKET_STATES.queued) st.pollMatchmaking();
      const rs = st.matchmaking?.room?.state;
      if (rs === "waiting" || rs === "ready_check") st.pollMatchRoom();
      setTick((v) => v + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [live, ticketState, roomState]);

  //  ── 配對成功 ⇒ 由 gateway 開房（重複呼叫不會產生第二間）──────────────
  useEffect(() => {
    if (ticketState === TICKET_STATES.matched && !roomId) useProfileStore.getState().openMatchRoom();
  }, [ticketState, roomId]);

  //  ── 雙方確認完成 ⇒ 由 gateway 簽發場次（重複呼叫不會建立第二場）──────
  useEffect(() => {
    if (roomState === "confirmed" && !sessionId) useProfileStore.getState().createMatchSession();
  }, [roomState, sessionId]);

  //  ── 場次可啟動 ⇒ **自動**進入 Ban/Pick，不需要玩家再按一次 ────────────
  //  ⚠ 一次性 launchToken 的保護完全沿用：`launchMatchSession` 失敗就停下並顯示原因，
  //    這裡不繞過、不重試、不自己造場次。`launchedFor` 防 StrictMode 雙掛載重複啟動。
  const launchedFor = useRef(null);
  useEffect(() => {
    if (!sessionId || launchedFor.current === sessionId) return;
    const st = useProfileStore.getState();
    //  已經 launched 的場次不再自動進場——那是「回到進行中的對戰」，
    //  必須由玩家自己決定（回去打完，或放棄本場）。
    if (!st.matchSessionView().canLaunch) return;
    launchedFor.current = sessionId;
    const r = st.launchMatchSession();
    if (!r.ok) {
      launchedFor.current = null;
      setErr(r.errors?.[0]?.message ?? "無法進入對戰");
      return;
    }
    setErr(null);
    onEnterBattle?.();
  }, [sessionId, sessionState, roomState, onEnterBattle]);

  //  Q3.5 驗收：賽事出賽時房間的「對手」欄整段確認階段都是「—」。原因是這裡
  //  只讀 `ticket.assignment`，而 `launchFixtureMatch()` 把 ticket 設成 null
  //  （賽程路徑沒有票券），指派單放在 `matchmaking.fixtureAssignment`
  //  ⇒ 同一條流程上出現第二份對應規則。改吃隊名的唯一讀取點
  //  （`platform/matchTeamNames.js`，已含 fixtureAssignment 那一段）。
  //  ⚠ 仍是原始值（字串／null），符合本檔「只訂閱原始值」的規則。
  const opponentName = selectOpponentName(store);
  //  Q3.6：這條流程綁在哪一場賽程。判定在 Store（`matchFixtureContext`），
  //  這裡只是把結論帶給按鈕判定——本檔不判「算不算賽程」。
  const fixture = store.matchFixtureContext();

  const act = primaryActionFor({ entryOk: entry.ok, view, room, session, fixture });
  const statusText = flowStatusText({ entryOk: entry.ok, view, room, session, opponentName, fixture });

  //  ── 唯一的流程推進點 ────────────────────────────────────────────────
  const run = () => {
    setErr(null);
    const st = useProfileStore.getState();
    if (act.key === "enqueue") {
      const r = st.enqueueMatch(mode);
      if (!r.ok) setErr(r.errors?.[0]?.message ?? "無法開始配對");
      return;
    }
    if (act.key === "confirm") {
      const r = st.confirmMatchReady();
      if (!r.ok) setErr(r.errors?.[0]?.message ?? "無法確認");
      return;
    }
    if (act.key === "resume") {
      //  沿用 O6 既有的恢復流程：seed／陣容／對手完全不變，
      //  不重新建立場次、不繞過驗證。恢復失敗就顯示契約給的中文原因。
      const r = st.resumeMatchSession();
      if (!r.ok) { setErr(r.errors?.[0]?.message ?? "無法返回對戰"); return; }
      onEnterBattle?.();
      return;
    }
    if (act.key === "requeue") {
      launchedFor.current = null;
      const r = st.requeueMatch(mode);
      if (!r.ok) setErr(r.errors?.[0]?.message ?? "無法重新配對");
      return;
    }
    //  Q3.6：賽程區間內的「重新來過」＝重新進入同一場賽程。
    //  ⚠ 用的是出賽那一支 `startFixtureMatch()`（內建 `allowRelaunch`），
    //    對手／seed 都由賽程決定 ⇒ 不可能換到隨機對手，也沒有第二條賽事流程。
    if (act.key === "refixture") {
      launchedFor.current = null;
      const r = st.startFixtureMatch(fixture.fixtureId);
      if (!r.ok) setErr(r.reason ?? r.errors?.[0]?.message ?? "無法重新進入本場賽事");
      return;
    }
  };

  /** 放棄進行中的對戰（次要動作）。放棄後場次進入終局，可重新配對。 */
  const abandon = () => {
    setErr(null);
    const st = useProfileStore.getState();
    const r = st.abandonMatchSession();
    if (!r.ok) { setErr(r.errors?.[0]?.message ?? "無法放棄本場"); return; }
    launchedFor.current = null;
  };

  /** 取消（次要動作；排隊中取消票券、房間中取消對戰）。 */
  const cancel = () => {
    setErr(null);
    const st = useProfileStore.getState();
    if (roomState === "waiting" || roomState === "ready_check") st.cancelMatchRoom();
    else st.cancelMatchmaking();
  };

  return {
    mode, entry, check, view, room, session,
    act, statusText, step: flowStepOf({ view, room, session }),
    usReady, oppReady,
    opponentName,
    remainingSec: room.remainingSec,
    waitedSec: view.waitedSec,
    canCancel: live,
    err, run, cancel, abandon, tick,
    canAbandon: sessionState === "launched",
    //  內部識別：**只給 debug 區用**，正式畫面不得顯示
    internals: {
      rosterVersion: entry.request?.rosterVersion ?? null,
      transactionId: entry.request?.transactionId ?? null,
      ticketId, roomId, sessionId,
      seed: view.ticket?.assignment?.seed ?? null,
      issuedBy: view.ticket?.assignment?.issuedBy ?? null,
      ticketState, roomState, sessionState,
      lineupSig, playerSig,
    },
  };
}
