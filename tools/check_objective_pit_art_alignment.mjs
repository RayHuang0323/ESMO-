#!/usr/bin/env node
// ============================================================================
//  tools/check_objective_pit_art_alignment.mjs — ART_COLLISION_ALIGNMENT_BLOCKER 驗收 gate（moba-sim.v16）
//
//  用法：node tools/check_objective_pit_art_alignment.mjs [--source=art/moba-rift/source.json]
//  背景：v16 把巨龍坑／巴龍坑的 gameplay 腳印統一（mapTerrainShapes 的 PIT_FOOTPRINT），碰撞與導航已對稱；
//    但正式 Rift GLB 是用舊腳印（巨龍 R17／巴龍 R14）建的 ⇒ 畫面上的坑壁與碰撞不一致，
//    而且坑的光暈烘焙了物件身分色（紫＝巨龍、金＝巴龍），SWAPPED 時會和 runtime 坑位標記互相矛盾。
//  本 gate **現在應該是紅的**；它轉綠＝blocker 解除（最小資產修正完成）。不得為了變綠放寬。
//    A1 Blender source 的坑壁牆段（pit_wall＋entrance_taper）與 runtime 碰撞逐段一致（位置、角度、長、厚）
//    A2 兩坑的 GLB 平均半徑／牆厚＝runtime 碰撞（± 0.05）
//    A3 坑位地面層不帶物件身分色（pit_dragon／pit_baron 色鍵）——身分改由 runtime ObjectivePitMarkers 表示
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.resolve(ROOT, process.argv.find((a) => a.startsWith("--source="))?.slice(9) ?? "art/moba-rift/source.json");
const load = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const [LAYOUT, TERRAIN] = await Promise.all([load("src/battle/moba/map/mobaMapLayout.js"), load("src/battle/moba/map/mapTerrainShapes.js")]);

let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${name}${detail ? "　" + detail : ""}`); };
const PIT_KINDS = new Set(["pit_wall", "entrance_taper"]);

const src = JSON.parse(fs.readFileSync(SRC, "utf8"));
const T = TERRAIN.buildTerrainShapes(LAYOUT.buildMobaLayout());
const pits = T.meta.pits;
const artWalls = (src.walls ?? []).filter((w) => PIT_KINDS.has(w.kind));
const rtWalls = T.wallItems.filter((w) => PIT_KINDS.has(w.kind));

const sameSeg = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < 0.01 && Math.abs(a.len - b.len) < 0.01 && Math.abs(a.thick - b.thick) < 0.01
  && Math.abs(Math.cos(a.angle - b.angle)) > 1 - 1e-6;
const matched = artWalls.filter((a) => rtWalls.some((b) => sameSeg(a, b))).length;
ck("A1 GLB source 坑壁與 runtime 碰撞逐段一致", artWalls.length === rtWalls.length && matched === rtWalls.length,
  `GLB ${artWalls.length} 段／runtime ${rtWalls.length} 段／一致 ${matched} 段（${(100 * matched / Math.max(1, rtWalls.length)).toFixed(1)}%）`);

const stats = (walls, P) => {
  const ws = walls.filter((w) => Math.hypot(w.x - P.x, w.y - P.y) < P.R + 10);
  const m = (a) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
  return { n: ws.length, R: +m(ws.map((w) => Math.hypot(w.x - P.x, w.y - P.y))).toFixed(2), thick: +m(ws.map((w) => w.thick)).toFixed(2) };
};
for (const k of ["dragon", "baron"]) {
  const a = stats(artWalls, pits[k]), r = stats(rtWalls, pits[k]);
  ck(`A2 ${k} 坑 GLB 半徑／牆厚＝碰撞`, Math.abs(a.R - r.R) <= 0.05 && Math.abs(a.thick - r.thick) <= 0.05, `GLB ${JSON.stringify(a)}　碰撞 ${JSON.stringify(r)}`);
}

const identity = (src.ground ?? []).filter((g) => g.kind === "pit" && /^pit_(dragon|baron)$/.test(g.colorKey ?? ""));
ck("A3 坑位地面層不帶物件身分色（改由 runtime 標記表示）", identity.length === 0, identity.map((g) => `${g.id}:${g.colorKey}`).join(" "));

console.log(`\nART_COLLISION_ALIGNMENT：${pass}/${pass + fail}　RESULT=${fail ? "BLOCKED" : "PASS"}`);
process.exit(fail ? 1 : 0);
