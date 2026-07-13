// ============================================================================
//  screens/moba/MobaReplayScreen.jsx — MOBA 賽後重播（Sprint26 MVP）
//
//  ⚠ 鐵律：本畫面**只播放 MobaReplay.v1 已保存的 frames**。
//    · 不 import LogicEngine、不呼叫 tick() —— 不是重新模擬。
//    · 不碰 profileStore / seasonStore / battleStore —— 重播不可能再次發獎、
//      再次入史、再次加 XP / money / fans。
//  呈現：2D 戰場俯視圖（同 CS 的 frame playback 思路）——選手點位（HP 條 /
//    死亡態）、塔、龍 / 巴龍、比分 / 經濟 / 勝率、事件 ticker。
//  控制（任務單 §7 全數）：播放 / 暫停、±10 秒、上一 / 下一事件、
//    0.5× / 1× / 2× / 4×、timeline slider、當前 / 總時間、返回 Result。
//  frames 每 2 秒取樣 → 位置做線性插值，播放平順不重算。
// ============================================================================
import React, { useEffect, useMemo, useRef, useState } from "react";
import { REPLAY_SPEEDS, SIM_PER_REAL } from "../../platform/contracts/mobaReplay.js";
import { PITS, fmtT } from "../../gameData.js";
import { GC, MONO } from "../../ui/theme.js";

const SIDE_C = { blue: "#3b82f6", red: "#ef4444" };
const lerp = (a, b, t) => a + (b - a) * t;

/** 目前時間 t → 前後 frame + 插值係數（frames t 遞增；二分搜尋）。
 *  空 frames → null（無重播時 hooks 仍會先執行，這裡必須安全，不可白畫面）。 */
function frameAt(frames, t) {
  if (!frames.length) return { a: null, b: null, f: 0 };
  let lo = 0, hi = frames.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (frames[mid].t <= t) lo = mid; else hi = mid - 1; }
  const a = frames[lo], b = frames[Math.min(lo + 1, frames.length - 1)];
  const f = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 0;
  return { a, b, f };
}

