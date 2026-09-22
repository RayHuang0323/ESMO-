// ============================================================================
//  battle/moba/skills/skillReadability.js — 具名技能的可讀性（Battle UX hotfix → Combat Quality v1）
//
//  問題（實測，正式流程）：Hero Skills v1 的 VFX **有在畫**，但預設總覽鏡頭
//  （正交 zoom 3.4／手機 3.05）下英雄只有約 20px，技能 shader 的細環只剩 1–2px；
//  而且技能的呈現壽命是**遊戲時間**，2×／4× 時真實觀看時間跟著縮成 1/2、1/4。
//
//  Combat Quality v1 的做法（取代 hotfix 的「依 zoom 等比例放大」）：
//    · **螢幕空間最小尺寸**：半徑至少 `minRadiusPx[slot]` 個像素（R 最大）
//    · **螢幕空間上限**：半徑最多佔畫面高度 `maxScreenFrac` ⇒ 拉近時不會巨大遮畫面
//    · **真實時間最小壽命**：見 `skillMinVisualLife(rate)`（由 adapter 使用）
//  ⚠ 純呈現：不改 LogicEngine、不改 snapshot、不改 choreography 編排；只縮放傳進去的 radius。
// ============================================================================

export const SKILL_READABILITY = Object.freeze({
  /** 各欄位的最小螢幕半徑（像素）。Q 最小、R 最大 ⇒ 大招一眼可辨。 */
  minRadiusPx: Object.freeze({ Q: 22, W: 24, E: 24, R: 36 }),
  /** 半徑上限：畫面高度的比例（近景時防止遮畫面）。 */
  maxScreenFrac: 0.16,
  /** 具名技能的不透明度增益（上限 1）。 */
  alphaGain: 1.35,
  /** 具名技能至少在畫面上停留幾個**真實**秒。 */
  minRealSec: 0.85,
  /** 呈現壽命的上限（遊戲秒）：必須 < 引擎為技能保留的 4.2 秒，否則事件會先從 snapshot 消失。 */
  maxVisualLife: 4.0,
  /** 呈現壽命的下限（遊戲秒）：1× 時也至少這麼久（Battle UX hotfix 的值）。 */
  minVisualLife: 1.4,
});

/** 技能 id 的欄位（`heroId:Q` → `Q`）；認不得 ⇒ `Q`（最保守的尺寸）。 */
export const skillSlotOf = (skillId) => {
  const s = String(skillId ?? "").slice(-1);
  return "QWER".includes(s) && s ? s : "Q";
};

/**
 * 具名技能的呈現壽命下限（遊戲秒）：`max(minVisualLife, minRealSec × 播放倍率)`，上限 `maxVisualLife`。
 * 1× ⇒ 1.4、2× ⇒ 1.7、4× ⇒ 3.4。
 */
export function skillMinVisualLife(rate = 1) {
  const r = Number.isFinite(Number(rate)) && Number(rate) > 0 ? Number(rate) : 1;
  const { minRealSec, minVisualLife, maxVisualLife } = SKILL_READABILITY;
  return Math.min(maxVisualLife, Math.max(minVisualLife, minRealSec * r));
}

/**
 * 正交鏡頭下「一個像素對應幾個世界單位」。透視鏡頭或資料不全 ⇒ null（不調整）。
 * @param {{isOrthographicCamera?:boolean, zoom?:number, top?:number, bottom?:number}|null} camera
 * @param {number} viewportHeightPx
 */
export function worldPerPixel(camera, viewportHeightPx) {
  if (!camera || camera.isOrthographicCamera !== true) return null;
  const zoom = Number(camera.zoom), h = Number(viewportHeightPx);
  const span = Number(camera.top) - Number(camera.bottom);
  if (!(zoom > 0) || !(h > 0) || !(span > 0)) return null;
  return span / zoom / h;
}

/**
 * 具名技能的畫面半徑（世界單位）：作者設定的半徑，夾在「最小像素」與「畫面比例上限」之間。
 * 上限永遠不會小於作者原值（拉近時保持原作者尺寸，不縮小）。
 */
export function skillScreenRadius(authoredRadius, slot, camera, viewportHeightPx) {
  const r = Number(authoredRadius) > 0 ? Number(authoredRadius) : 1;
  const wpp = worldPerPixel(camera, viewportHeightPx);
  if (wpp == null) return r;
  const minR = (SKILL_READABILITY.minRadiusPx[slot] ?? SKILL_READABILITY.minRadiusPx.Q) * wpp;
  const maxR = Math.max(r, SKILL_READABILITY.maxScreenFrac * viewportHeightPx * wpp);
  return Math.min(maxR, Math.max(r, minR));
}

