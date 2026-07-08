// screens/MenuScreen.jsx — 主選單（Sprint09）：MOBA / 賽季戰績 / CS（Legacy 未整合）
import React from "react";

const Item = ({ title, desc, onClick, disabled }) => (
  <button onClick={onClick} disabled={disabled} style={{ width: 340, textAlign: "left", background: disabled ? "rgba(255,255,255,0.04)" : "rgba(30,41,59,0.85)", border: `1px solid ${disabled ? "rgba(255,255,255,0.1)" : "rgba(147,197,253,0.4)"}`, borderRadius: 12, padding: "14px 18px", color: disabled ? "rgba(255,255,255,0.35)" : "#fff", cursor: disabled ? "default" : "pointer" }}>
    <div style={{ fontSize: 16, fontWeight: 900 }}>{title}</div>
    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 3 }}>{desc}</div>
  </button>
);

export default function MenuScreen({ onMoba, onSeason, onBack }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12 }}>
      <div style={{ fontSize: 22, fontWeight: 900, color: "#e5e7eb", letterSpacing: "0.15em", marginBottom: 8 }}>主選單</div>
      <Item title="🗡 MOBA 對戰" desc="賽前準備 → 英雄資訊 → 開始 Battle" onClick={onMoba} />
      <Item title="📊 賽季戰績" desc="History / Ranking / Analytics（全部來自 BattleResult）" onClick={onSeason} />
      <Item title="🔫 CS 模式" desc="Legacy 內聯模組（EsportsGame.jsx），尚未整合至主幹" disabled />
      <button onClick={onBack} style={{ marginTop: 10, background: "none", border: "none", color: "rgba(255,255,255,0.45)", fontSize: 12, cursor: "pointer" }}>← 返回首頁</button>
    </div>
  );
}
