// ============================================================================
//  battle/battleStore.js — Battle Presentation Layer 狀態中樞（zustand 包裝）
//  - 獨立 store；核心 useGameStore 一行不改（維持 Store 為唯一橋樑）
//  - 純轉換邏輯在 battleReducer.js（可 Node 驗證）；接線在 useBattleFeed.js
// ============================================================================

import { create } from "zustand";
import { BattleEventTracker } from "./battleEvents.js";
import { emptyBattleState, ingestReducer } from "./battleReducer.js";

export const useBattleStore = create((set) => {
  const tracker = new BattleEventTracker();
  return {
    ...emptyBattleState(),
    result: null,   // Sprint09：終局 BattleResult（唯一計算點產出；EndScreen 消費）
    _tracker: tracker,

    /** 呈現層唯一入口：餵最新 snapshot（由 useBattleFeed 呼叫） */
    ingest(snap) {
      const newEvents = tracker.update(snap);
      set((s) => ingestReducer(s, newEvents, snap));
    },

    /** BattleFloatingText 呈現完一則後回收 */
    consumeFloating(id) {
      set((s) => ({ floating: s.floating.filter((f) => f.id !== id) }));
    },

    setResult(result) { set({ result }); },

    reset() {
      tracker.reset();
      set({ ...emptyBattleState(), result: null });
    },
  };
});
