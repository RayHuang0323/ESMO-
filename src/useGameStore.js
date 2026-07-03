// ============================================================================
//  useGameStore.js  —  渲染狀態橋（真 zustand）
//  prev / snapshot：相鄰兩幀（內插起點/終點）
//  subTRef：0→1 子幀進度（ref；渲染端 useFrame 直接讀，不觸發 React 重繪）
//  hud：給 React HUD 訂閱的精簡比分資料（每換幀更新一次）
//  npm install zustand
// ============================================================================

import { create } from "zustand";
import { LogicEngine } from "./LogicEngine.js";

const boot = new LogicEngine(1).snapshot();
const emptyHud = { ts: 0, bK: 0, rK: 0, bGold: 500, rGold: 500, winProb: 0.5, over: false, winner: null, feed: [] };

export const useGameStore = create((set, get) => ({
  prev: boot,
  snapshot: boot,
  subTRef: { current: 0 },
  hud: emptyHud,
  roster: {},   // Hero Mapping：{ playerId: championObject }；開局指派一次，之後不動

  // 換幀：snapshot 推成 prev、載入新幀、子幀歸零、更新 hud
  pushFrame(snap) {
    const s = get();
    s.subTRef.current = 0;
    set({
      prev: s.snapshot,
      snapshot: snap,
      hud: { ts: snap.ts, bK: snap.bK, rK: snap.rK, bGold: snap.bGold, rGold: snap.rGold, winProb: snap.winProb, over: snap.over, winner: snap.winner, feed: snap.feed },
    });
  },

  // Hero Mapping：開局時由 useLocalServer 指派一次英雄身份
  setRoster(roster) { set({ roster }); },

  reset() {
    const b = new LogicEngine(1).snapshot();
    get().subTRef.current = 0;
    set({ prev: b, snapshot: b, hud: emptyHud, roster: {} });
  },
}));
