#!/usr/bin/env node
// ============================================================================
//  tools/measure_e2_3aB.mjs — Phase 3a-B P2-3：E2 career.v21 正式入口的行為驗收（登記 tools/fixtures/e2_registration_3aB.json）
//
//  node tools/measure_e2_3aB.mjs --plan | --run --dir=<repo 外> [--workers=3] | --report --dir=<同一個> | --selftest
//  帶 --reg=<tools/fixtures/…json>：讀確認登記（worker 也帶），結果寫到登記的 result；凍結前一定拒跑（tools/lib/formalRegistration.mjs）。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runStudy, readKey, provenance, sha16, pairedStats, meanSd, auditStudy, errorRule, ROOT } from "./lib/studyRunner.mjs";
import { regRelOf, formalResultOf, formalRunRefusal } from "./lib/formalRegistration.mjs";

const SELF = fileURLToPath(import.meta.url);
const args = process.argv.slice(2);
const flag = (k) => args.includes(`--${k}`);
const val = (k, d = null) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const DEFAULT_REG = "tools/fixtures/e2_registration_3aB.json", REG_REL = regRelOf(args, DEFAULT_REG), IS_FORMAL = REG_REL !== DEFAULT_REG;
const REG_TEXT = fs.readFileSync(path.join(ROOT, REG_REL), "utf8"), REG = JSON.parse(REG_TEXT);
const OUT_REL = IS_FORMAL ? formalResultOf(REG, REG_REL) : "tools/fixtures/e2_result_3aB.json";
const imp = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
/** 每一筆紀錄的儀器檢查（--run 即時、--report 全部重查；審查 M1）。藍方的選擇必須真的進了本場（droppedChoices 為空；審查 minor）。 */
const recCheck = (r) => [...(r.ruleset === "career.v21" && r.directorMode === "core.v1" && r.laneFrame === "teamRelative" && r.engineSeed === r.seed && r.redKind === "binding" && r.tool === "phaseStudySim.v3" ? [] : ["instrument mismatch"]),
  ...(r.selfCheck?.length ? [`selfCheck ${r.selfCheck}`] : []), ...(r.dropped?.length ? [`blue choices dropped ${JSON.stringify(r.dropped)}`] : [])];
const METRICS = ["engageDecisionsPerMin.early", "engageStartsPerMin.early", "contestShare.dragon.early", "ganksOwnPerMin.bot.early", "win", "durationMin", "goldLeadAt.early"];

if (flag("e2-worker")) {
  process.env.ESMO_BALANCE_SKILLS = "on";
  delete process.env.ESMO_BALANCE_TALENTS;
  const PS = await imp("tools/lib/phaseStudySim.mjs"), L = await imp("tools/lib/careerLiveInputs.mjs");
  process.on("message", async (t) => {
    try {
      const arm = REG.arms.find((a) => a.id === t.arm);
      const { liveInputs, team } = await L.careerLiveInputs({ seed: t.seed, rulesetId: "career.v21", choices: arm.choices });
      const r = await PS.runCareerStudyMatch(liveInputs);
      const vals = Object.fromEntries(METRICS.map((m) => [m, m === "win" ? (r.over && ["blue", "red"].includes(r.winner) ? (r.winner === "blue" ? 1 : 0) : 0.5) : PS.studyMetricValue(r, "blue", m)]));
      process.send({ type: "done", id: t.id, rec: { seed: t.seed, engineSeed: r.seed, ruleset: r.ruleset, directorMode: r.directorMode, laneFrame: r.laneFrame, redKind: r.redTacticKind, opponent: team.id, tool: r.tool, selfCheck: PS.selfCheck(r), dropped: r.droppedChoices, vals } });
    } catch (e) { process.send({ type: "error", id: t.id, error: String(e?.stack ?? e) }); }
  });
  process.send({ type: "ready" });
  await new Promise(() => {});
}

export function claimVerdict(pairs, direction) {
  const sg = direction === "up" ? 1 : -1;
  if (pairs.length < 200) return { n: pairs.length, verdict: "UNMEASURABLE" };
  const c = meanSd(pairs.map((p) => p[0])), d = pairedStats(pairs.map((p) => p[1] - p[0]));
  const zDir = (d.z ?? 0) * sg, rel = c.mean ? d.mean / c.mean : null;
  const verdict = zDir <= -3 ? "STOP" : Math.sign(d.mean) === sg && zDir >= 3 && Math.abs(rel ?? 0) >= 0.05 ? "PASS" : "INCONCLUSIVE";
  return { n: pairs.length, ctrlMean: c.mean, diff: d.mean, rel, z: d.z, zDir, verdict };
}
if (flag("selftest")) {
  let pass = 0, fail = 0;
  const ck = (l, ok) => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}`); };
  const mk = (n, eff, noise = 0.3) => Array.from({ length: n }, (_, i) => { const c = 1 + Math.sin(i * 1.3) * noise; return [c, c * (1 + eff) + Math.cos(i * 2.1) * 0.05]; });
  ck("S1 +15% ⇒ PASS；−15% ⇒ STOP；+1% ⇒ INCONCLUSIVE；150 對 ⇒ UNMEASURABLE", claimVerdict(mk(400, 0.15), "up").verdict === "PASS" && claimVerdict(mk(400, -0.15), "up").verdict === "STOP" && claimVerdict(mk(400, 0.01), "up").verdict === "INCONCLUSIVE" && claimVerdict(mk(150, 0.2), "up").verdict === "UNMEASURABLE");
  ck(`S2 登記：只走奇數 ${IS_FORMAL ? "67501–68299" : "23001–23799"}、4 臂`, REG.seeds.range === (IS_FORMAL ? "67501-68299" : "23001-23799") && REG.seeds.step === 2 && REG.arms.length === 4);
  console.log(`\nselftest：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
  process.exit(fail ? 1 : 0);
}

