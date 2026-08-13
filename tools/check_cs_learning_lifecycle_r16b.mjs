#!/usr/bin/env node
// CS Learning Lifecycle / State Design R16-B
// Evidence-only verifier. No Store is instantiated and no production file is written.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { csR15EvidenceSources } from "./cs_r15_legacy_source.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FILES = Object.freeze({
  fps: resolve(ROOT, "src/battle/fps/EsportsFPS3D.jsx"),
  fpsRoster: resolve(ROOT, "src/battle/fps/fpsRoster.js"),
  playerModel: resolve(ROOT, "src/data/playerModel.js"),
  derived: resolve(ROOT, "src/platform/talents/playerDerivedStats.js"),
  talents: resolve(ROOT, "src/platform/talents/talentDefinitions.js"),
  profileStore: resolve(ROOT, "src/platform/profileStore.js"),
  csContract: resolve(ROOT, "src/platform/contracts/CsMatchResult.js"),
});
const SCHEMA = "CsLearningLifecycle.v1";
const RNG_CALL_SITES = 21;

const EXPECTED_SOURCE_SHA256 = Object.freeze({
  fps: "7622f87b8b389a504c19b887b860de791dbf8ea240e6ba57c424e159cb655c89",
  fpsRoster: "3b6611291f37c5c13fb2b20ed4b4486cb41ac979481a50e37a3f8be71dcfcdf6",
  playerModel: "9d6f07f8a18518626bbf6b5d4de2985b919f4519292e53957feb5f0be17582b7",
  derived: "5ff245492cf993533ac3b30f8db7c750ad6dd23bcf5674071314c286299fbb8e",
  talents: "566bbd82c36076b4ae3f260d5a4f73e8c0138a864a9abd3944f25730e5286c4f",
  profileStore: "d314b67b84a0db28710e37db3962569007979dba283ce892db39df69fb3f60db",
  csContract: "3f82bf3c5e8b7ebcc15e7b2d0e8faebc5d36cb52fb29093d9eaa7b33f43c1e06",
});

// Lock after the first evidence review; no update/rebaseline flag exists.
const EXPECTED_EVIDENCE_SHA256 = "02561a4e3979a2869435d6e2edb4aac9be4e501fd88020729bc8f199755d979b";

function gate(ok, code, detail = "") {
  if (!ok) throw new Error(`[${code}]${detail ? `\n${detail}` : ""}`);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "undefined") return null;
  if (typeof value === "number") {
    gate(Number.isFinite(value), "NON_FINITE_NUMBER", String(value));
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map(canonical);
  gate(typeof value === "object", "UNSUPPORTED_VALUE", typeof value);
  const out = {};
  for (const key of Object.keys(value).sort()) out[key] = canonical(value[key]);
  return out;
}

function json(value) {
  return JSON.stringify(canonical(value));
}

function sourceBlock(source, startMarker, endMarker, code) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  gate(start >= 0 && end > start, `${code}_BLOCK_MISSING`);
  return source.slice(start, end);
}

function readSources() {
  const out = {};
  for (const [key, path] of Object.entries(FILES)) {
    let source = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
    if (key === "fps") {
      const historical = csR15EvidenceSources(source)?.r15;
      gate(historical, "HISTORICAL_FPS_VIEW");
      source = historical;
    }
    const actual = sha256(source);
    const allowed = key === "profileStore"
      ? new Set([EXPECTED_SOURCE_SHA256[key], "bd6ad243c60411fd5c9bd7189190fe60712ff0d5b2fced5e72b71fa1cdb0bf4e"])
      : new Set([EXPECTED_SOURCE_SHA256[key]]);
    gate(allowed.has(actual), "SOURCE_SHA256", `${key} expected=${EXPECTED_SOURCE_SHA256[key]} actual=${actual}`);
    out[key] = source;
  }
  return out;
}

