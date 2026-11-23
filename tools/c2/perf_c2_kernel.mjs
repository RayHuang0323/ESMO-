#!/usr/bin/env node
// ============================================================================
//  tools/c2/perf_c2_kernel.mjs — C2 performance: engine.tick() time per tick, det.v2 (balanceTool.v26) vs native (balanceTool.v24) and vs det.v1
//  (balanceTool.v25) (C2_事前登記.md §3, 2026-11-23).
//
//  Registered protocol: same machine, same Node, one process; the first N items of the C2 formal plan (default 20); per round two ABBA blocks
//  (v24 v26 v26 v24, then v25 v26 v26 v25); R rounds (default 3). Only engine.tick() is timed (assembly and digests excluded). Reports ms per tick,
//  v26/v24 − 1 and v26/v25 − 1 per round, the medians, and a DetHypot vs Math.hypot micro-benchmark.
//  PASS ⇔ median(v26/v24 − 1) ≤ 10% AND median(v26/v25 − 1) ≤ 10%.
//  Usage: node tools/c2/perf_c2_kernel.mjs --plan=<C2 plan json> [--n=20] [--rounds=3] [--json=<out>]
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
const { c1Assemble } = await import("../c1/c1_assemble.js");
const { detHypot } = await import("../../src/battle/moba/sim/detHypot.js");
const C = await careerContext(), M = await modules();
const binding = (t) => C.bindTacticPlanToCurrentVersions(C.createTacticPlan({ templateId: t, choices: {} }).plan);
const KS = { v24: "balanceTool.v24", v25: "balanceTool.v25", v26: "balanceTool.v26" };
const setups = { v24: [], v25: [], v26: [] };
for (const it of plan.items.slice(0, N)) for (const k of Object.keys(KS)) {
  const tactic = { blue: { kind: "binding", binding: binding(it.blue) }, red: { kind: "binding", binding: binding(it.red) } };
  setups[k].push(JSON.stringify(buildBalanceMatchSetup(it.seed, it.config, M, 1, mirroredRoster(it.seed, M), tactic, KS[k]).setup));
}
function timeKernel(k) {
  let ms = 0, ticks = 0;
  for (const s of setups[k]) { const e = c1Assemble(s).engine; const t0 = process.hrtime.bigint(); while (!e.over && e.t < 3000) { e.tick(0.5); ticks++; } ms += Number(process.hrtime.bigint() - t0) / 1e6; }
  return { ms, ticks };
}
const per = (a, b) => (a.ms + b.ms) / (a.ticks + b.ticks);
timeKernel("v24"); timeKernel("v25"); timeKernel("v26");            // warm-up (JIT), not counted
const rounds = [];
for (let r = 0; r < ROUNDS; r++) {
  const a1 = timeKernel("v24"), b1 = timeKernel("v26"), b2 = timeKernel("v26"), a2 = timeKernel("v24");
  const c1 = timeKernel("v25"), d1 = timeKernel("v26"), d2 = timeKernel("v26"), c2 = timeKernel("v25");
  const v24 = per(a1, a2), v26a = per(b1, b2), v25 = per(c1, c2), v26b = per(d1, d2);
  rounds.push({ round: r + 1, v24MsPerTick: +v24.toFixed(5), v26MsPerTickVsV24: +v26a.toFixed(5), v25MsPerTick: +v25.toFixed(5), v26MsPerTickVsV25: +v26b.toFixed(5),
    overVsV24Pct: +((v26a / v24 - 1) * 100).toFixed(2), overVsV25Pct: +((v26b / v25 - 1) * 100).toFixed(2), ticks: { v24: a1.ticks, v25: c1.ticks, v26: b1.ticks } });
  console.log(JSON.stringify(rounds.at(-1)));
}
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const medV24 = median(rounds.map((x) => x.overVsV24Pct)), medV25 = median(rounds.map((x) => x.overVsV25Pct));
const xs = Array.from({ length: 200000 }, (_, i) => (i * 0.0377) % 5000 - 64), ys = xs.map((x, i) => ((i * 7919) % 441) - 220);
const bench = (f) => { let s = 0; const t0 = process.hrtime.bigint(); for (let rep = 0; rep < 5; rep++) for (let i = 0; i < xs.length; i++) s += f(xs[i], ys[i]); return { ns: Number(process.hrtime.bigint() - t0) / (5 * xs.length), s }; };
bench(Math.hypot); bench(detHypot);
const micro = { hypot: { nativeNsPerCall: +bench((x, y) => Math.hypot(x, y)).ns.toFixed(1), detNsPerCall: +bench(detHypot).ns.toFixed(1) } };
const out = { node: process.version, cpu: os.cpus()[0]?.model, cores: os.cpus().length, items: N, plan: plan.planId, rounds,
  medianOverVsV24Pct: medV24, medianOverVsV25Pct: medV25, pass: medV24 <= 10 && medV25 <= 10, micro };
console.log(JSON.stringify(out, null, 1));
if (arg("json")) fs.writeFileSync(arg("json"), JSON.stringify(out, null, 1));
process.exit(out.pass ? 0 : 1);
