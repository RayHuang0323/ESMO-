// ============================================================================
//  battle/ui/BattleHUD.jsx — 正式化戰鬥 HUD（全部直接讀 snapshot / battleStore）
//  含：雙方比分、Battle Timer、推塔數、Dragon、Baron、Gold、Win Probability、
//      即時 MVP 候選。無假資料。
// ============================================================================

import React from "react";
import { useGameStore } from "../../useGameStore.js";
import { useBattleStore } from "../battleStore.js";
import { fmtT } from "../../gameData.js";

const box = (border) => ({
  display: "flex", alignItems: "center", gap: 6,
  background: "rgba(8,14,24,0.72)", border: `1px solid ${border}`,
  borderRadius: 10, padding: "5px 11px", backdropFilter: "blur(4px)",
});
const stat = (icon, val, color) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color, fontWeight: 800, fontSize: 12, fontFamily: "monospace" }}>
    <span style={{ fontSize: 13 }}>{icon}</span>{val}
  </span>
);

export default function BattleHUD({ blueName = "德國海豹", blueEmoji = "🦭", redName = "赤焰軍團", redEmoji = "🔥", roster = null }) {
  const hud = useGameStore((s) => s.hud);
  const { derived, mvp } = useBattleStore();
  const goldDiff = (hud.bGold - hud.rGold);
  const blueLead = goldDiff >= 0;
  const mvpLabel = mvp ? `${(roster?.[mvp.id]?.player ?? mvp.id.toUpperCase())} ${mvp.k}/${mvp.d}` : "—";
  const mvpBlue = mvp?.side === "blue";

  return (
    <div style={{ position: "absolute", top: 10, left: 10, right: 10, pointerEvents: "none", fontFamily: "system-ui,-apple-system,sans-serif" }}>
      {/* 主比分列 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        {/* 藍方 */}
        <div style={box("rgba(59,130,246,0.5)")}>
          <span style={{ fontSize: 15 }}>{blueEmoji}</span>
          <span style={{ color: "#93c5fd", fontWeight: 800, fontSize: 13 }}>{blueName}</span>
          <span style={{ color: "#fff", fontWeight: 900, fontSize: 18, fontFamily: "monospace" }}>{hud.bK}</span>
          <span style={{ margin: "0 4px", color: "rgba(255,255,255,0.35)" }}>·</span>
          {stat("🗼", derived.blueTowers, "#93c5fd")}
          {stat("🐉", derived.dragonB, "#c4b5fd")}
          {stat("👑", derived.baronB, "#fcd34d")}
        </div>

        {/* 中央：Timer + Gold 差 */}
        <div style={{ textAlign: "center" }}>
          <div style={{ color: "#fff", fontSize: 16, fontWeight: 900, fontFamily: "monospace", background: "rgba(8,14,24,0.72)", padding: "2px 12px", borderRadius: 8 }}>{fmtT(hud.ts)}</div>
          <div style={{ color: blueLead ? "#93c5fd" : "#fca5a5", fontSize: 10, fontWeight: 800, marginTop: 2 }}>
            {blueLead ? "🔵" : "🔴"} 金幣差 {(Math.abs(goldDiff) / 1000).toFixed(1)}k
          </div>
        </div>

        {/* 紅方 */}
        <div style={{ ...box("rgba(239,68,68,0.5)"), flexDirection: "row-reverse" }}>
          <span style={{ fontSize: 15 }}>{redEmoji}</span>
          <span style={{ color: "#fca5a5", fontWeight: 800, fontSize: 13 }}>{redName}</span>
          <span style={{ color: "#fff", fontWeight: 900, fontSize: 18, fontFamily: "monospace" }}>{hud.rK}</span>
          <span style={{ margin: "0 4px", color: "rgba(255,255,255,0.35)" }}>·</span>
          {stat("🗼", derived.redTowers, "#fca5a5")}
          {stat("🐉", derived.dragonR, "#c4b5fd")}
          {stat("👑", derived.baronR, "#fcd34d")}
        </div>
      </div>

      {/* 勝率條 */}
      <div style={{ marginTop: 6, height: 6, borderRadius: 99, overflow: "hidden", background: "rgba(0,0,0,0.5)", display: "flex" }}>
        <div style={{ width: `${hud.winProb * 100}%`, background: "linear-gradient(90deg,#3b82f6,#60a5fa)", transition: "width 0.3s" }} />
        <div style={{ flex: 1, background: "linear-gradient(90deg,#fca5a5,#ef4444)" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2, fontSize: 9, fontWeight: 700 }}>
        <span style={{ color: "#93c5fd" }}>勝率 {(hud.winProb * 100).toFixed(0)}%</span>
        <span style={{ color: mvpBlue ? "#93c5fd" : "#fca5a5" }}>MVP候選 {mvpBlue ? blueEmoji : redEmoji} {mvpLabel}</span>
        <span style={{ color: "#fca5a5" }}>{((1 - hud.winProb) * 100).toFixed(0)}%</span>
      </div>
    </div>
  );
}
