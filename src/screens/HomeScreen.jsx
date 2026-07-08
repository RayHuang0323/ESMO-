// screens/HomeScreen.jsx — 首頁（Sprint09 流程恢復：首頁 → 主選單）
import React from "react";

export default function HomeScreen({ onEnter }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 18 }}>
      <div style={{ fontSize: 64, fontWeight: 900, letterSpacing: "0.2em", color: "#93c5fd", textShadow: "0 0 40px rgba(59,130,246,0.5)" }}>ESMO</div>
      <div style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", letterSpacing: "0.3em" }}>ESPORTS MANAGER SIMULATION</div>
      <button onClick={onEnter} style={{ marginTop: 22, background: "linear-gradient(135deg,#3b82f6,#1d4ed8)", border: "2px solid #93c5fd", borderRadius: 14, padding: "14px 52px", color: "#fff", fontSize: 18, fontWeight: 900, letterSpacing: "0.1em", cursor: "pointer", boxShadow: "0 8px 40px rgba(59,130,246,0.5)" }}>進入遊戲</button>
    </div>
  );
}
