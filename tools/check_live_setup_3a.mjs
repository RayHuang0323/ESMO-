#!/usr/bin/env node
// ============================================================================
//  tools/check_live_setup_3a.mjs — Phase 3a Task 4：Live 對戰改走 MatchSetup → 唯一組裝器
//
//  執行：node tools/check_live_setup_3a.mjs            （約 20 場完整對局，數分鐘）
//
//  這支驗的是「Live hook（useLocalServer.start）實際會送進組裝器的東西」：
//   G  golden 的 9 個 live 案：以 hook 的方式重建輸入（app 形狀的 roster、店內快照、旗標、對手隊伍）
//      → buildLiveMatchSetup → assembleMatch（共用 deps）⇒ configure 序列＋引數雜湊、digest、streamHash
//      全部＝tools/fixtures/match_golden_v20.json（v20 錄的值），applied 欄位＝golden live 欄位。
//   V  v20 hook 的 Node 複本（HEAD c4b72a5 的 useLocalServer.start 逐行）對照：golden 沒覆蓋的
//      app 輸入形狀（變體戰術、非法天賦 id、非法出裝策略、沒選策略、旗標關閉）⇒ 呼叫＋結果逐位元相同。
//   R  舊存檔恢復：變體戰術（已 JSON 落盤）＋objectiveLayout "SWAPPED"＋resumeTimeSec 300
//      ⇒ legacy 戰術輸入、layout 保留、setup 雜湊＝新開局、追趕後的整場結果＝一口氣跑完。
//   L  規則集壽命：開局解析一次並落盤；恢復沿用落盤值（不重讀旗標）；舊存檔沒有 ⇒ 依目前旗標。
//   D  DEV 網址開關不得進正式規則集；只在 allowTool（＝import.meta.env.DEV）時變成 kind:"tool"。
//   F  depsFingerprint：共用 deps 穩定；換掉任何一個 adapter／契約常數／引擎 ⇒ 指紋改變。
//   S  原始碼：src/（排除 src/debug/**）每一個 assembleMatch( 呼叫都從共用 deps builder 取 deps；
//      builder 純函式（不讀 store／window／時鐘）；DEV 開關只在 import.meta.env.DEV 之內讀；
//      對等鉤子全部在 ?shot= 之內；src/ 不 import tools/；串流雜湊單一實作、只在 ?shot= 動態載入。
//   E  開局被拒（fix round 1）：prepareLiveMatch 永不丟例外，回 { ok:false, stage, errors }、不建引擎；
//      缺 version 的舊存檔 legacy 戰術照 v20 接受並逐位元恢復。
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LogicEngine } from "../src/LogicEngine.js";
import { assembleMatch } from "../src/battle/moba/matchAssembler.js";
import { buildMatchAssemblerDeps, sharedMatchAssemblerDeps } from "../src/battle/moba/matchAssemblerDeps.js";
import { buildLiveMatchSetup, resolveLiveRuleset, persistedLiveConfigOf } from "../src/battle/moba/liveMatchSetup.js";
import { createMatchSetup, matchSetupHash } from "../src/platform/contracts/matchSetup.js";
import { resolveRulesetForMode, MATCH_RULESETS } from "../src/platform/contracts/matchRuleset.js";
import { objectiveLayoutForSeed, resolveObjectiveLayout } from "../src/platform/contracts/objectiveLayout.js";
import { mobaTacticById, toEngineTactic, toEngineTacticIdentity, STANDARD_OPP_TACTIC, MOBA_TACTIC_VERSION, mobaTacticForTeamStyle } from "../src/platform/contracts/MobaTacticConfig.js";
import { TACTIC_VARIANTS, applyVariant } from "../src/platform/mastery/tacticVariant.js";
import { aiTeamById, AI_TEAMS } from "../src/platform/competition/aiTeams.js";
import { heroById } from "../src/data/heroDatabase.js";
import { ROSTER } from "../src/data/roster.js";
import { draftRoster } from "../src/battle/moba/draftRoster.js";
import { buildPlayerStatSlots, applyFatigueToLoadout } from "../src/battle/moba/mobaRosterAdapter.js";
import { toEngineHeroMods } from "../src/battle/moba/mobaHeroProfile.js";
import { toEngineSpells } from "../src/battle/moba/mobaHeroLoadout.js";
import { toEngineArchetypes, COMBAT_ARCHETYPE_CONTRACT_VERSION } from "../src/data/heroCombatArchetypes.js";
import { toEngineHeroSkills } from "../src/battle/moba/skills/heroSkillGameplay.js";
import { toEngineHeroPassives } from "../src/battle/moba/skills/heroPassiveGameplay.js";
import { toEngineHeroPowerCurve } from "../src/battle/moba/heroPowerCurve.js";
import { selectBattleTalents, battleTalentOptions } from "../src/battle/moba/talents/heroBattleTalents.js";
import { toEnginePlayerMods } from "../src/battle/moba/mobaPlayerStats.js";
import { matchItemsConfig, normalizeBuildStrategy } from "../src/battle/moba/items/buildStrategyPrep.js";
import { stableStringify, stableHash } from "../src/platform/contracts/squadSnapshot.js";
import { runAndHash, engineStreamHash, finalDigest, fnv, createStreamHasher } from "./lib/matchGolden.mjs";
import { stripComments } from "./lib/stripComments.mjs";
import { hookSeed, appRoster, goldenLiveOpts, goldenLiveCtx } from "./lib/liveGolden.mjs";
import * as StreamSrc from "../src/battle/moba/debug/engineStreamHash.js";
import { prepareLiveMatch } from "../src/useLocalServer.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ck = (l, ok, n = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${l}${n ? `　${n}` : ""}`); };
const codes = (r) => (r?.errors ?? []).map((e) => `${e.code}@${e.field}`).join(",");
const progress = (s) => process.stderr.write(`  ${s}\n`);

const golden = JSON.parse(fs.readFileSync(path.join(ROOT, "tools/fixtures/match_golden_v20.json"), "utf8"));
const G = golden.inputs;
const FLAGS = Object.freeze({ ...golden.featureFlags });
const FLAGS_OFF = Object.freeze({ ...FLAGS, heroSkillsV1: false, heroBattleTalentsV1: false, itemsV1: false });
const DEPS = sharedMatchAssemblerDeps();
const RUN = { dt: golden.dt, maxT: golden.maxT.live, every: golden.streamEvery };

// ── Probe（與 capture_match_golden_v20 / check_match_assembler_3a 相同：prototype pass-through）──────
const PROBE = { calls: null };
for (const name of Object.getOwnPropertyNames(LogicEngine.prototype)) {
  if (!/^configure|^enable/.test(name) || typeof LogicEngine.prototype[name] !== "function") continue;
  const orig = LogicEngine.prototype[name];
  LogicEngine.prototype[name] = function probed(...args) {
    if (PROBE.calls) PROBE.calls.push({ m: name, h: stableHash(stableStringify(args.length <= 1 ? args[0] : args)) });
    return orig.apply(this, args);
  };
}
const probed = (fn) => { PROBE.calls = []; try { const r = fn(); return { r, calls: PROBE.calls }; } finally { PROBE.calls = null; } };
const firstDiff = (got, want) => {
  const n = Math.max(got.length, want.length);
  for (let i = 0; i < n; i++) if (got[i]?.m !== want[i]?.m || got[i]?.h !== want[i]?.h) return `#${i}: got ${got[i] ? `${got[i].m}/${got[i].h}` : "∅"} want ${want[i] ? `${want[i].m}/${want[i].h}` : "∅"}`;
  return "";
};

