#!/usr/bin/env node
// R25: Accuracy product semantics and minimal raw/effective headshot correction.
// Production behavior is loaded through exact, reversible Vite memory hooks.

import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import {
  CS_R19_SEMANTIC_SOURCE_SHA256,
  CS_R25_ACCURACY_SOURCE_SHA256,
  CS_R27_DECISION_SOURCE_SHA256,
  csR25R24Source,
  csR27R26Source,
} from "./cs_r15_legacy_source.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FPS_FILE = resolve(ROOT, "src/battle/fps/EsportsFPS3D.jsx");
const FPS_MODULE_ID = "/src/battle/fps/EsportsFPS3D.jsx";
const PLAYER_MODEL_FILE = resolve(ROOT, "src/data/playerModel.js");
const PREP_FILE = resolve(ROOT, "src/battle/fps/csPrepData.js");
const EVENT_SCHEMA = "CsAccuracySemanticAuditEvent.v1";
const SUITE_SCHEMA = "CsAccuracySemanticAuditSuite.v1";
const EXPECTED_SUITE_DIGEST = "26ef0739e8ec2c110aeba4ad063727770dad4886d45df70a041e21dcf17892c8";
const FIXED_SEEDS = Object.freeze([
  3978742910, 4200255727, 541349949, 1011896540,
  44863398, 1878380147, 638784133, 2852978760,
  1789562418, 3820910912, 3991584863, 2186970694,
  951543597, 2082574495, 474649321, 3950420867,
]);
const MAP_KEY = "inferno";
const T_TACTIC_ID = "t_aexec";
const CT_TACTIC_ID = "c_std";
const EXPECTED_RAND_CALLS = 21;

