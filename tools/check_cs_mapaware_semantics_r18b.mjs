#!/usr/bin/env node
// CS MapAware Semantics / Read-Point Design R18-B
// Focused, deterministic, in-memory instrumentation. Production source is read-only.

import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FPS_FILE = resolve(ROOT, "src/battle/fps/EsportsFPS3D.jsx");
const FPS_MODULE_ID = "/src/battle/fps/EsportsFPS3D.jsx";
const SOURCE_SHA256 = "7622f87b8b389a504c19b887b860de791dbf8ea240e6ba57c424e159cb655c89";
const EVENT_SCHEMA = "CsMapAwareSpatialReadPoint.v1";
const SUITE_SCHEMA = "CsMapAwareSpatialReadPointSuite.v1";
const SEED_GENERATION_VERSION = "CsMeasurementSeedSet.v1";
const SEED_NAMESPACE = "ESMO:CsMeasurementPilot.v1:";
const FIXED_SEEDS = Object.freeze([
  3978742910, 4200255727, 541349949, 1011896540,
  44863398, 1878380147, 638784133, 2852978760,
  1789562418, 3820910912, 3991584863, 2186970694,
  951543597, 2082574495, 474649321, 3950420867,
]);
const SEED_SET_SHA256 = "52414f0e6b09ba72b9223b5e76b6ad9d859e8b8ea6fe77dcc2a2a08876a74c6d";
const EXPECTED_RAND_CALLS = 21;
const MAP_KEY = "inferno";
const T_TACTIC_ID = "t_aexec";
const CT_TACTIC_ID = "c_std";

const SIGNATURE_MARKER = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster){";
const SIGNATURE_REPLACEMENT = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster,__measure=null){";
const PAIR_MARKER = "let pairs=[];aliveT.forEach(tp=>aliveCT.forEach(cp=>{const d=dist(tp.pos,cp.pos);if(d<55&&!lineBlocked(tp.pos,cp.pos,walls)&&!smokeBlocks(tp.pos,cp.pos,smokes))pairs.push([tp,cp,d]);}));";
const PAIR_REPLACEMENT = [
  "let pairs=[];aliveT.forEach(tp=>aliveCT.forEach(cp=>{",
  "const d=dist(tp.pos,cp.pos);",
  "const __r18bDistanceEligible=d<55;",
  "const __r18bWallBlocked=lineBlocked(tp.pos,cp.pos,walls);",
  "const __r18bSmokeBlocked=smokeBlocks(tp.pos,cp.pos,smokes);",
  "const __r18bTTeammates=aliveT.filter(mate=>mate.id!==tp.id);",
  "const __r18bCTTeammates=aliveCT.filter(mate=>mate.id!==cp.id);",
  "const __r18bTNearest=__r18bTTeammates.length?Math.min(...__r18bTTeammates.map(mate=>dist(tp.pos,mate.pos))):null;",
  "const __r18bCTNearest=__r18bCTTeammates.length?Math.min(...__r18bCTTeammates.map(mate=>dist(cp.pos,mate.pos))):null;",
  "__measure?.record(\"spatial_read\",{round:rnd+1,sec,tPlayerId:tp.id,cPlayerId:cp.id,tRole:tp.role,cRole:cp.role,enemyDistance:d,distanceEligible:__r18bDistanceEligible,wallBlocked:__r18bWallBlocked,smokeBlocked:__r18bSmokeBlocked,visibleCandidate:__r18bDistanceEligible&&!__r18bWallBlocked&&!__r18bSmokeBlocked,tTeammateCount:__r18bTTeammates.length,ctTeammateCount:__r18bCTTeammates.length,tNearestTeammateDistance:__r18bTNearest,ctNearestTeammateDistance:__r18bCTNearest});",
  "if(__r18bDistanceEligible&&!__r18bWallBlocked&&!__r18bSmokeBlocked)pairs.push([tp,cp,d]);}));",
].join("");
const RETURN_MARKER = "return { EsportsFPS3D, buildMatchResult };";
const RETURN_REPLACEMENT = "return { EsportsFPS3D, buildMatchResult, simulateFps, ROSTER, TACTICS_DB };";
const EXPORT_MARKER = "export { EsportsFPS3D, buildMatchResult };";
const EXPORT_REPLACEMENT = [
  "const __CS_MAPAWARE_R18B_TEST_API__ = Object.freeze({",
  "  simulateFps: __FPS3D_MODULE.simulateFps,",
  "  ROSTER: __FPS3D_MODULE.ROSTER,",
  "  TACTICS_DB: __FPS3D_MODULE.TACTICS_DB,",
  "});",
  "export { EsportsFPS3D, buildMatchResult, __CS_MAPAWARE_R18B_TEST_API__ };",
].join("\n");
const TRANSFORMS = Object.freeze([
  ["signature", SIGNATURE_MARKER, SIGNATURE_REPLACEMENT],
  ["spatial pair read point", PAIR_MARKER, PAIR_REPLACEMENT],
  ["return export", RETURN_MARKER, RETURN_REPLACEMENT],
  ["module export", EXPORT_MARKER, EXPORT_REPLACEMENT],
]);

function gate(ok, code, detail = "") {
  if (!ok) throw new Error(`[${code}]${detail ? `\n${detail}` : ""}`);
}
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function occurrences(text, needle) { return text.split(needle).length - 1; }
function clone(value) { return structuredClone(value); }
function freeze(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) freeze(child, seen);
  return Object.freeze(value);
}
function canonical(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    gate(Number.isFinite(value), "NON_FINITE_NUMBER");
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value === "undefined") return null;
  gate(typeof value === "object", "UNSUPPORTED_VALUE", typeof value);
  if (Array.isArray(value)) return value.map(canonical);
  const out = {};
  for (const key of Object.keys(value).sort()) out[key] = canonical(value[key]);
  return out;
}
function json(value) { return JSON.stringify(canonical(value)); }
function generatedSeeds() {
  return Array.from({ length: FIXED_SEEDS.length }, (_, index) => {
    const digest = createHash("sha256").update(SEED_NAMESPACE + index).digest();
    return digest.readUInt32BE(0) || 1;
  });
}
function randTokens(source) { return source.match(/\brand\s*\(\s*\)/g) ?? []; }
function inputDigest(mapKey, tTactic, ctTactic, roster) {
  return sha256(json({ mapKey, tTactic, ctTactic, roster }));
}

