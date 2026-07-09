// ============================================================================
//  screens/moba/LineupScreen.jsx — MOBA 選手配置（Sprint11）
//  真資料：ROSTER + heroDatabase + heroProgress（等級）。確認先發 5 人。
// ============================================================================
import React from "react";
import { TEAMS, ROSTER } from "../../data/roster.js";
import { heroById } from "../../data/heroDatabase.js";
import { useHeroProgressStore } from "../../hero/heroProgressStore.js";

const LANE_ORDER = ["上路", "打野", "中路", "下路", "輔助"];

export default function LineupScreen({ onNext, onBack }) {
  const progress = useHeroProgressStore((s) => s.progress);
  const blue = Object.entries(ROSTER).filter(([p]) => p[0] === "b")
    .sort((a, b) => LANE_ORDER.indexOf(heroById(a[1].heroId)?.lane) - LANE_ORDER.indexOf(heroById(b[1].heroId)?.lane));
  return (
    <Frame title="選手配置" sub="確認先發陣容 · LINEUP" onBack={onBack} onNext={onNext} nextLabel="配對對手 →">
      <div style={{ width: 360 }}>
        <div style={{ fontWeight: 900, color: "#93c5fd", marginBottom: 8 }}>{TEAMS.blue.emoji} {TEAMS.blue.name} 先發</div>
        {blue.map(([pid, r]) => {
          const h = heroById(r.heroId) || {}; const lv = progress[r.heroId]?.level ?? 1;
          return (
            <div key={pid} style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(8,14,24,0.85)", border: "1px solid rgba(147,197,253,0.25)", borderRadius: 10, padding: "8px 11px", marginBottom: 6 }}>
              <div style={{ width: 30, height: 30, borderRadius: 7, background: h.color || "#3b82f6", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: "#0b1220" }}>{(h.zh || "?").slice(0, 1)}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#e5e7eb" }}>{r.player} <span style={{ color: "rgba(255,255,255,0.5)", fontWeight: 600 }}>· {h.zh}</span></div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)" }}>{h.lane} · {h.arch} · {h.title}</div>
              </div>
              <div style={{ fontFamily: "ui-monospace,monospace", fontWeight: 900, color: "#fde047" }}>Lv{lv}</div>
            </div>
          );
        })}
      </div>
    </Frame>
  );
}

export function Frame({ title, sub, children, onBack, onNext, nextLabel = "下一步 →", extra = null }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", height: "100%", padding: "18px 0", overflow: "auto" }}>
      <div style={{ fontSize: 19, fontWeight: 900, color: "#e5e7eb", letterSpacing: "0.15em" }}>{title}</div>
      <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.45)", marginBottom: 14, letterSpacing: "0.1em" }}>{sub}</div>
      {children}
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        {onBack && <button onClick={onBack} style={btn(false)}>← 返回</button>}
        {extra}
        {onNext && <button onClick={onNext} style={btn(true)}>{nextLabel}</button>}
      </div>
    </div>
  );
}
const btn = (primary) => ({ background: primary ? "linear-gradient(135deg,#3b82f6,#1d4ed8)" : "rgba(255,255,255,0.08)", border: primary ? "2px solid #93c5fd" : "1px solid rgba(255,255,255,0.25)", borderRadius: 10, padding: "10px 30px", color: "#fff", fontSize: 14, fontWeight: 900, cursor: "pointer" });
