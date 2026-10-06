#!/usr/bin/env node
// ============================================================================
//  tools/check_moba_map_topology_final.mjs — MOBA Map Topology Final 守門
//
//  量的全是**引擎真正在用的導航距離場**（buildField mirrorSymmetric），不是美術。
//  斷言分四組：
//    A. 一份真相：量體是簡單多邊形、藍紅精確 180° 鏡像；導航的鏡像聯集只允許
//       「邊線上的格心取捨」（距可見邊線 < 1 格），不得再有看不見的牆。
//    B. 野區密度與戰術空間（LoL 比例參考，門檻見 TARGET）。
//    C. 路線：營地／坑／三路之間全部走得到、瓶頸 ≥ 兩個英雄寬、藍紅路長相等。
//    D. 目標與地標：坑同規格且對兩主堡等距、河道貫通上下路、營地與草叢落在可走地面、
//       外環封閉、野區沒有封死的死角。
//
//  用法：node tools/check_moba_map_topology_final.mjs     （約 3 秒）
// ============================================================================
import { buildMobaLayout } from "../src/battle/moba/map/mobaMapLayout.js";
import { buildTerrainShapes } from "../src/battle/moba/map/mapTerrainShapes.js";
import { buildField, HERO_RADIUS, HERO_DIAMETER } from "../src/battle/moba/map/mapPassability.js";
import { findPath, projectToWalkable } from "../src/battle/moba/nav/mobaNavigation.js";
import { BASE, PITS, CAMPS, BUSHES, LANES, RIVER } from "../src/gameData.js";
import { BASE_GEO } from "../src/battle/moba/map/mapBaseFrame.js";
import { auditTopology } from "./lib/mobaTopologyAudit.mjs";

//  目標門檻（LoL Summoner's Rift 以 k≈63 換算的比例參考；英雄半徑 2.4 ≈ LoL 的 2.3 倍，
//  所以走道寬用「英雄直徑倍數」而不是等比換算）。
const TARGET = Object.freeze({
  jungleWallPctMin: 30,       // LoL 野區牆約 40–45%；ESMO 胖英雄需要較寬走道 ⇒ 下限 30
  quadWallPctMin: 30,
  quadOpenFieldPctMax: 30,    // ≥16 寬的空曠地占可走野區的上限（重構前 37–52%）
  quadIslandsMin: 4,          // 每象限牆島數
  quadEntrancesMin: 4,        // 每象限可走入口數
  routeBottleneckMin: 2 * HERO_DIAMETER,   // 野區關鍵路線最窄處 ≥ 兩個英雄寬
  outerWalkablePctMax: 3,     // 三路外側仍可走的面積（佔競技場）
  jungleDeadPctMax: 0.5,      // 野區封死死角
  riverWidthP50Min: 13,
  pitInnerMin: 9 + HERO_RADIUS,            // 爭奪半徑 9 + 英雄半徑
  brushMin: 24,
});

const A = [];
const ck = (name, ok, detail = "") => A.push({ name, ok: !!ok, detail });
const L = buildMobaLayout();
const T = buildTerrainShapes(L);
const F = buildField(T, { mirrorSymmetric: true });
const F0 = buildField(T, { mirrorSymmetric: false });
const W = L.bounds.width;
const mir = (p) => ({ x: W - p.x, y: W - p.y });

// ── A. 一份真相 ─────────────────────────────────────────────────────────────
const masses = T.wallMasses ?? [];
const inter = (a, b, c, d) => {
  const o = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
};
let nonSimple = 0;
for (const m of masses) {
  const P = m.poly, n = P.length;
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;
    if (inter(P[i], P[(i + 1) % n], P[j], P[(j + 1) % n])) { nonSimple++; break; }
  }
}
ck(`A1 量體全部是簡單多邊形（${masses.length} 個，自我交錯 ${nonSimple}）`, masses.length >= 20 && nonSimple === 0);
{
  const blue = masses.filter((m) => m.side === "blue");
  let bad = 0;
  for (const b of blue) {
    const r = masses.find((m) => m.id === b.id.replace("blue", "red"));
    if (!r || r.poly.length !== b.poly.length) { bad++; continue; }
    if (b.poly.some((p, i) => Math.hypot(mir(p).x - r.poly[i].x, mir(p).y - r.poly[i].y) > 1e-9)) bad++;
  }
  ck(`A2 紅方量體是藍方的精確 180° 鏡像（${blue.length} 對，不符 ${bad}）`, blue.length > 0 && bad === 0);
}
{
  //  導航鏡像聯集多出來的格（畫面上沒有、導航卻擋）——只允許是量體邊線上的格心取捨
  const segD = (x, y, poly) => {
    let m = Infinity;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[j], b = poly[i], dx = b.x - a.x, dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1e-12)));
      m = Math.min(m, Math.hypot(x - a.x - t * dx, y - a.y - t * dy));
    }
    return m;
  };
  let extra = 0, worst = 0;
  for (let i = 0; i < F.wall.length; i++) {
    if (!F.wall[i] || F0.wall[i]) continue;
    extra++;
    const x = F.B.minX + (i % F.nx), y = F.B.minY + Math.floor(i / F.nx);
    worst = Math.max(worst, Math.min(...masses.map((m) => segD(x, y, m.poly))));
  }
  ck(`A3 看不見的牆只剩邊線取捨（鏡像多出 ${extra} 格，距可見邊線最遠 ${worst.toFixed(2)} ≤ 0.75）`,
    worst <= 0.75 && extra <= 200);
}

