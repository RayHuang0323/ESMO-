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
import { LANES, PITS, FOUNTAIN, RIVER, WORLD_BOUNDS, mapNormX, presentationForObjective } from "./gameData.js";
import { ROSTER } from "./data/roster.js";
import { draftRoster } from "./battle/moba/draftRoster.js";
import { loadQuality, saveQuality, presetFor, QUALITY_IDS, QUALITY_PRESETS } from "./battle/quality.js";
import { useIsMobile } from "./ui/useViewport.js";
import { useCameraStore } from "./battle/cameraStore.js";
import { isDebugMode } from "./ui/debugMode.js";
import { SAFE_TOP, Z } from "./battle/ui/battleLayout.js";

// 你的彩色地圖：Vite 可 `import mapUrl from "./assets/rift.png"` 後設給 MOBA_MAP；null 用程序化底圖。
const MOBA_MAP = null;

// ── 小地圖（沿用；自有 rAF、讀 store、含戰爭迷霧）────────────────────────────
function Minimap({ mobile = false }) {
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
        const g = cv.getContext("2d"), D = cv.width, P = (v) => mapNormX(v, WORLD_BOUNDS) * D;
        const VIS = [];
        snap.players.forEach((p) => { if (p.side === "blue" && !p.dead) VIS.push(p.pos); });
        Object.values(snap.towers).forEach((t) => { if (t.side === "blue" && t.hp > 0) VIS.push(t.pos); });
        const vis = (pos) => VIS.some((v) => (v.x - pos.x) ** 2 + (v.y - pos.y) ** 2 < 289);
        g.clearRect(0, 0, D, D);
        g.fillStyle = "rgba(10,18,28,0.82)"; g.fillRect(0, 0, D, D);
        g.strokeStyle = "rgba(70,150,200,0.5)"; g.lineWidth = D * 0.05; g.beginPath();
        RIVER.points.forEach((p, i) => (i ? g.lineTo(P(p.x), P(p.y)) : g.moveTo(P(p.x), P(p.y)))); g.stroke();
        g.strokeStyle = "rgba(190,170,120,0.4)"; g.lineWidth = 2;
        for (const ln of ["top", "mid", "bot"]) { g.beginPath(); LANES[ln].forEach((p, i) => (i ? g.lineTo(P(p.x), P(p.y)) : g.moveTo(P(p.x), P(p.y)))); g.stroke(); }
        Object.values(snap.towers).forEach((t) => { if (t.hp <= 0) return; g.fillStyle = t.side === "blue" ? "#3b82f6" : "#ef4444"; const s = t.lane === "nexus" ? 6 : 3.4; g.fillRect(P(t.pos.x) - s / 2, P(t.pos.y) - s / 2, s, s); });
        // S29B3：坑位環（恆顯示，與主場景 pit 色環一致）+ 存活時實心點
        [["dragon", PITS.dragon], ["baron", PITS.baron]].forEach(([k, pit]) => {
          const meta = presentationForObjective({ id: k, type: k });
          const c = `#${meta.color.toString(16).padStart(6, "0")}`;
          g.strokeStyle = c; g.lineWidth = 1;
          g.beginPath(); g.arc(P(pit.x), P(pit.y), 4.4, 0, 7); g.stroke();
          if (!snap[k].alive) return;
          g.fillStyle = c; g.beginPath(); g.arc(P(pit.x), P(pit.y), 3, 0, 7); g.fill();
        });
        // S29B3：泉水標記（與主場景泉水平台同語意/同座標源）
        [[FOUNTAIN.blue, "#60a5fa"], [FOUNTAIN.red, "#f87171"]].forEach(([f, c]) => {
          g.strokeStyle = c; g.lineWidth = 1.2;
          g.beginPath(); g.arc(P(f.x), P(f.y), 3.2, 0, 7); g.stroke();
          g.beginPath(); g.moveTo(P(f.x) - 2, P(f.y)); g.lineTo(P(f.x) + 2, P(f.y));
          g.moveTo(P(f.x), P(f.y) - 2); g.lineTo(P(f.x), P(f.y) + 2); g.stroke();
        });
        // S29B1：野怪營地（座標與世界同源：snapshot.objectives ← gameData.CAMPS）
        (snap.objectives ?? []).forEach((o) => {
          if (o.type !== "camp" && o.type !== "buff") return;
          if (!o.alive) return;
          const meta = presentationForObjective(o);
          g.fillStyle = `#${meta.color.toString(16).padStart(6, "0")}`;
          if (o.presentationKey === "blueBuff" || o.presentationKey === "redBuff") {
            g.fillRect(P(o.pos.x) - 2.2, P(o.pos.y) - 2.2, 4.4, 4.4);
          } else {
            g.beginPath(); g.moveTo(P(o.pos.x), P(o.pos.y) - 2.8); g.lineTo(P(o.pos.x) + 2.8, P(o.pos.y) + 2.2); g.lineTo(P(o.pos.x) - 2.8, P(o.pos.y) + 2.2); g.closePath(); g.fill();
          }
        });
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
  // S29B2：手機縮小並抬離底部收合面板（safe area）；不擋十人面板也不被遮
  const px2 = mobile ? 106 : 150;
  return <canvas ref={ref} width={150} height={150} style={{ position: "absolute", bottom: mobile ? "calc(50px + env(safe-area-inset-bottom))" : 10, right: mobile ? 6 : 10, width: px2, height: px2, borderRadius: 10, border: "1px solid rgba(255,255,255,0.25)", boxShadow: "0 4px 20px rgba(0,0,0,0.5)", pointerEvents: "none", zIndex: Z.minimap }} />;
}

