#!/usr/bin/env node
// ============================================================================
//  tools/measure_exclusion_v21b1_3aB.mjs — Phase 3a-B 第一階段 P6：m3／m7／m8 在修正表 v21.b1 下的排除列重新判定（開發期量測，不是正式驗收）
//
//  登記：tools/fixtures/exclusion_v21b1_registration_3aB.json（Owner 2026-11-01 第 5 點）
//  node tools/measure_exclusion_v21b1_3aB.mjs --plan
//  node tools/measure_exclusion_v21b1_3aB.mjs --selftest
//  node tools/measure_exclusion_v21b1_3aB.mjs --run --dir=<repo 外新資料夾> [--workers=3]   要 APPROVE 的獨立審查、登記清單與重算相同、src／tools 乾淨、儀器檢查通過
//  node tools/measure_exclusion_v21b1_3aB.mjs --report --dir=<同一個>                        寫 tools/fixtures/exclusion_v21b1_result_3aB.json
//  node tools/measure_exclusion_v21b1_3aB.mjs --stage2-run --dir=<另一個> [--workers=3]      第一階段的邊際項：新 seeds、紅藍雙方（結果檔要先提交）
//  node tools/measure_exclusion_v21b1_3aB.mjs --stage2-report --dir=<同一個>                 寫 tools/fixtures/exclusion_v21b1_stage2_result_3aB.json
//
//  設計與真實性表的 weak 批次相同（藍方＝選擇，紅方 std；同 seed 配對），批次用 balanceTool.v21（修正表只有這個工具規則集讀得到）。
//  判定（Owner 2026-10-13：保留原規則、不直接改成 z ≥ 3；邊際用獨立新 seeds、紅藍雙方複驗）：
//    第一階段＝真實性表的同一條：方向後 z ≥ 3 ⇒ pass（提供）；2 ≤ z < 3 ⇒ marginal（進第二階段）；其餘不提供。
//    第二階段＝n=400 複驗的同一條：紅藍兩側都方向一致、z ≥ 3、rel ≥ 0.05 ⇒ confirmed（提供）；否則 not_replicated（不提供）。
//  只決定「開發期的排除列提案」，不是 G-A8、不碰 STOP；正式的確認在語意凍結後（stage1_formal_acceptance_registration_3aB.json 第 4 步）。
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
const PASS_Z = 3, MARGINAL_Z = 2, REPL_Z = 3, REPL_REL = 0.05;
const J = JSON.stringify;

//  ⚠ 旗標不得叫 --worker：balance runner 看到 --worker 會在 import 時多送一次 ready，任務就錯位（第一次開跑踩過，整批作廢）。
if (flag("exclusion-worker")) {
  process.env.ESMO_BALANCE_SKILLS = "on";
  const { runTruthMatch } = await imp("tools/lib/tacticTruthSim.mjs");
  process.on("message", async (t) => {
    try {
      const rec = await runTruthMatch(t.seed, { blue: t.blue ?? null, red: t.red ?? null, items: "standard", ruleset: RULESET });
      process.send({ type: "done", id: t.id, rec: { ...rec, taskId: t.id } });
    } catch (err) { process.send({ type: "error", id: t.id, error: String(err?.stack ?? err) }); }
  });
  process.send({ type: "ready" });
  await new Promise(() => {});
}

const { liveRows, MEASURED_EXCLUSIONS, REPLICATION_WITHHELD } = await imp("src/platform/tactics/capabilityRegistry.js");
const { templateById, templateConfigFor } = await imp("src/platform/tactics/tacticTemplates.js");
const { claimFor, unitOf, buildPlan, TEMPLATE_IDS } = await imp("tools/lib/tacticTruthPlan.mjs");
const { choiceEngineFor, nestedOf, PHASE_CHOICE_MAPPING, phaseOverridesOf, phaseProjectionOf } = await imp("src/platform/tactics/tacticChoiceMapping.js");
const { toEngineTactic, toEngineTacticIdentity } = await imp("src/platform/contracts/MobaTacticConfig.js");

