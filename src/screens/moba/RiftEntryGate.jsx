// ============================================================================
//  screens/moba/RiftEntryGate.jsx — 略過 Loading 的入口也要等 Rift（Replay 用）
//
//  【為什麼】正常 Ban/Pick → Loading → Battle 已由 LoadingScreen 等 Rift 就緒。
//   但第一次開 Replay 不經過 Loading：Rift 還沒好就掛上戰場，會先看到最多 20 秒
//   沒有地形的深色背景。這裡在同一個入口先顯示載入畫面，就緒才揭露戰場。
//   （恢復進行中的戰鬥則由 AppShell 直接改走既有的 LoadingScreen。）
//
//  【不是第二套 readiness】狀態、期限、決策全部沿用 riftAsset.js／riftMapGate.js：
//   ready → 揭露 Rift；failed 或到期 → 揭露，戰場自己畫 MobaMapBlockout；
//   期限內 → 只顯示本檔的載入畫面，戰場不掛載。
// ============================================================================
import React, { useEffect, useState, useSyncExternalStore } from "react";
import { armRiftGate, getRiftAssetSnapshot, preloadRiftAsset, subscribeRiftAsset } from "../../battle/moba/map/riftAsset.js";
import { loadingBarCap } from "../../battle/moba/map/riftMapGate.js";

/**
 * @param source  診斷用的入口名稱（例如 "replay"）
 * @param enabled false ⇒ 不需要 Rift（例如舊 replay 走 2D），永遠視為已開
 * @returns {{ open: boolean, rift: object }}
 */
export function useRiftEntryGate(source, { enabled = true } = {}) {
  const rift = useSyncExternalStore(subscribeRiftAsset, getRiftAssetSnapshot, getRiftAssetSnapshot);
  //  ⚠ 要等這個入口自己啟動過（重試上次失敗、重新計時）才可依決策揭露：
  //    否則上一場留下的 failed／過期期限會讓第一個 render 直接判 blockout。
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    preloadRiftAsset({ source, retryFailed: true });
    armRiftGate({ force: true, by: source });
    setArmed(true);
  }, [enabled, source]);
  const open = !enabled || rift.status === "ready" || (armed && rift.decision.mode !== "loading");
  return { open, rift };
}

/** 載入畫面：沿用 LoadingScreen 的紫色進度條語彙，進度與 LoadingScreen 同一個上限規則。 */
export function RiftEntryLoading({ rift }) {
  const pct = Math.max(0, Math.min(100, Math.round(Math.min(loadingBarCap(rift.decision, rift.progress), rift.progress * 100))));
  return (
    <div data-testid="rift-entry-loading" data-map-gate={rift.decision.mode}
      style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, background: "#0a0b0f", fontFamily: "system-ui" }}>
      <div style={{ color: "#c4b5fd", fontSize: 13, fontWeight: 900 }}>載入戰場地圖中…</div>
      <div style={{ width: "min(320px, 70%)", height: 8, borderRadius: 99, background: "rgba(255,255,255,0.07)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg,#a78bfa,#7c3aed)", borderRadius: 99, transition: "width .2s linear" }} />
      </div>
      <div style={{ color: "#71717a", fontSize: 10 }}>{pct}%</div>
    </div>
  );
}
