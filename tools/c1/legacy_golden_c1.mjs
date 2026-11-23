// ============================================================================
//  tools/c1/legacy_golden_c1.mjs — legacy-behaviour golden for TD-TAC-60 (2026-11-23).
//
//  A fixed list of v20–v24 matches (tool path, Career-Parity) run with the engine of a given source tree, whole-engine state digest after every
//  tick (tools/c1/c1_state_digest.js). The fixture tools/fixtures/c1_legacy_golden_053fd582.json was recorded from an export of commit 053fd582
//  (the source every v24 historical measurement gate was satisfied on); tools/check_c1_legacy_golden.mjs replays the same list on the current tree.
//  The only key excluded from the digest is the engine config flag `_detMath` that C1 added; the check asserts it is false on every legacy match.
//  CLI (recording, only against an exported historical tree):  node tools/c1/legacy_golden_c1.mjs --root=<exported tree> --out=<fixture json>
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { runDigest } from "./c1_state_digest.js";

export const LEGACY_GOLDEN_SOURCE = "053fd582";
export const LEGACY_GOLDEN_MATCHES = Object.freeze([
  { id: "L1", rulesetId: "balanceTool.v20", seed: 146001, blue: null, red: null },
  { id: "L2", rulesetId: "balanceTool.v21", seed: 146002, blue: null, red: null },
  { id: "L3", rulesetId: "balanceTool.v22", seed: 146003, blue: null, red: null },
  { id: "L4", rulesetId: "balanceTool.v23", seed: 146004, blue: null, red: null },
  { id: "L5", rulesetId: "balanceTool.v24", seed: 146005, blue: null, red: null },
  { id: "L6", rulesetId: "balanceTool.v24", seed: 142227, blue: "v2.jungle_invasion", red: "v2.jungle_invasion" },
  { id: "L7", rulesetId: "balanceTool.v24", seed: 142243, blue: "v2.jungle_invasion", red: "classic.m7" },
  { id: "L8", rulesetId: "balanceTool.v23", seed: 146045, blue: "classic.m7", red: "v2.jungle_invasion" },
]);
export const EXCLUDED_KEYS = Object.freeze(["_detMath"]);

/** Run every golden match with the engine of `root` (repo-shaped tree with src/ and tools/). */
export async function computeLegacyGolden(root) {
  const u = (p) => pathToFileURL(path.join(root, p)).href;
  const ENVL = await import(u("tools/owner_preview/lib_parity_env_v24.mjs"));
  ENVL.applyEnv("parity");
  const { careerContext } = await import(u("tools/lib/careerLiveInputs.mjs"));
  const { configure, modules } = await import(u("tools/balance/moba_items_balance_runner.mjs"));
  const C = await careerContext(), M = await modules();
  const binding = (t) => C.bindTacticPlanToCurrentVersions(C.createTacticPlan({ templateId: t, choices: {} }).plan);
  const out = {};
  for (const m of LEGACY_GOLDEN_MATCHES) {
    const tactic = m.blue ? { blue: { kind: "binding", binding: binding(m.blue) }, red: { kind: "binding", binding: binding(m.red) } } : null;
    const e = configure(m.seed, "standard", M, 1, null, tactic, m.rulesetId).e;
    const detFlag = e._detMath ?? null;
    const d = runDigest(e, 3000, { excludeTopKeys: EXCLUDED_KEYS });
    out[m.id] = { ...m, detFlag, ticks: d.ticks, winner: d.winner, endT: d.endT, final: d.final, perTick: d.perTick };
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const arg = (k) => process.argv.find((x) => x.startsWith(`--${k}=`))?.slice(k.length + 3);
  const root = arg("root"), outFile = arg("out");
  if (!root || !outFile) throw new Error("--root and --out are required");
  const matches = await computeLegacyGolden(root);
  fs.writeFileSync(outFile, JSON.stringify({ schema: "C1LegacyGolden.v1", source: LEGACY_GOLDEN_SOURCE, recordedFrom: "git archive " + LEGACY_GOLDEN_SOURCE + " (src, tools)",
    env: "parity", node: process.version, excludedKeys: EXCLUDED_KEYS, recordedAt: new Date().toISOString(), matches }));
  console.log(Object.values(matches).map((m) => `${m.id} ${m.rulesetId} ${m.seed} ticks=${m.ticks} ${m.winner} final=${m.final} detFlag=${m.detFlag}`).join("\n"));
}
