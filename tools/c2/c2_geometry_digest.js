// ============================================================================
//  tools/c2/c2_geometry_digest.js — READ-ONLY map geometry probe per simulation-math kernel (C2 §六, 2026-11-23). Shared by Node and the 5648 bundle.
//
//  Same categories as tools/c1/c1_geometry_digest.js (layout, terrain, field, structures, navInfo) plus the engine's tower placement
//  (mobaTowerPlacement byId / guardById), built INSIDE the given kernel context ("native" or "det.v2") — i.e. exactly what a v20–v25 engine
//  ("native") or a v26 engine ("det.v2") reads. Nothing is written back; v18 geometry modules are not modified.
//  Cached results (tower placement, navigation) come from the kernel-keyed caches, the same objects the engine uses.
// ============================================================================
import { buildMobaLayout } from "../../src/battle/moba/map/mobaMapLayout.js";
import { buildTerrainShapes } from "../../src/battle/moba/map/mapTerrainShapes.js";
import { buildField } from "../../src/battle/moba/map/mapPassability.js";
import { structureList, navInfo } from "../../src/battle/moba/nav/mobaNavigation.js";
import { buildTowerPlacement } from "../../src/battle/moba/map/mobaTowerPlacement.js";
import { withSimKernel, NATIVE_SIM_KERNEL, DET_V2_SIM_KERNEL } from "../../src/battle/moba/sim/simMathContext.js";
import { stateDigest } from "../c1/c1_state_digest.js";

export const C2_GEOMETRY_VERSION = "C2Geometry.v1";
const kernelOf = (id) => (id === "det.v2" ? DET_V2_SIM_KERNEL : NATIVE_SIM_KERNEL);

function build(kernelId) {
  return withSimKernel(kernelOf(kernelId), () => {
    const L = buildMobaLayout();
    const T = buildTerrainShapes(L);
    const F = buildField(T, { mirrorSymmetric: true });
    const P = buildTowerPlacement();
    return {
      layout: L, terrain: T,
      field: { nx: F.nx, ny: F.ny, cellToSim: F.cellToSim, B: F.B, dist: F.dist },
      structures: structureList(), navInfo: navInfo(),
      towerPlacement: { byId: P.byId, guardById: P.guardById },
    };
  });
}

export function geometryDigestKernel(kernelId) {
  const G = build(kernelId);
  return Object.fromEntries(Object.entries(G).map(([k, v]) => [k, stateDigest(v)]));
}

export function geometryLeavesKernel(cat, kernelId) {
  const v0 = build(kernelId)[cat], out = [], seen = new Set();
  const txt = (x) => (typeof x === "number" ? (Object.is(x, -0) ? "-0" : String(x)) : JSON.stringify(x));
  const walk = (v, p) => {
    if (v === null || typeof v !== "object") { if (typeof v !== "function") out.push([p, txt(v)]); return; }
    if (seen.has(v)) return; seen.add(v);
    if (Array.isArray(v) || ArrayBuffer.isView(v)) { for (let i = 0; i < v.length; i++) walk(v[i], `${p}[${i}]`); return; }
    if (v instanceof Map) { let i = 0; for (const [k, x] of v) walk(x, `${p}<${String(k)}#${i++}>`); return; }
    if (v instanceof Set) { let i = 0; for (const x of v) walk(x, `${p}{${i++}}`); return; }
    for (const k of Object.keys(v)) walk(v[k], `${p}.${k}`);
  };
  walk(v0, cat);
  return out;
}
