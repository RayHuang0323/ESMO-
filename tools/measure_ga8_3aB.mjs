#!/usr/bin/env node
// ============================================================================
//  tools/measure_ga8_3aB.mjs — Phase 3a-B P2-4：G-A8 主導計畫掃描（登記 tools/fixtures/ga8_registration_3aB.json）
//
//  node tools/measure_ga8_3aB.mjs --plan | --run --dir=<repo 外> [--workers=3] | --report --dir=<同一個> | --selftest
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runStudy, readKey, provenance, sha16, auditStudy, errorRule, ROOT } from "./lib/studyRunner.mjs";

const SELF = fileURLToPath(import.meta.url);
const args = process.argv.slice(2);
const flag = (k) => args.includes(`--${k}`);
const val = (k, d = null) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const REG_REL = "tools/fixtures/ga8_registration_3aB.json";
const REG_TEXT = fs.readFileSync(path.join(ROOT, REG_REL), "utf8"), REG = JSON.parse(REG_TEXT);
const imp = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
/** 儀器檢查（--run 即時、--report 全部重查；審查 M1）。 */
const recCheck = (r) => (r.director === "core.v1" && r.laneFrame === "teamRelative" && r.ruleset === "balanceTool.v21" && r.layers?.heroSkills && !r.layers?.battleTalents ? [] : ["instrument mismatch"]);

if (flag("ga8-worker")) {
  process.env.ESMO_BALANCE_SKILLS = "on";
  delete process.env.ESMO_BALANCE_TALENTS;
  const { modules, configure } = await imp("tools/balance/moba_items_balance_runner.mjs");
  const { tacticInputOf } = await imp("tools/lib/tacticTruthSim.mjs");
  const { objectiveLayoutForSeed } = await imp("src/platform/contracts/objectiveLayout.js");
  const M = await modules();
  process.on("message", async (t) => {
    try {
      const plan = tacticInputOf({ templateId: t.template, choices: {} }), std = tacticInputOf({ templateId: "std", choices: {} });
      const blueIsTemplate = t.seed % 2 === 1;
      const { e } = configure(t.seed, "standard", M, 1, null, { blue: blueIsTemplate ? plan : std, red: blueIsTemplate ? std : plan }, "balanceTool.v21");
      for (let i = 1; i * 0.5 <= 3600 && !e.over; i++) e.tick(0.5);
      const side = blueIsTemplate ? "blue" : "red";
      const win = e.over && (e.winner === "blue" || e.winner === "red") ? (e.winner === side ? 1 : 0) : 0.5;
      process.send({ type: "done", id: t.id, rec: { seed: t.seed, template: t.template, side, layout: objectiveLayoutForSeed(t.seed), ruleset: "balanceTool.v21",
        layers: { heroSkills: !!M.skills, heroPassives: !!M.passives, heroPowerCurve: !!M.curves, battleTalents: !!M.talents }, director: e.director?.mode ?? null, laneFrame: e.director?.laneFrame ?? null, win, duration: e.t } });
    } catch (e) { process.send({ type: "error", id: t.id, error: String(e?.stack ?? e) }); }
  });
  process.send({ type: "ready" });
  await new Promise(() => {});
}

export function templateVerdict(wins) {
  const n = wins.length, p = wins.reduce((a, b) => a + b, 0) / Math.max(1, n);
  const sd = Math.sqrt(wins.reduce((a, b) => a + (b - p) ** 2, 0) / Math.max(1, n - 1)), se = sd / Math.sqrt(Math.max(1, n));
  const lo = p - 1.96 * se, hi = p + 1.96 * se;
  return { n, rate: p, lo, hi, stop: p >= 0.6 && lo > 0.55, warn: p >= 0.57 || p <= 0.43 };
}
if (flag("selftest")) {
  let pass = 0, fail = 0;
  const ck = (l, ok) => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}`); };
  const ws = (n, p) => Array.from({ length: n }, (_, i) => ((i * 37) % 100 < p * 100 ? 1 : 0));
  ck("S1 0.50 ⇒ 不 STOP 不 WARN；0.65 ⇒ STOP；0.58 ⇒ WARN 不 STOP；0.42 ⇒ WARN", !templateVerdict(ws(400, 0.5)).stop && !templateVerdict(ws(400, 0.5)).warn && templateVerdict(ws(400, 0.65)).stop && templateVerdict(ws(400, 0.58)).warn && !templateVerdict(ws(400, 0.58)).stop && templateVerdict(ws(400, 0.42)).warn);
  ck("S2 登記：seeds 25001–25400、閾值 0.60／0.55", REG.seeds.range === "25001-25400" && /0\.60/.test(REG.thresholds["STOP (dominant)"]));
  console.log(`\nselftest：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
  process.exit(fail ? 1 : 0);
}

const { TACTIC_TEMPLATE_LIST } = await imp("src/platform/tactics/tacticTemplates.js");
const TEMPLATES = TACTIC_TEMPLATE_LIST.map((t) => t.templateId);
const [S0, S1] = REG.seeds.range.split("-").map(Number);
const SEEDS = Array.from({ length: S1 - S0 + 1 }, (_, i) => S0 + i);
const tasks = TEMPLATES.flatMap((tpl) => SEEDS.map((seed) => ({ id: `${tpl}#${seed}`, key: tpl, seed, template: tpl })));
if (flag("plan")) { console.log(`${TEMPLATES.length} 模板 × ${SEEDS.length} seeds ＝ ${tasks.length} 場`); process.exit(0); }
const DIR = val("dir");
if (!DIR) { console.error("需要 --dir"); process.exit(2); }
const SV = await imp("src/platform/contracts/simulationVersion.js");
const META = { study: REG.studyId, registration: sha16(REG_TEXT), fingerprint: SV.SIMULATION_SEMANTICS_FINGERPRINTS[SV.MOBA_SIMULATION_VERSION] };

