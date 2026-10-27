#!/usr/bin/env node
// ============================================================================
//  tools/measure_ga8_v20ctl_3aB.mjs — Phase 3a-B P2-4b：G-A8 的 v20 對照診斷（登記 tools/fixtures/ga8_v20_control_registration_3aB.json）
//
//  node tools/measure_ga8_v20ctl_3aB.mjs --comparability --v21dir=<G-A8 資料夾> [--skip-golden]   C1–C3、C5（C3 會跑 check_match_setup_3a，數分鐘）
//  node tools/measure_ga8_v20ctl_3aB.mjs --run --dir=<repo 外新資料夾> [--workers=3]                 可續跑
//  node tools/measure_ga8_v20ctl_3aB.mjs --report --dir=<同一個> --v21dir=<G-A8 資料夾>               寫 tools/fixtures/ga8_v20_control_result_3aB.json
//  node tools/measure_ga8_v20ctl_3aB.mjs --selftest
//
//  ⚠ 診斷不是放行證據：不改 G-A8 的判定、門檻或資料；PRE_EXISTING 不等於 PASS（Owner 2026-10-27）。
//  v21 臂唯讀沿用 G-A8 的資料（meta 必須是同一份登記與指紋，每筆重查 G-A8 的儀器規則）；只新跑 v20 臂。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runStudy, readKey, provenance, sha16, auditStudy, errorRule, ROOT } from "./lib/studyRunner.mjs";

const SELF = fileURLToPath(import.meta.url);
const args = process.argv.slice(2);
const flag = (k) => args.includes(`--${k}`);
const val = (k, d = null) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const REG_REL = "tools/fixtures/ga8_v20_control_registration_3aB.json";
const REG_TEXT = fs.readFileSync(path.join(ROOT, REG_REL), "utf8"), REG = JSON.parse(REG_TEXT);
const GA8_REG_TEXT = fs.readFileSync(path.join(ROOT, "tools/fixtures/ga8_registration_3aB.json"), "utf8");
const imp = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);
const RULESET = "balanceTool.v20";
/** v20 臂的儀器檢查（C4）。 */
const recCheck = (r) => (r.director === "static" && r.laneFrame === "legacyMirror" && r.ruleset === RULESET && r.layers?.heroSkills && !r.layers?.battleTalents ? [] : ["instrument mismatch"]);
/** v21 臂＝G-A8 的儀器規則（逐字同 measure_ga8_3aB.mjs）。 */
const recCheckV21 = (r) => (r.director === "core.v1" && r.laneFrame === "teamRelative" && r.ruleset === "balanceTool.v21" && r.layers?.heroSkills && !r.layers?.battleTalents ? [] : ["instrument mismatch"]);

if (flag("v20ctl-worker")) {
  process.env.ESMO_BALANCE_SKILLS = "on";
  delete process.env.ESMO_BALANCE_TALENTS;
  delete process.env.ESMO_BALANCE_LANEFRAME;
  const { modules, configure } = await imp("tools/balance/moba_items_balance_runner.mjs");
  const { tacticInputOf } = await imp("tools/lib/tacticTruthSim.mjs");
  const { objectiveLayoutForSeed } = await imp("src/platform/contracts/objectiveLayout.js");
  const M = await modules();
  process.on("message", async (t) => {
    try {
      //  與 G-A8 worker 相同的輸入與步進，只換規則集。
      const plan = tacticInputOf({ templateId: t.template, choices: {} }), std = tacticInputOf({ templateId: "std", choices: {} });
      const blueIsTemplate = t.seed % 2 === 1;
      const { e } = configure(t.seed, "standard", M, 1, null, { blue: blueIsTemplate ? plan : std, red: blueIsTemplate ? std : plan }, RULESET);
      for (let i = 1; i * 0.5 <= 3600 && !e.over; i++) e.tick(0.5);
      const side = blueIsTemplate ? "blue" : "red";
      const win = e.over && (e.winner === "blue" || e.winner === "red") ? (e.winner === side ? 1 : 0) : 0.5;
      process.send({ type: "done", id: t.id, rec: { seed: t.seed, template: t.template, side, layout: objectiveLayoutForSeed(t.seed), ruleset: RULESET,
        layers: { heroSkills: !!M.skills, heroPassives: !!M.passives, heroPowerCurve: !!M.curves, battleTalents: !!M.talents }, director: e.director?.mode ?? null, laneFrame: e.director?.laneFrame ?? null, win, duration: e.t } });
    } catch (e) { process.send({ type: "error", id: t.id, error: String(e?.stack ?? e) }); }
  });
  process.send({ type: "ready" });
  await new Promise(() => {});
}

