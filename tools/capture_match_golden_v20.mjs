#!/usr/bin/env node
// ============================================================================
//  tools/capture_match_golden_v20.mjs — capture the moba-sim.v20 golden baseline (Phase 3a, T0 / G-A0)
//
//  Run ONCE on unmodified v20 code (before any Phase 3a refactor):
//      node tools/capture_match_golden_v20.mjs > <scratchpad>/golden.log 2>&1
//  Writes tools/fixtures/match_golden_v20.json.  Later parity gates (T3-T7) rebuild the same
//  inputs (they are recorded in the fixture under `inputs`) and compare digests / call order.
//
//  Flags:  --out=<path>   write elsewhere (determinism re-run: diff the two files)
//          --force        overwrite an existing fixture (refused by default: single-shot capture)
//          --only=a,b     only these case ids (spot checks; does NOT write unless --out is given)
//          --skip-verify  skip the un-instrumented cross-check pass
//
//  Three assembly paths, all with the CURRENT code (nothing under src/ is modified):
//   1. live       Node replica of src/useLocalServer.js start() (lines 147-313, a React hook that
//                 cannot run in Node): same configure sequence, fixed inputs instead of store reads.
//   2. challenge  the real runChallenge() from src/platform/challenge/challengeRunner.js
//   3. runner     the real configure() from tools/balance/moba_items_balance_runner.mjs
//
//  Owner addendum: besides result hashes every case records
//   · calls     ordered list of configure* methods actually invoked, each with an 8-hex hash of
//               stableStringify(argument)   → pins assembly ORDER and argument CONTENT
//   · features  which layers were applied (layout, playerStat sides, skills/passives/curve,
//               talents, items + strategies, tactic ids on both sides, ...)
//
//  Instrumentation = wrapping LogicEngine.prototype.configure*/tick (pass-through, same `this`, same
//  args, same return).  Proof it is non-invasive: every case is first run UN-instrumented
//  (reference pass), then instrumented; digests / stream hashes / result hashes must be identical
//  (recorded under `verification`).  Challenge: runChallenge does not expose its engine, so the
//  reference pass compares the full ChallengeResult hash instead of an engine digest.
//
//  Determinism: stdout contains no timings (timings go to stderr); fixture key order is fixed.
//
//  ESMO_BALANCE_SKILLS / ESMO_BALANCE_TALENTS are read by the runner at module load.  Instead of
//  two child processes this script loads the runner with both = on, then derives the "off" module
//  set by nulling skills/talents/passives/curves (exactly what the runner's env-off load yields).
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_PATH = path.join(ROOT, "tools", "fixtures", "match_golden_v20.json");
const argv = process.argv.slice(2);
const argOf = (name) => { const hit = argv.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : null; };
const flag = (name) => argv.includes(`--${name}`);
const OUT = argOf("out") ? path.resolve(argOf("out")) : FIXTURE_PATH;
const ONLY = argOf("only") ? new Set(argOf("only").split(",")) : null;
const VERIFY = !flag("skip-verify");
const err = (s) => process.stderr.write(s + "\n");
const log = (s) => process.stdout.write(s + "\n");
const die = (s) => { err(`FATAL: ${s}`); process.exit(1); };

if (!ONLY && fs.existsSync(OUT) && !flag("force")) die(`${OUT} exists. Single-shot capture: pass --force (or --out=<other>) to overwrite.`);
if (ONLY && OUT === FIXTURE_PATH) die("--only never writes the real fixture; pass --out=<scratch path>");

//  Balance env must be clean (this script sets the two it needs itself, below).
const dirtyEnv = Object.keys(process.env).filter((k) => k.startsWith("ESMO_BALANCE_"));
if (dirtyEnv.length) die(`unset these env vars first: ${dirtyEnv.join(", ")}`);
process.env.ESMO_BALANCE_SKILLS = "on";
process.env.ESMO_BALANCE_TALENTS = "on";

