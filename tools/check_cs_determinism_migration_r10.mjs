#!/usr/bin/env node
// CS Determinism Migration R10
//
// This verifier is intentionally migration-only. It keeps the legacy paired
// evidence immutable, runs the repaired defuse decision against the exact same
// fixed matrix, and fails closed unless every changed trajectory is explained
// by the fresh post-combat defuse boundary.

import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FPS_FILE = resolve(ROOT, "src/battle/fps/EsportsFPS3D.jsx");
const FPS_MODULE_ID = "/src/battle/fps/EsportsFPS3D.jsx";

const DIGEST_SCHEMA_V3 = "CsGameplayDigest.v3";
const LEGACY_EVIDENCE_SCHEMA = "CsDefuseMigrationLegacyEvidence.v1";
const EVENT_SCHEMA = "CsDeterminismMigrationEvents.v1";
const SEED_GENERATION_VERSION = "CsMeasurementSeedSet.v1";
const SEED_NAMESPACE = "ESMO:CsMeasurementPilot.v1:";
const FIXED_SEEDS = Object.freeze([
  3978742910, 4200255727, 541349949, 1011896540,
  44863398, 1878380147, 638784133, 2852978760,
  1789562418, 3820910912, 3991584863, 2186970694,
  951543597, 2082574495, 474649321, 3950420867,
]);
const EXPECTED_SEED_SET_SHA256 = "52414f0e6b09ba72b9223b5e76b6ad9d859e8b8ea6fe77dcc2a2a08876a74c6d";
const EXPECTED_RAND_CALLS = 21;

// R1-R8 evidence is historical and is deliberately not rebaselined here.
const HISTORICAL_R8_LEGACY_SOURCE_SHA256 = "870678267543c8e502fac55c7a91a656a135f31fdfb0d673adc30c91c4d8f47b";
const HISTORICAL_R8_LEGACY_BASELINE_SUITE_V1 = "546a3e5753ceadfa28c64e7f322556ebbff32f0848eebe2c9b477a29f1a195c2";
const HISTORICAL_R8_REPAIRED_BASELINE_SUITE_V2 = "5e39e463148d2cd43bbd30b97c485858d75a5edf7f42a035f8f49e1d473293e9";

const LEGACY_SOURCE_SHA256 = HISTORICAL_R8_LEGACY_SOURCE_SHA256;
const REPAIRED_SOURCE_SHA256 = "ba3305ea6cd92fe06df5ee3fd4eb3ca47e1385910672b1ec111f804da0859b8d";

// Filled manually after the first inspected R10 run. There is no rebaseline
// CLI and no automatic capture path.
const EXPECTED_LEGACY_PAIRED_SUITE_V1 = "cce868c91d0c901899cf9df93d07b0af11706da81266ca92a8f807d895fec8ba";
const EXPECTED_REPAIRED_BASELINE_SUITE_V3 = "7c2f8d8ae0f2717c4884b993370f43c5935cd4ad891222c03224438f2ccbe1eb";

const STAT_CASES = Object.freeze([
  { id: "reflex", shortKey: "rxn", targetId: "t1", before: 78, after: 58 },
  { id: "accuracy", shortKey: "acc", targetId: "t2", before: 88, after: 68 },
  { id: "apm", shortKey: "apm", targetId: "t1", before: 80, after: 60 },
  { id: "positioning", shortKey: "pos", targetId: "t2", before: 85, after: 65 },
  { id: "mapAware", shortKey: "vis", targetId: "t4", before: 84, after: 64 },
  { id: "tacticalIQ", shortKey: "tac", targetId: "t5", before: 88, after: 68 },
  { id: "decision", shortKey: "dec", targetId: "t4", before: 78, after: 58 },
  { id: "adaptability", shortKey: "adp", targetId: "t4", before: 83, after: 63 },
  { id: "courage", shortKey: "cou", targetId: "t1", before: 88, after: 68 },
  { id: "clutch", shortKey: "str", targetId: "t2", before: 86, after: 66 },
  { id: "focus", shortKey: "foc", targetId: "t3", before: 88, after: 68 },
  { id: "resilience", shortKey: "res", targetId: "t2", before: 84, after: 64 },
  { id: "comms", shortKey: "com", targetId: "t5", before: 90, after: 70 },
  { id: "leadership", shortKey: "led", targetId: "t5", before: 92, after: 72 },
  { id: "synergy", shortKey: "coo", targetId: "t5", before: 88, after: 68 },
  { id: "learning", shortKey: "lrn", targetId: "t2", before: 80, after: 60 },
]);

