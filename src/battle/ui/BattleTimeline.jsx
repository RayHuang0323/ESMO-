// ============================================================================
//  battle/ui/BattleTimeline.jsx — 側欄即時事件流（直接讀 battleStore.events）
//  時間序列出本場所有推導事件；最新在上。無假資料。
// ============================================================================

import React from "react";
import { useBattleStore } from "../battleStore.js";
import { fmtT } from "../../gameData.js";

const ICON = {
  FIRST_BLOOD: "🩸", KILL: "⚔️", MULTI_KILL: "🔥", ACE: "💥",
  TOWER_DESTROYED: "🗼", DRAGON_SLAIN: "🐉", BARON_SLAIN: "👑", VICTORY: "🏆",
};
const sideColor = (s) => (s === "blue" ? "#93c5fd" : s === "red" ? "#fca5a5" : "#cbd5e1");

export default function BattleTimeline({ open = true, max = 12 }) {
  const events = useBattleStore((s) => s.events);
  if (!open) return null;
  const rows = [...events].reverse().slice(0, max);

  return (
    <div style={{ position: "absolute", top: 82, left: 10, width: 214, maxHeight: "42vh", overflow: "hidden",
      background: "rgba(8,14,24,0.6)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10,
      backdropFilter: "blur(4px)", padding: "8px 6px", pointerEvents: "none", fontFamily: "system-ui,sans-serif" }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.55)", letterSpacing: "0.18em", padding: "0 4px 6px" }}>戰報 TIMELINE</div>
      {rows.length === 0 && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", padding: "4px" }}>尚無事件…</div>}
      {rows.map((ev) => (
        <div key={ev.id} style={{ display: "flex", alignItems: "flex-start", gap: 6, padding: "3px 4px", fontSize: 11, lineHeight: 1.3 }}>
          <span style={{ fontSize: 12, flexShrink: 0 }}>{ICON[ev.type] || "•"}</span>
          <span style={{ color: "rgba(255,255,255,0.4)", fontFamily: "monospace", fontSize: 10, flexShrink: 0, marginTop: 1 }}>{fmtT(ev.t)}</span>
          <span style={{ color: sideColor(ev.side), fontWeight: 600 }}>{ev.text}</span>
        </div>
      ))}
    </div>
  );
}
