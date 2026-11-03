#!/usr/bin/env node
// ============================================================================
//  tools/check_challenge_setup_3a.mjs — Phase 3a Task 5：Challenge runner 改走唯一組裝器的 parity gate
//
//  執行：node tools/check_challenge_setup_3a.mjs            （12 場 Challenge golden，真的呼叫 runChallenge）
//        node tools/check_challenge_setup_3a.mjs --only=a,b （只跑指定 golden case）
//
//  與 check_match_assembler_3a 的差別：那支「自己從 golden 輸入編一份 setup 再丟組裝器」；這支呼叫的是
//  **正式的 runChallenge**（含它的護欄、setup builder、deps 取得、tick 迴圈、結果建構），所以抓得到
//  runner 這一層的錯（旗標判斷、席位映射、deps 來源），而不只是組裝器本身。
//
//  核心斷言（12 個 golden case 各一次，探針與 capture_match_golden_v20.mjs 相同）：
//   (a) 引擎上實際發生的 configure*／enable* 呼叫順序與每次引數的雜湊 ＝ golden `calls`
//   (b) 整場 digest 與 streamHash（每 20 tick 取樣）＝ golden
//   (c) ChallengeResult 摘要欄位 ＝ golden，回傳形狀（鍵集合與順序）不變（全文雜湊含版號，v21 候選上不可比）
//  另外：無 draft ⇒ 英雄層沒組；被拒絕的輸入 ⇒ 錯誤結果而不是例外；import 圖不比 v20 差；
//        runner 原始碼不再自己 new LogicEngine／呼叫 configure*，deps 只從共用 builder 取。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runChallenge, CHALLENGE_DT, CHALLENGE_MAX_T } from "../src/platform/challenge/challengeRunner.js";
import { LogicEngine } from "../src/LogicEngine.js";
import { heroById } from "../src/data/heroDatabase.js";
import { stableStringify, stableHash, snapshotHashOf, SNAPSHOT_INPUTS, snapshotCovers } from "../src/platform/contracts/squadSnapshot.js";
import { createChallengeInstance } from "../src/platform/contracts/challengeInstance.js";
import { SNAPSHOT_AUTHORITY } from "../src/platform/challenge/snapshotAuthority.js";
import { matchSetupHash, createMatchSetup } from "../src/platform/contracts/matchSetup.js";
import { assembleMatch } from "../src/battle/moba/matchAssembler.js";
import { toEnginePlayerMods } from "../src/battle/moba/mobaPlayerStats.js";
import { createStreamHasher, finalDigest } from "./lib/matchGolden.mjs";
import { challengeGoldenInputs, challengeBuilderArgs } from "./lib/challengeGolden.mjs";
import { mobaTacticById, toEngineTactic, toEngineTacticIdentity, MOBA_TACTIC_VERSION } from "../src/platform/contracts/MobaTacticConfig.js";
import { sideInputs } from "../src/platform/challenge/challengeMatchSetup.js";
import { stripComments } from "./lib/stripComments.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argOf = (name) => { const hit = process.argv.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : null; };
const ONLY = argOf("only") ? new Set(argOf("only").split(",")) : null;

let pass = 0, fail = 0;
const ck = (l, ok, n = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}${n ? `　${n}` : ""}`); };
const src = (rel) => stripComments(fs.readFileSync(path.join(ROOT, rel), "utf8"));
const tryImport = async (rel) => { try { return await import(new URL(`../${rel}`, import.meta.url)); } catch { return null; } };

const golden = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/fixtures/match_golden_v20.json"), "utf8"));
const cases = golden.cases.filter((c) => c.path === "challenge" && (!ONLY || ONLY.has(c.id)));

// ── 探針：與 capture_match_golden_v20.mjs 相同（prototype 上的 pass-through 包裝；tick 後取樣串流雜湊）──────────
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
/** 真的呼叫 runChallenge；回傳結果、探針紀錄與（若有）例外。 */
function runProbed(v, over = {}) {
  const ctx = { calls: [], engine: null, hasher: createStreamHasher(golden.streamEvery) };
  PROBE.ctx = ctx;
  let out = null, thrown = null;
  try {
    out = runChallenge({ challenge: v.challenge, challengerSnapshot: v.challenger, defenderSnapshot: v.defender, draftResult: v.draftResult, heroOf: heroById, ...over });
  } catch (e) { thrown = e; } finally { PROBE.ctx = null; }
  return { out, thrown, ctx };
}
const firstDiff = (got, want) => {
  const n = Math.max(got.length, want.length);
  for (let i = 0; i < n; i++) if (got[i]?.m !== want[i]?.m || got[i]?.h !== want[i]?.h) return `#${i}: got ${got[i] ? `${got[i].m}/${got[i].h}` : "∅"} want ${want[i] ? `${want[i].m}/${want[i].h}` : "∅"}`;
  return "";
};
//  draftHash 不比：DraftResult 綁兩份快照雜湊，快照雜湊含 simulationVersion（golden=v20，這裡=v21）⇒ 必然不同；
//  只確認「有 draft ⇔ 有 draftHash」。其餘摘要欄位逐字比對。
const brief = (r) => ({ outcome: r.outcome, durationSec: r.durationSec, score: r.score, matchSeed: r.matchSeed, usedInputs: r.usedInputs });
const goldenBrief = (r) => { const { draftHash: _d, ...rest } = r; return rest; };

