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

/** 同步區段量測：回傳 fn 的結果，例外照常往外丟。 */
export function csLoadTime(name, fn, detail) {
  const end = csLoadSpan(name);
  try {
    return fn();
  } finally {
    end(detail);
  }
}
