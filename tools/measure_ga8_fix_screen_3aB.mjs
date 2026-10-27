#!/usr/bin/env node
// ============================================================================
//  tools/measure_ga8_fix_screen_3aB.mjs — Phase 3a-B 修正規劃：G-A8 方案 C 候選篩選（登記 tools/fixtures/ga8_fix_screen_registration_3aB.json）
//
//  node tools/measure_ga8_fix_screen_3aB.mjs --plan
//  node tools/measure_ga8_fix_screen_3aB.mjs --validate --vdir=<repo 外新資料夾>     V1–V3
//  node tools/measure_ga8_fix_screen_3aB.mjs --run --dir=<repo 外新資料夾> --vdir=<同上> [--workers=3]   要 review.reviewedAt＋validation 通過
//  node tools/measure_ga8_fix_screen_3aB.mjs --report --dir=<同一個>        寫 tools/fixtures/ga8_fix_screen_result_3aB.json
//  node tools/measure_ga8_fix_screen_3aB.mjs --selftest
//
//  篩選用：src/ 不動、模板不改。候選設定只存在這支工具裡，走 legacy 輸入（旋鈕研究驗證過與 G-A8 的 binding 路徑逐場相同）。
//  G-A8 判定（STOP）不變；選出的候選只是給 Owner 的提案，必須在 Owner 核准、版本化修改模板之後，用保留的新 seeds 重跑 G-A8 確認。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runStudy, readKey, provenance, sha16, auditStudy, errorRule, pairedStats, meanSd, insideRepo, ROOT } from "./lib/studyRunner.mjs";

const SELF = fileURLToPath(import.meta.url);
const args = process.argv.slice(2);
const flag = (k) => args.includes(`--${k}`);
const val = (k, d = null) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const REG_REL = "tools/fixtures/ga8_fix_screen_registration_3aB.json";
const REG_TEXT = fs.readFileSync(path.join(ROOT, REG_REL), "utf8"), REG = JSON.parse(REG_TEXT);
const imp = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const RULESET = "balanceTool.v21";
const near = (a, b) => typeof a === "number" && typeof b === "number" && Math.abs(a - b) < 1e-12;

function knobProbe(e, side) {
  const K = e.director.knobs(side), I = e.director.identity(side);
  return { retreatAt: K.retreatAt, laneOffsetValues: Object.values(K.laneOffset ?? {}).sort((a, b) => a - b), engageBias: I?.engageBias ?? 0, retreatFloorShift: I?.retreatFloorShift ?? 0, commitShift: I?.commitShift ?? 0 };
}

if (flag("screen-worker")) {
  process.env.ESMO_BALANCE_SKILLS = "on";
  delete process.env.ESMO_BALANCE_TALENTS;
  const { modules, configure } = await imp("tools/balance/moba_items_balance_runner.mjs");
  const { tacticInputOf } = await imp("tools/lib/tacticTruthSim.mjs");
  const { objectiveLayoutForSeed } = await imp("src/platform/contracts/objectiveLayout.js");
  const M = await modules();
  process.on("message", async (t) => {
    try {
      //  t.binding＝true（只用於 V1）：同一個模板走戰術書的 binding 路徑（沒有任何選擇）。
      const plan = t.binding ? tacticInputOf({ templateId: t.template, choices: {} }) : { kind: "legacy", config: structuredClone(t.config) };
      const std = tacticInputOf({ templateId: "std", choices: {} });
      const blueIsArm = t.seed % 2 === 1, side = blueIsArm ? "blue" : "red";
      const { e } = configure(t.seed, "standard", M, 1, null, { blue: blueIsArm ? plan : std, red: blueIsArm ? std : plan }, RULESET);
      const probe = knobProbe(e, side);
      for (let i = 1; i * 0.5 <= 3600 && !e.over; i++) e.tick(0.5);
      const win = e.over && (e.winner === "blue" || e.winner === "red") ? (e.winner === side ? 1 : 0) : 0.5;
      process.send({ type: "done", id: t.id, rec: { seed: t.seed, arm: t.arm, binding: !!t.binding, side, layout: objectiveLayoutForSeed(t.seed), ruleset: RULESET,
        layers: { heroSkills: !!M.skills, battleTalents: !!M.talents }, director: e.director?.mode ?? null, laneFrame: e.director?.laneFrame ?? null, probe, win, duration: e.t } });
    } catch (err) { process.send({ type: "error", id: t.id, error: String(err?.stack ?? err) }); }
  });
  process.send({ type: "ready" });
  await new Promise(() => {});
}

