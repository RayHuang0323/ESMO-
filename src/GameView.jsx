// ============================================================================
//  GameView.jsx — 整合殼 v2（Sprint06：Battle Presentation 正式掛入）
//  組合：MobaView3D（3D + Hero Overlay + 相機跟隨） + BattlePresentationLayer
//       （HUD/Timeline/浮動大字/TAB 記分板/終局畫面） + 小地圖 + 控制鈕
//  邏輯仍由 useLocalServer 驅動；資料單向：Engine → snapshot → useBattleFeed →
//  BattlePresentation。此檔只讀 store，不回寫引擎。
//  props.onContinue：終局「查看賽後結算」→ 交給上層 Router 導向 Result（本檔不碰 Router）。
//  props.roster：{ [playerId]: { player, hero } }，缺省退回 id/職業名。
// ============================================================================

import React, { useRef, useEffect, useState, useMemo } from "react";
import MobaView3D from "./MobaView3D.jsx";
import BattlePresentationLayer from "./battle/ui/BattlePresentationLayer.jsx";
import { useGameStore } from "./useGameStore.js";
import { useLocalServer } from "./useLocalServer.js";
import { LANES, PITS } from "./gameData.js";
import { ROSTER } from "./data/roster.js";
import { draftRoster } from "./battle/moba/draftRoster.js";
import { loadQuality, saveQuality, presetFor, QUALITY_IDS, QUALITY_PRESETS } from "./battle/quality.js";

// 你的彩色地圖：Vite 可 `import mapUrl from "./assets/rift.png"` 後設給 MOBA_MAP；null 用程序化底圖。
const MOBA_MAP = null;