function createCollector() {
  const events = [];
  return {
    events,
    record(type, payload) {
      gate(type === "spatial_read", "UNKNOWN_EVENT", type);
      gate(payload && typeof payload === "object" && !Array.isArray(payload), "EVENT_PAYLOAD");
      const event = { schema: EVENT_SCHEMA, type, ...payload };
      for (const [key, value] of Object.entries(event)) {
        gate(value === null || ["string", "number", "boolean"].includes(typeof value), "EVENT_FIELD", key);
      }
      events.push(Object.freeze(event));
    },
  };
}

function eventKey(event) {
  return [event.round, event.sec, event.tPlayerId, event.cPlayerId].join("|");
}

function validateEvents(events) {
  const seen = new Set();
  const summary = {
    probes: events.length,
    distanceEligible: 0,
    wallBlocked: 0,
    smokeBlocked: 0,
    bothBlocked: 0,
    visibleCandidates: 0,
    tTeammateContext: 0,
    ctTeammateContext: 0,
    tNearestSamples: 0,
    ctNearestSamples: 0,
  };
  for (const event of events) {
    gate(event.schema === EVENT_SCHEMA && event.type === "spatial_read", "EVENT_SCHEMA");
    const key = eventKey(event);
    gate(!seen.has(key), "DUPLICATE_READ_POINT", key);
    seen.add(key);
    gate(Number.isInteger(event.round) && event.round >= 1, "EVENT_ROUND", key);
    gate(Number.isInteger(event.sec) && event.sec >= 0 && event.sec <= 114, "EVENT_SEC", key);
    gate(typeof event.tPlayerId === "string" && typeof event.cPlayerId === "string", "EVENT_PLAYER_IDS", key);
    gate(typeof event.tRole === "string" && typeof event.cRole === "string", "EVENT_ROLES", key);
    gate(Number.isFinite(event.enemyDistance) && event.enemyDistance >= 0, "EVENT_DISTANCE", key);
    gate(typeof event.distanceEligible === "boolean", "EVENT_DISTANCE_GATE", key);
    gate(event.distanceEligible === (event.enemyDistance < 55), "EVENT_DISTANCE_GATE_MISMATCH", key);
    gate(typeof event.wallBlocked === "boolean" && typeof event.smokeBlocked === "boolean", "EVENT_LOS_FIELDS", key);
    const visibleCandidate = event.distanceEligible && !event.wallBlocked && !event.smokeBlocked;
    gate(event.visibleCandidate === visibleCandidate, "EVENT_VISIBLE_PREDICATE", key);
    gate(Number.isInteger(event.tTeammateCount) && event.tTeammateCount >= 0 && event.tTeammateCount <= 4, "EVENT_T_TEAMMATES", key);
    gate(Number.isInteger(event.ctTeammateCount) && event.ctTeammateCount >= 0 && event.ctTeammateCount <= 4, "EVENT_CT_TEAMMATES", key);
    for (const field of ["tNearestTeammateDistance", "ctNearestTeammateDistance"]) {
      gate(event[field] === null || (Number.isFinite(event[field]) && event[field] >= 0), "EVENT_NEAREST_DISTANCE", `${key}:${field}`);
    }
    gate((event.tNearestTeammateDistance === null) === (event.tTeammateCount === 0), "EVENT_T_NEAREST_SHAPE", key);
    gate((event.ctNearestTeammateDistance === null) === (event.ctTeammateCount === 0), "EVENT_CT_NEAREST_SHAPE", key);
    if (event.distanceEligible) summary.distanceEligible += 1;
    if (event.wallBlocked) summary.wallBlocked += 1;
    if (event.smokeBlocked) summary.smokeBlocked += 1;
    if (event.wallBlocked && event.smokeBlocked) summary.bothBlocked += 1;
    if (event.visibleCandidate) summary.visibleCandidates += 1;
    if (event.tTeammateCount > 0) summary.tTeammateContext += 1;
    if (event.ctTeammateCount > 0) summary.ctTeammateContext += 1;
    if (event.tNearestTeammateDistance !== null) summary.tNearestSamples += 1;
    if (event.ctNearestTeammateDistance !== null) summary.ctNearestSamples += 1;
  }
  gate(summary.probes > 0, "NO_SPATIAL_READ_POINTS");
  gate(summary.distanceEligible > 0, "NO_DISTANCE_COVERAGE");
  gate(summary.visibleCandidates > 0, "NO_VISIBLE_CANDIDATE_COVERAGE");
  gate(summary.tTeammateContext > 0 && summary.ctTeammateContext > 0, "NO_TEAMMATE_CONTEXT_COVERAGE");
  return summary;
}

