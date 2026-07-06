// ============================================================================
//  battle/ui/BattlePresentationLayer.jsx — DOM 呈現層總成（單一掛載點）
//  Sprint06：正式掛入 Battle。useBattleFeed（核心快照流 → battleStore）+
//  BattleHUD / BattleTimeline / BattleFloatingText / TAB 記分板 / BattleEndScreen。
//  相機跟隨屬 R3F，掛在 MobaView3D 的 Canvas 內（BattleCameraController）。
// ============================================================================

import React, { useEffect, useState } from "react";
import { useBattleFeed } from "../useBattleFeed.js";
import { useGameStore } from "../../useGameStore.js";
import BattleHUD from "./BattleHUD.jsx";
import BattleTimeline from "./BattleTimeline.jsx";
import BattleFloatingText from "./BattleFloatingText.jsx";
import BattleScoreboard from "./BattleScoreboard.jsx";
import BattleEndScreen from "./BattleEndScreen.jsx";

export default function BattlePresentationLayer({ roster = null, showTimeline = true, onContinue = null }) {
  useBattleFeed();                       // 唯一接線：核心快照 → battleStore（單向）
  const over = useGameStore((s) => s.hud.over);
  const [showBoard, setShowBoard] = useState(false);

  // TAB 按住顯示記分板（比照 MOBA 慣例）
  useEffect(() => {
    const down = (e) => { if (e.key === "Tab") { e.preventDefault(); setShowBoard(true); } };
    const up = (e) => { if (e.key === "Tab") setShowBoard(false); };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  return (
    <>
      <BattleHUD roster={roster} />
      {showTimeline && !over && <BattleTimeline open />}
      <BattleFloatingText />

      {/* 戰中 TAB 記分板 */}
      {showBoard && !over && (
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 12, pointerEvents: "none" }}>
          <BattleScoreboard roster={roster} />
        </div>
      )}

      {/* 終局：Victory/Defeat 動畫 + MVP + 最佳數據 + Timeline 摘要 → Result */}
      {over && <BattleEndScreen roster={roster} onContinue={onContinue} />}
    </>
  );
}
