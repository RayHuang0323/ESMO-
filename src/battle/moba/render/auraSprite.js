// ============================================================================
//  battle/moba/render/auraSprite.js — 角色柔光／光點的共用材質工廠
//
//  為什麼存在：Battle Condition UX 把英雄與野怪**腳下的環**（隊伍選取環、Buff 環、
//  Buff 地面符文、拉回環）全部拿掉，改成掛在角色本體上的光。英雄（MobaRuntimeHeroes）
//  與野怪（MobaRuntimeNeutrals）需要同一種光，工廠放這裡，兩邊不各做一套。
//
//  ⚠ 純呈現：不讀 snapshot、不讀 store、不影響任何戰鬥邏輯。
//  ⚠ 貼圖只建立一次（模組層快取），所有角色共用；顏色由材質的 `color` 決定。
// ============================================================================
import * as THREE from "three";

let AURA_TEXTURE = null;

/** 徑向漸層貼圖（中心不透明 → 邊緣全透明）。沒有 document（Node 驗證器）時回 null。 */
export function auraTexture() {
  if (AURA_TEXTURE) return AURA_TEXTURE;
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 128; canvas.height = 128;
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
  g.addColorStop(0, "rgba(255,255,255,0.95)");
  g.addColorStop(0.45, "rgba(255,255,255,0.35)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  AURA_TEXTURE = new THREE.CanvasTexture(canvas);
  return AURA_TEXTURE;
}

/**
 * 柔光材質：Additive ＋ 不寫深度 ⇒ 疊在角色身上像光，而不是貼在地上的圖示。
 * @param {number} color 十六進位顏色
 * @param {number} opacity 起始不透明度（呼叫端每幀可再調）
 */
export function makeAuraMaterial(color, opacity = 0.34) {
  return new THREE.MeshBasicMaterial({
    map: auraTexture(), color, transparent: true, opacity,
    depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    toneMapped: false,
  });
}

/** 環繞光點材質（小、亮、不受場景光）。 */
export function makeMoteMaterial(color) {
  return new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.92, toneMapped: false, depthWrite: false,
  });
}
