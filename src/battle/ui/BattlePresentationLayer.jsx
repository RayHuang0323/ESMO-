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
import BattleHeroStrip from "./BattleHeroStrip.jsx";

export default function BattlePresentationLayer({ roster = null, showTimeline = true, onContinue = null, draft = null, tactic = null }) {
  // Sprint20【E】draft 交給 useBattleFeed：終局產出的 BattleResult.players[].heroId
  //   = Ban/Pick 實際選到的英雄（沿用 snapshotToBattleResult 既有的 heroAssign 選項，
  //   BattleResult 結構不變、不重新統計）→ Result 顯示的英雄與 Draft/Battle 一致。
  // S29：roster / tacticId 傳給播報引擎（決定「誰在講、語氣」；不決定「是否觸發」）
  useBattleFeed(draft, { roster, tacticId: tactic?.tacticId ?? null });
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
      <BattleHUD roster={roster} tactic={tactic} />
      {showTimeline && !over && <BattleTimeline open roster={roster} />}
      <BattleFloatingText />
      {!over && <BattleHeroStrip roster={roster} draft={draft} />}

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
