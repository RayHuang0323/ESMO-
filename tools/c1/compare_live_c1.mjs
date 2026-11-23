#!/usr/bin/env node
// ============================================================================
//  tools/c1/compare_live_c1.mjs — same career match, Node vs Chrome (C1 browser check, 2026-11-23).
//
//  Input: the MatchSetup JSON the 5647 preview actually played (window.__esmoC1.live.setupJson) and the page's result file
//  ({ ui: digest of the engine the UI drove, headless: fresh in-page run with per-tick digests }).
//  Node assembles the same setup with the production deps (sharedMatchAssemblerDeps, like useLocalServer.prepareLiveMatch) and runs it with the
//  same whole-state digest (tools/c1/c1_state_digest.js). Reports: Node vs in-page headless per tick, and Node final vs the UI engine's final state.
//  Usage: node tools/c1/compare_live_c1.mjs --setup=<setup json> --result=<result json> [--out=<json>]
// ============================================================================
import fs from "node:fs";
import { assembleMatch } from "../../src/battle/moba/matchAssembler.js";
import { sharedMatchAssemblerDeps } from "../../src/battle/moba/matchAssemblerDeps.js";
import { mathKernelOf } from "../../src/platform/contracts/matchRuleset.js";
import { runDigest } from "./c1_state_digest.js";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const setup = JSON.parse(fs.readFileSync(arg("setup"), "utf8"));
const page = JSON.parse(fs.readFileSync(arg("result"), "utf8"));
const r = assembleMatch(setup, sharedMatchAssemblerDeps());
if (!r.ok) throw new Error(`assembleMatch failed: ${r.errors.map((x) => `${x.code}@${x.field}`).join(",")}`);
const N = runDigest(r.engine, 3000), H = page.headless;
let first = -1;
for (let k = 0; k < Math.max(N.perTick.length, H.perTick.length); k++) if (N.perTick[k] !== H.perTick[k]) { first = k; break; }
const out = {
  rulesetId: setup.ruleset?.rulesetId, simVersion: setup.ruleset?.simVersion, mathKernel: mathKernelOf(setup.ruleset),
  node: { ticks: N.ticks, winner: N.winner, endT: N.endT, final: N.final },
  pageHeadless: { ticks: H.ticks, winner: H.winner, endT: H.endT, final: H.final },
  pageUi: page.ui,
  nodeEqualsPageHeadlessEveryTick: first === -1 && N.ticks === H.ticks,
  firstDifferentTick: first,
  nodeFinalEqualsUiEngine: N.final === page.ui?.digest && N.endT === page.ui?.t && N.winner === page.ui?.winner,
};
console.log(JSON.stringify(out, null, 1));
if (arg("out")) fs.writeFileSync(arg("out"), JSON.stringify(out, null, 1));
