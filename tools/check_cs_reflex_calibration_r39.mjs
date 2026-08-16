#!/usr/bin/env node
// R39 Reflex calibration pilot.  This verifier is memory-only: production
// source is read, instrumented in Vite, and never written.

import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { CS_R33_RESILIENCE_SOURCE_SHA256 } from "./cs_r15_legacy_source.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FPS_FILE = resolve(ROOT, "src/battle/fps/EsportsFPS3D.jsx");
const FPS_MODULE_ID = "/src/battle/fps/EsportsFPS3D.jsx";
const SOURCE_SHA256 = CS_R33_RESILIENCE_SOURCE_SHA256;
const SCHEMA = "CsReflexCalibrationPilotR39.v1";
const MAP_KEY = "inferno";
const T_TACTIC_ID = "t_aexec";
const CT_TACTIC_ID = "c_std";
const LEVELS = Object.freeze([60, 70, 80, 90, 100]);
const ROLES = Object.freeze(["entry", "rifler", "awp", "lurker", "igl"]);
const FIXED_SEEDS = Object.freeze([
  3978742910, 4200255727, 541349949, 1011896540,
  44863398, 1878380147, 638784133, 2852978760,
  1789562418, 3820910912, 3991584863, 2186970694,
  951543597, 2082574495, 474649321, 3950420867,
]);
const SEED_SET_SHA256 = "52414f0e6b09ba72b9223b5e76b6ad9d859e8b8ea6fe77dcc2a2a08876a74c6d";
const EXPECTED_RAND_CALLS = 21;