const engine = choiceEngineFor(TB), shipped = choiceEngineFor(null);
const get = (o, p) => p.split(".").reduce((x, k) => x?.[k], o);
//  與 tacticTruthPlan 的 projected／knobDelta 同一條算式，只差模板起點＝e 那張修正表。
const projected = (e, templateId, rawChoices) => {
  const choices = e.effectiveChoices(templateId, [], rawChoices);
  const cfg = e.mergeConfig(templateById(templateId), [], choices);
  const ov = phaseOverridesOf(Object.fromEntries(Object.entries(choices?.phases ?? {}).map(([p, d]) => [p, Object.fromEntries(Object.entries(d).filter(([k]) => Object.hasOwn(PHASE_CHOICE_MAPPING.rows, `phases.${p}.${k}`)))])));
  const phases = ov.ok ? ov.overrides.map((o) => phaseProjectionOf(cfg, o, { toEngineTactic, toEngineTacticIdentity })) : null;
  return { knobs: toEngineTactic(cfg), identity: toEngineTacticIdentity(cfg), phases };
};
const knobDelta = (e, row, templateId, choice) => {
  const base = projected(e, templateId, {}), next = projected(e, templateId, nestedOf([[row.dimension, choice]]));
  const diff = (a, b) => (typeof a === "number" && typeof b === "number" ? Math.abs(a - b) : a === b ? 0 : 1);
  return (row.gate?.deltaFields ?? []).reduce((s, p) => s + diff(get(next, p), get(base, p)) / unitOf(p), 0);
};
const detailOf = (e, t, dim) => { const d = e.offeredDetail(t, dim, [], {}, { withMeasured: false }); return d ? { own: d.own, offered: d.offered } : null; };
//  「*」列是 std 層級的決定（n=400 複驗或 std 主要列），不因模板修正改變，不在本研究範圍。
const starWithheld = (dim, choice) => [...MEASURED_EXCLUSIONS, ...REPLICATION_WITHHELD].some((x) => x.template === "*" && x.dimension === dim && x.choice === choice && x.scope === undefined);
const keyedRow = (t, dim, choice) => [...MEASURED_EXCLUSIONS, ...REPLICATION_WITHHELD].find((x) => x.template === t && x.dimension === dim && x.choice === choice) ?? null;
const EPS = 1e-12;

export function buildExclusionPlan() {
  const weakNow = new Set(buildPlan().batches.filter((b) => b.role === "weak").map((b) => `${b.template}|${b.dimension}|${b.choice}`));
  const items = [];
  for (const row of liveRows()) for (const choice of row.choices) {
    if (starWithheld(row.dimension, choice)) continue;
    //  C：這個（維度, 選擇）在修正表下旋鈕差距最小的非 std 模板，而且最小值只落在這三個模板（複審 3：與表外模板並列 ⇒ 本來值、宣稱、差距都沒變的選擇不用重量；變了的由 E 抓）。
    let bestDelta = null, bestOutside = false;
    for (const t of TEMPLATE_IDS) {
      if (t === "std") continue;
      const o = detailOf(engine, t, row.dimension);
      if (!o || o.own === choice || !o.offered.includes(choice) || !claimFor(row, choice, o.own)) continue;
      const delta = knobDelta(engine, row, t, choice);
      const outside = !TEMPLATES.includes(t);
      if (bestDelta === null || delta < bestDelta - EPS) { bestDelta = delta; bestOutside = outside; }
      else if (Math.abs(delta - bestDelta) <= EPS && outside) bestOutside = true;
    }
    for (const t of TEMPLATES) {
      const o = detailOf(engine, t, row.dimension);
      if (!o || o.own === choice || !o.offered.includes(choice)) continue;
      const claim = claimFor(row, choice, o.own);
      const delta = knobDelta(engine, row, t, choice);
      const before = detailOf(shipped, t, row.dimension);
      const newlyOffered = !before || before.own === choice || !before.offered.includes(choice);
      const reasons = [];
      if (keyedRow(t, row.dimension, choice)) reasons.push("A_keyed_row");
      if (weakNow.has(`${t}|${row.dimension}|${choice}`)) reasons.push("B_weak_now");
      if (claim && bestDelta !== null && !bestOutside && delta <= bestDelta + EPS) reasons.push("C_weakest_under_table");
      if (newlyOffered) reasons.push("D_newly_offered");
      //  E（審查 M1）：修正表改了這個選擇的本來值、宣稱或旋鈕差距 ⇒ 出貨版設定上的證據不再成立。
      if (!newlyOffered && (before.own !== o.own || J(claimFor(row, choice, before.own)) !== J(claim) || Math.abs(knobDelta(shipped, row, t, choice) - delta) > EPS)) reasons.push("E_changed_by_table");
      if (!reasons.length) continue;
      //  沒有宣稱（例如模板的值不在任何選項上，own＝null）：沒有事前登記的指標可量 ⇒ 不跑、判 no_claim（不提供），不臨時發明指標。
      items.push({ template: t, dimension: row.dimension, choice, own: o.own, metric: claim?.metric ?? null, direction: claim?.direction ?? null, delta: Math.round(delta * 1e6) / 1e6, reasons });
    }
  }
  return items;
}

