#!/usr/bin/env node
// ============================================================================
//  tools/c1/explore_native_math_engines.mjs — exploratory: which NATIVE Math functions differ between Node (V8) and Chrome / Firefox / WebKit
//  (C1 closure, 2026-11-23). Reports only. Same deterministic inputs everywhere (built from integer PRNG state, see det_math_vectors_c1.mjs):
//  game-range values and the exact lane-segment deltas that src/gameData.js posOnLane() feeds to Math.hypot.
//  Usage: node tools/c1/explore_native_math_engines.mjs [--engines=chrome,firefox,webkit] [--json=<out>]
// ============================================================================
import fs from "node:fs";
import { LANES } from "../../src/gameData.js";
import { openEngine } from "./c1_engines.mjs";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
//  Inputs: 100k game-range pairs (x, y in [-300, 300]) + every lane segment delta used by posOnLane.
const inputs = [];
let s = 0x2545f491;
const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s; };
for (let i = 0; i < 100000; i++) inputs.push([((rnd() % 600000) - 300000) / 1000 + (rnd() % 1000) / 1e7, ((rnd() % 600000) - 300000) / 1000 + (rnd() % 1000) / 1e7]);
const laneDeltas = [];
for (const [lane, pts] of Object.entries(LANES)) for (let i = 1; i < pts.length; i++) laneDeltas.push([pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, lane, i]);
const FNS = {
  hypot: (a, b) => Math.hypot(a, b), sqrt: (a, b) => Math.sqrt(a * a + b * b), sin: (a) => Math.sin(a), cos: (a) => Math.cos(a),
  atan2: (a, b) => Math.atan2(a, b), acos: (a) => Math.acos(Math.max(-1, Math.min(1, a / 300))), asin: (a) => Math.asin(Math.max(-1, Math.min(1, a / 300))),
  exp: (a) => Math.exp(a / 60), log: (a, b) => Math.log(Math.abs(a) + 1), pow: (a, b) => Math.pow(Math.abs(a) / 100 + 0.5, (b / 100) % 4),
};
const key = (v) => (v !== v ? "NaN" : Object.is(v, -0) ? "-0" : String(v));
const run = (F, fnsSrc) => Object.fromEntries(Object.keys(F).map((f) => [f, inputs.map(([a, b]) => key(F[f](a, b)))]));
const nodeRes = run(FNS), nodeLane = laneDeltas.map(([a, b]) => key(Math.hypot(a, b)));
const fnSrc = `{ ${Object.entries(FNS).map(([k, f]) => `${k}: ${f.toString()}`).join(", ")} }`;
const out = { node: process.version, inputs: inputs.length, laneSegments: laneDeltas.length, engines: {} };
for (const name of arg("engines", "chrome,firefox,webkit").split(",")) {
  let E = null;
  try {
    E = await openEngine(name, { port: 9480 });
    const res = await E.evaluate(`const F = ${fnSrc}; const key = (v) => (v !== v ? "NaN" : Object.is(v, -0) ? "-0" : String(v)); const I = ${JSON.stringify(inputs)};
      const out = {}; for (const f of Object.keys(F)) out[f] = I.map(([a, b]) => key(F[f](a, b)));
      out.__lane = ${JSON.stringify(laneDeltas.map(([a, b]) => [a, b]))}.map(([a, b]) => key(Math.hypot(a, b))); return out;`);
    const diffs = Object.fromEntries(Object.keys(FNS).map((f) => [f, res[f].filter((v, i) => v !== nodeRes[f][i]).length]));
    const laneDiff = laneDeltas.map((d, i) => (res.__lane[i] !== nodeLane[i] ? { lane: d[2], seg: d[3], node: nodeLane[i], engine: res.__lane[i] } : null)).filter(Boolean);
    out.engines[name] = { ua: E.ua, browserVersion: E.browserVersion ?? null, differingInputs: diffs, laneHypotDiffs: laneDiff.length, laneExamples: laneDiff.slice(0, 4) };
  } catch (e) { out.engines[name] = { error: String(e.message ?? e).slice(0, 300) }; }
  finally { try { await E?.close(); } catch {} }
  console.log(name, JSON.stringify(out.engines[name]));
}
if (arg("json")) fs.writeFileSync(arg("json"), JSON.stringify(out, null, 1));
