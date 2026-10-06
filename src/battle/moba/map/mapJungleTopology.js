// ============================================================================
//  battle/moba/map/mapJungleTopology.js — canonical jungle / boundary topology
//  (MOBA Map Topology Final Rework, 2026-10-06)
//
//  【Why this file exists】The previous jungle was procedural decoration: short
//   rock arcs seeded per quadrant, generated separately for blue and red. Three
//   measured consequences (tools/audit_moba_map_topology.mjs, map v3):
//     · jungle walls covered ~18% of the jungle, 39–50% of it was open field
//       (≥16-wide empty discs) — "空地＋少量牆＋野怪";
//     · the walls were not 180° mirrors, so the navigation field's mirror union
//       blocked 1,379 cells the art never drew (invisible walls);
//     · 59% of the arena lay outside the lanes and 49% of it was walkable but
//       had no purpose.
//
//  【Authoring model】Corridor-first, LoL-style:
//   1. The BLUE half is authored as a walk graph: rooms (camp clearings, tri /
//      river junctions) and corridors (polylines with a width). Lanes, the
//      river, the objective bulges and the base are always walkable.
//   2. Everything else inside the lane loop on the blue half becomes wall
//      (negative space). Slivers thinner than MIN_WALL are opened out, tiny
//      islands dropped, and sealed pockets a hero could never reach are filled.
//   3. Each wall island is traced (marching squares) into a polygon "mass".
//   4. Red masses are the exact 180° rotation of blue masses.
//   The same polygons feed BOTH the navigation field (mapPassability.buildField)
//   and the Blender source (tools/export_esmo_rift_source.mjs). There is no
//   second copy of the jungle anywhere.
//
//  Coordinates: CORE design space (0..220, centre 110,110), the same space
//  buildDesignTerrainShapes works in. buildTerrainShapes translates to world.
//  ⚠ Pure data/functions: no THREE/React, no Math.random.
// ============================================================================
import { pointInPoly } from "./mapShapePrimitives.js";

export const JUNGLE_TOPOLOGY_VERSION = "jungle-topology-final-v6";

/** Raster resolution used to derive masses (core units per sample). */
const RES = 0.5;

/** Clearances (core units) — what must stay walkable. */
export const TOPOLOGY_CLEAR = Object.freeze({
  lane: 11.0,        // side-lane half corridor kept open. 9 measured too tight: 60-seed sweep p90 30.6→27.0 min, longest 39.9→30.8 when widened to 11 (fights/sieges need room)
  mid: 12.0,         // mid lane is the main fighting line → a little wider
  laneOuter: 12.0,   // outer (map-edge) side of the side lanes before the boundary cliff
  river: 10.0,       // river walkway half width (≈ 20 wide ⇔ LoL ~1,260u at k≈63)
  pitBulge: 24.5,    // pit plaza (v18 on the v16 pit spec R 15.5 / thick 5.7): wall outer edge 18.35 + 6.15 walkway; jungle walls hug it, entry only via the chokes
  base: 52.0,        // = BASE_GEO.keepOutR: jungle walls never enter the base keep-out disc. 44 squeezed the
                     // high-ground towers (regress2 seed 1618 stalled 8 min sieging tier-0); 58 lengthened the tail.
  baseOuter: 28.0,   // boundary cliff radius around the base PLATFORM centre (apron 26.6 + rim)
  brushPad: 1.0,     // brushes always sit on walkable ground
});

/** Wall shaping. */
export const TOPOLOGY_SHAPE = Object.freeze({
  minWall: 3.2,        // a wall thinner than this is opened back into floor
  minIslandArea: 28,   // islands smaller than this (core units²) are dropped
  simplifyTol: 0.32,   // Douglas–Peucker tolerance for traced outlines
  edgeNoise: 1.15,     // organic wobble of every carved edge (core units), deterministic value noise
  noiseScale: 7.5,     // feature size of that wobble
});

