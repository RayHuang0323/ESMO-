// ============================================================================
//  battle/cameraStore.js — 相機模式 + pan/zoom 狀態（Sprint29B3 建立 / 29B6 擴充）
//
//  四種模式（29B3）：
//    director        導播（預設 ON）：computeSpectatorFocus 自動跟焦點
//    objectiveFocus  導播的自動子模式：焦點鎖在龍/巴龍坑（爭奪中）
//    heroFocus       點擊英雄 ⇒ 聚焦該英雄 FOCUS_MS 後自動回導播
//    free            玩家拖曳/捏合/滾輪 ⇒ 自由鏡頭（顯示「回到導播」小按鈕）
//
//  ── S29B6：本 store 成為 pan / zoom 的**單一狀態源** ──────────────────────
//  29B5 之前 pan/zoom 由 drei `OrbitControls` 自己持有，而 `enablePan` 寫死成
//  `debug`（預設 false）⇒ **地圖根本不能平移**；能動的只有 OrbitControls 的
//  「旋轉」，而 2.5D 戰術視角並不要旋轉（見 docs/design/MOBA_2.5D視角與資產策略.md）。
//  29B6 移除 OrbitControls，改為：
//    · 本 store 持有 `pan`（**邏輯世界座標**，非 3D 座標）與 `zoom`（正交 zoom）。
//    · 手勢（MobaView3D）→ `userPanTo` / `userZoomTo` ⇒ 一律先切 free 再寫入。
//    · 導播/heroFocus → `setAutoTarget` ⇒ 只寫目標值，**不改 mode**。
//    · `BattleCameraController` 是唯一把 pan/zoom 套用到相機的地方（單一控制來源）。
//  pan（注視點）一律 clamp 在 WORLD_BOUNDS 內（精確語意見 clampPan 的註解）。
//
//  純呈現層：不 import 引擎、不碰 snapshot 寫入 ⇒ 任何模式、任何 pan/zoom 都
//  **不可能**改變模擬結果（模擬由 useLocalServer 固定 dt 驅動）。
// ============================================================================
import { create } from "zustand";
import { WORLD_BOUNDS } from "../gameData.js";

export const CAMERA_MODES = ["director", "free", "heroFocus", "objectiveFocus"];
export const HERO_FOCUS_MS = 4000;   // 點英雄聚焦時長（任務單：3–5 秒）

/** 正交 zoom 上下限（與 fitZoomFor 的 clamp 同區間；避免縮到看不見或貼臉）。 */
export const ZOOM_MIN = 1.6;
export const ZOOM_MAX = 9;

const clampN = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * pan 目標（**鏡頭注視點**）一律夾在世界邊界內（邏輯座標）。
 *
 * ⚠ 精確語意：夾住的是**注視點**，不是「視窗四邊」。注視點推到邊角（例如 (0,0)）時，
 *   畫面**仍會露出世界外的區域**——要讓視窗邊緣也不出界，clamp 必須是 zoom + 視窗
 *   尺寸的函式（`halfSpan = viewportPx / zoom / WORLD_SCALE / 2`），而那會讓 store
 *   依賴視窗狀態；且高 zoom 下必須容許注視點抵達泉水/基地（22,202）等邊角，
 *   inset 型 clamp 反而會擋住合理操作。此處刻意採「注視點不出界」這條簡單不變量，
 *   邊角露出多少黑區列為真機驗收項（見 docs/handoff/08_目前待辦與風險.md）。
 */
export function clampPan(x, y) {
  return {
    x: clampN(Number.isFinite(x) ? x : WORLD_BOUNDS.centerX, WORLD_BOUNDS.minX, WORLD_BOUNDS.maxX),
    y: clampN(Number.isFinite(y) ? y : WORLD_BOUNDS.centerY, WORLD_BOUNDS.minY, WORLD_BOUNDS.maxY),
  };
}

export function clampZoom(z) {
  return clampN(Number.isFinite(z) ? z : ZOOM_MIN, ZOOM_MIN, ZOOM_MAX);
}

const CENTER = { x: WORLD_BOUNDS.centerX, y: WORLD_BOUNDS.centerY };

export const useCameraStore = create((set) => ({
  mode: "director",
  heroId: null,          // heroFocus 目標（引擎 id：b1–b5 / r1–r5）
  focusUntil: 0,         // heroFocus 到期（performance.now() 毫秒）

  // ── S29B6：pan/zoom 單一狀態源 ──────────────────────────────────────────
  pan: { ...CENTER },    // 鏡頭看向的**邏輯世界座標**（clamp 於 WORLD_BOUNDS）
  zoom: 3.4,             // 正交 zoom（clamp 於 ZOOM_MIN..ZOOM_MAX）

  setMode: (mode) => set((s) => (s.mode === mode ? s : { mode, ...(mode !== "heroFocus" ? { heroId: null } : {}) })),
  focusHero: (heroId, ms = HERO_FOCUS_MS) =>
    set({ mode: "heroFocus", heroId, focusUntil: performance.now() + ms }),
  backToDirector: () => set({ mode: "director", heroId: null, focusUntil: 0 }),

  /** 導播 / heroFocus 的自動目標：只寫目標值，**不改 mode**（不會把自己踢進 free）。 */
  setAutoTarget: ({ x, y, zoom }) => set((s) => {
    const p = clampPan(x ?? s.pan.x, y ?? s.pan.y);
    const z = clampZoom(zoom ?? s.zoom);
    if (p.x === s.pan.x && p.y === s.pan.y && z === s.zoom) return s;   // 同值免通知
    return { pan: p, zoom: z };
  }),

  /** 使用者手動平移（拖曳）⇒ **一律進 free mode**（任務單 A-4）；pan 夾於 WORLD_BOUNDS。 */
  userPanTo: (x, y) => set({ mode: "free", heroId: null, focusUntil: 0, pan: clampPan(x, y) }),

  /** 使用者手動縮放（捏合 / 滾輪）⇒ **一律進 free mode**（任務單 A-4）。 */
  userZoomTo: (z) => set({ mode: "free", heroId: null, focusUntil: 0, zoom: clampZoom(z) }),

  /** 開局 / 回導播時的視野重置（pan 回世界中心；zoom 由控制器依視窗推導）。 */
  resetView: () => set({ pan: { ...CENTER } }),
}));
