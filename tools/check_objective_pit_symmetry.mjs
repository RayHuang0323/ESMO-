#!/usr/bin/env node
// ============================================================================
//  tools/check_objective_pit_symmetry.mjs — 巨龍坑／巴龍坑 gameplay 幾何對稱（moba-sim.v16）
//
//  用法：node tools/check_objective_pit_symmetry.mjs [--root=<另一棵原始碼樹>]
//    --root 可指向修正前的樹（例如 v15），同一支 gate 印出修正前的狀態做對照。
//  只驗 gameplay 幾何（碰撞腳印、可走區、坑口寬、導航）；壁高、坑色、光暈、模型屬視覺，允許不同。
//    P1 兩坑的腳印規格相同（半徑／坑口半角／壁厚）
//    P2 坑壁牆段（pit_wall＋entrance_taper）逐段互為 180° 鏡射（位置、角度 +π、長、厚）
//    P3 **未對稱化**的距離場在兩坑範圍內逐格鏡像一致（證明不是靠導航場的「聯集」硬湊出對稱）
//    P4 正式導航場（mirrorSymmetric）坑內沒有隱形牆：坑內可走格數＝未對稱化時的可走格數
//    P5 兩坑可走面積相同
//    P6 兩坑坑口淨寬相同（沿坑壁半徑掃描、英雄半徑淨空）
//    P7 正式 findPath：藍方泉水→巨龍 ＝ 紅方泉水→巴龍、藍→巴龍 ＝ 紅→巨龍（導航鏡像）
// ============================================================================
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.resolve(process.argv.find((a) => a.startsWith("--root="))?.slice(7) ?? HERE);
const load = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const [LAYOUT, TERRAIN, PASS, NAV, G] = await Promise.all([
  load("src/battle/moba/map/mobaMapLayout.js"), load("src/battle/moba/map/mapTerrainShapes.js"),
  load("src/battle/moba/map/mapPassability.js"), load("src/battle/moba/nav/mobaNavigation.js"), load("src/gameData.js"),
]);

