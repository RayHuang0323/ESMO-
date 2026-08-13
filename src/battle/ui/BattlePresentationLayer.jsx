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
//  Milestone L：關鍵演出的 HUD 播報（頭像 ＋ 演出分類）。與 3D 層讀同一份
//  snapshot.fx，經同一支 heroPresentationAdapter ⇒ 現場與 Replay 不可能分岔。
import HeroSkillCallout from "../moba/presentation/HeroSkillCallout.jsx";
import { Z } from "./battleLayout.js";

export default function BattlePresentationLayer({ roster = null, showTimeline = true, onContinue = null, draft = null, tactic = null, blueName = null, redName = null }) {
  //  Q3.5-fix：雙方隊名由 GameView 從本場指派單讀來（唯一來源見
  //  `platform/matchTeamNames.js`）。HUD／記分板／終局畫面吃的是**同一組值**，
  //  所以三處不可能再各顯示各的。
  //  ⚠ null → undefined 是必要的：子元件用的是預設參數（`redName = "赤焰軍團"`），
  //    只有 undefined 會觸發預設值，傳 null 會讓隊名整個變空白。
  //    沒有場次（debug harness、單獨掛 GameView）⇒ 兩者皆 null ⇒ 退回既有預設。
  const names = { blueName: blueName ?? undefined, redName: redName ?? undefined };
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
      <BattleHUD roster={roster} tactic={tactic} {...names} />
      {showTimeline && !over && <BattleTimeline open roster={roster} />}
      {!over && <HeroSkillCallout roster={roster} />}
      <BattleFloatingText />
      {!over && <BattleHeroStrip roster={roster} draft={draft} />}

      {/* 戰中 TAB 記分板 */}
      {showBoard && !over && (
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: Z.overlay, pointerEvents: "none" }}>
          <BattleScoreboard roster={roster} {...names} />
        </div>
      )}

      {/* 終局：Victory/Defeat 動畫 + MVP + 最佳數據 + Timeline 摘要 → Result */}
      {over && <BattleEndScreen roster={roster} onContinue={onContinue} {...names} />}
    </>
  );
}