// ── 「hook 會怎麼呼叫」：hook 只決定 seed 的來源並交出**原始值**（session seed 或時鐘值）；
//    正規化在 builder（normalizeLiveSeed）。這裡不帶任何一份正規化算式——預期值由 golden ctor.seed 與
//    下方的 v20 hook 複本（獨立的對照組）提供。fallback＝hook 讀到的時鐘值。
//    （hookSeed／appRoster／goldenLiveOpts 於 Phase 3a T7 抽到 tools/lib/liveGolden.mjs，check_match_setup_3a 共用。）
function liveBuild(opts, { players, lineup, loadout = G.defaultLoadout, flags = FLAGS, ruleset = null, dev = null, allowTool = false, fallbackSeed } = {}) {
  const { seed, seedSource } = hookSeed(opts, fallbackSeed);
  const rs = ruleset ?? resolveLiveRuleset({ flags, dev, allowTool }).ruleset;
  return buildLiveMatchSetup({
    opts, ruleset: rs, seed, seedSource,
    profile: { players, lineup }, heroProgress: { loadout },
    opponentTeam: opts.opponentId ? aiTeamById(opts.opponentId) : null,
  });
}

// ── v20 hook 的 Node 複本（src/useLocalServer.js @ c4b72a5 :147-295，逐行；DEV 參數以 dev 傳入）──────
function v20LiveStart(opts, { players, lineup, loadout: heroLoadout = G.defaultLoadout, flags = FLAGS, dev = null, fallbackSeed = 0x1234 }) {
  const featureEnabled = (n) => flags[n] === true;
  const loadout = applyFatigueToLoadout(heroLoadout, players ?? [], lineup);
  const authoritative = Number.isFinite(opts.seed);
  const seed = authoritative ? ((opts.seed >>> 0) | 1) : ((fallbackSeed & 0xffff) | 1);
  const eng = new LogicEngine(seed, loadout);
  const objectiveLayout = resolveObjectiveLayout({ explicit: opts.objectiveLayout ?? null, seed });
  eng.configureObjectiveLayout(objectiveLayout);
  const heroSkillsOn = featureEnabled("heroSkillsV1") || !!dev?.heroSkills;
  const selectedTalents = heroSkillsOn && featureEnabled("heroBattleTalentsV1") && opts.roster
    ? selectBattleTalents(opts.roster, opts.talentSelections) : null;
  const talentSelection = selectedTalents && Object.keys(selectedTalents.players).length ? selectedTalents : null;
  const replayConfig = { ...(opts.tactic?.tacticId ? { tacticId: opts.tactic.tacticId, tacticName: opts.tactic.name ?? null } : {}),
    ...(talentSelection ? { battleTalentIds: Object.fromEntries(Object.entries(talentSelection.players).map(([seat, row]) => [seat, row.id])) } : {}) };
  const playerMods = toEnginePlayerMods({ blue: buildPlayerStatSlots(players ?? [], "blue", lineup), red: [] });
  if (playerMods) eng.configurePlayers(playerMods);
  const heroMods = opts.roster ? toEngineHeroMods(opts.roster, heroById) : null;
  if (heroMods) eng.configureHeroes(heroMods);
  if (heroSkillsOn && opts.roster) {
    const skills = toEngineHeroSkills(opts.roster, talentSelection);
    if (skills) eng.configureHeroSkills(skills);
    const passives = skills ? toEngineHeroPassives(opts.roster) : null;
    if (passives) eng.configureHeroPassives(passives);
    const curves = skills ? toEngineHeroPowerCurve(opts.roster) : null;
    if (curves) eng.configureHeroPowerCurve(curves);
  }
  const archMods = opts.roster ? toEngineArchetypes(opts.roster) : null;
  if (archMods && Object.keys(archMods).length) {
    const blue = {}, red = {};
    for (const [pid, mod] of Object.entries(archMods)) (String(pid)[0] === "r" ? red : blue)[pid] = mod;
    eng.configureArchetypes({ blue, red, meta: { version: COMBAT_ARCHETYPE_CONTRACT_VERSION, seats: Object.keys(archMods).length } });
  }
  const spellMods = opts.roster ? toEngineSpells(opts.roster) : null;
  if (spellMods) eng.configureSpells(spellMods);
  if (opts.tactic?.tacticId) {
    const oppTeam = opts.opponentId ? aiTeamById(opts.opponentId) : null;
    const redTactic = oppTeam ? mobaTacticForTeamStyle(oppTeam.style) : STANDARD_OPP_TACTIC;
    eng.configureMatch({
      blue: toEngineTactic(opts.tactic), red: toEngineTactic(redTactic),
      identity: { blue: toEngineTacticIdentity(opts.tactic), red: toEngineTacticIdentity(redTactic) },
      meta: { tacticId: opts.tactic.tacticId, tacticName: opts.tactic.name, version: MOBA_TACTIC_VERSION, opponentTacticId: redTactic.tacticId },
    });
  }
  const itemsOn = featureEnabled("itemsV1") || !!dev?.items;
  const buildStrategy = itemsOn && opts.roster ? normalizeBuildStrategy(opts.buildStrategy) : null;
  if (buildStrategy) {
    const itemsCfg = matchItemsConfig({ roster: opts.roster, heroLookup: heroById, buildStrategy });
    if (itemsCfg) eng.configureItems(itemsCfg);
  }
  return { eng, seed, objectiveLayout, talentSelection, buildStrategy, replayConfig };
}

/** 新路徑：build → assemble（探針包住）。 */
function newPath(opts, ctx) {
  const built = liveBuild(opts, ctx);
  if (!built.ok) return { built, asm: null, calls: [] };
  const { r: asm, calls } = probed(() => assembleMatch(built.setup, DEPS));
  return { built, asm, calls };
}

// ════ G：golden live 案 ═════════════════════════════════════════════════════
const liveCases = golden.cases.filter((c) => c.path === "live");
ck("G0 golden 有 9 個 live 案（含 no-tactic／no-players／no-roster）", liveCases.length === 9 && ["live-notactic-13", "live-noplayers-17", "live-noroster-21"].every((id) => liveCases.some((c) => c.id === id)));
const goldenOpts = (c) => goldenLiveOpts(c, G);
const goldenCtx = (c) => goldenLiveCtx(c, G);
let gOk = 0;
for (const c of liveCases) {
  const opts = goldenOpts(c);
  const { built, asm, calls } = newPath(opts, goldenCtx(c));
  if (!built.ok || !asm?.ok) { ck(`G ${c.id} build＋assemble ok`, false, built.ok ? codes(asm) : codes(built)); continue; }
  const s = built.setup;
  const ctorOk = s.seed === c.ctor.seed && stableHash(stableStringify(s.loadout)) === c.ctor.loadoutHash;
  const diff = firstDiff(calls, c.calls);
  const res = runAndHash(asm.engine, RUN);
  const same = res.digest === c.digest && res.streamHash === c.streamHash;
  const a = asm.applied;
  const srcs = a.talentSelection ? Object.fromEntries(Object.entries(a.talentSelection.players).map(([k, v]) => [k, v.source])) : null;
  const appliedOk = a.objectiveLayout === c.live.objectiveLayout && (a.buildStrategy ?? null) === (c.live.buildStrategy ?? null)
    && JSON.stringify(srcs) === JSON.stringify(c.live.talentSources)
    && (c.params.tacticId ? a.tacticMeta?.opponentTacticId === c.live.redTacticId : a.tacticMeta === null);
  ck(`G ${c.id} 建構子 seed／疲勞後 loadout＝golden ctor`, ctorOk);
  ck(`G ${c.id} configure 序列＋引數雜湊＝golden（${c.calls.length} 呼叫）`, diff === "", diff);
  ck(`G ${c.id} digest＋streamHash＝golden`, same, same ? res.digest : `got ${res.digest}/${res.streamHash} want ${c.digest}/${c.streamHash}`);
  ck(`G ${c.id} applied（layout／出裝／天賦來源／對手戰術）＝golden live`, appliedOk, JSON.stringify({ l: a.objectiveLayout, b: a.buildStrategy, srcs, opp: a.tacticMeta?.opponentTacticId }));
  ck(`G ${c.id} setup：兩方戰術都是 legacy 輸入；meta 帶 sessionId／mode／opponentId／seedSource`,
    (c.params.tacticId ? s.tactic.blue?.kind === "legacy" : s.tactic.blue === null) && s.tactic.red?.kind === "legacy"
    && s.meta.sessionId === opts.sessionId && s.meta.mode === "moba" && s.meta.opponentId === (opts.opponentId ?? null) && s.meta.seedSource === "session");
  if (ctorOk && diff === "" && same && appliedOk) gOk++;
  progress(`G ${c.id} ${same ? "ok" : "DIFF"}`);
}
ck(`G 9/9 golden live 案經 Live builder＋共用 deps 逐位元重現`, gOk === 9, `${gOk}/9`);

