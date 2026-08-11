#!/usr/bin/env node
// CS Bomb Result Semantics Repair R11
//
// Proves that `how:"bomb"` means a real C4 timer explosion only. The paired
// memory variants must be identical outside round-history `how` annotations,
// including every RNG value and all gameplay state.

import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import {
  CS_R10_SOURCE_SHA256,
  CS_R11_REPAIRED_SOURCE_SHA256,
} from "./cs_r11_legacy_source.mjs";
import { CS_R13_PLAYER_SMOKE_SOURCE_SHA256, csR13R12Source } from "./cs_r13_legacy_source.mjs";
import { csR15EvidenceSources as csR14EvidenceSources } from "./cs_r15_legacy_source.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FPS_FILE = resolve(ROOT, "src/battle/fps/EsportsFPS3D.jsx");
const FPS_MODULE_ID = "/src/battle/fps/EsportsFPS3D.jsx";
const CONTRACT_FILE = resolve(ROOT, "src/platform/contracts/CsMatchResult.js");
const RESULT_UI_FILE = resolve(ROOT, "src/screens/fps/CsResultScreen.jsx");

const EVIDENCE_SCHEMA = "CsBombResultSemantics.v1";
const SEED_GENERATION_VERSION = "CsMeasurementSeedSet.v1";
const SEED_NAMESPACE = "ESMO:CsMeasurementPilot.v1:";
const FIXED_SEEDS = Object.freeze([
  3978742910, 4200255727, 541349949, 1011896540,
  44863398, 1878380147, 638784133, 2852978760,
  1789562418, 3820910912, 3991584863, 2186970694,
  951543597, 2082574495, 474649321, 3950420867,
]);
const EXPECTED_SEED_SET_SHA256 = "52414f0e6b09ba72b9223b5e76b6ad9d859e8b8ea6fe77dcc2a2a08876a74c6d";
const EXPECTED_RAND_CALLS = 21;
const EXPECTED_SEMANTICS_SUITE_SHA256 = "64a16a36092976b2e433fa5e276e03f2987ec35508b658bf5ec17c41b032ed28";

const SIGNATURE_MARKER = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster){";
const SIGNATURE_REPLACEMENT = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster,__measure=null){";
const RNG_MARKER = "const map=MAPS[mapKey];const rand=mkRng(seed);";
const RNG_REPLACEMENT = "const map=MAPS[mapKey];const __r11RawRand=mkRng(seed);let __r11RngCount=0;const rand=()=>{const value=__r11RawRand();__r11RngCount++;__measure?.recordRng(__r11RngCount,value);return value;};";
const R10_RESULT_MARKER = [
  "      if(!roundEnd){",
  '        if(aliveT.length===0&&!planted)roundEnd={winner:"ct",how:"elim"};',
  '        else if(aliveCT.length===0)roundEnd={winner:"t",how:planted?"bomb":"elim"};',
  '        else if(sec>=114)roundEnd={winner:planted?"t":"ct",how:planted?"bomb":"time"};',
  "      }",
].join("\n");
const R11_RESULT_MARKER = [
  "      if(!roundEnd){",
  '        if(aliveT.length===0&&!planted)roundEnd={winner:"ct",how:"elim"};',
  '        else if(aliveCT.length===0)roundEnd={winner:"t",how:"elim"};',
  '        else if(sec>=114)roundEnd={winner:planted?"t":"ct",how:"time"};',
  "      }",
].join("\n");
const ROUND_END_HOOK = `
      if(roundEnd)__measure?.recordRoundEnd({round:rnd+1,sec,winner:roundEnd.winner,how:roundEnd.how,planted,c4t:c4t===null?null:c4t,aliveT:aliveT.length,aliveCT:aliveCT.length,freshAliveT:ps.filter(__p=>__p.side==="t"&&!__p.dead).length,freshAliveCT:ps.filter(__p=>__p.side==="ct"&&!__p.dead).length,defuseProg,rngCount:__r11RngCount});`;
const RETURN_MARKER = "return { EsportsFPS3D, buildMatchResult };";
const RETURN_REPLACEMENT = "return { EsportsFPS3D, buildMatchResult, simulateFps, ROSTER, TACTICS_DB };";
const EXPORT_MARKER = "export { EsportsFPS3D, buildMatchResult };";
const EXPORT_REPLACEMENT = `const __CS_BOMB_RESULT_SEMANTICS_R11_TEST_API__ = Object.freeze({
  simulateFps: __FPS3D_MODULE.simulateFps,
  ROSTER: __FPS3D_MODULE.ROSTER,
  TACTICS_DB: __FPS3D_MODULE.TACTICS_DB,
});
export { EsportsFPS3D, buildMatchResult, __CS_BOMB_RESULT_SEMANTICS_R11_TEST_API__ };`;

const CONTRACT_READ_MARKER = 'summaryEvents: (raw.rounds ?? []).map((r, i) => ({ round: i + 1, winner: r.winner === "t" ? "us" : "enemy", how: r.how ?? null }))';
const OVERLAY_READ_MARKER = 'result.how==="bomb"?"💣 炸彈引爆":result.how==="defuse"?"✂️ 成功拆彈":result.how==="elim"?"☠️ 全員淘汰":"⏱️ 時間結束"';
const AUDIO_READ_MARKER = 'if(res.how==="bomb")A.boom();else if(res.how==="defuse")A.defuse();';
const RESULT_TOOLTIP_MARKER = 'rd.how ? `（${rd.how}）` : ""';

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
    gate(Number.isFinite(value), "NON_FINITE_NUMBER", key);
    if (Object.is(value, -0)) return 0;
    if (["x", "y", "routeT", "t"].includes(key)) return Math.round(value * 1e6) / 1e6;
    return value;
  }
  gate(typeof value === "object" && typeof value !== "undefined", "UNSUPPORTED_VALUE", key);
  if (Array.isArray(value)) return value.map((item, index) => canonicalValue(item, `${key}[${index}]`));
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

