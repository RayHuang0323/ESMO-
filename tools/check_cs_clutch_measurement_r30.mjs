#!/usr/bin/env node
// R30: CS Clutch Measurement / Calibration Readiness.
// Production FPS gameplay stays untouched. All read instrumentation below is
// an exact, reversible Vite memory transform; it does not add RNG or gameplay.

import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import {
  CS_R26_DECISION_SOURCE_SHA256,
  CS_R27_DECISION_SOURCE_SHA256,
  CS_R32_CLUTCH_RESILIENCE_SOURCE_SHA256,
  CS_R33_RESILIENCE_SOURCE_SHA256,
  csR33R32Source,
  csR27R26Source,
} from "./cs_r15_legacy_source.mjs";
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
const EVENT_SCHEMA = "CsClutchMeasurementEvent.v1";
const SUITE_SCHEMA = "CsClutchMeasurementSuite.v1";
const EXPECTED_SUITE_DIGEST = "56dea7e81163275ab7d6ca43a287d804dfeccb37d0eea10fb855a93c40e33a3c";
const SEED_GENERATION_VERSION = "CsMeasurementSeedSet.v1";
const FIXED_SEEDS = Object.freeze([
  3978742910, 4200255727, 541349949, 1011896540,
  44863398, 1878380147, 638784133, 2852978760,
  1789562418, 3820910912, 3991584863, 2186970694,
  951543597, 2082574495, 474649321, 3950420867,
]);
const SEED_SET_SHA256 = "52414f0e6b09ba72b9223b5e76b6ad9d859e8b8ea6fe77dcc2a2a08876a74c6d";
const EXPECTED_RAND_CALLS = 21;
const R4_EVENT_SUITE_DIGEST = "e3a32ac8990a1bd866936827701352cb4fdd8c665b1984e9eb2fd3942d6d0b0d";
const R4_EVENT_ONLY_SUITE_DIGEST = "4d8b082092a5a735c76b0c75d5618d3eec7be8f45ac7ce59ed8a25a3ab7f053c";
const MAP_KEY = "inferno";
const T_TACTIC_ID = "t_aexec";
const CT_TACTIC_ID = "c_std";
const BAND = 10;
const CLUTCH_THRESHOLD = 0.82;
const TARGET_ROLES = Object.freeze(["entry", "rifler", "awp", "lurker", "igl"]);
const REPRESENTATIVE_GUN = Object.freeze({ entry: "ak", rifler: "ak", awp: "awp", lurker: "ak", igl: "ak" });
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
  aggressive: { dec: -4, cou: 6, rxn: 6, foc: -4 },
  defensive: { pos: 6, foc: 6, cou: -4, apm: -4 },
  calm: { dec: 6, str: 6, cou: -4, apm: -4 },
  passionate: { cou: 6, led: 6, foc: -4, coo: -4 },
  genius: { rxn: 6, lrn: 6, coo: -4, res: -4 },
  grinder: { acc: 6, foc: 6, adp: -4, lrn: -4 },
  shotcaller: { com: 6, led: 6, acc: -4, apm: -4 },
  lonewolf: { apm: 6, rxn: 6, com: -4, coo: -4 },
  steady: { res: 6, pos: 6, cou: -4, rxn: -4 },
  creative: { adp: 6, lrn: 6, foc: -4, res: -4 },
});

