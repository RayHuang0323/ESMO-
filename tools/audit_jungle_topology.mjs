#!/usr/bin/env node
// ============================================================================
//  tools/audit_jungle_topology.mjs — Jungle Topology／Objective Surroundings Audit（只讀，不改地圖）
//
//  用法：node tools/audit_jungle_topology.mjs [--json=<檔>] [--ascii]
//  全部用正式導航的碰撞場（mapPassability.buildField(..., mirrorSymmetric)，與 mobaNavigation 相同），1 格＝1 單位。
//  分區：路面（laneSurfPoly）／河道（waterPolys）／基地（apronPoly＋出口通道）／坑（floorPoly）／野區四象限
//        （中路對角線 x+y＝span、河道對角線 y＝x 切分：藍方＝河道西南側、紅方＝東北側）。
//  量測：
//    Q  各象限：可走面積、可走比例、淨空（到最近牆距離）中位數／P90、開闊格（淨空 ≥ 6 ⇒ 寬 ≥ 12）比例、最大空地半徑、
//       咽喉數（脊線上淨空 2.4–4.5 的連通段，≈ 1–2 個英雄寬的窄道）、營地數、草叢數、與路面／河道的接口數
//    P  巨龍／巴龍：半徑 20／26／34 三圈的可通行弧段（進場方向）數、各弧段寬度與通往的區域、坑周圍 30 內草叢數
//    R  代表路線：實際路徑長 ÷ 直線距離（≈1＝又直又好走）
//  ⚠ 只讀：不寫任何地圖檔。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const load = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const [G, LAYOUT, TERRAIN, PASS, NAV] = await Promise.all([load("src/gameData.js"), load("src/battle/moba/map/mobaMapLayout.js"),
  load("src/battle/moba/map/mapTerrainShapes.js"), load("src/battle/moba/map/mapPassability.js"), load("src/battle/moba/nav/mobaNavigation.js")]);
const argv = process.argv.slice(2);
const flag = (k) => argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? null;

const T = TERRAIN.buildTerrainShapes(LAYOUT.buildMobaLayout());
const F = PASS.buildField(T, { mirrorSymmetric: true });
const HR = NAV.HERO_RADIUS, SPAN = G.WORLD_BOUNDS.width;
const r1 = (v) => Math.round(v * 10) / 10;
const pip = (x, y, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j];
  if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y + 1e-12) + a.x) c = !c; } return c; };
const bbox = (poly) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of poly) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); } return { poly, x0, y0, x1, y1 }; };
const inAny = (x, y, polys) => polys.some((b) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1 && pip(x, y, b.poly));

const LANE = Object.values(T.meta.laneSurfPoly).map(bbox);
const RIVER = (T.meta.river.waterPolys ?? []).map(bbox);
const BASE = [...["blue", "red"].map((s) => T.meta.bases[s].apronPoly), ...(T.meta.exitCorridorPolys ?? [])].map(bbox);
const PIT = ["dragon", "baron"].map((k) => bbox(T.meta.pits[k].floorPoly));
const quadOf = (x, y) => `${y > x ? "blue" : "red"}_${x + y < SPAN ? "top" : "bot"}`;   // top＝西北半（巴龍側）、bot＝東南半（巨龍側）
//  野區只算「上路＋下路圍起來的環內」；環外（330 擴圖後的外圍草地）另列 outer，不混進野區統計
const LOOP = [...G.LANES.top, ...[...G.LANES.bot].reverse()];
const inLoop = (x, y) => pip(x, y, LOOP);
const QUADS = ["blue_top", "blue_bot", "red_top", "red_bot"];

const { nx, ny, idx } = F;
const cls = new Array(nx * ny);
const d = (ix, iy) => F.dist[idx(ix, iy)] * F.cellToSim;
for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
  const x = F.B.minX + ix, y = F.B.minY + iy, i = idx(ix, iy);
  if (F.wall[i]) { cls[i] = "wall"; continue; }
  cls[i] = inAny(x, y, PIT) ? "pit" : inAny(x, y, BASE) ? "base" : inAny(x, y, LANE) ? "lane" : inAny(x, y, RIVER) ? "river" : inLoop(x, y) ? quadOf(x, y) : "outer";
}
const arena = T.meta.arenaSmooth ?? T.meta.arena;
const inArena = (x, y) => !arena || pip(x, y, arena);

