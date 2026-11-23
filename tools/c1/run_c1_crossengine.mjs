#!/usr/bin/env node
// ============================================================================
//  tools/c1/run_c1_crossengine.mjs — C1 closure: the same MatchSetup in Node and in Chrome / Firefox / WebKit (each loading the 5647 preview bundle),
//  whole-engine state digest after EVERY tick (tools/c1/c1_state_digest.js, nothing excluded), compared tick by tick with Node (2026-11-23).
//
//  Single process, engine after engine (one browser open at a time); Node runs each match once and its raw file is reused. Raw files
//  <out>/node/<id>.json and <out>/<engine>/<id>.json are never overwritten (a rerun skips existing files); progress.log, memlog.txt,
//  launches.jsonl and interruptions.jsonl are append-only. WebKit is Playwright's WebKit build on Windows, not iOS/macOS Safari.
//  Usage: node tools/c1/run_c1_crossengine.mjs --plan=<plan json> --out=<dir outside repo> [--engines=chrome,firefox,webkit] [--kernel=det]
// ============================================================================
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const plan = JSON.parse(fs.readFileSync(arg("plan"), "utf8"));
const OUT = arg("out"), URL0 = arg("url", "http://127.0.0.1:5647/ESMO-/"), ENGINES = arg("engines", "chrome,firefox,webkit").split(",").filter(Boolean), KERNEL = arg("kernel", "det");
if (!OUT || path.resolve(OUT).startsWith(ROOT)) throw new Error("--out must be a directory outside the repo");
fs.mkdirSync(path.join(OUT, "node"), { recursive: true });
const log = (s) => { const line = `[${new Date().toISOString()}] ${s}`; console.log(line); fs.appendFileSync(path.join(OUT, "progress.log"), line + "\n"); };
const mem = (tag) => fs.appendFileSync(path.join(OUT, "memlog.txt"), `${new Date().toISOString()} ${tag} freeMB=${Math.round(os.freemem() / 1048576)} rssMB=${Math.round(process.memoryUsage().rss / 1048576)}\n`);
const RUNNING = path.join(OUT, "RUNNING");
if (fs.existsSync(RUNNING)) fs.appendFileSync(path.join(OUT, "interruptions.jsonl"), JSON.stringify({ detectedAt: new Date().toISOString(), previous: fs.readFileSync(RUNNING, "utf8") }) + "\n");
fs.writeFileSync(RUNNING, JSON.stringify({ startedAt: new Date().toISOString(), pid: process.pid }));

const ENVL = await import("../owner_preview/lib_parity_env_v24.mjs");
ENVL.applyEnv(plan.toolEnv ?? "parity");
const { careerContext } = await import("../lib/careerLiveInputs.mjs");
const { modules, buildBalanceMatchSetup, mirroredRoster } = await import("../balance/moba_items_balance_runner.mjs");
const { c1Assemble } = await import("./c1_assemble.js");
const { runDigest, C1_DIGEST_VERSION } = await import("./c1_state_digest.js");
const { MOBA_SIMULATION_VERSION, SIMULATION_SEMANTICS_FINGERPRINTS } = await import("../../src/platform/contracts/simulationVersion.js");
const { matchSetupHash } = await import("../../src/platform/contracts/matchSetup.js");
const { openEngine } = await import("./c1_engines.mjs");
const C = await careerContext(), M = await modules();
const binding = (t) => C.bindTacticPlanToCurrentVersions(C.createTacticPlan({ templateId: t, choices: {} }).plan);
const setupOf = (it) => JSON.stringify(buildBalanceMatchSetup(it.seed, it.config, M, 1, mirroredRoster(it.seed, M),
  { blue: { kind: "binding", binding: binding(it.blue) }, red: { kind: "binding", binding: binding(it.red) } }, plan.rulesets[KERNEL]).setup);
const head = execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
const dirty = execSync("git status --porcelain -- src", { cwd: ROOT, encoding: "utf8" }).trim();
const env = { head, srcDirty: dirty.length > 0, node: process.version, sim: MOBA_SIMULATION_VERSION, fingerprint: SIMULATION_SEMANTICS_FINGERPRINTS[MOBA_SIMULATION_VERSION],
  digest: C1_DIGEST_VERSION, plan: plan.planId, kernel: KERNEL, ruleset: plan.rulesets[KERNEL], toolEnv: plan.toolEnv ?? "parity" };