function staticAudit(sources) {
  const fps = sources.fps;
  const roster = sources.fpsRoster;
  const playerModel = sources.playerModel;
  const derived = sources.derived;
  const talents = sources.talents;
  const profileStore = sources.profileStore;
  const csContract = sources.csContract;

  gate((fps.match(/\brand\s*\(\s*\)/g) ?? []).length === RNG_CALL_SITES, "RNG_CALL_SITES");
  gate(roster.includes('learning: "lrn"') || roster.includes('learning:"lrn"'), "ADAPTER_LRN_MAPPING");
  gate(playerModel.includes('{ key: "learning",') && playerModel.includes("learning: 0.5"), "CANONICAL_LEARNING_STAT");
  gate(playerModel.includes('id: "meta"') && playerModel.includes('stats: ["learning", "tacticalIQ"]'), "TRAINING_LEARNING_COURSE");
  gate(talents.includes('T("team_3"') && talents.includes('{ stat: "learning", perRank: 2 }'), "TALENT_LEARNING_EFFECT");
  gate(derived.includes("getPlayerDerivedStats") && derived.includes("bonus[e.stat]"), "DERIVED_LEARNING_LAYER");
  gate(profileStore.includes("applyCourse(p, courseId)") && profileStore.includes("statsAfter: done.stats"), "TRAINING_UPDATE_CHAIN");
  gate(profileStore.includes("players: INITIAL_PLAYERS.map(migratePlayer)"), "PLAYER_STATE_OWNER");
  gate(profileStore.includes("csHistory: arr(saved.csHistory, [])"), "CS_HISTORY_PERSISTENCE_CHAIN");
  gate(!csContract.includes("learning") && !csContract.includes("lrn"), "CS_CONTRACT_LEARNING_FIELD");

  const simulatorStart = fps.indexOf("function simulateFps(");
  const simulatorEnd = fps.indexOf("\nfunction buildMatchResult", simulatorStart);
  gate(simulatorStart >= 0 && simulatorEnd > simulatorStart, "SIMULATOR_BLOCK");
  const simulator = fps.slice(simulatorStart, simulatorEnd);
  gate(!/\blrn\b/.test(simulator), "SIMULATOR_LRN_READ");

  const combat = sourceBlock(fps, "function combatSkill", "// 進攻性", "COMBAT_SKILL");
  gate(!combat.includes('S("lrn")'), "COMBAT_LRN_READ");
  const aggro = sourceBlock(fps, "function aggr", "// ── 戰術剋制", "AGGRO");
  gate(!aggro.includes("lrn"), "AGGRO_LRN_READ");
  const tactic = sourceBlock(fps, "function tacticEdge", "const GUNS=", "TACTIC_EDGE");
  gate(!tactic.includes("lrn"), "TACTIC_LRN_READ");
  gate(fps.includes('["lrn","學習力"]'), "DISPLAY_LRN_LABEL");
  gate(fps.includes("FPS_W={") && fps.includes("lrn:0.5"), "FPS_DISPLAY_WEIGHT");
  gate(fps.includes("genius:    {zh:\"天才型\",boost:[\"rxn\",\"lrn\"]"), "PERSONALITY_LRN_DECLARATION");

  return {
    canonicalSource: "playerModel.STAT_DEF.learning",
    growthSources: ["TRAINING_COURSES.meta", "talentDefinitions.team_3"],
    derivedLayer: "getPlayerDerivedStats",
    csAdapter: "fpsRoster.STAT_L2S.learning -> lrn",
    persistentOwner: "profileStore.players[].stats.learning",
    trainingState: "profileStore.players[].training",
    historicalTrace: "profileStore.players[].growthLog[].statsAfter",
    csHistoryConsumer: false,
    csResultContractConsumer: false,
    simulatorConsumer: false,
    combatSkillConsumer: false,
    tacticConsumer: false,
    utilityConsumer: false,
    rngCallSites: RNG_CALL_SITES,
    diagnosis: "data-model/lifecycle design gap; not a lost adapter field and not a balance weight bug",
  };
}

