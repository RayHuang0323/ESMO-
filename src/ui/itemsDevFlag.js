// ============================================================================
//  ui/itemsDevFlag.js — 裝備系統（itemsV1）的 DEV 開啟參數（Item System M3a）
//
//  ⚠ 這支**只**負責解析網址參數；真正的閘門在 `useLocalServer.start()`：
//      featureEnabled("itemsV1") || (import.meta.env.DEV && itemsDevRequested())
//    正式 build 時 `import.meta.env.DEV` 被代換成常數 false ⇒ 後半段被折疊掉，
//    本檔與 `itemsDev` 字串都不會進正式產物（check_moba_items_m3 G1 實際 build 掃描）。
//    所以正式站無論帶什麼 query、存什麼 localStorage，都開不了裝備。
//  ⚠ 刻意不讀 localStorage：DEV 開啟必須每次明確寫在網址上，避免「上次開過忘了關」。
// ============================================================================

export const ITEMS_DEV_QUERY = "itemsDev";

/** 網址帶 `?itemsDev=1` 才回 true（其他值、缺參數、解析失敗一律 false）。 */
export function itemsDevRequested(search = typeof window !== "undefined" ? window.location.search : "") {
  try {
    return new URLSearchParams(search).get(ITEMS_DEV_QUERY) === "1";
  } catch {
    return false;
  }
}