export default function GameView({ roster = ROSTER, onContinue = null, autoStart = false, draft = null, tactic = null }) {
  // Sprint19【C】：draft（Ban/Pick 結果）仍僅作 Presentation 傳遞。
  // Sprint24【D 升級】：tactic = MobaTacticConfig.v1 → start({tactic}) → engine.configureMatch
  //   （行為權重層；戰術現在「真的」進 LogicEngine，證據寫入 BattleResult.tacticExecution）。
  // Sprint29：playbackRate（1×/2×/4×）+ quality preset（low/medium/high）。
  //   ⚠ 兩者都**只影響呈現**：rate 只改 tick 的真實間隔（dt 恆定）、quality 只改怎麼畫。
  const { playing, start, fastForward, rate, setRate, rates } = useLocalServer();
  // S29B3：開局重置相機為導播（預設 ON）；點英雄/拖曳的模式切換由 cameraStore 管理
  // S29B6：一併重置 pan（上一場拖到角落的視野不該帶進新的一場）
  const begin = () => { const c = useCameraStore.getState(); c.backToDirector(); c.resetView(); start({ tactic }); };
  // Sprint09：賽前準備銜接 — autoStart 掛載即開局（預設 false = 現行為不變）
  useEffect(() => { if (autoStart && !playing) begin(); }, []);  // eslint-disable-line
  const camMode = useCameraStore((s) => s.mode);
  // S29：畫質——首次依裝置自動判斷，玩家手動選擇後存 localStorage 並優先
  const [qualityId, setQualityId] = useState(() => loadQuality());
  const quality = useMemo(() => presetFor(qualityId), [qualityId]);
  const pickQuality = (id) => { setQualityId(id); saveQuality(id); };
  const hud = useGameStore((s) => s.hud);
  // S29B2：手機控制鈕收納（⚙ 展開）；地圖不被常駐按鈕群遮擋
  const isMobile = useIsMobile();
  const [showCtl, setShowCtl] = useState(false);
  // Sprint20【E】生效名單：Ban/Pick 選到的英雄取代 ROSTER 預設英雄（無 draft → 原 ROSTER）。
  //   3D 名牌 / HUD / 記分板 / 終局畫面全部吃這一份 → Loading、Battle、Result 顯示同一批英雄。
  const liveRoster = useMemo(() => draftRoster(roster, draft), [roster, draft]);

  return (
    <div style={{ position: "relative", width: "100%", height: "min(82vh, 720px)", background: "#0d1420", borderRadius: 14, overflow: "hidden", fontFamily: "system-ui,-apple-system,sans-serif" }}>
      {/* 3D：對局進行中相機由 cameraStore 管理（director/objectiveFocus/heroFocus/free）*/}
      <MobaView3D mapTexture={MOBA_MAP} autoRotate={!playing} battleFollow={playing} roster={liveRoster} quality={quality} />

      {/* Battle Presentation Layer：HUD / Timeline / 浮動大字 / TAB 記分板 / 終局畫面 */}
      <BattlePresentationLayer roster={liveRoster} draft={draft} tactic={tactic} onContinue={onContinue} />

      {/* Start / Stop / 鏡頭切換 */}
      {!playing && !hud.over && (
        <button onClick={begin} style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: Z.controls, background: "linear-gradient(135deg,#3b82f6,#1d4ed8)", border: "2px solid #93c5fd", borderRadius: 14, padding: "16px 40px", color: "#fff", fontSize: 20, fontWeight: 900, letterSpacing: "0.08em", cursor: "pointer", boxShadow: "0 8px 40px rgba(59,130,246,0.6)" }}>
          ▶ 開始遊戲 / START
        </button>
      )}

      {/* S29B3：回到導播（自由鏡頭時才出現的單一小按鈕；雙擊空白也可回導播） */}
      {playing && camMode === "free" && (
        <button onClick={() => useCameraStore.getState().backToDirector()}
          style={{ position: "absolute", bottom: isMobile ? "calc(56px + env(safe-area-inset-bottom))" : 46, left: "50%", transform: "translateX(-50%)", zIndex: Z.controls, background: "rgba(96,165,250,0.92)", border: "1px solid #93c5fd", borderRadius: 999, padding: "6px 16px", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer", boxShadow: "0 4px 16px rgba(0,0,0,0.45)" }}>
          🎥 回到導播
        </button>
      )}
      {/* S29B6：右上控制鈕欄——改成從 SAFE_TOP 起算的**單一 flex 直欄**。
          舊碼每顆鈕各自寫死 top（92 / 128 / 160），而 BattleHUD 從 top 6 起高約
          120px ⇒ ⏩ 與 ⚙ 直接壓在塔點陣與**藍紅勝率條**上（Ray 手機實測回報）。
          現在整欄在 HUD 底緣之下，彼此用 gap 排列，不再有魔術數字互撞。 */}
      <div style={{ position: "absolute", top: SAFE_TOP, right: isMobile ? 8 : 12, zIndex: Z.overlay, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
        {/* S29B4：Debug「快速完成比賽」——**不藏在 ⚙ 收納面板裡**（S29B4 根因：
            手機上它原本被 showCtl 收合，Pages 加 ?debug=1 也看不到）。測試模式
            **常駐可見**。fastForward：同一顆引擎安全推進到終局 → 走既有
            Result/發獎/Replay 流程，不重新開局、不重複發獎。 */}
        {playing && isDebugMode() && (
          <button onClick={fastForward} title="Debug：把模擬推進到終局並進入戰報（結果與自然跑完相同）"
            style={{ background: "rgba(168,85,247,0.92)", border: "1px solid #d8b4fe", borderRadius: 8, padding: "6px 12px", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap", boxShadow: "0 2px 12px rgba(0,0,0,0.4)" }}>⏩ {isMobile ? "快速完成" : "快速完成比賽"}</button>
        )}
        {/* S29B2：控制鈕收納——手機收進 ⚙ 面板（不常駐佔畫面）；桌機維持常駐 */}
        {isMobile && (
          <button onClick={() => setShowCtl((v) => !v)} style={{ background: showCtl ? "rgba(96,165,250,0.9)" : "rgba(8,14,24,0.75)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 8, padding: "5px 10px", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>⚙</button>
        )}
        {(!isMobile || showCtl) && (
          <>
            {/* S29：播放倍率（只改 tick 的真實間隔，dt 恆定 ⇒ 不影響模擬結果）*/}
            <div style={{ display: "flex", gap: 4 }}>
              {rates.map((r) => (
                <button key={r} onClick={() => setRate(r)} title="播放倍率（不影響模擬結果）"
                  style={{ background: rate === r ? "rgba(96,165,250,0.9)" : "rgba(8,14,24,0.7)", border: `1px solid ${rate === r ? "#60a5fa" : "rgba(255,255,255,0.25)"}`, borderRadius: 6, padding: "4px 8px", color: "#fff", fontSize: 11, fontWeight: 800, cursor: "pointer", minWidth: 32 }}>
                  {r}×
                </button>
              ))}
            </div>

            {/* S29：畫質切換（自動判斷 + 手動覆寫；只影響怎麼畫，不影響模擬結果）*/}
            <div style={{ display: "flex", gap: 4 }}>
              {QUALITY_IDS.map((id) => (
                <button key={id} onClick={() => pickQuality(id)} title={`畫質：${QUALITY_PRESETS[id].zh}（不影響模擬結果）`}
                  style={{ background: qualityId === id ? "rgba(52,211,153,0.9)" : "rgba(8,14,24,0.7)", border: `1px solid ${qualityId === id ? "#34d399" : "rgba(255,255,255,0.25)"}`, borderRadius: 6, padding: "4px 8px", color: "#fff", fontSize: 10, fontWeight: 800, cursor: "pointer", textTransform: "uppercase" }}>
                  {id === "low" ? "低" : id === "medium" ? "中" : "高"}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {!isMobile && (
        <div style={{ position: "absolute", bottom: 10, left: 10, color: "rgba(255,255,255,0.6)", fontSize: 10, background: "rgba(0,0,0,0.45)", padding: "4px 8px", borderRadius: 6, pointerEvents: "none" }}>
          按住 TAB 記分板 · 拖曳平移地圖 · 滾輪縮放 · 雙擊回導播
        </div>
      )}
      {/* 掛載信標：看得到這個 tag = 渲染的是主幹 GameView（非 Legacy App.jsx）*/}
      <div style={{ position: "absolute", bottom: 166, right: 12, color: "rgba(147,197,253,0.55)", fontSize: 9, fontWeight: 800, letterSpacing: "0.1em", pointerEvents: "none", zIndex: Z.minimap }}>ESMO 主幹 · S16</div>
      <Minimap mobile={isMobile} />
    </div>
  );
}