function addSummary(left, right) {
  for (const key of Object.keys(left)) left[key] += right[key];
  return left;
}

function runArm(api, { mapKey, tTactic, ctTactic, roster, seed }) {
  const before = inputDigest(mapKey, tTactic, ctTactic, roster);
  const off = api.simulateFps(mapKey, tTactic, ctTactic, seed, roster);
  const collector1 = createCollector();
  const on1 = api.simulateFps(mapKey, tTactic, ctTactic, seed, roster, collector1);
  const collector2 = createCollector();
  const on2 = api.simulateFps(mapKey, tTactic, ctTactic, seed, roster, collector2);
  const offJson = JSON.stringify(off);
  gate(offJson === JSON.stringify(on1) && offJson === JSON.stringify(on2), "INSTRUMENTATION_CHANGED_SIM", `seed=${seed}`);
  const eventJson1 = json(collector1.events);
  const eventJson2 = json(collector2.events);
  gate(eventJson1 === eventJson2, "EVENT_NON_DETERMINISTIC", `seed=${seed}`);
  const after = inputDigest(mapKey, tTactic, ctTactic, roster);
  gate(before === after, "SIM_MUTATED_INPUT", `seed=${seed}`);
  return {
    seed,
    strictSimDigest: sha256(offJson),
    eventDigest: sha256(eventJson1),
    events: collector1.events,
    metrics: validateEvents(collector1.events),
  };
}