const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
/** 平均與 95% CI（常態近似）；樣本是 0／0.5／1 的勝場或配對差。 */
export function ci95(xs) {
  const n = xs.length, m = mean(xs);
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, n - 1)), se = sd / Math.sqrt(Math.max(1, n));
  return { n, mean: m, lo: m - 1.96 * se, hi: m + 1.96 * se };
}
/** 配對差的不一致數與雙尾精確符號檢定（平手剔除；審查 #4：多數配對預期恰為 0，常態 CI 的有效樣本是不一致對數）。 */
export function signTest(ds) {
  const np = ds.filter((d) => d > 0).length, nm = ds.filter((d) => d < 0).length, n = np + nm;
  if (!n) return { nPlus: 0, nMinus: 0, p: 1 };
  const lf = (k) => { let s = 0; for (let i = 2; i <= k; i++) s += Math.log(i); return s; };
  const pk = (k) => Math.exp(lf(n) - lf(k) - lf(n - k) - n * Math.LN2);
  let tail = 0;
  for (let k = 0; k <= Math.min(np, nm); k++) tail += pk(k);
  return { nPlus: np, nMinus: nm, p: Math.min(1, 2 * tail) };
}
/** G-A8 的旗標（門檻逐字沿用，不得改）：stop／strong（>=0.57）／weak（<=0.43）。 */
export function flagsOf(wins) {
  const v = ci95(wins);
  return { rate: v.mean, lo: v.lo, hi: v.hi, stop: v.mean >= 0.6 && v.lo > 0.55, strong: v.mean >= 0.57, weak: v.mean <= 0.43 };
}
/** 事前登記的分類。flag ∈ stop｜strong｜weak（v21 觸發的那一個）；dir＝讓旗標變強的 D 方向（stop／strong：+1，weak：−1）。 */
export function classify(flag, v20Flags, D) {
  const dir = flag === "weak" ? -1 : 1;
  const v20Has = !!v20Flags[flag];
  const excl = D.lo > 0 || D.hi < 0;
  const towardFlag = excl && Math.sign(D.mean) === dir;
  if (v20Has && !excl) return "PRE_EXISTING";
  if (v20Has && towardFlag) return "PRE_EXISTING_AMPLIFIED";
  if (v20Has && excl) return "PRE_EXISTING_REDUCED";
  if (!v20Has && towardFlag) return "V21_INTRODUCED";
  return "UNRESOLVED";
}

if (flag("selftest")) {
  let pass = 0, fail = 0;
  const ck = (l, ok) => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}`); };
  const ws = (n, p) => Array.from({ length: n }, (_, i) => ((i * 37) % 100 < p * 100 ? 1 : 0));
  ck("S1 旗標門檻＝G-A8：0.65 stop；0.58 strong 不 stop；0.42 weak", flagsOf(ws(400, 0.65)).stop && flagsOf(ws(400, 0.58)).strong && !flagsOf(ws(400, 0.58)).stop && flagsOf(ws(400, 0.42)).weak);
  const D0 = { mean: 0.01, lo: -0.03, hi: 0.05 }, Dp = { mean: 0.08, lo: 0.04, hi: 0.12 }, Dn = { mean: -0.08, lo: -0.12, hi: -0.04 };
  ck("S2 分類：v20 有 STOP＋D 含 0 ⇒ PRE_EXISTING；D>0 ⇒ AMPLIFIED；D<0 ⇒ REDUCED", classify("stop", { stop: true }, D0) === "PRE_EXISTING" && classify("stop", { stop: true }, Dp) === "PRE_EXISTING_AMPLIFIED" && classify("stop", { stop: true }, Dn) === "PRE_EXISTING_REDUCED");
  ck("S3 分類：v20 沒有＋D>0 ⇒ V21_INTRODUCED；D 含 0 ⇒ UNRESOLVED；weak 方向相反", classify("stop", { stop: false }, Dp) === "V21_INTRODUCED" && classify("stop", { stop: false }, D0) === "UNRESOLVED" && classify("weak", { weak: false }, Dn) === "V21_INTRODUCED" && classify("weak", { weak: false }, Dp) === "UNRESOLVED");
  const st = signTest([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0]), st0 = signTest([0, 0, 1, -1]);
  ck("S5 符號檢定：10 正 0 負 ⇒ p＝2／1024；1 正 1 負 ⇒ p＝1；平手剔除", st.nPlus === 10 && st.nMinus === 0 && Math.abs(st.p - 2 / 1024) < 1e-12 && st0.p === 1 && st0.nPlus === 1);
  ck("S4 登記：seeds 25001–25400 與 G-A8 相同", REG.seeds.range === "25001-25400" && JSON.parse(GA8_REG_TEXT).seeds.range === REG.seeds.range);
  console.log(`\nselftest：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
  process.exit(fail ? 1 : 0);
}