/** Deterministic smooth value noise in [-1, 1] (no Math.random). */
function hash2(ix, iy) {
  let h = (ix * 374761393 + iy * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
export function valueNoise(x, y, scale = TOPOLOGY_SHAPE.noiseScale) {
  const u = x / scale, v = y / scale, ix = Math.floor(u), iy = Math.floor(v);
  const fx = u - ix, fy = v - iy, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return ((a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy) * 2 - 1;
}

/** Catmull-Rom through [x,y,w] waypoints (≈1 unit samples) so paths curve instead of kinking. */
function splineWaypoints(P) {
  if (P.length < 3) return P;
  const out = [];
  const at = (i) => P[Math.max(0, Math.min(P.length - 1, i))];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const n = Math.max(2, Math.ceil(Math.hypot(p2.x - p1.x, p2.y - p1.y)));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const cr = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: cr(p0.x, p1.x, p2.x, p3.x), y: cr(p0.y, p1.y, p2.y, p3.y), w: p1.w + (p2.w - p1.w) * t });
    }
  }
  out.push({ ...P[P.length - 1] });
  return out;
}

/** Distance to a variable-width polyline, minus the interpolated half width (< 0 ⇒ inside). */
function corridorDepth(px, py, pts) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1e-12;
    let t = ((px - a.x) * dx + (py - a.y) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(a.x + t * dx - px, a.y + t * dy - py) - (a.w + (b.w - a.w) * t) / 2;
    if (d < best) best = d;
  }
  return best;
}
/** Signed depth into a room (< 0 ⇒ inside); ellipse rooms use rx/ry/rot. */
function roomDepth(px, py, r) {
  if (r.r != null) return Math.hypot(px - r.x, py - r.y) - r.r;
  const c = Math.cos(-r.rot), s = Math.sin(-r.rot);
  const lx = (px - r.x) * c - (py - r.y) * s, ly = (px - r.x) * s + (py - r.y) * c;
  const k = Math.hypot(lx / r.rx, ly / r.ry);
  return (k - 1) * Math.min(r.rx, r.ry);
}

// ── Blue-half walk graph (v6 jungle refinement) ────────────────────────────
//  LoL's jungle is not "hub circles with spokes": long paths flow AROUND camp
//  pockets, junctions are where paths merge, and the walls are the long curved
//  ridges left between paths. So the graph is authored as flowing paths:
//    · Corridors are Catmull-Rom splines through [x, y, w] waypoints; `w` is the
//      full width at that waypoint (mouths ≈ 8 = 1.7 hero widths, bellies ≈ 10).
//    · Rooms exist only where something lives: camp pockets (elliptical, off to
//      the side of a path) and the two tri-brush junctions.
//  Quadrant identities (red mirrors blue, so topology stays fair):
//    · blue_top / red_bot  "深林 Deep Grove" — an inner ring path from the base
//      front, past the wolves pocket, up to the Baron west choke, with two lane
//      gank mouths cut through the lane-side ridge and a diagonal mid-gank path.
//    · blue_bot / red_top  "岩台 Rock Shelf" — a broad Buff shelf; a hidden flank
//      path hugging the bot lane from the base front past krugs to the bot tri;
//      Buff branches to mid, river and the Dragon north-west choke.
export const BLUE_ROOMS = Object.freeze([
  { id: "wolves", quad: "blue_top", kind: "camp", x: 46, y: 124, rx: 9.4, ry: 7.6, rot: 1.15 },
  { id: "tri_top", quad: "blue_top", kind: "tri", x: 44, y: 92, r: 6 },
  { id: "buff", quad: "blue_bot", kind: "camp", x: 108, y: 150, rx: 11.6, ry: 9.2, rot: -0.4 },
  { id: "krug", quad: "blue_bot", kind: "camp", x: 96, y: 175, rx: 8.8, ry: 7.2, rot: 0.2 },
  { id: "tri_bot", quad: "blue_bot", kind: "tri", x: 131, y: 173, r: 6 },
]);