//  ── Q：象限 ──────────────────────────────────────────────────────────────────
const walk = (ix, iy) => ix >= 0 && iy >= 0 && ix < nx && iy < ny && !F.wall[idx(ix, iy)] && d(ix, iy) >= HR;
const q = {};
for (const Q of QUADS) q[Q] = { cells: 0, area: 0, clear: [], open: 0, maxClear: 0, chokeCells: [] };
let outerWalk = 0;
for (let iy = 1; iy < ny - 1; iy++) for (let ix = 1; ix < nx - 1; ix++) {
  const x = F.B.minX + ix, y = F.B.minY + iy; if (!inArena(x, y)) continue;
  const c = cls[idx(ix, iy)], Q = QUADS.includes(c) ? c : null;
  const qq = quadOf(x, y);
  if (((c === "wall" && inLoop(x, y)) || QUADS.includes(c)) && q[qq]) q[qq].area++;
  if (c === "outer" && walk(ix, iy)) outerWalk++;
  if (!Q || !walk(ix, iy)) continue;
  const v = d(ix, iy); const S = q[Q];
  S.cells++; S.clear.push(v); if (v >= 6) S.open++; S.maxClear = Math.max(S.maxClear, v);
  //  脊線（中軸）：在某個方向上是局部最大 ⇒ 通道中心線；窄＝淨空 2.4–4.5
  const ridge = [[1, 0], [0, 1], [1, 1], [1, -1]].some(([a, b]) => v >= d(ix + a, iy + b) && v >= d(ix - a, iy - b));
  if (ridge && v <= 4.5) S.chokeCells.push([ix, iy]);
}
const components = (cells, minSize) => {
  const set = new Set(cells.map(([a, b]) => a + "," + b)), seen = new Set(); let n = 0;
  for (const k of set) { if (seen.has(k)) continue; let size = 0; const st = [k]; seen.add(k);
    while (st.length) { const [a, b] = st.pop().split(",").map(Number); size++;
      for (let da = -1; da <= 1; da++) for (let db = -1; db <= 1; db++) { const kk = (a + da) + "," + (b + db); if (set.has(kk) && !seen.has(kk)) { seen.add(kk); st.push(kk); } } }
    if (size >= minSize) n++; }
  return n;
};
//  接口：與路面／河道相鄰的野區可走格，依連通段計數（寬度 ≥ 3 格才算一個入口）
const border = {}; for (const Q of QUADS) border[Q] = { lane: [], river: [] };
for (let iy = 1; iy < ny - 1; iy++) for (let ix = 1; ix < nx - 1; ix++) {
  const c = cls[idx(ix, iy)]; if (!QUADS.includes(c) || !walk(ix, iy)) continue;
  for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const o = cls[idx(ix + a, iy + b)];
    if ((o === "lane" || o === "river") && walk(ix + a, iy + b)) { border[c][o].push([ix, iy]); break; } }
}
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) * p)] : null; };
const campsIn = (Q) => G.CAMPS.filter((c) => quadOf(c.x, c.y) === Q).length;
const bushesIn = (Q) => G.BUSHES.filter((b) => quadOf(b.x, b.y) === Q && cls[idx(Math.round(b.x), Math.round(b.y))] === Q).length;
const Qout = {};
for (const Q of QUADS) { const S = q[Q];
  Qout[Q] = { walkable: S.cells, walkableRatio: r1((100 * S.cells) / Math.max(1, S.area)), clearMedian: r1(med(S.clear)), clearP90: r1(pct(S.clear, 0.9)),
    openPct: r1((100 * S.open) / Math.max(1, S.cells)), largestClearingR: r1(S.maxClear), chokes: components(S.chokeCells, 4),
    camps: campsIn(Q), bushes: bushesIn(Q), laneEntrances: components(border[Q].lane, 3), riverEntrances: components(border[Q].river, 3) }; }

