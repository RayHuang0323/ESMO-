// ============================================================================
//  screens/moba/LoadingScreen.jsx — MOBA 載入過場（Sprint11）
//  雙方陣容載入動畫（真英雄資料）→ 自動進 Battle。
// ============================================================================
import React, { useEffect, useState } from "react";
import { TEAMS, ROSTER } from "../../data/roster.js";
import { heroById } from "../../data/heroDatabase.js";
import { GC } from "../../ui/theme.js";

export default function LoadingScreen({ onDone }) {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setPct((p) => { if (p >= 100) { clearInterval(iv); setTimeout(onDone, 350); return 100; } return p + 4; }), 45);
    return () => clearInterval(iv);
  }, []);
  const col = (side) => Object.entries(ROSTER).filter(([p]) => p[0] === side);
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "center", padding: "0 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 20 }}>
        {["blue", "red"].map((side) => (
          <div key={side} style={{ flex: 1 }}>
            <div style={{ fontWeight: 900, color: side === "blue" ? GC.blueL : GC.redL, marginBottom: 8, textAlign: side === "blue" ? "left" : "right" }}>{TEAMS[side].emoji} {TEAMS[side].name}</div>
            {col(side[0]).map(([pid, r]) => { const h = heroById(r.heroId) || {}; return (
              <div key={pid} style={{ display: "flex", flexDirection: side === "blue" ? "row" : "row-reverse", alignItems: "center", gap: 8, marginBottom: 5 }}>
                <div style={{ width: 26, height: 26, borderRadius: 6, background: h.color || "#334155", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: "#0b1220", fontSize: 11 }}>{(h.zh || "?").slice(0, 1)}</div>
                <div style={{ fontSize: 11, color: "#e5e7eb" }}>{r.player} · {h.zh}</div>
              </div>
            ); })}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 22, height: 6, borderRadius: 99, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg,#3b82f6,#93c5fd)", transition: "width 0.05s" }} />
      </div>
      <div style={{ textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 8, fontFamily: "ui-monospace,monospace" }}>載入戰場… {pct}%</div>
    </div>
  );
}
