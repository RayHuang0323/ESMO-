#!/usr/bin/env node
// CS Combat Instrumentation R2
// Production FPS source stays untouched; all hooks are exact Vite memory transforms.

import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { csR10LegacySource } from "./cs_r10_legacy_source.mjs";
import { CS_R11_REPAIRED_SOURCE_SHA256, csR11R10Source } from "./cs_r11_legacy_source.mjs";
import { CS_R13_PLAYER_SMOKE_SOURCE_SHA256, csR13R12Source } from "./cs_r13_legacy_source.mjs";
import { CS_R19_SEMANTIC_SOURCE_SHA256, csR15EvidenceSources as csR14EvidenceSources } from "./cs_r15_legacy_source.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FPS_FILE = resolve(ROOT, "src/battle/fps/EsportsFPS3D.jsx");
const FPS_MODULE_ID = "/src/battle/fps/EsportsFPS3D.jsx";
const EVENT_SCHEMA = "CsCombatInstrumentation.v1";
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
const R10_ENGINE_SOURCE_SHA256 = "ba3305ea6cd92fe06df5ee3fd4eb3ca47e1385910672b1ec111f804da0859b8d";
const EXPECTED_RAND_CALLS = 21;
const EXPECTED_EVENT_ONLY_SUITE_V1 = "1b4b139c50e7fe646a5b307a36ca83de26094bbdd8f617661054a9d47d0c836f";

const SIGNATURE_MARKER = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster){";
const SIGNATURE_REPLACEMENT = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster,__measure=null){";
const FIRE_MARKER = "          if(rand()>=fireChance)continue;";
const FIRE_REPLACEMENT = [
  '          __measure?.record("combat_opportunity",{round:rnd+1,sec,tPlayerId:tp.id,cPlayerId:cp.id,tRole:tp.role,cRole:cp.role,distance:d,sniperInvolved,fireChance,pairCount:pairs.length,maxEngage,generalEngagements:done});',
  FIRE_MARKER,
].join("\n");
const PT_MARKER = "          const Pt=clamp(0.5+(tSk-cSk)*0.013+(MAP_EDGE[mapKey]??0.02)+ecoEdge+flashPen+tacEdge,0.07,0.93); // 結構平衡 + 戰術剋制";
const PT_REPLACEMENT = [
  PT_MARKER,
  '          __measure?.record("combat_trigger",{round:rnd+1,sec,tPlayerId:tp.id,cPlayerId:cp.id,tRole:tp.role,cRole:cp.role,distance:d,sniperInvolved,fireChance,tSkill:tSk,cSkill:cSk,pt:Pt,mapEdge:(MAP_EDGE[mapKey]??0.02),ecoEdge,flashPen,tacEdge,atLowerClamp:Pt===0.07,atUpperClamp:Pt===0.93});',
].join("\n");
const DAMAGE_MARKER = '          const hpBefore=df.hp,effectiveDamage=Math.min(dmg,hpBefore);\n          df.hp-=dmg;at.dmgDealt=(at.dmgDealt||0)+effectiveDamage;roundDmg[at.id]=(roundDmg[at.id]||0)+effectiveDamage;at.flash=3;df.flash=3;at.state="ENGAGE";df.state="ENGAGE";at.shooting=df.hp<=0?1:2;';
const DAMAGE_REPLACEMENT = [
  DAMAGE_MARKER,
  '          __measure?.record("combat_conversion",{round:rnd+1,sec,tPlayerId:tp.id,cPlayerId:cp.id,tWon:tw,attackerId:at.id,attackerSide:at.side,attackerRole:at.role,defenderId:df.id,defenderSide:df.side,defenderRole:df.role,pt:Pt,headshotChance:g.hs*(0.72+0.55*((at.stats?.acc||80)/100)),headshot:isHS,rolledDamage:dmg,hpBefore:df.hp+dmg,effectiveDamage:Math.min(dmg,df.hp+dmg),overkillDamage:Math.max(0,-df.hp),kill:df.hp<=0});',
].join("\n");
const RETURN_MARKER = "return { EsportsFPS3D, buildMatchResult };";
const RETURN_REPLACEMENT = "return { EsportsFPS3D, buildMatchResult, simulateFps, ROSTER, TACTICS_DB };";
const EXPORT_MARKER = "export { EsportsFPS3D, buildMatchResult };";
const EXPORT_REPLACEMENT = [
  "const __CS_INSTRUMENTATION_R2_TEST_API__ = Object.freeze({",
  "  simulateFps: __FPS3D_MODULE.simulateFps,",
  "  ROSTER: __FPS3D_MODULE.ROSTER,",
  "  TACTICS_DB: __FPS3D_MODULE.TACTICS_DB,",
  "});",
  "export { EsportsFPS3D, buildMatchResult, __CS_INSTRUMENTATION_R2_TEST_API__ };",
].join("\n");
const TRANSFORMS = Object.freeze([
  ["signature", SIGNATURE_MARKER, SIGNATURE_REPLACEMENT],
  ["fire", FIRE_MARKER, FIRE_REPLACEMENT],
  ["probability", PT_MARKER, PT_REPLACEMENT],
  ["conversion", DAMAGE_MARKER, DAMAGE_REPLACEMENT],
  ["return export", RETURN_MARKER, RETURN_REPLACEMENT],
  ["module export", EXPORT_MARKER, EXPORT_REPLACEMENT],
]);

function gate(ok, code, detail = "") {
  if (!ok) throw new Error("[" + code + "]" + (detail ? "\n" + detail : ""));
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
    gate(Number.isFinite(value), "NON_FINITE_NUMBER", "key=" + key + " value=" + String(value));
    return Object.is(value, -0) ? 0 : value;
  }
  gate(typeof value !== "undefined", "UNDEFINED_VALUE", "key=" + key);
  gate(typeof value === "object", "UNSUPPORTED_VALUE", "key=" + key + " type=" + typeof value);
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
    const digest = createHash("sha256").update(SEED_NAMESPACE + index).digest();
    return digest.readUInt32BE(0) || 1;
  });
}
function rngTokens(source) {
  return source.match(/\b(?:rand|Math\.random)\s*\(\s*\)/g) ?? [];
}
function randTokens(source) {
  return source.match(/\brand\s*\(\s*\)/g) ?? [];
}
function eventIdentity(event) {
  return [event.round, event.sec, event.tPlayerId, event.cPlayerId].join("|");
}
function createCollector() {
  const events = [];
  return {
    events,
    record(type, payload) {
      gate(["combat_opportunity", "combat_trigger", "combat_conversion"].includes(type),
        "UNKNOWN_EVENT_TYPE", "type=" + type);
      gate(payload && typeof payload === "object" && !Array.isArray(payload), "INVALID_EVENT_PAYLOAD");
      const event = { schema: EVENT_SCHEMA, type, ...payload };
      for (const [key, value] of Object.entries(event)) {
        gate(value === null || ["string", "number", "boolean"].includes(typeof value),
          "NON_PRIMITIVE_EVENT_FIELD", "type=" + type + " key=" + key);
      }
      events.push(Object.freeze(event));
    },
  };
}