// ════ V：v20 hook 複本對照（golden 沒覆蓋的 app 輸入形狀）═══════════════════════
const baseRows = draftRoster(ROSTER);   // 正式 GameView 無 draft 時的生效名單（含 player／hero 中文名／lane／spells）
const firstVariant = TACTIC_VARIANTS.find((v) => mobaTacticById(v.baseTacticId));
const variantTactic = JSON.parse(JSON.stringify(applyVariant(mobaTacticById(firstVariant.baseTacticId), firstVariant)));
const b1Opts = battleTalentOptions(baseRows.b1.heroId), b3Opts = battleTalentOptions(baseRows.b3.heroId);
const V_CASES = [
  { id: "app-roster-m3-ai", opts: { seed: 41, roster: baseRows, tactic: mobaTacticById("m3"), buildStrategy: "scaling", opponentId: AI_TEAMS[1].id, sessionId: "s-v1", mode: "moba" } },
  { id: "variant-tactic", opts: { seed: 43, roster: baseRows, tactic: variantTactic, buildStrategy: "early", opponentId: null, sessionId: "s-v2", mode: "moba" } },
  { id: "talents-invalid-and-foreign", opts: { seed: 45, roster: baseRows, tactic: mobaTacticById("m6"),
    talentSelections: { b1: "nope:battle-form", b2: b1Opts.at(-1)?.id ?? null, b3: b3Opts.at(-1)?.id ?? null, x9: "junk", r1: 7 },
    buildStrategy: "survival", opponentId: AI_TEAMS[2].id, sessionId: "s-v3", mode: "moba" } },
  { id: "strategy-invalid-aggressive", opts: { seed: 47, roster: baseRows, tactic: mobaTacticById("m1"), buildStrategy: "aggressive", sessionId: "s-v4", mode: "moba" } },
  { id: "strategy-missing", opts: { seed: 49, roster: baseRows, tactic: mobaTacticById("m2"), sessionId: "s-v5", mode: "moba" } },
  { id: "flags-off", flags: FLAGS_OFF, opts: { seed: 51, roster: baseRows, tactic: mobaTacticById("m7"), buildStrategy: "early",
    talentSelections: { b1: b1Opts[0]?.id ?? null }, opponentId: AI_TEAMS[0].id, sessionId: "s-v6", mode: "moba" } },
  { id: "local-seed", opts: { roster: baseRows, tactic: mobaTacticById("m5"), buildStrategy: "counter" }, fallbackSeed: 0x9a3b },
];
for (const v of V_CASES) {
  const ctx = { players: G.players, lineup: G.lineup, flags: v.flags ?? FLAGS, fallbackSeed: v.fallbackSeed ?? 0x1234 };
  const old = probed(() => v20LiveStart(v.opts, ctx));
  const oldRes = runAndHash(old.r.eng, RUN);
  const { built, asm, calls } = newPath(v.opts, ctx);
  if (!built.ok || !asm?.ok) { ck(`V ${v.id} build＋assemble ok`, false, built.ok ? codes(asm) : codes(built)); continue; }
  const res = runAndHash(asm.engine, RUN);
  const diff = firstDiff(calls, old.calls);
  ck(`V ${v.id} configure 序列＋引數雜湊＝v20 hook 複本（${old.calls.length} 呼叫）`, diff === "", diff);
  ck(`V ${v.id} digest＋streamHash＝v20 hook 複本`, res.digest === oldRes.digest && res.streamHash === oldRes.streamHash, `${res.digest}/${res.streamHash} vs ${oldRes.digest}/${oldRes.streamHash}`);
  const a = asm.applied;
  ck(`V ${v.id} applied：layout／出裝／replayConfig＝v20（replay 不變）`, a.objectiveLayout === old.r.objectiveLayout && (a.buildStrategy ?? null) === (old.r.buildStrategy ?? null)
    && JSON.stringify(a.replayConfig) === JSON.stringify(old.r.replayConfig) && (built.buildStrategy ?? null) === (old.r.buildStrategy ?? null),
    JSON.stringify({ a: a.buildStrategy, v20: old.r.buildStrategy, rc: a.replayConfig }));
  progress(`V ${v.id} ${diff === "" ? "ok" : "DIFF"}`);
}
{
  const v = V_CASES.find((x) => x.id === "strategy-missing");
  const { built, asm } = newPath(v.opts, { players: G.players, lineup: G.lineup });
  ck("V2 裝備層開＋沒選策略 ⇒ builder 正規化成 \"standard\"，組裝器真的呼叫 configureItems",
    built.setup.buildStrategy === "standard" && asm.applied.buildStrategy === "standard" && asm.applied.configured.includes("configureItems"));
  const t = V_CASES.find((x) => x.id === "talents-invalid-and-foreign");
  const tb = liveBuild(t.opts, { players: G.players, lineup: G.lineup });
  ck("V3 天賦：非法 id／別隻英雄的天賦 ⇒ null（交給 AI，與 v20 相同），非席位鍵與非字串丟掉",
    tb.ok && tb.setup.talentSelections.b1 === null && tb.setup.talentSelections.b2 === null
    && tb.setup.talentSelections.b3 === (b3Opts.at(-1)?.id ?? null)
    && !("x9" in tb.setup.talentSelections) && tb.setup.talentSelections.r1 === null, JSON.stringify(tb.setup?.talentSelections));
  const f = V_CASES.find((x) => x.id === "flags-off");
  const fb = liveBuild(f.opts, { players: G.players, lineup: G.lineup, flags: FLAGS_OFF });
  ck("V4 旗標關閉：關閉層的輸入（天賦選擇、出裝策略）被濾掉，setup 仍建立成功",
    fb.ok && fb.setup.talentSelections === null && fb.setup.buildStrategy === null && fb.setup.effectiveLayers.items === false && fb.setup.effectiveLayers.heroSkills === false);
  const ls = liveBuild(V_CASES.find((x) => x.id === "local-seed").opts, { players: G.players, lineup: G.lineup, fallbackSeed: 0x9a3b });
  ck("V5 沒有 session seed ⇒ seedSource local、seed＝(fallback & 0xffff) | 1（時鐘只在 hook 讀）", ls.ok && ls.setup.meta.seedSource === "local" && ls.setup.seed === ((0x9a3b & 0xffff) | 1));
  //  V6（fix round 2）：seed 正規化在 builder。hook 只交原始值 ⇒ 偶數／超過 32 位／負數／小數的 session seed，
  //  與毫秒等級的時鐘值，builder 算出的引擎 seed 必須等於 v20 hook 複本（獨立對照組）算的。golden 的 seed 全是奇數，驗不到這條。
  const ctxSeed = { players: G.players, lineup: G.lineup };
  const sessionRaws = [0, 2, 46, 4294967296 * 3 + 46, -8, 2147483648, 13579.7, 4294967295];
  const localRaws = [0, 0x9a3b, 65536, 1757000004242, 1757000069777];
  const sessionBad = sessionRaws.filter((raw) => { const b = liveBuild({ seed: raw, roster: baseRows }, ctxSeed); return !(b.ok && b.setup.seed === v20LiveStart({ seed: raw, roster: baseRows }, ctxSeed).seed && b.setup.meta.seedSource === "session"); });
  const localBad = localRaws.filter((raw) => { const b = liveBuild({ roster: baseRows }, { ...ctxSeed, fallbackSeed: raw }); return !(b.ok && b.setup.seed === v20LiveStart({ roster: baseRows }, { ...ctxSeed, fallbackSeed: raw }).seed && b.setup.meta.seedSource === "local"); });
  ck(`V6 builder 的 seed 正規化＝v20 hook 複本：${sessionRaws.length} 個 session 原始值（偶數／>32 位／負數／小數）＋${localRaws.length} 個時鐘原始值；結果一律是奇數整數`,
    sessionBad.length === 0 && localBad.length === 0
    && [...sessionRaws.map((raw) => liveBuild({ seed: raw, roster: baseRows }, ctxSeed).setup.seed), ...localRaws.map((raw) => liveBuild({ roster: baseRows }, { ...ctxSeed, fallbackSeed: raw }).setup.seed)].every((x) => Number.isInteger(x) && (x & 1) === 1),
    JSON.stringify({ sessionBad, localBad }));
}