function randTokens(source) {
  return source.match(/\brand\s*\(\s*\)/g) ?? [];
}

function applySemanticsVariant(source, variant) {
  const r10Count = occurrences(source, R10_RESULT_MARKER);
  const r11Count = occurrences(source, R11_RESULT_MARKER);
  gate(r10Count + r11Count === 1, "RESULT_SEMANTICS_STAGE", `r10=${r10Count} r11=${r11Count}`);
  if (variant === "r10" && r11Count) return source.replace(R11_RESULT_MARKER, R10_RESULT_MARKER);
  if (variant === "r11" && r10Count) return source.replace(R10_RESULT_MARKER, R11_RESULT_MARKER);
  return source;
}

function transformSource(source, variant) {
  let transformed = applySemanticsVariant(source.replace(/\r\n/g, "\n"), variant);
  const resultMarker = variant === "r10" ? R10_RESULT_MARKER : R11_RESULT_MARKER;
  for (const marker of [SIGNATURE_MARKER, RNG_MARKER, resultMarker, RETURN_MARKER, EXPORT_MARKER]) {
    gate(occurrences(transformed, marker) === 1, "TRANSFORM_MARKER_COUNT", marker.slice(0, 100));
  }
  transformed = transformed
    .replace(SIGNATURE_MARKER, SIGNATURE_REPLACEMENT)
    .replace(RNG_MARKER, RNG_REPLACEMENT)
    .replace(resultMarker, `${resultMarker}${ROUND_END_HOOK}`)
    .replace(RETURN_MARKER, RETURN_REPLACEMENT)
    .replace(EXPORT_MARKER, EXPORT_REPLACEMENT);
  gate(randTokens(transformed).length === EXPECTED_RAND_CALLS, "TRANSFORM_RAND_COUNT",
    `expected=${EXPECTED_RAND_CALLS} actual=${randTokens(transformed).length}`);
  return transformed;
}

function createCollector() {
  const rng = [];
  const roundEnds = [];
  return {
    rng,
    roundEnds,
    recordRng(index, value) { rng.push({ index, value }); },
    recordRoundEnd(event) {
      canonicalJson(event);
      roundEnds.push(event);
    },
  };
}

function runVariant(api, scenario) {
  const firstCollector = createCollector();
  const first = api.simulateFps(scenario.mapKey, scenario.tTactic, scenario.ctTactic, scenario.seed, scenario.roster, firstCollector);
  const secondCollector = createCollector();
  const second = api.simulateFps(scenario.mapKey, scenario.tTactic, scenario.ctTactic, scenario.seed, scenario.roster, secondCollector);
  gate(canonicalJson(first) === canonicalJson(second), "SIM_NON_DETERMINISTIC", `seed=${scenario.seed}`);
  gate(canonicalJson(firstCollector.rng) === canonicalJson(secondCollector.rng), "RNG_NON_DETERMINISTIC", `seed=${scenario.seed}`);
  gate(canonicalJson(firstCollector.roundEnds) === canonicalJson(secondCollector.roundEnds), "ROUND_END_NON_DETERMINISTIC", `seed=${scenario.seed}`);
  gate(firstCollector.roundEnds.length === first.roundHist.length, "ROUND_END_COUNT", `seed=${scenario.seed}`);
  return { sim: first, rng: firstCollector.rng, roundEnds: firstCollector.roundEnds };
}

