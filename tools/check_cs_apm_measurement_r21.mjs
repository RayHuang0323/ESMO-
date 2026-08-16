#!/usr/bin/env node
// CS APM Measurement / Calibration Readiness R21.
// Production source stays untouched; hooks are exact, reversible Vite memory transforms.

import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { CS_R33_RESILIENCE_SOURCE_SHA256, csR25R24Source } from "./cs_r15_legacy_source.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FPS_FILE = resolve(ROOT, "src/battle/fps/EsportsFPS3D.jsx");
const FPS_MODULE_ID = "/src/battle/fps/EsportsFPS3D.jsx";
const SOURCE_SHA256 = "57476524ffa5693cb2cd00f28d73a1355e2dcf14ce0e018c9aa766febc706c29";
const EVENT_SCHEMA = "CsApmMeasurementEvent.v1";
const SUITE_SCHEMA = "CsApmMeasurementSuite.v1";
const EXPECTED_SUITE_DIGEST = "0380561f76b66ddf774fdf86decf048bd261082c23fe06a978553d637a8d429a";
const SEED_GENERATION_VERSION = "CsMeasurementSeedSet.v1";
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
const POS_PROFILE = Object.freeze({
  rifler: ["acc", "rxn", "pos", "foc", "str"],
  entry: ["cou", "rxn", "apm", "acc", "str"],
  awp: ["acc", "foc", "pos", "str", "rxn"],
  igl: ["led", "com", "dec", "tac", "adp"],
  support: ["coo", "tac", "com", "pos", "vis"],
  lurker: ["vis", "dec", "pos", "adp", "str"],
});
const APM_PERSONALITY_DELTA = Object.freeze({
  defensive: -4,
  calm: -4,
  shotcaller: -4,
  lonewolf: 6,
});
const ROLE_AGGR = Object.freeze({ entry: 0.14, rifler: 0.05, igl: 0, support: -0.03, awp: -0.05, lurker: -0.07 });
const PERSONALITY_AGGRO = Object.freeze({
  aggressive: 0.10, defensive: -0.10, calm: -0.05, passionate: 0.08, genius: 0.04,
  grinder: 0, shotcaller: 0, lonewolf: 0.06, steady: -0.06, creative: 0.03,
});
const PERSONALITY_STAT_DELTAS = Object.freeze({
  aggressive: { cou: 6 },
  defensive: { cou: -4, apm: -4, pos: 6 },
  calm: { cou: -4, str: 6, apm: -4 },
  passionate: { cou: 6 },
  genius: {},
  grinder: {},
  shotcaller: { apm: -4 },
  lonewolf: { apm: 6 },
  steady: { cou: -4, pos: 6 },
  creative: {},
});
const APM_THRESHOLD = 0.82;

