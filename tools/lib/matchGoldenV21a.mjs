// ============================================================================
//  tools/lib/matchGoldenV21a.mjs — v21-A golden baseline（Phase 3a-C1 Task 7，gate G-AC1 的參照）
//
//  共用者：tools/capture_match_golden_v21a.mjs（錄）與 tools/check_match_golden_v21a.mjs（驗）。
//  兩邊吃同一份案例清單與同一套執行函式 ⇒ 「錄的時候怎麼跑」與「驗的時候怎麼跑」不可能分歧。
//
//  案例＝兩組：
//   · v20 的 39 案（live 9、challenge 12、runner 18）：輸入由 tools/fixtures/match_golden_v20.json 重建（只讀），
//     走**真實包裝**（prepareLiveMatch／runChallenge／runner.configure），與 check_match_setup_3a 的 G-A2 同一條路；
//     重建函式直接 import 自 liveGolden／challengeGolden（沒有複製邏輯）。
//   · binding 案：戰術書的 TacticPlan.v2 → bindTacticPlanToCurrentVersions → opts.tacticPlanBinding → prepareLiveMatch
//     - 21 個模板（含 std）各自當藍方、紅方是標準對手（STANDARD_OPP_TACTIC），各 2 個固定 seed；
//     - std 模板上「目前提供」的非本來選擇（tacticBookOptions：套用量測排除與複驗撤下；預期 8 個），各 2 個固定 seed。
//   目的：C2 要把 LogicEngine 讀戰術資料的每一條路改成經過 Tactical Director，這份參照釘住「改完逐位元相同」。
//
//  每案記錄：digest、streamHash、resultHash、configure 序列（方法名＋引數雜湊）。
//   resultHash：challenge＝完整 ChallengeResult 的雜湊（同 v20 golden）；live／runner＝比賽結束時 engine.snapshot() 的雜湊。
// ============================================================================
import { fileURLToPath } from "node:url";
import path from "node:path";

//  runner 在載入時讀 ESMO_BALANCE_SKILLS／TALENTS；v20 golden 是用兩者 on 錄的（同 check_match_setup_3a）。
const dirty = Object.keys(process.env).filter((k) => k.startsWith("ESMO_BALANCE_"));
if (dirty.length) { console.error(`unset these env vars first: ${dirty.join(", ")}`); process.exit(2); }
process.env.ESMO_BALANCE_SKILLS = "on";
process.env.ESMO_BALANCE_TALENTS = "on";

const { LogicEngine } = await import("../../src/LogicEngine.js");
const { prepareLiveMatch } = await import("../../src/useLocalServer.js");
const { runChallenge } = await import("../../src/platform/challenge/challengeRunner.js");
const { stableStringify, stableHash } = await import("../../src/platform/contracts/squadSnapshot.js");
const { heroById } = await import("../../src/data/heroDatabase.js");
const { createTacticPlan } = await import("../../src/platform/tactics/tacticPlan.js");
const { TACTIC_TEMPLATES } = await import("../../src/platform/tactics/tacticTemplates.js");
const { tacticBookOptions, nestedOf } = await import("../../src/platform/tactics/tacticChoiceMapping.js");
const { bindTacticPlanToCurrentVersions } = await import("../../src/battle/moba/tactics/tacticResolver.js");
const { runAndHash, createStreamHasher, finalDigest } = await import("./matchGolden.mjs");
const { challengeGoldenInputs } = await import("./challengeGolden.mjs");
const { goldenLiveInputs } = await import("./liveGolden.mjs");
const runner = await import("../balance/moba_items_balance_runner.mjs");
const M_ON = await runner.modules();
const M_OFF = { ...M_ON, skills: null, talents: null, passives: null, curves: null };

export { stableHash, stableStringify };
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const V20_FIXTURE = path.join(ROOT, "tools", "fixtures", "match_golden_v20.json");
export const FIXTURE_V21A = path.join(ROOT, "tools", "fixtures", "match_golden_v21a.json");
export const SCHEMA = "match_golden_v21a.v1";

/** binding 案的 seed 池：v20 golden 已有名單（liveRosters）的 6 個 seed。每案取其中 2 個（相隔 3）。 */
export const BINDING_SEED_POOL = [3, 7, 11, 19, 23, 29];
export const EXPECT_OFFERED_ON_STD = 8;