// ── B. 野區密度與戰術空間 ───────────────────────────────────────────────────
const AU = auditTopology(L, T, F, { nav: { findPath, projectToWalkable } });
ck(`B1 野區牆覆蓋 ${AU.jungle.wallPct}% ≥ ${TARGET.jungleWallPctMin}%`, AU.jungle.wallPct >= TARGET.jungleWallPctMin);
for (const q of AU.jungle.quadrants) {
  ck(`B2 ${q.name}：牆 ${q.wallPct}%、空曠地 ${q.openFieldPct}%、牆島 ${q.wallIslands}、入口 ${q.entrances}`,
    q.wallPct >= TARGET.quadWallPctMin && q.openFieldPct <= TARGET.quadOpenFieldPctMax &&
    q.wallIslands >= TARGET.quadIslandsMin && q.entrances >= TARGET.quadEntrancesMin);
}
{
  const Q = Object.fromEntries(AU.jungle.quadrants.map((q) => [q.name, q]));
  const same = (a, b) => a.wallPct === b.wallPct && a.wallIslands === b.wallIslands && a.entrances === b.entrances;
  ck("B3 鏡像象限的拓樸數字完全相同（blue_top＝red_bot、blue_bot＝red_top）",
    same(Q.blue_top, Q.red_bot) && same(Q.blue_bot, Q.red_top));
}
ck(`B4 三路外側可走面積 ${AU.outer.walkablePctOfArena}% ≤ ${TARGET.outerWalkablePctMax}%（外環封閉）`,
  AU.outer.walkablePctOfArena <= TARGET.outerWalkablePctMax);
ck(`B5 野區封死死角 ${AU.jungle.deadSpacePct}% ≤ ${TARGET.jungleDeadPctMax}%`, AU.jungle.deadSpacePct <= TARGET.jungleDeadPctMax);

// ── C. 路線 ─────────────────────────────────────────────────────────────────
{
  const legs = Object.entries(AU.routes);
  const unreachable = legs.filter(([, v]) => v.length == null).map(([k]) => k);
  const asym = legs.filter(([, v]) => v.mirrorDelta == null || v.mirrorDelta > 1e-6).map(([k]) => k);
  ck(`C1 ${legs.length} 條關鍵路線全部走得到（不可達 ${unreachable.length}）`, unreachable.length === 0, unreachable.join(","));
  ck(`C2 藍紅鏡像路長完全相等（不等 ${asym.length}）`, asym.length === 0, asym.join(","));
  const jungleLegs = legs.filter(([k]) => /camp|dragon|baron|buff/.test(k) && !k.startsWith("fountain"));
  const narrow = jungleLegs.filter(([, v]) => !(v.bottleneck >= TARGET.routeBottleneckMin - 1e-6));
  const minB = Math.min(...jungleLegs.map(([, v]) => v.bottleneck ?? 0));
  ck(`C3 野區路線瓶頸 ≥ 兩個英雄寬（${TARGET.routeBottleneckMin}；最窄 ${minB}）`, narrow.length === 0,
    narrow.map(([k, v]) => `${k}:${v.bottleneck}`).join(","));
}

