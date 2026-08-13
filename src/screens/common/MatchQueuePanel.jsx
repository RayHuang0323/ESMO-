// ============================================================================
//  screens/common/MatchQueuePanel.jsx — 配對流程狀態（純顯示）
//
//  ── 正式環境驗收後的定位 ──────────────────────────────────────────────────
//  這張卡**只顯示狀態**，一顆推進流程的主要按鈕都沒有。
//  唯一的流程推進點是 `MatchPrepFrame` 底部那顆按鈕（見 `matchPrepAction.js`）。
//  留在這裡的只有「取消」這種次要動作，樣式也是次要的。
//
//  ── 單一狀態來源 ──────────────────────────────────────────────────────────
//  所有狀態一律由 `useMatchFlow` 傳進來，本元件**不訂閱 store、不輪詢、
//  不呼叫任何 store action**（取消也是呼叫 flow 給的函式）。
//  之前兩個元件各自 setInterval、各自算狀態，才會出現「面板動了、按鈕沒動」。
//
//  ── 正式模式只顯示玩家看得懂的東西 ────────────────────────────────────────
//    目前流程狀態｜對手名稱｜我方／對手確認｜倒數｜中文失敗原因
//  隊伍版本／申請識別／ticketId／roomId／seed／issuedBy／狀態追蹤鏈
//  一律收進「查看技術內容」，而且**正式模式預設收合、非 debug 不出現**。
//
//  手機優先：單欄、可換行、代碼與秒數 nowrap，320px 不水平溢出。
// ============================================================================
import React, { useState } from "react";
import { isDebugMode } from "../../ui/debugMode.js";
import { RETRY_ACTION_KEYS } from "./matchPrepAction.js";

const C = {
  ok: "#34d399", bad: "#f87171", warn: "#fbbf24", info: "#60a5fa",
  gray: "#71717a", gray2: "#a1a1aa", line: "rgba(255,255,255,0.10)",
  card: "rgba(255,255,255,0.04)", card2: "rgba(255,255,255,0.06)",
};

/** 依四步流程給狀態色（不是依內部狀態機代碼）。 */
const toneOf = (flow) => {
  if (RETRY_ACTION_KEYS.includes(flow.act.key)) return C.bad;
  if (flow.act.key === "launching") return C.ok;
  if (flow.act.key === "confirm") return C.warn;
  if (flow.step >= 1) return C.info;
  return C.gray;
};

/**
 * @param {object} flow  `useMatchFlow` 的輸出（唯一狀態來源）
 */