//  ── P：大型物件坑周圍 ─────────────────────────────────────────────────────────
const regionAt = (x, y) => { const ix = Math.round(x - F.B.minX), iy = Math.round(y - F.B.minY); return cls[idx(ix, iy)]; };
const Pout = {};
for (const key of ["dragon", "baron"]) {
  const P = G.PITS[key]; const rings = {};
  for (const R of [20, 26, 34]) {
    const N = 720, ok = []; for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2; const x = P.x + Math.cos(a) * R, y = P.y + Math.sin(a) * R;
      ok.push(walk(Math.round(x - F.B.minX), Math.round(y - F.B.minY))); }
    const start = ok.indexOf(false); const arcs = [];
    if (start < 0) arcs.push({ from: 0, len: N }); else { let run = null;
      for (let k = 1; k <= N; k++) { const i = (start + k) % N; if (ok[i]) { if (!run) run = { from: i, len: 0 }; run.len++; } else if (run) { arcs.push(run); run = null; } } }
    rings[R] = arcs.filter((a) => a.len >= 3).map((a) => { const mid = ((a.from + a.len / 2) / N) * Math.PI * 2;
      const regions = {}; for (let k = 0; k < a.len; k++) { const ang = (((a.from + k) % N) / N) * Math.PI * 2; const rg = regionAt(P.x + Math.cos(ang) * R, P.y + Math.sin(ang) * R); regions[rg] = (regions[rg] ?? 0) + 1; }
      return { widthUnits: r1((a.len / N) * 2 * Math.PI * R), deg: Math.round((mid * 180) / Math.PI), via: Object.entries(regions).sort((x, y) => y[1] - x[1]).map(([k]) => k).slice(0, 2).join("+") }; });
  }
  Pout[key] = { entrancesByRadius: Object.fromEntries(Object.entries(rings).map(([R, a]) => [R, a.length])), rings,
    bushesWithin30: G.BUSHES.filter((b) => Math.hypot(b.x - P.x, b.y - P.y) <= 30).length,
    bushesWithin45: G.BUSHES.filter((b) => Math.hypot(b.x - P.x, b.y - P.y) <= 45).length };
}

//  ── R：代表路線直度 ───────────────────────────────────────────────────────────
const plen = (a, b) => { const A = NAV.projectToWalkable(a.x, a.y, HR, null), B = NAV.projectToWalkable(b.x, b.y, HR, null);
  const p = NAV.findPath(A, B, HR, null); if (!p) return null; let s = 0, c = A; for (const n of p) { s += Math.hypot(n.x - c.x, n.y - c.y); c = n; } return s; };
const camp = (id) => G.CAMPS.find((c) => c.id === id);
const lanePt = (lane, t) => G.posOnLane(lane, t);
const ROUTES = [
  ["藍 buff → 巨龍坑", camp("camp_blue_buff"), G.PITS.dragon], ["藍 buff → 巴龍坑", camp("camp_blue_buff"), G.PITS.baron],
  ["藍營地 a → 藍營地 b（清野）", camp("camp_blue_a"), camp("camp_blue_b")], ["藍 buff → 紅 buff（入侵）", camp("camp_blue_buff"), camp("camp_red_buff")],
  ["中路中點 → 巨龍坑", lanePt("mid", 0.5), G.PITS.dragon], ["下路外塔前 → 藍營地 b（gank 切入）", lanePt("bot", 0.4), camp("camp_blue_b")],
  ["上路外塔前 → 藍營地 a（gank 切入）", lanePt("top", 0.4), camp("camp_blue_a")], ["藍 buff → 中路中點（支援）", camp("camp_blue_buff"), lanePt("mid", 0.5)],
];
const Rout = ROUTES.map(([name, a, b]) => { const L = plen(a, b), e = Math.hypot(a.x - b.x, a.y - b.y); return { route: name, path: r1(L), straight: r1(e), detour: L ? Math.round((L / e) * 100) / 100 : null }; });

