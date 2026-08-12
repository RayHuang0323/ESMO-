#!/usr/bin/env node
// R24：CS Accuracy Measurement / Calibration Readiness。
// 只在 Vite memory transform 中增加觀測點；production source、RNG 與 scenario 不變。

import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { CS_R27_DECISION_SOURCE_SHA256, csR25R24Source } from "./cs_r15_legacy_source.mjs";
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
const EVENT_SCHEMA = "CsAccuracyMeasurementEvent.v1";
const SUITE_SCHEMA = "CsAccuracyMeasurementSuite.v1";
const EXPECTED_SUITE_DIGEST = "3c6d1625a06684b91b3b99424cdfb4c79c963f17da82411b825264d0f77eaf05";
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
// t2 raw accuracy=88；使用 ±10 避免 raw high=100，把 treatment 上限與 runtime clamp 分開。
const BAND = 10;
const TARGET_ROLES = Object.freeze(["entry", "rifler", "awp", "lurker", "igl"]);
const AGGR_THRESHOLD = 0.82;
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
  genius: {},
  grinder: { acc: 6 },
  shotcaller: { acc: -4, apm: -4 },
  lonewolf: { apm: 6 },
  steady: { pos: 6 },
  creative: {},
});
const GUN_HS = Object.freeze({
  ak: 0.45, m4: 0.4, m4a4: 0.4, galil: 0.38, famas: 0.36, aug: 0.42, sg: 0.44,
  awp: 0.3, scout: 0.35, mp9: 0.3, mac10: 0.28, ump: 0.32, p90: 0.26,
  deagle: 0.5, glock: 0.3, usp: 0.35, p250: 0.4, tec9: 0.38,
});