const REG_REL = "tools/fixtures/exclusion_v21b1_registration_3aB.json";
if (flag("plan-json")) { console.log(J(buildExclusionPlan())); process.exit(0); }
if (flag("plan")) {
  const PLAN = buildExclusionPlan();
  const nm = PLAN.filter((b) => b.metric).length;
  console.log(`${PLAN.length} 項：要跑 ${nm} 批＋${TEMPLATES.length} 組對照；沒有宣稱 ${PLAN.length - nm} 項（不跑，判不提供）`);
  for (const b of PLAN) console.log(`${b.template} ${b.dimension}=${b.choice} own=${b.own} ${b.metric ?? "(no claim)"} ${b.direction ?? ""} d=${b.delta} [${b.reasons.join(",")}]`);
  process.exit(0);
}

/** 第一階段：真實性表的同一條（TRUTH_GATE）。st＝pairStats 的輸出。 */
export const verdictOf = (st, direction) => {
  if (st.z === null || st.n < 20) return "unmeasurable";
  const zd = st.z * (direction === "up" ? 1 : -1);
  return zd >= PASS_Z ? "pass" : zd >= MARGINAL_Z ? "marginal" : zd <= -MARGINAL_Z ? "reversed" : "no_effect";
};
/** 第二階段：n=400 複驗的同一條（一側）。 */
export const meetsReplication = (st, direction) => {
  if (st.z === null || st.rel === null) return false;
  const sg = direction === "up" ? 1 : -1;
  return st.z * sg >= REPL_Z && st.rel * sg >= REPL_REL;
};

//  儀器檢查（審查 m7，不跑對局）：對照組真的是修正表的設定、與出貨版不同；每個臂經 Resolver（同 binding 路徑）得到的旋鈕＝修正表引擎的投影。
async function instrumentProblems(items) {
  process.env.ESMO_BALANCE_SKILLS = "on";
  const { tacticInputOf } = await imp("tools/lib/tacticTruthSim.mjs");
  const { resolveTactic } = await imp("src/battle/moba/tactics/tacticResolver.js");
  const { modules, configure } = await imp("tools/balance/moba_items_balance_runner.mjs");
  const M = await modules();
  const bad = [];
  for (const t of TEMPLATES) {
    const { e } = configure(1, "standard", M, 1, null, { blue: tacticInputOf({ templateId: t, choices: {} }), red: tacticInputOf(null) }, RULESET);
    const K = e.director.knobs("blue"), I = e.director.identity("blue");
    const want = projected(engine, t, {}), ship = projected(shipped, t, {});
    if (K.retreatAt !== want.knobs.retreatAt || (I?.engageBias ?? 0) !== (want.identity?.engageBias ?? 0)) bad.push(`control ${t} 不是修正表的設定`);
    if (J([want.knobs, want.identity]) === J([ship.knobs, ship.identity])) bad.push(`control ${t} 與出貨版相同`);
    if (J(templateConfigFor(t, TB)) === J(templateById(t).config)) bad.push(`template ${t} 沒有修正`);
  }
  for (const b of items.filter((x) => x.metric)) {
    //  複審：臂也走對局的組裝路徑，看引擎 t＝0 實際拿到的旋鈕。
    const { e } = configure(1, "standard", M, 1, null, { blue: tacticInputOf({ templateId: b.template, choices: nestedOf([[b.dimension, b.choice]]) }), red: tacticInputOf(null) }, RULESET);
    const arm = projected(engine, b.template, nestedOf([[b.dimension, b.choice]]));
    const early = arm.phases?.[0] ?? arm;
    if (e.director.knobs("blue").retreatAt !== early.knobs.retreatAt || (e.director.identity("blue")?.engageBias ?? 0) !== (early.identity?.engageBias ?? 0)) bad.push(`engine ${b.template} ${b.dimension}=${b.choice}`);
    const r = resolveTactic(tacticInputOf({ templateId: b.template, choices: nestedOf([[b.dimension, b.choice]]) }), {}, { phases: true, templateBalance: TB });
    const want = projected(engine, b.template, nestedOf([[b.dimension, b.choice]]));
    if (!r.ok || J(r.knobs) !== J(want.knobs) || J(r.identity) !== J(want.identity) || J(r.phases.map((p) => [p.knobs, p.identity])) !== J(want.phases.map((p) => [p.knobs, p.identity]))) bad.push(`arm ${b.template} ${b.dimension}=${b.choice}`);
  }
  return bad;
}

