// ============================================================================
//  tools/c1/c1_preview_hook.js — exists only in the 5647 C1 preview build (vite.c1-preview.config.mjs); the production build never reads it.
//
//  Sets window.__esmoC1 (read-only measurement API, never changes a match):
//   · runTool(setupJson, capSec)   — assemble a tool-path MatchSetup with tools/c1/c1_assemble.js and run it headless with a whole-state digest per
//                                     tick (tools/c1/c1_state_digest.js). The Node runner calls the same two functions ⇒ Node vs Chrome, same code.
//   · runLive(setupJson, capSec)   — the same for a career (live) MatchSetup, assembled with the production deps (sharedMatchAssemblerDeps).
//   · live / liveState()           — the career match the UI is playing right now: its MatchSetup JSON, ruleset, math kernel, and the digest of the
//                                     engine the UI drives (compared with a fresh headless run of the same setup after the match ends).
//  forceMatch(prepared) is wired into useLocalServer.js by the preview config: it only RECORDS the prepared match and returns it unchanged.
// ============================================================================
import { assembleMatch } from "../../src/battle/moba/matchAssembler.js";
import { sharedMatchAssemblerDeps } from "../../src/battle/moba/matchAssemblerDeps.js";
import { mathKernelOf } from "../../src/platform/contracts/matchRuleset.js";
import { MOBA_SIMULATION_VERSION } from "../../src/platform/contracts/simulationVersion.js";
import { c1Assemble } from "./c1_assemble.js";
import { stateDigest, runDigest, C1_DIGEST_VERSION } from "./c1_state_digest.js";

const api = {
  digestVersion: C1_DIGEST_VERSION,
  simVersion: MOBA_SIMULATION_VERSION,
  runTool(setupJson, capSec = 3000) { return runDigest(c1Assemble(setupJson).engine, capSec); },
  runLive(setupJson, capSec = 3000) {
    const r = assembleMatch(JSON.parse(setupJson), sharedMatchAssemblerDeps());
    if (!r.ok) throw new Error(`runLive: assembleMatch failed: ${r.errors.map((x) => `${x.code}@${x.field}`).join(",")}`);
    return runDigest(r.engine, capSec);
  },
  live: null,
  liveState() {
    const L = api.live;
    if (!L) return null;
    const e = L.engine;
    return { rulesetId: L.rulesetId, simVersion: L.simVersion, mathKernel: L.mathKernel, setupHash: L.setupHash, t: e.t, over: !!e.over, winner: e.winner ?? null, digest: stateDigest(e) };
  },
};
if (typeof window !== "undefined") window.__esmoC1 = api;

export function forceMatch(prepared) {
  if (prepared?.ok && prepared.setup) {
    api.live = { setupJson: JSON.stringify(prepared.setup), setupHash: prepared.setupHash, rulesetId: prepared.setup.ruleset?.rulesetId ?? null,
      simVersion: prepared.setup.ruleset?.simVersion ?? null, mathKernel: mathKernelOf(prepared.setup.ruleset), engine: prepared.engine };
  }
  return prepared;
}
