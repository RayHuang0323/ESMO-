// ============================================================================
//  debug/MobaRuntimeBattle/MobaRuntimeBattleHarness.jsx — 正式戰鬥的直接入口（H.1）
//
//  進入：?debug=moba-runtime-battle
//
//  【它是什麼、不是什麼】
//   · **是**：把正式的 <GameView autoStart> 直接掛起來——同一個元件、同一個
//     LogicEngine、同一份 useGameStore、同一套 HUD ⇒ 截到的就是正式對戰畫面。
//   · **不是**：另一個地圖預覽頁。這裡沒有圖層開關、沒有可走性線、沒有座標標記。
//   存在的理由只有一個：跳過首頁 → 主選單 → 賽前準備，讓截圖工具能穩定地
//   在同一個時間點拍到同一場戰鬥。
//
//  URL 參數（都只影響**呈現**與截圖時機，不影響模擬）：
//    mapPresentation = legacy | runtime-v2   （見 mobaMapPresentation.js）
//    shot            = <id>                  設了就進截圖模式：隱藏捲軸、
//                                            戰鬥推進到 waitTs 後設 window.__BATTLE_SHOT_READY
//    waitTs          = 模擬秒數（預設 420）   等到 snapshot.ts ≥ 這個值才算就緒
//    quality         = low | medium | high
// ============================================================================
import React, { useEffect, useState } from "react";
import GameView from "../../GameView.jsx";
import { useGameStore } from "../../useGameStore.js";

const params = () => new URLSearchParams(window.location.search);

export default function MobaRuntimeBattleHarness() {
  const q = params();
  const shotId = q.get("shot");
  const waitTs = Number(q.get("waitTs") ?? 420);
  const [ready, setReady] = useState(false);

  //  截圖模式：訂閱 store，把比賽進度發佈到 window 給截圖工具輪詢。
  //  ⚠ 只讀 store，不 tick、不改任何模擬狀態。
  //  ⚠ 一場戰鬥要跑到終盤要好幾分鐘（引擎約 2 模擬秒 / 真實秒），所以工具是
  //    **同一場**跑一次、在不同 ts 連續取樣，而不是每張圖重開一場。
  useEffect(() => {
    if (!shotId) return undefined;
    const check = () => {
      const s = useGameStore.getState();
      const snap = s.snapshot;
      const ts = snap?.ts ?? 0;
      window.__BATTLE_TS = ts;
      window.__BATTLE_STATS = {
        ts,
        over: !!snap?.over,
        heroes: snap?.players?.length ?? 0,
        blue: (snap?.players ?? []).filter((p) => p.side === "blue").length,
        red: (snap?.players ?? []).filter((p) => p.side === "red").length,
        dead: (snap?.players ?? []).filter((p) => p.dead).length,
        towersDown: Object.values(snap?.towers ?? {}).filter((t) => t.hp <= 0).length,
        bK: snap?.bK ?? 0, rK: snap?.rK ?? 0,
      };
      if (ts >= waitTs || snap?.over) {
        window.__BATTLE_SHOT_READY = shotId;
        setReady(true);
      }
    };
    check();
    const unsub = useGameStore.subscribe(check);
    return () => unsub();
  }, [shotId, waitTs]);

  return (
    <div data-runtime-battle style={{ position: "fixed", inset: 0, background: "#0b0f14", overflow: "hidden" }}>
      {/* GameView 在正式流程裡是「頁面中的一塊」（height: min(82vh,720px)）。
          這個入口是整頁的，所以把它撐滿視窗 ⇒ 截圖不會有一大條黑邊。
          只改版面，不動 GameView 內部一行。 */}
      <style>{`[data-runtime-battle] > div > div { height: 100vh !important; max-height: none !important; border-radius: 0 !important; }`}</style>
      <div style={{ position: "absolute", inset: 0 }}>
        <GameView autoStart />
      </div>
      {shotId && !ready && (
        <div style={{ position: "absolute", right: 10, bottom: 10, zIndex: 999,
          font: "12px ui-monospace,monospace", color: "#9fb3c8" }}>
          等待戰鬥推進到 {waitTs}s…
        </div>
      )}
    </div>
  );
}
