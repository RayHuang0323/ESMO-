// ============================================================================
//  environment/assets/rocks/rockGeometry.js — 程序化石頭幾何（Milestone B）
//
//  依 ROCK_KIT_DESIGN + STYLE_LANGUAGE(Cliff Language) + ENVIRONMENT_KIT_SPEC。
//  · 決定性：用 seededRandom（reuse），不使用 Math.random()。
//  · 建立一次後重用（index.js 以模組層單例快取）；不每幀、不每 instance 生成。
//  · 每件提供 LOD0/LOD1 兩個 BufferGeometry；pivot 底部中心、+Y 上；頂點色（石身↔苔）。
//  · 輪廓刻意不同（不同 base/比例/位移/分層），非單純縮放。
// ============================================================================
import * as THREE from "three";
import { makeRng } from "../../placement/seededRandom.js";
import { STONE_WARM, STONE_COOL, MOSS } from "./rockMaterial.js";

const _c = new THREE.Color();

function triCount(geo) {
  return (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
}

/** 基底幾何：ico / box / cone（低模、供位移用）。 */
function baseGeo(kind, detail) {
  if (kind === "ico") return new THREE.IcosahedronGeometry(1, detail);
  if (kind === "dodeca") return new THREE.DodecahedronGeometry(1, detail);
  if (kind === "box") return new THREE.BoxGeometry(1.4, 1.0, 1.4, detail + 1, detail + 1, detail + 1);
  if (kind === "cone") return new THREE.ConeGeometry(1, 1.6, Math.max(5, 4 + detail * 2), 1 + detail);
  return new THREE.IcosahedronGeometry(1, detail);
}

/**
 * 由參數建立一顆石頭的 BufferGeometry（非索引、flat、頂點色）。
 * @param p { kind, detail, scale:[x,y,z], amp, jitterXY, flattenTop, strata, mossAmt, seed }
 */
function buildRock(p) {
  const rng = makeRng(p.seed);
  let geo = baseGeo(p.kind, p.detail);
  if (geo.index) geo = geo.toNonIndexed();   // box/cone 有 index；ico/dodeca 已無
  geo.scale(p.scale[0], p.scale[1], p.scale[2]);

  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  // 逐頂點位移：沿法線 + XY 抖動 + 可選水平分層（strata）
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    n.copy(v).normalize();
    const push = (rng() - 0.35) * p.amp;
    v.addScaledVector(n, push);
    v.x += (rng() - 0.5) * p.jitterXY;
    v.z += (rng() - 0.5) * p.jitterXY;
    if (p.strata) {
      // Cliff Language：把 Y 吸附到 ~0.34m 岩層帶，造出水平分層
      const band = 0.34 * (p.strataScale || 1);
      v.y = Math.round(v.y / band) * band + (rng() - 0.5) * band * 0.25;
    }
    if (p.flattenTop && v.y > 0) v.y *= p.flattenTop;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();

  // pivot：底部中心貼地（最低點 Y=0）
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
  geo.translate(-cx, -bb.min.y, -cz);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();

  // 頂點色：石身 Warm↔Cool（依高度/受光），上方高處面混苔
  geo.computeBoundingBox();
  const h = geo.boundingBox.max.y || 1;
  const colors = new Float32Array(pos.count * 3);
  const nrm = geo.attributes.normal;
  const rngC = makeRng(p.seed + 7);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(nrm, i);
    const up = Math.max(0, n.y);
    // 石身：受光高處偏 Warm、陰暗低處偏 Cool
    const t = Math.min(1, (v.y / h) * 0.6 + up * 0.4);
    _c.copy(STONE_COOL).lerp(STONE_WARM, t);
    // 苔：朝上且高處
    const moss = up > 0.45 && v.y > h * 0.45 ? Math.min(1, p.mossAmt * (0.6 + rngC() * 0.6)) : 0;
    if (moss > 0) _c.lerp(MOSS, moss);
    // 輕微色噪（painterly）
    const j = 0.92 + rngC() * 0.16;
    colors[i * 3] = Math.min(1, _c.r * j);
    colors[i * 3 + 1] = Math.min(1, _c.g * j);
    colors[i * 3 + 2] = Math.min(1, _c.b * j);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.userData.tris = triCount(geo);
  return geo;
}

// ---- 8 件石頭的參數（輪廓刻意不同；LOD0 高細節 / LOD1 低細節、同 seed 保持輪廓） ----
export const ROCK_PARAMS = {
  Rock_Small_A: { kind: "ico", scale: [0.5, 0.36, 0.5], amp: 0.28, jitterXY: 0.12, mossAmt: 0.3, seed: 101, lod0: 1, lod1: 0 },
  Rock_Small_B: { kind: "box", scale: [0.55, 0.28, 0.42], amp: 0.16, jitterXY: 0.10, flattenTop: 0.7, mossAmt: 0.25, seed: 102, lod0: 1, lod1: 0 },
  Rock_Medium_A: { kind: "ico", scale: [0.95, 0.75, 0.9], amp: 0.34, jitterXY: 0.16, mossAmt: 0.4, seed: 103, lod0: 2, lod1: 1 },
  Rock_Medium_B: { kind: "dodeca", scale: [0.8, 0.95, 0.75], amp: 0.26, jitterXY: 0.12, strata: true, strataScale: 1.0, mossAmt: 0.35, seed: 104, lod0: 1, lod1: 0 },
  Rock_Large_A: { kind: "ico", scale: [1.5, 1.2, 1.4], amp: 0.45, jitterXY: 0.22, mossAmt: 0.5, seed: 105, lod0: 2, lod1: 1 },
  Rock_Large_B: { kind: "cone", scale: [1.1, 1.9, 1.0], amp: 0.3, jitterXY: 0.14, strata: true, strataScale: 1.3, mossAmt: 0.4, seed: 106, lod0: 2, lod1: 1 },
  Rock_Cliff_A: { kind: "box", scale: [1.6, 1.5, 1.1], amp: 0.18, jitterXY: 0.10, strata: true, strataScale: 1.0, flattenTop: 0.9, mossAmt: 0.45, seed: 107, lod0: 2, lod1: 1 },
  Rock_Riverbank_A: { kind: "ico", scale: [1.3, 0.5, 1.0], amp: 0.22, jitterXY: 0.16, flattenTop: 0.6, mossAmt: 0.2, seed: 108, lod0: 2, lod1: 1 },
};

/** 建立一件石頭的 { lod0, lod1 } 幾何（決定性）。 */
export function buildRockGeometries(name) {
  const p = ROCK_PARAMS[name];
  if (!p) throw new Error("unknown rock: " + name);
  const lod0 = buildRock({ ...p, detail: p.lod0 });
  const lod1 = buildRock({ ...p, detail: p.lod1 });
  return { lod0, lod1 };
}