if (flag("selftest")) {
  const PLAN = buildExclusionPlan();
  let pass = 0, fail = 0;
  const ck = (l, ok, n = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}${n ? `　${n}` : ""}`); };
  const v = (z, dir = "up", n = 100) => verdictOf({ z, n }, dir);
  ck("S1 第一階段：z≥3 ⇒ pass（沒有效果量門檻，與真實性表相同）；2≤z<3 ⇒ marginal；|z|<2 ⇒ no_effect；z≤-2 ⇒ reversed", v(3) === "pass" && v(2.99) === "marginal" && v(2) === "marginal" && v(1.99) === "no_effect" && v(-2) === "reversed");
  ck("S2 方向向下鏡像；n<20 或 z=null ⇒ unmeasurable", v(-3, "down") === "pass" && v(5, "up", 19) === "unmeasurable" && v(null) === "unmeasurable");
  ck("S2b 第二階段（一側）：z≥3 且 rel≥0.05 才算；方向向下鏡像；rel 沒有 ⇒ 不算", meetsReplication({ z: 3, rel: 0.05 }, "up") && !meetsReplication({ z: 3, rel: 0.049 }, "up") && !meetsReplication({ z: 2.99, rel: 0.5 }, "up") && meetsReplication({ z: -3, rel: -0.05 }, "down") && !meetsReplication({ z: 3, rel: null }, "up"));
  const dups = new Set(PLAN.map((b) => `${b.template}|${b.dimension}|${b.choice}`));
  ck("S3 項目不重複；都在 m3／m7／m8；指標與方向同時有或同時沒有", dups.size === PLAN.length && PLAN.every((b) => TEMPLATES.includes(b.template) && !!b.metric === !!b.direction));
  const keyedAll = [...MEASURED_EXCLUSIONS, ...REPLICATION_WITHHELD].filter((x) => TEMPLATES.includes(x.template));
  const inPlan = (x) => PLAN.some((b) => b.template === x.template && b.dimension === x.dimension && b.choice === x.choice);
  ck("S4 目前 m3／m7／m8 的每一筆排除列要嘛進清單，要嘛被不分模板的「*」列涵蓋（std 層級，不在範圍），要嘛結構上不提供", keyedAll.every((x) => inPlan(x) || starWithheld(x.dimension, x.choice) || !detailOf(engine, x.template, x.dimension)?.offered.includes(x.choice) || detailOf(engine, x.template, x.dimension)?.own === x.choice));
  ck("S5 v21.b1 下 m7 上路本來的選擇與出貨版不同（修正表真的進了這條路）", detailOf(engine, "classic.m7", "lanes.top.stance")?.own !== detailOf(shipped, "classic.m7", "lanes.top.stance")?.own);
  //  審查 M1 抓到的兩個漏網：m3 的團戰姿態（own＝null、沒有宣稱）與 m8 的 aggressive（本來的選擇變了、與 m7 並列最小）。
  const has = (t, d, c) => PLAN.find((b) => b.template === t && b.dimension === d && b.choice === c);
  const cOnly = PLAN.filter((x) => x.reasons.length === 1 && x.reasons[0] === "C_weakest_under_table").length;
  ck("S6b 複審 3：沒有「只因與表外模板並列最小」而選進來的項目（這條規則下 C 只落在這三個模板）", PLAN.every((x) => !x.reasons.includes("C_weakest_under_table") || x.metric), `C only ${cOnly}`);
  ck("S6 審查 M1 的漏網都進清單：m3 teamfight.posture 三個選項（沒有宣稱、判不提供）；m8 teamfight.posture=aggressive（有宣稱）",
    ["passive", "standard", "aggressive"].every((c) => { const x = has("classic.m3", "teamfight.posture", c); return x && x.metric === null; }) && !!has("classic.m8", "teamfight.posture", "aggressive")?.metric,
    J(["passive", "standard", "aggressive"].map((c) => has("classic.m3", "teamfight.posture", c)?.reasons ?? null)));
  const runnerSrc = fs.readFileSync(path.join(ROOT, "tools/balance/moba_items_balance_runner.mjs"), "utf8"), selfSrc = fs.readFileSync(SELF, "utf8");
  ck("S8 worker 旗標不與 balance runner 的 --worker 撞名（撞名會多送 ready、任務錯位）", runnerSrc.includes('process.argv.includes("--worker")') && !/workerArgs: \["--worker"\]/.test(selfSrc) && !selfSrc.includes(["if (flag(", '"worker"', "))"].join("")));
  const inst = await instrumentProblems(PLAN);
  ck("S7 儀器檢查：對照組＝修正表設定且與出貨版不同；每個臂的 Resolver 旋鈕＝修正表引擎的投影", inst.length === 0, inst.slice(0, 5).join(" ¦ "));
  console.log(`\nselftest：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
  process.exit(fail ? 1 : 0);
}