if (flag("run")) {
  if (!/^registered/.test(REG.status)) { console.error("登記檔不是 registered"); process.exit(2); }
  if (provenance().dirtyFilesUnderSrcTools) { console.error("src／tools 有未提交變更"); process.exit(2); }
  const res = await runStudy({ dir: DIR, tasks, workerFile: SELF, workerArgs: ["--ga8-worker"], meta: META, workers: Number(val("workers", 3)), label: "G-A8", check: recCheck });
  process.exit(res.halted ? 5 : res.stopped ? 3 : res.failed || res.lost ? 6 : 0);
}
if (flag("report")) {
  const m = JSON.parse(fs.readFileSync(path.join(DIR, "meta.json"), "utf8"));
  if (JSON.stringify(m.meta) !== JSON.stringify(META)) { console.error("資料夾的登記／指紋與目前不同：不判定"); process.exit(2); }
  const audit = auditStudy(DIR, tasks, recCheck);
  if (audit.halt) { console.error(`⛔ HALT：${audit.halt}（不判定，交 Owner）`); process.exit(5); }
  if (audit.missing) { console.log(`資料未完整：還有 ${audit.missing} 場（不判定）`); process.exit(6); }
  const rows = [], stops = [], warns = [];
  for (const tpl of TEMPLATES) {
    const d = readKey(DIR, tpl), recs = SEEDS.map((s) => d.get(`${tpl}#${s}`)).filter(Boolean);
    const v = templateVerdict(recs.map((r) => r.win));
    const sub = (f) => templateVerdict(recs.filter(f).map((r) => r.win)).rate;
    const durs = recs.map((r) => r.duration).sort((a, b) => a - b);
    const dragonSide = recs.filter((r) => (r.side === "blue") === (r.layout === "STANDARD")).length / recs.length;
    rows.push({ template: tpl, ...v, dragonSideShare: dragonSide, asBlue: sub((r) => r.side === "blue"), asRed: sub((r) => r.side === "red"), standard: sub((r) => r.layout === "STANDARD"), swapped: sub((r) => r.layout === "SWAPPED"), medianDurationMin: durs[Math.floor(durs.length / 2)] / 60 });
  }
  const ctl = rows.find((r) => r.template === "std");
  const instrument = Math.abs(ctl.rate - 0.5) > 0.05;
  for (const r of rows.filter((x) => x.template !== "std")) { if (r.stop) stops.push(`${r.template} ${(r.rate * 100).toFixed(1)}%（下界 ${(r.lo * 100).toFixed(1)}%）`); else if (r.warn) warns.push(`${r.template} ${(r.rate * 100).toFixed(1)}%`); }
  const er = errorRule(audit.errored.length, tasks.length);
  if (audit.instrument.length) stops.push(`STOP(INSTRUMENT): ${audit.instrument.slice(0, 5).join(" | ")}`);
  if (er === "STOP") stops.push(`STOP(INSTRUMENT): ${audit.errored.length} errored > 1%`);
  const verdict = instrument || stops.length ? "STOP" : er === "INCONCLUSIVE" ? "INCONCLUSIVE" : "PASS";
  const out = { schema: "esmo.ga8-result.v1", registration: REG_REL, registrationHash: META.registration, fingerprint: META.fingerprint, gitHead: provenance().gitHead, reportedAt: new Date().toISOString(),
    matches: tasks.length, errored: audit.errored, control: ctl, instrumentStop: instrument, rows, stops, warns, verdict,
    notes: ["the template is on the dragon side in about 52.5% of seeds (odd seeds STANDARD 109 / even seeds SWAPPED 101); the std control absorbs this; per-template dragonSideShare reported", "checkpointing is per match (finer than the 250-match batches in the plan)"] };
  const OUT = path.join(ROOT, "tools/fixtures/ga8_result_3aB.json");
  if (fs.existsSync(OUT)) { console.error("結果檔已存在：不覆寫"); process.exit(2); }
  fs.writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
  for (const r of rows) console.log(`${r.template.padEnd(24)} ${(r.rate * 100).toFixed(1)}%（${(r.lo * 100).toFixed(1)}–${(r.hi * 100).toFixed(1)}）藍 ${(r.asBlue * 100).toFixed(1)} 紅 ${(r.asRed * 100).toFixed(1)}　中位 ${r.medianDurationMin.toFixed(1)} 分${r.stop ? " STOP" : r.warn ? " WARN" : ""}`);
  console.log(`對照 std vs std ${(ctl.rate * 100).toFixed(1)}%${instrument ? " ⇒ STOP(INSTRUMENT)" : ""}；STOP：${stops.join("；") || "無"}；WARN：${warns.join("；") || "無"}`);
  console.log(`G-A8 判定：${verdict}`);
  process.exit(verdict === "STOP" ? 5 : 0);
}
console.error("用法見檔頭"); process.exit(2);
