#!/usr/bin/env node
// ============================================================================
//  tools/measure_e1_3aB.mjs — Phase 3a-B P2-2：E1 v21 選項的紅藍經濟等價與疊加安全（登記 tools/fixtures/e1_registration_3aB.json）
//
//  node tools/measure_e1_3aB.mjs --plan
//  node tools/measure_e1_3aB.mjs --run --dir=<repo 外> [--workers=3]     可續跑；<dir>/STOP 即停
//  node tools/measure_e1_3aB.mjs --report --dir=<同一個>                  資料完整才判定並寫 tools/fixtures/e1_result_3aB.json（已存在就拒寫）
//  node tools/measure_e1_3aB.mjs --selftest
//  登記檔 status 必須是 registered；src／tools 必須乾淨（已 commit）。所有門檻讀登記檔，程式不另寫一份。
//  帶 --reg=<tools/fixtures/…json>：讀確認登記（worker 也帶），結果寫到登記的 result；凍結前一定拒跑（tools/lib/formalRegistration.mjs）。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runStudy, readKey, provenance, sha16, pairedStats, meanSd, auditStudy, errorRule, ROOT } from "./lib/studyRunner.mjs";
import { regRelOf, formalResultOf, formalRunRefusal, formalReportRefusal, sameStudyMeta } from "./lib/formalRegistration.mjs";

const SELF = fileURLToPath(import.meta.url);
const args = process.argv.slice(2);
const flag = (k) => args.includes(`--${k}`);
const val = (k, d = null) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const DEFAULT_REG = "tools/fixtures/e1_registration_3aB.json", REG_REL = regRelOf(args, DEFAULT_REG), IS_FORMAL = REG_REL !== DEFAULT_REG;
const REG_TEXT = fs.readFileSync(path.join(ROOT, REG_REL), "utf8"), REG = JSON.parse(REG_TEXT);
const OUT_REL = IS_FORMAL ? formalResultOf(REG, REG_REL) : "tools/fixtures/e1_result_3aB.json";
export const METRICS = Object.freeze(["goldLeadAt.early", "goldLeadAt.mid", "ownGoldAt.early", "win", "durationMin", "ganksPerMin.early", "ganksPerMin.mid", "ganksOwnPerMin.bot.early",
  "contestShare.dragon.early", "captureShare.dragon.early+mid+late", "deathsAt.jungle.early", "deathsPerMin.jungle.early", "deathsAt.adc+sup.early", "deathsPerMin.adc+sup.early"]);
const range = (r) => { const [a, b] = r.split("-").map(Number); return Array.from({ length: b - a + 1 }, (_, i) => a + i); };
const seedsOf = (arm) => range(REG.seeds[arm.seeds]);
const keyOf = (arm, side) => (arm.role === "control" ? "ctrl" : `${arm.id}@${side}`);
/** 每一筆紀錄的儀器檢查（--run 即時、--report 全部重查；審查 M1）。 */
const recCheck = (r) => [...(r.ruleset === "balanceTool.v21" && r.directorMode === "core.v1" && r.laneFrame === "teamRelative" && r.tool === "phaseStudySim.v3" && r.layers?.heroSkills && r.layers?.heroPassives && r.layers?.heroPowerCurve && !r.layers?.battleTalents ? [] : ["instrument mismatch"]),
  ...(r.selfCheck?.length ? [`selfCheck ${r.selfCheck.join(",")}`] : [])];

