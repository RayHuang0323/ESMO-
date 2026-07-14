// ============================================================================
//  battle/quality.js — 畫質分級（Sprint29 §二）
//
//  ⚠ 紅線：**畫質設定絕對不得改變模擬結果**（S29 §二）。
//     本檔只影響「怎麼畫」（dpr / 後製 / 陰影 / 粒子上限 / 光源數），
//     完全不碰 LogicEngine、不碰 snapshot、不碰 rng。純呈現層設定。
//
//  ⚠ 不是「把特效全關掉來掩蓋效能問題」（S29 §11 明令禁止）——
//     low 檔仍保留 Bloom（MOBA 的水晶/技能發光是識別度來源），只是關掉最貴的
//     SSAO + normalPass、把 dpr 鎖 1、關陰影。真正的效能修復在 MobaView3D
//     的根因層（共享材質 / FX 物件池 / 光源數 / 移除每幀重建），見該檔註解。
// ============================================================================

/** 三檔畫質。dpr = device pixel ratio 上限（手機 retina 是 3，不鎖會直接 3× 像素量）。 */
export const QUALITY_PRESETS = {
  low: {
    id: "low", zh: "低（手機/省電）",
    dpr: 1,
    shadows: false, shadowMapSize: 0,
    ssao: false, bloom: true, vignette: false,
    multisampling: 0,
    maxFx: 18,               // fx 物件池上限
    grassBlades: 0.35,       // 草葉數量比例
    towerLights: false,      // 每座塔的 PointLight（22 盞 → 關）
    targetFps: 30,
  },
  medium: {
    id: "medium", zh: "中",
    dpr: 1.5,
    shadows: true, shadowMapSize: 1024,
    ssao: false, bloom: true, vignette: true,
    multisampling: 0,
    maxFx: 34,
    grassBlades: 0.7,
    towerLights: false,
    targetFps: 60,
  },
  high: {
    id: "high", zh: "高（桌機）",
    dpr: 2,
    shadows: true, shadowMapSize: 2048,
    ssao: true, bloom: true, vignette: true,
    multisampling: 4,
    maxFx: 60,
    grassBlades: 1,
    towerLights: true,       // 只有 high 才開；且已改為只有主堡有燈（見 MobaView3D）
    targetFps: 60,
  },
};

export const QUALITY_IDS = ["low", "medium", "high"];
const KEY = "esmo.quality.v1";

/**
 * 裝置自動判斷（保守：寧可判低，也不要讓手機卡）。
 *  · 粗略指標：觸控裝置 / 硬體執行緒數 / 裝置記憶體 / 螢幕寬度。
 *  · SSR / 無 window ⇒ medium（安全預設）。
 */
export function detectQuality() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return "medium";
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = navigator.deviceMemory ?? 4;            // Chrome 專有；缺 ⇒ 4
  const w = window.innerWidth ?? 1280;
  const coarse = typeof window.matchMedia === "function"
    && window.matchMedia("(pointer: coarse)").matches;  // 觸控為主 ⇒ 多半是手機/平板

  if (coarse && (w < 500 || cores <= 4 || mem <= 4)) return "low";
  if (coarse || w < 900 || cores <= 4 || mem <= 4) return "medium";
  return "high";
}

/** 玩家手動選擇優先於自動判斷；存 localStorage（不進 profileStore：這是裝置設定，不是存檔）。 */
export function loadQuality() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && QUALITY_IDS.includes(saved)) return saved;
  } catch { /* localStorage 不可用 ⇒ 走自動判斷 */ }
  return detectQuality();
}

export function saveQuality(id) {
  if (!QUALITY_IDS.includes(id)) return;
  try { localStorage.setItem(KEY, id); } catch { /* 忽略：不可用就只在本次 session 生效 */ }
}

export const presetFor = (id) => QUALITY_PRESETS[id] ?? QUALITY_PRESETS.medium;
