#!/usr/bin/env node
// CS Molly Gameplay Integration R15
//
// Verifier-first paired migration:
// - R14 is the byte-exact historical baseline.
// - R15 wires player-thrown molly zones into the existing damage/death ledger.
// - Tactic mollys remain visual-only and never receive invented ownership.
// - Before player-molly spawn the run is exact; between spawn and the first
//   positive effective damage only player-molly lifecycle/frame state may differ.
// - Runs without player detonation are exact; detonations without damage are
//   exact after player-molly lifecycle/frame normalization.

import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import {
  CS_R14_HE_SOURCE_SHA256,
  CS_R15_MOLLY_SOURCE_SHA256,
  CS_R19_SEMANTIC_SOURCE_SHA256,
  CS_R25_ACCURACY_SOURCE_SHA256,
  csR19R15Source,
  csR25R24Source,
  csR15R14Source,
  normalizeCsSource,
} from "./cs_r15_legacy_source.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FPS_FILE = resolve(ROOT, "src/battle/fps/EsportsFPS3D.jsx");
const FPS_MODULE_ID = "/src/battle/fps/EsportsFPS3D.jsx";
const CONTRACT_FILE = resolve(ROOT, "src/platform/contracts/CsMatchResult.js");
const RESULT_UI_FILE = resolve(ROOT, "src/screens/fps/CsResultScreen.jsx");

const MOLLY_SCHEMA = "CsMollyGameplay.v1";
const DIGEST_SCHEMA_V6 = "CsGameplayDigest.v6";
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
const EXPECTED_MOLLY_RADIUS = 4;
const EXPECTED_MOLLY_TL = 8;
const EXPECTED_MOLLY_DAMAGE = 10;
// Deliberately manual-only. There is no capture/update/rebaseline CLI.
const EXPECTED_MOLLY_SUITE_SHA256 = "362d1095dcd3e06d7fcc79b26e920a444c22a50976c5cd03e5eec1771a5a54c9";
const EXPECTED_GAMEPLAY_SUITE_V6_SHA256 = "e0622480e1b1a833098c8186b0dcef00fd7cf69ee880b1b4ac3b45189f97a8ae";

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
const RNG_MARKER = "const map=MAPS[mapKey];const rand=mkRng(seed);";
const HE_CONSTANT_ANCHOR = "const HE_R=12,HE_MAX_DAMAGE=80,HE_ARMOR_SCALE=0.72;";
const MOLLY_CONSTANT_BLOCK = `${HE_CONSTANT_ANCHOR}
// R15 functional baseline only; balance calibration requires a separate Sprint.
const MOLLY_R=4,MOLLY_TL=8,MOLLY_DAMAGE_PER_TICK=10;`;
const UTIL_MARKER = '        if(source==="he")roundUtilDmg[at.id]=(roundUtilDmg[at.id]||0)+effectiveDamage;';
const UTIL_REPLACEMENT = '        if(source==="he"||source==="molly")roundUtilDmg[at.id]=(roundUtilDmg[at.id]||0)+effectiveDamage;';
const CAST_PREFIX = '        if(weapon==="he")casts.push(';
const CAST_REPLACEMENT = '        if(weapon==="molly")casts.push(`🔥 ${at.name} 燃燒彈擊殺 ${df.name}`);else if(weapon==="he")casts.push(';
const THROW_MARKER = `          const nadeId=\`nd\${fi}\${p.id}\`;
          throwables.push({id:nadeId,type:nt,side:p.side,from:{...p.pos},to:land,t:0,flying:true,detonate:false});throwerByNadeId[nadeId]=p.id;`;
const MOLLY_AGING_MARKER = "      mollys=mollys.map(m=>({...m,tl:m.tl-1})).filter(m=>m.tl>0);";
const MOLLY_PROCESSOR = `      mollys.forEach((m,zoneIndex)=>{
        const sourceId=String(m.id).startsWith("mnd")?String(m.id).slice(1):null;if(!sourceId)return;
        const at=ps.find(pl=>pl.id===throwerByNadeId[sourceId]);if(!at)return;
        ps.forEach(df=>{if(df.dead||df.side===at.side)return;const d=dist(df.pos,m.pos);if(d>=MOLLY_R||lineBlocked(m.pos,df.pos,walls))return;const {killed}=applyDamage(at,df,MOLLY_DAMAGE_PER_TICK,"molly",sourceId);if(killed)finalizeKill(at,df,{weapon:"molly",distance:d,sourceId});});
      });`;
const SMOKE_BRANCH = '        if(tw.type==="smoke")smokes.push({id:`s${tw.id}`,pos:{...tw.to},tl:18,age:0});';
const MOLLY_SPAWN_BRANCH = '        if(tw.type==="molly")mollys.push({id:`m${tw.id}`,pos:{...tw.to},tl:MOLLY_TL});';
const KILLFEED_MARKER = '{e.gun==="he"?"💥":';
const KILLFEED_REPLACEMENT = '{e.gun==="molly"?"🔥":e.gun==="he"?"💥":';
const APPLY_RETURN_MARKER = "        return{hpBefore,effectiveDamage,killed:df.hp<=0};";
const KILL_START_MARKER = `      const finalizeKill=(at,df,{weapon=at.gun,isHS=false,distance=Infinity,sourceId=null}={})=>{
        df.dead=true;`;
const KILL_END_MARKER = "\n      };\n      if(sec===12){";
const ROUND_ACCOUNT_MARKER = "    const _rnds=rnd+1;";
const RETURN_MARKER = "return { EsportsFPS3D, buildMatchResult };";
const EXPORT_MARKER = "export { EsportsFPS3D, buildMatchResult };";

