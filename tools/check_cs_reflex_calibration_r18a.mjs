#!/usr/bin/env node
// CS Reflex Calibration Pilot R18-A
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
const EVENT_SCHEMA = "CsReflexCalibrationRepairEvent.v1";
const SUITE_SCHEMA = "CsReflexCalibrationRepairSuite.v1";
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
const BAND = 12;
const PRIMARY_METRICS = Object.freeze(["targetAttackerConversions", "targetAttackerKills", "targetAttackerDamage"]);
const METRICS = Object.freeze([
  "pairOpportunities", "pairFireAttempts", "pairFireTriggers", "pairResolutions", "pairConversions", "pairKills", "pairDamage",
  "targetPairOpportunities", "targetPairFireAttempts", "targetPairFireTriggers",
  "targetAttackerResolutions", "targetAttackerConversions", "targetAttackerKills", "targetAttackerDamage",
  "targetAttackerHeadshots", "targetAttackerHeadshotRate",
  "targetDefenderResolutions", "targetDefenderHits", "targetDefenderDeaths", "targetDefenderDamageTaken",
  "targetDefenderHeadshots", "targetDefenderHeadshotRate",
  "roundWins", "roundCount", "upperClampPct", "lowerClampPct",
]);

const SIGNATURE_MARKER = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster){";
const SIGNATURE_REPLACEMENT = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster,__measure=null){";
const OPPORTUNITY_MARKER = "let fireChance=d<15?0.85:d<30?0.55:(sniperInvolved?0.55:0.3);";
const OPPORTUNITY_REPLACEMENT = `${OPPORTUNITY_MARKER}__measure?.record("opportunity",{round:rnd+1,sec,tPlayerId:tp.id,cPlayerId:cp.id,tRole:tp.role,cRole:cp.role,distance:d});`;
const FIRE_MARKER = "if(rand()>=fireChance)continue;";
const FIRE_REPLACEMENT = "const __r18FireRoll=rand();__measure?.record(\"fire\",{round:rnd+1,sec,tPlayerId:tp.id,cPlayerId:cp.id,tRole:tp.role,cRole:cp.role,distance:d,fireChance,roll:__r18FireRoll});if(__r18FireRoll>=fireChance)continue;";
const PT_MARKER = "const Pt=clamp(0.5+(tSk-cSk)*0.013+(MAP_EDGE[mapKey]??0.02)+ecoEdge+flashPen+tacEdge,0.07,0.93);";
const PT_REPLACEMENT = `${PT_MARKER}__measure?.record("probability",{round:rnd+1,sec,tPlayerId:tp.id,cPlayerId:cp.id,tRole:tp.role,cRole:cp.role,pt:Pt,lowerClamp:Pt===0.07,upperClamp:Pt===0.93});`;
const RESOLUTION_MARKER = "const g=GUNS[at.gun];const isHS=rand()<g.hs*(0.72+0.55*((at.stats?.acc||80)/100));";
const RESOLUTION_REPLACEMENT = `${RESOLUTION_MARKER}__measure?.record("resolution",{round:rnd+1,sec,tPlayerId:tp.id,cPlayerId:cp.id,tRole:tp.role,cRole:cp.role,distance:d,attackerId:at.id,defenderId:df.id,attackerSide:at.side,defenderSide:df.side,pt:Pt,headshot:isHS});`;
const DAMAGE_MARKER = "const {killed}=applyDamage(at,df,dmg);";
const DAMAGE_REPLACEMENT = `const __r18DamageBefore=at.dmgDealt||0;${DAMAGE_MARKER}__measure?.record("conversion",{round:rnd+1,sec,tPlayerId:tp.id,cPlayerId:cp.id,attackerId:at.id,defenderId:df.id,attackerSide:at.side,defenderSide:df.side,rawDamage:dmg,effectiveDamage:(at.dmgDealt||0)-__r18DamageBefore,killed,headshot:isHS,pt:Pt});`;
const RETURN_MARKER = "return { EsportsFPS3D, buildMatchResult };";
const RETURN_REPLACEMENT = "return { EsportsFPS3D, buildMatchResult, simulateFps, ROSTER, TACTICS_DB };";
const EXPORT_MARKER = "export { EsportsFPS3D, buildMatchResult };";
const EXPORT_REPLACEMENT = [
  "const __CS_REFLEX_CALIBRATION_R18A_TEST_API__ = Object.freeze({",
  "  simulateFps: __FPS3D_MODULE.simulateFps,",
  "  ROSTER: __FPS3D_MODULE.ROSTER,",
  "  TACTICS_DB: __FPS3D_MODULE.TACTICS_DB,",
  "});",
  "export { EsportsFPS3D, buildMatchResult, __CS_REFLEX_CALIBRATION_R18A_TEST_API__ };",
].join("\n");
const TRANSFORMS = Object.freeze([
  ["signature", SIGNATURE_MARKER, SIGNATURE_REPLACEMENT],
  ["opportunity", OPPORTUNITY_MARKER, OPPORTUNITY_REPLACEMENT],
  ["fire", FIRE_MARKER, FIRE_REPLACEMENT],
  ["probability", PT_MARKER, PT_REPLACEMENT],
  ["resolution", RESOLUTION_MARKER, RESOLUTION_REPLACEMENT],
  ["conversion", DAMAGE_MARKER, DAMAGE_REPLACEMENT],
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
  if (typeof value === "number") { gate(Number.isFinite(value), "NON_FINITE_NUMBER"); return Object.is(value, -0) ? 0 : value; }
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
function rngTokens(source) { return source.match(/\b(?:rand|Math\.random)\s*\(\s*\)/g) ?? []; }
function randTokens(source) { return source.match(/\brand\s*\(\s*\)/g) ?? []; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

function createCollector() {
  const events = [];
  return {
    events,
    record(type, payload) {
      gate(["opportunity", "fire", "probability", "resolution", "conversion"].includes(type), "UNKNOWN_EVENT", type);
      gate(payload && typeof payload === "object" && !Array.isArray(payload), "EVENT_PAYLOAD");
      const event = { schema: EVENT_SCHEMA, type, ...payload };
      for (const [key, value] of Object.entries(event)) {
        gate(value === null || ["string", "number", "boolean"].includes(typeof value), "EVENT_FIELD", key);
      }
      events.push(Object.freeze(event));
    },
  };
}
function eventKey(event) { return [event.round, event.sec, event.tPlayerId, event.cPlayerId].join("|"); }

function validateEvents(events, targetId) {
  const opportunities = new Map();
  const fires = new Map();
  const probabilities = new Map();
  const resolutions = new Map();
  const conversions = new Map();
  for (const event of events) {
    gate(event.schema === EVENT_SCHEMA, "EVENT_SCHEMA", event.type);
    const key = eventKey(event);
    if (event.type === "opportunity") {
      gate(!opportunities.has(key), "DUPLICATE_OPPORTUNITY", key);
      gate(Number.isInteger(event.round) && event.round >= 1, "OPPORTUNITY_ROUND", key);
      gate(Number.isInteger(event.sec) && event.sec >= 0, "OPPORTUNITY_SEC", key);
      gate(Number.isFinite(event.distance) && event.distance >= 0 && event.distance < 55, "OPPORTUNITY_DISTANCE", key);
      opportunities.set(key, event);
    } else if (event.type === "fire") {
      gate(opportunities.has(key), "FIRE_WITHOUT_OPPORTUNITY", key + "\nknown=" + [...opportunities.keys()].slice(-8).join(","));
      gate(!fires.has(key), "DUPLICATE_FIRE", key);
      gate(Number.isFinite(event.fireChance) && event.fireChance >= 0 && event.fireChance <= 1, "FIRE_CHANCE", key);
      gate(Number.isFinite(event.roll) && event.roll >= 0 && event.roll < 1, "FIRE_ROLL", key);
      fires.set(key, event);
    } else if (event.type === "probability") {
      gate(fires.has(key), "PROBABILITY_WITHOUT_FIRE", key);
      gate(!probabilities.has(key), "DUPLICATE_PROBABILITY", key);
      gate(Number.isFinite(event.pt) && event.pt >= 0.07 && event.pt <= 0.93, "PT_RANGE", key);
      gate(event.lowerClamp === (event.pt === 0.07), "LOWER_CLAMP", key);
      gate(event.upperClamp === (event.pt === 0.93), "UPPER_CLAMP", key);
      probabilities.set(key, event);
    } else if (event.type === "resolution") {
      gate(probabilities.has(key), "RESOLUTION_WITHOUT_PROBABILITY", key);
      gate(!resolutions.has(key), "DUPLICATE_RESOLUTION", key);
      gate(typeof event.attackerId === "string" && typeof event.defenderId === "string", "RESOLUTION_ACTORS", key);
      gate(typeof event.attackerSide === "string" && typeof event.defenderSide === "string", "RESOLUTION_SIDES", key);
      gate(typeof event.headshot === "boolean", "RESOLUTION_HEADSHOT", key);
      resolutions.set(key, event);
    } else {
      gate(resolutions.has(key), "CONVERSION_WITHOUT_RESOLUTION", key);
      gate(probabilities.has(key), "CONVERSION_WITHOUT_PROBABILITY", key);
      gate(!conversions.has(key), "DUPLICATE_CONVERSION", key);
      const resolution = resolutions.get(key);
      gate(event.attackerId === resolution.attackerId && event.defenderId === resolution.defenderId,
        "CONVERSION_ACTOR_MISMATCH", key);
      gate(event.attackerSide === resolution.attackerSide && event.defenderSide === resolution.defenderSide,
        "CONVERSION_SIDE_MISMATCH", key);
      gate(event.headshot === resolution.headshot, "CONVERSION_HEADSHOT_MISMATCH", key);
      gate(Number.isInteger(event.rawDamage) && event.rawDamage > 0, "CONVERSION_RAW_DAMAGE", key);
      gate(Number.isInteger(event.effectiveDamage) && event.effectiveDamage > 0 && event.effectiveDamage <= event.rawDamage,
        "CONVERSION_EFFECTIVE_DAMAGE", key);
      gate(typeof event.killed === "boolean", "CONVERSION_KILLED", key);
      conversions.set(key, event);
    }
  }
  gate(opportunities.size > 0, "NO_OPPORTUNITY");
  gate(fires.size === opportunities.size, "FIRE_OPPORTUNITY_MISMATCH", `${fires.size}/${opportunities.size}`);
  gate(probabilities.size === [...fires.values()].filter((event) => event.roll < event.fireChance).length,
    "PROBABILITY_TRIGGER_MISMATCH", `${probabilities.size}/${[...fires.values()].filter((event) => event.roll < event.fireChance).length}`);
  gate(resolutions.size === probabilities.size, "RESOLUTION_TRIGGER_MISMATCH", `${resolutions.size}/${probabilities.size}`);
  gate(conversions.size === resolutions.size, "CONVERSION_RESOLUTION_MISMATCH", `${conversions.size}/${resolutions.size}`);
  return { opportunities, fires, probabilities, resolutions, conversions };
}

function resultMetrics(sim, events, targetId) {
  const validated = validateEvents(events, targetId);
  const players = Array.isArray(sim.players) ? sim.players : [];
  const target = players.find((player) => player.id === targetId);
  gate(target, "TARGET_RESULT_MISSING", targetId);
  const targetPairEvents = (kind) => [...validated[kind].values()].filter((event) => event.tPlayerId === targetId);
  const resolutionEvents = [...validated.resolutions.values()];
  const conversionEvents = [...validated.conversions.values()];
  const targetResolutions = resolutionEvents.filter((event) => event.tPlayerId === targetId);
  const targetConversions = conversionEvents.filter((event) => event.tPlayerId === targetId);
  const attackerResolutions = targetResolutions.filter((event) => event.attackerId === targetId);
  const attackerConversions = targetConversions.filter((event) => event.attackerId === targetId);
  const defenderResolutions = targetResolutions.filter((event) => event.defenderId === targetId);
  const defenderConversions = targetConversions.filter((event) => event.defenderId === targetId);
  gate(attackerResolutions.length + defenderResolutions.length === targetResolutions.length, "TARGET_RESOLUTION_PARTITION", targetId);
  gate(attackerConversions.length + defenderConversions.length === targetConversions.length, "TARGET_CONVERSION_PARTITION", targetId);
  const rate = (numerator, denominator) => denominator ? +(100 * numerator / denominator).toFixed(4) : 0;
  return {
    pairOpportunities: validated.opportunities.size,
    pairFireAttempts: validated.fires.size,
    pairFireTriggers: [...validated.fires.values()].filter((event) => event.roll < event.fireChance).length,
    pairResolutions: resolutionEvents.length,
    pairConversions: conversionEvents.length,
    pairKills: conversionEvents.filter((event) => event.killed).length,
    pairDamage: conversionEvents.reduce((sum, event) => sum + event.effectiveDamage, 0),
    targetPairOpportunities: targetPairEvents("opportunities").length,
    targetPairFireAttempts: targetPairEvents("fires").length,
    targetPairFireTriggers: targetPairEvents("fires").filter((event) => event.roll < event.fireChance).length,
    targetAttackerResolutions: attackerResolutions.length,
    targetAttackerConversions: attackerConversions.length,
    targetAttackerKills: attackerConversions.filter((event) => event.killed).length,
    targetAttackerDamage: attackerConversions.reduce((sum, event) => sum + event.effectiveDamage, 0),
    targetAttackerHeadshots: attackerResolutions.filter((event) => event.headshot).length,
    targetAttackerHeadshotRate: rate(attackerResolutions.filter((event) => event.headshot).length, attackerResolutions.length),
    targetDefenderResolutions: defenderResolutions.length,
    targetDefenderHits: defenderConversions.length,
    targetDefenderDeaths: defenderConversions.filter((event) => event.killed).length,
    targetDefenderDamageTaken: defenderConversions.reduce((sum, event) => sum + event.effectiveDamage, 0),
    targetDefenderHeadshots: defenderResolutions.filter((event) => event.headshot).length,
    targetDefenderHeadshotRate: rate(defenderResolutions.filter((event) => event.headshot).length, defenderResolutions.length),
    roundWins: Number(sim.tScore) || 0,
    roundCount: Number(sim.rounds) || 0,
    upperClampPct: validated.fires.size ? +(100 * [...validated.probabilities.values()].filter((event) => event.upperClamp).length / validated.fires.size).toFixed(3) : 0,
    lowerClampPct: validated.fires.size ? +(100 * [...validated.probabilities.values()].filter((event) => event.lowerClamp).length / validated.fires.size).toFixed(3) : 0,
  };
}

function mean(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function sampleSd(values) {
  if (values.length < 2) return 0;
  const avg = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + ((value - avg) ** 2), 0) / (values.length - 1));
}
function pairedStats(treatmentRows, baselineRows) {
  const out = {};
  for (const metric of METRICS) {
    const diffs = treatmentRows.map((row, index) => row.metrics[metric] - baselineRows[index].metrics[metric]);
    const avg = mean(diffs);
    const sd = sampleSd(diffs);
    out[metric] = {
      meanDiff: +avg.toFixed(4),
      sd: +sd.toFixed(4),
      effectSize: sd === 0 ? (avg === 0 ? 0 : null) : +(avg / sd).toFixed(4),
      positiveSeeds: diffs.filter((value) => value > 0).length,
      negativeSeeds: diffs.filter((value) => value < 0).length,
      zeroSeeds: diffs.filter((value) => value === 0).length,
    };
  }
  return out;
}
function strictMajority(count, total = FIXED_SEEDS.length) {
  return count > total / 2;
}
function aggregate(rows) {
  return Object.fromEntries(METRICS.map((metric) => [metric, +mean(rows.map((row) => row.metrics[metric])).toFixed(4)]));
}
function monotonicity(levelRows, baselineRows) {
  const metrics = {};
  for (const metric of PRIMARY_METRICS) {
    const low = pairedStats(levelRows.low, baselineRows)[metric];
    const high = pairedStats(levelRows.high, baselineRows)[metric];
    const aggregateDirection = high.meanDiff >= 0 && low.meanDiff <= 0;
    const signedDirection = strictMajority(high.positiveSeeds) && strictMajority(low.negativeSeeds);
    metrics[metric] = { aggregateDirection, signedDirection, pass: aggregateDirection && signedDirection, low, high };
  }
  return { metrics, passCount: Object.values(metrics).filter((item) => item.pass).length };
}
function saturation(levelRows, baselineRows) {
  const high = pairedStats(levelRows.high, baselineRows);
  const low = pairedStats(levelRows.low, baselineRows);
  const clampSignal = aggregate(levelRows.high).upperClampPct >= 50 || aggregate(levelRows.low).lowerClampPct >= 50;
  const marginalSignal = PRIMARY_METRICS.some((metric) => {
    const highAbs = Math.abs(high[metric].meanDiff);
    const lowAbs = Math.abs(low[metric].meanDiff);
    return highAbs < 0.05 && lowAbs >= 0.5;
  });
  return {
    status: clampSignal || marginalSignal ? "signal" : "not-observed",
    clampSignal,
    marginalSignal,
    note: "Three-point pilot can detect a saturation signal but cannot prove a final plateau.",
  };
}

function changedPaths(before, after, path = "root") {
  if (Object.is(before, after)) return [];
  if (!before || !after || typeof before !== "object" || typeof after !== "object") return [path];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].sort().flatMap((key) => changedPaths(before[key], after[key], `${path}.${key}`));
}

function treatmentRoster(baselineRoster, targetId, level) {
  const next = clone(baselineRoster);
  const baseTarget = baselineRoster.find((player) => player.id === targetId);
  const target = next.find((player) => player.id === targetId);
  gate(baseTarget && target, "TREATMENT_TARGET_MISSING", targetId);
  const baseline = Number(baseTarget.stats?.rxn);
  gate(Number.isFinite(baseline), "BASELINE_RXN_MISSING", targetId);
  const values = { low: clamp(baseline - BAND, 1, 99), baseline, high: clamp(baseline + BAND, 1, 99) };
  gate(values.low < values.baseline && values.baseline < values.high, "RXN_BAND_CLAMPED", `${targetId} ${JSON.stringify(values)}`);
  target.stats.rxn = values[level];
  gate(target.fps === baseTarget.fps && target.moba === baseTarget.moba, "HUD_OVR_RECOMPUTED", targetId);
  const targetIndex = baselineRoster.findIndex((player) => player.id === targetId);
  const diff = changedPaths(baselineRoster, next, "roster");
  gate(diff.length === 1 && diff[0] === `roster.${targetIndex}.stats.rxn`, "TREATMENT_INPUT_DIFF", `${targetId}: ${JSON.stringify(diff)}`);
  return { roster: freeze(next), value: values[level], values };
}
function inputDigest(mapKey, tTactic, ctTactic, roster) { return sha256(json({ mapKey, tTactic, ctTactic, roster })); }

function runArm(api, { mapKey, tTactic, ctTactic, roster, seed, targetId }) {
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
  const metrics = targetId ? resultMetrics(on1, collector1.events, targetId) : null;
  return {
    seed,
    strictSimDigest: sha256(offJson),
    eventDigest: sha256(eventJson1),
    metrics,
    metricsDigest: metrics ? sha256(json(metrics)) : null,
    sim: on1,
    events: collector1.events,
  };
}

function changedSeedStats(treatmentRows, baselineRows) {
  const strictChangedSeeds = treatmentRows.filter((row, index) => row.strictSimDigest !== baselineRows[index].strictSimDigest).length;
  const targetMetricChangedSeeds = treatmentRows.filter((row, index) => row.metricsDigest !== baselineRows[index].metricsDigest).length;
  const total = treatmentRows.length;
  return {
    strictChangedSeeds,
    strictChangedSeedRatio: total ? +(strictChangedSeeds / total).toFixed(4) : 0,
    targetMetricChangedSeeds,
    targetMetricChangedSeedRatio: total ? +(targetMetricChangedSeeds / total).toFixed(4) : 0,
  };
}

async function loadApi(originalSource) {
  let transformSeen = 0;
  let restored = false;
  let rngSame = false;
  const tempRoot = mkdtempSync(join(tmpdir(), "esmo-cs-reflex-r18a-"));
  let vite = null;
  try {
    vite = await createServer({
      root: ROOT, configFile: false, envFile: false, appType: "custom", logLevel: "error",
      cacheDir: join(tempRoot, "vite-cache"), optimizeDeps: { noDiscovery: true, include: [] },
      server: { middlewareMode: true },
      plugins: [{
        name: "cs-reflex-calibration-r18a-memory-hooks",
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
    const api = loaded.__CS_REFLEX_CALIBRATION_R18A_TEST_API__;
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
  gate(process.argv.length === 2, "CLI_FLAGS_FORBIDDEN", "R18-A candidate sweep is locked to the spec.");
  const source = readFileSync(FPS_FILE, "utf8");
  const sourceSha256 = sha256(source);
  gate(sourceSha256 === SOURCE_SHA256, "SOURCE_SHA256", `expected=${SOURCE_SHA256} actual=${sourceSha256}`);
  gate(randTokens(source).length === EXPECTED_RAND_CALLS, "RAND_CALL_COUNT", String(randTokens(source).length));
  gate(json(generatedSeeds()) === json(FIXED_SEEDS), "SEED_GENERATION");
  gate(sha256(json(FIXED_SEEDS)) === SEED_SET_SHA256, "SEED_SET_SHA256");
  gate(!strictMajority(8, 16) && strictMajority(9, 16), "STRICT_MAJORITY_GATE");
  console.log(`schema: ${EVENT_SCHEMA}`);
  console.log(`seed generation version: ${SEED_GENERATION_VERSION}`);
  console.log(`seedSetSha256: ${SEED_SET_SHA256}`);
  console.log(`engineSourceSha256: ${sourceSha256}`);
  console.log(`rand() call sites: ${randTokens(source).length}`);
  console.log(`sweep: ${MAP_KEY}/${T_TACTIC_ID}/${CT_TACTIC_ID}, roles=all T-side, levels=low/baseline/high, band=+/-${BAND}`);

  const api = await loadApi(source);
  const map = api.TACTICS_DB[MAP_KEY];
  const tTactic = freeze(clone(map?.t?.find((item) => item.id === T_TACTIC_ID)));
  const ctTactic = freeze(clone(map?.ct?.find((item) => item.id === CT_TACTIC_ID)));
  const baselineRoster = freeze(clone(api.ROSTER));
  gate(tTactic?.id === T_TACTIC_ID, "T_TACTIC_MISSING");
  gate(ctTactic?.id === CT_TACTIC_ID, "CT_TACTIC_MISSING");
  const targets = baselineRoster.filter((player) => player.side === "t");
  gate(targets.length === 5, "T_ROSTER_SIZE", String(targets.length));
  gate(new Set(targets.map((player) => player.role)).size === targets.length, "T_ROLE_DUPLICATE");
  gate(targets.every((player) => Number.isFinite(player.stats?.rxn)), "T_RXN_MISSING");

  const baselineBySeed = new Map();
  for (const seed of FIXED_SEEDS) {
    const arm = runArm(api, { mapKey: MAP_KEY, tTactic, ctTactic, roster: baselineRoster, seed });
    baselineBySeed.set(seed, arm);
  }
  const cases = [];
  for (const target of targets) {
    const levelRows = { low: [], baseline: [], high: [] };
    levelRows.baseline = FIXED_SEEDS.map((seed) => {
      const arm = baselineBySeed.get(seed);
      const metrics = resultMetrics(arm.sim, arm.events, target.id);
      return { ...arm, metrics, metricsDigest: sha256(json(metrics)) };
    });
    const values = {};
    for (const level of ["low", "high"]) {
      const treatment = treatmentRoster(baselineRoster, target.id, level);
      values[level] = treatment.value;
      for (const seed of FIXED_SEEDS) {
        levelRows[level].push(runArm(api, {
          mapKey: MAP_KEY, tTactic, ctTactic, roster: treatment.roster, seed, targetId: target.id,
        }));
      }
    }
    const summary = {
      targetId: target.id,
      role: target.role,
      baselineRxn: target.stats.rxn,
      levels: { low: values.low, baseline: target.stats.rxn, high: values.high },
      aggregate: Object.fromEntries(Object.entries(levelRows).map(([level, rows]) => [level, aggregate(rows)])),
      paired: {
        lowBaseline: pairedStats(levelRows.low, levelRows.baseline),
        highBaseline: pairedStats(levelRows.high, levelRows.baseline),
        lowHigh: pairedStats(levelRows.low, levelRows.high),
      },
      changedSeeds: {
        lowBaseline: changedSeedStats(levelRows.low, levelRows.baseline),
        highBaseline: changedSeedStats(levelRows.high, levelRows.baseline),
        lowHigh: changedSeedStats(levelRows.low, levelRows.high),
      },
    };
    summary.monotonicity = monotonicity(levelRows, levelRows.baseline);
    summary.saturation = saturation(levelRows, levelRows.baseline);
    cases.push(summary);
    const secondaryMetrics = [
      "targetPairOpportunities", "targetPairFireTriggers", "pairOpportunities", "pairFireTriggers",
      "targetAttackerResolutions", "targetAttackerHeadshots", "targetAttackerHeadshotRate",
      "targetDefenderHits", "targetDefenderDeaths", "targetDefenderDamageTaken", "targetDefenderHeadshotRate",
      "roundWins", "pairDamage", "upperClampPct", "lowerClampPct",
    ];
    console.log(`reflex case: ${JSON.stringify({
      targetId: summary.targetId,
      role: summary.role,
      levels: summary.levels,
      primary: Object.fromEntries(PRIMARY_METRICS.map((metric) => [metric, { lowBaseline: summary.paired.lowBaseline[metric], highBaseline: summary.paired.highBaseline[metric], lowHigh: summary.paired.lowHigh[metric] }])),
      secondary: Object.fromEntries(secondaryMetrics.map((metric) => [metric, { lowBaseline: summary.paired.lowBaseline[metric], highBaseline: summary.paired.highBaseline[metric], lowHigh: summary.paired.lowHigh[metric] }])),
      changedSeeds: summary.changedSeeds,
      monotonicity: summary.monotonicity,
      saturation: summary.saturation,
    })}`);
  }
  const monotonicPasses = cases.reduce((sum, item) => sum + item.monotonicity.passCount, 0);
  const suite = {
    schema: SUITE_SCHEMA,
    sourceSha256,
    seedSetSha256: SEED_SET_SHA256,
    scenario: { mapKey: MAP_KEY, tTacticId: T_TACTIC_ID, ctTacticId: CT_TACTIC_ID },
    band: BAND,
    seeds: FIXED_SEEDS,
    cases,
  };
  const suiteDigest = sha256(json(suite));
  const allPrimaryMonotonic = cases.every((item) => item.monotonicity.passCount >= 2);
  const saturationSignals = cases.filter((item) => item.saturation.status === "signal").length;
  console.log(`simulations: ${FIXED_SEEDS.length * (1 + targets.length * 2) * 3}`);
  console.log(`monotonicity: ${monotonicPasses}/${cases.length * PRIMARY_METRICS.length} primary KPI checks passed`);
  console.log(`saturation signals: ${saturationSignals}/${cases.length} (three-point pilot; not final plateau evidence)`);
  console.log(`reasonable pilot range: rxn baseline +/- ${BAND}; production patch candidate: ${allPrimaryMonotonic && saturationSignals === 0 ? "evidence-supported-for-review-only" : "not-supported"}`);
  console.log(`suiteDigest: ${suiteDigest}`);
  console.log("production source modified: no (memory transform only)");
  console.log("claim boundary: Reflex combat calibration pilot only; not full 16-stat calibration");
  console.log("CS Reflex Calibration Pilot R18-A: PASS");
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
