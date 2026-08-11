#!/usr/bin/env node
// CS Defuse Instrumentation R6
// Production FPS source stays untouched; all hooks are exact Vite memory transforms.

import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { csR10LegacySource } from "./cs_r10_legacy_source.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FPS_FILE = resolve(ROOT, "src/battle/fps/EsportsFPS3D.jsx");
const FPS_MODULE_ID = "/src/battle/fps/EsportsFPS3D.jsx";
const EVENT_SCHEMA = "CsDefuseInstrumentation.v1";
const SEED_GENERATION_VERSION = "CsMeasurementSeedSet.v1";
const SEED_NAMESPACE = "ESMO:CsMeasurementPilot.v1:";
const FIXED_SEEDS = Object.freeze([
  3978742910, 4200255727, 541349949, 1011896540,
  44863398, 1878380147, 638784133, 2852978760,
  1789562418, 3820910912, 3991584863, 2186970694,
  951543597, 2082574495, 474649321, 3950420867,
]);
const EXPECTED_SEED_SET_SHA256 = "52414f0e6b09ba72b9223b5e76b6ad9d859e8b8ea6fe77dcc2a2a08876a74c6d";
const CAPTURED_ENGINE_SOURCE_SHA256 = "870678267543c8e502fac55c7a91a656a135f31fdfb0d673adc30c91c4d8f47b";
const CURRENT_ENGINE_SOURCE_SHA256 = "ba3305ea6cd92fe06df5ee3fd4eb3ca47e1385910672b1ec111f804da0859b8d";
const EXPECTED_RAND_CALLS = 21;
const LEGACY_EXPECTED_EVENT_SUITE_V1 = "9c33c3c2b10ff48bf0acdc59067184a48f5408f6b32b88324137fdd9fa0d7368";
const EXPECTED_EVENT_SUITE_V2 = "3181fb1ea4b16ae7b2d94309abf0b069ad18bf59a9f0b608116c8baaf3d5f2c3";
const EXPECTED_EVENT_ONLY_SUITE_V1 = "3f8a0b32acf85c2facd417e2be99657a144721463b6f61790f85150153cb2196";