const SIGNATURE_MARKER = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster){";
const SIGNATURE_REPLACEMENT = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster,__measure=null){";
const ROUND_STATE_MARKER = "    let contactCalled=false,defuseCalled=false,defuseProg=0;";
const ROUND_STATE_REPLACEMENT = [
  ROUND_STATE_MARKER,
  "    let __r24ActivePairKey=null;",
].join("\n");
const PERS_MARKER = "function persStat(p,key){let v=(p.stats&&p.stats[key])||50;const pr=p.personality&&PERSONALITY[p.personality];if(pr){if(pr.boost.includes(key))v+=PERS_BOOST;if(pr.nerf.includes(key))v-=PERS_NERF;}return clamp(v,1,99);}";
const PERS_REPLACEMENT = 'function persStat(p,key){let v=(p.stats&&p.stats[key])||50;const pr=p.personality&&PERSONALITY[p.personality];if(pr){if(pr.boost.includes(key))v+=PERS_BOOST;if(pr.nerf.includes(key))v-=PERS_NERF;}const adjusted=v,effective=clamp(adjusted,1,99);if(key==="acc")globalThis.__CS_R24_AUDIT__?.record("persStatAccuracy",{playerId:p.id,role:p.role,personality:p.personality,rawAccuracy:Number(p.stats?.acc??50),adjustedAccuracy:adjusted,effectiveAccuracy:effective,clamped:effective!==adjusted,adjustmentSource:"personality-only"});return effective;}';
const POS_MARKER = "function posSkill(p,rawReflex=Number((p.stats||{}).rxn??50)){const prof=POS_PROFILE[p.role]||POS_PROFILE.rifler;const s=p.stats||{};let t=0;prof.forEach((k,i)=>t+=(k===\"rxn\"?rawReflex:(s[k]||50))*(5-i));return t/15;}";
const POS_REPLACEMENT = 'function posSkill(p,rawReflex=Number((p.stats||{}).rxn??50)){const prof=POS_PROFILE[p.role]||POS_PROFILE.rifler;const s=p.stats||{};let t=0;prof.forEach((k,i)=>t+=(k==="rxn"?rawReflex:(s[k]||50))*(5-i));const result=t/15,rawAccuracy=Number(s.acc??50),accIndex=prof.indexOf("acc"),accWeight=accIndex<0?0:5-accIndex;globalThis.__CS_R24_AUDIT__?.record("posSkillAccuracyRead",{playerId:p.id,role:p.role,profile:prof.join(","),rawAccuracy,accuracyWeight:accWeight,result});return result;}';
const S_MARKER = "const S=k=>k===\"rxn\"?effectiveReflex:persStat(p,k);";
const S_REPLACEMENT = 'let __r24EffectiveAccuracy=null,__r24AccuracyReads=0;const S=k=>{const value=k==="rxn"?effectiveReflex:persStat(p,k);if(k==="acc"){__r24EffectiveAccuracy=value;__r24AccuracyReads++;globalThis.__CS_R24_AUDIT__?.record("combatSkillAccuracyRead",{playerId:p.id,role:p.role,personality:p.personality,rawAccuracy:Number(p.stats?.acc??50),effectiveAccuracy:value,entry:Boolean(opts?.entry),holding:Boolean(opts?.holding)});}return value;};';
const COMBAT_RETURN_MARKER = "return v*formMul(p);";
const COMBAT_RETURN_REPLACEMENT = 'const __r24Form=formMul(p),__r24Result=v*__r24Form;globalThis.__CS_R24_AUDIT__?.record("combatSkill",{playerId:p.id,role:p.role,personality:p.personality,rawAccuracy:Number(s.acc??50),effectiveAccuracy:__r24EffectiveAccuracy,accuracyReads:__r24AccuracyReads,roleFit:role,baseBeforeForm:v,formMul:__r24Form,result:__r24Result,holding:Boolean(opts?.holding),entry:Boolean(opts?.entry),lurk:Boolean(opts?.lurk),lowHP:Boolean(opts?.lowHP)});return __r24Result;';
const AGGR_MARKER = "function aggr(p){const s=p.stats;if(!s)return 0.6;const base=(persStat(p,\"cou\")*0.5+persStat(p,\"str\")*0.22+persStat(p,\"apm\")*0.16+persStat(p,\"pos\")*0.12)/100;const pr=p.personality&&PERSONALITY[p.personality];return clamp(base+(ROLE_AGGR[p.role]||0)+(pr?pr.aggro:0),0.2,1.15);";
const AGGR_REPLACEMENT = 'function aggr(p){const s=p.stats;if(!s)return 0.6;const __r24Cou=persStat(p,"cou"),__r24Str=persStat(p,"str"),__r24Apm=persStat(p,"apm"),__r24Pos=persStat(p,"pos");const base=(__r24Cou*0.5+__r24Str*0.22+__r24Apm*0.16+__r24Pos*0.12)/100;const pr=p.personality&&PERSONALITY[p.personality];const roleAggro=ROLE_AGGR[p.role]||0,personalityAggro=pr?pr.aggro:0,result=clamp(base+roleAggro+personalityAggro,0.2,1.15);globalThis.__CS_R24_AUDIT__?.record("aggrAccuracy",{playerId:p.id,role:p.role,personality:p.personality,rawAccuracy:Number(p.stats?.acc??50),cou:__r24Cou,str:__r24Str,apm:__r24Apm,pos:__r24Pos,roleAggro,personalityAggro,result});return result;';
const MATES_MARKER = '         const mates=(p.side==="t"?aliveT:aliveCT).length;';
const MATES_REPLACEMENT = [
  MATES_MARKER,
  '         const __r24RetreatMeasure=__measure&&near&&!buyP&&dist(near.pos,p.pos)<32&&p.hp<48&&mates>1?{distance:dist(near.pos,p.pos),aggr:aggr(p)}:null;',
  '         if(__r24RetreatMeasure)__measure.record("retreat_opportunity",{round:rnd+1,sec,playerId:p.id,side:p.side,role:p.role,hp:p.hp,mates,enemyId:near.id,distance:__r24RetreatMeasure.distance,aggr:__r24RetreatMeasure.aggr,threshold:0.82,gatePassed:__r24RetreatMeasure.aggr<0.82});',
].join("\n");
const TRIGGER_MARKER = "         if(near&&!buyP&&dist(near.pos,p.pos)<32&&p.hp<48&&aggr(p)<0.82&&mates>1){";
const TRIGGER_REPLACEMENT = [
  TRIGGER_MARKER,
  '           __measure?.record("retreat_trigger",{round:rnd+1,sec,playerId:p.id,side:p.side,role:p.role,hp:p.hp,mates,enemyId:near.id,distance:__r24RetreatMeasure.distance,aggr:__r24RetreatMeasure.aggr,threshold:0.82});',
].join("\n");
const FIRE_MARKER = "          if(rand()>=fireChance)continue;";
const FIRE_REPLACEMENT = [
  '          const __r24PairKey=String(rnd+1)+":"+String(sec)+":"+tp.id+":"+cp.id;',
  '          __measure?.record("combat_pair_candidate",{round:rnd+1,sec,pairKey:__r24PairKey,tPlayerId:tp.id,cPlayerId:cp.id,distance:d,fireChance});',
  '          if(rand()>=fireChance){__measure?.record("combat_pair_rejected",{round:rnd+1,sec,pairKey:__r24PairKey,tPlayerId:tp.id,cPlayerId:cp.id,distance:d,fireChance});continue;}',
  '          __measure?.record("combat_pair_admitted",{round:rnd+1,sec,pairKey:__r24PairKey,tPlayerId:tp.id,cPlayerId:cp.id,distance:d,fireChance});',
].join("\n");
const EXCHANGE_MARKER = "          const tw=rand()<Pt;const at=tw?tp:cp,df=tw?cp:tp;";
const EXCHANGE_REPLACEMENT = [
  EXCHANGE_MARKER,
  "          __r24ActivePairKey=__r24PairKey;",
  '          __measure?.record("combat_exchange",{round:rnd+1,sec,pairKey:__r24PairKey,tPlayerId:tp.id,cPlayerId:cp.id,distance:d,pt:Pt,attackerId:at.id,attackerSide:at.side,defenderId:df.id,defenderSide:df.side});',
].join("\n");
const HEADSHOT_MARKER = "          const g=GUNS[at.gun];const isHS=rand()<g.hs*(0.72+0.55*((at.stats?.acc||80)/100));let dmg=(g.dmg+Math.floor(rand()*40))*(isHS?2:1);";
const HEADSHOT_REPLACEMENT = '          const g=GUNS[at.gun];const __r24HeadshotChance=g.hs*(0.72+0.55*((at.stats?.acc||80)/100));const __r24HeadshotRoll=rand();const isHS=__r24HeadshotRoll<__r24HeadshotChance;__measure?.record("headshot_roll",{round:rnd+1,sec,pairKey:__r24PairKey,attackerId:at.id,attackerSide:at.side,defenderId:df.id,defenderSide:df.side,weapon:at.gun,rawAccuracy:Number(at.stats?.acc??80),headshotChance:__r24HeadshotChance,headshotRoll:__r24HeadshotRoll,isHS});let dmg=(g.dmg+Math.floor(rand()*40))*(isHS?2:1);';
const FIRE_DAMAGE_MARKER = "          const {killed}=applyDamage(at,df,dmg);";
const FIRE_DAMAGE_REPLACEMENT = "          __r24ActivePairKey=__r24PairKey;const {killed}=applyDamage(at,df,dmg);__r24ActivePairKey=null;";
const DAMAGE_MARKER = "        const hpBefore=df.hp,effectiveDamage=Math.min(damage,hpBefore);";
const DAMAGE_REPLACEMENT = '        const hpBefore=df.hp,effectiveDamage=Math.min(damage,hpBefore),killed=damage>=hpBefore;__measure?.record("damage_applied",{round:rnd+1,sec,source,sourceId,attackerId:at.id,attackerSide:at.side,defenderId:df.id,defenderSide:df.side,pairKey:__r24ActivePairKey,hpBefore,rawDamage:damage,effectiveDamage,overkill:Math.max(0,damage-hpBefore),killed});';
const ROUND_RESULT_MARKER = "      const wn=roundEnd.winner;";
const ROUND_RESULT_REPLACEMENT = [
  ROUND_RESULT_MARKER,
  '      __measure?.record("round_summary",{round:rnd+1,winner:wn,how:roundEnd.how});',
  '      ps.forEach(__p=>__measure?.record("round_player_result",{round:rnd+1,playerId:__p.id,side:__p.side,role:__p.role,survived:Boolean(!__p.dead),won:wn===__p.side,attackerKills:roundKills[__p.id]||0,attackerDamageDealt:Math.round(roundDmg[__p.id]||0),defenderDeaths:roundDeaths[__p.id]||0,attackerHeadshots:__p.hsCount||0}));',
].join("\n");
const RETURN_MARKER = "return { EsportsFPS3D, buildMatchResult };";
const RETURN_REPLACEMENT = "return { EsportsFPS3D, buildMatchResult, simulateFps, ROSTER, TACTICS_DB };";
const EXPORT_MARKER = "export { EsportsFPS3D, buildMatchResult };";
const EXPORT_REPLACEMENT = [
  "const __CS_ACCURACY_R24_TEST_API__ = Object.freeze({",
  "  simulateFps: __FPS3D_MODULE.simulateFps,",
  "  ROSTER: __FPS3D_MODULE.ROSTER,",
  "  TACTICS_DB: __FPS3D_MODULE.TACTICS_DB,",
  "});",
  "export { EsportsFPS3D, buildMatchResult, __CS_ACCURACY_R24_TEST_API__ };",
].join("\n");
const TRANSFORMS = Object.freeze([
  ["simulate signature", SIGNATURE_MARKER, SIGNATURE_REPLACEMENT],
  ["round state", ROUND_STATE_MARKER, ROUND_STATE_REPLACEMENT],
  ["persStat accuracy", PERS_MARKER, PERS_REPLACEMENT],
  ["posSkill accuracy", POS_MARKER, POS_REPLACEMENT],
  ["combatSkill accuracy read", S_MARKER, S_REPLACEMENT],
  ["combatSkill return", COMBAT_RETURN_MARKER, COMBAT_RETURN_REPLACEMENT],
  ["aggr accuracy probe", AGGR_MARKER, AGGR_REPLACEMENT],
  ["retreat opportunity", MATES_MARKER, MATES_REPLACEMENT],
  ["retreat trigger", TRIGGER_MARKER, TRIGGER_REPLACEMENT],
  ["pair admission", FIRE_MARKER, FIRE_REPLACEMENT],
  ["attacker defender", EXCHANGE_MARKER, EXCHANGE_REPLACEMENT],
  ["headshot roll", HEADSHOT_MARKER, HEADSHOT_REPLACEMENT],
  ["firearm damage", FIRE_DAMAGE_MARKER, FIRE_DAMAGE_REPLACEMENT],
  ["damage accounting", DAMAGE_MARKER, DAMAGE_REPLACEMENT],
  ["round result", ROUND_RESULT_MARKER, ROUND_RESULT_REPLACEMENT],
  ["module return", RETURN_MARKER, RETURN_REPLACEMENT],
  ["module export", EXPORT_MARKER, EXPORT_REPLACEMENT],
]);

function gate(ok, code, detail = "") {
  if (!ok) throw new Error("[" + code + "]" + (detail ? "\n" + detail : ""));
}
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
  if (typeof value === "number") {
    gate(Number.isFinite(value), "NON_FINITE_NUMBER");
    return Object.is(value, -0) ? 0 : value;
  }
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
function expectedEffectiveAccuracy(player) {
  const raw = Number(player.stats?.acc ?? 50);
  return Math.max(1, Math.min(99, raw + (PERSONALITY_STAT_DELTAS[player.personality]?.acc || 0)));
}
function expectedEffectiveStat(player, key) {
  const raw = Number(player.stats?.[key] ?? 50);
  return Math.max(1, Math.min(99, raw + (PERSONALITY_STAT_DELTAS[player.personality]?.[key] || 0)));
}
function expectedPosSkill(player) {
  const profile = POS_PROFILE[player.role] || POS_PROFILE.rifler;
  const stats = player.stats || {};
  const rawReflex = Number(stats.rxn ?? 50);
  let total = 0;
  profile.forEach((key, index) => {
    total += (key === "rxn" ? rawReflex : Number(stats[key] || 50)) * (5 - index);
  });
  return total / 15;
}
function accuracyWeight(player) {
  const profile = POS_PROFILE[player.role] || POS_PROFILE.rifler;
  const index = profile.indexOf("acc");
  return index < 0 ? 0 : 5 - index;
}
function expectedAggr(player) {
  const base = (
    expectedEffectiveStat(player, "cou") * 0.5
    + expectedEffectiveStat(player, "str") * 0.22
    + expectedEffectiveStat(player, "apm") * 0.16
    + expectedEffectiveStat(player, "pos") * 0.12
  ) / 100;
  return Math.max(0.2, Math.min(1.15, base + (ROLE_AGGR[player.role] || 0) + (PERSONALITY_AGGRO[player.personality] || 0)));
}
function expectedHeadshotChance(weapon, rawAccuracy) {
  const base = rawAccuracy || 80;
  return GUN_HS[weapon] * (0.72 + 0.55 * (base / 100));
}
function keyOf(round, playerId, sec) { return String(round) + "|" + playerId + "|" + String(sec); }
function parseIds(value) { return value ? value.split("|").filter(Boolean) : []; }
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
  const tempRoot = mkdtempSync(join(tmpdir(), "esmo-cs-accuracy-r24-"));
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
        name: "cs-accuracy-r24-memory-hooks",
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
    const module = await vite.ssrLoadModule(FPS_MODULE_ID + "?r24=" + Date.now());
    gate(transformSeen === 1 && restored && rngSame, "TRANSFORM_LOAD_GATE", json({ transformSeen, restored, rngSame }));
    return module.__CS_ACCURACY_R24_TEST_API__;
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
  const values = { low: base.stats.acc - BAND, baseline: base.stats.acc, high: base.stats.acc + BAND };
  gate(values.low >= 1 && values.high <= 99, "ACCURACY_BAND_CLAMPED", targetId + " " + json(values));
  target.stats.acc = values[level];
  gate(next.length === baselineRoster.length, "ROSTER_SIZE_MUTATED", targetId);
  for (const candidate of next) {
    const original = baselineRoster.find((player) => player.id === candidate.id);
    gate(original, "TREATMENT_PLAYER_DRIFT", candidate.id);
    if (candidate.id === targetId) {
      const originalComparable = { ...original, stats: { ...original.stats } };
      const candidateComparable = { ...candidate, stats: { ...candidate.stats } };
      delete originalComparable.stats.acc;
      delete candidateComparable.stats.acc;
      gate(json(candidateComparable) === json(originalComparable), "TREATMENT_NON_ACCURACY_MUTATION", targetId);
    } else {
      gate(json(candidate) === json(original), "TREATMENT_OTHER_PLAYER_MUTATION", candidate.id);
    }
  }
  gate(target.fps === base.fps && target.moba === base.moba, "HUD_MUTATED", targetId);
  return { roster: freeze(next), value: values[level], values };
}

