#!/usr/bin/env node
// ============================================================================
//  tools/check_c1_isolation.mjs — C1 Deterministic Math Kernel: version isolation, call-site coverage and pins for moba-sim.v25 (2026-11-23).
//
//  K1 rulesets: career.v25 / balanceTool.v25 = the v24 rulesets field for field + exactly one new layer key, mathKernel "det.v1";
//     no other ruleset has mathKernel; v25 validates; RS-1 requires mobaDetMathV25 on career.v25.
//  K2 flags: mobaDetMathV25 defaults to false; all five flags ⇒ career.v25; the four v24 flags ⇒ career.v24; only mobaDetMathV25 ⇒ career.v20.
//  K3 engine wiring: every legacy ruleset (v20–v24 tool and career paths) assembles an engine with _detMath === false and never calls
//     configureMathKernel; v25 assembles with _detMath === true and configureMathKernel as the FIRST configure call.
//  K4 static scan of src/LogicEngine.js with comments stripped: Math.sin/cos/tan/atan/atan2/asin/acos/exp/log/pow/cbrt/sinh/cosh/tanh and the ** operator
//     appear only inside the six kernel helper methods (_sin … _powInt).
//  K5 dynamic: a det match (balanceTool.v25) with the global Math functions wrapped — while ticking, LogicEngine.js makes 0 native trig calls;
//     the same match on balanceTool.v24 does make them (so the probe is live). Other modules' calls during ticks are reported.
//  K6 assembler: unknown mathKernel ⇒ math_kernel_unknown; an engine without SUPPORTS_MATH_KERNEL ⇒ refused.
//  K7 pins: full-match hashes (streamHashFnv and the C1 whole-state digest) of the registered pin matches equal tools/fixtures/c1_pins_v25.json.
//  Usage: node tools/check_c1_isolation.mjs [--record-pins]   (--record-pins rewrites the fixture: only right after an Owner-approved semantic change)
// ============================================================================
import fs from "node:fs";
const results = []; const ck = (name, ok, info = "") => { results.push({ name, ok: !!ok }); console.log(`${ok ? "✅" : "❌"} ${name}${info ? "　" + info : ""}`); };
const J = (o) => JSON.stringify(o);
const t0 = Date.now();
const ENVL = await import("./owner_preview/lib_parity_env_v24.mjs");
ENVL.applyEnv("parity");
const RS = await import("../src/platform/contracts/matchRuleset.js");
const FF = await import("../src/featureFlags.js");
const { configure, modules, buildBalanceMatchSetup, mirroredRoster } = await import("./balance/moba_items_balance_runner.mjs");
const { careerContext } = await import("./lib/careerLiveInputs.mjs");
const { c1Assemble } = await import("./c1/c1_assemble.js");
const { runDigest } = await import("./c1/c1_state_digest.js");
const { streamHashFnv } = await import("./owner_preview/preview_force_hash_v24.js");
const { assembleMatch } = await import("../src/battle/moba/matchAssembler.js");
const M = await modules(), C = await careerContext();

