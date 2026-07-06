// ============================================================================
//  battle/ui/BattleEndScreen.jsx — 終局畫面（Sprint06【H】）
//  Victory/Defeat 進場動畫（CSS keyframes）、MVP 卡、最佳數據、Timeline 摘要、
//  onContinue 掛鉤（由上層 Router 導向 Sprint01 Result；本層不碰 Router）。
//  全部資料來自最終 snapshot + battleStore（真實推導）。
// ============================================================================

import React, { useEffect, useState } from "react";
import { useGameStore } from "../../useGameStore.js";
import { useBattleStore } from "../battleStore.js";
import { playerRating } from "../battleEvents.js";
import { fmtT, ROLE_NAME } from "../../gameData.js";
import BattleScoreboard from "./BattleScoreboard.jsx";

const KEYFRAMES = `
@keyframes esmoEndPop { 0%{transform:scale(0.6);opacity:0} 60%{transform:scale(1.08)} 100%{transform:scale(1);opacity:1} }
@keyframes esmoEndRise { 0%{transform:translateY(26px);opacity:0} 100%{transform:translateY(0);opacity:1} }
@keyframes esmoGlowPulse { 0%,100%{text-shadow:0 0 24px currentColor} 50%{text-shadow:0 0 60px currentColor} }`;

const ICON = { FIRST_BLOOD: "🩸", KILL: "⚔️", MULTI_KILL: "🔥", ACE: "💥", TOWER_DESTROYED: "🗼", DRAGON_SLAIN: "🐉", BARON_SLAIN: "👑", VICTORY: "🏆" };

// 最佳數據（各面向最大值；全為 snapshot 真實欄位）
function bestStats(snap) {
  const top = (key, label, icon, fmt = (v) => Math.round(v)) => {
    const p = [...snap.players].sort((a, b) => (b[key] || 0) - (a[key] || 0))[0];
    return { icon, label, id: p.id, side: p.side, val: fmt(p[key] || 0) };
  };
  return [
    top("k", "最多擊殺", "⚔️"),
    top("dmg", "最高輸出", "💥", (v) => (v / 1000).toFixed(1) + "k"),
    top("heal", "最高治療", "💚", (v) => (v / 1000).toFixed(1) + "k"),
    top("gold", "最富有", "💰", (v) => (v / 1000).toFixed(1) + "k"),
  ];
}

