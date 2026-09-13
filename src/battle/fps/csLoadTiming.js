// ============================================================================
//  csLoadTiming.js — CS 進場耗時量測（CS Loading Performance Pass v2）
//
//  只回答一個問題：「從賽前到真正進入 Battle，時間花在哪一段？」
//  runtime 在各階段的邊界呼叫 `csLoadMark` / `csLoadSpan`，量測工具
//  （tools/browser_measure_cs_loading.mjs）讀 `window.__ESMO_CS_LOAD_TIMING__`。
//
//  ⚠ 只記**數字與字串**，絕不存物件參照。存了物件就等於把 lifecycle pass
//    修掉的「全域變數釘住整份場景」原封不動放回來。
//  ⚠ 環形上限：長時間掛著也不會無限長大。
//  ⚠ 不參與 simulation、不改任何結果；拿掉所有呼叫點行為完全相同。
// ============================================================================

const KEY = "__ESMO_CS_LOAD_TIMING__";
const MAX_ENTRIES = 600;

const now = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());

function store() {
  if (typeof window === "undefined") return null;
  if (!window[KEY]) window[KEY] = { version: 1, entries: [] };
  return window[KEY];
}

function plain(detail) {
  if (detail == null) return null;
  const out = {};
  for (const [k, v] of Object.entries(detail)) {
    if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") out[k] = v;
  }
  return out;
}

function push(entry) {
  const s = store();
  if (!s) return;
  s.entries.push(entry);
  if (s.entries.length > MAX_ENTRIES) s.entries.splice(0, s.entries.length - MAX_ENTRIES);
}

/** 單一時間點（例如「第一個戰鬥畫面 frame 已畫出」）。 */
export function csLoadMark(name, detail) {
  push({ name, at: now(), detail: plain(detail) });
}

/** 開一段區間；回傳結束函式。 */
export function csLoadSpan(name) {
  const start = now();
  return (detail) => {
    const end = now();
    push({ name, at: start, end, dur: end - start, detail: plain(detail) });
    return end - start;
  };
}

// ── CS Mobile Stability Pass：返回沿用快取的狀態（只有數字與字串）──────────
//  runtime 的 `lastMountSimulation` 是模組內變數，外面看不到它還在不在。
//  這裡只記「現在有沒有持有、持有哪一場、各事件發生幾次」，讓 verifier 驗
//  「離場保留 → 返回沿用 → 比賽完成釋放 → 換新場不殘留」。
//  ⚠ 不存 sim、key 或任何物件參照。
//  ⚠ Owner Review：這是**測試用途**（只有 verifier 讀），只在 DEV 或 test build
//    （`npm run build -- --mode testhooks`）生效。正式部署的 MODE 一定是 production ⇒
//    打包時條件被代換成常數 false，整段在正式 bundle 裡被移除：不建立全域、不多記 cache 事件；
//    快取本身的行為不受影響。
//  ⚠ 只能用 vite 內建、build 時必定代換的 DEV／MODE。自訂的 VITE_* 沒設時不會被代換成常數，
//    整段會留在正式 bundle 裡（實測：用 VITE_ESMO_TEST_HOOKS 寫，一般 build 仍含全域名稱）。
const SIM_CACHE_HOOK = import.meta.env?.DEV || import.meta.env?.MODE === "testhooks";
const SIM_CACHE_KEY = "__ESMO_CS_SIM_CACHE__";
const simCache = { held: false, mapKey: null, seed: null, frames: 0, stores: 0, reuses: 0, releasedOnComplete: 0, replaced: 0, lastEvent: null };

/** event：store／reuse／release-complete／replace。正式 build 為 no-op。 */
export function csSimCacheEvent(event, detail = {}) {
  if (!SIM_CACHE_HOOK) return;
  if (event === "store") {
    simCache.held = true; simCache.stores += 1;
    simCache.mapKey = detail.mapKey ?? null; simCache.seed = detail.seed ?? null; simCache.frames = Number(detail.frames) || 0;
  } else if (event === "reuse") {
    simCache.reuses += 1;
  } else if (event === "release-complete" || event === "replace") {
    if (event === "replace") simCache.replaced += 1; else simCache.releasedOnComplete += 1;
    simCache.held = false; simCache.mapKey = null; simCache.seed = null; simCache.frames = 0;
  }
  simCache.lastEvent = event;
  csLoadMark(`sim:cache-${event}`, detail);
  if (typeof window !== "undefined") window[SIM_CACHE_KEY] = { ...simCache };
}

export function readCsSimCacheStatus() {
  return { ...simCache };
}

/** 同步區段量測：回傳 fn 的結果，例外照常往外丟。 */
export function csLoadTime(name, fn, detail) {
  const end = csLoadSpan(name);
  try {
    return fn();
  } finally {
    end(detail);
  }
}
