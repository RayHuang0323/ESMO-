// ============================================================================
//  battle/moba/mobaMapPresentation.js — 戰鬥畫面呈現模式開關（Milestone H.1）
//
//  H.1 把「正式戰鬥的 3D 畫面」從一套變成兩套，但**引擎只有一個**：
//    legacy      src/MobaView3D.jsx        （既有正式畫面，一行未改）
//    runtime-v2  MobaRuntimeView3D.jsx     （新地圖 + Runtime Adapter）
//  兩者讀的都是 useGameStore 的同一份 prev/snapshot ⇒ 切換模式不會改變比賽結果，
//  也不會改變 replayBuffer 的 schema。
//
//  【怎麼選】優先序（前者勝出）：
//    ① URL：?mapPresentation=runtime-v2 | legacy   （截圖與現場除錯用）
//    ② localStorage：esmo.mobaMapPresentation      （玩家自己切過就記住）
//    ③ 建置旗標：VITE_MOBA_RUNTIME_MAP_V2=true     （部署預設）
//    ④ 內建預設：legacy                            （沒設定 = 行為完全不變）
//
//  ⚠ 這是**呈現層**開關。它不得影響 LogicEngine、不得寫進 snapshot，
//    也不得改變任何結算資料。
// ============================================================================

export const MAP_PRESENTATION = Object.freeze({ LEGACY: "legacy", RUNTIME_V2: "runtime-v2" });
export const MAP_PRESENTATION_IDS = Object.freeze([MAP_PRESENTATION.LEGACY, MAP_PRESENTATION.RUNTIME_V2]);

const KEY = "esmo.mobaMapPresentation";

const isValid = (v) => MAP_PRESENTATION_IDS.includes(v);

/** 建置旗標（Vite）。缺少 import.meta.env 時（Node 驗證腳本）安全退回 undefined。 */
function envFlag() {
  try {
    const env = import.meta.env;
    if (!env) return undefined;
    const v = env.VITE_MOBA_RUNTIME_MAP_V2;
    if (v === true || v === "true" || v === "1") return MAP_PRESENTATION.RUNTIME_V2;
    if (v === false || v === "false" || v === "0") return MAP_PRESENTATION.LEGACY;
  } catch { /* Node 環境沒有 import.meta.env */ }
  return undefined;
}

/** 目前生效的呈現模式。 */
export function loadMapPresentation() {
  if (typeof window !== "undefined") {
    try {
      const q = new URLSearchParams(window.location.search).get("mapPresentation");
      if (isValid(q)) return q;
      const ls = window.localStorage?.getItem(KEY);
      if (isValid(ls)) return ls;
    } catch { /* 隱私模式可能擋 localStorage */ }
  }
  return envFlag() ?? MAP_PRESENTATION.LEGACY;
}

/** 玩家切換後記住（只寫 localStorage，不碰任何戰鬥資料）。 */
export function saveMapPresentation(id) {
  if (!isValid(id)) return;
  try { window.localStorage?.setItem(KEY, id); } catch { /* 忽略 */ }
}

export const isRuntimeV2 = (id) => id === MAP_PRESENTATION.RUNTIME_V2;
