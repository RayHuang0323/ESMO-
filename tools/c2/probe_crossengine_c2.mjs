#!/usr/bin/env node
// ============================================================================
//  tools/c2/probe_crossengine_c2.mjs — C2 DEV diagnosis (not a verdict): the same balance-tool MatchSetup run in Node and in browser engines
//  (5648 preview bundle, window.__esmoC1.runTool), whole-engine state digest after every tick; on a mismatch, the differing state leaves at the
//  first different tick (window.__esmoC1.stateLeavesAt). Used seeds only — the formal run uses pre-registered never-used seeds.
//  Usage: node tools/c2/probe_crossengine_c2.mjs --out=<dir outside repo> [--ruleset=balanceTool.v26] [--engines=chrome,firefox,webkit]
//         [--items=<id:seed:blue:red,...>] [--cap=3000] [--url=http://127.0.0.1:5648/ESMO-/]
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const OUT = arg("out"); if (!OUT || path.resolve(OUT).startsWith(ROOT)) throw new Error("--out must be a directory outside the repo");
fs.mkdirSync(OUT, { recursive: true });
const RULESET = arg("ruleset", "balanceTool.v26"), ENGINES = arg("engines", "chrome,firefox,webkit").split(",").filter(Boolean);
const CAP = Number(arg("cap", "3000")), URL0 = arg("url", "http://127.0.0.1:5648/ESMO-/");
//  Default items: C1's tick-0 locator seed (142227 mirror), C1 dev item X001, and two C1 winner-flip style seeds.
const ITEMS = arg("items", "D1:142227:v2.jungle_invasion:v2.jungle_invasion,D2:153001:classic.m2:classic.m5,D3:142243:v2.jungle_invasion:classic.m7,D4:146045:classic.m7:v2.jungle_invasion")
  .split(",").map((s) => { const [id, seed, blue, red] = s.split(":"); return { id, seed: Number(seed), blue, red }; });
const log = (s) => { const line = `[${new Date().toISOString()}] ${s}`; console.log(line); fs.appendFileSync(path.join(OUT, "progress.log"), line + "\n"); };
const mem = (tag) => fs.appendFileSync(path.join(OUT, "memlog.txt"), `${new Date().toISOString()} ${tag} freeMB=${Math.round(os.freemem() / 1048576)} rssMB=${Math.round(process.memoryUsage().rss / 1048576)}\n`);

const ENVL = await import("../owner_preview/lib_parity_env_v24.mjs");
ENVL.applyEnv("parity");
const { careerContext } = await import("../lib/careerLiveInputs.mjs");
const { modules, buildBalanceMatchSetup, mirroredRoster } = await import("../balance/moba_items_balance_runner.mjs");
const { c1Assemble } = await import("../c1/c1_assemble.js");
const { runDigest, stateLeaves } = await import("../c1/c1_state_digest.js");
const { openEngine } = await import("../c1/c1_engines.mjs");
const { MOBA_SIMULATION_VERSION } = await import("../../src/platform/contracts/simulationVersion.js");
const C = await careerContext(), M = await modules();
const binding = (t) => C.bindTacticPlanToCurrentVersions(C.createTacticPlan({ templateId: t, choices: {} }).plan);
const setupOf = (it) => JSON.stringify(buildBalanceMatchSetup(it.seed, "standard", M, 1, mirroredRoster(it.seed, M),
  { blue: { kind: "binding", binding: binding(it.blue) }, red: { kind: "binding", binding: binding(it.red) } }, RULESET).setup);

log(`start ruleset=${RULESET} sim=${MOBA_SIMULATION_VERSION} engines=${ENGINES.join(",")} items=${ITEMS.map((i) => i.id).join(",")}`);
const nodeRuns = {};
for (const it of ITEMS) {
  const s = setupOf(it), t = Date.now(), N = runDigest(c1Assemble(s).engine, CAP);
  nodeRuns[it.id] = { s, N };
  log(`node ${it.id} seed=${it.seed} ticks=${N.ticks} winner=${N.winner} endT=${N.endT} final=${N.final} ms=${Date.now() - t}`); mem(`node ${it.id}`);
}
const results = [];
for (const name of ENGINES) {
  const E = await openEngine(name, { port: 9485 });
  try {
    await E.goto(URL0);
    for (let i = 0; i < 120; i++) { if (await E.evaluate("return !!(window.__esmoC1 && window.__esmoC1.runTool);")) break; await new Promise((r) => setTimeout(r, 500)); }
    const sim = await E.evaluate("return window.__esmoC1.simVersion;");
    for (const it of ITEMS) {
      const { s, N } = nodeRuns[it.id], t = Date.now();
      const B = await E.evaluate(`return window.__esmoC1.runTool(${JSON.stringify(s)}, ${CAP});`);
      let first = -1; const n = Math.max(N.perTick.length, B.perTick.length);
      for (let k = 0; k < n; k++) if (N.perTick[k] !== B.perTick[k]) { first = k; break; }
      const row = { id: it.id, seed: it.seed, engine: name, ua: E.ua, bundleSim: sim, identical: first === -1, firstDifferentTick: first,
        node: { ticks: N.ticks, winner: N.winner, endT: N.endT, final: N.final }, engineRun: { ticks: B.ticks, winner: B.winner, endT: B.endT, final: B.final }, ms: Date.now() - t };
      if (first >= 0) {
        const e = c1Assemble(s).engine; for (let i = 0; i < first && !e.over; i++) e.tick(0.5);
        const a = stateLeaves(e), b = await E.evaluate(`return window.__esmoC1.stateLeavesAt(${JSON.stringify(s)}, ${first});`);
        const mb = new Map(b), diffs = [];
        for (const [p, v] of a) { const w = mb.get(p); if (w !== v) diffs.push({ path: p, node: v, engine: w ?? "(missing)" }); }
        row.differingLeaves = diffs.length; row.firstLeaves = diffs.slice(0, 16);
      }
      results.push(row);
      log(`${name} ${it.id} ${row.identical ? "IDENTICAL" : `DIFF first tick ${first} leaves=${row.differingLeaves}`} winner node/engine=${N.winner}/${B.winner} ms=${row.ms}`); mem(`${name} ${it.id}`);
    }
  } finally { await E.close(); }
}
fs.writeFileSync(path.join(OUT, "probe.json"), JSON.stringify({ ruleset: RULESET, sim: MOBA_SIMULATION_VERSION, node: process.version, items: ITEMS, results }, null, 1));
log(`done identical=${results.filter((r) => r.identical).length}/${results.length}`);
