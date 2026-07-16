// ============================================================================
//  battle/ui/battleLayout.js — 對戰畫面版面常數（Sprint29B6）
//
//  身分：對戰 HUD 疊層的**單一版面來源**。純常數，不 import 引擎 / Store /
//    React ⇒ 不可能影響模擬結果，也可被 Node verifier 直接讀取斷言。
//
//  ── 為什麼需要這張表 ─────────────────────────────────────────────────────
//  S29B6 之前，各浮層各自寫死 top / z-index：
//    · `BattleHUD`      top 6，內容高約 106–122px（比分 / 時間 / 塔點陣 /
//                       **藍紅勝率條** / MVP 列），zIndex 8
//    · `BattleTimeline` top **96**、zIndex 8，且在 DOM 中較晚 ⇒ 疊在 HUD 上
//                       ⇒ Ray 手機實測「左上角戰報擋到藍紅條與上方資訊列」
//    · GameView 的 ⏩ / ⚙ / 倍率 / 畫質鈕 top **92**、zIndex 10–12
//                       ⇒ 同樣壓在 HUD 的塔點陣與勝率條上
//  現在所有頂部浮層一律從 `SAFE_TOP` 開始 ⇒ 結構上不可能再蓋到 score header。
//
//  ── HUD_H 怎麼來的 ──────────────────────────────────────────────────────
//  `BattleHUD` 是內容驅動高度，逐列上界（padding 6+7、列1 13、戰術列 3+12、
//  列2 3+34、列3 4+16、勝率條 5+5、MVP 列 2+11）合計約 121px；取 126 留餘裕。
//  ⚠ 改 `BattleHUD` 版型（加列 / 放大字級）時必須同步這個值，否則戰報會再次爬回去。
// ============================================================================

/** BattleHUD（score header）的頂距與高度上界。 */
export const HUD_TOP = 6;
export const HUD_H = 126;
/** HUD / 底部面板的共用寬度上界（手機 96%、桌機 560px）。 */
export const PANEL_MAX_W = 560;

/**
 * 任何頂部浮層（戰報 toast / 控制鈕 / 倍率 / 畫質）的**頂部下限**。
 * 低於這個值就會蓋到 score header ⇒ verifier 斷言 `SAFE_TOP >= HUD_TOP + HUD_H`。
 */
export const SAFE_TOP = HUD_TOP + HUD_H + 6;   // = 138

/** 戰報（BattleTimeline）寬度：手機 62vw 上限 226px ⇒ 320/360/390/430 皆不溢出。 */
export const FEED_MAX_W = 226;
export const FEED_LEFT = 10;
/**
 * 戰報右側必須讓出的寬度：右上控制鈕欄（⏩ 快速完成 / ⚙ / 倍率 / 畫質）也從
 * SAFE_TOP 開始，兩者同高。320px 下 62vw = 198px，不留這段就會和控制鈕相撞。
 */
export const FEED_RIGHT_RESERVE = 132;

/**
 * z-index 統一表（29B2 起列為待辦，29B6 落地）。
 * 數值沿用各元件既有值 ⇒ 這次只是把它們收斂到一處，沒有改變既有疊放次序。
 */
export const Z = Object.freeze({
  canvas: 0,      // 3D 戰場
  hud: 8,         // BattleHUD（score header）
  feed: 8,        // BattleTimeline（戰報）
  minimap: 9,     // 小地圖 / 掛載信標
  controls: 10,   // 控制鈕（回到導播 / 倍率 / 畫質 / ⚙）
  strip: 11,      // 十人面板 / bottom sheet
  overlay: 12,    // 記分板 / debug 快速完成
  end: 20,        // 終局畫面
  replay: 60,     // 重播全螢幕
});