const SIGNATURE_MARKER = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster){";
const SIGNATURE_REPLACEMENT = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster,__measure=null){";
const EXCHANGE_MARKER = "          const tw=rand()<Pt;const at=tw?tp:cp,df=tw?cp:tp;";
const EXCHANGE_REPLACEMENT = [
  EXCHANGE_MARKER,
  '          __measure?.record("combat_exchange",{round:rnd+1,sec,attackerId:at.id,attackerSide:at.side,defenderId:df.id,defenderSide:df.side,weapon:at.gun});',
].join("\n");
const R24_HEADSHOT_MARKER = "          const g=GUNS[at.gun];const isHS=rand()<g.hs*(0.72+0.55*((at.stats?.acc||80)/100));let dmg=(g.dmg+Math.floor(rand()*40))*(isHS?2:1);";
const R25_HEADSHOT_MARKER = "          const g=GUNS[at.gun],rawAccuracy=at.stats?.acc||80,effectiveAccuracy=at.stats?.acc!=null?persStat(at,\"acc\"):rawAccuracy;const isHS=rand()<g.hs*(0.72+0.55*(effectiveAccuracy/100));let dmg=(g.dmg+Math.floor(rand()*40))*(isHS?2:1);";
const R24_HEADSHOT_REPLACEMENT = '          const g=GUNS[at.gun],rawAccuracy=at.stats?.acc||80,effectiveAccuracy=at.stats?.acc?persStat(at,"acc"):rawAccuracy;const __r25RawChance=g.hs*(0.72+0.55*(rawAccuracy/100)),__r25EffectiveChance=g.hs*(0.72+0.55*(effectiveAccuracy/100)),__r25HeadshotChance=__r25RawChance,__r25HeadshotRoll=rand();const isHS=__r25HeadshotRoll<__r25HeadshotChance;__measure?.record("headshot_roll",{round:rnd+1,sec,attackerId:at.id,attackerSide:at.side,defenderId:df.id,defenderSide:df.side,role:at.role,personality:at.personality,weapon:at.gun,baseHeadshotRate:g.hs,rawAccuracy,effectiveAccuracy,rawChance:__r25RawChance,effectiveChance:__r25EffectiveChance,headshotChance:__r25HeadshotChance,headshotRoll:__r25HeadshotRoll,isHS});let dmg=(g.dmg+Math.floor(rand()*40))*(isHS?2:1);';
const R25_HEADSHOT_REPLACEMENT = '          const g=GUNS[at.gun],rawAccuracy=at.stats?.acc||80,effectiveAccuracy=at.stats?.acc?persStat(at,"acc"):rawAccuracy;const __r25RawChance=g.hs*(0.72+0.55*(rawAccuracy/100)),__r25EffectiveChance=g.hs*(0.72+0.55*(effectiveAccuracy/100)),__r25HeadshotChance=__r25EffectiveChance,__r25HeadshotRoll=rand();const isHS=__r25HeadshotRoll<__r25HeadshotChance;__measure?.record("headshot_roll",{round:rnd+1,sec,attackerId:at.id,attackerSide:at.side,defenderId:df.id,defenderSide:df.side,role:at.role,personality:at.personality,weapon:at.gun,baseHeadshotRate:g.hs,rawAccuracy,effectiveAccuracy,rawChance:__r25RawChance,effectiveChance:__r25EffectiveChance,headshotChance:__r25HeadshotChance,headshotRoll:__r25HeadshotRoll,isHS});let dmg=(g.dmg+Math.floor(rand()*40))*(isHS?2:1);';
const FIRE_DAMAGE_MARKER = "          const {killed}=applyDamage(at,df,dmg);";
const FIRE_DAMAGE_REPLACEMENT = '          const {killed}=applyDamage(at,df,dmg);__measure?.record("firearm_damage",{round:rnd+1,sec,attackerId:at.id,attackerSide:at.side,defenderId:df.id,defenderSide:df.side,weapon:at.gun,rawDamage:dmg,killed});';
const RETURN_MARKER = "return { EsportsFPS3D, buildMatchResult };";
const RETURN_REPLACEMENT = "return { EsportsFPS3D, buildMatchResult, simulateFps, ROSTER, TACTICS_DB };";
const EXPORT_MARKER = "export { EsportsFPS3D, buildMatchResult };";
const EXPORT_REPLACEMENT = [
  "const __CS_ACCURACY_R25_TEST_API__ = Object.freeze({",
  "  simulateFps: __FPS3D_MODULE.simulateFps,",
  "  ROSTER: __FPS3D_MODULE.ROSTER,",
  "  TACTICS_DB: __FPS3D_MODULE.TACTICS_DB,",
  "});",
  "export { EsportsFPS3D, buildMatchResult, __CS_ACCURACY_R25_TEST_API__ };",
].join("\n");

function gate(ok, code, detail = "") {
  if (!ok) throw new Error(`[${code}]${detail ? `\n${detail}` : ""}`);
}
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function json(value) { return JSON.stringify(value); }
function occurrences(text, needle) { return text.split(needle).length - 1; }
function randTokens(source) { return source.match(/\brand\s*\(\s*\)/g) || []; }
function close(a, b) { return Math.abs(a - b) <= 1e-12; }
function clamp(value, lo, hi) { return Math.max(lo, Math.min(hi, value)); }
function clone(value) { return structuredClone(value); }
function freeze(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value); Object.freeze(value);
  for (const child of Object.values(value)) freeze(child, seen);
  return value;
}

function transformsFor(view) {
  const headshot = view === "live"
    ? ["effective Accuracy headshot", R25_HEADSHOT_MARKER, R25_HEADSHOT_REPLACEMENT]
    : ["raw Accuracy headshot", R24_HEADSHOT_MARKER, R24_HEADSHOT_REPLACEMENT];
  return Object.freeze([
    ["simulate signature", SIGNATURE_MARKER, SIGNATURE_REPLACEMENT],
    ["combat exchange", EXCHANGE_MARKER, EXCHANGE_REPLACEMENT],
    headshot,
    ["firearm damage", FIRE_DAMAGE_MARKER, FIRE_DAMAGE_REPLACEMENT],
    ["module return", RETURN_MARKER, RETURN_REPLACEMENT],
    ["module export", EXPORT_MARKER, EXPORT_REPLACEMENT],
  ]);
}

