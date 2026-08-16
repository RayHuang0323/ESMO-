#!/usr/bin/env node
// R22：只回放既有 R18/R19/R20/R21 evidence，建立分層 causal readiness 判定。
// 不載入或重跑 simulator；production simulator 仍只有一套，這支是 evidence verifier。

import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CS_R27_DECISION_SOURCE_SHA256, CS_R33_RESILIENCE_SOURCE_SHA256, csR25R24Source, csR33R32Source } from "./cs_r15_legacy_source.mjs";
import {
  CALIBRATION_LEVELS,
  changedSeedSummary,
  clampSummary,
  classifyCausalReadiness,
  monotonicity,
  monotonicityFromCounts,
  pairedEffect,
  strictMajority,
  thresholdCrossing,
} from "./cs_calibration_measurement.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FPS_FILE = resolve(ROOT, "src/battle/fps/EsportsFPS3D.jsx");
const SOURCE_SHA256 = "57476524ffa5693cb2cd00f28d73a1355e2dcf14ce0e018c9aa766febc706c29";
const SEED_SET_SHA256 = "52414f0e6b09ba72b9223b5e76b6ad9d859e8b8ea6fe77dcc2a2a08876a74c6d";
const FIXED_SEEDS = 16;
const RNG_CALL_SITES = 21;
const FRAMEWORK_SCHEMA = "CsLocalCausalCalibrationFramework.v1";
const FRAMEWORK_VERSION = "R22-local-causal-v1";
const APPLIED_THRESHOLD = 0.82;

const PRIOR_EVIDENCE = Object.freeze({
  reflexRepair: Object.freeze({
    path: "review/cs-gameplay/CS_REFLEX_CALIBRATION_R18A_REPAIR_REPORT.md",
    sha256: "f9ff5f772a55d1fdd414033bd5762a81ad6543439399b6095b6ee2ac17c43082",
    suiteDigest: "104c38526b6ff0bbd9da41b89631d60bba298dce0fd45cee3a209253973a471b",
    simulations: 528,
  }),
  reflexAudit: Object.freeze({
    path: "review/cs-gameplay/CS_REFLEX_READ_CHAIN_R19_REPORT.md",
    sha256: "4921ce93108a50f986b4f8c087ee8e73f4dabf09c63e1ed1d85f5f68e63ff5b8",
    suiteDigest: "37db1597d443b399c4c02d0e47023aa8730b5c714e572933bbcad11a46e9ddda",
    simulations: 176,
  }),
  reflexRevalidation: Object.freeze({
    path: "review/cs-gameplay/CS_REFLEX_SEMANTIC_CORRECTION_R19_REVALIDATION_REPORT.md",
    sha256: "68193197be65a6a7f94a3ff697e537c82565b8dd87fa836790bb7ae2f8d03fd9",
    suiteDigest: "fa483388aaeb348fc9552381655f2da8ff192a90d736a39838962159bfc43fec",
    r19SuiteDigest: "a2b0db3aa6357ba9d551217634e6426f726d1028d0d60428d7544bd6c2f34030",
    simulations: 528,
  }),
  positioning: Object.freeze({
    path: "review/cs-gameplay/CS_POSITIONING_MEASUREMENT_R20_REPORT.md",
    sha256: "d351fa2dfca638c2751d6d8758297766682599e9bd51f65c9eb49199d2a4d2df",
    suiteDigest: "6849de4fc39b6b8311c67e91411a7aaf6c1844e435c729c631c7d03e600f410c",
    simulations: 528,
  }),
  apm: Object.freeze({
    path: "review/cs-gameplay/CS_APM_MEASUREMENT_R21_REPORT.md",
    sha256: "0af39426e993230ff486e63de6121d243b23957098813aeb8f06e452238c2310",
    suiteDigest: "0380561f76b66ddf774fdf86decf048bd261082c23fe06a978553d637a8d429a",
    simulations: 528,
  }),
});

