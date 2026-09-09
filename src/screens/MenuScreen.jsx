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
      {/* ⚠ 「全部來自 BattleResult」是資料來源，不是玩家語言。
          玩家想知道的是「這些數字可不可信」＝ 依實際比賽結果統計。 */}
      <Item title="📊 賽季戰績" desc="戰績 · 排名 · 數據分析（依每場實際結果統計）" onClick={onSeason} />
      {/* ⚠ 同上：檔名與「主幹」是開發語彙。玩家只需要知道還不能玩。 */}
      <Item title="🔫 CS 模式" desc="尚未開放" disabled />
      <button onClick={onBack} style={{ marginTop: 10, background: "none", border: "none", color: "rgba(255,255,255,0.45)", fontSize: 12, cursor: "pointer" }}>← 返回首頁</button>
    </div>
  );
}