function validateEvents(events, seed) {
  const opportunities = new Map();
  const triggers = new Map();
  const conversions = new Map();
  let targetOpportunities = 0;
  let targetConversions = 0;
  let kills = 0;
  let headshots = 0;
  let lowerClamps = 0;
  let upperClamps = 0;
  let overkillEvents = 0;
  let overkillDamage = 0;

  for (const event of events) {
    gate(event.schema === EVENT_SCHEMA, "EVENT_SCHEMA_MISMATCH", "seed=" + seed);
    const key = eventIdentity(event);
    gate(Number.isInteger(event.round) && event.round >= 1, "EVENT_ROUND", "seed=" + seed + " key=" + key);
    gate(Number.isFinite(event.sec) && event.sec >= 0, "EVENT_SEC", "seed=" + seed + " key=" + key);
    gate(typeof event.tPlayerId === "string" && typeof event.cPlayerId === "string",
      "EVENT_PLAYER_ID", "seed=" + seed + " key=" + key);
    if (event.type === "combat_opportunity") {
      gate(!opportunities.has(key), "DUPLICATE_OPPORTUNITY", "seed=" + seed + " key=" + key);
      gate(Number.isFinite(event.distance) && event.distance >= 0 && event.distance < 55,
        "OPPORTUNITY_DISTANCE", "seed=" + seed + " key=" + key + " distance=" + event.distance);
      gate(Number.isFinite(event.fireChance) && event.fireChance >= 0 && event.fireChance <= 1,
        "FIRE_CHANCE_RANGE", "seed=" + seed + " key=" + key + " chance=" + event.fireChance);
      gate(Number.isInteger(event.pairCount) && event.pairCount >= 1,
        "PAIR_COUNT", "seed=" + seed + " key=" + key);
      gate(Number.isInteger(event.maxEngage) && event.maxEngage >= 1,
        "MAX_ENGAGE", "seed=" + seed + " key=" + key);
      gate(Number.isInteger(event.generalEngagements) && event.generalEngagements >= 0,
        "GENERAL_ENGAGEMENTS", "seed=" + seed + " key=" + key);
      opportunities.set(key, event);
      if (event.tPlayerId === "t2") targetOpportunities += 1;
      continue;
    }
    if (event.type === "combat_trigger") {
      const opportunity = opportunities.get(key);
      gate(Boolean(opportunity), "TRIGGER_WITHOUT_OPPORTUNITY", "seed=" + seed + " key=" + key);
      gate(!triggers.has(key), "DUPLICATE_TRIGGER", "seed=" + seed + " key=" + key);
      gate(Object.is(event.fireChance, opportunity.fireChance),
        "TRIGGER_CHANCE_DRIFT", "seed=" + seed + " key=" + key);
      gate(Number.isFinite(event.tSkill) && Number.isFinite(event.cSkill),
        "SKILL_NON_FINITE", "seed=" + seed + " key=" + key);
      gate(Number.isFinite(event.pt) && event.pt >= 0.07 && event.pt <= 0.93,
        "DUEL_PROBABILITY_RANGE", "seed=" + seed + " key=" + key + " pt=" + event.pt);
      gate(event.atLowerClamp === (event.pt === 0.07),
        "LOWER_CLAMP_FLAG", "seed=" + seed + " key=" + key);
      gate(event.atUpperClamp === (event.pt === 0.93),
        "UPPER_CLAMP_FLAG", "seed=" + seed + " key=" + key);
      for (const field of ["mapEdge", "ecoEdge", "flashPen", "tacEdge"]) {
        gate(Number.isFinite(event[field]), "PROBABILITY_COMPONENT",
          "seed=" + seed + " key=" + key + " field=" + field);
      }
      if (event.atLowerClamp) lowerClamps += 1;
      if (event.atUpperClamp) upperClamps += 1;
      triggers.set(key, event);
      continue;
    }
    const trigger = triggers.get(key);
    gate(Boolean(trigger), "CONVERSION_WITHOUT_TRIGGER", "seed=" + seed + " key=" + key);
    gate(!conversions.has(key), "DUPLICATE_CONVERSION", "seed=" + seed + " key=" + key);
    gate(Object.is(event.pt, trigger.pt), "CONVERSION_PT_DRIFT", "seed=" + seed + " key=" + key);
    gate(Number.isFinite(event.headshotChance) && event.headshotChance >= 0 && event.headshotChance <= 1,
      "HEADSHOT_CHANCE_RANGE", "seed=" + seed + " key=" + key + " chance=" + event.headshotChance);
    gate(Number.isInteger(event.rolledDamage) && event.rolledDamage > 0,
      "ROLLED_DAMAGE", "seed=" + seed + " key=" + key + " damage=" + event.rolledDamage);
    gate(Number.isInteger(event.hpBefore) && event.hpBefore > 0,
      "HP_BEFORE", "seed=" + seed + " key=" + key + " hp=" + event.hpBefore);
    const expectedEffective = Math.min(event.rolledDamage, event.hpBefore);
    const expectedOverkill = Math.max(0, event.rolledDamage - event.hpBefore);
    gate(event.effectiveDamage === expectedEffective, "EFFECTIVE_DAMAGE", "seed=" + seed + " key=" + key);
    gate(event.overkillDamage === expectedOverkill, "OVERKILL_DAMAGE", "seed=" + seed + " key=" + key);
    gate(event.kill === (event.rolledDamage >= event.hpBefore), "KILL_CONVERSION", "seed=" + seed + " key=" + key);
    if (event.kill) kills += 1;
    if (event.headshot) headshots += 1;
    if (event.overkillDamage > 0) {
      overkillEvents += 1;
      overkillDamage += event.overkillDamage;
    }
    if (event.tPlayerId === "t2") targetConversions += 1;
    conversions.set(key, event);
  }
  gate(opportunities.size > 0, "NO_COMBAT_OPPORTUNITIES", "seed=" + seed);
  gate(triggers.size > 0, "NO_COMBAT_TRIGGERS", "seed=" + seed);
  gate(opportunities.size >= triggers.size, "TRIGGERS_EXCEED_OPPORTUNITIES", "seed=" + seed);
  gate(triggers.size === conversions.size, "TRIGGER_CONVERSION_MISMATCH",
    "seed=" + seed + " triggers=" + triggers.size + " conversions=" + conversions.size);
  return {
    opportunities: opportunities.size,
    triggers: triggers.size,
    conversions: conversions.size,
    kills,
    headshots,
    lowerClamps,
    upperClamps,
    overkillEvents,
    overkillDamage,
    targetOpportunities,
    targetConversions,
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
    "No update, rebaseline, seed, or calibration flags are supported.");
  const originalSource = readFileSync(FPS_FILE, "utf8");
  const sourceSha256 = sha256(originalSource);
  const r14Sources = csR14EvidenceSources(originalSource);
  gate(r14Sources || [CAPTURED_ENGINE_SOURCE_SHA256, R10_ENGINE_SOURCE_SHA256, CS_R11_REPAIRED_SOURCE_SHA256,
    CS_R13_PLAYER_SMOKE_SOURCE_SHA256, CS_R19_SEMANTIC_SOURCE_SHA256].includes(sourceSha256), "SOURCE_PROVENANCE_MISMATCH",
  "expected=" + CAPTURED_ENGINE_SOURCE_SHA256 + ", " + R10_ENGINE_SOURCE_SHA256 + ", "
    + CS_R11_REPAIRED_SOURCE_SHA256 + ", " + CS_R13_PLAYER_SMOKE_SOURCE_SHA256 + ", or " + CS_R19_SEMANTIC_SOURCE_SHA256 + "\nactual=" + sourceSha256);
  const r12Source = r14Sources?.r12 ?? (sourceSha256 === CS_R13_PLAYER_SMOKE_SOURCE_SHA256
    ? csR13R12Source(originalSource) : originalSource);
  if (sourceSha256 === CS_R13_PLAYER_SMOKE_SOURCE_SHA256) {
    gate(sha256(r12Source) === CS_R11_REPAIRED_SOURCE_SHA256, "R13_R12_ADAPTER_MISMATCH");
  }
  const r12SourceSha256 = sha256(r12Source);
  const r10Source = r14Sources?.r10 ?? (r12SourceSha256 === CS_R11_REPAIRED_SOURCE_SHA256
    ? csR11R10Source(r12Source) : r12Source);
  const historicalSource = r14Sources?.r8 ?? ([R10_ENGINE_SOURCE_SHA256, CS_R11_REPAIRED_SOURCE_SHA256].includes(r12SourceSha256)
    ? csR10LegacySource(r10Source) : r12Source);
  for (const [name, marker] of TRANSFORMS) {
    gate(occurrences(historicalSource, marker) === 1, "MARKER_COUNT", "name=" + name);
  }
  const originalRandTokens = randTokens(historicalSource);
  const originalRngTokens = rngTokens(historicalSource);
  gate(originalRandTokens.length === EXPECTED_RAND_CALLS, "RAND_CALL_COUNT",
    "expected=" + EXPECTED_RAND_CALLS + " actual=" + originalRandTokens.length);
  const regenerated = generatedSeeds();
  gate(canonicalJson(regenerated) === canonicalJson(FIXED_SEEDS), "SEED_GENERATION_MISMATCH");
  const seedSetSha256 = sha256(canonicalJson(FIXED_SEEDS));
  gate(seedSetSha256 === EXPECTED_SEED_SET_SHA256, "SEED_SET_HASH_MISMATCH");
  console.log("instrumentation schema: " + EVENT_SCHEMA);
  console.log("seed generation version: " + SEED_GENERATION_VERSION);
  console.log("seeds: " + JSON.stringify(FIXED_SEEDS));
  console.log("seedSetSha256: " + seedSetSha256);
  console.log("engineSourceSha256: " + sourceSha256);
  console.log("rand() call sites: " + originalRandTokens.length);

  let transformSeen = 0;
  let transformRestoredExactly = false;
  let transformedRngTokensMatch = false;
  const tempRoot = mkdtempSync(join(tmpdir(), "esmo-cs-instrument-r2-"));
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
        name: "cs-instrumentation-r2-memory-hooks",
        enforce: "pre",
        transform(code, id) {
          const cleanId = resolve(id.split("?")[0]).toLowerCase();
          if (cleanId !== FPS_FILE.toLowerCase()) return null;
          transformSeen += 1;
          gate(code === originalSource, "VITE_SOURCE_MISMATCH");
          let transformed = historicalSource;
          for (const [name, marker, replacement] of TRANSFORMS) {
            gate(occurrences(transformed, marker) === 1, "TRANSFORM_MARKER_COUNT", "name=" + name);
            transformed = transformed.replace(marker, replacement);
          }
          let restored = transformed;
          for (const [name, marker, replacement] of [...TRANSFORMS].reverse()) {
            gate(occurrences(restored, replacement) === 1, "REPLACEMENT_COUNT", "name=" + name);
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
    gate(transformSeen === 1, "TRANSFORM_EXECUTION_COUNT", "actual=" + transformSeen);
    gate(transformRestoredExactly, "TRANSFORM_INTEGRITY");
    gate(transformedRngTokensMatch, "RNG_TOKEN_INTEGRITY");
    const api = loaded.__CS_INSTRUMENTATION_R2_TEST_API__;
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
    gate(roster.some((player) =>
      player.id === "t2" && player.role === "rifler" && player.stats?.acc === 88),
    "TARGET_RIFLER_MISSING");
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
        "seed=" + seed + "\noff=" + sha256(offJson) +
        "\non1=" + sha256(on1Json) + "\non2=" + sha256(on2Json));
      const eventJson1 = canonicalJson(collector1.events);
      const eventJson2 = canonicalJson(collector2.events);
      gate(eventJson1 === eventJson2, "INSTRUMENTATION_NON_DETERMINISTIC",
        "seed=" + seed + "\non1=" + sha256(eventJson1) + "\non2=" + sha256(eventJson2));
      const counts = validateEvents(collector1.events, seed);
      addCounts(totals, counts);
      suite.push({
        seed,
        strictSimDigest: sha256(offJson),
        eventDigest: sha256(eventJson1),
        counts,
      });
    }
    const inputAfter = sha256(canonicalJson({ mapKey, tTactic, ctTactic, roster }));
    gate(inputBefore === inputAfter, "SIM_MUTATED_INPUT");
    gate(totals.targetOpportunities > 0, "TARGET_HAS_NO_OPPORTUNITY");
    gate(totals.targetConversions > 0, "TARGET_HAS_NO_CONVERSION");
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
      opportunities: totals.opportunities,
      triggers: totals.triggers,
      triggerRatePct: percent(totals.triggers, totals.opportunities),
      conversions: totals.conversions,
      kills: totals.kills,
      killConversionPct: percent(totals.kills, totals.conversions),
      headshots: totals.headshots,
      headshotResultPct: percent(totals.headshots, totals.conversions),
      lowerClamps: totals.lowerClamps,
      upperClamps: totals.upperClamps,
      overkillEvents: totals.overkillEvents,
      overkillDamage: totals.overkillDamage,
      targetT2Opportunities: totals.targetOpportunities,
      targetT2Conversions: totals.targetConversions,
    };
    console.log("eventSuiteDigest: " + suiteDigest);
    console.log("eventOnlySuiteDigest: " + eventOnlySuiteDigest);
    console.log("combat summary: " + JSON.stringify(summary));
    console.log("formal baseline: protected by separate cs_measure_r1 segment");
    console.log("statistics: not computed (no p-value; no significance gate)");
    gate(EXPECTED_EVENT_ONLY_SUITE_V1 !== "__CAPTURE_MANUALLY__", "EVENT_ONLY_SUITE_NOT_LOCKED",
      "candidate=" + eventOnlySuiteDigest);
    gate(eventOnlySuiteDigest === EXPECTED_EVENT_ONLY_SUITE_V1, "COMBAT_EVENT_STREAM_REGRESSION",
      "expected=" + EXPECTED_EVENT_ONLY_SUITE_V1 + "\nactual=" + eventOnlySuiteDigest);
    console.log("CS Instrumentation R2: PASS");
  } finally {
    if (vite) await vite.close();
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