fs.appendFileSync(path.join(OUT, "launches.jsonl"), JSON.stringify({ at: new Date().toISOString(), argv: process.argv.slice(2), engines: ENGINES, ...env }) + "\n");
log(`start ${JSON.stringify(env)} engines=${ENGINES.join(",")} items=${plan.items.length}`);

function nodeRun(it) {
  const f = path.join(OUT, "node", `${it.id}.json`);
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8"));
  const s = setupOf(it), t = Date.now(), N = runDigest(c1Assemble(s).engine, 3000);
  const rec = { id: it.id, item: it, setupHash: matchSetupHash(JSON.parse(s)), setupJson: s, env, nodeMs: Date.now() - t,
    ticks: N.ticks, over: N.over, winner: N.winner, endT: N.endT, kills: N.kills, gold: N.gold, final: N.final, perTick: N.perTick, writtenAt: new Date().toISOString() };
  fs.writeFileSync(f + ".tmp", JSON.stringify(rec)); fs.renameSync(f + ".tmp", f);
  return rec;
}
let done = 0, skipped = 0;
try {
  for (const name of ENGINES) {
    fs.mkdirSync(path.join(OUT, name), { recursive: true });
    const todo = plan.items.filter((it) => !fs.existsSync(path.join(OUT, name, `${it.id}.json`)));
    skipped += plan.items.length - todo.length;
    if (!todo.length) continue;
    let E = null;
    try {
      E = await openEngine(name, { port: 9478 });
      await E.goto(URL0);
      let sim = null;
      for (let i = 0; i < 120 && !sim; i++) { sim = await E.evaluate("return window.__esmoC1 ? window.__esmoC1.simVersion : null;"); if (!sim) await new Promise((r) => setTimeout(r, 500)); }
      if (sim !== MOBA_SIMULATION_VERSION) throw new Error(`page simVersion ${sim} ≠ Node ${MOBA_SIMULATION_VERSION}`);
      log(`engine ${name} ${E.ua} ${E.browserVersion ?? ""}`);
      for (const it of todo) {
        const N = nodeRun(it);
        const t = Date.now(); const B = await E.evaluate(`return window.__esmoC1.runTool(${JSON.stringify(N.setupJson)}, 3000);`); const ms = Date.now() - t;
        let first = -1; const n = Math.max(N.perTick.length, B.perTick.length);
        for (let k = 0; k < n; k++) if (N.perTick[k] !== B.perTick[k]) { first = k; break; }
        const identical = first === -1 && N.ticks === B.ticks && N.final === B.final && N.winner === B.winner && N.endT === B.endT;
        const rec = { id: it.id, engine: name, ua: E.ua, browserVersion: E.browserVersion ?? null, env, setupHash: N.setupHash, identical, firstDifferentTick: first, engineMs: ms,
          node: { ticks: N.ticks, winner: N.winner, endT: N.endT, final: N.final }, result: { ticks: B.ticks, over: B.over, winner: B.winner, endT: B.endT, kills: B.kills, gold: B.gold, final: B.final, perTick: B.perTick },
          writtenAt: new Date().toISOString() };
        const f = path.join(OUT, name, `${it.id}.json`);
        fs.writeFileSync(f + ".tmp", JSON.stringify(rec)); fs.renameSync(f + ".tmp", f);
        done++; mem(`${name}/${it.id}`);
        log(`${name} ${it.id} seed=${it.seed} ${identical ? "IDENTICAL" : "DIFF@" + first} ticks=${N.ticks}/${B.ticks} ${N.winner}/${B.winner} node=${N.nodeMs}ms ${name}=${ms}ms`);
      }
    } catch (e) {
      log(`engine ${name} ERROR ${String(e.message ?? e).slice(0, 300)}`);
      fs.appendFileSync(path.join(OUT, "engine_errors.jsonl"), JSON.stringify({ at: new Date().toISOString(), engine: name, error: String(e.message ?? e) }) + "\n");
    } finally { try { await E?.close(); } catch {} }
  }
} finally {
  fs.rmSync(RUNNING, { force: true });
  log(`end done=${done} skipped=${skipped}`);
}
