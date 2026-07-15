// ============================================================================
//  battle/cameraStore.js — 相機模式狀態（Sprint29B3）
//
//  四種模式（任務單§三）：
//    director        導播（預設 ON）：computeSpectatorFocus 自動跟焦點
//    objectiveFocus  導播的自動子模式：焦點鎖在龍/巴龍坑（爭奪中）
//    heroFocus       點擊英雄 ⇒ 聚焦該英雄 FOCUS_MS 後自動回導播
//    free            玩家拖曳/滾輪/點空白 ⇒ 自由鏡頭（顯示「回到導播」小按鈕）
//
//  純呈現層：不 import 引擎、不碰 snapshot 寫入 ⇒ 任何模式都**不可能**改變模擬結果
//  （相機只讀 store；模擬由 useLocalServer 固定 dt 驅動）。
// ============================================================================
import { create } from "zustand";

export const CAMERA_MODES = ["director", "free", "heroFocus", "objectiveFocus"];
export const HERO_FOCUS_MS = 4000;   // 點英雄聚焦時長（任務單：3–5 秒）

export const useCameraStore = create((set) => ({
  mode: "director",
  heroId: null,          // heroFocus 目標（引擎 id：b1–b5 / r1–r5）
  focusUntil: 0,         // heroFocus 到期（performance.now() 毫秒）
  setMode: (mode) => set((s) => (s.mode === mode ? s : { mode, ...(mode !== "heroFocus" ? { heroId: null } : {}) })),
  focusHero: (heroId, ms = HERO_FOCUS_MS) =>
    set({ mode: "heroFocus", heroId, focusUntil: performance.now() + ms }),
  backToDirector: () => set({ mode: "director", heroId: null, focusUntil: 0 }),
}));
