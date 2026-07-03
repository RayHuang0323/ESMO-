// ============================================================================
//  MobaBattleAdapter.jsx — 讓 App.jsx（R3F WebGL MOBA）符合 Battle Contract
//
//  職責：包裝 App.jsx，接收 BattleConfig 展開的 props，在對局結束時把
//  snapshot 聚合成 BattleResult 並呼叫一次 onComplete(result)。
//  ⚠ 完全不修改 App.jsx 內部邏輯——用「外層包裝 + 訂閱」補上它缺的出口。
//
//  ──────────────────────────────────────────────────────────────────────
//  Phase 7（方案 A）已接通：App.jsx 於檔尾新增 `export { store }`（僅暴露
//  既有 store，零邏輯改動）。本 Adapter 直接 import 該 store 監聽 over。
//  battleStore 仍保留為可注入參數，供 Node 單元測試傳入 fake store。
//  ──────────────────────────────────────────────────────────────────────
// ============================================================================

import React, { useEffect, useRef } from "react";
import App, { store as appStore } from "../../App.jsx"; // R3F MOBA 原型 + 其既有 battle store（Phase 7 方案 A）
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
  battleStore = appStore, // 預設＝App.jsx 既有 store；仍保留注入口供 Node 測試
}) {
  const firedRef = useRef(false); // 保證 onComplete 只觸發一次

  useEffect(() => {
    if (!battleStore || typeof battleStore.subscribe !== "function") {
      if (typeof console !== "undefined") {
        console.warn("[MobaBattleAdapter] battleStore 無效，無法偵測對局結束。");
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