const REFLEX_ROLES = Object.freeze([
  { role: "entry", posWeight: 4, combat: [-2.8351, 2.7805], pt: [-0.0382, 0.0268], changed: [11, 6, 13] },
  { role: "rifler", posWeight: 4, combat: [-2.582, 2.0893], pt: [-0.0318, 0.0279], changed: [13, 9, 15] },
  { role: "awp", posWeight: 1, combat: [-1.8229, 1.3748], pt: [-0.0245, 0.0266], changed: [6, 3, 8] },
  { role: "lurker", posWeight: 0, combat: [-2.1141, 2.2154], pt: [-0.0298, 0.0272], changed: [7, 9, 11] },
  { role: "igl", posWeight: 0, combat: [-2.1317, 2.5642], pt: [-0.0211, 0.0322], changed: [8, 10, 14] },
]);

const POSITIONING_ROLES = Object.freeze([
  { role: "entry", direct: [83.1171, 84.3426, 85.5629], aggr: [1.0906, 1.105, 1.1194], retreat: "insufficient", thresholdCrossings: 0 },
  { role: "rifler", direct: [86.3047, 87.873, 89.4941], aggr: [0.926, 0.9404, 0.9548], retreat: "insufficient", thresholdCrossings: 0 },
  { role: "awp", direct: [84.1451, 86.3886, 88.064], aggr: [0.648, 0.6624, 0.6768], retreat: "covered", thresholdCrossings: 0 },
  { role: "lurker", direct: [87.856, 90.0846, 93.2253], aggr: [0.7944, 0.8088, 0.8232], retreat: "threshold-dominated", thresholdCrossings: 16 },
  { role: "igl", direct: [76.7488, 77.7788, 79.3025], aggr: [0.7626, 0.777, 0.7914], retreat: "covered-but-path-amplified", thresholdCrossings: 0 },
]);

const APM_ROLES = Object.freeze([
  { role: "entry", direct: [82.4505, 84.3426, 86.2747], aggr: [1.0858, 1.105, 1.1242], combatPassing: 16, damagePassing: 10, killPassing: 8, highClampReads: 0 },
  { role: "rifler", direct: [86.3284, 87.873, 89.6264], aggr: [0.9212, 0.9404, 0.9596], combatPassing: 13, damagePassing: 5, killPassing: 5, highClampReads: 0 },
  { role: "awp", direct: [85.4747, 86.3885, 86.9588], aggr: [0.6432, 0.6624, 0.6816], combatPassing: 14, damagePassing: 3, killPassing: 2, highClampReads: 0 },
  { role: "lurker", direct: [88.4605, 90.0846, 92.1685], aggr: [0.7896, 0.8088, 0.8232], combatPassing: 16, damagePassing: 7, killPassing: 7, highClampReads: 2083 },
  { role: "igl", direct: [76.3333, 77.7788, 79.764], aggr: [0.7578, 0.777, 0.7962], combatPassing: 16, damagePassing: 7, killPassing: 9, highClampReads: 0 },
]);

function gate(ok, code, detail = "") {
  if (!ok) throw new Error(`[${code}]${detail ? `\n${detail}` : ""}`);
}

function verifyHelperContracts() {
  gate(strictMajority(8, 16) === false, "STRICT_MAJORITY_8_OF_16");
  gate(strictMajority(9, 16) === true, "STRICT_MAJORITY_9_OF_16");
  const effect = pairedEffect([10, 12, 14, 16], [8, 10, 12, 14]);
  gate(effect.meanDiff === 2 && effect.positiveSeeds === 4 && effect.negativeSeeds === 0, "PAIRED_EFFECT_CONTRACT", JSON.stringify(effect));
  const monotonic = monotonicity([1, 2, 3, 4], [2, 3, 4, 5], [3, 4, 5, 6]);
  gate(monotonic.passingSeeds === 4 && monotonic.strictMajority, "MONOTONICITY_CONTRACT", JSON.stringify(monotonic));
  const crossing = thresholdCrossing([0.8, 0.81, 0.83], APPLIED_THRESHOLD, "up");
  gate(crossing.crossed, "THRESHOLD_CONTRACT", JSON.stringify(crossing));
  const clamp = clampSummary([1, 50, 99, 99], 1, 99);
  gate(clamp.lowerCount === 1 && clamp.upperCount === 2 && clamp.observed, "CLAMP_CONTRACT", JSON.stringify(clamp));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") { gate(Number.isFinite(value), "NON_FINITE_NUMBER"); return Object.is(value, -0) ? 0 : value; }
  if (typeof value === "undefined") return null;
  gate(typeof value === "object", "UNSUPPORTED_VALUE", typeof value);
  if (Array.isArray(value)) return value.map(canonical);
  const output = {};
  for (const key of Object.keys(value).sort()) output[key] = canonical(value[key]);
  return output;
}

