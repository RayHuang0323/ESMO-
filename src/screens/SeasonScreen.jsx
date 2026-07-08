// ============================================================================
//  screens/SeasonScreen.jsx — 賽季戰績（Sprint09）
//  唯一資料來源：seasonStore.history（BattleResult[]）；統計皆 seasonData 純推導。
// ============================================================================
import React from "react";
import { useSeasonStore } from "../platform/seasonStore.js";
import { standings, playerRanking, analytics } from "../platform/seasonData.js";
import { ROSTER } from "../data/roster.js";

const MONO = "ui-monospace,Menlo,monospace";
const fmtT = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const Panel = ({ title, children }) => (
  <div style={{ background: "rgba(8,14,24,0.9)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: "10px 13px", width: 330 }}>
    <div style={{ fontSize: 9.5, letterSpacing: "0.2em", color: "rgba(255,255,255,0.5)", fontWeight: 900, marginBottom: 6 }}>{title}</div>
    {children}
  </div>
);

export default function SeasonScreen({ onBack }) {
  const history = useSeasonStore((s) => s.history);
  const st = standings(history), pr = playerRanking(history).slice(0, 5), an = analytics(history);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", height: "100%", padding: "18px 0", overflow: "auto", gap: 10 }}>
      <div style={{ fontSize: 19, fontWeight: 900, color: "#e5e7eb", letterSpacing: "0.15em" }}>賽季戰績</div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>共 {an.games} 場 · 場均 {fmtT(an.avgDuration)} · 場均擊殺 {an.avgKills.toFixed(1)} · 🐉{an.avgDragons.toFixed(1)} 👑{an.avgBarons.toFixed(1)}</div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
        <Panel title="積分榜（STANDINGS）">
          {st.map((t) => (
            <div key={t.side} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0" }}>
              <span style={{ fontWeight: 800, color: t.side === "blue" ? "#93c5fd" : "#fca5a5" }}>{t.name}</span>
              <span style={{ fontFamily: MONO }}>{t.wins}勝{t.losses}敗 · {Math.round(t.winRate * 100)}%</span>
            </div>
          ))}
        </Panel>
        <Panel title="選手排行（AVG RATING）">
          {pr.map((p, i) => (
            <div key={p.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, padding: "2.5px 0" }}>
              <span style={{ color: "rgba(255,255,255,0.8)" }}>{i + 1}. {ROSTER[p.id]?.player ?? p.id} <span style={{ color: "rgba(255,255,255,0.4)" }}>{ROSTER[p.id]?.hero}</span></span>
              <span style={{ fontFamily: MONO, color: "#fde047" }}>{p.avgRating.toFixed(0)} · {p.kda.toFixed(1)}KDA{p.mvps ? ` · ${p.mvps}MVP` : ""}</span>
            </div>
          ))}
          {!pr.length && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>尚無對戰記錄</div>}
        </Panel>
        <Panel title="近期戰績（HISTORY）">
          {history.slice(-8).reverse().map((r, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, padding: "2.5px 0" }}>
              <span style={{ fontWeight: 800, color: r.winner === "blue" ? "#93c5fd" : "#fca5a5" }}>{r.teams[r.winner].name} 勝</span>
              <span style={{ fontFamily: MONO, color: "rgba(255,255,255,0.7)" }}>{r.score.blue}:{r.score.red} · {fmtT(r.duration)}</span>
            </div>
          ))}
          {!history.length && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>尚無對戰記錄</div>}
        </Panel>
      </div>
      <button onClick={onBack} style={{ marginTop: 6, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 10, padding: "9px 26px", color: "#fff", fontWeight: 800, cursor: "pointer" }}>← 返回主選單</button>
    </div>
  );
}