function diffValues(left, right, path = "") {
  if (Object.is(left, right)) return [];
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return [{ path, left: left.length, right: right.length }];
    return left.flatMap((value, index) => diffValues(value, right[index], `${path}[${index}]`));
  }
  if (left && right && typeof left === "object" && typeof right === "object") {
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
    return keys.flatMap((key) => diffValues(left[key], right[key], path ? `${path}.${key}` : key));
  }
  return [{ path, left, right }];
}

function allowedSimHowPath(path) {
  return /^roundHist\[\d+\]\.how$/.test(path)
    || /^frames\[\d+\]\.roundHist\[\d+\]\.how$/.test(path);
}

function expectedRepairedHow(event) {
  if (event.winner === "ct" && event.defuseProg >= 3.5) return "defuse";
  if (event.planted && event.c4t !== null && event.c4t <= 0) return "bomb";
  if ((!event.planted && event.aliveT === 0) || event.aliveCT === 0) return "elim";
  if (event.sec >= 114) return "time";
  throw new Error(`[UNCLASSIFIED_ROUND_END]\n${canonicalJson(event)}`);
}

function expectedLegacyHow(event, repairedHow) {
  if (event.planted && repairedHow === "elim" && event.aliveCT === 0) return "bomb";
  if (event.planted && repairedHow === "time") return "bomb";
  return repairedHow;
}

function validatePair(r10, r11, scenario) {
  gate(canonicalJson(r10.rng) === canonicalJson(r11.rng), "RNG_TRAJECTORY_CHANGED", `seed=${scenario.seed}`);
  const simDiffs = diffValues(r10.sim, r11.sim);
  gate(simDiffs.every((diff) => allowedSimHowPath(diff.path)
    && diff.left === "bomb" && (diff.right === "elim" || diff.right === "time")),
  "NON_HOW_SIM_DIFFERENCE", `seed=${scenario.seed}\n${canonicalJson(simDiffs.slice(0, 10))}`);
  gate(r10.roundEnds.length === r11.roundEnds.length, "PAIRED_ROUND_COUNT", `seed=${scenario.seed}`);

  const rounds = [];
  for (let index = 0; index < r11.roundEnds.length; index += 1) {
    const legacy = r10.roundEnds[index];
    const repaired = r11.roundEnds[index];
    const eventDiffs = diffValues(legacy, repaired);
    gate(eventDiffs.every((diff) => diff.path === "how"), "ROUND_END_STATE_CHANGED",
      `seed=${scenario.seed} round=${index + 1}\n${canonicalJson(eventDiffs)}`);
    const repairedHow = expectedRepairedHow(repaired);
    const legacyHow = expectedLegacyHow(legacy, repairedHow);
    gate(repaired.how === repairedHow, "REPAIRED_SEMANTICS", `seed=${scenario.seed} round=${index + 1}`);
    gate(legacy.how === legacyHow, "LEGACY_SEMANTICS", `seed=${scenario.seed} round=${index + 1}`);
    gate(r11.sim.roundHist[index]?.how === repaired.how && r10.sim.roundHist[index]?.how === legacy.how,
      "ROUND_HIST_READ_CHAIN", `seed=${scenario.seed} round=${index + 1}`);
    rounds.push({
      round: repaired.round,
      winner: repaired.winner,
      legacyHow: legacy.how,
      repairedHow: repaired.how,
      planted: repaired.planted,
      c4t: repaired.c4t,
      sec: repaired.sec,
      aliveT: repaired.aliveT,
      aliveCT: repaired.aliveCT,
      freshAliveT: repaired.freshAliveT,
      freshAliveCT: repaired.freshAliveCT,
      defuseProg: repaired.defuseProg,
    });
  }
  return { seed: scenario.seed, rngCount: r11.rng.length, simHowDiffs: simDiffs.length, rounds };
}