const [S0, S1] = REG.seeds.range.split("-").map(Number);
const SEEDS = []; for (let s = S0; s <= S1; s += REG.seeds.step) SEEDS.push(s);
const tasks = REG.arms.flatMap((a) => SEEDS.map((seed) => ({ id: `${a.id}#${seed}`, key: a.id, seed, arm: a.id })));
if (flag("plan")) { console.log(`${REG.arms.length} 臂 × ${SEEDS.length} seeds ＝ ${tasks.length} 場`); process.exit(0); }
const DIR = val("dir");
if (!DIR) { console.error("需要 --dir"); process.exit(2); }
const SV = await imp("src/platform/contracts/simulationVersion.js");
const META = { study: REG.studyId, registration: sha16(REG_TEXT), fingerprint: SV.SIMULATION_SEMANTICS_FINGERPRINTS[SV.MOBA_SIMULATION_VERSION] };
if (flag("run")) {
  if (!/^registered/.test(REG.status)) { console.error("登記檔不是 registered"); process.exit(2); }
  if (IS_FORMAL) { const no = formalRunRefusal(REG, { fingerprint: META.fingerprint, resultRel: OUT_REL }); if (no.length) { console.error(`確認登記不能開跑：${no.join("；")}`); process.exit(2); } }
  if (provenance().dirtyFilesUnderSrcTools) { console.error("src／tools 有未提交變更"); process.exit(2); }
  const res = await runStudy({ dir: DIR, tasks, workerFile: SELF, workerArgs: ["--e2-worker", ...(IS_FORMAL ? [`--reg=${REG_REL}`] : [])], meta: META, workers: Number(val("workers", 3)), label: "E2", check: recCheck });
  process.exit(res.halted ? 5 : res.stopped ? 3 : res.failed || res.lost ? 6 : 0);
}
if (flag("report")) {
  const m = JSON.parse(fs.readFileSync(path.join(DIR, "meta.json"), "utf8"));
  if (JSON.stringify(m.meta) !== JSON.stringify(META)) { console.error("資料夾的登記／指紋與目前不同：不判定"); process.exit(2); }
  const audit = auditStudy(DIR, tasks, recCheck);
  if (audit.halt) { console.error(`⛔ HALT：${audit.halt}（不判定，交 Owner）`); process.exit(5); }
  if (audit.missing) { console.log(`資料未完整：還有 ${audit.missing} 場（不判定）`); process.exit(6); }
  const data = Object.fromEntries(REG.arms.map((a) => [a.id, readKey(DIR, a.id)]));
  const recV = (arm, s, mtr) => data[arm].get(`${arm}#${s}`)?.vals?.[mtr];
  const fin = (x) => typeof x === "number" && Number.isFinite(x);
  const arms = REG.arms.filter((a) => a.claims).map((a) => {
    const claims = a.claims.map((c) => ({ ...c, ...claimVerdict(SEEDS.map((s) => [recV("ctrl", s, c.metric), recV(a.id, s, c.metric)]).filter((p) => p.every(fin)), c.direction) }));
    const verdict = claims.some((c) => c.verdict === "STOP") ? "STOP" : claims.every((c) => c.verdict === "PASS") ? "PASS" : "INCONCLUSIVE";
    const win = meanSd(SEEDS.map((s) => recV(a.id, s, "win")).filter(fin)).mean;
    return { id: a.id, claims, verdict, blueWinRate: win };
  });
  const er = errorRule(audit.errored.length, tasks.length);
  const instrumentStop = audit.instrument.length > 0 || er === "STOP";
  const overall = instrumentStop || arms.some((a) => a.verdict === "STOP") ? "STOP" : arms.every((a) => a.verdict === "PASS") && !er ? "PASS" : "INCONCLUSIVE";
  const out = { schema: "esmo.e2-result.v1", registration: REG_REL, registrationHash: META.registration, fingerprint: META.fingerprint, gitHead: provenance().gitHead, reportedAt: new Date().toISOString(),
    matches: tasks.length, errored: audit.errored, instrument: audit.instrument.slice(0, 20), ctrlBlueWinRate: meanSd(SEEDS.map((s) => recV("ctrl", s, "win")).filter(fin)).mean, arms, overall };
  const OUT = path.join(ROOT, OUT_REL);
  if (fs.existsSync(OUT)) { console.error("結果檔已存在：不覆寫"); process.exit(2); }
  fs.writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
  for (const a of arms) console.log(`${a.id}：${a.verdict}　${a.claims.map((c) => `${c.metric} rel ${c.rel == null ? "—" : (c.rel * 100).toFixed(1) + "%"} z ${c.z == null ? "—" : c.z.toFixed(2)}（n ${c.n}）${c.verdict}`).join("；")}`);
  console.log(`E2 總判定：${overall}`);
  process.exit(overall === "STOP" ? 5 : 0);
}
console.error("用法見檔頭"); process.exit(2);