// ── 純函式（selftest 涵蓋）────────────────────────────────────────────────
export function rateCI(wins) {
  const n = wins.length, p = wins.reduce((a, b) => a + b, 0) / Math.max(1, n);
  const sd = Math.sqrt(wins.reduce((a, b) => a + (b - p) ** 2, 0) / Math.max(1, n - 1)), se = sd / Math.sqrt(Math.max(1, n));
  const lo = p - 1.96 * se, hi = p + 1.96 * se;
  const label = p >= 0.6 && lo > 0.55 ? "STOP" : p >= 0.57 ? "WARN strong" : p <= 0.43 ? "WARN weak" : null;
  return { n, rate: p, lo, hi, label };
}
/** 登記的選擇規則：依列出的順序取第一個達標的候選；strong＝勝率 < 0.57，weak＝勝率 > 0.43。 */
export function selectCandidate(kind, candidates) {
  const ok = (c) => (kind === "strong" ? c.rate < 0.57 : c.rate > 0.43);
  const pick = candidates.find(ok);
  if (!pick) return { selected: null, verdict: "NO_CANDIDATE" };
  const borderline = kind === "strong" ? pick.hi >= 0.57 : pick.lo <= 0.43;
  return { selected: pick.arm, verdict: borderline ? "SELECTED_BORDERLINE" : "SELECTED" };
}
/** BASE 在篩選 seeds 上是否重現 G-A8 的旗標（strong：STOP 或 WARN strong；weak：WARN weak）。 */
export const reproduced = (kind, label) => (kind === "strong" ? label === "STOP" || label === "WARN strong" : label === "WARN weak");
const setPath = (o, p, v) => { const ks = p.split("."); let x = o; for (const k of ks.slice(0, -1)) x = x[k]; x[ks.at(-1)] = v; };

if (flag("selftest")) {
  let pass = 0, fail = 0;
  const ck = (l, ok) => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}`); };
  ck("S1 rateCI 標籤＝G-A8 規則：0.62／n400 STOP、0.58 WARN strong、0.43 WARN weak、0.5 無", rateCI(Array.from({ length: 400 }, (_, i) => (i < 248 ? 1 : 0))).label === "STOP" && rateCI(Array.from({ length: 400 }, (_, i) => (i < 232 ? 1 : 0))).label === "WARN strong" && rateCI(Array.from({ length: 400 }, (_, i) => (i < 172 ? 1 : 0))).label === "WARN weak" && rateCI(Array.from({ length: 400 }, (_, i) => (i < 200 ? 1 : 0))).label === null);
  ck("S2 選擇：依序取第一個達標（A 0.58 不達標、B 0.55 達標 ⇒ B）", selectCandidate("strong", [{ arm: "A", rate: 0.58, hi: 0.63 }, { arm: "B", rate: 0.55, hi: 0.6 }]).selected === "B");
  ck("S3 選擇：區間碰到 0.57 ⇒ SELECTED_BORDERLINE；全不達標 ⇒ NO_CANDIDATE", selectCandidate("strong", [{ arm: "A", rate: 0.55, hi: 0.6 }]).verdict === "SELECTED_BORDERLINE" && selectCandidate("strong", [{ arm: "A", rate: 0.6, hi: 0.65 }]).verdict === "NO_CANDIDATE");
  ck("S4 weak 方向：0.44 達標、0.43 不達標", selectCandidate("weak", [{ arm: "A", rate: 0.43, lo: 0.38 }, { arm: "B", rate: 0.44, lo: 0.4 }]).selected === "B");
  ck("S5 重現：strong 認 STOP／WARN strong，weak 只認 WARN weak", reproduced("strong", "WARN strong") && !reproduced("strong", null) && reproduced("weak", "WARN weak") && !reproduced("weak", "WARN strong"));
  ck("S6 setPath 只改指定欄位", (() => { const o = { a: { b: 1, c: 2 } }; setPath(o, "a.b", 5); return o.a.b === 5 && o.a.c === 2; })());
  console.log(`\nselftest：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
  process.exit(fail ? 1 : 0);
}