const { TACTIC_TEMPLATE_LIST } = await imp("src/platform/tactics/tacticTemplates.js");
const TEMPLATES = TACTIC_TEMPLATE_LIST.map((t) => t.templateId);
const [S0, S1] = REG.seeds.range.split("-").map(Number);
const SEEDS = Array.from({ length: S1 - S0 + 1 }, (_, i) => S0 + i);
const tasks = TEMPLATES.flatMap((tpl) => SEEDS.map((seed) => ({ id: `${tpl}#${seed}`, key: tpl, seed, template: tpl })));
const SV = await imp("src/platform/contracts/simulationVersion.js");
const FP = SV.SIMULATION_SEMANTICS_FINGERPRINTS[SV.MOBA_SIMULATION_VERSION];
const META = { study: REG.studyId, registration: sha16(REG_TEXT), fingerprint: FP };
const GA8_META = { study: "ga8-dominant-plan-3aB", registration: sha16(GA8_REG_TEXT), fingerprint: FP };
const V21DIR = val("v21dir");

function checkV21Arm() {
  if (!V21DIR) return "需要 --v21dir";
  const m = JSON.parse(fs.readFileSync(path.join(V21DIR, "meta.json"), "utf8"));
  if (JSON.stringify(m.meta) !== JSON.stringify(GA8_META)) return `v21 資料夾的 meta 不是 G-A8（${JSON.stringify(m.meta)}）`;
  const a = auditStudy(V21DIR, tasks, recCheckV21);
  if (a.halt) return `v21 HALT ${a.halt}`;
  if (a.missing) return `v21 缺 ${a.missing} 場`;
  if (a.instrument.length) return `v21 儀器不符 ${a.instrument.length}`;
  if (a.errored.length) return `v21 有 ${a.errored.length} 場錯誤`;
  //  這裡重算的 v21 旗標必須＝已 commit 的 G-A8 結果（審查 #7）：診斷不得和正式判定漂移。
  const committed = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/fixtures/ga8_result_3aB.json"), "utf8"));
  const drift = [];
  for (const row of committed.rows) {
    const d = readKey(V21DIR, row.template), f = flagsOf(SEEDS.map((s) => d.get(`${row.template}#${s}`)?.win));
    if (f.stop !== row.stop || (f.strong || f.weak) !== row.warn || Math.abs(f.rate - row.rate) > 1e-12) drift.push(row.template);
  }
  if (committed.rows.length !== TEMPLATES.length || drift.length) return `v21 旗標與 ga8_result_3aB.json 不同：${drift.join("、") || "列數"}`;
  return null;
}

