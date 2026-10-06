// ============================================================================
//  tools/lib/mobaTopologyAudit.mjs — MOBA map topology metrics (shared by the
//  audit CLI and the topology gate).
//
//  Everything is measured on the SAME navigation field the engine uses
//  (buildField(T, { mirrorSymmetric: true }) from mapPassability), so the
//  numbers describe what heroes can actually walk, not what the art suggests.
//
//  Regions (priority order): void > base > pit > lane > river > jungle > outer.
//    · lane   : within LANE_HALF of a lane centreline
//    · river  : inside the river water/shoal polygons
//    · jungle : inside the loop formed by the top + bot lanes (the "inner" map)
//    · outer  : arena space outside that loop (LoL has none of this)
//  Jungle quadrants use the mid-lane / river diagonals through the map centre.
// ============================================================================
import { pointInPoly } from "../../src/battle/moba/map/mapShapePrimitives.js";
import { HERO_RADIUS } from "../../src/battle/moba/map/mapPassability.js";

export const LANE_HALF = 10;           // lane band incl. shoulder up to the jungle wall line (≈ LoL lane + verge)
export const BASE_PLATFORM_R = 30;     // apron 26.6 + rim margin, around the platform centre
const REGION = { void: 0, base: 1, pit: 2, lane: 3, river: 4, jungle: 5, outer: 6 };
export const REGION_NAMES = Object.keys(REGION);
const QUAD_NAMES = ["blue_top", "blue_bot", "red_top", "red_bot"];

function segDist(px, py, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const L2 = dx * dx + dy * dy || 1e-9;
  const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / L2));
  return Math.hypot(px - a.x - t * dx, py - a.y - t * dy);
}
const polyDist = (px, py, pts) => {
  let m = Infinity;
  for (let i = 1; i < pts.length; i++) m = Math.min(m, segDist(px, py, pts[i - 1], pts[i]));
  return m;
};
const bboxOf = (poly) => {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const p of poly) { a = Math.min(a, p.x); b = Math.min(b, p.y); c = Math.max(c, p.x); d = Math.max(d, p.y); }
  return { minX: a, minY: b, maxX: c, maxY: d };
};
const inPolyFast = (x, y, poly, bb) =>
  x >= bb.minX && x <= bb.maxX && y >= bb.minY && y <= bb.maxY && pointInPoly(x, y, poly);

const pct = (arr, q) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))];
};
const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);

/**
 * @param L buildMobaLayout()
 * @param T buildTerrainShapes(L)
 * @param F buildField(T, { mirrorSymmetric: true })
 * @param extra { fountain, nav: { findPath, projectToWalkable } } for route metrics
 */