async function main() {
  gate(process.argv.slice(2).length === 0, "CLI_FLAGS_FORBIDDEN",
    "R11 has no capture, update, rebaseline, seed, treatment, or calibration flags.");
  gate(canonicalJson(generatedSeeds()) === canonicalJson(FIXED_SEEDS), "SEED_GENERATION_MISMATCH");
  gate(sha256(canonicalJson(FIXED_SEEDS)) === EXPECTED_SEED_SET_SHA256, "SEED_SET_HASH_MISMATCH");

  const originalSource = readFileSync(FPS_FILE, "utf8");
  const sourceSha256 = sha256(originalSource);
  const r14Sources = csR14EvidenceSources(originalSource);
  const r11EvidenceSource = r14Sources?.r12 ?? (sourceSha256 === CS_R13_PLAYER_SMOKE_SOURCE_SHA256
    ? csR13R12Source(originalSource) : originalSource);
  if (sourceSha256 === CS_R13_PLAYER_SMOKE_SOURCE_SHA256) {
    gate(sha256(r11EvidenceSource) === CS_R11_REPAIRED_SOURCE_SHA256, "R13_R12_ADAPTER_MISMATCH");
  }
  const sourceStage = r14Sources ? "r14-he"
    : sourceSha256 === CS_R13_PLAYER_SMOKE_SOURCE_SHA256 ? "r13-player-smoke"
    : sourceSha256 === CS_R10_SOURCE_SHA256 ? "r10-overloaded"
    : sourceSha256 === CS_R11_REPAIRED_SOURCE_SHA256 ? "r11-repaired" : null;
  gate(sourceStage, "SOURCE_PROVENANCE_MISMATCH",
    `r10=${CS_R10_SOURCE_SHA256}\nr11=${CS_R11_REPAIRED_SOURCE_SHA256}\nr13=${CS_R13_PLAYER_SMOKE_SOURCE_SHA256}\nactual=${sourceSha256}`);
  gate(randTokens(originalSource).length === EXPECTED_RAND_CALLS, "RAND_CALL_COUNT");

  const contractSource = readFileSync(CONTRACT_FILE, "utf8");
  const resultUiSource = readFileSync(RESULT_UI_FILE, "utf8");
  gate(occurrences(contractSource, CONTRACT_READ_MARKER) === 1, "CONTRACT_READ_CHAIN");
  gate(occurrences(r11EvidenceSource, OVERLAY_READ_MARKER) === 1, "ROUND_OVERLAY_READ_CHAIN");
  gate(occurrences(r11EvidenceSource, AUDIO_READ_MARKER) === 1, "BOMB_AUDIO_READ_CHAIN");
  gate(occurrences(resultUiSource, RESULT_TOOLTIP_MARKER) === 1, "RESULT_UI_READ_CHAIN");

  const tempRoot = mkdtempSync(join(tmpdir(), "esmo-cs-bomb-result-r11-"));
  let vite = null;
  let transformSeen = 0;
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
        name: "cs-bomb-result-semantics-r11-memory-transform",
        enforce: "pre",
        transform(code, id) {
          if (resolve(id.split("?")[0]).toLowerCase() !== FPS_FILE.toLowerCase()) return null;
          const query = id.split("?")[1] ?? "";
          const variant = query.includes("cs-r11=r10") ? "r10" : query.includes("cs-r11=r11") ? "r11" : null;
          if (!variant) return null;
          transformSeen += 1;
          gate(code === originalSource, "VITE_SOURCE_MISMATCH");
          return { code: transformSource(r11EvidenceSource, variant), map: null };
        },
      }],
    });

    const r10Module = await vite.ssrLoadModule(`${FPS_MODULE_ID}?cs-r11=r10`);
    const r11Module = await vite.ssrLoadModule(`${FPS_MODULE_ID}?cs-r11=r11`);
    gate(transformSeen === 2, "TRANSFORM_COUNT", String(transformSeen));
    const r10Api = r10Module.__CS_BOMB_RESULT_SEMANTICS_R11_TEST_API__;
    const r11Api = r11Module.__CS_BOMB_RESULT_SEMANTICS_R11_TEST_API__;
    for (const api of [r10Api, r11Api]) {
      gate(typeof api?.simulateFps === "function", "SIMULATOR_EXPORT_MISSING");
      gate(Array.isArray(api?.ROSTER), "ROSTER_EXPORT_MISSING");
      gate(api?.TACTICS_DB?.inferno, "TACTICS_EXPORT_MISSING");
    }

    const mapKey = "inferno";
    const tTactic = clonePlain(r11Api.TACTICS_DB.inferno.t.find((item) => item.id === "t_aexec"));
    const ctTactic = clonePlain(r11Api.TACTICS_DB.inferno.ct.find((item) => item.id === "c_std"));
    const roster = clonePlain(r11Api.ROSTER);
    gate(tTactic?.id === "t_aexec" && ctTactic?.id === "c_std", "TACTIC_MISSING");
    deepFreeze(tTactic);
    deepFreeze(ctTactic);
    deepFreeze(roster);
    const inputBefore = sha256(canonicalJson({ mapKey, tTactic, ctTactic, roster }));

    const records = [];
    for (const seed of FIXED_SEEDS) {
      const scenario = { seed, mapKey, tTactic, ctTactic, roster };
      records.push(validatePair(runVariant(r10Api, scenario), runVariant(r11Api, scenario), scenario));
    }
    gate(inputBefore === sha256(canonicalJson({ mapKey, tTactic, ctTactic, roster })), "SIM_MUTATED_INPUT");

    const rounds = records.flatMap((record) => record.rounds);
    const counts = Object.fromEntries(["bomb", "defuse", "elim", "time"].map((how) => [how, rounds.filter((round) => round.repairedHow === how).length]));
    const trueExplosions = rounds.filter((round) => round.repairedHow === "bomb" && round.planted && round.c4t <= 0).length;
    const postPlantCtElims = rounds.filter((round) => round.legacyHow === "bomb" && round.repairedHow === "elim" && round.planted && round.aliveCT === 0 && round.c4t > 0).length;
    const postPlantTimeouts = rounds.filter((round) => round.legacyHow === "bomb" && round.repairedHow === "time" && round.planted && round.sec >= 114 && round.c4t > 0).length;
    gate(Object.values(counts).every((count) => count > 0), "FOUR_SEMANTICS_COVERAGE", canonicalJson(counts));
    gate(trueExplosions > 0, "NO_TRUE_EXPLOSION_COVERAGE");
    gate(postPlantCtElims > 0, "NO_POST_PLANT_CT_ELIM_COVERAGE");
    gate(postPlantTimeouts > 0, "NO_POST_PLANT_TIMEOUT_COVERAGE");
    gate(rounds.filter((round) => round.repairedHow === "bomb").every((round) => round.c4t <= 0), "BOMB_NOT_TIMER_EXCLUSIVE");

    const suiteSha256 = sha256(canonicalJson({
      schema: EVIDENCE_SCHEMA,
      seedGenerationVersion: SEED_GENERATION_VERSION,
      seedSetSha256: EXPECTED_SEED_SET_SHA256,
      records,
    }));
    console.log(`source stage: ${sourceStage}`);
    console.log(`sourceSha256: ${sourceSha256}`);
    console.log(`fixed seeds: ${FIXED_SEEDS.length}`);
    console.log(`round semantics: ${canonicalJson(counts)}`);
    console.log(`causal coverage: ${canonicalJson({ trueExplosions, postPlantCtElims, postPlantTimeouts })}`);
    console.log(`RNG paired equality: ${records.length}/${records.length}`);
    console.log(`non-how gameplay differences: 0`);
    console.log(`${EVIDENCE_SCHEMA}: ${suiteSha256}`);
    gate(["r11-repaired", "r13-player-smoke", "r14-he"].includes(sourceStage),
      "PRODUCTION_SEMANTICS_NOT_REPAIRED",
      "R10 still overloads post-plant elimination/timeout as bomb.");
    if (EXPECTED_SEMANTICS_SUITE_SHA256 === "__CAPTURE_MANUALLY__") {
      throw new Error(`[R11_BASELINE_NOT_LOCKED]\nactual=${suiteSha256}`);
    }
    gate(suiteSha256 === EXPECTED_SEMANTICS_SUITE_SHA256, "SEMANTICS_EVIDENCE_REGRESSION",
      `expected=${EXPECTED_SEMANTICS_SUITE_SHA256}\nactual=${suiteSha256}`);
    console.log("CsMatchResult.v1 / Store / Progress / runtime contract: unchanged");
    console.log("CS Bomb Result Semantics R11: PASS");
  } finally {
    if (vite) await vite.close();
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