export const BLUE_CORRIDORS = Object.freeze([
  // ── blue_top · Deep Grove ──
  //  inner ring: base front → west of wolves → tri → Baron west choke
  { id: "inner_ring_top", pts: [[40, 153, 9], [43, 141, 10], [40, 131, 9.6], [37, 121, 9.4], [36, 111, 9.6],
    [38, 102, 9.6], [43, 94, 10], [49, 87, 8.8], [53, 84, 8]] },
  //  top-lane gank mouths through the lane-side ridge
  { id: "toplane_gank_s", pts: [[36, 118, 9], [31, 116, 8.6], [26, 115, 8]] },
  { id: "toplane_gank_tri", pts: [[42, 92, 9], [35, 88, 8.6], [29, 85, 8]] },
  //  diagonal: mid-gank mouth → grove belly → tri
  { id: "mid_to_tri", pts: [[80, 123, 8.2], [75, 119, 9.4], [70, 116, 10], [64, 113, 9.8], [60, 107, 9.6], [56, 101, 9.4], [50, 97, 9.4], [46, 94, 9]] },
  //  grove → river (mid river entrance)
  { id: "grove_river", pts: [[67, 112, 9.2], [72, 107, 9.6], [79, 104, 9.6], [87, 101, 9]] },
  //  grove → Baron plaza south choke
  { id: "grove_baron_s", pts: [[62, 107, 9], [64, 102, 8.6], [68, 97, 8]] },
  //  wolves → mid-gank mouth (dog-leg)
  { id: "wolves_mid", pts: [[52, 128, 9.2], [56, 133, 9.6], [60, 136, 9.4], [63, 140, 8.2]] },
  // ── blue_bot · Rock Shelf ──
  //  lane-side flank: base front → krug pocket → along the bot lane → bot tri
  { id: "flank_bot", pts: [[62, 170, 9], [70, 170, 9.6], [78, 169, 10], [86, 169, 9.6], [92, 173, 9.4]] },
  { id: "flank_bot_east", pts: [[101, 178, 8.6], [110, 180, 8.6], [119, 179, 9], [126, 176, 9.4], [130, 173, 9]] },
  //  base front → mid lane
  { id: "basefront_mid", pts: [[70, 166, 9], [67, 160, 8.2]] },
  //  krug → bot lane gank mouth
  { id: "krug_botlane", pts: [[97, 180, 9], [100, 186, 8.2]] },
  //  krug → Buff choke
  { id: "krug_buff", pts: [[98, 170, 9], [99, 165, 8.6], [102, 161, 8.6], [105, 158, 9]] },
  //  Buff → mid-gank mouth
  { id: "buff_mid", pts: [[102, 144, 9.4], [99, 139, 9.2], [96, 135, 8.2]] },
  //  Buff → river ramp (mid river entrance)
  { id: "buff_river", pts: [[113, 143, 9.4], [115, 138, 9.2], [117, 133, 8.8], [118, 130, 8.6]] },
  //  river ramp → Dragon plaza north-west choke
  { id: "buff_dragon_nw", pts: [[116, 139, 9], [120, 138, 8.6], [125, 137, 8]] },
  //  Buff → bot tri: winding flank south of the Dragon plaza
  { id: "buff_tri", pts: [[115, 156, 9.4], [119, 162, 9.8], [124, 167, 9.4], [129, 171, 9]] },
  //  bot tri → bot lane mouth
  { id: "tri_botlane", pts: [[132, 177, 9], [135, 182, 8.2]] },
  //  bot tri → Dragon plaza south choke
  { id: "tri_dragon_s", pts: [[133, 169, 8.6], [137, 164, 8]] },
]);

// ── geometry helpers ───────────────────────────────────────────────────────
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const L2 = dx * dx + dy * dy || 1e-12;
  let t = ((px - ax) * dx + (py - ay) * dy) / L2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + t * dx - px, qy = ay + t * dy - py;
  return Math.sqrt(qx * qx + qy * qy);
}
export function polylineDist(px, py, pts) {
  let m = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const d = segDist(px, py, a.x ?? a[0], a.y ?? a[1], b.x ?? b[0], b.y ?? b[1]);
    if (d < m) m = d;
  }
  return m;
}

/**
 * Blue half test. The split line is the perpendicular bisector of the two
 * nexuses (= the river axis, where both pits sit), so a point is "blue" when
 * it is nearer the blue nexus side. 180° rotation maps one half onto the other.
 */