function validateEvents(events, sim, roster, seed) {
  gate(events.length > 0, "NO_ACCURACY_EVENTS", "seed=" + seed);
  const allowed = new Set([
    "persStatAccuracy", "posSkillAccuracyRead", "combatSkillAccuracyRead", "combatSkill", "aggrAccuracy",
    "retreat_opportunity", "retreat_trigger",
    "combat_pair_candidate", "combat_pair_rejected", "combat_pair_admitted", "combat_exchange",
    "headshot_roll", "damage_applied", "round_summary", "round_player_result",
  ]);
  for (const event of events) gate(event.schema === EVENT_SCHEMA && allowed.has(event.type), "EVENT_SCHEMA", event.type);
  const byId = new Map(roster.map((player) => [player.id, player]));
  const opportunities = new Map();
  const triggers = new Map();
  const candidates = new Map();
  const rejected = new Map();
  const admitted = new Map();
  const exchanges = new Map();
  const headshots = [];
  const damages = [];
  const rounds = new Map();
  const playerResults = new Map();
  for (const event of events) {
    if (["persStatAccuracy", "posSkillAccuracyRead", "combatSkillAccuracyRead", "combatSkill", "aggrAccuracy"].includes(event.type)) {
      gate(byId.has(event.playerId), "READ_PLAYER_MISSING", event.playerId);
    }
    if (event.type === "persStatAccuracy") {
      const player = byId.get(event.playerId);
      const raw = Number(player.stats?.acc ?? 50);
      const adjusted = raw + (PERSONALITY_STAT_DELTAS[player.personality]?.acc || 0);
      gate(event.rawAccuracy === raw && event.adjustedAccuracy === adjusted, "RAW_ACCURACY_ATTRIBUTION", event.playerId);
      gate(event.effectiveAccuracy === expectedEffectiveAccuracy(player), "EFFECTIVE_ACCURACY_ATTRIBUTION", event.playerId);
      gate(event.clamped === (event.effectiveAccuracy !== event.adjustedAccuracy), "ACCURACY_CLAMP_FLAG", event.playerId);
      gate(event.adjustmentSource === "personality-only", "ACCURACY_ADJUSTMENT_SOURCE", event.playerId);
      continue;
    }
    if (event.type === "posSkillAccuracyRead") {
      const player = byId.get(event.playerId);
      const profile = POS_PROFILE[player.role] || POS_PROFILE.rifler;
      gate(event.profile === profile.join(","), "POS_ACCURACY_PROFILE", event.playerId);
      gate(event.rawAccuracy === Number(player.stats?.acc ?? 50), "POS_RAW_ACCURACY", event.playerId);
      gate(event.accuracyWeight === accuracyWeight(player), "POS_ACCURACY_WEIGHT", event.playerId);
      gate(Math.abs(event.result - expectedPosSkill(player)) <= 1e-9, "POS_ACCURACY_RESULT", event.playerId);
      continue;
    }
    if (event.type === "combatSkillAccuracyRead") {
      const player = byId.get(event.playerId);
      gate(event.rawAccuracy === Number(player.stats?.acc ?? 50), "COMBAT_RAW_ACCURACY", event.playerId);
      gate(event.effectiveAccuracy === expectedEffectiveAccuracy(player), "COMBAT_EFFECTIVE_ACCURACY", event.playerId);
      continue;
    }
    if (event.type === "combatSkill") {
      const player = byId.get(event.playerId);
      gate(event.rawAccuracy === Number(player.stats?.acc ?? 50), "COMBAT_RESULT_RAW_ACCURACY", event.playerId);
      gate(event.effectiveAccuracy === expectedEffectiveAccuracy(player), "COMBAT_RESULT_EFFECTIVE_ACCURACY", event.playerId);
      gate(event.accuracyReads > 0 && Number.isFinite(event.result), "COMBAT_ACCURACY_RESULT", event.playerId);
      continue;
    }
    if (event.type === "aggrAccuracy") {
      const player = byId.get(event.playerId);
      gate(event.rawAccuracy === Number(player.stats?.acc ?? 50), "AGGR_RAW_ACCURACY", event.playerId);
      const expected = Math.max(0.2, Math.min(1.15, (event.cou * 0.5 + event.str * 0.22 + event.apm * 0.16 + event.pos * 0.12) / 100 + event.roleAggro + event.personalityAggro));
      gate(Math.abs(event.result - expected) <= 1e-9, "AGGR_ACCURACY_INDEPENDENCE", event.playerId);
      continue;
    }
    if (event.type === "retreat_opportunity") {
      const player = byId.get(event.playerId);
      const key = keyOf(event.round, event.playerId, event.sec);
      gate(player && byId.has(event.enemyId), "RETREAT_OPPORTUNITY_PLAYER", event.playerId);
      gate(!opportunities.has(key), "DUPLICATE_RETREAT_OPPORTUNITY", key);
      gate(event.side === player.side && event.role === player.role && event.hp < 48 && event.mates > 1 && event.distance >= 0 && event.distance < 32, "RETREAT_OPPORTUNITY_SHAPE", key);
      gate(event.threshold === AGGR_THRESHOLD && event.gatePassed === (event.aggr < AGGR_THRESHOLD), "RETREAT_OPPORTUNITY_GATE", key);
      opportunities.set(key, event);
      continue;
    }
    if (event.type === "retreat_trigger") {
      const key = keyOf(event.round, event.playerId, event.sec);
      gate(opportunities.has(key) && opportunities.get(key).gatePassed, "RETREAT_TRIGGER_WITHOUT_GATE", key);
      gate(!triggers.has(key) && event.threshold === AGGR_THRESHOLD, "RETREAT_TRIGGER_SHAPE", key);
      triggers.set(key, event);
      continue;
    }
    if (["combat_pair_candidate", "combat_pair_rejected", "combat_pair_admitted"].includes(event.type)) {
      const map = event.type === "combat_pair_candidate" ? candidates : event.type === "combat_pair_rejected" ? rejected : admitted;
      gate(byId.has(event.tPlayerId) && byId.has(event.cPlayerId), "PAIR_PLAYER_MISSING", event.pairKey);
      gate(byId.get(event.tPlayerId).side === "t" && byId.get(event.cPlayerId).side === "ct", "PAIR_SIDE_ATTRIBUTION", event.pairKey);
      gate(event.distance >= 0 && event.distance < 55 && event.fireChance >= 0 && event.fireChance <= 1, "PAIR_SHAPE", event.pairKey);
      gate(!map.has(event.pairKey), "DUPLICATE_PAIR_EVENT", event.type + " " + event.pairKey);
      map.set(event.pairKey, event);
      continue;
    }
    if (event.type === "combat_exchange") {
      gate(admitted.has(event.pairKey), "EXCHANGE_WITHOUT_ADMISSION", event.pairKey);
      gate(!exchanges.has(event.pairKey), "DUPLICATE_EXCHANGE", event.pairKey);
      gate(event.attackerId !== event.defenderId && event.attackerSide !== event.defenderSide, "ATTACKER_DEFENDER_SHAPE", event.pairKey);
      gate((event.attackerId === event.tPlayerId && event.defenderId === event.cPlayerId) || (event.attackerId === event.cPlayerId && event.defenderId === event.tPlayerId), "EXCHANGE_PARTICIPANT_DRIFT", event.pairKey);
      exchanges.set(event.pairKey, event);
      continue;
    }
    if (event.type === "headshot_roll") {
      const attacker = byId.get(event.attackerId);
      const defender = byId.get(event.defenderId);
      gate(attacker && defender && attacker.side !== defender.side, "HEADSHOT_ATTRIBUTION", event.pairKey);
      gate(exchanges.has(event.pairKey), "HEADSHOT_WITHOUT_EXCHANGE", event.pairKey);
      gate(event.attackerSide === attacker.side && event.defenderSide === defender.side, "HEADSHOT_SIDE", event.pairKey);
      gate(event.rawAccuracy === Number(attacker.stats?.acc ?? 80), "HEADSHOT_RAW_ACCURACY", event.pairKey);
      gate(event.weapon in GUN_HS, "HEADSHOT_WEAPON", event.pairKey);
      gate(Math.abs(event.headshotChance - expectedHeadshotChance(event.weapon, event.rawAccuracy)) <= 1e-12, "HEADSHOT_FORMULA", event.pairKey);
      gate(event.headshotRoll >= 0 && event.headshotRoll < 1 && event.isHS === (event.headshotRoll < event.headshotChance), "HEADSHOT_ROLL", event.pairKey);
      headshots.push(event);
      continue;
    }
    if (event.type === "damage_applied") {
      const attacker = byId.get(event.attackerId);
      const defender = byId.get(event.defenderId);
      gate(attacker && defender && attacker.side !== defender.side, "DAMAGE_ATTRIBUTION", event.attackerId);
      gate(event.attackerSide === attacker.side && event.defenderSide === defender.side, "DAMAGE_SIDE", event.attackerId);
      gate(["firearm", "he", "molly"].includes(event.source), "DAMAGE_SOURCE", event.source);
      gate(event.hpBefore > 0 && event.rawDamage >= 0 && event.effectiveDamage === Math.min(event.rawDamage, event.hpBefore), "EFFECTIVE_DAMAGE_FORMULA", json(event));
      gate(event.overkill === Math.max(0, event.rawDamage - event.hpBefore), "OVERKILL_FORMULA", event.attackerId);
      gate(event.killed === (event.rawDamage >= event.hpBefore), "KILLED_FORMULA", event.attackerId);
      if (event.source === "firearm") {
        const exchange = exchanges.get(event.pairKey);
        gate(exchange && exchange.attackerId === event.attackerId && exchange.defenderId === event.defenderId, "FIREARM_EXCHANGE_ATTRIBUTION", event.pairKey);
      } else {
        gate(event.pairKey === null, "UTILITY_PAIR_ATTRIBUTION", event.attackerId);
      }
      damages.push(event);
      continue;
    }
    if (event.type === "round_summary") {
      const expected = sim.roundHist[event.round - 1];
      gate(expected && !rounds.has(event.round) && expected.winner === event.winner && expected.how === event.how, "ROUND_SUMMARY", String(event.round));
      rounds.set(event.round, event);
      continue;
    }
    if (event.type === "round_player_result") {
      const player = byId.get(event.playerId);
      const key = String(event.round) + "|" + event.playerId;
      gate(player && !playerResults.has(key) && event.side === player.side && event.role === player.role, "ROUND_PLAYER_ATTRIBUTION", key);
      gate(typeof event.survived === "boolean" && event.attackerKills >= 0 && event.attackerDamageDealt >= 0 && event.defenderDeaths >= 0 && event.attackerHeadshots >= 0, "ROUND_PLAYER_SHAPE", key);
      roundResultsGate(event, key);
      playerResults.set(key, event);
    }
  }
  function roundResultsGate(event, key) {
    gate(event.won === (sim.roundHist[event.round - 1]?.winner === event.side), "ROUND_PLAYER_WIN_FLAG", key);
  }
  for (const key of rejected.keys()) gate(candidates.has(key) && !admitted.has(key), "REJECTED_PARTITION", key);
  for (const key of admitted.keys()) gate(candidates.has(key) && !rejected.has(key), "ADMITTED_PARTITION", key);
  const firearmDamages = damages.filter((event) => event.source === "firearm");
  gate(rounds.size === sim.rounds, "ROUND_COUNT", rounds.size + "/" + sim.rounds);
  gate(playerResults.size === sim.rounds * roster.length, "PLAYER_RESULT_COUNT", String(playerResults.size));
  gate(candidates.size === rejected.size + admitted.size && exchanges.size === admitted.size, "PAIR_PARTITION", String(seed));
  gate(headshots.length === exchanges.size && firearmDamages.length === exchanges.size, "FIREARM_CONVERSION_COUNT", seed);
  gate(opportunities.size >= triggers.size, "RETREAT_CHAIN_COUNT", String(seed));
  return { opportunities, triggers, candidates, rejected, admitted, exchanges, headshots, damages, rounds, playerResults };
}

