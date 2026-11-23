#!/usr/bin/env node
// ============================================================================
//  tools/c1/perf_c1_kernel.mjs — C1 performance: engine.tick() time per tick, native (balanceTool.v24) vs det (balanceTool.v25) (2026-11-23).
//
//  Registered protocol (C1_事前登記.md §3): same machine, same Node, one process; the first N plan items (default 20); per round both kernels in
//  ABBA order; R rounds (default 3). Only engine.tick() is timed (assembly and digests excluded). Reports ms per tick, det/native − 1 per round,
//  the median of rounds, plus a trig micro-benchmark (det vs native Math, same inputs).
//  Usage: node tools/c1/perf_c1_kernel.mjs --plan=<plan json> [--n=20] [--rounds=3] [--json=<out>]
// ============================================================================
import fs from "node:fs";
import os from "node:os";
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const plan = JSON.parse(fs.readFileSync(arg("plan"), "utf8"));
const N = Number(arg("n", "20")), ROUNDS = Number(arg("rounds", "3"));
const ENVL = await import("../owner_preview/lib_parity_env_v24.mjs");
ENVL.applyEnv(plan.toolEnv ?? "parity");
const { careerContext } = await import("../lib/careerLiveInputs.mjs");
const { modules, buildBalanceMatchSetup, mirroredRoster } = await import("../balance/moba_items_balance_runner.mjs");
const { c1Assemble } = await import("./c1_assemble.js");
const D = await import("../../src/battle/moba/sim/detMath.js");
const C = await careerContext(), M = await modules();
const binding = (t) => C.bindTacticPlanToCurrentVersions(C.createTacticPlan({ templateId: t, choices: {} }).plan);
const setups = { native: [], det: [] };
for (const it of plan.items.slice(0, N)) for (const k of ["native", "det"]) {
  const tactic = { blue: { kind: "binding", binding: binding(it.blue) }, red: { kind: "binding", binding: binding(it.red) } };
  setups[k].push(JSON.stringify(buildBalanceMatchSetup(it.seed, it.config, M, 1, mirroredRoster(it.seed, M), tactic, plan.rulesets[k]).setup));
}
function timeKernel(k) {
  let ms = 0, ticks = 0;
  for (const s of setups[k]) { const e = c1Assemble(s).engine; const t0 = process.hrtime.bigint(); while (!e.over && e.t < 3000) { e.tick(0.5); ticks++; } ms += Number(process.hrtime.bigint() - t0) / 1e6; }
  return { ms, ticks };
}
timeKernel("native"); timeKernel("det");                  // warm-up (JIT), not counted
const rounds = [];
for (let r = 0; r < ROUNDS; r++) {
  const a1 = timeKernel("native"), b1 = timeKernel("det"), b2 = timeKernel("det"), a2 = timeKernel("native");
  const nat = (a1.ms + a2.ms) / (a1.ticks + a2.ticks), det = (b1.ms + b2.ms) / (b1.ticks + b2.ticks);
  rounds.push({ round: r + 1, nativeMsPerTick: +nat.toFixed(5), detMsPerTick: +det.toFixed(5), overheadPct: +((det / nat - 1) * 100).toFixed(2) });
  console.log(JSON.stringify(rounds.at(-1)));
}
const med = [...rounds.map((x) => x.overheadPct)].sort((a, b) => a - b)[Math.floor(rounds.length / 2)];
// micro-benchmark: same 200k inputs
const xs = Array.from({ length: 200000 }, (_, i) => (i * 0.0377) % 5000 - 64), ys = xs.map((x, i) => ((i * 7919) % 441) - 220);
const bench = (f) => { let s = 0; const t0 = process.hrtime.bigint(); for (let rep = 0; rep < 5; rep++) for (let i = 0; i < xs.length; i++) s += f(xs[i], ys[i]); return { ns: Number(process.hrtime.bigint() - t0) / (5 * xs.length), s }; };
const micro = {};
for (const [name, nat, det] of [["sin", (x) => Math.sin(x), (x) => D.detSin(x)], ["cos", (x) => Math.cos(x), (x) => D.detCos(x)], ["atan2", (x, y) => Math.atan2(y, x), (x, y) => D.detAtan2(y, x)]]) {
  bench(nat); bench(det);
  micro[name] = { nativeNsPerCall: +bench(nat).ns.toFixed(1), detNsPerCall: +bench(det).ns.toFixed(1) };
}
const out = { node: process.version, cpu: os.cpus()[0]?.model, cores: os.cpus().length, items: N, rounds, medianOverheadPct: med,
  pass: med <= 10 && rounds.every((x) => x.overheadPct <= 15), micro };
console.log(JSON.stringify(out, null, 1));
if (arg("json")) fs.writeFileSync(arg("json"), JSON.stringify(out, null, 1));