const regionTotals = {}; for (let i = 0; i < cls.length; i++) { const c = cls[i]; if (c !== "wall") regionTotals[c] = (regionTotals[c] ?? 0) + 1; }
const out = { grid: `${nx}×${ny}`, heroRadius: HR, camps: G.CAMPS.length, visionBushes: G.BUSHES.length, outerWalkable: outerWalk, regionTotals, quadrants: Qout, pits: Pout, routes: Rout };
console.log(`各區可走格：${JSON.stringify(regionTotals)}（外圍＝三路環外）`);
console.log("Q 象限（可走面積／可走比例／淨空中位數・P90／開闊格％／最大空地半徑／咽喉數／營地／草叢／路面入口／河道入口）");
for (const [k, v] of Object.entries(Qout)) console.log(`  ${k.padEnd(9)} ${v.walkable}格 ${v.walkableRatio}%  淨空 ${v.clearMedian}・${v.clearP90}  開闊 ${v.openPct}%  最大空地 r${v.largestClearingR}  咽喉 ${v.chokes}  營地 ${v.camps}  草叢 ${v.bushes}  入口 路${v.laneEntrances}／河${v.riverEntrances}`);
console.log("P 大型物件坑（半徑 20／26／34 的進場弧數；草叢 30／45 內）");
for (const [k, v] of Object.entries(Pout)) { console.log(`  ${k}: 進場 ${JSON.stringify(v.entrancesByRadius)}  草叢 ${v.bushesWithin30}／${v.bushesWithin45}`);
  for (const R of [26, 34]) console.log(`     r${R}: ` + v.rings[R].map((a) => `${a.deg}°寬${a.widthUnits}→${a.via}`).join("  ")); }
console.log("R 路線（實際路徑 ÷ 直線）");
for (const r of Rout) console.log(`  ${r.route.padEnd(24)} ${r.path}／${r.straight} ⇒ ×${r.detour}`);
if (argv.includes("--ascii")) {
  const S = 5, ch = { wall: "#", lane: "=", river: "~", base: "B", pit: "O" };
  const lines = [];
  for (let by = 0; by < ny; by += S) { let line = "";
    for (let bx = 0; bx < nx; bx += S) { const cnt = {}; for (let y = by; y < Math.min(ny, by + S); y++) for (let x = bx; x < Math.min(nx, bx + S); x++) { const c = cls[idx(x, y)]; cnt[c] = (cnt[c] ?? 0) + 1; }
      const top = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0][0]; const cx = F.B.minX + bx + S / 2, cy = F.B.minY + by + S / 2;
      let c = ch[top] ?? (d(Math.min(nx - 1, bx + 2), Math.min(ny - 1, by + 2)) >= 6 ? "." : ",");
      if (!inArena(cx, cy)) c = " ";
      if (G.BUSHES.some((b) => Math.hypot(b.x - cx, b.y - cy) < 3.5)) c = "*";
      if (G.CAMPS.some((k) => Math.hypot(k.x - cx, k.y - cy) < 3.5)) c = "c";
      line += c; }
    lines.push(line); }
  console.log("\nASCII（每字元 5×5 單位；# 牆 = 路面 ~ 河道 B 基地 O 坑 . 開闊野區 , 較窄野區 * 草叢 c 營地）\n" + lines.join("\n"));
}
if (flag("json")) fs.writeFileSync(flag("json"), JSON.stringify(out, null, 2));

