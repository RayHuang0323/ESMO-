// ============================================================================
//  battle/ui/hudStore.js — 上方記分板的顯示層級（L Hotfix 2 §4）
//
//  為什麼需要一個小 store：記分板變矮之後，**戰報與演出 callout 的安全區
//  （SAFE_TOP）也要跟著變**，否則 compact 模式下方會空一大塊、
//  expanded 模式又會被蓋住。三個元件必須讀同一個高度來源。
//
//  刻意不引入 zustand：這裡只有一個字串狀態，用 useSyncExternalStore 就夠，
//  也不會多一個 store 讓人以為戰鬥狀態散在兩個地方。
//
//  ⚠ 純呈現：不碰引擎、不碰 snapshot、不影響模擬。
// ============================================================================
import { useSyncExternalStore } from "react";
import { HUD_TOP } from "./battleLayout.js";

export const HUD_MODES = Object.freeze(["compact", "expanded"]);
export const HUD_MODE_ZH = Object.freeze({ compact: "精簡", expanded: "完整" });
const KEY = "esmo.hud.mode.v1";

/** 記分板實際高度。compact 讓出更多戰場；expanded 沿用原本的完整版型。 */
export const HUD_HEIGHT = Object.freeze({
  compact: Object.freeze({ desktop: 56, mobile: 48 }),
  expanded: Object.freeze({ desktop: 126, mobile: 118 }),
});
export const hudHeight = (mode, mobile) =>
  (HUD_HEIGHT[mode] ?? HUD_HEIGHT.compact)[mobile ? "mobile" : "desktop"];
/** 頂部浮層（戰報／callout）的安全起點 = 記分板底緣 + 6。 */
export const hudSafeTop = (mode, mobile) => HUD_TOP + hudHeight(mode, mobile) + 6;

const read = () => {
  try {
    const v = localStorage.getItem(KEY);
    if (HUD_MODES.includes(v)) return v;
  } catch { /* localStorage 不可用 ⇒ 走預設 */ }
  return "compact";              // 預設 compact：戰場優先
};

let current = read();
const subs = new Set();
const emit = () => { for (const f of subs) f(); };

export function getHudMode() { return current; }
export function setHudMode(mode) {
  if (!HUD_MODES.includes(mode) || mode === current) return;
  current = mode;
  try { localStorage.setItem(KEY, mode); } catch { /* 忽略 */ }
  emit();
}
export const toggleHudMode = () => setHudMode(current === "compact" ? "expanded" : "compact");

const subscribe = (f) => { subs.add(f); return () => subs.delete(f); };

/** React 端讀取。live 與 Replay 共用同一個 store ⇒ 兩邊行為必然一致。 */
export function useHudMode() {
  return useSyncExternalStore(subscribe, getHudMode, getHudMode);
}