let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${name}${detail ? "　" + detail : ""}`); };
const r2 = (v) => Math.round(v * 100) / 100;

const L = LAYOUT.buildMobaLayout();
const T = TERRAIN.buildTerrainShapes(L);
const B = T.meta.bounds, cx = B.centerX, cy = B.centerY;
const pits = T.meta.pits, D = pits.dragon, Bp = pits.baron;

ck("P1 兩坑腳印規格相同（半徑／坑口半角／壁厚）", D.R === Bp.R && D.gapHalf === Bp.gapHalf && D.thick === Bp.thick,
  `dragon R${D.R}/${D.gapHalf}/${D.thick}　baron R${Bp.R}/${Bp.gapHalf}/${Bp.thick}`);

const near = (w, P) => Math.hypot(w.x - P.x, w.y - P.y) <= P.R + P.thick + 2;
const pitWalls = (P) => T.wallItems.filter((w) => (w.kind === "pit_wall" || w.kind === "entrance_taper") && near(w, P));
const dW = pitWalls(D), bW = pitWalls(Bp);
let unmatched = 0;
for (const w of dW) {
  const m = { x: 2 * cx - w.x, y: 2 * cy - w.y };
  const hit = bW.find((q) => Math.hypot(q.x - m.x, q.y - m.y) < 1e-6 && Math.abs(q.len - w.len) < 1e-6 && Math.abs(q.thick - w.thick) < 1e-6
    && Math.abs(Math.cos(q.angle - (w.angle + Math.PI)) - 1) < 1e-9);
  if (!hit) unmatched++;
}
ck("P2 坑壁牆段逐段互為 180° 鏡射", dW.length === bW.length && unmatched === 0, `dragon ${dW.length} 段／baron ${bW.length} 段／對不上 ${unmatched}`);

const Fraw = PASS.buildField(T, { mirrorSymmetric: false });
const Fsym = PASS.buildField(T, { mirrorSymmetric: true });
const cells = (F, P, rMax) => {
  const out = [];
  for (let iy = 0; iy < F.ny; iy++) for (let ix = 0; ix < F.nx; ix++) {
    const x = F.B.minX + ix * F.cellToSim, y = F.B.minY + iy * F.cellToSim;
    if (Math.hypot(x - P.x, y - P.y) <= rMax) out.push([ix, iy]);
  }
  return out;
};
const span = D.R + D.thick + 1;
//  只算「坑壁造成」的格子（最近牆段是 pit_wall／entrance_taper）。坑周邊的野區結構／岩石／河岸石
//  本來就不是嚴格鏡像（全圖既有現象，由導航場的 mirrorSymmetric 聯集處理），不屬於坑位幾何，另列資訊。
const PIT_KINDS = new Set(["pit_wall", "entrance_taper"]);
let rawMismatch = 0, rawN = 0, otherMismatch = 0;
for (const [ix, iy] of cells(Fraw, D, span)) {
  rawN++;
  const a = Fraw.idx(ix, iy), b = Fraw.idx(Fraw.nx - 1 - ix, Fraw.ny - 1 - iy);
  if (Fraw.wall[a] === Fraw.wall[b]) continue;
  const w = T.wallItems[Fraw.wall[a] ? Fraw.wallId[a] : Fraw.wallId[b]];
  if (PIT_KINDS.has(w?.kind)) rawMismatch++; else otherMismatch++;
}
ck("P3 未對稱化距離場：坑壁造成的格子在兩坑逐格鏡像一致", rawMismatch === 0,
  `坑壁 ${rawMismatch}／${rawN} 格不一致（資訊：周邊非坑壁牆 ${otherMismatch} 格，由導航場聯集處理）`);

const inner = D.R - D.thick / 2 - 1;
const freeIn = (F, P) => cells(F, P, Math.min(P.R, Bp.R) - P.thick / 2 - 1).filter(([ix, iy]) => !F.wall[F.idx(ix, iy)]).length;
const phantom = { dragon: freeIn(Fraw, D) - freeIn(Fsym, D), baron: freeIn(Fraw, Bp) - freeIn(Fsym, Bp) };
ck("P4 正式導航場坑內無隱形牆（對稱化前後坑內可走格數相同）", phantom.dragon === 0 && phantom.baron === 0,
  `隱形牆格數 dragon ${phantom.dragon}／baron ${phantom.baron}（坑內半徑 ${r2(inner)}）`);

const walkable = (P) => cells(Fsym, P, P.R).filter(([ix, iy]) => Fsym.dist[Fsym.idx(ix, iy)] * 1 >= NAV.HERO_RADIUS).length;
const wa = { dragon: walkable(D), baron: walkable(Bp) };
ck("P5 兩坑可走面積相同（英雄半徑淨空）", wa.dragon === wa.baron, `dragon ${wa.dragon} 格／baron ${wa.baron} 格`);

const clearAt = (x, y) => { const ix = Fsym.gx(x), iy = Fsym.gy(y); return Fsym.dist[Fsym.idx(ix, iy)] * Fsym.cellToSim; };
const mouthWidth = (P) => P.gaps.map((g) => {
  let best = 0, run = 0;
  for (let k = -200; k <= 200; k++) {
    const a = g.angle + (k / 200) * (g.half + 0.5);
    const x = P.x + Math.cos(a) * P.R, y = P.y + Math.sin(a) * P.R;
    if (clearAt(x, y) >= NAV.HERO_RADIUS) { run++; best = Math.max(best, run); } else run = 0;
  }
  return r2((best / 400) * 2 * (g.half + 0.5) * P.R);
});
const mw = { dragon: mouthWidth(D), baron: mouthWidth(Bp) };
ck("P6 兩坑坑口淨寬相同", JSON.stringify(mw.dragon) === JSON.stringify(mw.baron), `dragon ${JSON.stringify(mw.dragon)}／baron ${JSON.stringify(mw.baron)}`);

const plen = (a, b) => { const A = NAV.projectToWalkable(a.x, a.y, NAV.HERO_RADIUS, null), Bq = NAV.projectToWalkable(b.x, b.y, NAV.HERO_RADIUS, null);
  const p = NAV.findPath(A, Bq, NAV.HERO_RADIUS, null); if (!p) return null; let s = 0, q = A; for (const n of p) { s += Math.hypot(n.x - q.x, n.y - q.y); q = n; } return r2(s); };
const bd = plen(G.FOUNTAIN.blue, G.PITS.dragon), rb = plen(G.FOUNTAIN.red, G.PITS.baron);
const bb = plen(G.FOUNTAIN.blue, G.PITS.baron), rd = plen(G.FOUNTAIN.red, G.PITS.dragon);
ck("P7 導航鏡像：藍→巨龍＝紅→巴龍、藍→巴龍＝紅→巨龍", bd !== null && Math.abs(bd - rb) < 0.01 && Math.abs(bb - rd) < 0.01,
  `藍→龍 ${bd}／紅→巴龍 ${rb}；藍→巴龍 ${bb}／紅→龍 ${rd}`);

console.log(`\n坑位 gameplay 對稱（${path.relative(HERE, ROOT) || "本樹"}）：${pass}/${pass + fail}　RESULT=${fail ? "FAIL" : "PASS"}`);
process.exit(fail ? 1 : 0);
