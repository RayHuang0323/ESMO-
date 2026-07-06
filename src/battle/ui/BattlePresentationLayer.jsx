// ============================================================================
//  battle/ui/BattlePresentationLayer.jsx — DOM 呈現層總成（單一掛載點）
//  - 掛 useBattleFeed（接核心快照流）→ 疊放 BattleHUD / BattleTimeline /
//    BattleFloatingText；over 時彈出 BattleScoreboard 結算。
//  - 放在 GameView 的 3D Canvas 之上（絕對定位、pointerEvents 依元件各自控制）。
//  注意：相機跟隨（BattleCameraController）屬 R3F，需掛在 MobaView3D 的 Canvas 內，
//        不在此 DOM 層。
// ============================================================================

import React from "react";
import { useBattleFeed } from "../useBattleFeed.js";
import { useGameStore } from "../../useGameStore.js";
import BattleHUD from "./BattleHUD.jsx";
import BattleTimeline from "./BattleTimeline.jsx";
import BattleFloatingText from "./BattleFloatingText.jsx";
import BattleScoreboard from "./BattleScoreboard.jsx";

export default function BattlePresentationLayer({ roster = null, showTimeline = true }) {
  useBattleFeed();                       // 唯一接線：核心快照 → battleStore
  const over = useGameStore((s) => s.hud.over);
  const winner = useGameStore((s) => s.hud.winner);

  return (
    <>
      <BattleHUD roster={roster} />
      {showTimeline && <BattleTimeline open />}
      <BattleFloatingText />

      {over && (
        <div style={{ position: "absolute", inset: 0, zIndex: 13, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", background: "rgba(4,8,16,0.62)", backdropFilter: "blur(3px)" }}>
          <div style={{ fontSize: 30, marginBottom: 4 }}>{winner === "blue" ? "🦭" : "🔥"}</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: winner === "blue" ? "#93c5fd" : "#fca5a5", marginBottom: 12,
            textShadow: "0 2px 12px rgba(0,0,0,0.8)" }}>
            {winner === "blue" ? "德國海豹" : "赤焰軍團"} 勝利
          </div>
          <BattleScoreboard roster={roster} />
        </div>
      )}
    </>
  );
}
