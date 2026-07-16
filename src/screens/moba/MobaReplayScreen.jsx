// ============================================================================
//  screens/moba/MobaReplayScreen.jsx — MOBA 賽後重播（Sprint26 MVP / 29B6 真實戰場）
//
//  ⚠ 鐵律：本畫面**只播放 MobaReplay.v1 已保存的 frames**。
//    · 不 import LogicEngine、不呼叫 tick() —— 不是重新模擬。
//    · 不碰 profileStore / seasonStore / battleStore / useGameStore —— 重播不可能
//      再次發獎、再次入史、再次加 XP / money / fans。
//    · 資料源 = `createReplaySource(replay)`（唯讀 adapter），**不是 live store**。
//
//  ── S29B6：重播 = 真實比賽戰場 ─────────────────────────────────────────
//  29B5 之前重播只是一張自己的 SVG 俯視圖（等於放大版小地圖），跟現場對戰是
//  **兩套完全不同的呈現**。現在主畫面改用與現場**同一個** `MobaView3D`：
//    replay frame → replayPresentationSource → { prev, snapshot, subTRef }
//    → MobaView3D（原封不動的現場渲染管線）
//  ⇒ 英雄 / 塔 / Dragon / Baron / camps / objective HP / 死亡淡出 / 重生
//    全部與現場逐行同一段程式碼，不可能再各畫各的。
//  SVG 小地圖降級為**輔助 inset**（桌機右下），不再是唯一的重播畫面。
//
//  ── Fallback（不白畫面）─────────────────────────────────────────────────
//  舊 replay 沒有 `mapMeta`（或世界尺度與現行 gameData 不符）⇒ 3D 場景是用目前的
//  220×220 世界建的，硬畫會把所有東西擺錯位置 ⇒ 這種 replay 退回原本的 2D SVG
//  全螢幕版（它有 100×100 legacyBounds 相容），並明講「舊格式」。
//
//  控制（任務單 §7 全數）：播放 / 暫停、±10 秒、上一 / 下一事件、
//    0.5× / 1× / 2× / 4×、timeline slider、當前 / 總時間、返回 Result。
//  frames 每 2 秒取樣 → **由 MobaView3D 自己的 prev→snapshot 插值**補平順，不重算。
// ============================================================================
import React, { useEffect, useMemo, useRef, useState } from "react";
import { REPLAY_SPEEDS, SIM_PER_REAL } from "../../platform/contracts/mobaReplay.js";
import { fmtT, WORLD_BOUNDS, LANES, RIVER, presentationForObjective } from "../../gameData.js";
import { GC, MONO } from "../../ui/theme.js";
import MobaView3D from "../../MobaView3D.jsx";
import { createReplaySource, canUse3DPresentation, frameAt } from "../../battle/moba/replay/replayPresentationSource.js";
import { loadQuality, presetFor } from "../../battle/quality.js";
import { useIsMobile } from "../../ui/useViewport.js";
import { useCameraStore } from "../../battle/cameraStore.js";

const SIDE_C = { blue: "#3b82f6", red: "#ef4444" };
const lerp = (a, b, t) => a + (b - a) * t;

