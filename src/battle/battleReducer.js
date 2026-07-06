// ============================================================================
//  battle/battleReducer.js — Battle Presentation 純狀態轉換（無 React/無 zustand）
//  ingestReducer 為純函數 → 可在 Node 逐幀驗證；battleStore.js 只做 zustand 包裝
// ============================================================================

import { mvpCandidate, towersDestroyedBy } from "./battleEvents.js";

export const EVENT_CAP = 40;    // Timeline 側欄保留最近 N 筆
export const FLOATING_TYPES = new Set([
  "FIRST_BLOOD", "MULTI_KILL", "ACE", "TOWER_DESTROYED", "DRAGON_SLAIN", "BARON_SLAIN", "VICTORY",
]);

export const emptyBattleState = () => ({
  events: [],
  floating: [],
  mvp: null,
  derived: { blueTowers: 0, redTowers: 0, dragonB: 0, dragonR: 0, baronB: 0, baronR: 0 },
});

/** 純函數：目前呈現狀態 + 本幀新事件 + 最新 snapshot → 新呈現狀態 */
export function ingestReducer(state, newEvents, snap) {
  let { events, floating, derived } = state;
  if (newEvents.length) {
    events = [...events, ...newEvents].slice(-EVENT_CAP);
    const fl = newEvents.filter((e) => FLOATING_TYPES.has(e.type));
    if (fl.length) floating = [...floating, ...fl];
    const d = { ...derived };
    for (const e of newEvents) {
      if (e.type === "DRAGON_SLAIN") { if (e.side === "blue") d.dragonB++; else if (e.side === "red") d.dragonR++; }
      if (e.type === "BARON_SLAIN") { if (e.side === "blue") d.baronB++; else if (e.side === "red") d.baronR++; }
    }
    derived = d;
  }
  // 推塔數每幀由 snapshot 直接重算（真實來源，避免事件累加漂移）
  derived = { ...derived, blueTowers: towersDestroyedBy(snap, "blue"), redTowers: towersDestroyedBy(snap, "red") };
  return { events, floating, mvp: mvpCandidate(snap), derived };
}