export function blueSideOf(x, y, cx, cy, nexus) {
  const vx = nexus.red.x - nexus.blue.x, vy = nexus.red.y - nexus.blue.y;
  return (x - cx) * vx + (y - cy) * vy < 0 ? 1 : 0;
}

/** Chamfer distance (in samples) from every cell to the nearest cell where mask==target. */
function chamfer(mask, nx, ny, target) {
  const INF = 1e9, d = new Float32Array(nx * ny);
  for (let i = 0; i < d.length; i++) d[i] = mask[i] === target ? 0 : INF;
  const A = 1, B = Math.SQRT2;
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    const i = y * nx + x; if (d[i] === 0) continue;
    let v = d[i];
    if (x > 0) v = Math.min(v, d[i - 1] + A);
    if (y > 0) v = Math.min(v, d[i - nx] + A);
    if (x > 0 && y > 0) v = Math.min(v, d[i - nx - 1] + B);
    if (x < nx - 1 && y > 0) v = Math.min(v, d[i - nx + 1] + B);
    d[i] = v;
  }
  for (let y = ny - 1; y >= 0; y--) for (let x = nx - 1; x >= 0; x--) {
    const i = y * nx + x; if (d[i] === 0) continue;
    let v = d[i];
    if (x < nx - 1) v = Math.min(v, d[i + 1] + A);
    if (y < ny - 1) v = Math.min(v, d[i + nx] + A);
    if (x < nx - 1 && y < ny - 1) v = Math.min(v, d[i + nx + 1] + B);
    if (x > 0 && y < ny - 1) v = Math.min(v, d[i + nx - 1] + B);
    d[i] = v;
  }
  return d;
}

/** Morphological opening of a binary mask by radius r (samples). */
function openMask(mask, nx, ny, r) {
  const toFree = chamfer(mask, nx, ny, 0);            // distance to nearest free cell
  const eroded = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) eroded[i] = mask[i] && toFree[i] > r ? 1 : 0;
  const toEroded = chamfer(eroded, nx, ny, 1);
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) out[i] = mask[i] && toEroded[i] <= r + 1e-6 ? 1 : 0;
  return out;
}

/** 4-connected components of mask==1. Returns Int32Array labels (-1 = none) and sizes. */
function components(mask, nx, ny) {
  const label = new Int32Array(mask.length).fill(-1);
  const sizes = [];
  const stack = [];
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || label[s] >= 0) continue;
    const id = sizes.length; let n = 0;
    label[s] = id; stack.push(s);
    while (stack.length) {
      const i = stack.pop(); n++;
      const x = i % nx, y = (i / nx) | 0;
      if (x > 0 && mask[i - 1] && label[i - 1] < 0) { label[i - 1] = id; stack.push(i - 1); }
      if (x < nx - 1 && mask[i + 1] && label[i + 1] < 0) { label[i + 1] = id; stack.push(i + 1); }
      if (y > 0 && mask[i - nx] && label[i - nx] < 0) { label[i - nx] = id; stack.push(i - nx); }
      if (y < ny - 1 && mask[i + nx] && label[i + nx] < 0) { label[i + nx] = id; stack.push(i + nx); }
    }
    sizes.push(n);
  }
  return { label, sizes };
}

/**
 * Marching-squares outline(s) of one island (cells where pred(i) is true).
 * Returns closed loops in sample-index coordinates (vertices on half-cells).
 */