/** 2D 俯視圖（S29B6 起：桌機 = 輔助 inset；舊格式 replay = 全螢幕 fallback）。 */
function ReplayMap2D({ replay, a, b, f, inset = false }) {
  const towersMeta = replay?.towersMeta ?? {};
  const playersMeta = replay?.playersMeta ?? [];
  const twA = a?.tw ?? {};
  // S29B5：新 replay 帶當局 mapMeta；舊 replay 無欄位時保留 0–100 相容。
  const legacyBounds = { minX: 0, minY: 0, maxX: 100, maxY: 100, width: 100, height: 100 };
  const mapBounds = replay?.mapMeta?.bounds ?? legacyBounds;
  const mapLanes = replay?.mapMeta?.lanes ?? (mapBounds.width === WORLD_BOUNDS.width ? LANES : null);
  const mapRiver = replay?.mapMeta?.river ?? (mapBounds.width === WORLD_BOUNDS.width ? RIVER : null);
  const viewBox = `${mapBounds.minX} ${mapBounds.minY} ${mapBounds.width} ${mapBounds.height}`;
  const pathD = (pts = []) => pts.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ");
  const K = mapBounds.width / 100;   // 舊圖以 100 單位為基準設計 ⇒ 依實際 bounds 等比放大
  const st = inset
    ? { width: "100%", height: "100%", display: "block", background: "rgba(8,14,24,0.82)", borderRadius: 10 }
    : { height: "100%", maxWidth: "100%", aspectRatio: "1", background: "linear-gradient(135deg,#0e1a14,#0b1220)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)" };

  return (
    <svg viewBox={viewBox} style={st}>
      {/* 河道對角線 + 三路示意 */}
      {mapRiver ? <path d={pathD(mapRiver.points)} fill="none" stroke="rgba(56,189,248,0.18)" strokeWidth={mapRiver.width} strokeLinecap="round" />
        : <line x1="100" y1="0" x2="0" y2="100" stroke="rgba(56,189,248,0.14)" strokeWidth="6" />}
      {mapLanes ? Object.entries(mapLanes).map(([lane, pts]) => <path key={lane} d={pathD(pts)} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={5 * K} strokeLinejoin="round" />) : <>
        <path d="M8,92 L8,8 L92,8" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
        <path d="M8,92 L92,8" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
        <path d="M8,92 L92,92 L92,8" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
      </>}
      {/* 塔（位置只存於 towersMeta；血量逐 frame） */}
      {Object.entries(towersMeta).map(([id, tw]) => {
        const hp = twA[id] ?? 0, s = 3.2 * K;
        return (
          <g key={id}>
            <rect x={tw.pos.x - s / 2} y={tw.pos.y - s / 2} width={s} height={s} rx={0.7 * K}
              fill={hp > 0 ? SIDE_C[tw.side] : "#1f2430"} opacity={hp > 0 ? 0.9 : 0.45} />
          </g>
        );
      })}
      {/* 中立目標（位置存於 objectivesMeta；frame.ob = hp 0–1，0=死亡）。
          舊 replay 無此欄 ⇒ 不渲染，不炸畫面。 */}
      {(replay?.objectivesMeta ?? []).map((om, i) => {
        const hpA = a?.ob?.[i] ?? 0, hpB = b?.ob?.[i] ?? hpA;
        const hp = hpA > 0 ? lerp(hpA, hpB > 0 ? hpB : hpA, f) : 0;
        if (!(hp > 0)) return null;
        const isCamp = om.type === "camp" || om.type === "buff";
        const meta = presentationForObjective(om);
        const c = `#${meta.color.toString(16).padStart(6, "0")}`;
        const r = (isCamp ? 2.4 : om.type === "dragon" ? 5.2 : 4.6) * K;
        return <circle key={om.id} cx={om.pos.x} cy={om.pos.y} r={r * 0.7} fill={c} opacity="0.9" />;
      })}
      {/* 選手（位置插值；死亡 → 灰空心）。frame.p 缺該列 ⇒ 跳過不崩 */}
      {playersMeta.map((pm, i) => {
        const pa = a?.p?.[i], pb = b?.p?.[i] ?? pa;
        if (!pa) return null;
        const dead = pa[3] === 1;
        const x = dead ? pa[0] : lerp(pa[0], pb[0], f);
        const y = dead ? pa[1] : lerp(pa[1], pb[1], f);
        return (
          <g key={pm.id} opacity={dead ? 0.4 : 1}>
            <circle cx={x} cy={y} r={1.9 * K} fill={dead ? "none" : SIDE_C[pm.side]} stroke={SIDE_C[pm.side]} strokeWidth={0.5 * K} />
            {!inset && !dead && <rect x={x - 1.9 * K} y={y - 3.1 * K} width={3.8 * K * Math.max(0, pa[2])} height={0.7 * K} rx={0.3 * K} fill="#34d399" />}
            {!inset && <text x={x} y={y + 4.6 * K} fontSize={2.4 * K} textAnchor="middle" fill="rgba(255,255,255,0.75)" fontFamily="monospace">{pm.id}</text>}
          </g>
        );
      })}
    </svg>
  );
}