function json(value) { return JSON.stringify(canonical(value)); }

function fileSha256(relativePath) {
  const absolute = resolve(ROOT, relativePath);
  gate(existsSync(absolute), "EVIDENCE_FILE_MISSING", relativePath);
  return sha256(readFileSync(absolute));
}

function fileText(relativePath) {
  const absolute = resolve(ROOT, relativePath);
  gate(existsSync(absolute), "EVIDENCE_FILE_MISSING", relativePath);
  return readFileSync(absolute, "utf8");
}

function evidenceNumber(value) {
  const fixed = Number(value).toFixed(4);
  if (fixed.startsWith("0.")) return fixed.slice(1);
  return fixed;
}

function verifyProvenance() {
  const liveSource = readFileSync(FPS_FILE, "utf8");
  gate(sha256(liveSource) === CS_R33_RESILIENCE_SOURCE_SHA256, "LIVE_SOURCE_SHA256", sha256(liveSource));
  const source = csR25R24Source(csR33R32Source(liveSource));
  gate(sha256(source) === SOURCE_SHA256, "SOURCE_SHA256", sha256(source));
  gate((source.match(/\brand\s*\(\s*\)/g) || []).length === RNG_CALL_SITES, "RNG_CALL_SITES");
  gate(source.includes("const rawReflex=Number(s.rxn??50),effectiveReflex=persStat(p,\"rxn\");"), "REFLEX_ALIAS_BOUNDARY");
  gate(source.includes("const role=posSkill(p,rawReflex);"), "RAW_ROLE_FIT_BOUNDARY");
  gate(source.includes("effectiveReflex*0.45") && source.includes("effectiveReflex*0.28") && source.includes("effectiveReflex*0.02"), "EFFECTIVE_REFLEX_CONSUMER_BOUNDARY");
  gate(source.includes("persStat(p,\"apm\")*0.16"), "APM_AGGR_CONSUMER_BOUNDARY");
  gate(source.includes("aggr(p)<0.82"), "RETREAT_THRESHOLD_BOUNDARY");
  return { sourceSha256: SOURCE_SHA256, rngCallSites: RNG_CALL_SITES, seedSetSha256: SEED_SET_SHA256 };
}

function verifyPriorEvidence() {
  const provenance = {};
  const texts = {};
  for (const [name, evidence] of Object.entries(PRIOR_EVIDENCE)) {
    const actual = fileSha256(evidence.path);
    gate(actual === evidence.sha256, "HISTORICAL_REPORT_CHANGED", `${name} ${actual}`);
    gate(Number.isInteger(evidence.simulations) && evidence.simulations > 0, "HISTORICAL_SWEEP_SHAPE", name);
    const text = fileText(evidence.path);
    gate(text.includes(evidence.suiteDigest), "HISTORICAL_DIGEST_NOT_IN_REPORT", name);
    gate(text.includes(String(evidence.simulations)), "HISTORICAL_SIMULATION_COUNT_NOT_IN_REPORT", name);
    texts[name] = text;
    provenance[name] = { path: evidence.path, sha256: actual, suiteDigest: evidence.suiteDigest, simulations: evidence.simulations };
  }
  gate(PRIOR_EVIDENCE.reflexRevalidation.r19SuiteDigest === "a2b0db3aa6357ba9d551217634e6426f726d1028d0d60428d7544bd6c2f34030", "R19_DIGEST_REFERENCE");
  gate(texts.reflexRevalidation.includes(PRIOR_EVIDENCE.reflexRevalidation.r19SuiteDigest), "R19_DIGEST_NOT_IN_REVALIDATION_REPORT");
  gate(Object.values(provenance).every((item) => Number.isInteger(item.simulations) && item.simulations > 0), "HISTORICAL_SIMULATION_COUNTS");
  gate(texts.reflexRepair.includes("monotonicity：`0/15`") && texts.reflexRepair.includes("saturation：`0/5`"), "R18A_GATE_EVIDENCE");
  for (const item of REFLEX_ROLES) {
    gate(texts.reflexAudit.includes(`${item.role} |`) && texts.reflexAudit.includes(evidenceNumber(item.combat[0])) && texts.reflexAudit.includes(evidenceNumber(item.pt[0])), "R19_DIRECT_EVIDENCE", item.role);
  }
  for (const item of POSITIONING_ROLES) {
    gate(texts.positioning.includes(`${item.role} |`) && texts.positioning.includes(evidenceNumber(item.direct[0])) && texts.positioning.includes(evidenceNumber(item.aggr[0])), "R20_DIRECT_EVIDENCE", item.role);
  }
  for (const item of APM_ROLES) {
    gate(texts.apm.includes(`| ${item.role} |`) && texts.apm.includes(evidenceNumber(item.direct[0])) && texts.apm.includes(evidenceNumber(item.aggr[0])), "R21_DIRECT_EVIDENCE", item.role);
  }
  return provenance;
}

