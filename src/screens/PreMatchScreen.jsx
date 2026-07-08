// ============================================================================
//  screens/PreMatchScreen.jsx — 賽前準備 + 英雄資訊（Sprint09）
//  英雄資料唯一來源：data/heroDatabase.js（CHAMPIONS_100）；等級來自 Hero Progress。
//  MOBA 模型：Player 操作 Hero → 每列 = 選手 + 其英雄完整資訊（含 P/Q/W/E/R）。
// ============================================================================
import React from "react";
import { TEAMS, ROSTER } from "../data/roster.js";
import { heroById } from "../data/heroDatabase.js";
import { useHeroProgressStore } from "../hero/heroProgressStore.js";

const DIFF = ["", "★", "★★", "★★★"];

function PlayerRow({ pid, side }) {
  const r = ROSTER[pid];
  const h = heroById(r.heroId);
  const lv = useHeroProgressStore((s) => s.progress[r.heroId]?.level ?? 1);
  const c = side === "blue" ? "#93c5fd" : "#fca5a5";
  return (
    <div style={{ background: "rgba(8,14,24,0.85)", border: `1px solid ${c}33`, borderRadius: 10, padding: "8px 11px", marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontWeight: 900, color: c, fontSize: 13 }}>{r.player} <span style={{ color: "#e5e7eb" }}>· {h.zh}</span></span>
        <span style={{ fontFamily: "ui-monospace,monospace", color: "#fde047", fontWeight: 900, fontSize: 12 }}>Lv {lv}</span>
      </div>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 1 }}>{h.title} · {h.arch} · {h.lane} · 難度{DIFF[h.diff]}</div>
      <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.65)", marginTop: 3, lineHeight: 1.6 }}>
        <b style={{ color: h.color }}>P</b> {h.P} · <b style={{ color: h.color }}>Q</b> {h.Q} · <b style={{ color: h.color }}>W</b> {h.W} · <b style={{ color: h.color }}>E</b> {h.E} · <b style={{ color: "#fde047" }}>R</b> {h.R}
      </div>
    </div>
  );
}

export default function PreMatchScreen({ onStart, onBack }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", height: "100%", padding: "18px 0", overflow: "auto" }}>
      <div style={{ fontSize: 19, fontWeight: 900, color: "#e5e7eb", letterSpacing: "0.15em" }}>賽前準備</div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginBottom: 12 }}>英雄資料庫：CHAMPIONS_100 · 等級：Hero Progress</div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
        {["blue", "red"].map((side) => (
          <div key={side} style={{ width: 330 }}>
            <div style={{ fontWeight: 900, fontSize: 14, color: side === "blue" ? "#93c5fd" : "#fca5a5", marginBottom: 7 }}>{TEAMS[side].emoji} {TEAMS[side].name}</div>
            {Object.keys(ROSTER).filter((p) => p[0] === side[0]).map((pid) => <PlayerRow key={pid} pid={pid} side={side} />)}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <button onClick={onBack} style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 10, padding: "10px 26px", color: "#fff", fontWeight: 800, cursor: "pointer" }}>← 返回</button>
        <button onClick={onStart} style={{ background: "linear-gradient(135deg,#3b82f6,#1d4ed8)", border: "2px solid #93c5fd", borderRadius: 10, padding: "10px 40px", color: "#fff", fontSize: 15, fontWeight: 900, cursor: "pointer" }}>⚔ 開始 Battle</button>
      </div>
    </div>
  );
}