// ── 臂 ─────────────────────────────────────────────────────────────────────
const { TACTIC_TEMPLATE_LIST } = await imp("src/platform/tactics/tacticTemplates.js");
const MTC = await imp("src/platform/contracts/MobaTacticConfig.js");
const OV = await imp("src/platform/tactics/tacticOverlays.js");
const cfgOf = (id) => { const t = TACTIC_TEMPLATE_LIST.find((x) => x.templateId === id); if (!t) throw new Error(`no template ${id}`); return structuredClone(t.config); };
const ARMS = Object.entries(REG.arms).map(([arm, d]) => { const c = cfgOf(d.template); for (const [p, v] of Object.entries(d.change)) setPath(c, p, v); return { arm, template: d.template, change: d.change, config: c, base: arm === "STD" || arm.startsWith("BASE_") ? null : `BASE_${d.template}` }; });
const ARM = Object.fromEntries(ARMS.map((x) => [x.arm, x]));
const expectOf = (config) => { const K = MTC.toEngineTactic(config), I = MTC.toEngineTacticIdentity(config); return { retreatAt: K.retreatAt, laneOffsetValues: Object.values(K.laneOffset).sort((a, b) => a - b), engageBias: I.engageBias, retreatFloorShift: I.retreatFloorShift, commitShift: I.commitShift }; };
for (const x of ARMS) x.expect = expectOf(x.config);
const probeEq = (p, q) => ["retreatAt", "engageBias", "retreatFloorShift", "commitShift"].every((k) => near(p[k], q[k])) && p.laneOffsetValues.length === q.laneOffsetValues.length && p.laneOffsetValues.every((v, i) => near(v, q.laneOffsetValues[i]));
const sigOf = (cfg) => { const a = MTC.toEngineTactic(cfg), b = MTC.toEngineTacticIdentity(cfg); delete a.tacticId; delete b.tacticId; return JSON.stringify([a, b]); };
const KIND = { "classic.m3": "strong", "classic.m7": "strong", "classic.m1": "strong", "v2.three_lane_pressure": "strong", "v2.mid_jungle_sync": "strong", "v2.defensive_hold": "weak", "classic.m8": "weak", "v2.mid_solo_split": "weak" };
const [S0, S1] = REG.seeds.range.split("-").map(Number);
const SEEDS = Array.from({ length: S1 - S0 + 1 }, (_, i) => S0 + i);
const taskOf = (x, seed, binding = false) => ({ id: `${x.arm}#${seed}${binding ? "#binding" : ""}`, key: binding ? `${x.arm}.binding` : x.arm, seed, arm: x.arm, template: x.template, config: x.config, binding });
const tasks = ARMS.flatMap((x) => SEEDS.map((seed) => taskOf(x, seed)));
if (flag("plan")) { console.log(`${ARMS.length} 臂 × ${SEEDS.length} seeds ＝ ${tasks.length} 場`); for (const x of ARMS) console.log(`  ${x.arm.padEnd(30)} ${x.template.padEnd(24)} ${JSON.stringify(x.change)}`); process.exit(0); }

const recCheck = (r, t) => {
  const p = [];
  if (!(r.ruleset === RULESET && r.director === "core.v1" && r.laneFrame === "teamRelative" && r.layers?.heroSkills && !r.layers?.battleTalents)) p.push("instrument mismatch");
  const x = ARM[t?.arm ?? r.arm];
  if (!x || r.arm !== x.arm || !r.probe || !probeEq(r.probe, x.expect)) p.push("knob probe mismatch");
  return p;
};
const envBad = Object.keys(process.env).filter((k) => k.startsWith("ESMO_BALANCE_"));
const SV = await imp("src/platform/contracts/simulationVersion.js");
const FP = SV.SIMULATION_SEMANTICS_FINGERPRINTS[SV.MOBA_SIMULATION_VERSION];
const META = { study: REG.studyId, registration: sha16(REG_TEXT), fingerprint: FP };
if ((flag("validate") || flag("run")) && !REG.fingerprint.startsWith(FP)) { console.error(`登記的指紋與目前不同（目前 ${FP}）：拒絕`); process.exit(2); }

