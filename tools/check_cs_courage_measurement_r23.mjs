#!/usr/bin/env node
// R23：CS Courage Measurement / Calibration Readiness。
// 只在 Vite memory transform 中加觀測點；production source、RNG 與 scenario 不變。

import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { CS_R33_RESILIENCE_SOURCE_SHA256, csR25R24Source } from "./cs_r15_legacy_source.mjs";
import {
  CALIBRATION_LEVELS,
  changedSeedSummary,
  clampSummary,
  classifyCausalReadiness,
  monotonicity,
  pairedEffect,
  thresholdCrossing,
} from "./cs_calibration_measurement.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FPS_FILE = resolve(ROOT, "src/battle/fps/EsportsFPS3D.jsx");
const FPS_MODULE_ID = "/src/battle/fps/EsportsFPS3D.jsx";
const SOURCE_SHA256 = "57476524ffa5693cb2cd00f28d73a1355e2dcf14ce0e018c9aa766febc706c29";
const EVENT_SCHEMA = "CsCourageMeasurementEvent.v1";
const SUITE_SCHEMA = "CsCourageMeasurementSuite.v1";
const EXPECTED_SUITE_DIGEST = "5809adbd6fff29662cf6adc6eb4fc9adcde5a672d47f6735f1e2b57d1349f271";
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
// t1 raw courage=88；使用 ±10 避免 raw high=100，把 runtime personality clamp 與 treatment clamp 分開。
const BAND = 10;
const TARGET_ROLES = Object.freeze(["entry", "rifler", "awp", "lurker", "igl"]);
const COURAGE_THRESHOLD = 0.82;
const POS_PROFILE = Object.freeze({
  rifler: ["acc", "rxn", "pos", "foc", "str"],
  entry: ["cou", "rxn", "apm", "acc", "str"],
  awp: ["acc", "foc", "pos", "str", "rxn"],
  igl: ["led", "com", "dec", "tac", "adp"],
  support: ["coo", "tac", "com", "pos", "vis"],
  lurker: ["vis", "dec", "pos", "adp", "str"],
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
  genius: {}, grinder: {},
  shotcaller: { apm: -4 },
  lonewolf: { apm: 6 },
  steady: { cou: -4, pos: 6 },
  creative: {},
});

