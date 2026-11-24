// Supplementary (NOT registered): native-path cost of C2's hypot indirection. Same process, two module trees:
// current tree (e3a7c87e) vs eb28fbb9 export, balanceTool.v24 (native), first 10 C2 plan items, ABBA × 3 rounds. Same trajectories (v24 unchanged).
import { pathToFileURL } from "node:url";
import fs from "node:fs";
const CUR = "D:/OneDrive/文件/GitHub/ESMO/.sprints/moba-det-math-c2", OLD = "C:/Users/ifikn/esmo-measure/c2/export_eb28fbb9";
const plan = JSON.parse(fs.readFileSync(CUR + "/review/tactic-book-3a/deterministic-math-c2/C2_crossengine_plan.json", "utf8"));
async function tree(root) {
  const u = (p) => pathToFileURL(root + "/" + p).href;
  const ENVL = await import(u("tools/owner_preview/lib_parity_env_v24.mjs")); ENVL.applyEnv("parity");
  const { careerContext } = await import(u("tools/lib/careerLiveInputs.mjs"));
  const { modules, buildBalanceMatchSetup, mirroredRoster } = await import(u("tools/balance/moba_items_balance_runner.mjs"));
  const { c1Assemble } = await import(u("tools/c1/c1_assemble.js"));
  const C = await careerContext(), M = await modules();
  const binding = (t) => C.bindTacticPlanToCurrentVersions(C.createTacticPlan({ templateId: t, choices: {} }).plan);
  const setups = plan.items.slice(0, 10).map((it) => JSON.stringify(buildBalanceMatchSetup(it.seed, "standard", M, 1, mirroredRoster(it.seed, M),
    { blue: { kind: "binding", binding: binding(it.blue) }, red: { kind: "binding", binding: binding(it.red) } }, "balanceTool.v24").setup));
  return () => { let ms = 0, ticks = 0; for (const s of setups) { const e = c1Assemble(s).engine; const t0 = process.hrtime.bigint(); while (!e.over && e.t < 3000) { e.tick(0.5); ticks++; } ms += Number(process.hrtime.bigint() - t0) / 1e6; } return { ms, ticks }; };
}
const cur = await tree(CUR), old = await tree(OLD);
cur(); old();
const rounds = [];
for (let r = 0; r < 3; r++) {
  const a1 = old(), b1 = cur(), b2 = cur(), a2 = old();
  const o = (a1.ms + a2.ms) / (a1.ticks + a2.ticks), c = (b1.ms + b2.ms) / (b1.ticks + b2.ticks);
  rounds.push({ round: r + 1, eb28fbb9MsPerTick: +o.toFixed(5), currentMsPerTick: +c.toFixed(5), overPct: +((c / o - 1) * 100).toFixed(2), ticks: [a1.ticks, b1.ticks] });
  console.log(JSON.stringify(rounds.at(-1)));
}
const med = rounds.map((x) => x.overPct).sort((a, b) => a - b)[1];
console.log(JSON.stringify({ note: "supplementary, not registered", ruleset: "balanceTool.v24", items: 10, medianOverPct: med, rounds }));
