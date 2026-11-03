#!/usr/bin/env node
// ============================================================================
//  tools/check_match_setup_3a.mjs — Phase 3a Task 7：跨模式一致 gate（3a-A 架構完成點）
//
//  執行：node tools/check_match_setup_3a.mjs            （39 場 golden 走各自的真實包裝＋36 場交叉重跑，數分鐘）
//
//  前面的 gate 各管一個模式（assembler／live／challenge／runner）。這一支管「三個模式放在一起」：
//   G-A2 39 筆 golden（live 9、challenge 12、runner 18）各走**自己的真實包裝**
//        （Live＝prepareLiveMatch、Challenge＝runChallenge、runner＝configure()），
//        configure 序列＋引數雜湊＋digest＋streamHash 全部＝v20 golden。
//   G-A1 每個 ruleset（career.v20／challenge.v20／balanceTool.v20）× 6 seeds：同一份 setup 走不同的組裝路徑，結果必須相同：
//        (包裝端到端) ↔ (包裝自建的 setup → assembleMatch + Live 共用 deps) ↔ (手編 setup → assembleMatch + core deps)
//        「手編」＝tools/lib/matchGoldenSetup.mjs（不經任何包裝）。三者的 setup 雜湊、configure 序列、digest、streamHash 都要相同。
//        反例：改 setup 一個欄位 ⇒ 雜湊與 digest 都變。
//   RS-1 跨模式：ruleset 不得強制開啟「發布旗標關閉」的層（見 docs/design/MOBA_Tactical_AI_Phase3_正式架構.md RS-1）。
//   S    正式組裝掃描：src/ 內只有唯一組裝器會對引擎呼叫 configure*（先剝註解；例外逐一核實並釘死數量）。
//   V    語意清單與版本：v21 是未發布候選；v1–v20 指紋不得變；組裝路徑上的模組必須在 SIMULATION_SEMANTICS_FILES。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ck = (l, ok, n = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}${n ? `　${n}` : ""}`); };
const progress = (s) => process.stderr.write(`  ${s}\n`);

//  runner 在載入時讀 ESMO_BALANCE_SKILLS／TALENTS；golden 是用兩者 on 錄的（同 check_balance_runner_setup_3a）。
const dirty = Object.keys(process.env).filter((k) => k.startsWith("ESMO_BALANCE_"));
if (dirty.length) { console.error(`unset these env vars first: ${dirty.join(", ")}`); process.exit(2); }
process.env.ESMO_BALANCE_SKILLS = "on";
process.env.ESMO_BALANCE_TALENTS = "on";

const { LogicEngine } = await import("../src/LogicEngine.js");
const { assembleMatch } = await import("../src/battle/moba/matchAssembler.js");
const { sharedMatchAssemblerDeps } = await import("../src/battle/moba/matchAssemblerDeps.js");
const { buildMatchAssemblerDepsFrom } = await import("../src/battle/moba/matchAssemblerDepsCore.js");
const { buildLiveMatchSetup, resolveLiveRuleset } = await import("../src/battle/moba/liveMatchSetup.js");
const { prepareLiveMatch } = await import("../src/useLocalServer.js");
const { runChallenge } = await import("../src/platform/challenge/challengeRunner.js");
const { buildChallengeMatchSetup, CHALLENGE_HERO_LOOKUP_LABEL } = await import("../src/platform/challenge/challengeMatchSetup.js");
const { createMatchSetup, matchSetupHash } = await import("../src/platform/contracts/matchSetup.js");
const { MATCH_RULESETS, LAYER_RELEASE_FLAG, resolveRulesetForMode, PRODUCTION_FORBIDDEN_KEYS } = await import("../src/platform/contracts/matchRuleset.js");
const SV = await import("../src/platform/contracts/simulationVersion.js");
const { FEATURE_FLAGS } = await import("../src/featureFlags.js");
const { heroById } = await import("../src/data/heroDatabase.js");
const { stableStringify, stableHash } = await import("../src/platform/contracts/squadSnapshot.js");
const { runAndHash, createStreamHasher, finalDigest } = await import("./lib/matchGolden.mjs");
const { makeGoldenEncoder } = await import("./lib/matchGoldenSetup.mjs");
const { challengeGoldenInputs, challengeBuilderArgs } = await import("./lib/challengeGolden.mjs");
const { goldenLiveInputs } = await import("./lib/liveGolden.mjs");
const { stripComments } = await import("./lib/stripComments.mjs");
const runner = await import("./balance/moba_items_balance_runner.mjs");
const M_ON = await runner.modules();
const M_OFF = { ...M_ON, skills: null, talents: null, passives: null, curves: null };

//  v1–v20 指紋表（`moba-sim.vN=<fp>` 以 ; 串接）的 stableHash。值在 Task 7 動手前從 HEAD e1557f3 的 simulationVersion.js 量得；
//  v20 已發布，這張表永遠不得改變——只有未發布的 v21 候選可以重新登記。
const V1_TO_V20_TABLE_HASH = "fc777868";

const golden = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/fixtures/match_golden_v20.json"), "utf8"));
const ENC = makeGoldenEncoder(golden);
const RUN = (path_) => ({ dt: golden.dt, maxT: golden.maxT[path_], every: golden.streamEvery });
const SHARED = sharedMatchAssemblerDeps();
//  Challenge 包裝的 deps 取法（challengeRunner.js:152）：core＋注入的查表；這裡當作「第二條 deps 來源」。
const CORE_DEPS = buildMatchAssemblerDepsFrom({ heroLookup: heroById, heroLookupLabel: CHALLENGE_HERO_LOOKUP_LABEL });