function gate(ok, code, detail = "") {
  if (!ok) throw new Error(`[${code}]${detail ? `\n${detail}` : ""}`);
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function occurrences(text, needle) {
  return text.split(needle).length - 1;
}

function randTokens(source) {
  return source.match(/\brand\s*\(\s*\)/g) ?? [];
}

function replaceOnce(source, marker, replacement, code) {
  gate(occurrences(source, marker) === 1, code, marker.slice(0, 180));
  return source.replace(marker, replacement);
}

function buildCandidateSource(r14Source) {
  let source = normalizeCsSource(r14Source);
  source = replaceOnce(source, HE_CONSTANT_ANCHOR, MOLLY_CONSTANT_BLOCK, "MOLLY_CONSTANT_ANCHOR");
  source = replaceOnce(source, UTIL_MARKER, UTIL_REPLACEMENT, "MOLLY_UTIL_LEDGER");
  source = replaceOnce(source, CAST_PREFIX, CAST_REPLACEMENT, "MOLLY_CAST_SEMANTICS");
  source = replaceOnce(source, MOLLY_AGING_MARKER,
    `${MOLLY_PROCESSOR}\n${MOLLY_AGING_MARKER}`, "MOLLY_PROCESSOR_ANCHOR");
  source = replaceOnce(source, SMOKE_BRANCH,
    `${SMOKE_BRANCH}\n${MOLLY_SPAWN_BRANCH}`, "MOLLY_SPAWN_ANCHOR");
  source = replaceOnce(source, KILLFEED_MARKER, KILLFEED_REPLACEMENT, "MOLLY_KILLFEED");
  gate(randTokens(source).length === EXPECTED_RAND_CALLS, "CANDIDATE_RAND_CALL_COUNT",
    `expected=${EXPECTED_RAND_CALLS} actual=${randTokens(source).length}`);
  gate(occurrences(source, MOLLY_PROCESSOR) === 1, "CANDIDATE_MOLLY_PROCESSOR_COUNT");
  gate(occurrences(source, MOLLY_SPAWN_BRANCH) === 1, "CANDIDATE_MOLLY_SPAWN_COUNT");
  return source;
}

function canonicalValue(value, { gameplay = false, rejectUndefined = true } = {}, key = "") {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    gate(Number.isFinite(value), "NON_FINITE_NUMBER", key);
    if (Object.is(value, -0)) return 0;
    if (gameplay && ["x", "y", "routeT", "t", "distance"].includes(key)) {
      return Math.round(value * 1e6) / 1e6;
    }
    return value;
  }
  if (typeof value === "undefined") {
    gate(!rejectUndefined, "UNDEFINED_VALUE", key);
    return undefined;
  }
  gate(value && typeof value === "object", "UNSUPPORTED_VALUE", `${key}:${typeof value}`);
  if (Array.isArray(value)) {
    return value.map((item, index) => canonicalValue(
      item, { gameplay, rejectUndefined }, `${key}[${index}]`,
    ));
  }
  const out = {};
  for (const childKey of Object.keys(value).sort()) {
    const normalized = canonicalValue(value[childKey], { gameplay, rejectUndefined }, childKey);
    if (typeof normalized !== "undefined") out[childKey] = normalized;
  }
  return out;
}

function canonicalJson(value, options = { gameplay: true, rejectUndefined: true }) {
  return JSON.stringify(canonicalValue(value, options));
}

function firstDifference(left, right, path = "") {
  if (Object.is(left, right)) return null;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return { path, baseline: left, candidate: right };
    if (left.length !== right.length) {
      return { path: `${path}.length`, baseline: left.length, candidate: right.length };
    }
    for (let index = 0; index < left.length; index += 1) {
      const difference = firstDifference(left[index], right[index], `${path}[${index}]`);
      if (difference) return difference;
    }
    return null;
  }
  if (left && right && typeof left === "object" && typeof right === "object") {
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
    for (const key of keys) {
      const difference = firstDifference(left[key], right[key], path ? `${path}.${key}` : key);
      if (difference) return difference;
    }
    return null;
  }
  return { path, baseline: left, candidate: right };
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

const PHASE_HOOK = `      __measure?.recordPhase({round:rnd+1,sec,fi,rngCount:__r15RngCount,players:ps,mollys,smokes,throwables,roundDmg,roundUtilDmg,roundKills,roundDeaths,roundAst,planted,c4t,c4pos,roundEnd,events,casts,comms});`;
const INSTRUMENTED_MOLLY_PROCESSOR = `      mollys.forEach((m,zoneIndex)=>{
        const sourceId=String(m.id).startsWith("mnd")?String(m.id).slice(1):null;
        __measure?.recordZone({round:rnd+1,sec,fi,mollyId:m.id,sourceId,player:Boolean(sourceId),zoneIndex,tl:m.tl,pos:{...m.pos},rngCount:__r15RngCount});
        if(!sourceId)return;
        const at=ps.find(pl=>pl.id===throwerByNadeId[sourceId]);if(!at)return;
        ps.forEach((df,targetIndex)=>{if(df.dead||df.side===at.side){__measure?.recordCheck({round:rnd+1,sec,sourceId,mollyId:m.id,zoneIndex,targetIndex,attackerId:at.id,attackerSide:at.side,defenderId:df.id,defenderSide:df.side,dead:df.dead,distance:null,wallBlocked:null,eligible:false,hpBefore:df.hp,rngCount:__r15RngCount});return;}const d=dist(df.pos,m.pos);const blocked=d<MOLLY_R?lineBlocked(m.pos,df.pos,walls):false;const eligible=d<MOLLY_R&&!blocked;__measure?.recordCheck({round:rnd+1,sec,sourceId,mollyId:m.id,zoneIndex,targetIndex,attackerId:at.id,attackerSide:at.side,defenderId:df.id,defenderSide:df.side,dead:df.dead,distance:d,wallBlocked:blocked,eligible,hpBefore:df.hp,rngCount:__r15RngCount});if(!eligible)return;__r15MollyContext={mollyId:m.id,zoneIndex,targetIndex,tl:m.tl,distance:d,wallBlocked:blocked};const {killed}=applyDamage(at,df,MOLLY_DAMAGE_PER_TICK,"molly",sourceId);__r15MollyContext=null;if(killed)finalizeKill(at,df,{weapon:"molly",distance:d,sourceId});});
      });`;