const SIGNATURE_MARKER = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster){";
const SIGNATURE_REPLACEMENT = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster,__measure=null){";
const ROUND_STATE_MARKER = "    let contactCalled=false,defuseCalled=false,defuseProg=0;";
const ROUND_STATE_REPLACEMENT = [
  ROUND_STATE_MARKER,
  "    const __retreatState=__measure?new Map():null;",
].join("\n");
const PERS_MARKER = "function persStat(p,key){let v=(p.stats&&p.stats[key])||50;const pr=p.personality&&PERSONALITY[p.personality];if(pr){if(pr.boost.includes(key))v+=PERS_BOOST;if(pr.nerf.includes(key))v-=PERS_NERF;}return clamp(v,1,99);}";
const PERS_REPLACEMENT = 'function persStat(p,key){let v=(p.stats&&p.stats[key])||50;const pr=p.personality&&PERSONALITY[p.personality];if(pr){if(pr.boost.includes(key))v+=PERS_BOOST;if(pr.nerf.includes(key))v-=PERS_NERF;}const adjusted=v,effective=clamp(adjusted,1,99);if(key==="apm")globalThis.__CS_R21_AUDIT__?.record("persStatApm",{playerId:p.id,role:p.role,personality:p.personality,rawApm:Number(p.stats?.apm??50),adjustedApm:adjusted,effectiveApm:effective,clamped:effective!==adjusted,adjustmentSource:"personality-only"});return effective;}';
const POS_MARKER = "function posSkill(p,rawReflex=Number((p.stats||{}).rxn??50)){const prof=POS_PROFILE[p.role]||POS_PROFILE.rifler;const s=p.stats||{};let t=0;prof.forEach((k,i)=>t+=(k===\"rxn\"?rawReflex:(s[k]||50))*(5-i));return t/15;}";
const POS_REPLACEMENT = 'function posSkill(p,rawReflex=Number((p.stats||{}).rxn??50)){const prof=POS_PROFILE[p.role]||POS_PROFILE.rifler;const s=p.stats||{};let t=0;prof.forEach((k,i)=>t+=(k==="rxn"?rawReflex:(s[k]||50))*(5-i));const result=t/15;const apmIndex=prof.indexOf("apm"),apmWeight=apmIndex<0?0:5-apmIndex;globalThis.__CS_R21_AUDIT__?.record("posSkillApmRead",{playerId:p.id,role:p.role,profile:prof.join(","),rawApm:Number(s.apm??50),apmWeight,result});return result;}';
const S_MARKER = "const S=k=>k===\"rxn\"?effectiveReflex:persStat(p,k);";
const S_REPLACEMENT = 'let __r21EffectiveApm=null,__r21ApmReads=0;const S=k=>{const value=k==="rxn"?effectiveReflex:persStat(p,k);if(k==="apm"){__r21EffectiveApm=value;__r21ApmReads++;globalThis.__CS_R21_AUDIT__?.record("combatSkillApmRead",{playerId:p.id,role:p.role,personality:p.personality,rawApm:Number(p.stats?.apm??50),effectiveApm:value});}return value;};';
const COMBAT_RETURN_MARKER = "return v*formMul(p);";
const COMBAT_RETURN_REPLACEMENT = 'const __r21Form=formMul(p),__r21Result=v*__r21Form;globalThis.__CS_R21_AUDIT__?.record("combatSkill",{playerId:p.id,role:p.role,personality:p.personality,rawApm:Number(s.apm??50),effectiveApm:__r21EffectiveApm,apmReads:__r21ApmReads,roleFit:role,mechanics:mech,weapon:wpn,baseBeforeForm:v,formMul:__r21Form,result:__r21Result,holding:Boolean(opts?.holding),entry:Boolean(opts?.entry),lurk:Boolean(opts?.lurk),lowHP:Boolean(opts?.lowHP)});return __r21Result;';
const AGGR_MARKER = "function aggr(p){const s=p.stats;if(!s)return 0.6;const base=(persStat(p,\"cou\")*0.5+persStat(p,\"str\")*0.22+persStat(p,\"apm\")*0.16+persStat(p,\"pos\")*0.12)/100;const pr=p.personality&&PERSONALITY[p.personality];return clamp(base+(ROLE_AGGR[p.role]||0)+(pr?pr.aggro:0),0.2,1.15);}";
const AGGR_REPLACEMENT = 'function aggr(p){const s=p.stats;if(!s)return 0.6;const __r21Cou=persStat(p,"cou"),__r21Str=persStat(p,"str"),__r21Apm=persStat(p,"apm"),__r21Pos=persStat(p,"pos");const base=(__r21Cou*0.5+__r21Str*0.22+__r21Apm*0.16+__r21Pos*0.12)/100;const pr=p.personality&&PERSONALITY[p.personality];const result=clamp(base+(ROLE_AGGR[p.role]||0)+(pr?pr.aggro:0),0.2,1.15);globalThis.__CS_R21_AUDIT__?.record("aggr",{playerId:p.id,role:p.role,personality:p.personality,rawApm:Number(p.stats?.apm??50),effectiveApm:__r21Apm,result});return result;}';
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
  '          const __r21PairKey=String(rnd+1)+":"+String(sec)+":"+tp.id+":"+cp.id;',
  '          __measure?.record("combat_pair_candidate",{round:rnd+1,sec,pairKey:__r21PairKey,tPlayerId:tp.id,cPlayerId:cp.id,distance:d,fireChance});',
  "          if(__retreatRecontactIds.length){",
  '            for(const __id of __retreatRecontactIds)__retreatState.get(__id).recontacted=true;',
  '            __measure?.record("retreat_recontact",{round:rnd+1,sec,tPlayerId:tp.id,cPlayerId:cp.id,playerIds:__retreatRecontactIds.join("|"),distance:d,fireChance});',
  "          }",
  '          if(rand()>=fireChance){__measure?.record("combat_pair_rejected",{round:rnd+1,sec,pairKey:__r21PairKey,tPlayerId:tp.id,cPlayerId:cp.id,distance:d,fireChance});continue;}',
  '          __measure?.record("combat_pair_admitted",{round:rnd+1,sec,pairKey:__r21PairKey,tPlayerId:tp.id,cPlayerId:cp.id,distance:d,fireChance});',
  '          const __retreatReengageIds=__retreatPairIds.filter(__id=>!__retreatState.get(__id).reengaged);',
  "          if(__retreatReengageIds.length){",
  '            for(const __id of __retreatReengageIds)__retreatState.get(__id).reengaged=true;',
  '            __measure?.record("retreat_reengage",{round:rnd+1,sec,tPlayerId:tp.id,cPlayerId:cp.id,playerIds:__retreatReengageIds.join("|"),distance:d,fireChance});',
  "          }",
].join("\n");
const EXCHANGE_MARKER = "          const tw=rand()<Pt;const at=tw?tp:cp,df=tw?cp:tp;";
const EXCHANGE_REPLACEMENT = [
  EXCHANGE_MARKER,
  '          __measure?.record("combat_exchange",{round:rnd+1,sec,pairKey:__r21PairKey,tPlayerId:tp.id,cPlayerId:cp.id,distance:d,pt:Pt,attackerId:at.id,attackerSide:at.side,defenderId:df.id,defenderSide:df.side});',
].join("\n");
const ROUND_RESULT_MARKER = "      const wn=roundEnd.winner;";
const ROUND_RESULT_REPLACEMENT = [
  ROUND_RESULT_MARKER,
  '      __measure?.record("round_summary",{round:rnd+1,winner:wn,how:roundEnd.how});',
  '      ps.forEach(__p=>__measure?.record("round_player_result",{round:rnd+1,playerId:__p.id,side:__p.side,role:__p.role,survived:Boolean(!__p.dead),won:wn===__p.side,attackerKills:roundKills[__p.id]||0,attackerDamageDealt:Math.round(roundDmg[__p.id]||0),defenderDeaths:roundDeaths[__p.id]||0,assists:roundAst[__p.id]||0}));',
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
  "const __CS_APM_R21_TEST_API__ = Object.freeze({",
  "  simulateFps: __FPS3D_MODULE.simulateFps,",
  "  ROSTER: __FPS3D_MODULE.ROSTER,",
  "  TACTICS_DB: __FPS3D_MODULE.TACTICS_DB,",
  "});",
  "export { EsportsFPS3D, buildMatchResult, __CS_APM_R21_TEST_API__ };",
].join("\n");
const TRANSFORMS = Object.freeze([
  ["simulate signature", SIGNATURE_MARKER, SIGNATURE_REPLACEMENT],
  ["round state", ROUND_STATE_MARKER, ROUND_STATE_REPLACEMENT],
  ["persStat apm", PERS_MARKER, PERS_REPLACEMENT],
  ["posSkill apm", POS_MARKER, POS_REPLACEMENT],
  ["combatSkill apm read", S_MARKER, S_REPLACEMENT],
  ["combatSkill return", COMBAT_RETURN_MARKER, COMBAT_RETURN_REPLACEMENT],
  ["aggr apm", AGGR_MARKER, AGGR_REPLACEMENT],
  ["retreat opportunity", MATES_MARKER, MATES_REPLACEMENT],
  ["retreat trigger", TRIGGER_MARKER, TRIGGER_REPLACEMENT],
  ["retreat displacement", DISPLACEMENT_MARKER, DISPLACEMENT_REPLACEMENT],
  ["pair admission", FIRE_MARKER, FIRE_REPLACEMENT],
  ["attacker defender", EXCHANGE_MARKER, EXCHANGE_REPLACEMENT],
  ["round result", ROUND_RESULT_MARKER, ROUND_RESULT_REPLACEMENT],
  ["module return", RETURN_MARKER, RETURN_REPLACEMENT],
  ["module export", EXPORT_MARKER, EXPORT_REPLACEMENT],
]);

function gate(ok, code, detail = "") { if (!ok) throw new Error("[" + code + "]" + (detail ? "\n" + detail : "")); }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function occurrences(text, needle) { return text.split(needle).length - 1; }
function clone(value) { return structuredClone(value); }
function freeze(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) freeze(child, seen);
  return Object.freeze(value);
}
function canonical(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") { gate(Number.isFinite(value), "NON_FINITE_NUMBER"); return Object.is(value, -0) ? 0 : value; }
  if (typeof value === "undefined") return null;
  gate(typeof value === "object", "UNSUPPORTED_VALUE", typeof value);
  if (Array.isArray(value)) return value.map(canonical);
  const out = {};
  for (const key of Object.keys(value).sort()) out[key] = canonical(value[key]);
  return out;
}
function json(value) { return JSON.stringify(canonical(value)); }
function randTokens(source) { return source.match(/\brand\s*\(\s*\)/g) || []; }
function mean(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function sampleSd(values) {
  if (values.length < 2) return 0;
  const avg = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + ((value - avg) ** 2), 0) / (values.length - 1));
}
function rounded(value) { return +Number(value || 0).toFixed(4); }
function aggregate(values) {
  return values.length
    ? { mean: rounded(mean(values)), sd: rounded(sampleSd(values)), min: rounded(Math.min(...values)), max: rounded(Math.max(...values)) }
    : { mean: 0, sd: 0, min: 0, max: 0 };
}
function expectedEffectiveApm(player) {
  const raw = Number(player.stats?.apm ?? 50);
  return Math.max(1, Math.min(99, raw + (APM_PERSONALITY_DELTA[player.personality] || 0)));
}
function expectedEffectiveStat(player, key) {
  const raw = Number(player.stats?.[key] ?? 50);
  const delta = PERSONALITY_STAT_DELTAS[player.personality]?.[key] || 0;
  return Math.max(1, Math.min(99, raw + delta));
}
function expectedPosSkill(player) {
  const profile = POS_PROFILE[player.role] || POS_PROFILE.rifler;
  const rawReflex = Number(player.stats?.rxn ?? 50);
  const stats = player.stats || {};
  let total = 0;
  profile.forEach((key, index) => {
    total += (key === "rxn" ? rawReflex : Number(stats[key] || 50)) * (5 - index);
  });
  return total / 15;
}
function expectedAggr(player) {
  const base = (
    expectedEffectiveStat(player, "cou") * 0.5
    + expectedEffectiveStat(player, "str") * 0.22
    + expectedEffectiveApm(player) * 0.16
    + expectedEffectiveStat(player, "pos") * 0.12
  ) / 100;
  return Math.max(0.2, Math.min(1.15, base + (ROLE_AGGR[player.role] || 0) + (PERSONALITY_AGGRO[player.personality] || 0)));
}
function keyOf(round, playerId, sec) { return String(round) + "|" + playerId + "|" + String(sec); }
function episodeKey(round, playerId) { return String(round) + "|" + playerId; }
function parseIds(value) { return value ? value.split("|").filter(Boolean) : []; }
function roleApmWeight(role) {
  const profile = POS_PROFILE[role] || POS_PROFILE.rifler;
  const index = profile.indexOf("apm");
  return index < 0 ? 0 : 5 - index;
}
function strictMajority(passing, total) { return passing > total / 2; }