// ── 探針（與 check_match_setup_3a 相同：prototype 上的 pass-through 包裝）─────────────
const PROBE = { ctx: null };
for (const name of Object.getOwnPropertyNames(LogicEngine.prototype)) {
  if (!/^configure|^enable/.test(name) || typeof LogicEngine.prototype[name] !== "function") continue;
  const orig = LogicEngine.prototype[name];
  LogicEngine.prototype[name] = function probed(...args) {
    const ctx = PROBE.ctx;
    if (ctx) { ctx.engine ??= this; ctx.calls.push({ m: name, h: stableHash(stableStringify(args.length <= 1 ? args[0] : args)) }); }
    return orig.apply(this, args);
  };
}
{
  const tick = LogicEngine.prototype.tick;
  LogicEngine.prototype.tick = function probedTick(...args) {
    const r = tick.apply(this, args);
    const ctx = PROBE.ctx;
    if (ctx) { ctx.engine ??= this; ctx.hasher.sample(this); }
    return r;
  };
}
export const PROBE_SHARES_RUNNER_ENGINE = M_ON.LE.LogicEngine === LogicEngine;

function observe(fn, every) {
  const ctx = { calls: [], engine: null, hasher: createStreamHasher(every) };
  PROBE.ctx = ctx;
  let out = null, thrown = null;
  try { out = fn(); } catch (e) { thrown = e; } finally { PROBE.ctx = null; }
  return { out, thrown, ctx };
}

// ── 案例清單 ────────────────────────────────────────────────────────────────
const idPart = (s) => String(s).replace(/[^A-Za-z0-9.=_-]+/g, "_");

/** 戰術書目前提供的、std 模板上的非本來選擇：[{ dimension, choice, own }]（順序＝Registry 順序）。 */
export function offeredNonOwnOnStd() {
  const out = [];
  for (const r of tacticBookOptions("std")) for (const choice of r.offered) if (choice !== r.own) out.push({ dimension: r.dimension, choice, own: r.own });
  return out;
}

function bindingOf(templateId, choices) {
  const created = createTacticPlan({ templateId, choices });
  if (!created.ok) throw new Error(`golden v21a: plan rejected ${templateId} ${JSON.stringify(choices)}: ${created.errors.map((e) => e.code).join(",")}`);
  const binding = bindTacticPlanToCurrentVersions(created.plan);
  if (!binding) throw new Error(`golden v21a: bind failed ${templateId}`);
  return binding;
}

/**
 * 整份案例清單（決定性；只依 v20 fixture 與目前的戰術書提供清單）。
 * 每案：{ id, group, path, seed, params } — params 會原樣寫進 fixture，驗證時用來比對「案例清單沒變」。
 */
export function buildCaseList(v20) {
  const cases = v20.cases.map((c) => ({ id: `v20:${c.id}`, group: "v20", path: c.path, seed: c.seed, params: { v20Id: c.id } }));
  const seedsFor = (i) => [BINDING_SEED_POOL[i % BINDING_SEED_POOL.length], BINDING_SEED_POOL[(i + 3) % BINDING_SEED_POOL.length]];
  Object.keys(TACTIC_TEMPLATES).forEach((templateId, i) => {
    for (const seed of seedsFor(i)) {
      cases.push({ id: `bind-template:${idPart(templateId)}:s${seed}`, group: "binding-template", path: "live", seed, params: { templateId, choices: {}, redTactic: "std" } });
    }
  });
  offeredNonOwnOnStd().forEach(({ dimension, choice, own }, i) => {
    for (const seed of seedsFor(i)) {
      cases.push({ id: `bind-choice:${idPart(dimension)}=${idPart(choice)}:s${seed}`, group: "binding-choice", path: "live", seed,
        params: { templateId: "std", dimension, choice, own, choices: nestedOf([[dimension, choice]]), redTactic: "std" } });
    }
  });
  return cases;
}

// ── 執行一案 ────────────────────────────────────────────────────────────────
const RUN = { live: { dt: 0.5, maxT: 3600, every: 20 }, runner: { dt: 0.5, maxT: 3600, every: 20 } };
const resultHashOf = (r) => stableHash(stableStringify(r));
const snapshotHashOf = (engine) => stableHash(stableStringify(engine.snapshot()));

function runLive(inputs, id) {
  const { out, thrown, ctx } = observe(() => prepareLiveMatch(inputs), RUN.live.every);
  if (thrown || !out?.ok) throw new Error(`golden v21a: prepareLiveMatch failed for ${id}: ${thrown ? String(thrown) : JSON.stringify(out?.errors)}`);
  const { digest, streamHash } = runAndHash(out.engine, RUN.live);
  return { digest, streamHash, resultHash: snapshotHashOf(out.engine), calls: ctx.calls };
}

/**
 * 跑一案、回傳 { digest, streamHash, resultHash, calls:[{m,h}] }（失敗就丟例外，不吞掉）。
 * @param {object} spec    buildCaseList 的一筆
 * @param {object} v20     v20 fixture（解析後）
 */