const SIGNATURE_MARKER = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster){";
const SIGNATURE_REPLACEMENT = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster,__measure=null){";
const ROUND_STATE_MARKER = "    let contactCalled=false,defuseCalled=false,defuseProg=0;";
const ROUND_STATE_REPLACEMENT = [
  ROUND_STATE_MARKER,
  "    const __r23RetreatState=__measure?new Map():null;",
].join("\n");
const PERS_MARKER = "function persStat(p,key){let v=(p.stats&&p.stats[key])||50;const pr=p.personality&&PERSONALITY[p.personality];if(pr){if(pr.boost.includes(key))v+=PERS_BOOST;if(pr.nerf.includes(key))v-=PERS_NERF;}return clamp(v,1,99);}";
const PERS_REPLACEMENT = 'function persStat(p,key){let v=(p.stats&&p.stats[key])||50;const pr=p.personality&&PERSONALITY[p.personality];if(pr){if(pr.boost.includes(key))v+=PERS_BOOST;if(pr.nerf.includes(key))v-=PERS_NERF;}const adjusted=v,effective=clamp(adjusted,1,99);if(key==="cou")globalThis.__CS_R23_AUDIT__?.record("persStatCourage",{playerId:p.id,role:p.role,personality:p.personality,rawCourage:Number(p.stats?.cou??50),adjustedCourage:adjusted,effectiveCourage:effective,clamped:effective!==adjusted,adjustmentSource:"personality-only"});return effective;}';
const POS_MARKER = "function posSkill(p,rawReflex=Number((p.stats||{}).rxn??50)){const prof=POS_PROFILE[p.role]||POS_PROFILE.rifler;const s=p.stats||{};let t=0;prof.forEach((k,i)=>t+=(k===\"rxn\"?rawReflex:(s[k]||50))*(5-i));return t/15;}";
const POS_REPLACEMENT = 'function posSkill(p,rawReflex=Number((p.stats||{}).rxn??50)){const prof=POS_PROFILE[p.role]||POS_PROFILE.rifler;const s=p.stats||{};let t=0;prof.forEach((k,i)=>t+=(k==="rxn"?rawReflex:(s[k]||50))*(5-i));const result=t/15,rawCourage=Number(s.cou??50),couIndex=prof.indexOf("cou"),couWeight=couIndex<0?0:5-couIndex;globalThis.__CS_R23_AUDIT__?.record("posSkillCourageRead",{playerId:p.id,role:p.role,profile:prof.join(","),rawCourage,courageWeight:couWeight,result});return result;}';
const S_MARKER = "const S=k=>k===\"rxn\"?effectiveReflex:persStat(p,k);";
const S_REPLACEMENT = 'let __r23EffectiveCourage=null,__r23CourageReads=0;const S=k=>{const value=k==="rxn"?effectiveReflex:persStat(p,k);if(k==="cou"){__r23EffectiveCourage=value;__r23CourageReads++;globalThis.__CS_R23_AUDIT__?.record("combatSkillCourageRead",{playerId:p.id,role:p.role,personality:p.personality,rawCourage:Number(p.stats?.cou??50),effectiveCourage:value,entry:Boolean(opts?.entry)});}return value;};';
const COMBAT_RETURN_MARKER = "return v*formMul(p);";
const COMBAT_RETURN_REPLACEMENT = 'const __r23Form=formMul(p),__r23Result=v*__r23Form;globalThis.__CS_R23_AUDIT__?.record("combatSkill",{playerId:p.id,role:p.role,personality:p.personality,rawCourage:Number(s.cou??50),effectiveCourage:__r23EffectiveCourage,courageReads:__r23CourageReads,roleFit:role,baseBeforeForm:v,formMul:__r23Form,result:__r23Result,holding:Boolean(opts?.holding),entry:Boolean(opts?.entry),lurk:Boolean(opts?.lurk),lowHP:Boolean(opts?.lowHP)});return __r23Result;';
const AGGR_MARKER = "function aggr(p){const s=p.stats;if(!s)return 0.6;const base=(persStat(p,\"cou\")*0.5+persStat(p,\"str\")*0.22+persStat(p,\"apm\")*0.16+persStat(p,\"pos\")*0.12)/100;const pr=p.personality&&PERSONALITY[p.personality];return clamp(base+(ROLE_AGGR[p.role]||0)+(pr?pr.aggro:0),0.2,1.15);}";
const AGGR_REPLACEMENT = 'function aggr(p){const s=p.stats;if(!s)return 0.6;const __r23Cou=persStat(p,"cou"),__r23Str=persStat(p,"str"),__r23Apm=persStat(p,"apm"),__r23Pos=persStat(p,"pos");const base=(__r23Cou*0.5+__r23Str*0.22+__r23Apm*0.16+__r23Pos*0.12)/100;const pr=p.personality&&PERSONALITY[p.personality];const result=clamp(base+(ROLE_AGGR[p.role]||0)+(pr?pr.aggro:0),0.2,1.15);globalThis.__CS_R23_AUDIT__?.record("aggrCourage",{playerId:p.id,role:p.role,personality:p.personality,rawCourage:Number(p.stats?.cou??50),effectiveCourage:__r23Cou,result});return result;}';
const MATES_MARKER = '         const mates=(p.side==="t"?aliveT:aliveCT).length;';
const MATES_REPLACEMENT = [
  MATES_MARKER,
  '         const __r23RetreatMeasure=__measure&&near&&!buyP&&dist(near.pos,p.pos)<32&&p.hp<48&&mates>1?{distance:dist(near.pos,p.pos),aggr:aggr(p)}:null;',
  '         if(__r23RetreatMeasure)__measure.record("retreat_opportunity",{round:rnd+1,sec,playerId:p.id,side:p.side,role:p.role,hp:p.hp,mates,enemyId:near.id,distance:__r23RetreatMeasure.distance,aggr:__r23RetreatMeasure.aggr,threshold:0.82,gatePassed:__r23RetreatMeasure.aggr<0.82});',
].join("\n");
const TRIGGER_MARKER = "         if(near&&!buyP&&dist(near.pos,p.pos)<32&&p.hp<48&&aggr(p)<0.82&&mates>1){";
const TRIGGER_REPLACEMENT = [
  TRIGGER_MARKER,
  "           const __r23RetreatFrom=__r23RetreatState?{x:p.pos.x,y:p.pos.y}:null;",
  "           if(__r23RetreatState){",
  '             let __episode=__r23RetreatState.get(p.id);if(!__episode){__episode={playerId:p.id,side:p.side,role:p.role,lastSec:sec,triggerTicks:0,totalDistance:0,reengaged:false};__r23RetreatState.set(p.id,__episode);}',
  "             __episode.lastSec=sec;__episode.triggerTicks++;",
  '             __measure.record("retreat_trigger",{round:rnd+1,sec,playerId:p.id,side:p.side,role:p.role,hp:p.hp,mates,enemyId:near.id,distance:__r23RetreatMeasure.distance,aggr:__r23RetreatMeasure.aggr,threshold:0.82,fromX:__r23RetreatFrom.x,fromY:__r23RetreatFrom.y});',
  "           }",
].join("\n");
const DISPLACEMENT_MARKER = "           p.pos=safeMove(p.pos,{x:p.pos.x+dx/L*3.2,y:p.pos.y+dy/L*3.2},walls,PLAYER_R);";
const DISPLACEMENT_REPLACEMENT = [
  DISPLACEMENT_MARKER,
  "           if(__r23RetreatState){const __episode=__r23RetreatState.get(p.id);const __distance=Math.hypot(p.pos.x-__r23RetreatFrom.x,p.pos.y-__r23RetreatFrom.y);__episode.totalDistance+=__distance;__measure.record(\"retreat_displacement\",{round:rnd+1,sec,playerId:p.id,fromX:__r23RetreatFrom.x,fromY:__r23RetreatFrom.y,toX:p.pos.x,toY:p.pos.y,distance:__distance});}",
].join("\n");
const FIRE_MARKER = "          if(rand()>=fireChance)continue;";
const FIRE_REPLACEMENT = [
  '          const __r23PairKey=String(rnd+1)+":"+String(sec)+":"+tp.id+":"+cp.id;const __r23RetreatIds=__r23RetreatState?[tp.id,cp.id].filter(__id=>{const __ep=__r23RetreatState.get(__id);return __ep&&__ep.lastSec<sec&&!__ep.reengaged;}):[];',
  '          __measure?.record("combat_pair_candidate",{round:rnd+1,sec,pairKey:__r23PairKey,tPlayerId:tp.id,cPlayerId:cp.id,distance:d,fireChance});',
  '          if(rand()>=fireChance){__measure?.record("combat_pair_rejected",{round:rnd+1,sec,pairKey:__r23PairKey,tPlayerId:tp.id,cPlayerId:cp.id,distance:d,fireChance});continue;}',
  '          __measure?.record("combat_pair_admitted",{round:rnd+1,sec,pairKey:__r23PairKey,tPlayerId:tp.id,cPlayerId:cp.id,distance:d,fireChance});',
  '          if(__r23RetreatIds.length){for(const __id of __r23RetreatIds)__r23RetreatState.get(__id).reengaged=true;__measure?.record("retreat_reengage",{round:rnd+1,sec,tPlayerId:tp.id,cPlayerId:cp.id,playerIds:__r23RetreatIds.join("|"),distance:d,fireChance});}',
].join("\n");
const EXCHANGE_MARKER = "          const tw=rand()<Pt;const at=tw?tp:cp,df=tw?cp:tp;";
const EXCHANGE_REPLACEMENT = [
  EXCHANGE_MARKER,
  '          __measure?.record("combat_exchange",{round:rnd+1,sec,pairKey:__r23PairKey,tPlayerId:tp.id,cPlayerId:cp.id,distance:d,pt:Pt,attackerId:at.id,attackerSide:at.side,defenderId:df.id,defenderSide:df.side});',
].join("\n");
const ROUND_RESULT_MARKER = "      const wn=roundEnd.winner;";
const ROUND_RESULT_REPLACEMENT = [
  ROUND_RESULT_MARKER,
  '      __measure?.record("round_summary",{round:rnd+1,winner:wn,how:roundEnd.how});',
  '      ps.forEach(__p=>__measure?.record("round_player_result",{round:rnd+1,playerId:__p.id,side:__p.side,role:__p.role,survived:Boolean(!__p.dead),won:wn===__p.side,attackerKills:roundKills[__p.id]||0,attackerDamageDealt:Math.round(roundDmg[__p.id]||0),defenderDeaths:roundDeaths[__p.id]||0}));',
].join("\n");
const RETURN_MARKER = "return { EsportsFPS3D, buildMatchResult };";
const RETURN_REPLACEMENT = "return { EsportsFPS3D, buildMatchResult, simulateFps, ROSTER, TACTICS_DB };";
const EXPORT_MARKER = "export { EsportsFPS3D, buildMatchResult };";
const EXPORT_REPLACEMENT = [
  "const __CS_COURAGE_R23_TEST_API__ = Object.freeze({",
  "  simulateFps: __FPS3D_MODULE.simulateFps,",
  "  ROSTER: __FPS3D_MODULE.ROSTER,",
  "  TACTICS_DB: __FPS3D_MODULE.TACTICS_DB,",
  "});",
  "export { EsportsFPS3D, buildMatchResult, __CS_COURAGE_R23_TEST_API__ };",
].join("\n");
const TRANSFORMS = Object.freeze([
  ["simulate signature", SIGNATURE_MARKER, SIGNATURE_REPLACEMENT],
  ["round state", ROUND_STATE_MARKER, ROUND_STATE_REPLACEMENT],
  ["persStat courage", PERS_MARKER, PERS_REPLACEMENT],
  ["posSkill courage", POS_MARKER, POS_REPLACEMENT],
  ["combatSkill courage read", S_MARKER, S_REPLACEMENT],
  ["combatSkill return", COMBAT_RETURN_MARKER, COMBAT_RETURN_REPLACEMENT],
  ["aggr courage", AGGR_MARKER, AGGR_REPLACEMENT],
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
  seen.add(value); for (const child of Object.values(value)) freeze(child, seen);
  return Object.freeze(value);
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
function randTokens(source) { return source.match(/\brand\s*\(\s*\)/g) || []; }
function mean(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function sampleSd(values) { if (values.length < 2) return 0; const avg = mean(values); return Math.sqrt(values.reduce((sum, value) => sum + ((value - avg) ** 2), 0) / (values.length - 1)); }
function rounded(value) { return +Number(value || 0).toFixed(4); }
function aggregate(values) { return values.length ? { mean: rounded(mean(values)), sd: rounded(sampleSd(values)), min: rounded(Math.min(...values)), max: rounded(Math.max(...values)) } : { mean: 0, sd: 0, min: 0, max: 0 }; }
function expectedEffectiveCourage(player) {
  const raw = Number(player.stats?.cou ?? 50);
  return Math.max(1, Math.min(99, raw + (PERSONALITY_STAT_DELTAS[player.personality]?.cou || 0)));
}
function expectedEffectiveStat(player, key) {
  const raw = Number(player.stats?.[key] ?? 50);
  return Math.max(1, Math.min(99, raw + (PERSONALITY_STAT_DELTAS[player.personality]?.[key] || 0)));
}
function expectedPosSkill(player) {
  const profile = POS_PROFILE[player.role] || POS_PROFILE.rifler;
  const stats = player.stats || {}; const rawReflex = Number(stats.rxn ?? 50); let total = 0;
  profile.forEach((key, index) => { total += (key === "rxn" ? rawReflex : Number(stats[key] || 50)) * (5 - index); });
  return total / 15;
}
function courageWeight(player) { const profile = POS_PROFILE[player.role] || POS_PROFILE.rifler; const index = profile.indexOf("cou"); return index < 0 ? 0 : 5 - index; }
function expectedAggr(player) {
  const base = (expectedEffectiveCourage(player) * 0.5 + expectedEffectiveStat(player, "str") * 0.22 + expectedEffectiveStat(player, "apm") * 0.16 + expectedEffectiveStat(player, "pos") * 0.12) / 100;
  return Math.max(0.2, Math.min(1.15, base + (ROLE_AGGR[player.role] || 0) + (PERSONALITY_AGGRO[player.personality] || 0)));
}
function keyOf(round, playerId, sec) { return `${round}|${playerId}|${sec}`; }
function pairKey(event) { return event.pairKey; }
function parseIds(value) { return value ? value.split("|").filter(Boolean) : []; }
function createCollector() {
  const events = [];
  return { events, record(type, payload) {
    gate(payload && typeof payload === "object" && !Array.isArray(payload), "EVENT_PAYLOAD", type);
    const event = Object.freeze({ schema: EVENT_SCHEMA, type, ...payload });
    for (const [key, value] of Object.entries(event)) gate(value === null || ["string", "number", "boolean"].includes(typeof value), "EVENT_FIELD", `${type}.${key}`);
    events.push(event);
  } };
}

async function loadApi(originalSource) {
  let transformSeen = 0; let restored = false; let rngSame = false; let vite = null;
  const tempRoot = mkdtempSync(join(tmpdir(), "esmo-cs-courage-r23-"));
  try {
    vite = await createServer({ root: ROOT, configFile: false, envFile: false, appType: "custom", logLevel: "error", cacheDir: join(tempRoot, "vite-cache"), optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, plugins: [{
      name: "cs-courage-r23-memory-hooks", enforce: "pre", transform(code, id) {
        if (resolve(id.split("?")[0]).toLowerCase() !== FPS_FILE.toLowerCase()) return null;
        transformSeen += 1; gate(csR25R24Source(code) === originalSource, "VITE_SOURCE_MISMATCH"); let transformed = originalSource;
        for (const [name, marker, replacement] of TRANSFORMS) { gate(occurrences(transformed, marker) === 1, "TRANSFORM_MARKER_COUNT", name); transformed = transformed.replace(marker, replacement); }
        let roundTrip = transformed;
        for (const [name, marker, replacement] of [...TRANSFORMS].reverse()) { gate(occurrences(roundTrip, replacement) === 1, "TRANSFORM_REPLACEMENT_COUNT", name); roundTrip = roundTrip.replace(replacement, marker); }
        restored = roundTrip === originalSource; rngSame = json(randTokens(transformed)) === json(randTokens(originalSource));
        gate(restored, "TRANSFORM_NOT_REVERSIBLE"); gate(rngSame, "RNG_TOKEN_SEQUENCE_CHANGED"); return { code: transformed, map: null };
      },
    }] });
    const module = await vite.ssrLoadModule(FPS_MODULE_ID + "?r23=" + Date.now());
    gate(transformSeen === 1 && restored && rngSame, "TRANSFORM_LOAD_GATE", json({ transformSeen, restored, rngSame }));
    return module.__CS_COURAGE_R23_TEST_API__;
  } finally { if (vite) await vite.close(); rmSync(tempRoot, { recursive: true, force: true }); }
}

function inputDigest(mapKey, tTactic, ctTactic, roster) { return sha256(json({ mapKey, tTactic, ctTactic, roster })); }
function treatmentRoster(baselineRoster, targetId, level) {
  const next = clone(baselineRoster); const base = baselineRoster.find((player) => player.id === targetId); const target = next.find((player) => player.id === targetId);
  gate(base && target, "TARGET_MISSING", targetId);
  const values = { low: base.stats.cou - BAND, baseline: base.stats.cou, high: base.stats.cou + BAND };
  gate(values.low >= 1 && values.high <= 99, "COURAGE_BAND_CLAMPED", `${targetId} ${json(values)}`);
  target.stats.cou = values[level];
  gate(next.length === baselineRoster.length, "ROSTER_SIZE_MUTATED", targetId);
  for (const candidate of next) {
    const original = baselineRoster.find((player) => player.id === candidate.id);
    gate(original, "TREATMENT_PLAYER_DRIFT", candidate.id);
    if (candidate.id === targetId) {
      const originalComparable = { ...original, stats: { ...original.stats } };
      const candidateComparable = { ...candidate, stats: { ...candidate.stats } };
      delete originalComparable.stats.cou;
      delete candidateComparable.stats.cou;
      gate(json(candidateComparable) === json(originalComparable), "TREATMENT_NON_COURAGE_MUTATION", targetId);
    } else {
      gate(json(candidate) === json(original), "TREATMENT_OTHER_PLAYER_MUTATION", candidate.id);
    }
  }
  gate(target.fps === base.fps && target.moba === base.moba, "HUD_MUTATED", targetId);
  return { roster: freeze(next), value: values[level], values };
}

function validateEvents(events, sim, roster, seed) {
  gate(events.length > 0, "NO_COURAGE_EVENTS", `seed=${seed}`);
  const allowed = new Set(["persStatCourage", "posSkillCourageRead", "combatSkillCourageRead", "combatSkill", "aggrCourage", "retreat_opportunity", "retreat_trigger", "retreat_displacement", "retreat_reengage", "combat_pair_candidate", "combat_pair_rejected", "combat_pair_admitted", "combat_exchange", "round_summary", "round_player_result"]);
  for (const event of events) gate(event.schema === EVENT_SCHEMA && allowed.has(event.type), "EVENT_SCHEMA", event.type);
  const byId = new Map(roster.map((player) => [player.id, player])); const pers = new Map(); const pos = new Map(); const aggr = new Map();
  const opportunities = new Map(), triggers = new Map(), displacements = new Map(), reengages = new Map();
  const candidates = new Map(), rejected = new Map(), admitted = new Map(), exchanges = new Map(), rounds = new Map(), playerResults = new Map();
  for (const event of events) {
    if (["persStatCourage", "posSkillCourageRead", "combatSkillCourageRead", "combatSkill", "aggrCourage"].includes(event.type)) gate(byId.has(event.playerId), "READ_PLAYER_MISSING", event.playerId);
    if (event.type === "persStatCourage") {
      const p = byId.get(event.playerId), raw = Number(p.stats?.cou ?? 50), expected = expectedEffectiveCourage(p);
      gate(event.rawCourage === raw && event.adjustedCourage === raw + (PERSONALITY_STAT_DELTAS[p.personality]?.cou || 0), "RAW_COURAGE_ATTRIBUTION", event.playerId);
      gate(event.effectiveCourage === expected && event.clamped === (event.effectiveCourage !== event.adjustedCourage), "EFFECTIVE_COURAGE_ATTRIBUTION", event.playerId);
      gate(event.adjustmentSource === "personality-only", "COURAGE_ADJUSTMENT_SOURCE", event.playerId); pers.set(event.playerId, event); continue;
    }
    if (event.type === "posSkillCourageRead") {
      const p = byId.get(event.playerId), profile = POS_PROFILE[p.role] || POS_PROFILE.rifler;
      gate(event.profile === profile.join(",") && event.rawCourage === Number(p.stats?.cou ?? 50) && event.courageWeight === courageWeight(p), "RAW_ROLE_FIT_ATTRIBUTION", event.playerId);
      gate(Math.abs(event.result - expectedPosSkill(p)) <= 1e-9, "RAW_ROLE_FIT_RESULT", event.playerId); pos.set(event.playerId, event); continue;
    }
    if (event.type === "combatSkillCourageRead") {
      const p = byId.get(event.playerId); gate(event.rawCourage === Number(p.stats?.cou ?? 50) && event.effectiveCourage === expectedEffectiveCourage(p), "LIVE_COMBAT_COURAGE_ATTRIBUTION", event.playerId); continue;
    }
    if (event.type === "combatSkill") {
      gate(event.rawCourage === Number(byId.get(event.playerId).stats?.cou ?? 50) && Number.isFinite(event.result) && event.courageReads >= 0, "COMBAT_COURAGE_RESULT", event.playerId); continue;
    }
    if (event.type === "aggrCourage") {
      const p = byId.get(event.playerId); gate(event.rawCourage === Number(p.stats?.cou ?? 50) && event.effectiveCourage === expectedEffectiveCourage(p), "AGGR_COURAGE_ATTRIBUTION", event.playerId); gate(Math.abs(event.result - expectedAggr(p)) <= 1e-9, "AGGR_COURAGE_RESULT", event.playerId); aggr.set(event.playerId, event); continue;
    }
    if (event.type === "retreat_opportunity") {
      const p = byId.get(event.playerId); gate(p && byId.has(event.enemyId) && event.side === p.side && event.role === p.role, "RETREAT_ATTRIBUTION", event.playerId); const key = keyOf(event.round, event.playerId, event.sec);
      gate(!opportunities.has(key) && event.hp < 48 && event.mates > 1 && event.distance >= 0 && event.distance < 32 && event.threshold === COURAGE_THRESHOLD, "RETREAT_OPPORTUNITY_SHAPE", key); gate(event.gatePassed === (event.aggr < event.threshold), "RETREAT_GATE", key); opportunities.set(key, event); continue;
    }
    if (event.type === "retreat_trigger") {
      const key = keyOf(event.round, event.playerId, event.sec); gate(opportunities.has(key) && opportunities.get(key).gatePassed, "RETREAT_TRIGGER_WITHOUT_OPPORTUNITY", key); gate(!triggers.has(key), "DUPLICATE_RETREAT_TRIGGER", key); gate(event.fromX === undefined || Number.isFinite(event.fromX), "RETREAT_TRIGGER_POSITION", key); triggers.set(key, event); continue;
    }
    if (event.type === "retreat_displacement") {
      const key = keyOf(event.round, event.playerId, event.sec), trigger = triggers.get(key); gate(trigger, "DISPLACEMENT_WITHOUT_TRIGGER", key); const expected = Math.hypot(event.toX - event.fromX, event.toY - event.fromY); gate(Math.abs(expected - event.distance) <= 1e-9 && event.distance >= 0 && event.distance <= 3.2 + 1e-9 && event.fromX === trigger.fromX && event.fromY === trigger.fromY, "DISPLACEMENT_SHAPE", key); displacements.set(key, event); continue;
    }
    if (event.type === "retreat_reengage") {
      const ids = parseIds(event.playerIds); gate(ids.length > 0 && event.distance >= 0 && event.distance < 55, "REENGAGE_SHAPE", String(event.round)); for (const id of ids) gate(byId.has(id), "REENGAGE_PLAYER", id); reengages.set(`${event.round}|${event.sec}|${event.playerIds}`, event); continue;
    }
    if (["combat_pair_candidate", "combat_pair_rejected", "combat_pair_admitted"].includes(event.type)) {
      const map = event.type === "combat_pair_candidate" ? candidates : event.type === "combat_pair_rejected" ? rejected : admitted;
      gate(byId.has(event.tPlayerId) && byId.has(event.cPlayerId) && byId.get(event.tPlayerId).side === "t" && byId.get(event.cPlayerId).side === "ct", "PAIR_ATTRIBUTION", pairKey(event)); gate(event.distance >= 0 && event.distance < 55 && event.fireChance >= 0 && event.fireChance <= 1, "PAIR_SHAPE", pairKey(event)); gate(!map.has(pairKey(event)), "DUPLICATE_PAIR", `${event.type} ${pairKey(event)}`); map.set(pairKey(event), event); continue;
    }
    if (event.type === "combat_exchange") {
      gate(admitted.has(pairKey(event)), "EXCHANGE_WITHOUT_ADMISSION", pairKey(event)); gate(!exchanges.has(pairKey(event)), "DUPLICATE_EXCHANGE", pairKey(event)); gate(event.attackerId !== event.defenderId && event.attackerSide !== event.defenderSide, "ATTACKER_DEFENDER_SHAPE", pairKey(event)); gate((event.attackerId === event.tPlayerId && event.defenderId === event.cPlayerId) || (event.attackerId === event.cPlayerId && event.defenderId === event.tPlayerId), "EXCHANGE_PARTICIPANT_DRIFT", pairKey(event)); exchanges.set(pairKey(event), event); continue;
    }
    if (event.type === "round_summary") { gate(!rounds.has(event.round) && sim.roundHist[event.round - 1]?.winner === event.winner && sim.roundHist[event.round - 1]?.how === event.how, "ROUND_SUMMARY", String(event.round)); rounds.set(event.round, event); continue; }
    if (event.type === "round_player_result") { const p = byId.get(event.playerId), key = `${event.round}|${event.playerId}`; gate(p && p.side === event.side && p.role === event.role && !playerResults.has(key) && typeof event.survived === "boolean" && event.attackerKills >= 0 && event.attackerDamageDealt >= 0 && event.defenderDeaths >= 0, "ROUND_PLAYER_RESULT", key); playerResults.set(key, event); }
  }
  for (const key of rejected.keys()) gate(candidates.has(key) && !admitted.has(key), "REJECTED_PARTITION", key);
  for (const key of admitted.keys()) gate(candidates.has(key) && !rejected.has(key), "ADMITTED_PARTITION", key);
  gate(rounds.size === sim.rounds, "ROUND_COUNT", `${rounds.size}/${sim.rounds}`); gate(playerResults.size === sim.rounds * roster.length, "PLAYER_RESULT_COUNT", String(playerResults.size)); gate(candidates.size === rejected.size + admitted.size && exchanges.size === admitted.size, "PAIR_PARTITION", String(seed)); gate(opportunities.size >= triggers.size && triggers.size === displacements.size, "RETREAT_CHAIN", String(seed));
  return { pers, pos, aggr, opportunities, triggers, displacements, reengages, candidates, rejected, admitted, exchanges, rounds, playerResults };
}

function frameSummary(sim, targetId) {
  let movementDistance = 0, engageFrames = 0, previous = null;
  for (const frame of sim.frames) { const p = frame.players.find((item) => item.id === targetId); if (!p || p.dead) { previous = null; continue; } if (p.state === "ENGAGE") engageFrames++; if (previous && previous.rnd === frame.rnd) movementDistance += Math.hypot(p.pos.x - previous.x, p.pos.y - previous.y); previous = { rnd: frame.rnd, x: p.pos.x, y: p.pos.y }; }
  return { movementDistance, engageFrames };
}
function targetSummary(arm, targetId, target, roster) {
  const own = arm.events.filter((event) => event.playerId === targetId); const pers = own.filter((event) => event.type === "persStatCourage"); const pos = own.filter((event) => event.type === "posSkillCourageRead"); const combatReads = own.filter((event) => event.type === "combatSkillCourageRead"); const combat = own.filter((event) => event.type === "combatSkill"); const aggr = own.filter((event) => event.type === "aggrCourage");
  const opportunities = own.filter((event) => event.type === "retreat_opportunity"); const triggers = own.filter((event) => event.type === "retreat_trigger"); const displacements = own.filter((event) => event.type === "retreat_displacement"); const reengages = arm.events.filter((event) => event.type === "retreat_reengage" && parseIds(event.playerIds).includes(targetId));
  const pairCandidates = arm.events.filter((event) => event.type === "combat_pair_candidate" && event.tPlayerId === targetId); const pairAdmitted = arm.events.filter((event) => event.type === "combat_pair_admitted" && event.tPlayerId === targetId); const pairRejected = arm.events.filter((event) => event.type === "combat_pair_rejected" && event.tPlayerId === targetId); const exchanges = arm.events.filter((event) => event.type === "combat_exchange" && (event.tPlayerId === targetId || event.cPlayerId === targetId)); const targetResults = arm.events.filter((event) => event.type === "round_player_result" && event.playerId === targetId); const opponentResults = arm.events.filter((event) => event.type === "round_player_result" && event.side === "ct");
  const targetKpi = { attackerKills: targetResults.reduce((sum, event) => sum + event.attackerKills, 0), attackerDamageDealt: targetResults.reduce((sum, event) => sum + event.attackerDamageDealt, 0), defenderDeaths: targetResults.reduce((sum, event) => sum + event.defenderDeaths, 0), survivedRounds: targetResults.filter((event) => event.survived).length };
  const opponentKpi = { attackerKills: opponentResults.reduce((sum, event) => sum + event.attackerKills, 0), attackerDamageDealt: opponentResults.reduce((sum, event) => sum + event.attackerDamageDealt, 0), defenderDeaths: opponentResults.reduce((sum, event) => sum + event.defenderDeaths, 0) }; const frames = frameSummary(arm.sim, targetId); const aggrValues = aggr.map((event) => event.result);
  return {
    seed: arm.seed, rawCourage: Number(target.stats.cou), effectiveCourage: expectedEffectiveCourage(target), effectiveCourageRead: aggregate(pers.map((event) => event.effectiveCourage)), courageAdjustment: (PERSONALITY_STAT_DELTAS[target.personality]?.cou || 0), courageClampReads: pers.filter((event) => event.clamped).length, persStatCourageCalls: pers.length,
    roleFitMean: pos.length ? mean(pos.map((event) => event.result)) : 0, roleFitCourageWeight: courageWeight(target), rawRoleFitReads: pos.length, combatSkillCourageReads: combatReads.length, combatSkillCalls: combat.length, combatSkillEntryReads: combatReads.filter((event) => event.entry).length, combatSkillMean: combat.length ? mean(combat.map((event) => event.result)) : 0,
    aggrCalls: aggr.length, aggrMean: aggr.length ? mean(aggrValues) : 0, aggrMin: aggrValues.length ? Math.min(...aggrValues) : 0, aggrMax: aggrValues.length ? Math.max(...aggrValues) : 0, thresholdBelowReads: aggrValues.filter((value) => value < COURAGE_THRESHOLD).length,
    opportunities: opportunities.length, gatePasses: opportunities.filter((event) => event.gatePassed).length, retreatTriggers: triggers.length, retreatTriggerRate: opportunities.length ? triggers.length / opportunities.length : 0, displacements: displacements.length, totalDisplacement: displacements.reduce((sum, event) => sum + event.distance, 0), reengages: reengages.length, reengageRate: triggers.length ? reengages.length / triggers.length : 0,
    pairCandidates: pairCandidates.length, pairAdmitted: pairAdmitted.length, pairRejected: pairRejected.length, pairAdmissionRate: pairCandidates.length ? pairAdmitted.length / pairCandidates.length : 0, attackerExchanges: exchanges.filter((event) => event.attackerId === targetId).length, defenderExchanges: exchanges.filter((event) => event.defenderId === targetId).length,
    roundResults: targetResults.length, survivedRounds: targetKpi.survivedRounds, survivalRate: targetResults.length ? targetKpi.survivedRounds / targetResults.length : 0, attackerKills: targetKpi.attackerKills, attackerDamageDealt: targetKpi.attackerDamageDealt, defenderDeaths: targetKpi.defenderDeaths, movementDistanceMean: frames.movementDistance, engageFrames: frames.engageFrames, opponentSpilloverKills: opponentKpi.attackerKills, opponentSpilloverDamage: opponentKpi.attackerDamageDealt, opponentSpilloverDeaths: opponentKpi.defenderDeaths,
    strictSimDigest: arm.strictSimDigest, targetKpiDigest: sha256(json(targetKpi)), structuralDigest: sha256(json(arm.events.filter((event) => ["combat_pair_candidate", "combat_pair_rejected", "combat_pair_admitted", "combat_exchange", "round_summary", "round_player_result"].includes(event.type)))), eventDigest: arm.eventDigest, validation: arm.validation, rosterSize: roster.length,
  };
}
function sum(rows, key) { return rows.reduce((total, row) => total + Number(row[key] || 0), 0); }
function aggregateRows(rows) {
  const sumKeys = ["persStatCourageCalls", "courageClampReads", "rawRoleFitReads", "combatSkillCourageReads", "combatSkillCalls", "combatSkillEntryReads", "aggrCalls", "opportunities", "gatePasses", "retreatTriggers", "displacements", "reengages", "pairCandidates", "pairAdmitted", "pairRejected", "attackerExchanges", "defenderExchanges", "roundResults", "survivedRounds", "attackerKills", "attackerDamageDealt", "defenderDeaths", "engageFrames", "opponentSpilloverKills", "opponentSpilloverDamage", "opponentSpilloverDeaths"];
  const sums = sumKeys.reduce((out, key) => { out[key] = sum(rows, key); return out; }, {}); const means = ["effectiveCourageRead", "roleFitMean", "combatSkillMean", "aggrMean", "aggrMin", "aggrMax", "movementDistanceMean"].reduce((out, key) => { out[key] = rounded(mean(rows.map((row) => typeof row[key] === "object" ? row[key].mean : row[key]))); return out; }, {});
  return { seeds: rows.length, rawCourage: rows[0].rawCourage, effectiveCourage: rows[0].effectiveCourage, courageAdjustment: rows[0].courageAdjustment, roleFitCourageWeight: rows[0].roleFitCourageWeight, ...sums, ...means, retreatTriggerRate: sums.opportunities ? rounded(sums.retreatTriggers / sums.opportunities) : 0, survivalRate: sums.roundResults ? rounded(sums.survivedRounds / sums.roundResults) : 0, pairAdmissionRate: sums.pairCandidates ? rounded(sums.pairAdmitted / sums.pairCandidates) : 0, reengageRate: sums.retreatTriggers ? rounded(sums.reengages / sums.retreatTriggers) : 0, clampRate: sums.persStatCourageCalls ? rounded(sums.courageClampReads / sums.persStatCourageCalls) : 0 };
}
function pathComparison(treatmentRows, baselineRows, key) { return { key, ...changedSeedSummary(treatmentRows.filter((row, index) => row[key] !== baselineRows[index][key]).length, baselineRows.length) }; }
function saturationSummary(rows, baselineRows, levels) { const effectiveLevels = [rows.low[0].effectiveCourage, baselineRows[0].effectiveCourage, rows.high[0].effectiveCourage]; return { levels, effectiveLevels, runtimeClamp: clampSummary(effectiveLevels, 1, 99), lowClampReads: sum(rows.low, "courageClampReads"), baselineClampReads: sum(baselineRows, "courageClampReads"), highClampReads: sum(rows.high, "courageClampReads"), highBaselinePlateauSeeds: rows.high.filter((row, index) => row.effectiveCourage === baselineRows[index].effectiveCourage).length, totalSeeds: rows.high.length }; }
function thresholdSummary(rows, baselineRows) {
  const means = [rows.low[0].aggrMean, baselineRows[0].aggrMean, rows.high[0].aggrMean]; const crossingSeeds = rows.low.filter((row, index) => Math.min(row.aggrMean, baselineRows[index].aggrMean, rows.high[index].aggrMean) < COURAGE_THRESHOLD && Math.max(row.aggrMean, baselineRows[index].aggrMean, rows.high[index].aggrMean) >= COURAGE_THRESHOLD).length;
  return { threshold: COURAGE_THRESHOLD, means: means.map(rounded), crossing: thresholdCrossing(means, COURAGE_THRESHOLD, "up"), crossingSeeds, low: aggregate(rows.low.map((row) => row.aggrMean)), baseline: aggregate(baselineRows.map((row) => row.aggrMean)), high: aggregate(rows.high.map((row) => row.aggrMean)) };
}

function runArm(api, { mapKey, tTactic, ctTactic, roster, seed }) {
  const before = inputDigest(mapKey, tTactic, ctTactic, roster); globalThis.__CS_R23_AUDIT__ = null; const off = api.simulateFps(mapKey, tTactic, ctTactic, seed, roster); const collector1 = createCollector(); globalThis.__CS_R23_AUDIT__ = collector1; const on1 = api.simulateFps(mapKey, tTactic, ctTactic, seed, roster, collector1); const collector2 = createCollector(); globalThis.__CS_R23_AUDIT__ = collector2; const on2 = api.simulateFps(mapKey, tTactic, ctTactic, seed, roster, collector2); globalThis.__CS_R23_AUDIT__ = null;
  const offJson = JSON.stringify(off), on1Json = JSON.stringify(on1), on2Json = JSON.stringify(on2); gate(offJson === on1Json && on1Json === on2Json, "INSTRUMENTATION_CHANGED_SIM", `seed=${seed}`); const eventJson1 = json(collector1.events), eventJson2 = json(collector2.events); gate(eventJson1 === eventJson2, "AUDIT_NON_DETERMINISTIC", `seed=${seed}`); gate(before === inputDigest(mapKey, tTactic, ctTactic, roster), "SIM_MUTATED_INPUT", `seed=${seed}`); const validation = validateEvents(collector1.events, on1, roster, seed); return { seed, sim: on1, events: collector1.events, strictSimDigest: sha256(offJson), eventDigest: sha256(eventJson1), validation };
}

async function main() {
  const liveSource = readFileSync(FPS_FILE, "utf8"), liveSourceSha256 = sha256(liveSource); gate(liveSourceSha256 === CS_R33_RESILIENCE_SOURCE_SHA256, "LIVE_SOURCE_SHA256", liveSourceSha256); const source = csR25R24Source(liveSource), sourceSha256 = sha256(source); gate(sourceSha256 === SOURCE_SHA256, "SOURCE_SHA256", sourceSha256); gate(randTokens(source).length === EXPECTED_RAND_CALLS, "RAND_CALL_COUNT", String(randTokens(source).length)); gate(FIXED_SEEDS.length === 16, "SEED_COUNT");
  gate(!((8) > 16 / 2) && (9) > 16 / 2, "STRICT_MAJORITY_GATE"); gate(source.includes('const role=posSkill(p,rawReflex);'), "RAW_ROLE_FIT_SOURCE_GATE"); gate(source.includes('S("cou")*0.06'), "EFFECTIVE_COURAGE_COMBAT_SOURCE_GATE"); gate(source.includes('persStat(p,"cou")*0.5'), "EFFECTIVE_COURAGE_AGGR_SOURCE_GATE"); gate(source.includes("aggr(p)<0.82") && source.includes("dx/L*3.2"), "COURAGE_RETREAT_THRESHOLD_SOURCE_GATE"); gate(source.includes("fireChance*=(0.55+0.5*Math.max(aggr(tp),aggr(cp)))"), "COURAGE_PAIR_SOURCE_GATE");
  console.log("schema: " + EVENT_SCHEMA); console.log("seed generation version: " + SEED_GENERATION_VERSION); console.log("seedSetSha256: " + SEED_SET_SHA256); console.log("engineSourceSha256: " + sourceSha256); console.log("rand() call sites: " + randTokens(source).length); console.log("read-chain source: raw stats.cou -> entry posSkill role-fit; persStat(cou) -> entry combatSkill and aggr; aggr -> pair fireChance / retreat threshold");
  const api = await loadApi(source); gate(typeof api?.simulateFps === "function", "TEST_SIMULATOR_EXPORT_MISSING"); gate(Array.isArray(api?.ROSTER), "TEST_ROSTER_EXPORT_MISSING"); gate(api?.TACTICS_DB && typeof api.TACTICS_DB === "object", "TEST_TACTICS_EXPORT_MISSING"); const map = api.TACTICS_DB[MAP_KEY]; const tTactic = freeze(clone(map?.t?.find((item) => item.id === T_TACTIC_ID))); const ctTactic = freeze(clone(map?.ct?.find((item) => item.id === CT_TACTIC_ID))); const baselineRoster = freeze(clone(api.ROSTER)); gate(tTactic?.id === T_TACTIC_ID && ctTactic?.id === CT_TACTIC_ID, "TACTIC_MISSING"); gate(baselineRoster.length === 10, "ROSTER_SIZE", String(baselineRoster.length)); const targets = baselineRoster.filter((player) => player.side === "t"); gate(targets.length === 5 && targets.every((player) => TARGET_ROLES.includes(player.role)), "TARGET_ROLES");
  const inputBefore = inputDigest(MAP_KEY, tTactic, ctTactic, baselineRoster); const baselineArms = FIXED_SEEDS.map((seed) => runArm(api, { mapKey: MAP_KEY, tTactic, ctTactic, roster: baselineRoster, seed })); const cases = [];
  for (const target of targets) {
    const baselineRows = baselineArms.map((arm) => targetSummary(arm, target.id, target, baselineRoster)); const rows = { baseline: baselineRows, low: [], high: [] }; const levels = { baseline: target.stats.cou };
    for (const level of ["low", "high"]) { const treatment = treatmentRoster(baselineRoster, target.id, level); levels[level] = treatment.value; rows[level] = FIXED_SEEDS.map((seed) => targetSummary(runArm(api, { mapKey: MAP_KEY, tTactic, ctTactic, roster: treatment.roster, seed }), target.id, treatment.roster.find((player) => player.id === target.id), treatment.roster)); }
    const low = aggregateRows(rows.low), baseline = aggregateRows(rows.baseline), high = aggregateRows(rows.high); const directKeys = { effectiveCourage: "higher", aggrMean: "higher" }; const direct = Object.fromEntries(Object.entries(directKeys).map(([key, direction]) => [key, { aggregate: { low: low[key], baseline: baseline[key], high: high[key] }, seed: monotonicity(rows.low.map((row) => row[key]), baselineRows.map((row) => row[key]), rows.high.map((row) => row[key]), direction === "higher" ? "higher" : "lower") }]));
    // role-fit 沒有 raw cou consumer 的 role 不是失敗，而是「不適用」。
    direct.roleFitMean = { applicable: courageWeight(target) > 0, aggregate: { low: low.roleFitMean, baseline: baseline.roleFitMean, high: high.roleFitMean }, seed: courageWeight(target) > 0 ? monotonicity(rows.low.map((row) => row.roleFitMean), baselineRows.map((row) => row.roleFitMean), rows.high.map((row) => row.roleFitMean)) : null };
    direct.combatSkillMean = { applicable: target.role === "entry", directReadCalls: { low: low.combatSkillEntryReads, baseline: baseline.combatSkillEntryReads, high: high.combatSkillEntryReads }, aggregate: { low: low.combatSkillMean, baseline: baseline.combatSkillMean, high: high.combatSkillMean }, seed: target.role === "entry" ? monotonicity(rows.low.map((row) => row.combatSkillMean), baselineRows.map((row) => row.combatSkillMean), rows.high.map((row) => row.combatSkillMean)) : null };
    const metrics = { aggrMean: "higher", pairAdmissionRate: "higher", retreatTriggerRate: "lower", attackerExchanges: "higher", attackerKills: "higher", attackerDamageDealt: "higher", survivalRate: "higher" }; const monotonic = Object.fromEntries(Object.entries(metrics).map(([key, direction]) => [key, monotonicity(rows.low.map((row) => row[key]), baselineRows.map((row) => row[key]), rows.high.map((row) => row[key]), direction)]));
    const pairedEffects = Object.fromEntries(Object.keys(metrics).map((key) => [key, { lowBaseline: pairedEffect(rows.low.map((row) => row[key]), baselineRows.map((row) => row[key])), highBaseline: pairedEffect(rows.high.map((row) => row[key]), baselineRows.map((row) => row[key])), lowHigh: pairedEffect(rows.low.map((row) => row[key]), rows.high.map((row) => row[key])) }]));
    const path = { strictSimulation: { lowVsBaseline: pathComparison(rows.low, baselineRows, "strictSimDigest"), highVsBaseline: pathComparison(rows.high, baselineRows, "strictSimDigest") }, targetOnlyKpi: { lowVsBaseline: pathComparison(rows.low, baselineRows, "targetKpiDigest"), highVsBaseline: pathComparison(rows.high, baselineRows, "targetKpiDigest") }, structural: { lowVsBaseline: pathComparison(rows.low, baselineRows, "structuralDigest"), highVsBaseline: pathComparison(rows.high, baselineRows, "structuralDigest") } };
    const threshold = thresholdSummary(rows, baselineRows); const directReady = direct.effectiveCourage.seed.strictMajority && direct.aggrMean.seed.strictMajority; const thresholdDominated = threshold.crossingSeeds > 0 || (low.opportunities === 0 && high.opportunities === 0); const pathAmplified = path.targetOnlyKpi.lowVsBaseline.changedSeeds > 0 || path.targetOnlyKpi.highVsBaseline.changedSeeds > 0; const readiness = classifyCausalReadiness({ directMonotonic: directReady, directGateEstablished: true, localOpportunity: (low.pairCandidates + high.pairCandidates) > 0 ? "sufficient" : "insufficient", immediateConversion: "monotonic", thresholdDominated, downstreamPathAmplified: pathAmplified, semanticAmbiguity: false, formulaNonMonotonic: false });
    const result = { targetId: target.id, role: target.role, personality: target.personality, levels, expectedEffectiveLevels: { low: expectedEffectiveCourage({ ...target, stats: { ...target.stats, cou: levels.low } }), baseline: expectedEffectiveCourage(target), high: expectedEffectiveCourage({ ...target, stats: { ...target.stats, cou: levels.high } }) }, baseline, low, high, direct, monotonic, pairedEffects, saturation: saturationSummary(rows, baselineRows, levels), threshold, path, readiness, targetOnlyAttribution: { attackerSide: { kills: { low: low.attackerKills, baseline: baseline.attackerKills, high: high.attackerKills }, damage: { low: low.attackerDamageDealt, baseline: baseline.attackerDamageDealt, high: high.attackerDamageDealt } }, defenderSide: { deaths: { low: low.defenderDeaths, baseline: baseline.defenderDeaths, high: high.defenderDeaths }, survival: { low: low.survivalRate, baseline: baseline.survivalRate, high: high.survivalRate } }, opponentSpillover: { kills: { low: low.opponentSpilloverKills, baseline: baseline.opponentSpilloverKills, high: high.opponentSpilloverKills }, damage: { low: low.opponentSpilloverDamage, baseline: baseline.opponentSpilloverDamage, high: high.opponentSpilloverDamage } } } };
    cases.push(result); const compact = (row) => ({ effectiveCourage: row.effectiveCourage, roleFitMean: row.roleFitMean, combatSkillMean: row.combatSkillMean, aggrMean: row.aggrMean, opportunities: row.opportunities, retreatTriggers: row.retreatTriggers, displacements: row.displacements, reengages: row.reengages, pairCandidates: row.pairCandidates, pairAdmitted: row.pairAdmitted, pairAdmissionRate: row.pairAdmissionRate, attackerExchanges: row.attackerExchanges, attackerKills: row.attackerKills, attackerDamageDealt: row.attackerDamageDealt, defenderDeaths: row.defenderDeaths, survivalRate: row.survivalRate });
    console.log("role courage evidence: " + JSON.stringify({ role: result.role, targetId: result.targetId, personality: result.personality, levels: result.levels, expectedEffectiveLevels: result.expectedEffectiveLevels, measurements: { low: compact(result.low), baseline: compact(result.baseline), high: compact(result.high) }, direct: Object.fromEntries(Object.entries(result.direct).map(([key, value]) => [key, value.seed ? { passingSeeds: value.seed.passingSeeds, totalSeeds: value.seed.totalSeeds, strictMajority: value.seed.strictMajority, applicable: value.applicable !== false } : value])), monotonic: Object.fromEntries(Object.entries(result.monotonic).map(([key, value]) => [key, { passingSeeds: value.passingSeeds, totalSeeds: value.totalSeeds, strictMajority: value.strictMajority }])), pairedEffects: { attackerDamageDealt: result.pairedEffects.attackerDamageDealt, pairAdmissionRate: result.pairedEffects.pairAdmissionRate }, threshold: result.threshold, saturation: result.saturation, targetOnlyAttribution: result.targetOnlyAttribution, path: result.path, readiness: result.readiness }));
  }
  const controlRows = baselineArms.map((arm) => { const event = arm.events.find((item) => item.type === "persStatCourage" && item.playerId === "ct3"); return { rawCourage: event?.rawCourage ?? null, effectiveCourage: event?.effectiveCourage ?? null }; }); gate(controlRows.every((row) => row.rawCourage === 82 && row.effectiveCourage === 78), "CONTROL_COURAGE_SEMANTIC_DRIFT", JSON.stringify(controlRows));
  const control = { playerId: "ct3", role: "rifler", personality: "steady", rawCourage: controlRows[0].rawCourage, effectiveCourage: controlRows[0].effectiveCourage, rawRoleFitWeight: 0, effectiveAggressionConsumer: true };
  const suite = { schema: SUITE_SCHEMA, framework: "R22-local-causal-v1", sourceSha256, seedGenerationVersion: SEED_GENERATION_VERSION, seedSetSha256: SEED_SET_SHA256, scenario: { mapKey: MAP_KEY, tTacticId: T_TACTIC_ID, ctTacticId: CT_TACTIC_ID }, band: BAND, targetRoles: TARGET_ROLES, levels: CALIBRATION_LEVELS, attribution: "target player attackerKills/attackerDamageDealt are attacker-side only; defenderDeaths/survival are defender-side; CT totals are spillover", semanticBoundary: "raw stats.cou is raw role-fit input; persStat(cou) is personality-adjusted live contribution; no courage-specific state adjustment exists", productionChanged: false, rngChanged: false, scenarioChanged: false, control, cases };
  const suiteDigest = sha256(json(suite)); gate(inputBefore === inputDigest(MAP_KEY, tTactic, ctTactic, baselineRoster), "INPUT_MUTATED"); gate(EXPECTED_SUITE_DIGEST !== "__CAPTURE_MANUALLY__", "SUITE_NOT_LOCKED", `candidate=${suiteDigest}`); gate(suiteDigest === EXPECTED_SUITE_DIGEST, "COURAGE_MEASUREMENT_REGRESSION", `expected=${EXPECTED_SUITE_DIGEST}\nactual=${suiteDigest}`);
  console.log("simulations: " + (FIXED_SEEDS.length * (1 + targets.length * 2) * 3)); console.log("suiteDigest: " + suiteDigest); console.log("control semantic probe: " + JSON.stringify(control)); console.log("production source modified: no (memory transform only)"); console.log("claim boundary: Courage measurement / read-chain evidence only; no balance calibration claim"); console.log("CS Courage Measurement / Calibration Readiness R23: PASS");
}

main().catch((error) => { console.error("CS Courage Measurement / Calibration Readiness R23: FAIL " + (error?.stack || error)); process.exitCode = 1; });