// ════ R：舊存檔恢復 ═══════════════════════════════════════════════════════════
{
  let S = 101; while (objectiveLayoutForSeed((S >>> 0) | 1) !== "SWAPPED") S += 2;
  const baseT = mobaTacticById(firstVariant.baseTacticId);
  const numericChanged = Object.entries(firstVariant.changedFields ?? {}).some(([f, val]) => typeof val === "number" && val !== baseT[f.split(".")[0]][f.split(".")[1]]);
  ck("R0 前提：樣本變體真的改了數值欄位（不是 base 戰術原樣）", numericChanged, `${firstVariant.variantId}: ${JSON.stringify(firstVariant.changedFields)}`);
  const sid = "session-old-save";
  const fresh = { seed: S, roster: baseRows, tactic: variantTactic, buildStrategy: "scaling", opponentId: AI_TEAMS[3].id, sessionId: sid, mode: "moba", resumeTimeSec: 0, objectiveLayout: null };
  //  舊存檔：activeMatch.config 只有 v20 寫過的欄位（沒有 ruleset／matchSetupHash），tactic 是 JSON 落盤後的變體物件
  const savedConfig = JSON.parse(JSON.stringify({ phase: "battle", draft: null, tactic: variantTactic, buildStrategy: "scaling", objectiveLayout: "SWAPPED" }));
  const session = { sessionId: sid, activeMatch: { config: savedConfig, simulation: { timeSec: 300 } } };
  const persisted = persistedLiveConfigOf(session, sid);
  ck("R1 persistedLiveConfigOf：同 sessionId 才取回；別的場次 ⇒ null", persisted === savedConfig && persistedLiveConfigOf(session, "other") === null && persistedLiveConfigOf(session, null) === null);
  const rl = resolveLiveRuleset({ flags: FLAGS, persisted: persisted?.ruleset ?? null });
  ck("R2 舊存檔沒有 ruleset ⇒ 依目前旗標解析（＝v20 每次開局讀旗標）", rl.source === "flags" && stableStringify(rl.ruleset) === stableStringify(resolveRulesetForMode({ mode: "career", flags: FLAGS })));
  const resume = { ...fresh, tactic: savedConfig.tactic, objectiveLayout: savedConfig.objectiveLayout, buildStrategy: savedConfig.buildStrategy, resumeTimeSec: 300 };
  const A = liveBuild(fresh, { players: G.players, lineup: G.lineup, ruleset: rl.ruleset });
  const B = liveBuild(resume, { players: G.players, lineup: G.lineup, ruleset: rl.ruleset });
  ck("R3 恢復的 setup：藍方 legacy 戰術＝落盤的變體物件（數值保留）、layout SWAPPED 保留", B.ok && B.setup.tactic.blue.kind === "legacy"
    && stableStringify(B.setup.tactic.blue.config) === stableStringify(variantTactic) && B.setup.objectiveLayout === "SWAPPED", codes(B));
  ck("R4 恢復與新開局是同一份 setup（雜湊相同）", A.ok && B.ok && matchSetupHash(A.setup) === matchSetupHash(B.setup));
  //  新開局一口氣跑完
  const a = assembleMatch(A.setup, DEPS);
  const ra = runAndHash(a.engine, RUN);
  //  恢復：同一個 hook 追趕迴圈（!over && t < resumeTimeSec && guard < 12000）再繼續
  const b = assembleMatch(B.setup, DEPS);
  const hb = engineStreamHash(b.engine, RUN.every);
  let guard = 0;
  while (!b.engine.over && b.engine.t < 300 && guard < 12000) { b.engine.tick(RUN.dt); guard++; }
  const caughtUp = b.engine.t;
  while (!b.engine.over && b.engine.t < RUN.maxT) b.engine.tick(RUN.dt);
  ck("R5 追趕到 300 s 後繼續 ⇒ 整場 digest＋streamHash＝一口氣跑完", caughtUp === 300 && finalDigest(b.engine) === ra.digest && hb.hex === ra.streamHash, `${caughtUp}s ${finalDigest(b.engine)}/${hb.hex} vs ${ra.digest}/${ra.streamHash}`);
  const old = probed(() => v20LiveStart(resume, { players: G.players, lineup: G.lineup }));
  const oldRes = runAndHash(old.r.eng, RUN);
  const nb = probed(() => assembleMatch(B.setup, DEPS));
  ck("R6 恢復路徑＝v20 hook 複本（同一份存檔輸入）：呼叫＋整場結果逐位元相同", firstDiff(nb.calls, old.calls) === "" && oldRes.digest === ra.digest && oldRes.streamHash === ra.streamHash, firstDiff(nb.calls, old.calls));
  //  沒有 session seed 的恢復（v20 會拿新的時鐘 seed ⇒ 本來就不是同一場）：存檔 layout 與新 seed 衝突 ⇒ 丟掉並記下，不讓開局失敗
  let F = 0x200; while (objectiveLayoutForSeed((F & 0xffff) | 1) !== "STANDARD") F += 1;
  const loc = liveBuild({ ...resume, seed: undefined }, { players: G.players, lineup: G.lineup, ruleset: rl.ruleset, fallbackSeed: F });
  ck("R7 本機 seed＋存檔 layout 與 seed 衝突 ⇒ 改用 seed 推導並記在 notes（session seed 時則拒絕）",
    loc.ok && loc.setup.objectiveLayout === "STANDARD" && loc.notes.some((n) => /objectiveLayout/.test(n)), JSON.stringify(loc.notes ?? codes(loc)));
  const conflict = liveBuild({ ...resume, objectiveLayout: "STANDARD" }, { players: G.players, lineup: G.lineup, ruleset: rl.ruleset });
  ck("R7b session seed＋與 seed 不符的 layout（竄改的存檔）⇒ objective_layout_conflict（不默默改）", !conflict.ok && conflict.errors.some((e) => e.code === "objective_layout_conflict"));
  //  R8（ruling 3a）：舊存檔的戰術沒有 version（或是舊版號）＋變體改過的數值 ⇒ v20 照跑（投影不讀 version）；新路徑必須接受並逐位元恢復
  for (const [tag, saved] of [["缺 version", (() => { const { version: _v, ...rest } = variantTactic; return rest; })()], ["舊 version", { ...variantTactic, version: "MobaTacticConfig.v0" }]]) {
    const opts = { ...resume, tactic: JSON.parse(JSON.stringify(saved)) };
    const N = liveBuild(opts, { players: G.players, lineup: G.lineup, ruleset: rl.ruleset });
    if (!N.ok) { ck(`R8 legacy 戰術${tag}：setup 建立`, false, codes(N)); continue; }
    const old = probed(() => v20LiveStart(opts, { players: G.players, lineup: G.lineup }));
    const oldRes = runAndHash(old.r.eng, RUN);
    const nw = probed(() => assembleMatch(N.setup, DEPS));
    const hb2 = engineStreamHash(nw.r.engine, RUN.every);
    let g2 = 0;
    while (!nw.r.engine.over && nw.r.engine.t < 300 && g2 < 12000) { nw.r.engine.tick(RUN.dt); g2++; }
    while (!nw.r.engine.over && nw.r.engine.t < RUN.maxT) nw.r.engine.tick(RUN.dt);
    ck(`R8 legacy 戰術${tag}＋變體數值：接受、config 原樣保存、恢復（追趕 300 s）＝v20 hook 複本逐位元（呼叫＋digest＋streamHash）`,
      stableStringify(N.setup.tactic.blue.config) === stableStringify(saved) && firstDiff(nw.calls, old.calls) === ""
      && finalDigest(nw.r.engine) === oldRes.digest && hb2.hex === oldRes.streamHash && oldRes.digest === ra.digest,
      firstDiff(nw.calls, old.calls) || `${finalDigest(nw.r.engine)}/${hb2.hex} vs ${oldRes.digest}/${oldRes.streamHash}`);
  }
  progress("R done");
}

