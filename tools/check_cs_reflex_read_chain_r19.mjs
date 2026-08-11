#!/usr/bin/env node
// CS Reflex Read-Chain / Role Interaction Audit R19
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
const EVENT_SCHEMA = "CsReflexReadChainAuditEvent.v1";
const SUITE_SCHEMA = "CsReflexReadChainAuditSuite.v1";
const R18A_SUITE_DIGEST = "104c38526b6ff0bbd9da41b89631d60bba298dce0fd45cee3a209253973a471b";
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
const TARGET_ROLES = Object.freeze(["entry", "rifler", "awp", "lurker", "igl"]);
const ROLE_RXN_POS_WEIGHT = Object.freeze({ entry: 4, rifler: 4, awp: 1, lurker: 0, igl: 0 });
const PERSONALITY_RXN_DELTA = Object.freeze({ aggressive: 6, genius: 6, lonewolf: 6, steady: -4 });

const SIGNATURE_MARKER = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster){";
const SIGNATURE_REPLACEMENT = SIGNATURE_MARKER;
const PERS_MARKER = "function persStat(p,key){let v=(p.stats&&p.stats[key])||50;const pr=p.personality&&PERSONALITY[p.personality];if(pr){if(pr.boost.includes(key))v+=PERS_BOOST;if(pr.nerf.includes(key))v-=PERS_NERF;}return clamp(v,1,99);}";
const PERS_REPLACEMENT = "function persStat(p,key){let v=(p.stats&&p.stats[key])||50;const pr=p.personality&&PERSONALITY[p.personality];if(pr){if(pr.boost.includes(key))v+=PERS_BOOST;if(pr.nerf.includes(key))v-=PERS_NERF;}const effective=clamp(v,1,99);if(key===\"rxn\")globalThis.__CS_R19_AUDIT__?.record(\"persStatRxn\",{playerId:p.id,role:p.role,personality:p.personality,rawRxn:Number(p.stats?.rxn??50),effectiveRxn:effective});return effective;}";
const POS_MARKER = "function posSkill(p){const prof=POS_PROFILE[p.role]||POS_PROFILE.rifler;const s=p.stats||{};let t=0;prof.forEach((k,i)=>t+=(s[k]||50)*(5-i));return t/15;}";
const POS_REPLACEMENT = "function posSkill(p){const prof=POS_PROFILE[p.role]||POS_PROFILE.rifler;const s=p.stats||{};let t=0;prof.forEach((k,i)=>t+=(s[k]||50)*(5-i));const result=t/15;const rxnIndex=prof.indexOf(\"rxn\");globalThis.__CS_R19_AUDIT__?.record(\"posSkill\",{playerId:p.id,role:p.role,profile:prof.join(\",\"),rawRxn:Number(s.rxn??50),rxnWeight:rxnIndex<0?0:5-rxnIndex,result});return result;}";
const S_MARKER = "const S=k=>persStat(p,k);";
const S_REPLACEMENT = "let __r19AdjustedRxn=null;const S=k=>{const value=persStat(p,k);if(k===\"rxn\"){__r19AdjustedRxn=value;globalThis.__CS_R19_AUDIT__?.record(\"combatSkillRxnRead\",{playerId:p.id,role:p.role,adjustedRxn:value});}return value;};";
const COMBAT_RETURN_MARKER = "return v*formMul(p);";
const COMBAT_RETURN_REPLACEMENT = "const __r19Form=formMul(p),__r19Result=v*__r19Form;globalThis.__CS_R19_AUDIT__?.record(\"combatSkill\",{playerId:p.id,role:p.role,rawRxn:Number(p.stats?.rxn??50),adjustedRxn:__r19AdjustedRxn,gunClass:cls||\"unknown\",roleFit:role,mechanics:mech,weapon:wpn,baseBeforeForm:v,formMul:__r19Form,result:__r19Result,holding:Boolean(opts?.holding),entry:Boolean(opts?.entry),lurk:Boolean(opts?.lurk),lastAlive:Boolean(opts?.lastAlive),lowHP:Boolean(opts?.lowHP)});return __r19Result;";
const AGGR_MARKER = "function aggr(p){const s=p.stats;if(!s)return 0.6;const base=(persStat(p,\"cou\")*0.5+persStat(p,\"str\")*0.22+persStat(p,\"apm\")*0.16+persStat(p,\"pos\")*0.12)/100;const pr=p.personality&&PERSONALITY[p.personality];return clamp(base+(ROLE_AGGR[p.role]||0)+(pr?pr.aggro:0),0.2,1.15);}";
const AGGR_REPLACEMENT = "function aggr(p){const s=p.stats;if(!s)return 0.6;const base=(persStat(p,\"cou\")*0.5+persStat(p,\"str\")*0.22+persStat(p,\"apm\")*0.16+persStat(p,\"pos\")*0.12)/100;const pr=p.personality&&PERSONALITY[p.personality];const result=clamp(base+(ROLE_AGGR[p.role]||0)+(pr?pr.aggro:0),0.2,1.15);globalThis.__CS_R19_AUDIT__?.record(\"aggr\",{playerId:p.id,role:p.role,result});return result;}";
const PT_MARKER = "const Pt=clamp(0.5+(tSk-cSk)*0.013+(MAP_EDGE[mapKey]??0.02)+ecoEdge+flashPen+tacEdge,0.07,0.93);";
const PT_REPLACEMENT = `${PT_MARKER}globalThis.__CS_R19_AUDIT__?.record("probability",{tPlayerId:tp.id,cPlayerId:cp.id,tRole:tp.role,cRole:cp.role,tSk,cSk,pt:Pt,lowerClamp:Pt===0.07,upperClamp:Pt===0.93});`;
const RETURN_MARKER = "return { EsportsFPS3D, buildMatchResult };";
const RETURN_REPLACEMENT = "return { EsportsFPS3D, buildMatchResult, simulateFps, ROSTER, TACTICS_DB };";
const EXPORT_MARKER = "export { EsportsFPS3D, buildMatchResult };";
const EXPORT_REPLACEMENT = [
  "const __CS_REFLEX_R19_TEST_API__ = Object.freeze({",
  "  simulateFps: __FPS3D_MODULE.simulateFps,",
  "  ROSTER: __FPS3D_MODULE.ROSTER,",
  "  TACTICS_DB: __FPS3D_MODULE.TACTICS_DB,",
  "});",
  "export { EsportsFPS3D, buildMatchResult, __CS_REFLEX_R19_TEST_API__ };",
].join("\n");
const TRANSFORMS = Object.freeze([
  ["persStat", PERS_MARKER, PERS_REPLACEMENT],
  ["posSkill", POS_MARKER, POS_REPLACEMENT],
  ["combatSkill S", S_MARKER, S_REPLACEMENT],
  ["combatSkill return", COMBAT_RETURN_MARKER, COMBAT_RETURN_REPLACEMENT],
  ["aggr", AGGR_MARKER, AGGR_REPLACEMENT],
  ["probability", PT_MARKER, PT_REPLACEMENT],
  ["return export", RETURN_MARKER, RETURN_REPLACEMENT],
  ["module export", EXPORT_MARKER, EXPORT_REPLACEMENT],
]);

function gate(ok, code, detail = "") { if (!ok) throw new Error(`[${code}]${detail ? `\n${detail}` : ""}`); }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function occurrences(text, needle) { return text.split(needle).length - 1; }
function clone(value) { return structuredClone(value); }
function freeze(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value); for (const child of Object.values(value)) freeze(child, seen); return Object.freeze(value);
}
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
function sampleSd(values) {
  if (values.length < 2) return 0; const avg = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + ((value - avg) ** 2), 0) / (values.length - 1));
}
function rounded(value) { return +Number(value || 0).toFixed(4); }
function expectedAdjustedRxn(player) { return Math.max(1, Math.min(99, Number(player.stats.rxn) + (PERSONALITY_RXN_DELTA[player.personality] || 0))); }
function aggregate(values) { return { mean: rounded(mean(values)), sd: rounded(sampleSd(values)), min: rounded(Math.min(...values)), max: rounded(Math.max(...values)) }; }

