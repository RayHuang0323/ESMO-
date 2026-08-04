// ============================================================================
//  screens/common/MatchQueuePanel.jsx — 配對排隊狀態（Milestone O4）
//
//  MOBA 與 CS 共用同一個面板與同一套狀態流程（不新增第二套資料來源）。
//  所有判斷都來自 `profileStore.matchmakingView()` 與契約——
//  **畫面不自己判「這個狀態能不能進場」**。
//
//  手機優先：單欄、可換行、代碼與秒數 nowrap，320px 不水平溢出。
//  ⚠ 目前是本機 mock gateway：輪詢由本元件的計時器驅動；接上真伺服器後
//    改成訂閱推播即可，狀態流程與版面都不必改。
// ============================================================================
import React, { useEffect, useState } from "react";
import { useProfileStore } from "../../platform/profileStore.js";
import { TICKET_STATES } from "../../platform/contracts/matchmaking.js";

const C = {
  ok: "#34d399", bad: "#f87171", warn: "#fbbf24", info: "#60a5fa",
  gray: "#71717a", gray2: "#a1a1aa", line: "rgba(255,255,255,0.10)",
  card: "rgba(255,255,255,0.04)", card2: "rgba(255,255,255,0.06)",
};
const TONE = {
  idle: C.gray, validating: C.info, queued: C.info,
  matched: C.ok, cancelled: C.gray, rejected: C.bad,
};

/**
 * @param {"moba"|"cs"} mode
 * @param {boolean} canQueue  出賽申請是否已通過驗證（未通過就不給排隊）
 * @param {() => void} [onReady] 配對成功後按「進入對戰」要做的事
 */
