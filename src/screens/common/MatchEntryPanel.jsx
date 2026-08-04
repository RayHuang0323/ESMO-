// ============================================================================
//  screens/common/MatchEntryPanel.jsx — 出賽申請狀態（Milestone O3）
//
//  MOBA 與 CS 兩個賽前頁共用同一個面板，避免兩邊各寫一份判斷與版面。
//  資料全部來自 `profileStore.matchEntry(mode)`（＝契約產生的結果），
//  **畫面不自己判規則、不自己算數字**。
//
//  手機優先：單欄、可換行、金額與代碼 nowrap，320px 不水平溢出。
// ============================================================================
import React, { useState } from "react";
import { useProfileStore } from "../../platform/profileStore.js";

const C = {
  ok: "#34d399", bad: "#f87171", warn: "#fbbf24",
  gray: "#71717a", gray2: "#a1a1aa", line: "rgba(255,255,255,0.10)",
  card: "rgba(255,255,255,0.04)", card2: "rgba(255,255,255,0.06)",
};

/**
 * @param {"moba"|"cs"} mode
 * @param {() => void} [onAutoFill] 有阻擋時顯示「自動填入」；不給就不顯示
 */
export default function MatchEntryPanel({ mode = "moba", onAutoFill = null }) {
  const entry = useProfileStore((s) => s.matchEntry)(mode);
  const [open, setOpen] = useState(false);
  const ok = entry.ok;
  const req = entry.request;

  return (
    <div style={{
      background: C.card, borderRadius: 12, padding: "10px 12px", marginBottom: 10,
      border: `1px solid ${ok ? "rgba(52,211,153,0.35)" : "rgba(248,113,113,0.35)"}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13 }}>{ok ? "🛡" : "⚠"}</span>
        <span style={{ color: "white", fontSize: 12, fontWeight: 800 }}>出賽申請</span>
        <span style={{
          fontSize: 9, fontWeight: 800, borderRadius: 6, padding: "2px 7px",
          background: ok ? "rgba(52,211,153,0.15)" : "rgba(248,113,113,0.15)",
          color: ok ? C.ok : C.bad,
        }}>
          {ok ? "已通過驗證" : `未通過（${entry.errors.length} 項）`}
        </span>
        {ok && (
          <button onClick={() => setOpen((v) => !v)}
            style={{ marginLeft: "auto", background: "transparent", border: "none", cursor: "pointer", color: C.gray2, fontSize: 10, fontWeight: 700 }}>
            {open ? "收合明細 ▲" : "查看提交內容 ▼"}
          </button>
        )}
      </div>

      {/* 阻擋理由：逐條顯示契約產生的訊息 */}
      {!ok && (
        <div style={{ marginTop: 7 }}>
          {entry.errors.slice(0, 6).map((e, i) => (
            <div key={i} style={{ color: C.gray2, fontSize: 10, lineHeight: 1.75 }}>· {e.message}</div>
          ))}
          {onAutoFill && (
            <button onClick={onAutoFill}
              style={{ marginTop: 8, width: "100%", background: C.card2, border: `1px solid ${C.line}`, borderRadius: 9, padding: "8px", cursor: "pointer", color: "white", fontSize: 11, fontWeight: 700 }}>
              ⚡ 自動填入（一隊優先・定位相符・排除不可出賽）
            </button>
          )}
        </div>
      )}

      {/* 位置不符：可出賽但要提醒 */}
      {ok && entry.warnings.length > 0 && (
        <div style={{ marginTop: 7 }}>
          {entry.warnings.map((w, i) => (
            <div key={i} style={{ color: C.warn, fontSize: 10, lineHeight: 1.75 }}>· {w.message}</div>
          ))}
        </div>
      )}

      {ok && (
        <>
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            {[
              { k: "隊伍版本", v: req.rosterVersion },
              { k: "申請識別", v: req.transactionId.slice(-12) },
              { k: "時間", v: `S${req.submittedAt.season}・W${req.submittedAt.week}` },
            ].map((x) => (
              <div key={x.k} style={{ background: C.card2, borderRadius: 8, padding: "5px 8px", minWidth: 0 }}>
                <div style={{ color: C.gray, fontSize: 8 }}>{x.k}</div>
                <div style={{ color: "white", fontSize: 10, fontWeight: 700, fontFamily: "monospace", whiteSpace: "nowrap" }}>{x.v}</div>
              </div>
            ))}
          </div>

          {open && (
            <div style={{ marginTop: 8 }}>
              <div style={{ color: C.gray, fontSize: 8.5, marginBottom: 5, lineHeight: 1.6 }}>
                提交內容只有身分與編制。能力、體力、傷害等數值**不會提交**，
                由伺服器以 playerId 自行查詢。
              </div>
              {req.squad.map((r) => (
                <div key={r.seat} style={{ display: "flex", alignItems: "center", gap: 7, padding: "4px 0", borderTop: `1px solid ${C.line}`, fontSize: 10 }}>
                  <span style={{ color: C.gray, width: 28, fontFamily: "monospace" }}>{r.seat}</span>
                  <span style={{ color: "white", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.playerId}</span>
                  <span style={{ color: r.role === r.seatRole ? C.gray2 : C.warn, whiteSpace: "nowrap" }}>{r.role}</span>
                  <span style={{ color: C.gray, whiteSpace: "nowrap" }}>{r.tier === "active" ? "一隊" : "替補"}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
