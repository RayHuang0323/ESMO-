// ============================================================================
//  battle/ui/BattleHeroStrip.jsx — MOBA 底部 5v5 Hero Strip（Sprint10）
//  唯一資料來源：useGameStore.snapshot（battleStore 消費的同一份快照）。
//  純顯示，不重新統計。無資料源的欄位（Mana/技能CD/Buff/裝備）依規範保留位置。
//  英雄靜態資料（頭像色/技能名）來自 CHAMPIONS_100（heroDatabase）。
// ============================================================================
import React, { useState } from "react";
import { useGameStore } from "../../useGameStore.js";
import { ROSTER } from "../../data/roster.js";
import { heroById } from "../../data/heroDatabase.js";
import HeroDetailPanel from "./HeroDetailPanel.jsx";
import { GC } from "../../ui/theme.js";

const MONO = "ui-monospace,Menlo,monospace";
const stColor = (s) => s === "團戰!" ? "#f87171" : s === "撤退" ? GC.gold : s === "圍攻" ? GC.purp : s === "回防" ? GC.blueL : "#9ca3af";
const stShort = (s, dead) => dead ? "死亡" : s === "團戰!" ? "團戰" : s;

function HeroCard({ p, side, onOpen }) {
  const r = ROSTER[p.id] || {};
  const h = heroById(r.heroId) || {};
  const c = side === "blue" ? GC.blue : GC.red;
  const edge = side === "blue" ? GC.blueL : GC.redL;
  const hpC = p.hp > 0.55 ? GC.green : p.hp > 0.28 ? GC.gold : "#f87171";
  const dead = p.dead;
  const initial = (h.zh || r.hero || "?").slice(0, 1);

  return (
    <div onClick={onOpen} style={{ width: 92, background: "rgba(8,12,22,0.92)", border: `1px solid ${edge}44`, borderRadius: 8, padding: "4px 5px", opacity: dead ? 0.55 : 1, position: "relative", cursor: "pointer" }}>
      {/* 頭像色塊（佔位：無真實頭像圖）+ Lv */}
      <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
        <div style={{ width: 26, height: 26, borderRadius: 6, background: h.color || c, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 13, color: "#0b1220", flexShrink: 0 }}>{initial}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 10.5, fontWeight: 900, color: "#e5e7eb", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{h.zh || r.hero || p.id}</div>
          <div style={{ fontSize: 8.5, color: "rgba(255,255,255,0.5)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.player || p.id.toUpperCase()}</div>
        </div>
        <div style={{ fontSize: 10, fontWeight: 900, color: "#fde047", fontFamily: MONO }}>{p.lv ?? 1}</div>
      </div>

      {/* HP 條（真資料）*/}
      <div style={{ marginTop: 3, height: 5, borderRadius: 99, background: "rgba(255,255,255,0.12)", overflow: "hidden" }}>
        <div style={{ width: `${Math.max(0, p.hp) * 100}%`, height: "100%", background: hpC }} />
      </div>
      {/* Mana 條（保留位置：目前無資料）*/}
      <div style={{ marginTop: 2, height: 3, borderRadius: 99, background: "rgba(59,130,246,0.15)", overflow: "hidden" }} title="Mana：目前無資料，保留位置">
        <div style={{ width: "0%", height: "100%", background: GC.blue }} />
      </div>

      {/* 技能 QWER CD（保留位置：格顯示技能名首字，CD 尚無資料）*/}
      <div style={{ display: "flex", gap: 2, marginTop: 3 }}>
        {["Q", "W", "E", "R"].map((k) => (
          <div key={k} title={`${k}：${h[k] || "—"}（CD 目前無資料）`} style={{ flex: 1, height: 11, borderRadius: 3, background: k === "R" ? "rgba(250,204,21,0.18)" : "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", fontSize: 7.5, fontWeight: 800, color: "rgba(255,255,255,0.6)", display: "flex", alignItems: "center", justifyContent: "center" }}>{k}</div>
        ))}
      </div>

      {/* KDA / 金錢（真資料）*/}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3, fontSize: 8.5, fontFamily: MONO }}>
        <span style={{ color: "#e5e7eb", fontWeight: 800 }}>{p.k}/{p.d}/{p.a ?? 0}</span>
        <span style={{ color: GC.gold }}>{((p.gold ?? 0) / 1000).toFixed(1)}k</span>
      </div>

      {/* 裝備數（保留位置 0/6）+ Buff/Debuff（保留位置）+ 狀態（真資料）*/}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
        <span title="裝備：目前無資料，保留位置" style={{ fontSize: 8, color: "rgba(255,255,255,0.4)", fontFamily: MONO }}>🎒0/6</span>
        <span style={{ fontSize: 8.5, fontWeight: 800, color: stColor(p.state) }}>{dead ? `☠${Math.max(0, p.respawn).toFixed(0)}s` : stShort(p.state, dead)}</span>
      </div>
      {/* Buff/Debuff 佔位列 */}
      <div title="Buff/Debuff：目前無資料，保留位置" style={{ display: "flex", gap: 2, marginTop: 2, height: 4 }}>
        <div style={{ flex: 1, borderRadius: 99, background: "rgba(52,211,153,0.12)" }} />
        <div style={{ flex: 1, borderRadius: 99, background: "rgba(248,113,113,0.12)" }} />
      </div>
    </div>
  );
}

export default function BattleHeroStrip() {
  const snap = useGameStore((s) => s.snapshot);
  const [open, setOpen] = useState(null);   // 點擊英雄卡 → Hero Detail（含 Skill Panel）
  if (!snap?.players) return null;
  const blue = snap.players.filter((p) => p.side === "blue");
  const red = snap.players.filter((p) => p.side === "red");
  const mk = (p) => { const r = ROSTER[p.id] || {}; return { heroId: r.heroId, heroName: heroById(r.heroId)?.zh ?? p.id, playerName: r.player ?? p.id.toUpperCase(), side: p.side }; };
  return (
    <>
      <div style={{ position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)", zIndex: 11, display: "flex", gap: 10, pointerEvents: "auto" }}>
        <div style={{ display: "flex", gap: 4 }}>{blue.map((p) => <HeroCard key={p.id} p={p} side="blue" onOpen={() => setOpen(mk(p))} />)}</div>
        <div style={{ width: 1, background: "rgba(255,255,255,0.15)" }} />
        <div style={{ display: "flex", gap: 4 }}>{red.map((p) => <HeroCard key={p.id} p={p} side="red" onOpen={() => setOpen(mk(p))} />)}</div>
      </div>
      {open && <HeroDetailPanel {...open} onClose={() => setOpen(null)} />}
    </>
  );
}