function instrumentSource(source, variant) {
  let code = normalizeCsSource(source);
  code = replaceOnce(code, SIGNATURE_MARKER,
    "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster,__measure=null){",
    `SIGNATURE_${variant}`);
  code = replaceOnce(code, RNG_MARKER,
    "const map=MAPS[mapKey];const __r15RawRand=mkRng(seed);let __r15RngCount=0,__r15MollyContext=null;const rand=()=>{const value=__r15RawRand();__r15RngCount++;__measure?.recordRng(__r15RngCount,value);return value;};",
    `RNG_${variant}`);
  code = replaceOnce(code, THROW_MARKER,
    `${THROW_MARKER}\n          if(nt==="molly")__measure?.recordThrow({round:rnd+1,sec,throwableId:nadeId,throwerId:p.id,side:p.side,from:{...p.pos},to:{...land},rngCount:__r15RngCount});`,
    `THROW_${variant}`);

  const detonationHook = `        if(tw.type==="molly")__measure?.recordDetonation({round:rnd+1,sec,throwableId:tw.id,side:tw.side,to:{...tw.to},rngCount:__r15RngCount,players:ps,mollys,roundDmg,roundUtilDmg,roundKills,roundDeaths,roundAst});`;
  code = replaceOnce(code, SMOKE_BRANCH, `${detonationHook}\n${SMOKE_BRANCH}`,
    `DETONATION_${variant}`);

  if (variant === "candidate") {
    const spawnHook = `${MOLLY_SPAWN_BRANCH}\n        if(tw.type==="molly")__measure?.recordSpawn({round:rnd+1,sec,throwableId:tw.id,mollyId:\`m\${tw.id}\`,ownerId:throwerByNadeId[tw.id]||null,side:tw.side,pos:{...tw.to},tl:MOLLY_TL,rngCount:__r15RngCount});`;
    code = replaceOnce(code, MOLLY_SPAWN_BRANCH, spawnHook, "SPAWN_CANDIDATE");
    code = replaceOnce(code, MOLLY_PROCESSOR,
      `${PHASE_HOOK}\n${INSTRUMENTED_MOLLY_PROCESSOR}`, "PROCESSOR_CANDIDATE");
  } else {
    code = replaceOnce(code, MOLLY_AGING_MARKER,
      `${PHASE_HOOK}\n${MOLLY_AGING_MARKER}`, "PHASE_BASELINE");
  }

  code = replaceOnce(code, APPLY_RETURN_MARKER,
    `        __measure?.recordDamage({round:rnd+1,sec,source,sourceId,attackerId:at.id,attackerSide:at.side,defenderId:df.id,defenderSide:df.side,damage,hpBefore,effectiveDamage,hpAfter:df.hp,killed:df.hp<=0,armor:Boolean(df.armor),hitters:[...(df._hitters||[])],mollyContext:__r15MollyContext?{...__r15MollyContext}:null,rngCount:__r15RngCount});\n${APPLY_RETURN_MARKER}`,
    `DAMAGE_HOOK_${variant}`);
  code = replaceOnce(code, KILL_START_MARKER,
    `      const finalizeKill=(at,df,{weapon=at.gun,isHS=false,distance=Infinity,sourceId=null}={})=>{\n        const __r15MoneyBefore=at.money;\n        df.dead=true;`,
    `KILL_START_${variant}`);
  code = replaceOnce(code, KILL_END_MARKER,
    `\n        __measure?.recordKill({round:rnd+1,sec,sourceId,weapon,attackerId:at.id,defenderId:df.id,isHS,moneyBefore:__r15MoneyBefore,moneyAfter:at.money,attackerKills:roundKills[at.id]||0,defenderDeaths:roundDeaths[df.id]||0,assistIds:(df._hitters||[]).filter(id=>id!==at.id),killEvent:[...events].reverse().find(event=>event.type==="kill")||null,rngCount:__r15RngCount});\n      };\n      if(sec===12){`,
    `KILL_END_${variant}`);
  code = replaceOnce(code, ROUND_ACCOUNT_MARKER,
    `    __measure?.recordRound({round:rnd+1,roundDmg:{...roundDmg},roundUtilDmg:{...roundUtilDmg},roundKills:{...roundKills},roundDeaths:{...roundDeaths},roundAst:{...roundAst},players:ps.map(p=>({id:p.id,hp:p.hp,dead:p.dead,dmgDealt:p.dmgDealt||0,k:p.k,d:p.d,a:p.a,money:p.money}))});\n${ROUND_ACCOUNT_MARKER}`,
    `ROUND_${variant}`);
  code = replaceOnce(code, RETURN_MARKER,
    "return { EsportsFPS3D, buildMatchResult, simulateFps, ROSTER, TACTICS_DB };",
    `RETURN_${variant}`);
  code = replaceOnce(code, EXPORT_MARKER,
    `const __CS_MOLLY_GAMEPLAY_R15_TEST_API__=Object.freeze({simulateFps:__FPS3D_MODULE.simulateFps,ROSTER:__FPS3D_MODULE.ROSTER,TACTICS_DB:__FPS3D_MODULE.TACTICS_DB});\nexport { EsportsFPS3D, buildMatchResult, __CS_MOLLY_GAMEPLAY_R15_TEST_API__ };`,
    `EXPORT_${variant}`);
  gate(randTokens(code).length === EXPECTED_RAND_CALLS, "INSTRUMENTED_RAND_COUNT",
    `variant=${variant} actual=${randTokens(code).length}`);
  return code;
}

function createCollector({ phaseTrigger = "spawn", phaseStop = null } = {}) {
  const data = {
    rng: [], throws: [], detonations: [], spawns: [], zones: [], checks: [],
    damages: [], kills: [], phases: [], rounds: [],
  };
  let phaseActive = false;
  let phaseDone = false;
  function record(target, event) {
    target.push(structuredClone(event));
  }
  return {
    ...data,
    recordRng(index, value) { record(data.rng, { index, value }); },
    recordThrow(event) { record(data.throws, event); },
    recordDetonation(event) {
      record(data.detonations, event);
      if (phaseTrigger === "detonation") phaseActive = true;
    },
    recordSpawn(event) {
      record(data.spawns, event);
      if (phaseTrigger === "spawn") phaseActive = true;
    },
    recordZone(event) { record(data.zones, event); },
    recordCheck(event) { record(data.checks, event); },
    recordDamage(event) {
      record(data.damages, event);
      if (event.source === "molly") phaseDone = true;
    },
    recordKill(event) { record(data.kills, event); },
    recordPhase(event) {
      if (!phaseActive || phaseDone || (phaseStop && tickCompare(event, phaseStop) > 0)) return;
      const normalized = {
        ...event,
        mollys: event.mollys.filter((item) => !isPlayerMolly(item)),
      };
      data.phases.push({
        round: event.round,
        sec: event.sec,
        fi: event.fi,
        rngCount: event.rngCount,
        playerMollyCount: event.mollys.length - normalized.mollys.length,
        stateJson: JSON.stringify(normalized),
      });
    },
    recordRound(event) { record(data.rounds, event); },
  };
}

function collectorProjection(collector) {
  return {
    rng: collector.rng,
    throws: collector.throws,
    detonations: collector.detonations,
    spawns: collector.spawns,
    zones: collector.zones,
    checks: collector.checks,
    damages: collector.damages,
    kills: collector.kills,
    phases: collector.phases,
    rounds: collector.rounds,
  };
}

function runOnce(api, scenario, collectorOptions) {
  const collector = createCollector(collectorOptions);
  const sim = api.simulateFps(
    scenario.mapKey,
    clonePlain(scenario.tTactic),
    clonePlain(scenario.ctTactic),
    scenario.seed,
    clonePlain(scenario.roster),
    collector,
  );
  const simJson = canonicalJson(sim);
  const rngJson = canonicalJson(collector.rng);
  return {
    sim,
    collector,
    simJson,
    rngJson,
    simDigest: sha256(simJson),
    rngDigest: sha256(rngJson),
  };
}

function runDeterministic(api, scenario, label, collectorOptions) {
  const first = runOnce(api, scenario, collectorOptions);
  const second = runOnce(api, scenario, collectorOptions);
  gate(first.simJson === second.simJson, "CANDIDATE_NONDETERMINISTIC_SIM", label);
  gate(first.rngJson === second.rngJson, "CANDIDATE_NONDETERMINISTIC_RNG", label);
  gate(canonicalJson(collectorProjection(first.collector))
    === canonicalJson(collectorProjection(second.collector)),
  "CANDIDATE_NONDETERMINISTIC_EVIDENCE", label);
  return first;
}

function tickCompare(left, right) {
  return left.round - right.round || left.sec - right.sec;
}

function tickBefore(item, boundary) {
  return tickCompare(item, boundary) < 0;
}