function frameSummary(sim, targetId) {
  let movementDistance = 0;
  let engageFrames = 0;
  let previous = null;
  for (const frame of sim.frames) {
    const player = frame.players.find((item) => item.id === targetId);
    if (!player || player.dead) {
      previous = null;
      continue;
    }
    if (player.state === "ENGAGE") engageFrames++;
    if (previous && previous.rnd === frame.rnd) movementDistance += Math.hypot(player.pos.x - previous.x, player.pos.y - previous.y);
    previous = { rnd: frame.rnd, x: player.pos.x, y: player.pos.y };
  }
  return { movementDistance, engageFrames };
}
function targetSummary(arm, targetId, target, roster) {
  const own = arm.events.filter((event) => event.playerId === targetId);
  const pers = own.filter((event) => event.type === "persStatAccuracy");
  const pos = own.filter((event) => event.type === "posSkillAccuracyRead");
  const combatReads = own.filter((event) => event.type === "combatSkillAccuracyRead");
  const combat = own.filter((event) => event.type === "combatSkill");
  const aggr = own.filter((event) => event.type === "aggrAccuracy");
  const opportunities = own.filter((event) => event.type === "retreat_opportunity");
  const triggers = own.filter((event) => event.type === "retreat_trigger");
  const pairCandidates = arm.events.filter((event) => event.type === "combat_pair_candidate" && event.tPlayerId === targetId);
  const pairAdmitted = arm.events.filter((event) => event.type === "combat_pair_admitted" && event.tPlayerId === targetId);
  const pairRejected = arm.events.filter((event) => event.type === "combat_pair_rejected" && event.tPlayerId === targetId);
  const exchanges = arm.events.filter((event) => event.type === "combat_exchange" && (event.tPlayerId === targetId || event.cPlayerId === targetId));
  const attackerExchanges = exchanges.filter((event) => event.attackerId === targetId);
  const targetHeadshots = arm.events.filter((event) => event.type === "headshot_roll" && event.attackerId === targetId);
  const targetFirearmDamage = arm.events.filter((event) => event.type === "damage_applied" && event.source === "firearm" && event.attackerId === targetId);
  const targetDamageTaken = arm.events.filter((event) => event.type === "damage_applied" && event.source === "firearm" && event.defenderId === targetId);
  const targetFirearmKills = targetFirearmDamage.filter((event) => event.killed).length;
  const targetFirearmDeaths = targetDamageTaken.filter((event) => event.killed).length;
  const targetFirearmEffectiveDamage = targetFirearmDamage.reduce((sum, event) => sum + event.effectiveDamage, 0);
  const targetFirearmOverkill = targetFirearmDamage.reduce((sum, event) => sum + event.overkill, 0);
  const roundResults = arm.events.filter((event) => event.type === "round_player_result" && event.playerId === targetId);
  const opponentResults = arm.events.filter((event) => event.type === "round_player_result" && event.side === "ct");
  const targetKpi = {
    attackerKills: targetFirearmKills,
    attackerDamageDealt: targetFirearmEffectiveDamage,
    defenderDeaths: targetFirearmDeaths,
    survivedRounds: roundResults.filter((event) => event.survived).length,
  };
  const opponentKpi = {
    attackerKills: opponentResults.reduce((sum, event) => sum + event.attackerKills, 0),
    attackerDamageDealt: opponentResults.reduce((sum, event) => sum + event.attackerDamageDealt, 0),
    defenderDeaths: opponentResults.reduce((sum, event) => sum + event.defenderDeaths, 0),
  };
  const aggrValues = aggr.map((event) => event.result);
  const frames = frameSummary(arm.sim, targetId);
  const structuralEvents = arm.events.filter((event) => ["combat_pair_candidate", "combat_pair_rejected", "combat_pair_admitted", "combat_exchange", "headshot_roll", "damage_applied", "round_summary", "round_player_result"].includes(event.type));
  const effectiveDamage = targetFirearmEffectiveDamage;
  const overkillDamage = targetFirearmOverkill;
  const headshotChance = targetHeadshots.map((event) => event.headshotChance);
  return {
    seed: arm.seed,
    rawAccuracy: Number(target.stats.acc),
    effectiveAccuracy: expectedEffectiveAccuracy(target),
    effectiveAccuracyRead: aggregate(pers.map((event) => event.effectiveAccuracy)),
    accuracyAdjustment: PERSONALITY_STAT_DELTAS[target.personality]?.acc || 0,
    accuracyClampReads: pers.filter((event) => event.clamped).length,
    persStatAccuracyCalls: pers.length,
    roleFitMean: pos.length ? mean(pos.map((event) => event.result)) : 0,
    roleFitAccuracyWeight: accuracyWeight(target),
    rawRoleFitReads: pos.length,
    combatSkillAccuracyReads: combatReads.length,
    combatSkillCalls: combat.length,
    combatSkillMean: combat.length ? mean(combat.map((event) => event.result)) : 0,
    aggrCalls: aggr.length,
    aggrMean: aggr.length ? mean(aggrValues) : 0,
    aggrMin: aggrValues.length ? Math.min(...aggrValues) : 0,
    aggrMax: aggrValues.length ? Math.max(...aggrValues) : 0,
    thresholdBelowReads: aggrValues.filter((value) => value < AGGR_THRESHOLD).length,
    retreatOpportunities: opportunities.length,
    retreatTriggers: triggers.length,
    fireOpportunities: pairCandidates.length,
    pairCandidates: pairCandidates.length,
    pairAdmitted: pairAdmitted.length,
    pairRejected: pairRejected.length,
    pairAdmissionRate: pairCandidates.length ? pairAdmitted.length / pairCandidates.length : 0,
    attackerExchanges: attackerExchanges.length,
    defenderExchanges: exchanges.filter((event) => event.defenderId === targetId).length,
    duelWinRate: pairAdmitted.length ? attackerExchanges.length / pairAdmitted.length : 0,
    shots: attackerExchanges.length,
    hitEvents: targetFirearmDamage.length,
    hitRate: attackerExchanges.length ? targetFirearmDamage.length / attackerExchanges.length : 0,
    headshots: targetHeadshots.filter((event) => event.isHS).length,
    headshotChanceMean: headshotChance.length ? mean(headshotChance) : 0,
    headshotRate: attackerExchanges.length ? targetHeadshots.filter((event) => event.isHS).length / attackerExchanges.length : 0,
    effectiveDamage: effectiveDamage,
    overkillDamage: overkillDamage,
    effectiveDamagePerShot: attackerExchanges.length ? effectiveDamage / attackerExchanges.length : 0,
    damageTaken: targetDamageTaken.reduce((sum, event) => sum + event.effectiveDamage, 0),
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
  };
}
function sum(rows, key) { return rows.reduce((total, row) => total + Number(row[key] || 0), 0); }
function aggregateRows(rows) {
  const sumKeys = [
    "persStatAccuracyCalls", "accuracyClampReads", "rawRoleFitReads", "combatSkillAccuracyReads",
    "combatSkillCalls", "aggrCalls", "retreatOpportunities", "retreatTriggers", "fireOpportunities",
    "pairCandidates", "pairAdmitted", "pairRejected", "attackerExchanges", "defenderExchanges",
    "shots", "hitEvents", "headshots", "effectiveDamage", "overkillDamage", "damageTaken",
    "roundResults", "survivedRounds", "attackerKills", "attackerDamageDealt", "defenderDeaths",
    "engageFrames", "opponentSpilloverKills", "opponentSpilloverDamage", "opponentSpilloverDeaths",
  ];
  const sums = sumKeys.reduce((out, key) => { out[key] = sum(rows, key); return out; }, {});
  const means = ["effectiveAccuracyRead", "roleFitMean", "combatSkillMean", "aggrMean", "aggrMin", "aggrMax", "headshotChanceMean", "movementDistanceMean"].reduce((out, key) => {
    out[key] = rounded(mean(rows.map((row) => typeof row[key] === "object" ? row[key].mean : row[key])));
    return out;
  }, {});
  return {
    seeds: rows.length,
    rawAccuracy: rows[0].rawAccuracy,
    effectiveAccuracy: rows[0].effectiveAccuracy,
    accuracyAdjustment: rows[0].accuracyAdjustment,
    roleFitAccuracyWeight: rows[0].roleFitAccuracyWeight,
    ...sums,
    ...means,
    retreatTriggerRate: sums.retreatOpportunities ? rounded(sums.retreatTriggers / sums.retreatOpportunities) : 0,
    pairAdmissionRate: sums.pairCandidates ? rounded(sums.pairAdmitted / sums.pairCandidates) : 0,
    duelWinRate: sums.pairAdmitted ? rounded(sums.attackerExchanges / sums.pairAdmitted) : 0,
    hitRate: sums.shots ? rounded(sums.hitEvents / sums.shots) : 0,
    headshotRate: sums.shots ? rounded(sums.headshots / sums.shots) : 0,
    effectiveDamagePerShot: sums.shots ? rounded(sums.effectiveDamage / sums.shots) : 0,
    survivalRate: sums.roundResults ? rounded(sums.survivedRounds / sums.roundResults) : 0,
    clampRate: sums.persStatAccuracyCalls ? rounded(sums.accuracyClampReads / sums.persStatAccuracyCalls) : 0,
  };
}
function pathComparison(treatmentRows, baselineRows, key) {
  return {
    key,
    ...changedSeedSummary(treatmentRows.filter((row, index) => row[key] !== baselineRows[index][key]).length, baselineRows.length),
  };
}
function saturationSummary(rows, baselineRows, levels) {
  const effectiveLevels = [rows.low[0].effectiveAccuracy, baselineRows[0].effectiveAccuracy, rows.high[0].effectiveAccuracy];
  return {
    levels,
    effectiveLevels,
    runtimeClamp: clampSummary(effectiveLevels, 1, 99),
    lowClampReads: sum(rows.low, "accuracyClampReads"),
    baselineClampReads: sum(baselineRows, "accuracyClampReads"),
    highClampReads: sum(rows.high, "accuracyClampReads"),
    highBaselinePlateauSeeds: rows.high.filter((row, index) => row.effectiveAccuracy === baselineRows[index].effectiveAccuracy).length,
    totalSeeds: rows.high.length,
  };
}
function thresholdSummary(rows, baselineRows) {
  const means = [rows.low[0].aggrMean, baselineRows[0].aggrMean, rows.high[0].aggrMean];
  const crossingSeeds = rows.low.filter((row, index) => {
    const values = [row.aggrMean, baselineRows[index].aggrMean, rows.high[index].aggrMean];
    return Math.min(...values) < AGGR_THRESHOLD && Math.max(...values) >= AGGR_THRESHOLD;
  }).length;
  return {
    threshold: AGGR_THRESHOLD,
    means: means.map(rounded),
    crossing: thresholdCrossing(means, AGGR_THRESHOLD, "up"),
    crossingSeeds,
    low: aggregate(rows.low.map((row) => row.aggrMean)),
    baseline: aggregate(baselineRows.map((row) => row.aggrMean)),
    high: aggregate(rows.high.map((row) => row.aggrMean)),
  };
}

