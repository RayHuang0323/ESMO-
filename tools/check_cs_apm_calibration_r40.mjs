#!/usr/bin/env node
// R40 APM calibration pilot. Memory-only instrumentation; production is read-only.
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
const SCHEMA = "CsApmCalibrationPilotR40.v1";
const MAP_KEY = "inferno", T_TACTIC_ID = "t_aexec", CT_TACTIC_ID = "c_std";
const LEVELS = Object.freeze([60, 70, 80, 90, 100]);
const ROLES = Object.freeze(["entry", "rifler", "awp", "lurker", "igl"]);
const FIXED_SEEDS = Object.freeze([3978742910, 4200255727, 541349949, 1011896540, 44863398, 1878380147, 638784133, 2852978760, 1789562418, 3820910912, 3991584863, 2186970694, 951543597, 2082574495, 474649321, 3950420867]);
const SEED_SET_SHA256 = "52414f0e6b09ba72b9223b5e76b6ad9d859e8b8ea6fe77dcc2a2a08876a74c6d";
const EXPECTED_RAND_CALLS = 21, APM_THRESHOLD = 0.82;

const SIGNATURE_MARKER = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster){";
const SIGNATURE_REPLACEMENT = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster,__measure=null){";
const POS_MARKER = "function posSkill(p,rawReflex=Number((p.stats||{}).rxn??50)){const prof=POS_PROFILE[p.role]||POS_PROFILE.rifler;const s=p.stats||{};let t=0;prof.forEach((k,i)=>t+=(k===\"rxn\"?rawReflex:(s[k]||50))*(5-i));return t/15;}";
const POS_REPLACEMENT = "function posSkill(p,rawReflex=Number((p.stats||{}).rxn??50)){const prof=POS_PROFILE[p.role]||POS_PROFILE.rifler;const s=p.stats||{};let t=0;prof.forEach((k,i)=>t+=(k===\"rxn\"?rawReflex:(s[k]||50))*(5-i));const result=t/15;globalThis.__CS_R40_AUDIT__?.record(\"posSkill\",{playerId:p.id,role:p.role,rawApm:Number(s.apm??50),result});return result;}";
const COMBAT_RETURN_MARKER = "  return v*formMul(p); // 士氣 / 體能狀態 影響整體發揮";
const COMBAT_RETURN_REPLACEMENT = "  const __r40Form=formMul(p),__r40Result=v*__r40Form;globalThis.__CS_R40_AUDIT__?.record(\"combatSkill\",{playerId:p.id,role:p.role,rawApm:Number(s.apm??50),effectiveApm:persStat(p,\"apm\"),mechanics:mech,weapon:wpn,roleFit:role,result:__r40Result,formMul:__r40Form,holding:Boolean(opts?.holding),entry:Boolean(opts?.entry),lurk:Boolean(opts?.lurk),lowHP:Boolean(opts?.lowHP)});return __r40Result;";
const AGGR_MARKER = "function aggr(p){const s=p.stats;if(!s)return 0.6;const base=(persStat(p,\"cou\")*0.5+persStat(p,\"str\")*0.22+persStat(p,\"apm\")*0.16+persStat(p,\"pos\")*0.12)/100;const pr=p.personality&&PERSONALITY[p.personality];return clamp(base+(ROLE_AGGR[p.role]||0)+(pr?pr.aggro:0),0.2,1.15);}";
const AGGR_REPLACEMENT = "function aggr(p){const s=p.stats;if(!s)return 0.6;const __r40Apm=persStat(p,\"apm\");const base=(persStat(p,\"cou\")*0.5+persStat(p,\"str\")*0.22+__r40Apm*0.16+persStat(p,\"pos\")*0.12)/100;const pr=p.personality&&PERSONALITY[p.personality];const result=clamp(base+(ROLE_AGGR[p.role]||0)+(pr?pr.aggro:0),0.2,1.15);globalThis.__CS_R40_AUDIT__?.record(\"aggr\",{playerId:p.id,role:p.role,rawApm:Number(s.apm??50),effectiveApm:__r40Apm,result});return result;}";
const RETREAT_MARKER = "if(near&&!buyP&&dist(near.pos,p.pos)<32&&p.hp<48&&aggr(p)<0.82&&mates>1){";
const RETREAT_REPLACEMENT = "if(globalThis.__CS_R40_AUDIT__&&near&&!buyP&&dist(near.pos,p.pos)<32&&p.hp<48&&mates>1){const __r40Aggr=aggr(p);globalThis.__CS_R40_AUDIT__.record(\"retreatOpportunity\",{round:rnd+1,sec,playerId:p.id,role:p.role,side:p.side,hp:p.hp,mates,distance:dist(near.pos,p.pos),aggr:__r40Aggr,threshold:0.82,gatePassed:__r40Aggr<0.82});}if(near&&!buyP&&dist(near.pos,p.pos)<32&&p.hp<48&&aggr(p)<0.82&&mates>1){";
const RETREAT_TRIGGER_MARKER = "           const dx=p.pos.x-near.pos.x,dy=p.pos.y-near.pos.y,L=Math.hypot(dx,dy)||1;";
const RETREAT_TRIGGER_REPLACEMENT = "           globalThis.__CS_R40_AUDIT__?.record(\"retreatTrigger\",{round:rnd+1,sec,playerId:p.id,role:p.role,side:p.side,hp:p.hp,mates,aggr:aggr(p),threshold:0.82});const dx=p.pos.x-near.pos.x,dy=p.pos.y-near.pos.y,L=Math.hypot(dx,dy)||1;";
const OPPORTUNITY_MARKER = "let fireChance=d<15?0.85:d<30?0.55:(sniperInvolved?0.55:0.3);";
const OPPORTUNITY_REPLACEMENT = `${OPPORTUNITY_MARKER}globalThis.__CS_R40_AUDIT__?.record("opportunity",{round:rnd+1,sec,tPlayerId:tp.id,cPlayerId:cp.id,tRole:tp.role,cRole:cp.role,distance:d});`;
const FIRE_MARKER = "if(rand()>=fireChance)continue;";
const FIRE_REPLACEMENT = "const __r40FireRoll=rand();globalThis.__CS_R40_AUDIT__?.record(\"fire\",{round:rnd+1,sec,tPlayerId:tp.id,cPlayerId:cp.id,fireChance,roll:__r40FireRoll});if(__r40FireRoll>=fireChance)continue;";
const PT_MARKER = "const Pt=clamp(0.5+(tSk-cSk)*0.013+(MAP_EDGE[mapKey]??0.02)+ecoEdge+flashPen+tacEdge,0.07,0.93);";
const PT_REPLACEMENT = `${PT_MARKER}globalThis.__CS_R40_AUDIT__?.record("probability",{round:rnd+1,sec,tPlayerId:tp.id,cPlayerId:cp.id,tRole:tp.role,cRole:cp.role,pt:Pt});`;
const RESOLUTION_MARKER = "const g=GUNS[at.gun],rawAccuracy=at.stats?.acc||80,effectiveAccuracy=at.stats?.acc!=null?persStat(at,\"acc\"):rawAccuracy;";
const RESOLUTION_REPLACEMENT = `${RESOLUTION_MARKER}globalThis.__CS_R40_AUDIT__?.record("resolution",{round:rnd+1,sec,tPlayerId:tp.id,cPlayerId:cp.id,attackerId:at.id,defenderId:df.id,pt:Pt});`;
const DAMAGE_MARKER = "const {killed}=applyDamage(at,df,dmg);";
const DAMAGE_REPLACEMENT = `const __r40DamageBefore=at.dmgDealt||0;${DAMAGE_MARKER}globalThis.__CS_R40_AUDIT__?.record("conversion",{round:rnd+1,sec,tPlayerId:tp.id,cPlayerId:cp.id,attackerId:at.id,defenderId:df.id,effectiveDamage:(at.dmgDealt||0)-__r40DamageBefore,killed});`;
const RETURN_MARKER = "return { EsportsFPS3D, buildMatchResult };";
const RETURN_REPLACEMENT = "return { EsportsFPS3D, buildMatchResult, simulateFps, ROSTER, TACTICS_DB };";
const EXPORT_MARKER = "export { EsportsFPS3D, buildMatchResult };";
const EXPORT_REPLACEMENT = "const __CS_APM_R40_TEST_API__=Object.freeze({simulateFps:__FPS3D_MODULE.simulateFps,ROSTER:__FPS3D_MODULE.ROSTER,TACTICS_DB:__FPS3D_MODULE.TACTICS_DB});export { EsportsFPS3D, buildMatchResult, __CS_APM_R40_TEST_API__ };";
const TRANSFORMS = Object.freeze([
  ["signature", SIGNATURE_MARKER, SIGNATURE_REPLACEMENT], ["posSkill", POS_MARKER, POS_REPLACEMENT],
  ["combatSkill", COMBAT_RETURN_MARKER, COMBAT_RETURN_REPLACEMENT], ["aggr", AGGR_MARKER, AGGR_REPLACEMENT],
  ["retreat opportunity", RETREAT_MARKER, RETREAT_REPLACEMENT], ["retreat trigger", RETREAT_TRIGGER_MARKER, RETREAT_TRIGGER_REPLACEMENT],
  ["opportunity", OPPORTUNITY_MARKER, OPPORTUNITY_REPLACEMENT], ["fire", FIRE_MARKER, FIRE_REPLACEMENT],
  ["probability", PT_MARKER, PT_REPLACEMENT], ["resolution", RESOLUTION_MARKER, RESOLUTION_REPLACEMENT],
  ["conversion", DAMAGE_MARKER, DAMAGE_REPLACEMENT], ["return export", RETURN_MARKER, RETURN_REPLACEMENT],
  ["module export", EXPORT_MARKER, EXPORT_REPLACEMENT],
]);

function gate(ok, code, detail = "") { if (!ok) throw new Error(`[${code}]${detail ? `\n${detail}` : ""}`); }
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
function sd(values) { if (values.length < 2) return 0; const avg = mean(values); return Math.sqrt(values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1)); }
function round(value) { return +Number(value || 0).toFixed(5); }
function metricStats(values) { return { mean: round(mean(values)), sd: round(sd(values)), min: round(Math.min(...values)), max: round(Math.max(...values)) }; }
function paired(values, baseline) { const diffs = values.map((value, index) => value - baseline[index]); const avg = mean(diffs), stdev = sd(diffs); return { meanDiff: round(avg), perPoint: round(avg / 10), sd: round(stdev), effectSize: stdev ? round(avg / stdev) : (avg ? null : 0), positiveSeeds: diffs.filter((v) => v > 0).length, negativeSeeds: diffs.filter((v) => v < 0).length, strictMajorityPositive: diffs.filter((v) => v > 0).length > FIXED_SEEDS.length / 2 }; }
function freeze(value, seen = new Set()) { if (!value || typeof value !== "object" || seen.has(value)) return value; seen.add(value); for (const child of Object.values(value)) freeze(child, seen); return Object.freeze(value); }
function collector() { const events = []; return { events, record(type, payload) { events.push(Object.freeze({ schema: SCHEMA, type, ...payload })); } }; }
function inputDigest(tTactic, ctTactic, roster) { return sha256(json({ MAP_KEY, tTactic, ctTactic, roster })); }
async function loadApi(source) {
  let transformSeen = 0, vite = null; const tempRoot = mkdtempSync(join(tmpdir(), "esmo-cs-r40-"));
  try {
    vite = await createServer({ root: ROOT, configFile: false, envFile: false, appType: "custom", logLevel: "error", cacheDir: join(tempRoot, "vite-cache"), optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, plugins: [{ name: "cs-apm-r40-memory-hooks", enforce: "pre", transform(code, id) {
      if (resolve(id.split("?")[0]).toLowerCase() !== FPS_FILE.toLowerCase()) return null;
      transformSeen += 1; gate(code === source, "VITE_SOURCE_MISMATCH"); let transformed = source;
      for (const [name, marker, replacement] of TRANSFORMS) { gate(occurrences(transformed, marker) === 1, "TRANSFORM_MARKER_COUNT", name); transformed = transformed.replace(marker, replacement); }
      let roundTrip = transformed; for (const [name, marker, replacement] of [...TRANSFORMS].reverse()) { gate(occurrences(roundTrip, replacement) === 1, "TRANSFORM_REPLACEMENT_COUNT", name); roundTrip = roundTrip.replace(replacement, marker); }
      gate(roundTrip === source, "TRANSFORM_NOT_REVERSIBLE"); gate(json(randTokens(transformed)) === json(randTokens(source)), "RNG_TOKEN_SEQUENCE_CHANGED"); return { code: transformed, map: null };
    } }] });
    const module = await vite.ssrLoadModule(`${FPS_MODULE_ID}?r40=${Date.now()}`); gate(transformSeen === 1, "TRANSFORM_LOAD_GATE", String(transformSeen)); return module.__CS_APM_R40_TEST_API__;
  } finally { if (vite) await vite.close(); rmSync(tempRoot, { recursive: true, force: true }); }
}
function treatmentRoster(base, targetId, value) { const next = clone(base), target = next.find((p) => p.id === targetId); gate(target, "TARGET_MISSING", targetId); target.stats.apm = value; return freeze(next); }
function levelMetrics(sim, events, targetId) {
  const own = (type) => events.filter((e) => e.type === type && e.playerId === targetId);
  const combat = own("combatSkill"), aggr = own("aggr"), pos = own("posSkill");
  const opportunities = events.filter((e) => e.type === "opportunity" && e.tPlayerId === targetId);
  const probabilities = events.filter((e) => e.type === "probability" && e.tPlayerId === targetId);
  const resolutions = events.filter((e) => e.type === "resolution" && e.tPlayerId === targetId);
  const conversions = events.filter((e) => e.type === "conversion" && e.tPlayerId === targetId);
  const attacker = conversions.filter((e) => e.attackerId === targetId);
  const resultPlayer = (sim.players || []).find((p) => p.id === targetId);
  gate(combat.length > 0 && aggr.length > 0 && pos.length > 0, "DIRECT_APM_CONSUMER_MISSING", targetId);
  const effective = [...new Set(combat.map((e) => e.effectiveApm))];
  const retreatOpp = own("retreatOpportunity"), retreatTrigger = own("retreatTrigger");
  return { effectiveApm: effective.length ? effective[0] : 0, combatSkillMean: mean(combat.map((e) => e.result)), mechanicsMean: mean(combat.map((e) => e.mechanics)), roleFitMean: mean(combat.map((e) => e.roleFit)), posSkillMean: mean(pos.map((e) => e.result)), aggrMean: mean(aggr.map((e) => e.result)), aggrMin: Math.min(...aggr.map((e) => e.result)), aggrMax: Math.max(...aggr.map((e) => e.result)), opportunities: opportunities.length, ptMean: mean(probabilities.map((e) => e.pt)), conversions: attacker.length, kills: attacker.filter((e) => e.killed).length, damage: attacker.reduce((sum, e) => sum + Number(e.effectiveDamage || 0), 0), retreatOpportunities: retreatOpp.length, retreatTriggers: retreatTrigger.length, thresholdBelow: retreatOpp.filter((e) => e.gatePassed).length, finalKills: Number(resultPlayer?.k || 0), finalDamage: Number(resultPlayer?.dmg || resultPlayer?.dmgDealt || 0), survived: resultPlayer ? !resultPlayer.dead : null };
}
function runArm(api, tTactic, ctTactic, roster, targetId, seed) {
  const before = inputDigest(tTactic, ctTactic, roster); globalThis.__CS_R40_AUDIT__ = null; const off = api.simulateFps(MAP_KEY, tTactic, ctTactic, seed, roster);
  const c1 = collector(); globalThis.__CS_R40_AUDIT__ = c1; const on1 = api.simulateFps(MAP_KEY, tTactic, ctTactic, seed, roster);
  const c2 = collector(); globalThis.__CS_R40_AUDIT__ = c2; const on2 = api.simulateFps(MAP_KEY, tTactic, ctTactic, seed, roster); globalThis.__CS_R40_AUDIT__ = null;
  gate(JSON.stringify(off) === JSON.stringify(on1) && JSON.stringify(on1) === JSON.stringify(on2), "INSTRUMENTATION_CHANGED_SIM", `${targetId}:${seed}`); gate(json(c1.events) === json(c2.events), "REPEATED_EVENT_DIGEST", `${targetId}:${seed}`); gate(before === inputDigest(tTactic, ctTactic, roster), "SIM_MUTATED_INPUT", `${targetId}:${seed}`);
  return { seed, metrics: levelMetrics(on1, c1.events, targetId), eventDigest: sha256(json(c1.events)), simDigest: sha256(JSON.stringify(off)) };
}
function summarizeRole(target, rows) {
  const levels = Object.fromEntries(LEVELS.map((level) => [level, rows[level]])), adjacent = {};
  for (let i = 1; i < LEVELS.length; i += 1) { const from = LEVELS[i - 1], to = LEVELS[i], current = levels[to].map((r) => r.metrics), previous = levels[from].map((r) => r.metrics); const m = (key) => paired(current.map((r) => r[key]), previous.map((r) => r[key])); adjacent[`${from}-${to}`] = { combatSkill: m("combatSkillMean"), mechanics: m("mechanicsMean"), aggr: m("aggrMean"), roleFit: m("roleFitMean"), pt: m("ptMean"), conversions: m("conversions"), damage: m("damage") }; }
  const directPer10 = (key) => mean(Object.values(adjacent).map((edge) => edge[key].perPoint)); const strict = (key) => Object.values(adjacent).every((edge) => edge[key].strictMajorityPositive);
  return { targetId: target.id, role: target.role, personality: target.personality, levels: Object.fromEntries(LEVELS.map((level) => [level, { effectiveApm: metricStats(levels[level].map((r) => r.metrics.effectiveApm)), combatSkill: metricStats(levels[level].map((r) => r.metrics.combatSkillMean)), mechanics: metricStats(levels[level].map((r) => r.metrics.mechanicsMean)), aggr: metricStats(levels[level].map((r) => r.metrics.aggrMean)), aggrMin: metricStats(levels[level].map((r) => r.metrics.aggrMin)), aggrMax: metricStats(levels[level].map((r) => r.metrics.aggrMax)), opportunity: metricStats(levels[level].map((r) => r.metrics.opportunities)), pt: metricStats(levels[level].map((r) => r.metrics.ptMean)), conversions: metricStats(levels[level].map((r) => r.metrics.conversions)), damage: metricStats(levels[level].map((r) => r.metrics.damage)), retreatOpportunities: metricStats(levels[level].map((r) => r.metrics.retreatOpportunities)), retreatTriggers: metricStats(levels[level].map((r) => r.metrics.retreatTriggers)), thresholdBelow: metricStats(levels[level].map((r) => r.metrics.thresholdBelow)) }])), adjacent, directPer10: { combatSkill: round(directPer10("combatSkill")), mechanics: round(directPer10("mechanics")), aggr: round(directPer10("aggr")), roleFit: round(directPer10("roleFit")), pt: round(directPer10("pt")) }, directStrictMajority: { combatSkill: strict("combatSkill"), mechanics: strict("mechanics"), aggr: strict("aggr"), roleFit: strict("roleFit"), pt: strict("pt") } };
}
async function main() {
  const source = readFileSync(FPS_FILE, "utf8"); gate(sha256(source) === SOURCE_SHA256, "LIVE_SOURCE_SHA256", sha256(source)); gate(LEVELS.length === 5 && FIXED_SEEDS.length === 16, "SWEEP_SHAPE"); gate(randTokens(source).length === EXPECTED_RAND_CALLS, "RAND_CALL_COUNT", String(randTokens(source).length)); gate(source.includes("aggr(p)<0.82") && source.includes("const spd=4.8+(p.sta?(p.sta-82)*0.025:0);"), "APM_THRESHOLD_OR_SPEED_SOURCE_GATE");
  const api = await loadApi(source), map = api.TACTICS_DB[MAP_KEY], tTactic = freeze(clone(map?.t?.find((i) => i.id === T_TACTIC_ID))), ctTactic = freeze(clone(map?.ct?.find((i) => i.id === CT_TACTIC_ID))), base = freeze(clone(api.ROSTER)); gate(tTactic?.id === T_TACTIC_ID && ctTactic?.id === CT_TACTIC_ID, "TACTIC_MISSING"); const targets = base.filter((p) => p.side === "t"); gate(targets.length === 5 && targets.every((p) => ROLES.includes(p.role)), "ROLE_COVERAGE");
  const cases = [];
  for (const target of targets) { const rows = {}; for (const level of LEVELS) { const roster = treatmentRoster(base, target.id, level); rows[level] = FIXED_SEEDS.map((seed) => runArm(api, tTactic, ctTactic, roster, target.id, seed)); } const result = summarizeRole(target, rows); cases.push(result); console.log(`role ${target.role} ${target.id}: per10=${JSON.stringify(result.directPer10)} strict=${JSON.stringify(result.directStrictMajority)}`); console.log(`  levels=${LEVELS.map((level) => `${level}:eff=${result.levels[level].effectiveApm.mean},combat=${result.levels[level].combatSkill.mean},mech=${result.levels[level].mechanics.mean},aggr=${result.levels[level].aggr.mean},opp=${result.levels[level].opportunity.mean},retreat=${result.levels[level].retreatTriggers.mean},below=${result.levels[level].thresholdBelow.mean}`).join(" | ")}`); console.log(`  adjacent=${Object.entries(result.adjacent).map(([band, edge]) => `${band}:combat=${edge.combatSkill.meanDiff}(${edge.combatSkill.effectSize}),aggr=${edge.aggr.meanDiff}(${edge.aggr.effectSize}),pt=${edge.pt.meanDiff}(${edge.pt.effectSize}),conv=${edge.conversions.meanDiff},dmg=${edge.damage.meanDiff}`).join(" | ")}`); }
  const direct = cases.flatMap((item) => Object.values(item.adjacent).map((edge) => edge.combatSkill)), aggrDirect = cases.flatMap((item) => Object.values(item.adjacent).map((edge) => edge.aggr)); gate(direct.filter((edge) => edge.strictMajorityPositive).length === 20, "DIRECT_COMBAT_STRICT_MAJORITY", `${direct.filter((edge) => edge.strictMajorityPositive).length}/20`); gate(aggrDirect.filter((edge) => edge.strictMajorityPositive).length === 20, "DIRECT_AGGR_STRICT_MAJORITY", `${aggrDirect.filter((edge) => edge.strictMajorityPositive).length}/20`);
  const digest = sha256(json({ schema: SCHEMA, sourceSha256: SOURCE_SHA256, seedSetSha256: SEED_SET_SHA256, levels: LEVELS, threshold: APM_THRESHOLD, roles: cases })); console.log(`schema: ${SCHEMA}`); console.log(`sweep: ${LEVELS.join(" / ")} × ${ROLES.join(" / ")} × ${FIXED_SEEDS.length} fixed seeds = ${LEVELS.length * targets.length * FIXED_SEEDS.length} arms`); console.log(`seedSetSha256: ${SEED_SET_SHA256}`); console.log(`engineSourceSha256: ${SOURCE_SHA256}`); console.log(`primary direct combat/aggr strict-majority: 20/20, 20/20`); console.log(`retreat threshold: aggr < ${APM_THRESHOLD} observed only; threshold and retreat code unchanged`); console.log(`suiteDigest: ${digest}`); console.log("Level 4 kills/damage/survival: secondary observation only"); console.log("production source modified: no (memory transform only)"); console.log("RNG/scenario/historical evidence: unchanged"); console.log("calibration range decision: direct APM is monotonic; threshold crossing and clamp define range limits"); console.log("CS APM Calibration Pilot R40: PASS");
}
main().catch((error) => { console.error(error?.stack || error); process.exitCode = 1; });