function createCollector() {
  const events = [];
  return {
    events,
    record(type, payload) {
      gate(payload && typeof payload === "object" && !Array.isArray(payload), "EVENT_PAYLOAD", type);
      const event = Object.freeze({ schema: EVENT_SCHEMA, type, ...payload });
      for (const [key, value] of Object.entries(event)) {
        gate(value === null || ["string", "number", "boolean"].includes(typeof value), "EVENT_FIELD", type + "." + key);
      }
      events.push(event);
    },
  };
}

async function loadApi(liveSource, originalSource) {
  let transformSeen = 0;
  let restored = false;
  let rngSame = false;
  let vite = null;
  const tempRoot = mkdtempSync(join(tmpdir(), "esmo-cs-apm-r21-"));
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
        name: "cs-apm-r21-memory-hooks",
        enforce: "pre",
        transform(code, id) {
          if (resolve(id.split("?")[0]).toLowerCase() !== FPS_FILE.toLowerCase()) return null;
          transformSeen += 1;
          gate(code === liveSource, "VITE_SOURCE_MISMATCH");
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
          restored = roundTrip === originalSource;
          rngSame = json(randTokens(transformed)) === json(randTokens(originalSource));
          gate(restored, "TRANSFORM_NOT_REVERSIBLE");
          gate(rngSame, "RNG_TOKEN_SEQUENCE_CHANGED");
          return { code: transformed, map: null };
        },
      }],
    });
    const module = await vite.ssrLoadModule(FPS_MODULE_ID + "?r21=" + Date.now());
    gate(transformSeen === 1 && restored && rngSame, "TRANSFORM_LOAD_GATE", json({ transformSeen, restored, rngSame }));
    return module.__CS_APM_R21_TEST_API__;
  } finally {
    if (vite) await vite.close();
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function inputDigest(mapKey, tTactic, ctTactic, roster) {
  return sha256(json({ mapKey, tTactic, ctTactic, roster }));
}
function treatmentRoster(baselineRoster, targetId, level) {
  const next = clone(baselineRoster);
  const base = baselineRoster.find((player) => player.id === targetId);
  const target = next.find((player) => player.id === targetId);
  gate(base && target, "TARGET_MISSING", targetId);
  const values = { low: base.stats.apm - BAND, baseline: base.stats.apm, high: base.stats.apm + BAND };
  gate(values.low >= 1 && values.high <= 99, "APM_BAND_CLAMPED", targetId + " " + json(values));
  target.stats.apm = values[level];
  gate(target.fps === base.fps && target.moba === base.moba, "HUD_MUTATED", targetId);
  return { roster: freeze(next), value: values[level], values };
}

function validateEvents(events, sim, roster, seed) {
  gate(events.length > 0, "NO_APM_EVENTS", "seed=" + seed);
  const allowed = new Set([
    "persStatApm", "posSkillApmRead", "combatSkillApmRead", "combatSkill", "aggr",
    "retreat_opportunity", "retreat_trigger", "retreat_displacement", "retreat_recontact",
    "retreat_reengage", "retreat_round_result", "retreat_round_summary",
    "combat_pair_candidate", "combat_pair_rejected", "combat_pair_admitted", "combat_exchange",
    "round_summary", "round_player_result",
  ]);
  for (const event of events) gate(event.schema === EVENT_SCHEMA && allowed.has(event.type), "EVENT_SCHEMA", event.type);
  const byId = new Map(roster.map((player) => [player.id, player]));
  const opportunities = new Map();
  const triggers = new Map();
  const displacements = new Map();
  const episodes = new Map();
  const retreatResults = new Map();
  const recontacts = new Map();
  const reengages = new Map();
  const pairCandidates = new Map();
  const pairRejected = new Map();
  const pairAdmitted = new Map();
  const exchanges = new Map();
  const roundSummaries = new Map();
  const retreatSummaries = new Map();
  const roundResults = new Map();
  for (const event of events) {
    if (event.type === "persStatApm") {
      const player = byId.get(event.playerId);
      gate(player, "APM_READ_PLAYER_MISSING", event.playerId);
      const raw = Number(player.stats?.apm ?? 50);
      gate(event.rawApm === raw && event.adjustedApm === raw + (APM_PERSONALITY_DELTA[player.personality] || 0), "RAW_APM_ATTRIBUTION", event.playerId);
      gate(event.effectiveApm === expectedEffectiveApm(player), "EFFECTIVE_APM_ATTRIBUTION", event.playerId);
      gate(event.clamped === (event.effectiveApm !== event.adjustedApm), "APM_CLAMP_FLAG", event.playerId);
      gate(event.adjustmentSource === "personality-only", "APM_ADJUSTMENT_SOURCE", event.playerId);
      continue;
    }
    if (event.type === "posSkillApmRead") {
      const player = byId.get(event.playerId);
      gate(player, "POS_APM_PLAYER_MISSING", event.playerId);
      const profile = POS_PROFILE[player.role] || POS_PROFILE.rifler;
      gate(event.profile === profile.join(","), "POS_APM_PROFILE_DRIFT", event.playerId);
      gate(event.rawApm === Number(player.stats?.apm ?? 50), "POS_APM_RAW_ATTRIBUTION", event.playerId);
      gate(event.apmWeight === roleApmWeight(player.role), "POS_APM_ROLE_WEIGHT", event.playerId);
      gate(Math.abs(event.result - expectedPosSkill(player)) <= 1e-9, "POS_APM_RESULT", event.playerId);
      continue;
    }
    if (event.type === "combatSkillApmRead") {
      const player = byId.get(event.playerId);
      gate(player, "COMBAT_APM_PLAYER_MISSING", event.playerId);
      gate(event.rawApm === Number(player.stats?.apm ?? 50), "COMBAT_RAW_APM", event.playerId);
      gate(event.effectiveApm === expectedEffectiveApm(player), "COMBAT_EFFECTIVE_APM", event.playerId);
      continue;
    }
    if (event.type === "combatSkill") {
      const player = byId.get(event.playerId);
      gate(player, "COMBAT_SKILL_PLAYER_MISSING", event.playerId);
      gate(event.rawApm === Number(player.stats?.apm ?? 50), "COMBAT_RESULT_RAW_APM", event.playerId);
      gate(event.effectiveApm === expectedEffectiveApm(player), "COMBAT_RESULT_EFFECTIVE_APM", event.playerId);
      gate(event.apmReads > 0 && Number.isFinite(event.result) && Number.isFinite(event.roleFit), "COMBAT_RESULT_VALUE", event.playerId);
      continue;
    }
    if (event.type === "aggr") {
      const player = byId.get(event.playerId);
      gate(player, "AGGR_PLAYER_MISSING", event.playerId);
      gate(event.rawApm === Number(player.stats?.apm ?? 50), "AGGR_RAW_APM", event.playerId);
      gate(event.effectiveApm === expectedEffectiveApm(player), "AGGR_EFFECTIVE_APM", event.playerId);
      gate(Math.abs(event.result - expectedAggr(player)) <= 1e-9, "AGGR_RESULT", event.playerId);
      continue;
    }
    if (event.type === "retreat_opportunity") {
      const player = byId.get(event.playerId);
      gate(player && byId.has(event.enemyId), "RETREAT_OPPORTUNITY_PLAYER", event.playerId);
      const key = keyOf(event.round, event.playerId, event.sec);
      gate(!opportunities.has(key), "DUPLICATE_RETREAT_OPPORTUNITY", key);
      gate(event.side === player.side && event.role === player.role && event.distance >= 0 && event.distance < 32, "RETREAT_OPPORTUNITY_SHAPE", key);
      gate(event.hp < 48 && event.mates > 1 && event.threshold === APM_THRESHOLD, "RETREAT_OPPORTUNITY_GATE_INPUT", key);
      gate(event.gatePassed === (event.aggr < event.threshold), "RETREAT_OPPORTUNITY_GATE", key);
      opportunities.set(key, event);
      continue;
    }
    if (event.type === "retreat_trigger") {
      const key = keyOf(event.round, event.playerId, event.sec);
      gate(opportunities.has(key) && opportunities.get(key).gatePassed, "TRIGGER_WITHOUT_GATE", key);
      gate(!triggers.has(key), "DUPLICATE_RETREAT_TRIGGER", key);
      gate(event.side === opportunities.get(key).side && event.role === opportunities.get(key).role, "TRIGGER_ATTRIBUTION", key);
      const epKey = episodeKey(event.round, event.playerId);
      if (!episodes.has(epKey)) episodes.set(epKey, { round: event.round, playerId: event.playerId, side: event.side, role: event.role });
      triggers.set(key, event);
      continue;
    }
    if (event.type === "retreat_displacement") {
      const key = keyOf(event.round, event.playerId, event.sec);
      const trigger = triggers.get(key);
      gate(trigger, "DISPLACEMENT_WITHOUT_TRIGGER", key);
      gate(!displacements.has(key), "DUPLICATE_RETREAT_DISPLACEMENT", key);
      const expected = Math.hypot(event.toX - event.fromX, event.toY - event.fromY);
      gate(Math.abs(expected - event.distance) <= 1e-9 && event.distance >= 0 && event.distance <= 3.2 + 1e-9, "DISPLACEMENT_SHAPE", key);
      gate(event.fromX === trigger.fromX && event.fromY === trigger.fromY, "DISPLACEMENT_ORIGIN", key);
      displacements.set(key, event);
      continue;
    }
    if (event.type === "retreat_recontact" || event.type === "retreat_reengage") {
      const ids = parseIds(event.playerIds);
      gate(ids.length > 0 && event.tPlayerId && event.cPlayerId, "RETREAT_PAIR_IDS", String(event.round));
      gate(event.distance >= 0 && event.distance < 55 && event.fireChance >= 0 && event.fireChance <= 1, "RETREAT_PAIR_SHAPE", String(event.round));
      for (const playerId of ids) {
        const epKey = episodeKey(event.round, playerId);
        gate(episodes.has(epKey), "RETREAT_CONTACT_WITHOUT_EPISODE", epKey);
        const prior = [...triggers.values()].filter((item) => item.round === event.round && item.playerId === playerId);
        gate(prior.length > 0 && Math.max(...prior.map((item) => item.sec)) < event.sec, "RETREAT_CONTACT_ORDER", epKey);
        const contactKey = epKey + "|" + playerId;
        if (event.type === "retreat_recontact") {
          gate(!recontacts.has(contactKey), "DUPLICATE_RETREAT_RECONTACT", contactKey);
          recontacts.set(contactKey, event);
        } else {
          gate(recontacts.has(contactKey), "REENGAGE_WITHOUT_RECONTACT", contactKey);
          gate(!reengages.has(contactKey) && recontacts.get(contactKey).sec <= event.sec, "REENGAGE_ORDER", contactKey);
          reengages.set(contactKey, event);
        }
      }
      continue;
    }
    if (event.type === "retreat_round_result") {
      const key = episodeKey(event.round, event.playerId);
      gate(episodes.has(key) && !retreatResults.has(key), "RETREAT_RESULT_SHAPE", key);
      const episode = episodes.get(key);
      const triggerValues = [...triggers.values()].filter((item) => item.round === event.round && item.playerId === event.playerId);
      const displacementValues = [...displacements.values()].filter((item) => item.round === event.round && item.playerId === event.playerId);
      gate(event.side === episode.side && event.role === episode.role, "RETREAT_RESULT_ATTRIBUTION", key);
      gate(event.startSec === Math.min(...triggerValues.map((item) => item.sec)), "RETREAT_RESULT_START", key);
      gate(event.triggerTicks === triggerValues.length && event.lastSec === Math.max(...triggerValues.map((item) => item.sec)), "RETREAT_RESULT_COUNT", key);
      gate(Math.abs(event.totalDistance - displacementValues.reduce((sum, item) => sum + item.distance, 0)) <= 1e-9, "RETREAT_RESULT_DISTANCE", key);
      gate(event.recontacted === recontacts.has(key + "|" + event.playerId), "RETREAT_RESULT_RECONTACT", key);
      gate(event.reengaged === reengages.has(key + "|" + event.playerId), "RETREAT_RESULT_REENGAGE", key);
      gate(!event.reengaged || event.recontacted, "RETREAT_RESULT_ORDER", key);
      gate(typeof event.survived === "boolean" && event.won === (event.winner === event.side), "RETREAT_RESULT_FLAGS", key);
      retreatResults.set(key, event);
      continue;
    }
    if (event.type === "retreat_round_summary") {
      gate(!retreatSummaries.has(event.round), "DUPLICATE_RETREAT_SUMMARY", String(event.round));
      const expectedIds = [...episodes.values()].filter((episode) => episode.round === event.round).map((episode) => episode.playerId).sort().join("|");
      const expected = sim.roundHist[event.round - 1];
      gate(event.episodePlayerIds === expectedIds && expected && expected.winner === event.winner && expected.how === event.how, "RETREAT_SUMMARY_DRIFT", String(event.round));
      retreatSummaries.set(event.round, event);
      continue;
    }
    if (event.type === "round_summary") {
      gate(!roundSummaries.has(event.round), "DUPLICATE_ROUND_SUMMARY", String(event.round));
      const expected = sim.roundHist[event.round - 1];
      gate(expected && expected.winner === event.winner && expected.how === event.how, "ROUND_SUMMARY_DRIFT", String(event.round));
      roundSummaries.set(event.round, event);
      continue;
    }
    if (event.type === "round_player_result") {
      const key = episodeKey(event.round, event.playerId);
      const player = byId.get(event.playerId);
      gate(player && event.side === player.side && event.role === player.role, "ROUND_PLAYER_ATTRIBUTION", key);
      gate(!roundResults.has(key), "DUPLICATE_ROUND_PLAYER_RESULT", key);
      gate(typeof event.survived === "boolean" && typeof event.won === "boolean" && event.attackerKills >= 0 && event.attackerDamageDealt >= 0 && event.defenderDeaths >= 0 && event.assists >= 0, "ROUND_PLAYER_SHAPE", key);
      roundResults.set(key, event);
      continue;
    }
    if (event.type === "combat_pair_candidate" || event.type === "combat_pair_rejected" || event.type === "combat_pair_admitted") {
      const map = event.type === "combat_pair_candidate" ? pairCandidates : event.type === "combat_pair_rejected" ? pairRejected : pairAdmitted;
      gate(byId.has(event.tPlayerId) && byId.has(event.cPlayerId) && byId.get(event.tPlayerId).side === "t" && byId.get(event.cPlayerId).side === "ct", "PAIR_ATTRIBUTION", event.pairKey);
      gate(event.distance >= 0 && event.distance < 55 && event.fireChance >= 0 && event.fireChance <= 1, "PAIR_SHAPE", event.pairKey);
      gate(!map.has(event.pairKey), "DUPLICATE_PAIR_EVENT", event.type + " " + event.pairKey);
      map.set(event.pairKey, event);
      continue;
    }
    if (event.type === "combat_exchange") {
      gate(pairAdmitted.has(event.pairKey), "EXCHANGE_WITHOUT_ADMISSION", event.pairKey);
      gate(!exchanges.has(event.pairKey), "DUPLICATE_EXCHANGE", event.pairKey);
      gate(event.attackerId !== event.defenderId && event.attackerSide !== event.defenderSide, "ATTACKER_DEFENDER_SAME_SIDE", event.pairKey);
      gate((event.attackerId === event.tPlayerId && event.defenderId === event.cPlayerId) || (event.attackerId === event.cPlayerId && event.defenderId === event.tPlayerId), "EXCHANGE_PARTICIPANT_DRIFT", event.pairKey);
      exchanges.set(event.pairKey, event);
    }
  }
  for (const key of pairRejected.keys()) gate(pairCandidates.has(key), "REJECTED_WITHOUT_CANDIDATE", key);
  for (const key of pairAdmitted.keys()) gate(pairCandidates.has(key) && !pairRejected.has(key), "ADMITTED_PAIR_INVALID", key);
  gate(roundSummaries.size === sim.rounds, "ROUND_SUMMARY_COUNT", "actual=" + roundSummaries.size + " expected=" + sim.rounds);
  gate(roundResults.size === sim.rounds * roster.length, "ROUND_RESULT_COUNT", "actual=" + roundResults.size);
  gate(opportunities.size >= triggers.size && triggers.size === displacements.size, "RETREAT_CHAIN_COUNT", String(seed));
  gate(retreatResults.size === episodes.size && retreatSummaries.size === sim.rounds, "RETREAT_RESULT_COUNT", String(seed));
  gate(pairCandidates.size === pairRejected.size + pairAdmitted.size && exchanges.size === pairAdmitted.size, "PAIR_PARTITION", String(seed));
  return {
    persStatApmCalls: events.filter((event) => event.type === "persStatApm").length,
    posSkillApmReads: events.filter((event) => event.type === "posSkillApmRead").length,
    combatSkillApmReads: events.filter((event) => event.type === "combatSkillApmRead").length,
    combatSkillCalls: events.filter((event) => event.type === "combatSkill").length,
    aggrCalls: events.filter((event) => event.type === "aggr").length,
    opportunities: opportunities.size,
    gatePasses: [...opportunities.values()].filter((item) => item.gatePassed).length,
    retreatTriggers: triggers.size,
    displacements: displacements.size,
    recontacts: recontacts.size,
    reengages: reengages.size,
    episodes: episodes.size,
    pairCandidates: pairCandidates.size,
    pairRejected: pairRejected.size,
    pairAdmitted: pairAdmitted.size,
    exchanges: exchanges.size,
    roundResults: roundResults.size,
  };
}

function frameSummary(sim, targetId) {
  let movementDistance = 0;
  let engageFrames = 0;
  let previous = null;
  for (const frame of sim.frames) {
    const player = frame.players.find((item) => item.id === targetId);
    if (!player || player.dead) { previous = null; continue; }
    if (player.state === "ENGAGE") engageFrames++;
    if (previous && previous.rnd === frame.rnd) movementDistance += Math.hypot(player.pos.x - previous.x, player.pos.y - previous.y);
    previous = { rnd: frame.rnd, x: player.pos.x, y: player.pos.y };
  }
  return { movementDistance, engageFrames };
}

function targetSummary(arm, targetId, target, roster) {
  const own = arm.events.filter((event) => event.playerId === targetId);
  const pers = own.filter((event) => event.type === "persStatApm");
  const pos = own.filter((event) => event.type === "posSkillApmRead");
  const combatReads = own.filter((event) => event.type === "combatSkillApmRead");
  const combat = own.filter((event) => event.type === "combatSkill");
  const aggr = own.filter((event) => event.type === "aggr");
  const opportunities = arm.events.filter((event) => event.type === "retreat_opportunity" && event.playerId === targetId);
  const triggers = arm.events.filter((event) => event.type === "retreat_trigger" && event.playerId === targetId);
  const displacements = arm.events.filter((event) => event.type === "retreat_displacement" && event.playerId === targetId);
  const episodes = arm.events.filter((event) => event.type === "retreat_round_result" && event.playerId === targetId);
  const recontacts = arm.events.filter((event) => event.type === "retreat_recontact" && parseIds(event.playerIds).includes(targetId));
  const reengages = arm.events.filter((event) => event.type === "retreat_reengage" && parseIds(event.playerIds).includes(targetId));
  const pairCandidates = arm.events.filter((event) => event.type === "combat_pair_candidate" && event.tPlayerId === targetId);
  const pairAdmitted = arm.events.filter((event) => event.type === "combat_pair_admitted" && event.tPlayerId === targetId);
  const pairRejected = arm.events.filter((event) => event.type === "combat_pair_rejected" && event.tPlayerId === targetId);
  const exchanges = arm.events.filter((event) => event.type === "combat_exchange" && (event.tPlayerId === targetId || event.cPlayerId === targetId));
  const roundResults = arm.events.filter((event) => event.type === "round_player_result" && event.playerId === targetId);
  const opponentResults = arm.events.filter((event) => event.type === "round_player_result" && event.side === "ct");
  const playerResult = arm.sim.players.find((item) => item.id === targetId);
  const targetAttackerExchanges = exchanges.filter((event) => event.attackerId === targetId);
  const targetDefenderExchanges = exchanges.filter((event) => event.defenderId === targetId);
  const frames = frameSummary(arm.sim, targetId);
  const effectiveApmValues = pers.map((event) => event.effectiveApm);
  const rawRoleFit = pos.map((event) => event.result);
  const aggrValues = aggr.map((event) => event.result);
  const targetKpi = {
    attackerKills: roundResults.reduce((sum, event) => sum + event.attackerKills, 0),
    attackerDamageDealt: roundResults.reduce((sum, event) => sum + event.attackerDamageDealt, 0),
    defenderDeaths: roundResults.reduce((sum, event) => sum + event.defenderDeaths, 0),
    survivedRounds: roundResults.filter((event) => event.survived).length,
  };
  const opponentKpi = {
    attackerKills: opponentResults.reduce((sum, event) => sum + event.attackerKills, 0),
    attackerDamageDealt: opponentResults.reduce((sum, event) => sum + event.attackerDamageDealt, 0),
    defenderDeaths: opponentResults.reduce((sum, event) => sum + event.defenderDeaths, 0),
  };
  const structuralEvents = arm.events.filter((event) => ["combat_pair_candidate", "combat_pair_rejected", "combat_pair_admitted", "combat_exchange", "round_summary", "round_player_result"].includes(event.type));
  return {
    seed: arm.seed,
    rawApm: Number(target.stats.apm),
    effectiveApm: expectedEffectiveApm(target),
    effectiveApmMean: expectedEffectiveApm(target),
    personalityDelta: (APM_PERSONALITY_DELTA[target.personality] || 0),
    persStatApmCalls: pers.length,
    effectiveApmRead: aggregate(effectiveApmValues),
    apmClampReads: pers.filter((event) => event.clamped).length,
    posSkillApmReads: pos.length,
    roleFitApmWeight: roleApmWeight(target.role),
    roleFitMean: rawRoleFit.length ? mean(rawRoleFit) : 0,
    combatSkillApmReads: combatReads.length,
    combatSkillCalls: combat.length,
    combatSkillMean: combat.length ? mean(combat.map((event) => event.result)) : 0,
    aggrCalls: aggr.length,
    aggrMean: aggr.length ? mean(aggrValues) : 0,
    aggrMin: aggrValues.length ? Math.min(...aggrValues) : 0,
    aggrMax: aggrValues.length ? Math.max(...aggrValues) : 0,
    thresholdBelowReads: aggrValues.filter((value) => value < APM_THRESHOLD).length,
    opportunities: opportunities.length,
    gatePasses: opportunities.filter((event) => event.gatePassed).length,
    retreatTriggerRate: opportunities.length ? triggers.length / opportunities.length : 0,
    retreatTriggers: triggers.length,
    displacements: displacements.length,
    totalDisplacement: displacements.reduce((sum, event) => sum + event.distance, 0),
    recontacts: recontacts.length,
    reengages: reengages.length,
    reengageRate: episodes.length ? reengages.length / episodes.length : 0,
    pairCandidates: pairCandidates.length,
    pairAdmitted: pairAdmitted.length,
    pairRejected: pairRejected.length,
    pairAdmissionRate: pairCandidates.length ? pairAdmitted.length / pairCandidates.length : 0,
    attackerExchanges: targetAttackerExchanges.length,
    defenderExchanges: targetDefenderExchanges.length,
    roundResults: roundResults.length,
    survivedRounds: targetKpi.survivedRounds,
    survivalRate: roundResults.length ? targetKpi.survivedRounds / roundResults.length : 0,
    attackerKills: targetKpi.attackerKills,
    attackerDamageDealt: targetKpi.attackerDamageDealt,
    defenderDeaths: targetKpi.defenderDeaths,
    movementDistanceMean: frames.movementDistance,
    engageFrames: frames.engageFrames,
    opponentSpilloverKills: opponentKpi.attackerKills,
    opponentSpilloverDamage: opponentKpi.attackerDamageDealt,
    opponentSpilloverDeaths: opponentKpi.defenderDeaths,
    strictSimDigest: arm.strictSimDigest,
    targetKpiDigest: sha256(json(targetKpi)),
    structuralDigest: sha256(json(structuralEvents)),
    eventDigest: arm.eventDigest,
    validation: arm.validation,
    rosterSize: roster.length,
    playerKills: playerResult?.k ?? 0,
  };
}

function sum(rows, key) { return rows.reduce((total, row) => total + Number(row[key] || 0), 0); }
function aggregateRows(rows) {
  const sumKeys = [
    "persStatApmCalls", "posSkillApmReads", "combatSkillApmReads", "combatSkillCalls", "aggrCalls",
    "opportunities", "gatePasses", "retreatTriggers", "displacements", "recontacts", "reengages",
    "pairCandidates", "pairAdmitted", "pairRejected", "attackerExchanges", "defenderExchanges",
    "roundResults", "survivedRounds", "attackerKills", "attackerDamageDealt", "defenderDeaths",
    "apmClampReads", "engageFrames", "opponentSpilloverKills", "opponentSpilloverDamage", "opponentSpilloverDeaths",
  ];
  const sums = sumKeys.reduce((out, key) => { out[key] = sum(rows, key); return out; }, {});
  const means = ["effectiveApmRead", "roleFitMean", "combatSkillMean", "aggrMean", "aggrMin", "aggrMax", "movementDistanceMean"].reduce((out, key) => {
    out[key] = rounded(mean(rows.map((row) => typeof row[key] === "object" ? row[key].mean : row[key])));
    return out;
  }, {});
  means.effectiveApmMean = means.effectiveApmRead;
  const rates = {
    retreatTriggerRate: sums.opportunities ? rounded(sums.retreatTriggers / sums.opportunities) : 0,
    survivalRate: sums.roundResults ? rounded(sums.survivedRounds / sums.roundResults) : 0,
    pairAdmissionRate: sums.pairCandidates ? rounded(sums.pairAdmitted / sums.pairCandidates) : 0,
  };
  rates.reengageRate = rows.reduce((total, row) => total + row.reengageRate, 0) / Math.max(1, rows.length);
  return {
    seeds: rows.length,
    rawApm: rows[0].rawApm,
    effectiveApm: rows[0].effectiveApm,
    personalityDelta: rows[0].personalityDelta,
    ...sums,
    ...means,
    ...rates,
    clampRate: sums.persStatApmCalls ? rounded(sums.apmClampReads / sums.persStatApmCalls) : 0,
  };
}
function paired(rows, baselineRows, key) {
  const diffs = rows.map((row, index) => Number(row[key]) - Number(baselineRows[index][key]));
  const avg = mean(diffs);
  const sd = sampleSd(diffs);
  const effectSize = sd < 1e-9 ? (Math.abs(avg) < 1e-9 ? 0 : null) : rounded(avg / sd);
  return {
    meanDiff: rounded(avg),
    sd: rounded(sd),
    effectSize,
    positiveSeeds: diffs.filter((value) => value > 0).length,
    negativeSeeds: diffs.filter((value) => value < 0).length,
    zeroSeeds: diffs.filter((value) => value === 0).length,
  };
}
function directDirection(low, baseline, high, higherIsBetter = true) {
  const sign = higherIsBetter ? 1 : -1;
  const lowDiff = sign * (baseline - low);
  const highDiff = sign * (high - baseline);
  return {
    lowToBaseline: rounded(lowDiff),
    baselineToHigh: rounded(highDiff),
    monotonic: lowDiff >= 0 && highDiff >= 0 && (lowDiff > 0 || highDiff > 0),
  };
}
function monotonicity(rows, baselineRows, key, higherIsBetter = true) {
  const sign = higherIsBetter ? 1 : -1;
  const passing = rows.low.map((row, index) => {
    const lowDiff = sign * (baselineRows[index][key] - row[key]);
    const highDiff = sign * (rows.high[index][key] - baselineRows[index][key]);
    return lowDiff >= 0 && highDiff >= 0 && (lowDiff > 0 || highDiff > 0);
  });
  const passingSeeds = passing.filter(Boolean).length;
  return {
    key,
    higherIsBetter,
    passingSeeds,
    totalSeeds: passing.length,
    strictMajority: strictMajority(passingSeeds, passing.length),
    passingMask: passing.map((value) => value ? 1 : 0).join(""),
  };
}
function pathComparison(treatmentRows, baselineRows, key) {
  const changed = treatmentRows.filter((row, index) => row[key] !== baselineRows[index][key]).length;
  return { key, changedSeeds: changed, totalSeeds: baselineRows.length };
}
function thresholdSummary(rows, baselineRows) {
  const crossingSeeds = rows.low.filter((row, index) => {
    const values = [row.aggrMean, baselineRows[index].aggrMean, rows.high[index].aggrMean];
    return Math.min(...values) < APM_THRESHOLD && Math.max(...values) >= APM_THRESHOLD;
  }).length;
  return {
    threshold: APM_THRESHOLD,
    low: { min: rows.low.reduce((value, row) => Math.min(value, row.aggrMin), Infinity), max: rows.low.reduce((value, row) => Math.max(value, row.aggrMax), -Infinity) },
    baseline: { min: baselineRows.reduce((value, row) => Math.min(value, row.aggrMin), Infinity), max: baselineRows.reduce((value, row) => Math.max(value, row.aggrMax), -Infinity) },
    high: { min: rows.high.reduce((value, row) => Math.min(value, row.aggrMin), Infinity), max: rows.high.reduce((value, row) => Math.max(value, row.aggrMax), -Infinity) },
    crossingSeeds,
  };
}
function saturationSummary(rows, baselineRows, levels) {
  const plateauSeeds = rows.high.filter((row, index) => row.effectiveApm === baselineRows[index].effectiveApm).length;
  return {
    levels,
    clampedReads: rows.low.reduce((sumValue, row) => sumValue + row.apmClampReads, 0)
      + baselineRows.reduce((sumValue, row) => sumValue + row.apmClampReads, 0)
      + rows.high.reduce((sumValue, row) => sumValue + row.apmClampReads, 0),
    highClampReads: rows.high.reduce((sumValue, row) => sumValue + row.apmClampReads, 0),
    highBaselinePlateauSeeds: plateauSeeds,
    totalSeeds: rows.high.length,
  };
}

function runArm(api, { mapKey, tTactic, ctTactic, roster, seed }) {
  const before = inputDigest(mapKey, tTactic, ctTactic, roster);
  globalThis.__CS_R21_AUDIT__ = null;
  const off = api.simulateFps(mapKey, tTactic, ctTactic, seed, roster);
  const collector1 = createCollector();
  globalThis.__CS_R21_AUDIT__ = collector1;
  const on1 = api.simulateFps(mapKey, tTactic, ctTactic, seed, roster, collector1);
  const collector2 = createCollector();
  globalThis.__CS_R21_AUDIT__ = collector2;
  const on2 = api.simulateFps(mapKey, tTactic, ctTactic, seed, roster, collector2);
  globalThis.__CS_R21_AUDIT__ = null;
  const offJson = JSON.stringify(off);
  const on1Json = JSON.stringify(on1);
  const on2Json = JSON.stringify(on2);
  gate(offJson === on1Json && on1Json === on2Json, "INSTRUMENTATION_CHANGED_SIM", "seed=" + seed);
  const eventJson1 = json(collector1.events);
  const eventJson2 = json(collector2.events);
  gate(eventJson1 === eventJson2, "AUDIT_NON_DETERMINISTIC", "seed=" + seed);
  gate(before === inputDigest(mapKey, tTactic, ctTactic, roster), "SIM_MUTATED_INPUT", "seed=" + seed);
  const validation = validateEvents(collector1.events, on1, roster, seed);
  return { seed, sim: on1, events: collector1.events, strictSimDigest: sha256(offJson), eventDigest: sha256(eventJson1), validation };
}

async function main() {
  const liveSource = readFileSync(FPS_FILE, "utf8");
  const liveSourceSha256 = sha256(liveSource);
  gate(liveSourceSha256 === CS_R33_RESILIENCE_SOURCE_SHA256, "LIVE_SOURCE_SHA256", liveSourceSha256);
  const source = csR25R24Source(liveSource);
  const sourceSha256 = sha256(source);
  gate(sourceSha256 === SOURCE_SHA256, "SOURCE_SHA256", sourceSha256);
  gate(randTokens(source).length === EXPECTED_RAND_CALLS, "RAND_CALL_COUNT", String(randTokens(source).length));
  gate(FIXED_SEEDS.length === 16, "SEED_COUNT");
  gate(!strictMajority(8, 16) && strictMajority(9, 16), "STRICT_MAJORITY_GATE");
  gate(source.includes('const base=(persStat(p,"cou")*0.5+persStat(p,"str")*0.22+persStat(p,"apm")*0.16+persStat(p,"pos")*0.12)/100;'), "APM_AGGR_SOURCE_GATE");
  gate(source.includes("const role=posSkill(p,rawReflex);"), "RAW_ROLE_FIT_SOURCE_GATE");
  gate(source.includes('const S=k=>k==="rxn"?effectiveReflex:persStat(p,k);'), "EFFECTIVE_COMBAT_SOURCE_GATE");
  gate(source.includes("const spd=4.8+(p.sta?(p.sta-82)*0.025:0);"), "APM_MOVEMENT_SOURCE_GATE");
  const speedLine = (source.match(/const spd=[^\n]+/) || [""])[0];
  gate(!speedLine.includes("apm"), "APM_SPEED_SEMANTIC_DRIFT");
  gate(source.includes("aggr(p)<0.82") && source.includes("dx/L*3.2"), "APM_THRESHOLD_SOURCE_GATE");
  console.log("schema: " + EVENT_SCHEMA);
  console.log("seed generation version: " + SEED_GENERATION_VERSION);
  console.log("seedSetSha256: " + SEED_SET_SHA256);
  console.log("engineSourceSha256: " + sourceSha256);
  console.log("rand() call sites: " + randTokens(source).length);
  console.log("read-chain source: raw stats.apm -> posSkill role-fit read; persStat(apm) -> combatSkill/aggr effective live read; movement speed uses sta; aggr feeds retreat threshold and pair fireChance");

  const api = await loadApi(liveSource, source);
  gate(typeof api?.simulateFps === "function", "TEST_SIMULATOR_EXPORT_MISSING");
  gate(Array.isArray(api?.ROSTER), "TEST_ROSTER_EXPORT_MISSING");
  gate(api?.TACTICS_DB && typeof api.TACTICS_DB === "object", "TEST_TACTICS_EXPORT_MISSING");
  const map = api.TACTICS_DB[MAP_KEY];
  const tTactic = freeze(clone(map?.t?.find((item) => item.id === T_TACTIC_ID)));
  const ctTactic = freeze(clone(map?.ct?.find((item) => item.id === CT_TACTIC_ID)));
  const baselineRoster = freeze(clone(api.ROSTER));
  gate(tTactic?.id === T_TACTIC_ID && ctTactic?.id === CT_TACTIC_ID, "TACTIC_MISSING");
  gate(baselineRoster.length === 10, "ROSTER_SIZE", String(baselineRoster.length));
  const targets = baselineRoster.filter((player) => player.side === "t");
  gate(targets.length === 5 && targets.every((player) => TARGET_ROLES.includes(player.role)), "TARGET_ROLES");
  const inputBefore = inputDigest(MAP_KEY, tTactic, ctTactic, baselineRoster);
  const baselineArms = FIXED_SEEDS.map((seed) => runArm(api, { mapKey: MAP_KEY, tTactic, ctTactic, roster: baselineRoster, seed }));
  const cases = [];
  for (const target of targets) {
    const baselineRows = baselineArms.map((arm) => targetSummary(arm, target.id, target, baselineRoster));
    const rows = { baseline: baselineRows, low: [], high: [] };
    const levels = { baseline: target.stats.apm };
    for (const level of ["low", "high"]) {
      const treatment = treatmentRoster(baselineRoster, target.id, level);
      levels[level] = treatment.value;
      rows[level] = FIXED_SEEDS.map((seed) => {
        const arm = runArm(api, { mapKey: MAP_KEY, tTactic, ctTactic, roster: treatment.roster, seed });
        return targetSummary(arm, target.id, treatment.roster.find((player) => player.id === target.id), treatment.roster);
      });
    }
    const low = aggregateRows(rows.low);
    const baseline = aggregateRows(rows.baseline);
    const high = aggregateRows(rows.high);
    const metricDirections = {
      effectiveApmMean: true,
      roleFitMean: true,
      combatSkillMean: true,
      aggrMean: true,
      attackerExchanges: true,
      attackerKills: true,
      attackerDamageDealt: true,
      survivalRate: true,
      pairAdmissionRate: true,
      retreatTriggerRate: false,
      movementDistanceMean: true,
    };
    const metrics = Object.keys(metricDirections);
    const direct = Object.fromEntries(metrics.map((key) => [key, directDirection(low[key], baseline[key], high[key], metricDirections[key])]));
    const monotonic = Object.fromEntries(metrics.map((key) => [key, monotonicity(rows, baselineRows, key, metricDirections[key])]));
    const pairedEffects = Object.fromEntries(metrics.map((key) => [key, {
      lowBaseline: paired(rows.low, rows.baseline, key),
      highBaseline: paired(rows.high, rows.baseline, key),
      lowHigh: paired(rows.low, rows.high, key),
    }]));
    const path = {
      strictSimulation: {
        lowVsBaseline: pathComparison(rows.low, baselineRows, "strictSimDigest"),
        highVsBaseline: pathComparison(rows.high, baselineRows, "strictSimDigest"),
      },
      targetOnlyKpi: {
        lowVsBaseline: pathComparison(rows.low, baselineRows, "targetKpiDigest"),
        highVsBaseline: pathComparison(rows.high, baselineRows, "targetKpiDigest"),
      },
      structural: {
        lowVsBaseline: pathComparison(rows.low, baselineRows, "structuralDigest"),
        highVsBaseline: pathComparison(rows.high, baselineRows, "structuralDigest"),
      },
      nonMonotonicTargetDamageSeeds: monotonic.attackerDamageDealt.totalSeeds - monotonic.attackerDamageDealt.passingSeeds,
      nonMonotonicTargetKillSeeds: monotonic.attackerKills.totalSeeds - monotonic.attackerKills.passingSeeds,
    };
    const result = {
      targetId: target.id,
      role: target.role,
      personality: target.personality,
      levels,
      expectedEffectiveLevels: {
        low: Math.max(1, Math.min(99, levels.low + (APM_PERSONALITY_DELTA[target.personality] || 0))),
        baseline: Math.max(1, Math.min(99, levels.baseline + (APM_PERSONALITY_DELTA[target.personality] || 0))),
        high: Math.max(1, Math.min(99, levels.high + (APM_PERSONALITY_DELTA[target.personality] || 0))),
      },
      baseline,
      low,
      high,
      direct,
      monotonic,
      pairedEffects,
      saturation: saturationSummary(rows, baselineRows, levels),
      threshold: thresholdSummary(rows, baselineRows),
      path,
      targetOnlyAttribution: {
        attackerKills: { low: low.attackerKills, baseline: baseline.attackerKills, high: high.attackerKills },
        attackerDamageDealt: { low: low.attackerDamageDealt, baseline: baseline.attackerDamageDealt, high: high.attackerDamageDealt },
        defenderDeaths: { low: low.defenderDeaths, baseline: baseline.defenderDeaths, high: high.defenderDeaths },
        opponentSpilloverDamage: { low: low.opponentSpilloverDamage, baseline: baseline.opponentSpilloverDamage, high: high.opponentSpilloverDamage },
      },
    };
    cases.push(result);
    const levelSummary = (level) => ({
      effectiveApm: level.effectiveApm,
      roleFitMean: level.roleFitMean,
      combatSkillMean: level.combatSkillMean,
      aggrMean: level.aggrMean,
      attackerExchanges: level.attackerExchanges,
      attackerKills: level.attackerKills,
      attackerDamageDealt: level.attackerDamageDealt,
      defenderDeaths: level.defenderDeaths,
      survivalRate: level.survivalRate,
      pairAdmissionRate: level.pairAdmissionRate,
      retreatTriggerRate: level.retreatTriggerRate,
      movementDistanceMean: level.movementDistanceMean,
    });
    console.log("role apm evidence: " + JSON.stringify({
      role: result.role,
      targetId: result.targetId,
      personality: result.personality,
      levels: result.levels,
      expectedEffectiveLevels: result.expectedEffectiveLevels,
      measurements: { low: levelSummary(result.low), baseline: levelSummary(result.baseline), high: levelSummary(result.high) },
      targetDamageEffectSize: {
        lowToBaseline: result.pairedEffects.attackerDamageDealt.lowBaseline.effectSize,
        baselineToHigh: result.pairedEffects.attackerDamageDealt.highBaseline.effectSize,
      },
      monotonic: Object.fromEntries(Object.entries(result.monotonic).map(([key, value]) => [key, { passingSeeds: value.passingSeeds, totalSeeds: value.totalSeeds, strictMajority: value.strictMajority }])),
      saturation: result.saturation,
      threshold: result.threshold,
      targetOnlyAttribution: result.targetOnlyAttribution,
      path: {
        strictSimulation: result.path.strictSimulation,
        targetOnlyKpi: result.path.targetOnlyKpi,
        nonMonotonicTargetDamageSeeds: result.path.nonMonotonicTargetDamageSeeds,
        nonMonotonicTargetKillSeeds: result.path.nonMonotonicTargetKillSeeds,
      },
    }));
  }
  const controlRows = baselineArms.map((arm) => {
    const pers = arm.events.filter((event) => event.type === "persStatApm" && event.playerId === "ct3");
    const combat = arm.events.filter((event) => event.type === "combatSkillApmRead" && event.playerId === "ct3");
    return { rawApm: pers[0]?.rawApm ?? null, effectiveApm: pers[0]?.effectiveApm ?? null, persStatApmCalls: pers.length, combatSkillApmReads: combat.length };
  });
  gate(controlRows.every((row) => row.rawApm === 85 && row.effectiveApm === 85), "CONTROL_APM_SEMANTIC_DRIFT", JSON.stringify(controlRows));
  const control = {
    playerId: "ct3",
    role: "rifler",
    personality: "steady",
    rawApm: controlRows[0].rawApm,
    effectiveApm: controlRows[0].effectiveApm,
    persStatApmCalls: sum(controlRows, "persStatApmCalls"),
    combatSkillApmReads: sum(controlRows, "combatSkillApmReads"),
  };
  const suite = {
    schema: SUITE_SCHEMA,
    sourceSha256,
    seedSetSha256: SEED_SET_SHA256,
    scenario: { mapKey: MAP_KEY, tTacticId: T_TACTIC_ID, ctTacticId: CT_TACTIC_ID },
    band: BAND,
    targetRoles: TARGET_ROLES,
    attribution: "target player round_player_result attackerKills/attackerDamageDealt only; defenderDeaths and opponent spillover are separate",
    semanticBoundary: "raw stats.apm is role-fit input; persStat(apm) is personality-adjusted live contribution; no state/morale APM adjustment exists",
    control,
    cases,
  };
  const suiteDigest = sha256(json(suite));
  gate(inputBefore === inputDigest(MAP_KEY, tTactic, ctTactic, baselineRoster), "INPUT_MUTATED");
  gate(EXPECTED_SUITE_DIGEST !== "__CAPTURE_MANUALLY__", "SUITE_NOT_LOCKED", "candidate=" + suiteDigest);
  gate(suiteDigest === EXPECTED_SUITE_DIGEST, "APM_MEASUREMENT_REGRESSION", "expected=" + EXPECTED_SUITE_DIGEST + "\nactual=" + suiteDigest);
  console.log("simulations: " + (FIXED_SEEDS.length * (1 + targets.length * 2) * 3));
  console.log("suiteDigest: " + suiteDigest);
  console.log("control semantic probe: " + JSON.stringify(control));
  console.log("production source modified: no (memory transform only)");
  console.log("claim boundary: APM measurement / read-chain evidence only; no balance calibration claim");
  console.log("CS APM Measurement / Calibration Readiness R21: PASS");
}

main().catch((error) => {
  console.error("CS APM Measurement / Calibration Readiness R21: FAIL " + (error?.stack || error));
  process.exitCode = 1;
});
