#!/usr/bin/env node
// CS True Clutch / LastAlive Instrumentation R4
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
const EVENT_SCHEMA = "CsTrueClutchInstrumentation.v1";
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
const EXPECTED_RAND_CALLS = 21;
const LEGACY_EXPECTED_EVENT_SUITE_V1 = "1a0e78c1073dea522dffa52e87aab4f094f4116a778d4cfe7a9fe9127aedc6d3";
const EXPECTED_EVENT_SUITE_V2 = "e3a32ac8990a1bd866936827701352cb4fdd8c665b1984e9eb2fd3942d6d0b0d";
const EXPECTED_EVENT_ONLY_SUITE_V1 = "4d8b082092a5a735c76b0c75d5618d3eec7be8f45ac7ce59ed8a25a3ab7f053c";

const SIGNATURE_MARKER = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster){";
const SIGNATURE_REPLACEMENT = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster,__measure=null){";
const ROUND_STATE_MARKER = "    let contactCalled=false,defuseCalled=false,defuseProg=0;";
const ROUND_STATE_REPLACEMENT = [
  ROUND_STATE_MARKER,
  "    const __clutchSeen=__measure?new Map():null;",
].join("\n");
const ALIVE_MARKER = '      const aliveT=ps.filter(p=>p.side==="t"&&!p.dead),aliveCT=ps.filter(p=>p.side==="ct"&&!p.dead);';
const ALIVE_REPLACEMENT = [
  ALIVE_MARKER,
  "      if(__clutchSeen){",
  '        for(const[__side,__mine,__opp] of [["t",aliveT,aliveCT],["ct",aliveCT,aliveT]]){',
  "          if(__mine.length===1&&__opp.length>=1){",
  "            const __player=__mine[0];",
  "            if(!__clutchSeen.has(__player.id)){",
  '              const __opportunity={round:rnd+1,sec,playerId:__player.id,side:__side,role:__player.role,hp:__player.hp,gun:__player.gun??null,opponentCount:__opp.length,opponentIds:__opp.map(__p=>__p.id).sort().join("|"),disadvantaged:__opp.length>=2};',
  "              __clutchSeen.set(__player.id,__opportunity);",
  '              __measure?.record("clutch_opportunity",__opportunity);',
  "            }",
  "          }",
  "        }",
  "      }",
].join("\n");
const FIRE_MARKER = "          if(rand()>=fireChance)continue;";
const FIRE_REPLACEMENT = [
  '          const __clutchPlayerIds=__clutchSeen?[tp.id,cp.id].filter(__id=>__clutchSeen.has(__id)).sort().join("|"):"";',
  '          if(__clutchPlayerIds)__measure?.record("clutch_combat_opportunity",{round:rnd+1,sec,tPlayerId:tp.id,cPlayerId:cp.id,clutchPlayerIds:__clutchPlayerIds,distance:d,sniperInvolved,fireChance});',
  FIRE_MARKER,
].join("\n");
const PT_MARKER = "          const Pt=clamp(0.5+(tSk-cSk)*0.013+(MAP_EDGE[mapKey]??0.02)+ecoEdge+flashPen+tacEdge,0.07,0.93); // 結構平衡 + 戰術剋制";
const PT_REPLACEMENT = [
  PT_MARKER,
  '          if(__clutchPlayerIds)__measure?.record("clutch_combat_trigger",{round:rnd+1,sec,tPlayerId:tp.id,cPlayerId:cp.id,clutchPlayerIds:__clutchPlayerIds,fireChance,tSkill:tSk,cSkill:cSk,pt:Pt});',
].join("\n");
const DAMAGE_MARKER = '          const hpBefore=df.hp,effectiveDamage=Math.min(dmg,hpBefore);\n          df.hp-=dmg;at.dmgDealt=(at.dmgDealt||0)+effectiveDamage;roundDmg[at.id]=(roundDmg[at.id]||0)+effectiveDamage;at.flash=3;df.flash=3;at.state="ENGAGE";df.state="ENGAGE";at.shooting=df.hp<=0?1:2;';
const DAMAGE_REPLACEMENT = [
  DAMAGE_MARKER,
  '          if(__clutchPlayerIds)__measure?.record("clutch_combat_conversion",{round:rnd+1,sec,tPlayerId:tp.id,cPlayerId:cp.id,clutchPlayerIds:__clutchPlayerIds,tWon:tw,attackerId:at.id,defenderId:df.id,pt:Pt,rolledDamage:dmg,hpBefore:df.hp+dmg,effectiveDamage:Math.min(dmg,df.hp+dmg),overkillDamage:Math.max(0,-df.hp),kill:df.hp<=0});',
].join("\n");
const CLUTCH_MARKER = "      const clutchId=(winSurv.length===1&&(roundKills[winSurv[0].id]||0)>=1)?winSurv[0].id:null; // 1打多殘局";
const CLUTCH_REPLACEMENT = [
  CLUTCH_MARKER,
  "      if(__clutchSeen){",
  "        const __opportunityPlayerIds=[...__clutchSeen.keys()].sort();",
  '        __clutchSeen.forEach(__opp=>__measure?.record("clutch_round_result",{round:rnd+1,playerId:__opp.playerId,side:__opp.side,opportunitySec:__opp.sec,opponentCount:__opp.opponentCount,won:wn===__opp.side,winner:wn,how:roundEnd.how,roundKills:roundKills[__opp.playerId]||0,legacyClutch:clutchId===__opp.playerId}));',
  '        __measure?.record("round_clutch_summary",{round:rnd+1,winner:wn,how:roundEnd.how,legacyClutchId:clutchId??null,opportunityPlayerIds:__opportunityPlayerIds.join("|")});',
  "      }",
].join("\n");
const RETURN_MARKER = "return { EsportsFPS3D, buildMatchResult };";
const RETURN_REPLACEMENT = "return { EsportsFPS3D, buildMatchResult, simulateFps, ROSTER, TACTICS_DB };";
const EXPORT_MARKER = "export { EsportsFPS3D, buildMatchResult };";
const EXPORT_REPLACEMENT = [
  "const __CS_CLUTCH_R4_TEST_API__ = Object.freeze({",
  "  simulateFps: __FPS3D_MODULE.simulateFps,",
  "  ROSTER: __FPS3D_MODULE.ROSTER,",
  "  TACTICS_DB: __FPS3D_MODULE.TACTICS_DB,",
  "});",
  "export { EsportsFPS3D, buildMatchResult, __CS_CLUTCH_R4_TEST_API__ };",
].join("\n");

const TRANSFORMS = Object.freeze([
  ["signature", SIGNATURE_MARKER, SIGNATURE_REPLACEMENT],
  ["round state", ROUND_STATE_MARKER, ROUND_STATE_REPLACEMENT],
  ["fresh alive", ALIVE_MARKER, ALIVE_REPLACEMENT],
  ["combat opportunity", FIRE_MARKER, FIRE_REPLACEMENT],
  ["combat trigger", PT_MARKER, PT_REPLACEMENT],
  ["combat conversion", DAMAGE_MARKER, DAMAGE_REPLACEMENT],
  ["round result", CLUTCH_MARKER, CLUTCH_REPLACEMENT],
  ["return export", RETURN_MARKER, RETURN_REPLACEMENT],
  ["module export", EXPORT_MARKER, EXPORT_REPLACEMENT],
]);

const EVENT_TYPES = new Set([
  "clutch_opportunity",
  "clutch_combat_opportunity",
  "clutch_combat_trigger",
  "clutch_combat_conversion",
  "clutch_round_result",
  "round_clutch_summary",
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

function opportunityKey(round, playerId) {
  return `${round}|${playerId}`;
}

function combatKey(event) {
  return [event.round, event.sec, event.tPlayerId, event.cPlayerId].join("|");
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
  const combatOpportunities = new Map();
  const triggers = new Map();
  const conversions = new Map();
  const roundResults = new Map();
  const roundSummaries = new Map();

  for (const event of events) {
    gate(event.schema === EVENT_SCHEMA, "EVENT_SCHEMA_MISMATCH", `seed=${seed}`);
    gate(Number.isInteger(event.round) && event.round >= 1, "EVENT_ROUND", `seed=${seed}`);

    if (event.type === "clutch_opportunity") {
      const key = opportunityKey(event.round, event.playerId);
      gate(!opportunities.has(key), "DUPLICATE_CLUTCH_OPPORTUNITY", `seed=${seed} key=${key}`);
      gate(Number.isInteger(event.sec) && event.sec >= 0 && event.sec <= 114,
        "OPPORTUNITY_SEC", `seed=${seed} key=${key}`);
      gate(["t", "ct"].includes(event.side), "OPPORTUNITY_SIDE", `seed=${seed} key=${key}`);
      gate(typeof event.playerId === "string" && typeof event.role === "string",
        "OPPORTUNITY_PLAYER", `seed=${seed} key=${key}`);
      gate(Number.isInteger(event.hp) && event.hp >= 1 && event.hp <= 100,
        "OPPORTUNITY_HP", `seed=${seed} key=${key} hp=${event.hp}`);
      gate(typeof event.gun === "string", "OPPORTUNITY_GUN", `seed=${seed} key=${key}`);
      gate(Number.isInteger(event.opponentCount) && event.opponentCount >= 1 && event.opponentCount <= 5,
        "OPPONENT_COUNT", `seed=${seed} key=${key}`);
      const opponentIds = parseIds(event.opponentIds);
      gate(opponentIds.length === event.opponentCount, "OPPONENT_ID_COUNT", `seed=${seed} key=${key}`);
      gate(event.disadvantaged === (event.opponentCount >= 2),
        "DISADVANTAGED_FLAG", `seed=${seed} key=${key}`);
      opportunities.set(key, event);
      continue;
    }

    if (event.type === "clutch_combat_opportunity") {
      const key = combatKey(event);
      gate(!combatOpportunities.has(key), "DUPLICATE_COMBAT_OPPORTUNITY", `seed=${seed} key=${key}`);
      gate(Number.isInteger(event.sec) && event.sec >= 0 && event.sec <= 114,
        "COMBAT_SEC", `seed=${seed} key=${key}`);
      const clutchIds = parseIds(event.clutchPlayerIds);
      gate(clutchIds.includes(event.tPlayerId) || clutchIds.includes(event.cPlayerId),
        "CLUTCH_NOT_IN_PAIR", `seed=${seed} key=${key}`);
      for (const playerId of clutchIds) {
        gate(playerId === event.tPlayerId || playerId === event.cPlayerId,
          "EXTRA_CLUTCH_PLAYER", `seed=${seed} key=${key} player=${playerId}`);
        const opportunity = opportunities.get(opportunityKey(event.round, playerId));
        gate(Boolean(opportunity), "COMBAT_WITHOUT_STATE_OPPORTUNITY",
          `seed=${seed} key=${key} player=${playerId}`);
        gate(opportunity.sec <= event.sec, "COMBAT_BEFORE_STATE_OPPORTUNITY",
          `seed=${seed} key=${key} player=${playerId}`);
      }
      gate(Number.isFinite(event.distance) && event.distance >= 0 && event.distance < 55,
        "COMBAT_DISTANCE", `seed=${seed} key=${key}`);
      gate(Number.isFinite(event.fireChance) && event.fireChance >= 0 && event.fireChance <= 1,
        "FIRE_CHANCE", `seed=${seed} key=${key}`);
      gate(typeof event.sniperInvolved === "boolean", "SNIPER_FLAG", `seed=${seed} key=${key}`);
      combatOpportunities.set(key, event);
      continue;
    }

    if (event.type === "clutch_combat_trigger") {
      const key = combatKey(event);
      const opportunity = combatOpportunities.get(key);
      gate(Boolean(opportunity), "TRIGGER_WITHOUT_COMBAT_OPPORTUNITY", `seed=${seed} key=${key}`);
      gate(!triggers.has(key), "DUPLICATE_COMBAT_TRIGGER", `seed=${seed} key=${key}`);
      gate(event.clutchPlayerIds === opportunity.clutchPlayerIds,
        "TRIGGER_CLUTCH_IDS_DRIFT", `seed=${seed} key=${key}`);
      gate(Object.is(event.fireChance, opportunity.fireChance),
        "TRIGGER_FIRE_CHANCE_DRIFT", `seed=${seed} key=${key}`);
      gate(Number.isFinite(event.tSkill) && Number.isFinite(event.cSkill),
        "TRIGGER_SKILL", `seed=${seed} key=${key}`);
      gate(Number.isFinite(event.pt) && event.pt >= 0.07 && event.pt <= 0.93,
        "TRIGGER_PT", `seed=${seed} key=${key}`);
      triggers.set(key, event);
      continue;
    }

    if (event.type === "clutch_combat_conversion") {
      const key = combatKey(event);
      const trigger = triggers.get(key);
      gate(Boolean(trigger), "CONVERSION_WITHOUT_TRIGGER", `seed=${seed} key=${key}`);
      gate(!conversions.has(key), "DUPLICATE_COMBAT_CONVERSION", `seed=${seed} key=${key}`);
      gate(event.clutchPlayerIds === trigger.clutchPlayerIds,
        "CONVERSION_CLUTCH_IDS_DRIFT", `seed=${seed} key=${key}`);
      gate(Object.is(event.pt, trigger.pt), "CONVERSION_PT_DRIFT", `seed=${seed} key=${key}`);
      gate([event.tPlayerId, event.cPlayerId].includes(event.attackerId)
        && [event.tPlayerId, event.cPlayerId].includes(event.defenderId)
        && event.attackerId !== event.defenderId,
      "CONVERSION_PARTICIPANTS", `seed=${seed} key=${key}`);
      gate(Number.isInteger(event.rolledDamage) && event.rolledDamage > 0,
        "ROLLED_DAMAGE", `seed=${seed} key=${key}`);
      gate(Number.isInteger(event.hpBefore) && event.hpBefore > 0,
        "HP_BEFORE", `seed=${seed} key=${key}`);
      gate(event.effectiveDamage === Math.min(event.rolledDamage, event.hpBefore),
        "EFFECTIVE_DAMAGE", `seed=${seed} key=${key}`);
      gate(event.overkillDamage === Math.max(0, event.rolledDamage - event.hpBefore),
        "OVERKILL_DAMAGE", `seed=${seed} key=${key}`);
      gate(event.kill === (event.rolledDamage >= event.hpBefore),
        "KILL_FLAG", `seed=${seed} key=${key}`);
      conversions.set(key, event);
      continue;
    }

    if (event.type === "clutch_round_result") {
      const key = opportunityKey(event.round, event.playerId);
      const opportunity = opportunities.get(key);
      gate(Boolean(opportunity), "ROUND_RESULT_WITHOUT_OPPORTUNITY", `seed=${seed} key=${key}`);
      gate(!roundResults.has(key), "DUPLICATE_ROUND_RESULT", `seed=${seed} key=${key}`);
      gate(event.side === opportunity.side
        && event.opportunitySec === opportunity.sec
        && event.opponentCount === opportunity.opponentCount,
      "ROUND_RESULT_OPPORTUNITY_DRIFT", `seed=${seed} key=${key}`);
      gate(event.won === (event.winner === event.side), "ROUND_WIN_FLAG", `seed=${seed} key=${key}`);
      gate(Number.isInteger(event.roundKills) && event.roundKills >= 0,
        "ROUND_KILLS", `seed=${seed} key=${key}`);
      gate(typeof event.legacyClutch === "boolean", "LEGACY_CLUTCH_FLAG", `seed=${seed} key=${key}`);
      roundResults.set(key, event);
      continue;
    }

    gate(event.type === "round_clutch_summary", "UNHANDLED_EVENT_TYPE", event.type);
    gate(!roundSummaries.has(event.round), "DUPLICATE_ROUND_SUMMARY", `seed=${seed} round=${event.round}`);
    gate(["t", "ct"].includes(event.winner), "SUMMARY_WINNER", `seed=${seed} round=${event.round}`);
    gate(typeof event.how === "string", "SUMMARY_HOW", `seed=${seed} round=${event.round}`);
    gate(event.legacyClutchId === null || typeof event.legacyClutchId === "string",
      "SUMMARY_LEGACY_ID", `seed=${seed} round=${event.round}`);
    parseIds(event.opportunityPlayerIds, { allowEmpty: true });
    roundSummaries.set(event.round, event);
  }

  gate(combatOpportunities.size >= triggers.size, "TRIGGERS_EXCEED_COMBAT_OPPORTUNITIES", `seed=${seed}`);
  gate(triggers.size === conversions.size, "TRIGGER_CONVERSION_MISMATCH", `seed=${seed}`);
  gate(roundResults.size === opportunities.size, "OPPORTUNITY_RESULT_MISMATCH", `seed=${seed}`);
  gate(roundSummaries.size === sim.rounds, "ROUND_SUMMARY_COUNT",
    `seed=${seed} expected=${sim.rounds} actual=${roundSummaries.size}`);

  for (const [key, opportunity] of opportunities) {
    gate(roundResults.has(key), "OPPORTUNITY_WITHOUT_RESULT", `seed=${seed} key=${key}`);
    const summary = roundSummaries.get(opportunity.round);
    gate(Boolean(summary), "OPPORTUNITY_WITHOUT_SUMMARY", `seed=${seed} key=${key}`);
  }

  for (let round = 1; round <= sim.rounds; round += 1) {
    const summary = roundSummaries.get(round);
    gate(Boolean(summary), "MISSING_ROUND_SUMMARY", `seed=${seed} round=${round}`);
    const expectedRound = sim.roundHist[round - 1];
    gate(summary.winner === expectedRound.winner && summary.how === expectedRound.how,
      "ROUND_SUMMARY_RESULT_DRIFT", `seed=${seed} round=${round}`);
    const expectedIds = [...opportunities.values()]
      .filter((event) => event.round === round)
      .map((event) => event.playerId)
      .sort()
      .join("|");
    gate(summary.opportunityPlayerIds === expectedIds,
      "ROUND_SUMMARY_OPPORTUNITY_IDS", `seed=${seed} round=${round}`);
    for (const playerId of parseIds(expectedIds, { allowEmpty: true })) {
      const result = roundResults.get(opportunityKey(round, playerId));
      gate(result.legacyClutch === (summary.legacyClutchId === playerId),
        "LEGACY_FLAG_DRIFT", `seed=${seed} round=${round} player=${playerId}`);
    }
  }

  const legacyCounts = new Map();
  for (const summary of roundSummaries.values()) {
    if (summary.legacyClutchId) {
      legacyCounts.set(summary.legacyClutchId, (legacyCounts.get(summary.legacyClutchId) ?? 0) + 1);
    }
  }
  for (const player of sim.players) {
    gate((legacyCounts.get(player.id) ?? 0) === player.clutches,
      "LEGACY_RESULT_AGGREGATE_DRIFT",
      `seed=${seed} player=${player.id} events=${legacyCounts.get(player.id) ?? 0} sim=${player.clutches}`);
  }

  const opportunityValues = [...opportunities.values()];
  const roundResultValues = [...roundResults.values()];
  const conversionValues = [...conversions.values()];
  let legacyWithoutOpportunity = 0;
  for (const summary of roundSummaries.values()) {
    if (summary.legacyClutchId
      && !opportunities.has(opportunityKey(summary.round, summary.legacyClutchId))) {
      legacyWithoutOpportunity += 1;
    }
  }
  return {
    rounds: sim.rounds,
    opportunities: opportunities.size,
    tOpportunities: opportunityValues.filter((event) => event.side === "t").length,
    ctOpportunities: opportunityValues.filter((event) => event.side === "ct").length,
    oneVsOneOpportunities: opportunityValues.filter((event) => event.opponentCount === 1).length,
    oneVsManyOpportunities: opportunityValues.filter((event) => event.opponentCount >= 2).length,
    oneVsTwoOpportunities: opportunityValues.filter((event) => event.opponentCount === 2).length,
    oneVsThreeOpportunities: opportunityValues.filter((event) => event.opponentCount === 3).length,
    oneVsFourOpportunities: opportunityValues.filter((event) => event.opponentCount === 4).length,
    oneVsFiveOpportunities: opportunityValues.filter((event) => event.opponentCount === 5).length,
    opportunityWins: roundResultValues.filter((event) => event.won).length,
    oneVsManyWins: roundResultValues.filter((event) => event.won && event.opponentCount >= 2).length,
    combatOpportunities: combatOpportunities.size,
    triggers: triggers.size,
    conversions: conversions.size,
    kills: conversionValues.filter((event) => event.kill).length,
    clutchAttackerKills: conversionValues.filter((event) =>
      event.kill && parseIds(event.clutchPlayerIds).includes(event.attackerId)).length,
    legacyClutches: [...legacyCounts.values()].reduce((sum, value) => sum + value, 0),
    legacyWithoutOpportunity,
    opportunityWinsNotLegacy: roundResultValues.filter((event) => event.won && !event.legacyClutch).length,
    nonLegacyWinBomb: roundResultValues.filter((event) => event.won && !event.legacyClutch && event.how === "bomb").length,
    nonLegacyWinDefuse: roundResultValues.filter((event) => event.won && !event.legacyClutch && event.how === "defuse").length,
    nonLegacyWinTime: roundResultValues.filter((event) => event.won && !event.legacyClutch && event.how === "time").length,
    nonLegacyWinElim: roundResultValues.filter((event) => event.won && !event.legacyClutch && event.how === "elim").length,
    targetT2Opportunities: opportunityValues.filter((event) => event.playerId === "t2").length,
    targetT2CombatOpportunities: [...combatOpportunities.values()].filter((event) =>
      parseIds(event.clutchPlayerIds).includes("t2")).length,
    targetT2Wins: roundResultValues.filter((event) => event.playerId === "t2" && event.won).length,
  };
}

function addCounts(target, source) {
  for (const [key, value] of Object.entries(source)) target[key] = (target[key] ?? 0) + value;
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
  const tempRoot = mkdtempSync(join(tmpdir(), "esmo-cs-clutch-r4-"));
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
        name: "cs-clutch-r4-memory-hooks",
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
    const api = loaded.__CS_CLUTCH_R4_TEST_API__;
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
    gate(totals.opportunities > 0, "NO_CLUTCH_OPPORTUNITIES");
    gate(totals.oneVsManyOpportunities > 0, "NO_ONE_VS_MANY_OPPORTUNITIES");
    gate(totals.combatOpportunities > 0, "NO_CLUTCH_COMBAT_OPPORTUNITIES");
    gate(totals.conversions > 0, "NO_CLUTCH_COMBAT_CONVERSIONS");
    gate(totals.triggers === totals.conversions, "SUITE_TRIGGER_CONVERSION_MISMATCH");

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
    const summary = {
      simulations: FIXED_SEEDS.length * 3,
      rounds: totals.rounds,
      opportunities: totals.opportunities,
      tOpportunities: totals.tOpportunities,
      ctOpportunities: totals.ctOpportunities,
      oneVsOneOpportunities: totals.oneVsOneOpportunities,
      oneVsManyOpportunities: totals.oneVsManyOpportunities,
      oneVsTwoOpportunities: totals.oneVsTwoOpportunities,
      oneVsThreeOpportunities: totals.oneVsThreeOpportunities,
      oneVsFourOpportunities: totals.oneVsFourOpportunities,
      oneVsFiveOpportunities: totals.oneVsFiveOpportunities,
      opportunityWins: totals.opportunityWins,
      opportunityWinPct: percent(totals.opportunityWins, totals.opportunities),
      oneVsManyWins: totals.oneVsManyWins,
      oneVsManyWinPct: percent(totals.oneVsManyWins, totals.oneVsManyOpportunities),
      combatOpportunities: totals.combatOpportunities,
      triggers: totals.triggers,
      triggerPct: percent(totals.triggers, totals.combatOpportunities),
      conversions: totals.conversions,
      kills: totals.kills,
      clutchAttackerKills: totals.clutchAttackerKills,
      legacyClutches: totals.legacyClutches,
      legacyWithoutOpportunity: totals.legacyWithoutOpportunity,
      opportunityWinsNotLegacy: totals.opportunityWinsNotLegacy,
      nonLegacyWinBomb: totals.nonLegacyWinBomb,
      nonLegacyWinDefuse: totals.nonLegacyWinDefuse,
      nonLegacyWinTime: totals.nonLegacyWinTime,
      nonLegacyWinElim: totals.nonLegacyWinElim,
      targetT2Opportunities: totals.targetT2Opportunities,
      targetT2CombatOpportunities: totals.targetT2CombatOpportunities,
      targetT2Wins: totals.targetT2Wins,
    };
    console.log(`eventSuiteDigest: ${suiteDigest}`);
    console.log(`eventOnlySuiteDigest: ${eventOnlySuiteDigest}`);
    console.log(`clutch summary: ${JSON.stringify(summary)}`);
    console.log("formal gameplay baseline: protected by separate cs_measure_r1 segment");
    console.log("statistics: not computed (no p-value; no significance gate)");

    console.log(`legacyEventSuiteV1: ${LEGACY_EXPECTED_EVENT_SUITE_V1}`);
    gate(EXPECTED_EVENT_SUITE_V2 !== "__CAPTURE_MANUALLY__", "EVENT_SUITE_NOT_LOCKED",
      `candidate=${suiteDigest}`);
    gate(suiteDigest === EXPECTED_EVENT_SUITE_V2, "CLUTCH_MEASUREMENT_REGRESSION",
      `expected=${EXPECTED_EVENT_SUITE_V2}\nactual=${suiteDigest}`);
    gate(EXPECTED_EVENT_ONLY_SUITE_V1 !== "__CAPTURE_MANUALLY__", "EVENT_ONLY_SUITE_NOT_LOCKED",
      `candidate=${eventOnlySuiteDigest}`);
    gate(eventOnlySuiteDigest === EXPECTED_EVENT_ONLY_SUITE_V1, "CLUTCH_EVENT_STREAM_REGRESSION",
      `expected=${EXPECTED_EVENT_ONLY_SUITE_V1}\nactual=${eventOnlySuiteDigest}`);
    console.log("CS True Clutch R4: PASS");
  } finally {
    if (vite) await vite.close();
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.log(`CS True Clutch R4: FAIL ${error?.message ?? String(error)}`);
  process.exitCode = 1;
});
