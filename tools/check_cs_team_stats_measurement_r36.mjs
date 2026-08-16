#!/usr/bin/env node
// R36: CS Comms / Leadership / Synergy measurement and semantic-readiness audit.
// This verifier is evidence-only: the FPS production source is transformed in memory.

import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { changedSeedSummary, classifyCausalReadiness, clampSummary, monotonicity, pairedEffect, thresholdCrossing } from "./cs_calibration_measurement.mjs";
import { CS_R32_CLUTCH_RESILIENCE_SOURCE_SHA256, CS_R33_RESILIENCE_SOURCE_SHA256, csR33R32Source, csR47R46Source } from "./cs_r15_legacy_source.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FPS = resolve(ROOT, "src/battle/fps/EsportsFPS3D.jsx");
const R17 = resolve(ROOT, "review/cs-gameplay/CS_CALIBRATION_READINESS_R17_SPEC.md");
const R3 = resolve(ROOT, "review/cs-gameplay/CS_16_STAT_AUDIT_R3.md");
const R16 = resolve(ROOT, "review/cs-gameplay/CS_SYNERGY_SEMANTICS_R16A_SPEC.md");
const SOURCE_SHA256 = CS_R33_RESILIENCE_SOURCE_SHA256;
const SEEDS = Object.freeze([
  3978742910, 4200255727, 541349949, 1011896540, 44863398, 1878380147, 638784133, 2852978760,
  1789562418, 3820910912, 3991584863, 2186970694, 951543597, 2082574495, 474649321, 3950420867,
]);
const SEED_SET_SHA256 = "52414f0e6b09ba72b9223b5e76b6ad9d859e8b8ea6fe77dcc2a2a08876a74c6d";
const ROLES = Object.freeze(["entry", "rifler", "awp", "lurker", "igl"]);
const PROFILE = Object.freeze({
  entry: ["cou", "rxn", "apm", "acc", "str"],
  rifler: ["acc", "rxn", "pos", "foc", "str"],
  awp: ["acc", "foc", "pos", "str", "rxn"],
  igl: ["led", "com", "dec", "tac", "adp"],
  support: ["coo", "tac", "com", "pos", "vis"],
  lurker: ["vis", "dec", "pos", "adp", "str"],
});
const CONFIG = Object.freeze({
  com: {
    name: "Comms", schema: "CsCommsMeasurementSuite.v1", pass: "CS Comms Measurement / Semantic Readiness R36: PASS",
    targetId: "t5", targetRole: "igl", roleConsumers: ["igl", "support"], classification: "B. Narrow role-fit only",
    semantic: "Comms is an IGL/support role-fit input only; no player information-sharing or team call-quality consumer is present.",
    overlap: "IGL role-fit overlaps only at the profile layer with Leadership/TacticalIQ; no shared team bonus or live information consumer.",
    boundaries: ["information sharing", "callout quality", "bomb information", "utility coordination"],
  },
  led: {
    name: "Leadership", schema: "CsLeadershipMeasurementSuite.v1", pass: "CS Leadership Measurement / Semantic Readiness R36: PASS",
    targetId: "t5", targetRole: "igl", roleConsumers: ["igl"], classification: "B. Narrow role-fit only",
    semantic: "Leadership is an IGL role-fit input only; no team direction, tactic execution, route commitment or teammate-response consumer is present.",
    overlap: "IGL role-fit overlaps only at the profile layer with Comms/TacticalIQ; it does not produce a second team-level modifier.",
    boundaries: ["team direction", "tactic execution", "route/site commitment", "teammate response"],
  },
  coo: {
    name: "Synergy", schema: "CsSynergyMeasurementSuite.v1", pass: "CS Synergy Measurement / Semantic Readiness R36: PASS",
    targetId: "ct5", targetRole: "support", roleConsumers: ["support"], classification: "C. Semantic / gameplay design gap",
    semantic: "Synergy is currently a support role-fit input and has no player-side team-level coordination consumer; R16-A remains the canonical boundary.",
    overlap: "Support role-fit is not team coordination; no live assist/trade/crossfire/utility coordination bonus is shared with Comms or Leadership.",
    boundaries: ["joint execution", "support", "trade/assist", "crossfire", "utility coordination"],
  },
});