async function loadApi(liveSource, evidenceSource, view) {
  const transforms = transformsFor(view);
  let transformSeen = 0, restored = false, rngSame = false, vite = null;
  const tempRoot = mkdtempSync(join(tmpdir(), `esmo-cs-accuracy-r25-${view}-`));
  try {
    vite = await createServer({
      root: ROOT, configFile: false, envFile: false, appType: "custom", logLevel: "error",
      cacheDir: join(tempRoot, "vite-cache"), optimizeDeps: { noDiscovery: true, include: [] },
      server: { middlewareMode: true }, plugins: [{
        name: `cs-accuracy-r25-${view}-memory-hooks`, enforce: "pre", transform(code, id) {
          if (resolve(id.split("?")[0]).toLowerCase() !== FPS_FILE.toLowerCase()) return null;
          transformSeen += 1; gate(code === liveSource, "VITE_SOURCE_MISMATCH", view);
          let transformed = evidenceSource;
          for (const [name, marker, replacement] of transforms) {
            gate(occurrences(transformed, marker) === 1, "TRANSFORM_MARKER_COUNT", `${view}:${name}`);
            transformed = transformed.replace(marker, replacement);
          }
          let roundTrip = transformed;
          for (const [name, marker, replacement] of [...transforms].reverse()) {
            gate(occurrences(roundTrip, replacement) === 1, "TRANSFORM_REPLACEMENT_COUNT", `${view}:${name}`);
            roundTrip = roundTrip.replace(replacement, marker);
          }
          restored = roundTrip === evidenceSource;
          rngSame = json(randTokens(transformed)) === json(randTokens(evidenceSource));
          gate(restored, "TRANSFORM_NOT_REVERSIBLE", view);
          gate(rngSame, "RNG_TOKEN_SEQUENCE_CHANGED", view);
          return { code: transformed, map: null };
        },
      }],
    });
    const module = await vite.ssrLoadModule(`${FPS_MODULE_ID}?r25=${view}-${Date.now()}`);
    gate(transformSeen === 1 && restored && rngSame, "TRANSFORM_LOAD_GATE", view);
    return module.__CS_ACCURACY_R25_TEST_API__;
  } finally {
    if (vite) await vite.close();
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function collector() {
  const events = [];
  return { events, record(type, payload) { events.push({ type, ...payload }); } };
}

function runArm(api, args, view) {
  const before = sha256(json(args));
  const first = collector(), second = collector();
  const off = api.simulateFps(args.mapKey, args.tTactic, args.ctTactic, args.seed, args.roster);
  const on1 = api.simulateFps(args.mapKey, args.tTactic, args.ctTactic, args.seed, args.roster, first);
  const on2 = api.simulateFps(args.mapKey, args.tTactic, args.ctTactic, args.seed, args.roster, second);
  gate(json(off) === json(on1) && json(on1) === json(on2), "INSTRUMENTATION_CHANGED_SIM", `${view}:${args.seed}`);
  gate(json(first.events) === json(second.events), "AUDIT_NON_DETERMINISTIC", `${view}:${args.seed}`);
  gate(before === sha256(json(args)), "SIM_MUTATED_INPUT", `${view}:${args.seed}`);
  return { sim: on1, events: first.events };
}

function expectedEffective(player) {
  const raw = Number(player.stats?.acc || 80);
  const delta = player.personality === "grinder" ? 6 : player.personality === "shotcaller" ? -4 : 0;
  return clamp(raw + delta, 1, 99);
}

function validateTrace(arm, roster, view, seed) {
  gate(arm.events.length > 0 && arm.events.length % 3 === 0, "EVENT_TRIPLE_SHAPE", `${view}:${seed}:${arm.events.length}`);
  const byId = new Map(roster.map((player) => [player.id, player]));
  const headshots = [];
  for (let index = 0; index < arm.events.length; index += 3) {
    const exchange = arm.events[index], headshot = arm.events[index + 1], damage = arm.events[index + 2];
    gate(exchange.type === "combat_exchange" && headshot.type === "headshot_roll" && damage.type === "firearm_damage", "NO_MISS_CHAIN_ORDER", `${view}:${seed}:${index}`);
    const identity = (event) => json([event.round, event.sec, event.attackerId, event.attackerSide, event.defenderId, event.defenderSide, event.weapon]);
    gate(identity(exchange) === identity(headshot) && identity(headshot) === identity(damage), "NO_MISS_CHAIN_ATTRIBUTION", `${view}:${seed}:${index}`);
    const player = byId.get(headshot.attackerId);
    gate(player && player.role === headshot.role && player.personality === headshot.personality, "HEADSHOT_ATTACKER_ATTRIBUTION", `${view}:${seed}:${headshot.attackerId}`);
    const raw = Number(player.stats?.acc || 80), effective = expectedEffective(player);
    const rawChance = headshot.baseHeadshotRate * (0.72 + 0.55 * (raw / 100));
    const effectiveChance = headshot.baseHeadshotRate * (0.72 + 0.55 * (effective / 100));
    const expectedChance = view === "live" ? effectiveChance : rawChance;
    gate(headshot.rawAccuracy === raw && headshot.effectiveAccuracy === effective, "RAW_EFFECTIVE_ACCURACY", `${view}:${seed}:${player.id}`);
    gate(close(headshot.rawChance, rawChance) && close(headshot.effectiveChance, effectiveChance) && close(headshot.headshotChance, expectedChance), "HEADSHOT_CHANCE_FORMULA", `${view}:${seed}:${player.id}`);
    gate(headshot.isHS === (headshot.headshotRoll < headshot.headshotChance), "HEADSHOT_DECISION", `${view}:${seed}:${player.id}`);
    headshots.push(headshot);
  }
  return headshots;
}

function contextOf(event) {
  return [event.round, event.sec, event.attackerId, event.attackerSide, event.defenderId, event.defenderSide,
    event.role, event.personality, event.weapon, event.baseHeadshotRate, event.rawAccuracy,
    event.effectiveAccuracy, event.headshotRoll];
}

function compareViews(liveArm, historicalArm, liveHeadshots, historicalHeadshots, seed) {
  const limit = Math.min(liveHeadshots.length, historicalHeadshots.length);
  let boundary = null;
  for (let index = 0; index < limit; index += 1) {
    const live = liveHeadshots[index], historical = historicalHeadshots[index];
    gate(json(contextOf(live)) === json(contextOf(historical)), "PRE_BOUNDARY_CONTEXT_DRIFT", `${seed}:${index}`);
    if (live.isHS !== historical.isHS) {
      const direction = live.effectiveAccuracy > live.rawAccuracy ? "effective-gain" : "effective-penalty";
      gate((direction === "effective-gain" && live.isHS && !historical.isHS)
        || (direction === "effective-penalty" && !live.isHS && historical.isHS), "SEMANTIC_DIRECTION", `${seed}:${index}`);
      boundary = Object.freeze({ index, attackerId: live.attackerId, personality: live.personality, direction });
      break;
    }
  }
  if (!boundary) {
    gate(liveHeadshots.length === historicalHeadshots.length, "ZERO_BOUNDARY_EVENT_COUNT", String(seed));
    gate(json(liveArm.sim) === json(historicalArm.sim), "ZERO_BOUNDARY_SIM_DRIFT", String(seed));
  } else {
    gate(json(liveArm.sim) !== json(historicalArm.sim), "BOUNDARY_WITHOUT_SIM_EFFECT", String(seed));
  }
  return boundary;
}

function verifyStaticSemantics(liveSource, historicalSource) {
  gate(sha256(liveSource) === CS_R25_ACCURACY_SOURCE_SHA256, "LIVE_SOURCE_SHA256", sha256(liveSource));
  gate(sha256(historicalSource) === CS_R19_SEMANTIC_SOURCE_SHA256, "R24_VIEW_SHA256", sha256(historicalSource));
  gate(randTokens(liveSource).length === EXPECTED_RAND_CALLS, "RAND_CALL_COUNT", String(randTokens(liveSource).length));
  gate(json(randTokens(liveSource)) === json(randTokens(historicalSource)), "RNG_CALL_SITE_MIGRATION");
  const liveLines = liveSource.split("\n"), historicalLines = historicalSource.split("\n");
  gate(liveLines.length === historicalLines.length, "SOURCE_LINE_COUNT");
  const changedLines = liveLines.map((line, index) => line === historicalLines[index] ? null : index + 1).filter(Boolean);
  gate(json(changedLines) === json([550]), "MINIMAL_PATCH_LINES", json(changedLines));
  gate(occurrences(liveSource, R25_HEADSHOT_MARKER) === 1 && occurrences(liveSource, R24_HEADSHOT_MARKER) === 0, "EFFECTIVE_HEADSHOT_SOURCE_GATE");
  gate(liveSource.includes('const S=k=>k==="rxn"?effectiveReflex:persStat(p,k);') && liveSource.includes('S("acc")'), "EFFECTIVE_COMBAT_SKILL_GATE");
  const posSkill = liveSource.slice(liveSource.indexOf("function posSkill"), liveSource.indexOf("// 對槍實力"));
  gate(posSkill.includes("(s[k]||50)") && !posSkill.includes("persStat"), "RAW_ROLE_FIT_GATE");
  gate(liveSource.includes('grinder:   {') && liveSource.includes('boost:["acc","foc"]')
    && liveSource.includes('shotcaller:{') && liveSource.includes('nerf:["acc","apm"]'), "PERSONALITY_ACCURACY_GATE");
  const exchangeAt = liveSource.indexOf(EXCHANGE_MARKER), headshotAt = liveSource.indexOf(R25_HEADSHOT_MARKER);
  const damageAt = liveSource.indexOf(FIRE_DAMAGE_MARKER), tracerAt = liveSource.indexOf("hit:true", damageAt);
  gate(exchangeAt >= 0 && exchangeAt < headshotAt && headshotAt < damageAt && damageAt < tracerAt, "NO_MISS_PIPELINE_GATE");

  const playerModel = readFileSync(PLAYER_MODEL_FILE, "utf8"), prep = readFileSync(PREP_FILE, "utf8");
  gate(playerModel.includes('{ key: "accuracy",     zh: "精準度",   cat: "操作" }'), "PRODUCT_LABEL_GATE");
  gate(playerModel.includes('accuracy: 1.4') && playerModel.includes('name: "精準射擊訓練"')
    && playerModel.includes('stats: ["accuracy", "reflex"]'), "PRODUCT_TRAINING_GATE");
  gate(playerModel.includes('"FPS步槍手":  { key: ["accuracy"')
    && playerModel.includes('"FPS狙擊手":  { key: ["accuracy"'), "PRODUCT_ROLE_GATE");
  gate(prep.includes('name: "狙擊架點"') && prep.includes('boost: ["accuracy", "focus"]')
    && prep.includes('favors: ["accuracy", "clutch"]'), "PRODUCT_SCENARIO_GATE");
  return changedLines;
}

async function main() {
  gate(process.argv.slice(2).length === 0, "CLI_FLAGS_FORBIDDEN");
  const currentSource = readFileSync(FPS_FILE, "utf8");
  gate(sha256(currentSource) === CS_R27_DECISION_SOURCE_SHA256, "CURRENT_SOURCE_SHA256", sha256(currentSource));
  const liveSource = csR27R26Source(currentSource), historicalSource = csR25R24Source(currentSource);
  const changedLines = verifyStaticSemantics(liveSource, historicalSource);
  const liveApi = await loadApi(currentSource, liveSource, "live");
  const historicalApi = await loadApi(currentSource, historicalSource, "historical");
  for (const api of [liveApi, historicalApi]) {
    gate(typeof api?.simulateFps === "function" && Array.isArray(api?.ROSTER) && api?.TACTICS_DB, "TEST_API_SHAPE");
  }
  const map = liveApi.TACTICS_DB[MAP_KEY];
  const tTactic = freeze(clone(map?.t?.find((item) => item.id === T_TACTIC_ID)));
  const ctTactic = freeze(clone(map?.ct?.find((item) => item.id === CT_TACTIC_ID)));
  const roster = freeze(clone(liveApi.ROSTER));
  gate(tTactic?.id === T_TACTIC_ID && ctTactic?.id === CT_TACTIC_ID && roster.length === 10, "SCENARIO_SHAPE");

  const rows = [], coverage = { grinder: 0, shotcaller: 0, neutral: 0, gainBoundaries: 0, penaltyBoundaries: 0 };
  for (const seed of FIXED_SEEDS) {
    const args = { mapKey: MAP_KEY, tTactic, ctTactic, seed, roster };
    const liveArm = runArm(liveApi, args, "live"), historicalArm = runArm(historicalApi, args, "historical");
    const liveHeadshots = validateTrace(liveArm, roster, "live", seed);
    const historicalHeadshots = validateTrace(historicalArm, roster, "historical", seed);
    for (const event of liveHeadshots) {
      if (event.personality === "grinder") coverage.grinder += 1;
      else if (event.personality === "shotcaller") coverage.shotcaller += 1;
      else coverage.neutral += 1;
      if (!["grinder", "shotcaller"].includes(event.personality)) gate(close(event.rawChance, event.effectiveChance), "NEUTRAL_PERSONALITY_CONTROL", `${seed}:${event.attackerId}`);
    }
    const boundary = compareViews(liveArm, historicalArm, liveHeadshots, historicalHeadshots, seed);
    if (boundary?.direction === "effective-gain") coverage.gainBoundaries += 1;
    if (boundary?.direction === "effective-penalty") coverage.penaltyBoundaries += 1;
    rows.push({
      seed, liveHeadshots: liveHeadshots.length, historicalHeadshots: historicalHeadshots.length,
      boundary, liveSimDigest: sha256(json(liveArm.sim)), historicalSimDigest: sha256(json(historicalArm.sim)),
      liveEventDigest: sha256(json(liveArm.events)), historicalEventDigest: sha256(json(historicalArm.events)),
    });
  }
  gate(coverage.grinder > 0 && coverage.shotcaller > 0 && coverage.neutral > 0, "PERSONALITY_COVERAGE", json(coverage));
  gate(coverage.gainBoundaries > 0 && coverage.penaltyBoundaries > 0, "DIRECTIONAL_BOUNDARY_COVERAGE", json(coverage));
  const suite = {
    schema: SUITE_SCHEMA, eventSchema: EVENT_SCHEMA,
    liveSourceSha256: CS_R25_ACCURACY_SOURCE_SHA256, historicalSourceSha256: CS_R19_SEMANTIC_SOURCE_SHA256,
    changedLines, rngCallSites: EXPECTED_RAND_CALLS,
    semanticBoundary: { raw: "stable roster input and role-fit aptitude", effective: "personality-adjusted live combat execution", hitMiss: "not implemented" },
    scenario: { mapKey: MAP_KEY, tTacticId: T_TACTIC_ID, ctTacticId: CT_TACTIC_ID },
    seeds: FIXED_SEEDS, coverage, rows,
  };
  const suiteDigest = sha256(json(suite));
  console.log(`schema: ${SUITE_SCHEMA}`);
  console.log(`liveSourceSha256: ${CS_R25_ACCURACY_SOURCE_SHA256}`);
  console.log(`historicalSourceSha256: ${CS_R19_SEMANTIC_SOURCE_SHA256}`);
  console.log(`minimal patch lines: ${changedLines.join(",")}`);
  console.log(`rand() call sites: ${EXPECTED_RAND_CALLS}`);
  console.log(`simulations: ${FIXED_SEEDS.length * 2 * 3}`);
  console.log(`coverage: ${json(coverage)}`);
  console.log(`suiteDigest: ${suiteDigest}`);
  gate(suiteDigest === EXPECTED_SUITE_DIGEST, "SUITE_DIGEST", `expected=${EXPECTED_SUITE_DIGEST} actual=${suiteDigest}`);
  console.log("claim boundary: Accuracy semantics/minimal headshot correction only; no balance calibration or miss system");
  console.log("CS Accuracy Semantic Audit / Minimal Correction R25: PASS");
}

main().catch((error) => {
  console.error(`CS Accuracy Semantic Audit / Minimal Correction R25: FAIL ${error?.stack || error}`);
  process.exitCode = 1;
});