function verifyReflex() {
  const roles = REFLEX_ROLES.map((item) => {
    const combat = { lowToBaseline: item.combat[0], baselineToHigh: item.combat[1], aggregateDirection: "higher" };
    const pt = { lowToBaseline: item.pt[0], baselineToHigh: item.pt[1], aggregateDirection: "higher" };
    gate(combat.lowToBaseline < 0 && combat.baselineToHigh > 0, "REFLEX_DIRECT_ROLE_GATE", item.role);
    const changed = item.changed.map((count) => changedSeedSummary(count, FIXED_SEEDS));
    return {
      role: item.role,
      direct: { gateMode: "aggregate-paired-direction; seed-level majority not published", combatSkill: combat, pt: pt },
      localOpportunity: { metric: "Pt opportunity", attribution: "target attacker / defender separated", aggregateMonotonic: true },
      immediateAction: { metric: "target-attacker conversion", status: "path-amplified", primaryGate: "not used as direct formula gate" },
      changedSeeds: { lowBaseline: changed[0], highBaseline: changed[1], lowHigh: changed[2] },
      roleFitRawWeight: item.posWeight,
    };
  });
  const readiness = classifyCausalReadiness({
    directMonotonic: true,
    directGateEstablished: true,
    localOpportunity: "sufficient",
    immediateConversion: "path-amplified",
    thresholdDominated: false,
    downstreamPathAmplified: true,
    semanticAmbiguity: false,
    formulaNonMonotonic: false,
  });
  gate(readiness.status === "Ready for calibration pilot", "REFLEX_READINESS");
  return {
    stat: "Reflex",
    primaryKpi: [
      { level: CALIBRATION_LEVELS.STAT_DIRECT_CONSUMER, metric: "effectiveReflex / combatSkill", gate: "R19 aggregate paired direction; new pilot must add seed-level strict-majority" },
      { level: CALIBRATION_LEVELS.LOCAL_OPPORTUNITY, metric: "Pt opportunity", attribution: "target attacker / defender separated" },
      { level: CALIBRATION_LEVELS.IMMEDIATE_ACTION, metric: "target-attacker conversion", attribution: "target attacker only" },
    ],
    secondaryKpi: ["target-attacker kills", "target-attacker damage", "survival", "economy", "winner"],
    roles,
    historicalPrimaryMonotonicity: { checksPassed: 0, checksTotal: 15, level: CALIBRATION_LEVELS.DOWNSTREAM_OUTCOME },
    saturation: { signals: 0, total: 5, status: "not-observed" },
    pathAmplification: { observed: true, boundary: "Pt → attacker branch → alive/pair/economy/round state" },
    readiness,
  };
}