const SIGNATURE_MARKER = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster){";
const SIGNATURE_REPLACEMENT = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster,__measure=null){";
const PLANT_MARKER = 'if(canPlant){planted=true;c4pos={...sitePos};c4t=20;carrier.hasBomb=false;carrier.state="安裝中";carrier.money+=300;';
const PLANT_REPLACEMENT = [
  'if(canPlant){planted=true;c4pos={...sitePos};c4t=20;carrier.hasBomb=false;carrier.state="安裝中";',
  '            __measure?.record("defuse_plant",{round:rnd+1,sec,site:target,carrierId:carrier.id,c4t,x:c4pos.x,y:c4pos.y});',
  "            carrier.money+=300;",
].join("\n");
const CONTESTED_MARKER = "        const contested=defuser&&aliveT.some(tp=>dist(tp.pos,c4pos)<9&&!lineBlocked(tp.pos,defuser.pos,walls));";
const CONTESTED_REPLACEMENT = [
  CONTESTED_MARKER,
  "        if(__measure){",
  "          const __prodCandidates=aliveCT.filter(__p=>dist(__p.pos,c4pos)<6);",
  '          const __freshCT=ps.filter(__p=>__p.side==="ct"&&!__p.dead),__freshT=ps.filter(__p=>__p.side==="t"&&!__p.dead);',
  "          const __freshCandidates=__freshCT.filter(__p=>dist(__p.pos,c4pos)<6),__freshDefuser=__freshCandidates[0];",
  "          const __prodContestants=defuser?aliveT.filter(__p=>dist(__p.pos,c4pos)<9&&!lineBlocked(__p.pos,defuser.pos,walls)):[];",
  "          const __liveContestantsForSelected=defuser?__freshT.filter(__p=>dist(__p.pos,c4pos)<9&&!lineBlocked(__p.pos,defuser.pos,walls)):[];",
  "          const __freshSelectedContestants=__freshDefuser?__freshT.filter(__p=>dist(__p.pos,c4pos)<9&&!lineBlocked(__p.pos,__freshDefuser.pos,walls)):[];",
  '          __measure.record("defuse_tick",{round:rnd+1,sec,c4t,progressBefore:defuseProg,candidateIds:__prodCandidates.map(__p=>__p.id).join("|"),freshCandidateIds:__freshCandidates.map(__p=>__p.id).join("|"),selectedDefuserId:defuser?.id||"",freshSelectedDefuserId:__freshDefuser?.id||"",selectedDefuserDead:Boolean(defuser&&defuser.dead),contestantIds:__prodContestants.map(__p=>__p.id).join("|"),liveContestantIdsForSelected:__liveContestantsForSelected.map(__p=>__p.id).join("|"),freshSelectedContestantIds:__freshSelectedContestants.map(__p=>__p.id).join("|"),contested:Boolean(contested),progressGate:Boolean(defuser&&!contested),freshProgressGate:Boolean(__freshDefuser&&__freshSelectedContestants.length===0),freshAliveT:__freshT.length,freshAliveCT:__freshCT.length});',
  "        }",
].join("\n");
const PROGRESS_MARKER = "          defuseProg+=defuser.stats?(0.45+defuser.stats.foc/250+defuser.stats.dec/300):0.7;";
const PROGRESS_REPLACEMENT = [
  "          const __defuseBefore=__measure?defuseProg:null;",
  PROGRESS_MARKER,
  '          __measure?.record("defuse_progress",{round:rnd+1,sec,playerId:defuser.id,playerDead:Boolean(defuser.dead),focus:defuser.stats?.foc??null,decision:defuser.stats?.dec??null,fallback:!defuser.stats,before:__defuseBefore,delta:defuseProg-__defuseBefore,after:defuseProg,c4t});',
].join("\n");
const COMPLETE_MARKER = '        if(defuseProg>=3.5)roundEnd={winner:"ct",how:"defuse"};';
const COMPLETE_REPLACEMENT = [
  COMPLETE_MARKER,
  '        if(__measure&&roundEnd?.how==="defuse")__measure.record("defuse_complete",{round:rnd+1,sec,playerId:defuser?.id||"",playerDead:Boolean(defuser&&defuser.dead),progress:defuseProg,c4t,freshAliveT:ps.filter(__p=>__p.side==="t"&&!__p.dead).length,freshAliveCT:ps.filter(__p=>__p.side==="ct"&&!__p.dead).length});',
].join("\n");
const ROUND_RESULT_MARKER = "      const wn=roundEnd.winner;";
const ROUND_RESULT_REPLACEMENT = [
  ROUND_RESULT_MARKER,
  '      if(__measure&&planted)__measure.record("defuse_round_result",{round:rnd+1,winner:wn,how:roundEnd.how,finalProgress:defuseProg,defuseCalled,c4t:c4t??-1,freshAliveT:ps.filter(__p=>__p.side==="t"&&!__p.dead).length,freshAliveCT:ps.filter(__p=>__p.side==="ct"&&!__p.dead).length});',
].join("\n");
const RETURN_MARKER = "return { EsportsFPS3D, buildMatchResult };";
const RETURN_REPLACEMENT = "return { EsportsFPS3D, buildMatchResult, simulateFps, ROSTER, TACTICS_DB };";
const EXPORT_MARKER = "export { EsportsFPS3D, buildMatchResult };";
const EXPORT_REPLACEMENT = [
  "const __CS_DEFUSE_R6_TEST_API__ = Object.freeze({",
  "  simulateFps: __FPS3D_MODULE.simulateFps,",
  "  ROSTER: __FPS3D_MODULE.ROSTER,",
  "  TACTICS_DB: __FPS3D_MODULE.TACTICS_DB,",
  "});",
  "export { EsportsFPS3D, buildMatchResult, __CS_DEFUSE_R6_TEST_API__ };",
].join("\n");

const TRANSFORMS = Object.freeze([
  ["signature", SIGNATURE_MARKER, SIGNATURE_REPLACEMENT],
  ["plant", PLANT_MARKER, PLANT_REPLACEMENT],
  ["tick opportunity", CONTESTED_MARKER, CONTESTED_REPLACEMENT],
  ["progress", PROGRESS_MARKER, PROGRESS_REPLACEMENT],
  ["complete", COMPLETE_MARKER, COMPLETE_REPLACEMENT],
  ["round result", ROUND_RESULT_MARKER, ROUND_RESULT_REPLACEMENT],
  ["return export", RETURN_MARKER, RETURN_REPLACEMENT],
  ["module export", EXPORT_MARKER, EXPORT_REPLACEMENT],
]);

const EVENT_TYPES = new Set([
  "defuse_plant",
  "defuse_tick",
  "defuse_progress",
  "defuse_complete",
  "defuse_round_result",
]);

function gate(ok, code, detail = "") {
  if (!ok) throw new Error(`[${code}]${detail ? `\n${detail}` : ""}`);
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function occurrences(text, needle) {
  return text.split(needle).length - 1;
}

function canonicalValue(value, key = "") {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    gate(Number.isFinite(value), "NON_FINITE_NUMBER", `key=${key} value=${String(value)}`);
    return Object.is(value, -0) ? 0 : value;
  }
  gate(typeof value !== "undefined", "UNDEFINED_VALUE", `key=${key}`);
  gate(typeof value === "object", "UNSUPPORTED_VALUE", `key=${key} type=${typeof value}`);
  if (Array.isArray(value)) return value.map((entry, index) => canonicalValue(entry, String(index)));
  const out = {};
  for (const childKey of Object.keys(value).sort()) out[childKey] = canonicalValue(value[childKey], childKey);
  return out;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
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

function rngTokens(source) {
  return source.match(/\b(?:rand|Math\.random)\s*\(\s*\)/g) ?? [];
}

function randTokens(source) {
  return source.match(/\brand\s*\(\s*\)/g) ?? [];
}

function idList(text, code, detail) {
  gate(typeof text === "string", `${code}_TYPE`, detail);
  if (!text) return [];
  const ids = text.split("|");
  gate(ids.every(Boolean), `${code}_BLANK`, detail);
  gate(new Set(ids).size === ids.length, `${code}_DUPLICATE`, detail);
  return ids;
}

function sameNumber(actual, expected, epsilon = 1e-10) {
  return Number.isFinite(actual) && Number.isFinite(expected) && Math.abs(actual - expected) <= epsilon;
}

function tickKey(round, sec) {
  return `${round}|${sec}`;
}

function analyzeProgressSequence(steps, detail) {
  let expectedProgress = 0;
  let started = false;
  let pauseTicks = 0;
  let previousOwner = null;
  let ownerSwitches = 0;
  const owners = new Set();
  for (const step of steps) {
    gate(sameNumber(step.before, expectedProgress), "PROGRESS_NOT_RETAINED",
      `${detail} before=${step.before} expected=${expectedProgress}`);
    if (step.progress) {
      gate(sameNumber(step.progress.before, step.before) && step.progress.after > step.progress.before,
        "PROGRESS_SEQUENCE_STEP", detail);
      expectedProgress = step.progress.after;
      started = true;
      owners.add(step.progress.playerId);
      if (previousOwner && previousOwner !== step.progress.playerId) ownerSwitches++;
      previousOwner = step.progress.playerId;
    } else if (started) {
      pauseTicks++;
    }
  }
  return { expectedProgress, pauseTicks, ownerSwitches, owners: owners.size };
}

function verifyProgressSequenceClassifier() {
  const result = analyzeProgressSequence([
    { before: 0, progress: { before: 0, after: 1, playerId: "ct1" } },
    { before: 1, progress: null },
    { before: 1, progress: { before: 1, after: 2, playerId: "ct2" } },
  ], "classifier-self-check");
  gate(result.expectedProgress === 2 && result.pauseTicks === 1
    && result.ownerSwitches === 1 && result.owners === 2,
  "PROGRESS_CLASSIFIER_SELF_CHECK", canonicalJson(result));
}

function createCollector() {
  const events = [];
  return {
    events,
    record(type, payload) {
      gate(EVENT_TYPES.has(type), "UNKNOWN_EVENT_TYPE", `type=${type}`);
      gate(payload && typeof payload === "object" && !Array.isArray(payload), "INVALID_EVENT_PAYLOAD");
      const event = { schema: EVENT_SCHEMA, type, ...payload };
      for (const [key, value] of Object.entries(event)) {
        gate(value === null || ["string", "number", "boolean"].includes(typeof value),
          "NON_PRIMITIVE_EVENT_FIELD", `type=${type} key=${key}`);
      }
      events.push(Object.freeze(event));
    },
  };
}

function validateEvents(events, sim, seed) {
  const plants = new Map();
  const ticks = new Map();
  const progress = new Map();
  const completes = new Map();
  const results = new Map();
  const sides = new Map(sim.players.map((player) => [player.id, player.side]));

  for (const event of events) {
    gate(event.schema === EVENT_SCHEMA, "EVENT_SCHEMA_MISMATCH", `seed=${seed}`);
    gate(Number.isInteger(event.round) && event.round >= 1 && event.round <= sim.roundHist.length,
      "EVENT_ROUND", `seed=${seed} round=${event.round}`);

    if (event.type === "defuse_plant") {
      gate(!plants.has(event.round), "DUPLICATE_PLANT", `seed=${seed} round=${event.round}`);
      gate(Number.isInteger(event.sec) && event.sec >= 0 && event.sec <= 114 && event.sec % 2 === 0,
        "PLANT_SEC", `seed=${seed} round=${event.round} sec=${event.sec}`);
      gate(event.site === "a" || event.site === "b", "PLANT_SITE", `seed=${seed}`);
      gate(sides.get(event.carrierId) === "t", "PLANT_CARRIER", `seed=${seed} id=${event.carrierId}`);
      gate(event.c4t === 20, "PLANT_TIMER", `seed=${seed} c4t=${event.c4t}`);
      gate(Number.isFinite(event.x) && Number.isFinite(event.y), "PLANT_POSITION", `seed=${seed}`);
      plants.set(event.round, event);
      continue;
    }

    if (event.type === "defuse_tick") {
      const key = tickKey(event.round, event.sec);
      gate(!ticks.has(key), "DUPLICATE_TICK", `seed=${seed} key=${key}`);
      gate(Number.isInteger(event.sec) && event.sec >= 0 && event.sec <= 114 && event.sec % 2 === 0,
        "TICK_SEC", `seed=${seed} key=${key}`);
      gate(Number.isInteger(event.c4t) && event.c4t >= 0 && event.c4t <= 19,
        "TICK_TIMER", `seed=${seed} key=${key} c4t=${event.c4t}`);
      gate(Number.isFinite(event.progressBefore) && event.progressBefore >= 0 && event.progressBefore < 3.5,
        "TICK_PROGRESS", `seed=${seed} key=${key} progress=${event.progressBefore}`);
      const candidates = idList(event.candidateIds, "CANDIDATES", `seed=${seed} key=${key}`);
      const freshCandidates = idList(event.freshCandidateIds, "FRESH_CANDIDATES", `seed=${seed} key=${key}`);
      const contestants = idList(event.contestantIds, "CONTESTANTS", `seed=${seed} key=${key}`);
      const liveContestants = idList(event.liveContestantIdsForSelected, "LIVE_CONTESTANTS", `seed=${seed} key=${key}`);
      const freshSelectedContestants = idList(event.freshSelectedContestantIds, "FRESH_SELECTED_CONTESTANTS", `seed=${seed} key=${key}`);
      gate(candidates.every((id) => sides.get(id) === "ct")
        && freshCandidates.every((id) => sides.get(id) === "ct"),
      "CANDIDATE_SIDE", `seed=${seed} key=${key}`);
      gate(contestants.every((id) => sides.get(id) === "t")
        && liveContestants.every((id) => sides.get(id) === "t")
        && freshSelectedContestants.every((id) => sides.get(id) === "t"),
      "CONTESTANT_SIDE", `seed=${seed} key=${key}`);
      gate(freshCandidates.every((id) => candidates.includes(id)),
        "FRESH_CANDIDATE_NOT_PRODUCTION", `seed=${seed} key=${key}`);
      gate(liveContestants.every((id) => contestants.includes(id)),
        "LIVE_CONTESTANT_NOT_PRODUCTION", `seed=${seed} key=${key}`);
      gate(event.selectedDefuserId === (candidates[0] ?? ""),
        "SELECTED_DEFUSER", `seed=${seed} key=${key}`);
      gate(event.freshSelectedDefuserId === (freshCandidates[0] ?? ""),
        "FRESH_SELECTED_DEFUSER", `seed=${seed} key=${key}`);
      gate(event.selectedDefuserDead === Boolean(event.selectedDefuserId
        && !freshCandidates.includes(event.selectedDefuserId)),
      "DEFUSER_DEAD_FLAG", `seed=${seed} key=${key}`);
      gate(event.contested === (contestants.length > 0), "CONTESTED_FLAG", `seed=${seed} key=${key}`);
      gate(event.progressGate === Boolean(event.selectedDefuserId && !event.contested),
        "PROGRESS_GATE", `seed=${seed} key=${key}`);
      gate(event.freshProgressGate === Boolean(event.freshSelectedDefuserId
        && freshSelectedContestants.length === 0),
      "FRESH_PROGRESS_GATE", `seed=${seed} key=${key}`);
      gate(Number.isInteger(event.freshAliveT) && event.freshAliveT >= 0 && event.freshAliveT <= 5
        && Number.isInteger(event.freshAliveCT) && event.freshAliveCT >= 0 && event.freshAliveCT <= 5,
      "FRESH_ALIVE_COUNTS", `seed=${seed} key=${key}`);
      ticks.set(key, { event, candidates, freshCandidates, contestants, liveContestants,
        freshSelectedContestants });
      continue;
    }

    if (event.type === "defuse_progress") {
      const key = tickKey(event.round, event.sec);
      gate(!progress.has(key), "DUPLICATE_PROGRESS", `seed=${seed} key=${key}`);
      gate(sides.get(event.playerId) === "ct", "PROGRESS_PLAYER", `seed=${seed} key=${key}`);
      gate(typeof event.playerDead === "boolean" && typeof event.fallback === "boolean",
        "PROGRESS_FLAGS", `seed=${seed} key=${key}`);
      gate(Number.isFinite(event.before) && Number.isFinite(event.delta) && Number.isFinite(event.after)
        && event.delta > 0 && sameNumber(event.after, event.before + event.delta),
      "PROGRESS_ARITHMETIC", `seed=${seed} key=${key}`);
      if (event.fallback) {
        gate(event.focus === null && event.decision === null && sameNumber(event.delta, 0.7),
          "PROGRESS_FALLBACK", `seed=${seed} key=${key}`);
      } else {
        gate(Number.isFinite(event.focus) && Number.isFinite(event.decision),
          "PROGRESS_STATS", `seed=${seed} key=${key}`);
        gate(sameNumber(event.delta, 0.45 + event.focus / 250 + event.decision / 300),
          "PROGRESS_FORMULA", `seed=${seed} key=${key} delta=${event.delta}`);
      }
      gate(Number.isInteger(event.c4t) && event.c4t >= 0 && event.c4t <= 19,
        "PROGRESS_TIMER", `seed=${seed} key=${key}`);
      progress.set(key, event);
      continue;
    }

    if (event.type === "defuse_complete") {
      gate(!completes.has(event.round), "DUPLICATE_COMPLETE", `seed=${seed} round=${event.round}`);
      gate(sides.get(event.playerId) === "ct", "COMPLETE_PLAYER", `seed=${seed}`);
      gate(Number.isFinite(event.progress) && event.progress >= 3.5,
        "COMPLETE_PROGRESS", `seed=${seed} progress=${event.progress}`);
      gate(Number.isInteger(event.c4t) && event.c4t >= 0 && event.c4t <= 19,
        "COMPLETE_TIMER", `seed=${seed}`);
      gate(typeof event.playerDead === "boolean" && Number.isInteger(event.freshAliveT)
        && Number.isInteger(event.freshAliveCT), "COMPLETE_FIELDS", `seed=${seed}`);
      completes.set(event.round, event);
      continue;
    }

    if (event.type === "defuse_round_result") {
      gate(!results.has(event.round), "DUPLICATE_RESULT", `seed=${seed} round=${event.round}`);
      gate(event.winner === "t" || event.winner === "ct", "RESULT_WINNER", `seed=${seed}`);
      gate(typeof event.how === "string" && typeof event.defuseCalled === "boolean",
        "RESULT_FIELDS", `seed=${seed}`);
      gate(Number.isFinite(event.finalProgress) && event.finalProgress >= 0,
        "RESULT_PROGRESS", `seed=${seed}`);
      gate(Number.isInteger(event.c4t) && event.c4t >= 0 && event.c4t <= 19,
        "RESULT_TIMER", `seed=${seed} c4t=${event.c4t}`);
      gate(Number.isInteger(event.freshAliveT) && event.freshAliveT >= 0 && event.freshAliveT <= 5
        && Number.isInteger(event.freshAliveCT) && event.freshAliveCT >= 0 && event.freshAliveCT <= 5,
      "RESULT_ALIVE", `seed=${seed}`);
      results.set(event.round, event);
    }
  }

  const plantedFrames = sim.frames.filter((frame) => frame.planted);
  const plantedRounds = [...new Set(plantedFrames.map((frame) => frame.rnd + 1))];
  gate(plants.size === plantedRounds.length, "PLANT_ROUND_COUNT",
    `seed=${seed} plants=${plants.size} frames=${plantedRounds.length}`);
  gate(results.size === plantedRounds.length, "RESULT_ROUND_COUNT",
    `seed=${seed} results=${results.size} frames=${plantedRounds.length}`);
  gate(ticks.size === plantedFrames.length, "TICK_FRAME_COUNT",
    `seed=${seed} ticks=${ticks.size} frames=${plantedFrames.length}`);

  for (const frame of plantedFrames) {
    const key = tickKey(frame.rnd + 1, frame.roundSec);
    const tick = ticks.get(key)?.event;
    gate(tick, "MISSING_FRAME_TICK", `seed=${seed} key=${key}`);
    gate(tick.c4t === frame.c4t, "FRAME_TIMER_MISMATCH",
      `seed=${seed} key=${key} event=${tick.c4t} frame=${frame.c4t}`);
  }

  let pauseTicksAfterStart = 0;
  let pausedRounds = 0;
  let ownerSwitches = 0;
  let multiDefuserRounds = 0;
  let incompleteProgressRounds = 0;
  const players = {};

  for (const round of plantedRounds) {
    const roundFrames = plantedFrames.filter((frame) => frame.rnd + 1 === round);
    const roundTicks = [...ticks.values()].filter(({ event }) => event.round === round)
      .sort((a, b) => a.event.sec - b.event.sec);
    const plant = plants.get(round);
    const result = results.get(round);
    gate(roundTicks.length === roundFrames.length && roundTicks.length > 0,
      "ROUND_TICK_COUNT", `seed=${seed} round=${round}`);
    gate(plant.sec === roundFrames[0].roundSec, "PLANT_FIRST_FRAME",
      `seed=${seed} round=${round}`);
    const hist = sim.roundHist[round - 1];
    gate(hist && hist.winner === result.winner && hist.how === result.how,
      "ROUND_HIST_MISMATCH", `seed=${seed} round=${round}`);
    const finalFrame = roundFrames.at(-1);
    const finalAliveT = finalFrame.players.filter((player) => player.side === "t" && !player.dead).length;
    const finalAliveCT = finalFrame.players.filter((player) => player.side === "ct" && !player.dead).length;
    gate(result.c4t === finalFrame.c4t && result.freshAliveT === finalAliveT
      && result.freshAliveCT === finalAliveCT,
    "FINAL_FRAME_MISMATCH", `seed=${seed} round=${round}`);

    const sequence = roundTicks.map((tick) => ({
      before: tick.event.progressBefore,
      progress: progress.get(tickKey(round, tick.event.sec)) ?? null,
    }));
    const sequenceSummary = analyzeProgressSequence(sequence, `seed=${seed} round=${round}`);
    pauseTicksAfterStart += sequenceSummary.pauseTicks;
    if (sequenceSummary.pauseTicks > 0) pausedRounds++;
    ownerSwitches += sequenceSummary.ownerSwitches;
    if (sequenceSummary.owners > 1) multiDefuserRounds++;
    for (const tick of roundTicks) {
      const key = tickKey(round, tick.event.sec);
      const step = progress.get(key);
      gate(Boolean(step) === tick.event.progressGate, "TICK_PROGRESS_IDENTITY", `seed=${seed} key=${key}`);
      if (step) {
        gate(step.playerId === tick.event.selectedDefuserId && step.playerDead === tick.event.selectedDefuserDead
          && sameNumber(step.before, tick.event.progressBefore) && step.c4t === tick.event.c4t,
        "PROGRESS_TICK_MISMATCH", `seed=${seed} key=${key}`);
        if (!players[step.playerId]) players[step.playerId] = {
          progressTicks: 0, totalProgress: 0, completions: 0, deadProgressTicks: 0,
        };
        players[step.playerId].progressTicks++;
        players[step.playerId].totalProgress += step.delta;
        if (step.playerDead) players[step.playerId].deadProgressTicks++;
      }
    }
    if (result.how !== "defuse" && sequenceSummary.expectedProgress > 0) incompleteProgressRounds++;
    gate(sameNumber(result.finalProgress, sequenceSummary.expectedProgress),
      "FINAL_PROGRESS_MISMATCH", `seed=${seed} round=${round}`);
    gate(result.defuseCalled === (sequenceSummary.expectedProgress > 0), "DEFUSE_CALLED_MISMATCH",
      `seed=${seed} round=${round}`);
    const complete = completes.get(round);
    gate(Boolean(complete) === (result.how === "defuse"), "COMPLETE_RESULT_MISMATCH",
      `seed=${seed} round=${round} how=${result.how}`);
    if (complete) {
      const key = tickKey(round, complete.sec);
      const crossing = progress.get(key);
      gate(crossing && crossing.playerId === complete.playerId
        && crossing.before < 3.5 && sameNumber(crossing.after, complete.progress),
      "COMPLETE_CROSSING", `seed=${seed} round=${round}`);
      gate(complete.c4t === ticks.get(key).event.c4t
        && complete.freshAliveT === result.freshAliveT
        && complete.freshAliveCT === result.freshAliveCT,
      "COMPLETE_RESULT_FIELDS", `seed=${seed} round=${round}`);
      players[complete.playerId].completions++;
    }
  }

  for (const [key, step] of progress) {
    gate(ticks.has(key), "ORPHAN_PROGRESS", `seed=${seed} key=${key}`);
    gate(plants.has(step.round), "PROGRESS_WITHOUT_PLANT", `seed=${seed} key=${key}`);
  }

  const tickValues = [...ticks.values()];
  const progressValues = [...progress.values()];
  const resultValues = [...results.values()];
  const completeValues = [...completes.values()];
  const staleContestantRefs = tickValues.reduce((sum, tick) => sum
    + tick.contestants.filter((id) => !tick.liveContestants.includes(id)).length, 0);
  const blockedOnlyByStaleContestant = tickValues.filter((tick) => tick.event.selectedDefuserId
    && !tick.event.selectedDefuserDead && tick.event.contested && tick.liveContestants.length === 0).length;
  const staleDiagnostics = tickValues.filter((tick) => tick.event.selectedDefuserDead
    || tick.event.progressGate !== tick.event.freshProgressGate).map((tick) => ({
    round: tick.event.round,
    sec: tick.event.sec,
    selectedDefuserId: tick.event.selectedDefuserId,
    freshSelectedDefuserId: tick.event.freshSelectedDefuserId,
    selectedDefuserDead: tick.event.selectedDefuserDead,
    contestantIds: tick.event.contestantIds,
    liveContestantIdsForSelected: tick.event.liveContestantIdsForSelected,
    progressGate: tick.event.progressGate,
    freshProgressGate: tick.event.freshProgressGate,
  }));
  if (staleDiagnostics.length) {
    console.log(`stale diagnostic seed=${seed}: ${JSON.stringify(staleDiagnostics)}`);
  }

  return {
    rounds: sim.roundHist.length,
    plantedRounds: plantedRounds.length,
    bombTicks: ticks.size,
    proximityTicks: tickValues.filter((tick) => tick.event.selectedDefuserId).length,
    freshProximityTicks: tickValues.filter((tick) => tick.event.freshSelectedDefuserId).length,
    contestedTicks: tickValues.filter((tick) => tick.event.contested).length,
    progressTicks: progress.size,
    progressStartedRounds: resultValues.filter((event) => event.defuseCalled).length,
    pauseTicksAfterStart,
    pausedRounds,
    ownerSwitches,
    multiDefuserRounds,
    completions: completes.size,
    defuseResults: resultValues.filter((event) => event.how === "defuse").length,
    bombResults: resultValues.filter((event) => event.how === "bomb").length,
    bombResultsAtTimerZero: resultValues.filter((event) => event.how === "bomb" && event.c4t === 0).length,
    bombResultsWithTimeRemaining: resultValues.filter((event) => event.how === "bomb" && event.c4t > 0).length,
    bombResultsWithNoFreshCT: resultValues.filter((event) => event.how === "bomb" && event.freshAliveCT === 0).length,
    incompleteProgressRounds,
    totalProgress: progressValues.reduce((sum, event) => sum + event.delta, 0),
    staleDefuserTicks: tickValues.filter((tick) => tick.event.selectedDefuserDead).length,
    deadDefuserProgressTicks: progressValues.filter((event) => event.playerDead).length,
    deadDefuserCompletions: completeValues.filter((event) => event.playerDead).length,
    staleContestantRefs,
    blockedOnlyByStaleContestant,
    productionFreshGateDisagreements: tickValues.filter((tick) =>
      tick.event.progressGate !== tick.event.freshProgressGate).length,
    players,
  };
}

function addCounts(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "number") target[key] = (target[key] ?? 0) + value;
    else {
      gate(value && typeof value === "object" && !Array.isArray(value),
        "NON_NUMERIC_COUNT", `key=${key}`);
      if (!target[key]) target[key] = {};
      addCounts(target[key], value);
    }
  }
}

