#!/usr/bin/env node
// CS Measurement Pilot R1
// - Production FPS source stays untouched.
// - Vite exposes the existing simulator through a test-only in-memory transform.
// - No calibration, p-values, automatic baseline update, or generated repo files.

import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FPS_FILE = resolve(ROOT, "src/battle/fps/EsportsFPS3D.jsx");
const FPS_MODULE_ID = "/src/battle/fps/EsportsFPS3D.jsx";

const DIGEST_SCHEMA = "CsGameplayDigest.v1";
const SEED_GENERATION_VERSION = "CsMeasurementSeedSet.v1";
const SEED_NAMESPACE = "ESMO:CsMeasurementPilot.v1:";
const FIXED_SEEDS = Object.freeze([
  3978742910, 4200255727, 541349949, 1011896540,
  44863398, 1878380147, 638784133, 2852978760,
  1789562418, 3820910912, 3991584863, 2186970694,
  951543597, 2082574495, 474649321, 3950420867,
]);
const EXPECTED_SEED_SET_SHA256 = "52414f0e6b09ba72b9223b5e76b6ad9d859e8b8ea6fe77dcc2a2a08876a74c6d";
const CAPTURED_ENGINE_SOURCE_SHA256 = "5b9360f457c95034cdfdc9e864c04a761e1afdba01501c7e383bb9075e048c3d";

// Intentionally no --update/--rebaseline path. The first verifier run prints the
// candidate; a human must inspect it and replace this literal explicitly.
const EXPECTED_BASELINE_SUITE_V1 = "546a3e5753ceadfa28c64e7f322556ebbff32f0848eebe2c9b477a29f1a195c2";

const RETURN_MARKER = "return { EsportsFPS3D, buildMatchResult };";
const RETURN_REPLACEMENT = "return { EsportsFPS3D, buildMatchResult, simulateFps, ROSTER, TACTICS_DB };";
const EXPORT_MARKER = "export { EsportsFPS3D, buildMatchResult };";
const EXPORT_REPLACEMENT = `const __CS_MEASUREMENT_R1_TEST_API__ = Object.freeze({
  simulateFps: __FPS3D_MODULE.simulateFps,
  ROSTER: __FPS3D_MODULE.ROSTER,
  TACTICS_DB: __FPS3D_MODULE.TACTICS_DB,
});
export { EsportsFPS3D, buildMatchResult, __CS_MEASUREMENT_R1_TEST_API__ };`;

function gate(ok, code, detail = "") {
  if (!ok) {
    const suffix = detail ? `\n${detail}` : "";
    throw new Error(`[${code}]${suffix}`);
  }
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function occurrences(text, needle) {
  return text.split(needle).length - 1;
}

function round6(value) {
  const rounded = Math.round(value * 1e6) / 1e6;
  return Object.is(rounded, -0) ? 0 : rounded;
}

const GAMEPLAY_FLOAT_KEYS = new Set(["x", "y", "routeT", "t"]);

function canonicalValue(value, { gameplay = false, rejectUndefined = false } = {}, key = "") {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    gate(Number.isFinite(value), "NON_FINITE_NUMBER", `key=${key} value=${String(value)}`);
    if (Object.is(value, -0)) return 0;
    return gameplay && GAMEPLAY_FLOAT_KEYS.has(key) ? round6(value) : value;
  }
  if (typeof value === "undefined") {
    gate(!rejectUndefined, "UNDEFINED_VALUE", `key=${key}`);
    return undefined;
  }
  gate(typeof value === "object", "UNSUPPORTED_CANONICAL_VALUE", `key=${key} type=${typeof value}`);
  if (Array.isArray(value)) {
    return value.map((entry, index) => {
      const normalized = canonicalValue(entry, { gameplay, rejectUndefined }, String(index));
      gate(typeof normalized !== "undefined", "UNDEFINED_ARRAY_VALUE", `index=${index}`);
      return normalized;
    });
  }
  const out = {};
  for (const childKey of Object.keys(value).sort()) {
    const normalized = canonicalValue(value[childKey], { gameplay, rejectUndefined }, childKey);
    if (typeof normalized !== "undefined") out[childKey] = normalized;
  }
  return out;
}