function runArm(api, { mapKey, tTactic, ctTactic, roster, seed }) {
  const before = inputDigest(mapKey, tTactic, ctTactic, roster);
  globalThis.__CS_R24_AUDIT__ = null;
  const off = api.simulateFps(mapKey, tTactic, ctTactic, seed, roster);
  const collector1 = createCollector();
  globalThis.__CS_R24_AUDIT__ = collector1;
  const on1 = api.simulateFps(mapKey, tTactic, ctTactic, seed, roster, collector1);
  const collector2 = createCollector();
  globalThis.__CS_R24_AUDIT__ = collector2;
  const on2 = api.simulateFps(mapKey, tTactic, ctTactic, seed, roster, collector2);
  globalThis.__CS_R24_AUDIT__ = null;
  const offJson = JSON.stringify(off);
  const on1Json = JSON.stringify(on1);
  const on2Json = JSON.stringify(on2);
  gate(offJson === on1Json && on1Json === on2Json, "INSTRUMENTATION_CHANGED_SIM", "seed=" + seed);
  const eventJson1 = json(collector1.events);
  const eventJson2 = json(collector2.events);
  gate(eventJson1 === eventJson2, "AUDIT_NON_DETERMINISTIC", "seed=" + seed);
  gate(before === inputDigest(mapKey, tTactic, ctTactic, roster), "SIM_MUTATED_INPUT", "seed=" + seed);
  const validation = validateEvents(collector1.events, on1, roster, seed);
  return {
    seed,
    sim: on1,
    events: collector1.events,
    strictSimDigest: sha256(offJson),
    eventDigest: sha256(eventJson1),
    validation,
  };
}