export default function MobaReplayScreen({ replay, onClose }) {
  const frames = replay?.frames ?? [];
  const duration = replay?.duration ?? 0;
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const tRef = useRef(0);
  const isMobile = useIsMobile();
  const quality = useMemo(() => presetFor(loadQuality()), []);

  // 唯讀資料源：replay frames → { prev, snapshot, subTRef }（不模擬、不碰 Store）
  const use3D = useMemo(() => canUse3DPresentation(replay), [replay]);
  const source = useMemo(() => (use3D ? createReplaySource(replay) : null), [use3D, replay]);

  // 重播開場相機回導播（cameraStore 是全域單例；上一場對戰可能停在 free）
  useEffect(() => { if (use3D) { const c = useCameraStore.getState(); c.backToDirector(); c.resetView(); } }, [use3D]);

  // 播放時鐘：**只推進時間軸**，不做任何模擬。
  //   S29B6 改用 rAF（原本是 100ms setInterval ⇒ 3D 插值只會有 10fps 的階梯感）：
  //   每個顯示幀都 seek 一次 ⇒ MobaView3D 的 prev→snapshot 插值拿到連續的 subT。
  useEffect(() => {
    source?.seek(tRef.current);
    if (!playing) return;
    let raf, last = performance.now(), uiLast = 0;
    const loop = (now) => {
      const dt = Math.min(0.25, (now - last) / 1000); last = now;
      const next = tRef.current + dt * speed * SIM_PER_REAL;
      if (next >= duration) {
        tRef.current = duration; source?.seek(duration); setT(duration); setPlaying(false); return;
      }
      tRef.current = next;
      source?.seek(next);
      if (now - uiLast > 100) { uiLast = now; setT(next); }   // React 只需 ~10fps 更新標籤
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, duration, source]);

  const events = replay?.events ?? [];
  const { a, b, f } = useMemo(() => frameAt(frames, t), [frames, t]);
  const recentEvents = useMemo(() => events.filter((e) => e.t <= t).slice(-3), [events, t]);

  // 標頭數值（沿用 frame 真值；無 frame ⇒ 中性預設，不白畫面）
  const sA = a?.s ?? [0, 0], gA = a?.g ?? [0, 0], gB = b?.g ?? gA;
  const wpA = a?.wp ?? 0.5, wpB = b?.wp ?? wpA;

  if (!replay || frames.length === 0) {
    return (
      <div style={wrap}>
        <div style={{ color: GC.gray, fontSize: 13 }}>此場無重播資料（重播僅保留本次遊戲階段的最近一場）</div>
        <button onClick={onClose} style={btn(true)}>返回 Result</button>
      </div>
    );
  }

  const seek = (nt) => {
    const v = Math.min(duration, Math.max(0, nt));
    tRef.current = v; source?.seek(v); setT(v);
  };
  const prevEvent = () => { const e = [...events].reverse().find((x) => x.t < t - 0.25); seek(e ? e.t : 0); };
  const nextEvent = () => { const e = events.find((x) => x.t > t + 0.25); seek(e ? e.t : duration); };

  return (
    <div style={wrap}>
      {/* 標頭：比分 / 經濟 / 勝率 */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", justifyContent: "center", flexShrink: 0 }}>
        <span style={{ fontSize: 10, letterSpacing: "0.2em", color: GC.gray, fontWeight: 900 }}>REPLAY</span>
        <span style={{ fontFamily: MONO, fontWeight: 900, fontSize: 17 }}>
          <span style={{ color: SIDE_C.blue }}>{sA[0]}</span>
          <span style={{ color: GC.gray }}> : </span>
          <span style={{ color: SIDE_C.red }}>{sA[1]}</span>
        </span>
        <span style={{ fontFamily: MONO, fontSize: 10, color: GC.gray }}>💰 {Math.round(lerp(gA[0], gB[0], f)).toLocaleString()} / {Math.round(lerp(gA[1], gB[1], f)).toLocaleString()}</span>
        <div style={{ width: 110, height: 5, borderRadius: 99, background: SIDE_C.red, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${lerp(wpA, wpB, f) * 100}%`, background: SIDE_C.blue }} />
        </div>
        {replay.config?.tacticName && <span style={{ fontSize: 9, color: GC.purp }}>戰術 {replay.config.tacticName}</span>}
      </div>

      {/* 戰場 */}
      <div style={{ flex: 1, minHeight: 0, width: "100%", position: "relative", display: "flex", justifyContent: "center", borderRadius: 12, overflow: "hidden" }}>
        {use3D ? (
          <>
            {/* 與現場對戰**同一個** MobaView3D；資料源是 replay frame，不是 live store。
                battleFollow ⇒ 導播鏡頭同樣可用；拖曳/捏合仍可自由觀看（cameraStore）。
                ⚠ 外層是 flex 容器，而 R3F `<Canvas>` 是靠父層尺寸決定畫布大小
                （flex item 的 auto 寬度可能塌成 0）⇒ 用 inset:0 的絕對定位層明確給尺寸。 */}
            <div style={{ position: "absolute", inset: 0 }}>
              <MobaView3D battleFollow autoRotate={false} quality={quality} source={source} roster={null} />
            </div>
            {/* 輔助 inset 小地圖（桌機才放；手機空間留給戰場，避免遮擋） */}
            {!isMobile && (
              <div style={{ position: "absolute", right: 8, bottom: 8, width: 132, height: 132, borderRadius: 10, border: "1px solid rgba(255,255,255,0.2)", overflow: "hidden", pointerEvents: "none", zIndex: 9 }}>
                <ReplayMap2D replay={replay} a={a} b={b} f={f} inset />
              </div>
            )}
          </>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, height: "100%", width: "100%", justifyContent: "center" }}>
            <ReplayMap2D replay={replay} a={a} b={b} f={f} />
            <span style={{ fontSize: 9, color: GC.gold }}>⚠ 舊格式重播（無當局地圖 metadata）⇒ 以 2D 俯視圖播放</span>
          </div>
        )}
      </div>

      {/* 事件 ticker */}
      <div style={{ minHeight: 34, width: "100%", maxWidth: 560, display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
        {recentEvents.map((e, i) => (
          <div key={`${e.t}-${i}`} style={{ fontSize: 9.5, color: i === recentEvents.length - 1 ? "#e5e7eb" : GC.gray, fontFamily: MONO, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            <span style={{ color: GC.gold }}>[{fmtT(e.t)}]</span> <span style={{ color: SIDE_C[e.side] ?? GC.gray }}>{e.text}</span>
          </div>
        ))}
      </div>

      {/* Timeline */}
      <div style={{ width: "100%", maxWidth: 560, display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <span style={{ fontFamily: MONO, fontSize: 11, color: "#e5e7eb", flexShrink: 0 }}>{fmtT(t)}</span>
        <input type="range" min={0} max={duration} step={0.5} value={t}
          onChange={(e) => seek(Number(e.target.value))}
          style={{ flex: 1, minWidth: 0, accentColor: "#3b82f6" }} />
        <span style={{ fontFamily: MONO, fontSize: 11, color: GC.gray, flexShrink: 0 }}>{fmtT(duration)}</span>
      </div>

      {/* 控制列 */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, justifyContent: "center", alignItems: "center", flexShrink: 0 }}>
        <button onClick={prevEvent} style={btn(false)} title="上一個事件">⏮ 事件</button>
        <button onClick={() => seek(t - 10)} style={btn(false)}>−10s</button>
        <button onClick={() => { if (!playing && tRef.current >= duration) seek(0); setPlaying((p) => !p); }} style={btn(true)}>{playing ? "⏸ 暫停" : "▶ 播放"}</button>
        <button onClick={() => seek(t + 10)} style={btn(false)}>+10s</button>
        <button onClick={nextEvent} style={btn(false)} title="下一個事件">事件 ⏭</button>
        <span style={{ width: 8 }} />
        {REPLAY_SPEEDS.map((s) => (
          <button key={s} onClick={() => setSpeed(s)}
            style={{ ...btn(false), padding: "7px 10px", ...(speed === s ? { border: "1px solid #93c5fd", color: "#93c5fd", background: "rgba(59,130,246,0.15)" } : {}) }}>{s}×</button>
        ))}
        <span style={{ width: 8 }} />
        <button onClick={onClose} style={btn(false)}>返回 Result</button>
      </div>
      {use3D && <div style={{ fontSize: 8.5, color: GC.gray, textAlign: "center" }}>重播未擷取小兵（frame 容量限制）⇒ 戰場只顯示英雄 / 塔 / 中立目標</div>}
      {replay.truncated && <div style={{ fontSize: 9, color: GC.gold }}>⚠ 本場超過重播長度上限，尾段未收錄</div>}
    </div>
  );
}

const wrap = {
  position: "absolute", inset: 0, zIndex: 60,
  background: "rgba(7,11,20,0.985)",
  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
  gap: 8, padding: "12px 10px calc(12px + env(safe-area-inset-bottom))", boxSizing: "border-box",
  fontFamily: "system-ui,sans-serif", overflowX: "hidden",
};
const btn = (primary) => ({
  background: primary ? "linear-gradient(135deg,#3b82f6,#1d4ed8)" : "rgba(255,255,255,0.07)",
  border: primary ? "1px solid #93c5fd" : "1px solid rgba(255,255,255,0.18)",
  borderRadius: 9, padding: "7px 13px", color: "#fff", fontSize: 11.5, fontWeight: 800, cursor: "pointer",
});