function traceLoops(nx, ny, pred) {
  const v = (x, y) => (x >= 0 && y >= 0 && x < nx && y < ny && pred(y * nx + x)) ? 1 : 0;
  const adj = new Map();
  const key = (x2, y2) => x2 * 100003 + y2;        // doubled coords → integer key
  const link = (a, b) => {
    const ka = key(a[0], a[1]), kb = key(b[0], b[1]);
    if (!adj.has(ka)) adj.set(ka, { p: a, n: [] });
    if (!adj.has(kb)) adj.set(kb, { p: b, n: [] });
    adj.get(ka).n.push(kb); adj.get(kb).n.push(ka);
  };
  for (let j = -1; j < ny; j++) for (let i = -1; i < nx; i++) {
    const tl = v(i, j), tr = v(i + 1, j), br = v(i + 1, j + 1), bl = v(i, j + 1);
    const c = tl * 8 + tr * 4 + br * 2 + bl;
    if (c === 0 || c === 15) continue;
    // doubled coordinates of edge midpoints
    const T = [2 * i + 1, 2 * j], R = [2 * i + 2, 2 * j + 1], B = [2 * i + 1, 2 * j + 2], L = [2 * i, 2 * j + 1];
    switch (c) {
      case 1: case 14: link(L, B); break;
      case 2: case 13: link(B, R); break;
      case 3: case 12: link(L, R); break;
      case 4: case 11: link(T, R); break;
      case 6: case 9: link(T, B); break;
      case 7: case 8: link(T, L); break;
      case 5: link(T, R); link(L, B); break;
      case 10: link(T, L); link(B, R); break;
      default: break;
    }
  }
  const seen = new Set(), loops = [];
  for (const [k0, node0] of adj) {
    if (seen.has(k0)) continue;
    const loop = []; let prev = null, cur = k0;
    while (cur !== undefined && !seen.has(cur)) {
      seen.add(cur);
      const node = adj.get(cur);
      loop.push([node.p[0] / 2, node.p[1] / 2]);
      const next = node.n.find((k) => k !== prev && !seen.has(k));
      prev = cur; cur = next;
    }
    if (loop.length >= 4) loops.push(loop);
  }
  return loops;
}

/** Douglas–Peucker on a closed loop. */
function simplifyClosed(pts, tol) {
  if (pts.length < 8) return pts;
  // split at the two farthest points so the loop is two open chains
  let i0 = 0, i1 = 0, best = -1;
  for (let i = 0; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[0].x, pts[i].y - pts[0].y);
    if (d > best) { best = d; i1 = i; }
  }
  const dp = (chain) => {
    if (chain.length < 3) return chain;
    const a = chain[0], b = chain[chain.length - 1];
    let idx = -1, dm = -1;
    for (let i = 1; i < chain.length - 1; i++) {
      const d = segDist(chain[i].x, chain[i].y, a.x, a.y, b.x, b.y);
      if (d > dm) { dm = d; idx = i; }
    }
    if (dm <= tol) return [a, b];
    const l = dp(chain.slice(0, idx + 1)), r = dp(chain.slice(idx));
    return [...l.slice(0, -1), ...r];
  };
  const c1 = dp(pts.slice(i0, i1 + 1));
  const c2 = dp([...pts.slice(i1), pts[0]]);
  return [...c1.slice(0, -1), ...c2.slice(0, -1)];
}

/** One Chaikin corner-cutting pass on a closed loop (rounds the traced raster corners). */
function chaikin(poly) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
    out.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
  }
  return out;
}
function isSimple(P) {
  const o = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  const n = P.length;
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;
    const a = P[i], b = P[(i + 1) % n], c = P[j], d = P[(j + 1) % n];
    if (o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0) return false;
  }
  return true;
}

const polyArea = (poly) => {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y);
  return Math.abs(a / 2);
};

/** Trace every island of a raster into simplified polygons (core coords). */
function islandsToPolys(mask, nx, ny, x0, y0, minArea, tol) {
  const { label, sizes } = components(mask, nx, ny);
  const out = [];
  for (let id = 0; id < sizes.length; id++) {
    if (sizes[id] * RES * RES < minArea) continue;
    const loops = traceLoops(nx, ny, (i) => label[i] === id);
    for (const loop of loops) {
      const raw = simplifyClosed(loop.map(([i, j]) => ({ x: x0 + i * RES, y: y0 + j * RES })), tol);
      //  round the raster stair-steps / triangle facets; keep the unrounded loop if rounding
      //  would ever self-intersect (navigation and art both need a simple polygon)
      const rounded = raw.length >= 4 ? simplifyClosed(chaikin(raw), tol * 0.5) : raw;
      const poly = isSimple(rounded) ? rounded : raw;
      if (poly.length >= 3 && polyArea(poly) >= minArea * 0.5) out.push(poly);
    }
  }
  return out;
}

/** Splined centrelines of the blue-half corridors ([{x,y,w}] each) — the jungle trails. */
export function buildTrailPaths(corridors = BLUE_CORRIDORS) {
  return corridors.map((c) => ({ id: c.id, pts: splineWaypoints(c.pts.map(([x, y, w]) => ({ x, y, w: w ?? c.w ?? 9 }))) }));
}