const { GOLDEN_CASES, createStreamHasher, runToEnd, runAndHash, finalDigest, fnv } = await import("./lib/matchGolden.mjs");
const { LogicEngine } = await import("../src/LogicEngine.js");
const { MOBA_SIMULATION_VERSION, SIMULATION_SEMANTICS_FINGERPRINTS } = await import("../src/platform/contracts/simulationVersion.js");
const { FEATURE_FLAGS, featureEnabled } = await import("../src/featureFlags.js");
const { stableStringify, stableHash, snapshotHashOf, SNAPSHOT_INPUTS } = await import("../src/platform/contracts/squadSnapshot.js");
const { STAT_DEF } = await import("../src/data/playerModel.js");
const { ROLES } = await import("../src/gameData.js");
const { CHAMPIONS_100, heroById } = await import("../src/data/heroDatabase.js");
const { HERO_ASSIGN, ALL_HERO_IDS } = await import("../src/data/roster.js");
const { buildLoadout, createInitialProgress } = await import("../src/hero/heroProgress.js");
const { buildPlayerStatSlots, applyFatigueToLoadout } = await import("../src/battle/moba/mobaRosterAdapter.js");
const { toEnginePlayerMods } = await import("../src/battle/moba/mobaPlayerStats.js");
const { toEngineHeroMods } = await import("../src/battle/moba/mobaHeroProfile.js");
const { toEngineSpells, buildLoadout: buildHeroLoadout } = await import("../src/battle/moba/mobaHeroLoadout.js");
const { toEngineArchetypes, COMBAT_ARCHETYPE_CONTRACT_VERSION } = await import("../src/data/heroCombatArchetypes.js");
const { toEngineHeroSkills } = await import("../src/battle/moba/skills/heroSkillGameplay.js");
const { toEngineHeroPassives } = await import("../src/battle/moba/skills/heroPassiveGameplay.js");
const { toEngineHeroPowerCurve } = await import("../src/battle/moba/heroPowerCurve.js");
const { selectBattleTalents, battleTalentOptions } = await import("../src/battle/moba/talents/heroBattleTalents.js");
const { resolveObjectiveLayout } = await import("../src/platform/contracts/objectiveLayout.js");
const { matchItemsConfig, normalizeBuildStrategy } = await import("../src/battle/moba/items/buildStrategyPrep.js");
const { toEngineTactic, toEngineTacticIdentity, STANDARD_OPP_TACTIC, MOBA_TACTIC_VERSION, mobaTacticForTeamStyle, mobaTacticById } =
  await import("../src/platform/contracts/MobaTacticConfig.js");
const { AI_TEAMS, aiTeamById } = await import("../src/platform/competition/aiTeams.js");
const { runChallenge } = await import("../src/platform/challenge/challengeRunner.js");
const { fixtureSnapshot, FIXTURE_OPPONENTS } = await import("../src/platform/challenge/fixtureOpponents.js");
const { createDraftResult } = await import("../src/platform/challenge/draftResult.js");
const { assignDraft } = await import("../src/battle/moba/mobaDraftAssignment.js");
const { heroTags } = await import("../src/data/heroClassification.js");
const { createChallengeInstance } = await import("../src/platform/contracts/challengeInstance.js");
const { SNAPSHOT_AUTHORITY } = await import("../src/platform/challenge/snapshotAuthority.js");
const runnerMod = await import("./balance/moba_items_balance_runner.mjs");

// ── provenance guards ───────────────────────────────────────────────────────
const EXPECT_SIM = "moba-sim.v20";
const EXPECT_FINGERPRINT = "050b3f66620f0f57";
if (MOBA_SIMULATION_VERSION !== EXPECT_SIM) die(`simulation version is ${MOBA_SIMULATION_VERSION}, expected ${EXPECT_SIM}`);
const FINGERPRINT = SIMULATION_SEMANTICS_FINGERPRINTS[MOBA_SIMULATION_VERSION];
if (FINGERPRINT !== EXPECT_FINGERPRINT) die(`fingerprint is ${FINGERPRINT}, expected ${EXPECT_FINGERPRINT}`);
const git = (cmd) => execSync(`git ${cmd}`, { cwd: ROOT, encoding: "utf8" }).trim();
const GIT_HEAD = git("rev-parse HEAD");
const SRC_DIRTY = git("status --porcelain -- src tools/balance").split("\n").filter(Boolean);
if (SRC_DIRTY.length && !ONLY) die(`src/ (or tools/balance) is not clean — capture must run on committed v20 code:\n${SRC_DIRTY.join("\n")}`);