// ── K1 ──
{
  const ids = Object.keys(RS.MATCH_RULESETS), withMK = ids.filter((id) => "mathKernel" in RS.MATCH_RULESETS[id].layers);
  const pair = (a, b) => { const A = RS.MATCH_RULESETS[a], B = RS.MATCH_RULESETS[b];
    const extra = Object.keys(B.layers).filter((k) => !(k in A.layers)), same = Object.keys(A.layers).every((k) => A.layers[k] === B.layers[k]);
    const top = Object.keys(A).filter((k) => !["layers", "rulesetId", "simVersion", "releaseRequirements"].includes(k)).every((k) => J(A[k]) === J(B[k]));
    return { extra, same, top, mk: B.layers.mathKernel, sim: B.simVersion, id: B.rulesetId, reqExtra: B.releaseRequirements.filter((f) => !A.releaseRequirements.includes(f)) }; };
  const c = pair("career.v24", "career.v25"), t = pair("balanceTool.v24", "balanceTool.v25");
  const valid = ["career.v25", "balanceTool.v25"].map((id) => RS.validateRuleset(RS.MATCH_RULESETS[id]));
  const rs1 = RS.validateRuleset({ ...RS.MATCH_RULESETS["career.v25"], releaseRequirements: RS.MATCH_RULESETS["career.v25"].releaseRequirements.filter((f) => f !== "mobaDetMathV25") });
  ck("K1 v25＝v24 逐欄＋恰好一個新鍵 mathKernel \"det.v1\"；其他規則集都沒有 mathKernel；v25 驗證通過；career.v25 少列 mobaDetMathV25 ⇒ RS-1 拒絕",
    J(withMK) === J(["career.v25", "balanceTool.v25"]) && [c, t].every((p) => J(p.extra) === J(["mathKernel"]) && p.same && p.top && p.mk === "det.v1" && p.sim === "moba-sim.v25")
    && J(c.reqExtra) === J(["mobaDetMathV25"]) && J(t.reqExtra) === J([]) && valid.every((v) => v.ok) && !rs1.ok && rs1.errors.some((e) => /mathKernel det\.v1 requires mobaDetMathV25/.test(e)),
    J({ withMathKernel: withMK, career: c, tool: t, rs1: rs1.errors }));
}
// ── K2 ──
{
  const base = { ...FF.FEATURE_FLAGS }, four = { ...base, mobaTacticalDirectorV21: true, mobaJungleV22: true, mobaSafeRouteV23: true, mobaTacticExecV24: true };
  const r = (flags) => RS.resolveRulesetForMode({ mode: "career", flags }).rulesetId;
  const got = { off: r(base), four: r(four), five: r({ ...four, mobaDetMathV25: true }), onlyDet: r({ ...base, mobaDetMathV25: true }), challenge: RS.resolveRulesetForMode({ mode: "challenge", flags: { ...four, mobaDetMathV25: true } }).rulesetId };
  ck("K2 旗標 mobaDetMathV25 預設關；五個都開 ⇒ career.v25；只開 v24 四個 ⇒ career.v24；只開 det ⇒ career.v20；Challenge 不受影響",
    FF.FEATURE_FLAGS.mobaDetMathV25 === false && got.off === "career.v20" && got.four === "career.v24" && got.five === "career.v25" && got.onlyDet === "career.v20" && got.challenge !== "career.v25", J(got));
}
// ── K3 ──
{
  const rows = [];
  for (const id of ["balanceTool.v20", "balanceTool.v21", "balanceTool.v22", "balanceTool.v23", "balanceTool.v24", "balanceTool.v25"]) {
    const r = configure(146001, "standard", M, 1, null, null, id);
    rows.push({ id, det: r.e._detMath, configured: (r.applied?.configured ?? r.configured ?? null) });
  }
  // career path: the live assembler with production rulesets (flags decide v20/v24/v25)
  const live = [];
  for (const id of ["career.v20", "career.v24", "career.v25"]) {
    const tactic = { blue: { kind: "binding", binding: C.bindTacticPlanToCurrentVersions(C.createTacticPlan({ templateId: "v2.jungle_invasion", choices: {} }).plan) },
      red: { kind: "binding", binding: C.bindTacticPlanToCurrentVersions(C.createTacticPlan({ templateId: "classic.m7", choices: {} }).plan) } };
    const { setup } = buildBalanceMatchSetup(146001, "standard", M, 1, mirroredRoster(146001, M), tactic, id.replace("career", "balanceTool"));
    const r = c1Assemble(JSON.stringify(setup));
    live.push({ id: setup.ruleset.rulesetId, det: r.engine._detMath, first: r.applied.configured[0], calls: r.applied.configured.filter((m) => m === "configureMathKernel").length });
  }
  const legacyOk = rows.slice(0, 5).every((x) => x.det === false) && live.slice(0, 2).every((x) => x.det === false && x.calls === 0);
  const v25Ok = rows[5].det === true && live[2].det === true && live[2].first === "configureMathKernel" && live[2].calls === 1;
  ck("K3 v20～v24 組出的引擎 _detMath＝false 且從不呼叫 configureMathKernel；v25 ＝true 且它是第一個 configure", legacyOk && v25Ok, J({ tool: rows.map((x) => [x.id, x.det]), assembled: live }));
}
// ── K4 ──
{
  const src = fs.readFileSync(new URL("../src/LogicEngine.js", import.meta.url), "utf8");
  const lines = src.split("\n"), bad = [], helpers = [];
  let inBlock = false;
  lines.forEach((raw, i) => {
    let l = raw;
    if (inBlock) { const e = l.indexOf("*/"); if (e < 0) return; l = l.slice(e + 2); inBlock = false; }
    l = l.replace(/\/\*[\s\S]*?\*\//g, "");
    const b = l.indexOf("/*"); if (b >= 0) { l = l.slice(0, b); inBlock = true; }
    l = l.replace(/(^|[^:"'`\\])\/\/.*$/, "$1");
    const hit = /Math\.(sin|cos|tan|atan|atan2|asin|acos|exp|expm1|log|log1p|log2|log10|pow|cbrt|sinh|cosh|tanh)\s*\(/.test(l) || /[\w)\]]\s*\*\*\s*[\w(]/.test(l);
    if (!hit) return;
    if (/^\s*_(sin|cos|atan2|acos|asin|powInt)\(/.test(l)) helpers.push(i + 1); else bad.push(`${i + 1}: ${raw.trim().slice(0, 100)}`);
  });
  ck("K4 LogicEngine.js（剝掉註解）：超越函數與 ** 只出現在 6 個核心入口（_sin…_powInt）", bad.length === 0 && helpers.length === 6, J({ helperLines: helpers, outside: bad }));
}
// ── K5 ──
{
  const FNS = ["sin", "cos", "tan", "atan", "atan2", "asin", "acos", "exp", "expm1", "log", "log1p", "log2", "log10", "pow", "cbrt", "sinh", "cosh", "tanh"];
  const ORIG = Object.fromEntries(FNS.map((f) => [f, Math[f]]));
  const probe = (rulesetId) => {
    const e = configure(151001, "standard", M, 1, null, null, rulesetId).e;
    const bySite = {}; let ticking = true;
    for (const f of FNS) { const o = ORIG[f]; Math[f] = function (...a) { if (ticking) { const fr = new Error().stack.split("\n").slice(2).find((s) => /[\\/]src[\\/]/.test(s)) ?? "?"; const k = f + " @ " + fr.replace(/^.*[\\/](src[\\/][^:)]*).*$/, "$1").replace(/\\/g, "/"); bySite[k] = (bySite[k] ?? 0) + 1; } return o.apply(Math, a); }; }
    try { for (let i = 0; i < 1200 && !e.over; i++) e.tick(0.5); } finally { for (const f of FNS) Math[f] = ORIG[f]; ticking = false; }
    return bySite;
  };
  const det = probe("balanceTool.v25"), nat = probe("balanceTool.v24");
  const detEngine = Object.entries(det).filter(([k]) => k.endsWith("src/LogicEngine.js")), natEngine = Object.entries(nat).filter(([k]) => k.endsWith("src/LogicEngine.js"));
  ck("K5 det 對局（600 秒）中 LogicEngine.js 呼叫原生超越函數 0 次；同一場 v24 有呼叫（探針有效）；其他模組只報",
    detEngine.length === 0 && natEngine.reduce((s, [, n]) => s + n, 0) > 0, J({ det, nativeEngineCalls: Object.fromEntries(natEngine) }));
}
// ── K6 ──
{
  const tactic = null;
  const { setup } = buildBalanceMatchSetup(146001, "standard", M, 1, mirroredRoster(146001, M), tactic, "balanceTool.v25");
  const bad = JSON.parse(JSON.stringify(setup)); bad.ruleset.layers.mathKernel = "det.v9";
  let r1; try { r1 = c1Assemble(JSON.stringify(bad)); } catch (e) { r1 = { thrown: String(e.message) }; }
  const { buildMatchAssemblerDepsFrom } = await import("../src/battle/moba/matchAssemblerDepsCore.js");
  const { LogicEngine } = await import("../src/LogicEngine.js");
  class OldEngine extends LogicEngine {} Object.defineProperty(OldEngine, "SUPPORTS_MATH_KERNEL", { value: false });
  const { heroById } = await import("../src/data/heroDatabase.js");
  const r2 = assembleMatch(JSON.parse(JSON.stringify(setup)), buildMatchAssemblerDepsFrom({ LogicEngine: OldEngine, heroLookup: heroById, heroAdapters: {}, engineAdapters: {} }));
  ck("K6 組裝器：未知 mathKernel ⇒ math_kernel_unknown；引擎沒宣告 SUPPORTS_MATH_KERNEL ⇒ 拒絕",
    /math_kernel_unknown/.test(r1.thrown ?? "") && r2.ok === false && r2.errors.some((e) => /SUPPORTS_MATH_KERNEL/.test(e.field)), J({ unknown: r1.thrown, oldEngine: r2.errors?.map((e) => e.field) }));
}
// ── K7 ──
{
  const FIX = new URL("./fixtures/c1_pins_v25.json", import.meta.url);
  const PINS = [{ seed: 151001, blue: "v2.jungle_invasion", red: "classic.m7" }, { seed: 151002, blue: "classic.m3", red: "v2.hard_engage_stack" },
    { seed: 142227, blue: "v2.jungle_invasion", red: "v2.jungle_invasion" }, { seed: 146065, blue: "v2.jungle_invasion", red: "classic.m7" }];
  const now = PINS.map((p) => {
    const tactic = { blue: { kind: "binding", binding: C.bindTacticPlanToCurrentVersions(C.createTacticPlan({ templateId: p.blue, choices: {} }).plan) },
      red: { kind: "binding", binding: C.bindTacticPlanToCurrentVersions(C.createTacticPlan({ templateId: p.red, choices: {} }).plan) } };
    const s = JSON.stringify(buildBalanceMatchSetup(p.seed, "standard", M, 1, mirroredRoster(p.seed, M), tactic, "balanceTool.v25").setup);
    const h = streamHashFnv(c1Assemble(s).engine, 3000), d = runDigest(c1Assemble(s).engine, 3000);
    return { ...p, rulesetId: "balanceTool.v25", toolEnv: "parity", ticks: h.ticks, winner: h.winner, endT: h.endT, streamHash: h.hash, c1Final: d.final };
  });
  if (process.argv.includes("--record-pins")) { fs.writeFileSync(FIX, JSON.stringify({ schema: "C1Pins.v1", recordedAt: new Date().toISOString(), note: "moba-sim.v25 balanceTool.v25 (mathKernel det.v1), Career-Parity", pins: now }, null, 1)); console.log("recorded pins"); }
  const want = fs.existsSync(FIX) ? JSON.parse(fs.readFileSync(FIX, "utf8")).pins : null;
  const diff = want ? now.filter((x, i) => J(x) !== J(want[i])) : now;
  ck("K7 v25 固定釘點（4 場整場雜湊＋C1 整場狀態雜湊）＝tools/fixtures/c1_pins_v25.json", want && want.length === now.length && diff.length === 0, J({ diff }));
}
const pass = results.filter((r) => r.ok).length;
console.log(`\ncheck_c1_isolation：${pass}/${results.length} ${pass === results.length ? "PASS" : "FAIL"}（${Math.round((Date.now() - t0) / 1000)} 秒）`);
process.exit(pass === results.length ? 0 : 1);