const SIGNATURE_MARKER = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster){";
const SIGNATURE_REPLACEMENT = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster,__measure=null){";
const POS_MARKER = "function posSkill(p,rawReflex=Number((p.stats||{}).rxn??50)){const prof=POS_PROFILE[p.role]||POS_PROFILE.rifler;const s=p.stats||{};let t=0;prof.forEach((k,i)=>t+=(k===\"rxn\"?rawReflex:(s[k]||50))*(5-i));return t/15;}";
const POS_REPLACEMENT = "function posSkill(p,rawReflex=Number((p.stats||{}).rxn??50)){const prof=POS_PROFILE[p.role]||POS_PROFILE.rifler;const s=p.stats||{};let t=0;prof.forEach((k,i)=>t+=(k===\"rxn\"?rawReflex:(s[k]||50))*(5-i));const result=t/15;globalThis.__CS_R39_AUDIT__?.record(\"posSkill\",{playerId:p.id,role:p.role,rawReflex,result});return result;}";
const COMBAT_RETURN_MARKER = "  return v*formMul(p); // 士氣 / 體能狀態 影響整體發揮";
const COMBAT_RETURN_REPLACEMENT = "  const __r39Form=formMul(p),__r39Result=v*__r39Form;globalThis.__CS_R39_AUDIT__?.record(\"combatSkill\",{playerId:p.id,role:p.role,rawReflex,effectiveReflex,mechanics:mech,weapon:wpn,roleFit:role,result:__r39Result,formMul:__r39Form,holding:Boolean(opts?.holding),entry:Boolean(opts?.entry),lurk:Boolean(opts?.lurk),lastAlive:Boolean(opts?.lastAlive),lowHP:Boolean(opts?.lowHP)});return __r39Result;";
const OPPORTUNITY_MARKER = "let fireChance=d<15?0.85:d<30?0.55:(sniperInvolved?0.55:0.3);";
const OPPORTUNITY_REPLACEMENT = `${OPPORTUNITY_MARKER}globalThis.__CS_R39_AUDIT__?.record("opportunity",{round:rnd+1,sec,tPlayerId:tp.id,cPlayerId:cp.id,tRole:tp.role,cRole:cp.role,distance:d});`;
const FIRE_MARKER = "if(rand()>=fireChance)continue;";
const FIRE_REPLACEMENT = "const __r39FireRoll=rand();globalThis.__CS_R39_AUDIT__?.record(\"fire\",{round:rnd+1,sec,tPlayerId:tp.id,cPlayerId:cp.id,tRole:tp.role,cRole:cp.role,fireChance,roll:__r39FireRoll});if(__r39FireRoll>=fireChance)continue;";
const PT_MARKER = "const Pt=clamp(0.5+(tSk-cSk)*0.013+(MAP_EDGE[mapKey]??0.02)+ecoEdge+flashPen+tacEdge,0.07,0.93);";
const PT_REPLACEMENT = `${PT_MARKER}globalThis.__CS_R39_AUDIT__?.record("probability",{round:rnd+1,sec,tPlayerId:tp.id,cPlayerId:cp.id,tRole:tp.role,cRole:cp.role,tSk,cSk,pt:Pt,lowerClamp:Pt===0.07,upperClamp:Pt===0.93});`;
const RESOLUTION_MARKER = "const g=GUNS[at.gun],rawAccuracy=at.stats?.acc||80,effectiveAccuracy=at.stats?.acc!=null?persStat(at,\"acc\"):rawAccuracy;";
const RESOLUTION_REPLACEMENT = `${RESOLUTION_MARKER}globalThis.__CS_R39_AUDIT__?.record("resolution",{round:rnd+1,sec,tPlayerId:tp.id,cPlayerId:cp.id,attackerId:at.id,defenderId:df.id,attackerSide:at.side,defenderSide:df.side,pt:Pt});`;
const DAMAGE_MARKER = "const {killed}=applyDamage(at,df,dmg);";
const DAMAGE_REPLACEMENT = `const __r39DamageBefore=at.dmgDealt||0;${DAMAGE_MARKER}globalThis.__CS_R39_AUDIT__?.record("conversion",{round:rnd+1,sec,tPlayerId:tp.id,cPlayerId:cp.id,attackerId:at.id,defenderId:df.id,attackerSide:at.side,defenderSide:df.side,rawDamage:dmg,effectiveDamage:(at.dmgDealt||0)-__r39DamageBefore,killed});`;
const RETURN_MARKER = "return { EsportsFPS3D, buildMatchResult };";
const RETURN_REPLACEMENT = "return { EsportsFPS3D, buildMatchResult, simulateFps, ROSTER, TACTICS_DB };";
const EXPORT_MARKER = "export { EsportsFPS3D, buildMatchResult };";
const EXPORT_REPLACEMENT = "const __CS_REFLEX_R39_TEST_API__=Object.freeze({simulateFps:__FPS3D_MODULE.simulateFps,ROSTER:__FPS3D_MODULE.ROSTER,TACTICS_DB:__FPS3D_MODULE.TACTICS_DB});export { EsportsFPS3D, buildMatchResult, __CS_REFLEX_R39_TEST_API__ };";
const TRANSFORMS = Object.freeze([
  ["signature", SIGNATURE_MARKER, SIGNATURE_REPLACEMENT],
  ["posSkill", POS_MARKER, POS_REPLACEMENT],
  ["combatSkill", COMBAT_RETURN_MARKER, COMBAT_RETURN_REPLACEMENT],
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
function canonical(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") { gate(Number.isFinite(value), "NON_FINITE_NUMBER"); return Object.is(value, -0) ? 0 : value; }
  if (typeof value === "undefined") return null;
  gate(typeof value === "object", "UNSUPPORTED_VALUE", typeof value);
  if (Array.isArray(value)) return value.map(canonical);
  const out = {}; for (const key of Object.keys(value).sort()) out[key] = canonical(value[key]); return out;
}
function json(value) { return JSON.stringify(canonical(value)); }
function randTokens(source) { return source.match(/\brand\s*\(\s*\)/g) ?? []; }
function mean(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function sd(values) {
  if (values.length < 2) return 0;
  const avg = mean(values); return Math.sqrt(values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1));
}
function round(value) { return +Number(value || 0).toFixed(5); }
function metricStats(values) {
  const avg = mean(values), stdev = sd(values);
  return { mean: round(avg), sd: round(stdev), min: round(Math.min(...values)), max: round(Math.max(...values)) };
}
function paired(values, baseline) {
  const diffs = values.map((value, index) => value - baseline[index]);
  const avg = mean(diffs), stdev = sd(diffs);
  return {
    meanDiff: round(avg), perPoint: round(avg / 10), sd: round(stdev),
    effectSize: stdev ? round(avg / stdev) : (avg ? null : 0),
    positiveSeeds: diffs.filter((value) => value > 0).length,
    negativeSeeds: diffs.filter((value) => value < 0).length,
    zeroSeeds: diffs.filter((value) => value === 0).length,
    strictMajorityPositive: diffs.filter((value) => value > 0).length > FIXED_SEEDS.length / 2,
  };
}
function freeze(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value); for (const child of Object.values(value)) freeze(child, seen); return Object.freeze(value);
}
function makeCollector() {
  const events = [];
  return { events, record(type, payload) { events.push(Object.freeze({ schema: SCHEMA, type, ...payload })); } };
}
function inputDigest(tTactic, ctTactic, roster) { return sha256(json({ MAP_KEY, tTactic, ctTactic, roster })); }

async function loadApi(source) {
  let transformSeen = 0; let vite = null;
  const tempRoot = mkdtempSync(join(tmpdir(), "esmo-cs-r39-"));
  try {
    vite = await createServer({
      root: ROOT, configFile: false, envFile: false, appType: "custom", logLevel: "error",
      cacheDir: join(tempRoot, "vite-cache"), optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true },
      plugins: [{ name: "cs-reflex-r39-memory-hooks", enforce: "pre", transform(code, id) {
        if (resolve(id.split("?")[0]).toLowerCase() !== FPS_FILE.toLowerCase()) return null;
        transformSeen += 1; gate(code === source, "VITE_SOURCE_MISMATCH");
        let transformed = source;
        for (const [name, marker, replacement] of TRANSFORMS) {
          gate(occurrences(transformed, marker) === 1, "TRANSFORM_MARKER_COUNT", name);
          transformed = transformed.replace(marker, replacement);
        }
        let roundTrip = transformed;
        for (const [name, marker, replacement] of [...TRANSFORMS].reverse()) {
          gate(occurrences(roundTrip, replacement) === 1, "TRANSFORM_REPLACEMENT_COUNT", name);
          roundTrip = roundTrip.replace(replacement, marker);
        }
        gate(roundTrip === source, "TRANSFORM_NOT_REVERSIBLE");
        gate(json(randTokens(transformed)) === json(randTokens(source)), "RNG_TOKEN_SEQUENCE_CHANGED");
        return { code: transformed, map: null };
      } }],
    });
    const module = await vite.ssrLoadModule(`${FPS_MODULE_ID}?r39=${Date.now()}`);
    gate(transformSeen === 1, "TRANSFORM_LOAD_GATE", String(transformSeen));
    return module.__CS_REFLEX_R39_TEST_API__;
  } finally {
    if (vite) await vite.close();
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function treatmentRoster(baselineRoster, targetId, value) {
  const next = clone(baselineRoster); const target = next.find((player) => player.id === targetId);
  gate(target, "TARGET_MISSING", targetId); target.stats.rxn = value;
  return freeze(next);
}

function levelMetrics(sim, events, targetId) {
  const combat = events.filter((event) => event.type === "combatSkill" && event.playerId === targetId);
  const pos = events.filter((event) => event.type === "posSkill" && event.playerId === targetId);
  const opportunities = events.filter((event) => event.type === "opportunity" && event.tPlayerId === targetId);
  const probabilities = events.filter((event) => event.type === "probability" && event.tPlayerId === targetId);
  const resolutions = events.filter((event) => event.type === "resolution" && event.tPlayerId === targetId);
  const conversions = events.filter((event) => event.type === "conversion" && event.tPlayerId === targetId);
  const attackerResolutions = resolutions.filter((event) => event.attackerId === targetId);
  const attackerConversions = conversions.filter((event) => event.attackerId === targetId);
  const resultPlayer = (sim.players || []).find((player) => player.id === targetId);
  gate(combat.length > 0 && pos.length > 0, "DIRECT_CONSUMER_MISSING", targetId);
  const effectiveValues = [...new Set(combat.map((event) => event.effectiveReflex))];
  return {
    effectiveReflex: effectiveValues.length ? effectiveValues[0] : 0,
    combatSkillMean: mean(combat.map((event) => event.result)),
    mechanicsMean: mean(combat.map((event) => event.mechanics)),
    weaponMean: mean(combat.map((event) => event.weapon)),
    roleFitMean: mean(combat.map((event) => event.roleFit)),
    posSkillMean: mean(pos.map((event) => event.result)),
    directCalls: combat.length,
    opportunities: opportunities.length,
    ptMean: mean(probabilities.map((event) => event.pt)),
    ptCalls: probabilities.length,
    targetResolutions: resolutions.length,
    targetAttackerResolutions: attackerResolutions.length,
    targetAttackerConversions: attackerConversions.length,
    targetAttackerKills: attackerConversions.filter((event) => event.killed).length,
    targetAttackerDamage: attackerConversions.reduce((sum, event) => sum + Number(event.effectiveDamage || 0), 0),
    upperClamp: probabilities.filter((event) => event.upperClamp).length,
    lowerClamp: probabilities.filter((event) => event.lowerClamp).length,
    finalKills: Number(resultPlayer?.k || 0),
    finalDamage: Number(resultPlayer?.dmg || resultPlayer?.dmgDealt || 0),
    survived: resultPlayer ? !resultPlayer.dead : null,
  };
}

function runArm(api, tTactic, ctTactic, roster, targetId, seed) {
  const before = inputDigest(tTactic, ctTactic, roster);
  globalThis.__CS_R39_AUDIT__ = null;
  const off = api.simulateFps(MAP_KEY, tTactic, ctTactic, seed, roster);
  const collector1 = makeCollector(); globalThis.__CS_R39_AUDIT__ = collector1;
  const on1 = api.simulateFps(MAP_KEY, tTactic, ctTactic, seed, roster);
  const collector2 = makeCollector(); globalThis.__CS_R39_AUDIT__ = collector2;
  const on2 = api.simulateFps(MAP_KEY, tTactic, ctTactic, seed, roster);
  globalThis.__CS_R39_AUDIT__ = null;
  gate(JSON.stringify(off) === JSON.stringify(on1) && JSON.stringify(on1) === JSON.stringify(on2), "INSTRUMENTATION_CHANGED_SIM", `${targetId}:${seed}`);
  gate(json(collector1.events) === json(collector2.events), "REPEATED_EVENT_DIGEST", `${targetId}:${seed}`);
  gate(before === inputDigest(tTactic, ctTactic, roster), "SIM_MUTATED_INPUT", `${targetId}:${seed}`);
  return { seed, metrics: levelMetrics(on1, collector1.events, targetId), eventDigest: sha256(json(collector1.events)), simDigest: sha256(JSON.stringify(off)) };
}

function summarizeRole(role, target, levelRows) {
  const byLevel = Object.fromEntries(LEVELS.map((level) => [level, levelRows[level]]));
  const adjacent = {};
  for (let i = 1; i < LEVELS.length; i += 1) {
    const from = LEVELS[i - 1], to = LEVELS[i];
    const current = byLevel[to].map((row) => row.metrics);
    const previous = byLevel[from].map((row) => row.metrics);
    const metric = (key) => paired(current.map((row) => row[key]), previous.map((row) => row[key]));
    adjacent[`${from}-${to}`] = {
      combatSkill: metric("combatSkillMean"), mechanics: metric("mechanicsMean"), weapon: metric("weaponMean"),
      roleFit: metric("roleFitMean"), posSkill: metric("posSkillMean"), pt: metric("ptMean"),
      conversions: metric("targetAttackerConversions"), kills: metric("targetAttackerKills"), damage: metric("targetAttackerDamage"),
    };
  }
  const directPer10 = (key) => mean(Object.values(adjacent).map((edge) => edge[key].perPoint));
  const directStrict = (key) => Object.values(adjacent).every((edge) => edge[key].strictMajorityPositive);
  const clampRows = LEVELS.map((level) => ({ level, effective: metricStats(byLevel[level].map((row) => row.metrics.effectiveReflex)), upper: byLevel[level].reduce((sum, row) => sum + row.metrics.upperClamp, 0), lower: byLevel[level].reduce((sum, row) => sum + row.metrics.lowerClamp, 0) }));
  return {
    targetId: target.id, role, personality: target.personality, rawRange: LEVELS,
    levels: Object.fromEntries(LEVELS.map((level) => [level, {
      effectiveReflex: metricStats(byLevel[level].map((row) => row.metrics.effectiveReflex)),
      combatSkill: metricStats(byLevel[level].map((row) => row.metrics.combatSkillMean)),
      mechanics: metricStats(byLevel[level].map((row) => row.metrics.mechanicsMean)),
      weapon: metricStats(byLevel[level].map((row) => row.metrics.weaponMean)),
      roleFit: metricStats(byLevel[level].map((row) => row.metrics.roleFitMean)),
      posSkill: metricStats(byLevel[level].map((row) => row.metrics.posSkillMean)),
      opportunity: metricStats(byLevel[level].map((row) => row.metrics.opportunities)),
      pt: metricStats(byLevel[level].map((row) => row.metrics.ptMean)),
      conversions: metricStats(byLevel[level].map((row) => row.metrics.targetAttackerConversions)),
      kills: metricStats(byLevel[level].map((row) => row.metrics.targetAttackerKills)),
      damage: metricStats(byLevel[level].map((row) => row.metrics.targetAttackerDamage)),
      upperClamp: clampRows.find((row) => row.level === level).upper,
      lowerClamp: clampRows.find((row) => row.level === level).lower,
    }])),
    adjacent,
    directPer10: { combatSkill: round(directPer10("combatSkill")), mechanics: round(directPer10("mechanics")), weapon: round(directPer10("weapon")), roleFit: round(directPer10("roleFit")), posSkill: round(directPer10("posSkill")), pt: round(directPer10("pt")) },
    directStrictMajority: { combatSkill: directStrict("combatSkill"), mechanics: directStrict("mechanics"), weapon: directStrict("weapon"), roleFit: directStrict("roleFit"), posSkill: directStrict("posSkill"), pt: directStrict("pt") },
  };
}

async function main() {
  const source = readFileSync(FPS_FILE, "utf8");
  gate(sha256(source) === SOURCE_SHA256, "LIVE_SOURCE_SHA256", sha256(source));
  gate(FIXED_SEEDS.length === 16 && LEVELS.length === 5, "SWEEP_SHAPE");
  gate(randTokens(source).length === EXPECTED_RAND_CALLS, "RAND_CALL_COUNT", String(randTokens(source).length));
  const api = await loadApi(source);
  const map = api.TACTICS_DB[MAP_KEY];
  const tTactic = freeze(clone(map?.t?.find((item) => item.id === T_TACTIC_ID)));
  const ctTactic = freeze(clone(map?.ct?.find((item) => item.id === CT_TACTIC_ID)));
  const baselineRoster = freeze(clone(api.ROSTER));
  gate(tTactic?.id === T_TACTIC_ID && ctTactic?.id === CT_TACTIC_ID, "TACTIC_MISSING");
  const targets = baselineRoster.filter((player) => player.side === "t");
  gate(targets.length === 5 && targets.every((player) => ROLES.includes(player.role)), "ROLE_COVERAGE");
  const cases = [];
  for (const target of targets) {
    const levelRows = {};
    for (const level of LEVELS) {
      const roster = treatmentRoster(baselineRoster, target.id, level);
      levelRows[level] = FIXED_SEEDS.map((seed) => runArm(api, tTactic, ctTactic, roster, target.id, seed));
    }
    const result = summarizeRole(target.role, target, levelRows);
    cases.push(result);
    console.log(`role ${target.role} ${target.id}: per10=${JSON.stringify(result.directPer10)} strict=${JSON.stringify(result.directStrictMajority)} effective=${JSON.stringify(result.levels[100].effectiveReflex)}`);
    console.log(`  levels=${LEVELS.map((level) => `${level}:eff=${result.levels[level].effectiveReflex.mean},combat=${result.levels[level].combatSkill.mean},opp=${result.levels[level].opportunity.mean},pt=${result.levels[level].pt.mean},conv=${result.levels[level].conversions.mean},dmg=${result.levels[level].damage.mean},clamp=${result.levels[level].upperClamp}`).join(" | ")}`);
    console.log(`  adjacent=${Object.entries(result.adjacent).map(([band, edge]) => `${band}:combat=${edge.combatSkill.meanDiff}(${edge.combatSkill.effectSize}),pt=${edge.pt.meanDiff}(${edge.pt.effectSize}),conv=${edge.conversions.meanDiff},dmg=${edge.damage.meanDiff}`).join(" | ")}`);
  }
  const allDirect = cases.flatMap((item) => Object.values(item.adjacent).map((edge) => edge.combatSkill));
  const directPass = allDirect.filter((edge) => edge.strictMajorityPositive).length;
  const digest = sha256(json({ schema: SCHEMA, sourceSha256: SOURCE_SHA256, seedSetSha256: SEED_SET_SHA256, levels: LEVELS, roles: cases }));
  gate(cases.length === 5 && directPass === 20, "DIRECT_COMBAT_STRICT_MAJORITY", `${directPass}/20`);
  console.log(`schema: ${SCHEMA}`);
  console.log(`sweep: ${LEVELS.join(" / ")} × ${ROLES.join(" / ")} × ${FIXED_SEEDS.length} fixed seeds = ${LEVELS.length * targets.length * FIXED_SEEDS.length} arms`);
  console.log(`seedSetSha256: ${SEED_SET_SHA256}`);
  console.log(`engineSourceSha256: ${SOURCE_SHA256}`);
  console.log(`primary direct combat strict-majority: ${directPass}/20 adjacent role bands`);
  console.log(`suiteDigest: ${digest}`);
  console.log("Level 4 kills/damage/survival: secondary observation only");
  console.log("production source modified: no (memory transform only)");
  console.log("RNG/scenario/historical evidence: unchanged");
  console.log("calibration range decision: direct local consumer is monotonic; inspect role scaling and clamp before any coefficient patch");
  console.log("CS Reflex Calibration Pilot R39: PASS");
}

main().catch((error) => { console.error(error?.stack || error); process.exitCode = 1; });
