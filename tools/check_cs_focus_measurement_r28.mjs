#!/usr/bin/env node
// R28: CS Focus Measurement / Calibration Readiness.
// All hooks are exact, reversible Vite memory transforms. Production gameplay,
// RNG, scenario, result contracts, and historical evidence remain untouched.
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import {
  CS_R26_DECISION_SOURCE_SHA256,
  CS_R27_DECISION_SOURCE_SHA256,
  CS_R33_RESILIENCE_SOURCE_SHA256,
  csR27R26Source,
  csR33R32Source,
} from "./cs_r15_legacy_source.mjs";
import {
  CALIBRATION_LEVELS,
  changedSeedSummary,
  clampSummary,
  classifyCausalReadiness,
  monotonicity,
  pairedEffect,
} from "./cs_calibration_measurement.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FPS_FILE = resolve(ROOT, "src/battle/fps/EsportsFPS3D.jsx");
const FPS_MODULE_ID = "/src/battle/fps/EsportsFPS3D.jsx";
const EVENT_SCHEMA = "CsFocusMeasurementEvent.v1";
const SUITE_SCHEMA = "CsFocusMeasurementSuite.v1";
const EXPECTED_SUITE_DIGEST = "7f6e08393a54d5c594bd9c9abce49adbf70a9a6297a197fe4d9624151b4b69a0";
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
const BAND = 10;
const TARGET_ROLES = Object.freeze(["entry", "rifler", "awp", "lurker", "igl"]);
const REPRESENTATIVE_GUN = Object.freeze({ entry: "ak", rifler: "ak", awp: "awp", lurker: "ak", igl: "ak", support: "m4" });
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
  passionate: { cou: 6 },
  genius: { rxn: 6 },
  grinder: { acc: 6, foc: 6 },
  shotcaller: { com: 6, led: 6, acc: -4, apm: -4 },
  lonewolf: { apm: 6, rxn: 6, com: -4, coo: -4 },
  steady: { res: 6, pos: 6, cou: -4, rxn: -4 },
  creative: { adp: 6, lrn: 6, foc: -4, res: -4 },
});

