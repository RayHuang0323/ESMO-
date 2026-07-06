// ============================================================================
//  GameView.jsx — 整合殼 v2（Sprint06：Battle Presentation 正式掛入）
//  組合：MobaView3D（3D + Hero Overlay + 相機跟隨） + BattlePresentationLayer
//       （HUD/Timeline/浮動大字/TAB 記分板/終局畫面） + 小地圖 + 控制鈕
//  邏輯仍由 useLocalServer 驅動；資料單向：Engine → snapshot → useBattleFeed →
//  BattlePresentation。此檔只讀 store，不回寫引擎。
//  props.onContinue：終局「查看賽後結算」→ 交給上層 Router 導向 Result（本檔不碰 Router）。
//  props.roster：{ [playerId]: { player, hero } }，缺省退回 id/職業名。
// ============================================================================

import React, { useRef, useEffect, useState } from "react";
import MobaView3D from "./MobaView3D.jsx";
import BattlePresentationLayer from "./battle/ui/BattlePresentationLayer.jsx";
import { useGameStore } from "./useGameStore.js";
import { useLocalServer } from "./useLocalServer.js";
import { LANES, PITS } from "./gameData.js";

// 你的彩色地圖：Vite 可 `import mapUrl from "./assets/rift.png"` 後設給 MOBA_MAP；null 用程序化底圖。
const MOBA_MAP = null;

// ── 小地圖（沿用；自有 rAF、讀 store、含戰爭迷霧）────────────────────────────
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
  return <canvas ref={ref} width={150} height={150} style={{ position: "absolute", bottom: 10, right: 10, width: 150, height: 150, borderRadius: 10, border: "1px solid rgba(255,255,255,0.25)", boxShadow: "0 4px 20px rgba(0,0,0,0.5)", pointerEvents: "none", zIndex: 9 }} />;
}

export default function GameView({ roster = null, onContinue = null }) {
  const { playing, start, stop } = useLocalServer();
  const [follow, setFollow] = useState(true);        // 戰鬥鏡頭跟隨（BattleCameraController）
  const hud = useGameStore((s) => s.hud);

  return (
    <div style={{ position: "relative", width: "100%", height: "min(82vh, 720px)", background: "#0d1420", borderRadius: 14, overflow: "hidden", fontFamily: "system-ui,-apple-system,sans-serif" }}>
      {/* 3D：跟隨開啟且對局進行中 → 相機聚焦交戰/推塔/龍/巴龍/主堡（computeFocus）*/}
      <MobaView3D mapTexture={MOBA_MAP} autoRotate={!playing} battleFollow={follow && playing} roster={roster} />

      {/* Battle Presentation Layer：HUD / Timeline / 浮動大字 / TAB 記分板 / 終局畫面 */}
      <BattlePresentationLayer roster={roster} onContinue={onContinue} />

      {/* Start / Stop / 鏡頭切換 */}
      {!playing && !hud.over && (
        <button onClick={start} style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 10, background: "linear-gradient(135deg,#3b82f6,#1d4ed8)", border: "2px solid #93c5fd", borderRadius: 14, padding: "16px 40px", color: "#fff", fontSize: 20, fontWeight: 900, letterSpacing: "0.08em", cursor: "pointer", boxShadow: "0 8px 40px rgba(59,130,246,0.6)" }}>
          ▶ 開始遊戲 / START
        </button>
      )}
      {playing && (
        <button onClick={stop} style={{ position: "absolute", top: 92, left: 12, zIndex: 10, background: "rgba(239,68,68,0.85)", border: "1px solid #fca5a5", borderRadius: 8, padding: "5px 12px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>⏹ 結束</button>
      )}
      <button onClick={() => setFollow((v) => !v)} style={{ position: "absolute", top: 92, right: 12, zIndex: 10, background: follow ? "rgba(96,165,250,0.9)" : "rgba(8,14,24,0.7)", border: `1px solid ${follow ? "#60a5fa" : "rgba(255,255,255,0.3)"}`, borderRadius: 8, padding: "5px 10px", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
        {follow ? "🎥 導播鏡頭" : "🖱 自由鏡頭"}
      </button>

      <div style={{ position: "absolute", bottom: 10, left: 10, color: "rgba(255,255,255,0.6)", fontSize: 10, background: "rgba(0,0,0,0.45)", padding: "4px 8px", borderRadius: 6, pointerEvents: "none" }}>
        按住 TAB 記分板 · 拖曳旋轉 · 滾輪縮放
      </div>
      <Minimap />
    </div>
  );
}