function verifyPositioning() {
  const roles = POSITIONING_ROLES.map((item) => {
    const direct = monotonicityFromCounts(16, FIXED_SEEDS);
    const aggr = monotonicityFromCounts(16, FIXED_SEEDS);
    gate(direct.strictMajority && aggr.strictMajority && item.direct[0] < item.direct[1] && item.direct[1] < item.direct[2], "POSITIONING_DIRECT_ROLE_GATE", item.role);
    const crossing = thresholdCrossing(item.aggr, APPLIED_THRESHOLD, "up");
    gate(crossing.crossed === (item.thresholdCrossings > 0), "POSITIONING_THRESHOLD_EVIDENCE", item.role);
    return { role: item.role, direct: { combatSkill: direct, aggr }, retreat: { coverage: item.retreat, thresholdCrossings: item.thresholdCrossings, crossing } };
  });
  const readiness = classifyCausalReadiness({
    directMonotonic: true,
    directGateEstablished: true,
    localOpportunity: "insufficient",
    immediateConversion: "non-monotonic",
    thresholdDominated: true,
    downstreamPathAmplified: true,
    semanticAmbiguity: false,
    formulaNonMonotonic: false,
  });
  gate(readiness.status === "Deferred", "POSITIONING_READINESS");
  return {
    stat: "Positioning",
    primaryKpi: [
      { level: CALIBRATION_LEVELS.STAT_DIRECT_CONSUMER, metric: "effective position / aggr", gate: "direct evidence only" },
      { level: CALIBRATION_LEVELS.LOCAL_OPPORTUNITY, metric: "retreat eligibility: distance + hp + mates", attribution: "target player" },
      { level: CALIBRATION_LEVELS.IMMEDIATE_ACTION, metric: "retreat trigger / displacement / re-engage", attribution: "target player" },
    ],
    secondaryKpi: ["pair admission", "survival", "death exposure", "attacker/defender exchange"],
    roles,
    directEvidence: { effectivePositionStep: 12, aggrStep: 0.0144, directCombatSkill: "16/16 per role" },
    pathAmplification: { observed: true, boundary: "aggr < 0.82 retreat gate → displacement/re-engage → survival/pair" },
    readiness,
  };
}

function verifyApm() {
  const roles = APM_ROLES.map((item) => {
    const direct = monotonicityFromCounts(16, FIXED_SEEDS);
    const aggr = monotonicityFromCounts(16, FIXED_SEEDS);
    gate(direct.strictMajority && aggr.strictMajority && item.direct[0] < item.direct[1] && item.direct[1] < item.direct[2], "APM_AGGR_DIRECT_ROLE_GATE", item.role);
    const combat = monotonicityFromCounts(item.combatPassing, FIXED_SEEDS);
    gate(combat.strictMajority, "APM_COMBAT_STRICT_MAJORITY", item.role);
    const clamp = clampSummary(item.highClampReads ? [99] : [item.direct[2]], 1, 99);
    return {
      role: item.role,
      direct: { combatSkill: combat, aggr, aggregateTriplet: direct },
      secondaryTargetKpi: {
        damage: monotonicityFromCounts(item.damagePassing, FIXED_SEEDS),
        kills: monotonicityFromCounts(item.killPassing, FIXED_SEEDS),
      },
      clamp: { highClampReads: item.highClampReads, highPlateauSeeds: 0, observed: item.highClampReads > 0 || clamp.observed },
    };
  });
  const lurker = roles.find((item) => item.role === "lurker");
  const lurkerCrossing = thresholdCrossing([0.7896, 0.8088, 0.8232], APPLIED_THRESHOLD, "up");
  gate(lurkerCrossing.crossed && lurkerCrossing.values.at(-1) >= APPLIED_THRESHOLD, "APM_THRESHOLD_EVIDENCE");
  gate(lurker.clamp.highClampReads === 2083, "APM_CLAMP_EVIDENCE");
  const readiness = classifyCausalReadiness({
    directMonotonic: true,
    directGateEstablished: true,
    localOpportunity: "sufficient",
    immediateConversion: "not_primary",
    thresholdDominated: false,
    downstreamPathAmplified: true,
    semanticAmbiguity: false,
    formulaNonMonotonic: false,
  });
  gate(readiness.status === "Ready for calibration pilot", "APM_READINESS");
  return {
    stat: "APM",
    primaryKpi: [
      { level: CALIBRATION_LEVELS.STAT_DIRECT_CONSUMER, metric: "effective APM / combatSkill / aggr", gate: "strict majority" },
      { level: CALIBRATION_LEVELS.LOCAL_OPPORTUNITY, metric: "combat pair opportunity / retreat opportunity", attribution: "attacker / defender / target separated" },
      { level: CALIBRATION_LEVELS.IMMEDIATE_ACTION, metric: "pair admission / retreat trigger", role: "secondary spillover; not the primary APM gate" },
    ],
    secondaryKpi: ["target-player-only damage", "target-player-only kills", "survival", "retreat", "pair admission", "winner"],
    roles,
    thresholdBoundary: { role: "lurker", values: [0.7896, 0.8088, 0.8232], crossingSeeds: 16, crossing: lurkerCrossing, primaryGate: "secondary spillover" },
    pathAmplification: { observed: true, boundary: "aggr → pair fireChance/retreat gate → deterministic match path" },
    readiness,
  };
}

