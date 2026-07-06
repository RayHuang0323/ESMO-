// ============================================================================
//  battle/ui/BattleScoreboard.jsx — 戰後/戰中記分板（直接讀 snapshot + MVP）
//  每位玩家：Player/Hero 名、KDA、Gold、血量%；MVP 標記；雙方分隊小計。無假資料。
//  roster（可選）：{ [playerId]: { player, hero } }；缺省退回 id / 職業名。
// ============================================================================

import React from "react";
import { useGameStore } from "../../useGameStore.js";
import { useBattleStore } from "../battleStore.js";
import { ROLE_NAME } from "../../gameData.js";

const ROLE_ICON = { top: "🛡️", jungle: "🌲", mid: "🔮", adc: "🏹", sup: "✨" };

function Row({ p, isMvp, roster }) {
  const name = roster?.[p.id]?.player ?? p.id.toUpperCase();
  const hero = roster?.[p.id]?.hero ?? ROLE_NAME[p.role];
  const hpPct = Math.round((p.hp || 0) * 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", borderRadius: 6,
      background: isMvp ? "rgba(250,204,21,0.14)" : "transparent", opacity: p.dead ? 0.5 : 1 }}>
      <span style={{ fontSize: 14, width: 18, textAlign: "center" }}>{ROLE_ICON[p.role] || "•"}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#e5e7eb", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {name}{isMvp && <span style={{ color: "#fde047", marginLeft: 5, fontSize: 10, fontWeight: 900 }}>★MVP</span>}
        </div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)" }}>{hero}</div>
      </div>
      <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 800, color: "#fff", minWidth: 52, textAlign: "right" }}>
        {p.k}<span style={{ color: "rgba(255,255,255,0.4)" }}>/</span>{p.d}
      </div>
      <div style={{ fontFamily: "monospace", fontSize: 11, color: "#fcd34d", minWidth: 46, textAlign: "right" }}>{(p.gold || 0).toLocaleString()}</div>
    </div>
  );
}

export default function BattleScoreboard({ roster = null, compact = false }) {
  const snap = useGameStore((s) => s.snapshot);
  const mvp = useBattleStore((s) => s.mvp);
  const blue = snap.players.filter((p) => p.side === "blue");
  const red = snap.players.filter((p) => p.side === "red");
  const sum = (arr, k) => arr.reduce((a, p) => a + (p[k] || 0), 0);

  const Team = ({ players, color, label, emoji }) => (
    <div style={{ marginBottom: compact ? 6 : 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 8px 4px" }}>
        <span style={{ color, fontWeight: 800, fontSize: 12 }}>{emoji} {label}</span>
        <span style={{ fontFamily: "monospace", fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
          {sum(players, "k")}/{sum(players, "d")} · {sum(players, "gold").toLocaleString()}g
        </span>
      </div>
      {players.map((p) => <Row key={p.id} p={p} isMvp={mvp?.id === p.id} roster={roster} />)}
    </div>
  );

  return (
    <div style={{ background: "rgba(8,14,24,0.9)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 12, padding: "10px 6px", width: 320, fontFamily: "system-ui,sans-serif" }}>
      <Team players={blue} color="#93c5fd" label="德國海豹" emoji="🦭" />
      <div style={{ height: 1, background: "rgba(255,255,255,0.1)", margin: "6px 8px" }} />
      <Team players={red} color="#fca5a5" label="赤焰軍團" emoji="🔥" />
    </div>
  );
}