// ── 新模組（動態載入：實作前也能跑到下面的結構斷言並如實變紅）──────────────────────────────
const SETUP_REL = "src/platform/challenge/challengeMatchSetup.js";
const CORE_REL = "src/battle/moba/matchAssemblerDepsCore.js";
const BUILDER = await tryImport(SETUP_REL);
const CORE = await tryImport(CORE_REL);
const SHARED = await tryImport("src/battle/moba/matchAssemblerDeps.js");

// ── G：12 個 golden case，走真實 runChallenge ─────────────────────────────────────────────
const t0 = Date.now();
const summary = [0, 0];
const INPUTS = new Map();
for (const [n, c] of cases.entries()) {
  const v = challengeGoldenInputs(c);
  INPUTS.set(c.id, v);
  const { out, thrown, ctx } = runProbed(v);
  if (thrown || !out?.ok) { ck(`G ${c.id} runChallenge ok`, false, thrown ? String(thrown) : JSON.stringify(out?.errors)); summary[1]++; continue; }
  const diff = firstDiff(ctx.calls, c.calls);
  ck(`G ${c.id} (a) configure 序列與引數雜湊＝golden（${c.calls.length} 呼叫）`, diff === "", diff);
  const digest = finalDigest(ctx.engine);
  const same = digest === c.digest && ctx.hasher.hex === c.streamHash;
  ck(`G ${c.id} (b) digest＋streamHash＝golden`, same, same ? digest : `got ${digest}/${ctx.hasher.hex} want ${c.digest}/${c.streamHash}`);
  //  ⚠ 不比 ChallengeResult 全文雜湊：golden 錄在 moba-sim.v20，result.simulationVersion／challengeId 帶版號，
  //    v21 候選上必然不同（與模擬無關）。改比「摘要欄位＝golden」＋「欄位集合與順序不變」（sameChallengeResult 是 JSON 逐字比對）。
  const KEYS = ["schema", "challengeId", "simulationVersion", "matchSeed", "tacticExec", "outcome", "finished", "durationSec", "score", "draft", "usedInputs"];
  const rb = JSON.stringify(brief(out.result)) === JSON.stringify(goldenBrief(c.result)) && (out.result.draft?.hash != null) === c.params.draft && (c.result.draftHash != null) === c.params.draft;
  const shapeOk = JSON.stringify(Object.keys(out.result)) === JSON.stringify(KEYS) && out.result.schema === "ChallengeResult.v1" && out.ok === true && Array.isArray(out.errors) && out.errors.length === 0
    && JSON.stringify(Object.keys(out)) === JSON.stringify(["ok", "errors", "result"]);
  ck(`G ${c.id} (c) ChallengeResult 摘要欄位＝golden；回傳形狀（鍵集合與順序）不變`, rb && shapeOk, rb ? "" : JSON.stringify(brief(out.result)));
  summary[diff === "" && same && rb && shapeOk ? 0 : 1]++;
  process.stderr.write(`  ${n + 1}/${cases.length} ${c.id} ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);
}
console.log(`  逐位元重現（經真實 runChallenge）：${summary[0]}/${summary[0] + summary[1]}`);

// ── N：沒有 draft ⇒ 英雄層沒組 ─────────────────────────────────────────────────────────
{
  const nd = cases.filter((c) => !c.params.draft);
  const dr = cases.filter((c) => c.params.draft);
  const HERO_CALLS = ["configureHeroes", "configureArchetypes", "configureSpells", "configureHeroSkills", "configureHeroPassives", "configureHeroPowerCurve", "configureItems", "configureObjectiveLayout"];
  for (const c of nd) {
    const { ctx } = runProbed(INPUTS.get(c.id));
    const e = ctx.engine;
    ck(`N ${c.id} 無 draft：只有 configurePlayers → configureMatch；英雄層旗標全關（heroesOn／archOn／spellsOn）`,
      JSON.stringify(ctx.calls.map((x) => x.m)) === JSON.stringify(["configurePlayers", "configureMatch"]) && !ctx.calls.some((x) => HERO_CALLS.includes(x.m))
      && !e.heroesOn && !e.archOn && !e.spellsOn);
  }
  for (const c of dr.slice(0, 1)) {
    const { ctx } = runProbed(INPUTS.get(c.id));
    ck(`N ${c.id} 有 draft：英雄三層都組了，技能／被動／曲線／出裝／地圖版面一律沒有（challenge.v20 沒有這些層）`,
      ctx.engine.heroesOn === true && ctx.engine.archOn === true && ctx.engine.spellsOn === true
      && !ctx.calls.some((x) => ["configureHeroSkills", "configureHeroPassives", "configureHeroPowerCurve", "configureItems", "configureObjectiveLayout"].includes(x.m)));
  }
  ck("N builder 匯出且 effectiveLayers：無 draft ⇒ heroMods／archetypes／spells／heroSkills 全 false、roster 為 null；有 draft ⇒ 三層 true",
    (() => {
      if (!BUILDER?.buildChallengeMatchSetup) return false;
      const lay = (c) => {
        const v = INPUTS.get(c.id);
        const r = BUILDER.buildChallengeMatchSetup(builderArgs(v, !!v.draftResult));
        return r.ok ? r.setup : null;
      };
      const a = nd[0] && lay(nd[0]), b = dr[0] && lay(dr[0]);
      return !!a && !!b && a.roster === null && !a.effectiveLayers.heroMods && !a.effectiveLayers.archetypes && !a.effectiveLayers.spells
        && !a.effectiveLayers.heroSkills && !a.effectiveLayers.layoutConfigured && a.effectiveLayers.match && a.effectiveLayers.players.blue && a.effectiveLayers.players.red
        && b.effectiveLayers.heroMods && b.effectiveLayers.archetypes && b.effectiveLayers.spells && !b.effectiveLayers.heroSkills && !b.effectiveLayers.items
        && a.rulesetId === "challenge.v20" && b.rulesetId === "challenge.v20";
    })());
}
/** builder 的入參（與 runner 的內部決定相同：宣告了才組）。Phase 3a T7：抽到 tools/lib/challengeGolden.mjs 與 check_match_setup_3a 共用。 */
function builderArgs(v, withDraft) { return challengeBuilderArgs(v, withDraft); }

// ── B：builder 本身的性質 ────────────────────────────────────────────────────────────────
{
  const c = cases.find((x) => x.params.draft) ?? cases[0];
  const v = c && INPUTS.get(c.id);
  const mk = () => BUILDER?.buildChallengeMatchSetup?.(builderArgs(v, !!v.draftResult));
  const a = c && mk(), b = c && mk();
  const deepFrozen = (o) => !o || typeof o !== "object" || (Object.isFrozen(o) && Object.values(o).every(deepFrozen));
  ck("B1 builder 是純函式：同輸入 ⇒ 同 setup 雜湊；setup 深度凍結；規則集＝challenge.v20；seed 原樣（凍結的 matchSeed，不正規化）",
    !!a?.ok && !!b?.ok && matchSetupHash(a.setup) === matchSetupHash(b.setup) && deepFrozen(a.setup)
    && a.setup.rulesetId === "challenge.v20" && a.setup.seed === v.challenge.matchSeed && a.setup.meta.seedSource === "challenge" && a.setup.meta.mode === "challenge"
    && a.setup.meta.opponentId === v.keyB);
  const code = BUILDER ? src(SETUP_REL) : "";
  ck("B2 builder 原始碼（剝註解）：不 import 英雄庫／LogicEngine／Store、不讀時鐘／亂數／window",
    BUILDER !== null && !/data\/heroDatabase|data\/heroImages|LogicEngine|profileStore|zustand|localStorage|Date\.now|Math\.random|window\b|import\.meta/.test(code));
}

// ── R：被拒絕的輸入 ⇒ 錯誤結果，不丟例外 ─────────────────────────────────────────────────
{
  const d = cases.find((x) => x.params.draft);
  const v = d && INPUTS.get(d.id);
  const shape = (o) => o && o.ok === false && o.result === null && Array.isArray(o.errors) && o.errors.length > 0 && o.errors.every((e) => typeof e.code === "string" && typeof e.message === "string");
  const firstHero = v && Object.values(v.draftResult.assignment)[0];
  const rUnknown = v && runProbed(v, { heroOf: (id) => (id === firstHero ? null : heroById(id)) });
  ck("R1 draft 席位英雄查表查不到 ⇒ { ok:false, result:null, errors:[{ code, message }] }；沒丟例外、沒建引擎、零 configure 呼叫",
    !!rUnknown && rUnknown.thrown === null && shape(rUnknown.out) && rUnknown.ctx.calls.length === 0 && rUnknown.ctx.engine === null
    && rUnknown.out.errors.some((e) => /hero_unknown/.test(e.code)), JSON.stringify(rUnknown?.out?.errors ?? String(rUnknown?.thrown)));
  const rBoom = v && runProbed(v, { heroOf: () => { throw new Error("boom"); } });
  ck("R2 查表丟例外 ⇒ 也轉成錯誤結果（assembly_exception），不外洩例外",
    !!rBoom && rBoom.thrown === null && shape(rBoom.out) && rBoom.out.errors[0].code === "assembly_exception" && /boom/.test(rBoom.out.errors[0].message), JSON.stringify(rBoom?.out?.errors ?? String(rBoom?.thrown)));
  //  快照沒宣告 playerStats（v20：兩份快照都宣告才 configurePlayers，否則整個略過，照跑）。
  //  規則集不替快照決定要不要素質 ⇒ 兩邊 slots 一起為 null，effectiveLayers.players 兩邊 false，組裝器略過 configurePlayers。
  //  對照組：把 v20 runChallenge 的引擎組裝段（8a543dd :125-163，無 draft 分支）原樣內嵌在這裡，同輸入各跑一次，逐位元比對。
  const nd = cases.find((x) => !x.params.draft);
  const vn = nd && INPUTS.get(nd.id);
  const drop = (s) => { const t = { ...s, capturedInputs: s.capturedInputs.filter((x) => x !== SNAPSHOT_INPUTS.playerStats) }; t.hash = snapshotHashOf(t); return t; };
  const v20Reference = (v) => {   // v20 challengeRunner 無 draft 時的組裝（useStats=false）：只有 loadout＋configureMatch
    const blue = sideInputs(v.challenger, "blue"), red = sideInputs(v.defender, "red");
    const bt = mobaTacticById(v.challenge.challengerTacticId), rt = mobaTacticById(v.challenge.defenderTacticId);
    const ctx = { calls: [], engine: null, hasher: createStreamHasher(golden.streamEvery) };
    PROBE.ctx = ctx;
    try {
      const eng = new LogicEngine(v.challenge.matchSeed, { ...blue.loadout, ...red.loadout });
      eng.configureMatch({ blue: toEngineTactic(bt), red: toEngineTactic(rt), identity: { blue: toEngineTacticIdentity(bt), red: toEngineTacticIdentity(rt) },
        meta: { tacticId: bt.tacticId, tacticName: bt.name, version: MOBA_TACTIC_VERSION, opponentTacticId: rt.tacticId } });
      for (let t = CHALLENGE_DT; t <= CHALLENGE_MAX_T && !eng.over; t += CHALLENGE_DT) eng.tick(CHALLENGE_DT);
    } finally { PROBE.ctx = null; }
    return ctx;
  };
  const mkNoStats = (dropA, dropD, nonce) => {
    const a2 = dropA ? drop(vn.challenger) : vn.challenger, d2 = dropD ? drop(vn.defender) : vn.defender;
    const inst = createChallengeInstance({ challenger: a2, defender: d2, challengerTacticId: nd.params.tacticIds[0], seedSource: nd.params.seed, createdAt: 1757000000000,
      issuedBy: SNAPSHOT_AUTHORITY.id, nonce, opponentKey: vn.keyB });
    return inst.ok ? { ...vn, challenger: a2, defender: d2, challenge: inst.challenge } : null;
  };
  for (const [label, dA, dD] of [["雙方都沒宣告", true, true], ["只有挑戰方沒宣告（v20：兩份都要宣告，否則整個略過）", true, false]]) {
    const vv = nd && mkNoStats(dA, dD, `t5-nostats-${dA}${dD}`);
    const rr = vv && runProbed(vv), ref = vv && v20Reference(vv);
    const same = !!rr && !!ref && rr.thrown === null && rr.out?.ok === true && finalDigest(rr.ctx.engine) === finalDigest(ref.engine) && rr.ctx.hasher.hex === ref.hasher.hex
      && firstDiff(rr.ctx.calls, ref.calls) === "";
    ck(`R3 ${label}playerStats ⇒ 照跑出結果，呼叫序列沒有 configurePlayers，且與 v20 組裝段逐位元相同（呼叫序列＋引數雜湊、digest、streamHash）`,
      same && !rr.ctx.calls.some((x) => x.m === "configurePlayers") && !rr.out.result.usedInputs.includes(SNAPSHOT_INPUTS.playerStats),
      rr?.out?.errors ? JSON.stringify(rr.out.errors) : rr ? rr.ctx.calls.map((x) => x.m).join(">") : "no instance");
  }
  ck("R3b builder 層：use.stats 為否 ⇒ setup.playerSlots＝null、effectiveLayers.players 兩邊 false、仍有 match",
    (() => { if (!BUILDER?.buildChallengeMatchSetup || !vn) return false; const r = BUILDER.buildChallengeMatchSetup({ ...builderArgs(vn, false), use: { loadout: true, stats: false, tactic: true } });
      return r.ok && r.setup.playerSlots === null && !r.setup.effectiveLayers.players.blue && !r.setup.effectiveLayers.players.red && r.setup.effectiveLayers.match; })());
  //  ── 沒有宣告戰術（Phase 3a T9 fix 3）：v20 的 `useTactic` 為假 ⇒ 整段 configureMatch 略過、照跑 ──────────────────────
  //  (1) 真實 runChallenge：兩份快照都沒宣告 tactic ⇒ 與 v20 組裝段（只有 loadout＋configurePlayers，沒有 configureMatch）逐位元相同。
  const dropTactic = (s) => { const t = { ...s, capturedInputs: s.capturedInputs.filter((x) => x !== SNAPSHOT_INPUTS.tactic) }; t.hash = snapshotHashOf(t); return t; };
  const v20NoTactic = (v) => {   // v20 challengeRunner：useStats ⇒ configurePlayers，useTactic 假 ⇒ 沒有 configureMatch
    const blue = sideInputs(v.challenger, "blue"), red = sideInputs(v.defender, "red");
    const ctx = { calls: [], engine: null, hasher: createStreamHasher(golden.streamEvery) };
    PROBE.ctx = ctx;
    try {
      const eng = new LogicEngine(v.challenge.matchSeed, { ...blue.loadout, ...red.loadout });
      const mods = toEnginePlayerMods({ blue: blue.slots, red: red.slots });
      if (mods) eng.configurePlayers(mods);
      for (let t = CHALLENGE_DT; t <= CHALLENGE_MAX_T && !eng.over; t += CHALLENGE_DT) eng.tick(CHALLENGE_DT);
    } finally { PROBE.ctx = null; }
    return ctx;
  };
  {
    const a2 = nd && dropTactic(vn.challenger), d2 = nd && dropTactic(vn.defender);
    const inst = nd && createChallengeInstance({ challenger: a2, defender: d2, challengerTacticId: nd.params.tacticIds[0], seedSource: nd.params.seed, createdAt: 1757000000000,
      issuedBy: SNAPSHOT_AUTHORITY.id, nonce: "t9-notactic", opponentKey: vn.keyB });
    const vt = inst?.ok ? { ...vn, challenger: a2, defender: d2, challenge: inst.challenge } : null;
    const rr = vt && runProbed(vt), ref = vt && v20NoTactic(vt);
    ck("R5 兩份快照都沒宣告 tactic（真實 runChallenge）⇒ 照跑出結果；呼叫序列沒有 configureMatch；與 v20 組裝段逐位元相同（呼叫序列＋引數雜湊、digest、streamHash）",
      !!rr && !!ref && rr.thrown === null && rr.out?.ok === true && !rr.ctx.calls.some((x) => x.m === "configureMatch") && rr.ctx.calls.length >= 1
      && firstDiff(rr.ctx.calls, ref.calls) === "" && finalDigest(rr.ctx.engine) === finalDigest(ref.engine) && rr.ctx.hasher.hex === ref.hasher.hex,
      rr ? (rr.out?.errors ? JSON.stringify(rr.out.errors) : rr.ctx.calls.map((x) => x.m).join(">")) : "no instance");
  }
  //  (2) 有 draft 的案：use.tactic 為否 ⇒ setup.tactic 為 null（建構後 {blue:null,red:null}）；組裝器的呼叫序列＝v20 golden 的序列去掉 configureMatch
  //      （v20 順序 players→match→heroes→archetypes→spells，沒有戰術時剩 players→heroes→archetypes→spells）。
  {
    const dc = cases.find((x) => x.params.draft), vd = dc && INPUTS.get(dc.id);
    const args = vd && { ...builderArgs(vd, true), use: { ...builderArgs(vd, true).use, tactic: false } };
    const built = args && BUILDER?.buildChallengeMatchSetup?.(args);
    const base = built?.ok ? built.setup : null;
    const asInput = (tactic) => { const { schema: _s, effectiveLayers: _e, ...rest } = JSON.parse(JSON.stringify(base)); return { ...rest, tactic }; };
    const deps = CORE?.buildMatchAssemblerDepsFrom?.({ heroLookup: heroById, heroLookupLabel: BUILDER?.CHALLENGE_HERO_LOOKUP_LABEL });
    const run = (setup) => { const ctx = { calls: [], engine: null, hasher: createStreamHasher(golden.streamEvery) }; PROBE.ctx = ctx; let r; try { r = assembleMatch(setup, deps); } finally { PROBE.ctx = null; } return { r, ctx }; };
    const want = dc ? dc.calls.filter((x) => x.m !== "configureMatch") : [];
    const variants = base ? [["tactic = null", null], ["tactic = { blue: null, red: null }", { blue: null, red: null }]].map(([label, t]) => {
      const s = createMatchSetup(asInput(t)); const x = s.ok ? run(s.setup) : null; return { label, s, x };
    }) : [];
    ck("R6 challenge.v20 沒有宣告戰術（setup.tactic＝null，以及 { blue:null, red:null }）經真實組裝器 ⇒ 組裝成功、effectiveLayers.match 為假、呼叫序列＝v20 golden 去掉 configureMatch（players→heroes→archetypes→spells，引數雜湊逐筆相同）、沒有任何 configureMatch",
      variants.length === 2 && variants.every(({ s, x }) => s.ok && x?.r.ok && !s.setup.effectiveLayers.match && s.setup.tactic.blue === null && s.setup.tactic.red === null
        && !x.ctx.calls.some((c) => c.m === "configureMatch") && JSON.stringify(x.ctx.calls.map((c) => c.m)) === JSON.stringify(["configurePlayers", "configureHeroes", "configureArchetypes", "configureSpells"])
        && firstDiff(x.ctx.calls, want) === "")
      && matchSetupHash(variants[0].s.setup) === matchSetupHash(variants[1].s.setup) && matchSetupHash(variants[0].s.setup) === matchSetupHash(base),
      variants.map(({ label, s, x }) => `${label}: ${s.ok ? (x?.r.ok ? x.ctx.calls.map((c) => c.m).join(">") : JSON.stringify(x?.r.errors)) : JSON.stringify(s.errors)}`).join(" | "));
    ck("R6b 對照組：同一個案帶戰術時（golden 原樣）的序列確實含 configureMatch（所以 R6 的「去掉」是有意義的）", !!dc && dc.calls.some((x) => x.m === "configureMatch") && want.length === dc.calls.length - 1);
  }
  //  既有護欄原樣保留（錯誤碼與先後順序）：查不到戰術 ⇒ code "tactic"（在 setup 之前判定）
  const badTac = vn && runProbed({ ...vn, challenge: { ...vn.challenge, challengerTacticId: "no_such_tactic" } });
  ck("R4 既有護欄不變：戰術查不到 ⇒ 仍是舊的 replay／tactic 錯誤碼（不被 setup 錯誤蓋掉）",
    !!badTac && badTac.thrown === null && shape(badTac.out) && ["replay", "tactic"].includes(badTac.out.errors[0].code), JSON.stringify(badTac?.out?.errors));
}

// ── D：deps 的單一來源 ─────────────────────────────────────────────────────────────────
{
  const shared = SHARED?.sharedMatchAssemblerDeps?.();
  const mine = CORE?.buildMatchAssemblerDepsFrom?.({ heroLookup: heroById, heroLookupLabel: BUILDER?.CHALLENGE_HERO_LOOKUP_LABEL });
  const J = JSON.stringify;
  ck("D1 Challenge 與 Live 的 deps 共用同一份 adapter 契約：manifest.adapters／archetypeContract／engine／schema 完全相同（只有 heroLookup 的標籤不同）",
    !!shared && !!mine && J(shared.manifest.adapters) === J(mine.manifest.adapters) && shared.manifest.archetypeContract === mine.manifest.archetypeContract
    && J(shared.manifest.engine) === J(mine.manifest.engine) && shared.manifest.schema === mine.manifest.schema && shared.manifest.heroLookup !== mine.manifest.heroLookup,
    mine ? J(mine.manifest.heroLookup) : "no core");
  ck("D2 共用 builder 與 core 同源：matchAssemblerDeps.js 的 buildMatchAssemblerDeps() 指紋＝core 以 heroById 正式標籤建出的指紋（沒有第二份 adapter 清單）",
    !!SHARED && !!CORE && (() => {
      const a = SHARED.buildMatchAssemblerDeps().manifest, b = CORE.buildMatchAssemblerDepsFrom({ heroLookup: heroById, heroLookupLabel: a.heroLookup }).manifest;
      return J(a) === J(b);
    })());
  ck("D3 core 只有一份 adapter 清單；matchAssemblerDeps.js 不再自己 import 任何 adapter 模組",
    CORE !== null && /toEngineHeroSkills/.test(src(CORE_REL)) && !/heroSkillGameplay|heroBattleTalents|heroCombatArchetypes/.test(src("src/battle/moba/matchAssemblerDeps.js")));
}

// ── I：import 圖不比 v20 差（ruling 3）─────────────────────────────────────────────────
function importGraph(entry) {
  const seen = new Map(), stack = [[path.resolve(ROOT, entry), null]];
  while (stack.length) {
    const [p, from] = stack.pop();
    if (seen.has(p)) continue;
    seen.set(p, from);
    if (!fs.existsSync(p)) continue;
    const text = stripComments(fs.readFileSync(p, "utf8"));
    for (const m of text.matchAll(/\b(?:import|export)\s[^;]*?\bfrom\s*["']([^"']+)["']|\bimport\s*\(?\s*["']([^"']+)["']/g)) {
      const spec = m[1] ?? m[2];
      if (spec.startsWith(".")) stack.push([path.resolve(path.dirname(p), spec), p]);
    }
  }
  return seen;
}
{
  const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");
  const baseline = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/fixtures/challenge_runner_graph_v20.json"), "utf8"));
  const after = new Set([...importGraph("src/platform/challenge/challengeRunner.js").keys()].map(rel));
  const before = new Set(baseline.modules);
  const HEAVY = (m) => /^src\/data\/(heroDatabase|heroImages)\.js$/.test(m);
  const added = [...after].filter((m) => !before.has(m)).sort();
  ck("I1 walker 有檢定力：v20 基準圖（8a543dd）含 heroDatabase.js／heroImages.js（正對照：重型模組本來就可達，只是 runner 原文沒寫出名字）",
    [...before].filter(HEAVY).length === 2);
  //  「重型」＝單檔 > 100KB（目前只有 heroDatabase.js 396KB 與 heroImages.js 的 data URI；判準看大小，不看名字）
  const sizeOf = (m) => { try { return fs.statSync(path.join(ROOT, m)).size; } catch { return 0; } };
  const heavyAfter = [...after].filter((m) => sizeOf(m) > 100_000), heavyBefore = [...before].filter((m) => sizeOf(m) > 100_000);
  ck("I2 重型模組（單檔 > 100KB）的可達集合不比 v20 大：沒有任何新的重型模組進圖（新增的模組都是輕量邏輯檔）",
    heavyAfter.every((m) => heavyBefore.includes(m)) && heavyBefore.length >= 2 && added.every((m) => sizeOf(m) < 100_000),
    `重型 ${heavyBefore.length} → ${heavyAfter.length}；新增 ${added.length} 個模組（共 ${added.reduce((n, m) => n + sizeOf(m), 0)} bytes）：${added.join(", ")}`);
  const runner = src("src/platform/challenge/challengeRunner.js");
  const builderSrc = BUILDER ? src(SETUP_REL) : "";
  const coreSrc = CORE ? src(CORE_REL) : "x heroDatabase.js";
  const directHeavy = (text) => /from\s*["'][^"']*data\/(heroDatabase|heroImages)(\.js)?["']|import\s*\(\s*["'][^"']*data\/(heroDatabase|heroImages)/.test(text);
  ck("I3 runner、Challenge setup builder、deps core 都沒有直接 import heroDatabase.js／heroImages.js（查表一律注入；core 沒有預設查表）；wrapper（Live 用）有（正對照）",
    !directHeavy(runner) && !directHeavy(builderSrc) && !directHeavy(coreSrc) && directHeavy(src("src/battle/moba/matchAssemblerDeps.js")) && CORE !== null && BUILDER !== null);
  ck("I4 runner 不 import 預設查表的 wrapper（matchAssemblerDeps.js）：deps 只從 core 取，heroLookup 用注入的 heroOf",
    !/matchAssemblerDeps\.js["']/.test(runner) && /matchAssemblerDepsCore\.js["']/.test(runner));
}

// ── S：runner 原始碼 ───────────────────────────────────────────────────────────────────
{
  const runner = src("src/platform/challenge/challengeRunner.js");
  ck("S1 runner 不再自己 new LogicEngine／import LogicEngine／呼叫任何 .configure*／.enable*（組裝只有 assembleMatch 一處）",
    !/new\s+LogicEngine|LogicEngine\.js|\.configure[A-Z]\w*\s*\(|\.enable[A-Z]\w*\s*\(/.test(runner) && /assembleMatch\s*\(/.test(runner));
  ck("S2 runner 的 deps 來自共用 core builder，且 heroLookup 是注入的 heroOf",
    /import\s*\{[^}]*\bbuildMatchAssemblerDepsFrom\b[^}]*\}\s*from\s*["'][^"']*matchAssemblerDepsCore\.js["']/.test(runner)
    && /const\s+deps\s*=\s*buildMatchAssemblerDepsFrom\(\s*\{\s*heroLookup:\s*heroOf\s*,\s*heroLookupLabel:\s*CHALLENGE_HERO_LOOKUP_LABEL\s*\}\s*\)/.test(runner)
    && /assembleMatch\(\s*built\.setup\s*,\s*deps\s*\)/.test(runner));
  ck("S3 護欄與迴圈原樣保留：可重播性、凍結 seed、draft 宣告規則、snapshotCovers 三個判斷、tactic 查不到、CHALLENGE_DT／CHALLENGE_MAX_T tick 迴圈、tacticExec",
    /challengeReplayability\(/.test(runner) && /assertSeedFrozen\(/.test(runner) && /draft_missing/.test(runner) && /draft_snapshot_mismatch/.test(runner) && /draft_no_lookup/.test(runner)
    && /snapshotCovers\(challengerSnapshot, SNAPSHOT_INPUTS\.heroLoadout\)/.test(runner) && /snapshotCovers\(challengerSnapshot, SNAPSHOT_INPUTS\.playerStats\)/.test(runner)
    && /snapshotCovers\(challengerSnapshot, SNAPSHOT_INPUTS\.tactic\)/.test(runner) && /code:\s*"tactic"/.test(runner)
    && /for\s*\(let t = CHALLENGE_DT; t <= CHALLENGE_MAX_T && !eng\.over; t \+= CHALLENGE_DT\) eng\.tick\(CHALLENGE_DT\)/.test(runner) && /tacticExec/.test(runner)
    && CHALLENGE_DT === 0.5 && CHALLENGE_MAX_T === 1800);
}

console.log(`\nChallenge Setup 3a：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
process.exit(fail ? 1 : 0);