export function runCase(spec, v20) {
  if (spec.group === "v20") {
    const c = v20.cases.find((x) => x.id === spec.params.v20Id);
    if (!c) throw new Error(`golden v21a: v20 case ${spec.params.v20Id} not found`);
    if (c.path === "live") return runLive(goldenLiveInputs(c, v20), spec.id);
    if (c.path === "challenge") {
      const v = challengeGoldenInputs(c);
      const { out, thrown, ctx } = observe(() => runChallenge({ challenge: v.challenge, challengerSnapshot: v.challenger, defenderSnapshot: v.defender, draftResult: v.draftResult, heroOf: heroById }), v20.streamEvery);
      if (thrown || !out?.ok) throw new Error(`golden v21a: runChallenge failed for ${spec.id}: ${thrown ? String(thrown) : JSON.stringify(out?.errors)}`);
      return { digest: finalDigest(ctx.engine), streamHash: ctx.hasher.hex, resultHash: resultHashOf(out.result), calls: ctx.calls };
    }
    const M = c.params.skills ? M_ON : M_OFF;
    const { out, thrown, ctx } = observe(() => runner.configure(c.seed, c.params.config, M), RUN.runner.every);
    if (thrown) throw new Error(`golden v21a: runner.configure failed for ${spec.id}: ${String(thrown)}`);
    const { digest, streamHash } = runAndHash(out.e, RUN.runner);
    return { digest, streamHash, resultHash: snapshotHashOf(out.e), calls: ctx.calls };
  }
  //  binding 案：與 v20 的 live-notactic 同樣的 Live 入參骨架（名單＝v20 golden 的 liveRosters[seed]、藍方選手與出裝策略 standard、
  //  無天賦選擇、對手＝標準戰術），藍方戰術改由 binding 交進 opts.tacticPlanBinding。
  const synthetic = { id: spec.id, seed: spec.seed, params: { noRoster: false, noPlayers: false, tacticId: null, buildStrategy: "standard" }, liveOpts: { talentSelections: null, opponentId: null } };
  const inputs = goldenLiveInputs(synthetic, v20);
  inputs.opts = { ...inputs.opts, tacticPlanBinding: bindingOf(spec.params.templateId, spec.params.choices) };
  return runLive(inputs, spec.id);
}

/** binding 的雜湊（輸入端的指紋：bind 結果變了，case 的輸入就不同了，要看得出來）。 */
export const bindingHashOf = (spec) => stableHash(stableStringify(bindingOf(spec.params.templateId, spec.params.choices)));

/** 一案的紀錄（寫進 fixture 的形狀）。 */
export function recordOf(spec, v20) {
  const r = runCase(spec, v20);
  return {
    id: spec.id, group: spec.group, path: spec.path, seed: spec.seed, params: spec.params,
    ...(spec.group === "v20" ? {} : { bindingHash: bindingHashOf(spec) }),
    digest: r.digest, streamHash: r.streamHash, resultHash: r.resultHash,
    calls: r.calls.map(({ m, h }) => ({ m, h })),
  };
}

// ── 比對（純函式；負向自檢直接餵合成資料）──────────────────────────────────────
/**
 * @param {object} fixture   已錄的 fixture（解析後）
 * @param {Array<object>} observed  目前這棵樹跑出來的紀錄（recordOf 的輸出）
 * @returns {{ problems: string[], matched: number, total: number }} total＝fixture 的案例數；matched＝逐欄相同的案例數
 */
export function compareToFixture(fixture, observed) {
  const problems = [];
  const want = new Map(fixture.cases.map((c) => [c.id, c]));
  const got = new Map(observed.map((c) => [c.id, c]));
  for (const id of want.keys()) if (!got.has(id)) problems.push(`missing case (in fixture, not produced now): ${id}`);
  for (const id of got.keys()) if (!want.has(id)) problems.push(`extra case (produced now, not in fixture): ${id}`);
  let matched = 0;
  for (const [id, w] of want) {
    const g = got.get(id);
    if (!g) continue;
    const diffs = [];
    for (const k of ["group", "path", "seed", "bindingHash", "digest", "streamHash", "resultHash"]) if ((w[k] ?? null) !== (g[k] ?? null)) diffs.push(`${k} ${w[k] ?? null} -> ${g[k] ?? null}`);
    if (stableStringify(w.params) !== stableStringify(g.params)) diffs.push("params differ");
    if (stableStringify(w.calls) !== stableStringify(g.calls)) {
      const n = Math.max(w.calls.length, g.calls.length);
      let at = -1;
      for (let i = 0; i < n && at < 0; i++) if (w.calls[i]?.m !== g.calls[i]?.m || w.calls[i]?.h !== g.calls[i]?.h) at = i;
      diffs.push(`configure calls differ at #${at}`);
    }
    if (diffs.length) problems.push(`${id}: ${diffs.join("; ")}`); else matched++;
  }
  const order = fixture.cases.map((c) => c.id).join("|") === observed.map((c) => c.id).join("|");
  if (!problems.length && !order) problems.push("case order differs");
  return { problems, matched, total: fixture.cases.length };
}
