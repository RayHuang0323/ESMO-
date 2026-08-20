// R63：首頁／賽前頁共用的進行中比賽摘要。
// 只讀 profileStore.activeMatchView()，不另建導航或比賽狀態。
import React, { useState } from "react";
import { useProfileStore } from "../../platform/profileStore.js";
import { GC } from "../../ui/theme.js";

const mmss = (sec) => {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

export default function ActiveMatchCard({ onResume = null, compact = false }) {
  const sessionState = useProfileStore((s) => s.matchmaking?.session?.state ?? null);
  const activeStatus = useProfileStore((s) => s.matchmaking?.session?.activeMatch?.status ?? null);
  const updatedAt = useProfileStore((s) => s.matchmaking?.session?.activeMatch?.updatedAt ?? 0);
  const [error, setError] = useState(null);
  const view = useProfileStore.getState().activeMatchView();
  // 原始值訂閱保證 snapshot 更新時重繪；這個讀值只是避免 selector 回傳整個物件。
  void sessionState; void activeStatus; void updatedAt;
  if (!view) return null;
  if (!view.restoreable) {
    return (
      <section data-testid="active-match-invalid" style={{ margin: compact ? "0 0 10px" : "0 14px 12px", padding: "11px 12px", borderRadius: 12, background: "rgba(251,191,36,0.10)", border: "1px solid rgba(251,191,36,0.35)", color: GC.gold, fontSize: 11 }}>
        此場次無法恢復，請重新開始配對。
      </section>
    );
  }
  const mode = view.mode === "cs" ? "CS" : "MOBA";
  const opponent = view.opponent?.name ?? "對手";
  const time = view.simulation?.timeSec ?? 0;
  const abandon = () => {
    if (!window.confirm("放棄後將無法恢復本場比賽。確定要放棄嗎？")) return;
    const r = useProfileStore.getState().abandonMatchSession();
    if (!r.ok) setError(r.errors?.[0]?.message ?? "無法放棄本場比賽");
  };
  return (
    <section data-testid="active-match-card" style={{ margin: compact ? "0 0 10px" : "0 14px 12px", padding: compact ? 11 : 13, borderRadius: 14, background: "linear-gradient(135deg,rgba(96,165,250,0.14),rgba(167,139,250,0.10))", border: "1px solid rgba(147,197,253,0.35)", boxShadow: "0 8px 24px rgba(0,0,0,0.20)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: GC.green, boxShadow: `0 0 0 4px ${GC.green}22`, flexShrink: 0 }} />
        <strong style={{ color: "#fff", fontSize: 13 }}>進行中的對戰</strong>
        <span style={{ marginLeft: "auto", color: GC.blueL, fontSize: 10, fontWeight: 800 }}>{mode}</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 7, color: "#e5e7eb", fontSize: 12, fontWeight: 800 }}>
        <span>vs {opponent}</span>
        <span style={{ color: GC.gray, fontSize: 10, fontFamily: "monospace" }}>模擬 {mmss(time)}</span>
      </div>
      <div style={{ display: "flex", gap: 7, marginTop: 10, flexWrap: "wrap" }}>
        <button type="button" data-testid="resume-active-match" onClick={() => { setError(null); onResume?.(view); }} style={{ flex: 1, minWidth: 150, minHeight: 42, border: "none", borderRadius: 10, padding: "10px 12px", background: `linear-gradient(135deg,${GC.blue},${GC.purp})`, color: "#fff", fontSize: 12.5, fontWeight: 900, cursor: "pointer", touchAction: "manipulation" }}>
          返回進行中的比賽
        </button>
        <button type="button" data-testid="abandon-active-match" onClick={abandon} style={{ minHeight: 42, border: `1px solid ${GC.line}`, borderRadius: 10, padding: "10px 12px", background: "rgba(8,14,24,0.50)", color: GC.gray, fontSize: 11, fontWeight: 800, cursor: "pointer", touchAction: "manipulation" }}>
          放棄本場
        </button>
      </div>
      {error && <div style={{ color: GC.red, fontSize: 10, marginTop: 7 }}>⚠ {error}</div>}
    </section>
  );
}
