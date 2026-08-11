#!/usr/bin/env node
// CS Positioning Measurement Completion R20
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
const SOURCE_SHA256 = "57476524ffa5693cb2cd00f28d73a1355e2dcf14ce0e018c9aa766febc706c29";
const EVENT_SCHEMA = "CsPositioningMeasurementEvent.v1";
const SUITE_SCHEMA = "CsPositioningMeasurementSuite.v1";
const EXPECTED_SUITE_DIGEST = "6849de4fc39b6b8311c67e91411a7aaf6c1844e435c729c631c7d03e600f410c";
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
const POS_PERSONALITY_DELTA = Object.freeze({ defensive: 6, steady: 6 });

const SIGNATURE_MARKER = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster){";
const SIGNATURE_REPLACEMENT = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster,__measure=null){";
const ROUND_STATE_MARKER = "    let contactCalled=false,defuseCalled=false,defuseProg=0;";
const ROUND_STATE_REPLACEMENT = [
  ROUND_STATE_MARKER,
  "    const __retreatState=__measure?new Map():null;",
].join("\n");
const PERS_MARKER = "function persStat(p,key){let v=(p.stats&&p.stats[key])||50;const pr=p.personality&&PERSONALITY[p.personality];if(pr){if(pr.boost.includes(key))v+=PERS_BOOST;if(pr.nerf.includes(key))v-=PERS_NERF;}return clamp(v,1,99);}";
const PERS_REPLACEMENT = "function persStat(p,key){let v=(p.stats&&p.stats[key])||50;const pr=p.personality&&PERSONALITY[p.personality];if(pr){if(pr.boost.includes(key))v+=PERS_BOOST;if(pr.nerf.includes(key))v-=PERS_NERF;}const effective=clamp(v,1,99);if(key===\"pos\")globalThis.__CS_R20_AUDIT__?.record(\"persStatPos\",{playerId:p.id,role:p.role,personality:p.personality,rawPos:Number(p.stats?.pos??50),effectivePos:effective});return effective;}";
const POS_MARKER = "function posSkill(p,rawReflex=Number((p.stats||{}).rxn??50)){const prof=POS_PROFILE[p.role]||POS_PROFILE.rifler;const s=p.stats||{};let t=0;prof.forEach((k,i)=>t+=(k===\"rxn\"?rawReflex:(s[k]||50))*(5-i));return t/15;}";
const POS_REPLACEMENT = "function posSkill(p,rawReflex=Number((p.stats||{}).rxn??50)){const prof=POS_PROFILE[p.role]||POS_PROFILE.rifler;const s=p.stats||{};let t=0;prof.forEach((k,i)=>t+=(k===\"rxn\"?rawReflex:(s[k]||50))*(5-i));const result=t/15;const posIndex=prof.indexOf(\"pos\");globalThis.__CS_R20_AUDIT__?.record(\"posSkill\",{playerId:p.id,role:p.role,profile:prof.join(\",\"),rawPos:Number(s.pos??50),posWeight:posIndex<0?0:5-posIndex,result});return result;}";
const S_MARKER = "const S=k=>k===\"rxn\"?effectiveReflex:persStat(p,k);";
const S_REPLACEMENT = "let __r20EffectivePos=null;const S=k=>{const value=k===\"rxn\"?effectiveReflex:persStat(p,k);if(k===\"pos\"){__r20EffectivePos=value;globalThis.__CS_R20_AUDIT__?.record(\"combatSkillPosRead\",{playerId:p.id,role:p.role,rawPos:Number(p.stats?.pos??50),effectivePos:value});}return value;};";
const COMBAT_RETURN_MARKER = "return v*formMul(p);";
const COMBAT_RETURN_REPLACEMENT = "const __r20Form=formMul(p),__r20Result=v*__r20Form;globalThis.__CS_R20_AUDIT__?.record(\"combatSkill\",{playerId:p.id,role:p.role,rawPos:Number(p.stats?.pos??50),effectivePos:__r20EffectivePos,roleFit:role,mechanics:mech,weapon:wpn,baseBeforeForm:v,formMul:__r20Form,result:__r20Result,holding:Boolean(opts?.holding),entry:Boolean(opts?.entry),lurk:Boolean(opts?.lurk),lowHP:Boolean(opts?.lowHP)});return __r20Result;";
const AGGR_MARKER = "function aggr(p){const s=p.stats;if(!s)return 0.6;const base=(persStat(p,\"cou\")*0.5+persStat(p,\"str\")*0.22+persStat(p,\"apm\")*0.16+persStat(p,\"pos\")*0.12)/100;const pr=p.personality&&PERSONALITY[p.personality];return clamp(base+(ROLE_AGGR[p.role]||0)+(pr?pr.aggro:0),0.2,1.15);}";
const AGGR_REPLACEMENT = "function aggr(p){const s=p.stats;if(!s)return 0.6;const __r20Cou=persStat(p,\"cou\"),__r20Str=persStat(p,\"str\"),__r20Apm=persStat(p,\"apm\"),__r20Pos=persStat(p,\"pos\");const base=(__r20Cou*0.5+__r20Str*0.22+__r20Apm*0.16+__r20Pos*0.12)/100;const pr=p.personality&&PERSONALITY[p.personality];const result=clamp(base+(ROLE_AGGR[p.role]||0)+(pr?pr.aggro:0),0.2,1.15);globalThis.__CS_R20_AUDIT__?.record(\"aggr\",{playerId:p.id,role:p.role,rawPos:Number(p.stats?.pos??50),effectivePos:__r20Pos,result});return result;}";
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
  '          const __r20PairKey=`${rnd+1}:${sec}:${tp.id}:${cp.id}`;',
  '          __measure?.record("combat_pair_candidate",{round:rnd+1,sec,pairKey:__r20PairKey,tPlayerId:tp.id,cPlayerId:cp.id,distance:d,fireChance});',
  "          if(__retreatRecontactIds.length){",
  '            for(const __id of __retreatRecontactIds)__retreatState.get(__id).recontacted=true;',
  '            __measure?.record("retreat_recontact",{round:rnd+1,sec,tPlayerId:tp.id,cPlayerId:cp.id,playerIds:__retreatRecontactIds.join("|"),distance:d,fireChance});',
  "          }",
  '          if(rand()>=fireChance){__measure?.record("combat_pair_rejected",{round:rnd+1,sec,pairKey:__r20PairKey,tPlayerId:tp.id,cPlayerId:cp.id,distance:d,fireChance});continue;}',
  '          __measure?.record("combat_pair_admitted",{round:rnd+1,sec,pairKey:__r20PairKey,tPlayerId:tp.id,cPlayerId:cp.id,distance:d,fireChance});',
  '          const __retreatReengageIds=__retreatPairIds.filter(__id=>!__retreatState.get(__id).reengaged);',
  "          if(__retreatReengageIds.length){",
  '            for(const __id of __retreatReengageIds)__retreatState.get(__id).reengaged=true;',
  '            __measure?.record("retreat_reengage",{round:rnd+1,sec,tPlayerId:tp.id,cPlayerId:cp.id,playerIds:__retreatReengageIds.join("|"),distance:d,fireChance});',
  "          }",
].join("\n");
const EXCHANGE_MARKER = "          const tw=rand()<Pt;const at=tw?tp:cp,df=tw?cp:tp;";
const EXCHANGE_REPLACEMENT = [
  EXCHANGE_MARKER,
  '          __measure?.record("combat_exchange",{round:rnd+1,sec,pairKey:__r20PairKey,tPlayerId:tp.id,cPlayerId:cp.id,distance:d,pt:Pt,attackerId:at.id,attackerSide:at.side,defenderId:df.id,defenderSide:df.side});',
].join("\n");
const ROUND_RESULT_MARKER = "      const wn=roundEnd.winner;";
const ROUND_RESULT_REPLACEMENT = [
  ROUND_RESULT_MARKER,
  '      __measure?.record("round_summary",{round:rnd+1,winner:wn,how:roundEnd.how});',
  '      ps.forEach(__p=>__measure?.record("round_player_result",{round:rnd+1,playerId:__p.id,side:__p.side,role:__p.role,survived:Boolean(!__p.dead),won:wn===__p.side,kills:roundKills[__p.id]||0,deaths:roundDeaths[__p.id]||0,damage:Math.round(roundDmg[__p.id]||0)}));',
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
  "const __CS_POSITIONING_R20_TEST_API__ = Object.freeze({",
  "  simulateFps: __FPS3D_MODULE.simulateFps,",
  "  ROSTER: __FPS3D_MODULE.ROSTER,",
  "  TACTICS_DB: __FPS3D_MODULE.TACTICS_DB,",
  "});",
  "export { EsportsFPS3D, buildMatchResult, __CS_POSITIONING_R20_TEST_API__ };",
].join("\n");
const TRANSFORMS = Object.freeze([
  ["simulate signature", SIGNATURE_MARKER, SIGNATURE_REPLACEMENT],
  ["round state", ROUND_STATE_MARKER, ROUND_STATE_REPLACEMENT],
  ["persStat pos", PERS_MARKER, PERS_REPLACEMENT],
  ["posSkill", POS_MARKER, POS_REPLACEMENT],
  ["combatSkill pos read", S_MARKER, S_REPLACEMENT],
  ["combatSkill return", COMBAT_RETURN_MARKER, COMBAT_RETURN_REPLACEMENT],
  ["aggr", AGGR_MARKER, AGGR_REPLACEMENT],
  ["retreat opportunity", MATES_MARKER, MATES_REPLACEMENT],
  ["retreat trigger", TRIGGER_MARKER, TRIGGER_REPLACEMENT],
  ["retreat displacement", DISPLACEMENT_MARKER, DISPLACEMENT_REPLACEMENT],
  ["pair admission", FIRE_MARKER, FIRE_REPLACEMENT],
  ["attacker defender", EXCHANGE_MARKER, EXCHANGE_REPLACEMENT],
  ["round result", ROUND_RESULT_MARKER, ROUND_RESULT_REPLACEMENT],
  ["module return", RETURN_MARKER, RETURN_REPLACEMENT],
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
  if (values.length < 2) return 0;
  const avg = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + ((value - avg) ** 2), 0) / (values.length - 1));
}
function rounded(value) { return +Number(value || 0).toFixed(4); }
function aggregate(values) {
  return values.length ? { mean: rounded(mean(values)), sd: rounded(sampleSd(values)), min: rounded(Math.min(...values)), max: rounded(Math.max(...values)) } : { mean: 0, sd: 0, min: 0, max: 0 };
}
function expectedEffectivePos(player) {
  return Math.max(1, Math.min(99, Number(player.stats?.pos ?? 50) + (POS_PERSONALITY_DELTA[player.personality] || 0)));
}
function keyOf(round, playerId, sec) { return `${round}|${playerId}|${sec}`; }
function episodeKey(round, playerId) { return `${round}|${playerId}`; }
function parseIds(value) { return value ? value.split("|").filter(Boolean) : []; }