if (flag("comparability")) {
  let pass = 0, fail = 0;
  const ck = (l, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}${ok || !d ? "" : `　${d}`}`); };
  process.env.ESMO_BALANCE_SKILLS = "on";
  delete process.env.ESMO_BALANCE_TALENTS;
  delete process.env.ESMO_BALANCE_LANEFRAME;
  const { modules, buildBalanceMatchSetup, mirroredRoster } = await imp("tools/balance/moba_items_balance_runner.mjs");
  const { tacticInputOf } = await imp("tools/lib/tacticTruthSim.mjs");
  const { stableStringify } = await imp("src/platform/contracts/squadSnapshot.js");
  const { mobaTacticById, STANDARD_OPP_TACTIC } = await imp("src/platform/contracts/MobaTacticConfig.js");
  const M = await modules();
  //  C1：同一 (template, seed) 的 v20／v21 setup 只差規則集身分、Director、laneFrame（戰術輸入物件逐字相同）。
  const ALLOWED = new Set(["rulesetId", "simVersion", "layers.tacticalDirector", "layers.laneFrame"]);
  const diffs = new Set();
  const walk = (a, b, p) => {
    if (a && b && typeof a === "object" && typeof b === "object") { for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[k], b[k], p ? `${p}.${k}` : k); return; }
    if (stableStringify(a) !== stableStringify(b)) diffs.add(p);
  };
  for (const tpl of TEMPLATES) for (const seed of [S0, S0 + 1]) {
    const plan = tacticInputOf({ templateId: tpl, choices: {} }), std = tacticInputOf({ templateId: "std", choices: {} });
    const tac = seed % 2 === 1 ? { blue: plan, red: std } : { blue: std, red: plan };
    const roster = mirroredRoster(seed, M);
    const s20 = buildBalanceMatchSetup(seed, "standard", M, 1, roster, tac, RULESET).setup;
    const s21 = buildBalanceMatchSetup(seed, "standard", M, 1, roster, tac, "balanceTool.v21").setup;
    for (const k of Object.keys({ ...s20, ...s21 })) {
      if (k === "ruleset" || k === "effectiveLayers") walk(s20[k], s21[k], "");
      else if (/hash/i.test(k)) continue;
      else walk(s20[k], s21[k], k);
    }
  }
  const bad = [...diffs].filter((d) => !ALLOWED.has(d));
  ck(`C1 v20／v21 setup 只差 ${[...ALLOWED].join("／")}（21 模板 × 2 seeds）`, bad.length === 0, `其他差異：${bad.join("、")}；全部：${[...diffs].join("、")}`);
  ck("C1 比對不是空的：四個允許的差異都實際出現", [...ALLOWED].every((d) => diffs.has(d)), `實際：${[...diffs].join("、")}`);
  //  C2：經典模板 config ≡ v20 的戰術；std ≡ STANDARD_OPP_TACTIC。
  const cls = TACTIC_TEMPLATE_LIST.filter((t) => t.kind === "classic");
  const clsBad = cls.filter((t) => stableStringify(t.config) !== stableStringify(mobaTacticById(t.templateId.replace("classic.", "")))).map((t) => t.templateId);
  const stdT = TACTIC_TEMPLATE_LIST.find((t) => t.templateId === "std");
  ck(`C2 ${cls.length} 個經典模板的 config 逐欄＝mobaTacticById（v20 戰術）`, cls.length === 8 && clsBad.length === 0, clsBad.join("、"));
  ck("C2 std 模板 config＝STANDARD_OPP_TACTIC", stdT && stableStringify(stdT.config) === stableStringify(STANDARD_OPP_TACTIC));
  //  C5：v21 臂（G-A8 資料）完整、儀器規則重查通過。
  const v21err = checkV21Arm();
  ck("C5 v21 臂＝G-A8 資料：同一份登記與指紋、8,400 場完整、儀器重查通過、0 錯誤", !v21err, v21err ?? "");
  //  C6（跑前）：沒有選擇的模板在 v21 三個時期的藍方旋鈕相同，且＝v20 static 的旋鈕（審查 #2）。
  const { configure } = await imp("tools/balance/moba_items_balance_runner.mjs");
  const knobsAt = (d, t) => { const x = d.directive("blue", t); return stableStringify(x?.knobs ?? x); };
  const c6bad = [], k0 = new Map();
  for (const tpl of TEMPLATES) {
    const tac = { blue: tacticInputOf({ templateId: tpl, choices: {} }), red: tacticInputOf({ templateId: "std", choices: {} }) };
    const d21 = configure(S0, "standard", M, 1, null, tac, "balanceTool.v21").e.director, d20 = configure(S0, "standard", M, 1, null, tac, RULESET).e.director;
    const k = [0, 600, 1200].map((t) => knobsAt(d21, t));
    k0.set(tpl, k[0]);
    if (!(k[0] === k[1] && k[1] === k[2] && k[0] === knobsAt(d20, 0))) c6bad.push(tpl);
  }
  ck(`C6 ${TEMPLATES.length} 個模板（無選擇）：v21 三時期藍方旋鈕相同且＝v20 static`, c6bad.length === 0, c6bad.join("、"));
  ck("C6 比對不是空的：21 個模板的旋鈕兩兩不同（含 std）", new Set(k0.values()).size === TEMPLATES.length && [...k0.values()].every((s) => s && s.length > 20), `不同 ${new Set(k0.values()).size}`);
  //  C3：同一個 commit 上，v20 路徑仍是 v20 行為（check_match_setup_3a 的 39 案 v20 golden）。
  //  那支拒絕任何 ESMO_BALANCE_*（自己設 skills／talents on）⇒ 子行程環境要剝掉（審查 #1）。
  if (flag("skip-golden")) console.log("⏭ C3 略過（--skip-golden；正式判定前必須跑）");
  else {
    let out = "";
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("ESMO_BALANCE_")));
    try { out = execFileSync(process.execPath, [path.join(ROOT, "tools/check_match_setup_3a.mjs")], { cwd: ROOT, env, encoding: "utf8", maxBuffer: 64 << 20 }); } catch (e) { out = `${e.stdout ?? ""}${e.stderr ?? ""}`; }
    const ok = /^✅ G-A2 39\/39 /m.test(out);
    ck("C3 check_match_setup_3a：G-A2 39/39 v20 golden 逐位元相同", ok, out.split("\n").find((l) => l.includes("G-A2 39/39")) || out.split("\n").slice(-5).join(" | "));
  }
  console.log(`\ncomparability：${pass}/${pass + fail} ${fail ? "FAIL ⇒ 不跑、交 Owner" : "PASS"}`);
  process.exit(fail ? 1 : 0);
}

if (flag("plan")) { console.log(`v20 臂：${TEMPLATES.length} 模板 × ${SEEDS.length} seeds ＝ ${tasks.length} 場（v21 臂沿用 G-A8 資料）`); process.exit(0); }
const DIR = val("dir");
if (!DIR) { console.error("需要 --dir"); process.exit(2); }

if (flag("run")) {
  if (!/^registered/.test(REG.status) || !REG.review?.reviewedAt) { console.error("登記檔未經審查核准（status 不是 registered 或 review.reviewedAt 空）"); process.exit(2); }
  if (provenance().dirtyFilesUnderSrcTools) { console.error("src／tools 有未提交變更"); process.exit(2); }
  const envBad = Object.keys(process.env).filter((k) => k.startsWith("ESMO_BALANCE_") && k !== "ESMO_BALANCE_SKILLS");
  if (envBad.length) { console.error(`環境有會改變量測的覆寫：${envBad.join(", ")}（審查 #6）`); process.exit(2); }
  const res = await runStudy({ dir: DIR, tasks, workerFile: SELF, workerArgs: ["--v20ctl-worker"], meta: META, workers: Number(val("workers", 3)), label: "G-A8 v20 對照", check: recCheck });
  process.exit(res.halted ? 5 : res.stopped ? 3 : res.failed || res.lost ? 6 : 0);
}