// ════ L：規則集壽命 ═══════════════════════════════════════════════════════════
{
  const offItems = resolveRulesetForMode({ mode: "career", flags: { ...FLAGS, itemsV1: false } });
  const p = JSON.parse(JSON.stringify(offItems));
  const r1 = resolveLiveRuleset({ flags: FLAGS, persisted: p });
  ck("L1 恢復沿用落盤的 ruleset（目前旗標全開也不重讀）", r1.source === "persisted" && r1.ruleset.layers.items === false);
  const built = liveBuild({ seed: 61, roster: baseRows, tactic: mobaTacticById("m4"), buildStrategy: "early", sessionId: "s-l", mode: "moba" }, { players: G.players, lineup: G.lineup, ruleset: r1.ruleset });
  const asm = built.ok ? assembleMatch(built.setup, DEPS) : null;
  ck("L2 落盤 ruleset 的裝備層關 ⇒ 出裝輸入被濾掉、組裝器不呼叫 configureItems", built.ok && built.setup.buildStrategy === null && asm?.ok && !asm.applied.configured.includes("configureItems"));
  const tool = JSON.parse(JSON.stringify(MATCH_RULESETS["balanceTool.v20"]));
  ck("L3 正式 build（allowTool false）落盤的是 tool ruleset ⇒ 不採用，改依旗標", resolveLiveRuleset({ flags: FLAGS, persisted: tool }).source === "flags");
  ck("L3b DEV（allowTool true）可沿用落盤的 tool ruleset", resolveLiveRuleset({ flags: FLAGS, persisted: tool, allowTool: true }).source === "persisted");
  const forged = JSON.parse(JSON.stringify(MATCH_RULESETS["career.v20"])); forged.layers.objectiveLayout = "standard";
  const forged2 = JSON.parse(JSON.stringify(MATCH_RULESETS["career.v20"])); forged2.layers.secretLayer = true;
  ck("L4 竄改的落盤 ruleset（改釘死層／多出未知層／不是物件）⇒ 不採用，改依旗標",
    [forged, forged2, "career.v20", 42, { rulesetId: "career.v20" }].every((x) => resolveLiveRuleset({ flags: FLAGS, persisted: x }).source === "flags"));
  ck("L5 開局（沒有落盤值）⇒ 依旗標，且等於 resolveRulesetForMode(career)", (() => { const r = resolveLiveRuleset({ flags: FLAGS }); return r.source === "flags" && stableStringify(r.ruleset) === stableStringify(resolveRulesetForMode({ mode: "career", flags: FLAGS })); })());
}

// ════ D：DEV 開關 ═════════════════════════════════════════════════════════════
{
  const combos = [];
  for (const s of [true, false]) for (const t of [true, false]) for (const i of [true, false]) combos.push({ ...FLAGS, heroSkillsV1: s, heroBattleTalentsV1: t, itemsV1: i });
  const devs = [null, { heroSkills: true }, { items: true }, { heroSkills: true, items: true }];
  let leak = 0;
  for (const flags of combos) for (const dev of devs) {
    const r = resolveLiveRuleset({ flags, dev, allowTool: false });
    if (r.source !== "flags" || stableStringify(r.ruleset) !== stableStringify(resolveRulesetForMode({ mode: "career", flags }))) leak++;
  }
  ck("D1 正式 build（allowTool false）：8 種旗標 × 4 種 DEV 開關 ⇒ 規則集逐字＝resolveRulesetForMode（開關完全無效）", leak === 0, `leak=${leak}`);
  const noop = resolveLiveRuleset({ flags: FLAGS, dev: { heroSkills: true, items: true }, allowTool: true });
  ck("D2 DEV 但旗標已開（開關不改變任何層）⇒ 仍是正式規則集", noop.source === "flags" && noop.ruleset.kind === "production");
  const dv = resolveLiveRuleset({ flags: FLAGS_OFF, dev: { heroSkills: true, items: true }, allowTool: true });
  ck("D3 DEV＋旗標關＋開關 ⇒ kind:\"tool\" 規則集（技能／裝備開、天賦跟旗標關）", dv.source === "dev" && dv.ruleset.kind === "tool"
    && dv.ruleset.layers.heroSkills === true && dv.ruleset.layers.items === true && dv.ruleset.layers.battleTalents === false && dv.ruleset.layers.playerStatSides === "blue");
  const prodAll = Object.values(MATCH_RULESETS).filter((r) => r.kind === "production").concat(combos.map((flags) => resolveRulesetForMode({ mode: "career", flags })));
  ck("D4 所有正式規則集的內容都不含 DEV 開關字樣", prodAll.every((r) => !/dev/i.test(JSON.stringify(r))));
  const opts = { seed: 63, roster: baseRows, tactic: mobaTacticById("m8"), buildStrategy: "early", sessionId: "s-d", mode: "moba" };
  const db = liveBuild(opts, { players: G.players, lineup: G.lineup, ruleset: dv.ruleset });
  const da = db.ok ? assembleMatch(db.setup, DEPS) : null;
  ck("D5 DEV tool 規則集可建立、可組裝；出裝改由 tool.itemsStrategies（我方所選、對手 standard）",
    db.ok && da?.ok && db.setup.tool?.itemsStrategies?.blue === "early" && db.setup.tool.itemsStrategies.red === "standard" && db.setup.buildStrategy === null
    && da.applied.configured.includes("configureHeroSkills") && da.applied.configured.includes("configureItems"), db.ok ? codes(da) : codes(db));
  //  DEV tool 與 v20 DEV 路徑的差異只允許在 meta（工具規則集不帶證據 meta）——量測並如實記錄
  if (db.ok && da?.ok) {
    const old = v20LiveStart(opts, { players: G.players, lineup: G.lineup, flags: FLAGS_OFF, dev: { heroSkills: true, items: true } });
    const ro = runAndHash(old.eng, RUN), rn = runAndHash(assembleMatch(db.setup, DEPS).engine, RUN);
    console.log(`   D6 量測：DEV tool 規則集 vs v20 DEV 路徑 ⇒ ${ro.digest === rn.digest && ro.streamHash === rn.streamHash ? "整場結果相同" : `結果不同 ${rn.digest} vs ${ro.digest}`}（僅 DEV，正式站不可達）`);
  }
}

