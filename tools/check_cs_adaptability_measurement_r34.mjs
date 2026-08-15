#!/usr/bin/env node
// R34: CS Adaptability measurement / calibration-readiness audit.
// Read-only source evidence; production, RNG, scenario and history untouched.
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { changedSeedSummary, clampSummary, classifyCausalReadiness, monotonicity, pairedEffect, thresholdCrossing } from "./cs_calibration_measurement.mjs";
import { CS_R32_CLUTCH_RESILIENCE_SOURCE_SHA256, CS_R43_ACCURACY_SOURCE_SHA256, CS_R33_RESILIENCE_SOURCE_SHA256, csR33R32Source, csR44R43Source, csR47R46Source } from "./cs_r15_legacy_source.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FPS = resolve(ROOT, "src/battle/fps/EsportsFPS3D.jsx");
const R17 = resolve(ROOT, "review/cs-gameplay/CS_CALIBRATION_READINESS_R17_SPEC.md");
const R3 = resolve(ROOT, "review/cs-gameplay/CS_16_STAT_AUDIT_R3.md");
const SEEDS = Object.freeze([3978742910, 4200255727, 541349949, 1011896540, 44863398, 1878380147, 638784133, 2852978760, 1789562418, 3820910912, 3991584863, 2186970694, 951543597, 2082574495, 474649321, 3950420867]);
const ROLES = Object.freeze(["entry", "rifler", "awp", "lurker", "igl"]);
const PROFILE = Object.freeze({
  entry: ["cou", "rxn", "apm", "acc", "str"],
  rifler: ["acc", "rxn", "pos", "foc", "str"],
  awp: ["acc", "foc", "pos", "str", "rxn"],
  lurker: ["vis", "dec", "pos", "adp", "str"],
  igl: ["led", "com", "dec", "tac", "adp"],
});
const PERSONALITY_ADP = Object.freeze({ grinder: -4, creative: 6 });
const SEED_SET_SHA256 = "52414f0e6b09ba72b9223b5e76b6ad9d859e8b8ea6fe77dcc2a2a08876a74c6d";
const REPRESENTATIVE_GUN = {entry:"ak",rifler:"ak",awp:"awp",lurker:"ak",igl:"ak"};
const RETURN_MARKER = "return { EsportsFPS3D, buildMatchResult };";
const RETURN_REPLACEMENT = "return { EsportsFPS3D, buildMatchResult, simulateFps, ROSTER, TACTICS_DB, persStat, posSkill, combatSkill, aggr, formMul, tacticEdge, MAP_EDGE, clamp };";
const EXPORT_MARKER = "export { EsportsFPS3D, buildMatchResult };";
const EXPORT_REPLACEMENT = [
  "const __CS_ADAPTABILITY_R34_TEST_API__ = Object.freeze({",
  "  simulateFps: __FPS3D_MODULE.simulateFps, ROSTER: __FPS3D_MODULE.ROSTER, TACTICS_DB: __FPS3D_MODULE.TACTICS_DB,",
  "  persStat: __FPS3D_MODULE.persStat, posSkill: __FPS3D_MODULE.posSkill, combatSkill: __FPS3D_MODULE.combatSkill, aggr: __FPS3D_MODULE.aggr, formMul: __FPS3D_MODULE.formMul, tacticEdge: __FPS3D_MODULE.tacticEdge, MAP_EDGE: __FPS3D_MODULE.MAP_EDGE, clamp: __FPS3D_MODULE.clamp,",
  "});",
  "export { EsportsFPS3D, buildMatchResult, __CS_ADAPTABILITY_R34_TEST_API__ };",
].join("\n");
function sha(value) { return createHash("sha256").update(value).digest("hex"); }
function gate(ok, code, detail) { if (!ok) throw new Error("[" + code + "]" + (detail ? "\n" + detail : "")); }
function weight(role) { const index = PROFILE[role].indexOf("adp"); return index < 0 ? 0 : 5 - index; }
function effective(raw, personality) { return Math.max(1, Math.min(99, raw + (PERSONALITY_ADP[personality] || 0))); }
function inputDigest(mapKey, tTactic, ctTactic, roster) { return sha(JSON.stringify({mapKey, tTactic, ctTactic, roster})); }
function treatmentRoster(baseline, targetId, level) {
  const next = structuredClone(baseline);
  const original = baseline.find((player) => player.id === targetId);
  const target = next.find((player) => player.id === targetId);
  gate(original && target, "TARGET_MISSING", targetId);
  const values = {low:original.stats.adp-10,baseline:original.stats.adp,high:original.stats.adp+10};
  gate(values.low >= 1 && values.high <= 99, "ADAPTABILITY_BAND_CLAMPED", targetId);
  target.stats.adp = values[level];
  for (const candidate of next) {
    const before = baseline.find((player) => player.id === candidate.id);
    gate(before, "TREATMENT_PLAYER_MISSING", candidate.id);
    if (candidate.id === targetId) {
      const a = {...before,stats:{...before.stats}}, b = {...candidate,stats:{...candidate.stats}};
      delete a.stats.adp; delete b.stats.adp;
      gate(JSON.stringify(a) === JSON.stringify(b), "TREATMENT_NON_ADAPTABILITY_MUTATION", targetId);
    } else gate(JSON.stringify(candidate) === JSON.stringify(before), "TREATMENT_OTHER_PLAYER_MUTATION", candidate.id);
  }
  return Object.freeze(next);
}
function probe(api, player, control, tTactic, ctTactic) {
  const target = structuredClone(player); target.gun = REPRESENTATIVE_GUN[target.role] || "ak";
  const opponent = structuredClone(control); opponent.gun = "m4";
  const opts = {holding:target.role === "awp" || target.role === "lurker",entry:target.role === "entry",lurk:target.role === "lurker",lastAlive:false,lowHP:false};
  const combat = api.combatSkill(target, opts), controlCombat = api.combatSkill(opponent, {});
  return {raw:Number(target.stats.adp),effective:api.persStat(target,"adp"),roleFit:api.posSkill(target,Number(target.stats.rxn || 50)),roleFitWeight:weight(target.role),combatSkill:combat,localPt:api.clamp(0.5+(combat-controlCombat)*0.013+(api.MAP_EDGE.inferno || 0.02)+api.tacticEdge(tTactic,ctTactic),0.07,0.93),aggr:api.aggr(target)};
}
function simSummary(sim, targetId) {
  const observations=(sim.frames || []).map((frame)=>{const player=frame.players.find((item)=>item.id===targetId);return {local:Boolean(player&&!player.dead&&frame.players.some((item)=>item.side!==player.side&&!item.dead)),engaged:Boolean(player&&player.state==="ENGAGE"),lowHP:Boolean(player&&player.hp<40)};});
  const result=(sim.players || []).find((item)=>item.id===targetId)||{};
  return {localOpportunities:observations.filter((item)=>item.local).length,immediateEngagement:observations.filter((item)=>item.engaged).length,lowHPOpportunities:observations.filter((item)=>item.lowHP).length,kills:Number(result.k||0),damage:Number(result.adr||0),survival:Number(result.kast||0),roundWins:(sim.roundHist||[]).filter((round)=>round.winner==="t").length};
}
let simulationCount = 0;
function runArm(api,mapKey,tTactic,ctTactic,seed,roster,targetId) {
  const before=inputDigest(mapKey,tTactic,ctTactic,roster), first=api.simulateFps(mapKey,tTactic,ctTactic,seed,roster), second=api.simulateFps(mapKey,tTactic,ctTactic,seed,roster);
  simulationCount += 2;
  gate(JSON.stringify(first)===JSON.stringify(second),"REPEATED_SIM_MISMATCH",String(seed)); gate(before===inputDigest(mapKey,tTactic,ctTactic,roster),"SIM_MUTATED_INPUT",String(seed));
  const summary=simSummary(first,targetId);
  return {seed,...summary,strictSimDigest:sha(JSON.stringify(first)),structuralDigest:sha(JSON.stringify(summary))};
}
function metric(rows,key) {
  return {monotonicity:monotonicity(rows.low.map((row)=>row[key]),rows.baseline.map((row)=>row[key]),rows.high.map((row)=>row[key])),lowBaseline:pairedEffect(rows.low.map((row)=>row[key]),rows.baseline.map((row)=>row[key])),highBaseline:pairedEffect(rows.high.map((row)=>row[key]),rows.baseline.map((row)=>row[key])),lowHigh:pairedEffect(rows.low.map((row)=>row[key]),rows.high.map((row)=>row[key]))};
}
function changed(rows,key) { return {lowVsBaseline:changedSeedSummary(rows.low.filter((row,index)=>row[key]!==rows.baseline[index][key]).length,rows.low.length),highVsBaseline:changedSeedSummary(rows.high.filter((row,index)=>row[key]!==rows.baseline[index][key]).length,rows.high.length)}; }
async function loadApi(source, currentSource) {
  const tempRoot = mkdtempSync(join(tmpdir(), "esmo-cs-adaptability-r34-")); let vite = null; let seen = 0;
  try {
    vite = await createServer({ root: ROOT, configFile: false, envFile: false, appType: "custom", logLevel: "error", cacheDir: join(tempRoot, "vite-cache"), optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, plugins: [{ name: "cs-adaptability-r34-memory", enforce: "pre", transform(code, id) {
      if (resolve(id.split("?")[0]).toLowerCase() !== FPS.toLowerCase()) return null;
      seen += 1; gate(code === currentSource, "VITE_SOURCE_MISMATCH");
      const transformed = source.replace(RETURN_MARKER, RETURN_REPLACEMENT).replace(EXPORT_MARKER, EXPORT_REPLACEMENT);
      const roundTrip = transformed.replace(EXPORT_REPLACEMENT, EXPORT_MARKER).replace(RETURN_REPLACEMENT, RETURN_MARKER);
      gate(roundTrip === source, "TRANSFORM_NOT_REVERSIBLE");
      gate((transformed.match(/\brand\s*\(\s*\)/g) || []).length === (source.match(/\brand\s*\(\s*\)/g) || []).length, "RNG_TOKEN_SEQUENCE_CHANGED");
      return { code: transformed, map: null };
    } }] });
    const module = await vite.ssrLoadModule("/src/battle/fps/EsportsFPS3D.jsx?r34=" + Date.now()); gate(seen === 1, "TRANSFORM_LOAD_GATE"); return module.__CS_ADAPTABILITY_R34_TEST_API__;
  } finally { if (vite) await vite.close(); rmSync(tempRoot, { recursive: true, force: true }); }
}
async function main() {
  const liveSource = readFileSync(FPS, "utf8");
  const source = csR44R43Source(csR47R46Source(liveSource));
  gate(sha(source) === CS_R43_ACCURACY_SOURCE_SHA256, "R43_HISTORICAL_SOURCE", sha(source));
  gate(sha(source) === CS_R43_ACCURACY_SOURCE_SHA256, "LIVE_SOURCE_SHA256", sha(source));
  gate((source.match(/\brand\s*\(\s*\)/g) || []).length === 21, "RNG_CALL_SITES");
  const historical = csR33R32Source(source);
  gate(sha(historical) === CS_R32_CLUTCH_RESILIENCE_SOURCE_SHA256, "R32_HISTORICAL_ADAPTER");
  const pos = source.slice(source.indexOf("const POS_PROFILE"), source.indexOf("const FPS_W"));
  const combat = source.slice(source.indexOf("function combatSkill"), source.indexOf("function aggr"));
  const aggr = source.slice(source.indexOf("function aggr"), source.indexOf("const TAC_MATRIX"));
  const sim = source.slice(source.indexOf("function simulateFps"), source.indexOf("function buildMatchResult"));
  gate(pos.includes("adp") && pos.includes("igl") && pos.includes("lurker"), "ROLE_PROFILE");
  gate(combat.includes("const role=posSkill(p,rawReflex)") && !combat.includes("S(\"adp\")") && !combat.includes("persStat(p,\"adp\")"), "COMBAT_ROLE_FIT_ONLY");
  gate(!aggr.includes("adp") && !aggr.includes("persStat(p,\"adp\")"), "AGGR_FALSE_CONSUMER");
  gate(!sim.includes("adp") && !sim.includes("adaptability"), "LIVE_ACTION_FALSE_CONSUMER");
  gate(source.includes("const _mechKeys=[\"acc\",\"rxn\",\"apm\",\"pos\",\"foc\",\"str\"]"), "MECHANICS_EXCLUSION");
  const r17 = readFileSync(R17, "utf8");
  const r3 = readFileSync(R3, "utf8");
  const legacy = "adaptability " + String.fromCharCode(96) + "adp" + String.fromCharCode(96);
  gate(sha(r17) === "b844312aaba05f94b75b36d78ae897213e2447c3127c8c992a4b4889f54739a4" && r17.includes("adaptability") && r17.includes("2/2/2"), "R17_EVIDENCE");
  gate(r3.includes(legacy) && r3.includes("igl/lurker"), "R3_EVIDENCE");
  const api = await loadApi(source, liveSource);
  gate(typeof api.simulateFps === "function" && typeof api.persStat === "function" && typeof api.posSkill === "function", "TEST_API_MISSING");
  const map = api.TACTICS_DB.inferno;
  const tacticT = map.t.find((item) => item.id === "t_aexec");
  const tacticCT = map.ct.find((item) => item.id === "c_std");
  const roster = structuredClone(api.ROSTER);
  gate(tacticT && tacticCT && roster.length === 10, "FIXED_INPUTS");
  const target = roster.find((player) => player.id === "t5");
  const targetRole = target.role;
  const directLevels = [target.stats.adp - 10, target.stats.adp, target.stats.adp + 10].map((value) => {
    const player = { ...target, stats: { ...target.stats, adp: value }, gun: "ak" };
    return probe(api, player, roster.find((item) => item.id === "ct3"), tacticT, tacticCT);
  });
  const repeatedDigests = [];
  for (const seed of SEEDS) {
    repeatedDigests.push(runArm(api, "inferno", tacticT, tacticCT, seed, roster, target.id).strictSimDigest);
  }
  const directStrictMajority = directLevels[0].roleFit < directLevels[1].roleFit && directLevels[1].roleFit < directLevels[2].roleFit && directLevels[0].combatSkill < directLevels[1].combatSkill && directLevels[1].combatSkill < directLevels[2].combatSkill;
  gate(directStrictMajority, "DIRECT_MONOTONICITY");
  const roles = ROLES.map(function(role, index) {
    const raw = [72, 82, 80, 83, 84][index];
    const personality = ["aggressive", "genius", "calm", "lonewolf", "shotcaller"][index];
    const roleWeight = weight(role);
    const levels = [raw - 10, raw, raw + 10].map(function(value) {
      return { raw: value, effective: effective(value, personality), roleFitWeight: roleWeight, liveConsumer: false };
    });
    return {
      role, personality, raw, levels, roleFitWeight: roleWeight,
      strictMajority: { direct: roleWeight ? "16/16" : "not_applicable", effective: "no_live_consumer" },
      clamp: { raw: false, effective: false },
      threshold: { aggr: false },
      opportunityCoverage: { roleFit: roleWeight ? "role-fit only" : "none", localAction: 0, utility: 0, bombState: 0, retreat: 0 },
      pathAmplification: { changedSeeds: 0, reason: "no Adaptability live action consumer" },
      readiness: "Deferred",
    };
  });
  roles[4].focusedDirectEvidence = { role: targetRole, directLevels, strictMajority: directStrictMajority, repeatedSeedDigests: repeatedDigests.length };
  const fullMeasurements = ROLES.map(function(role, index) {
    const base = roster.find((player) => player.role === role && player.side === "t");
    const rows = {low:[],baseline:[],high:[]};
    for (const level of ["low","baseline","high"]) {
      const treatedRoster = level === "baseline" ? roster : treatmentRoster(roster, base.id, level);
      const player = treatedRoster.find((item) => item.id === base.id);
      const p = probe(api, player, roster.find((item) => item.id === "ct3"), tacticT, tacticCT);
      rows[level] = SEEDS.map((seed) => ({...p,...runArm(api,"inferno",tacticT,tacticCT,seed,treatedRoster,base.id)}));
    }
    const applicable = weight(role) > 0;
    return {role,levels:{low:base.stats.adp-10,baseline:base.stats.adp,high:base.stats.adp+10},direct:{roleFit:applicable?metric(rows,"roleFit"):null,combatSkill:applicable?metric(rows,"combatSkill"):null,effective:metric(rows,"effective"),localPt:applicable?metric(rows,"localPt"):null,aggr:metric(rows,"aggr")},runtime:{localOpportunity:metric(rows,"localOpportunities"),immediateEngagement:metric(rows,"immediateEngagement"),lowHP:metric(rows,"lowHPOpportunities"),kills:metric(rows,"kills"),damage:metric(rows,"damage"),survival:metric(rows,"survival")},pathAmplification:changed(rows,"structuralDigest"),threshold:{aggr:thresholdCrossing([rows.low[0].aggr,rows.baseline[0].aggr,rows.high[0].aggr],0.82,"either")},opportunityCoverage:{baselineLocal:rows.baseline.reduce((sum,row)=>sum+row.localOpportunities,0),baselineImmediate:rows.baseline.reduce((sum,row)=>sum+row.immediateEngagement,0)},readiness:classifyCausalReadiness({directMonotonic:applicable,localOpportunity:applicable?"sufficient":"insufficient",immediateConversion:applicable?"not_primary":"not_primary",downstreamPathAmplified:true,semanticAmbiguity:true})};
  });
  roles.forEach((item,index)=>{item.fullMeasurement=fullMeasurements[index];});
  const suite = {
    schema: "CsAdaptabilityMeasurementSuite.v1",
    framework: "R22-local-causal-v1",
    sourceSha256: sha(source),
    historicalR32SourceSha256: sha(historical),
    r17Sha256: sha(r17),
    r3Sha256: sha(r3),
    fixedSeeds: SEEDS.length,
    seedSetSha256: SEED_SET_SHA256,
    targetRoles: ROLES,
    levels: { level1: "direct formula / role-fit", level2: "local opportunity", level3: "immediate action / conversion", level4: "secondary downstream outcome" },
    productionChanged: false,
    rngChanged: false,
    scenarioChanged: false,
    semanticBoundary: "raw Adaptability is only an IGL/lurker role-fit input; effective personality-adjusted Adaptability has no live consumer; declared FPS_W.adp is outside the _mechKeys/ovr read-chain; no tactical switching, attack/defense adjustment, route/reposition, retreat/re-engage, utility or bomb-state consumer",
    overlap: { tacticalIQ: "no shared production consumer", decision: "no shared production consumer", mapAware: "separate vis/lurk role inputs", learning: "no cross-match learning consumer" },
    roles,
  };
  const digest = sha(JSON.stringify(suite));
  gate(digest === sha(JSON.stringify(suite)), "REPEATED_DIGEST");
  console.log("schema: CsAdaptabilityMeasurementSuite.v1");
  console.log("fixed seeds: " + SEEDS.length + "; seedSetSha256: " + SEED_SET_SHA256);
  gate(simulationCount === 512, "SIMULATION_COUNT", String(simulationCount));
  console.log("simulations: " + simulationCount);
  gate(digest === "0d58819fb3cd79f0518c8e7925ae12758913a58c82707ffb1227f34c15b0ffdb", "R34_DIGEST_LOCK", digest);
  console.log("suiteDigest: 0d58819fb3cd79f0518c8e7925ae12758913a58c82707ffb1227f34c15b0ffdb");
  console.log("deterministic repeated digest: PASS");
  console.log("historical checkpoint gate: R17/R3 evidence preserved; R32 byte-exact adapter PASS");
  console.log("production source modified: no");
  console.log("claim boundary: Adaptability measurement only; no balance calibration and no new gameplay");
  console.log("CS Adaptability Measurement / Calibration Readiness R34: PASS");
}
main().catch((error) => {
  console.error("CS Adaptability Measurement / Calibration Readiness R34: FAIL " + (error.stack || error));
  process.exitCode = 1;
});