const REG_TEXT = fs.readFileSync(path.join(ROOT, REG_REL), "utf8").replace(/\r\n/g, "\n"), REG = JSON.parse(REG_TEXT);
const [SEED_A, SEED_B] = REG.seeds.range.split("-").map(Number);
const SEEDS = Array.from({ length: SEED_B - SEED_A + 1 }, (_, i) => SEED_A + i);
//  批次一律來自登記檔（審查 m4）：套用排除列之後重算的清單理由會變，但已登記、已量的批次不變。
const ITEMS = REG.plan.items;
const RUN_ITEMS = ITEMS.filter((b) => b.metric);
const keyOfPlan = (b) => `${b.template}|${b.dimension}|${b.choice}`;
const armOf = (b) => ({ templateId: b.template, choices: nestedOf([[b.dimension, b.choice]]) });
const CONTROLS = TEMPLATES.map((t) => ({ key: `control|${t}`, blue: { templateId: t, choices: {} } }));
const BATCHES = [...CONTROLS, ...RUN_ITEMS.map((b) => ({ key: keyOfPlan(b), blue: armOf(b) }))];
const tasks = BATCHES.flatMap((b) => SEEDS.map((s) => ({ id: `${b.key}#${s}`, key: b.key, seed: s, blue: b.blue })));
const SV = await imp("src/platform/contracts/simulationVersion.js");
const SIM = (await imp("tools/lib/tacticTruthSim.mjs")).TRUTH_SIM_VERSION;
const STABLE = { registration: sha16(REG_TEXT), plan: sha16(J(ITEMS)), simVersion: SIM };
//  即時檢查：紀錄裡的 seed 與 worker 回報的任務都要等於這一場（錯位就停，不讓結果對到別的場次）。
const recCheck = (rec, t) => [...(rec?.seed === t.seed ? [] : [`seed ${rec?.seed} != ${t.seed}`]), ...(rec?.taskId === t.id ? [] : [`task ${rec?.taskId} != ${t.id}`])];
const STAGE1_RESULT = "tools/fixtures/exclusion_v21b1_result_3aB.json", STAGE2_RESULT = "tools/fixtures/exclusion_v21b1_stage2_result_3aB.json";
//  複審：開跑時 src、量測程式必須與登記檔最後一次提交時相同（不能換一個資料夾用別的程式重跑）。
const { execSync } = await import("node:child_process");
const git = (c) => execSync(c, { cwd: ROOT, encoding: "utf8" }).trim();
const codeMovedSinceRegistration = () => {
  const regCommit = git(`git log -1 --format=%H -- ${REG_REL}`);
  return git(`git diff --name-only ${regCommit} HEAD -- src tools/lib tools/balance tools/measure_exclusion_v21b1_3aB.mjs`);
};
const DIR = val("dir");
if (!DIR) { console.error("需要 --dir"); process.exit(2); }