async function pureDataProbe() {
  const playerModel = await import(pathToFileURL(FILES.playerModel).href);
  const derived = await import(pathToFileURL(FILES.derived).href);
  const talents = await import(pathToFileURL(FILES.talents).href);
  const roster = await import(pathToFileURL(FILES.fpsRoster).href);

  const baseStats = Object.fromEntries(playerModel.STAT_DEF.map(({ key }) => [key, 70]));
  const basePlayer = {
    id: "r16b-probe",
    stats: baseStats,
    potential: 99,
    talents: { ranks: {}, spentPoints: 0, updatedAt: null },
  };
  const noTalentDerived = derived.getPlayerDerivedStats(basePlayer);
  gate(json(noTalentDerived) === json(baseStats), "NO_TALENT_DERIVED_NOT_BASE_EQUAL");
  const noTalentShort = roster.toShortStats(noTalentDerived);
  gate(noTalentShort.lrn === 70, "ADAPTER_BASE_LRN_MISMATCH", String(noTalentShort.lrn));

  const talentState = { ranks: { team_3: 3 }, spentPoints: 3, updatedAt: null };
  const bonus = derived.getTalentStatBonuses(talentState);
  gate(bonus.learning === 6, "TEAM_3_LEARNING_BONUS", String(bonus.learning));
  const talentDerived = derived.getPlayerDerivedStats({ ...basePlayer, talents: talentState });
  gate(talentDerived.learning === 76, "DERIVED_LRN_VALUE", String(talentDerived.learning));
  const talentShort = roster.toShortStats(talentDerived);
  gate(talentShort.lrn === 76, "ADAPTER_DERIVED_LRN_VALUE", String(talentShort.lrn));

  const metaCourse = playerModel.TRAINING_COURSES.find((course) => course.id === "meta");
  gate(metaCourse?.stats?.includes("learning"), "META_COURSE_LRN_MISSING");
  const trained = playerModel.applyCourse(basePlayer, "meta");
  gate(trained.stats.learning > basePlayer.stats.learning, "TRAINING_LRN_NOT_UPDATED");
  gate(basePlayer.stats.learning === 70, "TRAINING_MUTATED_INPUT");

  return {
    baseLearning: basePlayer.stats.learning,
    noTalentDerivedLearning: noTalentDerived.learning,
    team3Rank: 3,
    team3BonusLearning: bonus.learning,
    team3DerivedLearning: talentDerived.learning,
    team3ShortKey: talentShort.lrn,
    metaCourseLearningAfter: trained.stats.learning,
    pureFunctionsDeterministic: json(derived.getPlayerDerivedStats(basePlayer))
      === json(derived.getPlayerDerivedStats(basePlayer)),
    definitions: {
      team3: talents.talentById("team_3")?.effects ?? null,
      meta: metaCourse,
    },
  };
}

async function main() {
  gate(process.argv.slice(2).length === 0, "CLI_FLAGS_FORBIDDEN");
  const sources = readSources();
  const staticEvidence = staticAudit(sources);
  const pureProbe = await pureDataProbe();
  const evidence = {
    schema: SCHEMA,
    sourceSha256: EXPECTED_SOURCE_SHA256,
    staticEvidence,
    pureProbe,
    lifecycle: {
      updateBoundary: "training completion or talent-derived projection; no post-match learning update exists",
      matchInput: "CS adapter receives lrn in roster payload",
      runtimeConsumption: "none in simulateFps; no combat/tactic/utility read",
      persistedState: "players[].stats / players[].training / players[].growthLog",
      resultContract: "CsMatchResult.v1 unchanged and has no learning field",
      crossMatchState: "not defined",
      futureOwner: "must be specified before any gameplay wiring",
    },
  };
  const evidenceSha256 = sha256(json(evidence));
  console.log(`schema: ${SCHEMA}`);
  console.log(`source hashes locked: ${Object.keys(EXPECTED_SOURCE_SHA256).length}`);
  console.log(`static RNG call sites: ${RNG_CALL_SITES}`);
  console.log(`data path: playerModel.learning -> derived -> fpsRoster.lrn`);
  console.log(`runtime read: simulateFps=false combatSkill=false tactic=false utility=false`);
  console.log(`cross-match state: undefined; result contract field: absent`);
  console.log(`pure probe: team_3 +${pureProbe.team3BonusLearning}, meta course ${pureProbe.metaCourseLearningAfter}`);
  console.log(`${SCHEMA}: ${evidenceSha256}`);
  gate(EXPECTED_EVIDENCE_SHA256 !== "__LOCK_AFTER_REVIEW__", "EVIDENCE_NOT_LOCKED", evidenceSha256);
  gate(evidenceSha256 === EXPECTED_EVIDENCE_SHA256, "EVIDENCE_SHA256_MISMATCH",
    `expected=${EXPECTED_EVIDENCE_SHA256}\nactual=${evidenceSha256}`);
  console.log("CS Learning Lifecycle / State Design R16-B: PASS");
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
