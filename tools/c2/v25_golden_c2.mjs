// ============================================================================
//  tools/c2/v25_golden_c2.mjs — moba-sim.v25 behaviour golden for C2 (C2_事前登記.md §6 V2, 2026-11-23).
//
//  A fixed list of balanceTool.v25 (mathKernel "det.v1") matches run with the engine of a given source tree, whole-engine state digest after
//  every tick (tools/c1/c1_state_digest.js), NOTHING excluded. The fixture tools/fixtures/c2_v25_golden_eb28fbb9.json is recorded from an export of
//  commit eb28fbb9 (C1 HEAD, where moba-sim.v25 = 15a8c67f3bcea44a); tools/check_c2_v25_golden.mjs replays the same list on the current tree.
//  (Same harness as tools/c1/legacy_golden_c1.mjs, which keeps guarding v20–v24 against 053fd582.)
//  CLI (recording, only against an exported historical tree):  node tools/c2/v25_golden_c2.mjs --root=<exported tree> --out=<fixture json>
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { runDigest } from "../c1/c1_state_digest.js";

export const V25_GOLDEN_SOURCE = "eb28fbb9";
export const V25_GOLDEN_MATCHES = Object.freeze([
  { id: "V1", rulesetId: "balanceTool.v25", seed: 142227, blue: "v2.jungle_invasion", red: "v2.jungle_invasion" },
  { id: "V2", rulesetId: "balanceTool.v25", seed: 153001, blue: "classic.m2", red: "classic.m5" },
  { id: "V3", rulesetId: "balanceTool.v25", seed: 142243, blue: "v2.jungle_invasion", red: "classic.m7" },
  { id: "V4", rulesetId: "balanceTool.v25", seed: 146045, blue: "classic.m7", red: "v2.jungle_invasion" },
  { id: "V5", rulesetId: "balanceTool.v25", seed: 146006, blue: null, red: null },
  { id: "V6", rulesetId: "balanceTool.v25", seed: 153040, blue: "std", red: "v2.dragon_pit_macro" },
]);

/** Run every golden match with the engine of `root` (repo-shaped tree with src/ and tools/). */
export async function computeV25Golden(root) {
  const u = (p) => pathToFileURL(path.join(root, p)).href;
  const ENVL = await import(u("tools/owner_preview/lib_parity_env_v24.mjs"));
  ENVL.applyEnv("parity");
  const { careerContext } = await import(u("tools/lib/careerLiveInputs.mjs"));
  const { configure, modules } = await import(u("tools/balance/moba_items_balance_runner.mjs"));
  const C = await careerContext(), M = await modules();
  const binding = (t) => C.bindTacticPlanToCurrentVersions(C.createTacticPlan({ templateId: t, choices: {} }).plan);
  const out = {};
  for (const m of V25_GOLDEN_MATCHES) {
    const tactic = m.blue ? { blue: { kind: "binding", binding: binding(m.blue) }, red: { kind: "binding", binding: binding(m.red) } } : null;
    const e = configure(m.seed, "standard", M, 1, null, tactic, m.rulesetId).e;
    const detFlag = e._detMath ?? null;
    const d = runDigest(e, 3000);
    out[m.id] = { ...m, detFlag, ticks: d.ticks, winner: d.winner, endT: d.endT, final: d.final, perTick: d.perTick };
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const arg = (k) => process.argv.find((x) => x.startsWith(`--${k}=`))?.slice(k.length + 3);
  const root = arg("root"), outFile = arg("out");
  if (!root || !outFile) throw new Error("--root and --out are required");
  const matches = await computeV25Golden(root);
  fs.writeFileSync(outFile, JSON.stringify({ schema: "C2V25Golden.v1", source: V25_GOLDEN_SOURCE, recordedFrom: "git archive " + V25_GOLDEN_SOURCE + " (src, tools)",
    env: "parity", node: process.version, excludedKeys: [], recordedAt: new Date().toISOString(), matches }));
  console.log(Object.values(matches).map((m) => `${m.id} ${m.rulesetId} ${m.seed} ticks=${m.ticks} ${m.winner} final=${m.final} detFlag=${m.detFlag}`).join("\n"));
}
