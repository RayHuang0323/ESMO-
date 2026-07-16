// ============================================================================
//  ui/debugMode.js — 測試模式判斷（Sprint29B3；S29B4 強化）
//
//  單機測試階段的 Debug 控制（如「快速完成比賽」）只在測試模式顯示；
//  正式多人模式預設**不顯示**。判斷條件（任一成立即測試模式）：
//    1. Vite dev server（import.meta.env.DEV）
//    2. URL 帶 debug=1 —— **同時看 search 與 hash**（S29B4 根因修）
//    3. localStorage esmo_debug = "1"（持續開啟）
//
//  ⚠ S29B4 根因：GitHub Pages 上 URL 可能是 `.../ESMO-/?debug=1`（search）
//     或帶 hash 的 `.../ESMO-/#/x?debug=1`（此時 location.search 為空字串！）。
//     舊版只讀 location.search ⇒ 帶 hash 的網址讀不到 debug ⇒ 手機看不到按鈕。
//     修法：search 與 hash 兩處都解析；一旦由 URL 認定 debug，**寫入 localStorage**
//     使其在後續 in-memory 導航（本專案用 useState 換畫面，URL 不變）中持續有效。
//     debug=0 可明確關閉並清除持久化旗標。
//
//  純呈現層 gate：不碰引擎、不碰 Store、不影響模擬與結算。
// ============================================================================

const LS_KEY = "esmo_debug";

/** 從一段字串（search 或 hash 尾段）解析 debug 參數；回傳 "1" / "0" / null。
 *  導出供 verifier 單元測試（?debug=1 / #/x?debug=1 / ?debug=0 都要正確）。 */
export function parseDebug(qs) {
  if (!qs) return null;
  // 取 hash 內可能的 query 段（`#/route?debug=1` → `debug=1`）
  const q = qs.includes("?") ? qs.slice(qs.indexOf("?") + 1) : qs.replace(/^[#?]/, "");
  try {
    const v = new URLSearchParams(q).get("debug");
    return v == null ? null : v;
  } catch { return null; }
}

export function isDebugMode() {
  if (typeof window === "undefined") return false;
  try {
    if (import.meta.env?.DEV) return true;
    // URL：search 與 hash 都看（Pages hash route 會把 query 藏在 hash 裡）
    const fromUrl = parseDebug(window.location.search) ?? parseDebug(window.location.hash);
    if (fromUrl === "1") {
      try { window.localStorage?.setItem(LS_KEY, "1"); } catch { /* 隱私模式：略過持久化 */ }
      return true;
    }
    if (fromUrl === "0") {
      try { window.localStorage?.removeItem(LS_KEY); } catch { /* ignore */ }
      return false;
    }
    if (window.localStorage?.getItem(LS_KEY) === "1") return true;
  } catch { /* 隱私模式等取用失敗 ⇒ 視為非測試模式 */ }
  return false;
}