const SIGNATURE_MARKER = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster){";
const SIGNATURE_REPLACEMENT = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster,__measure=null){";
const PERS_MARKER = "function persStat(p,key){let v=(p.stats&&p.stats[key])||50;const pr=p.personality&&PERSONALITY[p.personality];if(pr){if(pr.boost.includes(key))v+=PERS_BOOST;if(pr.nerf.includes(key))v-=PERS_NERF;}return clamp(v,1,99);}";
const PERS_REPLACEMENT = 'function persStat(p,key){let v=(p.stats&&p.stats[key])||50;const pr=p.personality&&PERSONALITY[p.personality];if(pr){if(pr.boost.includes(key))v+=PERS_BOOST;if(pr.nerf.includes(key))v-=PERS_NERF;}const adjusted=v,effective=clamp(adjusted,1,99);if(key==="foc")globalThis.__CS_R28_AUDIT__?.record("focus_effective_read",{playerId:p.id,role:p.role,personality:p.personality,rawFocus:Number(p.stats?.foc??50),adjustedFocus:adjusted,effectiveFocus:effective,clamped:effective!==adjusted,adjustmentSource:"personality-only"});return effective;}';
const POS_MARKER = "function posSkill(p,rawReflex=Number((p.stats||{}).rxn??50)){const prof=POS_PROFILE[p.role]||POS_PROFILE.rifler;const s=p.stats||{};let t=0;prof.forEach((k,i)=>t+=(k===\"rxn\"?rawReflex:(s[k]||50))*(5-i));return t/15;}";
const POS_REPLACEMENT = 'function posSkill(p,rawReflex=Number((p.stats||{}).rxn??50)){const prof=POS_PROFILE[p.role]||POS_PROFILE.rifler;const s=p.stats||{};let t=0;prof.forEach((k,i)=>t+=(k==="rxn"?rawReflex:(s[k]||50))*(5-i));const result=t/15,rawFocus=Number(s.foc??50),focusIndex=prof.indexOf("foc"),focusWeight=focusIndex<0?0:5-focusIndex;globalThis.__CS_R28_AUDIT__?.record("focus_role_fit_read",{playerId:p.id,role:p.role,profile:prof.join(","),rawFocus,focusWeight,result});return result;}';
const S_MARKER = "const S=k=>k===\"rxn\"?effectiveReflex:persStat(p,k);";
const S_REPLACEMENT = 'let __r28EffectiveFocus=null,__r28FocusReads=0;const S=k=>{const value=k==="rxn"?effectiveReflex:persStat(p,k);if(k==="foc"){__r28EffectiveFocus=value;__r28FocusReads++;}return value;};';
const COMBAT_RETURN_MARKER = "return v*formMul(p);";
const COMBAT_RETURN_REPLACEMENT = 'const __r28Form=formMul(p),__r28Result=v*__r28Form;globalThis.__CS_R28_AUDIT__?.record("focus_combat_skill",{playerId:p.id,role:p.role,personality:p.personality,gun:p.gun||"",rawFocus:Number(s.foc??50),effectiveFocus:__r28EffectiveFocus,focusReads:__r28FocusReads,roleFit:role,baseBeforeForm:v,formMul:__r28Form,result:__r28Result,holding:Boolean(opts?.holding),entry:Boolean(opts?.entry),lurk:Boolean(opts?.lurk),lastAlive:Boolean(opts?.lastAlive),lowHP:Boolean(opts?.lowHP)});return __r28Result;';
const AGGR_MARKER = "function aggr(p){const s=p.stats;if(!s)return 0.6;const base=(persStat(p,\"cou\")*0.5+persStat(p,\"str\")*0.22+persStat(p,\"apm\")*0.16+persStat(p,\"pos\")*0.12)/100;const pr=p.personality&&PERSONALITY[p.personality];return clamp(base+(ROLE_AGGR[p.role]||0)+(pr?pr.aggro:0),0.2,1.15);}";
const AGGR_REPLACEMENT = 'function aggr(p){const s=p.stats;if(!s)return 0.6;const cou=persStat(p,"cou"),str=persStat(p,"str"),apm=persStat(p,"apm"),pos=persStat(p,"pos");const base=(cou*0.5+str*0.22+apm*0.16+pos*0.12)/100;const pr=p.personality&&PERSONALITY[p.personality];const result=clamp(base+(ROLE_AGGR[p.role]||0)+(pr?pr.aggro:0),0.2,1.15);globalThis.__CS_R28_AUDIT__?.record("focus_aggr_control",{playerId:p.id,role:p.role,rawFocus:Number(p.stats?.foc??50),cou,str,apm,pos,result});return result;}';
const UTILITY_MARKER = '        if(p.state==="EXECUTE"&&p.nades?.length>0&&rand()<0.06){';
const UTILITY_REPLACEMENT = '        if(p.state==="EXECUTE"&&p.nades?.length>0&&(()=>{const __r28UtilityRoll=rand();__measure?.record("utility_timing_roll",{round:rnd+1,sec,playerId:p.id,side:p.side,role:p.role,rawFocus:Number(p.stats?.foc??50),chance:0.06,roll:__r28UtilityRoll,thrown:__r28UtilityRoll<0.06});return __r28UtilityRoll<0.06;})()){';
const FIRE_MARKER = "          if(rand()>=fireChance)continue;";
const FIRE_REPLACEMENT = [
  '          const __r28PairKey=String(rnd+1)+":"+String(sec)+":"+tp.id+":"+cp.id;__measure?.record("engagement_candidate",{round:rnd+1,sec,pairKey:__r28PairKey,tPlayerId:tp.id,cPlayerId:cp.id,distance:d,fireChance});',
  '          if(rand()>=fireChance){__measure?.record("engagement_rejected",{round:rnd+1,sec,pairKey:__r28PairKey,tPlayerId:tp.id,cPlayerId:cp.id,distance:d,fireChance});continue;}',
  '          __measure?.record("engagement_admitted",{round:rnd+1,sec,pairKey:__r28PairKey,tPlayerId:tp.id,cPlayerId:cp.id,distance:d,fireChance});',
].join("\n");
const EXCHANGE_MARKER = "          const tw=rand()<Pt;const at=tw?tp:cp,df=tw?cp:tp;";
const EXCHANGE_REPLACEMENT = [
  "          const tw=rand()<Pt;const at=tw?tp:cp,df=tw?cp:tp;",
  '          __measure?.record("duel_conversion",{round:rnd+1,sec,pairKey:__r28PairKey,tPlayerId:tp.id,cPlayerId:cp.id,distance:d,tSkill:tSk,cSkill:cSk,pt:Pt,attackerId:at.id,attackerSide:at.side,defenderId:df.id,defenderSide:df.side});',
].join("\n");
const DEFUSE_TICK_MARKER = "        const contested=defuser&&defuseAliveT.some(tp=>dist(tp.pos,c4pos)<9&&!lineBlocked(tp.pos,defuser.pos,walls));";
const DEFUSE_TICK_REPLACEMENT = [
  DEFUSE_TICK_MARKER,
  '        __measure?.record("defuse_opportunity",{round:rnd+1,sec,c4t,progressBefore:defuseProg,proximity:Boolean(defuser),defuserId:defuser?.id||"",defuserRole:defuser?.role||"",rawFocus:defuser?.stats?Number(defuser.stats.foc):null,personality:defuser?.personality||"",contested:Boolean(contested),progressGate:Boolean(defuser&&!contested)});',
].join("\n");
const DEFUSE_PROGRESS_MARKER = "          defuseProg+=defuser.stats?(0.45+defuser.stats.foc/250+persStat(defuser,\"dec\")/300):0.7;";
const DEFUSE_PROGRESS_REPLACEMENT = [
  "          const __r28DefuseBefore=defuseProg;",
  DEFUSE_PROGRESS_MARKER,
  '          __measure?.record("defuse_progress",{round:rnd+1,sec,playerId:defuser.id,role:defuser.role,personality:defuser.personality||"",rawFocus:defuser.stats?Number(defuser.stats.foc):null,effectiveDecision:defuser.stats?persStat(defuser,"dec"):null,before:__r28DefuseBefore,delta:defuseProg-__r28DefuseBefore,after:defuseProg,c4t});',
].join("\n");
const DEFUSE_COMPLETE_MARKER = '        if(defuseProg>=3.5)roundEnd={winner:"ct",how:"defuse"};';
const DEFUSE_COMPLETE_REPLACEMENT = [
  DEFUSE_COMPLETE_MARKER,
  '        if(__measure&&roundEnd?.how==="defuse")__measure.record("defuse_complete",{round:rnd+1,sec,playerId:defuser?.id||"",role:defuser?.role||"",progress:defuseProg,c4t});',
].join("\n");
const ROUND_RESULT_MARKER = "      const wn=roundEnd.winner;";
const ROUND_RESULT_REPLACEMENT = [
  ROUND_RESULT_MARKER,
  '      __measure?.record("round_summary",{round:rnd+1,winner:wn,how:roundEnd.how,planted:Boolean(planted),finalDefuseProgress:defuseProg});',
  '      ps.forEach(__p=>__measure?.record("round_player_result",{round:rnd+1,playerId:__p.id,side:__p.side,role:__p.role,survived:Boolean(!__p.dead),won:wn===__p.side,attackerKills:roundKills[__p.id]||0,attackerDamageDealt:Math.round(roundDmg[__p.id]||0),defenderDeaths:roundDeaths[__p.id]||0}));',
].join("\n");
const RETURN_MARKER = "return { EsportsFPS3D, buildMatchResult };";
const RETURN_REPLACEMENT = "return { EsportsFPS3D, buildMatchResult, simulateFps, ROSTER, TACTICS_DB, persStat, posSkill, combatSkill, aggr, formMul, tacticEdge, MAP_EDGE, clamp };";
const EXPORT_MARKER = "export { EsportsFPS3D, buildMatchResult };";
const EXPORT_REPLACEMENT = [
  "const __CS_FOCUS_R28_TEST_API__ = Object.freeze({",
  "  simulateFps: __FPS3D_MODULE.simulateFps, ROSTER: __FPS3D_MODULE.ROSTER, TACTICS_DB: __FPS3D_MODULE.TACTICS_DB,",
  "  persStat: __FPS3D_MODULE.persStat, posSkill: __FPS3D_MODULE.posSkill, combatSkill: __FPS3D_MODULE.combatSkill,",
  "  aggr: __FPS3D_MODULE.aggr, formMul: __FPS3D_MODULE.formMul, tacticEdge: __FPS3D_MODULE.tacticEdge,",
  "  MAP_EDGE: __FPS3D_MODULE.MAP_EDGE, clamp: __FPS3D_MODULE.clamp,",
  "});",
  "export { EsportsFPS3D, buildMatchResult, __CS_FOCUS_R28_TEST_API__ };",
].join("\n");

const TRANSFORMS = Object.freeze([
  ["simulate signature", SIGNATURE_MARKER, SIGNATURE_REPLACEMENT],
  ["persStat focus", PERS_MARKER, PERS_REPLACEMENT],
  ["posSkill focus", POS_MARKER, POS_REPLACEMENT],
  ["combatSkill focus read", S_MARKER, S_REPLACEMENT],
  ["combatSkill result", COMBAT_RETURN_MARKER, COMBAT_RETURN_REPLACEMENT],
  ["aggr focus control", AGGR_MARKER, AGGR_REPLACEMENT],
  ["utility timing", UTILITY_MARKER, UTILITY_REPLACEMENT],
  ["engagement admission", FIRE_MARKER, FIRE_REPLACEMENT],
  ["duel conversion", EXCHANGE_MARKER, EXCHANGE_REPLACEMENT],
  ["defuse opportunity", DEFUSE_TICK_MARKER, DEFUSE_TICK_REPLACEMENT],
  ["defuse progress", DEFUSE_PROGRESS_MARKER, DEFUSE_PROGRESS_REPLACEMENT],
  ["defuse completion", DEFUSE_COMPLETE_MARKER, DEFUSE_COMPLETE_REPLACEMENT],
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
function expectedEffectiveStat(player, key) {
  const raw = Number(player.stats?.[key] ?? 50);
  return Math.max(1, Math.min(99, raw + (PERSONALITY_STAT_DELTAS[player.personality]?.[key] || 0)));
}
function expectedPosSkill(player) {
  const profile = POS_PROFILE[player.role] || POS_PROFILE.rifler; const stats = player.stats || {};
  let total = 0; profile.forEach((key, index) => { total += (key === "rxn" ? Number(stats.rxn ?? 50) : Number(stats[key] || 50)) * (5 - index); });
  return total / 15;
}
function focusWeight(player) {
  const index = (POS_PROFILE[player.role] || POS_PROFILE.rifler).indexOf("foc"); return index < 0 ? 0 : 5 - index;
}
function expectedAggr(player) {
  const base = (expectedEffectiveStat(player, "cou") * 0.5 + expectedEffectiveStat(player, "str") * 0.22
    + expectedEffectiveStat(player, "apm") * 0.16 + expectedEffectiveStat(player, "pos") * 0.12) / 100;
  return Math.max(0.2, Math.min(1.15, base + (ROLE_AGGR[player.role] || 0) + (PERSONALITY_AGGRO[player.personality] || 0)));
}
function createCollector() {
  const events = [];
  return { events, record(type, payload) {
    gate(payload && typeof payload === "object" && !Array.isArray(payload), "EVENT_PAYLOAD", type);
    const event = Object.freeze({ schema: EVENT_SCHEMA, type, ...payload });
    for (const [key, value] of Object.entries(event)) gate(value === null || ["string", "number", "boolean"].includes(typeof value), "EVENT_FIELD", `${type}.${key}`);
    events.push(event);
  } };
}
function sourceSlice(source, start, end, label) {
  const from = source.indexOf(start); const to = source.indexOf(end, from + start.length);
  gate(from >= 0 && to > from, "SOURCE_SLICE", label); return source.slice(from, to);
}

async function loadApi(source, currentSource) {
  let transformSeen = 0; let restored = false; let rngSame = false; let vite = null;
  const tempRoot = mkdtempSync(join(tmpdir(), "esmo-cs-focus-r28-"));
  try {
    vite = await createServer({
      root: ROOT, configFile: false, envFile: false, appType: "custom", logLevel: "error",
      cacheDir: join(tempRoot, "vite-cache"), optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true },
      plugins: [{
        name: "cs-focus-r28-memory-hooks", enforce: "pre", transform(code, id) {
          if (resolve(id.split("?")[0]).toLowerCase() !== FPS_FILE.toLowerCase()) return null;
          transformSeen += 1; gate(code === currentSource, "VITE_SOURCE_MISMATCH"); let transformed = source;
          for (const [name, marker, replacement] of TRANSFORMS) {
            gate(occurrences(transformed, marker) === 1, "TRANSFORM_MARKER_COUNT", name); transformed = transformed.replace(marker, replacement);
          }
          let roundTrip = transformed;
          for (const [name, marker, replacement] of [...TRANSFORMS].reverse()) {
            gate(occurrences(roundTrip, replacement) === 1, "TRANSFORM_REPLACEMENT_COUNT", name); roundTrip = roundTrip.replace(replacement, marker);
          }
          restored = roundTrip === source; rngSame = json(randTokens(transformed)) === json(randTokens(source));
          gate(restored, "TRANSFORM_NOT_REVERSIBLE"); gate(rngSame, "RNG_TOKEN_SEQUENCE_CHANGED");
          return { code: transformed, map: null };
        },
      }],
    });
    const module = await vite.ssrLoadModule(FPS_MODULE_ID + "?r28=" + Date.now());
    gate(transformSeen === 1 && restored && rngSame, "TRANSFORM_LOAD_GATE", json({ transformSeen, restored, rngSame }));
    return module.__CS_FOCUS_R28_TEST_API__;
  } finally { if (vite) await vite.close(); rmSync(tempRoot, { recursive: true, force: true }); }
}

function inputDigest(mapKey, tTactic, ctTactic, roster) { return sha256(json({ mapKey, tTactic, ctTactic, roster })); }
function treatmentRoster(baselineRoster, targetId, level) {
  const next = clone(baselineRoster); const base = baselineRoster.find((player) => player.id === targetId); const target = next.find((player) => player.id === targetId);
  gate(base && target, "TARGET_MISSING", targetId);
  const values = { low: base.stats.foc - BAND, baseline: base.stats.foc, high: base.stats.foc + BAND };
  gate(values.low >= 1 && values.high <= 99, "FOCUS_BAND_CLAMPED", `${targetId} ${json(values)}`); target.stats.foc = values[level];
  for (const candidate of next) {
    const original = baselineRoster.find((player) => player.id === candidate.id); gate(original, "TREATMENT_PLAYER_DRIFT", candidate.id);
    if (candidate.id === targetId) {
      const a = { ...original, stats: { ...original.stats } }; const b = { ...candidate, stats: { ...candidate.stats } }; delete a.stats.foc; delete b.stats.foc;
      gate(json(a) === json(b), "TREATMENT_NON_FOCUS_MUTATION", targetId);
    } else gate(json(candidate) === json(original), "TREATMENT_OTHER_PLAYER_MUTATION", candidate.id);
  }
  gate(target.fps === base.fps && target.moba === base.moba, "HUD_MUTATED", targetId);
  return { roster: freeze(next), value: values[level], values };
}

function validateEvents(events, sim, roster, seed) {
  gate(events.length > 0, "NO_FOCUS_EVENTS", `seed=${seed}`);
  const allowed = new Set([
    "focus_effective_read", "focus_role_fit_read", "focus_combat_skill", "focus_aggr_control",
    "utility_timing_roll", "engagement_candidate", "engagement_rejected", "engagement_admitted", "duel_conversion",
    "defuse_opportunity", "defuse_progress", "defuse_complete", "round_summary", "round_player_result",
  ]);
  const byId = new Map(roster.map((player) => [player.id, player]));
  const candidates = new Map(); const rejected = new Map(); const admitted = new Map(); const duels = new Map();
  const defuseTicks = new Map(); const defuseProgress = new Map(); const completes = new Map(); const rounds = new Map(); const playerResults = new Map();
  for (const event of events) {
    gate(event.schema === EVENT_SCHEMA && allowed.has(event.type), "EVENT_SCHEMA", event.type);
    if (["focus_effective_read", "focus_role_fit_read", "focus_combat_skill", "focus_aggr_control"].includes(event.type)) gate(byId.has(event.playerId), "READ_PLAYER_MISSING", event.playerId);
    if (event.type === "focus_effective_read") {
      const player = byId.get(event.playerId); const raw = Number(player.stats?.foc ?? 50); const adjusted = raw + (PERSONALITY_STAT_DELTAS[player.personality]?.foc || 0);
      gate(event.rawFocus === raw && event.adjustedFocus === adjusted, "FOCUS_RAW_ADJUSTED", event.playerId);
      gate(event.effectiveFocus === expectedEffectiveStat(player, "foc"), "FOCUS_EFFECTIVE", event.playerId);
      gate(event.clamped === (event.effectiveFocus !== adjusted) && event.adjustmentSource === "personality-only", "FOCUS_CLAMP_SOURCE", event.playerId);
    } else if (event.type === "focus_role_fit_read") {
      const player = byId.get(event.playerId); const profile = POS_PROFILE[player.role] || POS_PROFILE.rifler;
      gate(event.profile === profile.join(",") && event.rawFocus === Number(player.stats?.foc ?? 50), "ROLE_FIT_FOCUS_SOURCE", event.playerId);
      gate(event.focusWeight === focusWeight(player) && Math.abs(event.result - expectedPosSkill(player)) <= 1e-9, "ROLE_FIT_FOCUS_RESULT", event.playerId);
    } else if (event.type === "focus_combat_skill") {
      const player = byId.get(event.playerId); gate(event.rawFocus === Number(player.stats?.foc ?? 50), "COMBAT_RAW_FOCUS", event.playerId);
      gate(event.effectiveFocus === expectedEffectiveStat(player, "foc") && event.focusReads >= 1, "COMBAT_EFFECTIVE_FOCUS", event.playerId);
      gate(Number.isFinite(event.result) && Number.isFinite(event.formMul) && Math.abs(event.result - event.baseBeforeForm * event.formMul) <= 1e-9, "COMBAT_FORM_RESULT", event.playerId);
    } else if (event.type === "focus_aggr_control") {
      const player = byId.get(event.playerId); gate(event.rawFocus === Number(player.stats?.foc ?? 50), "AGGR_RAW_CONTEXT", event.playerId);
      gate(Math.abs(event.result - expectedAggr(player)) <= 1e-9, "AGGR_FOCUS_INDEPENDENCE", event.playerId);
    } else if (event.type === "utility_timing_roll") {
      gate(byId.has(event.playerId) && event.chance === 0.06 && event.roll >= 0 && event.roll < 1 && event.thrown === (event.roll < event.chance), "UTILITY_TIMING_FORMULA", event.playerId);
    } else if (["engagement_candidate", "engagement_rejected", "engagement_admitted"].includes(event.type)) {
      const map = event.type === "engagement_candidate" ? candidates : event.type === "engagement_rejected" ? rejected : admitted;
      gate(byId.get(event.tPlayerId)?.side === "t" && byId.get(event.cPlayerId)?.side === "ct", "ENGAGEMENT_SIDE", event.pairKey);
      gate(event.distance >= 0 && event.distance < 55 && event.fireChance >= 0 && event.fireChance <= 1 && !map.has(event.pairKey), "ENGAGEMENT_SHAPE", event.pairKey); map.set(event.pairKey, event);
    } else if (event.type === "duel_conversion") {
      gate(admitted.has(event.pairKey) && !duels.has(event.pairKey), "DUEL_WITHOUT_OPPORTUNITY", event.pairKey);
      gate(event.pt >= 0.07 && event.pt <= 0.93 && Number.isFinite(event.tSkill) && Number.isFinite(event.cSkill), "DUEL_PROBABILITY", event.pairKey);
      gate((event.attackerId === event.tPlayerId && event.defenderId === event.cPlayerId) || (event.attackerId === event.cPlayerId && event.defenderId === event.tPlayerId), "DUEL_ATTRIBUTION", event.pairKey); duels.set(event.pairKey, event);
    } else if (event.type === "defuse_opportunity") {
      const key = `${event.round}|${event.sec}`; gate(!defuseTicks.has(key) && event.c4t >= 0 && event.c4t <= 19, "DEFUSE_TICK_SHAPE", key);
      gate(event.progressGate === (event.proximity && !event.contested), "DEFUSE_GATE", key);
      if (event.proximity) gate(byId.get(event.defuserId)?.side === "ct" && event.rawFocus === Number(byId.get(event.defuserId).stats.foc), "DEFUSE_RAW_FOCUS", key);
      else gate(event.defuserId === "" && event.rawFocus === null, "DEFUSE_NO_ACTOR", key); defuseTicks.set(key, event);
    } else if (event.type === "defuse_progress") {
      const key = `${event.round}|${event.sec}`; const tick = defuseTicks.get(key); const player = byId.get(event.playerId);
      gate(tick?.progressGate && tick.defuserId === event.playerId && player?.side === "ct" && !defuseProgress.has(key), "DEFUSE_PROGRESS_GATE", key);
      const expected = event.rawFocus === null ? 0.7 : 0.45 + event.rawFocus / 250 + event.effectiveDecision / 300;
      gate(Math.abs(event.delta - expected) <= 1e-12 && Math.abs(event.after - event.before - event.delta) <= 1e-12, "DEFUSE_RAW_FOCUS_FORMULA", key); defuseProgress.set(key, event);
    } else if (event.type === "defuse_complete") {
      gate(!completes.has(event.round) && event.progress >= 3.5 && byId.get(event.playerId)?.side === "ct", "DEFUSE_COMPLETE", String(event.round)); completes.set(event.round, event);
    } else if (event.type === "round_summary") {
      const expected = sim.roundHist[event.round - 1]; gate(expected && !rounds.has(event.round) && expected.winner === event.winner && expected.how === event.how, "ROUND_SUMMARY", String(event.round)); rounds.set(event.round, event);
    } else if (event.type === "round_player_result") {
      const key = `${event.round}|${event.playerId}`; const player = byId.get(event.playerId);
      gate(player && !playerResults.has(key) && event.side === player.side && event.role === player.role, "ROUND_PLAYER_ATTRIBUTION", key);
      gate(event.won === (sim.roundHist[event.round - 1]?.winner === event.side) && event.attackerKills >= 0 && event.attackerDamageDealt >= 0 && event.defenderDeaths >= 0, "ROUND_PLAYER_RESULT", key); playerResults.set(key, event);
    }
  }
  for (const key of rejected.keys()) gate(candidates.has(key) && !admitted.has(key), "REJECTED_PARTITION", key);
  for (const key of admitted.keys()) gate(candidates.has(key) && !rejected.has(key), "ADMITTED_PARTITION", key);
  gate(candidates.size === rejected.size + admitted.size && admitted.size === duels.size, "ENGAGEMENT_PARTITION", String(seed));
  gate(rounds.size === sim.rounds && playerResults.size === sim.rounds * roster.length, "ROUND_COVERAGE", `${rounds.size}/${playerResults.size}`);
  for (const [round, event] of completes) gate(rounds.get(round)?.how === "defuse" && event.progress >= 3.5, "DEFUSE_RESULT_LINK", String(round));
  return { candidates: candidates.size, admitted: admitted.size, duels: duels.size, defuseTicks: defuseTicks.size, defuseProgress: defuseProgress.size, completes: completes.size };
}

function directProbe(api, player, opponent, tTactic, ctTactic) {
  const target = clone(player); target.gun = REPRESENTATIVE_GUN[target.role] || "ak";
  const control = clone(opponent); control.gun = REPRESENTATIVE_GUN[control.role] || "m4";
  const opts = { holding: target.role === "awp" || target.role === "lurker", entry: target.role === "entry", lurk: target.role === "lurker", lastAlive: false, lowHP: false };
  const controlOpts = { holding: false, entry: false, lurk: false, lastAlive: false, lowHP: false };
  globalThis.__CS_R28_AUDIT__ = null;
  const rawFocus = Number(target.stats.foc); const effectiveFocus = api.persStat(target, "foc"); const roleFit = api.posSkill(target, Number(target.stats.rxn ?? 50));
  const combatSkill = api.combatSkill(target, opts); const controlCombatSkill = api.combatSkill(control, controlOpts); const formMultiplier = api.formMul(target); const aggression = api.aggr(target);
  const lowMoraleTarget = clone(target); lowMoraleTarget.morale = 40;
  const lowMoraleEffectiveFocus = api.persStat(lowMoraleTarget, "foc"); const lowMoraleCombatSkill = api.combatSkill(lowMoraleTarget, opts); const lowMoraleFormMultiplier = api.formMul(lowMoraleTarget);
  gate(lowMoraleEffectiveFocus === effectiveFocus && lowMoraleFormMultiplier === 0.83, "STATE_FOCUS_BOUNDARY", player.id);
  gate(Math.abs(lowMoraleCombatSkill - combatSkill * lowMoraleFormMultiplier) <= 1e-9, "STATE_COMBAT_OUTPUT", player.id);
  const tactic = api.tacticEdge(tTactic, ctTactic); const pt = api.clamp(0.5 + (combatSkill - controlCombatSkill) * 0.013 + (api.MAP_EDGE[MAP_KEY] ?? 0.02) + tactic, 0.07, 0.93);
  return freeze({
    rawFocus, effectiveFocus, personalityAdjustment: effectiveFocus - rawFocus, roleFit, roleFitFocusWeight: focusWeight(target),
    combatSkill, formMultiplier, lowMoraleEffectiveFocus, lowMoraleCombatSkill, lowMoraleFormMultiplier,
    stateAdjustsFocus: lowMoraleEffectiveFocus !== effectiveFocus, stateAdjustsCombatOutput: lowMoraleCombatSkill !== combatSkill,
    aggression, localDuelWinChance: pt, representativeGun: target.gun, opts,
    defuseDeltaRawFocus: rounded(0.45 + rawFocus / 250 + api.persStat(target, "dec") / 300),
    defuseDeltaEffectiveFocusCounterfactual: rounded(0.45 + effectiveFocus / 250 + api.persStat(target, "dec") / 300),
    defuseReachableForTargetSide: target.side === "ct",
  });
}

function runArm(api, input) {
  const before = inputDigest(input.mapKey, input.tTactic, input.ctTactic, input.roster);
  globalThis.__CS_R28_AUDIT__ = null; const off = api.simulateFps(input.mapKey, input.tTactic, input.ctTactic, input.seed, input.roster);
  const collector1 = createCollector(); globalThis.__CS_R28_AUDIT__ = collector1; const on1 = api.simulateFps(input.mapKey, input.tTactic, input.ctTactic, input.seed, input.roster, collector1);
  const collector2 = createCollector(); globalThis.__CS_R28_AUDIT__ = collector2; const on2 = api.simulateFps(input.mapKey, input.tTactic, input.ctTactic, input.seed, input.roster, collector2); globalThis.__CS_R28_AUDIT__ = null;
  const offJson = JSON.stringify(off); const on1Json = JSON.stringify(on1); const on2Json = JSON.stringify(on2);
  gate(offJson === on1Json && on1Json === on2Json, "INSTRUMENTATION_CHANGED_SIM", `seed=${input.seed}`);
  const eventJson1 = json(collector1.events); const eventJson2 = json(collector2.events); gate(eventJson1 === eventJson2, "AUDIT_NON_DETERMINISTIC", `seed=${input.seed}`);
  gate(before === inputDigest(input.mapKey, input.tTactic, input.ctTactic, input.roster), "SIM_MUTATED_INPUT", `seed=${input.seed}`);
  const validation = validateEvents(collector1.events, on1, input.roster, input.seed);
  return { seed: input.seed, sim: on1, events: collector1.events, strictSimDigest: sha256(offJson), eventDigest: sha256(eventJson1), validation };
}

function targetSummary(arm, target, probe) {
  const targetId = target.id; const own = arm.events.filter((event) => event.playerId === targetId);
  const effectiveReads = own.filter((event) => event.type === "focus_effective_read"); const roleReads = own.filter((event) => event.type === "focus_role_fit_read"); const combat = own.filter((event) => event.type === "focus_combat_skill"); const aggr = own.filter((event) => event.type === "focus_aggr_control");
  const utility = own.filter((event) => event.type === "utility_timing_roll"); const candidates = arm.events.filter((event) => event.type === "engagement_candidate" && event.tPlayerId === targetId); const admitted = arm.events.filter((event) => event.type === "engagement_admitted" && event.tPlayerId === targetId); const duels = arm.events.filter((event) => event.type === "duel_conversion" && event.tPlayerId === targetId);
  const results = arm.events.filter((event) => event.type === "round_player_result" && event.playerId === targetId); const defuseTicks = arm.events.filter((event) => event.type === "defuse_opportunity"); const defuseProgress = arm.events.filter((event) => event.type === "defuse_progress"); const defuseComplete = arm.events.filter((event) => event.type === "defuse_complete");
  const targetKpi = { kills: results.reduce((sum, event) => sum + event.attackerKills, 0), damage: results.reduce((sum, event) => sum + event.attackerDamageDealt, 0), deaths: results.reduce((sum, event) => sum + event.defenderDeaths, 0), survived: results.filter((event) => event.survived).length };
  const structural = arm.events
    .filter((event) => ["utility_timing_roll", "engagement_candidate", "engagement_rejected", "engagement_admitted", "duel_conversion", "defuse_opportunity", "defuse_progress", "defuse_complete", "round_summary", "round_player_result"].includes(event.type))
    .map((event) => {
      const normalized = { ...event };
      if (event.type === "utility_timing_roll") delete normalized.rawFocus;
      if (event.type === "duel_conversion") { delete normalized.tSkill; delete normalized.cSkill; delete normalized.pt; }
      return normalized;
    });
  return {
    seed: arm.seed, rawFocus: probe.rawFocus, effectiveFocus: probe.effectiveFocus, focusAdjustment: probe.personalityAdjustment,
    focusClampReads: effectiveReads.filter((event) => event.clamped).length, effectiveFocusReadCalls: effectiveReads.length, rawRoleFitReads: roleReads.length,
    roleFitFocusWeight: probe.roleFitFocusWeight, directRoleFit: probe.roleFit, directCombatSkill: probe.combatSkill, directFormMultiplier: probe.formMultiplier,
    directAggression: probe.aggression, directLocalDuelWinChance: probe.localDuelWinChance, defuseDeltaRawFocus: probe.defuseDeltaRawFocus,
    combatSkillCalls: combat.length, combatSkillMean: combat.length ? mean(combat.map((event) => event.result)) : 0,
    aggrCalls: aggr.length, aggrMean: aggr.length ? mean(aggr.map((event) => event.result)) : 0,
    utilityOpportunities: utility.length, utilityThrows: utility.filter((event) => event.thrown).length,
    utilityThrowRate: utility.length ? utility.filter((event) => event.thrown).length / utility.length : 0,
    engagementCandidates: candidates.length, engagementAdmitted: admitted.length, engagementAdmissionRate: candidates.length ? admitted.length / candidates.length : 0,
    duelOpportunities: duels.length, targetAttackerConversions: duels.filter((event) => event.attackerId === targetId).length,
    targetAttackerRate: duels.length ? duels.filter((event) => event.attackerId === targetId).length / duels.length : 0,
    actualTargetWinChanceMean: duels.length ? mean(duels.map((event) => event.pt)) : 0,
    bombTicks: defuseTicks.length, defuseProximity: defuseTicks.filter((event) => event.proximity).length, defuseProgressTicks: defuseProgress.length, defuseCompletions: defuseComplete.length,
    roundResults: results.length, survivedRounds: targetKpi.survived, survivalRate: results.length ? targetKpi.survived / results.length : 0,
    attackerKills: targetKpi.kills, attackerDamageDealt: targetKpi.damage, defenderDeaths: targetKpi.deaths,
    strictSimDigest: arm.strictSimDigest, targetKpiDigest: sha256(json(targetKpi)), structuralDigest: sha256(json(structural)), eventDigest: arm.eventDigest,
  };
}
function sum(rows, key) { return rows.reduce((total, row) => total + Number(row[key] || 0), 0); }
function aggregateRows(rows) {
  const sumKeys = ["focusClampReads", "effectiveFocusReadCalls", "rawRoleFitReads", "combatSkillCalls", "aggrCalls", "utilityOpportunities", "utilityThrows", "engagementCandidates", "engagementAdmitted", "duelOpportunities", "targetAttackerConversions", "bombTicks", "defuseProximity", "defuseProgressTicks", "defuseCompletions", "roundResults", "survivedRounds", "attackerKills", "attackerDamageDealt", "defenderDeaths"];
  const sums = Object.fromEntries(sumKeys.map((key) => [key, sum(rows, key)]));
  const means = Object.fromEntries(["directRoleFit", "directCombatSkill", "directFormMultiplier", "directAggression", "directLocalDuelWinChance", "defuseDeltaRawFocus", "combatSkillMean", "aggrMean", "actualTargetWinChanceMean"].map((key) => [key, rounded(mean(rows.map((row) => row[key])))]));
  return {
    seeds: rows.length, rawFocus: rows[0].rawFocus, effectiveFocus: rows[0].effectiveFocus, focusAdjustment: rows[0].focusAdjustment, roleFitFocusWeight: rows[0].roleFitFocusWeight,
    ...sums, ...means,
    utilityThrowRate: sums.utilityOpportunities ? rounded(sums.utilityThrows / sums.utilityOpportunities) : 0,
    engagementAdmissionRate: sums.engagementCandidates ? rounded(sums.engagementAdmitted / sums.engagementCandidates) : 0,
    targetAttackerRate: sums.duelOpportunities ? rounded(sums.targetAttackerConversions / sums.duelOpportunities) : 0,
    survivalRate: sums.roundResults ? rounded(sums.survivedRounds / sums.roundResults) : 0,
  };
}
function comparePath(treatment, baseline, key) {
  return { key, ...changedSeedSummary(treatment.filter((row, index) => row[key] !== baseline[index][key]).length, baseline.length) };
}
function metricEvidence(rows, baselineRows, key, direction = "higher") {
  return {
    monotonicity: monotonicity(rows.low.map((row) => row[key]), baselineRows.map((row) => row[key]), rows.high.map((row) => row[key]), direction),
    effect: {
      lowBaseline: pairedEffect(rows.low.map((row) => row[key]), baselineRows.map((row) => row[key])),
      highBaseline: pairedEffect(rows.high.map((row) => row[key]), baselineRows.map((row) => row[key])),
      lowHigh: pairedEffect(rows.low.map((row) => row[key]), rows.high.map((row) => row[key])),
    },
  };
}

async function main() {
  const currentSource = readFileSync(FPS_FILE, "utf8");
  gate(sha256(currentSource) === CS_R33_RESILIENCE_SOURCE_SHA256, "CURRENT_SOURCE_SHA256", sha256(currentSource));
  const historicalSource = csR27R26Source(currentSource); gate(sha256(historicalSource) === CS_R26_DECISION_SOURCE_SHA256, "HISTORICAL_R26_SOURCE_SHA256", sha256(historicalSource));
  const source = csR33R32Source(currentSource); const sourceSha256 = sha256(source);
  gate(sourceSha256 === CS_R27_DECISION_SOURCE_SHA256, "SOURCE_SHA256", sourceSha256); gate(randTokens(source).length === EXPECTED_RAND_CALLS, "RAND_CALL_COUNT", String(randTokens(source).length));
  gate(FIXED_SEEDS.length === 16 && !(8 > FIXED_SEEDS.length / 2) && 9 > FIXED_SEEDS.length / 2, "STRICT_MAJORITY_GATE");
  gate(source.includes('const role=posSkill(p,rawReflex);') && source.includes('S("foc")'), "FOCUS_COMBAT_READ_CHAIN");
  gate(source.includes("defuser.stats.foc/250") && !source.includes('persStat(defuser,"foc")'), "FOCUS_RAW_DEFUSE_READ_CHAIN");
  const targetChoice = sourceSlice(source, "let pairs=[];", "const tHold=", "target/engagement choice");
  const retreat = sourceSlice(source, "const near=en.length?", "if(p.routeIdx<p.route.length-1)", "retreat/re-engage");
  const utility = sourceSlice(source, 'if(p.state==="EXECUTE"', "if(sec===18)", "utility timing");
  const bombChoice = sourceSlice(source, "if(!planted&&prog>0.4)", "smokes=smokes.map", "bomb-state choice");
  const buyChoice = sourceSlice(source, "const decideBuy=", "const buyT=", "buy decision");
  const tacticChoice = sourceSlice(source, "const tac={t:tacticT,ct:tacticCT};", "const teamAvg=", "tactic choice");
  const roleRouteChoice = sourceSlice(source, "const RKF=", "const hasBomb=", "role route choice");
  gate(!targetChoice.includes("stats.foc") && !targetChoice.includes('S("foc")'), "TARGET_CHOICE_FALSE_CONSUMER");
  gate(!retreat.includes("stats.foc") && !retreat.includes('persStat(p,"foc")'), "RETREAT_FALSE_CONSUMER");
  gate(!utility.includes("stats.foc") && !utility.includes('persStat(p,"foc")'), "UTILITY_FALSE_CONSUMER");
  gate(!bombChoice.includes("stats.foc") && !bombChoice.includes('persStat(p,"foc")'), "BOMB_CHOICE_FALSE_CONSUMER");
  gate(!buyChoice.includes("stats.foc") && !buyChoice.includes('persStat(p,"foc")'), "BUY_FALSE_CONSUMER");
  gate(!tacticChoice.includes("stats.foc") && !tacticChoice.includes('persStat(p,"foc")'), "TACTIC_CHOICE_FALSE_CONSUMER");
  gate(!roleRouteChoice.includes("stats.foc") && !roleRouteChoice.includes('persStat(p,"foc")'), "ROLE_ROUTE_FALSE_CONSUMER");
  gate(!AGGR_MARKER.includes("foc"), "AGGR_FALSE_CONSUMER");
  console.log("schema: " + EVENT_SCHEMA); console.log("seed generation version: " + SEED_GENERATION_VERSION); console.log("seedSetSha256: " + SEED_SET_SHA256); console.log("engineSourceSha256: " + sourceSha256); console.log("rand() call sites: " + randTokens(source).length);
  console.log("read-chain source: raw stats.foc -> rifler/awp role-fit and CT defuse progress; persStat(foc) -> combatSkill mechanics/weapon/holding; formMul adjusts final combat output, not Focus itself");
  console.log("negative consumers: target/engagement selection, retreat/re-engage, utility timing, plant/buy/tactic choice, and aggr do not read Focus");

  const api = await loadApi(source, currentSource); gate(typeof api?.simulateFps === "function" && typeof api?.combatSkill === "function" && typeof api?.persStat === "function", "TEST_API_MISSING");
  const map = api.TACTICS_DB[MAP_KEY]; const tTactic = freeze(clone(map?.t?.find((item) => item.id === T_TACTIC_ID))); const ctTactic = freeze(clone(map?.ct?.find((item) => item.id === CT_TACTIC_ID))); const baselineRoster = freeze(clone(api.ROSTER));
  gate(tTactic?.id === T_TACTIC_ID && ctTactic?.id === CT_TACTIC_ID && baselineRoster.length === 10, "FIXED_INPUTS");
  const targets = baselineRoster.filter((player) => player.side === "t"); gate(targets.length === 5 && targets.every((player) => TARGET_ROLES.includes(player.role)), "TARGET_ROLES");
  const inputBefore = inputDigest(MAP_KEY, tTactic, ctTactic, baselineRoster); const controlOpponent = baselineRoster.find((player) => player.id === "ct3"); gate(controlOpponent, "CONTROL_OPPONENT");
  const baselineArms = FIXED_SEEDS.map((seed) => runArm(api, { mapKey: MAP_KEY, tTactic, ctTactic, roster: baselineRoster, seed })); const cases = [];
  for (const target of targets) {
    const baselineProbe = directProbe(api, target, controlOpponent, tTactic, ctTactic); const baselineRows = baselineArms.map((arm) => targetSummary(arm, target, baselineProbe)); const rows = { baseline: baselineRows, low: [], high: [] }; const levels = { baseline: target.stats.foc }; const probes = { baseline: baselineProbe };
    for (const level of ["low", "high"]) {
      const treatment = treatmentRoster(baselineRoster, target.id, level); levels[level] = treatment.value; const treated = treatment.roster.find((player) => player.id === target.id); probes[level] = directProbe(api, treated, controlOpponent, tTactic, ctTactic);
      rows[level] = FIXED_SEEDS.map((seed) => targetSummary(runArm(api, { mapKey: MAP_KEY, tTactic, ctTactic, roster: treatment.roster, seed }), treated, probes[level]));
    }
    const low = aggregateRows(rows.low); const baseline = aggregateRows(rows.baseline); const high = aggregateRows(rows.high);
    const direct = {
      effectiveFocus: metricEvidence(rows, baselineRows, "effectiveFocus"),
      roleFit: { applicable: focusWeight(target) > 0, ...metricEvidence(rows, baselineRows, "directRoleFit") },
      combatSkill: metricEvidence(rows, baselineRows, "directCombatSkill"),
      localDuelWinChance: metricEvidence(rows, baselineRows, "directLocalDuelWinChance"),
      aggressionControl: { focusIndependent: true, values: { low: low.directAggression, baseline: baseline.directAggression, high: high.directAggression } },
    };
    const runtime = Object.fromEntries(["combatSkillMean", "engagementAdmissionRate", "actualTargetWinChanceMean", "targetAttackerRate", "utilityThrowRate", "defuseProgressTicks", "attackerKills", "attackerDamageDealt", "survivalRate"].map((key) => [key, metricEvidence(rows, baselineRows, key)]));
    const path = {
      strictSimulation: { lowVsBaseline: comparePath(rows.low, baselineRows, "strictSimDigest"), highVsBaseline: comparePath(rows.high, baselineRows, "strictSimDigest") },
      structural: { lowVsBaseline: comparePath(rows.low, baselineRows, "structuralDigest"), highVsBaseline: comparePath(rows.high, baselineRows, "structuralDigest") },
      targetOnlyKpi: { lowVsBaseline: comparePath(rows.low, baselineRows, "targetKpiDigest"), highVsBaseline: comparePath(rows.high, baselineRows, "targetKpiDigest") },
    };
    const saturation = {
      rawLevels: [levels.low, levels.baseline, levels.high], effectiveLevels: [probes.low.effectiveFocus, probes.baseline.effectiveFocus, probes.high.effectiveFocus],
      rawClamp: clampSummary([levels.low, levels.baseline, levels.high], 1, 99), effectiveClamp: clampSummary([probes.low.effectiveFocus, probes.baseline.effectiveFocus, probes.high.effectiveFocus], 1, 99),
      clampReads: { low: low.focusClampReads, baseline: baseline.focusClampReads, high: high.focusClampReads },
    };
    const directMonotonic = direct.effectiveFocus.monotonicity.strictMajority && direct.combatSkill.monotonicity.strictMajority && direct.localDuelWinChance.monotonicity.strictMajority && (!direct.roleFit.applicable || direct.roleFit.monotonicity.strictMajority);
    const pathAmplified = path.structural.lowVsBaseline.changedSeeds > 0 || path.structural.highVsBaseline.changedSeeds > 0;
    const readiness = classifyCausalReadiness({ directMonotonic, directGateEstablished: true, localOpportunity: "insufficient", immediateConversion: direct.localDuelWinChance.monotonicity.strictMajority ? "monotonic" : "non-monotonic", thresholdDominated: false, downstreamPathAmplified: pathAmplified, semanticAmbiguity: true, formulaNonMonotonic: false });
    const result = {
      targetId: target.id, role: target.role, personality: target.personality, levels,
      semantic: { rawFocus: levels, effectiveFocus: { low: probes.low.effectiveFocus, baseline: probes.baseline.effectiveFocus, high: probes.high.effectiveFocus }, personalityAdjustment: baseline.focusAdjustment, stateAdjustment: "morale=40 leaves effective Focus unchanged and multiplies final combat output only", lowMoraleProbe: { effectiveFocus: probes.baseline.lowMoraleEffectiveFocus, formMultiplier: probes.baseline.lowMoraleFormMultiplier, combatSkill: probes.baseline.lowMoraleCombatSkill }, rawRoleFitWeight: focusWeight(target) },
      measurements: { low, baseline, high }, direct, runtime, saturation,
      threshold: { focusSpecificThreshold: false, aggrThreshold: 0.82, focusReadsAggr: false, crossingSeeds: 0 },
      opportunityCoverage: { combat: { low: low.duelOpportunities, baseline: baseline.duelOpportunities, high: high.duelOpportunities }, utilityIsNonConsumer: { low: low.utilityOpportunities, baseline: baseline.utilityOpportunities, high: high.utilityOpportunities }, targetDefuseReachable: false, calibrationBoundary: "combat opportunities are covered; the independent CT-only raw Focus defuse consumer is not covered by the five T-role treatments" },
      path, readiness,
    };
    cases.push(result);
    const compactMetric = (evidence) => ({ passingSeeds: evidence.monotonicity.passingSeeds, totalSeeds: evidence.monotonicity.totalSeeds, strictMajority: evidence.monotonicity.strictMajority, lowHighEffect: evidence.effect.lowHigh });
    console.log("role focus evidence: " + JSON.stringify({
      role: result.role, targetId: result.targetId, personality: result.personality, semantic: result.semantic,
      measurements: { low: result.measurements.low, baseline: result.measurements.baseline, high: result.measurements.high },
      direct: { effectiveFocus: compactMetric(result.direct.effectiveFocus), roleFit: { applicable: result.direct.roleFit.applicable, ...compactMetric(result.direct.roleFit) }, combatSkill: compactMetric(result.direct.combatSkill), localDuelWinChance: compactMetric(result.direct.localDuelWinChance), aggressionControl: result.direct.aggressionControl },
      runtime: Object.fromEntries(Object.entries(result.runtime).map(([key, value]) => [key, compactMetric(value)])), saturation: result.saturation, threshold: result.threshold, opportunityCoverage: result.opportunityCoverage, path: result.path, readiness: result.readiness,
    }));
  }

  const baselineDefuseEvents = baselineArms.flatMap((arm) => arm.events.filter((event) => event.type === "defuse_progress"));
  const defuseOwners = Object.values(baselineDefuseEvents.reduce((out, event) => {
    const key = event.playerId; if (!out[key]) out[key] = { playerId: key, role: event.role, personality: event.personality, rawFocus: event.rawFocus, effectiveFocus: expectedEffectiveStat(baselineRoster.find((player) => player.id === key), "foc"), progressTicks: 0, totalProgress: 0 };
    out[key].progressTicks++; out[key].totalProgress += event.delta; return out;
  }, {})).map((row) => ({ ...row, totalProgress: rounded(row.totalProgress), rawEffectiveMismatch: row.rawFocus !== row.effectiveFocus }));
  const ctSemanticAudit = baselineRoster.filter((player) => player.side === "ct").map((player) => ({
    playerId: player.id, role: player.role, personality: player.personality, rawFocus: Number(player.stats.foc), effectiveFocus: expectedEffectiveStat(player, "foc"), effectiveDecision: expectedEffectiveStat(player, "dec"),
    rawDelta: rounded(0.45 + Number(player.stats.foc) / 250 + expectedEffectiveStat(player, "dec") / 300), effectiveCounterfactualDelta: rounded(0.45 + expectedEffectiveStat(player, "foc") / 250 + expectedEffectiveStat(player, "dec") / 300),
  }));
  const defuseCoverage = {
    bombTicks: baselineArms.reduce((sum, arm) => sum + arm.validation.defuseTicks, 0), progressTicks: baselineDefuseEvents.length,
    completions: baselineArms.reduce((sum, arm) => sum + arm.validation.completes, 0), ownerCount: defuseOwners.length, owners: defuseOwners,
    ctSemanticAudit, personalityMismatchPlayers: ctSemanticAudit.filter((row) => row.rawFocus !== row.effectiveFocus).map((row) => row.playerId),
  };
  gate(defuseCoverage.bombTicks > 0 && defuseCoverage.progressTicks > 0 && defuseCoverage.completions > 0, "DEFUSE_COVERAGE_MISSING", json(defuseCoverage));
  gate(defuseCoverage.personalityMismatchPlayers.length > 0, "DEFUSE_SEMANTIC_CONTROL_MISSING");
  const suite = {
    schema: SUITE_SCHEMA, framework: "R22-local-causal-v1", sourceSha256, historicalSourceSha256: sha256(historicalSource), seedGenerationVersion: SEED_GENERATION_VERSION, seedSetSha256: SEED_SET_SHA256,
    scenario: { mapKey: MAP_KEY, tTacticId: T_TACTIC_ID, ctTacticId: CT_TACTIC_ID }, band: BAND, targetRoles: TARGET_ROLES, levels: CALIBRATION_LEVELS,
    semanticBoundary: "raw stats.foc feeds rifler/awp role-fit and CT defuse progress; personality-adjusted persStat(foc) feeds combatSkill mechanics/weapon/holding; morale/condition only multiply final combat output",
    falseConsumers: ["target/engagement selection", "retreat/re-engage", "utility timing", "bomb plant choice", "role/tactic choice", "buy choice", "aggr"],
    overlap: { decision: "shared defuse progress with Decision", resilience: "no Focus read in lastAlive branch", clutch: "no Focus read in lastAlive branch; Focus is generic execution", tacticalIQ: "no Focus read in planning/tactic choice" },
    defuseCoverage, productionChanged: false, rngChanged: false, scenarioChanged: false, cases,
  };
  const suiteDigest = sha256(json(suite)); gate(inputBefore === inputDigest(MAP_KEY, tTactic, ctTactic, baselineRoster), "INPUT_MUTATED");
  gate(EXPECTED_SUITE_DIGEST !== "__CAPTURE_MANUALLY__", "SUITE_NOT_LOCKED", `candidate=${suiteDigest}`); gate(suiteDigest === EXPECTED_SUITE_DIGEST, "FOCUS_MEASUREMENT_REGRESSION", `expected=${EXPECTED_SUITE_DIGEST}\nactual=${suiteDigest}`);
  console.log("defuse coverage: " + JSON.stringify(defuseCoverage)); console.log("simulations: " + (FIXED_SEEDS.length * (1 + targets.length * 2) * 3)); console.log("suiteDigest: " + suiteDigest);
  console.log("historical checkpoint gate: R26 byte-exact source adapter PASS; no historical rebaseline");
  console.log("production source modified: no (memory transform only)"); console.log("claim boundary: Focus read-chain / local causal measurement only; no balance calibration or new gameplay claim"); console.log("CS Focus Measurement / Calibration Readiness R28: PASS");
}

main().catch((error) => { console.error("CS Focus Measurement / Calibration Readiness R28: FAIL " + (error?.stack || error)); process.exitCode = 1; });