export default function MatchQueuePanel({ mode = "moba", canQueue = false, onReady = null }) {
  const enqueueMatch = useProfileStore((s) => s.enqueueMatch);
  const cancelMatchmaking = useProfileStore((s) => s.cancelMatchmaking);
  const pollMatchmaking = useProfileStore((s) => s.pollMatchmaking);
  const resetMatchmaking = useProfileStore((s) => s.resetMatchmaking);
  const ticketState = useProfileStore((s) => s.matchmaking?.ticket?.state ?? null);
  //  Milestone O5：比賽房間與雙方確認
  const openMatchRoom = useProfileStore((s) => s.openMatchRoom);
  const pollMatchRoom = useProfileStore((s) => s.pollMatchRoom);
  const confirmMatchReady = useProfileStore((s) => s.confirmMatchReady);
  const cancelMatchRoom = useProfileStore((s) => s.cancelMatchRoom);
  const roomState = useProfileStore((s) => s.matchmaking?.room?.state ?? null);
  //  Milestone O6：比賽場次與一次性進場令牌
  const createMatchSession = useProfileStore((s) => s.createMatchSession);
  const launchMatchSession = useProfileStore((s) => s.launchMatchSession);
  const [tick, setTick] = useState(0);
  const [err, setErr] = useState(null);

  const view = useProfileStore((s) => s.matchmakingView)();
  const room = useProfileStore((s) => s.matchRoomView)();
  const session = useProfileStore((s) => s.matchSessionView)();
  const t = view.ticket;
  const queued = view.state === TICKET_STATES.queued;

  //  排隊中每秒輪詢一次 mock gateway（真伺服器改成訂閱推播）
  useEffect(() => {
    if (!queued) return undefined;
    const id = setInterval(() => { pollMatchmaking(); setTick((v) => v + 1); }, 1000);
    return () => clearInterval(id);
  }, [queued, pollMatchmaking, ticketState]);

  //  O5：配對成功 ⇒ 由 gateway 開房（重複呼叫不會產生第二間）
  const matched = view.state === TICKET_STATES.matched;
  useEffect(() => { if (matched && !room.room) openMatchRoom(); }, [matched, room.room, openMatchRoom]);

  //  O6：雙方確認完成 ⇒ 由 gateway 簽發場次（重複呼叫不會建立第二場）
  useEffect(() => {
    if (room.state === "confirmed" && !session.session) createMatchSession();
  }, [room.state, session.session, createMatchSession]);

  //  O5：房間進行中每秒輪詢（驅動確認階段、對手確認、逾時）
  const roomLive = !!room.room && (room.state === "waiting" || room.state === "ready_check");
  useEffect(() => {
    if (!roomLive) return undefined;
    const id = setInterval(() => { pollMatchRoom(); setTick((v) => v + 1); }, 1000);
    return () => clearInterval(id);
  }, [roomLive, pollMatchRoom, roomState]);

  const start = () => {
    setErr(null);
    const r = enqueueMatch(mode);
    if (!r.ok) setErr(r.errors?.[0]?.message ?? "無法開始配對");
  };

  const tone = TONE[view.state] ?? C.gray;
  const showTicket = t && view.state !== TICKET_STATES.idle;

  return (
    <div style={{
      background: C.card, borderRadius: 12, padding: "10px 12px", marginBottom: 10,
      border: `1px solid ${showTicket ? tone + "55" : C.line}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13 }}>📡</span>
        <span style={{ color: "white", fontSize: 12, fontWeight: 800 }}>線上配對</span>
        <span style={{
          fontSize: 9, fontWeight: 800, borderRadius: 6, padding: "2px 7px",
          background: `${tone}22`, color: tone,
        }}>{view.stateLabel}</span>
        {queued && (
          <span style={{ marginLeft: "auto", color: C.gray2, fontSize: 10, fontWeight: 700, fontFamily: "monospace", whiteSpace: "nowrap" }}>
            {String(Math.floor(view.waitedSec / 60)).padStart(2, "0")}:{String(view.waitedSec % 60).padStart(2, "0")}
          </span>
        )}
      </div>

      {/* 排隊中：等待時間、模式、隊伍版本、取消 */}
      {queued && (
        <>
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            {[
              { k: "模式", v: t.mode === "cs" ? "CS" : "MOBA" },
              { k: "隊伍版本", v: t.rosterVersion },
              { k: "票券", v: t.ticketId.slice(-8) },
            ].map((x) => (
              <div key={x.k} style={{ background: C.card2, borderRadius: 8, padding: "5px 8px", minWidth: 0 }}>
                <div style={{ color: C.gray, fontSize: 8 }}>{x.k}</div>
                <div style={{ color: "white", fontSize: 10, fontWeight: 700, fontFamily: "monospace", whiteSpace: "nowrap" }}>{x.v}</div>
              </div>
            ))}
          </div>
          {/* 等待動畫：三顆點，克制的動態 */}
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 8 }}>
            {[0, 1, 2].map((i) => (
              <span key={i} style={{
                width: 5, height: 5, borderRadius: 99, background: C.info,
                opacity: (tick + i) % 3 === 0 ? 1 : 0.3, transition: "opacity .3s",
              }} />
            ))}
            <span style={{ color: C.gray2, fontSize: 10 }}>尋找對手中…</span>
            <button onClick={() => cancelMatchmaking()}
              style={{ marginLeft: "auto", background: "transparent", border: `1px solid ${C.line}`, borderRadius: 8, padding: "5px 12px", cursor: "pointer", color: C.gray2, fontSize: 10, fontWeight: 700 }}>
              取消配對
            </button>
          </div>
        </>
      )}

      {/* O5：已配對 → 比賽房間與雙方確認 */}
      {view.state === TICKET_STATES.matched && t.assignment && (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: C.card2, borderRadius: 9, padding: "8px 10px" }}>
            <span style={{ fontSize: 15 }}>⚔️</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: "white", fontSize: 12, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {t.assignment.opponent.name}
              </div>
              <div style={{ color: C.gray, fontSize: 8.5, fontFamily: "monospace" }}>
                種子 {t.assignment.seed} · 由 {t.assignment.issuedBy} 簽發
              </div>
            </div>
            {room.room && (
              <span style={{ fontSize: 9, fontWeight: 800, borderRadius: 6, padding: "2px 7px", background: C.card, color: C.gray2, whiteSpace: "nowrap" }}>
                {room.stateLabel}
              </span>
            )}
          </div>

          {/* 雙方確認狀態 ＋ 倒數 */}
          {room.room && (
            <div style={{ marginTop: 8, background: C.card2, borderRadius: 9, padding: "9px 10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7, flexWrap: "wrap" }}>
                <span style={{ color: "white", fontSize: 11.5, fontWeight: 800 }}>雙方確認</span>
                {room.state === "ready_check" && (
                  <span style={{
                    marginLeft: "auto", fontSize: 11, fontWeight: 800, fontFamily: "monospace",
                    color: room.remainingSec <= 5 ? C.bad : C.warn, whiteSpace: "nowrap",
                  }}>
                    {room.remainingSec}s
                  </span>
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                {[
                  { k: "我方", ready: room.usReady },
                  { k: "對手", ready: room.opponentReady },
                ].map((x) => (
                  <div key={x.k} style={{
                    background: C.card, borderRadius: 8, padding: "7px 9px",
                    border: `1px solid ${x.ready ? C.ok + "55" : C.line}`,
                  }}>
                    <div style={{ color: C.gray, fontSize: 8.5, marginBottom: 2 }}>{x.k}</div>
                    <div style={{ color: x.ready ? C.ok : C.gray2, fontSize: 11, fontWeight: 800 }}>
                      {x.ready ? "✓ 已確認" : "等待中…"}
                    </div>
                  </div>
                ))}
              </div>

              {room.state === "ready_check" && !room.usReady && (
                <button onClick={() => { const r = confirmMatchReady(); if (!r.ok) setErr(r.errors?.[0]?.message ?? null); }}
                  style={{ marginTop: 8, width: "100%", background: `linear-gradient(135deg,${C.warn},#d97706)`, border: "none", borderRadius: 10, padding: "11px", cursor: "pointer", color: "#0a0b0f", fontSize: 13, fontWeight: 900 }}>
                  我方確認
                </button>
              )}
              {/* O6：進場必須消耗一次性令牌；成功才真的進對戰。
                  重複進場、場次逾期、資料不一致都會在這裡被擋下並顯示原因。 */}
              {room.canEnter && session.session && (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                    <span style={{ color: C.gray, fontSize: 8.5 }}>場次</span>
                    <span style={{ color: C.gray2, fontSize: 9, fontFamily: "monospace", whiteSpace: "nowrap" }}>
                      {session.session.sessionId.slice(-12)}
                    </span>
                    <span style={{ marginLeft: "auto", fontSize: 8.5, fontWeight: 800, borderRadius: 5, padding: "1px 6px", background: C.card, color: session.canLaunch ? C.ok : C.gray }}>
                      {session.stateLabel}
                    </span>
                  </div>
                  {session.canLaunch && onReady && (
                    <button onClick={() => {
                      const r = launchMatchSession();
                      if (!r.ok) { setErr(r.errors?.[0]?.message ?? "無法進入對戰"); return; }
                      setErr(null);
                      onReady();
                    }}
                      style={{ marginTop: 8, width: "100%", background: `linear-gradient(135deg,${C.ok},#059669)`, border: "none", borderRadius: 10, padding: "11px", cursor: "pointer", color: "#fff", fontSize: 13, fontWeight: 800 }}>
                      進入對戰
                    </button>
                  )}
                  {!session.canLaunch && session.blockedReason && (
                    <div style={{ color: C.bad, fontSize: 10.5, marginTop: 8, lineHeight: 1.7 }}>⚠ {session.blockedReason}</div>
                  )}
                </>
              )}
              {!room.canEnter && room.blockedReason && room.state !== "ready_check" && (
                <div style={{ color: C.bad, fontSize: 10.5, marginTop: 8, lineHeight: 1.7 }}>⚠ {room.blockedReason}</div>
              )}
              {(room.state === "waiting" || room.state === "ready_check") && (
                <button onClick={() => cancelMatchRoom()}
                  style={{ marginTop: 7, width: "100%", background: "transparent", border: `1px solid ${C.line}`, borderRadius: 9, padding: "7px", cursor: "pointer", color: C.gray2, fontSize: 10, fontWeight: 700 }}>
                  取消對戰
                </button>
              )}
              {(room.state === "expired" || room.state === "cancelled") && (
                <button onClick={() => resetMatchmaking()}
                  style={{ marginTop: 7, width: "100%", background: C.card, border: `1px solid ${C.line}`, borderRadius: 9, padding: "8px", cursor: "pointer", color: "white", fontSize: 11, fontWeight: 700 }}>
                  重新配對
                </button>
              )}
              {err && <div style={{ color: C.bad, fontSize: 10, marginTop: 6 }}>⚠ {err}</div>}
            </div>
          )}
        </div>
      )}

      {/* 被拒絕：明確原因 */}
      {view.state === TICKET_STATES.rejected && (
        <div style={{ marginTop: 8 }}>
          <div style={{ color: C.bad, fontSize: 10.5, lineHeight: 1.7 }}>⚠ {t.reason}</div>
          <button onClick={() => resetMatchmaking()}
            style={{ marginTop: 8, width: "100%", background: C.card2, border: `1px solid ${C.line}`, borderRadius: 9, padding: "8px", cursor: "pointer", color: "white", fontSize: 11, fontWeight: 700 }}>
            重新配對
          </button>
        </div>
      )}

      {/* 已取消 */}
      {view.state === TICKET_STATES.cancelled && (
        <div style={{ marginTop: 8 }}>
          <div style={{ color: C.gray2, fontSize: 10.5 }}>{t.reason ?? "已取消配對，未進入對戰。"}</div>
          <button onClick={() => resetMatchmaking()}
            style={{ marginTop: 8, width: "100%", background: C.card2, border: `1px solid ${C.line}`, borderRadius: 9, padding: "8px", cursor: "pointer", color: "white", fontSize: 11, fontWeight: 700 }}>
            重新配對
          </button>
        </div>
      )}

      {/* 尚未排隊 */}
      {!showTicket && (
        <div style={{ marginTop: 8 }}>
          <button onClick={start} disabled={!canQueue}
            style={{
              width: "100%", borderRadius: 10, padding: "11px", border: "none",
              background: canQueue ? `linear-gradient(135deg,${C.info},#3b82f6)` : "rgba(255,255,255,0.06)",
              color: canQueue ? "#fff" : C.gray, cursor: canQueue ? "pointer" : "not-allowed",
              fontSize: 13, fontWeight: 800,
            }}>
            {canQueue ? "開始配對" : "陣容未通過驗證，無法配對"}
          </button>
          {err && <div style={{ color: C.bad, fontSize: 10, marginTop: 6 }}>⚠ {err}</div>}
        </div>
      )}
    </div>
  );
}
