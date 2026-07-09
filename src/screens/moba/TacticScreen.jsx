// ============================================================================
//  screens/moba/TacticScreen.jsx — MOBA 戰術傾向（Sprint11）
//  ⚠ 誠實：戰術選擇目前不驅動引擎（引擎為既定平衡模型），為賽前策略展示。
// ============================================================================
import React, { useState } from "react";
import { Frame } from "./LineupScreen.jsx";

const TACTICS = [
  { id: "early", icon: "⚡", name: "前期壓制", desc: "早期入侵與抓單，滾雪球" },
  { id: "macro", icon: "🧭", name: "運營節奏", desc: "資源置換與分推運營" },
  { id: "teamfight", icon: "⚔️", name: "團戰決勝", desc: "後期集結一波帶走" },
];

export default function TacticScreen({ onNext, onBack }) {
  const [sel, setSel] = useState("macro");
  return (
    <Frame title="戰術" sub="TEAM STRATEGY" onBack={onBack} onNext={onNext} nextLabel="開始載入 →">
      <div style={{ width: 340 }}>
        {TACTICS.map((t) => (
          <button key={t.id} onClick={() => setSel(t.id)} style={{ width: "100%", textAlign: "left", display: "flex", gap: 12, alignItems: "center", background: sel === t.id ? "rgba(30,58,110,0.7)" : "rgba(20,28,44,0.6)", border: `1px solid ${sel === t.id ? "#93c5fd" : "rgba(255,255,255,0.12)"}`, borderRadius: 11, padding: "12px 14px", marginBottom: 7, color: "#fff", cursor: "pointer" }}>
            <span style={{ fontSize: 24 }}>{t.icon}</span>
            <div><div style={{ fontSize: 14, fontWeight: 900 }}>{t.name}</div><div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.5)" }}>{t.desc}</div></div>
          </button>
        ))}
        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", marginTop: 4 }}>戰術傾向為賽前策略展示，尚未接入引擎（技術債）</div>
      </div>
    </Frame>
  );
}
