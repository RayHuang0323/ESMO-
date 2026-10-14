#!/usr/bin/env node
// ============================================================================
//  tools/capture_match_golden_v21a.mjs — capture the v21-A golden baseline (Phase 3a-C1 Task 7 / G-AC1 reference)
//
//  Run ONCE on the final pre-C2 tree (src/ clean):
//      node tools/capture_match_golden_v21a.mjs > <scratchpad>/golden21a.log 2>&1
//  Writes tools/fixtures/match_golden_v21a.json.  tools/check_match_golden_v21a.mjs re-runs every case and
//  requires them identical (after the C2 refactor: bit-identical proof).
//
//  Flags:  --out=<path>   write elsewhere (determinism re-run: diff the two files)
//          --force        overwrite an existing fixture (refused by default: single-shot capture)
//          --only=a,b     only these case ids (spot checks; requires --out)
//
//  Cases and how they are run: see tools/lib/matchGoldenV21a.mjs (v20's 39 cases through the real wrappers +
//  binding-based tactic plans: every template, every currently offered non-own choice on std).
//  Nothing under src/ is modified.  stdout has no timings (timings go to stderr).
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const argv = process.argv.slice(2);
const argOf = (name) => { const hit = argv.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : null; };
const flag = (name) => argv.includes(`--${name}`);
const err = (s) => process.stderr.write(s + "\n");
const log = (s) => process.stdout.write(s + "\n");
const die = (s) => { err(`FATAL: ${s}`); process.exit(1); };

const L = await import("./lib/matchGoldenV21a.mjs");
const { MOBA_SIMULATION_VERSION, SIMULATION_SEMANTICS_FINGERPRINTS } = await import("../src/platform/contracts/simulationVersion.js");
const { FEATURE_FLAGS } = await import("../src/featureFlags.js");

const OUT = argOf("out") ? path.resolve(argOf("out")) : L.FIXTURE_V21A;
const ONLY = argOf("only") ? new Set(argOf("only").split(",")) : null;
if (ONLY && !argOf("out")) die("--only requires --out (a partial run never writes the real fixture)");
if (!ONLY && fs.existsSync(OUT) && !flag("force")) die(`${OUT} exists. Single-shot capture: pass --force (or --out=<other>) to overwrite.`);

const EXPECT_SIM = "moba-sim.v21";
const EXPECT_FINGERPRINT = "29140fe0cb5a4c86";
if (MOBA_SIMULATION_VERSION !== EXPECT_SIM) die(`simulation version is ${MOBA_SIMULATION_VERSION}, expected ${EXPECT_SIM}`);
const FINGERPRINT = SIMULATION_SEMANTICS_FINGERPRINTS[MOBA_SIMULATION_VERSION];
if (FINGERPRINT !== EXPECT_FINGERPRINT) die(`fingerprint is ${FINGERPRINT}, expected ${EXPECT_FINGERPRINT}`);
const git = (cmd) => execSync(`git ${cmd}`, { cwd: L.ROOT, encoding: "utf8" }).trim();
const GIT_HEAD = git("rev-parse HEAD");
const SRC_DIRTY = git("status --porcelain -- src tools/balance").split("\n").filter(Boolean);
if (SRC_DIRTY.length && !ONLY) die(`src/ (or tools/balance) is not clean — capture must run on committed code:\n${SRC_DIRTY.join("\n")}`);
if (!L.PROBE_SHARES_RUNNER_ENGINE) die("runner engine class differs from src/LogicEngine.js (probe would miss the runner path)");

const v20 = JSON.parse(fs.readFileSync(L.V20_FIXTURE, "utf8"));
const all = L.buildCaseList(v20);
const offered = L.offeredNonOwnOnStd();
if (offered.length !== L.EXPECT_OFFERED_ON_STD) die(`offered non-own choices on std: ${offered.length}, expected ${L.EXPECT_OFFERED_ON_STD}`);
const cases = all.filter((c) => !ONLY || ONLY.has(c.id));
if (!cases.length) die("no cases selected");
const count = (g) => all.filter((c) => c.group === g).length;
log(`capture moba-golden v21a: ${cases.length}/${all.length} cases, sim=${MOBA_SIMULATION_VERSION}, fingerprint=${FINGERPRINT}`);

const t0 = Date.now();
const records = [];
for (const [n, c] of cases.entries()) {
  records.push(L.recordOf(c, v20));
  err(`  ${n + 1}/${cases.length} ${c.id} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

const fixture = {
  schema: L.SCHEMA,
  simVersion: MOBA_SIMULATION_VERSION,
  fingerprint: FINGERPRINT,
  gitHead: GIT_HEAD,
  node: process.version,
  featureFlags: { ...FEATURE_FLAGS },
  hashes: "digest = final engine state; streamHash = sampled tick stream (every 20); resultHash = ChallengeResult hash (challenge) or engine.snapshot() hash at match end (live/runner); calls = configure*/enable* order with 8-hex argument hashes",
  counts: { total: all.length, v20: count("v20"), bindingTemplate: count("binding-template"), bindingChoice: count("binding-choice"), bindingRed: count("binding-red") },
  seeds: {
    v20: "per v20 fixture (tools/fixtures/match_golden_v20.json, read-only)",
    bindingPool: L.BINDING_SEED_POOL,
    bindingRule: "case i of its group uses seeds pool[i % 6] and pool[(i + 3) % 6] (2 seeds per case); roster = v20 golden liveRosters[seed]; blue players/lineup/loadout and build strategy standard as v20 live cases; red = STANDARD_OPP_TACTIC (no opponent team); no talent picks",
  },
  offeredOnStd: offered,
  v20Fixture: { schema: v20.schema, gitHead: v20.gitHead, fingerprint: v20.fingerprint, cases: v20.cases.length },
  cases: records,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(fixture, null, 2) + "\n", "utf8");
log(`wrote ${path.basename(OUT)} — ${records.length} cases (v20 ${count("v20")}, binding-template ${count("binding-template")}, binding-choice ${count("binding-choice")}, binding-red ${count("binding-red")})`);
err(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
