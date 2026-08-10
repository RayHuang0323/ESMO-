#!/usr/bin/env node
// CS Retreat Instrumentation R5
// Production FPS source stays untouched; all hooks are exact Vite memory transforms.

import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FPS_FILE = resolve(ROOT, "src/battle/fps/EsportsFPS3D.jsx");
const FPS_MODULE_ID = "/src/battle/fps/EsportsFPS3D.jsx";
const EVENT_SCHEMA = "CsRetreatInstrumentation.v1";
const SEED_GENERATION_VERSION = "CsMeasurementSeedSet.v1";
const SEED_NAMESPACE = "ESMO:CsMeasurementPilot.v1:";
const FIXED_SEEDS = Object.freeze([
  3978742910, 4200255727, 541349949, 1011896540,
  44863398, 1878380147, 638784133, 2852978760,
  1789562418, 3820910912, 3991584863, 2186970694,
  951543597, 2082574495, 474649321, 3950420867,
]);
const EXPECTED_SEED_SET_SHA256 = "52414f0e6b09ba72b9223b5e76b6ad9d859e8b8ea6fe77dcc2a2a08876a74c6d";
const CAPTURED_ENGINE_SOURCE_SHA256 = "5b9360f457c95034cdfdc9e864c04a761e1afdba01501c7e383bb9075e048c3d";
const EXPECTED_RAND_CALLS = 21;
const EXPECTED_EVENT_SUITE_V1 = "4e94fc5c2e95633f7972d19b8864e846b793a893dbdb9a8610e84f01c87c6f20";

