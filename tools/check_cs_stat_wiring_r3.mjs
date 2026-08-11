#!/usr/bin/env node
// CS 16-stat Wiring Measurement R3
// Production FPS source stays untouched; Vite exposes the real simulator in memory.

import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { csR10LegacySource } from "./cs_r10_legacy_source.mjs";
import { CS_R11_REPAIRED_SOURCE_SHA256, csR11R10Source } from "./cs_r11_legacy_source.mjs";
import { CS_R13_PLAYER_SMOKE_SOURCE_SHA256, csR13R12Source } from "./cs_r13_legacy_source.mjs";
import { csR14EvidenceSources } from "./cs_r14_legacy_source.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FPS_FILE = resolve(ROOT, "src/battle/fps/EsportsFPS3D.jsx");
const FPS_MODULE_ID = "/src/battle/fps/EsportsFPS3D.jsx";

const DIGEST_SCHEMA = "CsStatWiringDigest.v2";
const SEED_GENERATION_VERSION = "CsMeasurementSeedSet.v1";
const SEED_NAMESPACE = "ESMO:CsMeasurementPilot.v1:";
const FIXED_SEEDS = Object.freeze([
  3978742910, 4200255727, 541349949, 1011896540,
  44863398, 1878380147, 638784133, 2852978760,
  1789562418, 3820910912, 3991584863, 2186970694,
  951543597, 2082574495, 474649321, 3950420867,
]);
const EXPECTED_SEED_SET_SHA256 = "52414f0e6b09ba72b9223b5e76b6ad9d859e8b8ea6fe77dcc2a2a08876a74c6d";
const CAPTURED_ENGINE_SOURCE_SHA256 = "870678267543c8e502fac55c7a91a656a135f31fdfb0d673adc30c91c4d8f47b";
const R10_ENGINE_SOURCE_SHA256 = "ba3305ea6cd92fe06df5ee3fd4eb3ca47e1385910672b1ec111f804da0859b8d";
const EXPECTED_RAND_CALLS = 21;

// Intentionally no update/rebaseline path. Capture once through the runner, inspect,
// then replace this literal manually.
const LEGACY_EXPECTED_WIRING_SUITE_V1 = "fe6b16dc81c356828e45181b186356b222e7b8de2311c8cadb689fdef3f1343e";
const EXPECTED_WIRING_SUITE_V2 = "6501b46d7f8c37e78877e9cb9fb17f2e87520a5422f11f2d1880d7078ac29e00";
const EXPECTED_TRAJECTORY_SUITE_V1 = "00fa99fee39a80d85d6fb713fee65c11081266bbd0c6a4dbd113f1720874f2f0";

const RETURN_MARKER = "return { EsportsFPS3D, buildMatchResult };";
const RETURN_REPLACEMENT = "return { EsportsFPS3D, buildMatchResult, simulateFps, ROSTER, TACTICS_DB };";
const EXPORT_MARKER = "export { EsportsFPS3D, buildMatchResult };";
const EXPORT_REPLACEMENT = `const __CS_STAT_WIRING_R3_TEST_API__ = Object.freeze({
  simulateFps: __FPS3D_MODULE.simulateFps,
  ROSTER: __FPS3D_MODULE.ROSTER,
  TACTICS_DB: __FPS3D_MODULE.TACTICS_DB,
});
export { EsportsFPS3D, buildMatchResult, __CS_STAT_WIRING_R3_TEST_API__ };`;

