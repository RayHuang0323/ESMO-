#!/usr/bin/env node
// ============================================================================
//  tools/measure_exclusion_v21b1_3aB.mjs — Phase 3a-B 第一階段 P6：m3／m7／m8 在修正表 v21.b1 下的排除列重新判定（開發期量測，不是正式驗收）
//
//  登記：tools/fixtures/exclusion_v21b1_registration_3aB.json（Owner 2026-11-01 第 5 點）
//  node tools/measure_exclusion_v21b1_3aB.mjs --plan
//  node tools/measure_exclusion_v21b1_3aB.mjs --run --dir=<repo 外新資料夾> [--workers=3]   要 review.reviewedAt、登記清單與重算相同、src／tools 乾淨
//  node tools/measure_exclusion_v21b1_3aB.mjs --report --dir=<同一個>                        寫 tools/fixtures/exclusion_v21b1_result_3aB.json
//  node tools/measure_exclusion_v21b1_3aB.mjs --selftest
//
//  判定與真實性表相同（藍方＝選擇，紅方 std；同 seed 配對；方向一致且 z ≥ 2 ⇒ 提供）。批次用 balanceTool.v21（修正表只有這個工具規則集讀得到）。
//  只決定「開發期的排除列提案」，不是 G-A8、不碰 STOP；正式的真實性表在語意凍結後整輪重測。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runStudy, readKey, provenance, sha16, auditStudy, errorRule, ROOT } from "./lib/studyRunner.mjs";

const SELF = fileURLToPath(import.meta.url);
const args = process.argv.slice(2);
const flag = (k) => args.includes(`--${k}`);
const val = (k, d = null) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const imp = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const RULESET = "balanceTool.v21", TB = "v21.b1", TEMPLATES = ["classic.m3", "classic.m7", "classic.m8"];
const J = JSON.stringify;

if (flag("worker")) {
  process.env.ESMO_BALANCE_SKILLS = "on";
  const { runTruthMatch } = await imp("tools/lib/tacticTruthSim.mjs");
  process.on("message", async (t) => {
    try {
      const rec = await runTruthMatch(t.seed, { blue: t.blue, red: null, items: "standard", ruleset: RULESET });
      process.send({ type: "done", id: t.id, rec });
    } catch (err) { process.send({ type: "error", id: t.id, error: String(err?.stack ?? err) }); }
  });
  process.send({ type: "ready" });
  await new Promise(() => {});
}

const { liveRows, registryRow, MEASURED_EXCLUSIONS, REPLICATION_WITHHELD } = await imp("src/platform/tactics/capabilityRegistry.js");
const { TACTIC_TEMPLATES, templateById } = await imp("src/platform/tactics/tacticTemplates.js");
const { claimFor, unitOf, buildPlan, TEMPLATE_IDS } = await imp("tools/lib/tacticTruthPlan.mjs");
const { choiceEngineFor, nestedOf, PHASE_CHOICE_MAPPING, phaseOverridesOf, phaseProjectionOf } = await imp("src/platform/tactics/tacticChoiceMapping.js");
const { toEngineTactic, toEngineTacticIdentity } = await imp("src/platform/contracts/MobaTacticConfig.js");

const engine = choiceEngineFor(TB);
const get = (o, p) => p.split(".").reduce((x, k) => x?.[k], o);
//  與 tacticTruthPlan 的 projected／knobDelta 同一條算式，只差模板起點＝修正表。
const projected = (templateId, rawChoices) => {
  const choices = engine.effectiveChoices(templateId, [], rawChoices);
  const cfg = engine.mergeConfig(templateById(templateId), [], choices);
  const ov = phaseOverridesOf(Object.fromEntries(Object.entries(choices?.phases ?? {}).map(([p, d]) => [p, Object.fromEntries(Object.entries(d).filter(([k]) => Object.hasOwn(PHASE_CHOICE_MAPPING.rows, `phases.${p}.${k}`)))])));
  const phases = ov.ok ? ov.overrides.map((o) => phaseProjectionOf(cfg, o, { toEngineTactic, toEngineTacticIdentity })) : null;
  return { knobs: toEngineTactic(cfg), identity: toEngineTacticIdentity(cfg), phases };
};
const knobDelta = (row, templateId, choice) => {
  const base = projected(templateId, {}), next = projected(templateId, nestedOf([[row.dimension, choice]]));
  const diff = (a, b) => (typeof a === "number" && typeof b === "number" ? Math.abs(a - b) : a === b ? 0 : 1);
  return row.gate.deltaFields.reduce((s, p) => s + diff(get(next, p), get(base, p)) / unitOf(p), 0);
};
const detailOf = (e, t, dim) => { const d = e.offeredDetail(t, dim, [], {}, { withMeasured: false }); return d ? { own: d.own, offered: d.offered } : null; };
const shipped = choiceEngineFor(null);
//  「*」列是 std 層級的決定（n=400 複驗或 std 主要列），不因模板修正改變，不在本研究範圍。
const starWithheld = (dim, choice) => [...MEASURED_EXCLUSIONS, ...REPLICATION_WITHHELD].some((x) => x.template === "*" && x.dimension === dim && x.choice === choice && x.scope === undefined);
const keyedRow = (t, dim, choice) => [...MEASURED_EXCLUSIONS, ...REPLICATION_WITHHELD].find((x) => x.template === t && x.dimension === dim && x.choice === choice) ?? null;

