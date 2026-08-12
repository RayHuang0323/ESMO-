#!/usr/bin/env node
// CS Player Smoke LOS Gameplay Integration R13
//
// Runs the byte-exact R12 source and the one-line R13 player-smoke integration
// in memory. Player smoke may change gameplay only at the first LOS candidate
// it marginally blocks. Before that boundary, and for every run without one,
// all state other than the new player-smoke frame entries must stay exact.

import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import {
  CS_R12_SOURCE_SHA256,
  CS_R12_LF_SHA256,
  CS_R13_PLAYER_SMOKE_SOURCE_SHA256,
  CS_R13_PLAYER_SMOKE_LF_SHA256,
  R13_PLAYER_SMOKE_LINE,
  csR13R12Source,
} from "./cs_r13_legacy_source.mjs";
import {
  CS_R14_HE_SOURCE_SHA256,
  CS_R15_MOLLY_SOURCE_SHA256,
  CS_R19_SEMANTIC_SOURCE_SHA256,
  CS_R25_ACCURACY_SOURCE_SHA256,
  csR14R13Source,
  csR19R15Source,
  csR25R24Source,
  csR15R14Source,
  normalizeCsSource,
} from "./cs_r15_legacy_source.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FPS_FILE = resolve(ROOT, "src/battle/fps/EsportsFPS3D.jsx");
const FPS_MODULE_ID = "/src/battle/fps/EsportsFPS3D.jsx";

const LOS_SCHEMA = "CsPlayerSmokeLOS.v1";
const DIGEST_SCHEMA_V4 = "CsGameplayDigest.v4";
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
const EXPECTED_SMOKE_RADIUS = 6;
const EXPECTED_SMOKE_TICKS = 18;

