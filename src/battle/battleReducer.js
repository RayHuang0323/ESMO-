// ============================================================================
//  battle/battleReducer.js — Battle Presentation 純狀態轉換（無 React/無 zustand）
//  ingestReducer 為純函數 → 可在 Node 逐幀驗證；battleStore.js 只做 zustand 包裝
// ============================================================================

import { mvpCandidate, towersDestroyedBy } from "./battleEvents.js";

export const EVENT_CAP = 40;    // Timeline 側欄保留最近 N 筆
export const FLOATING_TYPES = new Set([
  "FIRST_BLOOD", "MULTI_KILL", "ACE", "TOWER_DESTROYED", "DRAGON_SLAIN", "BARON_SLAIN", "VICTORY",
]);

export const SERIES_INTERVAL = 15;   // 每 15 模擬秒取樣一點（20 分局 ≈ 80 點）
export const emptyBattleState = () => ({
  events: [],
  log: [],      // Sprint09：完整事件記錄（不截斷）— BattleResult.timeline 的來源
  floating: [],
  mvp: null,
  derived: { blueTowers: 0, redTowers: 0, dragonB: 0, dragonR: 0, baronB: 0, baronR: 0 },
  series: [],   // [{t,bGold,rGold,bTw,rTw}] 供終局金錢圖/推塔圖（全由真快照取樣）
});

/** 純函數：目前呈現狀態 + 本幀新事件 + 最新 snapshot → 新呈現狀態 */
export function ingestReducer(state, newEvents, snap) {
  let { events, log, floating, derived } = state;
  if (newEvents.length) {
    events = [...events, ...newEvents].slice(-EVENT_CAP);
    log = [...log, ...newEvents];
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
  // S29 效能：舊碼**每幀都 new 一個 derived 物件**（即使推塔數完全沒變）⇒ 訂閱 derived
  //   的元件每幀都重繪。改為「內容真的變了才換參照」（zustand 用 Object.is 比較）。
  const bT = towersDestroyedBy(snap, "blue"), rT = towersDestroyedBy(snap, "red");
  if (derived.blueTowers !== bT || derived.redTowers !== rT) {
    derived = { ...derived, blueTowers: bT, redTowers: rT };
  }
  // 時間序取樣（金錢/推塔）：間隔取樣 + 終局補點
  let series = state.series;
  const last = series[series.length - 1];
  if (!last || snap.ts - last.t >= SERIES_INTERVAL || (snap.over && last.t < snap.ts)) {
    series = [...series, { t: snap.ts, bGold: snap.bGold, rGold: snap.rGold, bTw: derived.blueTowers, rTw: derived.redTowers }];
  }
  return { events, log, floating, mvp: mvpCandidate(snap), derived, series };
}