function createCollector() {
  const events = [];
  return {
    events,
    record(type, payload) {
      gate(payload && typeof payload === "object" && !Array.isArray(payload), "EVENT_PAYLOAD", type);
      const event = Object.freeze({ schema: EVENT_SCHEMA, type, ...payload });
      for (const [key, value] of Object.entries(event)) {
        gate(value === null || ["string", "number", "boolean"].includes(typeof value), "EVENT_FIELD", `${type}.${key}`);
      }
      events.push(event);
    },
  };
}

async function loadApi(originalSource) {
  let transformSeen = 0; let restored = false; let rngSame = false; let vite = null;
  const tempRoot = mkdtempSync(join(tmpdir(), "esmo-cs-positioning-r20-"));
  try {
    vite = await createServer({
      root: ROOT, configFile: false, envFile: false, appType: "custom", logLevel: "error",
      cacheDir: join(tempRoot, "vite-cache"), optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true },
      plugins: [{ name: "cs-positioning-r20-memory-hooks", enforce: "pre", transform(code, id) {
        if (resolve(id.split("?")[0]).toLowerCase() !== FPS_FILE.toLowerCase()) return null;
        transformSeen += 1;
        gate(code === originalSource, "VITE_SOURCE_MISMATCH");
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
      } }],
    });
    const module = await vite.ssrLoadModule(`${FPS_MODULE_ID}?r20=${Date.now()}`);
    gate(transformSeen === 1 && restored && rngSame, "TRANSFORM_LOAD_GATE", JSON.stringify({ transformSeen, restored, rngSame }));
    return module.__CS_POSITIONING_R20_TEST_API__;
  } finally {
    if (vite) await vite.close();
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function inputDigest(mapKey, tTactic, ctTactic, roster) { return sha256(json({ mapKey, tTactic, ctTactic, roster })); }
function treatmentRoster(baselineRoster, targetId, level) {
  const next = clone(baselineRoster);
  const base = baselineRoster.find((player) => player.id === targetId);
  const target = next.find((player) => player.id === targetId);
  gate(base && target, "TARGET_MISSING", targetId);
  const values = { low: base.stats.pos - BAND, baseline: base.stats.pos, high: base.stats.pos + BAND };
  gate(values.low >= 1 && values.high <= 99, "POS_BAND_CLAMPED", `${targetId} ${JSON.stringify(values)}`);
  target.stats.pos = values[level];
  gate(target.fps === base.fps && target.moba === base.moba, "HUD_MUTATED", targetId);
  return { roster: freeze(next), value: values[level], values };
}

function validateEvents(events, sim, roster, seed) {
  gate(events.length > 0, "NO_POSITIONING_EVENTS", `seed=${seed}`);
  const allowed = new Set([
    "persStatPos", "posSkill", "combatSkillPosRead", "combatSkill", "aggr",
    "retreat_opportunity", "retreat_trigger", "retreat_displacement", "retreat_recontact",
    "retreat_reengage", "retreat_round_result", "retreat_round_summary", "combat_pair_candidate",
    "combat_pair_rejected", "combat_pair_admitted", "combat_exchange", "round_summary", "round_player_result",
  ]);
  for (const event of events) gate(event.schema === EVENT_SCHEMA && allowed.has(event.type), "EVENT_SCHEMA", event.type);
  const byId = new Map(roster.map((player) => [player.id, player]));
  const opportunities = new Map(); const triggers = new Map(); const displacements = new Map();
  const episodes = new Map(); const retreatResults = new Map(); const recontacts = new Map(); const reengages = new Map();
  const pairCandidates = new Map(); const pairRejected = new Map(); const pairAdmitted = new Map(); const exchanges = new Map();
  const roundSummaries = new Map(); const retreatSummaries = new Map(); const roundResults = new Map();
  for (const event of events) {
    if (event.type === "persStatPos") {
      const player = byId.get(event.playerId); gate(player, "READ_PLAYER_MISSING", event.playerId);
      gate(event.rawPos === Number(player.stats?.pos ?? 50), "RAW_POS_ATTRIBUTION", event.playerId);
      gate(event.effectivePos === expectedEffectivePos(player), "EFFECTIVE_POS_ATTRIBUTION", `${event.playerId} ${event.effectivePos}`);
      continue;
    }
    if (event.type === "posSkill") {
      const player = byId.get(event.playerId); gate(player, "POS_SKILL_PLAYER_MISSING", event.playerId);
      const profile = POS_PROFILE[player.role] || POS_PROFILE.rifler;
      gate(event.profile === profile.join(","), "POS_PROFILE_DRIFT", event.playerId);
      gate(event.rawPos === Number(player.stats?.pos ?? 50), "POS_SKILL_RAW_POS", event.playerId);
      const index = profile.indexOf("pos"); gate(event.posWeight === (index < 0 ? 0 : 5 - index), "POS_SKILL_WEIGHT", event.playerId);
      gate(Number.isFinite(event.result), "POS_SKILL_RESULT", event.playerId);
      continue;
    }
    if (event.type === "combatSkillPosRead") {
      const player = byId.get(event.playerId); gate(player, "COMBAT_POS_READ_PLAYER_MISSING", event.playerId);
      gate(event.rawPos === Number(player.stats?.pos ?? 50), "COMBAT_RAW_POS", event.playerId);
      gate(event.effectivePos === expectedEffectivePos(player), "COMBAT_EFFECTIVE_POS", event.playerId);
      continue;
    }
    if (event.type === "combatSkill") {
      const player = byId.get(event.playerId); gate(player, "COMBAT_SKILL_PLAYER_MISSING", event.playerId);
      gate(event.rawPos === Number(player.stats?.pos ?? 50), "COMBAT_RESULT_RAW_POS", event.playerId);
      gate(event.effectivePos === expectedEffectivePos(player), "COMBAT_RESULT_EFFECTIVE_POS", event.playerId);
      gate(Number.isFinite(event.result) && Number.isFinite(event.roleFit), "COMBAT_RESULT_VALUE", event.playerId);
      continue;
    }
    if (event.type === "aggr") {
      const player = byId.get(event.playerId); gate(player, "AGGR_PLAYER_MISSING", event.playerId);
      gate(event.rawPos === Number(player.stats?.pos ?? 50), "AGGR_RAW_POS", event.playerId);
      gate(event.effectivePos === expectedEffectivePos(player), "AGGR_EFFECTIVE_POS", event.playerId);
      gate(event.result >= 0.2 && event.result <= 1.15, "AGGR_RANGE", event.playerId);
      continue;
    }
    if (event.type === "retreat_opportunity") {
      const player = byId.get(event.playerId); gate(player && byId.has(event.enemyId), "RETREAT_OPPORTUNITY_PLAYER", `${seed} ${event.playerId}`);
      const key = keyOf(event.round, event.playerId, event.sec); gate(!opportunities.has(key), "DUPLICATE_RETREAT_OPPORTUNITY", `${seed} ${key}`);
      gate(event.side === player.side && event.role === player.role && event.distance >= 0 && event.distance < 32, "RETREAT_OPPORTUNITY_SHAPE", `${seed} ${key}`);
      gate(event.hp < 48 && event.mates > 1 && event.threshold === 0.82, "RETREAT_OPPORTUNITY_GATE_INPUT", `${seed} ${key}`);
      gate(event.gatePassed === (event.aggr < event.threshold), "RETREAT_OPPORTUNITY_GATE", `${seed} ${key}`);
      opportunities.set(key, event); continue;
    }
    if (event.type === "retreat_trigger") {
      const key = keyOf(event.round, event.playerId, event.sec); gate(opportunities.has(key), "TRIGGER_WITHOUT_OPPORTUNITY", `${seed} ${key}`);
      gate(opportunities.get(key).gatePassed, "TRIGGER_BLOCKED_OPPORTUNITY", `${seed} ${key}`);
      gate(!triggers.has(key), "DUPLICATE_RETREAT_TRIGGER", `${seed} ${key}`);
      gate(event.side === opportunities.get(key).side && event.role === opportunities.get(key).role, "TRIGGER_ATTRIBUTION", `${seed} ${key}`);
      const epKey = episodeKey(event.round, event.playerId);
      if (!episodes.has(epKey)) episodes.set(epKey, { round: event.round, playerId: event.playerId, side: event.side, role: event.role });
      triggers.set(key, event); continue;
    }
    if (event.type === "retreat_displacement") {
      const key = keyOf(event.round, event.playerId, event.sec); const trigger = triggers.get(key);
      gate(trigger, "DISPLACEMENT_WITHOUT_TRIGGER", `${seed} ${key}`); gate(!displacements.has(key), "DUPLICATE_RETREAT_DISPLACEMENT", `${seed} ${key}`);
      const expected = Math.hypot(event.toX - event.fromX, event.toY - event.fromY);
      gate(Math.abs(expected - event.distance) <= 1e-9, "DISPLACEMENT_DISTANCE", `${seed} ${key}`);
      gate(event.distance >= 0 && event.distance <= 3.2 + 1e-9, "DISPLACEMENT_CAP", `${seed} ${key}`);
      gate(event.fromX === trigger.fromX && event.fromY === trigger.fromY, "DISPLACEMENT_ORIGIN", `${seed} ${key}`);
      displacements.set(key, event); continue;
    }
    if (event.type === "retreat_recontact" || event.type === "retreat_reengage") {
      const ids = parseIds(event.playerIds); gate(ids.length > 0, "RETREAT_PAIR_IDS", `${seed} ${event.round}`);
      gate(event.tPlayerId && event.cPlayerId && byId.has(event.tPlayerId) && byId.has(event.cPlayerId), "RETREAT_PAIR_ATTRIBUTION", `${seed} ${event.round}`);
      gate(event.distance >= 0 && event.distance < 55 && event.fireChance >= 0 && event.fireChance <= 1, "RETREAT_PAIR_SHAPE", `${seed} ${event.round} ${JSON.stringify(event)}`);
      for (const playerId of ids) {
        const epKey = episodeKey(event.round, playerId); gate(episodes.has(epKey), "RETREAT_CONTACT_WITHOUT_EPISODE", `${seed} ${epKey}`);
        const prior = [...triggers.values()].filter((item) => item.round === event.round && item.playerId === playerId);
        gate(prior.length > 0 && Math.max(...prior.map((item) => item.sec)) < event.sec, "RETREAT_CONTACT_ORDER", `${seed} ${epKey}`);
        const contactKey = `${epKey}|${playerId}`;
        if (event.type === "retreat_recontact") { gate(!recontacts.has(contactKey), "DUPLICATE_RETREAT_RECONTACT", `${seed} ${contactKey}`); recontacts.set(contactKey, event); }
        else { gate(recontacts.has(contactKey), "REENGAGE_WITHOUT_RECONTACT", `${seed} ${contactKey}`); gate(!reengages.has(contactKey), "DUPLICATE_RETREAT_REENGAGE", `${seed} ${contactKey}`); gate(recontacts.get(contactKey).sec <= event.sec, "REENGAGE_ORDER", `${seed} ${contactKey}`); reengages.set(contactKey, event); }
      }
      continue;
    }
    if (event.type === "retreat_round_result") {
      const key = episodeKey(event.round, event.playerId); gate(episodes.has(key), "RETREAT_RESULT_WITHOUT_EPISODE", `${seed} ${key}`); gate(!retreatResults.has(key), "DUPLICATE_RETREAT_RESULT", `${seed} ${key}`);
      const triggerValues = [...triggers.values()].filter((item) => item.round === event.round && item.playerId === event.playerId);
      const displacementValues = [...displacements.values()].filter((item) => item.round === event.round && item.playerId === event.playerId);
      const episode = episodes.get(key);
      gate(event.side === episode.side && event.role === episode.role, "RETREAT_RESULT_ATTRIBUTION", `${seed} ${key}`);
      gate(event.startSec === Math.min(...triggerValues.map((item) => item.sec)), "RETREAT_RESULT_START_SEC", `${seed} ${key}`);
      gate(event.triggerTicks === triggerValues.length && event.lastSec === Math.max(...triggerValues.map((item) => item.sec)), "RETREAT_RESULT_TRIGGER_COUNT", `${seed} ${key}`);
      gate(Math.abs(event.totalDistance - displacementValues.reduce((sum, item) => sum + item.distance, 0)) <= 1e-9, "RETREAT_RESULT_DISTANCE", `${seed} ${key}`);
      const recontactKey = `${key}|${event.playerId}`;
      gate(event.recontacted === recontacts.has(recontactKey), "RETREAT_RESULT_RECONTACT_FLAG", `${seed} ${key}`);
      gate(event.reengaged === [...reengages.keys()].some((item) => item === `${key}|${event.playerId}`), "RETREAT_RESULT_REENGAGE_FLAG", `${seed} ${key}`);
      gate(!event.reengaged || event.recontacted, "RETREAT_RESULT_ORDER", `${seed} ${key}`);
      gate(typeof event.survived === "boolean" && event.won === (event.winner === event.side), "RETREAT_RESULT_FLAGS", `${seed} ${key}`);
      retreatResults.set(key, event); continue;
    }
    if (event.type === "retreat_round_summary") {
      gate(!retreatSummaries.has(event.round), "DUPLICATE_RETREAT_SUMMARY", `${seed} ${event.round}`);
      const expectedIds = [...episodes.values()].filter((episode) => episode.round === event.round).map((episode) => episode.playerId).sort().join("|");
      gate(event.episodePlayerIds === expectedIds, "RETREAT_SUMMARY_EPISODES", `${seed} ${event.round}`);
      const expected = sim.roundHist[event.round - 1]; gate(expected && expected.winner === event.winner && expected.how === event.how, "RETREAT_SUMMARY_RESULT", `${seed} ${event.round}`);
      parseIds(event.episodePlayerIds); retreatSummaries.set(event.round, event); continue;
    }
    if (event.type === "round_summary") {
      gate(!roundSummaries.has(event.round), "DUPLICATE_ROUND_SUMMARY", `${seed} ${event.round}`);
      const expected = sim.roundHist[event.round - 1]; gate(expected && expected.winner === event.winner && expected.how === event.how, "ROUND_SUMMARY_DRIFT", `${seed} ${event.round}`);
      roundSummaries.set(event.round, event); continue;
    }
    if (event.type === "round_player_result") {
      const key = episodeKey(event.round, event.playerId); const player = byId.get(event.playerId);
      gate(player && event.side === player.side && event.role === player.role, "ROUND_PLAYER_ATTRIBUTION", `${seed} ${key}`);
      gate(!roundResults.has(`player:${key}`), "DUPLICATE_ROUND_PLAYER_RESULT", `${seed} ${key}`);
      gate(typeof event.survived === "boolean" && typeof event.won === "boolean" && event.deaths >= 0 && event.kills >= 0 && event.damage >= 0, "ROUND_PLAYER_SHAPE", `${seed} ${key}`);
      roundResults.set(`player:${key}`, event); continue;
    }
    if (event.type === "combat_pair_candidate" || event.type === "combat_pair_rejected" || event.type === "combat_pair_admitted") {
      const map = event.type === "combat_pair_candidate" ? pairCandidates : event.type === "combat_pair_rejected" ? pairRejected : pairAdmitted;
      gate(byId.has(event.tPlayerId) && byId.has(event.cPlayerId) && byId.get(event.tPlayerId).side === "t" && byId.get(event.cPlayerId).side === "ct", "PAIR_ATTRIBUTION", `${seed} ${event.pairKey}`);
      gate(event.distance >= 0 && event.distance < 55 && event.fireChance >= 0 && event.fireChance <= 1, "PAIR_SHAPE", `${seed} ${event.pairKey}`);
      gate(!map.has(event.pairKey), "DUPLICATE_PAIR_EVENT", `${seed} ${event.type} ${event.pairKey}`); map.set(event.pairKey, event); continue;
    }
    if (event.type === "combat_exchange") {
      gate(pairAdmitted.has(event.pairKey), "EXCHANGE_WITHOUT_ADMISSION", `${seed} ${event.pairKey}`); gate(!exchanges.has(event.pairKey), "DUPLICATE_EXCHANGE", `${seed} ${event.pairKey}`);
      gate(event.attackerId !== event.defenderId && event.attackerSide !== event.defenderSide, "ATTACKER_DEFENDER_SAME_SIDE", `${seed} ${event.pairKey}`);
      gate((event.attackerId === event.tPlayerId && event.defenderId === event.cPlayerId) || (event.attackerId === event.cPlayerId && event.defenderId === event.tPlayerId), "EXCHANGE_PARTICIPANT_DRIFT", `${seed} ${event.pairKey}`);
      exchanges.set(event.pairKey, event); continue;
    }
  }
  const pairCandidateKeys = new Set(pairCandidates.keys());
  for (const key of pairRejected.keys()) gate(pairCandidateKeys.has(key), "REJECTED_WITHOUT_CANDIDATE", `${seed} ${key}`);
  for (const key of pairAdmitted.keys()) gate(pairCandidateKeys.has(key) && !pairRejected.has(key), "ADMITTED_PAIR_INVALID", `${seed} ${key}`);
  gate(roundSummaries.size === sim.rounds, "ROUND_SUMMARY_COUNT", `seed=${seed} actual=${roundSummaries.size} expected=${sim.rounds}`);
  gate(roundResults.size === sim.rounds * roster.length, "ROUND_RESULT_COUNT", `seed=${seed} actual=${roundResults.size} expected=${sim.rounds * roster.length}`);
  gate(opportunities.size >= triggers.size && triggers.size === displacements.size, "RETREAT_CHAIN_COUNT", `seed=${seed}`);
  gate(retreatResults.size === episodes.size, "RETREAT_EPISODE_COUNT", `seed=${seed}`);
  gate(retreatSummaries.size === sim.rounds, "RETREAT_SUMMARY_COUNT", `seed=${seed}`);
  gate(pairCandidates.size === pairRejected.size + pairAdmitted.size, "PAIR_ADMISSION_PARTITION", `seed=${seed}`);
  gate(exchanges.size === pairAdmitted.size, "PAIR_EXCHANGE_COUNT", `seed=${seed}`);
  gate(roundSummaries.size === sim.rounds, "ROUND_SUMMARY_GATE", `seed=${seed}`);
  gate(roundResults.size === sim.rounds * roster.length, "ROUND_RESULT_GATE", `seed=${seed}`);
  return {
    opportunities: opportunities.size,
    gatePasses: [...opportunities.values()].filter((item) => item.gatePassed).length,
    blockedByAggr: [...opportunities.values()].filter((item) => !item.gatePassed).length,
    triggers: triggers.size,
    displacements: displacements.size,
    recontacts: recontacts.size,
    reengages: reengages.size,
    episodes: episodes.size,
    pairCandidates: pairCandidates.size,
    pairRejected: pairRejected.size,
    pairAdmitted: pairAdmitted.size,
    exchanges: exchanges.size,
    roundResults: roundResults.size,
    retreatRoundResults: retreatResults.size,
  };
}

function frameSummary(sim, targetId) {
  let movementDistance = 0; let retreatFrames = 0; let engageFrames = 0; let previous = null;
  for (const frame of sim.frames) {
    const player = frame.players.find((item) => item.id === targetId); if (!player || player.dead) { previous = null; continue; }
    if (player.state === "撤退") retreatFrames++;
    if (player.state === "ENGAGE") engageFrames++;
    if (previous && previous.rnd === frame.rnd) movementDistance += Math.hypot(player.pos.x - previous.x, player.pos.y - previous.y);
    previous = { rnd: frame.rnd, x: player.pos.x, y: player.pos.y };
  }
  return { movementDistance, retreatFrames, engageFrames };
}

function targetSummary(arm, targetId, target, roster) {
  const own = arm.events.filter((event) => event.playerId === targetId);
  const pers = own.filter((event) => event.type === "persStatPos");
  const pos = own.filter((event) => event.type === "posSkill");
  const combatReads = own.filter((event) => event.type === "combatSkillPosRead");
  const combat = own.filter((event) => event.type === "combatSkill");
  const aggr = own.filter((event) => event.type === "aggr");
  const opportunities = arm.events.filter((event) => event.type === "retreat_opportunity" && event.playerId === targetId);
  const triggers = arm.events.filter((event) => event.type === "retreat_trigger" && event.playerId === targetId);
  const displacements = arm.events.filter((event) => event.type === "retreat_displacement" && event.playerId === targetId);
  const targetEpisodes = arm.events.filter((event) => event.type === "retreat_round_result" && event.playerId === targetId);
  const targetRecontacts = arm.events.filter((event) => event.type === "retreat_recontact" && parseIds(event.playerIds).includes(targetId));
  const targetReengages = arm.events.filter((event) => event.type === "retreat_reengage" && parseIds(event.playerIds).includes(targetId));
  const pairCandidates = arm.events.filter((event) => event.type === "combat_pair_candidate" && event.tPlayerId === targetId);
  const pairAdmitted = arm.events.filter((event) => event.type === "combat_pair_admitted" && event.tPlayerId === targetId);
  const pairRejected = arm.events.filter((event) => event.type === "combat_pair_rejected" && event.tPlayerId === targetId);
  const exchanges = arm.events.filter((event) => event.type === "combat_exchange" && (event.tPlayerId === targetId || event.cPlayerId === targetId));
  const roundResults = arm.events.filter((event) => event.type === "round_player_result" && event.playerId === targetId);
  const playerResult = arm.sim.players.find((item) => item.id === targetId);
  const triggerSec = triggers.map((event) => event.sec);
  const triggerByEpisode = new Map();
  for (const event of triggers) { const key = episodeKey(event.round, event.playerId); const values = triggerByEpisode.get(key) || []; values.push(event.sec); triggerByEpisode.set(key, values); }
  const recontactDelay = targetRecontacts.map((event) => {
    const values = triggerByEpisode.get(episodeKey(event.round, targetId)) || [];
    return event.sec - Math.min(...values);
  });
  const reengageDelay = targetReengages.map((event) => {
    const values = triggerByEpisode.get(episodeKey(event.round, targetId)) || [];
    return event.sec - Math.min(...values);
  });
  const targetAttackerExchanges = exchanges.filter((event) => event.attackerId === targetId);
  const targetDefenderExchanges = exchanges.filter((event) => event.defenderId === targetId);
  const frames = frameSummary(arm.sim, targetId);
  return {
    seed: arm.seed,
    rawPos: Number(target.stats.pos),
    effectivePos: expectedEffectivePos(target),
    persStatPosCalls: pers.length,
    posSkillCalls: pos.length,
    combatSkillPosReads: combatReads.length,
    combatSkillCalls: combat.length,
    aggrCalls: aggr.length,
    rawPosSkill: aggregate(pos.map((event) => event.result)),
    combatSkill: aggregate(combat.map((event) => event.result)),
    aggr: aggregate(aggr.map((event) => event.result)),
    combatSkillMean: combat.length ? mean(combat.map((event) => event.result)) : 0,
    aggrMean: aggr.length ? mean(aggr.map((event) => event.result)) : 0,
    opportunities: opportunities.length,
    gatePasses: opportunities.filter((event) => event.gatePassed).length,
    blockedByAggr: opportunities.filter((event) => !event.gatePassed).length,
    triggerRate: opportunities.length ? triggers.length / opportunities.length : 0,
    triggers: triggers.length,
    triggerSec: aggregate(triggerSec),
    displacements: displacements.length,
    totalDisplacement: displacements.reduce((sum, event) => sum + event.distance, 0),
    avgDisplacement: displacements.length ? mean(displacements.map((event) => event.distance)) : 0,
    episodes: targetEpisodes.length,
    recontacts: targetRecontacts.length,
    reengages: targetReengages.length,
    reengageRate: targetEpisodes.length ? targetReengages.length / targetEpisodes.length : 0,
    recontactDelay: aggregate(recontactDelay),
    reengageDelay: aggregate(reengageDelay),
    roundResults: roundResults.length,
    survivedRounds: roundResults.filter((event) => event.survived).length,
    deaths: roundResults.reduce((sum, event) => sum + event.deaths, 0),
    survivalRate: roundResults.length ? roundResults.filter((event) => event.survived).length / roundResults.length : 0,
    deathExposureRate: roundResults.length ? roundResults.reduce((sum, event) => sum + event.deaths, 0) / roundResults.length : 0,
    pairCandidates: pairCandidates.length,
    pairAdmitted: pairAdmitted.length,
    pairRejected: pairRejected.length,
    pairAdmissionRate: pairCandidates.length ? pairAdmitted.length / pairCandidates.length : 0,
    attackerExchanges: targetAttackerExchanges.length,
    defenderExchanges: targetDefenderExchanges.length,
    kills: playerResult?.k ?? 0,
    damageDealt: roundResults.reduce((sum, event) => sum + event.damage, 0),
    movementDistance: frames.movementDistance,
    movementDistanceMean: frames.movementDistance,
    retreatFrames: frames.retreatFrames,
    engageFrames: frames.engageFrames,
    digest: arm.eventDigest,
    validation: arm.validation,
    rosterSize: roster.length,
  };
}

function sum(rows, key) { return rows.reduce((total, row) => total + row[key], 0); }
function aggregateRows(rows) {
  const sums = ["persStatPosCalls", "posSkillCalls", "combatSkillPosReads", "combatSkillCalls", "aggrCalls", "opportunities", "gatePasses", "blockedByAggr", "triggers", "displacements", "episodes", "recontacts", "reengages", "roundResults", "survivedRounds", "deaths", "pairCandidates", "pairAdmitted", "pairRejected", "attackerExchanges", "defenderExchanges", "kills", "damageDealt"].reduce((out, key) => { out[key] = sum(rows, key); return out; }, {});
  const means = ["rawPosSkill", "combatSkill", "aggr", "triggerSec", "recontactDelay", "reengageDelay"].reduce((out, key) => { out[`${key}Mean`] = rounded(mean(rows.map((row) => row[key].mean))); return out; }, {});
  const rates = {
    triggerRate: sums.opportunities ? rounded(sums.triggers / sums.opportunities) : 0,
    reengageRate: sums.episodes ? rounded(sums.reengages / sums.episodes) : 0,
    survivalRate: sums.roundResults ? rounded(sums.survivedRounds / sums.roundResults) : 0,
    deathExposureRate: sums.roundResults ? rounded(sums.deaths / sums.roundResults) : 0,
    pairAdmissionRate: sums.pairCandidates ? rounded(sums.pairAdmitted / sums.pairCandidates) : 0,
  };
  return { seeds: rows.length, rawPos: rows[0].rawPos, effectivePos: rows[0].effectivePos, ...sums, ...means, ...rates,
    totalDisplacement: rounded(sum(rows, "totalDisplacement")), avgDisplacement: rounded(sum(rows, "displacements") ? sum(rows, "totalDisplacement") / sum(rows, "displacements") : 0),
    movementDistanceMean: rounded(mean(rows.map((row) => row.movementDistance))), retreatFramesMean: rounded(mean(rows.map((row) => row.retreatFrames))), engageFramesMean: rounded(mean(rows.map((row) => row.engageFrames))),
  };
}
function paired(rows, baselineRows, key) {
  const diffs = rows.map((row, index) => row[key] - baselineRows[index][key]);
  const avg = mean(diffs); const sd = sampleSd(diffs);
  const effectSize = sd < 1e-9 ? (Math.abs(avg) < 1e-9 ? 0 : null) : rounded(avg / sd);
  return { meanDiff: rounded(avg), sd: rounded(sd), effectSize, positiveSeeds: diffs.filter((value) => value > 0).length, negativeSeeds: diffs.filter((value) => value < 0).length, zeroSeeds: diffs.filter((value) => value === 0).length };
}
function directDirection(low, baseline, high, higherIsBetter = true) {
  const sign = higherIsBetter ? 1 : -1;
  const lowDiff = sign * (baseline - low); const highDiff = sign * (high - baseline);
  return { lowToBaseline: rounded(lowDiff), baselineToHigh: rounded(highDiff), monotonic: lowDiff >= 0 && highDiff >= 0 && (lowDiff > 0 || highDiff > 0) };
}

function runArm(api, { mapKey, tTactic, ctTactic, roster, seed }) {
  const before = inputDigest(mapKey, tTactic, ctTactic, roster);
  globalThis.__CS_R20_AUDIT__ = null;
  const off = api.simulateFps(mapKey, tTactic, ctTactic, seed, roster);
  const collector1 = createCollector(); globalThis.__CS_R20_AUDIT__ = collector1;
  const on1 = api.simulateFps(mapKey, tTactic, ctTactic, seed, roster, collector1);
  const collector2 = createCollector(); globalThis.__CS_R20_AUDIT__ = collector2;
  const on2 = api.simulateFps(mapKey, tTactic, ctTactic, seed, roster, collector2);
  globalThis.__CS_R20_AUDIT__ = null;
  const offJson = JSON.stringify(off); const on1Json = JSON.stringify(on1); const on2Json = JSON.stringify(on2);
  gate(offJson === on1Json && on1Json === on2Json, "INSTRUMENTATION_CHANGED_SIM", `seed=${seed}`);
  const eventJson1 = json(collector1.events); const eventJson2 = json(collector2.events);
  gate(eventJson1 === eventJson2, "AUDIT_NON_DETERMINISTIC", `seed=${seed}`);
  gate(before === inputDigest(mapKey, tTactic, ctTactic, roster), "SIM_MUTATED_INPUT", `seed=${seed}`);
  const validation = validateEvents(collector1.events, on1, roster, seed);
  return { seed, sim: on1, events: collector1.events, strictSimDigest: sha256(offJson), eventDigest: sha256(eventJson1), validation };
}

async function main() {
  const source = readFileSync(FPS_FILE, "utf8");
  const sourceSha256 = sha256(source);
  gate(sourceSha256 === SOURCE_SHA256, "SOURCE_SHA256", sourceSha256);
  gate(randTokens(source).length === EXPECTED_RAND_CALLS, "RAND_CALL_COUNT", String(randTokens(source).length));
  gate(FIXED_SEEDS.length === 16, "SEED_COUNT");
  gate(source.includes("const base=(persStat(p,\"cou\")*0.5+persStat(p,\"str\")*0.22+persStat(p,\"apm\")*0.16+persStat(p,\"pos\")*0.12)/100;"), "AGGR_POS_SOURCE_GATE");
  gate(source.includes("const role=posSkill(p,rawReflex);"), "RAW_ROLE_FIT_SOURCE_GATE");
  gate(source.includes("const S=k=>k===\"rxn\"?effectiveReflex:persStat(p,k);"), "EFFECTIVE_COMBAT_SOURCE_GATE");
  gate(source.includes("const spd=4.8+(p.sta?(p.sta-82)*0.025:0);"), "MOVEMENT_SPEED_SOURCE_GATE");
  gate(source.includes("aggr(p)<0.82") && source.includes("dx/L*3.2"), "RETREAT_SOURCE_GATE");
  console.log(`schema: ${EVENT_SCHEMA}`);
  console.log(`seed generation version: ${SEED_GENERATION_VERSION}`);
  console.log(`seedSetSha256: ${SEED_SET_SHA256}`);
  console.log(`engineSourceSha256: ${sourceSha256}`);
  console.log(`rand() call sites: ${randTokens(source).length}`);
  console.log("read-chain source: raw stats.pos -> posSkill role-fit; persStat(pos) -> combatSkill/aggr live behavior; movement speed uses sta; retreat uses aggr gate and safeMove displacement; pair admission uses aggr-derived fireChance");

  const api = await loadApi(source);
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
    const levels = { baseline: target.stats.pos };
    for (const level of ["low", "high"]) {
      const treatment = treatmentRoster(baselineRoster, target.id, level); levels[level] = treatment.value;
      rows[level] = FIXED_SEEDS.map((seed) => {
        const arm = runArm(api, { mapKey: MAP_KEY, tTactic, ctTactic, roster: treatment.roster, seed });
        return targetSummary(arm, target.id, treatment.roster.find((player) => player.id === target.id), treatment.roster);
      });
    }
    const low = aggregateRows(rows.low); const baseline = aggregateRows(rows.baseline); const high = aggregateRows(rows.high);
    const metrics = ["triggerRate", "triggers", "avgDisplacement", "reengageRate", "reengageDelayMean", "survivalRate", "deathExposureRate", "pairAdmissionRate", "attackerExchanges", "defenderExchanges", "movementDistanceMean", "combatSkillMean", "aggrMean"];
    const pairedEffects = Object.fromEntries(metrics.map((key) => [key, { lowBaseline: paired(rows.low, rows.baseline, key), highBaseline: paired(rows.high, rows.baseline, key), lowHigh: paired(rows.low, rows.high, key) }]));
    const direct = { effectivePos: directDirection(low.effectivePos, baseline.effectivePos, high.effectivePos), combatSkill: directDirection(low.combatSkillMean, baseline.combatSkillMean, high.combatSkillMean), aggr: directDirection(low.aggrMean, baseline.aggrMean, high.aggrMean), retreatTriggerRate: directDirection(low.triggerRate, baseline.triggerRate, high.triggerRate, false) };
    const result = { targetId: target.id, role: target.role, personality: target.personality, levels, baseline, low, high, direct, pairedEffects };
    cases.push(result);
    console.log(`role positioning evidence: ${JSON.stringify(result)}`);
  }
  const controlRows = baselineArms.map((arm) => {
    const raw = arm.events.filter((event) => event.type === "posSkill" && event.playerId === "ct3");
    const effective = arm.events.filter((event) => event.type === "combatSkillPosRead" && event.playerId === "ct3");
    return { rawPosSkillCalls: raw.length, rawPos: raw[0]?.rawPos ?? null, effectivePosReads: effective.length, effectivePos: effective[0]?.effectivePos ?? null };
  });
  const control = { playerId: "ct3", role: "rifler", personality: "steady", rawPos: controlRows[0].rawPos, effectivePos: controlRows[0].effectivePos, rawPosSkillCalls: sum(controlRows, "rawPosSkillCalls"), effectivePosReads: sum(controlRows, "effectivePosReads") };
  const suite = { schema: SUITE_SCHEMA, sourceSha256, seedSetSha256: SEED_SET_SHA256, scenario: { mapKey: MAP_KEY, tTacticId: T_TACTIC_ID, ctTacticId: CT_TACTIC_ID }, band: BAND, targetRoles: TARGET_ROLES, control, cases };
  const suiteDigest = sha256(json(suite));
  gate(inputBefore === inputDigest(MAP_KEY, tTactic, ctTactic, baselineRoster), "INPUT_MUTATED");
  gate(EXPECTED_SUITE_DIGEST !== "__CAPTURE_MANUALLY__", "SUITE_NOT_LOCKED", `candidate=${suiteDigest}`);
  gate(suiteDigest === EXPECTED_SUITE_DIGEST, "POSITIONING_MEASUREMENT_REGRESSION", `expected=${EXPECTED_SUITE_DIGEST}\nactual=${suiteDigest}`);
  console.log(`simulations: ${FIXED_SEEDS.length * (1 + targets.length * 2) * 3}`);
  console.log(`suiteDigest: ${suiteDigest}`);
  console.log(`control semantic probe: ${JSON.stringify(control)}`);
  console.log("production source modified: no (memory transform only)");
  console.log("claim boundary: positioning measurement / read-chain evidence only; no balance calibration claim");
  console.log("CS Positioning Measurement Completion R20: PASS");
}

main().catch((error) => { console.error(`CS Positioning Measurement Completion R20: FAIL ${error?.stack || error}`); process.exitCode = 1; });
