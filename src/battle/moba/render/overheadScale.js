// ============================================================================
//  battle/moba/render/overheadScale.js — 頭頂 UI／浮動數字的「畫面像素」尺度（純函式）
//
//  正交鏡頭下世界尺寸 × 每世界單位像素 = 螢幕像素。總覽鏡頭（zoom≈3.4）時，世界尺寸的
//  血條只有約 20×2.4 px、名牌約 4 px、數字約 6 px ⇒ 讀不出來（2026-10-05 smoke 截圖實測）。
//  這裡把它們放大到「畫面上至少 N px」，鏡頭拉近時回到世界尺寸（k = 1，不會大到遮角色）。
// ============================================================================

/** 每個世界單位在螢幕上是幾個 CSS 像素（R3F 正交鏡頭：視錐寬 = right − left）。 */
export function pixelsPerWorld(camera, size) {
  const span = (camera?.right ?? 0) - (camera?.left ?? 0);
  if (!(span > 0) || !(size?.width > 0)) return camera?.zoom ?? 1;
  return (camera.zoom * size.width) / span;
}

export const isCompactViewport = (size) => (size?.width ?? 1024) < 600;

/** 頭頂整組（血條＋名牌）放大倍率：血條在畫面上至少 48 px 寬（手機 40），最多放大 3.2 倍。 */
export const OVERHEAD = Object.freeze({ barPxDesktop: 48, barPxMobile: 40, maxScale: 3.2 });
export function overheadScaleOf(barWorldWidth, ppw, compact) {
  const target = compact ? OVERHEAD.barPxMobile : OVERHEAD.barPxDesktop;
  const k = target / Math.max(1e-6, barWorldWidth * ppw);
  return Math.min(OVERHEAD.maxScale, Math.max(1, k));
}

/**
 * 名牌（等級徽章＋英雄短名）的放大倍率：至少跟血條同倍率，且名牌在畫面上至少 15 px 高（手機 14），最多 5 倍。
 * ⚠ 2026-10-06 smoke 截圖：只跟血條等比放大時名牌仍只有 ~6 px（字讀不出）⇒ 名牌要有自己的下限。
 */
export const NAMEPLATE_PX = Object.freeze({ desktop: 15, mobile: 14, maxScale: 5 });
export function nameplateScaleOf(plateWorldHeight, ppw, compact, overheadK = 1) {
  const target = compact ? NAMEPLATE_PX.mobile : NAMEPLATE_PX.desktop;
  const k = target / Math.max(1e-6, plateWorldHeight * ppw);
  return Math.min(NAMEPLATE_PX.maxScale, Math.max(overheadK, k));
}

/** 浮動數字的畫面高度（px）。手機 ×0.9。 */
export const FLOAT_PX = Object.freeze({ damageHero: 17, damageMajor: 25, damageOther: 15, heal: 16, shield: 16, gold: 16 });
export function floatWorldHeight(kindKey, worldMin, ppw, compact) {
  const px = (FLOAT_PX[kindKey] ?? 16) * (compact ? 0.9 : 1);
  return Math.max(worldMin, px / Math.max(1e-6, ppw));
}