if (flag("run")) {
  if (!/^APPROVE/.test(REG.review?.verdict ?? "") || !REG.review?.reviewedAt) { console.error("登記沒有 APPROVE 的獨立審查：不得開跑"); process.exit(2); }
  if (J(ITEMS) !== J(buildExclusionPlan())) { console.error("登記的清單與重算不同：不得開跑"); process.exit(2); }
  { const moved = codeMovedSinceRegistration(); if (moved) { console.error(`登記之後程式變了：${moved}`); process.exit(2); } }
  const prov = provenance();
  if (prov.dirtyFilesUnderSrcTools) { console.error("src／tools 有未提交變更"); process.exit(2); }
  if (fs.existsSync(path.join(ROOT, STAGE1_RESULT))) { console.error("結果檔已存在：這些 seeds 已觀察過"); process.exit(2); }
  const inst = await instrumentProblems(ITEMS);
  if (inst.length) { console.error(`儀器檢查失敗：${inst.join(" ¦ ")}`); process.exit(2); }
  //  gitHead、指紋進 meta（審查 M7）：中斷後換了程式再續跑會被 runStudy 擋下。
  const META = { ...STABLE, gitHead: prov.gitHead, fingerprint: SV.SIMULATION_SEMANTICS_FINGERPRINTS[SV.MOBA_SIMULATION_VERSION] };
  const res = await runStudy({ dir: DIR, tasks, workerFile: SELF, workerArgs: ["--exclusion-worker"], meta: META, workers: Number(val("workers", 3)), label: "P6 排除列重新判定", check: recCheck });
  process.exit(res.halted ? 5 : res.stopped ? 3 : res.failed || res.lost ? 6 : 0);
}