const STAT_CASES = Object.freeze([
  { longKey: "reflex", shortKey: "rxn", targetId: "t1", role: "entry", before: 78, after: 58 },
  { longKey: "accuracy", shortKey: "acc", targetId: "t2", role: "rifler", before: 88, after: 68 },
  { longKey: "apm", shortKey: "apm", targetId: "t1", role: "entry", before: 80, after: 60 },
  { longKey: "positioning", shortKey: "pos", targetId: "t2", role: "rifler", before: 85, after: 65 },
  { longKey: "mapAware", shortKey: "vis", targetId: "t4", role: "lurker", before: 84, after: 64 },
  { longKey: "tacticalIQ", shortKey: "tac", targetId: "t5", role: "igl", before: 88, after: 68 },
  { longKey: "decision", shortKey: "dec", targetId: "t4", role: "lurker", before: 78, after: 58 },
  { longKey: "adaptability", shortKey: "adp", targetId: "t4", role: "lurker", before: 83, after: 63 },
  { longKey: "courage", shortKey: "cou", targetId: "t1", role: "entry", before: 88, after: 68 },
  { longKey: "clutch", shortKey: "str", targetId: "t2", role: "rifler", before: 86, after: 66 },
  { longKey: "focus", shortKey: "foc", targetId: "t3", role: "awp", before: 88, after: 68 },
  { longKey: "resilience", shortKey: "res", targetId: "t2", role: "rifler", before: 84, after: 64 },
  { longKey: "comms", shortKey: "com", targetId: "t5", role: "igl", before: 90, after: 70 },
  { longKey: "leadership", shortKey: "led", targetId: "t5", role: "igl", before: 92, after: 72 },
  { longKey: "synergy", shortKey: "coo", targetId: "t5", role: "igl", before: 88, after: 68 },
  { longKey: "learning", shortKey: "lrn", targetId: "t2", role: "rifler", before: 80, after: 60 },
]);

function gate(ok, code, detail = "") {
  if (!ok) throw new Error(`[${code}]${detail ? `\n${detail}` : ""}`);
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function occurrences(text, needle) {
  return text.split(needle).length - 1;
}

function generatedSeeds() {
  return Array.from({ length: FIXED_SEEDS.length }, (_, index) => {
    const digest = createHash("sha256").update(`${SEED_NAMESPACE}${index}`).digest();
    return digest.readUInt32BE(0) || 1;
  });
}

function rngTokens(source) {
  return source.match(/\b(?:rand|Math\.random)\s*\(\s*\)/g) ?? [];
}

function randTokens(source) {
  return source.match(/\brand\s*\(\s*\)/g) ?? [];
}

function round6(value) {
  const rounded = Math.round(value * 1e6) / 1e6;
  return Object.is(rounded, -0) ? 0 : rounded;
}

const GAMEPLAY_FLOAT_KEYS = new Set(["x", "y", "routeT", "t"]);

function canonicalValue(value, { gameplay = false, rejectUndefined = false } = {}, key = "") {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    gate(Number.isFinite(value), "NON_FINITE_NUMBER", `key=${key} value=${String(value)}`);
    if (Object.is(value, -0)) return 0;
    return gameplay && GAMEPLAY_FLOAT_KEYS.has(key) ? round6(value) : value;
  }
  if (typeof value === "undefined") {
    gate(!rejectUndefined, "UNDEFINED_VALUE", `key=${key}`);
    return undefined;
  }
  gate(typeof value === "object", "UNSUPPORTED_CANONICAL_VALUE", `key=${key} type=${typeof value}`);
  if (Array.isArray(value)) {
    return value.map((entry, index) => {
      const normalized = canonicalValue(entry, { gameplay, rejectUndefined }, String(index));
      gate(typeof normalized !== "undefined", "UNDEFINED_ARRAY_VALUE", `index=${index}`);
      return normalized;
    });
  }
  const out = {};
  for (const childKey of Object.keys(value).sort()) {
    const normalized = canonicalValue(value[childKey], { gameplay, rejectUndefined }, childKey);
    if (typeof normalized !== "undefined") out[childKey] = normalized;
  }
  return out;
}

function canonicalJson(value, options = {}) {
  return JSON.stringify(canonicalValue(value, options));
}

function clonePlain(value) {
  return structuredClone(value);
}

