// ============================================================================
//  environment/fakeAssets.js — 壓測用假資產（Milestone A）
//
//  只為驗證 runtime，不是正式美術。每個假資產提供 LOD0/LOD1 幾何 + 共用材質，
//  對齊 ENVIRONMENT_KIT_SPEC 的「4 共用材質、頂點色、零貼圖、Instancing 友善」。
//  正式 GLB 之後照 ASSET_INTEGRATION_GUIDE 接進同一個 InstancedLODGroup。
// ============================================================================
import * as THREE from "three";

// ---- 4 共用材質（對齊 mat_env_stone/foliage/ground/water；頂點色關、靠 instanceColor） ----
export const SHARED_MATERIALS = {
  stone: new THREE.MeshStandardMaterial({ color: 0x706e69, roughness: 0.92, metalness: 0, flatShading: true }),
  foliage: new THREE.MeshStandardMaterial({ color: 0x224e24, roughness: 0.9, metalness: 0, flatShading: true }),
  ground: new THREE.MeshStandardMaterial({ color: 0x4e7a38, roughness: 0.95, metalness: 0 }),
  water: new THREE.MeshStandardMaterial({ color: 0x2a6b73, roughness: 0.22, metalness: 0, transparent: true, opacity: 0.8 }),
};

const triCount = (geo) => (geo.index ? geo.index.count : geo.attributes.position.count) / 3;

function tag(geo) { geo.userData.tris = triCount(geo); return geo; }

// rock：LOD0 = 面數較高的低模石；LOD1 = 方塊
function rockAssets() {
  const lod0 = tag(new THREE.DodecahedronGeometry(0.6, 0)); // ~36 tris
  lod0.scale(1, 0.7, 1); lod0.translate(0, 0.42, 0);
  const lod1 = tag(new THREE.BoxGeometry(1.0, 0.8, 1.0));   // 12 tris
  lod1.translate(0, 0.4, 0);
  return { name: "rock", mat: SHARED_MATERIALS.stone, lod0, lod1 };
}

// tree：LOD0 = 樹幹圓柱 + 兩層錐；LOD1 = 單錐
function treeAssets() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.12, 0.16, 1.0, 6); trunk.translate(0, 0.5, 0);
  const c1 = new THREE.ConeGeometry(0.8, 1.4, 7); c1.translate(0, 1.6, 0);
  const c2 = new THREE.ConeGeometry(0.55, 1.0, 7); c2.translate(0, 2.4, 0);
  parts.push(trunk, c1, c2);
  const lod0 = tag(mergeSimple(parts));                    // ~ 60 tris
  const lod1 = tag(new THREE.ConeGeometry(0.8, 2.6, 4));   // 8 tris
  lod1.translate(0, 1.5, 0);
  return { name: "tree", mat: SHARED_MATERIALS.foliage, lod0, lod1 };
}

// grass：LOD0 = 交叉片；無 LOD1（只 cull）
function grassAssets() {
  const a = new THREE.PlaneGeometry(0.5, 0.5); a.translate(0, 0.25, 0);
  const b = a.clone(); b.rotateY(Math.PI / 2);
  const lod0 = tag(mergeSimple([a, b]));                   // 4 tris
  return { name: "grass", mat: SHARED_MATERIALS.ground, lod0, lod1: null, cullOnly: true, cullScale: 0.7 };
}

// bush：LOD0 = 低模球；LOD1 = 方塊
function bushAssets() {
  const lod0 = tag(new THREE.IcosahedronGeometry(0.6, 1)); // ~80 tris
  lod0.scale(1, 0.8, 1); lod0.translate(0, 0.5, 0);
  const lod1 = tag(new THREE.BoxGeometry(1.1, 0.9, 1.1)); lod1.translate(0, 0.45, 0);
  return { name: "bush", mat: SHARED_MATERIALS.foliage, lod0, lod1 };
}

/** 極簡幾何合併（不依賴 BufferGeometryUtils，避免額外相依）。皆為非索引三角湯。 */
function mergeSimple(geos) {
  const arrs = geos.map((g) => {
    const ng = g.index ? g.toNonIndexed() : g;
    return ng.attributes.position.array;
  });
  const total = arrs.reduce((n, a) => n + a.length, 0);
  const pos = new Float32Array(total);
  let o = 0;
  for (const a of arrs) { pos.set(a, o); o += a.length; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

export const FAKE_ASSETS = {
  rock: rockAssets(), tree: treeAssets(), grass: grassAssets(), bush: bushAssets(),
};
export const assetTris = (a, lod) => (lod === 1 ? a.lod1 : a.lod0)?.userData.tris ?? 0;
