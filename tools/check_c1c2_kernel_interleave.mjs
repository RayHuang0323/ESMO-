// ============================================================================
//  tools/check_c1c2_kernel_interleave.mjs — P3 of review/c1c2-integration-20261124/事前登記_效能與情境污染.md (C1＋C2 integration, 2026-11-24).
//
//  The simulation-math kernel is a dynamic scope (src/battle/moba/sim/simMathContext.js). This gate checks that matches of different rulesets
//  living in ONE process cannot contaminate each other:
//    K1 isolated reference: each of 14 matches (balanceTool.v20 … v26, 2 seeds each, seeds 262001–262014, C1 template rule, parity env) runs alone
//       from start to end; the whole-engine digest (C1StateDigest.v1, nothing excluded) is recorded after every tick.
//    K2 interleaved: the same 14 setups are assembled in a mixed order (v26, v20, v25, v21, v24, v22, v23, …) and then ticked round-robin, one tick
//       per engine per round, until all are over. Every engine's digest after every tick must equal its K1 digest at the same tick.
//    K3 after every assemble and every tick, the global kernel is native again (currentSimKernel().id === "native").
//    K4 kernel per ruleset: v20–v24 engines are native (_detMath false), v25 is det.v1 (_detMath true, no _simKernel.det), v26 is det.v2.
//  Usage: node tools/check_c1c2_kernel_interleave.mjs        → prints "C1C2_KERNEL_INTERLEAVE RESULT=PASS checks=4/4" on success
// ============================================================================
import fs from "node:fs";
import { applyEnv } from "./owner_preview/lib_parity_env_v24.mjs";
applyEnv("parity");
const { careerContext } = await import("./lib/careerLiveInputs.mjs");
const { modules, buildBalanceMatchSetup, mirroredRoster } = await import("./balance/moba_items_balance_runner.mjs");
const { c1Assemble } = await import("./c1/c1_assemble.js");
const { stateDigest } = await import("./c1/c1_state_digest.js");
const { currentSimKernel } = await import("../src/battle/moba/sim/simMathContext.js");

const plan = JSON.parse(fs.readFileSync(new URL("../review/tactic-book-3a/deterministic-math-c2/C2_crossengine_plan.json", import.meta.url), "utf8"));
const T = plan.templates;
const C = await careerContext(), M = await modules();
const binding = (t) => C.bindTacticPlanToCurrentVersions(C.createTacticPlan({ templateId: t, choices: {} }).plan);
const ORDER = ["balanceTool.v26", "balanceTool.v20", "balanceTool.v25", "balanceTool.v21", "balanceTool.v24", "balanceTool.v22", "balanceTool.v23"];
const items = [];
for (let k = 0; k < 2; k++) for (const rs of ORDER) {
  const i = items.length, seed = 262001 + i, blue = T[(3 * i + 1) % T.length], red = T[(7 * i + 4) % T.length];
  items.push({ id: `K${String(i + 1).padStart(2, "0")}`, rs, seed, blue, red,
    setup: JSON.stringify(buildBalanceMatchSetup(seed, "standard", M, 1, mirroredRoster(seed, M),
      { blue: { kind: "binding", binding: binding(blue) }, red: { kind: "binding", binding: binding(red) } }, rs).setup) });
}
let pass = 0, fail = 0; const checks = [];
const ck = (name, ok, detail = null) => { checks.push({ name, ok, detail }); ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail && !ok ? " " + JSON.stringify(detail).slice(0, 600) : ""}`); };
const nativeNow = () => currentSimKernel().id === "native";
let notNative = 0;

// K1
const ref = new Map();
for (const it of items) {
  const e = c1Assemble(it.setup).engine; if (!nativeNow()) notNative++;
  const d = [stateDigest(e)];
  while (!e.over && e.t < 3000) { e.tick(0.5); if (!nativeNow()) notNative++; d.push(stateDigest(e)); }
  ref.set(it.id, d);
}
ck("K1 隔離基準：14 場各自單獨跑完", ref.size === 14, { ticks: [...ref.values()].map((d) => d.length - 1) });

// K2 + K4
const live = items.map((it) => { const e = c1Assemble(it.setup).engine; if (!nativeNow()) notNative++; return { it, e, d: [stateDigest(e)] }; });
const kinds = live.map(({ it, e }) => ({ id: it.id, rs: it.rs, det: !!e._detMath, k: e._simKernel?.id ?? null }));
let round = 0;
while (live.some((x) => !x.e.over && x.e.t < 3000)) {
  round++;
  for (const x of live) { if (x.e.over || x.e.t >= 3000) continue; x.e.tick(0.5); if (!nativeNow()) notNative++; x.d.push(stateDigest(x.e)); }
}
const diffs = [];
for (const x of live) {
  const r = ref.get(x.it.id); let first = -1;
  const n = Math.max(r.length, x.d.length);
  for (let t = 0; t < n; t++) if (r[t] !== x.d[t]) { first = t; break; }
  if (first >= 0) diffs.push({ id: x.it.id, rs: x.it.rs, firstDifferentTick: first, refTicks: r.length - 1, liveTicks: x.d.length - 1 });
}
const ticksCompared = live.reduce((s, x) => s + x.d.length, 0);
ck(`K2 交錯：14 場輪流推進 ${round} 輪，共 ${ticksCompared} 個 tick 摘要，逐 tick＝隔離基準`, diffs.length === 0, { diffs });
ck("K3 每次組裝與每個 tick 之後，全域核心都回到原生", notNative === 0, { notNative });
const kindOk = kinds.every(({ rs, det, k }) => rs === "balanceTool.v26" ? det && k === "det.v2" : rs === "balanceTool.v25" ? det && k !== "det.v2" : !det && k !== "det.v2");
ck("K4 規則集對應核心：v20～v24 原生、v25 det.v1、v26 det.v2", kindOk, { kinds });
console.log(JSON.stringify({ schema: "C1C2KernelInterleave.v1", rounds: round, ticksCompared, perMatchTicks: live.map((x) => `${x.it.id}:${x.it.rs}:${x.d.length - 1}`), notNative, diffs }));
console.log(`C1C2_KERNEL_INTERLEAVE RESULT=${fail ? "FAIL" : "PASS"} checks=${pass}/${pass + fail}`);
process.exitCode = fail ? 1 : 0;
