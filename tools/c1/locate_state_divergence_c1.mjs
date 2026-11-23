#!/usr/bin/env node
// ============================================================================
//  tools/c1/locate_state_divergence_c1.mjs — name the engine-state fields that differ between Node and a browser engine at a given tick
//  (C1 closure diagnostic, 2026-11-23). Read-only: the page assembles the same MatchSetup with the 5647 bundle (window.__esmoC1.stateLeavesAt).
//  Usage: node tools/c1/locate_state_divergence_c1.mjs --data=<cross-engine run dir> --id=<item id> --engine=firefox [--tick=0] [--json=<out>]
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { c1Assemble } from "./c1_assemble.js";
import { stateLeaves } from "./c1_state_digest.js";
import { openEngine } from "./c1_engines.mjs";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const ENVL = await import("../owner_preview/lib_parity_env_v24.mjs");
ENVL.applyEnv("parity");
const rec = JSON.parse(fs.readFileSync(path.join(arg("data"), "node", `${arg("id")}.json`), "utf8"));
const tick = Number(arg("tick", "0")), name = arg("engine", "firefox");
const e = c1Assemble(rec.setupJson).engine; for (let i = 0; i < tick && !e.over; i++) e.tick(0.5);
const a = stateLeaves(e);
const E = await openEngine(name, { port: 9481 });
let b;
try {
  await E.goto(arg("url", "http://127.0.0.1:5647/ESMO-/"));
  for (let i = 0; i < 120; i++) { if (await E.evaluate("return !!(window.__esmoC1 && window.__esmoC1.stateLeavesAt);")) break; await new Promise((r) => setTimeout(r, 500)); }
  b = await E.evaluate(`return window.__esmoC1.stateLeavesAt(${JSON.stringify(rec.setupJson)}, ${tick});`);
} finally { await E.close(); }
const mb = new Map(b), diffs = [];
for (const [p, v] of a) { const w = mb.get(p); if (w !== v) diffs.push({ path: p, node: v, engine: w ?? "(missing)", absDiff: Number.isFinite(Number(v)) && Number.isFinite(Number(w)) ? Math.abs(Number(v) - Number(w)) : null }); }
const onlyEngine = b.filter(([p]) => !a.some(([q]) => q === p)).length;
const groups = {};
for (const d of diffs) { const g = d.path.replace(/\[\d+\]/g, "[]").replace(/<[^>]*>/g, "<>").split(".").slice(0, 3).join("."); groups[g] = (groups[g] ?? 0) + 1; }
const out = { id: arg("id"), engine: name, ua: E.ua, tick, leaves: { node: a.length, engine: b.length }, differing: diffs.length, onlyInEngine: onlyEngine,
  byGroup: Object.fromEntries(Object.entries(groups).sort((x, y) => y[1] - x[1]).slice(0, 25)), first: diffs.slice(0, 12), maxAbsDiff: Math.max(0, ...diffs.map((d) => d.absDiff ?? 0)) };
console.log(JSON.stringify(out, null, 1));
if (arg("json")) fs.writeFileSync(arg("json"), JSON.stringify(out, null, 1));