// ── 小地圖（沿用；自有 rAF、讀 store、含戰爭迷霧）────────────────────────────
function Minimap() {
  const ref = useRef(null);
  useEffect(() => {
    let raf, last = 0;
    // S29 效能：小地圖原本用**無節流的 rAF**（每秒 60 次重繪整張 canvas）。
    //   引擎每秒只推 2–8 幀，60fps 重繪是純浪費 ⇒ 節流到 12fps（肉眼無差）。
    const MIN_MS = 1000 / 12;
    const draw = (now = 0) => {
      const cv = ref.current;
      if (cv && now - last >= MIN_MS) {
        last = now;
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

export default function GameView({ roster = ROSTER, onContinue = null, autoStart = false, draft = null, tactic = null }) {
  // Sprint19【C】：draft（Ban/Pick 結果）仍僅作 Presentation 傳遞。
  // Sprint24【D 升級】：tactic = MobaTacticConfig.v1 → start({tactic}) → engine.configureMatch
  //   （行為權重層；戰術現在「真的」進 LogicEngine，證據寫入 BattleResult.tacticExecution）。
  // Sprint29：playbackRate（1×/2×/4×）+ quality preset（low/medium/high）。
  //   ⚠ 兩者都**只影響呈現**：rate 只改 tick 的真實間隔（dt 恆定）、quality 只改怎麼畫。
  const { playing, start, stop, rate, setRate, rates } = useLocalServer();
  // Sprint09：賽前準備銜接 — autoStart 掛載即開局（預設 false = 現行為不變）
  useEffect(() => { if (autoStart && !playing) start({ tactic }); }, []);  // eslint-disable-line
  const [follow, setFollow] = useState(true);        // 戰鬥鏡頭跟隨（BattleCameraController）
  // S29：畫質——首次依裝置自動判斷，玩家手動選擇後存 localStorage 並優先
  const [qualityId, setQualityId] = useState(() => loadQuality());
  const quality = useMemo(() => presetFor(qualityId), [qualityId]);
  const pickQuality = (id) => { setQualityId(id); saveQuality(id); };
  const hud = useGameStore((s) => s.hud);
  // Sprint20【E】生效名單：Ban/Pick 選到的英雄取代 ROSTER 預設英雄（無 draft → 原 ROSTER）。
  //   3D 名牌 / HUD / 記分板 / 終局畫面全部吃這一份 → Loading、Battle、Result 顯示同一批英雄。
  const liveRoster = useMemo(() => draftRoster(roster, draft), [roster, draft]);

  return (
    <div style={{ position: "relative", width: "100%", height: "min(82vh, 720px)", background: "#0d1420", borderRadius: 14, overflow: "hidden", fontFamily: "system-ui,-apple-system,sans-serif" }}>
      {/* 3D：跟隨開啟且對局進行中 → 相機聚焦交戰/推塔/龍/巴龍/主堡（computeFocus）*/}
      <MobaView3D mapTexture={MOBA_MAP} autoRotate={!playing} battleFollow={follow && playing} roster={liveRoster} quality={quality} />

      {/* Battle Presentation Layer：HUD / Timeline / 浮動大字 / TAB 記分板 / 終局畫面 */}
      <BattlePresentationLayer roster={liveRoster} draft={draft} tactic={tactic} onContinue={onContinue} />

      {/* Start / Stop / 鏡頭切換 */}
      {!playing && !hud.over && (
        <button onClick={() => start({ tactic })} style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 10, background: "linear-gradient(135deg,#3b82f6,#1d4ed8)", border: "2px solid #93c5fd", borderRadius: 14, padding: "16px 40px", color: "#fff", fontSize: 20, fontWeight: 900, letterSpacing: "0.08em", cursor: "pointer", boxShadow: "0 8px 40px rgba(59,130,246,0.6)" }}>
          ▶ 開始遊戲 / START
        </button>
      )}
      {playing && (
        <button onClick={stop} style={{ position: "absolute", top: 92, left: 12, zIndex: 10, background: "rgba(239,68,68,0.85)", border: "1px solid #fca5a5", borderRadius: 8, padding: "5px 12px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>⏹ 結束</button>
      )}
      <button onClick={() => setFollow((v) => !v)} style={{ position: "absolute", top: 92, right: 12, zIndex: 10, background: follow ? "rgba(96,165,250,0.9)" : "rgba(8,14,24,0.7)", border: `1px solid ${follow ? "#60a5fa" : "rgba(255,255,255,0.3)"}`, borderRadius: 8, padding: "5px 10px", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
        {follow ? "🎥 導播鏡頭" : "🖱 自由鏡頭"}
      </button>

      {/* S29：播放倍率（只改 tick 的真實間隔，dt 恆定 ⇒ 不影響模擬結果）*/}
      <div style={{ position: "absolute", top: 124, right: 12, zIndex: 10, display: "flex", gap: 4 }}>
        {rates.map((r) => (
          <button key={r} onClick={() => setRate(r)} title="播放倍率（不影響模擬結果）"
            style={{ background: rate === r ? "rgba(96,165,250,0.9)" : "rgba(8,14,24,0.7)", border: `1px solid ${rate === r ? "#60a5fa" : "rgba(255,255,255,0.25)"}`, borderRadius: 6, padding: "4px 8px", color: "#fff", fontSize: 11, fontWeight: 800, cursor: "pointer", minWidth: 32 }}>
            {r}×
          </button>
        ))}
      </div>

      {/* S29：畫質切換（自動判斷 + 手動覆寫；只影響怎麼畫，不影響模擬結果）*/}
      <div style={{ position: "absolute", top: 156, right: 12, zIndex: 10, display: "flex", gap: 4 }}>
        {QUALITY_IDS.map((id) => (
          <button key={id} onClick={() => pickQuality(id)} title={`畫質：${QUALITY_PRESETS[id].zh}（不影響模擬結果）`}
            style={{ background: qualityId === id ? "rgba(52,211,153,0.9)" : "rgba(8,14,24,0.7)", border: `1px solid ${qualityId === id ? "#34d399" : "rgba(255,255,255,0.25)"}`, borderRadius: 6, padding: "4px 8px", color: "#fff", fontSize: 10, fontWeight: 800, cursor: "pointer", textTransform: "uppercase" }}>
            {id === "low" ? "低" : id === "medium" ? "中" : "高"}
          </button>
        ))}
      </div>

      <div style={{ position: "absolute", bottom: 10, left: 10, color: "rgba(255,255,255,0.6)", fontSize: 10, background: "rgba(0,0,0,0.45)", padding: "4px 8px", borderRadius: 6, pointerEvents: "none" }}>
        按住 TAB 記分板 · 拖曳旋轉 · 滾輪縮放
      </div>
      {/* 掛載信標：看得到這個 tag = 渲染的是主幹 GameView（非 Legacy App.jsx）*/}
      <div style={{ position: "absolute", bottom: 166, right: 12, color: "rgba(147,197,253,0.55)", fontSize: 9, fontWeight: 800, letterSpacing: "0.1em", pointerEvents: "none", zIndex: 9 }}>ESMO 主幹 · S16</div>
      <Minimap />
    </div>
  );
}
