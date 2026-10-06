// ============================================================================
//  tools/audit_moba_map_topology.mjs — MOBA map topology audit (metrics + PNG)
//
//  Usage: node tools/audit_moba_map_topology.mjs --out=<dir> [--label=before]
//  Writes <dir>/<label>_topology.json and <dir>/<label>_topology.png
//  (+ <label>_zoom_<name>.png close-ups of the main tactical areas).
//
//  The PNG is a navigation-truth diagram, not an art render: every colour is
//  what the engine's collision field says (wall / walkable / unreachable),
//  classified by region. Use it next to browser/Blender renders, not instead.
// ============================================================================
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildMobaLayout } from "../src/battle/moba/map/mobaMapLayout.js";
import { buildTerrainShapes } from "../src/battle/moba/map/mapTerrainShapes.js";
import { buildField } from "../src/battle/moba/map/mapPassability.js";
import { findPath, projectToWalkable } from "../src/battle/moba/nav/mobaNavigation.js";
import { auditTopology } from "./lib/mobaTopologyAudit.mjs";
import { RIFT_MAP_VERSION } from "../src/battle/moba/map/riftMapMetrics.js";

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `=${d}`).split("=").slice(1).join("=");
const OUT = resolve(arg("out", "review/moba-map/topology-final"));
const LABEL = arg("label", "current");
mkdirSync(OUT, { recursive: true });

const t0 = Date.now();
const L = buildMobaLayout();
const T = buildTerrainShapes(L);
const F = buildField(T, { mirrorSymmetric: true });
const A = auditTopology(L, T, F, { nav: { findPath, projectToWalkable } });
const { region, quad, reach } = A._raster;
delete A._raster;
A.mapVersion = RIFT_MAP_VERSION;
// ── art ↔ navigation consistency ────────────────────────────────────────────
//  · invisibleWallCells: blocked in the engine field only because the mirror
//    union added them (the art draws nothing there)
//  · artOnlyWallCells: drawn by the shipped GLB source (art/moba-rift/source.json)
//    but walkable in the engine field (visible wall you can walk through)
{
  const F0 = buildField(T, { mirrorSymmetric: false });
  let invisible = 0;
  for (let i = 0; i < F.wall.length; i++) if (F.wall[i] && !F0.wall[i]) invisible++;
  let artOnly = 0;
  try {
    const src = JSON.parse(readFileSync("art/moba-rift/source.json", "utf8"));
    const Fa = buildField({ ...T, wallItems: src.walls }, { mirrorSymmetric: false });
    for (let i = 0; i < F.wall.length; i++) if (Fa.wall[i] && !F.wall[i]) artOnly++;
  } catch { artOnly = null; }
  A.consistency = { invisibleWallCells: invisible, artOnlyWallCells: artOnly };
}
A.wallItems = T.wallItems.length;
A.wallKinds = T.wallItems.reduce((m, w) => { m[w.kind] = (m[w.kind] ?? 0) + 1; return m; }, {});
A.elapsedMs = Date.now() - t0;
writeFileSync(`${OUT}/${LABEL}_topology.json`, JSON.stringify(A, null, 2));

// ── PNG ─────────────────────────────────────────────────────────────────────
function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = (b) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}
const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const WALL_COLOR = {
  cliff: 0x55504a, cliff_mass: 0x4a4540, outer_ridge: 0x4a4540,
  rock: 0x7a5f45, jungle_struct: 0x8a6a48, jungle_wall: 0x8a6a48, entrance_taper: 0x7a5f45,
  pit_wall: 0x7b4fa0, river_stone: 0x6b7f8f,
  base_rim: 0x9aa3ad, base_gate: 0x9aa3ad, base_keep: 0xb7c0ca, fountain_rim: 0xb7c0ca,
};
const REGION_COLOR = [0x101418, 0xc9ced4, 0x3b2a52, 0xc8a46a, 0x3f86c8, 0x3f7f3a, 0x23462a];
const QUAD_TINT = [0x3f7f3a, 0x4a8a3e, 0x6b7d3a, 0x77853c];

