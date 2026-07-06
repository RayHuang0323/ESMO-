// ============================================================================
//  battle/ui/BattleScoreboard.jsx — TAB 記分板 v2（Sprint06）
//  欄位：英雄/玩家、K/D/A、Gold、DMG、HEAL、參與率、Rating、MVP 標記
//  全部讀 snapshot 真實欄位（k/d/a/gold/dmg/heal 由引擎儀器化輸出）。
//  缺口（引擎無此概念，不造假）：Lv、Mana → 見技術債。
// ============================================================================

import React from "react";
import { useGameStore } from "../../useGameStore.js";
import { useBattleStore } from "../battleStore.js";
import { playerRating, participation } from "../battleEvents.js";
import { ROLE_NAME } from "../../gameData.js";

const ROLE_ICON = { top: "🛡️", jungle: "🌲", mid: "🔮", adc: "🏹", sup: "✨" };
const num = (v) => (v >= 1000 ? (v / 1000).toFixed(1) + "k" : String(Math.round(v)));
const H = ({ children, w }) => <div style={{ width: w, textAlign: "right", fontSize: 9, color: "rgba(255,255,255,0.45)", fontWeight: 800 }}>{children}</div>;
const C = ({ children, w, color = "#e5e7eb", mono = true }) => <div style={{ width: w, textAlign: "right", fontSize: 11, color, fontWeight: 700, fontFamily: mono ? "monospace" : "inherit" }}>{children}</div>;

function Row({ p, snap, isMvp, roster }) {
  const name = roster?.[p.id]?.player ?? p.id.toUpperCase();
  const hero = roster?.[p.id]?.hero ?? ROLE_NAME[p.role];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", borderRadius: 6,
      background: isMvp ? "rgba(250,204,21,0.13)" : "transparent", opacity: p.dead ? 0.55 : 1 }}>
      <span style={{ fontSize: 13, width: 16, textAlign: "center" }}>{ROLE_ICON[p.role] || "•"}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: "#e5e7eb", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {name}{isMvp && <span style={{ color: "#fde047", marginLeft: 4, fontSize: 9, fontWeight: 900 }}>★MVP</span>}
        </div>
        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.42)" }}>{hero}</div>
      </div>
      <C w={52}>{p.k}/{p.d}/{p.a ?? 0}</C>
      <C w={38} color="#fcd34d">{num(p.gold || 0)}</C>
      <C w={40} color="#fda4af">{num(p.dmg || 0)}</C>
      <C w={40} color="#86efac">{num(p.heal || 0)}</C>
      <C w={34} color="#c4b5fd">{Math.round(participation(p, snap) * 100)}%</C>
      <C w={36} color="#93c5fd">{playerRating(p).toFixed(0)}</C>
    </div>
  );
}

export default function BattleScoreboard({ roster = null, blueName = "德國海豹", blueEmoji = "🦭", redName = "赤焰軍團", redEmoji = "🔥" }) {
  const snap = useGameStore((s) => s.snapshot);
  const mvp = useBattleStore((s) => s.mvp);
  const side = (s) => snap.players.filter((p) => p.side === s);
  const sum = (arr, k) => arr.reduce((a, p) => a + (p[k] || 0), 0);

  const Head = () => (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 8px 2px" }}>
      <span style={{ width: 16 }} /><div style={{ flex: 1 }} />
      <H w={52}>K/D/A</H><H w={38}>GOLD</H><H w={40}>DMG</H><H w={40}>HEAL</H><H w={34}>參與</H><H w={36}>RTG</H>
    </div>
  );
  const Team = ({ players, color, label, emoji }) => (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", padding: "0 8px 3px" }}>
        <span style={{ color, fontWeight: 800, fontSize: 12 }}>{emoji} {label}</span>
        <span style={{ fontFamily: "monospace", fontSize: 10.5, color: "rgba(255,255,255,0.6)" }}>
          {sum(players, "k")}/{sum(players, "d")}/{sum(players, "a")} · {num(sum(players, "gold"))}g · {num(sum(players, "dmg"))}dmg
        </span>
      </div>
      {players.map((p) => <Row key={p.id} p={p} snap={snap} isMvp={mvp?.id === p.id} roster={roster} />)}
    </div>
  );

  return (
    <div style={{ background: "rgba(8,14,24,0.92)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 12, padding: "10px 4px 4px", width: 430, fontFamily: "system-ui,sans-serif" }}>
      <Head />
      <Team players={side("blue")} color="#93c5fd" label={blueName} emoji={blueEmoji} />
      <div style={{ height: 1, background: "rgba(255,255,255,0.1)", margin: "2px 8px 8px" }} />
      <Team players={side("red")} color="#fca5a5" label={redName} emoji={redEmoji} />
    </div>
  );
}