async function loadApi(originalSource) {
  let transformSeen = 0;
  let restored = false;
  let rngSame = false;
  const tempRoot = mkdtempSync(join(tmpdir(), "esmo-cs-mapaware-r18b-"));
  let vite = null;
  try {
    vite = await createServer({
      root: ROOT, configFile: false, envFile: false, appType: "custom", logLevel: "error",
      cacheDir: join(tempRoot, "vite-cache"), optimizeDeps: { noDiscovery: true, include: [] },
      server: { middlewareMode: true },
      plugins: [{
        name: "cs-mapaware-r18b-memory-hooks",
        enforce: "pre",
        transform(code, id) {
          if (resolve(id.split("?")[0]).toLowerCase() !== FPS_FILE.toLowerCase()) return null;
          transformSeen += 1;
          gate(code === originalSource, "VITE_SOURCE_MISMATCH");
          let transformed = originalSource;
          for (const [name, marker, replacement] of TRANSFORMS) {
            gate(occurrences(transformed, marker) === 1, "TRANSFORM_MARKER_COUNT", name);
            transformed = transformed.replace(marker, replacement);
          }
          let roundTrip = transformed;
          for (const [name, marker, replacement] of [...TRANSFORMS].reverse()) {
            gate(occurrences(roundTrip, replacement) === 1, "TRANSFORM_REPLACEMENT_COUNT", name);
            roundTrip = roundTrip.replace(replacement, marker);
          }
          restored = roundTrip === originalSource;
          rngSame = json(randTokens(transformed)) === json(randTokens(originalSource));
          gate(restored, "TRANSFORM_NOT_REVERSIBLE");
          gate(rngSame, "RNG_TOKEN_SEQUENCE_CHANGED");
          return { code: transformed, map: null };
        },
      }],
    });
    const loaded = await vite.ssrLoadModule(FPS_MODULE_ID);
    gate(transformSeen === 1, "TRANSFORM_EXECUTION_COUNT", String(transformSeen));
    gate(restored && rngSame, "TRANSFORM_INTEGRITY");
    const api = loaded.__CS_MAPAWARE_R18B_TEST_API__;
    gate(typeof api?.simulateFps === "function", "SIMULATOR_EXPORT_MISSING");
    gate(Array.isArray(api?.ROSTER), "ROSTER_EXPORT_MISSING");
    gate(api.TACTICS_DB && typeof api.TACTICS_DB === "object", "TACTICS_EXPORT_MISSING");
    return api;
  } finally {
    if (vite) await vite.close();
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function main() {
  gate(process.argv.length === 2, "CLI_FLAGS_FORBIDDEN", "R18-B verifier is locked to the focused design.");
  const source = readFileSync(FPS_FILE, "utf8");
  const sourceSha256 = sha256(source);
  gate(sourceSha256 === SOURCE_SHA256, "SOURCE_SHA256", `expected=${SOURCE_SHA256} actual=${sourceSha256}`);
  gate(randTokens(source).length === EXPECTED_RAND_CALLS, "RAND_CALL_COUNT", String(randTokens(source).length));
  gate(json(generatedSeeds()) === json(FIXED_SEEDS), "SEED_GENERATION");
  gate(sha256(json(FIXED_SEEDS)) === SEED_SET_SHA256, "SEED_SET_SHA256");
  console.log(`schema: ${EVENT_SCHEMA}`);
  console.log(`seed generation version: ${SEED_GENERATION_VERSION}`);
  console.log(`seedSetSha256: ${SEED_SET_SHA256}`);
  console.log(`engineSourceSha256: ${sourceSha256}`);
  console.log(`rand() call sites: ${randTokens(source).length}`);
  console.log(`focused read point: ${MAP_KEY}/${T_TACTIC_ID}/${CT_TACTIC_ID}, baseline roster, fixed seeds=${FIXED_SEEDS.length}`);

  const api = await loadApi(source);
  const map = api.TACTICS_DB[MAP_KEY];
  const tTactic = freeze(clone(map?.t?.find((item) => item.id === T_TACTIC_ID)));
  const ctTactic = freeze(clone(map?.ct?.find((item) => item.id === CT_TACTIC_ID)));
  const baselineRoster = freeze(clone(api.ROSTER));
  gate(tTactic?.id === T_TACTIC_ID, "T_TACTIC_MISSING");
  gate(ctTactic?.id === CT_TACTIC_ID, "CT_TACTIC_MISSING");
  gate(baselineRoster.length === 10, "ROSTER_SIZE", String(baselineRoster.length));

  const arms = [];
  const aggregate = {
    probes: 0, distanceEligible: 0, wallBlocked: 0, smokeBlocked: 0, bothBlocked: 0,
    visibleCandidates: 0, tTeammateContext: 0, ctTeammateContext: 0,
    tNearestSamples: 0, ctNearestSamples: 0,
  };
  for (const seed of FIXED_SEEDS) {
    const arm = runArm(api, { mapKey: MAP_KEY, tTactic, ctTactic, roster: baselineRoster, seed });
    addSummary(aggregate, arm.metrics);
    arms.push({ seed: arm.seed, strictSimDigest: arm.strictSimDigest, eventDigest: arm.eventDigest, metrics: arm.metrics });
    console.log(`read-point seed: ${JSON.stringify({ seed, probes: arm.metrics.probes, visibleCandidates: arm.metrics.visibleCandidates, wallBlocked: arm.metrics.wallBlocked, smokeBlocked: arm.metrics.smokeBlocked, teammateContext: { t: arm.metrics.tTeammateContext, ct: arm.metrics.ctTeammateContext } })}`);
  }
  const suite = {
    schema: SUITE_SCHEMA,
    sourceSha256,
    seedSetSha256: SEED_SET_SHA256,
    scenario: { mapKey: MAP_KEY, tTacticId: T_TACTIC_ID, ctTacticId: CT_TACTIC_ID },
    simulationArms: "off/on/repeated-on",
    seeds: FIXED_SEEDS,
    arms,
    aggregate,
  };
  const suiteDigest = sha256(json(suite));
  console.log(`simulations: ${FIXED_SEEDS.length * 3}`);
  console.log(`aggregate: ${JSON.stringify(aggregate)}`);
  console.log(`suiteDigest: ${suiteDigest}`);
  console.log("production source modified: no (memory transform only)");
  console.log("claim boundary: spatial context measurement only; not proof of actor awareness or MapAware completion");
  console.log("future production wiring: No-Go for direct mapAware -> vis; Revise after role/read-chain and actor-decision evidence");
  console.log("CS MapAware Semantics / Read-Point Design R18-B: PASS");
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