function tickAtOrBefore(item, boundary) {
  return tickCompare(item, boundary) <= 0;
}

function eventKey(event) {
  return `${event.round}|${event.sec}|${event.throwableId}`;
}

function damageKey(event) {
  return `${event.round}|${event.sec}|${event.sourceId}|${event.defenderId}`;
}

function isPlayerMolly(item) {
  return String(item?.id ?? item?.mollyId ?? "").startsWith("mnd");
}

function normalizeSnapshotMollys(snapshot) {
  const copy = clonePlain(snapshot);
  if (Array.isArray(copy.mollys)) copy.mollys = copy.mollys.filter((item) => !isPlayerMolly(item));
  return copy;
}

function normalizedSim(sim) {
  const copy = clonePlain(sim);
  copy.frames = copy.frames.map(normalizeSnapshotMollys);
  return copy;
}

function commonEvidence(run, normalizeMolly = false) {
  const mapSnapshot = (item) => normalizeMolly ? normalizeSnapshotMollys(item) : clonePlain(item);
  return {
    rng: run.collector.rng,
    throws: run.collector.throws,
    detonations: run.collector.detonations.map(mapSnapshot),
    damages: run.collector.damages,
    kills: run.collector.kills,
    phases: normalizeMolly ? normalizedPhaseEvidence(run.collector.phases) : run.collector.phases,
    rounds: run.collector.rounds,
  };
}

function normalizedPhaseEvidence(phases) {
  return phases.map(({ round, sec, fi, rngCount, stateJson }) => ({
    round, sec, fi, rngCount, stateJson,
  }));
}

function assertExact(left, right, code, label) {
  const leftJson = canonicalJson(left);
  const rightJson = canonicalJson(right);
  gate(leftJson === rightJson, code,
    `${label}\n${canonicalJson(firstDifference(JSON.parse(leftJson), JSON.parse(rightJson)))}`);
}

function validateLifecycle(run, scenario) {
  const { collector, sim } = run;
  const label = `case=${scenario.caseId} seed=${scenario.seed}`;
  const throwById = new Map(collector.throws.map((event) => [
    `${event.round}|${event.throwableId}`, event,
  ]));
  const detonationById = new Map(collector.detonations.map((event) => [
    `${event.round}|${event.throwableId}`, event,
  ]));
  const spawnByMolly = new Map(collector.spawns.map((event) => [
    `${event.round}|${event.mollyId}`, event,
  ]));

  gate(collector.spawns.length === collector.detonations.length,
    "MOLLY_SPAWN_DETONATION_COUNT", label);
  for (const spawn of collector.spawns) {
    const key = `${spawn.round}|${spawn.throwableId}`;
    const throwEvent = throwById.get(key);
    const detonation = detonationById.get(key);
    gate(Boolean(throwEvent) && Boolean(detonation), "MOLLY_LIFECYCLE_ATTRIBUTION", `${label} ${key}`);
    gate(spawn.mollyId === `m${spawn.throwableId}`, "MOLLY_ID_ATTRIBUTION", `${label} ${key}`);
    gate(spawn.ownerId === throwEvent.throwerId && spawn.side === throwEvent.side,
      "MOLLY_OWNER_ATTRIBUTION", `${label} ${key}`);
    gate(spawn.tl === EXPECTED_MOLLY_TL, "MOLLY_SPAWN_TL", `${label} ${key}`);
    assertExact(spawn.pos, detonation.to, "MOLLY_SPAWN_POSITION", `${label} ${key}`);
    gate(spawn.sec === detonation.sec, "MOLLY_SPAWN_TIMING", `${label} ${key}`);
    const spawnFrame = sim.frames.find((frame) => frame.rnd + 1 === spawn.round
      && frame.roundSec === spawn.sec);
    const frameZone = spawnFrame?.mollys.find((item) => item.id === spawn.mollyId);
    gate(frameZone?.tl === EXPECTED_MOLLY_TL, "MOLLY_SPAWN_FRAME", `${label} ${key}`);
  }

  const playerZones = collector.zones.filter((event) => event.player);
  const tacticZones = collector.zones.filter((event) => !event.player);
  gate(tacticZones.every((event) => event.sourceId === null && !String(event.mollyId).startsWith("mnd")),
    "TACTIC_MOLLY_OWNERSHIP_INVENTED", label);
  for (const zone of playerZones) {
    const spawn = spawnByMolly.get(`${zone.round}|${zone.mollyId}`);
    const throwEvent = throwById.get(`${zone.round}|${zone.sourceId}`);
    gate(Boolean(spawn) && Boolean(throwEvent), "PLAYER_MOLLY_ZONE_ATTRIBUTION",
      `${label} ${zone.round}|${zone.mollyId}`);
  }

  for (const spawn of collector.spawns) {
    const ticks = playerZones.filter((event) => event.round === spawn.round
      && event.mollyId === spawn.mollyId);
    if (!ticks.length) continue;
    gate(ticks[0].sec === spawn.sec + 2 && ticks[0].tl === EXPECTED_MOLLY_TL,
      "MOLLY_NEXT_TICK_START", `${label} ${spawn.round}|${spawn.mollyId}`);
    gate(ticks.length <= EXPECTED_MOLLY_TL, "MOLLY_LIFETIME_OVERFLOW",
      `${label} ${spawn.round}|${spawn.mollyId}`);
    for (let index = 1; index < ticks.length; index += 1) {
      gate(ticks[index].sec === ticks[index - 1].sec + 2
        && ticks[index].tl === ticks[index - 1].tl - 1,
      "MOLLY_LIFETIME_SEQUENCE", `${label} ${spawn.round}|${spawn.mollyId}`);
    }
  }

  return {
    throws: collector.throws.length,
    detonations: collector.detonations.length,
    spawns: collector.spawns.length,
    playerZoneTicks: playerZones.length,
    tacticVisualZoneTicks: tacticZones.length,
  };
}

