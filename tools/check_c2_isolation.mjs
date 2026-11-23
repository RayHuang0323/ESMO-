#!/usr/bin/env node
// ============================================================================
//  tools/check_c2_isolation.mjs — C2 Cross-Engine Determinism: version isolation, kernel scoping, call-site coverage and pins for moba-sim.v26
//  (C2_事前登記.md §6, 2026-11-23).
//
//  I1 rulesets: career.v26 / balanceTool.v26 = the v24 rulesets field for field + exactly one new layer key, mathKernel "det.v2"; v26 validates;
//     RS-1 requires mobaDetMathV26 on career.v26; v20–v25 ruleset objects unchanged (v25 still mathKernel "det.v1").
//  I2 flags: mobaDetMathV26 defaults to false; four v24 flags + V26 ⇒ career.v26 (also with V25 on); four + V25 ⇒ career.v25; only V26 ⇒ career.v20;
//     Challenge unaffected.
//  I3 engine wiring: v20–v25 engines are constructed on the native simulation-math context (engine._simKernel.id "native", not enumerable ⇒ not in
//     any state digest); v26 engines on "det.v2", _detMath true, configureMathKernel first; the kernel/constructor mismatch throws both ways.
//  I4 kernel scoping: after assembling and ticking v26 engines the global context is native again; a v25 and a v26 engine ticked INTERLEAVED in one
//     process give exactly the per-tick digests each gives alone.
//  I5 caches: the native tower placement / navigation / lane-arc results are bit-identical before and after det.v2 engines ran, and det.v2 has its
//     own cache entries.
//  I6 static scan (comments stripped): Math.hypot appears only in simMathContext.js (the native branch) and gameData.js (the import-time native
//     LANE_ARC); none in LogicEngine, navigation, tower placement, tactic execution or items. DIR16 det copy uses DetMath.v1.
//  I7 dynamic: a v26 match (600 s) makes 0 native Math.hypot / sin / cos / atan2 / acos / asin / pow / exp / log calls from src while ticking; the
//     same match on v24 does make hypot calls (probe live).
//  I8 pins: full-match hashes of the registered v26 pin matches equal tools/fixtures/c2_pins_v26.json (recorded at the candidate freeze).
//  Usage: node tools/check_c2_isolation.mjs [--record-pins]   (--record-pins only at the registered freeze or after an Owner-approved change)
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
const { runDigest, stateDigest } = await import("./c1/c1_state_digest.js");
const { streamHashFnv } = await import("./owner_preview/preview_force_hash_v24.js");
const CTX = await import("../src/battle/moba/sim/simMathContext.js");
const { LogicEngine } = await import("../src/LogicEngine.js");
const TP = await import("../src/battle/moba/map/mobaTowerPlacement.js");
const NAV = await import("../src/battle/moba/nav/mobaNavigation.js");
const GD = await import("../src/gameData.js");
const M = await modules(), C = await careerContext();
const binding = (t) => C.bindTacticPlanToCurrentVersions(C.createTacticPlan({ templateId: t, choices: {} }).plan);
const tacticOf = (b, r) => ({ blue: { kind: "binding", binding: binding(b) }, red: { kind: "binding", binding: binding(r) } });
const setupJson = (seed, b, r, rs) => JSON.stringify(buildBalanceMatchSetup(seed, "standard", M, 1, mirroredRoster(seed, M), tacticOf(b, r), rs).setup);

//  Native geometry snapshot BEFORE any det.v2 engine exists (I5).
const nativeGeo = () => J({ tp: TP.buildTowerPlacement(), nav: NAV.structureList ? NAV.structureList() : null, arc: ["top", "mid", "bot"].map((l) => [GD.laneLength(l), GD.posOnLane(l, 0.37)]) });
const geoBefore = nativeGeo();

