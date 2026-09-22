// ============================================================================
//  battle/moba/skills/skillReadability.js — 具名技能在總覽鏡頭下的可讀性（Battle UX hotfix）
//
//  問題（實測，正式流程）：Hero Skills v1 的 VFX **有在畫**（namedDrawnFrames = namedFrames），
//  但預設總覽鏡頭（正交 zoom 3.4／手機 3.05）下英雄只有約 20px，技能 shader 的細環
//  只剩 1–2px 寬、透明度又低 ⇒ 玩家看不出來。VFX 是在拉近的 Workshop 視角下調的。
//
//  修法（純呈現、可逆）：只對**具名技能**，依正交鏡頭縮放放大半徑、提高不透明度。
//    · 鏡頭拉近到 `referenceZoom` 以上 ⇒ 倍率 1（回到原作者的樣子）
//    · 透視鏡頭（沒有可比的 zoom 語意）⇒ 倍率 1
//  ⚠ 不改 LogicEngine、不改 snapshot、不改 choreography 編排；只縮放傳進去的 radius。
// ============================================================================

export const SKILL_READABILITY = Object.freeze({
  /** 在這個正交 zoom（含）以上視為「拉近」，不放大。 */
  referenceZoom: 6,
  /** 最多放大幾倍（避免總覽時蓋掉整條兵線）。 */
  maxBoost: 2,
  /** 具名技能的不透明度增益（上限 1）。 */
  alphaGain: 1.35,
});

/**
 * 正交鏡頭 zoom → 具名技能半徑倍率。
 * @param {{isOrthographicCamera?:boolean, zoom?:number}|null} camera
 */
export function skillReadabilityBoost(camera) {
  if (!camera || camera.isOrthographicCamera !== true) return 1;
  const zoom = Number(camera.zoom);
  if (!Number.isFinite(zoom) || zoom <= 0) return 1;
  return Math.min(SKILL_READABILITY.maxBoost, Math.max(1, SKILL_READABILITY.referenceZoom / zoom));
}
