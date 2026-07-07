// ============================================================================
//  battle/ui/BattleHUD.jsx — 專業轉播 HUD v3（Sprint07【A】）
//  版式比照 LoL/Wild Rift/Dota2 轉播：上緣隊伍膠囊（大比分/推塔/龍/巴龍）、
//  中央計時 + 金錢差、資源重生倒數（真 respawn 資料）、勝率條、即時 MVP。
//  全部讀 snapshot/battleStore；無假資料、無第二套 state。
// ============================================================================

import React from "react";
import { useGameStore } from "../../useGameStore.js";
import { useBattleStore } from "../battleStore.js";
import { fmtT } from "../../gameData.js";

const MONO = "ui-monospace,Menlo,monospace";
const Obj = ({ icon, val, color }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 2, color, fontWeight: 800, fontSize: 11.5, fontFamily: MONO }}>
    <span style={{ fontSize: 12.5 }}>{icon}</span>{val}
  </span>
);

// 資源狀態徽章：存活=脈動點；死亡=重生倒數（真 respawn）
function Pit({ label, icon, data }) {
  const alive = data.alive;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 800,
      color: alive ? "#fde68a" : "rgba(255,255,255,0.5)", background: "rgba(8,14,24,0.72)",
      border: `1px solid ${alive ? "rgba(250,204,21,0.55)" : "rgba(255,255,255,0.14)"}`, borderRadius: 8, padding: "2px 8px" }}>
      <span style={{ fontSize: 12 }}>{icon}</span>
      <span>{label}</span>
      {alive
        ? <span style={{ width: 6, height: 6, borderRadius: 99, background: "#fde047", boxShadow: "0 0 8px #fde047", animation: "esmoPulse 1.2s infinite" }} />
        : <span style={{ fontFamily: MONO }}>{Math.max(0, data.respawn).toFixed(0)}s</span>}
    </div>
  );
}

export default function BattleHUD({ blueName = "德國海豹", blueEmoji = "🦭", redName = "赤焰軍團", redEmoji = "🔥", roster = null }) {
  const hud = useGameStore((s) => s.hud);
  const snap = useGameStore((s) => s.snapshot);
  const { derived, mvp } = useBattleStore();
  const goldDiff = hud.bGold - hud.rGold;
  const blueLead = goldDiff >= 0;
  const mvpName = mvp ? (roster?.[mvp.id]?.player ?? mvp.id.toUpperCase()) : "—";

  const TeamPod = ({ side }) => {
    const b = side === "blue";
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexDirection: b ? "row" : "row-reverse",
        background: `linear-gradient(${b ? "90deg" : "270deg"}, rgba(8,14,24,0.88), rgba(8,14,24,0.55))`,
        border: `1px solid ${b ? "rgba(59,130,246,0.55)" : "rgba(239,68,68,0.55)"}`,
        borderRadius: 12, padding: "6px 12px", minWidth: 236, backdropFilter: "blur(5px)" }}>
        <span style={{ fontSize: 17 }}>{b ? blueEmoji : redEmoji}</span>
        <div style={{ textAlign: b ? "left" : "right" }}>
          <div style={{ color: b ? "#93c5fd" : "#fca5a5", fontWeight: 900, fontSize: 12.5, letterSpacing: "0.02em" }}>{b ? blueName : redName}</div>
          <div style={{ display: "flex", gap: 8, flexDirection: b ? "row" : "row-reverse" }}>
            <Obj icon="🗼" val={b ? derived.blueTowers : derived.redTowers} color={b ? "#93c5fd" : "#fca5a5"} />
            <Obj icon="🐉" val={b ? derived.dragonB : derived.dragonR} color="#c4b5fd" />
            <Obj icon="👑" val={b ? derived.baronB : derived.baronR} color="#fcd34d" />
            <Obj icon="💰" val={((b ? hud.bGold : hud.rGold) / 1000).toFixed(1) + "k"} color="#fde68a" />
          </div>
        </div>
        <div style={{ color: "#fff", fontWeight: 900, fontSize: 26, fontFamily: MONO, marginLeft: b ? "auto" : 0, marginRight: b ? 0 : "auto", textShadow: "0 2px 8px rgba(0,0,0,0.6)" }}>
          {b ? hud.bK : hud.rK}
        </div>
      </div>
    );
  };

  return (
    <div style={{ position: "absolute", top: 8, left: 10, right: 10, pointerEvents: "none", fontFamily: "system-ui,-apple-system,sans-serif", zIndex: 8 }}>
      <style>{`@keyframes esmoPulse{0%,100%{opacity:1}50%{opacity:0.3}} @keyframes esmoHudIn{0%{transform:translateY(-14px);opacity:0}100%{transform:translateY(0);opacity:1}}`}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "stretch", gap: 8, animation: "esmoHudIn 0.45s ease both" }}>
        <TeamPod side="blue" />
        {/* 中央：計時 / 金錢差 / 資源倒數 */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
          <div style={{ color: "#fff", fontSize: 17, fontWeight: 900, fontFamily: MONO, background: "rgba(8,14,24,0.85)", padding: "3px 16px", borderRadius: 9, border: "1px solid rgba(255,255,255,0.14)" }}>{fmtT(hud.ts)}</div>
          <div style={{ color: blueLead ? "#93c5fd" : "#fca5a5", fontSize: 10.5, fontWeight: 900, fontFamily: MONO }}>
            {blueLead ? "◀" : ""} 金差 {(Math.abs(goldDiff) / 1000).toFixed(1)}k {blueLead ? "" : "▶"}
          </div>
          <div style={{ display: "flex", gap: 5 }}>
            <Pit label="小龍" icon="🐉" data={snap.dragon} />
            <Pit label="巴龍" icon="👑" data={snap.baron} />
          </div>
        </div>
        <TeamPod side="red" />
      </div>

      {/* 勝率條 + MVP */}
      <div style={{ marginTop: 6, height: 7, borderRadius: 99, overflow: "hidden", background: "rgba(0,0,0,0.55)", display: "flex", border: "1px solid rgba(255,255,255,0.1)" }}>
        <div style={{ width: `${hud.winProb * 100}%`, background: "linear-gradient(90deg,#1d4ed8,#60a5fa)", transition: "width 0.4s ease" }} />
        <div style={{ flex: 1, background: "linear-gradient(90deg,#f87171,#b91c1c)" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2, fontSize: 9.5, fontWeight: 800, fontFamily: MONO }}>
        <span style={{ color: "#93c5fd" }}>{(hud.winProb * 100).toFixed(0)}%</span>
        <span style={{ color: mvp?.side === "blue" ? "#93c5fd" : "#fca5a5" }}>
          ★ MVP {mvpName} {mvp ? `${mvp.k}/${mvp.d}/${mvp.a ?? 0} · RTG ${mvp.score.toFixed(0)}` : ""}
        </span>
        <span style={{ color: "#fca5a5" }}>{((1 - hud.winProb) * 100).toFixed(0)}%</span>
      </div>
    </div>
  );
}