async function main() {
  const liveSource = readFileSync(FPS_FILE, "utf8");
  const liveSourceSha256 = sha256(liveSource);
  gate(liveSourceSha256 === CS_R27_DECISION_SOURCE_SHA256, "LIVE_SOURCE_SHA256", liveSourceSha256);
  const source = csR25R24Source(liveSource);
  const sourceSha256 = sha256(source);
  gate(sourceSha256 === SOURCE_SHA256, "SOURCE_SHA256", sourceSha256);
  gate(randTokens(source).length === EXPECTED_RAND_CALLS, "RAND_CALL_COUNT", String(randTokens(source).length));
  gate(FIXED_SEEDS.length === 16, "SEED_COUNT");
  gate(!((8) > 16 / 2) && (9) > 16 / 2, "STRICT_MAJORITY_GATE");
  gate(source.includes('const role=posSkill(p,rawReflex);'), "RAW_ROLE_FIT_SOURCE_GATE");
  gate(source.includes('S("acc")'), "EFFECTIVE_COMBAT_ACCURACY_SOURCE_GATE");
  gate(source.includes('const isHS=rand()<g.hs*(0.72+0.55*((at.stats?.acc||80)/100))'), "RAW_HEADSHOT_SOURCE_GATE");
  gate(!source.includes('persStat(p,"acc")*'), "ACCURACY_UNEXPECTED_AGGR_GATE");
  gate(source.includes("aggr(p)<0.82") && source.includes("fireChance*="), "ACCURACY_THRESHOLD_SOURCE_GATE");
  console.log("schema: " + EVENT_SCHEMA);
  console.log("seed generation version: " + SEED_GENERATION_VERSION);
  console.log("seedSetSha256: " + SEED_SET_SHA256);
  console.log("engineSourceSha256: " + sourceSha256);
  console.log("rand() call sites: " + randTokens(source).length);
  console.log("read-chain source: raw stats.acc -> posSkill role-fit and headshot chance; persStat(acc) -> combatSkill mechanics/weapon; no aggr or fireChance accuracy consumer");

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
    const levels = { baseline: target.stats.acc };
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
    const direct = {
      effectiveAccuracy: {
        aggregate: { low: low.effectiveAccuracy, baseline: baseline.effectiveAccuracy, high: high.effectiveAccuracy },
        seed: monotonicity(rows.low.map((row) => row.effectiveAccuracy), baselineRows.map((row) => row.effectiveAccuracy), rows.high.map((row) => row.effectiveAccuracy)),
      },
      combatSkillMean: {
        aggregate: { low: low.combatSkillMean, baseline: baseline.combatSkillMean, high: high.combatSkillMean },
        seed: monotonicity(rows.low.map((row) => row.combatSkillMean), baselineRows.map((row) => row.combatSkillMean), rows.high.map((row) => row.combatSkillMean)),
      },
      headshotChanceMean: {
        aggregate: { low: low.headshotChanceMean, baseline: baseline.headshotChanceMean, high: high.headshotChanceMean },
        seed: monotonicity(rows.low.map((row) => row.headshotChanceMean), baselineRows.map((row) => row.headshotChanceMean), rows.high.map((row) => row.headshotChanceMean)),
      },
      aggrMean: {
        accuracyIndependent: true,
        aggregate: { low: low.aggrMean, baseline: baseline.aggrMean, high: high.aggrMean },
        sampledCallCount: { low: low.aggrCalls, baseline: baseline.aggrCalls, high: high.aggrCalls },
      },
    };
    direct.roleFitMean = {
      applicable: accuracyWeight(target) > 0,
      aggregate: { low: low.roleFitMean, baseline: baseline.roleFitMean, high: high.roleFitMean },
      seed: accuracyWeight(target) > 0
        ? monotonicity(rows.low.map((row) => row.roleFitMean), baselineRows.map((row) => row.roleFitMean), rows.high.map((row) => row.roleFitMean))
        : null,
    };
    const metrics = {
      pairAdmissionRate: "higher",
      duelWinRate: "higher",
      headshotRate: "higher",
      effectiveDamagePerShot: "higher",
      attackerKills: "higher",
      attackerDamageDealt: "higher",
      survivalRate: "higher",
    };
    const monotonic = Object.fromEntries(Object.entries(metrics).map(([key, direction]) => [
      key,
      monotonicity(rows.low.map((row) => row[key]), baselineRows.map((row) => row[key]), rows.high.map((row) => row[key]), direction),
    ]));
    const pairedEffects = Object.fromEntries(Object.keys(metrics).map((key) => [
      key,
      {
        lowBaseline: pairedEffect(rows.low.map((row) => row[key]), baselineRows.map((row) => row[key])),
        highBaseline: pairedEffect(rows.high.map((row) => row[key]), baselineRows.map((row) => row[key])),
        lowHigh: pairedEffect(rows.low.map((row) => row[key]), rows.high.map((row) => row[key])),
      },
    ]));
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
    };
    const threshold = thresholdSummary(rows, baselineRows);
    const directReady = direct.effectiveAccuracy.seed.strictMajority
      && direct.combatSkillMean.seed.strictMajority
      && direct.headshotChanceMean.seed.strictMajority;
    const pathAmplified = path.targetOnlyKpi.lowVsBaseline.changedSeeds > 0 || path.targetOnlyKpi.highVsBaseline.changedSeeds > 0;
    const readiness = classifyCausalReadiness({
      directMonotonic: directReady,
      directGateEstablished: true,
      localOpportunity: low.fireOpportunities + high.fireOpportunities > 0 ? "sufficient" : "insufficient",
      immediateConversion: direct.headshotChanceMean.seed.strictMajority ? "monotonic" : "non-monotonic",
      thresholdDominated: threshold.crossingSeeds > 0,
      downstreamPathAmplified: pathAmplified,
      semanticAmbiguity: true,
      formulaNonMonotonic: false,
    });
    const result = {
      targetId: target.id,
      role: target.role,
      personality: target.personality,
      levels,
      expectedEffectiveLevels: {
        low: expectedEffectiveAccuracy({ ...target, stats: { ...target.stats, acc: levels.low } }),
        baseline: expectedEffectiveAccuracy(target),
        high: expectedEffectiveAccuracy({ ...target, stats: { ...target.stats, acc: levels.high } }),
      },
      baseline,
      low,
      high,
      direct,
      monotonic,
      pairedEffects,
      saturation: saturationSummary(rows, baselineRows, levels),
      threshold,
      path,
      readiness,
      targetOnlyAttribution: {
        attackerSide: {
          shots: { low: low.shots, baseline: baseline.shots, high: high.shots },
          hitRate: { low: low.hitRate, baseline: baseline.hitRate, high: high.hitRate },
          headshots: { low: low.headshots, baseline: baseline.headshots, high: high.headshots },
          effectiveDamage: { low: low.effectiveDamage, baseline: baseline.effectiveDamage, high: high.effectiveDamage },
          overkillDamage: { low: low.overkillDamage, baseline: baseline.overkillDamage, high: high.overkillDamage },
          kills: { low: low.attackerKills, baseline: baseline.attackerKills, high: high.attackerKills },
          damage: { low: low.attackerDamageDealt, baseline: baseline.attackerDamageDealt, high: high.attackerDamageDealt },
        },
        defenderSide: {
          damageTaken: { low: low.damageTaken, baseline: baseline.damageTaken, high: high.damageTaken },
          deaths: { low: low.defenderDeaths, baseline: baseline.defenderDeaths, high: high.defenderDeaths },
          survival: { low: low.survivalRate, baseline: baseline.survivalRate, high: high.survivalRate },
        },
        opponentSpillover: {
          kills: { low: low.opponentSpilloverKills, baseline: baseline.opponentSpilloverKills, high: high.opponentSpilloverKills },
          damage: { low: low.opponentSpilloverDamage, baseline: baseline.opponentSpilloverDamage, high: high.opponentSpilloverDamage },
        },
      },
    };
    cases.push(result);
    const compact = (row) => ({
      effectiveAccuracy: row.effectiveAccuracy,
      roleFitMean: row.roleFitMean,
      combatSkillMean: row.combatSkillMean,
      aggrMean: row.aggrMean,
      fireOpportunities: row.fireOpportunities,
      pairAdmitted: row.pairAdmitted,
      attackerExchanges: row.attackerExchanges,
      hitRate: row.hitRate,
      headshots: row.headshots,
      headshotRate: row.headshotRate,
      effectiveDamage: row.effectiveDamage,
      effectiveDamagePerShot: row.effectiveDamagePerShot,
      attackerKills: row.attackerKills,
      attackerDamageDealt: row.attackerDamageDealt,
      survivalRate: row.survivalRate,
    });
    console.log("role accuracy evidence: " + JSON.stringify({
      role: result.role,
      targetId: result.targetId,
      personality: result.personality,
      levels: result.levels,
      expectedEffectiveLevels: result.expectedEffectiveLevels,
      measurements: { low: compact(result.low), baseline: compact(result.baseline), high: compact(result.high) },
      direct: Object.fromEntries(Object.entries(result.direct).map(([key, value]) => [
        key,
        value.seed
          ? { passingSeeds: value.seed.passingSeeds, totalSeeds: value.seed.totalSeeds, strictMajority: value.seed.strictMajority, applicable: value.applicable !== false }
          : value,
      ])),
      monotonic: Object.fromEntries(Object.entries(result.monotonic).map(([key, value]) => [
        key,
        { passingSeeds: value.passingSeeds, totalSeeds: value.totalSeeds, strictMajority: value.strictMajority },
      ])),
      effectSize: {
        effectiveDamagePerShot: result.pairedEffects.effectiveDamagePerShot,
        headshotRate: result.pairedEffects.headshotRate,
      },
      threshold: result.threshold,
      saturation: result.saturation,
      targetOnlyAttribution: result.targetOnlyAttribution,
      path: result.path,
      readiness: result.readiness,
    }));
  }
  const controlRows = baselineArms.map((arm) => {
    const event = arm.events.find((item) => item.type === "persStatAccuracy" && item.playerId === "ct3");
    return { rawAccuracy: event?.rawAccuracy ?? null, effectiveAccuracy: event?.effectiveAccuracy ?? null };
  });
  gate(controlRows.every((row) => row.rawAccuracy === 85 && row.effectiveAccuracy === 85), "CONTROL_ACCURACY_SEMANTIC_DRIFT", JSON.stringify(controlRows));
  const control = {
    playerId: "ct3",
    role: "rifler",
    personality: "steady",
    rawAccuracy: controlRows[0].rawAccuracy,
    effectiveAccuracy: controlRows[0].effectiveAccuracy,
    rawRoleFitWeight: 5,
    headshotUsesRaw: true,
    combatUsesEffective: true,
    aggrUsesAccuracy: false,
  };
  const suite = {
    schema: SUITE_SCHEMA,
    framework: "R22-local-causal-v1",
    sourceSha256,
    seedGenerationVersion: SEED_GENERATION_VERSION,
    seedSetSha256: SEED_SET_SHA256,
    scenario: { mapKey: MAP_KEY, tTacticId: T_TACTIC_ID, ctTacticId: CT_TACTIC_ID },
    band: BAND,
    targetRoles: TARGET_ROLES,
    levels: CALIBRATION_LEVELS,
    attribution: "target player attacker shots/headshots/effective firearm damage/kills/damage are attacker-side only; defender damage/deaths/survival are separate; CT totals are spillover",
    semanticBoundary: "raw stats.acc is used by role-fit and headshot chance; persStat(acc) is used by combatSkill mechanics/weapon; headshot remains raw, so semantic audit is required before balance calibration",
    hitMissBoundary: "every admitted firearm exchange applies damage; no separate firearm miss branch exists",
    productionChanged: false,
    rngChanged: false,
    scenarioChanged: false,
    control,
    cases,
  };
  const suiteDigest = sha256(json(suite));
  gate(inputBefore === inputDigest(MAP_KEY, tTactic, ctTactic, baselineRoster), "INPUT_MUTATED");
  gate(EXPECTED_SUITE_DIGEST !== "__CAPTURE_MANUALLY__", "SUITE_NOT_LOCKED", "candidate=" + suiteDigest);
  gate(suiteDigest === EXPECTED_SUITE_DIGEST, "ACCURACY_MEASUREMENT_REGRESSION", "expected=" + EXPECTED_SUITE_DIGEST + "\nactual=" + suiteDigest);
  console.log("simulations: " + (FIXED_SEEDS.length * (1 + targets.length * 2) * 3));
  console.log("suiteDigest: " + suiteDigest);
  console.log("control semantic probe: " + JSON.stringify(control));
  console.log("production source modified: no (memory transform only)");
  console.log("claim boundary: Accuracy measurement / read-chain evidence only; no balance calibration claim");
  console.log("CS Accuracy Measurement / Calibration Readiness R24: PASS");
}

main().catch((error) => {
  console.error("CS Accuracy Measurement / Calibration Readiness R24: FAIL " + (error?.stack || error));
  process.exitCode = 1;
});