const SIGNATURE_MARKER = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster){";
const SIGNATURE_REPLACEMENT = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster,__measure=null){";
const RNG_MARKER = "const map=MAPS[mapKey];const rand=mkRng(seed);";
const RNG_REPLACEMENT = "const map=MAPS[mapKey];const __r10RawRand=mkRng(seed);let __r10RngCount=0;const rand=()=>{const value=__r10RawRand();__r10RngCount++;__measure?.recordRng(__r10RngCount,value);return value;};";
const LEGACY_DEFUSE_MARKER = [
  "        const defuser=aliveCT.find(cp=>dist(cp.pos,c4pos)<6);",
  "        const contested=defuser&&aliveT.some(tp=>dist(tp.pos,c4pos)<9&&!lineBlocked(tp.pos,defuser.pos,walls));",
].join("\n");
const REPAIRED_DEFUSE_MARKER = [
  "        const defuseAliveCT=ps.filter(p=>p.side===\"ct\"&&!p.dead),defuseAliveT=ps.filter(p=>p.side===\"t\"&&!p.dead);",
  "        const defuser=defuseAliveCT.find(cp=>dist(cp.pos,c4pos)<6);",
  "        const contested=defuser&&defuseAliveT.some(tp=>dist(tp.pos,c4pos)<9&&!lineBlocked(tp.pos,defuser.pos,walls));",
].join("\n");
const LEGACY_CONTESTED_MARKER = LEGACY_DEFUSE_MARKER.split("\n")[1];
const REPAIRED_CONTESTED_MARKER = REPAIRED_DEFUSE_MARKER.split("\n")[2];
const DEFUSE_STATE_HOOK = `
        const __r10FreshAliveCT=ps.filter(__p=>__p.side==="ct"&&!__p.dead),__r10FreshAliveT=ps.filter(__p=>__p.side==="t"&&!__p.dead);
        const __r10FreshDefuser=__r10FreshAliveCT.find(__p=>dist(__p.pos,c4pos)<6);
        const __r10FreshContestants=__r10FreshDefuser?__r10FreshAliveT.filter(__p=>dist(__p.pos,c4pos)<9&&!lineBlocked(__p.pos,__r10FreshDefuser.pos,walls)):[];
        __measure?.record("defuse_state",{round:rnd+1,sec,preAliveCT:aliveCT.map(__p=>__p.id),preAliveT:aliveT.map(__p=>__p.id),freshAliveCT:__r10FreshAliveCT.map(__p=>__p.id),freshAliveT:__r10FreshAliveT.map(__p=>__p.id),selectedDefuserId:defuser?.id||"",freshDefuserId:__r10FreshDefuser?.id||"",selectedDefuserDead:Boolean(defuser&&defuser.dead),contestantIds:defuser?aliveT.filter(__p=>dist(__p.pos,c4pos)<9&&!lineBlocked(__p.pos,defuser.pos,walls)).map(__p=>__p.id):[],freshContestantIds:__r10FreshContestants.map(__p=>__p.id),contested:Boolean(contested),progressGate:Boolean(defuser&&!contested),freshProgressGate:Boolean(__r10FreshDefuser&&__r10FreshContestants.length===0),progressBefore:defuseProg});`;
const IDLE_RNG_MARKER = "          else if(rand()<0.25){p.va+=(rand()-0.5)*30;}";
const IDLE_RNG_REPLACEMENT = "          else if((__measure?.record(\"rng_site\",{site:\"idle_aim_jitter\",round:rnd+1,sec,playerId:p.id,callIndex:__r10RngCount+1}),rand())<0.25){p.va+=(rand()-0.5)*30;}";
const TICK_MARKER = [
  "      if(!roundEnd){",
  "        if(aliveT.length===0&&!planted)roundEnd={winner:\"ct\",how:\"elim\"};",
  "        else if(aliveCT.length===0)roundEnd={winner:\"t\",how:planted?\"bomb\":\"elim\"};",
  "        else if(sec>=114)roundEnd={winner:planted?\"t\":\"ct\",how:planted?\"bomb\":\"time\"};",
  "      }",
].join("\n");
const TICK_REPLACEMENT = `${TICK_MARKER}\n      __measure?.record("tick",{round:rnd+1,sec,roundEnd:roundEnd?{winner:roundEnd.winner,how:roundEnd.how}:null,rngCount:__r10RngCount});`;
const RETURN_MARKER = "return { EsportsFPS3D, buildMatchResult };";
const RETURN_REPLACEMENT = "return { EsportsFPS3D, buildMatchResult, simulateFps, ROSTER, TACTICS_DB };";
const EXPORT_MARKER = "export { EsportsFPS3D, buildMatchResult };";
const EXPORT_REPLACEMENT = `const __CS_DETERMINISM_MIGRATION_R10_TEST_API__ = Object.freeze({
  simulateFps: __FPS3D_MODULE.simulateFps,
  ROSTER: __FPS3D_MODULE.ROSTER,
  TACTICS_DB: __FPS3D_MODULE.TACTICS_DB,
});
export { EsportsFPS3D, buildMatchResult, __CS_DETERMINISM_MIGRATION_R10_TEST_API__ };`;

function gate(ok, code, detail = "") {
  if (!ok) throw new Error(`[${code}]${detail ? `\n${detail}` : ""}`);
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function occurrences(text, needle) {
  return text.split(needle).length - 1;
}

function canonicalValue(value, { gameplay = false, rejectUndefined = false } = {}, key = "") {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    gate(Number.isFinite(value), "NON_FINITE_NUMBER", `key=${key}`);
    if (Object.is(value, -0)) return 0;
    if (gameplay && ["x", "y", "routeT", "t"].includes(key)) return Math.round(value * 1e6) / 1e6;
    return value;
  }
  if (typeof value === "undefined") {
    gate(!rejectUndefined, "UNDEFINED_VALUE", `key=${key}`);
    return undefined;
  }
  gate(typeof value === "object", "UNSUPPORTED_VALUE", `key=${key}`);
  if (Array.isArray(value)) return value.map((item, index) => canonicalValue(item, { gameplay, rejectUndefined }, `${key}[${index}]`));
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

function generatedSeeds() {
  return Array.from({ length: FIXED_SEEDS.length }, (_, index) => {
    const digest = createHash("sha256").update(`${SEED_NAMESPACE}${index}`).digest();
    return digest.readUInt32BE(0) || 1;
  });
}

function randTokens(source) {
  return source.match(/\brand\s*\(\s*\)/g) ?? [];
}

function createCollector() {
  const events = [];
  const rng = [];
  return {
    events,
    rng,
    recordRng(index, value) {
      rng.push({ index, value });
    },
    record(type, payload) {
      const event = { schema: EVENT_SCHEMA, type, ...payload };
      canonicalJson(event, { rejectUndefined: true });
      events.push(event);
    },
  };
}

function idList(value) {
  return [...value].sort();
}

function eventByKey(events, type) {
  const map = new Map();
  for (const event of events.filter((item) => item.type === type)) map.set(`${event.round}|${event.sec}`, event);
  return map;
}

function outcomeProjection(sim) {
  return {
    tScore: sim.tScore,
    ctScore: sim.ctScore,
    rounds: sim.rounds,
    roundHist: sim.roundHist,
    players: sim.players,
    mvp: sim.mvp,
  };
}

function runVariant(api, scenario) {
  const collector1 = createCollector();
  const on1 = api.simulateFps(scenario.mapKey, scenario.tTactic, scenario.ctTactic, scenario.seed, scenario.roster, collector1);
  const collector2 = createCollector();
  const on2 = api.simulateFps(scenario.mapKey, scenario.tTactic, scenario.ctTactic, scenario.seed, scenario.roster, collector2);
  gate(canonicalJson(on1, { gameplay: true, rejectUndefined: true }) === canonicalJson(on2, { gameplay: true, rejectUndefined: true }),
    "SIM_NON_DETERMINISTIC", `seed=${scenario.seed} case=${scenario.caseId}`);
  gate(canonicalJson(collector1.events, { rejectUndefined: true }) === canonicalJson(collector2.events, { rejectUndefined: true })
    && canonicalJson(collector1.rng, { rejectUndefined: true }) === canonicalJson(collector2.rng, { rejectUndefined: true }),
    "EVENT_NON_DETERMINISTIC", `seed=${scenario.seed} case=${scenario.caseId}`);
  return {
    sim: on1,
    simDigest: sha256(canonicalJson(on1, { gameplay: true, rejectUndefined: true })),
    outcome: outcomeProjection(on1),
    events: collector1.events,
    rng: collector1.rng,
    rngSites: collector1.events.filter((event) => event.type === "rng_site"),
    defuse: collector1.events.filter((event) => event.type === "defuse_state"),
    ticks: collector1.events.filter((event) => event.type === "tick"),
  };
}

function applyDefuseVariant(source, variant) {
  const hasLegacy = occurrences(source, LEGACY_DEFUSE_MARKER);
  const hasRepaired = occurrences(source, REPAIRED_DEFUSE_MARKER);
  gate(hasLegacy + hasRepaired === 1, "DEFUSE_MARKER_STAGE", `legacy=${hasLegacy} repaired=${hasRepaired}`);
  if (variant === "legacy" && hasRepaired) return source.replace(REPAIRED_DEFUSE_MARKER, LEGACY_DEFUSE_MARKER);
  if (variant === "repaired" && hasLegacy) return source.replace(LEGACY_DEFUSE_MARKER, REPAIRED_DEFUSE_MARKER);
  return source;
}

function transformSource(source, variant) {
  // OneDrive can materialize the JSX as CRLF while the verifier markers are
  // intentionally LF-normalized. This normalization is test-only and does
  // not participate in source provenance hashing.
  let transformed = applyDefuseVariant(source.replace(/\r\n/g, "\n"), variant);
  const defuseStateMarker = variant === "legacy" ? LEGACY_CONTESTED_MARKER : REPAIRED_CONTESTED_MARKER;
  for (const marker of [SIGNATURE_MARKER, RNG_MARKER, defuseStateMarker, IDLE_RNG_MARKER, TICK_MARKER, RETURN_MARKER, EXPORT_MARKER]) {
    gate(occurrences(transformed, marker) === 1, "TRANSFORM_MARKER_COUNT", marker.slice(0, 80));
  }
  transformed = transformed
    .replace(SIGNATURE_MARKER, SIGNATURE_REPLACEMENT)
    .replace(RNG_MARKER, RNG_REPLACEMENT)
    .replace(defuseStateMarker, `${defuseStateMarker}${DEFUSE_STATE_HOOK}`)
    .replace(IDLE_RNG_MARKER, IDLE_RNG_REPLACEMENT)
    .replace(TICK_MARKER, TICK_REPLACEMENT)
    .replace(RETURN_MARKER, RETURN_REPLACEMENT)
    .replace(EXPORT_MARKER, EXPORT_REPLACEMENT);
  gate(randTokens(transformed).length === EXPECTED_RAND_CALLS, "TRANSFORM_RAND_COUNT",
    `expected=${EXPECTED_RAND_CALLS} actual=${randTokens(transformed).length}`);
  return transformed;
}

function firstDefuseDecisionDifference(legacy, repaired) {
  const left = eventByKey(legacy.defuse, "defuse_state");
  const right = eventByKey(repaired.defuse, "defuse_state");
  const keys = [...new Set([...left.keys(), ...right.keys()])];
  for (const key of keys) {
    const a = left.get(key) ?? null;
    const b = right.get(key) ?? null;
    if (canonicalJson(a, { rejectUndefined: true }) !== canonicalJson(b, { rejectUndefined: true })) {
      return { key, legacy: a, repaired: b };
    }
  }
  return null;
}

function compareRng(legacy, repaired, boundary, scenario) {
  const shared = Math.min(legacy.rng.length, repaired.rng.length);
  for (let index = 0; index < shared; index += 1) {
    gate(legacy.rng[index].value === repaired.rng[index].value, "RNG_VALUE_DIVERGENCE",
      `case=${scenario.caseId} seed=${scenario.seed} index=${index + 1}`);
  }
  gate(repaired.rng.length <= legacy.rng.length, "REPAIRED_CONSUMES_MORE_RNG",
    `case=${scenario.caseId} seed=${scenario.seed} legacy=${legacy.rng.length} repaired=${repaired.rng.length}`);
  const missing = legacy.rng.slice(repaired.rng.length);
  const legacySites = legacy.rngSites;
  const repairedSites = repaired.rngSites;
  const sharedSites = Math.min(legacySites.length, repairedSites.length);
  for (let index = 0; index < sharedSites; index += 1) {
    gate(canonicalJson(legacySites[index], { rejectUndefined: true }) === canonicalJson(repairedSites[index], { rejectUndefined: true }),
      "RNG_SITE_DIVERGENCE", `case=${scenario.caseId} seed=${scenario.seed} siteIndex=${index}`);
  }
  gate(repairedSites.length <= legacySites.length, "REPAIRED_HAS_EXTRA_RNG_SITE",
    `case=${scenario.caseId} seed=${scenario.seed}`);
  const missingSites = legacySites.slice(repairedSites.length);
  gate(missing.length === missingSites.length, "RNG_SITE_COUNT_MISMATCH",
    `case=${scenario.caseId} seed=${scenario.seed} rngMissing=${missing.length} siteMissing=${missingSites.length}`);
  if (missing.length) {
    gate(boundary && boundary.repaired, "RNG_MISSING_WITHOUT_DEFUSE_BOUNDARY",
      `case=${scenario.caseId} seed=${scenario.seed}`);
    gate(missingSites.every((event) => event.site === "idle_aim_jitter"), "UNEXPECTED_MISSING_RNG_SITE",
      `case=${scenario.caseId} seed=${scenario.seed} sites=${canonicalJson(missingSites)}`);
    const repairedEnd = repaired.ticks.find((event) => event.round === missingSites[0].round
      && event.roundEnd?.how === "defuse");
    const legacyEnd = legacy.ticks.find((event) => event.round === missingSites[0].round
      && event.roundEnd?.how === "defuse");
    gate(repairedEnd && legacyEnd && repairedEnd.sec < legacyEnd.sec, "MISSING_RNG_NOT_FROM_EARLY_END",
      `case=${scenario.caseId} seed=${scenario.seed} repairedEnd=${repairedEnd?.sec} legacyEnd=${legacyEnd?.sec}`);
  }
  return { rngDelta: legacy.rng.length - repaired.rng.length, missingSites };
}

function validateCausalPair(legacy, repaired, scenario) {
  const boundary = firstDefuseDecisionDifference(legacy, repaired);
  const legacySimJson = canonicalJson(legacy.sim, { gameplay: true, rejectUndefined: true });
  const repairedSimJson = canonicalJson(repaired.sim, { gameplay: true, rejectUndefined: true });
  if (!boundary) {
    gate(legacySimJson === repairedSimJson, "UNEXPLAINED_SIM_DIFF",
      `case=${scenario.caseId} seed=${scenario.seed} legacyDigest=${legacy.simDigest} repairedDigest=${repaired.simDigest} legacyDefuse=${legacy.defuse.length} repairedDefuse=${repaired.defuse.length} legacyTicks=${legacy.ticks.length} repairedTicks=${repaired.ticks.length}`);
  } else {
    gate(boundary.repaired && boundary.repaired.freshDefuserId === boundary.repaired.selectedDefuserId,
      "REPAIRED_NOT_FRESH_DEFUSER", `case=${scenario.caseId} seed=${scenario.seed} key=${boundary.key}`);
    gate(boundary.legacy && (
      boundary.legacy.selectedDefuserId !== boundary.repaired.selectedDefuserId
      || boundary.legacy.contested !== boundary.repaired.contested
      || boundary.legacy.progressGate !== boundary.repaired.progressGate
    ), "DEFUSE_BOUNDARY_NOT_DECISIONAL", `case=${scenario.caseId} seed=${scenario.seed} key=${boundary.key}`);
    const [round, sec] = boundary.key.split("|").map(Number);
    const legacyFrames = legacy.sim.frames;
    const repairedFrames = repaired.sim.frames;
    const beforeCount = legacyFrames.findIndex((frame) => frame.rnd + 1 === round && frame.roundSec === sec);
    const repairedBeforeCount = repairedFrames.findIndex((frame) => frame.rnd + 1 === round && frame.roundSec === sec);
    gate(beforeCount >= 0 && repairedBeforeCount >= 0, "BOUNDARY_FRAME_MISSING", `case=${scenario.caseId} seed=${scenario.seed}`);
    gate(beforeCount === repairedBeforeCount, "BOUNDARY_FRAME_INDEX_DRIFT", `case=${scenario.caseId} seed=${scenario.seed}`);
    for (let index = 0; index < beforeCount; index += 1) {
      gate(canonicalJson(legacyFrames[index], { gameplay: true, rejectUndefined: true })
        === canonicalJson(repairedFrames[index], { gameplay: true, rejectUndefined: true }),
      "PRE_DEFUSE_TRAJECTORY_DIFF", `case=${scenario.caseId} seed=${scenario.seed} frame=${index}`);
    }
  }
  const rng = compareRng(legacy, repaired, boundary, scenario);
  return {
    caseId: scenario.caseId,
    seed: scenario.seed,
    legacyDigest: legacy.simDigest,
    repairedDigest: repaired.simDigest,
    firstDefuseBoundary: boundary ? {
      key: boundary.key,
      legacy: boundary.legacy,
      repaired: boundary.repaired,
    } : null,
    legacyRngCount: legacy.rng.length,
    repairedRngCount: repaired.rng.length,
    rngDelta: rng.rngDelta,
    missingRngSites: rng.missingSites,
    legacyOutcome: legacy.outcome,
    repairedOutcome: repaired.outcome,
  };
}

function suiteDigest(records, schema) {
  return sha256(canonicalJson({
    schema,
    seedGenerationVersion: SEED_GENERATION_VERSION,
    seedSetSha256: sha256(canonicalJson(FIXED_SEEDS)),
    treatmentIds: STAT_CASES.map((item) => item.id),
    records,
  }, { rejectUndefined: true }));
}

function treatmentRoster(api, statCase) {
  const roster = clonePlain(api.ROSTER);
  const target = roster.find((player) => player.id === statCase.targetId);
  gate(target?.stats?.[statCase.shortKey] === statCase.before, "TREATMENT_BEFORE_MISMATCH", statCase.id);
  target.stats[statCase.shortKey] = statCase.after;
  deepFreeze(roster);
  return roster;
}

async function main() {
  gate(process.argv.slice(2).length === 0, "CLI_FLAGS_FORBIDDEN",
    "R10 has no update, capture, rebaseline, seed, treatment, or calibration flags.");
  gate(STAT_CASES.length === 16, "TREATMENT_MATRIX_SIZE", String(STAT_CASES.length));
  gate(canonicalJson(generatedSeeds()) === canonicalJson(FIXED_SEEDS), "SEED_GENERATION_MISMATCH");
  const seedSetSha256 = sha256(canonicalJson(FIXED_SEEDS));
  gate(seedSetSha256 === EXPECTED_SEED_SET_SHA256, "SEED_SET_HASH_MISMATCH", seedSetSha256);

  const originalSource = readFileSync(FPS_FILE, "utf8");
  const sourceSha256 = sha256(originalSource);
  const sourceStage = sourceSha256 === REPAIRED_SOURCE_SHA256 ? "repaired"
    : sourceSha256 === LEGACY_SOURCE_SHA256 ? "legacy" : null;
  gate(sourceStage, "SOURCE_PROVENANCE_MISMATCH",
    `legacy=${LEGACY_SOURCE_SHA256}\nrepaired=${REPAIRED_SOURCE_SHA256}\nactual=${sourceSha256}`);
  gate(randTokens(originalSource).length === EXPECTED_RAND_CALLS, "RAND_CALL_COUNT",
    `expected=${EXPECTED_RAND_CALLS} actual=${randTokens(originalSource).length}`);

  const tempRoot = mkdtempSync(join(tmpdir(), "esmo-cs-determinism-r10-"));
  let vite = null;
  let transformSeen = 0;
  const transformVariants = [];
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
        name: "cs-determinism-migration-r10-memory-transform",
        enforce: "pre",
        transform(code, id) {
          if (resolve(id.split("?")[0]).toLowerCase() !== FPS_FILE.toLowerCase()) return null;
          const query = id.split("?")[1] ?? "";
          const variant = query.includes("cs-r10=legacy") ? "legacy" : query.includes("cs-r10=repaired") ? "repaired" : null;
          if (!variant) return null;
          transformSeen += 1;
          gate(code === originalSource, "VITE_SOURCE_MISMATCH");
          const transformed = transformSource(code, variant);
          transformVariants.push({ variant, randTokens: randTokens(transformed) });
          return { code: transformed, map: null };
        },
      }],
    });

    const legacyModule = await vite.ssrLoadModule(`${FPS_MODULE_ID}?cs-r10=legacy`);
    const repairedModule = await vite.ssrLoadModule(`${FPS_MODULE_ID}?cs-r10=repaired`);
    gate(transformSeen === 2, "TRANSFORM_COUNT", `actual=${transformSeen}`);
    gate(transformVariants.length === 2 && transformVariants.every((item) => item.randTokens.length === EXPECTED_RAND_CALLS),
      "TRANSFORM_RAND_INTEGRITY");
    const legacyApi = legacyModule.__CS_DETERMINISM_MIGRATION_R10_TEST_API__;
    const repairedApi = repairedModule.__CS_DETERMINISM_MIGRATION_R10_TEST_API__;
    for (const api of [legacyApi, repairedApi]) {
      gate(typeof api?.simulateFps === "function", "SIMULATOR_EXPORT_MISSING");
      gate(Array.isArray(api?.ROSTER), "ROSTER_EXPORT_MISSING");
      gate(api?.TACTICS_DB?.inferno, "TACTICS_EXPORT_MISSING");
    }

    const mapKey = "inferno";
    const tTactic = clonePlain(repairedApi.TACTICS_DB.inferno.t.find((item) => item.id === "t_aexec"));
    const ctTactic = clonePlain(repairedApi.TACTICS_DB.inferno.ct.find((item) => item.id === "c_std"));
    gate(tTactic?.id === "t_aexec" && ctTactic?.id === "c_std", "TACTIC_MISSING");
    deepFreeze(tTactic);
    deepFreeze(ctTactic);

    const records = [];
    for (const statCase of STAT_CASES) {
      const roster = treatmentRoster(repairedApi, statCase);
      for (const seed of FIXED_SEEDS) {
        const scenario = { caseId: statCase.id, seed, mapKey, tTactic, ctTactic, roster };
        const legacy = runVariant(legacyApi, scenario);
        const repaired = runVariant(repairedApi, scenario);
        records.push(validateCausalPair(legacy, repaired, scenario));
      }
    }

    const legacySuite = suiteDigest(records.map(({ caseId, seed, legacyDigest, legacyRngCount, legacyOutcome }) => ({
      caseId, seed, legacyDigest, legacyRngCount, legacyOutcome,
    })), LEGACY_EVIDENCE_SCHEMA);
    const repairedSuite = suiteDigest(records.map(({ caseId, seed, repairedDigest, repairedRngCount, repairedOutcome }) => ({
      caseId, seed, repairedDigest, repairedRngCount, repairedOutcome,
    })), DIGEST_SCHEMA_V3);
    const changed = records.filter((record) => record.legacyDigest !== record.repairedDigest);
    const rngChanged = records.filter((record) => record.rngDelta !== 0);
    const totalRngDelta = records.reduce((sum, record) => sum + record.rngDelta, 0);
    console.log(`stage: ${sourceStage}`);
    console.log(`sourceSha256: ${sourceSha256}`);
    console.log(`historical R8 legacy source: ${HISTORICAL_R8_LEGACY_SOURCE_SHA256}`);
    console.log(`historical R8 legacy CsGameplayDigest.v1 suite: ${HISTORICAL_R8_LEGACY_BASELINE_SUITE_V1}`);
    console.log(`historical R8 repaired CsGameplayDigest.v2 suite: ${HISTORICAL_R8_REPAIRED_BASELINE_SUITE_V2}`);
    console.log(`matrix: ${STAT_CASES.length} treatments x ${FIXED_SEEDS.length} seeds = ${records.length} paired runs`);
    console.log(`legacyPairedSuiteV1: ${legacySuite}`);
    console.log(`repairedBaselineSuiteV3: ${repairedSuite}`);
    console.log(`changed trajectories: ${changed.length}/${records.length}`);
    console.log(`RNG changed: ${rngChanged.length}/${records.length} totalDelta=${totalRngDelta}`);
    for (const record of rngChanged) {
      console.log(`rng migration case=${record.caseId} seed=${record.seed} ${record.legacyRngCount}->${record.repairedRngCount} missing=${canonicalJson(record.missingRngSites)}`);
    }
    if (EXPECTED_LEGACY_PAIRED_SUITE_V1 === "__CAPTURE_MANUALLY__"
      || EXPECTED_REPAIRED_BASELINE_SUITE_V3 === "__CAPTURE_MANUALLY__") {
      throw new Error(`[R10_BASELINE_NOT_LOCKED]\nlegacy=${legacySuite}\nrepaired=${repairedSuite}`);
    }
    gate(legacySuite === EXPECTED_LEGACY_PAIRED_SUITE_V1, "LEGACY_PAIRED_EVIDENCE_REGRESSION",
      `expected=${EXPECTED_LEGACY_PAIRED_SUITE_V1}\nactual=${legacySuite}`);
    gate(repairedSuite === EXPECTED_REPAIRED_BASELINE_SUITE_V3, "REPAIRED_V3_BASELINE_REGRESSION",
      `expected=${EXPECTED_REPAIRED_BASELINE_SUITE_V3}\nactual=${repairedSuite}`);
    gate(rngChanged.length <= 1 && totalRngDelta <= 1, "RNG_MIGRATION_SCOPE_EXCEEDED",
      `cases=${rngChanged.length} totalDelta=${totalRngDelta}`);
    console.log("RNG boundary architecture: deferred; single seeded RNG retained");
    console.log("CS Determinism Migration R10: PASS");
  } finally {
    if (vite) await vite.close();
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