// ── 探針：prototype 上的 pass-through 包裝（與 capture_match_golden_v20 相同；tick 後取樣串流雜湊供 runChallenge 用）────────
const PROBE = { ctx: null };
ck("P0 runner 載入的引擎類別＝src/LogicEngine.js 的同一個類別（探針只裝一次、三個模式量到同一棵樹）", M_ON.LE.LogicEngine === LogicEngine);
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
/** 在探針下執行 fn；回傳 { out, thrown, ctx }。 */
function observe(fn) {
  const ctx = { calls: [], engine: null, hasher: createStreamHasher(golden.streamEvery) };
  PROBE.ctx = ctx;
  let out = null, thrown = null;
  try { out = fn(); } catch (e) { thrown = e; } finally { PROBE.ctx = null; }
  return { out, thrown, ctx };
}
const firstDiff = (got, want) => {
  const n = Math.max(got.length, want.length);
  for (let i = 0; i < n; i++) if (got[i]?.m !== want[i]?.m || got[i]?.h !== want[i]?.h) return `#${i}: got ${got[i] ? `${got[i].m}/${got[i].h}` : "∅"} want ${want[i] ? `${want[i].m}/${want[i].h}` : "∅"}`;
  return "";
};
/** 一場結果的紀錄：configure 序列＋引數雜湊、digest、streamHash（整場，或截到 maxT）。 */
const recordOf = (calls, engine, path_, over = {}) => ({ calls, ...runAndHash(engine, { ...RUN(path_), ...over }) });
/** 兩筆紀錄是否完全相同；回傳不同之處（空字串＝相同）。 */
const recDiff = (a, b) => firstDiff(a.calls, b.calls) || (a.digest !== b.digest ? `digest ${a.digest} vs ${b.digest}` : "") || (a.streamHash !== b.streamHash ? `streamHash ${a.streamHash} vs ${b.streamHash}` : "");
/** 一份 setup 經 assembleMatch + deps 跑出的紀錄。 */
function viaAssemble(setup, deps, path_, over = {}) {
  const { out: r, thrown, ctx } = observe(() => assembleMatch(setup, deps));
  if (thrown || !r?.ok) return { error: thrown ? String(thrown) : (r?.errors ?? []).map((e) => `${e.code}@${e.field}`).join(",") };
  return recordOf(ctx.calls, r.engine, path_, over);
}
const errText = (r) => r.error ?? "";

