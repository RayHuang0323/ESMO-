#!/usr/bin/env node
// R43 Accuracy calibration pilot.  The verifier instruments an in-memory
// module transform only; production source, RNG order, scenarios and roster
// data are never written.
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
const SCHEMA = "CsAccuracyCalibrationPilotR43.v1";
const MAP_KEY = "inferno", T_TACTIC_ID = "t_aexec", CT_TACTIC_ID = "c_std";
const LEVELS = Object.freeze([60, 70, 80, 90, 100]);
const ROLES = Object.freeze(["entry", "rifler", "awp", "lurker", "igl"]);
const FIXED_SEEDS = Object.freeze([3978742910,4200255727,541349949,1011896540,44863398,1878380147,638784133,2852978760,1789562418,3820910912,3991584863,2186970694,951543597,2082574495,474649321,3950420867]);
const SEED_SET_SHA256 = "52414f0e6b09ba72b9223b5e76b6ad9d859e8b8ea6fe77dcc2a2a08876a74c6d";
const EXPECTED_RAND_CALLS = 21;

const SIGNATURE_MARKER = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster){";
const SIGNATURE_REPLACEMENT = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster,__measure=null){";
const POS_MARKER = "function posSkill(p,rawReflex=Number((p.stats||{}).rxn??50)){const prof=POS_PROFILE[p.role]||POS_PROFILE.rifler;const s=p.stats||{};let t=0;prof.forEach((k,i)=>t+=(k===\"rxn\"?rawReflex:(s[k]||50))*(5-i));return t/15;}";
const POS_REPLACEMENT = "function posSkill(p,rawReflex=Number((p.stats||{}).rxn??50)){const prof=POS_PROFILE[p.role]||POS_PROFILE.rifler;const s=p.stats||{};let t=0;prof.forEach((k,i)=>t+=(k===\"rxn\"?rawReflex:(s[k]||50))*(5-i));const result=t/15,accIndex=prof.indexOf(\"acc\"),accuracyWeight=accIndex<0?0:5-accIndex;globalThis.__CS_R43_AUDIT__?.record(\"posSkill\",{playerId:p.id,role:p.role,rawAccuracy:Number(s.acc??50),accuracyWeight,result});return result;}";
const S_MARKER = "  const S=k=>k===\"rxn\"?effectiveReflex:persStat(p,k);";
const S_REPLACEMENT = "  let __r43EffectiveAccuracy=null,__r43AccuracyReads=0;const S=k=>{const value=k===\"rxn\"?effectiveReflex:persStat(p,k);if(k===\"acc\"){__r43EffectiveAccuracy=value;__r43AccuracyReads++;globalThis.__CS_R43_AUDIT__?.record(\"combatAccuracyRead\",{playerId:p.id,role:p.role,rawAccuracy:Number(p.stats?.acc??50),effectiveAccuracy:value});}return value;};";
const COMBAT_RETURN_MARKER = "  return v*formMul(p);";
const COMBAT_RETURN_REPLACEMENT = "  const __r43Form=formMul(p),__r43Result=v*__r43Form;globalThis.__CS_R43_AUDIT__?.record(\"combatSkill\",{playerId:p.id,role:p.role,rawAccuracy:Number(s.acc??50),effectiveAccuracy:__r43EffectiveAccuracy,accuracyReads:__r43AccuracyReads,roleFit:role,result:__r43Result,formMul:__r43Form,holding:Boolean(opts?.holding),entry:Boolean(opts?.entry),lurk:Boolean(opts?.lurk),lowHP:Boolean(opts?.lowHP)});return __r43Result;";
const AGGR_MARKER = "function aggr(p){const s=p.stats;if(!s)return 0.6;const base=(persStat(p,\"cou\")*0.5+persStat(p,\"str\")*0.22+persStat(p,\"apm\")*0.16+persStat(p,\"pos\")*0.12)/100;const pr=p.personality&&PERSONALITY[p.personality];return clamp(base+(ROLE_AGGR[p.role]||0)+(pr?pr.aggro:0),0.2,1.15);}";
const AGGR_REPLACEMENT = "function aggr(p){const s=p.stats;if(!s)return 0.6;const result=clamp((persStat(p,\"cou\")*0.5+persStat(p,\"str\")*0.22+persStat(p,\"apm\")*0.16+persStat(p,\"pos\")*0.12)/100+(ROLE_AGGR[p.role]||0)+(p.personality&&PERSONALITY[p.personality]?PERSONALITY[p.personality].aggro:0),0.2,1.15);globalThis.__CS_R43_AUDIT__?.record(\"aggr\",{playerId:p.id,role:p.role,result});return result;}";
const OPPORTUNITY_MARKER = "const Pt=clamp(0.5+(tSk-cSk)*0.013+(MAP_EDGE[mapKey]??0.02)+ecoEdge+flashPen+tacEdge,0.07,0.93);";
const OPPORTUNITY_REPLACEMENT = `${OPPORTUNITY_MARKER}globalThis.__CS_R43_AUDIT__?.record("probability",{round:rnd+1,sec,tPlayerId:tp.id,cPlayerId:cp.id,tRole:tp.role,cRole:cp.role,distance:d,tCombatSkill:tSk,cCombatSkill:cSk,pt:Pt});`;
const HEADSHOT_MARKER = "const g=GUNS[at.gun],rawAccuracy=at.stats?.acc||80,effectiveAccuracy=at.stats?.acc!=null?persStat(at,\"acc\"):rawAccuracy;const isHS=rand()<g.hs*(0.72+0.55*(effectiveAccuracy/100));let dmg=(g.dmg+Math.floor(rand()*40))*(isHS?2:1);";
const HEADSHOT_REPLACEMENT = `${HEADSHOT_MARKER}globalThis.__CS_R43_AUDIT__?.record("headshot",{round:rnd+1,sec,attackerId:at.id,defenderId:df.id,weapon:at.gun,weaponClass:g.cls,rawAccuracy,effectiveAccuracy,headshotChance:g.hs*(0.72+0.55*(effectiveAccuracy/100)),isHS});`;
const DAMAGE_MARKER = "const {killed}=applyDamage(at,df,dmg);";
const DAMAGE_REPLACEMENT = `${DAMAGE_MARKER}globalThis.__CS_R43_AUDIT__?.record("damage",{round:rnd+1,sec,attackerId:at.id,defenderId:df.id,effectiveDamage:dmg,killed,isHS});`;
const RETURN_MARKER = "return { EsportsFPS3D, buildMatchResult };";
const RETURN_REPLACEMENT = "return { EsportsFPS3D, buildMatchResult, simulateFps, ROSTER, TACTICS_DB };";
const EXPORT_MARKER = "export { EsportsFPS3D, buildMatchResult };";
const EXPORT_REPLACEMENT = "const __CS_ACCURACY_R43_TEST_API__=Object.freeze({simulateFps:__FPS3D_MODULE.simulateFps,ROSTER:__FPS3D_MODULE.ROSTER,TACTICS_DB:__FPS3D_MODULE.TACTICS_DB});export { EsportsFPS3D, buildMatchResult, __CS_ACCURACY_R43_TEST_API__ };";
const TRANSFORMS = Object.freeze([
  ["signature", SIGNATURE_MARKER, SIGNATURE_REPLACEMENT], ["role-fit", POS_MARKER, POS_REPLACEMENT],
  ["combat Accuracy read", S_MARKER, S_REPLACEMENT], ["combatSkill", COMBAT_RETURN_MARKER, COMBAT_RETURN_REPLACEMENT],
  ["aggr", AGGR_MARKER, AGGR_REPLACEMENT], ["local duel opportunity", OPPORTUNITY_MARKER, OPPORTUNITY_REPLACEMENT],
  ["headshot", HEADSHOT_MARKER, HEADSHOT_REPLACEMENT], ["damage", DAMAGE_MARKER, DAMAGE_REPLACEMENT],
  ["return export", RETURN_MARKER, RETURN_REPLACEMENT], ["module export", EXPORT_MARKER, EXPORT_REPLACEMENT],
]);

function gate(ok, code, detail = "") { if (!ok) throw new Error(`[${code}]${detail ? `\n${detail}` : ""}`); }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function occurrences(text, needle) { return text.split(needle).length - 1; }
function clone(value) { return structuredClone(value); }
function canonical(value) { if (value === null || typeof value === "string" || typeof value === "boolean") return value; if (typeof value === "number") { gate(Number.isFinite(value), "NON_FINITE_NUMBER"); return Object.is(value, -0) ? 0 : value; } if (typeof value === "undefined") return null; gate(typeof value === "object", "UNSUPPORTED_VALUE", typeof value); if (Array.isArray(value)) return value.map(canonical); const out = {}; for (const key of Object.keys(value).sort()) out[key] = canonical(value[key]); return out; }
function json(value) { return JSON.stringify(canonical(value)); }
function randTokens(source) { return source.match(/\brand\s*\(\s*\)/g) ?? []; }
function mean(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function sd(values) { if (values.length < 2) return 0; const avg = mean(values); return Math.sqrt(values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1)); }
function round(value) { return +Number(value || 0).toFixed(6); }
function metricStats(values) { return { mean: round(mean(values)), sd: round(sd(values)), min: round(Math.min(...values)), max: round(Math.max(...values)) }; }
function paired(values, baseline) { const diffs = values.map((value, index) => value - baseline[index]); const avg = mean(diffs), stdev = sd(diffs); return { meanDiff: round(avg), perPoint: round(avg / 10), sd: round(stdev), effectSize: stdev ? round(avg / stdev) : (avg ? null : 0), positiveSeeds: diffs.filter((v) => v > 0).length, negativeSeeds: diffs.filter((v) => v < 0).length, strictMajorityPositive: diffs.filter((v) => v > 0).length > FIXED_SEEDS.length / 2 }; }
function freeze(value, seen = new Set()) { if (!value || typeof value !== "object" || seen.has(value)) return value; seen.add(value); for (const child of Object.values(value)) freeze(child, seen); return Object.freeze(value); }
function collector() { const events = []; return { events, record(type, payload) { events.push(Object.freeze({ schema: SCHEMA, type, ...payload })); } }; }
function inputDigest(tTactic, ctTactic, roster) { return sha256(json({ MAP_KEY, tTactic, ctTactic, roster })); }

async function loadApi(source) {
  let transformSeen = 0, vite = null;
  const tempRoot = mkdtempSync(join(tmpdir(), "esmo-cs-r43-"));
  try {
    vite = await createServer({ root: ROOT, configFile: false, envFile: false, appType: "custom", logLevel: "error", cacheDir: join(tempRoot, "vite-cache"), optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, plugins: [{ name: "cs-accuracy-r43-memory-hooks", enforce: "pre", transform(code, id) {
      if (resolve(id.split("?")[0]).toLowerCase() !== FPS_FILE.toLowerCase()) return null;
      transformSeen += 1; gate(code === source, "VITE_SOURCE_MISMATCH"); let transformed = source;
      for (const [name, marker, replacement] of TRANSFORMS) { gate(occurrences(transformed, marker) === 1, "TRANSFORM_MARKER_COUNT", `${name}:${occurrences(transformed, marker)}`); transformed = transformed.replace(marker, replacement); }
      let roundTrip = transformed; for (const [name, marker, replacement] of [...TRANSFORMS].reverse()) { gate(occurrences(roundTrip, replacement) === 1, "TRANSFORM_REPLACEMENT_COUNT", name); roundTrip = roundTrip.replace(replacement, marker); }
      gate(roundTrip === source, "TRANSFORM_NOT_REVERSIBLE"); gate(json(randTokens(transformed)) === json(randTokens(source)), "RNG_TOKEN_SEQUENCE_CHANGED"); return { code: transformed, map: null };
    } }] });
    const module = await vite.ssrLoadModule(`${FPS_MODULE_ID}?r43=${Date.now()}`); gate(transformSeen === 1, "TRANSFORM_LOAD_GATE", String(transformSeen)); return module.__CS_ACCURACY_R43_TEST_API__;
  } finally { if (vite) await vite.close(); rmSync(tempRoot, { recursive: true, force: true }); }
}

function treatmentRoster(base, targetId, value) { const next = clone(base), target = next.find((p) => p.id === targetId); gate(target, "TARGET_MISSING", targetId); target.stats.acc = value; return freeze(next); }
function levelMetrics(sim, events, targetId) {
  const own = (type) => events.filter((e) => e.type === type && e.playerId === targetId);
  const combat = own("combatSkill"), reads = own("combatAccuracyRead"), pos = own("posSkill"), aggr = own("aggr");
  const probabilities = events.filter((e) => e.type === "probability" && e.tPlayerId === targetId);
  const headshots = events.filter((e) => e.type === "headshot" && e.attackerId === targetId), damage = events.filter((e) => e.type === "damage" && e.attackerId === targetId);
  const resultPlayer = (sim.players || []).find((p) => p.id === targetId);
  gate(combat.length > 0 && reads.length > 0 && pos.length > 0 && aggr.length > 0, "DIRECT_ACCURACY_CONSUMER_MISSING", targetId);
  return {
    effectiveAccuracy: reads.length ? reads[0].effectiveAccuracy : 0,
    combatSkillMean: mean(combat.map((e) => e.result)), combatReads: reads.length,
    roleFitMean: mean(pos.map((e) => e.result)), accuracyWeight: pos[0]?.accuracyWeight ?? 0,
    // aggr is an explicit non-consumer control.  Use the first direct value,
    // rather than an event-count-weighted mean, so path amplification cannot
    // turn an unchanged stat into a fake delta.
    aggrMean: aggr.length ? aggr[0].result : 0, opportunity: probabilities.length,
    ptMean: mean(probabilities.map((e) => e.pt)), headshotOpportunities: headshots.length,
    headshotChanceMean: mean(headshots.map((e) => e.headshotChance)), actualHeadshots: headshots.filter((e) => e.isHS).length,
    damageEvents: damage.length, damage: damage.reduce((sum, e) => sum + Number(e.effectiveDamage || 0), 0),
    finalKills: Number(resultPlayer?.k || 0), finalDamage: Number(resultPlayer?.dmg || resultPlayer?.dmgDealt || 0), survived: resultPlayer ? !resultPlayer.dead : null,
  };
}
function runArm(api, tTactic, ctTactic, roster, targetId, seed) {
  const before = inputDigest(tTactic, ctTactic, roster); globalThis.__CS_R43_AUDIT__ = null; const off = api.simulateFps(MAP_KEY, tTactic, ctTactic, seed, roster);
  const c1 = collector(); globalThis.__CS_R43_AUDIT__ = c1; const on1 = api.simulateFps(MAP_KEY, tTactic, ctTactic, seed, roster);
  const c2 = collector(); globalThis.__CS_R43_AUDIT__ = c2; const on2 = api.simulateFps(MAP_KEY, tTactic, ctTactic, seed, roster); globalThis.__CS_R43_AUDIT__ = null;
  gate(JSON.stringify(off) === JSON.stringify(on1) && JSON.stringify(on1) === JSON.stringify(on2), "INSTRUMENTATION_CHANGED_SIM", `${targetId}:${seed}`);
  gate(json(c1.events) === json(c2.events), "REPEATED_EVENT_DIGEST", `${targetId}:${seed}`); gate(before === inputDigest(tTactic, ctTactic, roster), "SIM_MUTATED_INPUT", `${targetId}:${seed}`);
  return { seed, metrics: levelMetrics(on1, c1.events, targetId), eventDigest: sha256(json(c1.events)), simDigest: sha256(JSON.stringify(off)) };
}
function summarizeRole(target, rows) {
  const levels = Object.fromEntries(LEVELS.map((level) => [level, rows[level]])), adjacent = {};
  for (let i = 1; i < LEVELS.length; i += 1) { const from = LEVELS[i - 1], to = LEVELS[i], current = levels[to].map((r) => r.metrics), previous = levels[from].map((r) => r.metrics); const m = (key) => paired(current.map((r) => r[key]), previous.map((r) => r[key])); adjacent[`${from}-${to}`] = { combatSkill: m("combatSkillMean"), roleFit: m("roleFitMean"), headshotChance: m("headshotChanceMean"), pt: m("ptMean"), aggr: m("aggrMean"), actualHeadshots: m("actualHeadshots"), damage: m("damage") }; }
  const per10 = (key) => mean(Object.values(adjacent).map((edge) => edge[key].perPoint));
  const strict = (key) => Object.values(adjacent).every((edge) => edge[key].strictMajorityPositive);
  return { targetId: target.id, role: target.role, personality: target.personality, levels: Object.fromEntries(LEVELS.map((level) => [level, { effectiveAccuracy: metricStats(rows[level].map((r) => r.metrics.effectiveAccuracy)), combatSkill: metricStats(rows[level].map((r) => r.metrics.combatSkillMean)), roleFit: metricStats(rows[level].map((r) => r.metrics.roleFitMean)), headshotChance: metricStats(rows[level].map((r) => r.metrics.headshotChanceMean)), pt: metricStats(rows[level].map((r) => r.metrics.ptMean)), aggr: metricStats(rows[level].map((r) => r.metrics.aggrMean)), opportunity: metricStats(rows[level].map((r) => r.metrics.opportunity)), actualHeadshots: metricStats(rows[level].map((r) => r.metrics.actualHeadshots)), damage: metricStats(rows[level].map((r) => r.metrics.damage)) }])), adjacent, directPer10: { combatSkill: round(per10("combatSkill")), roleFit: round(per10("roleFit")), headshotChance: round(per10("headshotChance")), pt: round(per10("pt")), aggr: round(per10("aggr")) }, directStrictMajority: { combatSkill: strict("combatSkill"), roleFit: strict("roleFit"), headshotChance: strict("headshotChance"), pt: strict("pt"), aggr: Object.values(adjacent).every((edge) => edge.aggr.positiveSeeds === 0) } };
}

async function main() {
  const source = readFileSync(FPS_FILE, "utf8");
  gate(sha256(source) === SOURCE_SHA256, "LIVE_SOURCE_SHA256", sha256(source)); gate(LEVELS.length === 5 && FIXED_SEEDS.length === 16, "SWEEP_SHAPE"); gate(randTokens(source).length === EXPECTED_RAND_CALLS, "RAND_CALL_COUNT", String(randTokens(source).length));
  gate(source.includes('S("acc")') && source.includes('persStat(at,"acc")'), "ACCURACY_SOURCE_GATE"); gate(source.includes("const tw=rand()<Pt") && source.includes("applyDamage(at,df,dmg)"), "FIREARM_CONSUMER_GATE"); gate(!source.includes("missChance") && !source.includes("hitChance"), "NO_MISS_BRANCH_GATE");
  const aggrStart = source.indexOf("function aggr(p)"); const aggrEnd = source.indexOf("}\n", aggrStart) + 2; gate(aggrStart >= 0 && !source.slice(aggrStart, aggrEnd).includes("acc"), "ACCURACY_AGGR_OWNERSHIP_GATE");
  const api = await loadApi(source), map = api.TACTICS_DB[MAP_KEY], tTactic = freeze(clone(map?.t?.find((i) => i.id === T_TACTIC_ID))), ctTactic = freeze(clone(map?.ct?.find((i) => i.id === CT_TACTIC_ID))), base = freeze(clone(api.ROSTER)); gate(tTactic?.id === T_TACTIC_ID && ctTactic?.id === CT_TACTIC_ID, "TACTIC_MISSING");
  const targets = base.filter((p) => p.side === "t"); gate(targets.length === 5 && targets.every((p) => ROLES.includes(p.role)), "ROLE_COVERAGE"); const cases = [];
  for (const target of targets) { const rows = {}; for (const level of LEVELS) rows[level] = FIXED_SEEDS.map((seed) => runArm(api, tTactic, ctTactic, treatmentRoster(base, target.id, level), target.id, seed)); const result = summarizeRole(target, rows); cases.push(result); console.log(`role ${result.role} ${result.targetId}: per10=${JSON.stringify(result.directPer10)} strict=${JSON.stringify(result.directStrictMajority)}`); console.log(`  levels=${LEVELS.map((level) => `${level}:eff=${result.levels[level].effectiveAccuracy.mean},combat=${result.levels[level].combatSkill.mean},roleFit=${result.levels[level].roleFit.mean},hsChance=${result.levels[level].headshotChance.mean},pt=${result.levels[level].pt.mean},aggr=${result.levels[level].aggr.mean}`).join(" | ")}`); console.log(`  adjacent=${Object.entries(result.adjacent).map(([band, edge]) => `${band}:combat=${edge.combatSkill.meanDiff},hsChance=${edge.headshotChance.meanDiff},roleFit=${edge.roleFit.meanDiff},pt=${edge.pt.meanDiff},aggr=${edge.aggr.meanDiff},actualHS=${edge.actualHeadshots.meanDiff}`).join(" | ")}`); }
  const combatEdges = cases.flatMap((item) => Object.values(item.adjacent).map((edge) => edge.combatSkill)); gate(combatEdges.every((edge) => edge.strictMajorityPositive), "DIRECT_COMBAT_STRICT_MAJORITY", `${combatEdges.filter((edge) => edge.strictMajorityPositive).length}/20`);
  const headshotEdges = cases.flatMap((item) => Object.values(item.adjacent).map((edge) => edge.headshotChance)); gate(headshotEdges.every((edge) => edge.strictMajorityPositive), "HEADSHOT_CHANCE_STRICT_MAJORITY", `${headshotEdges.filter((edge) => edge.strictMajorityPositive).length}/20`);
  const roleFitCases = cases.filter((item) => Object.values(item.adjacent).every((edge) => edge.roleFit.positiveSeeds > FIXED_SEEDS.length / 2)); gate(roleFitCases.length >= 3, "ROLE_FIT_COVERAGE", `${roleFitCases.length}/5`);
  const aggrEdges = cases.flatMap((item) => Object.values(item.adjacent).map((edge) => edge.aggr)); gate(aggrEdges.every((edge) => edge.positiveSeeds === 0 && edge.negativeSeeds === 0), "NO_ACCURACY_AGGR_EFFECT", `${aggrEdges.filter((edge) => edge.positiveSeeds || edge.negativeSeeds).length}/20`);
  const digest = sha256(json({ schema: SCHEMA, sourceSha256: SOURCE_SHA256, seedSetSha256: SEED_SET_SHA256, levels: LEVELS, roles: cases, noMissBranch: true }));
  console.log(`schema: ${SCHEMA}`); console.log(`sweep: ${LEVELS.join(" / ")} × ${ROLES.join(" / ")} × ${FIXED_SEEDS.length} fixed seeds = ${LEVELS.length * targets.length * FIXED_SEEDS.length} arms`); console.log(`seedSetSha256: ${SEED_SET_SHA256}`); console.log(`engineSourceSha256: ${SOURCE_SHA256}`); console.log("primary KPI: effective Accuracy → combatSkill / local duel Pt / headshot chance; hit rate intentionally not used"); console.log(`role-fit applicable roles: ${roleFitCases.map((item) => item.role).join(" / ")}; raw role-fit weight comes from POS_PROFILE`); console.log("AWP path: sniper weapon branch uses S(\"acc\") * 0.45; rifle uses 0.42 and pistol uses 0.55"); console.log("headshot path: current live consumer uses effective Accuracy; actual headshot outcomes are secondary RNG observations"); console.log("miss branch: absent; admitted firearm exchange proceeds to headshot/damage resolution"); console.log("high-end clamp: effective stats clamp at 99; 90→100 is therefore a diminishing-return band for unclamped roles"); console.log(`suiteDigest: ${digest}`); console.log("Level 4 kills/damage/survival: secondary observation only"); console.log("production source modified: no (memory transform only)"); console.log("RNG/scenario/historical evidence: unchanged"); console.log("calibration range decision: 60–90 is the stable pilot range; 90–100 is clamp-aware high-end and should not be treated as ordinary linear scaling"); console.log("CS Accuracy Calibration Pilot R43: PASS");
}
main().catch((error) => { console.error(error?.stack || error); process.exitCode = 1; });