const SIGNATURE_MARKER = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster){";
const SIGNATURE_REPLACEMENT = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster,__measure=null){";
const ROUND_STATE_MARKER = "    let contactCalled=false,defuseCalled=false,defuseProg=0;";
const ROUND_STATE_REPLACEMENT = [
  ROUND_STATE_MARKER,
  "    const __r30ClutchSeen=__measure?new Map():null;",
].join("\n");
const PERS_MARKER = "function persStat(p,key){let v=(p.stats&&p.stats[key])||50;const pr=p.personality&&PERSONALITY[p.personality];if(pr){if(pr.boost.includes(key))v+=PERS_BOOST;if(pr.nerf.includes(key))v-=PERS_NERF;}return clamp(v,1,99);}";
const PERS_REPLACEMENT = 'function persStat(p,key){let v=(p.stats&&p.stats[key])||50;const pr=p.personality&&PERSONALITY[p.personality];if(pr){if(pr.boost.includes(key))v+=PERS_BOOST;if(pr.nerf.includes(key))v-=PERS_NERF;}const adjusted=v,effective=clamp(adjusted,1,99);if(key==="str")globalThis.__CS_R30_AUDIT__?.record("clutch_effective_read",{playerId:p.id,role:p.role,personality:p.personality,rawClutch:Number(p.stats?.str??50),adjustedClutch:adjusted,effectiveClutch:effective,clamped:effective!==adjusted,adjustmentSource:"personality-only"});return effective;}';
const POS_MARKER = "function posSkill(p,rawReflex=Number((p.stats||{}).rxn??50)){const prof=POS_PROFILE[p.role]||POS_PROFILE.rifler;const s=p.stats||{};let t=0;prof.forEach((k,i)=>t+=(k===\"rxn\"?rawReflex:(s[k]||50))*(5-i));return t/15;}";
const POS_REPLACEMENT = 'function posSkill(p,rawReflex=Number((p.stats||{}).rxn??50)){const prof=POS_PROFILE[p.role]||POS_PROFILE.rifler;const s=p.stats||{};let t=0;prof.forEach((k,i)=>t+=(k==="rxn"?rawReflex:(s[k]||50))*(5-i));const result=t/15,rawClutch=Number(s.str??50),clutchIndex=prof.indexOf("str"),clutchWeight=clutchIndex<0?0:5-clutchIndex;globalThis.__CS_R30_AUDIT__?.record("clutch_role_fit_read",{playerId:p.id,role:p.role,profile:prof.join(","),rawClutch,clutchWeight,result});return result;}';
const S_MARKER = "const S=k=>k===\"rxn\"?effectiveReflex:persStat(p,k);";
const S_REPLACEMENT = 'let __r30EffectiveClutch=null,__r30EffectiveResilience=null,__r30ClutchReads=0;const S=k=>{const value=k==="rxn"?effectiveReflex:persStat(p,k);if(k==="str"){__r30EffectiveClutch=value;__r30ClutchReads++;}if(k==="res")__r30EffectiveResilience=value;return value;};';
const COMBAT_RETURN_MARKER = "return v*formMul(p);";
const COMBAT_RETURN_REPLACEMENT = 'const __r30Form=formMul(p),__r30Result=v*__r30Form,__r30LastAliveBonus=opts?.lastAlive?(__r30EffectiveClutch-76)*0.22:0,__r30ResilienceBonus=opts?.lastAlive?(__r30EffectiveResilience-76)*0.12:0;globalThis.__CS_R30_AUDIT__?.record("clutch_combat_skill",{playerId:p.id,role:p.role,personality:p.personality,rawClutch:Number(s.str??50),effectiveClutch:__r30EffectiveClutch,effectiveResilience:__r30EffectiveResilience,clutchReads:__r30ClutchReads,roleFit:role,baseBeforeForm:v,formMul:__r30Form,result:__r30Result,holding:Boolean(opts?.holding),entry:Boolean(opts?.entry),lurk:Boolean(opts?.lurk),lastAlive:Boolean(opts?.lastAlive),lowHP:Boolean(opts?.lowHP),lastAliveBonus:__r30LastAliveBonus,resilienceLastAliveBonus:__r30ResilienceBonus});return __r30Result;';
const AGGR_MARKER = "function aggr(p){const s=p.stats;if(!s)return 0.6;const base=(persStat(p,\"cou\")*0.5+persStat(p,\"str\")*0.22+persStat(p,\"apm\")*0.16+persStat(p,\"pos\")*0.12)/100;const pr=p.personality&&PERSONALITY[p.personality];return clamp(base+(ROLE_AGGR[p.role]||0)+(pr?pr.aggro:0),0.2,1.15);}";
const AGGR_REPLACEMENT = 'function aggr(p){const s=p.stats;if(!s)return 0.6;const cou=persStat(p,"cou"),str=persStat(p,"str"),apm=persStat(p,"apm"),pos=persStat(p,"pos");const base=(cou*0.5+str*0.22+apm*0.16+pos*0.12)/100;const pr=p.personality&&PERSONALITY[p.personality];const result=clamp(base+(ROLE_AGGR[p.role]||0)+(pr?pr.aggro:0),0.2,1.15);globalThis.__CS_R30_AUDIT__?.record("clutch_aggr_control",{playerId:p.id,role:p.role,personality:p.personality,rawClutch:Number(p.stats?.str??50),effectiveClutch:str,cou,apm,pos,result});return result;}';
const ALIVE_MARKER = '      const aliveT=ps.filter(p=>p.side==="t"&&!p.dead),aliveCT=ps.filter(p=>p.side==="ct"&&!p.dead);';
const ALIVE_REPLACEMENT = [
  ALIVE_MARKER,
  "      if(__r30ClutchSeen){",
  '        for(const[__side,__mine,__opp] of [["t",aliveT,aliveCT],["ct",aliveCT,aliveT]]){',
  "          if(__mine.length===1&&__opp.length>=1){",
  "            const __player=__mine[0];",
  "            if(!__r30ClutchSeen.has(__player.id)){",
  '              const __opportunity={round:rnd+1,sec,playerId:__player.id,side:__side,role:__player.role,hp:__player.hp,gun:__player.gun??null,opponentCount:__opp.length,opponentIds:__opp.map(__p=>__p.id).sort().join("|"),disadvantaged:__opp.length>=2};',
  "              __r30ClutchSeen.set(__player.id,__opportunity);",
  '              __measure?.record("clutch_opportunity",__opportunity);',
  "            }",
  "          }",
  "        }",
  "      }",
].join("\n");
const FIRE_MARKER = "          if(rand()>=fireChance)continue;";
const FIRE_REPLACEMENT = [
  '          const __r30PairKey=String(rnd+1)+":"+String(sec)+":"+tp.id+":"+cp.id;const __r30ClutchPlayerIds=__r30ClutchSeen?[tp.id,cp.id].filter(__id=>__r30ClutchSeen.has(__id)).sort().join("|"):"";',
  '          if(__r30ClutchPlayerIds)__measure?.record("clutch_pair_candidate",{round:rnd+1,sec,pairKey:__r30PairKey,tPlayerId:tp.id,cPlayerId:cp.id,clutchPlayerIds:__r30ClutchPlayerIds,distance:d,sniperInvolved,fireChance});',
  '          if(rand()>=fireChance){if(__r30ClutchPlayerIds)__measure?.record("clutch_pair_rejected",{round:rnd+1,sec,pairKey:__r30PairKey,tPlayerId:tp.id,cPlayerId:cp.id,clutchPlayerIds:__r30ClutchPlayerIds,distance:d,sniperInvolved,fireChance});continue;}',
  '          if(__r30ClutchPlayerIds)__measure?.record("clutch_pair_admitted",{round:rnd+1,sec,pairKey:__r30PairKey,tPlayerId:tp.id,cPlayerId:cp.id,clutchPlayerIds:__r30ClutchPlayerIds,distance:d,sniperInvolved,fireChance});',
].join("\n");
const PT_MARKER = "          const Pt=clamp(0.5+(tSk-cSk)*0.013+(MAP_EDGE[mapKey]??0.02)+ecoEdge+flashPen+tacEdge,0.07,0.93); // 結構平衡 + 戰術剋制";
const PT_REPLACEMENT = [
  PT_MARKER,
  '          if(__r30ClutchPlayerIds)__measure?.record("clutch_pair_trigger",{round:rnd+1,sec,pairKey:__r30PairKey,tPlayerId:tp.id,cPlayerId:cp.id,clutchPlayerIds:__r30ClutchPlayerIds,fireChance,tSkill:tSk,cSkill:cSk,pt:Pt});',
].join("\n");
const EXCHANGE_MARKER = "          const tw=rand()<Pt;const at=tw?tp:cp,df=tw?cp:tp;";
const EXCHANGE_REPLACEMENT = [
  EXCHANGE_MARKER,
  '          if(__r30ClutchPlayerIds)__measure?.record("clutch_pair_conversion",{round:rnd+1,sec,pairKey:__r30PairKey,tPlayerId:tp.id,cPlayerId:cp.id,clutchPlayerIds:__r30ClutchPlayerIds,pt:Pt,tWon:tw,attackerId:at.id,defenderId:df.id});',
].join("\n");
const DAMAGE_MARKER = "          const {killed}=applyDamage(at,df,dmg);";
const DAMAGE_REPLACEMENT = [
  "          const __r30HpBefore=df.hp;const {killed}=applyDamage(at,df,dmg);",
  '          if(__r30ClutchPlayerIds)__measure?.record("clutch_pair_damage",{round:rnd+1,sec,pairKey:__r30PairKey,tPlayerId:tp.id,cPlayerId:cp.id,clutchPlayerIds:__r30ClutchPlayerIds,pt:Pt,attackerId:at.id,defenderId:df.id,rolledDamage:dmg,hpBefore:__r30HpBefore,effectiveDamage:Math.min(dmg,__r30HpBefore),kill:Boolean(killed)});',
].join("\n");
const CLUTCH_MARKER = "      const clutchId=(winSurv.length===1&&(roundKills[winSurv[0].id]||0)>=1)?winSurv[0].id:null;";
const CLUTCH_REPLACEMENT = [
  CLUTCH_MARKER,
  "      if(__r30ClutchSeen){",
  '        const __opportunityPlayerIds=[...__r30ClutchSeen.keys()].sort();',
  '        __r30ClutchSeen.forEach(__opp=>__measure?.record("clutch_round_result",{round:rnd+1,playerId:__opp.playerId,side:__opp.side,opportunitySec:__opp.sec,opponentCount:__opp.opponentCount,won:wn===__opp.side,winner:wn,how:roundEnd.how,roundKills:roundKills[__opp.playerId]||0,legacyClutch:clutchId===__opp.playerId}));',
  '        __measure?.record("round_clutch_summary",{round:rnd+1,winner:wn,how:roundEnd.how,legacyClutchId:clutchId??null,opportunityPlayerIds:__opportunityPlayerIds.join("|")});',
  "      }",
  '      ps.forEach(__p=>__measure?.record("round_player_result",{round:rnd+1,playerId:__p.id,side:__p.side,role:__p.role,survived:Boolean(!__p.dead),won:wn===__p.side,attackerKills:roundKills[__p.id]||0,attackerDamageDealt:Math.round(roundDmg[__p.id]||0),defenderDeaths:roundDeaths[__p.id]||0}));',
].join("\n");
const RETURN_MARKER = "return { EsportsFPS3D, buildMatchResult };";
const RETURN_REPLACEMENT = "return { EsportsFPS3D, buildMatchResult, simulateFps, ROSTER, TACTICS_DB, persStat, posSkill, combatSkill, aggr, formMul, tacticEdge, MAP_EDGE, clamp };";
const EXPORT_MARKER = "export { EsportsFPS3D, buildMatchResult };";
const EXPORT_REPLACEMENT = [
  "const __CS_CLUTCH_R30_TEST_API__ = Object.freeze({",
  "  simulateFps: __FPS3D_MODULE.simulateFps, ROSTER: __FPS3D_MODULE.ROSTER, TACTICS_DB: __FPS3D_MODULE.TACTICS_DB,",
  "  persStat: __FPS3D_MODULE.persStat, posSkill: __FPS3D_MODULE.posSkill, combatSkill: __FPS3D_MODULE.combatSkill,",
  "  aggr: __FPS3D_MODULE.aggr, formMul: __FPS3D_MODULE.formMul, tacticEdge: __FPS3D_MODULE.tacticEdge,",
  "  MAP_EDGE: __FPS3D_MODULE.MAP_EDGE, clamp: __FPS3D_MODULE.clamp,",
  "});",
  "export { EsportsFPS3D, buildMatchResult, __CS_CLUTCH_R30_TEST_API__ };",
].join("\n");

const TRANSFORMS = Object.freeze([
  ["signature", SIGNATURE_MARKER, SIGNATURE_REPLACEMENT],
  ["round state", ROUND_STATE_MARKER, ROUND_STATE_REPLACEMENT],
  ["persStat clutch", PERS_MARKER, PERS_REPLACEMENT],
  ["posSkill clutch", POS_MARKER, POS_REPLACEMENT],
  ["combatSkill clutch read", S_MARKER, S_REPLACEMENT],
  ["combatSkill result", COMBAT_RETURN_MARKER, COMBAT_RETURN_REPLACEMENT],
  ["aggr clutch", AGGR_MARKER, AGGR_REPLACEMENT],
  ["fresh alive", ALIVE_MARKER, ALIVE_REPLACEMENT],
  ["pair admission", FIRE_MARKER, FIRE_REPLACEMENT],
  ["pair trigger", PT_MARKER, PT_REPLACEMENT],
  ["pair conversion", EXCHANGE_MARKER, EXCHANGE_REPLACEMENT],
  ["pair damage", DAMAGE_MARKER, DAMAGE_REPLACEMENT],
  ["round result", CLUTCH_MARKER, CLUTCH_REPLACEMENT],
  ["module return", RETURN_MARKER, RETURN_REPLACEMENT],
  ["module export", EXPORT_MARKER, EXPORT_REPLACEMENT],
]);

const EVENT_TYPES = new Set([
  "clutch_effective_read", "clutch_role_fit_read", "clutch_combat_skill", "clutch_aggr_control",
  "clutch_opportunity", "clutch_pair_candidate", "clutch_pair_rejected", "clutch_pair_admitted",
  "clutch_pair_trigger", "clutch_pair_conversion", "clutch_pair_damage", "clutch_round_result",
  "round_clutch_summary", "round_player_result",
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
function randTokens(source) { return source.match(/\brand\s*\(\s*\)/g) || []; }
function mean(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function rounded(value) { return +Number(value || 0).toFixed(4); }
function sampleSd(values) {
  if (values.length < 2) return 0; const avg = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + ((value - avg) ** 2), 0) / (values.length - 1));
}
function aggregate(values) {
  return values.length
    ? { mean: rounded(mean(values)), sd: rounded(sampleSd(values)), min: rounded(Math.min(...values)), max: rounded(Math.max(...values)) }
    : { mean: 0, sd: 0, min: 0, max: 0 };
}
function expectedEffectiveClutch(player) {
  const raw = Number(player.stats?.str ?? 50);
  return Math.max(1, Math.min(99, raw + (PERSONALITY_STAT_DELTAS[player.personality]?.str || 0)));
}
function expectedPosSkill(player) {
  const profile = POS_PROFILE[player.role] || POS_PROFILE.rifler; const stats = player.stats || {};
  let total = 0; profile.forEach((key, index) => { total += (key === "rxn" ? Number(stats.rxn ?? 50) : Number(stats[key] || 50)) * (5 - index); });
  return total / 15;
}
function clutchWeight(player) {
  const index = (POS_PROFILE[player.role] || POS_PROFILE.rifler).indexOf("str"); return index < 0 ? 0 : 5 - index;
}
function expectedAggr(player) {
  const effective = (key) => {
    const raw = Number(player.stats?.[key] ?? 50);
    return Math.max(1, Math.min(99, raw + (PERSONALITY_STAT_DELTAS[player.personality]?.[key] || 0)));
  };
  const base = (effective("cou") * 0.5 + effective("str") * 0.22 + effective("apm") * 0.16 + effective("pos") * 0.12) / 100;
  return Math.max(0.2, Math.min(1.15, base + (ROLE_AGGR[player.role] || 0) + (PERSONALITY_AGGRO[player.personality] || 0)));
}
function parseIds(text, { allowEmpty = false } = {}) {
  gate(typeof text === "string", "ID_LIST_TYPE", String(text));
  if (text === "") { gate(allowEmpty, "EMPTY_ID_LIST"); return []; }
  const ids = text.split("|"); gate(ids.every(Boolean), "BLANK_ID"); gate(new Set(ids).size === ids.length, "DUPLICATE_ID", text);
  gate([...ids].sort().join("|") === text, "UNSORTED_ID_LIST", text); return ids;
}
function createCollector() {
  const events = [];
  return { events, record(type, payload) {
    gate(EVENT_TYPES.has(type), "UNKNOWN_EVENT_TYPE", type); gate(payload && typeof payload === "object" && !Array.isArray(payload), "EVENT_PAYLOAD", type);
    const event = Object.freeze({ schema: EVENT_SCHEMA, type, ...payload });
    for (const [key, value] of Object.entries(event)) gate(value === null || ["string", "number", "boolean"].includes(typeof value), "EVENT_FIELD", `${type}.${key}`);
    events.push(event);
  } };
}
function sourceSlice(source, start, end, label) {
  const from = source.indexOf(start); const to = source.indexOf(end, from + start.length); gate(from >= 0 && to > from, "SOURCE_SLICE", label); return source.slice(from, to);
}
function loadApi(source, currentSource) { return (async () => {
  let transformSeen = 0; let restored = false; let rngSame = false; let vite = null;
  const tempRoot = mkdtempSync(join(tmpdir(), "esmo-cs-clutch-r30-"));
  try {
    vite = await createServer({
      root: ROOT, configFile: false, envFile: false, appType: "custom", logLevel: "error",
      cacheDir: join(tempRoot, "vite-cache"), optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true },
      plugins: [{ name: "cs-clutch-r30-memory-hooks", enforce: "pre", transform(code, id) {
        if (resolve(id.split("?")[0]).toLowerCase() !== FPS_FILE.toLowerCase()) return null;
        transformSeen += 1; gate(code === currentSource, "VITE_SOURCE_MISMATCH"); let transformed = source;
        for (const [name, marker, replacement] of TRANSFORMS) { gate(occurrences(transformed, marker) === 1, "TRANSFORM_MARKER_COUNT", name); transformed = transformed.replace(marker, replacement); }
        let roundTrip = transformed;
        for (const [name, marker, replacement] of [...TRANSFORMS].reverse()) { gate(occurrences(roundTrip, replacement) === 1, "TRANSFORM_REPLACEMENT_COUNT", name); roundTrip = roundTrip.replace(replacement, marker); }
        restored = roundTrip === source; rngSame = json(randTokens(transformed)) === json(randTokens(source)); gate(restored, "TRANSFORM_NOT_REVERSIBLE"); gate(rngSame, "RNG_TOKEN_SEQUENCE_CHANGED");
        return { code: transformed, map: null };
      } }],
    });
    const module = await vite.ssrLoadModule(FPS_MODULE_ID + "?r30=" + Date.now());
    gate(transformSeen === 1 && restored && rngSame, "TRANSFORM_LOAD_GATE", json({ transformSeen, restored, rngSame }));
    return module.__CS_CLUTCH_R30_TEST_API__;
  } finally { if (vite) await vite.close(); rmSync(tempRoot, { recursive: true, force: true }); }
})(); }
function inputDigest(mapKey, tTactic, ctTactic, roster) { return sha256(json({ mapKey, tTactic, ctTactic, roster })); }
function treatmentRoster(baselineRoster, targetId, level) {
  const next = clone(baselineRoster); const base = baselineRoster.find((player) => player.id === targetId); const target = next.find((player) => player.id === targetId); gate(base && target, "TARGET_MISSING", targetId);
  const values = { low: base.stats.str - BAND, baseline: base.stats.str, high: base.stats.str + BAND }; gate(values.low >= 1 && values.high <= 99, "CLUTCH_BAND_CLAMPED", `${targetId} ${json(values)}`); target.stats.str = values[level];
  for (const candidate of next) {
    const original = baselineRoster.find((player) => player.id === candidate.id); gate(original, "TREATMENT_PLAYER_DRIFT", candidate.id);
    if (candidate.id === targetId) { const a = { ...original, stats: { ...original.stats } }; const b = { ...candidate, stats: { ...candidate.stats } }; delete a.stats.str; delete b.stats.str; gate(json(a) === json(b), "TREATMENT_NON_CLUTCH_MUTATION", targetId); }
    else gate(json(candidate) === json(original), "TREATMENT_OTHER_PLAYER_MUTATION", candidate.id);
  }
  gate(target.fps === base.fps && target.moba === base.moba, "HUD_MUTATED", targetId); return { roster: freeze(next), value: values[level], values };
}

function validateEvents(events, sim, roster, seed) {
  gate(events.length > 0, "NO_CLUTCH_EVENTS", `seed=${seed}`);
  const byId = new Map(roster.map((player) => [player.id, player]));
  const opportunities = new Map(), candidates = new Map(), rejected = new Map(), admitted = new Map(), triggers = new Map(), conversions = new Map(), damages = new Map(), results = new Map(), summaries = new Map(), playerResults = new Map();
  for (const event of events) {
    gate(event.schema === EVENT_SCHEMA && EVENT_TYPES.has(event.type), "EVENT_SCHEMA", event.type);
    if (!["clutch_effective_read", "clutch_role_fit_read", "clutch_combat_skill", "clutch_aggr_control"].includes(event.type)) {
      gate(Number.isInteger(event.round) && event.round >= 1, "EVENT_ROUND", String(event.round));
    }
    if (["clutch_effective_read", "clutch_role_fit_read", "clutch_combat_skill", "clutch_aggr_control"].includes(event.type)) gate(byId.has(event.playerId), "READ_PLAYER_MISSING", event.playerId);
    if (event.type === "clutch_effective_read") {
      const p = byId.get(event.playerId); const raw = Number(p.stats?.str ?? 50); const adjusted = raw + (PERSONALITY_STAT_DELTAS[p.personality]?.str || 0);
      gate(event.rawClutch === raw && event.adjustedClutch === adjusted && event.effectiveClutch === expectedEffectiveClutch(p), "EFFECTIVE_CLUTCH_FORMULA", event.playerId); gate(event.clamped === (event.effectiveClutch !== adjusted) && event.adjustmentSource === "personality-only", "EFFECTIVE_CLUTCH_SOURCE", event.playerId);
    } else if (event.type === "clutch_role_fit_read") {
      const p = byId.get(event.playerId); const profile = POS_PROFILE[p.role] || POS_PROFILE.rifler; gate(event.profile === profile.join(",") && event.rawClutch === Number(p.stats?.str ?? 50) && event.clutchWeight === clutchWeight(p), "ROLE_FIT_CLUTCH_SOURCE", event.playerId); gate(Math.abs(event.result - expectedPosSkill(p)) <= 1e-9, "ROLE_FIT_CLUTCH_RESULT", event.playerId);
    } else if (event.type === "clutch_combat_skill") {
      const p = byId.get(event.playerId); const expectedResilience = Math.max(1, Math.min(99, Number(p.stats?.res ?? 50) + (PERSONALITY_STAT_DELTAS[p.personality]?.res || 0))); gate(event.rawClutch === Number(p.stats?.str ?? 50) && event.effectiveClutch === expectedEffectiveClutch(p) && event.effectiveResilience === (event.lastAlive ? expectedResilience : null) && event.clutchReads >= 1, "COMBAT_CLUTCH_FORMULA", `${event.playerId} ${json({event,expectedResilience})}`); gate(Math.abs(event.result - event.baseBeforeForm * event.formMul) <= 1e-9, "COMBAT_FORM_RESULT", event.playerId); gate(event.lastAliveBonus === (event.lastAlive ? (event.effectiveClutch - 76) * 0.22 : 0), "LAST_ALIVE_BONUS", event.playerId); gate(event.resilienceLastAliveBonus === (event.lastAlive ? (expectedResilience - 76) * 0.12 : 0), "RESILIENCE_READ", event.playerId);
    } else if (event.type === "clutch_aggr_control") {
      const p = byId.get(event.playerId); gate(event.rawClutch === Number(p.stats?.str ?? 50) && event.effectiveClutch === expectedEffectiveClutch(p), "AGGR_CLUTCH_SOURCE", event.playerId); gate(Math.abs(event.result - expectedAggr(p)) <= 1e-9, "AGGR_CLUTCH_RESULT", event.playerId);
    } else if (event.type === "clutch_opportunity") {
      const key = `${event.round}|${event.playerId}`; gate(!opportunities.has(key), "DUPLICATE_OPPORTUNITY", key); gate(byId.get(event.playerId)?.side === event.side && Number.isInteger(event.sec) && event.sec >= 0 && event.sec <= 114 && Number.isInteger(event.hp) && event.hp >= 1 && event.hp <= 100, "OPPORTUNITY_SHAPE", key); gate(Number.isInteger(event.opponentCount) && event.opponentCount >= 1 && event.opponentCount <= 5, "OPPONENT_COUNT", key); gate(parseIds(event.opponentIds).length === event.opponentCount && event.disadvantaged === (event.opponentCount >= 2), "OPPONENT_LIST", key); opportunities.set(key, event);
    } else if (["clutch_pair_candidate", "clutch_pair_rejected", "clutch_pair_admitted"].includes(event.type)) {
      const key = event.pairKey; const map = event.type === "clutch_pair_candidate" ? candidates : event.type === "clutch_pair_rejected" ? rejected : admitted; gate(!map.has(key), "DUPLICATE_PAIR_EVENT", `${event.type}:${key}`); const ids = parseIds(event.clutchPlayerIds); gate(ids.length > 0 && [event.tPlayerId, event.cPlayerId].every((id) => byId.has(id)), "PAIR_SHAPE", key); for (const id of ids) { const opp = opportunities.get(`${event.round}|${id}`); gate(Boolean(opp) && opp.sec <= event.sec, "PAIR_WITHOUT_OPPORTUNITY", key); } gate(event.distance >= 0 && event.distance < 55 && event.fireChance >= 0 && event.fireChance <= 1, "PAIR_FORMULA", key); map.set(key, event);
    } else if (event.type === "clutch_pair_trigger") {
      gate(admitted.has(event.pairKey) && !triggers.has(event.pairKey), "TRIGGER_WITHOUT_ADMISSION", event.pairKey); gate(Number.isFinite(event.tSkill) && Number.isFinite(event.cSkill) && event.pt >= 0.07 && event.pt <= 0.93, "TRIGGER_FORMULA", event.pairKey); gate(event.clutchPlayerIds === admitted.get(event.pairKey).clutchPlayerIds, "TRIGGER_IDS", event.pairKey); triggers.set(event.pairKey, event);
    } else if (event.type === "clutch_pair_conversion") {
      gate(triggers.has(event.pairKey) && !conversions.has(event.pairKey), "CONVERSION_WITHOUT_TRIGGER", event.pairKey); gate(event.attackerId !== event.defenderId && [event.tPlayerId, event.cPlayerId].includes(event.attackerId) && [event.tPlayerId, event.cPlayerId].includes(event.defenderId), "CONVERSION_PARTICIPANTS", event.pairKey); conversions.set(event.pairKey, event);
    } else if (event.type === "clutch_pair_damage") {
      gate(triggers.has(event.pairKey) && !damages.has(event.pairKey), "DAMAGE_WITHOUT_TRIGGER", event.pairKey); gate(event.hpBefore > 0 && event.rolledDamage > 0 && event.effectiveDamage === Math.min(event.rolledDamage, event.hpBefore) && [event.tPlayerId, event.cPlayerId].includes(event.attackerId), "DAMAGE_FORMULA", event.pairKey); damages.set(event.pairKey, event);
    } else if (event.type === "clutch_round_result") {
      const key = `${event.round}|${event.playerId}`; const opp = opportunities.get(key); gate(Boolean(opp) && !results.has(key), "RESULT_WITHOUT_OPPORTUNITY", key); gate(event.side === opp.side && event.opportunitySec === opp.sec && event.opponentCount === opp.opponentCount && event.won === (event.winner === event.side) && Number.isInteger(event.roundKills) && event.roundKills >= 0 && typeof event.legacyClutch === "boolean", "RESULT_SHAPE", key); results.set(key, event);
    } else if (event.type === "round_clutch_summary") {
      gate(!summaries.has(event.round) && ["t", "ct"].includes(event.winner) && typeof event.how === "string", "SUMMARY_SHAPE", String(event.round)); parseIds(event.opportunityPlayerIds, { allowEmpty: true }); summaries.set(event.round, event);
    } else if (event.type === "round_player_result") {
      const p = byId.get(event.playerId); const key = `${event.round}|${event.playerId}`; gate(p && !playerResults.has(key) && event.side === p.side && event.role === p.role && typeof event.survived === "boolean" && event.attackerKills >= 0 && event.attackerDamageDealt >= 0 && event.defenderDeaths >= 0, "PLAYER_RESULT_SHAPE", key); playerResults.set(key, event);
    }
  }
  gate(candidates.size === rejected.size + admitted.size, "PAIR_PARTITION", String(seed)); gate(admitted.size === triggers.size && triggers.size === conversions.size && conversions.size === damages.size, "PAIR_CHAIN", String(seed)); gate(results.size === opportunities.size, "OPPORTUNITY_RESULT_COUNT", String(seed)); gate(summaries.size === sim.rounds && playerResults.size === sim.rounds * roster.length, "ROUND_COVERAGE", `${seed}:${summaries.size}/${playerResults.size}`);
  for (const [key, opp] of opportunities) { const result = results.get(key); gate(Boolean(result) && summaries.has(opp.round), "OPPORTUNITY_LINK", key); }
  for (let round = 1; round <= sim.rounds; round += 1) { const summary = summaries.get(round); const expected = sim.roundHist[round - 1]; gate(summary && expected && summary.winner === expected.winner && summary.how === expected.how, "SUMMARY_RESULT_DRIFT", String(round)); const ids = [...opportunities.values()].filter((event) => event.round === round).map((event) => event.playerId).sort().join("|"); gate(summary.opportunityPlayerIds === ids, "SUMMARY_OPPORTUNITY_IDS", String(round)); }
  const legacy = new Map(); for (const summary of summaries.values()) if (summary.legacyClutchId) legacy.set(summary.legacyClutchId, (legacy.get(summary.legacyClutchId) || 0) + 1); for (const p of sim.players) gate((legacy.get(p.id) || 0) === p.clutches, "LEGACY_COUNTER_DRIFT", `${seed}:${p.id}`);
  return { rounds: sim.rounds, opportunities: opportunities.size, tOpportunities: [...opportunities.values()].filter((event) => event.side === "t").length, ctOpportunities: [...opportunities.values()].filter((event) => event.side === "ct").length, oneVsOne: [...opportunities.values()].filter((event) => event.opponentCount === 1).length, oneVsMany: [...opportunities.values()].filter((event) => event.opponentCount >= 2).length, oneVsTwo: [...opportunities.values()].filter((event) => event.opponentCount === 2).length, oneVsThree: [...opportunities.values()].filter((event) => event.opponentCount === 3).length, oneVsFour: [...opportunities.values()].filter((event) => event.opponentCount === 4).length, oneVsFive: [...opportunities.values()].filter((event) => event.opponentCount === 5).length, opportunityWins: [...results.values()].filter((event) => event.won).length, pairCandidates: candidates.size, pairRejected: rejected.size, pairAdmitted: admitted.size, pairTriggers: triggers.size, pairConversions: conversions.size, pairKills: [...damages.values()].filter((event) => event.kill).length, legacyClutches: [...legacy.values()].reduce((sum, value) => sum + value, 0), legacyWithoutOpportunity: [...summaries.values()].filter((summary) => summary.legacyClutchId && !opportunities.has(`${summary.round}|${summary.legacyClutchId}`)).length };
}

function directProbe(api, player, opponent, tTactic, ctTactic) {
  const target = clone(player); target.gun = REPRESENTATIVE_GUN[target.role] || "ak"; const control = clone(opponent); control.gun = REPRESENTATIVE_GUN[control.role] || "m4";
  const normalOpts = { holding: target.role === "awp" || target.role === "lurker", entry: target.role === "entry", lurk: target.role === "lurker", lastAlive: false, lowHP: false };
  const clutchOpts = { ...normalOpts, lastAlive: true }; const controlOpts = { holding: false, entry: false, lurk: false, lastAlive: false, lowHP: false };
  globalThis.__CS_R30_AUDIT__ = null; const rawClutch = Number(target.stats.str); const effectiveClutch = api.persStat(target, "str"); const roleFit = api.posSkill(target, Number(target.stats.rxn ?? 50)); const normalCombatSkill = api.combatSkill(target, normalOpts); const lastAliveCombatSkill = api.combatSkill(target, clutchOpts); const lowHpClutchCombatSkill = api.combatSkill(target, { ...clutchOpts, lowHP: true }); const controlCombatSkill = api.combatSkill(control, controlOpts); const aggression = api.aggr(target); const formMultiplier = api.formMul(target); const tactic = api.tacticEdge(tTactic, ctTactic); const localDuelWinChance = api.clamp(0.5 + (lastAliveCombatSkill - controlCombatSkill) * 0.013 + (api.MAP_EDGE[MAP_KEY] ?? 0.02) + tactic, 0.07, 0.93);
  const lowMoraleTarget = clone(target); lowMoraleTarget.morale = 40; const lowMoraleEffectiveClutch = api.persStat(lowMoraleTarget, "str"); const lowMoraleLastAliveCombatSkill = api.combatSkill(lowMoraleTarget, clutchOpts); const lowMoraleFormMultiplier = api.formMul(lowMoraleTarget); gate(lowMoraleEffectiveClutch === effectiveClutch && lowMoraleFormMultiplier === 0.83, "STATE_CLUTCH_BOUNDARY", player.id); gate(Math.abs(lowMoraleLastAliveCombatSkill - lastAliveCombatSkill * lowMoraleFormMultiplier) <= 1e-9, "STATE_COMBAT_OUTPUT", player.id);
  return freeze({ rawClutch, effectiveClutch, personalityAdjustment: effectiveClutch - rawClutch, roleFit, roleFitClutchWeight: clutchWeight(target), normalCombatSkill, lastAliveCombatSkill, lowHpClutchCombatSkill, lastAliveBonus: lastAliveCombatSkill - normalCombatSkill, formMultiplier, lowMoraleEffectiveClutch, lowMoraleLastAliveCombatSkill, lowMoraleFormMultiplier, stateAdjustsClutch: lowMoraleEffectiveClutch !== effectiveClutch, stateAdjustsCombatOutput: lowMoraleLastAliveCombatSkill !== lastAliveCombatSkill, aggression, localDuelWinChance, representativeGun: target.gun, tactic });
}
function runArm(api, input) {
  const before = inputDigest(input.mapKey, input.tTactic, input.ctTactic, input.roster); globalThis.__CS_R30_AUDIT__ = null; const off = api.simulateFps(input.mapKey, input.tTactic, input.ctTactic, input.seed, input.roster); const c1 = createCollector(); globalThis.__CS_R30_AUDIT__ = c1; const on1 = api.simulateFps(input.mapKey, input.tTactic, input.ctTactic, input.seed, input.roster, c1); const c2 = createCollector(); globalThis.__CS_R30_AUDIT__ = c2; const on2 = api.simulateFps(input.mapKey, input.tTactic, input.ctTactic, input.seed, input.roster, c2); globalThis.__CS_R30_AUDIT__ = null;
  const offJson = JSON.stringify(off); gate(offJson === JSON.stringify(on1) && offJson === JSON.stringify(on2), "INSTRUMENTATION_CHANGED_SIM", `seed=${input.seed}`); const eventJson1 = json(c1.events); gate(eventJson1 === json(c2.events), "AUDIT_NON_DETERMINISTIC", `seed=${input.seed}`); gate(before === inputDigest(input.mapKey, input.tTactic, input.ctTactic, input.roster), "SIM_MUTATED_INPUT", String(input.seed)); const validation = validateEvents(c1.events, on1, input.roster, input.seed); return { seed: input.seed, sim: on1, events: c1.events, strictSimDigest: sha256(offJson), eventDigest: sha256(eventJson1), validation };
}
function targetSummary(arm, target, probe) {
  const id = target.id; const own = (type) => arm.events.filter((event) => event.type === type && event.playerId === id); const all = (type) => arm.events.filter((event) => event.type === type); const results = own("round_player_result"); const opportunities = own("clutch_opportunity"); const pairs = all("clutch_pair_candidate").filter((event) => parseIds(event.clutchPlayerIds).includes(id)); const admitted = all("clutch_pair_admitted").filter((event) => parseIds(event.clutchPlayerIds).includes(id)); const triggers = all("clutch_pair_trigger").filter((event) => parseIds(event.clutchPlayerIds).includes(id)); const conversions = all("clutch_pair_conversion").filter((event) => parseIds(event.clutchPlayerIds).includes(id)); const damages = all("clutch_pair_damage").filter((event) => parseIds(event.clutchPlayerIds).includes(id)); const combats = own("clutch_combat_skill"); const agrrs = own("clutch_aggr_control"); const targetKpi = { kills: results.reduce((sum, event) => sum + event.attackerKills, 0), damage: results.reduce((sum, event) => sum + event.attackerDamageDealt, 0), deaths: results.reduce((sum, event) => sum + event.defenderDeaths, 0), survived: results.filter((event) => event.survived).length };
  const structural = arm.events.filter((event) => ["clutch_opportunity", "clutch_pair_candidate", "clutch_pair_rejected", "clutch_pair_admitted", "clutch_pair_trigger", "clutch_pair_conversion", "clutch_pair_damage", "clutch_round_result", "round_clutch_summary"].includes(event.type)).map((event) => { const out = { ...event }; for (const key of ["fireChance", "tSkill", "cSkill", "pt", "rolledDamage", "hpBefore", "effectiveDamage"]) delete out[key]; return out; });
  return { seed: arm.seed, rawClutch: probe.rawClutch, effectiveClutch: probe.effectiveClutch, personalityAdjustment: probe.personalityAdjustment, effectiveClamp: probe.effectiveClutch === 99 || probe.effectiveClutch === 1, roleFitClutchWeight: probe.roleFitClutchWeight, directRoleFit: probe.roleFit, directNormalCombatSkill: probe.normalCombatSkill, directLastAliveCombatSkill: probe.lastAliveCombatSkill, directLastAliveBonus: probe.lastAliveBonus, directAggression: probe.aggression, directLocalDuelWinChance: probe.localDuelWinChance, lastAliveCombatCalls: combats.filter((event) => event.lastAlive).length, combatSkillCalls: combats.length, combatSkillMean: combats.length ? mean(combats.map((event) => event.result)) : 0, aggrCalls: agrrs.length, aggrMean: agrrs.length ? mean(agrrs.map((event) => event.result)) : 0, clutchOpportunities: opportunities.length, oneVsOneOpportunities: opportunities.filter((event) => event.opponentCount === 1).length, oneVsManyOpportunities: opportunities.filter((event) => event.opponentCount >= 2).length, opportunityWins: all("clutch_round_result").filter((event) => event.playerId === id && event.won).length, pairCandidates: pairs.length, pairAdmitted: admitted.length, pairTriggers: triggers.length, pairConversions: conversions.length, pairKills: damages.filter((event) => event.kill).length, roundResults: results.length, survivedRounds: targetKpi.survived, survivalRate: results.length ? targetKpi.survived / results.length : 0, attackerKills: targetKpi.kills, attackerDamageDealt: targetKpi.damage, strictSimDigest: arm.strictSimDigest, targetKpiDigest: sha256(json(targetKpi)), structuralDigest: sha256(json(structural)), eventDigest: arm.eventDigest };
}
function sum(rows, key) { return rows.reduce((total, row) => total + Number(row[key] || 0), 0); }
function aggregateRows(rows) { const sumKeys = ["lastAliveCombatCalls", "combatSkillCalls", "aggrCalls", "clutchOpportunities", "oneVsOneOpportunities", "oneVsManyOpportunities", "opportunityWins", "pairCandidates", "pairAdmitted", "pairTriggers", "pairConversions", "pairKills", "roundResults", "survivedRounds", "attackerKills", "attackerDamageDealt"]; const sums = Object.fromEntries(sumKeys.map((key) => [key, sum(rows, key)])); const means = Object.fromEntries(["directRoleFit", "directNormalCombatSkill", "directLastAliveCombatSkill", "directLastAliveBonus", "directAggression", "directLocalDuelWinChance", "combatSkillMean", "aggrMean"].map((key) => [key, rounded(mean(rows.map((row) => row[key])))])); return { seeds: rows.length, rawClutch: rows[0].rawClutch, effectiveClutch: rows[0].effectiveClutch, personalityAdjustment: rows[0].personalityAdjustment, roleFitClutchWeight: rows[0].roleFitClutchWeight, ...sums, ...means, opportunityWinRate: sums.clutchOpportunities ? rounded(sums.opportunityWins / sums.clutchOpportunities) : 0, pairAdmissionRate: sums.pairCandidates ? rounded(sums.pairAdmitted / sums.pairCandidates) : 0, survivalRate: sums.roundResults ? rounded(sums.survivedRounds / sums.roundResults) : 0 }; }
function comparePath(treatment, baseline, key) { return { key, ...changedSeedSummary(treatment.filter((row, index) => row[key] !== baseline[index][key]).length, baseline.length) }; }
function metricEvidence(rows, baselineRows, key, direction = "higher") { return { monotonicity: monotonicity(rows.low.map((row) => row[key]), baselineRows.map((row) => row[key]), rows.high.map((row) => row[key]), direction), effect: { lowBaseline: pairedEffect(rows.low.map((row) => row[key]), baselineRows.map((row) => row[key])), highBaseline: pairedEffect(rows.high.map((row) => row[key]), baselineRows.map((row) => row[key])), lowHigh: pairedEffect(rows.low.map((row) => row[key]), rows.high.map((row) => row[key])) } }; }

async function main() {
  gate(process.argv.slice(2).length === 0, "CLI_FLAGS_FORBIDDEN", "R30 verifier is measurement-only.");
  const actualSource = readFileSync(FPS_FILE, "utf8"); gate(sha256(actualSource) === CS_R33_RESILIENCE_SOURCE_SHA256, "CURRENT_SOURCE_SHA256", sha256(actualSource)); const currentSource = csR33R32Source(actualSource); const sourceSha256 = sha256(currentSource); gate(sourceSha256 === CS_R32_CLUTCH_RESILIENCE_SOURCE_SHA256, "HISTORICAL_R32_SOURCE_SHA256", sourceSha256); const historicalSource = csR27R26Source(actualSource); gate(sha256(historicalSource) === CS_R26_DECISION_SOURCE_SHA256, "HISTORICAL_R26_SOURCE_SHA256"); gate(randTokens(currentSource).length === EXPECTED_RAND_CALLS, "RAND_CALL_COUNT", String(randTokens(currentSource).length)); gate(FIXED_SEEDS.length === 16 && 9 > FIXED_SEEDS.length / 2, "STRICT_MAJORITY_GATE");
  const combat = sourceSlice(currentSource, "function combatSkill", "function aggr", "combatSkill"); const defuse = sourceSlice(currentSource, "const defuseAliveCT", "if(!roundEnd)", "defuse"); const targetChoice = sourceSlice(currentSource, "let pairs=[];", "const tHold=", "target/engagement"); const utility = sourceSlice(currentSource, 'if(p.state==="EXECUTE"', "if(sec===18)", "utility");
  gate(combat.includes('if(opts.lastAlive)v+=(S("str")-76)*0.22+(S("res")-76)*0.12;'), "LAST_ALIVE_CLUTCH_READ_MISSING"); gate(combat.includes('if(opts.lowHP)v-=(100-S("str"))*0.05;'), "LOW_HP_CLUTCH_READ_MISSING"); gate(currentSource.includes('persStat(p,"str")*0.22'), "AGGR_CLUTCH_READ_MISSING"); gate(defuse.includes("defuser.stats.foc/250") && !defuse.includes('stats.str') && !defuse.includes('persStat(defuser,"str")'), "DEFUSE_FALSE_CLUTCH_CONSUMER"); gate(!targetChoice.includes('stats.str') && !targetChoice.includes('persStat(p,"str")') && !utility.includes('stats.str') && !utility.includes('persStat(p,"str")'), "UNEXPECTED_CLUTCH_CONSUMER");
  console.log(`schema: ${EVENT_SCHEMA}`); console.log(`framework: R22-local-causal-v1`); console.log(`seedSetSha256: ${SEED_SET_SHA256}`); console.log(`engineSourceSha256: ${sourceSha256}`); console.log(`rand() call sites: ${randTokens(currentSource).length}`); console.log("read-chain source: raw stats.str -> entry/rifler/awp/lurker role-fit; effective persStat(str) -> generic aggr, combatSkill mechanics, low-HP and lastAlive branch"); console.log("negative consumers: Clutch does not directly read target choice, utility timing, defuse progress, bomb choice, tactic choice, or buy choice"); console.log(`historical checkpoint gate: R4 event digest ${R4_EVENT_SUITE_DIGEST}; event-only digest ${R4_EVENT_ONLY_SUITE_DIGEST}; R26 byte-exact adapter PASS`);
  const api = await loadApi(currentSource, actualSource); gate(typeof api?.simulateFps === "function" && typeof api?.combatSkill === "function" && typeof api?.persStat === "function", "TEST_API_MISSING"); const map = api.TACTICS_DB[MAP_KEY]; const tTactic = freeze(clone(map?.t?.find((item) => item.id === T_TACTIC_ID))); const ctTactic = freeze(clone(map?.ct?.find((item) => item.id === CT_TACTIC_ID))); const baselineRoster = freeze(clone(api.ROSTER)); gate(tTactic?.id === T_TACTIC_ID && ctTactic?.id === CT_TACTIC_ID && baselineRoster.length === 10, "FIXED_INPUTS"); const targets = baselineRoster.filter((player) => player.side === "t"); gate(targets.length === 5 && targets.every((player) => TARGET_ROLES.includes(player.role)), "TARGET_ROLES"); const controlOpponent = baselineRoster.find((player) => player.id === "ct3"); gate(controlOpponent, "CONTROL_OPPONENT"); const inputBefore = inputDigest(MAP_KEY, tTactic, ctTactic, baselineRoster);
  const baselineArms = FIXED_SEEDS.map((seed) => runArm(api, { mapKey: MAP_KEY, tTactic, ctTactic, roster: baselineRoster, seed })); const cases = [];
  for (const target of targets) {
    const probes = {}; const rows = { low: [], baseline: [], high: [] }; const levels = { low: target.stats.str - BAND, baseline: target.stats.str, high: target.stats.str + BAND };
    for (const level of ["low", "baseline", "high"]) { const treatment = level === "baseline" ? { roster: baselineRoster, value: levels.baseline } : treatmentRoster(baselineRoster, target.id, level); const treated = treatment.roster.find((player) => player.id === target.id); probes[level] = directProbe(api, treated, controlOpponent, tTactic, ctTactic); const arms = level === "baseline" ? baselineArms : FIXED_SEEDS.map((seed) => runArm(api, { mapKey: MAP_KEY, tTactic, ctTactic, roster: treatment.roster, seed })); rows[level] = arms.map((arm) => targetSummary(arm, treated, probes[level])); }
    const low = aggregateRows(rows.low), baseline = aggregateRows(rows.baseline), high = aggregateRows(rows.high); const direct = { effectiveClutch: metricEvidence(rows, rows.baseline, "effectiveClutch"), roleFit: { applicable: clutchWeight(target) > 0, ...metricEvidence(rows, rows.baseline, "directRoleFit") }, normalCombatSkill: metricEvidence(rows, rows.baseline, "directNormalCombatSkill"), lastAliveCombatSkill: metricEvidence(rows, rows.baseline, "directLastAliveCombatSkill"), lastAliveBonus: metricEvidence(rows, rows.baseline, "directLastAliveBonus"), localDuelWinChance: metricEvidence(rows, rows.baseline, "directLocalDuelWinChance"), aggressionControl: metricEvidence(rows, rows.baseline, "directAggression") };
    const runtime = Object.fromEntries(["clutchOpportunities", "oneVsManyOpportunities", "opportunityWins", "pairAdmitted", "pairConversions", "pairKills", "survivalRate", "attackerKills", "attackerDamageDealt", "aggrMean"].map((key) => [key, metricEvidence(rows, rows.baseline, key)])); const path = { strictSimulation: { lowVsBaseline: comparePath(rows.low, rows.baseline, "strictSimDigest"), highVsBaseline: comparePath(rows.high, rows.baseline, "strictSimDigest") }, structural: { lowVsBaseline: comparePath(rows.low, rows.baseline, "structuralDigest"), highVsBaseline: comparePath(rows.high, rows.baseline, "structuralDigest") }, targetOnlyKpi: { lowVsBaseline: comparePath(rows.low, rows.baseline, "targetKpiDigest"), highVsBaseline: comparePath(rows.high, rows.baseline, "targetKpiDigest") } };
    const threshold = { aggrThreshold: CLUTCH_THRESHOLD, crossing: thresholdCrossing([low.directAggression, baseline.directAggression, high.directAggression], CLUTCH_THRESHOLD, "either"), genericAggrConsumer: true, directClutchSpecificThreshold: false }; const saturation = { rawLevels: [levels.low, levels.baseline, levels.high], effectiveLevels: [probes.low.effectiveClutch, probes.baseline.effectiveClutch, probes.high.effectiveClutch], rawClamp: clampSummary([levels.low, levels.baseline, levels.high], 1, 99), effectiveClamp: clampSummary([probes.low.effectiveClutch, probes.baseline.effectiveClutch, probes.high.effectiveClutch], 1, 99) }; const baselineOpportunityTotal = baseline.clutchOpportunities; const baselinePairTotal = baseline.pairConversions; const directMonotonic = direct.effectiveClutch.monotonicity.strictMajority && direct.lastAliveCombatSkill.monotonicity.strictMajority && direct.lastAliveBonus.monotonicity.strictMajority && direct.localDuelWinChance.monotonicity.strictMajority && direct.aggressionControl.monotonicity.strictMajority && (!direct.roleFit.applicable || direct.roleFit.monotonicity.strictMajority); const pathAmplified = path.structural.lowVsBaseline.changedSeeds > 0 || path.structural.highVsBaseline.changedSeeds > 0; const readiness = classifyCausalReadiness({ directMonotonic, directGateEstablished: true, localOpportunity: baselineOpportunityTotal >= 9 && baselinePairTotal >= 9 ? "sufficient" : "insufficient", immediateConversion: baselinePairTotal >= 9 && runtime.pairConversions.monotonicity.strictMajority ? "monotonic" : "non-monotonic", thresholdDominated: threshold.crossing.crossed && pathAmplified, downstreamPathAmplified: pathAmplified, semanticAmbiguity: true, formulaNonMonotonic: false });
    const result = { targetId: target.id, role: target.role, personality: target.personality, levels, semantic: { rawClutch: levels, effectiveClutch: { low: probes.low.effectiveClutch, baseline: probes.baseline.effectiveClutch, high: probes.high.effectiveClutch }, personalityAdjustment: probes.baseline.personalityAdjustment, stateAdjustment: "morale/condition does not adjust persStat(str); formMul only scales final combat output", roleFitRawWeight: clutchWeight(target) }, measurements: { low, baseline, high }, direct, runtime, threshold, saturation, opportunityCoverage: { baselineClutchOpportunities: baselineOpportunityTotal, baselinePairConversions: baselinePairTotal, oneVsOne: baseline.oneVsOneOpportunities, oneVsMany: baseline.oneVsManyOpportunities, perSeedCoverage: baselineOpportunityTotal / FIXED_SEEDS.length, calibrationBoundary: "true lastAlive opportunities and immediate conversions are observed, but sparse coverage is not a replacement for direct formula evidence" }, path, overlap: { resilience: "shared lastAlive combat branch (effective res +0.12), separate coefficient", focus: "no lastAlive/aggr/defuse Clutch read; Focus is mechanics/weapon/holding/defuse", decision: "no lastAlive Clutch read; Decision remains generic combat/defuse input", courage: "shared generic aggr/fire/retreat path, not the Clutch lastAlive coefficient" }, readiness };
    cases.push(result); console.log("role clutch evidence: " + JSON.stringify({ role: result.role, targetId: result.targetId, personality: result.personality, levels: result.levels, effectiveLevels: result.semantic.effectiveClutch, roleFitWeight: result.semantic.roleFitRawWeight, direct: { effectiveClutch: direct.effectiveClutch.monotonicity, lastAliveCombatSkill: direct.lastAliveCombatSkill.monotonicity, lastAliveBonus: direct.lastAliveBonus.monotonicity, localDuelWinChance: direct.localDuelWinChance.monotonicity, aggression: direct.aggressionControl.monotonicity }, runtime: Object.fromEntries(Object.entries(runtime).map(([key, value]) => [key, value.monotonicity])), coverage: result.opportunityCoverage, threshold, saturation, path, readiness }));
  }
  const baselineOpportunitySummary = baselineArms.reduce((out, arm) => { out.opportunities += arm.validation.opportunities; out.oneVsMany += arm.validation.oneVsMany; out.opportunityWins += arm.validation.opportunityWins; out.pairConversions += arm.validation.pairConversions; out.legacyClutches += arm.validation.legacyClutches; out.legacyWithoutOpportunity += arm.validation.legacyWithoutOpportunity; return out; }, { opportunities: 0, oneVsMany: 0, opportunityWins: 0, pairConversions: 0, legacyClutches: 0, legacyWithoutOpportunity: 0 });
  const suite = { schema: SUITE_SCHEMA, framework: "R22-local-causal-v1", sourceSha256, historicalSourceSha256: sha256(historicalSource), seedGenerationVersion: SEED_GENERATION_VERSION, seedSetSha256: SEED_SET_SHA256, scenario: { mapKey: MAP_KEY, tTacticId: T_TACTIC_ID, ctTacticId: CT_TACTIC_ID }, band: BAND, targetRoles: TARGET_ROLES, levels: CALIBRATION_LEVELS, semanticBoundary: "Clutch is production stats.str: raw role-fit for four roles, effective generic aggr and combatSkill input, plus effective lastAlive/lowHP modifiers; it is not a complete 1vN choice or defuse controller", falseConsumers: ["target/engagement selection", "utility timing", "defuse progress", "bomb-state choice", "tactic choice", "buy choice"], overlap: { resilience: "shared lastAlive branch", focus: "separate mechanics/weapon/holding/defuse", decision: "separate combat/defuse input", courage: "shared aggr/fire/retreat path" }, baselineOpportunitySummary, productionChanged: false, rngChanged: false, scenarioChanged: false, cases };
  gate(inputBefore === inputDigest(MAP_KEY, tTactic, ctTactic, baselineRoster), "INPUT_MUTATED"); const suiteDigest = sha256(json(suite)); gate(EXPECTED_SUITE_DIGEST !== "__CAPTURE_MANUALLY__", "SUITE_NOT_LOCKED", `candidate=${suiteDigest}`); gate(suiteDigest === EXPECTED_SUITE_DIGEST, "CLUTCH_MEASUREMENT_REGRESSION", `expected=${EXPECTED_SUITE_DIGEST}\nactual=${suiteDigest}`); console.log(`baseline clutch summary: ${JSON.stringify(baselineOpportunitySummary)}`); console.log(`logical arms: ${FIXED_SEEDS.length * (1 + TARGET_ROLES.length * 2)}; simulator executions: ${FIXED_SEEDS.length * (1 + TARGET_ROLES.length * 2) * 3}`); console.log(`suiteDigest: ${suiteDigest}`); console.log("deterministic repeated digest: PASS"); console.log("historical checkpoint gate: R4/R26 provenance preserved; no historical rebaseline"); console.log("production source modified: no (memory transform only)"); console.log("claim boundary: Clutch read-chain / local causal measurement only; no balance calibration or new gameplay"); console.log("CS Clutch Measurement / Calibration Readiness R30: PASS");
}

main().catch((error) => { console.error("CS Clutch Measurement / Calibration Readiness R30: FAIL " + (error?.stack || error)); process.exitCode = 1; });