// ── worker ──────────────────────────────────────────────────────────────────
if (flag("e1-worker")) {
  process.env.ESMO_BALANCE_SKILLS = "on";
  delete process.env.ESMO_BALANCE_TALENTS;
  const PS = await import(pathToFileURL(path.join(ROOT, "tools/lib/phaseStudySim.mjs")).href);
  const { objectiveLayoutForSeed } = await import(pathToFileURL(path.join(ROOT, "src/platform/contracts/objectiveLayout.js")).href);
  process.on("message", async (t) => {
    try {
      const ctrl = await PS.studyInput();
      const arm = REG.arms.find((a) => a.id === t.arm);
      const treat = arm.role === "control" ? ctrl : await PS.studyInput(arm.input.choices ?? {}, null);
      const r = await PS.runPhaseStudyMatch(t.seed, { blue: t.side === "blue" ? treat : ctrl, red: t.side === "red" ? treat : ctrl, ruleset: "balanceTool.v21" });
      const vals = Object.fromEntries(["blue", "red"].map((s) => [s, Object.fromEntries(METRICS.map((m) => [m, m === "win" ? (r.over && ["blue", "red"].includes(r.winner) ? (r.winner === s ? 1 : 0) : 0.5) : PS.studyMetricValue(r, s, m)]))]));
      process.send({ type: "done", id: t.id, rec: { seed: r.seed, ruleset: r.ruleset, directorMode: r.directorMode, laneFrame: r.laneFrame, layers: r.layers, tool: r.tool, layout: objectiveLayoutForSeed(t.seed), duration: r.duration, winner: r.winner, selfCheck: PS.selfCheck(r), vals } });
    } catch (e) { process.send({ type: "error", id: t.id, error: String(e?.stack ?? e) }); }
  });
  process.send({ type: "ready" });
  await new Promise(() => {});
}

// ── 判定（純函式）────────────────────────────────────────────────────────────
export function tost(ds, margin, zc = 1.645) {
  const s = pairedStats(ds, zc);
  const verdict = s.lo == null ? "INCONCLUSIVE" : s.lo > -margin && s.hi < margin ? "PASS" : s.lo > margin || s.hi < -margin ? "STOP" : "INCONCLUSIVE";
  return { ...s, margin, verdict };
}
/** 比值與 95% CI（配對差 ÷ 對照平均）。 */
export function ratioCi(pairs, zc = 1.96) {
  const c = meanSd(pairs.map((p) => p[0])), d = pairedStats(pairs.map((p) => p[1] - p[0]), zc);
  if (!c.mean) return { ratio: null, lo: null, hi: null, n: pairs.length };
  return { ratio: 1 + d.mean / c.mean, lo: 1 + d.lo / c.mean, hi: 1 + d.hi / c.mean, n: pairs.length, z: d.z };
}
/** 死亡警戒（登記檔規則）。pairs＝[[ctrl, treat]]（每場次數）。 */
export function deathsWarn(pairs) {
  const c = meanSd(pairs.map((p) => p[0])), d = pairedStats(pairs.map((p) => p[1] - p[0]));
  const low = (c.mean ?? 0) < 0.5, abs = d.mean ?? 0, rel = c.mean ? abs / c.mean : null;
  const warn = low ? abs >= 0.25 && (d.z ?? 0) >= 3 : (rel ?? 0) >= 0.5 && abs >= 0.15 && (d.z ?? 0) >= 3;
  return { ctrlMean: c.mean, absIncrease: abs, rel, z: d.z, lowEvents: low, warn, n: pairs.length };
}

if (flag("selftest")) {
  let pass = 0, fail = 0;
  const ck = (l, ok) => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}`); };
  const noise = (n, mu, sd, s = 1) => Array.from({ length: n }, (_, i) => mu + sd * Math.sin(i * 12.9898 + s) * 1.7);
  ck(`S1 登記檔 status＝${IS_FORMAL ? "registered 或 READY_FOR_FREEZE" : "registered"}、margin 150、主比較兩個`, (IS_FORMAL ? /^(registered|READY_FOR_FREEZE)/ : /^registered/).test(REG.status) && REG.primary.margin === 150 && REG.primary.comparisons.length === 2);
  ck("S2 TOST：差 0、窄 ⇒ PASS；差 400、窄 ⇒ STOP；差 140、寬 ⇒ INCONCLUSIVE", tost(noise(1200, 0, 300), 150).verdict === "PASS" && tost(noise(1200, 400, 300), 150).verdict === "STOP" && tost(noise(60, 140, 900), 150).verdict === "INCONCLUSIVE");
  ck("S3 比值 CI：對照 1、處理 2.2 ⇒ 下界 > 2；處理 1.95 ⇒ ratio ≥ 1.9 但下界 < 2", (() => { const a = ratioCi(noise(400, 1, 0.3).map((c) => [c, c * 2.2])); const b = ratioCi(noise(400, 1, 0.3).map((c, i) => [c, c * 1.95 + Math.sin(i) * 0.5])); return a.lo > 2 && b.ratio >= 1.9 && b.lo < 2; })());
  ck("S4 死亡：低事件數（對照 0.2）＋ 0.3 增加 ⇒ 警戒；一般事件（對照 1.0）＋ 0.4 增加（40%）⇒ 不警戒", (() => {
    const a = deathsWarn(Array.from({ length: 400 }, (_, i) => [i % 5 === 0 ? 1 : 0, (i % 5 === 0 ? 1 : 0) + (i % 10 < 3 ? 1 : 0)]));
    const b = deathsWarn(Array.from({ length: 400 }, (_, i) => [1, 1 + (i % 5 < 2 ? 1 : 0)]));
    return a.lowEvents && a.warn && !b.lowEvents && !b.warn; })());
  console.log(`\nselftest：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
  process.exit(fail ? 1 : 0);
}