/**
 * Build the jungle wall masses for BOTH halves (core coords).
 * @param ctx {
 *   bounds, lanes:{top,mid,bot}, river:[{x,y}], pits:{baron,dragon},
 *   nexus:{blue,red}, bushes:[{x,y,r}], rooms?, corridors?
 * }
 * @returns { masses:[{id,kind,side,quad,poly,area}], walkable(x,y) debug fn, stats }
 */
export function buildJungleMasses(ctx) {
  const { bounds: B, lanes, river, pits, nexus, bushes } = ctx;
  const rooms = ctx.rooms ?? BLUE_ROOMS;
  const corridors = (ctx.corridors ?? BLUE_CORRIDORS).map((c) => ({ ...c, pts: splineWaypoints(c.pts.map(([x, y, w]) => ({ x, y, w: w ?? c.w ?? 9 }))) }));
  const cx = B.centerX, cy = B.centerY;
  const C = TOPOLOGY_CLEAR, S = TOPOLOGY_SHAPE;
  const inner = [...lanes.top, ...lanes.bot.slice().reverse()];
  // lanes.top runs blue base → red base; lanes.bot also runs blue base → red base,
  // so the loop is top (forward) + bot (reversed).
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of inner) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
  const x0 = Math.floor(minX) - 2, y0 = Math.floor(minY) - 2;
  const nx = Math.ceil((maxX - x0 + 2) / RES) + 1, ny = Math.ceil((maxY - y0 + 2) / RES) + 1;
  const N = nx * ny;
  const isWalkableDesign = (x, y) => {
    if (polylineDist(x, y, lanes.top) <= C.lane || polylineDist(x, y, lanes.bot) <= C.lane) return true;
    if (polylineDist(x, y, lanes.mid) <= C.mid) return true;
    if (polylineDist(x, y, river) <= C.river) return true;
    for (const k of ["baron", "dragon"]) if (Math.hypot(x - pits[k].x, y - pits[k].y) <= C.pitBulge) return true;
    for (const s of ["blue", "red"]) if (Math.hypot(x - nexus[s].x, y - nexus[s].y) <= C.base) return true;
    //  rooms / corridors get an organic edge: carve if depth < wobble(x, y)
    const wob = S.edgeNoise * valueNoise(x, y);
    for (const r of rooms) if (roomDepth(x, y, r) <= wob) return true;
    for (const c of corridors) if (corridorDepth(x, y, c.pts) <= wob) return true;
    for (const b of bushes) if (Math.hypot(x - b.x, y - b.y) <= b.r + C.brushPad) return true;
    return false;
  };
  const wall = new Uint8Array(N);
  const domain = new Uint8Array(N);      // blue half ∩ inside the lane loop
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + i * RES, y = y0 + j * RES, k = j * nx + i;
    if (!blueSideOf(x, y, cx, cy, nexus)) continue;
    if (!pointInPoly(x, y, inner)) continue;
    domain[k] = 1;
    if (!isWalkableDesign(x, y)) wall[k] = 1;
  }
  // 1) open out slivers
  let walls = openMask(wall, nx, ny, S.minWall / 2 / RES);
  // 2) fill sealed pockets: floor cells of the domain a hero can never reach
  //    from the lanes / river (the domain border touches both).
  {
    const free = new Uint8Array(N);
    for (let k = 0; k < N; k++) free[k] = domain[k] && !walls[k] ? 1 : 0;
    const reach = new Uint8Array(N); const stack = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i; if (!free[k]) continue;
      const x = x0 + i * RES, y = y0 + j * RES;
      const seed = polylineDist(x, y, lanes.top) <= C.lane || polylineDist(x, y, lanes.bot) <= C.lane ||
        polylineDist(x, y, lanes.mid) <= C.mid || polylineDist(x, y, river) <= C.river;
      if (seed) { reach[k] = 1; stack.push(k); }
    }
    while (stack.length) {
      const k = stack.pop(), i = k % nx, j = (k / nx) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= ny) continue;
        const q = b * nx + a; if (free[q] && !reach[q]) { reach[q] = 1; stack.push(q); }
      }
    }
    for (let k = 0; k < N; k++) if (free[k] && !reach[k]) walls[k] = 1;
  }
  const bluePolys = islandsToPolys(walls, nx, ny, x0, y0, S.minIslandArea, S.simplifyTol);
  const quadOf = (p) => {
    // blue_top: between the top lane and the mid lane (x+y < cx+cy side)
    const s = (p.x - cx) + (p.y - cy);
    return s < 0 ? "top" : "bot";
  };
  const centroid = (poly) => {
    let x = 0, y = 0; for (const p of poly) { x += p.x; y += p.y; } return { x: x / poly.length, y: y / poly.length };
  };
  const masses = [];
  bluePolys.forEach((poly, i) => {
    const q = quadOf(centroid(poly));
    masses.push({ id: `jm_blue_${i}`, kind: "jungle_mass", side: "blue", quad: `blue_${q}`, poly, area: polyArea(poly) });
  });
  const mirrorQuad = { blue_top: "red_bot", blue_bot: "red_top" };
  for (const m of masses.slice()) {
    masses.push({
      ...m, id: m.id.replace("blue", "red"), side: "red", quad: mirrorQuad[m.quad],
      poly: m.poly.map((p) => ({ x: 2 * cx - p.x, y: 2 * cy - p.y })),
    });
  }
  return { masses, raster: { nx, ny, x0, y0, res: RES, wall: walls, domain }, isWalkableDesign };
}

