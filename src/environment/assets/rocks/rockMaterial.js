// ============================================================================
//  environment/assets/rocks/rockMaterial.js — Rock Pack 共用材質（Milestone B）
//
//  依 ENVIRONMENT_KIT_SPEC：整個 Rock Pack 只用 1 個共用材質（mat_env_stone），
//  顏色差異靠「頂點色（石身↔苔）」＋「instance color（每實例亮度微調）」。零貼圖。
//  ⚠ 單例：全 8 件石頭共用同一個 material 實例，避免 program/狀態爆量。
// ============================================================================
import * as THREE from "three";

// Visual Bible §3：Stone Warm / Stone Cool / Moss
export const STONE_WARM = new THREE.Color(0x706e69);
export const STONE_COOL = new THREE.Color(0x484c54);
export const MOSS = new THREE.Color(0x38571e);

let _mat = null;
/** 取得共用石材質（單例）。flatShading＋頂點色＋介電高粗糙。 */
export function rockMaterial() {
  if (_mat) return _mat;
  _mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.95,
    metalness: 0.0,
  });
  _mat.name = "mat_env_stone";
  return _mat;
}