export default function MobaReplayScreen({ replay, onClose }) {
  const frames = replay?.frames ?? [];
  const duration = replay?.duration ?? 0;
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const tRef = useRef(0); tRef.current = t;

  // 播放時鐘：只推進時間軸，不做任何模擬
  useEffect(() => {
    if (!playing) return;
    const iv = setInterval(() => {
      const next = tRef.current + 0.1 * speed * SIM_PER_REAL;
      if (next >= duration) { setT(duration); setPlaying(false); }
      else setT(next);
    }, 100);
    return () => clearInterval(iv);
  }, [playing, speed, duration]);

  const events = replay?.events ?? [];
  const { a, b, f } = useMemo(() => frameAt(frames, t), [frames, t]);
  const recentEvents = useMemo(() => events.filter((e) => e.t <= t).slice(-3), [events, t]);

  if (!replay || frames.length === 0) {
    return (
      <div style={wrap}>
        <div style={{ color: GC.gray, fontSize: 13 }}>此場無重播資料（重播僅保留本次遊戲階段的最近一場）</div>
        <button onClick={onClose} style={btn(true)}>返回 Result</button>
      </div>
    );
  }

  const seek = (nt) => setT(Math.min(duration, Math.max(0, nt)));
  const prevEvent = () => { const e = [...events].reverse().find((x) => x.t < t - 0.25); seek(e ? e.t : 0); };
  const nextEvent = () => { const e = events.find((x) => x.t > t + 0.25); seek(e ? e.t : duration); };

  return (
    <div style={wrap}>
      {/* 標頭：比分 / 經濟 / 勝率 */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
        <span style={{ fontSize: 10, letterSpacing: "0.2em", color: GC.gray, fontWeight: 900 }}>REPLAY</span>
        <span style={{ fontFamily: MONO, fontWeight: 900, fontSize: 17 }}>
          <span style={{ color: SIDE_C.blue }}>{a.s[0]}</span>
          <span style={{ color: GC.gray }}> : </span>
          <span style={{ color: SIDE_C.red }}>{a.s[1]}</span>
        </span>
        <span style={{ fontFamily: MONO, fontSize: 10, color: GC.gray }}>💰 {Math.round(lerp(a.g[0], b.g[0], f)).toLocaleString()} / {Math.round(lerp(a.g[1], b.g[1], f)).toLocaleString()}</span>
        <div style={{ width: 110, height: 5, borderRadius: 99, background: SIDE_C.red, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${lerp(a.wp, b.wp, f) * 100}%`, background: SIDE_C.blue }} />
        </div>
        {replay.config?.tacticName && <span style={{ fontSize: 9, color: GC.purp }}>戰術 {replay.config.tacticName}</span>}
      </div>

      {/* 2D 戰場（100×100 引擎座標；y 向下為正 → 直接映射） */}
      <div style={{ flex: 1, minHeight: 0, width: "100%", display: "flex", justifyContent: "center" }}>
        <svg viewBox="0 0 100 100" style={{ height: "100%", maxWidth: "100%", aspectRatio: "1", background: "linear-gradient(135deg,#0e1a14,#0b1220)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)" }}>
          {/* 河道對角線 + 三路示意 */}
          <line x1="100" y1="0" x2="0" y2="100" stroke="rgba(56,189,248,0.14)" strokeWidth="6" />
          <path d="M8,92 L8,8 L92,8" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
          <path d="M8,92 L92,8" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
          <path d="M8,92 L92,92 L92,8" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
          {/* 塔（位置只存於 towersMeta；血量逐 frame） */}
          {Object.entries(replay.towersMeta).map(([id, tw]) => {
            const hp = a.tw[id] ?? 0;
            return (
              <g key={id}>
                <rect x={tw.pos.x - 1.6} y={tw.pos.y - 1.6} width="3.2" height="3.2" rx="0.7"
                  fill={hp > 0 ? SIDE_C[tw.side] : "#1f2430"} opacity={hp > 0 ? 0.9 : 0.45} />
                {hp > 0 && hp < 1 && <rect x={tw.pos.x - 1.6} y={tw.pos.y - 2.6} width={3.2 * hp} height="0.6" fill="#fbbf24" />}
              </g>
            );
          })}
          {/* 龍 / 巴龍 */}
          {a.dr === 1 && <text x={PITS.dragon.x} y={PITS.dragon.y + 1.5} fontSize="4.5" textAnchor="middle">🐉</text>}
          {a.br === 1 && <text x={PITS.baron.x} y={PITS.baron.y + 1.5} fontSize="4.5" textAnchor="middle">👑</text>}
          {/* 選手（位置插值；死亡 → 灰空心） */}
          {replay.playersMeta.map((pm, i) => {
            const pa = a.p[i], pb = b.p[i];
            const dead = pa[3] === 1;
            const x = dead ? pa[0] : lerp(pa[0], pb[0], f);
            const y = dead ? pa[1] : lerp(pa[1], pb[1], f);
            return (
              <g key={pm.id} opacity={dead ? 0.4 : 1}>
                <circle cx={x} cy={y} r="1.9" fill={dead ? "none" : SIDE_C[pm.side]} stroke={SIDE_C[pm.side]} strokeWidth="0.5" />
                {!dead && <rect x={x - 1.9} y={y - 3.1} width={3.8 * Math.max(0, pa[2])} height="0.7" rx="0.3" fill="#34d399" />}
                <text x={x} y={y + 4.6} fontSize="2.4" textAnchor="middle" fill="rgba(255,255,255,0.75)" fontFamily="monospace">{pm.id}</text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* 事件 ticker */}
      <div style={{ minHeight: 34, width: "100%", maxWidth: 560, display: "flex", flexDirection: "column", gap: 2 }}>
        {recentEvents.map((e, i) => (
          <div key={`${e.t}-${i}`} style={{ fontSize: 9.5, color: i === recentEvents.length - 1 ? "#e5e7eb" : GC.gray, fontFamily: MONO }}>
            <span style={{ color: GC.gold }}>[{fmtT(e.t)}]</span> <span style={{ color: SIDE_C[e.side] ?? GC.gray }}>{e.text}</span>
          </div>
        ))}
      </div>

      {/* Timeline */}
      <div style={{ width: "100%", maxWidth: 560, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontFamily: MONO, fontSize: 11, color: "#e5e7eb", flexShrink: 0 }}>{fmtT(t)}</span>
        <input type="range" min={0} max={duration} step={0.5} value={t}
          onChange={(e) => seek(Number(e.target.value))}
          style={{ flex: 1, accentColor: "#3b82f6" }} />
        <span style={{ fontFamily: MONO, fontSize: 11, color: GC.gray, flexShrink: 0 }}>{fmtT(duration)}</span>
      </div>

      {/* 控制列 */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, justifyContent: "center", alignItems: "center" }}>
        <button onClick={prevEvent} style={btn(false)} title="上一個事件">⏮ 事件</button>
        <button onClick={() => seek(t - 10)} style={btn(false)}>−10s</button>
        <button onClick={() => { if (!playing && t >= duration) setT(0); setPlaying((p) => !p); }} style={btn(true)}>{playing ? "⏸ 暫停" : "▶ 播放"}</button>
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
      {replay.truncated && <div style={{ fontSize: 9, color: GC.gold }}>⚠ 本場超過重播長度上限，尾段未收錄</div>}
    </div>
  );
}

const wrap = {
  position: "absolute", inset: 0, zIndex: 60,
  background: "rgba(7,11,20,0.985)",
  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
  gap: 10, padding: "14px 12px", boxSizing: "border-box", fontFamily: "system-ui,sans-serif",
};
const btn = (primary) => ({
  background: primary ? "linear-gradient(135deg,#3b82f6,#1d4ed8)" : "rgba(255,255,255,0.07)",
  border: primary ? "1px solid #93c5fd" : "1px solid rgba(255,255,255,0.18)",
  borderRadius: 9, padding: "7px 13px", color: "#fff", fontSize: 11.5, fontWeight: 800, cursor: "pointer",
});