// ── M (runner module set) ───────────────────────────────────────────────────
const M_ON = await runnerMod.modules();
if (!M_ON.skills || !M_ON.talents) die("runner modules() did not load skills/talents");
const M_OFF = { ...M_ON, skills: null, talents: null, passives: null, curves: null };
//  Same engine class instance everywhere?  (module identity: static import vs the runner's pathToFileURL import)
const ENGINE_CLASSES = [...new Set([LogicEngine, M_ON.LE.LogicEngine])];

// ── Probe: pass-through wrappers on LogicEngine.prototype ───────────────────
const PROBE = { ctx: null, installed: false, originals: [] };
function installProbe() {
  if (PROBE.installed) return;
  for (const Cls of ENGINE_CLASSES) {
    const proto = Cls.prototype;
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (!/^configure|^enable/.test(name) || typeof proto[name] !== "function") continue;
      const orig = proto[name];
      PROBE.originals.push([proto, name, orig]);
      proto[name] = function probed(...args) {
        const ctx = PROBE.ctx;
        if (ctx) {
          const arg = args.length <= 1 ? args[0] : args;
          ctx.engine ??= this;
          ctx.calls.push({ m: name, h: stableHash(stableStringify(arg)), _arg: arg });
        }
        return orig.apply(this, args);
      };
    }
    const tick = proto.tick;
    PROBE.originals.push([proto, "tick", tick]);
    proto.tick = function probedTick(...args) {
      const r = tick.apply(this, args);
      const ctx = PROBE.ctx;
      if (ctx) { ctx.engine ??= this; ctx.hasher.sample(this); }
      return r;
    };
  }
  PROBE.installed = true;
}
function uninstallProbe() {
  for (const [proto, name, orig] of PROBE.originals.reverse()) proto[name] = orig;
  PROBE.originals = []; PROBE.installed = false;
}
const beginProbe = () => { PROBE.ctx = { calls: [], engine: null, hasher: createStreamHasher(20), meta: {} }; return PROBE.ctx; };
const endProbe = () => { const c = PROBE.ctx; PROBE.ctx = null; return c; };

// ── Fixed inputs ────────────────────────────────────────────────────────────
const STAT_KEYS = STAT_DEF.map((s) => s.key);
//  5 fixed blue players (ids deliberately NOT b1..b5 so the lineup indirection is exercised); player 3 is tired
//  (energy 55) so the fatigue multipliers on stats AND loadout are exercised too.
const PLAYERS = [0, 1, 2, 3, 4].map((i) => ({
  id: `golden_p${i + 1}`, name: `G${i + 1}`, role: ROLES[i], status: "主力", rosterTier: "active",
  energy: i === 2 ? 55 : 100,
  stats: Object.fromEntries(STAT_KEYS.map((k, j) => [k, 40 + ((i * 7 + j * 5) % 45)])),
}));
const LINEUP = Object.fromEntries(["b1", "b2", "b3", "b4", "b5"].map((s, i) => [s, PLAYERS[i].id]));
//  "default hero mastery" = what heroProgressStore.getLoadout() returns on a fresh install:
//  buildLoadout(createInitialProgress(ALL_HERO_IDS), HERO_ASSIGN)  → every seat level 1.
const DEFAULT_LOADOUT = buildLoadout(createInitialProgress(ALL_HERO_IDS), HERO_ASSIGN);

