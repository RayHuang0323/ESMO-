// ============================================================================
//  ui/debugMode.js — 測試模式判斷（Sprint29B3）
//
//  單機測試階段的 Debug 控制（如「快速完成比賽」）只在測試模式顯示；
//  正式多人模式預設**不顯示**。判斷條件（任一成立即測試模式）：
//    1. Vite dev server（import.meta.env.DEV）
//    2. URL 帶 ?debug=1（部署到 Pages 後 Ray 實機測試用）
//    3. localStorage esmo_debug = "1"（持續開啟）
//  純呈現層 gate：不碰引擎、不碰 Store、不影響模擬與結算。
// ============================================================================

export function isDebugMode() {
  if (typeof window === "undefined") return false;
  try {
    if (import.meta.env?.DEV) return true;
    if (new URLSearchParams(window.location.search).get("debug") === "1") return true;
    if (window.localStorage?.getItem("esmo_debug") === "1") return true;
  } catch { /* 隱私模式等取用失敗 ⇒ 視為非測試模式 */ }
  return false;
}