//  ── 正式 topology gate ─────────────────────────────────────────────────────────────────
//    --gate                基本不變條件（主線必須通過）：導航場 180° 對稱、視野草叢成對鏡射
//    --gate=pit-entrances  Audit Priority 1 目標值（坑肩牆、肩牆入口 10–14、無寬 > 25 開口、每坑 45 內 ≥ 5 叢）。
//                          2026-09-30 在 v16 以實驗分支 experiment/v16-objective-surroundings 試過：巨龍側單場優勢
//                          反而 8.9 → 12.7pp（n=200）⇒ 未併入 v16，目標值留給 Jungle Topology v1 重新設計後使用。
//  後續 Jungle Topology v1 會再加上野區走廊／咽喉／空地的目標值。
const GATE = argv.find((a) => a === "--gate" || a.startsWith("--gate="));
if (GATE) {
  const PIT_ENTRANCES = GATE === "--gate=pit-entrances";
  let pass = 0, fail = 0;
  const ck = (name, ok, detail = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${name}${detail ? "　" + detail : ""}`); };
  let asym = 0; for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) { const a = idx(ix, iy), b = idx(nx - 1 - ix, ny - 1 - iy);
    if (F.wall[a] !== F.wall[b] || Math.abs(F.dist[a] - F.dist[b]) > 1e-6) asym++; }
  ck("T1 導航場 180° 對稱（牆與淨空逐格相同）", asym === 0, `不一致 ${asym} 格`);
  const bushMirror0 = G.BUSHES.every((b) => G.BUSHES.some((m) => Math.abs(m.x - (SPAN - b.x)) < 1e-6 && Math.abs(m.y - (SPAN - b.y)) < 1e-6 && m.r === b.r));
  ck("T0 視野草叢成對 180° 鏡射", bushMirror0, `${G.BUSHES.length} 叢`);
  if (PIT_ENTRANCES) {
  const SH = T.wallItems.filter((w) => w.kind === "pit_shoulder");
  const mirrored = SH.every((w) => SH.some((m) => Math.hypot(m.x - (SPAN - w.x), m.y - (SPAN - w.y)) < 1e-6 && Math.abs(m.len - w.len) < 1e-9 && Math.abs(m.thick - w.thick) < 1e-9));
  ck("T2 坑肩牆存在且逐段 180° 鏡射", SH.length > 0 && SH.length % 2 === 0 && mirrored, `${SH.length} 段`);
  const bushMirror = G.BUSHES.every((b) => G.BUSHES.some((m) => Math.abs(m.x - (SPAN - b.x)) < 1e-6 && Math.abs(m.y - (SPAN - b.y)) < 1e-6 && m.r === b.r));
  ck("T3 視野草叢成對 180° 鏡射；每坑 45 內 ≥ 5 叢", bushMirror && ["dragon", "baron"].every((k) => Pout[k].bushesWithin45 >= 5),
    `巨龍 ${Pout.dragon.bushesWithin45}／巴龍 ${Pout.baron.bushesWithin45}`);
  const onLane = (x, y) => LANE.some((b) => pip(x, y, b.poly));
  for (const key of ["dragon", "baron"]) {
    const P = G.PITS[key], R0 = 30, N = 720, ok = [];
    for (let i = 0; i < N; i++) { const a = (i / N) * 2 * Math.PI; ok.push(walk(Math.round(P.x + Math.cos(a) * R0 - F.B.minX), Math.round(P.y + Math.sin(a) * R0 - F.B.minY))); }
    const s = ok.indexOf(false); const arcs = []; let run = null;
    for (let k = 1; k <= N; k++) { const i = (s + k) % N; if (ok[i]) { if (!run) run = { from: i, len: 0 }; run.len++; } else if (run) { arcs.push(run); run = null; } }
    const ent = arcs.filter((a) => a.len >= 3).map((a) => { const mid = ((a.from + a.len / 2) % N) / N * 2 * Math.PI;
      return { w: r1((a.len / N) * 2 * Math.PI * R0), lane: onLane(P.x + Math.cos(mid) * R0, P.y + Math.sin(mid) * R0) || a.len / N * 2 * Math.PI * R0 > 40 }; });
    const jungleRiver = ent.filter((e) => !e.lane);
    ck(`T4 ${key}：肩牆（r30）上的野區／河道入口 3 個、各寬 10–14`, jungleRiver.length === 3 && jungleRiver.every((e) => e.w >= 10 && e.w <= 14),
      jungleRiver.map((e) => e.w).join("／"));
    const wide = Pout[key].rings[34].filter((a) => a.widthUnits > 25);
    ck(`T5 ${key}：r34 不再有寬 > 25 的開口（原本朝路面＋外圍寬 95）`, wide.length === 0, wide.map((a) => `${a.deg}°寬${a.widthUnits}`).join(" "));
  }
  }
  console.log(`\nJUNGLE_TOPOLOGY_GATE${PIT_ENTRANCES ? "（pit-entrances）" : ""}：${pass}/${pass + fail}　RESULT=${fail ? "FAIL" : "PASS"}`);
  process.exit(fail ? 1 : 0);
}