function createCollector() {
  const events = [];
  return { events, record(type, payload) {
    gate(payload && typeof payload === "object" && !Array.isArray(payload), "EVENT_PAYLOAD", type);
    const event = Object.freeze({ schema: EVENT_SCHEMA, type, ...payload });
    for (const [key, value] of Object.entries(event)) gate(value === null || ["string", "number", "boolean"].includes(typeof value), "EVENT_FIELD", `${type}.${key}`);
    events.push(event);
  } };
}

function validateEvents(events) {
  gate(events.length > 0, "NO_AUDIT_EVENTS");
  const allowed = new Set(["persStatRxn", "posSkill", "combatSkillRxnRead", "combatSkill", "aggr", "probability"]);
  for (const event of events) gate(event.schema === EVENT_SCHEMA && allowed.has(event.type), "EVENT_SCHEMA", event.type);
  gate(events.some((event) => event.type === "persStatRxn"), "NO_PERSSTAT_RXN");
  gate(events.some((event) => event.type === "combatSkill"), "NO_COMBAT_SKILL");
  gate(events.some((event) => event.type === "posSkill"), "NO_POS_SKILL");
  return events;
}

async function loadApi(originalSource) {
  let transformSeen = 0; let restored = false; let rngSame = false; let vite = null;
  const tempRoot = mkdtempSync(join(tmpdir(), "esmo-cs-r19-") );
  try {
    vite = await createServer({
      root: ROOT, configFile: false, envFile: false, appType: "custom", logLevel: "error",
      cacheDir: join(tempRoot, "vite-cache"), optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true },
      plugins: [{ name: "cs-reflex-r19-memory-hooks", enforce: "pre", transform(code, id) {
        if (resolve(id.split("?")[0]).toLowerCase() !== FPS_FILE.toLowerCase()) return null;
        transformSeen += 1; gate(code === originalSource, "VITE_SOURCE_MISMATCH");
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
        restored = roundTrip === originalSource; rngSame = json(randTokens(transformed)) === json(randTokens(originalSource));
        gate(restored, "TRANSFORM_NOT_REVERSIBLE"); gate(rngSame, "RNG_TOKEN_SEQUENCE_CHANGED");
        return { code: transformed, map: null };
      } }],
    });
    const module = await vite.ssrLoadModule(`${FPS_MODULE_ID}?r19=${Date.now()}`);
    gate(transformSeen === 1 && restored && rngSame, "TRANSFORM_LOAD_GATE", JSON.stringify({ transformSeen, restored, rngSame }));
    return module.__CS_REFLEX_R19_TEST_API__;
  } finally {
    if (vite) await vite.close();
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function inputDigest(mapKey, tTactic, ctTactic, roster) { return sha256(json({ mapKey, tTactic, ctTactic, roster })); }
function treatmentRoster(baselineRoster, targetId, level) {
  const next = clone(baselineRoster); const base = baselineRoster.find((player) => player.id === targetId); const target = next.find((player) => player.id === targetId);
  gate(base && target, "TARGET_MISSING", targetId); const values = { low: base.stats.rxn - BAND, baseline: base.stats.rxn, high: base.stats.rxn + BAND };
  gate(values.low >= 1 && values.high <= 99, "RXN_BAND_CLAMPED", `${targetId} ${JSON.stringify(values)}`);
  target.stats.rxn = values[level]; gate(target.fps === base.fps && target.moba === base.moba, "HUD_MUTATED", targetId);
  return { roster: freeze(next), value: values[level], values };
}

function runArm(api, { mapKey, tTactic, ctTactic, roster, seed }) {
  const before = inputDigest(mapKey, tTactic, ctTactic, roster);
  globalThis.__CS_R19_AUDIT__ = null; const off = api.simulateFps(mapKey, tTactic, ctTactic, seed, roster);
  const collector1 = createCollector(); globalThis.__CS_R19_AUDIT__ = collector1;
  const on1 = api.simulateFps(mapKey, tTactic, ctTactic, seed, roster);
  const collector2 = createCollector(); globalThis.__CS_R19_AUDIT__ = collector2;
  const on2 = api.simulateFps(mapKey, tTactic, ctTactic, seed, roster);
  globalThis.__CS_R19_AUDIT__ = null;
  gate(JSON.stringify(off) === JSON.stringify(on1) && JSON.stringify(on1) === JSON.stringify(on2), "INSTRUMENTATION_CHANGED_SIM", `seed=${seed}`);
  const events1 = validateEvents(collector1.events); const events2 = validateEvents(collector2.events);
  gate(json(events1) === json(events2), "AUDIT_NON_DETERMINISTIC", `seed=${seed}`);
  gate(before === inputDigest(mapKey, tTactic, ctTactic, roster), "SIM_MUTATED_INPUT", `seed=${seed}`);
  return { seed, sim: on1, events: events1, strictSimDigest: sha256(JSON.stringify(off)), eventDigest: sha256(json(events1)) };
}

function targetReadSummary(arm, targetId, target) {
  const own = arm.events.filter((event) => event.playerId === targetId);
  const pers = own.filter((event) => event.type === "persStatRxn");
  const pos = own.filter((event) => event.type === "posSkill");
  const reads = own.filter((event) => event.type === "combatSkillRxnRead");
  const combat = own.filter((event) => event.type === "combatSkill");
  const aggr = own.filter((event) => event.type === "aggr");
  const probs = arm.events.filter((event) => event.type === "probability" && (event.tPlayerId === targetId || event.cPlayerId === targetId));
  const targetPt = probs.map((event) => event.pt);
  gate(pers.length > 0 && combat.length > 0, "TARGET_RXN_NOT_REACHED", `${targetId} seed=${arm.seed}`);
  const classes = {}; for (const event of combat) classes[event.gunClass] = (classes[event.gunClass] || 0) + 1;
  return {
    seed: arm.seed, rawRxn: Number(target.stats.rxn), expectedAdjustedRxn: expectedAdjustedRxn(target),
    persStatRxnCalls: pers.length, effectiveRxnValues: [...new Set(pers.map((event) => event.effectiveRxn))],
    posSkillCalls: pos.length, rawPosSkill: aggregate(pos.map((event) => event.result)), rawPosRxnWeights: [...new Set(pos.map((event) => event.rxnWeight))],
    combatSkillRxnReads: reads.length, combatSkillCalls: combat.length, combatSkill: aggregate(combat.map((event) => event.result)),
    roleFit: aggregate(combat.map((event) => event.roleFit)), mechanics: aggregate(combat.map((event) => event.mechanics)), weapon: aggregate(combat.map((event) => event.weapon)),
    gunClasses: classes, aggrCalls: aggr.length, aggr: aggregate(aggr.map((event) => event.result)),
    probabilityCalls: probs.length, targetPt: targetPt.length ? aggregate(targetPt) : { mean: 0, sd: 0, min: 0, max: 0 },
    lowerClamp: probs.filter((event) => event.lowerClamp).length, upperClamp: probs.filter((event) => event.upperClamp).length,
  };
}

function aggregateRead(rows) {
  const sum = (key) => rows.reduce((total, row) => total + row[key], 0);
  const flatten = (key) => rows.flatMap((row) => row[key]);
  const meanField = (key) => rounded(mean(rows.map((row) => row[key].mean)));
  return {
    seeds: rows.length, persStatRxnCalls: sum("persStatRxnCalls"), combatSkillRxnReads: sum("combatSkillRxnReads"), combatSkillCalls: sum("combatSkillCalls"),
    posSkillCalls: sum("posSkillCalls"), aggrCalls: sum("aggrCalls"), probabilityCalls: sum("probabilityCalls"),
    rawRxn: rows[0].rawRxn, expectedAdjustedRxn: rows[0].expectedAdjustedRxn, effectiveRxnValues: [...new Set(flatten("effectiveRxnValues"))].sort((a, b) => a - b),
    rawPosSkillMean: meanField("rawPosSkill"), combatSkillMean: meanField("combatSkill"), mechanicsMean: meanField("mechanics"), weaponMean: meanField("weapon"),
    roleFitMean: meanField("roleFit"), aggrMean: meanField("aggr"), targetPtMean: meanField("targetPt"),
    lowerClamp: sum("lowerClamp"), upperClamp: sum("upperClamp"), gunClasses: rows.reduce((out, row) => { for (const [key, value] of Object.entries(row.gunClasses)) out[key] = (out[key] || 0) + value; return out; }, {}),
  };
}

function pairedRead(rows, baselineRows, key) {
  const diffs = rows.map((row, index) => row[key].mean - baselineRows[index][key].mean); const avg = mean(diffs); const sd = sampleSd(diffs);
  return { meanDiff: rounded(avg), sd: rounded(sd), effectSize: sd ? rounded(avg / sd) : (avg ? null : 0), positiveSeeds: diffs.filter((value) => value > 0).length, negativeSeeds: diffs.filter((value) => value < 0).length, zeroSeeds: diffs.filter((value) => value === 0).length };
}

async function main() {
  const source = readFileSync(FPS_FILE, "utf8"); const sourceSha256 = sha256(source);
  gate(sourceSha256 === SOURCE_SHA256, "SOURCE_SHA256", sourceSha256); gate(randTokens(source).length === EXPECTED_RAND_CALLS, "RAND_CALL_COUNT", String(randTokens(source).length));
  gate(FIXED_SEEDS.length === 16, "SEED_COUNT"); gate(ROLE_RXN_POS_WEIGHT.entry === 4 && ROLE_RXN_POS_WEIGHT.rifler === 4 && ROLE_RXN_POS_WEIGHT.awp === 1 && ROLE_RXN_POS_WEIGHT.lurker === 0 && ROLE_RXN_POS_WEIGHT.igl === 0, "ROLE_RXN_PROFILE");
  gate(!AGGR_MARKER.includes("rxn"), "AGGR_RXN_READ");
  console.log(`schema: ${EVENT_SCHEMA}`); console.log(`seed generation version: ${SEED_GENERATION_VERSION}`); console.log(`seedSetSha256: ${SEED_SET_SHA256}`); console.log(`engineSourceSha256: ${sourceSha256}`); console.log(`rand() call sites: ${randTokens(source).length}`);
  console.log(`R18-A repair evidence: ${R18A_SUITE_DIGEST}`);
  console.log(`static read points: adapter derived stats.rxn -> raw ovr/display; posSkill raw; combatSkill persStat(mechanics/weapon/options) + posSkill; aggr no rxn`);

  const api = await loadApi(source); const map = api.TACTICS_DB[MAP_KEY]; const tTactic = freeze(clone(map?.t?.find((item) => item.id === T_TACTIC_ID))); const ctTactic = freeze(clone(map?.ct?.find((item) => item.id === CT_TACTIC_ID))); const baselineRoster = freeze(clone(api.ROSTER));
  gate(tTactic?.id === T_TACTIC_ID && ctTactic?.id === CT_TACTIC_ID, "TACTIC_MISSING"); const targets = baselineRoster.filter((player) => player.side === "t"); gate(targets.length === 5, "TARGET_COUNT"); gate(targets.every((player) => TARGET_ROLES.includes(player.role)), "TARGET_ROLES");
  const baselineArms = FIXED_SEEDS.map((seed) => runArm(api, { mapKey: MAP_KEY, tTactic, ctTactic, roster: baselineRoster, seed })); const cases = [];
  for (const target of targets) {
    const levels = { baseline: target.stats.rxn }; const rows = { baseline: [], low: [], high: [] }; rows.baseline = baselineArms.map((arm) => targetReadSummary(arm, target.id, target));
    for (const level of ["low", "high"]) { const treatment = treatmentRoster(baselineRoster, target.id, level); levels[level] = treatment.value; rows[level] = FIXED_SEEDS.map((seed) => targetReadSummary(runArm(api, { mapKey: MAP_KEY, tTactic, ctTactic, roster: treatment.roster, seed }), target.id, treatment.roster.find((player) => player.id === target.id))); }
    const caseResult = { targetId: target.id, role: target.role, personality: target.personality, levels, roleRxnPosWeight: ROLE_RXN_POS_WEIGHT[target.role], baseline: aggregateRead(rows.baseline), low: aggregateRead(rows.low), high: aggregateRead(rows.high), paired: {
      lowBaselineCombatSkill: pairedRead(rows.low, rows.baseline, "combatSkill"), highBaselineCombatSkill: pairedRead(rows.high, rows.baseline, "combatSkill"), lowHighCombatSkill: pairedRead(rows.low, rows.high, "combatSkill"),
      lowBaselinePt: pairedRead(rows.low, rows.baseline, "targetPt"), highBaselinePt: pairedRead(rows.high, rows.baseline, "targetPt"), lowHighPt: pairedRead(rows.low, rows.high, "targetPt"),
      lowBaselineAggr: pairedRead(rows.low, rows.baseline, "aggr"), highBaselineAggr: pairedRead(rows.high, rows.baseline, "aggr"), lowHighAggr: pairedRead(rows.low, rows.high, "aggr"),
    } };
    cases.push(caseResult); console.log(`role read-chain: ${JSON.stringify(caseResult)}`);
  }
  const suite = { schema: SUITE_SCHEMA, sourceSha256, r18aSuiteDigest: R18A_SUITE_DIGEST, seedSetSha256: SEED_SET_SHA256, scenario: { mapKey: MAP_KEY, tTacticId: T_TACTIC_ID, ctTacticId: CT_TACTIC_ID }, band: BAND, cases };
  console.log(`simulations: ${FIXED_SEEDS.length * (1 + targets.length * 2)}`); console.log(`suiteDigest: ${sha256(json(suite))}`); console.log("production source modified: no (memory transform only)"); console.log("claim boundary: read-chain / role interaction audit only; no calibration or production balance claim"); console.log("CS Reflex Read-Chain / Role Interaction Audit R19: PASS");
}

main().catch((error) => { console.error(error?.stack || error); process.exitCode = 1; });