if (flag("report")) {
  //  審查 minor 4：結果檔提交後不得重算（排除列套用後 offeredToday 會變，第二階段比對的雜湊也會變）。
  if (fs.existsSync(path.join(ROOT, STAGE1_RESULT))) { console.error(`⛔ ${STAGE1_RESULT} 已存在：研究已結束，不重算`); process.exit(5); }
  const { metricValue, pairStats } = await imp("tools/lib/tacticTruthSim.mjs");
  const m = JSON.parse(fs.readFileSync(path.join(DIR, "meta.json"), "utf8"));
  if (Object.entries(STABLE).some(([k, v]) => m.meta[k] !== v)) { console.error("資料夾的登記／清單與目前不同：不判定"); process.exit(2); }
  const audit = auditStudy(DIR, tasks, recCheck);
  if (audit.instrument.length) { console.error(`⛔ 紀錄與任務不符：${audit.instrument.slice(0, 3).join(" ¦ ")}（不判定）`); process.exit(5); }
  if (audit.halt) { console.error(`⛔ HALT：${audit.halt}`); process.exit(5); }
  if (audit.missing) { console.log(`資料未完整：還有 ${audit.missing} 場（不判定）`); process.exit(6); }
  const errRule = errorRule(audit.errored.length, tasks.length);
  const errSeeds = new Set(audit.errored.map((x) => x.seed));
  const S = SEEDS.filter((s) => !errSeeds.has(s));
  const r6 = (x) => (x === null || x === undefined ? null : Math.round(x * 1e6) / 1e6);
  const rows = ITEMS.map((b) => {
    //  offeredToday：目前（排除列套用前）的提供清單裡有沒有它 ⇒ 判定不提供的就是會被撤下的選項，報告逐項列出。
    const offeredToday = engine.offeredDetail(b.template, b.dimension, [], {})?.offered.includes(b.choice) ?? false;
    if (!b.metric) return { ...b, offeredToday, n: 0, verdict: "no_claim" };
    const trt = readKey(DIR, keyOfPlan(b)), ctl = readKey(DIR, `control|${b.template}`);
    const pairs = S.map((s) => [r6(metricValue(ctl.get(`control|${b.template}#${s}`), "blue", b.metric)), r6(metricValue(trt.get(`${keyOfPlan(b)}#${s}`), "blue", b.metric))]);
    const st = pairStats(pairs);
    //  審查 m1：有任何出錯的場次 ⇒ 不判定（交 Owner），不把少了 seed 的結果當成判定。
    return { ...b, offeredToday, n: st.n, meanControl: r6(st.meanA), meanChoice: r6(st.meanB), diff: r6(st.diff), rel: r6(st.rel), z: r6(st.z), verdict: errRule ? "undecided" : verdictOf(st, b.direction) };
  });
  const out = { schema: "ExclusionV21b1Result.v1", at: new Date().toISOString(), run: m.meta, seeds: REG.seeds.range, errored: audit.errored.length, errorRule: errRule, rule: { passZ: PASS_Z, marginalZ: MARGINAL_Z }, rows };
  fs.writeFileSync(path.join(ROOT, STAGE1_RESULT), JSON.stringify(out, null, 1) + "\n");
  for (const r of rows) console.log(`${r.verdict.padEnd(12)} ${r.template} ${r.dimension}=${r.choice} ${r.metric ?? "(no claim)"} ${r.direction ?? ""} n=${r.n} z=${r.z ?? "-"} rel=${r.rel ?? "-"} [${r.reasons.join(",")}]`);
  const lost = rows.filter((r) => r.offeredToday && r.verdict !== "pass" && r.verdict !== "marginal");
  console.log(`\n目前提供、判定不提供（會被撤下）：${lost.length} 項${lost.length ? "：" + lost.map((r) => `${r.template} ${r.dimension}=${r.choice}`).join("、") : ""}`);
  console.log(`邊際（進第二階段）：${rows.filter((r) => r.verdict === "marginal").length} 項`);
  console.log(`判定：errored ${audit.errored.length}${errRule ? `（${errRule}：不判定，交 Owner）` : ""}`);
  process.exit(errRule === "STOP" ? 5 : errRule ? 6 : 0);
}