// ── I1 ──
{
  const ids = Object.keys(RS.MATCH_RULESETS), withMK = ids.filter((id) => "mathKernel" in RS.MATCH_RULESETS[id].layers);
  const pair = (a, b) => { const A = RS.MATCH_RULESETS[a], B = RS.MATCH_RULESETS[b];
    const extra = Object.keys(B.layers).filter((k) => !(k in A.layers)), same = Object.keys(A.layers).every((k) => A.layers[k] === B.layers[k]);
    const top = Object.keys(A).filter((k) => !["layers", "rulesetId", "simVersion", "releaseRequirements"].includes(k)).every((k) => J(A[k]) === J(B[k]));
    return { extra, same, top, mk: B.layers.mathKernel, sim: B.simVersion, id: B.rulesetId, reqExtra: B.releaseRequirements.filter((f) => !A.releaseRequirements.includes(f)) }; };
  const c = pair("career.v24", "career.v26"), t = pair("balanceTool.v24", "balanceTool.v26");
  const valid = ["career.v26", "balanceTool.v26"].map((id) => RS.validateRuleset(RS.MATCH_RULESETS[id]));
  const rs1 = RS.validateRuleset({ ...RS.MATCH_RULESETS["career.v26"], releaseRequirements: RS.MATCH_RULESETS["career.v26"].releaseRequirements.filter((f) => f !== "mobaDetMathV26") });
  const v25 = ["career.v25", "balanceTool.v25"].map((id) => [RS.MATCH_RULESETS[id].layers.mathKernel, RS.MATCH_RULESETS[id].simVersion]);
  ck("I1 v26＝v24 逐欄＋恰好一個新鍵 mathKernel \"det.v2\"；v26 驗證通過；career.v26 少列 mobaDetMathV26 ⇒ RS-1 拒絕；v25 仍是 det.v1",
    J(withMK) === J(["career.v25", "balanceTool.v25", "career.v26", "balanceTool.v26"]) && [c, t].every((p) => J(p.extra) === J(["mathKernel"]) && p.same && p.top && p.mk === "det.v2" && p.sim === "moba-sim.v26")
    && J(c.reqExtra) === J(["mobaDetMathV26"]) && J(t.reqExtra) === J([]) && valid.every((v) => v.ok) && !rs1.ok && rs1.errors.some((e) => /mathKernel det\.v2 requires mobaDetMathV26/.test(e))
    && J(v25) === J([["det.v1", "moba-sim.v25"], ["det.v1", "moba-sim.v25"]]),
    J({ withMathKernel: withMK, career: c, tool: t, rs1: rs1.errors, v25 }));
}
// ── I2 ──
{
  const base = { ...FF.FEATURE_FLAGS }, four = { ...base, mobaTacticalDirectorV21: true, mobaJungleV22: true, mobaSafeRouteV23: true, mobaTacticExecV24: true };
  const r = (flags) => RS.resolveRulesetForMode({ mode: "career", flags }).rulesetId;
  const got = { off: r(base), four: r(four), v25: r({ ...four, mobaDetMathV25: true }), v26: r({ ...four, mobaDetMathV26: true }), both: r({ ...four, mobaDetMathV25: true, mobaDetMathV26: true }),
    onlyV26: r({ ...base, mobaDetMathV26: true }), challenge: RS.resolveRulesetForMode({ mode: "challenge", flags: { ...four, mobaDetMathV26: true } }).rulesetId };
  const req = RS.resolveRulesetForMode({ mode: "career", flags: { ...four, mobaDetMathV26: true } }).releaseRequirements;
  ck("I2 旗標 mobaDetMathV26 預設關；四個 v24 旗標＋V26 ⇒ career.v26（V25 同開也是）；四個＋V25 ⇒ career.v25；只開 V26 ⇒ career.v20；Challenge 不受影響",
    FF.FEATURE_FLAGS.mobaDetMathV26 === false && FF.FEATURE_FLAGS.mobaDetMathV25 === false && got.off === "career.v20" && got.four === "career.v24" && got.v25 === "career.v25"
    && got.v26 === "career.v26" && got.both === "career.v26" && got.onlyV26 === "career.v20" && !/v26/.test(got.challenge) && req.includes("mobaDetMathV26"), J(got));
}
// ── I3 ──
{
  const rows = [];
  for (const id of ["balanceTool.v20", "balanceTool.v21", "balanceTool.v22", "balanceTool.v23", "balanceTool.v24", "balanceTool.v25", "balanceTool.v26"]) {
    const s = setupJson(146001, "v2.jungle_invasion", "classic.m7", id), r = c1Assemble(s);
    rows.push({ id, kernel: r.engine._simKernel.id, enumerable: Object.keys(r.engine).includes("_simKernel"), det: r.engine._detMath, first: r.applied.configured[0], calls: r.applied.configured.filter((m) => m === "configureMathKernel").length });
  }
  const legacyOk = rows.slice(0, 6).every((x) => x.kernel === "native" && !x.enumerable);
  const v26 = rows[6], v26Ok = v26.kernel === "det.v2" && !v26.enumerable && v26.det === true && v26.first === "configureMathKernel" && v26.calls === 1;
  const throws = (f) => { try { f(); return false; } catch { return true; } };
  const mismatch = { nativeAsksV2: throws(() => new LogicEngine(1, null).configureMathKernel("det.v2")), v2AsksNative: throws(() => new LogicEngine(1, null, { mathKernel: "det.v2" }).configureMathKernel("native")),
    v2AsksV1: throws(() => new LogicEngine(1, null, { mathKernel: "det.v2" }).configureMathKernel("det.v1")), v2AsksV2: !throws(() => new LogicEngine(1, null, { mathKernel: "det.v2" }).configureMathKernel("det.v2")) };
  ck("I3 v20～v25 引擎建在原生情境（_simKernel 不可列舉）；v26 建在 det.v2、_detMath＝true、configureMathKernel 第一個呼叫；建構與設定不一致兩個方向都丟錯",
    legacyOk && v26Ok && Object.values(mismatch).every(Boolean), J({ rows: rows.map((x) => [x.id, x.kernel, x.det, x.calls]), mismatch }));
}
// ── I4 ──
{
  const s25 = setupJson(142227, "v2.jungle_invasion", "v2.jungle_invasion", "balanceTool.v25"), s26 = setupJson(142227, "v2.jungle_invasion", "v2.jungle_invasion", "balanceTool.v26");
  const N = 400;
  const alone = (s) => { const e = c1Assemble(s).engine, d = [stateDigest(e)]; for (let i = 0; i < N && !e.over; i++) { e.tick(0.5); d.push(stateDigest(e)); } return d; };
  const a25 = alone(s25), a26 = alone(s26);
  const e25 = c1Assemble(s25).engine, e26 = c1Assemble(s26).engine, i25 = [stateDigest(e25)], i26 = [stateDigest(e26)];
  const ctxDuring = [];
  for (let i = 0; i < N; i++) { e26.tick(0.5); i26.push(stateDigest(e26)); ctxDuring.push(CTX.simKernelId()); e25.tick(0.5); i25.push(stateDigest(e25)); }
  e26.snapshot(); e26.frontTower("blue", "mid");
  const restored = CTX.simKernelId() === "native" && ctxDuring.every((k) => k === "native");
  ck(`I4 情境範圍：v25 與 v26 交錯 tick ${N} 次，兩邊逐 tick＝各自單獨跑；每次呼叫後全域情境都回到原生`,
    J(a25) === J(i25) && J(a26) === J(i26) && restored, J({ v25Same: J(a25) === J(i25), v26Same: J(a26) === J(i26), restored, differ: a25[N] !== a26[N] }));
}
// ── I5 ──
{
  const geoAfter = nativeGeo();
  const detTp = CTX.withSimKernel(CTX.DET_V2_SIM_KERNEL, () => TP.buildTowerPlacement());
  const natTp = TP.buildTowerPlacement();
  const ids = Object.keys(natTp.byId), diffIds = ids.filter((id) => natTp.byId[id].x !== detTp.byId[id].x || natTp.byId[id].y !== detTp.byId[id].y || natTp.byId[id].t !== detTp.byId[id].t);
  ck("I5 快取：det.v2 引擎跑過之後，原生核心的塔位／導航結構／路線弧長逐位元不變；det.v2 有自己的快取項（Node 上兩者塔位差異只報）",
    geoBefore === geoAfter && detTp !== natTp, J({ nativeUnchanged: geoBefore === geoAfter, separateCache: detTp !== natTp, towersDifferingOnNode: diffIds.length }));
}
// ── I6 ──
{
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/(^|[^:"'`\\])\/\/.*$/, "$1")).join("\n");
  const files = ["src/LogicEngine.js", "src/gameData.js", "src/battle/moba/nav/mobaNavigation.js", "src/battle/moba/map/mobaTowerPlacement.js", "src/battle/moba/tactics/tacticExecV24.js",
    "src/battle/moba/items/itemsEngineRuntime.js", "src/battle/moba/sim/simMathContext.js", "src/battle/moba/sim/detHypot.js"];
  const count = Object.fromEntries(files.map((f) => [f, (strip(fs.readFileSync(new URL("../" + f, import.meta.url), "utf8")).match(/Math\.hypot\s*\(/g) ?? []).length]));
  const want = { "src/gameData.js": 1, "src/battle/moba/sim/simMathContext.js": 1 };
  const nav = strip(fs.readFileSync(new URL("../src/battle/moba/nav/mobaNavigation.js", import.meta.url), "utf8"));
  ck("I6 靜態掃描（剝掉註解）：Math.hypot 只在 simMathContext（原生分支）與 gameData（import 時的原生 LANE_ARC）；導航的 DIR16 det 版用 DetMath.v1",
    files.every((f) => count[f] === (want[f] ?? 0)) && /detCos\(a\)/.test(nav) && /detSin\(a\)/.test(nav) && !/DIR16\[/.test(nav), J(count));
}
// ── I7 ──
{
  const FNS = ["hypot", "sin", "cos", "tan", "atan", "atan2", "asin", "acos", "exp", "expm1", "log", "log1p", "log2", "log10", "pow", "cbrt", "sinh", "cosh", "tanh"];
  const ORIG = Object.fromEntries(FNS.map((f) => [f, Math[f]]));
  const probe = (rulesetId) => {
    const e = c1Assemble(setupJson(151001, "v2.jungle_invasion", "classic.m7", rulesetId)).engine;
    const bySite = {}; let ticking = true;
    for (const f of FNS) { const o = ORIG[f]; Math[f] = function (...a) { if (ticking) { const fr = new Error().stack.split("\n").slice(2).find((s) => /[\\/]src[\\/]/.test(s)) ?? "?"; const k = f + " @ " + fr.replace(/^.*[\\/](src[\\/][^:)]*).*$/, "$1").replace(/\\/g, "/"); bySite[k] = (bySite[k] ?? 0) + 1; } return o.apply(Math, a); }; }
    try { for (let i = 0; i < 1200 && !e.over; i++) e.tick(0.5); } finally { for (const f of FNS) Math[f] = ORIG[f]; ticking = false; }
    return bySite;
  };
  const det = probe("balanceTool.v26"), nat = probe("balanceTool.v24");
  const natHypot = Object.entries(nat).filter(([k]) => k.startsWith("hypot")).reduce((s, [, n]) => s + n, 0);
  ck("I7 v26 對局（600 秒）tick 期間 src 呼叫原生 hypot／三角／指數／對數／次方 0 次；同一場 v24 有呼叫原生 hypot（探針有效）",
    Object.keys(det).length === 0 && natHypot > 0, J({ det, nativeHypotCallsOnV24: natHypot }));
}
// ── I8 ──
{
  const FIX = new URL("./fixtures/c2_pins_v26.json", import.meta.url);
  const PINS = [{ seed: 151001, blue: "v2.jungle_invasion", red: "classic.m7" }, { seed: 151002, blue: "classic.m3", red: "v2.hard_engage_stack" },
    { seed: 142227, blue: "v2.jungle_invasion", red: "v2.jungle_invasion" }, { seed: 146065, blue: "v2.jungle_invasion", red: "classic.m7" }];
  const now = PINS.map((p) => {
    const s = setupJson(p.seed, p.blue, p.red, "balanceTool.v26");
    const h = streamHashFnv(c1Assemble(s).engine, 3000), d = runDigest(c1Assemble(s).engine, 3000);
    return { ...p, rulesetId: "balanceTool.v26", toolEnv: "parity", ticks: h.ticks, winner: h.winner, endT: h.endT, streamHash: h.hash, c1Final: d.final };
  });
  if (process.argv.includes("--record-pins")) { fs.writeFileSync(FIX, JSON.stringify({ schema: "C2Pins.v1", recordedAt: new Date().toISOString(), note: "moba-sim.v26 balanceTool.v26 (mathKernel det.v2), Career-Parity", pins: now }, null, 1)); console.log("pins recorded"); }
  const want = fs.existsSync(FIX) ? JSON.parse(fs.readFileSync(FIX, "utf8")).pins : null;
  const diff = want ? now.filter((x, i) => J(x) !== J(want[i])) : now;
  ck("I8 v26 固定釘點（4 場整場雜湊＋整場狀態雜湊）＝tools/fixtures/c2_pins_v26.json", !!want && diff.length === 0, J({ diff: diff.map((d) => [d.seed, d.winner, d.streamHash]) }));
}

const pass = results.filter((r) => r.ok).length;
console.log(`\ncheck_c2_isolation：${pass}/${results.length} ${pass === results.length ? "PASS" : "FAIL"}（${Math.round((Date.now() - t0) / 1000)} 秒）`);
process.exit(pass === results.length ? 0 : 1);