export function buildExclusionPlan() {
  const weakNow = new Set(buildPlan().batches.filter((b) => b.role === "weak").map((b) => `${b.template}|${b.dimension}|${b.choice}`));
  const items = [];
  for (const row of liveRows()) for (const choice of row.choices) {
    if (starWithheld(row.dimension, choice)) continue;
    //  C：這個（維度, 選擇）在修正表下旋鈕差距最小的非 std 模板。
    let best = null;
    for (const t of TEMPLATE_IDS) {
      if (t === "std") continue;
      const o = detailOf(engine, t, row.dimension);
      if (!o || o.own === choice || !o.offered.includes(choice) || !claimFor(row, choice, o.own)) continue;
      const delta = knobDelta(row, t, choice);
      if (!best || delta < best.delta - 1e-12) best = { t, delta };
    }
    for (const t of TEMPLATES) {
      const o = detailOf(engine, t, row.dimension);
      if (!o || o.own === choice || !o.offered.includes(choice)) continue;
      const claim = claimFor(row, choice, o.own);
      if (!claim) continue;
      const before = detailOf(shipped, t, row.dimension);
      const reasons = [];
      if (keyedRow(t, row.dimension, choice)) reasons.push("A_keyed_row");
      if (weakNow.has(`${t}|${row.dimension}|${choice}`)) reasons.push("B_weak_now");
      if (best?.t === t) reasons.push("C_weakest_under_table");
      if (!before || before.own === choice || !before.offered.includes(choice)) reasons.push("D_newly_offered");
      if (!reasons.length) continue;
      items.push({ template: t, dimension: row.dimension, choice, own: o.own, metric: claim.metric, direction: claim.direction, delta: knobDelta(row, t, choice), reasons });
    }
  }
  return items;
}

const REG_REL = "tools/fixtures/exclusion_v21b1_registration_3aB.json";
const PLAN = buildExclusionPlan();
if (flag("plan-json")) { console.log(J(PLAN.map(({ delta, ...r }) => r))); process.exit(0); }
if (flag("plan")) {
  console.log(`${PLAN.length} 批＋${TEMPLATES.length} 組對照`);
  for (const b of PLAN) console.log(`${b.template} ${b.dimension}=${b.choice} own=${b.own} ${b.metric} ${b.direction} d=${b.delta.toFixed(3)} [${b.reasons.join(",")}]`);
  process.exit(0);
}

const verdictOf = (st, direction, minZ = 2) => {
  if (st.z === null || st.n < 20) return "unmeasurable";
  const zd = st.z * (direction === "up" ? 1 : -1);
  return zd >= minZ ? "offer" : zd <= -minZ ? "reversed" : "no_effect";
};

if (flag("selftest")) {
  let pass = 0, fail = 0;
  const ck = (l, ok, n = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}${n ? `　${n}` : ""}`); };
  ck("S1 方向向上 z=2 ⇒ offer；z=1.99 ⇒ no_effect；z=-2 ⇒ reversed", verdictOf({ z: 2, n: 100 }, "up") === "offer" && verdictOf({ z: 1.99, n: 100 }, "up") === "no_effect" && verdictOf({ z: -2, n: 100 }, "up") === "reversed");
  ck("S2 方向向下鏡像；n<20 或 z=null ⇒ unmeasurable", verdictOf({ z: -2, n: 100 }, "down") === "offer" && verdictOf({ z: 5, n: 19 }, "up") === "unmeasurable" && verdictOf({ z: null, n: 100 }, "up") === "unmeasurable");
  const dups = new Set(PLAN.map((b) => `${b.template}|${b.dimension}|${b.choice}`));
  ck("S3 批次不重複；都在 m3／m7／m8；都有宣稱指標與方向", dups.size === PLAN.length && PLAN.every((b) => TEMPLATES.includes(b.template) && b.metric && b.direction));
  const keyedAll = [...MEASURED_EXCLUSIONS, ...REPLICATION_WITHHELD].filter((x) => TEMPLATES.includes(x.template));
  const measured = keyedAll.filter((x) => PLAN.some((b) => b.template === x.template && b.dimension === x.dimension && b.choice === x.choice));
  ck("S4 目前 m3／m7／m8 的每一筆排除列要嘛進批次，要嘛被不分模板的「*」列涵蓋（std 層級的決定，不在本研究範圍），要嘛結構上不提供", keyedAll.every((x) => measured.includes(x) || starWithheld(x.dimension, x.choice) || !detailOf(engine, x.template, x.dimension)?.offered.includes(x.choice) || detailOf(engine, x.template, x.dimension)?.own === x.choice), keyedAll.filter((x) => !measured.includes(x)).map((x) => `${x.template}|${x.dimension}=${x.choice}`).join(" "));
  ck("S5 v21.b1 下 m7 上路本來的選擇是 standard（修正表真的進了這條路）", detailOf(engine, "classic.m7", "lanes.top.stance")?.own !== detailOf(shipped, "classic.m7", "lanes.top.stance")?.own);
  console.log(`\nselftest：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
  process.exit(fail ? 1 : 0);
}