// ── 第二階段：第一階段的邊際項，新 seeds、紅藍雙方（登記 decisionRule.stage2；只讀已提交的第一階段結果）──────────
if (flag("stage2-run") || flag("stage2-report")) {
  const R1 = JSON.parse(fs.readFileSync(path.join(ROOT, STAGE1_RESULT), "utf8"));
  const marg = R1.rows.filter((r) => r.verdict === "marginal");
  const [A2, B2] = REG.decisionRule.stage2.range.split("-").map(Number);
  const S2 = Array.from({ length: B2 - A2 + 1 }, (_, i) => A2 + i);
  const side2 = ["blue", "red"];
  const tpls = [...new Set(marg.map((r) => r.template))];
  const t2 = [];
  for (const side of side2) {
    for (const t of tpls) for (const s of S2) t2.push({ id: `s2|${side}|control|${t}#${s}`, key: `s2|${side}|control|${t}`, seed: s, [side]: { templateId: t, choices: {} } });
    for (const r of marg) for (const s of S2) t2.push({ id: `s2|${side}|${keyOfPlan(r)}#${s}`, key: `s2|${side}|${keyOfPlan(r)}`, seed: s, [side]: armOf(r) });
  }
  const STABLE2 = { ...STABLE, stage1: sha16(J(R1.rows)), range: REG.decisionRule.stage2.range };
  if (flag("stage2-run")) {
    if (git(`git status --porcelain -- ${STAGE1_RESULT}`) || !git(`git log -1 --format=%H -- ${STAGE1_RESULT}`)) { console.error("第一階段結果要先提交"); process.exit(2); }
    if (R1.errorRule) { console.error("第一階段沒有判定：交 Owner"); process.exit(2); }
    { const moved = codeMovedSinceRegistration(); if (moved) { console.error(`登記之後程式變了：${moved}`); process.exit(2); } }
    if (provenance().dirtyFilesUnderSrcTools) { console.error("src／tools 有未提交變更"); process.exit(2); }
    if (fs.existsSync(path.join(ROOT, STAGE2_RESULT))) { console.error("第二階段結果檔已存在：這些 seeds 已觀察過"); process.exit(2); }
    console.log(`第二階段：邊際 ${marg.length} 項，${t2.length} 場`);
    const res = await runStudy({ dir: DIR, tasks: t2, workerFile: SELF, workerArgs: ["--exclusion-worker"], meta: { ...STABLE2, gitHead: provenance().gitHead }, workers: Number(val("workers", 3)), label: "P6 第二階段（邊際紅藍複驗）", check: recCheck });
    process.exit(res.halted ? 5 : res.stopped ? 3 : res.failed || res.lost ? 6 : 0);
  }
  const { metricValue, pairStats } = await imp("tools/lib/tacticTruthSim.mjs");
  const m2 = JSON.parse(fs.readFileSync(path.join(DIR, "meta.json"), "utf8"));
  if (Object.entries(STABLE2).some(([k, v]) => m2.meta[k] !== v)) { console.error("資料夾的登記與目前不同：不判定"); process.exit(2); }
  const audit = auditStudy(DIR, t2, recCheck);
  if (audit.instrument.length) { console.error(`⛔ 紀錄與任務不符：${audit.instrument.slice(0, 3).join(" ¦ ")}（不判定）`); process.exit(5); }
  if (audit.halt) { console.error(`⛔ HALT：${audit.halt}`); process.exit(5); }
  if (audit.missing) { console.log(`資料未完整：還有 ${audit.missing} 場（不判定）`); process.exit(6); }
  const errRule = errorRule(audit.errored.length, t2.length);
  const errSeeds = new Set(audit.errored.map((x) => x.seed));
  const S = S2.filter((s) => !errSeeds.has(s));
  const r6 = (x) => (x === null || x === undefined ? null : Math.round(x * 1e6) / 1e6);
  const rows = marg.map((r) => {
    const sides = {};
    for (const side of side2) {
      const trt = readKey(DIR, `s2|${side}|${keyOfPlan(r)}`), ctl = readKey(DIR, `s2|${side}|control|${r.template}`);
      const st = pairStats(S.map((s) => [r6(metricValue(ctl.get(`s2|${side}|control|${r.template}#${s}`), side, r.metric)), r6(metricValue(trt.get(`s2|${side}|${keyOfPlan(r)}#${s}`), side, r.metric))]));
      sides[side] = { n: st.n, rel: r6(st.rel), z: r6(st.z), meets: meetsReplication(st, r.direction) };
    }
    return { template: r.template, dimension: r.dimension, choice: r.choice, metric: r.metric, direction: r.direction, ...sides, verdict: errRule ? "undecided" : sides.blue.meets && sides.red.meets ? "confirmed" : "not_replicated" };
  });
  fs.writeFileSync(path.join(ROOT, STAGE2_RESULT), JSON.stringify({ schema: "ExclusionV21b1Stage2Result.v1", at: new Date().toISOString(), run: m2.meta, seeds: REG.decisionRule.stage2.range, errored: audit.errored.length, errorRule: errRule, rule: { minZ: REPL_Z, minRel: REPL_REL, sides: side2 }, rows }, null, 1) + "\n");
  for (const r of rows) console.log(`${r.verdict.padEnd(15)} ${r.template} ${r.dimension}=${r.choice} 藍 z=${r.blue.z} rel=${r.blue.rel}／紅 z=${r.red.z} rel=${r.red.rel}`);
  process.exit(errRule === "STOP" ? 5 : errRule ? 6 : 0);
}
