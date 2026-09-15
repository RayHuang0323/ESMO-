// ============================================================================
//  battle/ui/items/itemsTheme.js — 裝備 UI 的視覺 token（Item System M3a）
//
//  基底一律沿用主幹 `GC`（src/ui/theme.js，唯一共用色票）。
//  本檔的**專用色**只有兩組，理由：
//   · 階級外框（T1 鐵／T2 鋼／T3 金／鞋 青／起始裝 銅）——玩家要在 20px 的格子裡一眼分出
//     「完成裝還是組件」，GC 沒有金屬質感的明暗三階。T3 的主色仍是 GC.gold。
//   · 流派底色（A–H 八色，18–42% 透明疊在插槽底）——同一件完成裝的定位辨識，
//     只做底色暈染、不當文字色，所以不影響文字對比。
//  ⚠ 元件檔不寫任何十六進位色碼（check_moba_items_m3 G3），要新顏色先加在這裡並寫理由。
//  規格：docs/design/MOBA_裝備UI_M3規格_v1.md §5。
// ============================================================================
import { GC, FONT } from "../../../ui/theme.js";

export const GOLD = GC.gold;
export const GOLD_LIGHT = "#fde68a";
export const GOLD_DARK = "#8a5a06";
export const GOLD_TEXT = "#fcd34d";

/** #rrggbb → rgba()（元件用它做透明疊色，不必自己寫色碼）。 */
export function alpha(color, a) {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export const GOLD_WASH = alpha(GC.gold, 0.1);

export const TEXT = Object.freeze({
  primary: "#f4f4f5",
  secondary: "rgba(255,255,255,0.66)",
  faint: "rgba(255,255,255,0.42)",
});

export const SURFACE = Object.freeze({
  base: GC.bg,
  panel: "#0e1117",
  panelTop: "#151a24",
  raised: GC.card2,
  socket: "#07080c",
  socketEmpty: "rgba(255,255,255,0.045)",
  line: GC.line,
  line2: "rgba(255,255,255,0.16)",
  track: "rgba(255,255,255,0.09)",
});

/** 階級外框：light → rim → dark 三階漸層。 */
export const TIER_RIM = Object.freeze({
  T1: Object.freeze({ rim: "#7d8794", light: "#c2c9d2", dark: "#343a42" }),
  T2: Object.freeze({ rim: "#a9c4e4", light: "#e4eefa", dark: "#40526a" }),
  T3: Object.freeze({ rim: GC.gold, light: GOLD_LIGHT, dark: GOLD_DARK }),
  BOOTS: Object.freeze({ rim: "#5eead4", light: "#ccfbf1", dark: "#1d5a53" }),
  STARTER: Object.freeze({ rim: "#c98a5a", light: "#f0c7a4", dark: "#5a371d" }),
});

export const TIER_LABEL = Object.freeze({ T1: "基礎組件", T2: "進階組件", T3: "完成裝", BOOTS: "鞋子", STARTER: "起始裝" });

/** 流派底色（只做插槽底暈染）。組件沒有流派 ⇒ COMPONENT_TINT。 */
export const FAMILY_TINT = Object.freeze({
  A: "#f43f5e", B: "#f59e0b", C: "#a78bfa", D: "#f97316",
  E: "#60a5fa", F: "#22d3ee", G: "#34d399", H: "#f0abfc",
});
export const COMPONENT_TINT = "#94a3b8";

export const SIDE_TINT = Object.freeze({ blue: GC.blueL, red: GC.redL });

/** 教練筆記：沿用 GC.purp（主幹已用在「核心／戰術」語意）。 */
export const COACH = GC.purp;
export const COACH_TEXT = "#d4c8fd";

/**
 * M3c：教練分析分類色（經濟＝金、敵情＝紅、調整＝紫、局勢＝灰）與狀態色（不利＝紅、有利＝綠）。
 * 全部沿用 GC，沒有新顏色。
 */
export const TONE = Object.freeze({
  economy: GC.gold, threat: GC.redL, adjust: GC.purp, info: COMPONENT_TINT,
  bad: GC.redL, good: GC.green,
});

export const SLOT_SIZE = Object.freeze({ xs: 20, sm: 30, md: 40, lg: 48 });
export const SLOT_GAP = Object.freeze({ xs: 3, sm: 4, md: 6, lg: 6 });

export const ITEM_FONT = FONT;
export const NUM = Object.freeze({ fontVariantNumeric: "tabular-nums", fontWeight: 800 });

/** 插槽：八邊切角（pct = 切角佔邊長百分比）。 */
export const chamfer = (pct = 22) =>
  `polygon(${pct}% 0, ${100 - pct}% 0, 100% ${pct}%, 100% ${100 - pct}%, ${100 - pct}% 100%, ${pct}% 100%, 0 ${100 - pct}%, 0 ${pct}%)`;

/** 卡片／面板：只切右上角（層級低於插槽的形狀語言）。 */
export const cornerCut = (px = 14) => `polygon(0 0, calc(100% - ${px}px) 0, 100% ${px}px, 100% 100%, 0 100%)`;