if (flag("validate")) {
  if (envBad.length) { console.error(`環境有 ${envBad.join(",")}：拒絕`); process.exit(2); }
  const VDIR = val("vdir");
  if (!VDIR || insideRepo(VDIR)) { console.error("需要 repo 外的 --vdir"); process.exit(2); }
  let pass = 0, fail = 0;
  const ck = (l, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}${ok || !d ? "" : `　${d}`}`); };
  // V2：合法、範圍內、旋鈕組互異、只改宣告欄位
  const get = (o, p) => p.split(".").reduce((x, k) => x?.[k], o);
  const NUM_PATHS = ["macro.aggression", "macro.riskTolerance", "macro.grouping", "macro.splitPush", "objectives.dragonPriority", "objectives.heraldPriority", "objectives.baronPriority", "objectives.towerPriority", "objectives.invadePriority", "economy.supportRoamRate", "economy.jungleResourceShare"];
  const refs = [...MTC.MOBA_TACTICS, MTC.STANDARD_OPP_TACTIC];
  for (const o of OV.TACTIC_OVERLAYS) refs.push(OV.applyOverlayFields(MTC.mobaTacticById(o.baseTacticId), o.changedFields));
  const range = Object.fromEntries(NUM_PATHS.map((p) => { const xs = refs.map((c) => get(c, p)); return [p, [Math.min(...xs), Math.max(...xs)]]; }));
  const deepDiff = (a, b, p = "") => (a && b && typeof a === "object" && typeof b === "object" ? [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap((k) => deepDiff(a[k], b[k], p ? `${p}.${k}` : k)) : JSON.stringify(a) === JSON.stringify(b) ? [] : [p]);
  const otherSigs = new Map(TACTIC_TEMPLATE_LIST.map((t) => [sigOf(t.config), t.templateId]));
  const candSigs = new Map();
  const v2 = ARMS.map((x) => {
    const problems = [];
    if (!MTC.validateMobaTacticConfig(x.config).ok) problems.push("invalid");
    for (const p of NUM_PATHS) if (!(get(x.config, p) >= range[p][0] && get(x.config, p) <= range[p][1])) problems.push(`${p} out of range`);
    const d = deepDiff(cfgOf(x.template), x.config), declared = Object.keys(x.change);
    if (d.length !== declared.length || !d.every((k) => declared.includes(k))) problems.push(`diff ${d.join(",")}`);
    if (x.base) {
      const sg = sigOf(x.config);
      if (otherSigs.has(sg)) problems.push(`same knobs as ${otherSigs.get(sg)}`);
      if (candSigs.has(sg)) problems.push(`same knobs as ${candSigs.get(sg)}`);
      candSigs.set(sg, x.arm);
    }
    return problems.length ? `${x.arm}: ${problems.join(";")}` : null;
  }).filter(Boolean);
  ck(`V2 ${ARMS.length} 臂：設定合法、數值在已出貨範圍內、候選旋鈕組與每個模板／其他候選都不同、只改宣告欄位`, v2.length === 0 && ARMS.length === 22, v2.slice(0, 3).join(" | "));
  const v3a = ARMS.filter((x) => x.base && probeEq(x.expect, ARM[x.base].expect)).map((x) => x.arm);
  //  DH_A／DH_B／M8_B 只改列舉欄位：Director 數值可能與 BASE 相同；那就改用整份旋鈕組簽章判定非空轉。
  const v3aSig = v3a.filter((arm) => sigOf(ARM[arm].config) === sigOf(ARM[ARM[arm].base].config));
  ck("V3a 每個候選的引擎旋鈕組與自己的 BASE 不同（非空轉）", v3aSig.length === 0, v3aSig.join(","));
  const vSeeds = SEEDS.slice(0, 10);
  const baseArms = ARMS.filter((x) => !x.base);
  const vTasks = baseArms.flatMap((x) => vSeeds.flatMap((s) => [taskOf(x, s), taskOf(x, s, true)]));
  const pTasks = ARMS.filter((x) => x.base).flatMap((x) => vSeeds.slice(0, 2).map((s) => taskOf(x, s)));
  const res = await runStudy({ dir: VDIR, tasks: [...vTasks, ...pTasks], workerFile: SELF, workerArgs: ["--screen-worker"], meta: { ...META, validation: true }, workers: Number(val("workers", 3)), label: "候選篩選 validate", check: recCheck });
  if (res.halted || res.failed || res.lost) ck("驗證批次跑完", false, JSON.stringify(res));
  const diffs = [];
  for (const x of baseArms) for (const s of vSeeds) { const a = readKey(VDIR, x.arm).get(`${x.arm}#${s}`), b = readKey(VDIR, `${x.arm}.binding`).get(`${x.arm}#${s}#binding`); if (!a || !b || a.win !== b.win || a.duration !== b.duration) diffs.push(`${x.arm}#${s}`); }
  ck(`V1 legacy 路徑＝binding 路徑（STD＋8 BASE × ${vSeeds.length} seeds：win、duration）`, diffs.length === 0, diffs.slice(0, 5).join(","));
  const probeBad = [...vTasks, ...pTasks].filter((t) => { const r = readKey(VDIR, t.key).get(t.id); return !r || recCheck(r, t).length; }).map((t) => t.id);
  ck(`V3b 引擎 t＝0 的 Director 數值＝臂設定的預期（${vTasks.length + pTasks.length} 場）`, probeBad.length === 0, probeBad.slice(0, 5).join(","));
  const out = { at: new Date().toISOString(), gitHead: provenance().gitHead, registrationHash: META.registration, pass, fail };
  fs.writeFileSync(path.join(VDIR, "VALIDATION.json"), JSON.stringify(out, null, 1));
  console.log(`\nvalidate：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}（${VDIR}/VALIDATION.json）`);
  process.exit(fail ? 1 : 0);
}