// ════ E：開局被拒的路徑（ruling 3b：不丟例外、不默默換一套模擬）═══════════════════
{
  const okOpts = { seed: 67, roster: baseRows, tactic: mobaTacticById("m4"), buildStrategy: "early", sessionId: "s-e", mode: "moba" };
  const inputsOf = (opts, over = {}) => ({ opts, ...hookSeed(opts), ruleset: resolveLiveRuleset({ flags: FLAGS }).ruleset,
    profile: { players: G.players, lineup: G.lineup }, heroProgress: { loadout: G.defaultLoadout }, opponentTeam: null, ...over });
  const run = (inputs) => { let thrown = null, out = null; const pr = probed(() => { try { out = prepareLiveMatch(inputs); } catch (e) { thrown = e; } }); return { out, thrown, calls: pr.calls }; };
  const rejected = (x, stage, code) => x.thrown === null && x.out?.ok === false && x.out.stage === stage && x.out.engine === null && x.calls.length === 0
    && Array.isArray(x.out.errors) && x.out.errors.some((e) => e.code === code && typeof e.message === "string");
  const good = run(inputsOf(okOpts));
  ck("E1 正常輸入 ⇒ { ok:true, engine, applied, setup, setupHash }", good.thrown === null && good.out?.ok === true && !!good.out.engine && /^[0-9a-f]{16}$/.test(good.out.setupHash)
    && good.out.setupHash === matchSetupHash(good.out.setup) && good.out.errors.length === 0 && good.calls.length > 0);
  const badHero = run(inputsOf({ ...okOpts, roster: { ...baseRows, r5: { ...baseRows.r5, heroId: "no_such_hero" } } }));
  ck("E2 查不到的英雄 ⇒ { ok:false, stage:assembleMatch, hero_unknown }，不建引擎、零 configure、不丟例外", rejected(badHero, "assembleMatch", "hero_unknown"), JSON.stringify(badHero.out?.errors ?? String(badHero.thrown)));
  const badLoadout = { ...G.defaultLoadout, b1: { ...G.defaultLoadout.b1, powerMult: Infinity } };
  const badStat = run(inputsOf(okOpts, { heroProgress: { loadout: badLoadout } }));
  ck("E3 非有限數值（loadout 倍率 Infinity）⇒ { ok:false, stage:MatchSetup }，不建引擎、不丟例外", badStat.thrown === null && badStat.out?.ok === false && badStat.out.stage === "MatchSetup" && badStat.out.engine === null && badStat.calls.length === 0 && badStat.out.errors.length > 0,
    JSON.stringify(badStat.out?.errors ?? String(badStat.thrown)));
  const { macro: _m, ...noMacro } = mobaTacticById("m4");
  const badTactic = run(inputsOf({ ...okOpts, tactic: noMacro }));
  ck("E4 legacy 戰術缺 macro 群組（v20 會在投影丟 TypeError）⇒ { ok:false, tactic_invalid }", rejected(badTactic, "MatchSetup", "tactic_invalid"), JSON.stringify(badTactic.out?.errors ?? String(badTactic.thrown)));
  const boom = run(inputsOf({ ...okOpts, get roster() { throw new Error("boom"); } }));
  ck("E5 builder／組裝過程丟出的例外也轉成 { ok:false, stage:exception }（不外洩例外）", rejected(boom, "exception", "assembly_exception") && /boom/.test(boom.out.errors[0].message), JSON.stringify(boom.out?.errors ?? String(boom.thrown)));
  const normalized = run(inputsOf({ ...okOpts, buildStrategy: "aggressive", talentSelections: { b1: "nope:x" } }));
  ck("E6 未知出裝策略／天賦 id 在 Live 不是錯誤：照 v20 正規化（standard／交給 AI），仍 ok（§V 已證與 v20 逐位元相同）", normalized.out?.ok === true && normalized.out.setup.buildStrategy === "standard" && normalized.out.setup.talentSelections.b1 === null);
}

// ════ F：depsFingerprint ═══════════════════════════════════════════════════════
{
  const setup = liveBuild({ seed: 65, roster: baseRows, tactic: mobaTacticById("m4"), buildStrategy: "early", sessionId: "s-f", mode: "moba" }, { players: G.players, lineup: G.lineup }).setup;
  const fp = (deps) => { const r = assembleMatch(setup, deps); return r.ok ? r.applied.depsFingerprint : `ERR:${codes(r)}`; };
  const shared = fp(DEPS);
  ck("F1 applied.depsFingerprint 存在、穩定；sharedMatchAssemblerDeps() 是同一份（memoized）且＝重新 build 的", /^[0-9a-f]{16}$/.test(shared) && fp(sharedMatchAssemblerDeps()) === shared
    && sharedMatchAssemblerDeps() === DEPS && fp(buildMatchAssemblerDeps()) === shared, shared);
  const wrapArch = (roster) => toEngineArchetypes(roster);
  const swaps = {
    "toEngineArchetypes 換成別的函式": buildMatchAssemblerDeps({ heroAdapters: { toEngineArchetypes: wrapArch } }),
    "COMBAT_ARCHETYPE_CONTRACT_VERSION 換值": buildMatchAssemblerDeps({ heroAdapters: { COMBAT_ARCHETYPE_CONTRACT_VERSION: "HeroCombatArchetype.v0" } }),
    "toEngineHeroSkills 換成別的函式": buildMatchAssemblerDeps({ heroAdapters: { toEngineHeroSkills: (r, t) => toEngineHeroSkills(r, t) } }),
    "selectBattleTalents 換成別的函式": buildMatchAssemblerDeps({ heroAdapters: { selectBattleTalents: (r, q) => selectBattleTalents(r, q) } }),
    "heroLookup 換成別的函式": buildMatchAssemblerDeps({ heroLookup: (id) => heroById(id) }),
    "引擎換成子類別": buildMatchAssemblerDeps({ LogicEngine: class Patched extends LogicEngine {} }),
    "引擎換成子類別＋標記": buildMatchAssemblerDeps({ LogicEngine: class Patched2 extends LogicEngine {}, engineMarker: "tree:other" }),
    "非共用 builder（手拼 deps，T3 測試形狀＋T6 引擎側 adapter）": { LogicEngine, heroLookup: heroById, heroAdapters: { toEngineHeroSkills, selectBattleTalents, battleTalentOptions, toEngineArchetypes, COMBAT_ARCHETYPE_CONTRACT_VERSION }, engineAdapters: { ...DEPS.engineAdapters } },
    "matchItemsConfig 換成別的函式": buildMatchAssemblerDeps({ engineAdapters: { matchItemsConfig: (a) => DEPS.engineAdapters.matchItemsConfig(a) } }),
    "toEngineTactic 換成別的函式": buildMatchAssemblerDeps({ engineAdapters: { toEngineTactic: (t) => DEPS.engineAdapters.toEngineTactic(t) } }),
    "toEnginePlayerMods 換成別的函式": buildMatchAssemblerDeps({ engineAdapters: { toEnginePlayerMods: (x) => DEPS.engineAdapters.toEnginePlayerMods(x) } }),
  };
  const fps = Object.fromEntries(Object.entries(swaps).map(([k, d]) => [k, fp(d)]));
  const distinct = new Set([shared, ...Object.values(fps)]);
  ck("F2 換掉任何一個 adapter／契約常數／heroLookup／引擎 ⇒ depsFingerprint 都不同（彼此也不同）", Object.values(fps).every((x) => /^[0-9a-f]{16}$/.test(x) && x !== shared) && distinct.size === Object.keys(fps).length + 1, JSON.stringify(fps));
  ck("F3 共用 deps 的 manifest 是凍結的、帶各 adapter 模組的契約常數與引擎標記", Object.isFrozen(DEPS) && Object.isFrozen(DEPS.manifest)
    && /HeroSkillLevel/.test(JSON.stringify(DEPS.manifest)) && /HeroBattleTalent/.test(JSON.stringify(DEPS.manifest)) && /HeroCombatArchetype/.test(JSON.stringify(DEPS.manifest)) && /moba-sim/.test(JSON.stringify(DEPS.manifest)));
}