function deepFreeze(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function deepDiff(left, right, path = "", out = []) {
  if (Object.is(left, right)) return out;
  const leftObj = left && typeof left === "object";
  const rightObj = right && typeof right === "object";
  if (!leftObj || !rightObj || Array.isArray(left) !== Array.isArray(right)) {
    out.push({ path, before: left, after: right });
    return out;
  }
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  for (const key of keys) {
    const next = Array.isArray(left) ? `${path}[${key}]` : (path ? `${path}.${key}` : key);
    if (!(key in left)) out.push({ path: next, before: undefined, after: right[key] });
    else if (!(key in right)) out.push({ path: next, before: left[key], after: undefined });
    else deepDiff(left[key], right[key], next, out);
  }
  return out;
}

function normalizeLoose(value) {
  if (value === null || ["string", "boolean", "number"].includes(typeof value)) return value;
  if (Array.isArray(value)) return value.map(normalizeLoose);
  gate(value && typeof value === "object", "INVALID_LOOSE_VALUE", `type=${typeof value}`);
  const out = {};
  for (const key of Object.keys(value)) {
    if (typeof value[key] !== "undefined") out[key] = normalizeLoose(value[key]);
  }
  return out;
}

function normalizeFramePlayer(player) {
  gate(player?.id && player?.pos, "FRAME_PLAYER_SHAPE", JSON.stringify(player ?? null));
  return {
    id: player.id,
    x: player.pos.x,
    y: player.pos.y,
    hp: player.hp,
    dead: Boolean(player.dead),
    state: player.state,
    gun: player.gun ?? null,
    money: player.money,
    armor: Boolean(player.armor),
    helmet: Boolean(player.helmet),
    flash: player.flash,
    hasBomb: Boolean(player.hasBomb),
    nades: [...(player.nades ?? [])],
    routeIdx: player.routeIdx,
    routeT: player.routeT,
    reassigned: Boolean(player.reassigned),
    picking: player.picking,
    shooting: player.shooting,
    k: player.k,
    d: player.d,
    a: player.a,
    hsCount: player.hsCount,
    dmgDealt: player.dmgDealt,
    hitters: [...(player._hitters ?? [])].sort(),
  };
}

function normalizeSmoke(smoke) {
  return { id: smoke.id, x: smoke.pos.x, y: smoke.pos.y, tl: smoke.tl, age: smoke.age ?? null };
}

function normalizeMolly(molly) {
  return { id: molly.id, x: molly.pos.x, y: molly.pos.y, tl: molly.tl };
}

function normalizeThrowable(item) {
  return {
    id: item.id,
    type: item.type,
    side: item.side,
    from: { x: item.from.x, y: item.from.y },
    to: { x: item.to.x, y: item.to.y },
    t: item.t,
    flying: Boolean(item.flying),
    detonate: Boolean(item.detonate),
    boom: item.boom ?? null,
  };
}

function normalizeDroppedGun(item) {
  return { id: item.id, gun: item.gun, x: item.pos.x, y: item.pos.y };
}

function playerResult(player) {
  return {
    id: player.id,
    side: player.side,
    roleKey: player.roleKey,
    k: player.k,
    d: player.d,
    a: player.a,
    adr: player.adr,
    hs: player.hs,
    hsPct: player.hsPct,
    kast: player.kast,
    mvpRounds: player.mvpRounds,
    clutches: player.clutches,
    entryKills: player.entryKills,
    utilDmg: player.utilDmg,
    rating: player.rating,
  };
}

function resultProjection(sim) {
  return {
    tScore: sim.tScore,
    ctScore: sim.ctScore,
    roundCount: sim.rounds,
    mvpId: sim.mvp?.id ?? null,
    players: [...sim.players]
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))
      .map(playerResult),
  };
}

function roundsProjection(sim) {
  return sim.roundHist.map((round, index) => ({
    round: index + 1,
    winner: round.winner,
    how: round.how,
    tScore: round.tS,
    ctScore: round.cS,
  }));
}