// ════ G-A2：39 筆 golden，各走自己的真實包裝 ═══════════════════════════════════════════
const WRAPPED = new Map();   // id → { rec, setup }
{
  const counts = { live: [0, 0], challenge: [0, 0], runner: [0, 0] };
  ck("G0 golden 共 39 案：live 9、challenge 12、runner 18", golden.cases.length === 39
    && ["live", "challenge", "runner"].every((p, i) => golden.cases.filter((c) => c.path === p).length === [9, 12, 18][i]));
  const t0 = Date.now();
  for (const [n, c] of golden.cases.entries()) {
    let rec = null, setup = null, why = "";
    if (c.path === "live") {
      const { out, thrown, ctx } = observe(() => prepareLiveMatch(goldenLiveInputs(c, golden)));
      if (thrown || !out?.ok) why = thrown ? String(thrown) : JSON.stringify(out?.errors);
      else { rec = recordOf(ctx.calls, out.engine, "live"); setup = out.setup; }
    } else if (c.path === "challenge") {
      const v = challengeGoldenInputs(c);
      const { out, thrown, ctx } = observe(() => runChallenge({ challenge: v.challenge, challengerSnapshot: v.challenger, defenderSnapshot: v.defender, draftResult: v.draftResult, heroOf: heroById }));
      if (thrown || !out?.ok) why = thrown ? String(thrown) : JSON.stringify(out?.errors);
      else {
        rec = { calls: ctx.calls, digest: finalDigest(ctx.engine), streamHash: ctx.hasher.hex };
        const b = buildChallengeMatchSetup(challengeBuilderArgs(v, !!v.draftResult));
        setup = b.ok ? b.setup : null;
      }
    } else {
      const M = c.params.skills ? M_ON : M_OFF;
      const { out, thrown, ctx } = observe(() => runner.configure(c.seed, c.params.config, M));
      if (thrown) why = String(thrown);
      else {
        rec = recordOf(ctx.calls, out.e, "runner");
        setup = runner.buildBalanceMatchSetup(c.seed, c.params.config, M, 1, out.roster).setup;
      }
    }
    const want = { calls: c.calls, digest: c.digest, streamHash: c.streamHash };
    const diff = rec ? recDiff(rec, want) : `wrapper failed: ${why}`;
    ck(`G-A2 ${c.id}（${{ live: "prepareLiveMatch", challenge: "runChallenge", runner: "runner.configure" }[c.path]}）configure 序列＋digest＋streamHash＝v20 golden`, diff === "", diff);
    counts[c.path][diff === "" ? 0 : 1]++;
    if (rec) WRAPPED.set(c.id, { rec, setup });
    progress(`G-A2 ${n + 1}/${golden.cases.length} ${c.id} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  const f = (k) => `${k} ${counts[k][0]}/${counts[k][0] + counts[k][1]}`;
  const total = counts.live[0] + counts.challenge[0] + counts.runner[0];
  ck(`G-A2 39/39 逐位元相同（${f("live")}、${f("challenge")}、${f("runner")}）`, total === 39, `${total}/39`);
}

// ════ G-A1：同一份 setup 走不同組裝路徑，結果相同 ═══════════════════════════════════════
const SEEDS = golden.cases.filter((c) => /^challenge-draft-\d+$/.test(c.id)).map((c) => c.seed);
const FAMILIES = [
  { ruleset: "career.v20", path: "live", wrapper: "prepareLiveMatch", idOf: (s) => golden.cases.find((c) => /^live-m\d+-\d+$/.test(c.id) && c.seed === s)?.id },
  { ruleset: "challenge.v20", path: "challenge", wrapper: "runChallenge＋buildChallengeMatchSetup", idOf: (s) => `challenge-draft-${s}` },
  { ruleset: "balanceTool.v20", path: "runner", wrapper: "runner.configure＋buildBalanceMatchSetup", idOf: (s) => `runner-standard-${s}` },
];
ck("A1-0 6 個 seeds（golden 的 challenge-draft 案）且每個 ruleset 每個 seed 都有對應 golden 案", SEEDS.length === 6
  && FAMILIES.every((f) => SEEDS.every((s) => golden.cases.some((c) => c.id === f.idOf(s)))), SEEDS.join(","));
const HASHES = {};
const { objectiveLayoutForSeed } = await import("../src/platform/contracts/objectiveLayout.js");
const { STANDARD_OPP_TACTIC } = await import("../src/platform/contracts/MobaTacticConfig.js");
/** 兩份 setup（去 meta）逐欄比對的差異路徑（葉節點用 stableStringify 比對，路徑以 . 連接，已排序）。 */
function deltaPaths(a, b) {
  const out = [];
  const walkPaths = (x, y, p) => {
    const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
    if (isObj(x) && isObj(y)) { for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walkPaths(x[k], y[k], p ? `${p}.${k}` : k); return; }
    if (stableStringify(x ?? null) !== stableStringify(y ?? null)) out.push(p);
  };
  const { meta: _a, ...ra } = a, { meta: _b, ...rb } = b;
  walkPaths(ra, rb, "");
  return out.sort();
}
/** 已點名的編碼差異（wrapper W vs hand H）。null＝這個 ruleset 沒有已點名的差異。 */
function documentedDelta(rulesetId, W, H) {
  if (rulesetId === "career.v20") {
    const redStd = W.tactic.red?.kind === "legacy" && stableStringify(W.tactic.red.config) === stableStringify(STANDARD_OPP_TACTIC) && H.tactic.red?.kind === "std";
    return { paths: redStd ? ["tactic.red.config", "tactic.red.kind"] : [], ok: redStd };
  }
  if (rulesetId === "balanceTool.v20") {
    const forced = W.tool?.forcedLayout === objectiveLayoutForSeed(W.seed) && H.tool?.forcedLayout == null;
    return { paths: forced ? ["tool.forcedLayout"] : [], ok: forced };
  }
  return { paths: [], ok: false };
}
/** 手編入參套用包裝的編碼選擇（只套上面點名的兩處）。 */
function normalizeHandInput(rulesetId, input, W) {
  if (rulesetId === "career.v20" && W.tactic.red?.kind === "legacy" && input.tactic?.red?.kind === "std") return { ...input, tactic: { ...input.tactic, red: { kind: "legacy", config: W.tactic.red.config } } };
  if (rulesetId === "balanceTool.v20") return { ...input, tool: { ...(input.tool ?? {}), forcedLayout: W.tool?.forcedLayout } };
  return input;
}
for (const fam of FAMILIES) {
  let hashSame = 0, resultSame = 0;
  for (const seed of SEEDS) {
    const id = fam.idOf(seed), c = golden.cases.find((x) => x.id === id);
    const wrapped = WRAPPED.get(id);
    const built = createMatchSetup(ENC.encodeCase(c));
    if (!wrapped?.setup || !built.ok) { ck(`A1 ${fam.ruleset} seed ${seed}：包裝 setup 與手編 setup 都建得起來`, false, built.ok ? "wrapper setup missing" : built.errors.map((e) => `${e.code}@${e.field}`).join(",")); continue; }
    const W = wrapped.setup, H = built.setup;
    const hw = matchSetupHash(W), hh = matchSetupHash(H);
    (HASHES[fam.ruleset] ??= {})[seed] = hw;
    //  包裝自建的 setup → 共用 deps（Live 的取法）；手編 setup → core deps（Challenge 的取法）
    const viaWrapperSetup = viaAssemble(W, SHARED, fam.path);
    const viaHandSetup = viaAssemble(H, CORE_DEPS, fam.path);
    const d1 = errText(viaWrapperSetup) || recDiff(wrapped.rec, viaWrapperSetup);
    const d2 = errText(viaHandSetup) || recDiff(viaWrapperSetup, viaHandSetup);
    ck(`A1 ${fam.ruleset} seed ${seed}：ruleset 相同（${W.rulesetId}＝${H.rulesetId}）；包裝端到端＝包裝 setup＋共用 deps（${fam.wrapper}）`,
      W.rulesetId === fam.ruleset && H.rulesetId === fam.ruleset && d1 === "", d1);
    ck(`A1 ${fam.ruleset} seed ${seed}：手編 setup＋core deps 的 configure 序列＋digest＋streamHash＝包裝 setup 的`, d2 === "", d2);
    //  身分：包裝自建的 setup 與手編的 setup 逐欄比對。兩處「編碼選擇」不同但行為相同（上面 d2 已證 configure 序列＋結果相同），
    //  必須逐項點名，不得用「雜湊不同但結果相同」帶過：
    //   · career 無對手隊伍時，Live builder 把紅方寫成 legacy(STANDARD_OPP_TACTIC)，手編寫成 { kind:"std" }；
    //   · balanceTool：runner 明示 tool.forcedLayout（＝該 seed 的自然版面），手編不寫（契約預設 bySeed）。
    const delta = deltaPaths(W, H);
    const known = documentedDelta(fam.ruleset, W, H);
    ck(`A1 ${fam.ruleset} seed ${seed}：包裝 setup 與手編 setup 的欄位差異${delta.length ? `＝${delta.join("、")}` : "＝無"}，${delta.length ? "恰為已點名的編碼選擇" : "雜湊相同"}`,
      delta.length === 0 ? hw === hh : (known !== null && JSON.stringify(delta) === JSON.stringify(known.paths) && known.ok), `${hw} vs ${hh}`);
    //  把手編那一邊改成包裝的編碼選擇後，身分雜湊必須完全相同（只剩已點名的差異，沒有別的）
    const normalized = createMatchSetup(normalizeHandInput(fam.ruleset, ENC.encodeCase(c), W));
    const hn = normalized.ok ? matchSetupHash(normalized.setup) : "rejected";
    ck(`A1 ${fam.ruleset} seed ${seed}：手編（套用同樣的編碼選擇後）setup 身分雜湊＝包裝自建`, hn === hw, `${hn} vs ${hw}`);
    if (hn === hw) hashSame++;
    if (d1 === "" && d2 === "") resultSame++;
    progress(`A1 ${fam.ruleset} seed ${seed} ${d1 === "" && d2 === "" ? "ok" : "DIFF"}`);
  }
  ck(`A1 ${fam.ruleset}：6 seeds 結果全同、setup 雜湊全同`, resultSame === 6 && hashSame === 6, `結果 ${resultSame}/6、雜湊 ${hashSame}/6`);
}
{
  //  不同 ruleset 的 setup 必須不同（雜湊有檢定力：rulesetId 在身分裡）
  const s = SEEDS[0];
  const hs = FAMILIES.map((f) => HASHES[f.ruleset]?.[s]);
  ck("A1b 同一個 seed、三個 ruleset 的 setup 身分雜湊兩兩不同（身分含 ruleset）", hs.every(Boolean) && new Set(hs).size === 3, hs.join(","));
}
{
  //  反例：改 setup 一個欄位 ⇒ 雜湊與 digest 都變（截到 300 模擬秒，兩邊同截）
  const c = golden.cases.find((x) => x.id === FAMILIES[0].idOf(SEEDS[0]));
  const base = ENC.encodeCase(c);
  const short = { maxT: 300 };
  const a = createMatchSetup(base), bSeed = createMatchSetup({ ...base, seed: base.seed + 2 });
  const bTactic = createMatchSetup({ ...base, tactic: { ...base.tactic, blue: ENC.legacy(c.params.tacticId === "m5" ? "m6" : "m5") } });
  const ra = viaAssemble(a.setup, CORE_DEPS, "live", short), rs = viaAssemble(bSeed.setup, CORE_DEPS, "live", short), rt = viaAssemble(bTactic.setup, CORE_DEPS, "live", short);
  ck("A1c 反例（seed +2）：setup 雜湊不同、300 秒時的 digest／streamHash 不同",
    a.ok && bSeed.ok && matchSetupHash(a.setup) !== matchSetupHash(bSeed.setup) && ra.digest !== rs.digest && ra.streamHash !== rs.streamHash, `${ra.digest} vs ${rs.digest}`);
  ck("A1d 反例（藍方戰術換一套）：setup 雜湊不同、300 秒時的 digest／streamHash 不同",
    a.ok && bTactic.ok && matchSetupHash(a.setup) !== matchSetupHash(bTactic.setup) && ra.digest !== rt.digest && ra.streamHash !== rt.streamHash, `${ra.digest} vs ${rt.digest}`);
  //  比較器本身有檢定力
  const tampered = { ...ra, digest: ra.digest + "x" };
  const tamperedCalls = { ...ra, calls: ra.calls.slice(1) };
  ck("A1e 比較器有檢定力：digest 被改、少一筆 configure 呼叫 ⇒ recDiff 都判不同；同一筆自比 ⇒ 相同",
    recDiff(ra, tampered) !== "" && recDiff(ra, tamperedCalls) !== "" && recDiff(ra, ra) === "");
}

// ════ RS-1：ruleset 不得強制開啟「發布旗標關閉」的層（跨模式）═════════════════════════════
//  既有 check_match_ruleset_3a 逐 ruleset 驗靜態定義；這裡驗「三個模式實際會用到的 ruleset／setup」，
//  並掃旗標組合與 DEV 路徑。述詞 rs1Violations 同時是被測物與被反例驗證的對象。
{
  const rs1Violations = (ruleset, flags, { requireListed = true } = {}) => Object.entries(LAYER_RELEASE_FLAG)
    .filter(([layer, flag]) => ruleset?.layers?.[layer] === true && (flags?.[flag] !== true || (requireListed && !ruleset.releaseRequirements?.includes(flag))))
    .map(([layer, flag]) => `${layer}←${flag}`);
  const FLAG_NAMES = [...new Set(Object.values(LAYER_RELEASE_FLAG))].sort();
  const combos = Array.from({ length: 1 << FLAG_NAMES.length }, (_, i) => Object.fromEntries(FLAG_NAMES.map((f, k) => [f, !!(i & (1 << k))])));
  ck(`RS-1.0 述詞有檢定力：items 層開著、itemsV1 關、releaseRequirements 空的偽造 ruleset ⇒ 判違規；未列旗標但旗標為真 ⇒ 也判違規；合法者不判`,
    rs1Violations({ layers: { items: true }, releaseRequirements: [] }, { itemsV1: false }).length === 1
    && rs1Violations({ layers: { items: true }, releaseRequirements: [] }, { itemsV1: true }).length === 1
    && rs1Violations({ layers: { items: true }, releaseRequirements: ["itemsV1"] }, { itemsV1: true }).length === 0);
  ck(`RS-1.1 career（Live 解析）：${combos.length} 種旗標組合 × DEV 開關（allowTool=false）——任何已開的層，其旗標都為真且列在 releaseRequirements；DEV 不能把層強制打開`,
    combos.every((flags) => [null, { heroSkills: true, items: true }].every((dev) => {
      const r = resolveLiveRuleset({ flags, dev, allowTool: false });
      return r.ruleset.kind === "production" && r.ruleset.rulesetId === "career.v20" && rs1Violations(r.ruleset, flags).length === 0;
    })));
  ck("RS-1.2 challenge.v20：不讀旗標——任何旗標組合下都沒有任何受旗標管轄的層開著（不會因旗標打開而變成第二套 Challenge 語意）",
    combos.every((flags) => { const r = resolveRulesetForMode({ mode: "challenge", flags }); return r.rulesetId === "challenge.v20" && Object.keys(LAYER_RELEASE_FLAG).every((l) => r.layers[l] === false) && r.releaseRequirements.length === 0; }));
  ck("RS-1.3 工具 ruleset 只有一條路：resolveRulesetForMode 對任何 mode／旗標都不回 kind:tool；Live 只在 allowTool＋DEV 開關時才回 tool，且來源標 dev",
    ["career", "challenge", "balance", "tool", "bogus", undefined].every((mode) => combos.every((flags) => resolveRulesetForMode({ mode, flags }).kind === "production"))
    && (() => { const off = { heroSkillsV1: false, heroBattleTalentsV1: false, itemsV1: false }; const t = resolveLiveRuleset({ flags: off, dev: { items: true }, allowTool: true }); const n = resolveLiveRuleset({ flags: off, dev: { items: true }, allowTool: false });
      return t.ruleset.kind === "tool" && t.source === "dev" && n.ruleset.kind === "production" && n.source === "flags"; })());
  //  實際建出的 setup：Live（正式旗標、全關旗標）、Challenge（一個案）——effectiveLayers 與 ruleset／旗標一致
  const liveCase = golden.cases.find((c) => c.id === FAMILIES[0].idOf(SEEDS[0]));
  const liveIn = goldenLiveInputs(liveCase, golden);
  const OFF = Object.freeze({ ...FEATURE_FLAGS, heroSkillsV1: false, heroBattleTalentsV1: false, itemsV1: false });
  const liveOn = buildLiveMatchSetup(liveIn), liveOff = buildLiveMatchSetup({ ...liveIn, ruleset: resolveLiveRuleset({ flags: OFF }).ruleset });
  const LAYERS = Object.keys(LAYER_RELEASE_FLAG);
  const eff = (r) => r.ok ? r.setup.effectiveLayers : null;
  ck("RS-1.4 Live 實際 setup：正式旗標下 effectiveLayers 的受管層＝ruleset 的層（不多開）；旗標全關時受管層全為 false 且天賦選擇／出裝策略被濾掉",
    liveOn.ok && liveOff.ok && LAYERS.every((l) => l in eff(liveOn) && l in eff(liveOff))
    && LAYERS.every((l) => eff(liveOn)[l] === false || (eff(liveOn)[l] === true && MATCH_RULESETS["career.v20"].layers[l] === true && FEATURE_FLAGS[LAYER_RELEASE_FLAG[l]] === true))
    && LAYERS.every((l) => eff(liveOff)[l] === false) && liveOff.setup.talentSelections === null && liveOff.setup.buildStrategy === null,
    JSON.stringify({ on: eff(liveOn), off: eff(liveOff) }));
  const chW = WRAPPED.get(FAMILIES[1].idOf(SEEDS[0]))?.setup;
  ck("RS-1.5 Challenge 實際 setup：受管層一律 false（技能／被動／曲線／出裝都沒有）", !!chW && LAYERS.every((l) => chW.effectiveLayers[l] === false), JSON.stringify(chW?.effectiveLayers));
  //  生產／工具分界：生產 ruleset 帶 tool 區塊 ⇒ 拒絕（組裝器的前一道）；tool ruleset 可以
  const careerBase = ENC.encodeCase(liveCase), challengeBase = ENC.encodeCase(golden.cases.find((c) => c.id === FAMILIES[1].idOf(SEEDS[0])));
  const toolBase = ENC.encodeCase(golden.cases.find((c) => c.id === FAMILIES[2].idOf(SEEDS[0])));
  const forbidden = (base) => PRODUCTION_FORBIDDEN_KEYS.map((k) => createMatchSetup({ ...base, tool: { [k]: k === "ruleOverrides" ? { towerHp: 1 } : k === "forcedLayout" ? "STANDARD" : k === "itemsStrategies" ? { blue: "standard", red: "standard" } : 1.1 } }));
  const fc = forbidden(careerBase), fh = forbidden(challengeBase), ft = forbidden(toolBase);
  ck(`RS-1.6 生產／工具分界：career、challenge 的 setup 帶任何一個工具專用欄位（${PRODUCTION_FORBIDDEN_KEYS.join("／")}）都被拒（tool_field_in_production）；balanceTool 接受`,
    fc.every((r) => !r.ok && r.errors.some((e) => e.code === "tool_field_in_production")) && fh.every((r) => !r.ok && r.errors.some((e) => e.code === "tool_field_in_production")) && ft.every((r) => r.ok));
}

// ════ S：正式組裝掃描 ═════════════════════════════════════════════════════════════════
//  掃 src/** 有沒有人繞過唯一組裝器直接對引擎 configure。先剝註解（說明文字正好在講「我們不再呼叫 X」）。
//  ⚠ 組裝器自己是用字串名稱分派（call("configureItems", …) → engine[method](arg)），所以不能只找 `.configureX(`：
//    同時統計「名稱出現」（字串名也算），否則另一個檔案用 `engine["configureItems"](…)` 就會繞過去。
const ENGINE_PROTO = Object.getOwnPropertyNames(LogicEngine.prototype).filter((n) => typeof LogicEngine.prototype[n] === "function");
const CONFIGURE_METHODS = ENGINE_PROTO.filter((n) => /^configure[A-Z]/.test(n)).sort();
const ENABLE_METHODS = ENGINE_PROTO.filter((n) => /^enable[A-Z]/.test(n)).sort();
const KNOWN_CONFIGURE = ["configureArchetypes", "configureHeroPassives", "configureHeroPowerCurve", "configureHeroSkills", "configureHeroes", "configureItems", "configureMatch", "configureObjectiveLayout", "configurePlayers", "configureSpells"];
ck(`S0 從引擎 prototype 推導 configure 方法清單：非空，且含已知的 ${KNOWN_CONFIGURE.length} 個（未來新增的 configure* 自動納入掃描）`,
  CONFIGURE_METHODS.length > 0 && KNOWN_CONFIGURE.every((m) => CONFIGURE_METHODS.includes(m)), CONFIGURE_METHODS.join(","));
ck("S0b 同時推導 enable* 方法（enableCombatDebug 之類）；非空", ENABLE_METHODS.length > 0 && ENABLE_METHODS.includes("enableCombatDebug"), ENABLE_METHODS.join(","));

const ALL_ENGINE_METHODS = [...CONFIGURE_METHODS, ...ENABLE_METHODS];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const methodsRe = (names) => names.map(esc).join("|");
/** 一份（已剝註解的）原始碼裡：直接呼叫（`.name(`／`?.name(`）與名稱出現（任何形式，含字串名）。 */
function scanCode(rawText, names) {
  const code = stripComments(rawText);
  const direct = [...code.matchAll(new RegExp(`\\.\\s*(${methodsRe(names)})\\s*\\(`, "g"))].map((m) => m[1]);
  const direct2 = [...code.matchAll(new RegExp(`\\?\\.\\s*(${methodsRe(names)})\\s*\\(`, "g"))].map((m) => m[1]);
  const named = [...code.matchAll(new RegExp(`\\b(${methodsRe(names)})\\b`, "g"))].map((m) => m[1]);
  const constructs = [...code.matchAll(/\bnew\s+(?:[A-Za-z_$][\w$]*\.)?LogicEngine\b/g)].length;
  const assembleCalls = [...code.matchAll(/(?<![\w$.])assembleMatch\s*\(/g)].length - [...code.matchAll(/\bfunction\s+assembleMatch\s*\(/g)].length;
  return { direct: direct.length + direct2.length, directNames: [...direct, ...direct2], named: new Set(named), namedCount: named.length, constructs, assembleCalls };
}
const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(m?jsx?|tsx?)$/.test(e.name)) out.push(p);
  }
  return out;
}
const SRC_FILES = new Map(walk(path.join(ROOT, "src")).map((p) => [rel(p), fs.readFileSync(p, "utf8")]));

const ASSEMBLER = "src/battle/moba/matchAssembler.js";
const ENGINE_FILE = "src/LogicEngine.js";
//  例外（FIRST verified against the real tree）：
//   · src/debug/**           ⇒ 兩支 debug 頁面各自手組一台引擎（ItemInspector／ItemsUiGallery），釘死直接呼叫數。
//   · src/App.jsx 開機快照    ⇒ 實際沒有任何 configure*／enable* 呼叫（只有 2 處 `new LogicEngine`：開機快照與 Legacy 沙盒 start()，
//                              後者只走 applyRosterToEngine 的能力偵測空操作）——不是例外，改釘「零直接呼叫＋建構數 2」。
//   · src/useGameStore.js 快照 ⇒ 同上：零呼叫、2 處 `new LogicEngine(1).snapshot()`。
//   · enableCombatDebug       ⇒ useLocalServer.js 一處（?diag=1／?shot= 才開；只多輸出觀測欄位），釘死。
const PINNED_DIRECT_CONFIGURE = Object.freeze({ "src/debug/ItemInspector/ItemInspector.jsx": 5, "src/debug/ItemsUiGallery/ItemsUiGallery.jsx": 5 });
const PINNED_DIRECT_ENABLE = Object.freeze({ "src/useLocalServer.js": 1 });
const PINNED_CONSTRUCT = Object.freeze({ [ASSEMBLER]: 1, "src/App.jsx": 2, "src/useGameStore.js": 2, "src/debug/ItemInspector/ItemInspector.jsx": 1, "src/debug/ItemsUiGallery/ItemsUiGallery.jsx": 1 });
const EXPECTED_ASSEMBLE_CALLERS = Object.freeze(["src/platform/challenge/challengeRunner.js", "src/useLocalServer.js"]);

/** @param {Map<string,string>} files @returns {{ violations: string[], table: object }} */
function auditSources(files) {
  const violations = [], table = { configure: {}, enable: {}, construct: {}, assemble: [], assemblerNamed: new Set(), assemblerDirect: 0 };
  for (const [file, text] of files) {
    if (file === ENGINE_FILE) continue;                                  // 方法定義處
    const cfg = scanCode(text, CONFIGURE_METHODS), en = scanCode(text, ENABLE_METHODS);
    if (cfg.direct) table.configure[file] = cfg.direct;
    if (en.direct) table.enable[file] = en.direct;
    if (cfg.constructs) table.construct[file] = cfg.constructs;
    if (cfg.assembleCalls > 0) table.assemble.push(file);
    if (file === ASSEMBLER) { table.assemblerNamed = cfg.named; table.assemblerDirect = cfg.direct; }
    //  1) 唯一組裝器：不得有直接呼叫（它用名稱分派）
    if (file === ASSEMBLER) { if (cfg.direct || en.direct) violations.push(`${file}: 組裝器出現 ${cfg.direct + en.direct} 個直接呼叫（應全走 call()）`); continue; }
    //  2) 其他檔案：configure 名稱根本不該出現（直接、字串名分派都算），除非是釘死的 debug 例外
    const pinned = PINNED_DIRECT_CONFIGURE[file];
    if (pinned === undefined && cfg.namedCount) violations.push(`${file}: 出現 engine configure 名稱 ${cfg.namedCount} 次（${[...cfg.named].join(",")}）`);
    if (pinned !== undefined && (cfg.direct !== pinned || cfg.namedCount !== pinned)) violations.push(`${file}: 釘死 ${pinned} 個 configure 直接呼叫，實際 direct=${cfg.direct}／named=${cfg.namedCount}`);
    //  3) enable*：只有釘死的檔案可以直接呼叫（只數 `.enableX(`；CombatDebugPanel 的 JSX 文字提到 enableCombatDebug() 不是呼叫）
    const pinnedEn = PINNED_DIRECT_ENABLE[file] ?? 0;
    if (en.direct !== pinnedEn) violations.push(`${file}: enable* 直接呼叫釘死 ${pinnedEn}，實際 ${en.direct}`);
    //  4) 引擎建構點
    if ((PINNED_CONSTRUCT[file] ?? 0) !== cfg.constructs) violations.push(`${file}: new LogicEngine 釘死 ${PINNED_CONSTRUCT[file] ?? 0}，實際 ${cfg.constructs}`);
  }
  const asmConstruct = scanCode(files.get(ASSEMBLER) ?? "", CONFIGURE_METHODS).constructs;
  if (asmConstruct !== PINNED_CONSTRUCT[ASSEMBLER]) violations.push(`${ASSEMBLER}: new LogicEngine 釘死 ${PINNED_CONSTRUCT[ASSEMBLER]}，實際 ${asmConstruct}`);
  if (JSON.stringify([...table.assemble].sort()) !== JSON.stringify(EXPECTED_ASSEMBLE_CALLERS)) violations.push(`assembleMatch( 呼叫端應恰為 ${EXPECTED_ASSEMBLE_CALLERS.join("、")}，實際 ${table.assemble.sort().join("、") || "∅"}`);
  return { violations, table };
}
const real = auditSources(SRC_FILES);
ck(`S1 src/** 正式組裝掃描：除唯一組裝器外沒有任何檔案對引擎 configure*（直接或字串名分派）；例外僅 src/debug 兩頁（釘死）；沒有未涵蓋的組裝點（${SRC_FILES.size} 檔）`,
  real.violations.length === 0, real.violations.join(" | "));
ck("S2 組裝器自己：零直接呼叫（全走名稱分派），且引擎每一個 configure* 方法它都認得（推導清單＝組裝器出現的名稱集合）",
  real.table.assemblerDirect === 0 && JSON.stringify([...real.table.assemblerNamed].sort()) === JSON.stringify(CONFIGURE_METHODS),
  `組裝器 ${[...real.table.assemblerNamed].sort().join(",")} vs 引擎 ${CONFIGURE_METHODS.join(",")}`);
ck("S3 逐一核實過的例外（不是預設放行）：src/debug 兩頁各 5 個直接呼叫；App.jsx 與 useGameStore.js 的『開機快照』實際零 configure 呼叫（只剩建構點，另行釘死）；enableCombatDebug 只在 useLocalServer.js 一處",
  JSON.stringify(real.table.configure) === JSON.stringify(Object.fromEntries(Object.entries(PINNED_DIRECT_CONFIGURE).sort()))
  && !("src/App.jsx" in real.table.configure) && !("src/useGameStore.js" in real.table.configure)
  && JSON.stringify(real.table.enable) === JSON.stringify(PINNED_DIRECT_ENABLE)
  && real.table.construct["src/App.jsx"] === 2 && real.table.construct["src/useGameStore.js"] === 2,
  JSON.stringify({ configure: real.table.configure, enable: real.table.enable, construct: real.table.construct }));
ck("S4 assembleMatch( 在 src/ 的呼叫端恰為 Live hook（useLocalServer）與 Challenge runner（challengeRunner）", JSON.stringify([...real.table.assemble].sort()) === JSON.stringify(EXPECTED_ASSEMBLE_CALLERS), real.table.assemble.join(","));
//  工具端：runner 與 challengeRunner 各自零直接呼叫、零自建引擎，且確實走 assembleMatch
{
  const files = ["tools/balance/moba_items_balance_runner.mjs", "src/platform/challenge/challengeRunner.js"];
  const scans = files.map((f) => [f, scanCode(fs.readFileSync(path.join(ROOT, f), "utf8"), ALL_ENGINE_METHODS)]);
  ck("S5 平衡工具 runner 與 challengeRunner：零 .configure*／.enable* 直接呼叫、零字串名分派、零 new LogicEngine，各有恰好 1 個 assembleMatch( 呼叫",
    scans.every(([, s]) => s.direct === 0 && s.namedCount === 0 && s.constructs === 0 && s.assembleCalls === 1), JSON.stringify(scans.map(([f, s]) => [f, s.direct, s.namedCount, s.constructs, s.assembleCalls])));
}
//  控制組：同一個掃描器對「植入的直接呼叫」必須判違規（每一種繞過方式各一條）
{
  const plant = (file, text) => auditSources(new Map([...SRC_FILES, [file, text]])).violations.filter((v) => v.startsWith(`${file}:`));
  ck("S6 控制組（直接呼叫）：植入 src/planted/a.js 內的 `eng.configureMatch({})` ⇒ 判違規", plant("src/planted/a.js", "export const f = (eng) => eng.configureMatch({});").length > 0);
  ck("S6b 控制組（可選鏈）：`eng?.configureItems(x)` ⇒ 判違規", plant("src/planted/b.js", "export const f = (eng) => eng?.configureItems(1);").length > 0);
  ck("S6c 控制組（字串名分派）：`eng[\"configureHeroes\"](x)` ⇒ 判違規（只找 `.name(` 的掃描器抓不到這個）", plant("src/planted/c.js", "export const f = (eng) => eng[\"configureHeroes\"](1);").length > 0);
  ck("S6d 控制組（自建引擎）：`new LogicEngine(1)` 出現在未釘死的檔案 ⇒ 判違規", plant("src/planted/d.js", "import { LogicEngine } from '../LogicEngine.js'; export const e = new LogicEngine(1);").length > 0);
  ck("S6e 控制組（enable*）：`eng.enableCombatDebug(true)` 出現在未釘死的檔案 ⇒ 判違規", plant("src/planted/e.js", "export const f = (eng) => eng.enableCombatDebug(true);").length > 0);
  ck("S6f 控制組（第二個 assembleMatch 呼叫端）：`assembleMatch(setup, deps)` 出現在新檔案 ⇒ 判違規", auditSources(new Map([...SRC_FILES, ["src/planted/f.js", "export const f = (s, d) => assembleMatch(s, d);"]])).violations.some((v) => v.startsWith("assembleMatch(")));
  const brokenAsm = new Map(SRC_FILES).set(ASSEMBLER, SRC_FILES.get(ASSEMBLER) + "\nexport const oops = (engine) => engine.configureMatch({});\n");
  ck("S6g 控制組（組裝器內出現直接呼叫）：在組裝器尾端加一行 `engine.configureMatch({})` ⇒ 判違規", auditSources(brokenAsm).violations.some((v) => v.startsWith(`${ASSEMBLER}:`)));
  const dbg = new Map(SRC_FILES).set("src/debug/ItemInspector/ItemInspector.jsx", SRC_FILES.get("src/debug/ItemInspector/ItemInspector.jsx") + "\nexport const more = (e) => e.configureItems(null);\n");
  ck("S6h 控制組（釘死的 debug 例外多一個呼叫）：ItemInspector 多一行 `e.configureItems(null)` ⇒ 判違規（數量釘死，不是整個目錄放行）", auditSources(dbg).violations.some((v) => v.startsWith("src/debug/ItemInspector")));
  ck("S6i 控制組（註解不算）：註解與區塊註解裡的 `eng.configureMatch(` ⇒ 不判違規", plant("src/planted/g.js", "// eng.configureMatch({})\n/* eng.configureItems(1) */\nexport const x = 1;").length === 0);
}

// ════ V：語意清單與版本（v21 是未發布候選）═════════════════════════════════════════════
{
  const pinnedV1toV20 = SV.KNOWN_SIMULATION_VERSIONS.filter((v) => /^moba-sim\.v(\d+)$/.test(v) && Number(v.slice(10)) <= 20);
  ck("V1 v1–v20 共 20 個版本都在已知清單，且 v20 指紋仍是已發布的 050b3f66620f0f57",
    pinnedV1toV20.length === 20 && SV.SIMULATION_SEMANTICS_FINGERPRINTS["moba-sim.v20"] === "050b3f66620f0f57");
  //  v1–v20 整張指紋表的雜湊（任何一格被改都會變）。值是 T7 開始前從 HEAD e1557f3 的 simulationVersion.js 量到的。
  const table = pinnedV1toV20.map((v) => `${v}=${SV.SIMULATION_SEMANTICS_FINGERPRINTS[v]}`).join(";");
  ck("V2 v1–v20 指紋表逐格不變（整表雜湊釘死；只有 moba-sim.v21 候選可以重新登記）", stableHash(table) === V1_TO_V20_TABLE_HASH, `${stableHash(table)} vs ${V1_TO_V20_TABLE_HASH}`);
  ck("V3 目前版本是 moba-sim.v21（未發布候選）；v21 有指紋；v20 未被回收（仍在已知清單）",
    SV.MOBA_SIMULATION_VERSION === "moba-sim.v21" && /^[0-9a-f]{16}$/.test(SV.SIMULATION_SEMANTICS_FINGERPRINTS["moba-sim.v21"] ?? "") && SV.KNOWN_SIMULATION_VERSIONS.includes("moba-sim.v20"));
  //  組裝路徑上的模組：改它們可能改變同一份 setup 的結果 ⇒ 必須在語意清單。
  //  規則：組裝入口模組的每一條相對 import ⊆ 清單 ∪ 明列的例外（每個例外附理由，且必須真的被 import——不留死例外）。
  const ENTRY = ["src/battle/moba/matchAssembler.js", "src/battle/moba/matchAssemblerDepsCore.js", "src/battle/moba/matchAssemblerDeps.js", "src/battle/moba/liveMatchSetup.js",
    "src/platform/challenge/challengeMatchSetup.js", "src/platform/contracts/matchSetup.js", "src/platform/contracts/matchRuleset.js"];
  const EXEMPT = {
    "src/platform/contracts/simulationVersion.js": "版本常數本身（deps manifest 讀 MOBA_SIMULATION_VERSION 當標籤）；列入會讓每次重新登記自我指涉",
    "src/platform/contracts/squadSnapshot.js": "stableStringify／stableHash／SNAPSHOT_SEATS：身分雜湊與座位名常數，不決定引擎算出什麼",
    "src/data/heroDatabase.js": "英雄資料表（已列在 KNOWN_TRANSITIVE_GAPS，刻意不收進指紋）",
  };
  const importsOf = (file) => {
    const code = stripComments(fs.readFileSync(path.join(ROOT, file), "utf8"));
    return [...code.matchAll(/\b(?:import|export)\s[^;]*?\bfrom\s*["'](\.[^"']+)["']/g)].map((m) => rel(path.resolve(path.dirname(path.join(ROOT, file)), m[1])));
  };
  const reached = new Map();
  for (const e of ENTRY) for (const i of importsOf(e)) (reached.get(i) ?? reached.set(i, []).get(i)).push(path.basename(e));
  const inList = (f) => SV.SIMULATION_SEMANTICS_FILES.includes(f);
  const missing = [...reached.keys()].filter((f) => !inList(f) && !(f in EXEMPT) && !ENTRY.includes(f));
  ck(`V4 組裝入口模組（${ENTRY.length} 支）的每一條相對 import（${reached.size} 個模組）都在 SIMULATION_SEMANTICS_FILES，或是有理由的例外`,
    missing.length === 0, missing.map((f) => `${f}（被 ${reached.get(f).join("、")} import）`).join(" | "));
  ck("V4b 入口模組自己都在清單（matchAssembler／DepsCore／Deps／liveMatchSetup／challengeMatchSetup／matchSetup／matchRuleset）", ENTRY.every(inList), ENTRY.filter((f) => !inList(f)).join(","));
  ck("V4c 例外沒有死項：每個例外都真的被入口模組 import；heroDatabase 確實在 KNOWN_TRANSITIVE_GAPS", Object.keys(EXEMPT).every((f) => reached.has(f)) && SV.KNOWN_TRANSITIVE_GAPS.includes("src/data/heroDatabase.js"),
    Object.keys(EXEMPT).filter((f) => !reached.has(f)).join(","));
  //  Phase 3a T7 明列：這幾支在 Task 7 之前不在清單，但改了它們就會改變 Live／Challenge／runner 的引擎輸入
  const T7_ADDED = ["src/battle/moba/items/itemsEngineAdapter.js", "src/battle/moba/items/buildStrategyPrep.js", "src/battle/moba/items/buildPolicy.js", "src/battle/moba/mobaRosterAdapter.js",
    "src/battle/moba/liveMatchSetup.js", "src/battle/moba/matchAssemblerDeps.js", "src/platform/contracts/matchSetup.js"];
  ck("V5 Task 7 補進清單的 7 支（items 引擎 adapter／出裝策略準備／出裝策略詞彙、名單 adapter、Live builder、Live deps、MatchSetup 契約）", T7_ADDED.every(inList), T7_ADDED.filter((f) => !inList(f)).join(","));
  ck("V6 清單沒有重複項、沒有呈現層（heroImages／render／screens）；每支都存在", new Set(SV.SIMULATION_SEMANTICS_FILES).size === SV.SIMULATION_SEMANTICS_FILES.length
    && !SV.SIMULATION_SEMANTICS_FILES.some((f) => /heroImages|\/render\/|\/screens\/|\.jsx$/.test(f)) && SV.SIMULATION_SEMANTICS_FILES.every((f) => fs.existsSync(path.join(ROOT, f))));
}

console.log(`\nMatch Setup 3a：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
process.exit(fail ? 1 : 0);