const lcg = (seed) => { let s = (seed * 2654435761) >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const ROLE_ARCH = { top: ["戰士", "坦克"], jungle: ["刺客", "戰士"], mid: ["法師"], adc: ["射手"], sup: ["輔助", "坦克"] };
/** Non-mirrored roster: 10 distinct heroes, blue first then red, by role→archetype (same idea as the runner's mirroredRoster). */
function liveRoster(seed) {
  const rnd = lcg(seed ^ 0x5eed);
  const roster = {}, used = new Set();
  for (const side of ["b", "r"]) {
    ROLES.forEach((role, i) => {
      const archs = ROLE_ARCH[role];
      const arch = archs[Math.floor(rnd() * archs.length)];
      const pool = CHAMPIONS_100.filter((h) => h.arch === arch && !used.has(h.id));
      const hero = pool[Math.floor(rnd() * pool.length)];
      used.add(hero.id);
      roster[`${side}${i + 1}`] = { heroId: hero.id, hero };
    });
  }
  for (const [seat, e] of Object.entries(buildHeroLoadout(roster, heroById))) roster[seat].spells = e.spells;
  return roster;
}
const rosterRecord = (roster) => Object.fromEntries(Object.entries(roster).map(([s, r]) => [s, { heroId: r.heroId, spells: r.spells ?? null }]));
/** Player's talent picks for blue seats (last option of each hero → not the AI default in most cases). */
const talentPicksFor = (roster) => Object.fromEntries(["b1", "b2", "b3", "b4", "b5"].map((s) => {
  const opts = battleTalentOptions(roster[s].heroId);
  return [s, opts.length ? opts[opts.length - 1].id : null];
}).filter(([, id]) => id));

// ── Path 1: Live replica of useLocalServer.start() ──────────────────────────
function assembleLive(c) {
  const opts = {
    seed: c.seed, roster: liveRoster(c.seed), tactic: mobaTacticById(c.tacticId), buildStrategy: c.buildStrategy,
    opponentId: c.opponent === "ai" ? AI_TEAMS[c.index % AI_TEAMS.length].id : null,
  };
  opts.talentSelections = c.talents ? talentPicksFor(opts.roster) : undefined;
  if (PROBE.ctx) PROBE.ctx.meta = { liveOpts: { opponentId: opts.opponentId, talentSelections: opts.talentSelections ?? null } };

  const loadout = applyFatigueToLoadout(DEFAULT_LOADOUT, PLAYERS, LINEUP);          // :153-156
  const seed = ((opts.seed >>> 0) | 1);                                                // :165-166 (authoritative)
  const eng = new LogicEngine(seed, loadout);                                          // :167
  const objectiveLayout = resolveObjectiveLayout({ explicit: null, seed });            // :170
  eng.configureObjectiveLayout(objectiveLayout);                                       // :171
  const heroSkillsOn = featureEnabled("heroSkillsV1");                                 // :172 (DEV query branch is browser-only)
  const selectedTalents = heroSkillsOn && featureEnabled("heroBattleTalentsV1") && opts.roster
    ? selectBattleTalents(opts.roster, opts.talentSelections) : null;                  // :174-175
  const talentSelection = selectedTalents && Object.keys(selectedTalents.players).length ? selectedTalents : null;  // :176
  //  (beginReplayCapture :184-193 is replay bookkeeping, not engine configuration — omitted)
  const playerMods = toEnginePlayerMods({ blue: buildPlayerStatSlots(PLAYERS, "blue", LINEUP), red: [] });  // :204-206
  if (playerMods) eng.configurePlayers(playerMods);                                    // :207
  const heroMods = opts.roster ? toEngineHeroMods(opts.roster, heroById) : null;       // :215
  if (heroMods) eng.configureHeroes(heroMods);                                         // :216
  if (heroSkillsOn && opts.roster) {                                                   // :220-229
    const skills = toEngineHeroSkills(opts.roster, talentSelection);
    if (skills) eng.configureHeroSkills(skills);
    const passives = skills ? toEngineHeroPassives(opts.roster) : null;
    if (passives) eng.configureHeroPassives(passives);
    const curves = skills ? toEngineHeroPowerCurve(opts.roster) : null;
    if (curves) eng.configureHeroPowerCurve(curves);
  }
  const archMods = opts.roster ? toEngineArchetypes(opts.roster) : null;              // :237-247
  if (archMods && Object.keys(archMods).length) {
    const blue = {}, red = {};
    for (const [pid, mod] of Object.entries(archMods)) (String(pid)[0] === "r" ? red : blue)[pid] = mod;
    eng.configureArchetypes({ blue, red, meta: { version: COMBAT_ARCHETYPE_CONTRACT_VERSION, seats: Object.keys(archMods).length } });
  }
  //  (?diag=1 / ?shot= → enableCombatDebug :252-255 is browser-only and off in production)
  const spellMods = opts.roster ? toEngineSpells(opts.roster) : null;                  // :262
  if (spellMods) eng.configureSpells(spellMods);                                       // :263
  if (opts.tactic?.tacticId) {                                                         // :270-280
    const oppTeam = opts.opponentId ? aiTeamById(opts.opponentId) : null;
    const redTactic = oppTeam ? mobaTacticForTeamStyle(oppTeam.style) : STANDARD_OPP_TACTIC;
    eng.configureMatch({
      blue: toEngineTactic(opts.tactic),
      red: toEngineTactic(redTactic),
      identity: { blue: toEngineTacticIdentity(opts.tactic), red: toEngineTacticIdentity(redTactic) },
      meta: { tacticId: opts.tactic.tacticId, tacticName: opts.tactic.name, version: MOBA_TACTIC_VERSION, opponentTacticId: redTactic.tacticId },
    });
  }
  const itemsOn = featureEnabled("itemsV1");                                           // :290 (DEV query branch is browser-only)
  const buildStrategy = itemsOn && opts.roster ? normalizeBuildStrategy(opts.buildStrategy) : null;  // :291
  if (buildStrategy) {                                                                 // :292-295
    const itemsCfg = matchItemsConfig({ roster: opts.roster, heroLookup: heroById, buildStrategy });
    if (itemsCfg) eng.configureItems(itemsCfg);
  }
  if (PROBE.ctx) PROBE.ctx.meta.live = { seed, loadoutHash: stableHash(stableStringify(loadout)), objectiveLayout, buildStrategy, redTacticId: (opts.opponentId ? mobaTacticForTeamStyle(aiTeamById(opts.opponentId).style) : STANDARD_OPP_TACTIC).tacticId, talentSources: talentSelection ? Object.fromEntries(Object.entries(talentSelection.players).map(([s, r]) => [s, r.source])) : null };
  return eng;
}

// ── Path 2: Challenge via the real runChallenge ─────────────────────────────
const POOL = CHAMPIONS_100.map((h) => h.id).sort();
const laneOf = (id) => heroById(id)?.lane ?? null;
const FIXTURE_KEYS = FIXTURE_OPPONENTS.map((o) => o.key);
const withTactic = (snap, tacticId) => {
  const s = { ...snap, standingOrders: { ...snap.standingOrders, tacticId } };
  s.hash = snapshotHashOf(s);
  return s;
};
const withoutDraftPolicy = (snap) => {
  const s = { ...snap, capturedInputs: snap.capturedInputs.filter((x) => x !== SNAPSHOT_INPUTS.draftPolicy) };
  s.hash = snapshotHashOf(s);
  return s;
};
const CH_CACHE = new Map();
/** Deterministic inputs of a challenge case (cached; contains NO engine). */
function challengeInputs(c) {
  if (CH_CACHE.has(c.id)) return CH_CACHE.get(c.id);
  const keyA = FIXTURE_KEYS[c.index % FIXTURE_KEYS.length];
  const keyB = FIXTURE_KEYS[(c.index + 2) % FIXTURE_KEYS.length];
  let a = withTactic(fixtureSnapshot(keyA, { playerMasteryLevel: 1 }).snapshot, c.tacticIds[0]);
  let d = withTactic(fixtureSnapshot(keyB, { playerMasteryLevel: 1 }).snapshot, c.tacticIds[1]);
  if (!c.draft) { a = withoutDraftPolicy(a); d = withoutDraftPolicy(d); }
  let draftResult = null;
  if (c.draft) {
    const r = createDraftResult({
      challengerActions: [], defenderPolicy: d.standingOrders.draftPolicy, challengerPolicy: a.standingOrders.draftPolicy,
      pool: POOL, challengerSnapshot: a, defenderSnapshot: d, assign: assignDraft, tagsOf: heroTags, heroOf: heroById, laneOf,
    });
    if (!r.ok) die(`draft failed for ${c.id}: ${r.errors.map((e) => e.message).join("|")}`);
    draftResult = r.draft;
  }
  const inst = createChallengeInstance({
    challenger: a, defender: d, challengerTacticId: c.tacticIds[0], seedSource: c.seed, createdAt: 1757000000000,
    issuedBy: SNAPSHOT_AUTHORITY.id, nonce: `golden-${c.id}`, opponentKey: keyB, draftResult,
  });
  if (!inst.ok) die(`challenge instance failed for ${c.id}: ${inst.errors.map((e) => e.message).join("|")}`);
  const v = { challenger: a, defender: d, challenge: inst.challenge, draftResult, keyA, keyB };
  CH_CACHE.set(c.id, v);
  return v;
}
const runChallengeCase = (c) => {
  const v = challengeInputs(c);
  const r = runChallenge({ challenge: v.challenge, challengerSnapshot: v.challenger, defenderSnapshot: v.defender, draftResult: v.draftResult, heroOf: heroById });
  if (!r.ok) die(`runChallenge failed for ${c.id}: ${JSON.stringify(r.errors)}`);
  return r.result;
};

// ── Path 3: balance runner configure() ──────────────────────────────────────
const assembleRunner = (c) => runnerMod.configure(c.seed, c.config, c.skills ? M_ON : M_OFF).e;

// ── Features: which layers were applied (derived from the calls actually made) ─
function featuresOf(calls, meta) {
  const arg = (m) => calls.find((x) => x.m === m)?._arg;
  const has = (m) => calls.some((x) => x.m === m);
  const sides = (a) => (a ? ["blue", "red"].filter((s) => a[s] && Object.keys(a[s]).length) : []);
  const match = arg("configureMatch");
  const items = arg("configureItems");
  const itemPlayers = items?.players ?? null;
  const strategyOf = (side) => itemPlayers ? [...new Set(Object.entries(itemPlayers).filter(([pid]) => pid[0] === side).map(([, v]) => v.strategy ?? null))].sort() : null;
  return {
    objectiveLayout: arg("configureObjectiveLayout") ?? null,
    playerStatSides: sides(arg("configurePlayers")),
    heroMods: has("configureHeroes"),
    heroSkills: has("configureHeroSkills"),
    heroPassives: has("configureHeroPassives"),
    heroPowerCurve: has("configureHeroPowerCurve"),
    archetypes: has("configureArchetypes"),
    spells: has("configureSpells"),
    battleTalents: meta.live ? { applied: !!meta.live.talentSources, sources: meta.live.talentSources } : (has("configureHeroSkills") ? { applied: true, sources: "runner: selectBattleTalents(roster) without picks (all AI)" } : { applied: false, sources: null }),
    tactic: match ? {
      blue: match.meta?.tacticId ?? match.blue?.tacticId ?? null,
      red: match.meta?.opponentTacticId ?? match.red?.tacticId ?? null,
      identity: !!match.identity,
    } : null,
    items: items ? { applied: true, players: Object.keys(itemPlayers ?? {}).length, blueStrategies: strategyOf("b"), redStrategies: strategyOf("r") } : { applied: false },
    order: calls.map((x) => x.m),
  };
}

// ── Case execution ──────────────────────────────────────────────────────────
const resultBrief = (r) => ({ outcome: r.outcome, durationSec: r.durationSec, score: r.score, matchSeed: r.matchSeed, usedInputs: r.usedInputs, draftHash: r.draft?.hash ?? null });
const resultHash = (r) => stableHash(stableStringify(r));

/** Reference pass: NO probe installed.  Live/runner → engine digests; challenge → full-result hash. */
function runPlain(c) {
  if (c.path === "challenge") return { resultHash: resultHash(runChallengeCase(c)) };
  const eng = c.path === "live" ? assembleLive(c) : assembleRunner(c);
  return runAndHash(eng, { dt: 0.5, maxT: 3600, every: 20 });
}
/** Instrumented pass: probe installed; records calls + features + digests. */
function runProbed(c) {
  const ctx = beginProbe();
  let rec;
  if (c.path === "challenge") {
    const result = runChallengeCase(c);
    const v = challengeInputs(c);
    const calls = ctx.calls;
    rec = {
      digest: finalDigest(ctx.engine), streamHash: ctx.hasher.hex, resultHash: resultHash(result), result: resultBrief(result),
      ctor: { seed: result.matchSeed, challengerHash: v.challenger.hash, defenderHash: v.defender.hash, draftHash: v.draftResult?.hash ?? null,
        challengerKey: v.keyA, defenderKey: v.keyB, challengerTactic: c.tacticIds[0], defenderTactic: c.tacticIds[1] },
      _calls: calls, _engine: ctx.engine,
    };
  } else {
    const eng = c.path === "live" ? assembleLive(c) : assembleRunner(c);
    runToEnd(eng, { dt: 0.5, maxT: 3600 });
    rec = { digest: finalDigest(eng), streamHash: ctx.hasher.hex, _calls: ctx.calls, _engine: eng,
      ctor: c.path === "live" ? { seed: ctx.meta.live.seed, loadoutHash: ctx.meta.live.loadoutHash } : { seed: c.seed, loadoutHash: null } };
  }
  const meta = endProbe().meta;
  rec.features = featuresOf(rec._calls, meta);
  rec.calls = rec._calls.map(({ m, h }) => ({ m, h }));
  if (c.path === "live") { rec.live = meta.live; rec.liveOpts = meta.liveOpts; }
  delete rec._calls; delete rec._engine;
  return rec;
}

const cases = GOLDEN_CASES.filter((c) => !ONLY || ONLY.has(c.id));
if (!cases.length) die("no cases selected");
log(`capture moba-golden v20: ${cases.length} cases, sim=${MOBA_SIMULATION_VERSION}, fingerprint=${FINGERPRINT}`);
log(`engine classes to instrument: ${ENGINE_CLASSES.length} (static import and runner import ${ENGINE_CLASSES.length === 1 ? "share one module instance" : "are DIFFERENT instances, both wrapped"})`);

const t0 = Date.now();
const plain = new Map();
if (VERIFY) {
  log("reference pass (un-instrumented)");
  for (const [n, c] of cases.entries()) { plain.set(c.id, runPlain(c)); err(`  plain ${n + 1}/${cases.length} ${c.id} ${((Date.now() - t0) / 1000).toFixed(0)}s`); }
}
installProbe();
log("instrumented pass");
const records = [];
for (const [n, c] of cases.entries()) { records.push([c, runProbed(c)]); err(`  probed ${n + 1}/${cases.length} ${c.id} ${((Date.now() - t0) / 1000).toFixed(0)}s`); }
uninstallProbe();

// ── Verification: instrumentation did not change anything ───────────────────
const mismatches = [];
let compared = 0;
if (VERIFY) {
  for (const [c, rec] of records) {
    const p = plain.get(c.id);
    compared++;
    if (c.path === "challenge") {
      if (p.resultHash !== rec.resultHash) mismatches.push(`${c.id}: resultHash ${p.resultHash} != ${rec.resultHash}`);
      //  the probe-observed engine must agree with the public result
      const r = rec.result;
      const [t, , bK, rK] = rec.digest.split(":");
      if (Math.round(Number(t)) !== r.durationSec || Number(bK) !== r.score.challenger || Number(rK) !== r.score.defender) mismatches.push(`${c.id}: probe digest ${rec.digest} disagrees with result ${JSON.stringify(r)}`);
    } else {
      if (p.digest !== rec.digest) mismatches.push(`${c.id}: digest ${p.digest} != ${rec.digest}`);
      if (p.streamHash !== rec.streamHash) mismatches.push(`${c.id}: streamHash ${p.streamHash} != ${rec.streamHash}`);
    }
  }
  if (mismatches.length) { log("INSTRUMENTATION CHANGED BEHAVIOR:"); mismatches.forEach((m) => log("  " + m)); die("probe is not transparent"); }
  log(`verification: ${compared}/${compared} cases identical with and without instrumentation`);
}

// ── Assemble the fixture (key order is part of the contract) ────────────────
const perPath = (p) => records.filter(([c]) => c.path === p).length;
const fixture = {
  schema: "match_golden_v20.v1",
  simVersion: MOBA_SIMULATION_VERSION,
  fingerprint: FINGERPRINT,
  gitHead: GIT_HEAD,
  node: process.version,
  featureFlags: { ...FEATURE_FLAGS },
  dt: 0.5, maxT: { live: 3600, runner: 3600, challenge: 1800 }, streamEvery: 20,
  verification: VERIFY
    ? { instrumentationNonInvasive: true, compared, note: "live/runner: digest+streamHash equal; challenge: full ChallengeResult hash equal and probe-observed engine agrees with result" }
    : { instrumentationNonInvasive: null, note: "skipped (--skip-verify)" },
  counts: { total: records.length, live: perPath("live"), challenge: perPath("challenge"), runner: perPath("runner") },
  inputs: {
    note: "Rebuild every case from these. liveRoster(seed): LCG(seed^0x5eed), per role pick archetype then hero from CHAMPIONS_100, blue then red, distinct. Challenge snapshots = fixtureSnapshot(keyA/keyB) with standingOrders.tacticId overridden (+ rehash); no-draft cases drop draftPolicy from capturedInputs (+ rehash).",
    statKeys: STAT_KEYS,
    players: PLAYERS,
    lineup: LINEUP,
    loadoutRule: "buildLoadout(createInitialProgress(ALL_HERO_IDS), HERO_ASSIGN) — fresh-install default, every seat level 1; then applyFatigueToLoadout(.., players, lineup)",
    defaultLoadout: DEFAULT_LOADOUT,
    liveRosters: Object.fromEntries([...new Set(records.filter(([c]) => c.path === "live").map(([c]) => c.seed))].map((s) => [s, rosterRecord(liveRoster(s))])),
    runnerRosters: Object.fromEntries([...new Set(records.filter(([c]) => c.path === "runner").map(([c]) => c.seed))].map((s) => [s, rosterRecord(runnerMod.mirroredRoster(s, M_ON))])),
    aiTeams: AI_TEAMS.map((t) => ({ id: t.id, style: t.style })),
    fixtureOpponentKeys: FIXTURE_KEYS,
  },
  cases: records.map(([c, rec]) => ({
    id: c.id, path: c.path, seed: c.seed, params: c,
    digest: rec.digest, streamHash: rec.streamHash,
    ...(rec.resultHash ? { resultHash: rec.resultHash, result: rec.result } : {}),
    ctor: rec.ctor,
    ...(rec.live ? { live: rec.live, liveOpts: rec.liveOpts } : {}),
    features: rec.features,
    calls: rec.calls,
  })),
};

if (ONLY && !argOf("out")) die("--only requires --out");
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(fixture, null, 2) + "\n", "utf8");
const bytes = fs.readFileSync(OUT);
log(`wrote ${path.basename(OUT)} —${records.length} cases (live ${perPath("live")}, challenge ${perPath("challenge")}, runner ${perPath("runner")}), fnv=${fnv(bytes.toString("utf8")).toString(16)}`);
err(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
