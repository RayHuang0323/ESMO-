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

/**
 * 正交 zoom 上下限（與 fitZoomFor 的 clamp 同區間；避免縮到看不見或貼臉）。
 *
 * ⚠ Milestone G：ZOOM_MIN 從 1.6 放寬到 1.06。
 *   `zoom` 與相機距離的關係是 `distance = distDefault(175) × zoomDefault(3.4) / zoom`，
 *   所以 1.6 ⇒ 最遠只能拉到 372。但 390×844 直式手機要把整張地圖收進畫面需要
 *   **560**（= 相機本來就設計好的 `CAM.distMax`；`far:1000` 也是照這個值算的）
 *   ⇒ 舊下限讓手機**物理上不可能綜觀全圖**（桌機 1600×1000 需要 377，同樣差一點）。
 *   1.06 = 595 / 560，剛好對到相機既有的最遠距離：**放寬的是 zoom 下限，
 *   不是相機的設計包絡**，也沒有動 pitch / fov / near / far。
 *   ZOOM_MAX 維持 9（近距離視角不變）。
 */
export const ZOOM_MIN = 1.06;
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
  savedFreeView: null,   // 自動導播開啟前的自由視角；關閉時精確恢復

  // ── S29B6：pan/zoom 單一狀態源 ──────────────────────────────────────────
  pan: { ...CENTER },    // 鏡頭看向的**邏輯世界座標**（clamp 於 WORLD_BOUNDS）
  zoom: 3.4,             // 正交 zoom（clamp 於 ZOOM_MIN..ZOOM_MAX）

  setMode: (mode) => set((s) => (s.mode === mode ? s : { mode, ...(mode !== "heroFocus" ? { heroId: null } : {}) })),
  focusHero: (heroId, ms = HERO_FOCUS_MS) =>
    set({ mode: "heroFocus", heroId, focusUntil: performance.now() + ms }),
  backToDirector: () => set((s) => ({
    mode: "director", heroId: null, focusUntil: 0,
    savedFreeView: s.mode === "free" ? { pan: { ...s.pan }, zoom: s.zoom } : s.savedFreeView,
  })),
  disableDirector: () => set((s) => ({
    mode: "free", heroId: null, focusUntil: 0,
    pan: s.savedFreeView?.pan ? { ...s.savedFreeView.pan } : s.pan,
    zoom: s.savedFreeView?.zoom ?? s.zoom,
  })),
  toggleDirector: () => set((s) => {
    const auto = s.mode !== "free";
    if (auto) {
      return {
        mode: "free", heroId: null, focusUntil: 0,
        pan: s.savedFreeView?.pan ? { ...s.savedFreeView.pan } : s.pan,
        zoom: s.savedFreeView?.zoom ?? s.zoom,
      };
    }
    return {
      mode: "director", heroId: null, focusUntil: 0,
      savedFreeView: { pan: { ...s.pan }, zoom: s.zoom },
    };
  }),

  /** 導播 / heroFocus 的自動目標：只寫目標值，**不改 mode**（不會把自己踢進 free）。 */
  setAutoTarget: ({ x, y, zoom }) => set((s) => {
    const p = clampPan(x ?? s.pan.x, y ?? s.pan.y);
    const z = clampZoom(zoom ?? s.zoom);
    if (p.x === s.pan.x && p.y === s.pan.y && z === s.zoom) return s;   // 同值免通知
    return { pan: p, zoom: z };
  }),

  /** 使用者手動平移（拖曳）⇒ **一律進 free mode**（任務單 A-4）；pan 夾於 WORLD_BOUNDS。 */
  userPanTo: (x, y) => set(() => {
    const pan = clampPan(x, y);
    return { mode: "free", heroId: null, focusUntil: 0, pan, savedFreeView: { pan: { ...pan } } };
  }),

  /**
   * Milestone G：使用者手勢**同時**平移與縮放（雙指捏合帶平移）。
   * 與 userPanTo / userZoomTo 同語意（一律進 free），只是合併成一次 set()
   * ⇒ 一次手勢更新只通知一次訂閱者，不會在捏合時每幀觸發兩輪重繪。
   * 這仍是同一個 cameraStore，沒有第二套相機系統。
   */
  userViewTo: (x, y, z) => set((s) => {
    const pan = clampPan(x ?? s.pan.x, y ?? s.pan.y);
    const zoom = clampZoom(z ?? s.zoom);
    return {
      mode: "free", heroId: null, focusUntil: 0, pan, zoom,
      savedFreeView: { pan: { ...pan }, zoom },
    };
  }),

  /** 使用者手動縮放（捏合 / 滾輪）⇒ **一律進 free mode**（任務單 A-4）。 */
  userZoomTo: (z) => set((s) => {
    const zoom = clampZoom(z);
    return {
      mode: "free", heroId: null, focusUntil: 0, zoom,
      savedFreeView: { pan: { ...s.pan }, zoom },
    };
  }),

  /** 開局 / 回導播時的視野重置（pan 回世界中心；zoom 由控制器依視窗推導）。 */
  resetView: () => set({ pan: { ...CENTER }, savedFreeView: null }),
}));