/**
 * Out-of-bounds boundary masses (WORLD coords): everything in the arena that is
 * neither inside the lane loop, nor within `laneOuter` of a lane, nor within
 * `baseOuter` of a base platform centre. Blue half traced, red half mirrored.
 */
export function buildBoundaryMasses({ bounds: B, arena, lanes, nexus, fountains, baseCenters = nexus }) {
  const C = TOPOLOGY_CLEAR;
  const cx = B.centerX, cy = B.centerY;
  const inner = [...lanes.top, ...lanes.bot.slice().reverse()];
  const R2 = 1.0;    // coarser raster: the boundary is a big smooth form
  const nx = Math.ceil(B.width / R2) + 1, ny = Math.ceil(B.height / R2) + 1;
  const mask = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = B.minX + i * R2, y = B.minY + j * R2;
    if (!pointInPoly(x, y, arena)) continue;
    if (!blueSideOf(x, y, cx, cy, nexus)) continue;
    if (pointInPoly(x, y, inner)) continue;
    if (polylineDist(x, y, lanes.top) <= C.laneOuter || polylineDist(x, y, lanes.bot) <= C.laneOuter) continue;
    if (polylineDist(x, y, lanes.mid) <= C.mid) continue;
    if (Math.hypot(x - baseCenters.blue.x, y - baseCenters.blue.y) <= C.baseOuter) continue;
    if (Math.hypot(x - baseCenters.red.x, y - baseCenters.red.y) <= C.baseOuter) continue;
    if (fountains && Math.hypot(x - fountains.blue.x, y - fountains.blue.y) <= 12) continue;
    mask[j * nx + i] = 1;
  }
  const { label, sizes } = components(mask, nx, ny);
  const polys = [];
  for (let id = 0; id < sizes.length; id++) {
    if (sizes[id] < 40) continue;
    for (const loop of traceLoops(nx, ny, (k) => label[k] === id)) {
      const poly = simplifyClosed(loop.map(([i, j]) => ({ x: B.minX + i * R2, y: B.minY + j * R2 })), 0.45);
      if (poly.length >= 3) polys.push(poly);
    }
  }
  const masses = [];
  polys.forEach((poly, i) => masses.push({ id: `bm_blue_${i}`, kind: "boundary_mass", side: "blue", quad: "boundary", poly, area: polyArea(poly) }));
  for (const m of masses.slice()) {
    masses.push({ ...m, id: m.id.replace("blue", "red"), side: "red", poly: m.poly.map((p) => ({ x: 2 * cx - p.x, y: 2 * cy - p.y })) });
  }
  return masses;
}
