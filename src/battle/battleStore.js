// ============================================================================
//  battle/battleStore.js — Battle Presentation Layer 狀態中樞（zustand 包裝）
//  - 獨立 store；核心 useGameStore 一行不改（維持 Store 為唯一橋樑）
//  - 純轉換邏輯在 battleReducer.js（可 Node 驗證）；接線在 useBattleFeed.js
// ============================================================================

import { create } from "zustand";
import { BattleEventTracker } from "./battleEvents.js";
import { emptyBattleState, ingestReducer } from "./battleReducer.js";
import { CommsEngine } from "./moba/tacticalComms.js";

export const useBattleStore = create((set, get) => {
  const tracker = new BattleEventTracker();
  return {
    ...emptyBattleState(),
    result: null,   // Sprint09：終局 BattleResult（唯一計算點產出；EndScreen 消費）
    // S29：戰術溝通播報（規則式，事件驅動）。**與 events/log 分開存**
    //   ⇒ BattleResult.timeline 完全不變（契約不動），Timeline 元件自己合併顯示。
    comms: [],
    _tracker: tracker,
    _comms: null,

    /** S29：開局初始化播報引擎（誰在講話、本場戰術）。由 useBattleFeed 呼叫。 */
    initComms({ roster = null, tacticId = null, side = "blue" } = {}) {
      set({ _comms: new CommsEngine({ roster, tacticId, side }), comms: [] });
    },

    /** 呈現層唯一入口：餵最新 snapshot（由 useBattleFeed 呼叫） */
    ingest(snap) {
      const newEvents = tracker.update(snap);
      set((s) => ingestReducer(s, newEvents, snap));
      // S29：播報只吃「真實事件 + 真實 snapshot 狀態」，且有冷卻 ⇒ 不洗版、不編造
      const ce = get()._comms;
      if (ce) {
        const msgs = ce.update(snap, newEvents);
        if (msgs.length) set((s) => ({ comms: [...s.comms, ...msgs] }));
      }
    },

    /** BattleFloatingText 呈現完一則後回收 */
    consumeFloating(id) {
      set((s) => ({ floating: s.floating.filter((f) => f.id !== id) }));
    },

    setResult(result) { set({ result }); },

    reset() {
      tracker.reset();
      set({ ...emptyBattleState(), result: null, comms: [], _comms: null });
    },
  };
});