function validateAccounting(run, scenario) {
  const { collector, sim } = run;
  const label = `case=${scenario.caseId} seed=${scenario.seed}`;
  const throwById = new Map(collector.throws.map((event) => [
    `${event.round}|${event.throwableId}`, event,
  ]));
  const checkByKey = new Map(collector.checks.filter((event) => event.eligible).map((event) => [
    `${event.round}|${event.sec}|${event.sourceId}|${event.defenderId}`, event,
  ]));
  const mollyDamages = collector.damages.filter((event) => event.source === "molly");
  const mollyKills = collector.kills.filter((event) => event.weapon === "molly");

  for (const event of collector.damages) {
    gate(event.effectiveDamage === Math.min(event.damage, event.hpBefore),
      "EFFECTIVE_DAMAGE_ACCOUNTING", `${label} ${damageKey(event)}`);
    gate(event.hpAfter === event.hpBefore - event.damage,
      "HP_DAMAGE_ACCOUNTING", `${label} ${damageKey(event)}`);
    gate(event.killed === (event.hpAfter <= 0), "DAMAGE_LETHAL_FLAG",
      `${label} ${damageKey(event)}`);
  }

  for (const event of mollyDamages) {
    const throwEvent = throwById.get(`${event.round}|${event.sourceId}`);
    const check = checkByKey.get(damageKey(event));
    gate(Boolean(throwEvent) && Boolean(check), "MOLLY_DAMAGE_ATTRIBUTION_MISSING",
      `${label} ${damageKey(event)}`);
    gate(event.sourceId.startsWith("nd") && event.mollyContext?.mollyId === `m${event.sourceId}`,
      "TACTIC_MOLLY_DEALT_DAMAGE", `${label} ${damageKey(event)}`);
    gate(event.attackerId === throwEvent.throwerId && event.attackerSide === throwEvent.side,
      "MOLLY_THROWER_ATTRIBUTION", `${label} ${damageKey(event)}`);
    gate(event.defenderSide !== event.attackerSide && !check.dead,
      "MOLLY_ENEMY_ONLY_DAMAGE", `${label} ${damageKey(event)}`);
    gate(check.distance < EXPECTED_MOLLY_RADIUS && check.wallBlocked === false && check.eligible,
      "MOLLY_RADIUS_OR_WALL_GATE", `${label} ${damageKey(event)}`);
    gate(event.damage === EXPECTED_MOLLY_DAMAGE,
      "MOLLY_FIXED_DAMAGE", `${label} ${damageKey(event)} armor=${event.armor}`);
    gate(event.hpBefore === check.hpBefore, "MOLLY_HP_BEFORE_ATTRIBUTION",
      `${label} ${damageKey(event)}`);
    gate(event.mollyContext.zoneIndex === check.zoneIndex
      && event.mollyContext.targetIndex === check.targetIndex,
    "MOLLY_ARRAY_ORDER_ATTRIBUTION", `${label} ${damageKey(event)}`);
  }

  const damagesByTick = new Map();
  for (const event of mollyDamages) {
    const key = `${event.round}|${event.sec}`;
    const list = damagesByTick.get(key) ?? [];
    list.push(event);
    damagesByTick.set(key, list);
  }
  for (const [key, events] of damagesByTick) {
    for (let index = 1; index < events.length; index += 1) {
      const previous = events[index - 1].mollyContext;
      const current = events[index].mollyContext;
      gate(current.zoneIndex > previous.zoneIndex
        || (current.zoneIndex === previous.zoneIndex && current.targetIndex > previous.targetIndex),
      "MOLLY_ADDITIVE_ARRAY_ORDER", `${label} ${key}`);
    }
  }

  for (const round of collector.rounds) {
    for (const player of round.players) {
      const id = player.id;
      const allDamage = collector.damages.filter((event) => event.round === round.round
        && event.attackerId === id).reduce((sum, event) => sum + event.effectiveDamage, 0);
      const utilityDamage = collector.damages.filter((event) => event.round === round.round
        && event.attackerId === id && ["he", "molly"].includes(event.source))
        .reduce((sum, event) => sum + event.effectiveDamage, 0);
      const kills = collector.kills.filter((event) => event.round === round.round
        && event.attackerId === id).length;
      const deaths = collector.kills.filter((event) => event.round === round.round
        && event.defenderId === id).length;
      const assists = collector.kills.filter((event) => event.round === round.round
        && event.assistIds.includes(id)).length;
      gate((round.roundDmg[id] ?? 0) === allDamage, "ROUND_DAMAGE_LEDGER",
        `${label} round=${round.round} player=${id}`);
      gate((round.roundUtilDmg[id] ?? 0) === utilityDamage, "ROUND_UTIL_DAMAGE_LEDGER",
        `${label} round=${round.round} player=${id}`);
      gate((round.roundKills[id] ?? 0) === kills, "ROUND_KILL_LEDGER",
        `${label} round=${round.round} player=${id}`);
      gate((round.roundDeaths[id] ?? 0) === deaths, "ROUND_DEATH_LEDGER",
        `${label} round=${round.round} player=${id}`);
      gate((round.roundAst[id] ?? 0) === assists, "ROUND_ASSIST_LEDGER",
        `${label} round=${round.round} player=${id}`);
    }
  }

  for (const player of sim.players) {
    const allDamage = collector.damages.filter((event) => event.attackerId === player.id)
      .reduce((sum, event) => sum + event.effectiveDamage, 0);
    const utilityDamage = collector.damages.filter((event) => event.attackerId === player.id
      && ["he", "molly"].includes(event.source))
      .reduce((sum, event) => sum + event.effectiveDamage, 0);
    gate(player.adr === Math.round(allDamage / sim.rounds), "RESULT_ADR_LEDGER",
      `${label} player=${player.id}`);
    gate(player.utilDmg === utilityDamage, "RESULT_UTIL_DAMAGE_LEDGER",
      `${label} player=${player.id}`);
  }

  for (const kill of mollyKills) {
    gate(kill.moneyAfter - kill.moneyBefore === 300, "MOLLY_KILL_ECONOMY",
      `${label} round=${kill.round} defender=${kill.defenderId}`);
    gate(kill.killEvent?.gun === "molly" && kill.killEvent?.hs === false,
      "MOLLY_KILL_EVENT_SEMANTICS", `${label} round=${kill.round}`);
    const damage = mollyDamages.find((event) => event.round === kill.round
      && event.sec === kill.sec && event.sourceId === kill.sourceId
      && event.defenderId === kill.defenderId);
    gate(damage?.killed, "MOLLY_KILL_WITHOUT_LETHAL_DAMAGE", `${label} round=${kill.round}`);
  }

  const overlapDamageEvents = [...damagesByTick.values()].reduce((total, events) => {
    const counts = new Map();
    for (const event of events) counts.set(event.defenderId, (counts.get(event.defenderId) ?? 0) + 1);
    return total + [...counts.values()].filter((count) => count > 1).reduce((sum, count) => sum + count, 0);
  }, 0);
  return {
    damageEvents: mollyDamages.length,
    effectiveDamage: mollyDamages.reduce((sum, event) => sum + event.effectiveDamage, 0),
    kills: mollyKills.length,
    assists: mollyKills.reduce((sum, event) => sum + event.assistIds.length, 0),
    overlapDamageEvents,
    evidenceSha256: sha256(canonicalJson({
      throws: collector.throws,
      detonations: collector.detonations,
      spawns: collector.spawns,
      zones: collector.zones,
      checks: collector.checks,
      damages: mollyDamages,
      kills: mollyKills,
      rounds: collector.rounds,
    })),
  };
}

