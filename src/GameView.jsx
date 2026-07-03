// ============================================================================
//  GameView.jsx  —  整合殼（純渲染殼，只讀 store）
//  組合：MobaView3D（3D Canvas） + HUD 比分/勝率 + 小地圖 + Start/Stop 控制
//  邏輯由 useLocalServer 驅動；換真引擎或 WebSocket 時此檔不用改。
// ============================================================================

import React, { useRef, useEffect, useState } from "react";
import MobaView3D from "./MobaView3D.jsx";
import { useGameStore } from "./useGameStore.js";
import { useLocalServer } from "./useLocalServer.js";
import { fmtT, LANES, PITS } from "./gameData.js";
import riftMap from "./assets/rift.jpg"; // 你上傳的彩色 LOL 風格地圖

// 你的彩色地圖（Vite 會把上面這行 import 轉成正確的打包後 URL，不用改）
const MOBA_MAP = riftMap;

// ── 小地圖（自有 rAF，讀 store，含戰爭迷霧）──────────────────────────────────
function Minimap() {
  const ref = useRef(null);
  useEffect(() => {
    let raf;
    const draw = () => {
      const cv = ref.current;
      if (cv) {
        const snap = useGameStore.getState().snapshot;
        const g = cv.getContext("2d"), D = cv.width, P = (v) => (v / 100) * D;
        const VIS = [];
        snap.players.forEach((p) => { if (p.side === "blue" && !p.dead) VIS.push(p.pos); });
        Object.values(snap.towers).forEach((t) => { if (t.side === "blue" && t.hp > 0) VIS.push(t.pos); });
        const vis = (pos) => VIS.some((v) => (v.x - pos.x) ** 2 + (v.y - pos.y) ** 2 < 289);
        g.clearRect(0, 0, D, D);
        g.fillStyle = "rgba(10,18,28,0.82)"; g.fillRect(0, 0, D, D);
        g.strokeStyle = "rgba(70,150,200,0.5)"; g.lineWidth = D * 0.05; g.beginPath(); g.moveTo(P(20), P(20)); g.lineTo(P(80), P(80)); g.stroke();
        g.strokeStyle = "rgba(190,170,120,0.4)"; g.lineWidth = 2;
        for (const ln of ["top", "mid", "bot"]) { g.beginPath(); LANES[ln].forEach((p, i) => (i ? g.lineTo(P(p.x), P(p.y)) : g.moveTo(P(p.x), P(p.y)))); g.stroke(); }
        Object.values(snap.towers).forEach((t) => { if (t.hp <= 0) return; g.fillStyle = t.side === "blue" ? "#3b82f6" : "#ef4444"; const s = t.lane === "nexus" ? 6 : 3.4; g.fillRect(P(t.pos.x) - s / 2, P(t.pos.y) - s / 2, s, s); });
        [["dragon", PITS.dragon, "#b794f6"], ["baron", PITS.baron, "#fbbf24"]].forEach(([k, pit, c]) => { if (!snap[k].alive) return; g.fillStyle = c; g.beginPath(); g.arc(P(pit.x), P(pit.y), 3, 0, 7); g.fill(); });
        snap.players.forEach((p) => {
          if (p.dead) return; if (p.side === "red" && !vis(p.pos)) return;
          g.fillStyle = p.side === "blue" ? "#93c5fd" : "#fca5a5";
          g.beginPath(); g.arc(P(p.pos.x), P(p.pos.y), 3.4, 0, 7); g.fill();
          g.strokeStyle = "rgba(0,0,0,0.7)"; g.lineWidth = 1; g.stroke();
        });
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} width={150} height={150} style={{ position: "absolute", bottom: 10, right: 10, width: 150, height: 150, borderRadius: 10, border: "1px solid rgba(255,255,255,0.25)", boxShadow: "0 4px 20px rgba(0,0,0,0.5)", pointerEvents: "none" }} />;
}

export default function GameView() {
  const { playing, start, stop } = useLocalServer();
  const [auto, setAuto] = useState(true);
  const hud = useGameStore((s) => s.hud);
  const blueLead = hud.bGold >= hud.rGold;

  return (
    <div style={{ position: "relative", width: "100%", height: "min(82vh, 720px)", background: "#0d1420", borderRadius: 14, overflow: "hidden", fontFamily: "system-ui,-apple-system,sans-serif" }}>
      <MobaView3D mapTexture={MOBA_MAP} autoRotate={auto} />

      {/* 比分列 */}
      <div style={{ position: "absolute", top: 10, left: 10, right: 10, display: "flex", justifyContent: "space-between", alignItems: "center", pointerEvents: "none", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(8,14,24,0.7)", border: "1px solid rgba(59,130,246,0.5)", borderRadius: 10, padding: "5px 11px", backdropFilter: "blur(4px)" }}>
          <span style={{ fontSize: 15 }}>🦭</span><span style={{ color: "#93c5fd", fontWeight: 800, fontSize: 13 }}>德國海豹</span>
          <span style={{ color: "#fff", fontWeight: 900, fontSize: 18, fontFamily: "monospace" }}>{hud.bK}</span>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ color: "#fff", fontSize: 16, fontWeight: 900, fontFamily: "monospace", background: "rgba(8,14,24,0.7)", padding: "2px 12px", borderRadius: 8 }}>{fmtT(hud.ts)}</div>
          <div style={{ color: "#fbbf24", fontSize: 10, fontWeight: 800, marginTop: 2 }}>金幣差 {blueLead ? "🔵" : "🔴"} {(Math.abs(hud.bGold - hud.rGold) / 1000).toFixed(1)}k</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(8,14,24,0.7)", border: "1px solid rgba(239,68,68,0.5)", borderRadius: 10, padding: "5px 11px", backdropFilter: "blur(4px)" }}>
          <span style={{ color: "#fff", fontWeight: 900, fontSize: 18, fontFamily: "monospace" }}>{hud.rK}</span>
          <span style={{ color: "#fca5a5", fontWeight: 800, fontSize: 13 }}>赤焰軍團</span><span style={{ fontSize: 15 }}>🔥</span>
        </div>
      </div>
      {/* 勝率條 */}
      <div style={{ position: "absolute", top: 52, left: 12, right: 12, height: 6, borderRadius: 99, overflow: "hidden", background: "rgba(0,0,0,0.5)", display: "flex", pointerEvents: "none" }}>
        <div style={{ width: `${hud.winProb * 100}%`, background: "linear-gradient(90deg,#3b82f6,#60a5fa)" }} />
        <div style={{ flex: 1, background: "linear-gradient(90deg,#fca5a5,#ef4444)" }} />
      </div>

      {/* Start / Stop / 環繞 */}
      {!playing && !hud.over && (
        <button onClick={start} style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 10, background: "linear-gradient(135deg,#3b82f6,#1d4ed8)", border: "2px solid #93c5fd", borderRadius: 14, padding: "16px 40px", color: "#fff", fontSize: 20, fontWeight: 900, letterSpacing: "0.08em", cursor: "pointer", boxShadow: "0 8px 40px rgba(59,130,246,0.6)" }}>
          ▶ 開始遊戲 / START
        </button>
      )}
      {playing && (
        <button onClick={stop} style={{ position: "absolute", top: 70, left: 12, zIndex: 10, background: "rgba(239,68,68,0.85)", border: "1px solid #fca5a5", borderRadius: 8, padding: "5px 12px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>⏹ 結束</button>
      )}
      <button onClick={() => setAuto((v) => !v)} style={{ position: "absolute", top: 70, right: 12, zIndex: 10, background: auto ? "rgba(96,165,250,0.9)" : "rgba(8,14,24,0.7)", border: `1px solid ${auto ? "#60a5fa" : "rgba(255,255,255,0.3)"}`, borderRadius: 8, padding: "5px 10px", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
        {auto ? "⏸ 環繞" : "▶ 環繞"}
      </button>

      {/* 結算 */}
      {hud.over && (
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 12, textAlign: "center", background: "rgba(8,14,24,0.92)", border: `2px solid ${hud.winner === "blue" ? "#3b82f6" : "#ef4444"}`, borderRadius: 16, padding: "26px 44px" }}>
          <div style={{ fontSize: 30 }}>{hud.winner === "blue" ? "🦭" : "🔥"}</div>
          <div style={{ color: hud.winner === "blue" ? "#93c5fd" : "#fca5a5", fontSize: 22, fontWeight: 900, marginTop: 6 }}>{hud.winner === "blue" ? "德國海豹" : "赤焰軍團"} 勝利!</div>
          <button onClick={start} style={{ marginTop: 14, background: "#3b82f6", border: "none", borderRadius: 10, padding: "10px 28px", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>↻ 再來一場</button>
        </div>
      )}

      <div style={{ position: "absolute", bottom: 10, left: 10, color: "rgba(255,255,255,0.6)", fontSize: 10, background: "rgba(0,0,0,0.45)", padding: "4px 8px", borderRadius: 6, pointerEvents: "none" }}>
        拖曳旋轉 · 滾輪縮放 · 真實邏輯大腦驅動中
      </div>
      <Minimap />
    </div>
  );
}