// ════ S：原始碼 ═══════════════════════════════════════════════════════════════
//  Task 5：Challenge 的 heroLookup 是注入的 ⇒ 它從 core（matchAssemblerDepsCore.js，沒有預設查表）取 deps；
//  adapter 清單與 manifest 仍只有 core 一份（Live 的 matchAssemblerDeps.js 是 core 之上的薄層）。
const BUILDERS = /^(sharedMatchAssemblerDeps|buildMatchAssemblerDeps|buildMatchAssemblerDepsFrom)$/;
/** 回傳違規的呼叫（檔名＋第二引數）。定義本身（export function assembleMatch）不算呼叫。 */
function assembleCallViolations(file, rawSrc) {
  const src = stripComments(rawSrc);
  const out = [];
  const importsBuilder = /import\s*\{[^}]*\b(sharedMatchAssemblerDeps|buildMatchAssemblerDeps|buildMatchAssemblerDepsFrom)\b[^}]*\}\s*from\s*["'][^"']*matchAssemblerDeps(?:Core)?\.js["']/.test(src);
  for (const m of src.matchAll(/(?<![\w$.])assembleMatch\s*\(/g)) {
    if (/function\s+$/.test(src.slice(Math.max(0, m.index - 20), m.index))) continue;
    //  取第二個引數（頂層逗號之後到對應右括號）
    let depth = 0, i = m.index + m[0].length, start = -1, end = -1;
    for (; i < src.length; i++) {
      const ch = src[i];
      if ("([{".includes(ch)) depth++;
      else if (")]}".includes(ch)) { if (depth === 0) { end = i; break; } depth--; }
      else if (ch === "," && depth === 0 && start < 0) start = i + 1;
    }
    const arg = start < 0 ? "" : src.slice(start, end).trim();
    const callee = arg.match(/^([\w$]+)\s*\(\s*\)$/)?.[1];
    const ident = arg.match(/^([\w$]+)$/)?.[1];
    const assigned = ident && new RegExp(`\\b(?:const|let|var)\\s+${ident}\\s*=\\s*(sharedMatchAssemblerDeps|buildMatchAssemblerDeps|buildMatchAssemblerDepsFrom)\\s*\\(`).test(src);
    const ok = importsBuilder && ((callee && BUILDERS.test(callee)) || assigned);
    if (!ok) out.push(`${file}: assembleMatch(…, ${arg || "∅"})`);
  }
  return out;
}
{
  const ctrl = [
    ["bad-inline.js", "import { assembleMatch } from './matchAssembler.js';\nassembleMatch(setup, { LogicEngine, heroLookup });", 1],
    ["bad-noimport.js", "assembleMatch(setup, sharedMatchAssemblerDeps());", 1],
    ["bad-omitted.js", "import { sharedMatchAssemblerDeps } from './matchAssemblerDeps.js';\nassembleMatch(setup);", 1],
    ["ok-call.js", "import { sharedMatchAssemblerDeps } from './matchAssemblerDeps.js';\nassembleMatch(setup, sharedMatchAssemblerDeps());", 0],
    ["ok-ident.js", "import { buildMatchAssemblerDeps } from \"../x/matchAssemblerDeps.js\";\nconst d = buildMatchAssemblerDeps();\nassembleMatch(s, d);", 0],
    ["ok-core.js", "import { buildMatchAssemblerDepsFrom } from '../../battle/moba/matchAssemblerDepsCore.js';\nconst deps = buildMatchAssemblerDepsFrom({ heroLookup: heroOf });\nassembleMatch(built.setup, deps);", 0],
    ["bad-core-inline.js", "import { buildMatchAssemblerDepsFrom } from '../x/matchAssemblerDepsCore.js';\nassembleMatch(setup, { LogicEngine, heroLookup, heroAdapters });", 1],
    ["bad-core-noimport.js", "const deps = buildMatchAssemblerDepsFrom({ heroLookup });\nassembleMatch(setup, deps);", 1],
    ["ok-comment.js", "// assembleMatch(setup, { bad })\n/* assembleMatch(x, y) */\nconst z = 1;", 0],
  ];
  ck("S0 呼叫點掃描器有檢定力（5 個違規樣本抓到、4 個合法樣本放行，含 core builder 的兩種形狀；註解不算）", ctrl.every(([f, s, n]) => assembleCallViolations(f, s).length === n),
    JSON.stringify(ctrl.map(([f, s]) => [f, assembleCallViolations(f, s).length])));
  const files = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (path.relative(ROOT, p).replace(/\\/g, "/") !== "src/debug") walk(p); } else if (/\.(m?js|jsx)$/.test(e.name)) files.push(p); } };
  walk(path.join(ROOT, "src"));
  const violations = [], callers = [];
  for (const f of files) {
    const rel = path.relative(ROOT, f).replace(/\\/g, "/");
    const raw = fs.readFileSync(f, "utf8");
    if (!/assembleMatch\s*\(/.test(stripComments(raw))) continue;
    if (rel === "src/battle/moba/matchAssembler.js") continue;
    callers.push(rel);
    violations.push(...assembleCallViolations(rel, raw));
  }
  ck(`S1 src/（排除 src/debug/**）每個 assembleMatch( 呼叫都從共用 deps builder（Live＝matchAssemblerDeps.js、Challenge＝matchAssemblerDepsCore.js）取 deps；Live hook 與 Challenge runner 都在其中（${callers.length} 個檔）`,
    callers.includes("src/useLocalServer.js") && callers.includes("src/platform/challenge/challengeRunner.js") && violations.length === 0, violations.join(" | ") || callers.join(","));
  const builder = stripComments(fs.readFileSync(path.join(ROOT, "src/battle/moba/liveMatchSetup.js"), "utf8"));
  ck("S2 liveMatchSetup.js 是純函式：不讀 store／window／location／時鐘／亂數／import.meta", !/\b(useProfileStore|useHeroProgressStore|getState|window|location|localStorage|Date\.now|Math\.random|import\.meta|URLSearchParams)\b/.test(builder));
  const uls = stripComments(fs.readFileSync(path.join(ROOT, "src/useLocalServer.js"), "utf8"));
  const devReads = [...uls.matchAll(/heroSkillsDev|itemsDevRequested\s*\(/g)];
  ck("S3 useLocalServer：DEV 網址開關只在 import.meta.env.DEV 的條件式裡讀（正式 build 由 Vite 折疊掉）",
    devReads.length >= 2 && devReads.every((m) => /import\.meta\.env\.DEV\s*\?[^;]*$/.test(uls.slice(Math.max(0, m.index - 260), m.index))), `reads=${devReads.length}`);
  ck("S4 useLocalServer：不再讀 featureEnabled（旗標只在開局時經 resolveRulesetForMode 讀一次）；不再自己 new LogicEngine／configure*",
    !/featureEnabled\s*\(/.test(uls) && !/new LogicEngine/.test(uls) && !/\.configure[A-Z]\w*\s*\(/.test(uls) && /resolveLiveRuleset\s*\(/.test(uls) && /FEATURE_FLAGS/.test(uls));
  ck("S5 useLocalServer：ruleset＋matchSetupHash 寫進本場設定（activeMatch.config）",
    /ruleset\s*[:,]/.test(uls) && /matchSetupHash\s*[:,]/.test(uls) && /activeConfig/.test(uls));
  ck("S6 useLocalServer：對等掛點只在 ?shot= 時掛（同 __ESMO_COMBAT_FEEDBACK 模式）",
    /__ESMO_MATCH_SETUP_HASH/.test(uls) && /__ESMO_ENGINE_STREAM_HASH/.test(uls) && /has\(\s*["']shot["']\s*\)/.test(uls));
  //  S12（fix round 2）：hook 只決定 seed 來源並交原始值；正規化算式只在 builder（hook 裡不得再有 >>> 0／& 0xffff）
  ck("S12 seed：hook 交原始值（session seed 或 Date.now()），正規化只在 liveMatchSetup.normalizeLiveSeed",
    /const rawSeed = authoritative \? opts\.seed : Date\.now\(\);/.test(uls) && /seed:\s*rawSeed,\s*seedSource:\s*authoritative \? "session" : "local"/.test(uls)
    && !/>>>\s*0/.test(uls) && !/&\s*0xffff/.test(uls)
    && /seedSource === "session" \? \(\(rawSeed >>> 0\) \| 1\) : \(\(rawSeed & 0xffff\) \| 1\)/.test(builder) && /const seed = normalizeLiveSeed\(rawSeed, seedSource\);/.test(builder));
  //  S13（fix round 2）：?shot= 的非同步開局——掛鉤子的整段在 try/catch 裡，之後一定呼叫 launch()（鉤子出錯不得讓比賽開不了）
  ck("S13 ?shot= 開局：掛對等鉤子的程式在 try/catch 內，catch 之後無條件 launch()；import 失敗的分支也 launch()",
    /\.then\(\(m\) => \{\s*if \(startTokenRef\.current !== token\) return;\s*try \{[\s\S]*?m\.engineStreamHash\([\s\S]*?\} catch \(error\) \{[\s\S]*?\}\s*launch\(\);\s*\}, \(error\) => \{[\s\S]*?if \(startTokenRef\.current === token\) launch\(\);/.test(uls));
  //  S7：每一個 window.__ESMO_MATCH_*／__ESMO_LIVE_*／__ESMO_ENGINE_* 指派都必須落在 `if (qs.has("shot")) { … }` 區塊內（以大括號配對求區塊範圍）
  const shotBlocks = [...uls.matchAll(/if\s*\(\s*(?:qs\s*&&\s*)?qs\.has\(\s*["']shot["']\s*\)\s*\)\s*\{/g)].map((m) => {
    let depth = 0, i = m.index + m[0].length - 1;
    for (; i < uls.length; i++) { if (uls[i] === "{") depth++; else if (uls[i] === "}") { depth--; if (depth === 0) break; } }
    return [m.index, i];
  });
  const hookAssigns = [...uls.matchAll(/window\.__ESMO_(?:MATCH|LIVE|ENGINE)_\w+\s*=(?!=)/g)];
  const outside = hookAssigns.filter((m) => !shotBlocks.some(([a, b]) => m.index > a && m.index < b));
  const ctrlSrc = 'if (qs.has("shot")) { window.__ESMO_MATCH_A = 1; } window.__ESMO_LIVE_B = 2;';
  const ctrlBlocks = [[ctrlSrc.indexOf("if"), ctrlSrc.indexOf("}")]];
  const ctrlOutside = [...ctrlSrc.matchAll(/window\.__ESMO_(?:MATCH|LIVE|ENGINE)_\w+\s*=(?!=)/g)].filter((m) => !ctrlBlocks.some(([a, b]) => m.index > a && m.index < b));
  ck("S7 四個對等鉤子（MATCH_SETUP_HASH／MATCH_SETUP／LIVE_SETUP_INPUTS／ENGINE_STREAM_HASH）的指派全部在 ?shot= 區塊內（對照樣本抓得到區塊外的指派）",
    shotBlocks.length >= 1 && hookAssigns.length === 4 && outside.length === 0 && ctrlOutside.length === 1, `assigns=${hookAssigns.length} outside=${outside.length}`);
  //  S8：正式程式碼不得 import tools/；串流雜湊在 hook 只以動態 import 載入，而且在 ?shot= 區塊內
  const toolImporters = [];
  const walkAll = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const q = path.join(d, e.name); if (e.isDirectory()) walkAll(q); else if (/\.(m?js|jsx)$/.test(e.name) && /(?:from\s*|import\s*\(\s*)["'][^"']*\/tools\//.test(stripComments(fs.readFileSync(q, "utf8")))) toolImporters.push(path.relative(ROOT, q).replace(/\\/g, "/")); } };
  walkAll(path.join(ROOT, "src"));
  const dyn = [...uls.matchAll(/import\(\s*["']\.\/battle\/moba\/debug\/engineStreamHash\.js["']\s*\)/g)];
  ck("S8 src/ 沒有任何檔案 import tools/；hook 不靜態 import 串流雜湊，只在 ?shot= 區塊內動態 import", toolImporters.length === 0
    && !/^\s*import\s[^;]*engineStreamHash/m.test(uls) && dyn.length === 1 && shotBlocks.some(([a, b]) => dyn[0].index > a && dyn[0].index < b), toolImporters.join(",") || `dynamic=${dyn.length}`);
  //  S9：串流雜湊單一實作——tools/lib/matchGolden.mjs 只是轉出 src 的同一組函式
  const goldenSrc = stripComments(fs.readFileSync(path.join(ROOT, "tools/lib/matchGolden.mjs"), "utf8"));
  ck("S9 串流雜湊單一實作：matchGolden.mjs 轉出 src/battle/moba/debug/engineStreamHash.js 的同一組函式（自己沒有第二份）",
    fnv === StreamSrc.fnv && createStreamHasher === StreamSrc.createStreamHasher && engineStreamHash === StreamSrc.engineStreamHash && !/charCodeAt|0x811c9dc5/.test(goldenSrc));
  //  S10：開局被拒不丟例外——hook 沒有 throw；失敗寫進 assemblyError、回 { ok:false }；GameView 顯示訊息
  const gv = stripComments(fs.readFileSync(path.join(ROOT, "src/GameView.jsx"), "utf8"));
  ck("S10 hook 沒有 throw；失敗 ⇒ setAssemblyError＋回傳 { ok:false, errors }；GameView 以 battle-assembly-error 顯示並提供返回",
    !/\bthrow\b/.test(uls) && /setAssemblyError\(/.test(uls) && /return\s*\{\s*ok:\s*false/.test(uls) && /assemblyError/.test(gv) && /data-testid="battle-assembly-error"/.test(gv) && /data-testid="battle-assembly-error-back"/.test(gv));
  //  S14（fix round 2）：錯誤卡的出口。同一份輸入重進會再被拒 ⇒ 文案不得叫玩家「返回後重新進入」；
  //  有場次時提供「放棄本場」（既有的 abandonMatchSession()），並寫出賽程比賽的收尾方式（重新出賽或棄權）。
  const cardStart = gv.indexOf('data-testid="battle-assembly-error"');
  const card = cardStart < 0 ? "" : gv.slice(cardStart, gv.indexOf("開始遊戲", cardStart));
  ck("S14 錯誤卡：不叫玩家返回重進；有場次時有「放棄本場」（abandonMatchSession），並寫明賽程比賽要重新出賽或棄權",
    card.length > 0 && !/返回後重新進入|重新進入即可|請重新進入/.test(card)
    && /launch\?\.sessionId && \(\s*<button data-testid="battle-assembly-error-abandon" onClick=\{abandonRejectedMatch\}/.test(card)
    && /const abandonRejectedMatch = \(\) => \{[\s\S]*?useProfileStore\.getState\(\)\.abandonMatchSession\(\)[\s\S]*?onContinue\?\.\(\);/.test(gv)
    && /放棄本場/.test(card) && /棄權/.test(card) && /重新出賽/.test(card));
  //  S11：正式 build 的主 bundle 不含串流雜湊（只在 dist 比 hook 新時判定；否則略過並明講）
  const assets = path.join(ROOT, "dist/assets");
  const chunks = fs.existsSync(assets) ? fs.readdirSync(assets).filter((f) => f.endsWith(".js")) : [];
  //  index.html 直接載入的進入點 chunk＋所有 index-*.js（Vite 可能把主程式拆成不只一個 index chunk）
  const html = fs.existsSync(path.join(ROOT, "dist/index.html")) ? fs.readFileSync(path.join(ROOT, "dist/index.html"), "utf8") : "";
  const mainChunks = chunks.filter((f) => /^index-/.test(f) || html.includes(f));
  const fresh = mainChunks.length > 0 && Math.min(...mainChunks.map((f) => fs.statSync(path.join(assets, f)).mtimeMs))
    >= Math.max(...["src/useLocalServer.js", "src/battle/moba/debug/engineStreamHash.js"].map((f) => fs.statSync(path.join(ROOT, f)).mtimeMs));
  if (fresh) {
    const has = (f) => fs.readFileSync(path.join(assets, f), "utf8").includes(StreamSrc.ENGINE_STREAM_HASH_VERSION);
    const holders = chunks.filter(has);
    ck(`S11 正式 build：主 bundle（index.html 的進入點＋index-*.js，共 ${mainChunks.length} 個）不含串流雜湊模組，它在獨立的動態 chunk`,
      mainChunks.every((f) => !has(f)) && holders.length === 1 && !mainChunks.includes(holders[0]), `main=${mainChunks.join(",")} holders=${holders.join(",")}`);
  } else console.log("   S11 SKIP：dist/ 不存在或比原始碼舊（先 npm run build 再跑才會判定主 bundle）");
}

console.log(`\nLive Setup 3a：${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
process.exit(fail ? 1 : 0);