const SIGNATURE_MARKER = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster){";
const SIGNATURE_REPLACEMENT = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster,__measure=null){";
const ROUND_STATE_MARKER = "    let contactCalled=false,defuseCalled=false,defuseProg=0;";
const ROUND_STATE_REPLACEMENT = [
  ROUND_STATE_MARKER,
  "    const __retreatState=__measure?new Map():null;",
].join("\n");
const MATES_MARKER = '         const mates=(p.side==="t"?aliveT:aliveCT).length;';
const MATES_REPLACEMENT = [
  MATES_MARKER,
  '         const __retreatMeasure=__measure&&near&&!buyP&&dist(near.pos,p.pos)<32&&p.hp<48&&mates>1?{distance:dist(near.pos,p.pos),aggr:aggr(p)}:null;',
  '         if(__retreatMeasure)__measure.record("retreat_opportunity",{round:rnd+1,sec,playerId:p.id,side:p.side,role:p.role,hp:p.hp,mates,enemyId:near.id,distance:__retreatMeasure.distance,aggr:__retreatMeasure.aggr,threshold:0.82,gatePassed:__retreatMeasure.aggr<0.82});',
].join("\n");
const TRIGGER_MARKER = "         if(near&&!buyP&&dist(near.pos,p.pos)<32&&p.hp<48&&aggr(p)<0.82&&mates>1){";
const TRIGGER_REPLACEMENT = [
  TRIGGER_MARKER,
  "           const __retreatFrom=__retreatState?{x:p.pos.x,y:p.pos.y}:null;",
  "           if(__retreatState){",
  "             let __episode=__retreatState.get(p.id);",
  '             if(!__episode){__episode={playerId:p.id,side:p.side,role:p.role,startSec:sec,lastSec:sec,triggerTicks:0,totalDistance:0,recontacted:false,reengaged:false};__retreatState.set(p.id,__episode);}',
  "             __episode.lastSec=sec;__episode.triggerTicks++;",
  '             __measure.record("retreat_trigger",{round:rnd+1,sec,playerId:p.id,side:p.side,role:p.role,hp:p.hp,mates,enemyId:near.id,distance:__retreatMeasure.distance,aggr:__retreatMeasure.aggr,threshold:0.82,fromX:__retreatFrom.x,fromY:__retreatFrom.y});',
  "           }",
].join("\n");
const DISPLACEMENT_MARKER = "           p.pos=safeMove(p.pos,{x:p.pos.x+dx/L*3.2,y:p.pos.y+dy/L*3.2},walls,PLAYER_R);";
const DISPLACEMENT_REPLACEMENT = [
  DISPLACEMENT_MARKER,
  "           if(__retreatState){",
  "             const __episode=__retreatState.get(p.id);const __distance=Math.hypot(p.pos.x-__retreatFrom.x,p.pos.y-__retreatFrom.y);__episode.totalDistance+=__distance;",
  '             __measure.record("retreat_displacement",{round:rnd+1,sec,playerId:p.id,fromX:__retreatFrom.x,fromY:__retreatFrom.y,toX:p.pos.x,toY:p.pos.y,distance:__distance});',
  "           }",
].join("\n");
const FIRE_MARKER = "          if(rand()>=fireChance)continue;";
const FIRE_REPLACEMENT = [
  '          const __retreatPairIds=__retreatState?[tp.id,cp.id].filter(__id=>{const __ep=__retreatState.get(__id);return __ep&&__ep.lastSec<sec;}).sort():[];',
  '          const __retreatRecontactIds=__retreatPairIds.filter(__id=>!__retreatState.get(__id).recontacted);',
  "          if(__retreatRecontactIds.length){",
  '            for(const __id of __retreatRecontactIds)__retreatState.get(__id).recontacted=true;',
  '            __measure?.record("retreat_recontact",{round:rnd+1,sec,tPlayerId:tp.id,cPlayerId:cp.id,playerIds:__retreatRecontactIds.join("|"),distance:d,fireChance});',
  "          }",
  '          const __retreatReengageIds=__retreatPairIds.filter(__id=>!__retreatState.get(__id).reengaged);',
  FIRE_MARKER,
  "          if(__retreatReengageIds.length){",
  '            for(const __id of __retreatReengageIds)__retreatState.get(__id).reengaged=true;',
  '            __measure?.record("retreat_reengage",{round:rnd+1,sec,tPlayerId:tp.id,cPlayerId:cp.id,playerIds:__retreatReengageIds.join("|"),fireChance});',
  "          }",
].join("\n");
const ROUND_RESULT_MARKER = "      const wn=roundEnd.winner;";
const ROUND_RESULT_REPLACEMENT = [
  ROUND_RESULT_MARKER,
  "      if(__retreatState){",
  "        const __retreatPlayerIds=[...__retreatState.keys()].sort();",
  '        __retreatState.forEach(__ep=>{const __player=ps.find(__p=>__p.id===__ep.playerId);__measure?.record("retreat_round_result",{round:rnd+1,playerId:__ep.playerId,side:__ep.side,role:__ep.role,startSec:__ep.startSec,lastSec:__ep.lastSec,triggerTicks:__ep.triggerTicks,totalDistance:__ep.totalDistance,recontacted:__ep.recontacted,reengaged:__ep.reengaged,survived:Boolean(__player&&!__player.dead),won:wn===__ep.side,winner:wn,how:roundEnd.how,roundKills:roundKills[__ep.playerId]||0});});',
  '        __measure?.record("retreat_round_summary",{round:rnd+1,winner:wn,how:roundEnd.how,episodePlayerIds:__retreatPlayerIds.join("|")});',
  "      }",
].join("\n");
const RETURN_MARKER = "return { EsportsFPS3D, buildMatchResult };";
const RETURN_REPLACEMENT = "return { EsportsFPS3D, buildMatchResult, simulateFps, ROSTER, TACTICS_DB };";
const EXPORT_MARKER = "export { EsportsFPS3D, buildMatchResult };";
const EXPORT_REPLACEMENT = [
  "const __CS_RETREAT_R5_TEST_API__ = Object.freeze({",
  "  simulateFps: __FPS3D_MODULE.simulateFps,",
  "  ROSTER: __FPS3D_MODULE.ROSTER,",
  "  TACTICS_DB: __FPS3D_MODULE.TACTICS_DB,",
  "});",
  "export { EsportsFPS3D, buildMatchResult, __CS_RETREAT_R5_TEST_API__ };",
].join("\n");

const TRANSFORMS = Object.freeze([
  ["signature", SIGNATURE_MARKER, SIGNATURE_REPLACEMENT],
  ["round state", ROUND_STATE_MARKER, ROUND_STATE_REPLACEMENT],
  ["opportunity", MATES_MARKER, MATES_REPLACEMENT],
  ["trigger", TRIGGER_MARKER, TRIGGER_REPLACEMENT],
  ["displacement", DISPLACEMENT_MARKER, DISPLACEMENT_REPLACEMENT],
  ["recontact/reengage", FIRE_MARKER, FIRE_REPLACEMENT],
  ["round result", ROUND_RESULT_MARKER, ROUND_RESULT_REPLACEMENT],
  ["return export", RETURN_MARKER, RETURN_REPLACEMENT],
  ["module export", EXPORT_MARKER, EXPORT_REPLACEMENT],
]);

const EVENT_TYPES = new Set([
  "retreat_opportunity",
  "retreat_trigger",
  "retreat_displacement",
  "retreat_recontact",
  "retreat_reengage",
  "retreat_round_result",
  "retreat_round_summary",
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

function parseIds(text, { allowEmpty = false } = {}) {
  gate(typeof text === "string", "ID_LIST_TYPE", String(text));
  if (text === "") {
    gate(allowEmpty, "EMPTY_ID_LIST");
    return [];
  }
  const ids = text.split("|");
  gate(ids.every(Boolean), "BLANK_ID");
  gate(new Set(ids).size === ids.length, "DUPLICATE_ID", text);
  gate([...ids].sort().join("|") === text, "UNSORTED_ID_LIST", text);
  return ids;
}

function tickKey(round, sec, playerId) {
  return `${round}|${sec}|${playerId}`;
}

function episodeKey(round, playerId) {
  return `${round}|${playerId}`;
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
  const opportunities = new Map();
  const triggers = new Map();
  const displacements = new Map();
  const episodes = new Map();
  const recontacts = new Map();
  const reengages = new Map();
  const roundResults = new Map();
  const roundSummaries = new Map();

  for (const event of events) {
    gate(event.schema === EVENT_SCHEMA, "EVENT_SCHEMA_MISMATCH", `seed=${seed}`);
    gate(Number.isInteger(event.round) && event.round >= 1, "EVENT_ROUND", `seed=${seed}`);

    if (event.type === "retreat_opportunity") {
      const key = tickKey(event.round, event.sec, event.playerId);
      gate(!opportunities.has(key), "DUPLICATE_OPPORTUNITY", `seed=${seed} key=${key}`);
      gate(Number.isInteger(event.sec) && event.sec >= 0 && event.sec <= 114,
        "OPPORTUNITY_SEC", `seed=${seed} key=${key}`);
      gate(typeof event.playerId === "string" && ["t", "ct"].includes(event.side)
        && typeof event.role === "string" && typeof event.enemyId === "string",
      "OPPORTUNITY_IDENTITY", `seed=${seed} key=${key}`);
      gate(Number.isInteger(event.hp) && event.hp >= 1 && event.hp < 48,
        "OPPORTUNITY_HP", `seed=${seed} key=${key} hp=${event.hp}`);
      gate(Number.isInteger(event.mates) && event.mates > 1 && event.mates <= 5,
        "OPPORTUNITY_MATES", `seed=${seed} key=${key} mates=${event.mates}`);
      gate(Number.isFinite(event.distance) && event.distance >= 0 && event.distance < 32,
        "OPPORTUNITY_DISTANCE", `seed=${seed} key=${key} distance=${event.distance}`);
      gate(Number.isFinite(event.aggr) && event.aggr >= 0.2 && event.aggr <= 1.15,
        "OPPORTUNITY_AGGR", `seed=${seed} key=${key} aggr=${event.aggr}`);
      gate(event.threshold === 0.82, "OPPORTUNITY_THRESHOLD", `seed=${seed} key=${key}`);
      gate(event.gatePassed === (event.aggr < event.threshold),
        "OPPORTUNITY_GATE_FLAG", `seed=${seed} key=${key}`);
      opportunities.set(key, event);
      continue;
    }

    if (event.type === "retreat_trigger") {
      const key = tickKey(event.round, event.sec, event.playerId);
      const opportunity = opportunities.get(key);
      gate(Boolean(opportunity), "TRIGGER_WITHOUT_OPPORTUNITY", `seed=${seed} key=${key}`);
      gate(!triggers.has(key), "DUPLICATE_TRIGGER", `seed=${seed} key=${key}`);
      gate(opportunity.gatePassed, "TRIGGER_WITH_FALSE_GATE", `seed=${seed} key=${key}`);
      for (const field of ["side", "role", "hp", "mates", "enemyId", "distance", "aggr", "threshold"]) {
        gate(Object.is(event[field], opportunity[field]), "TRIGGER_OPPORTUNITY_DRIFT",
          `seed=${seed} key=${key} field=${field}`);
      }
      gate(Number.isFinite(event.fromX) && Number.isFinite(event.fromY),
        "TRIGGER_POSITION", `seed=${seed} key=${key}`);
      triggers.set(key, event);
      const epKey = episodeKey(event.round, event.playerId);
      if (!episodes.has(epKey)) {
        episodes.set(epKey, {
          round: event.round,
          playerId: event.playerId,
          side: event.side,
          role: event.role,
          startSec: event.sec,
        });
      }
      continue;
    }

    if (event.type === "retreat_displacement") {
      const key = tickKey(event.round, event.sec, event.playerId);
      const trigger = triggers.get(key);
      gate(Boolean(trigger), "DISPLACEMENT_WITHOUT_TRIGGER", `seed=${seed} key=${key}`);
      gate(!displacements.has(key), "DUPLICATE_DISPLACEMENT", `seed=${seed} key=${key}`);
      gate(Object.is(event.fromX, trigger.fromX) && Object.is(event.fromY, trigger.fromY),
        "DISPLACEMENT_FROM_DRIFT", `seed=${seed} key=${key}`);
      for (const field of ["toX", "toY", "distance"]) {
        gate(Number.isFinite(event[field]), "DISPLACEMENT_NON_FINITE",
          `seed=${seed} key=${key} field=${field}`);
      }
      const expectedDistance = Math.hypot(event.toX - event.fromX, event.toY - event.fromY);
      gate(Math.abs(event.distance - expectedDistance) <= 1e-9,
        "DISPLACEMENT_DISTANCE_DRIFT", `seed=${seed} key=${key}`);
      gate(event.distance >= 0 && event.distance <= 3.200001,
        "DISPLACEMENT_RANGE", `seed=${seed} key=${key} distance=${event.distance}`);
      displacements.set(key, event);
      continue;
    }

    if (event.type === "retreat_recontact" || event.type === "retreat_reengage") {
      gate(Number.isInteger(event.sec) && event.sec >= 0 && event.sec <= 114,
        "RECONTACT_SEC", `seed=${seed} round=${event.round}`);
      const playerIds = parseIds(event.playerIds);
      gate(playerIds.every((id) => id === event.tPlayerId || id === event.cPlayerId),
        "RECONTACT_PLAYER_NOT_IN_PAIR", `seed=${seed} round=${event.round}`);
      gate(Number.isFinite(event.fireChance) && event.fireChance >= 0 && event.fireChance <= 1,
        "RECONTACT_FIRE_CHANCE", `seed=${seed} round=${event.round}`);
      if (event.type === "retreat_recontact") {
        gate(Number.isFinite(event.distance) && event.distance >= 0 && event.distance < 55,
          "RECONTACT_DISTANCE", `seed=${seed} round=${event.round}`);
      }
      for (const playerId of playerIds) {
        const epKey = episodeKey(event.round, playerId);
        gate(episodes.has(epKey), "CONTACT_WITHOUT_EPISODE", `seed=${seed} key=${epKey}`);
        const priorTriggers = [...triggers.values()]
          .filter((trigger) => trigger.round === event.round && trigger.playerId === playerId);
        const lastTriggerSec = Math.max(...priorTriggers.map((trigger) => trigger.sec));
        gate(lastTriggerSec < event.sec, "CONTACT_NOT_AFTER_RETREAT", `seed=${seed} key=${epKey}`);
        if (event.type === "retreat_recontact") {
          gate(!recontacts.has(epKey), "DUPLICATE_RECONTACT", `seed=${seed} key=${epKey}`);
          recontacts.set(epKey, event);
        } else {
          gate(recontacts.has(epKey), "REENGAGE_WITHOUT_RECONTACT", `seed=${seed} key=${epKey}`);
          gate(!reengages.has(epKey), "DUPLICATE_REENGAGE", `seed=${seed} key=${epKey}`);
          gate(recontacts.get(epKey).sec <= event.sec,
            "REENGAGE_BEFORE_RECONTACT", `seed=${seed} key=${epKey}`);
          reengages.set(epKey, event);
        }
      }
      continue;
    }

    if (event.type === "retreat_round_result") {
      const epKey = episodeKey(event.round, event.playerId);
      const episode = episodes.get(epKey);
      gate(Boolean(episode), "ROUND_RESULT_WITHOUT_EPISODE", `seed=${seed} key=${epKey}`);
      gate(!roundResults.has(epKey), "DUPLICATE_ROUND_RESULT", `seed=${seed} key=${epKey}`);
      gate(event.side === episode.side && event.role === episode.role && event.startSec === episode.startSec,
        "ROUND_RESULT_EPISODE_DRIFT", `seed=${seed} key=${epKey}`);
      const episodeTriggers = [...triggers.values()]
        .filter((trigger) => trigger.round === event.round && trigger.playerId === event.playerId);
      const episodeDisplacements = [...displacements.values()]
        .filter((item) => item.round === event.round && item.playerId === event.playerId);
      gate(event.triggerTicks === episodeTriggers.length,
        "ROUND_RESULT_TRIGGER_COUNT", `seed=${seed} key=${epKey}`);
      gate(event.lastSec === Math.max(...episodeTriggers.map((trigger) => trigger.sec)),
        "ROUND_RESULT_LAST_SEC", `seed=${seed} key=${epKey}`);
      const totalDistance = episodeDisplacements.reduce((sum, item) => sum + item.distance, 0);
      gate(Math.abs(event.totalDistance - totalDistance) <= 1e-9,
        "ROUND_RESULT_DISTANCE", `seed=${seed} key=${epKey}`);
      gate(event.recontacted === recontacts.has(epKey), "ROUND_RESULT_RECONTACT_FLAG", `seed=${seed} key=${epKey}`);
      gate(event.reengaged === reengages.has(epKey), "ROUND_RESULT_REENGAGE_FLAG", `seed=${seed} key=${epKey}`);
      gate(!event.reengaged || event.recontacted, "REENGAGE_WITHOUT_RECONTACT_FLAG", `seed=${seed} key=${epKey}`);
      gate(typeof event.survived === "boolean" && event.won === (event.winner === event.side),
        "ROUND_RESULT_FLAGS", `seed=${seed} key=${epKey}`);
      gate(Number.isInteger(event.roundKills) && event.roundKills >= 0,
        "ROUND_RESULT_KILLS", `seed=${seed} key=${epKey}`);
      roundResults.set(epKey, event);
      continue;
    }

    gate(event.type === "retreat_round_summary", "UNHANDLED_EVENT_TYPE", event.type);
    gate(!roundSummaries.has(event.round), "DUPLICATE_ROUND_SUMMARY", `seed=${seed} round=${event.round}`);
    gate(["t", "ct"].includes(event.winner) && typeof event.how === "string",
      "ROUND_SUMMARY_RESULT", `seed=${seed} round=${event.round}`);
    parseIds(event.episodePlayerIds, { allowEmpty: true });
    roundSummaries.set(event.round, event);
  }

  const gatePasses = [...opportunities.values()].filter((event) => event.gatePassed).length;
  gate(opportunities.size >= triggers.size, "TRIGGERS_EXCEED_OPPORTUNITIES", `seed=${seed}`);
  gate(gatePasses === triggers.size, "GATE_TRIGGER_MISMATCH",
    `seed=${seed} gates=${gatePasses} triggers=${triggers.size}`);
  gate(triggers.size === displacements.size, "TRIGGER_DISPLACEMENT_MISMATCH", `seed=${seed}`);
  gate(episodes.size === roundResults.size, "EPISODE_RESULT_MISMATCH", `seed=${seed}`);
  gate(roundSummaries.size === sim.rounds, "ROUND_SUMMARY_COUNT",
    `seed=${seed} expected=${sim.rounds} actual=${roundSummaries.size}`);

  for (let round = 1; round <= sim.rounds; round += 1) {
    const summary = roundSummaries.get(round);
    gate(Boolean(summary), "MISSING_ROUND_SUMMARY", `seed=${seed} round=${round}`);
    const expectedRound = sim.roundHist[round - 1];
    gate(summary.winner === expectedRound.winner && summary.how === expectedRound.how,
      "ROUND_SUMMARY_RESULT_DRIFT", `seed=${seed} round=${round}`);
    const expectedIds = [...episodes.values()]
      .filter((episode) => episode.round === round)
      .map((episode) => episode.playerId)
      .sort()
      .join("|");
    gate(summary.episodePlayerIds === expectedIds,
      "ROUND_SUMMARY_EPISODE_IDS", `seed=${seed} round=${round}`);
    for (const playerId of parseIds(expectedIds, { allowEmpty: true })) {
      const result = roundResults.get(episodeKey(round, playerId));
      gate(Boolean(result), "SUMMARY_EPISODE_WITHOUT_RESULT",
        `seed=${seed} round=${round} player=${playerId}`);
      gate(result.winner === summary.winner && result.how === summary.how,
        "SUMMARY_RESULT_DRIFT", `seed=${seed} round=${round} player=${playerId}`);
    }
  }

  const opportunityValues = [...opportunities.values()];
  const triggerValues = [...triggers.values()];
  const displacementValues = [...displacements.values()];
  const episodeValues = [...episodes.values()];
  const resultValues = [...roundResults.values()];
  const totalDistance = displacementValues.reduce((sum, event) => sum + event.distance, 0);
  const players = Object.fromEntries(sim.players.map((player) => {
    const playerOpportunities = opportunityValues.filter((event) => event.playerId === player.id);
    const epKeySuffix = `|${player.id}`;
    return [player.id, {
      opportunities: playerOpportunities.length,
      aggrSum: playerOpportunities.reduce((sum, event) => sum + event.aggr, 0),
      gatePasses: playerOpportunities.filter((event) => event.gatePassed).length,
      triggers: triggerValues.filter((event) => event.playerId === player.id).length,
      episodes: episodeValues.filter((event) => event.playerId === player.id).length,
      recontacts: [...recontacts.keys()].filter((key) => key.endsWith(epKeySuffix)).length,
      reengages: [...reengages.keys()].filter((key) => key.endsWith(epKeySuffix)).length,
    }];
  }));
  return {
    rounds: sim.rounds,
    opportunities: opportunities.size,
    opportunityAggrSum: opportunityValues.reduce((sum, event) => sum + event.aggr, 0),
    gatePasses,
    blockedByAggr: opportunityValues.filter((event) => !event.gatePassed).length,
    nearAboveGate: opportunityValues.filter((event) => event.aggr >= 0.82 && event.aggr < 0.87).length,
    triggers: triggers.size,
    displacements: displacements.size,
    totalDistance,
    zeroDisplacements: displacementValues.filter((event) => event.distance <= 1e-9).length,
    episodes: episodes.size,
    tEpisodes: episodeValues.filter((event) => event.side === "t").length,
    ctEpisodes: episodeValues.filter((event) => event.side === "ct").length,
    recontacts: recontacts.size,
    reengages: reengages.size,
    survivedEpisodes: resultValues.filter((event) => event.survived).length,
    wonEpisodes: resultValues.filter((event) => event.won).length,
    survivedAndWon: resultValues.filter((event) => event.survived && event.won).length,
    reengagedWins: resultValues.filter((event) => event.reengaged && event.won).length,
    noReengageWins: resultValues.filter((event) => !event.reengaged && event.won).length,
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
  const originalSource = readFileSync(FPS_FILE, "utf8");
  const sourceSha256 = sha256(originalSource);
  gate(sourceSha256 === CAPTURED_ENGINE_SOURCE_SHA256, "SOURCE_PROVENANCE_MISMATCH",
    `expected=${CAPTURED_ENGINE_SOURCE_SHA256}\nactual=${sourceSha256}`);
  for (const [name, marker] of TRANSFORMS) {
    gate(occurrences(originalSource, marker) === 1, "MARKER_COUNT", `name=${name}`);
  }
  const originalRandTokens = randTokens(originalSource);
  const originalRngTokens = rngTokens(originalSource);
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
  const tempRoot = mkdtempSync(join(tmpdir(), "esmo-cs-retreat-r5-"));
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
        name: "cs-retreat-r5-memory-hooks",
        enforce: "pre",
        transform(code, id) {
          const cleanId = resolve(id.split("?")[0]).toLowerCase();
          if (cleanId !== FPS_FILE.toLowerCase()) return null;
          transformSeen += 1;
          gate(code === originalSource, "VITE_SOURCE_MISMATCH");
          let transformed = code;
          for (const [name, marker, replacement] of TRANSFORMS) {
            gate(occurrences(transformed, marker) === 1, "TRANSFORM_MARKER_COUNT", `name=${name}`);
            transformed = transformed.replace(marker, replacement);
          }
          let restored = transformed;
          for (const [name, marker, replacement] of [...TRANSFORMS].reverse()) {
            gate(occurrences(restored, replacement) === 1, "REPLACEMENT_COUNT", `name=${name}`);
            restored = restored.replace(replacement, marker);
          }
          transformRestoredExactly = restored === code;
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
    const api = loaded.__CS_RETREAT_R5_TEST_API__;
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
    gate(totals.opportunities > 0, "NO_RETREAT_OPPORTUNITIES");
    gate(totals.triggers > 0, "NO_RETREAT_TRIGGERS");
    gate(totals.episodes > 0, "NO_RETREAT_EPISODES");
    gate(totals.recontacts > 0, "NO_RETREAT_RECONTACTS");
    gate(totals.reengages > 0, "NO_RETREAT_REENGAGES");
    gate(totals.gatePasses === totals.triggers, "SUITE_GATE_TRIGGER_MISMATCH");
    gate(totals.triggers === totals.displacements, "SUITE_TRIGGER_DISPLACEMENT_MISMATCH");

    const suiteDigest = sha256(canonicalJson({
      schema: EVENT_SCHEMA,
      seedGenerationVersion: SEED_GENERATION_VERSION,
      seedSetSha256,
      suite,
    }));
    const playerSummary = Object.fromEntries(Object.entries(totals.players).map(([id, player]) => [id, {
      role: roster.find((item) => item.id === id)?.role ?? null,
      opportunities: player.opportunities,
      avgAggr: player.opportunities ? +(player.aggrSum / player.opportunities).toFixed(4) : null,
      gatePasses: player.gatePasses,
      triggers: player.triggers,
      episodes: player.episodes,
      recontacts: player.recontacts,
      reengages: player.reengages,
    }]));
    const summary = {
      simulations: FIXED_SEEDS.length * 3,
      rounds: totals.rounds,
      opportunities: totals.opportunities,
      avgOpportunityAggr: +(totals.opportunityAggrSum / totals.opportunities).toFixed(4),
      gatePasses: totals.gatePasses,
      blockedByAggr: totals.blockedByAggr,
      nearAboveGate: totals.nearAboveGate,
      triggers: totals.triggers,
      triggerPct: percent(totals.triggers, totals.opportunities),
      displacements: totals.displacements,
      totalDistance: +totals.totalDistance.toFixed(3),
      avgDistance: +(totals.totalDistance / totals.displacements).toFixed(3),
      zeroDisplacements: totals.zeroDisplacements,
      episodes: totals.episodes,
      tEpisodes: totals.tEpisodes,
      ctEpisodes: totals.ctEpisodes,
      recontacts: totals.recontacts,
      recontactPct: percent(totals.recontacts, totals.episodes),
      reengages: totals.reengages,
      reengagePct: percent(totals.reengages, totals.episodes),
      survivedEpisodes: totals.survivedEpisodes,
      survivalPct: percent(totals.survivedEpisodes, totals.episodes),
      wonEpisodes: totals.wonEpisodes,
      winPct: percent(totals.wonEpisodes, totals.episodes),
      survivedAndWon: totals.survivedAndWon,
      reengagedWins: totals.reengagedWins,
      noReengageWins: totals.noReengageWins,
      players: playerSummary,
    };
    console.log(`eventSuiteDigest: ${suiteDigest}`);
    console.log(`retreat summary: ${JSON.stringify(summary)}`);
    console.log("formal gameplay baseline: protected by separate cs_measure_r1 segment");
    console.log("statistics: not computed (no p-value; no significance gate)");

    gate(EXPECTED_EVENT_SUITE_V1 !== "__CAPTURE_MANUALLY__", "EVENT_SUITE_NOT_LOCKED",
      `candidate=${suiteDigest}`);
    gate(suiteDigest === EXPECTED_EVENT_SUITE_V1, "RETREAT_MEASUREMENT_REGRESSION",
      `expected=${EXPECTED_EVENT_SUITE_V1}\nactual=${suiteDigest}`);
    console.log("CS Retreat R5: PASS");
  } finally {
    if (vite) await vite.close();
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.log(`CS Retreat R5: FAIL ${error?.message ?? String(error)}`);
  process.exitCode = 1;
});
