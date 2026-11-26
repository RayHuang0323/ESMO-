#!/usr/bin/env node
// ============================================================================
//  tools/c1/run_crossengine_checkpoint_v2.mjs — 四引擎一致性（Node ⇔ Chrome／Firefox／WebKit 逐 tick 全狀態 digest）的 Checkpoint 版 runner
//  （TD-66，Release Engineering S1.1，2026-11-26）。獨立版本化候選：歷史工具 tools/c1/run_c1_crossengine.mjs 不變。
//
//    node tools/c1/run_crossengine_checkpoint_v2.mjs --plan=<plan json> --dir=<repo 外新資料夾> [--engines=chrome,firefox,webkit]
//         [--kernel=det] [--url=http://127.0.0.1:5647/ESMO-/] [--stop-after=<n>]
//    續跑：同樣參數加 --resume（計畫、工具、候選 SHA、指紋、kernel、程序參數任何一項不同 ⇒ BLOCKED）
//    匯出給既有 judge：--export=<repo 外新資料夾>（只在全部完成且完整性 PASS 時）
//      然後：node tools/c2/judge_c2_crossengine.mjs --plan=… --data=<匯出資料夾> --repeatPlan=… --repeat=<另一個匯出資料夾> --fingerprint=…
//
//  setup 的組法與歷史 runner 相同（同一組 import、同一個 buildBalanceMatchSetup／binding／plan.rulesets[kernel]、cap 3000）。
//  WebKit 是 Playwright 在 Windows 上的 WebKit build，不是 iOS／macOS Safari。
//  exit：0 完成｜1 FAIL（資料被改過）｜2 BLOCKED（版本／工具／候選／瀏覽器版本不符）｜3 中斷（可 --resume）
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { openRun, runAll, exportFormal, CROSSENGINE_CP_VERSION } from "../lib/crossengineCheckpoint.mjs";
import { openCheckpoint } from "../lib/checkpoint.mjs";

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const HERE = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.resolve(HERE, "../..");
const die = (code, msg) => { console.log(msg); console.log(`CROSSENGINE_CP RESULT=${["COMPLETE", "FAIL", "BLOCKED", "INTERRUPTED"][code]} exit=${code}`); process.exit(code); };
const DIR = arg("dir"); if (!DIR || path.resolve(DIR).startsWith(ROOT)) die(2, "--dir 必須是 repo 外的資料夾");
const head = execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
const tree = execSync("git rev-parse HEAD^{tree}", { cwd: ROOT, encoding: "utf8" }).trim();
const srcDirty = execSync("git status --porcelain -- src", { cwd: ROOT, encoding: "utf8" }).trim().length > 0;

if (arg("export")) {
  const out = path.resolve(arg("export")); if (out.startsWith(ROOT)) die(2, "--export 必須在 repo 外");
  const r = exportFormal(openCheckpoint(path.resolve(DIR)), out, head);
  die(r.status === "PASS" ? 0 : r.status === "FAIL" ? 1 : 2, r.status === "PASS" ? `匯出 ${r.files} 個 raw 到 ${out}（合計 ${r.rawAggregateSha256}）` : `不能匯出：${JSON.stringify(r.checks).slice(0, 600)}`);
}

const planPath = path.resolve(arg("plan")); const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
const ENGINES = arg("engines", "chrome,firefox,webkit").split(",").filter(Boolean), KERNEL = arg("kernel", "det"), URL0 = arg("url", "http://127.0.0.1:5647/ESMO-/");
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
const fingerprint = SIMULATION_SEMANTICS_FINGERPRINTS[MOBA_SIMULATION_VERSION];
// 與歷史 runner 相同的 raw env 欄位（judge 會檢查 head／srcDirty／sim／fingerprint）
const recordEnv = { head, srcDirty, node: process.version, sim: MOBA_SIMULATION_VERSION, fingerprint, digest: C1_DIGEST_VERSION, plan: plan.planId, kernel: KERNEL, ruleset: plan.rulesets[KERNEL], toolEnv: plan.toolEnv ?? "parity", runner: CROSSENGINE_CP_VERSION };
const tools = [fileURLToPath(import.meta.url), path.join(ROOT, "tools/lib/crossengineCheckpoint.mjs"), path.join(HERE, "c1_engines.mjs"), path.join(HERE, "c1_state_digest.js"), path.join(HERE, "c1_assemble.js"), path.join(ROOT, "tools/c2/judge_c2_crossengine.mjs")];

let run;
try { run = openRun({ dir: path.resolve(DIR), resume: process.argv.includes("--resume"), plan, planPath, engines: ENGINES, candidateSha: head, treeSha: tree, srcDirty, tools,
  env: { nodeVersion: process.version, sim: MOBA_SIMULATION_VERSION, fingerprint, digest: C1_DIGEST_VERSION, kernel: KERNEL }, procedure: { url: URL0, cap: 3000, toolEnv: plan.toolEnv ?? "parity", engines: ENGINES } }); }
catch (e) { die(e.code === "dir_not_empty" || e.code === "src_dirty" || e.code === "cases_changed" ? 2 : 1, `${e.code}: ${e.message}`); }
for (const c of run.validation.checks.filter((x) => x.status !== "PASS")) console.log(`  ${c.status} ${c.id}  ${c.detail}`);
if (run.validation.status !== "PASS") die(run.validation.status === "FAIL" ? 1 : 2, `checkpoint 驗證 ${run.validation.status}：不續跑`);

const log = (s) => { const line = `[${new Date().toISOString()}] ${s}`; console.log(line); fs.appendFileSync(path.join(DIR, "progress.log"), line + "\n"); };
const res = await runAll(run.cp, plan, ENGINES, {
  log, recordEnv, stopAfter: arg("stop-after") ? Number(arg("stop-after")) : Infinity,
  nodeRun: async (it) => { const s = setupOf(it), t = Date.now(), N = runDigest(c1Assemble(s).engine, 3000); return { setupHash: matchSetupHash(JSON.parse(s)), setupJson: s, nodeMs: Date.now() - t, ticks: N.ticks, over: N.over, winner: N.winner, endT: N.endT, kills: N.kills, gold: N.gold, final: N.final, perTick: N.perTick }; },
  openEngine: async (name) => {
    const E = await openEngine(name, { port: 9479 }); await E.goto(URL0);
    let sim = null; for (let i = 0; i < 120 && !sim; i++) { sim = await E.evaluate("return window.__esmoC1 ? window.__esmoC1.simVersion : null;"); if (!sim) await new Promise((r) => setTimeout(r, 500)); }
    if (sim !== MOBA_SIMULATION_VERSION) { await E.close(); throw new Error(`page simVersion ${sim} ≠ Node ${MOBA_SIMULATION_VERSION}`); }
    log(`engine ${name} ${E.ua} ${E.browserVersion ?? ""}`); return E;
  },
  runOnEngine: async (E, N) => { const B = await E.evaluate(`return window.__esmoC1.runTool(${JSON.stringify(N.setupJson)}, 3000);`); return { ticks: B.ticks, over: B.over, winner: B.winner, endT: B.endT, kills: B.kills, gold: B.gold, final: B.final, perTick: B.perTick }; },
});
die(res.status === "COMPLETE" ? 0 : res.status === "BLOCKED" ? 2 : 3, `${res.status}：${res.detail}（這次完成 ${res.ran} 個案例；checkpoint ${DIR}）`);
