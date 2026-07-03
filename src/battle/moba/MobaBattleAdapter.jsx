// ============================================================================
//  MobaBattleAdapter.jsx — 讓 App.jsx（R3F WebGL MOBA）符合 Battle Contract
//
//  職責：包裝 App.jsx，接收 BattleConfig 展開的 props，在對局結束時把
//  snapshot 聚合成 BattleResult 並呼叫一次 onComplete(result)。
//  ⚠ 完全不修改 App.jsx 內部邏輯——用「外層包裝 + 訂閱」補上它缺的出口。
//
//  ──────────────────────────────────────────────────────────────────────
//  ⚠⚠ 已知阻擋點（本 Phase 如實回報，未自行修改 App.jsx）⚠⚠
//  App.jsx 目前 `export default function App()`，其內部 `store`（持有
//  hud.over / winner）為模組私有、未對外匯出。因此本 Adapter 無法在
//  「零修改 App.jsx」前提下觀測戰鬥結束。
//
//  解法有二（皆屬下一 Phase、需你核准，本 Phase 一律不做）：
//    (A) App.jsx 新增一行 `export { store };`（不改任何戰鬥/渲染邏輯，
//        僅暴露既有 store）→ 本 Adapter 取消下方 import 註解即可運作。
//    (B) App.jsx 改為接收 onComplete prop 並於 over 時自呼叫（較侵入）。
//
//  為使 Adapter 現在即可獨立測試、且不造成編譯期 import 失敗，本檔採
//  「依賴注入」：對局狀態源（battleStore）由外部傳入或注入；未注入時
//  安全 no-op 並提示。真實接線留待上述 (A)/(B) 決議後進行。
//  ──────────────────────────────────────────────────────────────────────
// ============================================================================

import React, { useEffect, useRef } from "react";
import App from "../../App.jsx"; // R3F MOBA 原型（零修改）
// 待 App.jsx 核准新增 `export { store }` 後，改用下行直接取得真實 store：
// import { store as appStore } from "../../App.jsx";
import { snapshotToBattleResult, isBattleOver } from "./snapshotToBattleResult.js";

/**
 * @param {Object}   props
 * @param {number}   [props.seed]        BattleConfig.seed（本 Phase 尚未注入 App，僅寫入 result meta）
 * @param {string}   [props.mapKey]
 * @param {string}   [props.teamName]
 * @param {string}   [props.oppName]
 * @param {Function} props.onComplete    (result: BattleResult) => void
 * @param {Object}   [props.battleStore] 注入的狀態源，需具 { subscribe, getState }
 *                                       （預設應為 App.jsx 的 store；見上方阻擋點）
 */
export default function MobaBattleAdapter({
  seed, mapKey, teamName, oppName, onComplete,
  battleStore, // ← 依賴注入口；接線時傳入 App.jsx 的 store（需先 export）
}) {
  const firedRef = useRef(false); // 保證 onComplete 只觸發一次

  useEffect(() => {
    // battleStore 未注入 → 無法觀測 over（即上述阻擋點）。安全 no-op + 提示，不硬繞。
    if (!battleStore || typeof battleStore.subscribe !== "function") {
      if (typeof console !== "undefined") {
        console.warn(
          "[MobaBattleAdapter] 未取得 App.jsx store，無法偵測對局結束。" +
          "請於下一 Phase 讓 App.jsx `export { store }` 後注入 battleStore。"
        );
      }
      return;
    }

    const tryComplete = () => {
      if (firedRef.current) return;
      const state = battleStore.getState();
      const snap = state.snapshot || state.hud; // 兩者皆含 winner/over/bK/rK
      if (isBattleOver(snap)) {
        firedRef.current = true;
        const result = snapshotToBattleResult(snap, { seed, mapKey, teamName, oppName });
        onComplete && onComplete(result);
      }
    };

    tryComplete(); // 掛載當下先檢查一次（極快結束的防呆）
    const unsub = battleStore.subscribe(tryComplete);
    return () => unsub && unsub();
  }, [battleStore, seed, mapKey, teamName, oppName, onComplete]);

  // App.jsx 為全頁 absolute inset:0 佈局；用 relative 容器承載，不改 App 內部。
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", minHeight: "100vh" }}>
      <App />
    </div>
  );
}
