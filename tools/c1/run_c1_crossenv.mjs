#!/usr/bin/env node
// ============================================================================
//  tools/c1/run_c1_crossenv.mjs — C1 cross-runtime match runner: the same MatchSetup in Node and in headless Chrome (5647 preview bundle), whole-engine
//  state digest after EVERY tick on both sides (tools/c1/c1_state_digest.js), compared tick by tick (2026-11-23).
//
//  Single process, one match at a time. Each item × kernel writes one raw file <out>/<kernel>/<id>.json (full per-tick digests of both sides) and is
//  never overwritten: a rerun skips files that exist. progress.log, memlog.txt and interruptions.jsonl are append-only.
//  Kernels: det = balanceTool.v25 (mathKernel "det.v1"); native = balanceTool.v24 (control, same seeds).
//  The plan sets toolEnv (tools/owner_preview/lib_parity_env_v24.mjs; default "parity").
//  Usage: node tools/c1/run_c1_crossenv.mjs --plan=<plan json> --out=<dir outside repo> [--kernels=det,native] [--url=http://127.0.0.1:5647/ESMO-/] [--port=9472]
// ============================================================================
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const plan = JSON.parse(fs.readFileSync(arg("plan"), "utf8"));
const OUT = arg("out"), URL0 = arg("url", "http://127.0.0.1:5647/ESMO-/"), KERNELS = arg("kernels", "det,native").split(",");
if (!OUT || path.resolve(OUT).startsWith(ROOT)) throw new Error("--out must be a directory outside the repo");
fs.mkdirSync(OUT, { recursive: true });
const log = (s) => { const line = `[${new Date().toISOString()}] ${s}`; console.log(line); fs.appendFileSync(path.join(OUT, "progress.log"), line + "\n"); };
const mem = (tag) => fs.appendFileSync(path.join(OUT, "memlog.txt"), `${new Date().toISOString()} ${tag} freeMB=${Math.round(os.freemem() / 1048576)} rssMB=${Math.round(process.memoryUsage().rss / 1048576)}\n`);
const RUNNING = path.join(OUT, "RUNNING");
if (fs.existsSync(RUNNING)) fs.appendFileSync(path.join(OUT, "interruptions.jsonl"), JSON.stringify({ detectedAt: new Date().toISOString(), previous: fs.readFileSync(RUNNING, "utf8") }) + "\n");
fs.writeFileSync(RUNNING, JSON.stringify({ startedAt: new Date().toISOString(), pid: process.pid }));

//  Tool environment (default Career-Parity: skills, passives and power curve on, talents off — the Sprint 2A formal environment).
const ENVL = await import("../owner_preview/lib_parity_env_v24.mjs");
ENVL.applyEnv(plan.toolEnv ?? "parity");
const { careerContext } = await import("../lib/careerLiveInputs.mjs");
const { modules, buildBalanceMatchSetup, mirroredRoster } = await import("../balance/moba_items_balance_runner.mjs");
const { c1Assemble } = await import("./c1_assemble.js");
const { runDigest, C1_DIGEST_VERSION } = await import("./c1_state_digest.js");
const { MOBA_SIMULATION_VERSION, SIMULATION_SEMANTICS_FINGERPRINTS } = await import("../../src/platform/contracts/simulationVersion.js");
const { matchSetupHash } = await import("../../src/platform/contracts/matchSetup.js");
const { launchChrome } = await import("../browser/cdp.mjs");
const C = await careerContext();
const M = await modules();
const RULESET = { det: plan.rulesets.det, native: plan.rulesets.native };
const binding = (t) => C.bindTacticPlanToCurrentVersions(C.createTacticPlan({ templateId: t, choices: {} }).plan);
const head = execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
const dirty = execSync("git status --porcelain -- src", { cwd: ROOT, encoding: "utf8" }).trim();
const env = { head, srcDirty: dirty.length > 0, node: process.version, sim: MOBA_SIMULATION_VERSION, fingerprint: SIMULATION_SEMANTICS_FINGERPRINTS[MOBA_SIMULATION_VERSION], digest: C1_DIGEST_VERSION, plan: plan.planId, toolEnv: plan.toolEnv ?? "parity" };
fs.appendFileSync(path.join(OUT, "launches.jsonl"), JSON.stringify({ at: new Date().toISOString(), argv: process.argv.slice(2), ...env }) + "\n");
log(`start ${JSON.stringify(env)} kernels=${KERNELS.join(",")} items=${plan.items.length}`);