export function auditTopology(L, T, F, extra = {}) {
  const { nx, ny, idx, dist, wall } = F;
  const B = F.B, cell = F.cellToSim;
  const cx = B.centerX, cy = B.centerY;
  const N = nx * ny;
  const region = new Uint8Array(N);
  const quad = new Int8Array(N).fill(-1);
  const lanes = L.lanes;
  const inner = [...lanes.top, ...[...lanes.bot].reverse()];
  const innerBB = bboxOf(inner);
  const meta = T.meta;
  const riverPolys = (meta.river.waterPolys ?? []).map((p) => ({ p, bb: bboxOf(p) }));
  //  base = the actual platform (≤ BASE_PLATFORM_R from the platform centre C), not the
  //  52-unit decorative keep-out disc — that disc covers jungle/lane ground too.
  const baseCentres = ["blue", "red"].map((s) => meta.bases[s].center ?? L.bases[s]);
  //  objective area = pit floor + wall + the ring of river/plaza right around it
  const pitDiscs = ["dragon", "baron"].map((k) => ({ x: meta.pits[k].x, y: meta.pits[k].y, r: meta.pits[k].R + 8 }));
  const arena = meta.arenaSmooth, arenaBB = bboxOf(arena);

  //  river = water polygons grown by 2.5 (the walkable bank strip belongs to the river)
  const riverMask = new Uint8Array(N);
  {
    const water = new Uint8Array(N);
    for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
      const x = B.minX + ix * cell, y = B.minY + iy * cell;
      if (riverPolys.some((o) => inPolyFast(x, y, o.p, o.bb))) water[idx(ix, iy)] = 1;
    }
    const grow = Math.ceil(2.5 / cell);
    for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
      if (!water[idx(ix, iy)]) continue;
      for (let dy = -grow; dy <= grow; dy++) for (let dx = -grow; dx <= grow; dx++) {
        if (dx * dx + dy * dy > grow * grow) continue;
        const jx = ix + dx, jy = iy + dy;
        if (jx >= 0 && jy >= 0 && jx < nx && jy < ny) riverMask[idx(jx, jy)] = 1;
      }
    }
  }
  for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
    const x = B.minX + ix * cell, y = B.minY + iy * cell, id = idx(ix, iy);
    let r;
    if (!inPolyFast(x, y, arena, arenaBB)) r = REGION.void;
    else if (baseCentres.some((c) => Math.hypot(x - c.x, y - c.y) <= BASE_PLATFORM_R)) r = REGION.base;
    else if (pitDiscs.some((d) => Math.hypot(x - d.x, y - d.y) <= d.r)) r = REGION.pit;
    else if (Math.min(polyDist(x, y, lanes.top), polyDist(x, y, lanes.mid), polyDist(x, y, lanes.bot)) <= LANE_HALF) r = REGION.lane;
    else if (riverMask[id]) r = REGION.river;
    else if (inPolyFast(x, y, inner, innerBB)) r = REGION.jungle;
    else r = REGION.outer;
    region[id] = r;
    if (r === REGION.jungle) {
      const dx = x - cx, dy = y - cy;
      const s = dx + dy, t = dx - dy;       // s: across mid lane, t: across river
      quad[id] = (t < 0 ? 0 : 2) + (s < 0 ? 0 : 1);
    }
  }

  // ── reachability from the blue fountain at hero clearance ────────────────
  const clear = (id) => !wall[id] && dist[id] * cell >= HERO_RADIUS;
  const reach = new Uint8Array(N);
  {
    const f = extra.fountain ?? L.fountains.blue;
    let best = -1, bd = Infinity;
    for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
      const id = idx(ix, iy);
      if (!clear(id)) continue;
      const d = Math.hypot(B.minX + ix * cell - f.x, B.minY + iy * cell - f.y);
      if (d < bd) { bd = d; best = id; }
    }
    const q = [best]; reach[best] = 1;
    while (q.length) {
      const id = q.pop(), ix = id % nx, iy = (id / nx) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const jx = ix + dx, jy = iy + dy;
        if (jx < 0 || jy < 0 || jx >= nx || jy >= ny) continue;
        const j = idx(jx, jy);
        if (!reach[j] && clear(j)) { reach[j] = 1; q.push(j); }
      }
    }
  }

  // ── region census ─────────────────────────────────────────────────────────
  const census = {};
  for (const name of REGION_NAMES) census[name] = { cells: 0, wall: 0, walkable: 0, deadSpace: 0, edgeBand: 0 };
  for (let id = 0; id < N; id++) {
    const c = census[REGION_NAMES[region[id]]];
    c.cells++;
    if (wall[id]) c.wall++;
    else if (reach[id]) c.walkable++;
    else if (dist[id] * cell < HERO_RADIUS) c.edgeBand++;   // hugging a wall: hero radius band
    else c.deadSpace++;         // open floor a hero can never reach (sealed pocket / unused space)
  }
  const arenaCells = N - census.void.cells;
  const share = {};
  for (const name of REGION_NAMES) if (name !== "void") share[name] = r2(census[name].cells / arenaCells * 100);
  const walkTotal = REGION_NAMES.reduce((s, n) => s + census[n].walkable, 0);

  // ── jungle quadrants: walls, islands, open space, corridors, entrances ───
  const quads = QUAD_NAMES.map((name) => ({ name, cells: 0, wall: 0, walkable: 0, dead: 0,
    openField: 0, clear: [], ridge: [], islands: 0, islandCells: 0, entrances: [] }));
  for (let id = 0; id < N; id++) {
    const qi = quad[id]; if (qi < 0) continue;
    const Q = quads[qi];
    Q.cells++;
    if (wall[id]) { Q.wall++; continue; }
    if (!reach[id]) { if (dist[id] * cell >= HERO_RADIUS) Q.dead++; continue; }
    Q.walkable++;
    const c = dist[id] * cell;
    Q.clear.push(c);
    if (c >= 8) Q.openField++;            // centre of an empty disc ≥ 16 wide
    // ridge (medial axis) cell: local max of clearance across one axis pair
    const ix = id % nx, iy = (id / nx) | 0;
    if (ix > 0 && iy > 0 && ix < nx - 1 && iy < ny - 1) {
      const d0 = dist[id];
      const ridgeX = d0 >= dist[id - 1] && d0 >= dist[id + 1];
      const ridgeY = d0 >= dist[id - nx] && d0 >= dist[id + nx];
      const ridgeD = d0 >= dist[id - nx - 1] && d0 >= dist[id + nx + 1];
      const ridgeE = d0 >= dist[id - nx + 1] && d0 >= dist[id + nx - 1];
      if (ridgeX || ridgeY || ridgeD || ridgeE) Q.ridge.push(2 * c);
    }
  }
  // wall islands: 8-connected wall components whose cells are mostly jungle
  {
    const seen = new Uint8Array(N);
    const islandList = [];
    for (let id = 0; id < N; id++) {
      if (!wall[id] || seen[id] || region[id] === REGION.void) continue;
      const stack = [id]; seen[id] = 1;
      const cells = [];
      while (stack.length) {
        const k = stack.pop(); cells.push(k);
        const kx = k % nx, ky = (k / nx) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const jx = kx + dx, jy = ky + dy;
          if (jx < 0 || jy < 0 || jx >= nx || jy >= ny) continue;
          const j = idx(jx, jy);
          if (wall[j] && !seen[j] && region[j] !== REGION.void) { seen[j] = 1; stack.push(j); }
        }
      }
      const qCount = [0, 0, 0, 0]; let jungleCells = 0;
      for (const k of cells) if (quad[k] >= 0) { qCount[quad[k]]++; jungleCells++; }
      if (jungleCells < 8 || jungleCells < cells.length * 0.5) continue;
      const qi = qCount.indexOf(Math.max(...qCount));
      quads[qi].islands++; quads[qi].islandCells += cells.length;
      islandList.push({ quad: QUAD_NAMES[qi], cells: cells.length });
    }
  }
  // entrances: walkable jungle cells touching walkable cells of a different
  // region/quadrant, grouped by 8-connectivity along the border
  {
    const border = new Int8Array(N).fill(-1);
    const kindOf = (j) => {
      const r = region[j];
      if (r === REGION.jungle) return `q:${QUAD_NAMES[quad[j]]}`;
      return REGION_NAMES[r];
    };
    const borderKinds = new Map();
    for (let id = 0; id < N; id++) {
      const qi = quad[id];
      if (qi < 0 || !reach[id]) continue;
      const ix = id % nx, iy = (id / nx) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const jx = ix + dx, jy = iy + dy;
        if (jx < 0 || jy < 0 || jx >= nx || jy >= ny) continue;
        const j = idx(jx, jy);
        if (!reach[j]) continue;
        if (quad[j] === qi) continue;
        border[id] = qi;
        if (!borderKinds.has(id)) borderKinds.set(id, new Set());
        borderKinds.get(id).add(kindOf(j));
      }
    }
    const seen = new Uint8Array(N);
    for (let id = 0; id < N; id++) {
      if (border[id] < 0 || seen[id]) continue;
      const qi = border[id];
      const stack = [id]; seen[id] = 1; const cells = []; const kinds = new Set();
      while (stack.length) {
        const k = stack.pop(); cells.push(k);
        for (const kk of borderKinds.get(k) ?? []) kinds.add(kk);
        const kx = k % nx, ky = (k / nx) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const jx = kx + dx, jy = ky + dy;
          if (jx < 0 || jy < 0 || jx >= nx || jy >= ny) continue;
          const j = idx(jx, jy);
          if (border[j] === qi && !seen[j]) { seen[j] = 1; stack.push(j); }
        }
      }
      if (cells.length < 2) continue;
      let sx = 0, sy = 0;
      for (const k of cells) { sx += k % nx; sy += (k / nx) | 0; }
      quads[qi].entrances.push({
        x: r2(B.minX + sx / cells.length * cell), y: r2(B.minY + sy / cells.length * cell),
        length: cells.length, into: [...kinds].sort(),
      });
    }
  }
  const quadOut = quads.map((Q) => {
    const ents = Q.entrances.sort((a, b) => b.length - a.length);
    const openBorder = ents.reduce((s, e) => s + e.length, 0);
    return {
      name: Q.name,
      areaCells: Q.cells,
      wallPct: r2(Q.wall / Q.cells * 100),
      walkablePct: r2(Q.walkable / Q.cells * 100),
      deadPct: r2(Q.dead / Q.cells * 100),
      wallIslands: Q.islands,
      openFieldPct: r2(Q.openField / Math.max(1, Q.walkable) * 100),
      clearanceP50: r2(pct(Q.clear, 0.5)), clearanceP90: r2(pct(Q.clear, 0.9)),
      clearanceMax: r2(pct(Q.clear, 1)),
      corridorWidthP10: r2(pct(Q.ridge, 0.1)), corridorWidthP50: r2(pct(Q.ridge, 0.5)),
      corridorWidthP90: r2(pct(Q.ridge, 0.9)),
      narrowRidgePct: r2(Q.ridge.filter((w) => w < 12).length / Math.max(1, Q.ridge.length) * 100),
      entrances: ents.length,
      entrancesLong: ents.filter((e) => e.length > 20).length,
      openBorderCells: openBorder,
      entranceList: ents,
    };
  });

  // ── river width along its centreline (perpendicular water extent) ─────────
  const riverWidths = [];
  if (riverPolys.length) {
    const pts = L.river.points;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const len = Math.hypot(b.x - a.x, b.y - a.y), ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
      for (let s = 2; s < len; s += 4) {
        const px = a.x + ux * s, py = a.y + uy * s;
        let w = 0;
        for (let k = -40; k <= 40; k += 0.5) {
          const qx = px - uy * k, qy = py + ux * k;
          if (riverPolys.some((o) => inPolyFast(qx, qy, o.p, o.bb))) w += 0.5;
        }
        if (w > 0) riverWidths.push(w);
      }
    }
  }

  // ── objective pits ────────────────────────────────────────────────────────
  const pits = {};
  for (const k of ["dragon", "baron"]) {
    const P = meta.pits[k];
    let floor = 0, around = 0, aroundWalk = 0;
    for (let id = 0; id < N; id++) {
      const x = B.minX + (id % nx) * cell, y = B.minY + ((id / nx) | 0) * cell;
      const d = Math.hypot(x - P.x, y - P.y);
      if (d <= P.R && reach[id]) floor++;
      if (d > P.R + 3 && d <= P.R + 25) { around++; if (reach[id]) aroundWalk++; }
    }
    // entrances = connected walkable arcs on a ring just outside the pit wall
    const ringR = P.R + P.thick / 2 + HERO_RADIUS + 0.6;
    const samples = 360, open = [];
    for (let i = 0; i < samples; i++) {
      const a = (i / samples) * Math.PI * 2;
      const x = P.x + Math.cos(a) * (P.R - P.thick), y = P.y + Math.sin(a) * (P.R - P.thick);
      const x2 = P.x + Math.cos(a) * ringR, y2 = P.y + Math.sin(a) * ringR;
      const ok = (px, py) => {
        const ix = Math.round((px - B.minX) / cell), iy = Math.round((py - B.minY) / cell);
        return ix >= 0 && iy >= 0 && ix < nx && iy < ny && reach[idx(ix, iy)];
      };
      // a direction is an entrance if the straight radial between inner floor and the ring is walkable
      let pass = true;
      for (let t = 0; t <= 1; t += 0.1) {
        if (!ok(x + (x2 - x) * t, y + (y2 - y) * t)) { pass = false; break; }
      }
      open.push(pass);
    }
    let arcs = 0;
    for (let i = 0; i < samples; i++) if (open[i] && !open[(i + samples - 1) % samples]) arcs++;
    if (arcs === 0 && open.every(Boolean)) arcs = 1;
    const mouthDeg = open.filter(Boolean).length * (360 / samples);
    pits[k] = { innerRadius: r2(P.R - P.thick / 2), floorWalkCells: floor, entrances: arcs,
      mouthDeg: r2(mouthDeg), mouthWidth: r2(mouthDeg / 360 * Math.PI * 2 * (P.R - P.thick / 2)),
      surroundWalkPct: r2(aroundWalk / Math.max(1, around) * 100) };
  }

  // ── brushes ──────────────────────────────────────────────────────────────
  const bushQuad = (b) => {
    const dx = b.x - cx, dy = b.y - cy;
    const ix = Math.round((b.x - B.minX) / cell), iy = Math.round((b.y - B.minY) / cell);
    const r = region[idx(Math.max(0, Math.min(nx - 1, ix)), Math.max(0, Math.min(ny - 1, iy)))];
    if (r === REGION.jungle) return QUAD_NAMES[(dx - dy < 0 ? 0 : 2) + (dx + dy < 0 ? 0 : 1)];
    return REGION_NAMES[r];
  };
  const tally = (arr) => arr.reduce((m, b) => { const k = bushQuad(b); m[k] = (m[k] ?? 0) + 1; return m; }, {});
  const brushes = {
    sim: { count: L.bushes.length, byRegion: tally(L.bushes) },
    visual: { count: (T.bushClusters ?? []).length, byRegion: tally(T.bushClusters ?? []) },
  };

  // ── routes (engine navigation) ───────────────────────────────────────────
  let routes = null;
  if (extra.nav) {
    const { findPath, projectToWalkable } = extra.nav;
    const len = (from, path) => {
      if (!path) return null;
      let s = 0, p = from;
      for (const q of path) { s += Math.hypot(q.x - p.x, q.y - p.y); p = q; }
      return r2(s);
    };
    //  bottleneck: the widest "body" (2 × clearance) that can still travel s → t.
    //  This is the real choke of the best route, unlike ridge statistics which
    //  also count dead-end wall corners.
    const cellOf = (p) => idx(Math.max(0, Math.min(nx - 1, Math.round((p.x - B.minX) / cell))),
      Math.max(0, Math.min(ny - 1, Math.round((p.y - B.minY) / cell))));
    const connectedAt = (s, t, c) => {
      const seen = new Uint8Array(N); const st = [s]; seen[s] = 1;
      while (st.length) {
        const k = st.pop(); if (k === t) return true;
        const kx = k % nx, ky = (k / nx) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const jx = kx + dx, jy = ky + dy; if (jx < 0 || jy < 0 || jx >= nx || jy >= ny) continue;
          const j = idx(jx, jy); if (!seen[j] && !wall[j] && dist[j] * cell >= c) { seen[j] = 1; st.push(j); }
        }
      }
      return false;
    };
    const bottleneck = (s, t) => {
      const cs = cellOf(s), ct = cellOf(t);
      let lo = HERO_RADIUS, hi = Math.min(dist[cs], dist[ct]) * cell;
      if (hi < lo || !connectedAt(cs, ct, lo)) return null;
      for (let it = 0; it < 9; it++) { const mid = (lo + hi) / 2; if (connectedAt(cs, ct, mid)) lo = mid; else hi = mid; }
      return r2(2 * lo);
    };
    const route = (a, b) => {
      const s = projectToWalkable(a.x, a.y, HERO_RADIUS), t = projectToWalkable(b.x, b.y, HERO_RADIUS);
      if (!s || !t) return { length: null, straight: null };
      const path = findPath(s, t, HERO_RADIUS);
      const L1 = len(s, path);
      return { length: L1, straight: r2(Math.hypot(t.x - s.x, t.y - s.y)), detour: L1 ? r2(L1 / Math.max(1e-6, Math.hypot(t.x - s.x, t.y - s.y))) : null,
        bottleneck: bottleneck(s, t) };
    };
    const camps = L.camps;
    const mirror = (p) => ({ x: 2 * cx - p.x, y: 2 * cy - p.y });
    const legs = {};
    const add = (name, a, b) => {
      const blue = route(a, b), red = route(mirror(a), mirror(b));
      legs[name] = { ...blue, mirrorDelta: blue.length != null && red.length != null ? r2(Math.abs(blue.length - red.length)) : null };
    };
    const F0 = L.fountains.blue;
    for (const c of camps.filter((c) => c.side === "blue")) add(`fountain->${c.id}`, F0, c);
    const blueCamps = camps.filter((c) => c.side === "blue");
    for (let i = 0; i < blueCamps.length; i++) for (let j = i + 1; j < blueCamps.length; j++) {
      add(`${blueCamps[i].id}->${blueCamps[j].id}`, blueCamps[i], blueCamps[j]);
    }
    for (const c of blueCamps) {
      add(`${c.id}->dragon`, c, L.pits.dragon);
      add(`${c.id}->baron`, c, L.pits.baron);
    }
    // gank legs: each blue camp to the three lanes at t=0.42 of the blue half
    const laneAt = (pts, t) => {
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
      const target = t * cum[cum.length - 1];
      let i = 1; while (i < cum.length - 1 && cum[i] < target) i++;
      const f = (target - cum[i - 1]) / (cum[i] - cum[i - 1]);
      return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f };
    };
    for (const ln of ["top", "mid", "bot"]) {
      add(`blue_buff->${ln}@0.42`, camps.find((c) => c.id === "camp_blue_buff"), laneAt(lanes[ln], 0.42));
      add(`fountain->${ln}@0.5`, F0, laneAt(lanes[ln], 0.5));
    }
    add("mid@0.5->dragon", laneAt(lanes.mid, 0.5), L.pits.dragon);
    add("mid@0.5->baron", laneAt(lanes.mid, 0.5), L.pits.baron);
    routes = legs;
  }

  return {
    worldSize: B.width,
    arenaCells,
    regionSharePct: share,
    walkableSharePct: r2(walkTotal / arenaCells * 100),
    census,
    jungle: {
      areaPctOfArena: share.jungle,
      wallPct: r2(census.jungle.wall / census.jungle.cells * 100),
      deadSpacePct: r2(census.jungle.deadSpace / census.jungle.cells * 100),
      edgeBandPct: r2(census.jungle.edgeBand / census.jungle.cells * 100),
      quadrants: quadOut,
    },
    outer: { areaPctOfArena: share.outer, walkablePctOfArena: r2(census.outer.walkable / arenaCells * 100),
      reachableOutsideLanesPct: r2(census.outer.walkable / Math.max(1, census.outer.cells) * 100) },
    river: { widthP10: r2(pct(riverWidths, 0.1)), widthP50: r2(pct(riverWidths, 0.5)), widthP90: r2(pct(riverWidths, 0.9)),
      samples: riverWidths.length },
    pits,
    brushes,
    routes,
    _raster: { region, quad, reach },
  };
}
