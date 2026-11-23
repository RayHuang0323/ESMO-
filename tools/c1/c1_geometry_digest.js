// ============================================================================
//  tools/c1/c1_geometry_digest.js — READ-ONLY map geometry consistency probe (TD-TAC-57, C1 closure, 2026-11-23). Shared by Node and the 5647 bundle.
//
//  Rebuilds exactly what navigation uses (mobaNavigation.nav(): buildMobaLayout() default layout → buildTerrainShapes(L) → buildField(T, mirrorSymmetric))
//  and reads the navigation's own structure list. Nothing is written back; v18 geometry and navigation data are not modified.
//  geometryDigest()        → per-category 64-bit digests (same exact walker as the C1 state digest; numbers by exact text, no rounding).
//  geometryLeaves(cat)     → every primitive leaf of one category as [path, exact text] (to locate the first differing coordinate).
// ============================================================================
import { buildMobaLayout } from "../../src/battle/moba/map/mobaMapLayout.js";
import { buildTerrainShapes } from "../../src/battle/moba/map/mapTerrainShapes.js";
import { buildField } from "../../src/battle/moba/map/mapPassability.js";
import { structureList, navInfo } from "../../src/battle/moba/nav/mobaNavigation.js";
import { stateDigest } from "./c1_state_digest.js";

export const C1_GEOMETRY_VERSION = "C1Geometry.v1";

function build() {
  const L = buildMobaLayout();
  const T = buildTerrainShapes(L);
  const F = buildField(T, { mirrorSymmetric: true });
  const S = structureList(), I = navInfo();
  return {
    layout: L,                                   // lanes, towers, camps, pits, bases (coordinates from gameData)
    terrain: T,                                  // wall items, river, bushes, decoration shapes (trig-built polygons)
    field: { nx: F.nx, ny: F.ny, cellToSim: F.cellToSim, B: F.B, dist: F.dist },   // passability distance field
    structures: S,                               // collision circles + blocking classification
    navInfo: I,
  };
}

export function geometryDigest() {
  const G = build();
  return Object.fromEntries(Object.entries(G).map(([k, v]) => [k, stateDigest(v)]));
}

/** All primitive leaves of one category, in walk order: [path, exact text]. */
export function geometryLeaves(cat) {
  const v0 = build()[cat], out = [], seen = new Set();
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
