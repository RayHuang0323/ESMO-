// ============================================================================
//  screens/common/MatchEntryPanel.jsx — 出賽陣容是否完整（純顯示）
//
//  ── 正式環境驗收後的定位 ──────────────────────────────────────────────────
//  這張卡在正式模式只回答一件事：**陣容湊齊了沒有，沒齊是差什麼**。
//
//  拿掉的東西與理由：
//    · 「出賽申請」這個詞本身就是內部流程用語 → 正式標題改成「出賽陣容」。
//    · 隊伍版本／申請識別／提交時間／提交內容明細 → 只在 `?debug=1` 出現，
//      而且預設收合。玩家不需要知道 `MatchEntryRequest` 存在。
//
//  ⚠ **契約欄位一個都沒刪**，`matchEntry` 的驗證邏輯與 Store 形狀完全未動；
//    改的只是「畫面上畫什麼」。
//
//  ── 單一狀態來源 ──────────────────────────────────────────────────────────
//  狀態由 `useMatchFlow` 透過 `flow` 傳進來；本元件不自己訂閱 store。
//  （`flow` 缺席時退回自行讀取，讓既有呼叫端不會壞。）
// ============================================================================
import React, { useState } from "react";
import { useProfileStore } from "../../platform/profileStore.js";
import { isDebugMode } from "../../ui/debugMode.js";

const C = {
  ok: "#34d399", bad: "#f87171", warn: "#fbbf24",
  gray: "#71717a", gray2: "#a1a1aa", line: "rgba(255,255,255,0.10)",
  card: "rgba(255,255,255,0.04)", card2: "rgba(255,255,255,0.06)",
};

/**
 * @param {"moba"|"cs"} mode
 * @param {() => void} [onAutoFill] 有阻擋時顯示「自動填入」
 * @param {object} [flow] `useMatchFlow` 的輸出（單一狀態來源）
 */
export default function MatchEntryPanel({ mode = "moba", onAutoFill = null, flow = null }) {
  const fallbackEntry = useProfileStore((s) => s.matchEntry);
  const fallbackCheck = useProfileStore((s) => s.squadCheck);
  const entry = flow?.entry ?? fallbackEntry(mode);
  const check = flow?.check ?? fallbackCheck(mode);
  const [open, setOpen] = useState(false);
  const debug = isDebugMode();

  const ok = entry.ok;
  const req = entry.request;
  const full = check.filled >= check.required;

  return (
    <div style={{
      background: C.card, borderRadius: 12, padding: "10px 12px", marginBottom: 10,
      border: `1px solid ${ok ? "rgba(52,211,153,0.35)" : "rgba(248,113,113,0.35)"}`, minWidth: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", minWidth: 0 }}>
        <span style={{ fontSize: 13 }}>{ok ? "🛡" : "⚠"}</span>
        <span style={{ color: "white", fontSize: 12, fontWeight: 800 }}>出賽陣容</span>
        <span style={{
          fontSize: 10, fontWeight: 900, borderRadius: 6, padding: "2px 8px",
          background: full ? "rgba(52,211,153,0.15)" : "rgba(248,113,113,0.15)",
          color: full ? C.ok : C.bad, whiteSpace: "nowrap",
        }}>
          {check.filled}/{check.required}
        </span>
        <span style={{ color: ok ? C.ok : C.bad, fontSize: 10, fontWeight: 700 }}>
          {ok ? "已就緒" : "尚未完成"}
        </span>
      </div>

      {/* 缺什麼：逐條顯示契約產生的中文理由 */}
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

      {/* 技術內容：正式模式**不出現**；debug 模式出現且預設收合 */}
      {debug && ok && req && (
        <div style={{ marginTop: 8 }}>
          <button onClick={() => setOpen((v) => !v)}
            style={{ background: "transparent", border: "none", cursor: "pointer", color: C.gray2, fontSize: 9.5, fontWeight: 700, padding: 0 }}>
            {open ? "收合技術內容 ▲" : "查看技術內容 ▼"}
          </button>
          {open && (
            <div data-testid="entry-internals" style={{ marginTop: 6 }}>
              <div style={{ color: C.gray, fontSize: 8.5, marginBottom: 5, lineHeight: 1.6 }}>
                提交內容只有身分與編制。能力、體力、傷害等數值不會提交，
                由伺服器以 playerId 自行查詢。
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 6, flexWrap: "wrap", minWidth: 0 }}>
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
              {req.squad.map((r) => (
                <div key={r.seat} style={{ display: "flex", alignItems: "center", gap: 7, padding: "4px 0", borderTop: `1px solid ${C.line}`, fontSize: 10, minWidth: 0 }}>
                  <span style={{ color: C.gray, width: 28, fontFamily: "monospace", flexShrink: 0 }}>{r.seat}</span>
                  <span style={{ color: "white", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.playerId}</span>
                  <span style={{ color: r.role === r.seatRole ? C.gray2 : C.warn, whiteSpace: "nowrap" }}>{r.role}</span>
                  <span style={{ color: C.gray, whiteSpace: "nowrap" }}>{r.tier === "active" ? "一隊" : "替補"}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
