// screens/moba/MatchmakingScreen.jsx — MOBA 配對過場（Sprint11）
import React, { useEffect, useState } from "react";
import { TEAMS } from "../../data/roster.js";
import { GC } from "../../ui/theme.js";

export default function MatchmakingScreen({ onDone, onBack }) {
  const [found, setFound] = useState(false);
  useEffect(() => { const t = setTimeout(() => setFound(true), 1400); return () => clearTimeout(t); }, []);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 16 }}>
      <div style={{ fontSize: 13, letterSpacing: "0.2em", color: "rgba(255,255,255,0.5)" }}>{found ? "對手已確認" : "配對中…"}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <Team t={TEAMS.blue} c={GC.blueL} />
        <div style={{ fontSize: 22, fontWeight: 900, color: "#fde047" }}>VS</div>
        <Team t={found ? TEAMS.red : { emoji: "❓", name: "搜尋中" }} c={GC.redL} dim={!found} />
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
        {onBack && <button onClick={onBack} style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 10, padding: "9px 24px", color: "#fff", fontWeight: 800, cursor: "pointer" }}>← 取消</button>}
        <button onClick={onDone} disabled={!found} style={{ background: found ? "linear-gradient(135deg,#3b82f6,#1d4ed8)" : "rgba(255,255,255,0.06)", border: found ? "2px solid #93c5fd" : "1px solid rgba(255,255,255,0.15)", borderRadius: 10, padding: "9px 30px", color: found ? "#fff" : "rgba(255,255,255,0.3)", fontWeight: 900, cursor: found ? "pointer" : "default" }}>進入 Ban/Pick →</button>
      </div>
    </div>
  );
}
const Team = ({ t, c, dim }) => (
  <div style={{ textAlign: "center", opacity: dim ? 0.4 : 1 }}>
    <div style={{ fontSize: 44 }}>{t.emoji}</div>
    <div style={{ fontWeight: 900, color: c, marginTop: 4 }}>{t.name}</div>
  </div>
);