function buildWiringDocument(sim, scenario) {
  gate(sim && Array.isArray(sim.frames) && Array.isArray(sim.players), "SIM_OUTPUT_SHAPE");
  gate(Array.isArray(sim.roundHist), "SIM_ROUND_HISTORY_SHAPE");
  return {
    schema: DIGEST_SCHEMA,
    scenario: {
      seed: scenario.seed,
      mapKey: scenario.mapKey,
      tTacticId: scenario.tTactic.id,
      ctTacticId: scenario.ctTactic.id,
    },
    result: resultProjection(sim),
    rounds: roundsProjection(sim),
    frames: sim.frames.map((frame) => ({
      fi: frame.fi,
      rnd: frame.rnd,
      roundSec: frame.roundSec,
      buyP: Boolean(frame.buyP),
      target: frame.target,
      planted: Boolean(frame.planted),
      c4t: frame.c4t ?? null,
      c4pos: frame.c4pos ? { x: frame.c4pos.x, y: frame.c4pos.y } : null,
      ecoT: Boolean(frame.ecoT),
      ecoCT: Boolean(frame.ecoCT),
      tScore: frame.tScore,
      ctScore: frame.ctScore,
      players: [...frame.players]
        .sort((a, b) => String(a.id).localeCompare(String(b.id)))
        .map(normalizeFramePlayer),
      events: (frame.events ?? []).map(normalizeLoose),
      smokes: (frame.smokes ?? []).map(normalizeSmoke),
      mollys: (frame.mollys ?? []).map(normalizeMolly),
      throwables: (frame.throwables ?? []).map(normalizeThrowable),
      droppedGuns: (frame.droppedGuns ?? []).map(normalizeDroppedGun),
      droppedBomb: frame.droppedBomb ? { x: frame.droppedBomb.pos.x, y: frame.droppedBomb.pos.y } : null,
      doorStates: normalizeLoose(frame.doorStates ?? {}),
    })),
  };
}

function buildMetricNeutralTrajectoryDocument(wiringDocument) {
  return {
    schema: "CsStatMetricNeutralTrajectory.v1",
    scenario: wiringDocument.scenario,
    result: {
      tScore: wiringDocument.result.tScore,
      ctScore: wiringDocument.result.ctScore,
      roundCount: wiringDocument.result.roundCount,
      players: wiringDocument.result.players.map(({ adr, mvpRounds, rating, ...player }) => player),
    },
    rounds: wiringDocument.rounds,
    frames: wiringDocument.frames.map((frame) => ({
      ...frame,
      players: frame.players.map(({ dmgDealt, ...player }) => player),
    })),
  };
}

function buildDigests(sim, scenario) {
  const strictBefore = JSON.stringify(sim);
  const result = resultProjection(sim);
  const rounds = roundsProjection(sim);
  const wiringDocument = buildWiringDocument(sim, scenario);
  const trajectoryDocument = buildMetricNeutralTrajectoryDocument(wiringDocument);
  gate(wiringDocument.schema === "CsStatWiringDigest.v2", "SCHEMA_MISMATCH");
  gate(trajectoryDocument.schema === "CsStatMetricNeutralTrajectory.v1", "TRAJECTORY_SCHEMA_MISMATCH");
  const playerResultDigests = Object.fromEntries(
    result.players.map((player) => [player.id, sha256(canonicalJson(player, { rejectUndefined: true }))]),
  );
  const digests = {
    strictSimDigest: sha256(strictBefore),
    behaviorDigest: sha256(canonicalJson(wiringDocument, { gameplay: true, rejectUndefined: true })),
    resultDigest: sha256(canonicalJson(result, { rejectUndefined: true })),
    roundsDigest: sha256(canonicalJson(rounds, { rejectUndefined: true })),
    trajectoryDigest: sha256(canonicalJson(trajectoryDocument, { gameplay: true, rejectUndefined: true })),
    playerResultDigests,
  };
  const strictAfter = JSON.stringify(sim);
  gate(strictBefore === strictAfter, "DIGEST_BUILDER_MUTATED_SIM", `seed=${scenario.seed}`);
  return digests;
}

function scenarioInput(seed, mapKey, tTactic, ctTactic, roster) {
  return { seed, mapKey, tTactic, ctTactic, roster };
}

function scenarioInputSha256(seed, mapKey, tTactic, ctTactic, roster) {
  return sha256(canonicalJson(scenarioInput(seed, mapKey, tTactic, ctTactic, roster)));
}

function runArm({ simulateFps, mapKey, tTactic, ctTactic, roster, seed }) {
  const inputBefore = scenarioInputSha256(seed, mapKey, tTactic, ctTactic, roster);
  const sim = simulateFps(mapKey, tTactic, ctTactic, seed, roster);
  const inputAfter = scenarioInputSha256(seed, mapKey, tTactic, ctTactic, roster);
  gate(inputBefore === inputAfter, "SIM_MUTATED_INPUT", `seed=${seed}`);
  return {
    seed,
    inputSha256: inputBefore,
    ...buildDigests(sim, { seed, mapKey, tTactic, ctTactic }),
  };
}

