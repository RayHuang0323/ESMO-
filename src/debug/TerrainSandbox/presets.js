// ============================================================================
//  debug/TerrainSandbox/presets.js — Sandbox 專用畫質/效能 Preset（Sprint 34）
//
//  ⚠ 只給 TerrainSandbox 用，不影響正式遊戲的 battle/quality.js。
//  兩層概念：
//   · BENCH_LEVELS：Desktop Benchmark 用的四檔（low/medium/high/ultra），
//     low/medium/high 對齊 battle/quality.js 的參數，ultra 是壓力測試檔。
//   · PERF_PRESETS：Performance Preset（auto/desktop/mobile/mobileLow），
//     auto 用與 quality.detectQuality 相同的訊號做裝置判斷。
// ============================================================================

export const BENCH_LEVELS = {
  low: {
    id: "low", zh: "低",
    dpr: 1, shadows: false, shadowMapSize: 0,
    ssao: false, bloom: true, vignette: false, multisampling: 0,
  },
  medium: {
    id: "medium", zh: "中",
    dpr: 1.5, shadows: true, shadowMapSize: 1024,
    ssao: false, bloom: true, vignette: true, multisampling: 0,
  },
  high: {
    id: "high", zh: "高",
    dpr: 2, shadows: true, shadowMapSize: 2048,
    ssao: true, bloom: true, vignette: true, multisampling: 4,
  },
  ultra: {
    id: "ultra", zh: "極限（壓測）",
    dpr: Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 2 : 2, 3),
    shadows: true, shadowMapSize: 4096,
    ssao: true, bloom: true, vignette: true, multisampling: 8,
  },
};
export const BENCH_ORDER = ["low", "medium", "high", "ultra"];

// ---- Performance Preset（工作五） ------------------------------------------ //
export const PERF_PRESETS = {
  auto:      { id: "auto",      zh: "自動偵測", level: null },   // level 由 detect() 決定
  desktop:   { id: "desktop",   zh: "桌面",     level: "high" },
  mobile:    { id: "mobile",    zh: "手機",     level: "medium" },
  mobileLow: { id: "mobileLow", zh: "手機低階", level: "low" },
};
export const PERF_ORDER = ["auto", "desktop", "mobile", "mobileLow"];

/** 與 battle/quality.detectQuality 同訊號的保守裝置判斷（sandbox 本地版）。 */
export function detectLevel() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return "medium";
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = navigator.deviceMemory ?? 4;
  const w = window.innerWidth ?? 1280;
  const coarse = typeof window.matchMedia === "function"
    && window.matchMedia("(pointer: coarse)").matches;
  if (coarse && (w < 500 || cores <= 4 || mem <= 4)) return "low";
  if (coarse || w < 900 || cores <= 4 || mem <= 4) return "medium";
  return "high";
}

export function levelForPreset(presetId) {
  const p = PERF_PRESETS[presetId] ?? PERF_PRESETS.auto;
  return p.level ?? detectLevel();
}