function validateCausalPair(baseline, candidate, scenario) {
  const label = `case=${scenario.caseId} seed=${scenario.seed}`;
  const firstSpawn = candidate.collector.spawns[0] ?? null;
  const firstDamage = candidate.collector.damages.find((event) => event.source === "molly") ?? null;

  if (!firstSpawn) {
    gate(candidate.collector.detonations.length === 0, "SPAWN_WITHOUT_DETONATION_INVARIANT", label);
    gate(baseline.simJson === candidate.simJson, "NO_DETONATION_TRAJECTORY_DIFF", label);
    gate(baseline.rngJson === candidate.rngJson, "NO_DETONATION_RNG_DIFF", label);
    assertExact(commonEvidence(baseline), commonEvidence(candidate),
      "NO_DETONATION_COMMON_EVIDENCE_DIFF", label);
  } else {
    const candidateDetonation = candidate.collector.detonations.find((event) => (
      event.round === firstSpawn.round && event.throwableId === firstSpawn.throwableId
    ));
    const baselineDetonation = baseline.collector.detonations.find((event) => (
      eventKey(event) === eventKey(candidateDetonation)
    ));
    gate(Boolean(candidateDetonation) && Boolean(baselineDetonation),
      "SPAWN_BOUNDARY_DETONATION_MISSING", label);
    assertExact(baselineDetonation, candidateDetonation,
      "PRE_SPAWN_DETONATION_STATE_DIFF", label);
    assertExact(
      baseline.sim.frames.filter((event) => tickBefore({
        round: event.rnd + 1, sec: event.roundSec,
      }, firstSpawn)),
      candidate.sim.frames.filter((event) => tickBefore({
        round: event.rnd + 1, sec: event.roundSec,
      }, firstSpawn)),
      "PRE_SPAWN_FRAME_DIFF", label,
    );
    assertExact(
      baseline.collector.rng.slice(0, firstSpawn.rngCount),
      candidate.collector.rng.slice(0, firstSpawn.rngCount),
      "PRE_SPAWN_RNG_DIFF", label,
    );

    if (!firstDamage) {
      assertExact(normalizedSim(baseline.sim), normalizedSim(candidate.sim),
        "DETONATION_WITHOUT_DAMAGE_TRAJECTORY_DIFF", label);
      gate(baseline.rngJson === candidate.rngJson, "DETONATION_WITHOUT_DAMAGE_RNG_DIFF", label);
      assertExact(commonEvidence(baseline, true), commonEvidence(candidate, true),
        "DETONATION_WITHOUT_DAMAGE_COMMON_EVIDENCE_DIFF", label);
    } else {
      gate(tickCompare(firstSpawn, firstDamage) < 0,
        "MOLLY_DAMAGE_NOT_AFTER_SPAWN", label);
      const normalizedBaselinePhases = normalizedPhaseEvidence(baseline.collector.phases
        .filter((event) => tickAtOrBefore(event, firstDamage)));
      const normalizedCandidatePhases = normalizedPhaseEvidence(candidate.collector.phases
        .filter((event) => tickAtOrBefore(event, firstDamage)));
      assertExact(normalizedBaselinePhases, normalizedCandidatePhases,
        "PRE_DAMAGE_NON_MOLLY_PHASE_DIFF", label);
      const normalizedBaselineFrames = baseline.sim.frames
        .filter((event) => tickBefore({ round: event.rnd + 1, sec: event.roundSec }, firstDamage))
        .map(normalizeSnapshotMollys);
      const normalizedCandidateFrames = candidate.sim.frames
        .filter((event) => tickBefore({ round: event.rnd + 1, sec: event.roundSec }, firstDamage))
        .map(normalizeSnapshotMollys);
      assertExact(normalizedBaselineFrames, normalizedCandidateFrames,
        "PRE_DAMAGE_NON_MOLLY_FRAME_DIFF", label);
      const firstDamageIndex = candidate.collector.damages.indexOf(firstDamage);
      assertExact(baseline.collector.damages.slice(0, firstDamageIndex),
        candidate.collector.damages.slice(0, firstDamageIndex),
        "PRE_DAMAGE_LEDGER_DIFF", label);
      assertExact(baseline.collector.rng.slice(0, firstDamage.rngCount),
        candidate.collector.rng.slice(0, firstDamage.rngCount),
        "PRE_DAMAGE_RNG_DIFF", label);
    }
  }

  return {
    firstPlayerMollySpawn: firstSpawn ? {
      round: firstSpawn.round,
      sec: firstSpawn.sec,
      throwableId: firstSpawn.throwableId,
      mollyId: firstSpawn.mollyId,
      ownerId: firstSpawn.ownerId,
      rngCount: firstSpawn.rngCount,
    } : null,
    firstEffectiveMollyDamage: firstDamage ? {
      round: firstDamage.round,
      sec: firstDamage.sec,
      throwableId: firstDamage.sourceId,
      attackerId: firstDamage.attackerId,
      defenderId: firstDamage.defenderId,
      damage: firstDamage.damage,
      effectiveDamage: firstDamage.effectiveDamage,
      rngCount: firstDamage.rngCount,
    } : null,
    baselineGameplayDigest: baseline.simDigest,
    baselineRngCount: baseline.collector.rng.length,
    baselineRngDigest: baseline.rngDigest,
    candidateGameplayDigest: candidate.simDigest,
    candidateRngCount: candidate.collector.rng.length,
    candidateRngDigest: candidate.rngDigest,
    fullExactWithoutDetonation: firstSpawn === null,
    normalizedExactWithoutDamage: firstSpawn !== null && firstDamage === null,
  };
}

function outcomeProjection(sim) {
  return {
    ctScore: sim.ctScore,
    tScore: sim.tScore,
    rounds: sim.rounds,
    roundHist: sim.roundHist,
    players: sim.players.map((player) => ({
      id: player.id,
      k: player.k,
      d: player.d,
      a: player.a,
      adr: player.adr,
      utilDmg: player.utilDmg,
      rating: player.rating,
    })),
  };
}

function treatmentRoster(api, statCase) {
  const roster = clonePlain(api.ROSTER);
  const target = roster.find((player) => player.id === statCase.targetId);
  gate(target?.stats?.[statCase.shortKey] === statCase.before,
    "TREATMENT_BEFORE_MISMATCH", statCase.id);
  target.stats[statCase.shortKey] = statCase.after;
  deepFreeze(roster);
  return roster;
}