// ── D. 目標與地標 ───────────────────────────────────────────────────────────
{
  const P = T.meta.pits;
  const same = P.dragon.R === P.baron.R && P.dragon.thick === P.baron.thick && P.dragon.gapHalf === P.baron.gapHalf;
  const inner = P.baron.R - P.baron.thick / 2;
  ck(`D1 兩坑同規格、內徑 ${inner.toFixed(1)} ≥ ${TARGET.pitInnerMin}、各 ${AU.pits.baron.entrances}/${AU.pits.dragon.entrances} 個坑口`,
    same && inner >= TARGET.pitInnerMin && AU.pits.baron.entrances === 2 && AU.pits.dragon.entrances === 2);
  const eq = ["dragon", "baron"].every((k) => Math.abs(Math.hypot(PITS[k].x - BASE.blue.x, PITS[k].y - BASE.blue.y) -
    Math.hypot(PITS[k].x - BASE.red.x, PITS[k].y - BASE.red.y)) < 1e-6);
  ck("D2 每個坑對兩主堡等距（runtime29 地圖對稱 invariant）", eq);
}
{
  //  河道貫通：上路河口 → 巴龍池 → 中央 → 小龍池 → 下路河口，沿河一路可走
  const R = RIVER.points;
  const s = projectToWalkable(R[1].x, R[1].y, HERO_RADIUS), t = projectToWalkable(R[R.length - 2].x, R[R.length - 2].y, HERO_RADIUS);
  const path = s && t ? findPath(s, t, HERO_RADIUS) : null;
  let len = 0, p0 = s; for (const q of path ?? []) { len += Math.hypot(q.x - p0.x, q.y - p0.y); p0 = q; }
  const straight = s && t ? Math.hypot(t.x - s.x, t.y - s.y) : 0;
  ck(`D3 河道貫通上下路（上路河口→下路河口 路長 ${len.toFixed(1)}／直線 ${straight.toFixed(1)}）`,
    !!path && len / straight < 1.25);
  ck(`D4 河道寬 p50 ${AU.river.widthP50} ≥ ${TARGET.riverWidthP50Min}`, AU.river.widthP50 >= TARGET.riverWidthP50Min);
}
{
  const clear = (p) => {
    const ix = Math.round(p.x - F.B.minX), iy = Math.round(p.y - F.B.minY);
    return F.dist[iy * F.nx + ix] * F.cellToSim;
  };
  const campBad = CAMPS.filter((c) => clear(c) < 6).map((c) => `${c.id}:${clear(c).toFixed(1)}`);
  ck(`D5 ${CAMPS.length} 個營地都坐在房間裡（中心淨空 ≥ 6）`, campBad.length === 0, campBad.join(","));
  const bushBad = BUSHES.filter((b) => clear(b) < HERO_RADIUS).map((b) => `${b.x},${b.y}`);
  ck(`D6 ${BUSHES.length} 叢草叢（≥ ${TARGET.brushMin}）全部長在可走地面、且成鏡像對`,
    BUSHES.length >= TARGET.brushMin && bushBad.length === 0 &&
    BUSHES.every((b) => BUSHES.some((o) => Math.abs(o.x - (W - b.x)) < 1e-9 && Math.abs(o.y - (W - b.y)) < 1e-9 && o.r === b.r)),
    bushBad.join(","));
  const tooClose = masses.filter((m) => m.kind === "jungle_mass" && m.poly.some((p) =>
    Math.min(Math.hypot(p.x - BASE.blue.x, p.y - BASE.blue.y), Math.hypot(p.x - BASE.red.x, p.y - BASE.red.y)) < BASE_GEO.keepOutR - 0.5));
  ck(`D7 野區量體不進基地淨空圓（keepOutR ${BASE_GEO.keepOutR}；違規 ${tooClose.length}）`, tooClose.length === 0);
  const laneLen = (k) => LANES[k].slice(1).reduce((s, p, i) => s + Math.hypot(p.x - LANES[k][i].x, p.y - LANES[k][i].y), 0);
  ck(`D8 三路長度未改（top ${laneLen("top").toFixed(2)}／mid ${laneLen("mid").toFixed(2)}／bot ${laneLen("bot").toFixed(2)}）`,
    Math.abs(laneLen("top") - 309.36658292746466) < 1e-8 && Math.abs(laneLen("mid") - 226.27416997969522) < 1e-8 &&
    Math.abs(laneLen("bot") - 309.36658292746466) < 1e-8);
}

for (const a of A) console.log(`${a.ok ? "✅" : "❌"} ${a.name}${a.ok || !a.detail ? "" : `  ← ${a.detail}`}`);
const pass = A.filter((a) => a.ok).length;
console.log(`\n=== check_moba_map_topology_final: ${pass} PASS / ${A.length - pass} FAIL ===`);
process.exitCode = pass === A.length ? 0 : 1;