function canonicalJson(value, options = {}) {
  return JSON.stringify(canonicalValue(value, options));
}

function deepFreeze(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function deepDiff(left, right, path = "", out = []) {
  if (Object.is(left, right)) return out;
  const leftObj = left && typeof left === "object";
  const rightObj = right && typeof right === "object";
  if (!leftObj || !rightObj || Array.isArray(left) !== Array.isArray(right)) {
    out.push({ path, before: left, after: right });
    return out;
  }
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  for (const key of keys) {
    const next = Array.isArray(left) ? `${path}[${key}]` : (path ? `${path}.${key}` : key);
    if (!(key in left)) out.push({ path: next, before: undefined, after: right[key] });
    else if (!(key in right)) out.push({ path: next, before: left[key], after: undefined });
    else deepDiff(left[key], right[key], next, out);
  }
  return out;
}

function clonePlain(value) {
  return structuredClone(value);
}

function generatedSeeds() {
  return Array.from({ length: 16 }, (_, index) => {
    const digest = createHash("sha256").update(`${SEED_NAMESPACE}${index}`).digest();
    return digest.readUInt32BE(0) || 1;
  });
}

function normalizeLoose(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number") return value;
  if (Array.isArray(value)) return value.map(normalizeLoose);
  gate(value && typeof value === "object", "INVALID_LOOSE_VALUE", `type=${typeof value}`);
  const out = {};
  for (const key of Object.keys(value)) {
    if (typeof value[key] !== "undefined") out[key] = normalizeLoose(value[key]);
  }
  return out;
}

function normalizeFramePlayer(player) {
  gate(player?.id && player?.pos, "FRAME_PLAYER_SHAPE", JSON.stringify(player ?? null));
  return {
    id: player.id,
    x: player.pos.x,
    y: player.pos.y,
    hp: player.hp,
    dead: Boolean(player.dead),
    state: player.state,
    gun: player.gun ?? null,
    money: player.money,
    armor: Boolean(player.armor),
    helmet: Boolean(player.helmet),
    flash: player.flash,
    hasBomb: Boolean(player.hasBomb),
    nades: [...(player.nades ?? [])],
    routeIdx: player.routeIdx,
    routeT: player.routeT,
    reassigned: Boolean(player.reassigned),
    picking: player.picking,
    shooting: player.shooting,
    k: player.k,
    d: player.d,
    a: player.a,
    hsCount: player.hsCount,
    dmgDealt: player.dmgDealt,
    hitters: [...(player._hitters ?? [])].sort(),
  };
}

function normalizeSmoke(smoke) {
  return { id: smoke.id, x: smoke.pos.x, y: smoke.pos.y, tl: smoke.tl, age: smoke.age ?? null };
}

function normalizeMolly(molly) {
  return { id: molly.id, x: molly.pos.x, y: molly.pos.y, tl: molly.tl };
}

function normalizeThrowable(item) {
  return {
    id: item.id,
    type: item.type,
    side: item.side,
    from: { x: item.from.x, y: item.from.y },
    to: { x: item.to.x, y: item.to.y },
    t: item.t,
    flying: Boolean(item.flying),
    detonate: Boolean(item.detonate),
    boom: item.boom ?? null,
  };
}

function normalizeDroppedGun(item) {
  return { id: item.id, gun: item.gun, x: item.pos.x, y: item.pos.y };
}

function buildGameplayDocument(sim, scenario) {
  gate(sim && Array.isArray(sim.frames) && Array.isArray(sim.players), "SIM_OUTPUT_SHAPE");
  gate(Array.isArray(sim.roundHist), "SIM_ROUND_HISTORY_SHAPE");

  const document = {
    schema: DIGEST_SCHEMA,
    scenario: {
      seed: scenario.seed,
      mapKey: scenario.mapKey,
      tTacticId: scenario.tTactic.id,
      ctTacticId: scenario.ctTactic.id,
      inputSha256: scenario.inputSha256,
    },
    result: {
      tScore: sim.tScore,
      ctScore: sim.ctScore,
      roundCount: sim.rounds,
      players: [...sim.players].sort((a, b) => String(a.id).localeCompare(String(b.id))).map((player) => ({
        id: player.id,
        side: player.side,
        roleKey: player.roleKey,
        k: player.k,
        d: player.d,
        a: player.a,
        adr: player.adr,
        hs: player.hs,
        hsPct: player.hsPct,
        kast: player.kast,
        mvpRounds: player.mvpRounds,
        clutches: player.clutches,
        entryKills: player.entryKills,
        rating: player.rating,
      })),
    },
    rounds: sim.roundHist.map((round, index) => ({
      round: index + 1,
      winner: round.winner,
      how: round.how,
      tScore: round.tS,
      ctScore: round.cS,
    })),
    frames: sim.frames.map((frame) => ({
      fi: frame.fi,
      rnd: frame.rnd,
      roundSec: frame.roundSec,
      buyP: Boolean(frame.buyP),
      target: frame.target,
      planted: Boolean(frame.planted),
      c4t: frame.c4t ?? null,
      ecoT: Boolean(frame.ecoT),
      ecoCT: Boolean(frame.ecoCT),
      players: [...frame.players].sort((a, b) => String(a.id).localeCompare(String(b.id))).map(normalizeFramePlayer),
      events: (frame.events ?? []).map(normalizeLoose),
      smokes: (frame.smokes ?? []).map(normalizeSmoke),
      mollys: (frame.mollys ?? []).map(normalizeMolly),
      throwables: (frame.throwables ?? []).map(normalizeThrowable),
      droppedGuns: (frame.droppedGuns ?? []).map(normalizeDroppedGun),
      droppedBomb: frame.droppedBomb ? { x: frame.droppedBomb.pos.x, y: frame.droppedBomb.pos.y } : null,
      doorStates: normalizeLoose(frame.doorStates ?? {}),
    })),
  };

  gate(document.schema === "CsGameplayDigest.v1", "SCHEMA_MISMATCH", `actual=${document.schema}`);
  return document;
}

function gameplayDigest(sim, scenario) {
  return sha256(canonicalJson(buildGameplayDocument(sim, scenario), { gameplay: true, rejectUndefined: true }));
}

function strictSimDigest(sim) {
  return sha256(canonicalJson(sim, { gameplay: false, rejectUndefined: false }));
}

function scenarioInput(seed, mapKey, tTactic, ctTactic, roster) {
  return { seed, mapKey, tTactic, ctTactic, roster };
}

function scenarioInputSha256(seed, mapKey, tTactic, ctTactic, roster) {
  return sha256(canonicalJson(scenarioInput(seed, mapKey, tTactic, ctTactic, roster), { rejectUndefined: false }));
}

function collectPilotMetrics(sim, targetId) {
  const target = sim.players.find((player) => player.id === targetId);
  gate(Boolean(target), "PILOT_TARGET_MISSING", `target=${targetId}`);
  return {
    tWin: sim.tScore > sim.ctScore,
    roundDiff: sim.tScore - sim.ctScore,
    tScore: sim.tScore,
    ctScore: sim.ctScore,
    target: {
      k: target.k,
      d: target.d,
      a: target.a,
      adr: target.adr,
      hs: target.hs,
      hsPct: target.hsPct,
      kast: target.kast,
      entryKills: target.entryKills,
      rating: target.rating,
    },
  };
}

function average(records, selector) {
  return records.reduce((sum, record) => sum + selector(record), 0) / Math.max(1, records.length);
}

function pilotSummary(records) {
  return {
    matches: records.length,
    tWins: records.filter((record) => record.metrics.tWin).length,
    avgRoundDiff: +average(records, (record) => record.metrics.roundDiff).toFixed(3),
    target: {
      avgK: +average(records, (record) => record.metrics.target.k).toFixed(3),
      avgD: +average(records, (record) => record.metrics.target.d).toFixed(3),
      avgAdr: +average(records, (record) => record.metrics.target.adr).toFixed(3),
      avgHsPct: +average(records, (record) => record.metrics.target.hsPct).toFixed(3),
      avgKast: +average(records, (record) => record.metrics.target.kast).toFixed(3),
      avgRating: +average(records, (record) => record.metrics.target.rating).toFixed(3),
    },
  };
}

function runArm({ simulateFps, mapKey, tTactic, ctTactic, roster, seed, strict }) {
  const beforeInput = scenarioInputSha256(seed, mapKey, tTactic, ctTactic, roster);
  const sim = simulateFps(mapKey, tTactic, ctTactic, seed, roster);
  const afterInput = scenarioInputSha256(seed, mapKey, tTactic, ctTactic, roster);
  gate(beforeInput === afterInput, "SIM_MUTATED_INPUT", `seed=${seed}`);

  const scenario = { seed, mapKey, tTactic, ctTactic, inputSha256: beforeInput };
  const gameplayBefore = gameplayDigest(sim, scenario);
  const strictBefore = strict ? strictSimDigest(sim) : null;
  const metrics = collectPilotMetrics(sim, "t2");
  const gameplayAfter = gameplayDigest(sim, scenario);
  const strictAfter = strict ? strictSimDigest(sim) : null;

  gate(gameplayBefore === gameplayAfter, "COLLECTOR_CHANGED_GAMEPLAY_DIGEST", `seed=${seed}`);
  if (strict) gate(strictBefore === strictAfter, "COLLECTOR_CHANGED_STRICT_DIGEST", `seed=${seed}`);

  return { seed, inputSha256: beforeInput, gameplayDigest: gameplayBefore, strictSimDigest: strictBefore, metrics };
}

function treatmentView(mapKey, tTactic, ctTactic, roster) {
  return {
    mapKey,
    tTactic,
    ctTactic,
    roster: Object.fromEntries([...roster].sort((a, b) => String(a.id).localeCompare(String(b.id))).map((player) => [player.id, player])),
  };
}

async function main() {
  gate(process.argv.slice(2).length === 0, "CLI_FLAGS_FORBIDDEN", "No update/rebaseline flags are supported.");

  const originalSource = readFileSync(FPS_FILE, "utf8");
  const engineSourceSha256 = sha256(originalSource);
  gate(engineSourceSha256 === CAPTURED_ENGINE_SOURCE_SHA256, "SOURCE_PROVENANCE_MISMATCH",
    `expected=${CAPTURED_ENGINE_SOURCE_SHA256}\nactual=${engineSourceSha256}`);
  gate(occurrences(originalSource, RETURN_MARKER) === 1, "RETURN_MARKER_COUNT");
  gate(occurrences(originalSource, EXPORT_MARKER) === 1, "EXPORT_MARKER_COUNT");

  const regenerated = generatedSeeds();
  gate(canonicalJson(regenerated) === canonicalJson(FIXED_SEEDS), "SEED_GENERATION_MISMATCH");
  const seedSetSha256 = sha256(canonicalJson(FIXED_SEEDS));
  gate(seedSetSha256 === EXPECTED_SEED_SET_SHA256, "SEED_SET_HASH_MISMATCH");

  console.log(`seed generation version: ${SEED_GENERATION_VERSION}`);
  console.log(`seeds: ${JSON.stringify(FIXED_SEEDS)}`);
  console.log(`seedSetSha256: ${seedSetSha256}`);
  console.log(`engineSourceSha256: ${engineSourceSha256}`);

  let transformSeen = 0;
  let transformRestoredExactly = false;
  const tempRoot = mkdtempSync(join(tmpdir(), "esmo-cs-measure-r1-"));
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
        name: "cs-measurement-r1-memory-export",
        enforce: "pre",
        transform(code, id) {
          const cleanId = resolve(id.split("?")[0]).toLowerCase();
          if (cleanId !== FPS_FILE.toLowerCase()) return null;
          transformSeen += 1;
          gate(code === originalSource, "VITE_SOURCE_MISMATCH");
          gate(occurrences(code, RETURN_MARKER) === 1, "TRANSFORM_RETURN_MARKER_COUNT");
          gate(occurrences(code, EXPORT_MARKER) === 1, "TRANSFORM_EXPORT_MARKER_COUNT");
          const transformed = code
            .replace(RETURN_MARKER, RETURN_REPLACEMENT)
            .replace(EXPORT_MARKER, EXPORT_REPLACEMENT);
          const restored = transformed
            .replace(RETURN_REPLACEMENT, RETURN_MARKER)
            .replace(EXPORT_REPLACEMENT, EXPORT_MARKER);
          transformRestoredExactly = restored === code;
          gate(transformRestoredExactly, "TRANSFORM_NOT_EXPORT_ONLY");
          return { code: transformed, map: null };
        },
      }],
    });

    const loaded = await vite.ssrLoadModule(FPS_MODULE_ID);
    gate(transformSeen === 1, "TRANSFORM_EXECUTION_COUNT", `actual=${transformSeen}`);
    gate(transformRestoredExactly, "TRANSFORM_INTEGRITY");
    const api = loaded.__CS_MEASUREMENT_R1_TEST_API__;
    gate(typeof api?.simulateFps === "function", "TEST_SIMULATOR_EXPORT_MISSING");
    gate(Array.isArray(api?.ROSTER), "TEST_ROSTER_EXPORT_MISSING");
    gate(api?.TACTICS_DB && typeof api.TACTICS_DB === "object", "TEST_TACTICS_EXPORT_MISSING");

    const mapKey = "inferno";
    const baselineRoster = clonePlain(api.ROSTER);
    const treatmentRoster = clonePlain(api.ROSTER);
    const targetBaseline = baselineRoster.find((player) => player.id === "t2");
    const targetTreatment = treatmentRoster.find((player) => player.id === "t2");
    gate(targetBaseline?.side === "t" && targetBaseline?.role === "rifler", "TARGET_IDENTITY_MISMATCH");
    gate(targetBaseline?.stats?.acc === 88, "TARGET_BASELINE_ACCURACY_MISMATCH",
      `actual=${String(targetBaseline?.stats?.acc)}`);
    targetTreatment.stats.acc = 68;
    gate(targetTreatment.fps === targetBaseline.fps, "HUD_OVR_WAS_RECOMPUTED");

    const tTactic = clonePlain(api.TACTICS_DB?.inferno?.t?.find((tactic) => tactic.id === "t_aexec"));
    const ctTactic = clonePlain(api.TACTICS_DB?.inferno?.ct?.find((tactic) => tactic.id === "c_std"));
    gate(tTactic?.id === "t_aexec", "T_TACTIC_MISSING");
    gate(ctTactic?.id === "c_std", "CT_TACTIC_MISSING");

    const treatmentDiff = deepDiff(
      treatmentView(mapKey, tTactic, ctTactic, baselineRoster),
      treatmentView(mapKey, tTactic, ctTactic, treatmentRoster),
    );
    gate(treatmentDiff.length === 1
      && treatmentDiff[0].path === "roster.t2.stats.acc"
      && treatmentDiff[0].before === 88
      && treatmentDiff[0].after === 68,
    "TREATMENT_INTEGRITY", JSON.stringify(treatmentDiff));

    deepFreeze(baselineRoster);
    deepFreeze(treatmentRoster);
    deepFreeze(tTactic);
    deepFreeze(ctTactic);

    const baseline = [];
    const treatment = [];
    let equalArmGameplayDigests = 0;
    let sentinelBaselineStrict = null;
    let sentinelTreatmentStrict = null;

    for (let index = 0; index < FIXED_SEEDS.length; index += 1) {
      const seed = FIXED_SEEDS[index];
      const strict = index === 0;
      const a1 = runArm({ simulateFps: api.simulateFps, mapKey, tTactic, ctTactic, roster: baselineRoster, seed, strict });
      const b1 = runArm({ simulateFps: api.simulateFps, mapKey, tTactic, ctTactic, roster: treatmentRoster, seed, strict });
      const a2 = runArm({ simulateFps: api.simulateFps, mapKey, tTactic, ctTactic, roster: baselineRoster, seed, strict });
      const b2 = runArm({ simulateFps: api.simulateFps, mapKey, tTactic, ctTactic, roster: treatmentRoster, seed, strict });

      gate(a1.gameplayDigest === a2.gameplayDigest, "BASELINE_NON_DETERMINISTIC", `seed=${seed}`);
      gate(b1.gameplayDigest === b2.gameplayDigest, "TREATMENT_NON_DETERMINISTIC", `seed=${seed}`);
      gate(canonicalJson(a1.metrics) === canonicalJson(a2.metrics), "BASELINE_METRICS_NON_DETERMINISTIC", `seed=${seed}`);
      gate(canonicalJson(b1.metrics) === canonicalJson(b2.metrics), "TREATMENT_METRICS_NON_DETERMINISTIC", `seed=${seed}`);
      if (strict) {
        gate(a1.strictSimDigest === a2.strictSimDigest, "BASELINE_STRICT_NON_DETERMINISTIC", `seed=${seed}`);
        gate(b1.strictSimDigest === b2.strictSimDigest, "TREATMENT_STRICT_NON_DETERMINISTIC", `seed=${seed}`);
        sentinelBaselineStrict = a1.strictSimDigest;
        sentinelTreatmentStrict = b1.strictSimDigest;
      }
      if (a1.gameplayDigest === b1.gameplayDigest) equalArmGameplayDigests += 1;
      baseline.push(a1);
      treatment.push(b1);
    }

    const suitePayload = {
      schema: DIGEST_SCHEMA,
      seedGenerationVersion: SEED_GENERATION_VERSION,
      seedSetSha256,
      baseline: baseline.map((record) => ({ seed: record.seed, gameplayDigest: record.gameplayDigest })),
    };
    const baselineSuiteDigest = sha256(canonicalJson(suitePayload, { rejectUndefined: true }));

    console.log(`baselineSuiteDigest: ${baselineSuiteDigest}`);
    console.log(`strictSimDigest baseline sentinel: ${sentinelBaselineStrict}`);
    console.log(`strictSimDigest treatment sentinel: ${sentinelTreatmentStrict}`);
    console.log(`A/B equal gameplay digests: ${equalArmGameplayDigests}/${FIXED_SEEDS.length} (diagnostic only)`);
    console.log(`baseline pilot: ${JSON.stringify(pilotSummary(baseline))}`);
    console.log(`treatment pilot: ${JSON.stringify(pilotSummary(treatment))}`);
    console.log("statistics: not computed (no p-value; no significance gate)");

    gate(EXPECTED_BASELINE_SUITE_V1 !== "__CAPTURE_MANUALLY__", "BASELINE_NOT_LOCKED",
      `candidate=${baselineSuiteDigest}`);
    gate(baselineSuiteDigest === EXPECTED_BASELINE_SUITE_V1, "GAMEPLAY_REGRESSION",
      `schema=${DIGEST_SCHEMA}\nexpected=${EXPECTED_BASELINE_SUITE_V1}\nactual=${baselineSuiteDigest}`);

    console.log("CS Measurement R1: PASS");
  } finally {
    if (vite) await vite.close();
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.log(`CS Measurement R1: FAIL ${error?.message ?? String(error)}`);
  process.exitCode = 1;
});