const DIR = val("dir");
if (!DIR) { console.error("需要 --dir"); process.exit(2); }

if (flag("run")) {
  if (!/^registered/.test(REG.status) || !REG.review?.reviewedAt || !/^APPROVE( WITH CHANGES)?\b/.test(REG.review?.verdict ?? "")) { console.error("登記未經審查通過"); process.exit(2); }
  if (envBad.length) { console.error(`環境有 ${envBad.join(",")}：拒絕`); process.exit(2); }
  if (insideRepo(DIR)) { console.error("--dir 必須在 repo 外"); process.exit(2); }
  const VDIR = val("vdir");
  const vj = VDIR && fs.existsSync(path.join(VDIR, "VALIDATION.json")) ? JSON.parse(fs.readFileSync(path.join(VDIR, "VALIDATION.json"), "utf8")) : null;
  if (!vj || vj.fail !== 0 || vj.registrationHash !== META.registration) { console.error("需要 --vdir 指向本登記通過的 --validate 結果"); process.exit(2); }
  if (provenance().dirtyFilesUnderSrcTools) { console.error("src／tools 有未提交變更"); process.exit(2); }
  const res = await runStudy({ dir: DIR, tasks, workerFile: SELF, workerArgs: ["--screen-worker"], meta: META, workers: Number(val("workers", 3)), label: "G-A8 候選篩選", check: recCheck });
  process.exit(res.halted ? 5 : res.stopped ? 3 : res.failed || res.lost ? 6 : 0);
}