const REG_TEXT = fs.readFileSync(path.join(ROOT, REG_REL), "utf8"), REG = JSON.parse(REG_TEXT);
const [SEED_A, SEED_B] = REG.seeds.range.split("-").map(Number);
const SEEDS = Array.from({ length: SEED_B - SEED_A + 1 }, (_, i) => SEED_A + i);
const keyOfPlan = (b) => `${b.template}|${b.dimension}|${b.choice}`;
const armOf = (b) => ({ templateId: b.template, choices: nestedOf([[b.dimension, b.choice]]) });
const CONTROLS = TEMPLATES.map((t) => ({ key: `control|${t}`, blue: { templateId: t, choices: {} } }));
const BATCHES = [...CONTROLS, ...PLAN.map((b) => ({ key: keyOfPlan(b), blue: armOf(b) }))];
const tasks = BATCHES.flatMap((b) => SEEDS.map((s) => ({ id: `${b.key}#${s}`, key: b.key, seed: s, blue: b.blue })));
const META = { registration: sha16(REG_TEXT.replace(/\r\n/g, "\n")), plan: sha16(J(PLAN)), simVersion: (await imp("tools/lib/tacticTruthSim.mjs")).TRUTH_SIM_VERSION };

const planMatches = J(REG.plan?.items ?? null) === J(PLAN.map(({ delta, ...r }) => r));
const DIR = val("dir");
if (!DIR) { console.error("需要 --dir"); process.exit(2); }

if (flag("run")) {
  if (!REG.review?.reviewedAt) { console.error("登記還沒有獨立審查（review.reviewedAt）：不得開跑"); process.exit(2); }
  if (!planMatches) { console.error("登記的批次清單與重算不同：不得開跑"); process.exit(2); }
  if (provenance().dirtyFilesUnderSrcTools) { console.error("src／tools 有未提交變更"); process.exit(2); }
  const res = await runStudy({ dir: DIR, tasks, workerFile: SELF, workerArgs: ["--worker"], meta: META, workers: Number(val("workers", 3)), label: "P6 排除列重新判定" });
  process.exit(res.halted ? 5 : res.stopped ? 3 : res.failed || res.lost ? 6 : 0);
}

if (flag("report")) {
  const { metricValue, pairStats } = await imp("tools/lib/tacticTruthSim.mjs");
  const m = JSON.parse(fs.readFileSync(path.join(DIR, "meta.json"), "utf8"));
  if (J(m.meta) !== J(META)) { console.error("資料夾的登記／程式指紋與目前不同：不判定"); process.exit(2); }
  const audit = auditStudy(DIR, tasks);
  if (audit.halt) { console.error(`⛔ HALT：${audit.halt}`); process.exit(5); }
  if (audit.missing) { console.log(`資料未完整：還有 ${audit.missing} 場（不判定）`); process.exit(6); }
  const errRule = errorRule(audit.errored.length, tasks.length);
  const errSeeds = new Set(audit.errored.map((x) => x.seed));
  const S = SEEDS.filter((s) => !errSeeds.has(s));
  const r6 = (x) => (x === null || x === undefined ? null : Math.round(x * 1e6) / 1e6);
  const rows = PLAN.map((b) => {
    const trt = readKey(DIR, keyOfPlan(b)), ctl = readKey(DIR, `control|${b.template}`);
    const pairs = S.map((s) => [r6(metricValue(ctl.get(`control|${b.template}#${s}`), "blue", b.metric)), r6(metricValue(trt.get(`${keyOfPlan(b)}#${s}`), "blue", b.metric))]);
    const st = pairStats(pairs);
    return { ...b, delta: r6(b.delta), n: st.n, meanControl: r6(st.meanA), meanChoice: r6(st.meanB), diff: r6(st.diff), z: r6(st.z), verdict: verdictOf(st, b.direction) };
  });
  const out = { schema: "ExclusionV21b1Result.v1", at: new Date().toISOString(), gitHead: provenance().gitHead, registration: META.registration, plan: META.plan, seeds: REG.seeds.range, errored: audit.errored.length, errorRule: errRule, rows };
  fs.writeFileSync(path.join(ROOT, "tools/fixtures/exclusion_v21b1_result_3aB.json"), JSON.stringify(out, null, 1) + "\n");
  for (const r of rows) console.log(`${r.verdict.padEnd(12)} ${r.template} ${r.dimension}=${r.choice} ${r.metric} ${r.direction} n=${r.n} z=${r.z} [${r.reasons.join(",")}]`);
  console.log(`\n判定：errored ${audit.errored.length}${errRule ? `（${errRule}）` : ""}`);
  process.exit(errRule === "STOP" ? 5 : 0);
}