function assertRepeat(first, second, label) {
  gate(first.inputSha256 === second.inputSha256, "REPEAT_INPUT_DRIFT", label);
  gate(first.strictSimDigest === second.strictSimDigest, "STRICT_NON_DETERMINISTIC", label);
  gate(first.behaviorDigest === second.behaviorDigest, "BEHAVIOR_NON_DETERMINISTIC", label);
  gate(first.resultDigest === second.resultDigest, "RESULT_NON_DETERMINISTIC", label);
  gate(first.roundsDigest === second.roundsDigest, "ROUNDS_NON_DETERMINISTIC", label);
  gate(first.trajectoryDigest === second.trajectoryDigest, "TRAJECTORY_NON_DETERMINISTIC", label);
  gate(canonicalJson(first.playerResultDigests) === canonicalJson(second.playerResultDigests),
    "PLAYER_RESULT_NON_DETERMINISTIC", label);
}

function treatmentView(mapKey, tTactic, ctTactic, roster) {
  return {
    mapKey,
    tTactic,
    ctTactic,
    roster: Object.fromEntries(
      [...roster]
        .sort((a, b) => String(a.id).localeCompare(String(b.id)))
        .map((player) => [player.id, player]),
    ),
  };
}

function legacyRunProjection({ trajectoryDigest, ...run }) {
  return run;
}