export default function BattleEndScreen({ roster = null, homeSide = "blue", onContinue = null, blueName = "德國海豹", redName = "赤焰軍團" }) {
  const snap = useGameStore((s) => s.snapshot);
  const { mvp, events } = useBattleStore();
  const [phase, setPhase] = useState(0);           // 0 大字 → 1 全部內容
  useEffect(() => { const t = setTimeout(() => setPhase(1), 900); return () => clearTimeout(t); }, []);

  const win = snap.winner;
  const homeWin = win === homeSide;
  const title = homeWin ? "VICTORY" : "DEFEAT";
  const titleColor = homeWin ? "#fde047" : "#94a3b8";
  const mvpName = mvp ? (roster?.[mvp.id]?.player ?? mvp.id.toUpperCase()) : "—";
  const highlights = events.filter((e) => ["FIRST_BLOOD", "ACE", "BARON_SLAIN", "MULTI_KILL", "VICTORY"].includes(e.type)).slice(-6);
  const stats = bestStats(snap);
  const sideC = (s) => (s === "blue" ? "#93c5fd" : "#fca5a5");

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 14, display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", gap: 12, background: "rgba(4,8,16,0.78)", backdropFilter: "blur(5px)", overflow: "auto", padding: 16 }}>
      <style>{KEYFRAMES}</style>

      {/* 勝敗大字 */}
      <div style={{ animation: "esmoEndPop 0.7s cubic-bezier(0.2,0.9,0.3,1.2) both", textAlign: "center" }}>
        <div style={{ fontSize: 58, fontWeight: 900, letterSpacing: "0.12em", color: titleColor, animation: "esmoGlowPulse 2.2s infinite" }}>{title}</div>
        <div style={{ fontSize: 14, fontWeight: 800, color: sideC(win), marginTop: 2 }}>
          {win === "blue" ? blueName : redName} 獲勝 · {fmtT(snap.ts)} · {snap.bK} : {snap.rK}
        </div>
      </div>

      {phase >= 1 && (
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap", justifyContent: "center", animation: "esmoEndRise 0.5s ease both" }}>
          {/* 左：MVP 卡 + 最佳數據 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, width: 220 }}>
            {mvp && (
              <div style={{ background: "linear-gradient(160deg,rgba(250,204,21,0.16),rgba(8,14,24,0.9))", border: "1px solid rgba(250,204,21,0.5)", borderRadius: 12, padding: "12px 14px", textAlign: "center" }}>
                <div style={{ fontSize: 10, letterSpacing: "0.3em", color: "#fde047", fontWeight: 900 }}>MVP</div>
                <div style={{ fontSize: 19, fontWeight: 900, color: sideC(mvp.side), marginTop: 2 }}>{mvpName}</div>
                <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.55)" }}>{roster?.[mvp.id]?.hero ?? ROLE_NAME[mvp.role]}</div>
                <div style={{ fontFamily: "monospace", fontSize: 15, fontWeight: 800, color: "#fff", marginTop: 4 }}>{mvp.k}/{mvp.d}/{mvp.a}</div>
                <div style={{ fontSize: 10, color: "#fde047", marginTop: 2 }}>Rating {playerRating(mvp).toFixed(0)} · {(mvp.dmg / 1000).toFixed(1)}k DMG</div>
              </div>
            )}
            <div style={{ background: "rgba(8,14,24,0.9)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: "9px 12px" }}>
              <div style={{ fontSize: 9.5, letterSpacing: "0.2em", color: "rgba(255,255,255,0.5)", fontWeight: 900, marginBottom: 5 }}>最佳數據</div>
              {stats.map((s2, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "2px 0" }}>
                  <span style={{ color: "rgba(255,255,255,0.7)" }}>{s2.icon} {s2.label}</span>
                  <span style={{ fontFamily: "monospace", fontWeight: 800, color: sideC(s2.side) }}>{roster?.[s2.id]?.player ?? s2.id.toUpperCase()} {s2.val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 中：完整記分板 */}
          <BattleScoreboard roster={roster} blueName={blueName} redName={redName} />

          {/* 右：Timeline 摘要 */}
          <div style={{ background: "rgba(8,14,24,0.9)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: "9px 12px", width: 210 }}>
            <div style={{ fontSize: 9.5, letterSpacing: "0.2em", color: "rgba(255,255,255,0.5)", fontWeight: 900, marginBottom: 5 }}>戰報摘要</div>
            {highlights.length === 0 && <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.4)" }}>無關鍵事件</div>}
            {highlights.map((ev) => (
              <div key={ev.id} style={{ display: "flex", gap: 5, fontSize: 10.5, lineHeight: 1.45 }}>
                <span>{ICON[ev.type] || "•"}</span>
                <span style={{ color: "rgba(255,255,255,0.4)", fontFamily: "monospace" }}>{fmtT(ev.t)}</span>
                <span style={{ color: sideC(ev.side) }}>{ev.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {phase >= 1 && (
        <div style={{ display: "flex", gap: 10, animation: "esmoEndRise 0.5s 0.15s ease both" }}>
          {onContinue && (
            <button onClick={onContinue} style={{ background: "linear-gradient(135deg,#3b82f6,#1d4ed8)", border: "1px solid #93c5fd", borderRadius: 10, padding: "10px 30px", color: "#fff", fontWeight: 900, fontSize: 14, cursor: "pointer" }}>
              查看賽後結算 →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