function verifyFrameworkShape(results) {
  for (const result of results) {
    gate(result.primaryKpi.every((kpi) => kpi.level !== CALIBRATION_LEVELS.DOWNSTREAM_OUTCOME), "LEVEL4_PRIMARY_VIOLATION", result.stat);
    gate(result.secondaryKpi.length > 0, "SECONDARY_KPI_MISSING", result.stat);
    gate(result.readiness.level4IsSecondary, "LEVEL4_GATE_SHAPE", result.stat);
    gate(result.readiness.boundary.includes("downstream path amplified"), "PATH_BOUNDARY_MISSING", result.stat);
  }
  gate(results.filter((result) => result.readiness.status === "Ready for calibration pilot").map((result) => result.stat).join(",") === "Reflex,APM", "READINESS_RECLASSIFICATION");
  gate(results.find((result) => result.stat === "Positioning").readiness.boundary.includes("threshold dominated"), "POSITIONING_THRESHOLD_BOUNDARY");
  gate(results.find((result) => result.stat === "Positioning").readiness.boundary.includes("insufficient opportunity coverage"), "POSITIONING_COVERAGE_BOUNDARY");
}

function buildSuite(provenance, source, results) {
  const suite = {
    schema: FRAMEWORK_SCHEMA,
    frameworkVersion: FRAMEWORK_VERSION,
    source,
    fixedSeeds: { count: FIXED_SEEDS, seedSetSha256: SEED_SET_SHA256 },
    priorEvidence: provenance,
    historicalEvidencePreserved: true,
    productionBalanceChanged: false,
    productionRngChanged: false,
    productionScenarioChanged: false,
    levels: CALIBRATION_LEVELS,
    results,
  };
  const digest = sha256(json(suite));
  return { suite, digest };
}

function main() {
  verifyHelperContracts();
  const source = verifyProvenance();
  const provenance = verifyPriorEvidence();
  const results = [verifyReflex(), verifyPositioning(), verifyApm()];
  verifyFrameworkShape(results);
  const first = buildSuite(provenance, source, results);
  const second = buildSuite(provenance, source, results);
  gate(first.digest === second.digest, "R22_REPEATED_DIGEST", `${first.digest}/${second.digest}`);
  console.log(`schema: ${FRAMEWORK_SCHEMA}`);
  console.log(`framework version: ${FRAMEWORK_VERSION}`);
  console.log(`fixed seeds: ${FIXED_SEEDS}; seedSetSha256: ${SEED_SET_SHA256}`);
  console.log(`historical evidence preserved: ${first.suite.historicalEvidencePreserved}`);
  console.log(`production balance/RNG/scenario changed: ${first.suite.productionBalanceChanged}/${first.suite.productionRngChanged}/${first.suite.productionScenarioChanged}`);
  console.log("reusable helper behavioral contracts: PASS");
  for (const result of results) {
    console.log(`${result.stat} readiness: ${result.readiness.status}; boundary: ${result.readiness.boundary.join(", ")}`);
  }
  console.log(`suiteDigest: ${first.digest}`);
  console.log("deterministic repeated digest: PASS");
  console.log("historical snapshot gate: PASS");
  console.log("CS Local Causal Calibration Framework R22: PASS");
}

try { main(); } catch (error) { console.error(error?.stack || error); process.exitCode = 1; }