export default function MatchQueuePanel({ mode = "moba", flow }) {
  const [tech, setTech] = useState(false);
  const debug = isDebugMode();
  if (!flow) return null;

  const { room, act, statusText, usReady, oppReady, opponentName, remainingSec, waitedSec } = flow;
  const tone = toneOf(flow);
  const searching = act.key === "queued";
  const inRoom = room.state === "ready_check" || room.state === "confirmed" || room.state === "waiting";

  return (
    <div style={{
      background: C.card, borderRadius: 12, padding: "10px 12px", marginBottom: 10,
      border: `1px solid ${flow.step > 0 ? tone + "55" : C.line}`, minWidth: 0,
    }}>
      {/* 目前流程狀態 */}
      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", minWidth: 0 }}>
        <span style={{ fontSize: 13 }}>📡</span>
        <span style={{ color: "white", fontSize: 12, fontWeight: 800 }}>配對狀態</span>
        <span style={{ fontSize: 9.5, fontWeight: 800, borderRadius: 6, padding: "2px 7px", background: `${tone}22`, color: tone, whiteSpace: "nowrap" }}>
          {statusText}
        </span>
        {searching && (
          <span style={{ marginLeft: "auto", color: C.gray2, fontSize: 10, fontWeight: 700, fontFamily: "monospace", whiteSpace: "nowrap" }}>
            {String(Math.floor(waitedSec / 60)).padStart(2, "0")}:{String(waitedSec % 60).padStart(2, "0")}
          </span>
        )}
      </div>

      {/* 尋找對手中：等待動畫 ＋ 取消 */}
      {searching && (
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 8, flexWrap: "wrap" }}>
          {[0, 1, 2].map((i) => (
            <span key={i} style={{ width: 5, height: 5, borderRadius: 99, background: C.info, opacity: (flow.tick + i) % 3 === 0 ? 1 : 0.3, transition: "opacity .3s" }} />
          ))}
          <span style={{ color: C.gray2, fontSize: 10 }}>正在尋找對手…</span>
          <button onClick={flow.cancel}
            style={{ marginLeft: "auto", background: "transparent", border: `1px solid ${C.line}`, borderRadius: 8, padding: "5px 12px", cursor: "pointer", color: C.gray2, fontSize: 10, fontWeight: 700 }}>
            取消配對
          </button>
        </div>
      )}

      {/* 找到對手：對手名稱 ＋ 雙方確認 ＋ 倒數 */}
      {inRoom && (
        <div style={{ marginTop: 8, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: C.card2, borderRadius: 9, padding: "8px 10px", minWidth: 0 }}>
            <span style={{ fontSize: 15 }}>⚔️</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: C.gray, fontSize: 8.5 }}>對手</div>
              <div style={{ color: "white", fontSize: 12.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {opponentName ?? "—"}
              </div>
            </div>
            {room.state === "ready_check" && (
              <span style={{ fontSize: 15, fontWeight: 900, fontFamily: "monospace", color: remainingSec <= 5 ? C.bad : C.warn, whiteSpace: "nowrap" }}>
                {remainingSec}s
              </span>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginTop: 7 }}>
            {[{ k: "我方", ready: usReady }, { k: "對手", ready: oppReady }].map((x) => (
              <div key={x.k} style={{ background: C.card, borderRadius: 8, padding: "7px 9px", border: `1px solid ${x.ready ? C.ok + "55" : C.line}`, minWidth: 0 }}>
                <div style={{ color: C.gray, fontSize: 8.5, marginBottom: 2 }}>{x.k}</div>
                <div style={{ color: x.ready ? C.ok : C.gray2, fontSize: 11, fontWeight: 800, whiteSpace: "nowrap" }}>
                  {x.ready ? "✓ 已確認" : "等待中…"}
                </div>
              </div>
            ))}
          </div>

          {(room.state === "waiting" || room.state === "ready_check") && (
            <button onClick={flow.cancel}
              style={{ marginTop: 7, width: "100%", background: "transparent", border: `1px solid ${C.line}`, borderRadius: 9, padding: "7px", cursor: "pointer", color: C.gray2, fontSize: 10, fontWeight: 700 }}>
              取消對戰
            </button>
          )}
        </div>
      )}

      {/* 進行中的對戰：提供「放棄本場」出口，否則回到賽前頁就永久卡死 */}
      {flow.canAbandon && (
        <div style={{ marginTop: 8 }}>
          <div style={{ color: C.gray2, fontSize: 10, lineHeight: 1.7 }}>
            上一場還沒有結束。可以回去打完，或放棄本場後重新配對。
          </div>
          <button onClick={flow.abandon} data-testid="abandon-match"
            style={{ marginTop: 7, width: "100%", background: "transparent", border: `1px solid ${C.line}`, borderRadius: 9, padding: "8px", cursor: "pointer", color: C.gray2, fontSize: 10.5, fontWeight: 700 }}>
            放棄本場
          </button>
        </div>
      )}

      {/* 中文失敗原因（逾時／取消／被拒絕） */}
      {RETRY_ACTION_KEYS.includes(act.key) && (
        <div style={{ color: C.bad, fontSize: 10.5, marginTop: 8, lineHeight: 1.7 }}>⚠ {statusText}</div>
      )}
      {flow.err && <div style={{ color: C.bad, fontSize: 10, marginTop: 6 }}>⚠ {flow.err}</div>}

      {/* 技術內容：正式模式**不出現**；debug 模式出現但預設收合 */}
      {debug && (
        <div style={{ marginTop: 8 }}>
          <button onClick={() => setTech((v) => !v)}
            style={{ background: "transparent", border: "none", cursor: "pointer", color: C.gray2, fontSize: 9.5, fontWeight: 700, padding: 0 }}>
            {tech ? "收合技術內容 ▲" : "查看技術內容 ▼"}
          </button>
          {tech && (
            <div data-testid="flow-internals" style={{ marginTop: 6, background: "rgba(0,0,0,0.35)", borderRadius: 9, padding: "8px 9px", border: `1px dashed ${C.line}` }}>
              {Object.entries(flow.internals).map(([k, v]) => (
                <div key={k} style={{ display: "flex", gap: 6, fontSize: 8.5, fontFamily: "monospace", lineHeight: 1.7, minWidth: 0 }}>
                  <span style={{ color: C.gray, width: 96, flexShrink: 0 }}>{k}</span>
                  <span style={{ color: v ? C.gray2 : "#3f3f46", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{String(v ?? "—")}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