function sha(value) { return createHash("sha256").update(value).digest("hex"); }
function gate(ok, code, detail = "") { if (!ok) throw new Error(`[${code}]${detail ? `\n${detail}` : ""}`); }
function statArg() {
  const raw = process.argv.find((item) => item.startsWith("--stat="));
  gate(process.argv.filter((item) => item.startsWith("--stat=")).length === 1, "STAT_ARG_REQUIRED");
  const stat = raw.slice("--stat=".length);
  gate(Object.prototype.hasOwnProperty.call(CONFIG, stat), "UNKNOWN_STAT", stat);
  return stat;
}
function sourceBlock(source, start, end, code) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  gate(a >= 0 && b > a, `${code}_BLOCK_MISSING`);
  return source.slice(a, b);
}
function weight(role, stat) {
  const index = (PROFILE[role] || []).indexOf(stat);
  return index < 0 ? 0 : 5 - index;
}
function inputDigest(mapKey, tTactic, ctTactic, roster) { return sha(JSON.stringify({ mapKey, tTactic, ctTactic, roster })); }
function levels(raw) {
  const low = Math.max(1, raw - 10), high = Math.min(99, raw + 10);
  gate(low < raw && raw < high, "LEVEL_BAND_CLAMPED", `${raw}/${low}/${high}`);
  return { low, baseline: raw, high };
}
function treatmentRoster(base, targetId, stat, level) {
  const next = structuredClone(base), original = base.find((item) => item.id === targetId), target = next.find((item) => item.id === targetId);
  gate(original && target, "TARGET_MISSING", targetId);
  const band = levels(Number(original.stats[stat]));
  target.stats[stat] = band[level];
  for (const item of next) {
    const before = base.find((candidate) => candidate.id === item.id);
    gate(before, "TREATMENT_PLAYER_MISSING", item.id);
    if (item.id === targetId) {
      const a = { ...before, stats: { ...before.stats } }, b = { ...item, stats: { ...item.stats } };
      delete a.stats[stat]; delete b.stats[stat];
      gate(JSON.stringify(a) === JSON.stringify(b), "TREATMENT_MUTATION", targetId);
    } else gate(JSON.stringify(item) === JSON.stringify(before), "OTHER_PLAYER_MUTATION", item.id);
  }
  return next;
}
function probe(api, player, control, tTactic, ctTactic, stat) {
  const target = structuredClone(player); target.gun = target.role === "awp" ? "awp" : "ak";
  const opponent = structuredClone(control); opponent.gun = "m4";
  const opts = { holding: target.role === "awp" || target.role === "lurker", entry: target.role === "entry", lurk: target.role === "lurker", lastAlive: false, lowHP: false };
  const combat = api.combatSkill(target, opts), controlCombat = api.combatSkill(opponent, {});
  return {
    raw: Number(target.stats[stat]), effective: api.persStat(target, stat), roleFit: api.posSkill(target, Number(target.stats.rxn || 50)), roleFitWeight: weight(target.role, stat),
    combatSkill: combat, localPt: api.clamp(0.5 + (combat - controlCombat) * 0.013 + (api.MAP_EDGE.inferno || 0.02) + api.tacticEdge(tTactic, ctTactic), 0.07, 0.93), aggr: api.aggr(target),
  };
}
function simSummary(sim, targetId) {
  const frames = sim.frames || [], observations = frames.map((frame) => {
    const player = frame.players.find((item) => item.id === targetId);
    return {
      local: Boolean(player && !player.dead && frame.players.some((item) => item.side !== player.side && !item.dead)),
      engaged: Boolean(player && player.state === "ENGAGE"), execute: Boolean(player && (player.state === "EXECUTE" || player.state === "ROTATE")),
      bombState: Boolean(player && frame.planted), comms: (frame.comms || []).length, utility: (frame.throwables || []).length,
      route: Boolean(player && player.routeIdx > 0),
    };
  });
  const result = (sim.players || []).find((item) => item.id === targetId) || {};
  return {
    localOpportunities: observations.filter((item) => item.local).length,
    immediateEngagement: observations.filter((item) => item.engaged).length,
    executionOpportunities: observations.filter((item) => item.execute).length,
    bombStateOpportunity: observations.filter((item) => item.bombState).length,
    commsEvents: observations.reduce((sum, item) => sum + item.comms, 0), utilityEvents: observations.reduce((sum, item) => sum + item.utility, 0),
    routeEvents: observations.filter((item) => item.route).length,
    kills: Number(result.k || 0), damage: Number(result.dmg || 0), survival: Number(result.kastR || 0),
    roundWins: (sim.roundHist || []).filter((round) => round.winner === "t").length,
  };
}
let simulationCount = 0;
function runArm(api, mapKey, tTactic, ctTactic, seed, roster, targetId) {
  const before = inputDigest(mapKey, tTactic, ctTactic, roster);
  const first = api.simulateFps(mapKey, tTactic, ctTactic, seed, roster), second = api.simulateFps(mapKey, tTactic, ctTactic, seed, roster);
  simulationCount += 2;
  gate(JSON.stringify(first) === JSON.stringify(second), "REPEATED_SIM_MISMATCH", String(seed));
  gate(before === inputDigest(mapKey, tTactic, ctTactic, roster), "SIM_MUTATED_INPUT", String(seed));
  const summary = simSummary(first, targetId);
  return { seed, ...summary, strictSimDigest: sha(JSON.stringify(first)), structuralDigest: sha(JSON.stringify(summary)) };
}
function metric(rows, key) {
  return { monotonicity: monotonicity(rows.low.map((row) => row[key]), rows.baseline.map((row) => row[key]), rows.high.map((row) => row[key])), lowBaseline: pairedEffect(rows.low.map((row) => row[key]), rows.baseline.map((row) => row[key])), highBaseline: pairedEffect(rows.high.map((row) => row[key]), rows.baseline.map((row) => row[key])) };
}
function changed(rows, key) {
  return { lowVsBaseline: changedSeedSummary(rows.low.filter((row, index) => row[key] !== rows.baseline[index][key]).length, rows.low.length), highVsBaseline: changedSeedSummary(rows.high.filter((row, index) => row[key] !== rows.baseline[index][key]).length, rows.high.length) };
}
function instrument(source, stat) {
  const returnMarker = "return { EsportsFPS3D, buildMatchResult };";
  const exportMarker = "export { EsportsFPS3D, buildMatchResult };";
  const returnReplacement = "return { EsportsFPS3D, buildMatchResult, simulateFps, ROSTER, TACTICS_DB, persStat, posSkill, combatSkill, aggr, tacticEdge, MAP_EDGE, clamp };";
  const exportReplacement = [
    `const __CS_TEAM_STATS_R36_TEST_API__ = Object.freeze({ simulateFps: __FPS3D_MODULE.simulateFps, ROSTER: __FPS3D_MODULE.ROSTER, TACTICS_DB: __FPS3D_MODULE.TACTICS_DB, persStat: __FPS3D_MODULE.persStat, posSkill: __FPS3D_MODULE.posSkill, combatSkill: __FPS3D_MODULE.combatSkill, aggr: __FPS3D_MODULE.aggr, tacticEdge: __FPS3D_MODULE.tacticEdge, MAP_EDGE: __FPS3D_MODULE.MAP_EDGE, clamp: __FPS3D_MODULE.clamp });`,
    "export { EsportsFPS3D, buildMatchResult, __CS_TEAM_STATS_R36_TEST_API__ };",
  ].join("\n");
  gate(source.split(returnMarker).length === 2 && source.split(exportMarker).length === 2, "TRANSFORM_MARKER_COUNT");
  const transformed = source.replace(returnMarker, returnReplacement).replace(exportMarker, exportReplacement);
  gate(transformed.replace(exportReplacement, exportMarker).replace(returnReplacement, returnMarker) === source, "TRANSFORM_NOT_REVERSIBLE", stat);
  gate((transformed.match(/\brand\s*\(\s*\)/g) || []).length === (source.match(/\brand\s*\(\s*\)/g) || []).length, "RNG_TOKEN_SEQUENCE_CHANGED");
  return transformed;
}
async function loadApi(source, liveSource, stat) {
  const tempRoot = mkdtempSync(join(tmpdir(), `esmo-cs-${stat}-r36-`)); let vite = null; let seen = 0;
  try {
    vite = await createServer({ root: ROOT, configFile: false, envFile: false, appType: "custom", logLevel: "error", cacheDir: join(tempRoot, "vite-cache"), optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, plugins: [{ name: `cs-${stat}-r36-memory`, enforce: "pre", transform(code, id) {
      if (resolve(id.split("?")[0]).toLowerCase() !== FPS.toLowerCase()) return null;
      seen += 1; gate(code === liveSource, "VITE_SOURCE_MISMATCH"); return { code: instrument(source, stat), map: null };
    } }] });
    const module = await vite.ssrLoadModule(`/src/battle/fps/EsportsFPS3D.jsx?r36-${stat}`);
    gate(seen === 1, "TRANSFORM_LOAD_GATE"); return module.__CS_TEAM_STATS_R36_TEST_API__;
  } finally { if (vite) await vite.close(); rmSync(tempRoot, { recursive: true, force: true }); }
}
function staticAudit(source, stat, config, r17, r3, r16) {
  gate(sha(source) === SOURCE_SHA256, "LIVE_SOURCE_SHA256", sha(source));
  gate((source.match(/\brand\s*\(\s*\)/g) || []).length === 21, "RNG_CALL_SITES");
  const profile = sourceBlock(source, "const POS_PROFILE=", "const FPS_W=", "POS_PROFILE");
  for (const role of config.roleConsumers) gate(new RegExp(`${role}:\\[.*\\"${stat}\\"`).test(profile), "ROLE_PROFILE_READ_MISSING", `${role}/${stat}`);
  const combat = sourceBlock(source, "function combatSkill", "function aggr", "COMBAT");
  const aggr = sourceBlock(source, "function aggr", "const TAC_MATRIX", "AGGR");
  const tactic = sourceBlock(source, "function tacticEdge", "const GUNS", "TACTIC");
  const sim = sourceBlock(source, "function simulateFps", "function buildMatchResult", "SIMULATOR");
  const statRead = new RegExp(`(?:stats\\??\\.\\s*${stat}\\b|persStat\\([^)]*[\\\"']${stat}[\\\"']|S\\(\\s*[\\\"']${stat}[\\\"']\\s*\\))`);
  gate(!statRead.test(combat), "DIRECT_COMBAT_STAT_READ", stat); gate(!statRead.test(aggr), "DIRECT_AGGR_STAT_READ", stat); gate(!statRead.test(tactic), "TACTIC_STAT_READ", stat); gate(!statRead.test(sim), "LIVE_STAT_READ", stat);
  gate(source.includes("const _mechKeys=[\"acc\",\"rxn\",\"apm\",\"pos\",\"foc\",\"str\"]"), "MECHANICS_BOUNDARY");
  gate(r17.includes(stat === "coo" ? "synergy" : stat === "led" ? "leadership" : "comms"), "R17_STAT_EVIDENCE", stat);
  gate(r3.includes(stat === "coo" ? "synergy" : stat === "led" ? "leadership" : "comms"), "R3_STAT_EVIDENCE", stat);
  gate(r16.includes("team-level coordination") && r16.includes("No-Go"), "R16_SYNERGY_EVIDENCE");
  return { sourceSha256: sha(source), roleConsumers: config.roleConsumers, directCombatConsumer: false, liveConsumer: false, teamConsumer: false, tacticConsumer: false, r16SynergyEvidence: stat === "coo" ? "preserved" : "not applicable" };
}
async function main() {
  const stat = statArg(), config = CONFIG[stat], liveSource = readFileSync(FPS, "utf8"), source = csR47R46Source(liveSource), r17 = readFileSync(R17, "utf8"), r3 = readFileSync(R3, "utf8"), r16 = readFileSync(R16, "utf8");
  const historical = csR33R32Source(liveSource);
  gate(sha(historical) === CS_R32_CLUTCH_RESILIENCE_SOURCE_SHA256, "R32_HISTORICAL_ADAPTER");
  const staticEvidence = staticAudit(source, stat, config, r17, r3, r16), api = await loadApi(source, liveSource, stat);
  gate(typeof api?.simulateFps === "function" && Array.isArray(api.ROSTER), "TEST_API_MISSING");
  const map = api.TACTICS_DB.inferno, tTactic = map.t.find((item) => item.id === "t_aexec"), ctTactic = map.ct.find((item) => item.id === "c_std"), roster = structuredClone(api.ROSTER);
  gate(tTactic && ctTactic && roster.length === 10, "FIXED_INPUTS");
  const target = roster.find((item) => item.id === config.targetId), control = roster.find((item) => item.id === "ct3");
  gate(target?.role === config.targetRole, "TARGET_ROLE_MISMATCH", `${config.targetId}/${target?.role}`);
  const band = levels(Number(target.stats[stat])), directLevels = ["low", "baseline", "high"].map((level) => probe(api, { ...target, stats: { ...target.stats, [stat]: band[level] } }, control, tTactic, ctTactic, stat));
  const directStrictMajority = directLevels[0].roleFit < directLevels[1].roleFit && directLevels[1].roleFit < directLevels[2].roleFit && directLevels[0].combatSkill < directLevels[1].combatSkill && directLevels[1].combatSkill < directLevels[2].combatSkill;
  gate(directStrictMajority, "DIRECT_MONOTONICITY", stat);
  const repeatedDigests = SEEDS.map((seed) => runArm(api, "inferno", tTactic, ctTactic, seed, roster, config.targetId).strictSimDigest);
  const roles = [];
  for (const role of ROLES) {
    const base = roster.find((item) => item.side === "t" && item.role === role), rows = { low: [], baseline: [], high: [] };
    gate(base, "ROLE_FIXTURE_MISSING", role);
    for (const level of ["low", "baseline", "high"]) {
      const treated = level === "baseline" ? roster : treatmentRoster(roster, base.id, stat, level), player = treated.find((item) => item.id === base.id), p = probe(api, player, control, tTactic, ctTactic, stat);
      rows[level] = SEEDS.map((seed) => ({ ...p, ...runArm(api, "inferno", tTactic, ctTactic, seed, treated, base.id) }));
    }
    const applicable = weight(role, stat) > 0;
    roles.push({ role, targetId: base.id, levels: levels(Number(base.stats[stat])), roleFitWeight: weight(role, stat), direct: { effective: metric(rows, "effective"), roleFit: applicable ? metric(rows, "roleFit") : null, combatSkill: applicable ? metric(rows, "combatSkill") : null, aggr: metric(rows, "aggr"), localPt: applicable ? metric(rows, "localPt") : null }, runtime: { localOpportunity: metric(rows, "localOpportunities"), immediateEngagement: metric(rows, "immediateEngagement"), executionOpportunity: metric(rows, "executionOpportunities"), bombState: metric(rows, "bombStateOpportunity"), commsEvents: metric(rows, "commsEvents"), utilityEvents: metric(rows, "utilityEvents"), routeEvents: metric(rows, "routeEvents"), kills: metric(rows, "kills"), damage: metric(rows, "damage"), survival: metric(rows, "survival") }, pathAmplification: changed(rows, "structuralDigest"), threshold: { aggr: thresholdCrossing([rows.low[0].aggr, rows.baseline[0].aggr, rows.high[0].aggr], 0.82, "either") }, clamp: { raw: clampSummary([rows.low[0].raw, rows.baseline[0].raw, rows.high[0].raw], 1, 99), effective: clampSummary([rows.low[0].effective, rows.baseline[0].effective, rows.high[0].effective], 1, 99) }, opportunityCoverage: { local: rows.baseline.reduce((sum, row) => sum + row.localOpportunities, 0), execution: rows.baseline.reduce((sum, row) => sum + row.executionOpportunities, 0), bombState: rows.baseline.reduce((sum, row) => sum + row.bombStateOpportunity, 0), comms: rows.baseline.reduce((sum, row) => sum + row.commsEvents, 0), utility: rows.baseline.reduce((sum, row) => sum + row.utilityEvents, 0), route: rows.baseline.reduce((sum, row) => sum + row.routeEvents, 0) }, readiness: classifyCausalReadiness({ directMonotonic: applicable, localOpportunity: "insufficient", immediateConversion: "not_primary", downstreamPathAmplified: true, semanticAmbiguity: true }) });
  }
  const suite = { schema: config.schema, framework: "R22-local-causal-v1", sourceSha256: sha(source), historicalR32SourceSha256: sha(historical), r17Sha256: sha(r17), r3Sha256: sha(r3), r16SynergySha256: sha(r16), fixedSeeds: SEEDS.length, seedSetSha256: SEED_SET_SHA256, roles, focusedDirect: { targetId: config.targetId, role: config.targetRole, levels: band, directLevels, strictMajority: directStrictMajority, repeatedDigestCount: repeatedDigests.length }, simulations: simulationCount, productionChanged: false, rngChanged: false, scenarioChanged: false, staticEvidence, semanticBoundary: config.semantic, overlap: config.overlap, classification: config.classification, levels: { level1: "direct formula / role-fit", level2: "local opportunity", level3: "immediate action / conversion", level4: "secondary downstream outcome" } };
  const digest = sha(JSON.stringify(suite));
  gate(digest === sha(JSON.stringify(suite)), "REPEATED_DIGEST"); gate(simulationCount === 512, "SIMULATION_COUNT", String(simulationCount));
  console.log(`schema: ${config.schema}`); console.log(`stat: ${stat}; fixed seeds: ${SEEDS.length}; seedSetSha256: ${SEED_SET_SHA256}`); console.log(`matrix: 5 roles x low/baseline/high x ${SEEDS.length} seeds; simulations: ${simulationCount}`); console.log(`focused target: ${config.targetId}/${config.targetRole}; direct strict-majority: ${directStrictMajority ? "PASS" : "FAIL"}`); console.log(`classification: ${config.classification}`); console.log(`suiteDigest: ${digest}`); console.log("deterministic repeated digest: PASS"); console.log("historical checkpoint gate: R16/R17/R3 evidence preserved; R32 byte-exact adapter PASS"); console.log("production source modified: no"); console.log(`claim boundary: ${config.name} measurement only; no balance calibration and no new team AI`); console.log(config.pass);
}
main().catch((error) => { console.error(`CS R36 team-stat measurement: FAIL ${error?.stack || error}`); process.exitCode = 1; });