if (flag("report")) {
  const m = JSON.parse(fs.readFileSync(path.join(DIR, "meta.json"), "utf8"));
  if (JSON.stringify(m.meta) !== JSON.stringify(META)) { console.error("資料夾的登記／指紋與目前不同：不判定"); process.exit(2); }
  const v21err = checkV21Arm();
  if (v21err) { console.error(`v21 臂不可用：${v21err}（不判定，交 Owner）`); process.exit(2); }
  const audit = auditStudy(DIR, tasks, recCheck);
  if (audit.halt) { console.error(`⛔ HALT：${audit.halt}（不判定，交 Owner）`); process.exit(5); }
  if (audit.missing) { console.log(`資料未完整：還有 ${audit.missing} 場（不判定）`); process.exit(6); }
  const er = errorRule(audit.errored.length, tasks.length);
  const erroredSet = new Set(audit.errored.map((x) => x.id ?? x));
  const rows = [];
  for (const tpl of TEMPLATES) {
    const d20 = readKey(DIR, tpl), d21 = readKey(V21DIR, tpl);
    const pairs = SEEDS.map((s) => ({ s, a: d21.get(`${tpl}#${s}`), b: d20.get(`${tpl}#${s}`) })).filter((p) => p.a && p.b);
    const w20 = pairs.map((p) => p.b.win), w21 = pairs.map((p) => p.a.win);
    const f20 = flagsOf(w20), f21 = flagsOf(w21);
    const dAll = pairs.map((p) => p.a.win - p.b.win), dBlue = pairs.filter((p) => p.b.side === "blue").map((p) => p.a.win - p.b.win), dRed = pairs.filter((p) => p.b.side === "red").map((p) => p.a.win - p.b.win);
    const D = { ...ci95(dAll), ...signTest(dAll) }, Db = { ...ci95(dBlue), ...signTest(dBlue) }, Dr = { ...ci95(dRed), ...signTest(dRed) };
    //  C6（跑後）：藍方半與 std 的每一對必須恰為 0（core.v1 同時期 ≡ static；std 沒有路線不對稱）。
    const c6 = dBlue.some((d) => d !== 0) || (tpl === "std" && dAll.some((d) => d !== 0));
    const sub = (ws, f) => mean(pairs.filter((p) => f(p.b)).map((p) => (ws === 20 ? p.b.win : p.a.win)));
    const durs = pairs.map((p) => p.b.duration).sort((a, b) => a - b);
    const v21Flag = f21.stop ? "stop" : f21.strong ? "strong" : f21.weak ? "weak" : null;
    const v20OnlyFlag = !v21Flag ? (f20.stop ? "stop" : f20.strong ? "strong" : f20.weak ? "weak" : null) : null;
    const tplErr = [...erroredSet].some((id) => String(id).startsWith(`${tpl}#`));
    const cls = tpl === "std" ? "CONTROL" : !v21Flag ? null : tplErr ? "UNRESOLVED" : classify(v21Flag, f20, D);
    const kind = TACTIC_TEMPLATE_LIST.find((t) => t.templateId === tpl)?.kind;
    rows.push({ template: tpl, kind, v20Content: kind !== "v2", n: pairs.length, v20: f20, v21: f21, v21Flag, v20OnlyFlag, c6Violation: c6, pairedD: D, pairedDBlue: Db, pairedDRed: Dr,
      v20AsBlue: sub(20, (r) => r.side === "blue"), v20AsRed: sub(20, (r) => r.side === "red"), v20Standard: sub(20, (r) => r.layout === "STANDARD"), v20Swapped: sub(20, (r) => r.layout === "SWAPPED"),
      v20MedianDurationMin: durs[Math.floor(durs.length / 2)] / 60, classification: cls });
  }
  const ctl = rows.find((r) => r.template === "std");
  const c6Bad = rows.filter((r) => r.c6Violation).map((r) => r.template);
  const instrument = Math.abs(ctl.v20.rate - 0.5) > 0.05 || audit.instrument.length > 0 || er === "STOP" || c6Bad.length > 0;
  if (instrument) for (const r of rows) if (r.classification && r.classification !== "CONTROL") r.classification = "INSTRUMENT";
  const out = { schema: "esmo.ga8-v20-control-result.v1", registration: REG_REL, registrationHash: META.registration, fingerprint: FP, gitHead: provenance().gitHead, reportedAt: new Date().toISOString(),
    ga8Verdict: "STOP (unchanged; this diagnostic never changes it)", matches: tasks.length, errored: audit.errored, instrument, c6Violations: c6Bad, control: ctl, rows,
    notes: ["v2.* templates never shipped under v20: their v20 numbers are counterfactual", "PRE_EXISTING is not PASS; the five G-A8 STOP templates keep blocking the v21 release"] };
  const OUT = path.join(ROOT, "tools/fixtures/ga8_v20_control_result_3aB.json");
  if (fs.existsSync(OUT)) { console.error("結果檔已存在：不覆寫"); process.exit(2); }
  fs.writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
  const pc = (x) => (x * 100).toFixed(1);
  for (const r of rows) console.log(`${r.template.padEnd(24)} v20 ${pc(r.v20.rate)}%（${pc(r.v20.lo)}–${pc(r.v20.hi)}）v21 ${pc(r.v21.rate)}%　D ${pc(r.pairedD.mean)}（${pc(r.pairedD.lo)}..${pc(r.pairedD.hi)}）藍 ${pc(r.pairedDBlue.mean)} 紅 ${pc(r.pairedDRed.mean)}（紅半 +${r.pairedDRed.nPlus}/−${r.pairedDRed.nMinus} p=${r.pairedDRed.p.toPrecision(2)}）${r.v20Content ? "" : "　[反事實]"}${r.classification ? `　${r.classification}` : ""}${r.v20OnlyFlag ? `　v20 才有：${r.v20OnlyFlag}` : ""}`);
  console.log(`v20 對照 std ${pc(ctl.v20.rate)}%（std 配對 D ${pc(ctl.pairedD.mean)}）${c6Bad.length ? `；C6 違反：${c6Bad.join("、")}` : ""}${instrument ? " ⇒ INSTRUMENT（不分類）" : ""}；G-A8 判定維持 STOP`);
  process.exit(instrument ? 5 : 0);
}
console.error("用法見檔頭"); process.exit(2);