async function main() {
  gate(process.argv.slice(2).length === 0, "CLI_FLAGS_FORBIDDEN",
    "R15 has no capture, update, rebaseline, seed, treatment, or calibration flags.");
  gate(STAT_CASES.length === 16, "TREATMENT_MATRIX_SIZE", String(STAT_CASES.length));
  gate(canonicalJson(generatedSeeds()) === canonicalJson(FIXED_SEEDS), "SEED_GENERATION_MISMATCH");
  gate(sha256(canonicalJson(FIXED_SEEDS)) === EXPECTED_SEED_SET_SHA256, "SEED_SET_HASH_MISMATCH");

  const originalSource = readFileSync(FPS_FILE, "utf8");
  const normalizedSource = normalizeCsSource(originalSource);
  const sourceSha256 = sha256(normalizedSource);
  const sourceStage = sourceSha256 === CS_R25_ACCURACY_SOURCE_SHA256 ? "r25-accuracy-correction"
    : sourceSha256 === CS_R19_SEMANTIC_SOURCE_SHA256 ? "r19-semantic-correction"
    : sourceSha256 === CS_R14_HE_SOURCE_SHA256 ? "r14-verifier-first"
    : sourceSha256 === CS_R15_MOLLY_SOURCE_SHA256 ? "r15-molly" : null;
  gate(sourceStage, "SOURCE_PROVENANCE_MISMATCH",
    `expected R14=${CS_R14_HE_SOURCE_SHA256}\nexpected R15=${CS_R15_MOLLY_SOURCE_SHA256}\nexpected R19=${CS_R19_SEMANTIC_SOURCE_SHA256}\nexpected R25=${CS_R25_ACCURACY_SOURCE_SHA256}\nactual=${sourceSha256}`);
  gate(randTokens(originalSource).length === EXPECTED_RAND_CALLS, "RAND_CALL_COUNT",
    `expected=${EXPECTED_RAND_CALLS} actual=${randTokens(originalSource).length}`);

  const r24BaseSource = sourceStage === "r25-accuracy-correction" ? csR25R24Source(normalizedSource) : normalizedSource;
  const r19BaseSource = sourceStage === "r19-semantic-correction" || sourceStage === "r25-accuracy-correction" ? csR19R15Source(r24BaseSource) : r24BaseSource;
  const r14Source = sourceStage === "r14-verifier-first"
    ? normalizedSource : csR15R14Source(r19BaseSource);
  gate(sha256(r14Source) === CS_R14_HE_SOURCE_SHA256, "R15_R14_ADAPTER_MISMATCH",
    `expected=${CS_R14_HE_SOURCE_SHA256}\nactual=${sha256(r14Source)}`);
  const expectedCandidateSource = buildCandidateSource(r14Source);
  if (sourceStage === "r15-molly") {
    gate(normalizedSource === expectedCandidateSource, "PRODUCTION_CANDIDATE_MISMATCH");
  }
  const candidateSource = sourceStage === "r15-molly" ? normalizedSource : expectedCandidateSource;
  const contractSource = readFileSync(CONTRACT_FILE, "utf8");
  const resultUiSource = readFileSync(RESULT_UI_FILE, "utf8");
  gate(!contractSource.includes("utilDmg"), "CS_MATCH_RESULT_CONTRACT_SCOPE_EXPANDED");
  gate(!resultUiSource.includes("utilDmg"), "CS_RESULT_UI_SCOPE_EXPANDED");
  gate(candidateSource.includes("// R15 functional baseline only; balance calibration requires a separate Sprint."),
    "FUNCTIONAL_BASELINE_LABEL_MISSING");
  gate(candidateSource.includes(MOLLY_CONSTANT_BLOCK), "MOLLY_FUNCTIONAL_CONSTANTS");
  gate(candidateSource.includes(UTIL_REPLACEMENT), "RAW_UTIL_DAMAGE_READ_CHAIN");
  gate(candidateSource.includes(MOLLY_PROCESSOR), "MOLLY_PROCESSOR_MISSING");
  gate(candidateSource.includes(MOLLY_SPAWN_BRANCH), "PLAYER_MOLLY_SPAWN_MISSING");
  gate(candidateSource.includes(KILLFEED_REPLACEMENT), "MOLLY_KILLFEED_SEMANTICS");

  const tempRoot = mkdtempSync(join(tmpdir(), "esmo-cs-molly-r15-"));
  let vite = null;
  let transformSeen = 0;
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
        name: "cs-molly-gameplay-r15-memory-transform",
        enforce: "pre",
        transform(code, id) {
          if (resolve(id.split("?")[0]).toLowerCase() !== FPS_FILE.toLowerCase()) return null;
          const query = id.split("?")[1] ?? "";
          const variant = query.includes("cs-r15=baseline") ? "baseline"
            : query.includes("cs-r15=candidate") ? "candidate" : null;
          if (!variant) return null;
          transformSeen += 1;
          gate(code === originalSource, "VITE_SOURCE_MISMATCH");
          return {
            code: instrumentSource(variant === "baseline" ? r14Source : candidateSource, variant),
            map: null,
          };
        },
      }],
    });

    const baselineModule = await vite.ssrLoadModule(`${FPS_MODULE_ID}?cs-r15=baseline`);
    const candidateModule = await vite.ssrLoadModule(`${FPS_MODULE_ID}?cs-r15=candidate`);
    gate(transformSeen === 2, "TRANSFORM_COUNT", String(transformSeen));
    const baselineApi = baselineModule.__CS_MOLLY_GAMEPLAY_R15_TEST_API__;
    const candidateApi = candidateModule.__CS_MOLLY_GAMEPLAY_R15_TEST_API__;
    for (const api of [baselineApi, candidateApi]) {
      gate(typeof api?.simulateFps === "function", "SIMULATOR_EXPORT_MISSING");
      gate(Array.isArray(api?.ROSTER), "ROSTER_EXPORT_MISSING");
      gate(api?.TACTICS_DB?.inferno, "TACTICS_EXPORT_MISSING");
    }

    const mapKey = "inferno";
    const tTactic = clonePlain(candidateApi.TACTICS_DB.inferno.t.find((item) => item.id === "t_aexec"));
    const ctTactic = clonePlain(candidateApi.TACTICS_DB.inferno.ct.find((item) => item.id === "c_std"));
    gate(tTactic?.id === "t_aexec" && ctTactic?.id === "c_std", "TACTIC_MISSING");
    deepFreeze(tTactic);
    deepFreeze(ctTactic);

    const records = [];
    for (const statCase of STAT_CASES) {
      const roster = treatmentRoster(candidateApi, statCase);
      const inputBefore = sha256(canonicalJson({ mapKey, tTactic, ctTactic, roster }));
      for (const seed of FIXED_SEEDS) {
        const scenario = { caseId: statCase.id, seed, mapKey, tTactic, ctTactic, roster };
        const candidate = seed === FIXED_SEEDS[0]
          ? runDeterministic(candidateApi, scenario, `matrix-candidate-${statCase.id}`,
            { phaseTrigger: "spawn" })
          : runOnce(candidateApi, scenario, { phaseTrigger: "spawn" });
        const firstMollyDamage = candidate.collector.damages
          .find((event) => event.source === "molly") ?? null;
        const baseline = runOnce(baselineApi, scenario, {
          phaseTrigger: "detonation",
          phaseStop: firstMollyDamage,
        });
        const lifecycle = validateLifecycle(candidate, scenario);
        const accounting = validateAccounting(candidate, scenario);
        const migration = validateCausalPair(baseline, candidate, scenario);
        records.push({
          caseId: statCase.id,
          seed,
          gameplayDigestV6: candidate.simDigest,
          rngCount: candidate.collector.rng.length,
          rngSha256: candidate.rngDigest,
          outcome: outcomeProjection(candidate.sim),
          lifecycle,
          accounting,
          migration,
        });
      }
      gate(inputBefore === sha256(canonicalJson({ mapKey, tTactic, ctTactic, roster })),
        "SIM_MUTATED_TREATMENT_INPUT", statCase.id);
    }
    gate(records.length === 256, "PAIRED_RUN_COUNT", String(records.length));

    const totals = records.reduce((sum, record) => {
      for (const key of ["throws", "detonations", "spawns", "playerZoneTicks", "tacticVisualZoneTicks"]) {
        sum[key] += record.lifecycle[key];
      }
      for (const key of ["damageEvents", "effectiveDamage", "kills", "assists", "overlapDamageEvents"]) {
        sum[key] += record.accounting[key];
      }
      return sum;
    }, {
      throws: 0, detonations: 0, spawns: 0, playerZoneTicks: 0, tacticVisualZoneTicks: 0,
      damageEvents: 0, effectiveDamage: 0, kills: 0, assists: 0, overlapDamageEvents: 0,
    });
    gate(totals.throws > 0 && totals.detonations > 0 && totals.spawns > 0,
      "ZERO_MOLLY_LIFECYCLE_COVERAGE");
    gate(totals.playerZoneTicks > 0 && totals.tacticVisualZoneTicks > 0,
      "ZERO_MOLLY_ZONE_TYPE_COVERAGE");
    gate(totals.damageEvents > 0 && totals.effectiveDamage > 0,
      "ZERO_MOLLY_DAMAGE_COVERAGE");
    gate(totals.kills > 0, "ZERO_MOLLY_KILL_COVERAGE");

    const noDetonationRuns = records.filter((record) => !record.migration.firstPlayerMollySpawn);
    const noDamageRuns = records.filter((record) => record.migration.firstPlayerMollySpawn
      && !record.migration.firstEffectiveMollyDamage);
    const damageRuns = records.filter((record) => record.migration.firstEffectiveMollyDamage);
    gate(noDetonationRuns.length > 0, "ZERO_NO_DETONATION_GATE_COVERAGE");
    gate(noDamageRuns.length > 0, "ZERO_DETONATION_WITHOUT_DAMAGE_GATE_COVERAGE");
    gate(damageRuns.length > 0, "ZERO_CAUSAL_DAMAGE_GATE_COVERAGE");
    gate(noDetonationRuns.every((record) => record.migration.fullExactWithoutDetonation),
      "NO_DETONATION_NOT_EXACT");
    gate(noDamageRuns.every((record) => record.migration.normalizedExactWithoutDamage),
      "NO_DAMAGE_NOT_NORMALIZED_EXACT");

    const mollySuiteSha256 = sha256(canonicalJson({
      schema: MOLLY_SCHEMA,
      functionalBaseline: {
        playerThrownOnly: true,
        tacticMollyGameplay: false,
        radius: EXPECTED_MOLLY_RADIUS,
        lifetimeTicks: EXPECTED_MOLLY_TL,
        tickSeconds: 2,
        damagePerTick: EXPECTED_MOLLY_DAMAGE,
        falloff: false,
        armorModifier: false,
        enemyOnly: true,
        wallBlocked: true,
        firstActiveTick: "next-existing-tick-after-detonation",
        overlap: "deterministic-additive-array-order",
        routeAvoidance: false,
        calibrated: false,
      },
      seedGenerationVersion: SEED_GENERATION_VERSION,
      seedSetSha256: EXPECTED_SEED_SET_SHA256,
      treatmentIds: STAT_CASES.map((item) => item.id),
      totals,
      records: records.map((record) => ({
        caseId: record.caseId,
        seed: record.seed,
        lifecycle: record.lifecycle,
        accounting: record.accounting,
        migration: record.migration,
      })),
    }));
    const gameplaySuiteV6Sha256 = sha256(canonicalJson({
      schema: DIGEST_SCHEMA_V6,
      seedGenerationVersion: SEED_GENERATION_VERSION,
      seedSetSha256: EXPECTED_SEED_SET_SHA256,
      treatmentIds: STAT_CASES.map((item) => item.id),
      records: records.map((record) => ({
        caseId: record.caseId,
        seed: record.seed,
        gameplayDigestV6: record.gameplayDigestV6,
        rngCount: record.rngCount,
        rngSha256: record.rngSha256,
        outcome: record.outcome,
        migration: record.migration,
      })),
    }));

    console.log(`sourceStage: ${sourceStage}`);
    console.log(`sourceSha256: ${sourceSha256}`);
    console.log(`candidateSourceSha256: ${sha256(candidateSource)}`);
    console.log(`static rand() call sites: ${EXPECTED_RAND_CALLS}->${randTokens(candidateSource).length}`);
    console.log(`functional baseline: R=${EXPECTED_MOLLY_RADIUS} tl=${EXPECTED_MOLLY_TL} damage=${EXPECTED_MOLLY_DAMAGE}/2s calibrated=false`);
    console.log(`matrix: ${STAT_CASES.length} treatments x ${FIXED_SEEDS.length} seeds = ${records.length} paired runs`);
    console.log(`coverage: ${canonicalJson(totals)}`);
    console.log(`causal migration: noDetonation=${noDetonationRuns.length} noDamage=${noDamageRuns.length} damage=${damageRuns.length}`);
    console.log(`${MOLLY_SCHEMA}: ${mollySuiteSha256}`);
    console.log(`${DIGEST_SCHEMA_V6}: ${gameplaySuiteV6Sha256}`);

    if (sourceStage === "r14-verifier-first") {
      throw new Error(`[PRODUCTION_MOLLY_NOT_INTEGRATED]\nR15_SOURCE=${sha256(candidateSource)}\n${MOLLY_SCHEMA}=${mollySuiteSha256}\n${DIGEST_SCHEMA_V6}=${gameplaySuiteV6Sha256}`);
    }
    gate(EXPECTED_MOLLY_SUITE_SHA256 !== "__LOCK_AFTER_REVIEW__"
      && EXPECTED_GAMEPLAY_SUITE_V6_SHA256 !== "__LOCK_AFTER_REVIEW__", "R15_BASELINE_NOT_LOCKED",
    `${MOLLY_SCHEMA}=${mollySuiteSha256}\n${DIGEST_SCHEMA_V6}=${gameplaySuiteV6Sha256}`);
    gate(mollySuiteSha256 === EXPECTED_MOLLY_SUITE_SHA256, "MOLLY_SUITE_HASH_MISMATCH",
      `expected=${EXPECTED_MOLLY_SUITE_SHA256}\nactual=${mollySuiteSha256}`);
    gate(gameplaySuiteV6Sha256 === EXPECTED_GAMEPLAY_SUITE_V6_SHA256,
      "GAMEPLAY_SUITE_V6_HASH_MISMATCH",
      `expected=${EXPECTED_GAMEPLAY_SUITE_V6_SHA256}\nactual=${gameplaySuiteV6Sha256}`);
    console.log("CS Molly Gameplay R15: PASS");
  } finally {
    if (vite) await vite.close();
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
