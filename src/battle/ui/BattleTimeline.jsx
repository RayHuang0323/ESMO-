// ============================================================================
//  battle/ui/BattleTimeline.jsx — 圖形化戰報 v2（Sprint07【D】）
//  結構化列：Icon｜時間｜擊殺者 ⚔ 被擊殺者（陣營色、助攻數）｜塔(路/幾塔)｜龍/巴龍/ACE
//  資料：battleStore.events（含 Sprint07 結構化 data）。可收合。
// ============================================================================

import React, { useState } from "react";
import { useBattleStore } from "../battleStore.js";
import { fmtT } from "../../gameData.js";

const ICON = { FIRST_BLOOD: "🩸", KILL: "⚔️", MULTI_KILL: "🔥", ACE: "💥", TOWER_DESTROYED: "🗼", DRAGON_SLAIN: "🐉", BARON_SLAIN: "👑", VICTORY: "🏆" };
const LANE = { top: "上", mid: "中", bot: "下", nexus: "堡" };
const sideC = (s) => (s === "blue" ? "#93c5fd" : s === "red" ? "#fca5a5" : "#cbd5e1");
const MONO = "ui-monospace,Menlo,monospace";

function Name({ id, side, roster }) {
  return <span style={{ color: sideC(side), fontWeight: 800 }}>{roster?.[id]?.player ?? id.toUpperCase()}</span>;
}

function Row({ ev, roster }) {
  const d = ev.data;
  let body;
  if ((ev.type === "KILL" || ev.type === "FIRST_BLOOD") && d) {
    const vSide = ev.side === "blue" ? "red" : "blue";
    body = (
      <span>
        {ev.type === "FIRST_BLOOD" && <span style={{ color: "#f87171", fontWeight: 900, marginRight: 3 }}>首殺</span>}
        <Name id={d.killer} side={ev.side} roster={roster} />
        <span style={{ color: "rgba(255,255,255,0.5)", margin: "0 3px" }}>⚔</span>
        <Name id={d.victim} side={vSide} roster={roster} />
        {d.assists.length > 0 && <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 9.5 }}> +{d.assists.length}助攻</span>}
      </span>
    );
  } else if (ev.type === "MULTI_KILL" && d) {
    body = <span style={{ color: "#fbbf24", fontWeight: 900 }}>{["","","雙殺","三殺","四殺","五殺"][d.streak]}！<Name id={d.killer} side={ev.side} roster={roster} /></span>;
  } else if (ev.type === "TOWER_DESTROYED" && d) {
    body = (
      <span>
        <span style={{ display: "inline-block", minWidth: 15, textAlign: "center", fontSize: 9, fontWeight: 900, color: "#0d1420", background: sideC(ev.side), borderRadius: 4, marginRight: 4 }}>{LANE[d.lane]}</span>
        <span style={{ color: sideC(ev.side) }}>{d.isNexus ? "摧毀主堡！" : `拆除${d.victimSide === "blue" ? "藍" : "紅"}方 ${3 - d.tier} 塔`}</span>
      </span>
    );
  } else {
    body = <span style={{ color: sideC(ev.side) }}>{ev.text}</span>;
  }
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 5, padding: "3px 5px", fontSize: 11, lineHeight: 1.35, borderLeft: `2px solid ${sideC(ev.side)}`, marginBottom: 1, background: "rgba(255,255,255,0.025)", borderRadius: "0 5px 5px 0" }}>
      <span style={{ fontSize: 12, flexShrink: 0 }}>{ICON[ev.type] || "•"}</span>
      <span style={{ color: "rgba(255,255,255,0.42)", fontFamily: MONO, fontSize: 9.5, flexShrink: 0, marginTop: 1.5 }}>{fmtT(ev.t)}</span>
      {body}
    </div>
  );
}

export default function BattleTimeline({ open = true, max = 11 }) {
  const events = useBattleStore((s) => s.events);
  const [fold, setFold] = useState(false);
  if (!open) return null;
  const rows = [...events].reverse().slice(0, max);

  return (
    <div style={{ position: "absolute", top: 96, left: 10, width: 226, zIndex: 8, fontFamily: "system-ui,sans-serif" }}>
      <div onClick={() => setFold((v) => !v)} style={{ cursor: "pointer", pointerEvents: "auto", display: "flex", justifyContent: "space-between",
        background: "rgba(8,14,24,0.78)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: fold ? 9 : "9px 9px 0 0",
        padding: "4px 9px", fontSize: 10, fontWeight: 900, color: "rgba(255,255,255,0.6)", letterSpacing: "0.16em" }}>
        <span>⚡ 戰報 TIMELINE</span><span>{fold ? "▸" : "▾"}</span>
      </div>
      {!fold && (
        <div style={{ maxHeight: "40vh", overflow: "hidden", background: "rgba(8,14,24,0.6)", border: "1px solid rgba(255,255,255,0.12)", borderTop: "none", borderRadius: "0 0 9px 9px", backdropFilter: "blur(4px)", padding: "5px 4px", pointerEvents: "none" }}>
          {rows.length === 0 && <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.35)", padding: 4 }}>尚無事件…</div>}
          {rows.map((ev) => <Row key={ev.id} ev={ev} roster={null} />)}
        </div>
      )}
    </div>
  );
}