const chrome = await launchChrome({ url: "about:blank", port: Number(arg("port", "9472")), headless: true });
let done = 0, skipped = 0;
try {
  await chrome.navigate(URL0);
  const ready = async () => chrome.evaluate("return !!window.__esmoC1 && window.__esmoC1.simVersion;");
  for (let i = 0; i < 60 && !(await ready()); i++) await new Promise((r) => setTimeout(r, 500));
  const pageSim = await ready(), ua = await chrome.evaluate("return navigator.userAgent;");
  if (pageSim !== MOBA_SIMULATION_VERSION) throw new Error(`preview page simVersion ${pageSim} ≠ Node ${MOBA_SIMULATION_VERSION} (stale build?)`);
  log(`chrome ${ua}`);
  for (const kernel of KERNELS) {
    fs.mkdirSync(path.join(OUT, kernel), { recursive: true });
    for (const it of plan.items) {
      const file = path.join(OUT, kernel, `${it.id}.json`);
      if (fs.existsSync(file)) { skipped++; continue; }
      const tactic = { blue: { kind: "binding", binding: binding(it.blue) }, red: { kind: "binding", binding: binding(it.red) } };
      const { setup } = buildBalanceMatchSetup(it.seed, it.config, M, 1, mirroredRoster(it.seed, M), tactic, RULESET[kernel]);
      const setupJson = JSON.stringify(setup);
      let t = Date.now(); const N = runDigest(c1Assemble(setupJson).engine, 3000); const nodeMs = Date.now() - t;
      t = Date.now(); const B = await chrome.evaluate(`return window.__esmoC1.runTool(${JSON.stringify(setupJson)}, 3000);`); const chromeMs = Date.now() - t;
      let first = -1; const n = Math.max(N.perTick.length, B.perTick.length);
      for (let k = 0; k < n; k++) if (N.perTick[k] !== B.perTick[k]) { first = k; break; }
      const identical = first === -1 && N.ticks === B.ticks && N.final === B.final && N.winner === B.winner && N.endT === B.endT;
      const rec = { id: it.id, kernel, item: it, rulesetId: setup.ruleset.rulesetId, mathKernel: setup.ruleset.layers.mathKernel ?? "native", setupHash: matchSetupHash(setup), env, chromeUa: ua,
        identical, firstDifferentTick: first, nodeMs, chromeMs,
        node: { ticks: N.ticks, over: N.over, winner: N.winner, endT: N.endT, kills: N.kills, gold: N.gold, final: N.final, perTick: N.perTick },
        chrome: { ticks: B.ticks, over: B.over, winner: B.winner, endT: B.endT, kills: B.kills, gold: B.gold, final: B.final, perTick: B.perTick }, writtenAt: new Date().toISOString() };
      fs.writeFileSync(file + ".tmp", JSON.stringify(rec)); fs.renameSync(file + ".tmp", file);
      done++; mem(`${kernel}/${it.id}`);
      log(`${kernel} ${it.id} seed=${it.seed} ${it.blue}/${it.red} ${identical ? "IDENTICAL" : "DIFF@" + first} ticks=${N.ticks}/${B.ticks} ${N.winner}/${B.winner} node=${nodeMs}ms chrome=${chromeMs}ms`);
    }
  }
} finally {
  await chrome.close();
  fs.rmSync(RUNNING, { force: true });
  log(`end done=${done} skipped=${skipped}`);
}