// ── 計畫 ──────────────────────────────────────────────────────────────────
const tasks = [];
for (const arm of REG.arms) for (const side of arm.sides) for (const seed of seedsOf(arm)) {
  const key = keyOf(arm, side);
  tasks.push({ id: `${key}#${seed}`, key, seed, arm: arm.id, side: arm.role === "control" ? null : side });
}
if (flag("plan")) { const by = {}; for (const t of tasks) by[t.key] = (by[t.key] ?? 0) + 1; console.log(JSON.stringify(by), "共", tasks.length, "場"); process.exit(0); }
const DIR = val("dir");
if (!DIR) { console.error("需要 --dir"); process.exit(2); }
const SV = await import(pathToFileURL(path.join(ROOT, "src/platform/contracts/simulationVersion.js")).href);
const FP = SV.SIMULATION_SEMANTICS_FINGERPRINTS[SV.MOBA_SIMULATION_VERSION];
const META = { study: REG.studyId, registration: sha16(REG_TEXT), fingerprint: FP };

if (flag("run") || flag("preflight")) {
  if (!/^registered/.test(REG.status)) { console.error("登記檔不是 registered：不得執行"); process.exit(2); }
  if (fs.existsSync(path.join(ROOT, OUT_REL))) { console.error("結果檔已存在：這些 seeds 已觀察過"); process.exit(2); }
  if (IS_FORMAL) { const no = formalRunRefusal(REG, { fingerprint: FP, resultRel: OUT_REL, regRel: REG_REL, toolRel: "tools/measure_e1_3aB.mjs" }); if (no.length) { console.error(`確認登記不能開跑：${no.join("；")}`); process.exit(2); } }
  const prov = provenance();
  if (prov.dirtyFilesUnderSrcTools) { console.error(`src／tools 有 ${prov.dirtyFilesUnderSrcTools} 個未提交變更`); process.exit(2); }
  if (flag("preflight")) { console.log("preflight：可以開跑（沒有跑任何場次）"); process.exit(0); }
  const res = await runStudy({ dir: DIR, tasks, workerFile: SELF, workerArgs: ["--e1-worker", ...(IS_FORMAL ? [`--reg=${REG_REL}`] : [])], meta: IS_FORMAL ? { ...META, gitHead: provenance().gitHead } : META, workers: Number(val("workers", 3)), label: "E1", check: recCheck });
  process.exit(res.halted ? 5 : res.stopped ? 3 : res.failed || res.lost ? 6 : 0);
}