function percent(numerator, denominator) {
  return denominator ? +(numerator / denominator * 100).toFixed(3) : 0;
}

async function main() {
  gate(process.argv.slice(2).length === 0, "CLI_FLAGS_FORBIDDEN",
    "No update, rebaseline, seed, treatment, or calibration flags are supported.");
  verifyProgressSequenceClassifier();
  const originalSource = readFileSync(FPS_FILE, "utf8");
  const sourceSha256 = sha256(originalSource);
  gate([CAPTURED_ENGINE_SOURCE_SHA256, CURRENT_ENGINE_SOURCE_SHA256].includes(sourceSha256), "SOURCE_PROVENANCE_MISMATCH",
    `expected=${CAPTURED_ENGINE_SOURCE_SHA256} or ${CURRENT_ENGINE_SOURCE_SHA256}\nactual=${sourceSha256}`);
  const historicalSource = sourceSha256 === CURRENT_ENGINE_SOURCE_SHA256
    ? csR10LegacySource(originalSource) : originalSource;
  for (const [name, marker] of TRANSFORMS) {
    gate(occurrences(historicalSource, marker) === 1, "MARKER_COUNT", `name=${name}`);
  }
  const originalRandTokens = randTokens(historicalSource);
  const originalRngTokens = rngTokens(historicalSource);
  gate(originalRandTokens.length === EXPECTED_RAND_CALLS, "RAND_CALL_COUNT",
    `expected=${EXPECTED_RAND_CALLS} actual=${originalRandTokens.length}`);
  gate(canonicalJson(generatedSeeds()) === canonicalJson(FIXED_SEEDS), "SEED_GENERATION_MISMATCH");
  const seedSetSha256 = sha256(canonicalJson(FIXED_SEEDS));
  gate(seedSetSha256 === EXPECTED_SEED_SET_SHA256, "SEED_SET_HASH_MISMATCH");

  console.log(`instrumentation schema: ${EVENT_SCHEMA}`);
  console.log(`seed generation version: ${SEED_GENERATION_VERSION}`);
  console.log(`seeds: ${JSON.stringify(FIXED_SEEDS)}`);
  console.log(`seedSetSha256: ${seedSetSha256}`);
  console.log(`engineSourceSha256: ${sourceSha256}`);
  console.log(`rand() call sites: ${originalRandTokens.length}`);

  let transformSeen = 0;
  let transformRestoredExactly = false;
  let transformedRngTokensMatch = false;
  const tempRoot = mkdtempSync(join(tmpdir(), "esmo-cs-defuse-r6-"));
  let vite = null;

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
        name: "cs-defuse-r6-memory-hooks",
        enforce: "pre",
        transform(code, id) {
          const cleanId = resolve(id.split("?")[0]).toLowerCase();
          if (cleanId !== FPS_FILE.toLowerCase()) return null;
          transformSeen += 1;
          gate(code === originalSource, "VITE_SOURCE_MISMATCH");
          let transformed = historicalSource;
          for (const [name, marker, replacement] of TRANSFORMS) {
            gate(occurrences(transformed, marker) === 1, "TRANSFORM_MARKER_COUNT", `name=${name}`);
            transformed = transformed.replace(marker, replacement);
          }
          let restored = transformed;
          for (const [name, marker, replacement] of [...TRANSFORMS].reverse()) {
            gate(occurrences(restored, replacement) === 1, "REPLACEMENT_COUNT", `name=${name}`);
            restored = restored.replace(replacement, marker);
          }
          transformRestoredExactly = restored === historicalSource;
          transformedRngTokensMatch =
            canonicalJson(rngTokens(transformed)) === canonicalJson(originalRngTokens);
          gate(transformRestoredExactly, "TRANSFORM_NOT_EXACTLY_REVERSIBLE");
          gate(transformedRngTokensMatch, "RNG_TOKEN_SEQUENCE_CHANGED");
          return { code: transformed, map: null };
        },
      }],
    });

    const loaded = await vite.ssrLoadModule(FPS_MODULE_ID);
    gate(transformSeen === 1, "TRANSFORM_EXECUTION_COUNT", `actual=${transformSeen}`);
    gate(transformRestoredExactly, "TRANSFORM_INTEGRITY");
    gate(transformedRngTokensMatch, "RNG_TOKEN_INTEGRITY");
    const api = loaded.__CS_DEFUSE_R6_TEST_API__;
    gate(typeof api?.simulateFps === "function", "TEST_SIMULATOR_EXPORT_MISSING");
    gate(Array.isArray(api?.ROSTER), "TEST_ROSTER_EXPORT_MISSING");
    gate(api?.TACTICS_DB && typeof api.TACTICS_DB === "object", "TEST_TACTICS_EXPORT_MISSING");

    const mapKey = "inferno";
    const tTactic = deepFreeze(clonePlain(
      api.TACTICS_DB?.inferno?.t?.find((item) => item.id === "t_aexec")));
    const ctTactic = deepFreeze(clonePlain(
      api.TACTICS_DB?.inferno?.ct?.find((item) => item.id === "c_std")));
    const roster = deepFreeze(clonePlain(api.ROSTER));
    gate(tTactic?.id === "t_aexec", "T_TACTIC_MISSING");
    gate(ctTactic?.id === "c_std", "CT_TACTIC_MISSING");
    gate(roster.length === 10, "ROSTER_SIZE", `actual=${roster.length}`);
    const inputBefore = sha256(canonicalJson({ mapKey, tTactic, ctTactic, roster }));
    const suite = [];
    const totals = {};

    for (const seed of FIXED_SEEDS) {
      const off = api.simulateFps(mapKey, tTactic, ctTactic, seed, roster);
      const collector1 = createCollector();
      const on1 = api.simulateFps(mapKey, tTactic, ctTactic, seed, roster, collector1);
      const collector2 = createCollector();
      const on2 = api.simulateFps(mapKey, tTactic, ctTactic, seed, roster, collector2);
      const offJson = JSON.stringify(off);
      const on1Json = JSON.stringify(on1);
      const on2Json = JSON.stringify(on2);
      gate(offJson === on1Json && offJson === on2Json, "INSTRUMENTATION_CHANGED_SIM",
        `seed=${seed}\noff=${sha256(offJson)}\non1=${sha256(on1Json)}\non2=${sha256(on2Json)}`);
      const eventJson1 = canonicalJson(collector1.events);
      const eventJson2 = canonicalJson(collector2.events);
      gate(eventJson1 === eventJson2, "INSTRUMENTATION_NON_DETERMINISTIC",
        `seed=${seed}\non1=${sha256(eventJson1)}\non2=${sha256(eventJson2)}`);
      const counts = validateEvents(collector1.events, off, seed);
      addCounts(totals, counts);
      suite.push({ seed, strictSimDigest: sha256(offJson), eventDigest: sha256(eventJson1), counts });
    }

    const inputAfter = sha256(canonicalJson({ mapKey, tTactic, ctTactic, roster }));
    gate(inputBefore === inputAfter, "SIM_MUTATED_INPUT");
    console.log(`coverage diagnostic: ${JSON.stringify({plantedRounds:totals.plantedRounds,bombTicks:totals.bombTicks,proximityTicks:totals.proximityTicks,contestedTicks:totals.contestedTicks,progressTicks:totals.progressTicks,progressStartedRounds:totals.progressStartedRounds,pauseTicksAfterStart:totals.pauseTicksAfterStart,pausedRounds:totals.pausedRounds,ownerSwitches:totals.ownerSwitches,multiDefuserRounds:totals.multiDefuserRounds,completions:totals.completions,staleDefuserTicks:totals.staleDefuserTicks,staleContestantRefs:totals.staleContestantRefs,productionFreshGateDisagreements:totals.productionFreshGateDisagreements})}`);
    gate(totals.plantedRounds > 0, "NO_PLANTED_ROUNDS");
    gate(totals.bombTicks > 0, "NO_BOMB_TICKS");
    gate(totals.proximityTicks > 0, "NO_DEFUSE_PROXIMITY");
    gate(totals.progressTicks > 0, "NO_DEFUSE_PROGRESS");
    gate(totals.completions > 0, "NO_DEFUSE_COMPLETIONS");
    gate(totals.completions === totals.defuseResults, "SUITE_COMPLETE_RESULT_MISMATCH");

    const suiteDigest = sha256(canonicalJson({
      schema: EVENT_SCHEMA,
      seedGenerationVersion: SEED_GENERATION_VERSION,
      seedSetSha256,
      suite,
    }));
    const eventOnlySuiteDigest = sha256(canonicalJson({
      schema: EVENT_SCHEMA,
      seedGenerationVersion: SEED_GENERATION_VERSION,
      seedSetSha256,
      suite: suite.map(({ seed, eventDigest, counts }) => ({ seed, eventDigest, counts })),
    }));
    const playerSummary = Object.fromEntries(Object.entries(totals.players ?? {}).map(([id, player]) => [id, {
      role: roster.find((item) => item.id === id)?.role ?? null,
      focus: roster.find((item) => item.id === id)?.stats?.foc ?? null,
      decision: roster.find((item) => item.id === id)?.stats?.dec ?? null,
      progressTicks: player.progressTicks,
      totalProgress: +player.totalProgress.toFixed(4),
      completions: player.completions,
      deadProgressTicks: player.deadProgressTicks,
    }]));
    const summary = {
      simulations: FIXED_SEEDS.length * 3,
      rounds: totals.rounds,
      plantedRounds: totals.plantedRounds,
      plantPct: percent(totals.plantedRounds, totals.rounds),
      bombTicks: totals.bombTicks,
      proximityTicks: totals.proximityTicks,
      proximityPct: percent(totals.proximityTicks, totals.bombTicks),
      freshProximityTicks: totals.freshProximityTicks,
      contestedTicks: totals.contestedTicks,
      progressTicks: totals.progressTicks,
      progressPctOfBombTicks: percent(totals.progressTicks, totals.bombTicks),
      progressPctOfProximity: percent(totals.progressTicks, totals.proximityTicks),
      progressStartedRounds: totals.progressStartedRounds,
      pauseTicksAfterStart: totals.pauseTicksAfterStart,
      pausedRounds: totals.pausedRounds,
      ownerSwitches: totals.ownerSwitches,
      multiDefuserRounds: totals.multiDefuserRounds,
      totalProgress: +totals.totalProgress.toFixed(4),
      avgProgressDelta: +(totals.totalProgress / totals.progressTicks).toFixed(4),
      completions: totals.completions,
      defuseResults: totals.defuseResults,
      bombResults: totals.bombResults,
      bombResultsAtTimerZero: totals.bombResultsAtTimerZero,
      bombResultsWithTimeRemaining: totals.bombResultsWithTimeRemaining,
      bombResultsWithNoFreshCT: totals.bombResultsWithNoFreshCT,
      incompleteProgressRounds: totals.incompleteProgressRounds,
      staleDefuserTicks: totals.staleDefuserTicks,
      deadDefuserProgressTicks: totals.deadDefuserProgressTicks,
      deadDefuserCompletions: totals.deadDefuserCompletions,
      staleContestantRefs: totals.staleContestantRefs,
      blockedOnlyByStaleContestant: totals.blockedOnlyByStaleContestant,
      productionFreshGateDisagreements: totals.productionFreshGateDisagreements,
      players: playerSummary,
    };
    console.log(`eventSuiteDigest: ${suiteDigest}`);
    console.log(`eventOnlySuiteDigest: ${eventOnlySuiteDigest}`);
    console.log(`defuse summary: ${JSON.stringify(summary)}`);
    console.log("formal gameplay baseline: protected by separate cs_measure_r1 segment");
    console.log("statistics: not computed (no p-value; no significance gate)");

    console.log(`legacyEventSuiteV1: ${LEGACY_EXPECTED_EVENT_SUITE_V1}`);
    gate(EXPECTED_EVENT_SUITE_V2 !== "__CAPTURE_MANUALLY__", "EVENT_SUITE_NOT_LOCKED",
      `candidate=${suiteDigest}`);
    gate(suiteDigest === EXPECTED_EVENT_SUITE_V2, "DEFUSE_MEASUREMENT_REGRESSION",
      `expected=${EXPECTED_EVENT_SUITE_V2}\nactual=${suiteDigest}`);
    gate(EXPECTED_EVENT_ONLY_SUITE_V1 !== "__CAPTURE_MANUALLY__", "EVENT_ONLY_SUITE_NOT_LOCKED",
      `candidate=${eventOnlySuiteDigest}`);
    gate(eventOnlySuiteDigest === EXPECTED_EVENT_ONLY_SUITE_V1, "DEFUSE_EVENT_STREAM_REGRESSION",
      `expected=${EXPECTED_EVENT_ONLY_SUITE_V1}\nactual=${eventOnlySuiteDigest}`);
    console.log("CS Defuse R6: PASS");
  } finally {
    if (vite) await vite.close();
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.log(`CS Defuse R6: FAIL ${error?.message ?? String(error)}`);
  process.exitCode = 1;
});