if (flag("report")) {
  const m = JSON.parse(fs.readFileSync(path.join(DIR, "meta.json"), "utf8"));
  if (JSON.stringify(m.meta) !== JSON.stringify(META)) { console.error("資料夾的登記／指紋與目前不同：不判定"); process.exit(2); }
  const audit = auditStudy(DIR, tasks, recCheck);
  if (audit.halt) { console.error(`⛔ HALT：${audit.halt}（不判定，交 Owner）`); process.exit(5); }
  if (audit.missing) { console.log(`資料未完整：還有 ${audit.missing} 場（不判定）`); process.exit(6); }
  const errSeeds = new Set(audit.errored.map((x) => x.seed));
  const S = SEEDS.filter((s) => !errSeeds.has(s));
  const recs = Object.fromEntries(ARMS.map((x) => [x.arm, readKey(DIR, x.arm)]));
  const R = (arm, s) => recs[arm].get(`${arm}#${s}`);
  const med = (xs) => { const a = [...xs].sort((p, q) => p - q); return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2; };
  const half = (arm, f) => rateCI(S.filter(f).map((s) => R(arm, s).win)).rate;
  const arms = ARMS.map((x) => ({ arm: x.arm, template: x.template, change: x.change, ...rateCI(S.map((s) => R(x.arm, s).win)),
    asBlue: half(x.arm, (s) => s % 2 === 1), asRed: half(x.arm, (s) => s % 2 === 0), standard: half(x.arm, (s) => R(x.arm, s).layout === "STANDARD"), swapped: half(x.arm, (s) => R(x.arm, s).layout === "SWAPPED"),
    medianDurationMin: med(S.map((s) => R(x.arm, s).duration)) / 60,
    ...(x.base ? { vsBase: pairedStats(S.map((s) => R(x.arm, s).win - R(x.base, s).win)), vsStd: pairedStats(S.map((s) => R(x.arm, s).win - R("STD", s).win)) } : {}) }));
  const A = Object.fromEntries(arms.map((a) => [a.arm, a]));
  const ga8 = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/fixtures/ga8_result_3aB.json"), "utf8"));
  const ga8Label = (tpl) => { const row = ga8.rows.find((r) => r.template === tpl); return row ? { rate: row.rate, label: row.stop ? "STOP" : row.warn ? (row.rate >= 0.5 ? "WARN strong" : "WARN weak") : null } : null; };
  const templates = Object.entries(KIND).map(([tpl, kind]) => {
    const base = A[`BASE_${tpl}`], cands = ARMS.filter((x) => x.template === tpl && x.base).map((x) => A[x.arm]);
    const sel = cands.length ? selectCandidate(kind, cands) : { selected: null, verdict: "NO_CANDIDATE_REGISTERED" };
    return { template: tpl, kind, ga8: ga8Label(tpl), base: { rate: base.rate, lo: base.lo, hi: base.hi, label: base.label }, reproduced: reproduced(kind, base.label),
      candidates: cands.map((c) => ({ arm: c.arm, change: c.change, rate: c.rate, lo: c.lo, hi: c.hi, label: c.label, vsBase: c.vsBase })), ...sel };
  });
  const control = A.STD, controlOk = Math.abs(control.rate - 0.5) <= 0.05;
  const er = errorRule(audit.errored.length, tasks.length);
  const outcome = audit.instrument.length || !controlOk || er === "STOP" ? "INSTRUMENT" : er === "INCONCLUSIVE" ? "INCONCLUSIVE" : "SCREENED";
  const out = { schema: "esmo.ga8-fix-screen-result.v1", registration: REG_REL, registrationHash: META.registration, fingerprint: FP, gitHead: provenance().gitHead, reportedAt: new Date().toISOString(),
    ga8Verdict: "STOP (unchanged; screening only, no template changed; a selection is a proposal that must be confirmed by G-A8 on the reserved fresh seeds after an Owner-approved versioned change)",
    statsNote: "unadjusted 95% intervals; 22 arms on one seed block", matches: tasks.length, errored: audit.errored, instrument: audit.instrument.slice(0, 20), control: { rate: control.rate, ok: controlOk }, outcome, templates, arms };
  const OUT = path.join(ROOT, "tools/fixtures/ga8_fix_screen_result_3aB.json");
  if (fs.existsSync(OUT)) { console.error("結果檔已存在：不覆寫"); process.exit(2); }
  fs.writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
  const pp = (x) => (x == null ? "—" : (x * 100).toFixed(1)), ci = (s) => (s ? `${pp(s.mean)}（${pp(s.lo)}..${pp(s.hi)}）` : "—");
  console.log(`對照 std ${pp(control.rate)}%（${controlOk ? "OK" : "超出 0.50±0.05"}）`);
  for (const t of templates) {
    console.log(`${t.template.padEnd(24)} G-A8 ${t.ga8 ? `${pp(t.ga8.rate)} ${t.ga8.label ?? ""}` : "—"}｜篩選 BASE ${pp(t.base.rate)}（${pp(t.base.lo)}..${pp(t.base.hi)}）${t.base.label ?? ""}｜${t.reproduced ? "重現" : "未重現"}｜${t.verdict}${t.selected ? ` ${t.selected}` : ""}`);
    for (const c of t.candidates) console.log(`     ${c.arm.padEnd(8)} ${pp(c.rate)}（${pp(c.lo)}..${pp(c.hi)}）${c.label ?? ""}　對 BASE ${ci(c.vsBase)}`);
  }
  console.log(`結果 ${outcome}（G-A8 維持 STOP）`);
}