if (flag("report")) {
  const m = JSON.parse(fs.readFileSync(path.join(DIR, "meta.json"), "utf8"));
  if (!sameStudyMeta(m.meta, META, IS_FORMAL)) { console.error("資料夾的登記／指紋與目前不同：不判定"); process.exit(2); }
  if (IS_FORMAL) { const no = formalReportRefusal(m.meta, "tools/measure_e1_3aB.mjs"); if (no.length) { console.error(`不判定：${no.join("；")}`); process.exit(2); } }
  const audit = auditStudy(DIR, tasks, recCheck);
  if (audit.halt) { console.error(`⛔ HALT：${audit.halt}（不判定，交 Owner）`); process.exit(5); }
  if (audit.missing) { console.log(`資料未完整：還有 ${audit.missing} 場（不判定）`); process.exit(6); }
  const data = new Map(); for (const k of new Set(tasks.map((t) => t.key))) data.set(k, readKey(DIR, k));
  const rec = (key, seed) => data.get(key).get(`${key}#${seed}`);
  const v = (r, side, mtr) => r?.vals?.[side]?.[mtr];
  const fin = (x) => typeof x === "number" && Number.isFinite(x);
  const seeds = (id) => seedsOf(REG.arms.find((a) => a.id === id));
  //  主比較
  const primary = REG.primary.comparisons.map((id) => {
    const ds = [], strata = { blueDragon: [], redDragon: [] }, dB = [], dR = [];
    for (const s of seeds(id)) {
      const c = rec("ctrl", s), b = rec(`${id}@blue`, s), r = rec(`${id}@red`, s);
      const xs = [v(c, "blue", "goldLeadAt.early"), v(b, "blue", "goldLeadAt.early"), v(c, "red", "goldLeadAt.early"), v(r, "red", "goldLeadAt.early")];
      if (!xs.every(fin)) continue;
      const deltaB = xs[1] - xs[0], deltaR = xs[3] - xs[2];
      ds.push(deltaR - deltaB); dB.push(deltaB); dR.push(deltaR);
      (c.layout === "STANDARD" ? strata.blueDragon : strata.redDragon).push(deltaR - deltaB);
    }
    const t = tost(ds, REG.primary.margin);
    const planned = seeds(id).length;
    //  優先序（登記檔 precedence）：STOP 優先；不是 STOP 而有效 seed 不足計畫的 90% ⇒ INCONCLUSIVE。
    const verdict = t.verdict === "STOP" ? "STOP" : ds.length < 0.9 * planned ? "INCONCLUSIVE" : t.verdict;
    return { id, n: ds.length, planned, D: t.mean, ci90: [t.lo, t.hi], se: t.se, verdict, deltaBlue: meanSd(dB).mean, deltaRed: meanSd(dR).mean,
      strata: { blueIsDragonSide: pairedStats(strata.blueDragon), redIsDragonSide: pairedStats(strata.redDragon) } };
  });
  //  護欄
  const guards = [], warns = [], stops = [], guardGaps = [];
  for (const arm of REG.arms.filter((a) => a.role !== "control")) for (const side of arm.sides) {
    const key = `${arm.id}@${side}`, S = seeds(arm.id);
    const pairs = (mtr) => S.map((s) => [v(rec("ctrl", s), side, mtr), v(rec(key, s), side, mtr)]).filter((p) => p.every(fin));
    const g = { arm: arm.id, side };
    const enough = (n) => n >= 0.9 * S.length;
    const og = pairedStats(pairs("ownGoldAt.early").map((p) => p[1] - p[0]));
    g.ownGold = { mean: og.mean, z: og.z, n: og.n, stop: (og.z ?? 0) <= -3, enough: enough(og.n) };
    const w = meanSd(S.map((s) => v(rec(key, s), side, "win")).filter(fin));
    g.winRate = { rate: w.mean, n: w.n, stop: w.mean < 0.4 || w.mean > 0.6, enough: enough(w.n) };
    if (["quickStrongBot", "snowballStrongBot", "strongBotAggressive"].includes(arm.id)) {
      const rc = ratioCi(pairs("ganksPerMin.early"));
      g.ganks = { ...rc, warn: rc.ratio != null && rc.ratio >= 1.9, stop: rc.lo != null && rc.lo > 2.0, enough: rc.ratio != null && enough(rc.n) };
      g.botDeaths = deathsWarn(pairs("deathsAt.adc+sup.early"));
    }
    g.junglerDeaths = deathsWarn(pairs("deathsAt.jungle.early"));
    for (const [nm, x] of [["own gold", g.ownGold], ["win band", g.winRate], ["ganks", g.ganks]]) if (x && !x.stop && !x.enough) guardGaps.push(`${key} ${nm}: n ${x.n} < 90% of ${S.length}`);
    if (g.ownGold.stop) stops.push(`${key} own gold z ${og.z?.toFixed(2)}`);
    if (g.winRate.stop) stops.push(`${key} win rate ${w.mean?.toFixed(3)}`);
    if (g.ganks?.stop) stops.push(`${key} ganks ratio lower bound ${g.ganks.lo.toFixed(3)} > 2.0`);
    if (g.ganks?.warn) warns.push(`${key} ganks ratio ${g.ganks.ratio.toFixed(3)} >= 1.9`);
    if (g.junglerDeaths.warn) warns.push(`${key} jungler early deaths +${g.junglerDeaths.absIncrease.toFixed(3)}`);
    if (g.botDeaths?.warn) warns.push(`${key} bot-lane early deaths +${g.botDeaths.absIncrease.toFixed(3)}`);
    guards.push(g);
  }
  //  交互作用
  const inter = REG.interactions.map((it) => {
    const out = {};
    for (const side of ["blue", "red"]) {
      const ds = seeds(it.combo).map((s) => [v(rec("ctrl", s), side, it.metric), v(rec(`${it.combo}@${side}`, s), side, it.metric), v(rec(`${it.parts[0]}@${side}`, s), side, it.metric), v(rec(`${it.parts[1]}@${side}`, s), side, it.metric)])
        .filter((xs) => xs.every(fin)).map(([c, k, a, b]) => k - a - b + c);
      const st = pairedStats(ds); out[side] = { ...st, flag: Math.abs(st.z ?? 0) >= 3 };
    }
    return { id: it.id, metric: it.metric, ...out };
  });
  for (const p of primary) if (p.verdict === "STOP") stops.push(`${p.id} side difference ${p.D.toFixed(1)} (90% CI ${p.ci90.map((x) => x.toFixed(1)).join("..")}) outside +/-150`);
  const er = errorRule(audit.errored.length, tasks.length);
  if (audit.instrument.length) stops.push(`STOP(INSTRUMENT): ${audit.instrument.slice(0, 5).join(" | ")}`);
  if (er === "STOP") stops.push(`STOP(INSTRUMENT): ${audit.errored.length} errored matches > 1%`);
  const overall = stops.length ? "STOP" : (primary.some((p) => p.verdict === "INCONCLUSIVE") || guardGaps.length || er === "INCONCLUSIVE") ? "INCONCLUSIVE" : "PASS";
  const prov = provenance();
  const out = { schema: "esmo.e1-result.v1", registration: REG_REL, registrationHash: META.registration, fingerprint: FP, gitHead: prov.gitHead, reportedAt: new Date().toISOString(),
    matches: tasks.length, errored: audit.errored, guardGaps, primary, guards, interactions: inter, stops, warns, overall,
    notes: ["ganks ratio CI = paired-difference CI / control mean (the control mean's own uncertainty is ignored; declared in the registration)", "deathsPerMin is report-only; the WARN rule uses the per-match counts deathsAt"] };
  if (fs.existsSync(path.join(ROOT, OUT_REL))) { console.error("結果檔已存在：不覆寫"); process.exit(2); }
  fs.writeFileSync(path.join(ROOT, OUT_REL), `${JSON.stringify(out, null, 1)}\n`);
  for (const p of primary) console.log(`主比較 ${p.id}：D ${p.D.toFixed(1)} 金（90% CI ${p.ci90.map((x) => x.toFixed(1)).join("～")}；n ${p.n}/${p.planned}）⇒ ${p.verdict}；Δ藍 ${p.deltaBlue.toFixed(1)}、Δ紅 ${p.deltaRed.toFixed(1)}`);
  console.log(`STOP：${stops.join("；") || "無"}`); console.log(`WARN：${warns.join("；") || "無"}`);
  console.log(`交互作用旗標：${inter.flatMap((x) => ["blue", "red"].filter((s) => x[s].flag).map((s) => `${x.id}@${s} z ${x[s].z.toFixed(2)}`)).join("；") || "無"}`);
  console.log(`E1 總判定：${overall}`);
  process.exit(overall === "STOP" ? 5 : IS_FORMAL && overall === "INCONCLUSIVE" ? 6 : 0);
}
console.error("用法見檔頭"); process.exit(2);