// There is deliberately no capture/update CLI. The first inspected run prints
// these candidates and fails until both literals are reviewed and locked.
const EXPECTED_LOS_SUITE_SHA256 = "effe21748fe9e4a31d293332aa0c7f65b2c62a0bcbc653c60167ac9087831d67";
const EXPECTED_GAMEPLAY_SUITE_V4_SHA256 = "01ef345a70a3c3ae274b65c54cc19a68b80907fb2fd81495ff7855096d8d2289";

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
const SIGNATURE_REPLACEMENT = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster,__measure=null){";
const RNG_MARKER = "const map=MAPS[mapKey];const rand=mkRng(seed);";
const RNG_REPLACEMENT = "const map=MAPS[mapKey];const __r13RawRand=mkRng(seed);let __r13RngCount=0;const rand=()=>{const value=__r13RawRand();__r13RngCount++;__measure?.recordRng(__r13RngCount,value);return value;};";
const THROW_MARKER = "          throwables.push({id:`nd${fi}${p.id}`,type:nt,side:p.side,from:{...p.pos},to:land,t:0,flying:true,detonate:false});";
const THROW_REPLACEMENT = `${THROW_MARKER}
          if(nt==="smoke")__measure?.recordSmokeThrow({round:rnd+1,sec,throwableId:\`nd\${fi}\${p.id}\`,throwerId:p.id,throwerSide:p.side,from:{...p.pos},to:{...land}});`;
const TACTIC_SMOKE_MARKER = "      if(sec===18)(tacticT.smokes||[]).forEach(sk=>{const n=N[sk];if(n)smokes.push({id:`s${rnd}${sk}`,pos:{...n},tl:18,age:0});});";
const SMOKE_TICK_MARKER = "      if(prog>0.15&&aliveT.length&&aliveCT.length){";
const SMOKE_TICK_REPLACEMENT = `      __measure?.recordSmokeTick({round:rnd+1,sec,smokes:smokes.map(__s=>({id:__s.id,pos:{...__s.pos},tl:__s.tl,age:__s.age||0}))});
${SMOKE_TICK_MARKER}`;
const PAIR_MARKER = "        let pairs=[];aliveT.forEach(tp=>aliveCT.forEach(cp=>{const d=dist(tp.pos,cp.pos);if(d<55&&!lineBlocked(tp.pos,cp.pos,walls)&&!smokeBlocks(tp.pos,cp.pos,smokes))pairs.push([tp,cp,d]);}));";
const PAIR_REPLACEMENT = "        let pairs=[];aliveT.forEach(tp=>aliveCT.forEach(cp=>{const d=dist(tp.pos,cp.pos);if(d<55){const __r13WallClear=!lineBlocked(tp.pos,cp.pos,walls);if(__r13WallClear){const __r13SmokeBlocked=smokeBlocks(tp.pos,cp.pos,smokes);__measure?.recordLosCandidate({round:rnd+1,sec,tId:tp.id,cId:cp.id,tPos:{...tp.pos},cPos:{...cp.pos},distance:d,productionSmokeBlocked:__r13SmokeBlocked,rngCount:__r13RngCount,smokes:smokes.map(__s=>({id:__s.id,pos:{...__s.pos},tl:__s.tl,age:__s.age||0}))});if(!__r13SmokeBlocked)pairs.push([tp,cp,d]);}}}));";
const FLASH_DETONATION_MARKER = '        if(tw.type==="flash"){ps.forEach(pl=>{if(pl.dead)return;const d=dist(pl.pos,tw.to);if(d<24&&!lineBlocked(pl.pos,tw.to,walls)){const enemy=pl.side!==tw.side;pl.flash=Math.max(pl.flash,enemy?(d<12?6:4):(d<8?3:0));}});}';
const DETONATION_HOOK = '        if(tw.type==="smoke")__measure?.recordSmokeDetonation({round:rnd+1,sec,throwableId:tw.id,side:tw.side,to:{...tw.to}});';
const SPAWN_HOOK = '        if(tw.type==="smoke"){const __r13Smoke=smokes[smokes.length-1];__measure?.recordSmokeSpawn({round:rnd+1,sec,throwableId:tw.id,smokeId:__r13Smoke.id,pos:{...__r13Smoke.pos},tl:__r13Smoke.tl,age:__r13Smoke.age});}';
const AGING_MARKER = "      smokes=smokes.map(s=>({...s,tl:s.tl-1,age:(s.age||0)+1})).filter(s=>s.tl>0);";
const ROUND_END_MARKER = [
  "      if(!roundEnd){",
  '        if(aliveT.length===0&&!planted)roundEnd={winner:"ct",how:"elim"};',
  '        else if(aliveCT.length===0)roundEnd={winner:"t",how:"elim"};',
  '        else if(sec>=114)roundEnd={winner:planted?"t":"ct",how:"time"};',
  "      }",
].join("\n");
const ROUND_END_REPLACEMENT = `${ROUND_END_MARKER}
      if(roundEnd)__measure?.recordRoundEnd({round:rnd+1,sec,winner:roundEnd.winner,how:roundEnd.how,rngCount:__r13RngCount});`;
const FRAME_SMOKE_MARKER = "        smokes:smokes.map(s=>({...s})),mollys:mollys.map(m=>({...m})),tracers:tracers.map(t=>({...t})),muzzles:muzzles.map(m=>({...m})),";
const FRAME_END_MARKER = "      fi++;if(roundEnd)break;";
const FRAME_END_REPLACEMENT = `      __measure?.recordFrame(frames[frames.length-1]);
${FRAME_END_MARKER}`;
const RENDERER_SMOKE_MARKER = "   (frame.smokes||[]).forEach(s=>{";
const RETURN_MARKER = "return { EsportsFPS3D, buildMatchResult };";
const RETURN_REPLACEMENT = "return { EsportsFPS3D, buildMatchResult, simulateFps, ROSTER, TACTICS_DB };";
const EXPORT_MARKER = "export { EsportsFPS3D, buildMatchResult };";
const EXPORT_REPLACEMENT = `const __CS_PLAYER_SMOKE_LOS_R13_TEST_API__ = Object.freeze({
  simulateFps: __FPS3D_MODULE.simulateFps,
  ROSTER: __FPS3D_MODULE.ROSTER,
  TACTICS_DB: __FPS3D_MODULE.TACTICS_DB,
});
export { EsportsFPS3D, buildMatchResult, __CS_PLAYER_SMOKE_LOS_R13_TEST_API__ };`;

function gate(ok, code, detail = "") {
  if (!ok) throw new Error(`[${code}]${detail ? `\n${detail}` : ""}`);
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function occurrences(text, needle) {
  return text.split(needle).length - 1;
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
    return value.map((item, index) => canonicalValue(item, { gameplay, rejectUndefined }, `${key}[${index}]`));
  }
  const out = {};
  for (const childKey of Object.keys(value).sort()) {
    const normalized = canonicalValue(value[childKey], { gameplay, rejectUndefined }, childKey);
    if (typeof normalized !== "undefined") out[childKey] = normalized;
  }
  return out;
}

function canonicalJson(value, options = {}) {
  return JSON.stringify(canonicalValue(value, options));
}

function firstDifference(left, right, path = "") {
  if (Object.is(left, right)) return null;
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return { path, baseline: left.length, candidate: right.length };
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

function randTokens(source) {
  return source.match(/\brand\s*\(\s*\)/g) ?? [];
}

function transformSource(source, variant) {
  let transformed = source.replace(/\r\n/g, "\n");
  const commonMarkers = [
    SIGNATURE_MARKER, RNG_MARKER, THROW_MARKER, TACTIC_SMOKE_MARKER,
    SMOKE_TICK_MARKER, PAIR_MARKER, FLASH_DETONATION_MARKER, AGING_MARKER,
    ROUND_END_MARKER, FRAME_SMOKE_MARKER, RENDERER_SMOKE_MARKER,
    FRAME_END_MARKER, RETURN_MARKER, EXPORT_MARKER,
  ];
  for (const marker of commonMarkers) {
    gate(occurrences(transformed, marker) === 1, "TRANSFORM_MARKER_COUNT",
      `variant=${variant} marker=${marker.slice(0, 120)}`);
  }
  const smokeBranchCount = occurrences(transformed, R13_PLAYER_SMOKE_LINE);
  gate(smokeBranchCount === (variant === "candidate" ? 1 : 0), "TRANSFORM_SMOKE_STAGE",
    `variant=${variant} branchCount=${smokeBranchCount}`);
  transformed = transformed
    .replace(SIGNATURE_MARKER, SIGNATURE_REPLACEMENT)
    .replace(RNG_MARKER, RNG_REPLACEMENT)
    .replace(THROW_MARKER, THROW_REPLACEMENT)
    .replace(SMOKE_TICK_MARKER, SMOKE_TICK_REPLACEMENT)
    .replace(PAIR_MARKER, PAIR_REPLACEMENT)
    .replace(FLASH_DETONATION_MARKER, `${FLASH_DETONATION_MARKER}\n${DETONATION_HOOK}`)
    .replace(ROUND_END_MARKER, ROUND_END_REPLACEMENT)
    .replace(FRAME_END_MARKER, FRAME_END_REPLACEMENT)
    .replace(RETURN_MARKER, RETURN_REPLACEMENT)
    .replace(EXPORT_MARKER, EXPORT_REPLACEMENT);
  if (variant === "candidate") {
    transformed = transformed.replace(R13_PLAYER_SMOKE_LINE, `${R13_PLAYER_SMOKE_LINE}\n${SPAWN_HOOK}`);
  }
  gate(randTokens(transformed).length === EXPECTED_RAND_CALLS, "TRANSFORM_RAND_COUNT",
    `variant=${variant} expected=${EXPECTED_RAND_CALLS} actual=${randTokens(transformed).length}`);
  return transformed;
}

function createCollector() {
  const rng = [];
  const throws = [];
  const detonations = [];
  const spawns = [];
  const smokeTicks = [];
  const losCandidates = [];
  const roundEnds = [];
  const frames = [];
  function record(target, event) {
    canonicalJson(event, { gameplay: true, rejectUndefined: true });
    target.push(structuredClone(event));
  }
  return {
    rng,
    throws,
    detonations,
    spawns,
    smokeTicks,
    losCandidates,
    roundEnds,
    frames,
    recordRng(index, value) { record(rng, { index, value }); },
    recordSmokeThrow(event) { record(throws, event); },
    recordSmokeDetonation(event) { record(detonations, event); },
    recordSmokeSpawn(event) { record(spawns, event); },
    recordSmokeTick(event) { record(smokeTicks, event); },
    recordLosCandidate(event) { record(losCandidates, event); },
    recordRoundEnd(event) { record(roundEnds, event); },
    recordFrame(event) { record(frames, event); },
  };
}

function collectorProjection(collector) {
  return {
    rng: collector.rng,
    throws: collector.throws,
    detonations: collector.detonations,
    spawns: collector.spawns,
    smokeTicks: collector.smokeTicks,
    losCandidates: collector.losCandidates,
    roundEnds: collector.roundEnds,
    frames: collector.frames,
  };
}

function runOnce(api, scenario) {
  const collector = createCollector();
  const sim = api.simulateFps(
    scenario.mapKey, scenario.tTactic, scenario.ctTactic,
    scenario.seed, scenario.roster, collector,
  );
  const simJson = canonicalJson(sim, { gameplay: true, rejectUndefined: true });
  const rngJson = canonicalJson(collector.rng, { gameplay: true, rejectUndefined: true });
  return {
    sim,
    collector,
    simDigest: sha256(simJson),
    rngDigest: sha256(rngJson),
    simJson,
    rngJson,
  };
}

function runDeterministic(api, scenario, label) {
  const first = runOnce(api, scenario);
  const second = runOnce(api, scenario);
  gate(first.simJson === second.simJson, "SIM_NON_DETERMINISTIC",
    `${label} case=${scenario.caseId ?? "neutral"} seed=${scenario.seed}`);
  gate(first.rngJson === second.rngJson, "RNG_NON_DETERMINISTIC",
    `${label} case=${scenario.caseId ?? "neutral"} seed=${scenario.seed}`);
  gate(canonicalJson(collectorProjection(first.collector), { gameplay: true, rejectUndefined: true })
    === canonicalJson(collectorProjection(second.collector), { gameplay: true, rejectUndefined: true }),
  "INSTRUMENTATION_NON_DETERMINISTIC",
  `${label} case=${scenario.caseId ?? "neutral"} seed=${scenario.seed}`);
  return first;
}

function segmentPointDistance(a, b, p) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < 1e-6) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

function smokeKey(round, smokeId) {
  return `${round}|${smokeId}`;
}

function eventKey(event) {
  return `${event.round}|${event.sec}|${event.tId}|${event.cId}`;
}

function blockingSmokes(event) {
  const blockers = event.smokes.filter((smoke) => smoke.tl > 0
    && segmentPointDistance(event.tPos, event.cPos, smoke.pos) < EXPECTED_SMOKE_RADIUS);
  gate(event.productionSmokeBlocked === (blockers.length > 0), "SMOKE_BLOCK_RECONSTRUCTION",
    canonicalJson({ key: eventKey(event), production: event.productionSmokeBlocked, blockers }, { gameplay: true }));
  return blockers;
}

function buildEpisodes(opportunities) {
  const open = new Map();
  const episodes = [];
  for (const opportunity of opportunities) {
    const pair = `${opportunity.tId}|${opportunity.cId}`;
    const previous = open.get(pair);
    if (previous && previous.round === opportunity.round && previous.endSec + 2 === opportunity.sec) {
      previous.endSec = opportunity.sec;
      previous.ticks += 1;
      for (const id of opportunity.playerSmokeIds) previous.playerSmokeIds.add(id);
      for (const id of opportunity.throwerIds) previous.throwerIds.add(id);
      continue;
    }
    if (previous) episodes.push(previous);
    open.set(pair, {
      round: opportunity.round,
      tId: opportunity.tId,
      cId: opportunity.cId,
      startSec: opportunity.sec,
      endSec: opportunity.sec,
      ticks: 1,
      playerSmokeIds: new Set(opportunity.playerSmokeIds),
      throwerIds: new Set(opportunity.throwerIds),
    });
  }
  episodes.push(...open.values());
  return episodes
    .sort((a, b) => a.round - b.round || a.startSec - b.startSec
      || a.tId.localeCompare(b.tId) || a.cId.localeCompare(b.cId))
    .map((episode) => ({
      ...episode,
      playerSmokeIds: [...episode.playerSmokeIds].sort(),
      throwerIds: [...episode.throwerIds].sort(),
    }));
}

function buildAttribution(run, scenario) {
  const { collector, sim } = run;
  const throwById = new Map();
  for (const event of collector.throws) {
    const key = `${event.round}|${event.throwableId}`;
    gate(!throwById.has(key), "DUPLICATE_SMOKE_THROW", key);
    throwById.set(key, event);
  }
  const detonationById = new Map();
  for (const event of collector.detonations) {
    const key = `${event.round}|${event.throwableId}`;
    gate(!detonationById.has(key), "DUPLICATE_SMOKE_DETONATION", key);
    detonationById.set(key, event);
    gate(throwById.has(key), "DETONATION_WITHOUT_THROW", key);
  }
  const spawnBySmoke = new Map();
  for (const spawn of collector.spawns) {
    const key = smokeKey(spawn.round, spawn.smokeId);
    gate(!spawnBySmoke.has(key), "DUPLICATE_PLAYER_SMOKE", key);
    gate(spawn.smokeId === `s${spawn.throwableId}`, "PLAYER_SMOKE_IDENTITY", canonicalJson(spawn));
    gate(spawn.tl === EXPECTED_SMOKE_TICKS && spawn.age === 0, "PLAYER_SMOKE_INITIAL_STATE",
      canonicalJson(spawn));
    gate(throwById.has(`${spawn.round}|${spawn.throwableId}`), "SPAWN_WITHOUT_THROW", key);
    gate(detonationById.has(`${spawn.round}|${spawn.throwableId}`), "SPAWN_WITHOUT_DETONATION", key);
    spawnBySmoke.set(key, spawn);
    const frame = sim.frames.find((item) => item.rnd + 1 === spawn.round && item.roundSec === spawn.sec);
    const frameSmoke = frame?.smokes?.find((smoke) => smoke.id === spawn.smokeId);
    gate(frameSmoke?.tl === EXPECTED_SMOKE_TICKS && frameSmoke?.age === 0, "SPAWN_FRAME_READ_CHAIN", key);
  }

  const opportunities = [];
  collector.losCandidates.forEach((event, eventIndex) => {
    const blockers = blockingSmokes(event);
    const playerBlockers = blockers.filter((smoke) => spawnBySmoke.has(smokeKey(event.round, smoke.id)));
    const tacticBlockers = blockers.filter((smoke) => !spawnBySmoke.has(smokeKey(event.round, smoke.id)));
    if (playerBlockers.length === 0 || tacticBlockers.length > 0) return;
    const spawns = playerBlockers.map((smoke) => spawnBySmoke.get(smokeKey(event.round, smoke.id)));
    const throwEvents = spawns.map((spawn) => throwById.get(`${spawn.round}|${spawn.throwableId}`));
    opportunities.push({
      eventIndex,
      round: event.round,
      sec: event.sec,
      tId: event.tId,
      cId: event.cId,
      distance: event.distance,
      rngCount: event.rngCount,
      playerSmokeIds: [...new Set(playerBlockers.map((smoke) => smoke.id))].sort(),
      throwableIds: [...new Set(spawns.map((spawn) => spawn.throwableId))].sort(),
      throwerIds: [...new Set(throwEvents.map((eventItem) => eventItem.throwerId))].sort(),
    });
  });

  const roundEndByRound = new Map(collector.roundEnds.map((event) => [event.round, event]));
  const lifetimes = collector.spawns.map((spawn) => {
    const active = collector.smokeTicks
      .filter((tick) => tick.round === spawn.round && tick.smokes.some((smoke) => smoke.id === spawn.smokeId))
      .map((tick) => ({ sec: tick.sec, smoke: tick.smokes.find((smoke) => smoke.id === spawn.smokeId) }));
    gate(active.length <= EXPECTED_SMOKE_TICKS, "SMOKE_LIFETIME_EXCEEDED",
      `${spawn.smokeId} ticks=${active.length}`);
    active.forEach(({ sec, smoke }, index) => {
      gate(sec === spawn.sec + (index + 1) * 2, "SMOKE_TICK_CONTINUITY",
        `${spawn.smokeId} index=${index} sec=${sec}`);
      gate(smoke.tl === EXPECTED_SMOKE_TICKS - index && smoke.age === index,
        "SMOKE_AGING_IDENTITY", canonicalJson({ spawn, sec, smoke, index }));
      gate(canonicalJson(smoke.pos, { gameplay: true }) === canonicalJson(spawn.pos, { gameplay: true }),
        "SMOKE_POSITION_DRIFT", spawn.smokeId);
    });
    const roundEnd = roundEndByRound.get(spawn.round);
    const termination = active.length === EXPECTED_SMOKE_TICKS ? "expired" : "round-end";
    if (termination === "round-end") {
      gate(roundEnd && roundEnd.sec < spawn.sec + EXPECTED_SMOKE_TICKS * 2,
        "TRUNCATED_SMOKE_WITHOUT_ROUND_END", canonicalJson({ spawn, activeTicks: active.length, roundEnd }));
    }
    return {
      round: spawn.round,
      throwableId: spawn.throwableId,
      smokeId: spawn.smokeId,
      spawnSec: spawn.sec,
      configuredTicks: EXPECTED_SMOKE_TICKS,
      activeTicks: active.length,
      termination,
    };
  });

  const document = {
    schema: LOS_SCHEMA,
    scenario: {
      seed: scenario.seed,
      mapKey: scenario.mapKey,
      tTacticId: scenario.tTactic.id,
      ctTacticId: scenario.ctTactic.id,
    },
    throws: collector.throws,
    detonations: collector.detonations,
    spawns: collector.spawns,
    blockedOpportunities: opportunities.map(({ eventIndex, ...event }) => event),
    blockedEpisodes: buildEpisodes(opportunities),
    lifetimes,
  };
  return {
    document,
    spawnBySmoke,
    playerSmokeIds: new Set(collector.spawns.map((spawn) => spawn.smokeId)),
    opportunities,
    episodes: document.blockedEpisodes,
    lifetimes,
  };
}

function smokeNeutralSimProjection(sim, playerSmokeIds) {
  return {
    ...sim,
    frames: sim.frames.map((frame) => ({
      ...frame,
      smokes: frame.smokes.filter((smoke) => !playerSmokeIds.has(smoke.id)),
    })),
  };
}

function outcomeProjection(sim) {
  return {
    tScore: sim.tScore,
    ctScore: sim.ctScore,
    rounds: sim.rounds,
    roundHist: sim.roundHist,
    players: sim.players,
    mvp: sim.mvp,
  };
}

function beforeTick(event, boundary) {
  return event.round < boundary.round || (event.round === boundary.round && event.sec < boundary.sec);
}

function throughTick(event, boundary) {
  return event.round < boundary.round || (event.round === boundary.round && event.sec <= boundary.sec);
}

function normalizedLosPrefix(collector, attribution, boundary) {
  return collector.losCandidates.filter((event) => throughTick(event, boundary)).map((event) => {
    const tacticSmokes = event.smokes.filter((smoke) => !attribution.playerSmokeIds.has(smoke.id));
    const tacticBlocked = tacticSmokes.some((smoke) => smoke.tl > 0
      && segmentPointDistance(event.tPos, event.cPos, smoke.pos) < EXPECTED_SMOKE_RADIUS);
    return {
      ...event,
      productionSmokeBlocked: tacticBlocked,
      smokes: tacticSmokes,
    };
  });
}

function preBoundarySimProjection(run, playerSmokeIds, boundary) {
  const frames = run.collector.frames;
  const boundaryIndex = frames.findIndex((frame) => frame.rnd + 1 === boundary.round
    && frame.roundSec === boundary.sec);
  gate(boundaryIndex >= 0, "BOUNDARY_FRAME_MISSING", canonicalJson(boundary));
  const boundaryFi = frames[boundaryIndex].fi;
  return {
    boundaryIndex,
    projection: {
      frames: frames.slice(0, boundaryIndex).map((frame) => ({
        ...frame,
        smokes: frame.smokes.filter((smoke) => !playerSmokeIds.has(smoke.id)),
      })),
      highlights: run.sim.highlights.filter((highlight) => highlight.fi < boundaryFi),
      roundHist: run.sim.roundHist.slice(0, boundary.round - 1),
    },
  };
}

function prefixEvents(events, boundary) {
  return events.filter((event) => beforeTick(event, boundary));
}

function validateCausalPair(baseline, candidate, scenario) {
  const baselineAttribution = buildAttribution(baseline, scenario);
  const candidateAttribution = buildAttribution(candidate, scenario);
  gate(baseline.collector.spawns.length === 0, "R12_BASELINE_SPAWNED_PLAYER_SMOKE",
    `case=${scenario.caseId ?? "neutral"} seed=${scenario.seed}`);
  const firstBlock = candidateAttribution.opportunities[0] ?? null;
  const label = `case=${scenario.caseId ?? "neutral"} seed=${scenario.seed}`;
  const baselineLosByKey = new Map(baseline.collector.losCandidates.map((event) => [eventKey(event), event]));
  const firstPairedBlockEvent = candidate.collector.losCandidates.find((event) => {
    const baselineEvent = baselineLosByKey.get(eventKey(event));
    return baselineEvent && !baselineEvent.productionSmokeBlocked && event.productionSmokeBlocked;
  }) ?? null;
  gate((firstBlock ? eventKey(firstBlock) : null) === (firstPairedBlockEvent ? eventKey(firstPairedBlockEvent) : null),
    "BLOCKED_OPPORTUNITY_CLASSIFICATION",
    `${label}\nattribution=${canonicalJson(firstBlock)}\npaired=${canonicalJson(firstPairedBlockEvent)}\nblockers=${canonicalJson(firstPairedBlockEvent ? blockingSmokes(firstPairedBlockEvent) : [])}`);

  if (!firstBlock) {
    const baselineJson = canonicalJson(
      smokeNeutralSimProjection(baseline.sim, baselineAttribution.playerSmokeIds),
      { gameplay: true, rejectUndefined: true },
    );
    const candidateJson = canonicalJson(
      smokeNeutralSimProjection(candidate.sim, candidateAttribution.playerSmokeIds),
      { gameplay: true, rejectUndefined: true },
    );
    gate(baselineJson === candidateJson, "ZERO_BLOCK_NON_SMOKE_TRAJECTORY_DIFF", label);
    gate(baseline.rngJson === candidate.rngJson, "ZERO_BLOCK_RNG_DIFF", label);
    gate(canonicalJson(baseline.collector.throws, { gameplay: true })
      === canonicalJson(candidate.collector.throws, { gameplay: true }),
    "ZERO_BLOCK_THROW_DIFF", label);
    gate(canonicalJson(baseline.collector.detonations, { gameplay: true })
      === canonicalJson(candidate.collector.detonations, { gameplay: true }),
    "ZERO_BLOCK_DETONATION_DIFF", label);
  } else {
    const candidateEvent = candidate.collector.losCandidates[firstBlock.eventIndex];
    const baselineEvent = baseline.collector.losCandidates.find((event) => eventKey(event) === eventKey(candidateEvent));
    gate(Boolean(baselineEvent), "BASELINE_BOUNDARY_CANDIDATE_MISSING", `${label} key=${eventKey(candidateEvent)}`);
    gate(!baselineEvent.productionSmokeBlocked, "BASELINE_BOUNDARY_ALREADY_BLOCKED",
      `${label} key=${eventKey(candidateEvent)}`);
    gate(candidateEvent.productionSmokeBlocked, "CANDIDATE_BOUNDARY_NOT_BLOCKED",
      `${label} key=${eventKey(candidateEvent)}`);
    gate(candidateEvent.rngCount === baselineEvent.rngCount, "BOUNDARY_RNG_COUNT_DRIFT",
      `${label} baseline=${baselineEvent.rngCount} candidate=${candidateEvent.rngCount}`);

    const baselinePrefix = preBoundarySimProjection(
      baseline, baselineAttribution.playerSmokeIds, firstBlock,
    );
    const candidatePrefix = preBoundarySimProjection(
      candidate, candidateAttribution.playerSmokeIds, firstBlock,
    );
    gate(baselinePrefix.boundaryIndex === candidatePrefix.boundaryIndex, "BOUNDARY_FRAME_INDEX_DRIFT", label);
    const baselineProjectionJson = canonicalJson(
      baselinePrefix.projection, { gameplay: true, rejectUndefined: true },
    );
    const candidateProjectionJson = canonicalJson(
      candidatePrefix.projection, { gameplay: true, rejectUndefined: true },
    );
    gate(baselineProjectionJson === candidateProjectionJson,
      "PRE_BOUNDARY_NON_SMOKE_TRAJECTORY_DIFF",
      `${label}\nboundary=${canonicalJson(firstBlock)}\n${canonicalJson(firstDifference(
        JSON.parse(baselineProjectionJson), JSON.parse(candidateProjectionJson),
      ))}`);

    const boundaryRngCount = firstBlock.rngCount;
    gate(canonicalJson(baseline.collector.rng.slice(0, boundaryRngCount), { gameplay: true })
      === canonicalJson(candidate.collector.rng.slice(0, boundaryRngCount), { gameplay: true }),
    "PRE_BOUNDARY_RNG_DIFF", label);
    gate(canonicalJson(normalizedLosPrefix(baseline.collector, baselineAttribution, firstBlock),
      { gameplay: true, rejectUndefined: true })
      === canonicalJson(normalizedLosPrefix(candidate.collector, candidateAttribution, firstBlock),
        { gameplay: true, rejectUndefined: true }),
    "PRE_BOUNDARY_LOS_STATE_DIFF", label);
    gate(canonicalJson(prefixEvents(baseline.collector.throws, firstBlock), { gameplay: true })
      === canonicalJson(prefixEvents(candidate.collector.throws, firstBlock), { gameplay: true }),
    "PRE_BOUNDARY_THROW_DIFF", label);
    gate(canonicalJson(prefixEvents(baseline.collector.detonations, firstBlock), { gameplay: true })
      === canonicalJson(prefixEvents(candidate.collector.detonations, firstBlock), { gameplay: true }),
    "PRE_BOUNDARY_DETONATION_DIFF", label);
  }

  return {
    attribution: candidateAttribution,
    migration: {
      firstPlayerSmokeBlock: firstBlock ? {
        round: firstBlock.round,
        sec: firstBlock.sec,
        tId: firstBlock.tId,
        cId: firstBlock.cId,
        rngCount: firstBlock.rngCount,
        playerSmokeIds: firstBlock.playerSmokeIds,
        throwableIds: firstBlock.throwableIds,
        throwerIds: firstBlock.throwerIds,
      } : null,
      blockedOpportunities: candidateAttribution.opportunities.length,
      blockedEpisodes: candidateAttribution.episodes.length,
      baselineGameplayDigest: baseline.simDigest,
      baselineRngCount: baseline.collector.rng.length,
      baselineRngDigest: baseline.rngDigest,
      candidateGameplayDigest: candidate.simDigest,
      candidateRngCount: candidate.collector.rng.length,
      candidateRngDigest: candidate.rngDigest,
      zeroDiffWithoutBlock: firstBlock === null,
    },
  };
}

function treatmentRoster(api, statCase) {
  const roster = clonePlain(api.ROSTER);
  const target = roster.find((player) => player.id === statCase.targetId);
  gate(target?.stats?.[statCase.shortKey] === statCase.before, "TREATMENT_BEFORE_MISMATCH", statCase.id);
  target.stats[statCase.shortKey] = statCase.after;
  deepFreeze(roster);
  return roster;
}

async function main() {
  gate(process.argv.slice(2).length === 0, "CLI_FLAGS_FORBIDDEN",
    "R13 has no capture, update, rebaseline, seed, treatment, or calibration flags.");
  gate(STAT_CASES.length === 16, "TREATMENT_MATRIX_SIZE", String(STAT_CASES.length));
  gate(canonicalJson(generatedSeeds()) === canonicalJson(FIXED_SEEDS), "SEED_GENERATION_MISMATCH");
  gate(sha256(canonicalJson(FIXED_SEEDS)) === EXPECTED_SEED_SET_SHA256, "SEED_SET_HASH_MISMATCH");

  const originalSource = readFileSync(FPS_FILE, "utf8");
  const normalizedSource = normalizeCsSource(originalSource);
  const liveSourceSha256 = sha256(normalizedSource);
  const sourceStage = liveSourceSha256 === CS_R25_ACCURACY_SOURCE_SHA256 ? "r25-accuracy-correction"
    : liveSourceSha256 === CS_R19_SEMANTIC_SOURCE_SHA256 ? "r19-semantic-correction"
    : liveSourceSha256 === CS_R15_MOLLY_SOURCE_SHA256 ? "r15-molly"
    : liveSourceSha256 === CS_R14_HE_SOURCE_SHA256 ? "r14-he"
    : liveSourceSha256 === CS_R13_PLAYER_SMOKE_LF_SHA256 ? "r13-player-smoke" : null;
  gate(sourceStage, "SOURCE_PROVENANCE_MISMATCH",
    `expected R13 LF=${CS_R13_PLAYER_SMOKE_LF_SHA256}\nexpected R14=${CS_R14_HE_SOURCE_SHA256}\nexpected R15=${CS_R15_MOLLY_SOURCE_SHA256}\nexpected R19=${CS_R19_SEMANTIC_SOURCE_SHA256}\nexpected R25=${CS_R25_ACCURACY_SOURCE_SHA256}\nactual=${liveSourceSha256}`);
  const r24BaseSource = sourceStage === "r25-accuracy-correction" ? csR25R24Source(normalizedSource) : normalizedSource;
  const r19BaseSource = sourceStage === "r19-semantic-correction" || sourceStage === "r25-accuracy-correction" ? csR19R15Source(r24BaseSource) : r24BaseSource;
  const r14Source = sourceStage === "r15-molly" || sourceStage === "r19-semantic-correction" || sourceStage === "r25-accuracy-correction" ? csR15R14Source(r19BaseSource) : normalizedSource;
  const r13Source = sourceStage === "r13-player-smoke" ? normalizedSource : csR14R13Source(r14Source);
  const sourceSha256 = sha256(r13Source);
  gate(randTokens(originalSource).length === EXPECTED_RAND_CALLS, "RAND_CALL_COUNT",
    `expected=${EXPECTED_RAND_CALLS} actual=${randTokens(originalSource).length}`);
  gate(occurrences(r13Source, R13_PLAYER_SMOKE_LINE) === 1, "PLAYER_SMOKE_GAMEPLAY_BRANCH_COUNT",
    `expected=1 actual=${occurrences(r13Source, R13_PLAYER_SMOKE_LINE)}`);
  gate(sourceSha256 === CS_R13_PLAYER_SMOKE_LF_SHA256, "R14_R13_ADAPTER_MISMATCH",
    `expected=${CS_R13_PLAYER_SMOKE_LF_SHA256}\nactual=${sourceSha256}`);
  const baselineSource = csR13R12Source(r13Source);
  gate(sha256(baselineSource) === CS_R12_LF_SHA256, "R13_R12_ADAPTER_MISMATCH",
    `expected=${CS_R12_LF_SHA256}\nactual=${sha256(baselineSource)}`);
  gate(occurrences(baselineSource, R13_PLAYER_SMOKE_LINE) === 0, "R12_ADAPTER_BRANCH_REMAINS");
  gate(randTokens(baselineSource).length === EXPECTED_RAND_CALLS, "R12_ADAPTER_RAND_COUNT");

  gate(occurrences(r13Source, "const SMOKE_R=6;") === 1, "SMOKE_RADIUS_PROVENANCE");
  gate(occurrences(r13Source, TACTIC_SMOKE_MARKER) === 1, "TACTIC_SMOKE_PATH_PROVENANCE");
  gate(occurrences(r13Source, AGING_MARKER) === 1, "SMOKE_AGING_PROVENANCE");
  gate(occurrences(r13Source, FRAME_SMOKE_MARKER) === 1, "SMOKE_FRAME_READ_CHAIN");
  gate(occurrences(r13Source, RENDERER_SMOKE_MARKER) === 1, "SMOKE_RENDERER_READ_CHAIN");

  const tempRoot = mkdtempSync(join(tmpdir(), "esmo-cs-player-smoke-r13-"));
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
        name: "cs-player-smoke-los-r13-memory-transform",
        enforce: "pre",
        transform(code, id) {
          if (resolve(id.split("?")[0]).toLowerCase() !== FPS_FILE.toLowerCase()) return null;
          const query = id.split("?")[1] ?? "";
          const variant = query.includes("cs-r13=baseline") ? "baseline"
            : query.includes("cs-r13=candidate") ? "candidate" : null;
          if (!variant) return null;
          transformSeen += 1;
          gate(code === originalSource, "VITE_SOURCE_MISMATCH");
          return {
            code: transformSource(variant === "baseline" ? baselineSource : r13Source, variant),
            map: null,
          };
        },
      }],
    });

    const baselineModule = await vite.ssrLoadModule(`${FPS_MODULE_ID}?cs-r13=baseline`);
    const candidateModule = await vite.ssrLoadModule(`${FPS_MODULE_ID}?cs-r13=candidate`);
    gate(transformSeen === 2, "TRANSFORM_COUNT", String(transformSeen));
    const baselineApi = baselineModule.__CS_PLAYER_SMOKE_LOS_R13_TEST_API__;
    const candidateApi = candidateModule.__CS_PLAYER_SMOKE_LOS_R13_TEST_API__;
    for (const api of [baselineApi, candidateApi]) {
      gate(typeof api?.simulateFps === "function", "SIMULATOR_EXPORT_MISSING");
      gate(Array.isArray(api?.ROSTER), "ROSTER_EXPORT_MISSING");
      gate(api?.TACTICS_DB?.inferno, "TACTICS_EXPORT_MISSING");
    }

    const mapKey = "inferno";
    const tTactic = clonePlain(candidateApi.TACTICS_DB.inferno.t.find((item) => item.id === "t_aexec"));
    const ctTactic = clonePlain(candidateApi.TACTICS_DB.inferno.ct.find((item) => item.id === "c_std"));
    const neutralRoster = clonePlain(candidateApi.ROSTER);
    gate(tTactic?.id === "t_aexec" && ctTactic?.id === "c_std", "TACTIC_MISSING");
    deepFreeze(tTactic);
    deepFreeze(ctTactic);
    deepFreeze(neutralRoster);
    const inputBefore = sha256(canonicalJson({ mapKey, tTactic, ctTactic, neutralRoster }));

    const losRecords = [];
    for (const seed of FIXED_SEEDS) {
      const scenario = { seed, mapKey, tTactic, ctTactic, roster: neutralRoster };
      const baseline = runOnce(baselineApi, scenario);
      const candidate = runDeterministic(candidateApi, scenario, "neutral-candidate");
      const pair = validateCausalPair(baseline, candidate, scenario);
      losRecords.push({
        seed,
        trajectorySha256: candidate.simDigest,
        rngCount: candidate.collector.rng.length,
        rngSha256: candidate.rngDigest,
        attributionSha256: sha256(canonicalJson(pair.attribution.document,
          { gameplay: true, rejectUndefined: true })),
        smokeThrows: candidate.collector.throws.length,
        smokeDetonations: candidate.collector.detonations.length,
        smokeSpawns: candidate.collector.spawns.length,
        blockedOpportunities: pair.attribution.opportunities.length,
        blockedEpisodes: pair.attribution.episodes.length,
        expiredSmokes: pair.attribution.lifetimes.filter((item) => item.termination === "expired").length,
        roundTruncatedSmokes: pair.attribution.lifetimes.filter((item) => item.termination === "round-end").length,
        firstPlayerSmokeBlock: pair.migration.firstPlayerSmokeBlock,
      });
    }
    gate(inputBefore === sha256(canonicalJson({ mapKey, tTactic, ctTactic, neutralRoster })),
      "SIM_MUTATED_NEUTRAL_INPUT");
    const losTotals = losRecords.reduce((totals, record) => {
      for (const key of [
        "smokeThrows", "smokeDetonations", "smokeSpawns", "blockedOpportunities",
        "blockedEpisodes", "expiredSmokes", "roundTruncatedSmokes",
      ]) totals[key] += record[key];
      return totals;
    }, {
      smokeThrows: 0,
      smokeDetonations: 0,
      smokeSpawns: 0,
      blockedOpportunities: 0,
      blockedEpisodes: 0,
      expiredSmokes: 0,
      roundTruncatedSmokes: 0,
    });
    gate(losTotals.blockedOpportunities > 0, "ZERO_PLAYER_SMOKE_BLOCK_COVERAGE",
      "Fixed 16-seed suite has no player-smoke LOS blocked opportunity. R13 must Revise without changing gameplay.");
    gate(losTotals.smokeSpawns > 0 && losTotals.smokeSpawns === losTotals.smokeDetonations,
      "SMOKE_LIFECYCLE_COVERAGE", canonicalJson(losTotals));

    const gameplayRecords = [];
    for (const statCase of STAT_CASES) {
      const roster = treatmentRoster(candidateApi, statCase);
      for (const seed of FIXED_SEEDS) {
        const scenario = { caseId: statCase.id, seed, mapKey, tTactic, ctTactic, roster };
        const baseline = runOnce(baselineApi, scenario);
        const candidate = runDeterministic(candidateApi, scenario, "matrix-candidate");
        const pair = validateCausalPair(baseline, candidate, scenario);
        gameplayRecords.push({
          caseId: statCase.id,
          seed,
          gameplayDigestV4: candidate.simDigest,
          rngCount: candidate.collector.rng.length,
          rngSha256: candidate.rngDigest,
          outcome: outcomeProjection(candidate.sim),
          migration: pair.migration,
        });
      }
    }

    const blockedRuns = gameplayRecords.filter((record) => record.migration.firstPlayerSmokeBlock);
    const zeroBlockRuns = gameplayRecords.filter((record) => !record.migration.firstPlayerSmokeBlock);
    gate(blockedRuns.length > 0, "ZERO_MATRIX_BLOCK_COVERAGE");
    gate(zeroBlockRuns.every((record) => record.migration.zeroDiffWithoutBlock),
      "ZERO_BLOCK_RUN_NOT_ZERO_DIFF");

    const losSuiteSha256 = sha256(canonicalJson({
      schema: LOS_SCHEMA,
      seedGenerationVersion: SEED_GENERATION_VERSION,
      seedSetSha256: EXPECTED_SEED_SET_SHA256,
      records: losRecords,
    }, { gameplay: true, rejectUndefined: true }));
    const gameplaySuiteV4Sha256 = sha256(canonicalJson({
      schema: DIGEST_SCHEMA_V4,
      seedGenerationVersion: SEED_GENERATION_VERSION,
      seedSetSha256: EXPECTED_SEED_SET_SHA256,
      treatmentIds: STAT_CASES.map((item) => item.id),
      records: gameplayRecords,
    }, { gameplay: true, rejectUndefined: true }));

    console.log(`sourceStage: ${sourceStage}`);
    console.log(`sourceSha256 (canonical LF R13): ${sourceSha256}`);
    console.log(`historical R13 working-tree source: ${CS_R13_PLAYER_SMOKE_SOURCE_SHA256}`);
    console.log(`R12 canonical LF / historical source: ${CS_R12_LF_SHA256} / ${CS_R12_SOURCE_SHA256}`);
    console.log(`static rand() call sites: ${EXPECTED_RAND_CALLS}->${randTokens(originalSource).length}`);
    console.log(`neutral coverage: ${canonicalJson(losTotals)}`);
    console.log(`matrix: ${STAT_CASES.length} treatments x ${FIXED_SEEDS.length} seeds = ${gameplayRecords.length} paired runs`);
    console.log(`causal migration: blocked=${blockedRuns.length} zeroBlock=${zeroBlockRuns.length}`);
    console.log(`${LOS_SCHEMA}: ${losSuiteSha256}`);
    console.log(`${DIGEST_SCHEMA_V4}: ${gameplaySuiteV4Sha256}`);
    if (EXPECTED_LOS_SUITE_SHA256 === "__CAPTURE_MANUALLY__"
      || EXPECTED_GAMEPLAY_SUITE_V4_SHA256 === "__CAPTURE_MANUALLY__") {
      throw new Error(`[R13_BASELINE_NOT_LOCKED]\nlos=${losSuiteSha256}\ngameplayV4=${gameplaySuiteV4Sha256}`);
    }
    gate(losSuiteSha256 === EXPECTED_LOS_SUITE_SHA256, "PLAYER_SMOKE_LOS_EVIDENCE_REGRESSION",
      `expected=${EXPECTED_LOS_SUITE_SHA256}\nactual=${losSuiteSha256}`);
    gate(gameplaySuiteV4Sha256 === EXPECTED_GAMEPLAY_SUITE_V4_SHA256,
      "GAMEPLAY_V4_BASELINE_REGRESSION",
      `expected=${EXPECTED_GAMEPLAY_SUITE_V4_SHA256}\nactual=${gameplaySuiteV4Sha256}`);
    console.log("blocked opportunity = wall-clear LOS candidate marginally blocked by player smoke");
    console.log("blocked episode = same round / same pair / consecutive 2-second ticks; prevented kills: not claimed");
    console.log("single RNG retained; no new RNG, phase, timing, balance, result, Store, Progress, or runtime contract");
    console.log("CS Player Smoke LOS R13: PASS");
  } finally {
    if (vite) await vite.close();
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
