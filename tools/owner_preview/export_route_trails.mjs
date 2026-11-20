#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/export_route_trails.mjs — 匯出軌跡圖資料（2026-11-12；量測工具，不改引擎）
//  同一場（工具路徑、雙方入侵模板）在兩個規則集下，某名英雄的逐 tick 座標／狀態，加上地圖可走區與敵塔危險圓。
//  輸出 JSON 給 tools/owner_preview/render_route_trails.py 畫成 PNG。
//  用法：node tools/owner_preview/export_route_trails.mjs --seed=17 --hero=r2 --from=40 --to=80 --out=<json>
// ============================================================================
import fs from "node:fs";
import { careerContext } from "../lib/careerLiveInputs.mjs";
import { isWalkable, HERO_RADIUS } from "../../src/battle/moba/nav/mobaNavigation.js";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const SEED = Number(arg("seed", "17")), HERO = arg("hero", "r2"), FROM = Number(arg("from", "40")), TO = Number(arg("to", "80"));
const RULESETS = arg("rulesets", "balanceTool.v22,balanceTool.v23").split(",");
const OUT = arg("out", "route_trails.json");
const C = await careerContext();
const { configure, modules } = await import("../balance/moba_items_balance_runner.mjs");
const M = await modules();
const b = { kind: "binding", binding: C.bindTacticPlanToCurrentVersions(C.createTacticPlan({ templateId: arg("template", "v2.jungle_invasion"), choices: {} }).plan) };

const runs = {};
let towers = null, alive = null;
for (const rs of RULESETS) {
  const { e } = configure(SEED, "standard", M, 1, null, { blue: b, red: b }, rs);
  const trail = [];
  const p0 = e.players.find((q) => q.id === HERO);
  while (e.t < TO && !e.over) {
    e.tick(0.5);
    const p = e.players.find((q) => q.id === HERO);
    if (e.t >= FROM) trail.push({ t: e.t, x: +p.pos.x.toFixed(2), y: +p.pos.y.toFixed(2), st: p.state, ret: !!p.retreating, dead: !!p.dead, hp: +(p.hp / p.maxHp).toFixed(2), inv: p._invV2 ? (p._invV2.done ? "end:" + p._invV2.reason : "on") : null });
    if (e.t >= FROM && !towers) {
      towers = Object.entries(e.towers).filter(([, t]) => t.hp > 0 && t.side !== p0.side).map(([id, t]) => ({ id, x: t.pos.x, y: t.pos.y, range: e.towerRange(t), danger: e.towerRange(t) + (e.rules.towerSafePad ?? 2.5) }));
      alive = e._aliveStructs;
    }
  }
  runs[rs] = trail;
}
//  可走區（只取軌跡附近的方框，步長 1）
const all = Object.values(runs).flat();
const box = { x0: Math.floor(Math.min(...all.map((q) => q.x)) - 30), x1: Math.ceil(Math.max(...all.map((q) => q.x)) + 30), y0: Math.floor(Math.min(...all.map((q) => q.y)) - 30), y1: Math.ceil(Math.max(...all.map((q) => q.y)) + 30) };
const walk = [];
for (let y = box.y0; y <= box.y1; y++) { let row = ""; for (let x = box.x0; x <= box.x1; x++) row += isWalkable(x, y, HERO_RADIUS, alive) ? "1" : "0"; walk.push(row); }
fs.writeFileSync(OUT, JSON.stringify({ seed: SEED, hero: HERO, from: FROM, to: TO, box, walk, towers: towers.filter((t) => t.x > box.x0 - 20 && t.x < box.x1 + 20 && t.y > box.y0 - 20 && t.y < box.y1 + 20), runs }));
console.log("ok", OUT, Object.fromEntries(Object.entries(runs).map(([k, v]) => [k, { ticks: v.length, died: v.find((q) => q.dead)?.t ?? null }])));