function render(view, scale, file) {
  const W = Math.round(view.size * scale), H = W;
  const buf = Buffer.alloc(W * H * 3);
  const { nx, ny, idx, wall, wallId } = F;
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const x = view.x + px / scale, y = view.y + py / scale;
    const ix = Math.round(x), iy = Math.round(y);
    let c = 0x000000;
    if (ix >= 0 && iy >= 0 && ix < nx && iy < ny) {
      const id = idx(ix, iy), r = region[id];
      if (r === 0) c = REGION_COLOR[0];
      else if (wall[id]) c = WALL_COLOR[T.wallItems[wallId[id]]?.kind] ?? 0x6e5a48;
      else {
        c = r === 5 ? QUAD_TINT[quad[id]] : REGION_COLOR[r];
        if (!reach[id]) {
          // dead space: not a wall, but heroes cannot stand here → hatched red
          c = ((px + py) >> 2) & 1 ? 0x9b3b3b : c;
        } else {
          const d = F.dist[id];
          if (r === 5 && d >= 8) c = 0x8fbf5a;          // open field (≥16 wide empty disc)
        }
      }
    }
    const [r0, g0, b0] = hex(c);
    const o = (py * W + px) * 3; buf[o] = r0; buf[o + 1] = g0; buf[o + 2] = b0;
  }
  const dot = (x, y, rad, col, ring = false) => {
    const [r0, g0, b0] = hex(col);
    const pcx = (x - view.x) * scale, pcy = (y - view.y) * scale, R = rad * scale;
    for (let py = Math.floor(pcy - R - 1); py <= pcy + R + 1; py++) for (let px = Math.floor(pcx - R - 1); px <= pcx + R + 1; px++) {
      if (px < 0 || py < 0 || px >= W || py >= H) continue;
      const d = Math.hypot(px - pcx, py - pcy);
      if (ring ? Math.abs(d - R) > 1.2 : d > R) continue;
      const o = (py * W + px) * 3; buf[o] = r0; buf[o + 1] = g0; buf[o + 2] = b0;
    }
  };
  for (const b of L.bushes) dot(b.x, b.y, b.r, 0x1f5f1f, true);
  for (const b of T.bushClusters ?? []) dot(b.x, b.y, 1.2, 0x2fbf4f);
  for (const c of T.camps ?? []) dot(c.x, c.y, c.isPresentation ? 2.2 : 3.2, c.isPresentation ? 0xd0d0d0 : (c.type === "buff" ? 0xff8c1a : 0xffe14d), c.isPresentation);
  for (const k of ["dragon", "baron"]) dot(L.pits[k].x, L.pits[k].y, 3.5, k === "dragon" ? 0xc084fc : 0xf59e0b);
  for (const Q of A.jungle.quadrants) for (const e of Q.entranceList) dot(e.x, e.y, 1.6, 0xff3df2);
  for (const t of T.towers ?? []) dot(t.x, t.y, 1.8, t.side === "blue" ? 0x3b82f6 : 0xef4444);
  writeFileSync(file, png(W, H, buf));
}
render({ x: 0, y: 0, size: F.B.width }, 3, `${OUT}/${LABEL}_topology.png`);
const ZOOMS = {
  blue_top_jungle: { x: 65, y: 105, size: 110 },
  blue_bot_jungle: { x: 110, y: 160, size: 105 },
  baron: { x: 93, y: 94, size: 76 },
  dragon: { x: 161, y: 160, size: 76 },
  mid_river: { x: 125, y: 125, size: 80 },
  blue_base: { x: 40, y: 205, size: 95 },
};
for (const [name, v] of Object.entries(ZOOMS)) render(v, 8, `${OUT}/${LABEL}_zoom_${name}.png`);

// ── console summary ─────────────────────────────────────────────────────────
const q = A.jungle.quadrants;
console.log(JSON.stringify({
  mapVersion: A.mapVersion, wallItems: A.wallItems, regionSharePct: A.regionSharePct,
  walkableSharePct: A.walkableSharePct, jungle: { wallPct: A.jungle.wallPct, deadSpacePct: A.jungle.deadSpacePct },
  quadrants: q.map((x) => ({ n: x.name, wall: x.wallPct, islands: x.wallIslands, open: x.openFieldPct,
    corrP50: x.corridorWidthP50, ents: x.entrances, longEnts: x.entrancesLong, border: x.openBorderCells })),
  river: A.river, pits: A.pits, brushes: { sim: A.brushes.sim.count, visual: A.brushes.visual.count },
  consistency: A.consistency,
  elapsedMs: A.elapsedMs,
}, null, 1));
