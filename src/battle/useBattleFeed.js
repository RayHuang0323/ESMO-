// ============================================================================
//  battle/useBattleFeed.js — 核心快照流 → Battle Presentation store 的接線
//  - 呈現層唯一與核心 store 的接觸點：只讀 useGameStore.snapshot，不回寫核心
//  - 用 zustand subscribe：每次換幀（pushFrame 更新 snapshot）觸發一次 ingest
//  - 掛在 <BattlePresentationLayer/>；卸載時取消訂閱
// ============================================================================

import { useEffect } from "react";
import { useGameStore } from "../useGameStore.js";
import { useBattleStore } from "./battleStore.js";

export function useBattleFeed() {
  useEffect(() => {
    const ingest = useBattleStore.getState().ingest;
    const reset = useBattleStore.getState().reset;
    // 首幀先灌一次現況
    ingest(useGameStore.getState().snapshot);
    // 只在 snapshot 參照改變時 ingest（pushFrame 每幀換新物件）
    const unsub = useGameStore.subscribe((state, prev) => {
      const snap = state.snapshot;
      if (!prev || snap === prev.snapshot) return;
      if (prev.snapshot && snap.ts < prev.snapshot.ts) reset();  // 新對局：先重置
      ingest(snap);
    });
    return () => unsub();
  }, []);
}
