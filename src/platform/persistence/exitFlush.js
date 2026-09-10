// ============================================================================
//  platform/persistence/exitFlush.js — 離開頁面前的保底存檔（Backend B1C）
//
//  ── 這一層要解決什麼 ──────────────────────────────────────────────────────
//  B1A 風險 R2：存檔時機隱含在每個動作裡，84 個呼叫端各自負責，
//  沒有任何一層保底。漏掉一次 `save()` 的代價是玩家關掉分頁之後才發現進度沒了。
//  B1B 只修掉 `assignTraining` 那一格；本檔補上那一層網。
//
//  ── ⚠ 為什麼**不用** `beforeunload` 當唯一機制 ──────────────────────────
//  `beforeunload` 在行動裝置上**經常不會觸發**：iOS Safari 把分頁切到背景、
//  使用者從多工列滑掉、系統回收記憶體——這些路徑都不會走 `beforeunload`。
//  ⇒ 主力是這兩個：
//      · `visibilitychange` → `document.visibilityState === "hidden"`
//        （切分頁、鎖螢幕、切到別的 app —— 行動裝置上**唯一可靠**的訊號）
//      · `pagehide`
//        （真的要離開，含 bfcache 進入；比 `beforeunload` 可靠）
//  ⚠ 兩個都掛：`visibilitychange` 先到，`pagehide` 是最後一道。
//    重複觸發不會造成重複寫入——因為 flush **看 dirty**（見下）。
//
//  ── ⚠ 存檔風暴 ───────────────────────────────────────────────────────────
//  切分頁在正常使用中很頻繁。每次都無條件重寫整份存檔（挑戰滿載時約 120KB）
//  是白費工，而且會讓「存檔失敗」這件事更容易發生。
//  ⇒ flush 一律走 `flushIfDirty()`：沒有未存變更就**一個 byte 都不寫**。
//
//  ⚠ 本檔不 import store，flush 由呼叫端注入 ⇒ 可以在 Node 裡逐值測。
// ============================================================================

export const EXIT_FLUSH_VERSION = "ExitFlush.v1";

/** 我們掛的事件。⚠ 順序有意義：`visibilitychange` 是行動裝置上的主力。 */
export const EXIT_FLUSH_EVENTS = Object.freeze(["visibilitychange", "pagehide"]);

/**
 * 掛上保底 flush。
 *
 * @param {object}   p
 * @param {Function} p.flush     `() => { saved, ok, reason }`（通常是 `flushIfDirty`）
 * @param {object}   [p.target]  掛事件的對象（預設 `window`；測試可注入假的）
 * @param {object}   [p.doc]     讀 `visibilityState` 的對象（預設 `document`）
 * @returns {{ dispose: Function, stats: object }} `dispose()` 會把事件拆乾淨
 *
 * ⚠ **可重入**：重複安裝會先把上一次拆掉，不會疊出兩份監聽。
 */
export function installExitFlush({ flush, target = null, doc = null } = {}) {
  if (typeof flush !== "function") throw new Error("installExitFlush 需要一個 flush()");
  const win = target ?? (typeof window !== "undefined" ? window : null);
  const document_ = doc ?? (typeof document !== "undefined" ? document : null);
  //  ⚠ 沒有 window（Node / SSR）⇒ 回一個什麼都不做的 handle，**不丟例外**。
  //    verifier 與 build 都會 import 到這裡。
  if (!win || typeof win.addEventListener !== "function") {
    return { dispose: () => {}, stats: { installed: false, fired: 0, saved: 0, skipped: 0, errors: 0 } };
  }

  const stats = { installed: true, fired: 0, saved: 0, skipped: 0, errors: 0, lastReason: null };

  const run = (why) => {
    stats.fired += 1;
    try {
      const r = flush() ?? {};
      stats.lastReason = `${why}:${r.reason ?? "?"}`;
      if (r.saved) stats.saved += 1; else stats.skipped += 1;
      //  ⚠ flush 回 `ok === false` 代表存檔失敗。這裡**不重試**：
      //    頁面正在離開，重試只會拖住卸載，而失敗已經被記進 `saveState`，
      //    下次載入時玩家看得到。
    } catch (e) {
      //  ⚠ 這裡吞例外是**刻意的**，但不是靜默：計數會加，而且離開頁面的
      //    路徑上丟例外會讓瀏覽器把整個卸載流程中斷。
      stats.errors += 1;
      stats.lastReason = `${why}:threw`;
    }
  };

  const onVisibility = () => {
    //  ⚠ 只在**變成隱藏**時存。變成可見時存等於每次切回來都白寫一次。
    if (!document_ || document_.visibilityState === "hidden") run("visibilitychange");
  };
  const onPageHide = () => run("pagehide");

  win.addEventListener("visibilitychange", onVisibility);
  win.addEventListener("pagehide", onPageHide);

  return {
    stats,
    dispose() {
      win.removeEventListener("visibilitychange", onVisibility);
      win.removeEventListener("pagehide", onPageHide);
      stats.installed = false;
    },
  };
}

//  ⚠ 模組層只留一個 handle，避免 React StrictMode 的雙重掛載疊出兩份監聽。
let current = null;

/** App 啟動時呼叫一次。重複呼叫會先拆掉上一次。 */
export function ensureExitFlush(flush) {
  if (current) current.dispose();
  current = installExitFlush({ flush });
  return current;
}

/** 診斷用：目前這一個 handle（沒有安裝就是 null）。 */
export const exitFlushHandle = () => current;