async function main() {
  gate(process.argv.slice(2).length === 0, "CLI_FLAGS_FORBIDDEN",
    "No update, rebaseline, seed, treatment, or calibration flags are supported.");

  const originalSource = readFileSync(FPS_FILE, "utf8");
  const sourceSha256 = sha256(originalSource);
  const r14Sources = csR14EvidenceSources(originalSource);
  gate(r14Sources || [CAPTURED_ENGINE_SOURCE_SHA256, R10_ENGINE_SOURCE_SHA256, CS_R11_REPAIRED_SOURCE_SHA256,
    CS_R13_PLAYER_SMOKE_SOURCE_SHA256].includes(sourceSha256), "SOURCE_PROVENANCE_MISMATCH",
  `expected=${CAPTURED_ENGINE_SOURCE_SHA256}, ${R10_ENGINE_SOURCE_SHA256}, ${CS_R11_REPAIRED_SOURCE_SHA256}, or ${CS_R13_PLAYER_SMOKE_SOURCE_SHA256}\nactual=${sourceSha256}`);
  const r12Source = r14Sources?.r12 ?? (sourceSha256 === CS_R13_PLAYER_SMOKE_SOURCE_SHA256
    ? csR13R12Source(originalSource) : originalSource);
  if (sourceSha256 === CS_R13_PLAYER_SMOKE_SOURCE_SHA256) {
    gate(sha256(r12Source) === CS_R11_REPAIRED_SOURCE_SHA256, "R13_R12_ADAPTER_MISMATCH");
  }
  const r12SourceSha256 = sha256(r12Source);
  const r10Source = r14Sources?.r10 ?? (r12SourceSha256 === CS_R11_REPAIRED_SOURCE_SHA256
    ? csR11R10Source(r12Source) : r12Source);
  const historicalSource = r14Sources?.r8 ?? ([R10_ENGINE_SOURCE_SHA256, CS_R11_REPAIRED_SOURCE_SHA256].includes(r12SourceSha256)
    ? csR10LegacySource(r10Source) : r12Source);
  gate(occurrences(historicalSource, RETURN_MARKER) === 1, "RETURN_MARKER_COUNT");
  gate(occurrences(historicalSource, EXPORT_MARKER) === 1, "EXPORT_MARKER_COUNT");

  const originalRandTokens = randTokens(historicalSource);
  const originalRngTokens = rngTokens(historicalSource);
  gate(originalRandTokens.length === EXPECTED_RAND_CALLS, "RAND_CALL_COUNT",
    `expected=${EXPECTED_RAND_CALLS} actual=${originalRandTokens.length}`);
  gate(canonicalJson(generatedSeeds()) === canonicalJson(FIXED_SEEDS), "SEED_GENERATION_MISMATCH");
  const seedSetSha256 = sha256(canonicalJson(FIXED_SEEDS));
  gate(seedSetSha256 === EXPECTED_SEED_SET_SHA256, "SEED_SET_HASH_MISMATCH");
  gate(STAT_CASES.length === 16, "STAT_CASE_COUNT", `actual=${STAT_CASES.length}`);
  gate(new Set(STAT_CASES.map((item) => item.longKey)).size === 16, "DUPLICATE_LONG_KEY");
  gate(new Set(STAT_CASES.map((item) => item.shortKey)).size === 16, "DUPLICATE_SHORT_KEY");

  console.log(`digest schema: ${DIGEST_SCHEMA}`);
  console.log(`seed generation version: ${SEED_GENERATION_VERSION}`);
  console.log(`seeds: ${JSON.stringify(FIXED_SEEDS)}`);
  console.log(`seedSetSha256: ${seedSetSha256}`);
  console.log(`engineSourceSha256: ${sourceSha256}`);
  console.log(`rand() call sites: ${originalRandTokens.length}`);

  let transformSeen = 0;
  let transformRestoredExactly = false;
  let transformedRngTokensMatch = false;
  const tempRoot = mkdtempSync(join(tmpdir(), "esmo-cs-stat-wiring-r3-"));
  let vite = null;

  try {
    vite = await createServer({
      root: ROOT,
      configFile: false,
      envFile: false,
      appType: "custom",
      logLevel: "error",
      cacheDir: join(tempRoot, "vite-cache"),
      optimizeDeps: { noDiscovery: true, include: [] },
      server: { middlewareMode: true },
      plugins: [{
        name: "cs-stat-wiring-r3-memory-export",
        enforce: "pre",
        transform(code, id) {
          const cleanId = resolve(id.split("?")[0]).toLowerCase();
          if (cleanId !== FPS_FILE.toLowerCase()) return null;
          transformSeen += 1;
          gate(code === originalSource, "VITE_SOURCE_MISMATCH");
          gate(occurrences(code, RETURN_MARKER) === 1, "TRANSFORM_RETURN_MARKER_COUNT");
          gate(occurrences(code, EXPORT_MARKER) === 1, "TRANSFORM_EXPORT_MARKER_COUNT");
          const transformed = historicalSource
            .replace(RETURN_MARKER, RETURN_REPLACEMENT)
            .replace(EXPORT_MARKER, EXPORT_REPLACEMENT);
          const restored = transformed
            .replace(RETURN_REPLACEMENT, RETURN_MARKER)
            .replace(EXPORT_REPLACEMENT, EXPORT_MARKER);
          transformRestoredExactly = restored === historicalSource;
          transformedRngTokensMatch =
            canonicalJson(rngTokens(transformed)) === canonicalJson(originalRngTokens);
          gate(transformRestoredExactly, "TRANSFORM_NOT_EXPORT_ONLY");
          gate(transformedRngTokensMatch, "RNG_TOKEN_SEQUENCE_CHANGED");
          return { code: transformed, map: null };
        },
      }],
    });

    const loaded = await vite.ssrLoadModule(FPS_MODULE_ID);
    gate(transformSeen === 1, "TRANSFORM_EXECUTION_COUNT", `actual=${transformSeen}`);
    gate(transformRestoredExactly, "TRANSFORM_INTEGRITY");
    gate(transformedRngTokensMatch, "RNG_TOKEN_INTEGRITY");
    const api = loaded.__CS_STAT_WIRING_R3_TEST_API__;
    gate(typeof api?.simulateFps === "function", "TEST_SIMULATOR_EXPORT_MISSING");
    gate(Array.isArray(api?.ROSTER), "TEST_ROSTER_EXPORT_MISSING");
    gate(api?.TACTICS_DB && typeof api.TACTICS_DB === "object", "TEST_TACTICS_EXPORT_MISSING");

    const mapKey = "inferno";
    const tTactic = clonePlain(api.TACTICS_DB?.inferno?.t?.find((item) => item.id === "t_aexec"));
    const ctTactic = clonePlain(api.TACTICS_DB?.inferno?.ct?.find((item) => item.id === "c_std"));
    const baselineRoster = clonePlain(api.ROSTER);
    gate(tTactic?.id === "t_aexec", "T_TACTIC_MISSING");
    gate(ctTactic?.id === "c_std", "CT_TACTIC_MISSING");
    gate(baselineRoster.length === 10, "ROSTER_SIZE", `actual=${baselineRoster.length}`);
    const tPlayers = baselineRoster.filter((player) => player.side === "t");
    gate(tPlayers.length === 5, "T_ROSTER_SIZE", `actual=${tPlayers.length}`);
    gate(tPlayers.every((player) => player.role !== "support"), "PLAYER_SIDE_SUPPORT_UNEXPECTED");
    deepFreeze(tTactic);
    deepFreeze(ctTactic);
    deepFreeze(baselineRoster);

    const baselineBySeed = new Map();
    const baselineSuite = [];
    for (const seed of FIXED_SEEDS) {
      const a1 = runArm({ simulateFps: api.simulateFps, mapKey, tTactic, ctTactic, roster: baselineRoster, seed });
      const a2 = runArm({ simulateFps: api.simulateFps, mapKey, tTactic, ctTactic, roster: baselineRoster, seed });
      assertRepeat(a1, a2, `baseline seed=${seed}`);
      baselineBySeed.set(seed, a1);
      baselineSuite.push(a1);
    }

    const summaries = [];
    const treatmentSuite = [];
    for (const statCase of STAT_CASES) {
      const treatmentRoster = clonePlain(baselineRoster);
      const baselineTarget = baselineRoster.find((player) => player.id === statCase.targetId);
      const treatmentTarget = treatmentRoster.find((player) => player.id === statCase.targetId);
      gate(baselineTarget?.side === "t" && baselineTarget?.role === statCase.role,
        "TARGET_IDENTITY_MISMATCH", JSON.stringify(statCase));
      gate(baselineTarget?.stats?.[statCase.shortKey] === statCase.before,
        "TARGET_BASELINE_VALUE_MISMATCH",
        `${statCase.longKey} expected=${statCase.before} actual=${String(baselineTarget?.stats?.[statCase.shortKey])}`);
      treatmentTarget.stats[statCase.shortKey] = statCase.after;
      gate(treatmentTarget.fps === baselineTarget.fps && treatmentTarget.moba === baselineTarget.moba,
        "HUD_OVR_WAS_RECOMPUTED", statCase.longKey);

      const treatmentDiff = deepDiff(
        treatmentView(mapKey, tTactic, ctTactic, baselineRoster),
        treatmentView(mapKey, tTactic, ctTactic, treatmentRoster),
      );
      const expectedPath = `roster.${statCase.targetId}.stats.${statCase.shortKey}`;
      gate(treatmentDiff.length === 1
        && treatmentDiff[0].path === expectedPath
        && treatmentDiff[0].before === statCase.before
        && treatmentDiff[0].after === statCase.after,
      "TREATMENT_INTEGRITY", `${statCase.longKey}\n${JSON.stringify(treatmentDiff)}`);
      deepFreeze(treatmentRoster);

      const changed = {
        behavior: [],
        result: [],
        rounds: [],
        targetResult: [],
      };
      const caseRuns = [];
      for (const seed of FIXED_SEEDS) {
        const baseline = baselineBySeed.get(seed);
        const b1 = runArm({ simulateFps: api.simulateFps, mapKey, tTactic, ctTactic, roster: treatmentRoster, seed });
        const b2 = runArm({ simulateFps: api.simulateFps, mapKey, tTactic, ctTactic, roster: treatmentRoster, seed });
        assertRepeat(b1, b2, `${statCase.longKey} seed=${seed}`);
        if (baseline.behaviorDigest !== b1.behaviorDigest) changed.behavior.push(seed);
        if (baseline.resultDigest !== b1.resultDigest) changed.result.push(seed);
        if (baseline.roundsDigest !== b1.roundsDigest) changed.rounds.push(seed);
        gate(typeof baseline.playerResultDigests[statCase.targetId] === "string",
          "BASELINE_TARGET_RESULT_MISSING", `${statCase.longKey} seed=${seed}`);
        gate(typeof b1.playerResultDigests[statCase.targetId] === "string",
          "TREATMENT_TARGET_RESULT_MISSING", `${statCase.longKey} seed=${seed}`);
        if (baseline.playerResultDigests[statCase.targetId] !== b1.playerResultDigests[statCase.targetId]) {
          changed.targetResult.push(seed);
        }
        if (baseline.resultDigest !== b1.resultDigest || baseline.roundsDigest !== b1.roundsDigest) {
          gate(baseline.behaviorDigest !== b1.behaviorDigest,
            "NARROW_DIGEST_CHANGED_WITHOUT_BEHAVIOR", `${statCase.longKey} seed=${seed}`);
        }
        caseRuns.push(b1);
      }

      const summary = {
        longKey: statCase.longKey,
        shortKey: statCase.shortKey,
        targetId: statCase.targetId,
        role: statCase.role,
        treatment: `${statCase.before}->${statCase.after}`,
        behaviorChangedSeeds: changed.behavior.length,
        resultChangedSeeds: changed.result.length,
        roundsChangedSeeds: changed.rounds.length,
        targetResultChangedSeeds: changed.targetResult.length,
        behaviorChangedSeedSet: changed.behavior,
      };
      summaries.push(summary);
      treatmentSuite.push({ statCase, runs: caseRuns });
      console.log(`stat result: ${JSON.stringify(summary)}`);
    }

    const suitePayload = {
      schema: DIGEST_SCHEMA,
      seedGenerationVersion: SEED_GENERATION_VERSION,
      seedSetSha256,
      baseline: baselineSuite.map(legacyRunProjection),
      treatments: treatmentSuite.map(({ statCase, runs }) => ({
        statCase,
        runs: runs.map(legacyRunProjection),
      })),
      summaries,
    };
    const suiteDigest = sha256(canonicalJson(suitePayload, { rejectUndefined: true }));
    const trajectorySuiteDigest = sha256(canonicalJson({
      schema: "CsStatMetricNeutralTrajectory.v1",
      seedGenerationVersion: SEED_GENERATION_VERSION,
      seedSetSha256,
      baseline: baselineSuite.map(({ seed, trajectoryDigest }) => ({ seed, trajectoryDigest })),
      treatments: treatmentSuite.map(({ statCase, runs }) => ({
        statCase,
        runs: runs.map(({ seed, trajectoryDigest }) => ({ seed, trajectoryDigest })),
      })),
    }, { rejectUndefined: true }));
    const simulationCount = FIXED_SEEDS.length * 2 * (STAT_CASES.length + 1);
    console.log(`simulations: ${simulationCount}`);
    console.log(`wiringSuiteDigest: ${suiteDigest}`);
    console.log(`trajectorySuiteDigest: ${trajectorySuiteDigest}`);
    console.log(`stat summaries: ${JSON.stringify(summaries)}`);
    console.log("statistics: not computed (no p-value; no significance gate)");
    console.log("formal gameplay baseline: protected by separate cs_measure_r1 segment");

    console.log(`legacyWiringSuiteV1: ${LEGACY_EXPECTED_WIRING_SUITE_V1}`);
    gate(EXPECTED_WIRING_SUITE_V2 !== "__CAPTURE_MANUALLY__", "WIRING_SUITE_NOT_LOCKED",
      `candidate=${suiteDigest}`);
    gate(suiteDigest === EXPECTED_WIRING_SUITE_V2, "WIRING_MEASUREMENT_REGRESSION",
      `expected=${EXPECTED_WIRING_SUITE_V2}\nactual=${suiteDigest}`);
    gate(EXPECTED_TRAJECTORY_SUITE_V1 !== "__CAPTURE_MANUALLY__", "TRAJECTORY_SUITE_NOT_LOCKED",
      `candidate=${trajectorySuiteDigest}`);
    gate(trajectorySuiteDigest === EXPECTED_TRAJECTORY_SUITE_V1, "STAT_TRAJECTORY_REGRESSION",
      `expected=${EXPECTED_TRAJECTORY_SUITE_V1}\nactual=${trajectorySuiteDigest}`);

    console.log("CS Stat Wiring R3: PASS");
  } finally {
    if (vite) await vite.close();
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.log(`CS Stat Wiring R3: FAIL ${error?.message ?? String(error)}`);
  process.exitCode = 1;
});
