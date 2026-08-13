#!/usr/bin/env node
// CS Synergy Semantics / Read-Chain R16-A
// Evidence-only verifier. Production FPS source is transformed in memory only.

import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { csR15EvidenceSources } from "./cs_r15_legacy_source.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FPS_FILE = resolve(ROOT, "src/battle/fps/EsportsFPS3D.jsx");
const FPS_ROSTER_FILE = resolve(ROOT, "src/battle/fps/fpsRoster.js");
const PLAYER_MODEL_FILE = resolve(ROOT, "src/data/playerModel.js");
const FPS_MODULE_ID = "/src/battle/fps/EsportsFPS3D.jsx";

const SCHEMA = "CsSynergySemantics.v1";
const SOURCE_SHA256 = "7622f87b8b389a504c19b887b860de791dbf8ea240e6ba57c424e159cb655c89";
const RNG_CALL_SITES = 21;
const SEED_GENERATION_VERSION = "CsMeasurementSeedSet.v1";
const SEED_NAMESPACE = "ESMO:CsMeasurementPilot.v1:";
const FIXED_SEEDS = Object.freeze([
  3978742910, 4200255727, 541349949, 1011896540,
  44863398, 1878380147, 638784133, 2852978760,
  1789562418, 3820910912, 3991584863, 2186970694,
  951543597, 2082574495, 474649321, 3950420867,
]);
const SEED_SET_SHA256 = "52414f0e6b09ba72b9223b5e76b6ad9d859e8b8ea6fe77dcc2a2a08876a74c6d";

// Lock only after reviewing the first evidence run. There is intentionally no update flag.
const EXPECTED_SUITE_SHA256 = "db856f15099943d73b89f16702710031e4a48f33c65538e197c7271ad2eb2022";

const RETURN_MARKER = "return { EsportsFPS3D, buildMatchResult };";
const RETURN_REPLACEMENT = "return { EsportsFPS3D, buildMatchResult, simulateFps, ROSTER, TACTICS_DB };";
const EXPORT_MARKER = "export { EsportsFPS3D, buildMatchResult };";
const EXPORT_REPLACEMENT = `const __CS_SYNERGY_R16A_TEST_API__ = Object.freeze({
  simulateFps: __FPS3D_MODULE.simulateFps,
  ROSTER: __FPS3D_MODULE.ROSTER,
  TACTICS_DB: __FPS3D_MODULE.TACTICS_DB,
});
export { EsportsFPS3D, buildMatchResult, __CS_SYNERGY_R16A_TEST_API__ };`;

function gate(ok, code, detail = "") {
  if (!ok) throw new Error(`[${code}]${detail ? `\n${detail}` : ""}`);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function occurrences(text, needle) {
  return text.split(needle).length - 1;
}

function generatedSeeds() {
  return Array.from({ length: FIXED_SEEDS.length }, (_, index) => {
    const digest = createHash("sha256").update(`${SEED_NAMESPACE}${index}`).digest();
    return digest.readUInt32BE(0) || 1;
  });
}

function canonical(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "undefined") return null;
  if (typeof value === "number") {
    gate(Number.isFinite(value), "NON_FINITE_NUMBER", String(value));
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map(canonical);
  gate(typeof value === "object", "UNSUPPORTED_VALUE", typeof value);
  const out = {};
  for (const key of Object.keys(value).sort()) out[key] = canonical(value[key]);
  return out;
}

function json(value) {
  return JSON.stringify(canonical(value));
}

function clone(value) {
  return structuredClone(value);
}

function replaceExact(source, marker, replacement, code) {
  gate(occurrences(source, marker) === 1, `${code}_MARKER_COUNT`, String(occurrences(source, marker)));
  return source.replace(marker, replacement);
}

function sourceBlock(source, startMarker, endMarker, code) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  gate(start >= 0 && end > start, `${code}_BLOCK_MISSING`);
  return source.slice(start, end);
}

function normalizePlayer(player) {
  return {
    id: player.id,
    side: player.side,
    role: player.role,
    pos: player.pos ? { x: player.pos.x, y: player.pos.y } : null,
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

function normalizeFrame(frame) {
  return {
    fi: frame.fi,
    rnd: frame.rnd,
    roundSec: frame.roundSec,
    target: frame.target,
    planted: Boolean(frame.planted),
    c4t: frame.c4t ?? null,
    c4pos: frame.c4pos ? { x: frame.c4pos.x, y: frame.c4pos.y } : null,
    tScore: frame.tScore,
    ctScore: frame.ctScore,
    ecoT: Boolean(frame.ecoT),
    ecoCT: Boolean(frame.ecoCT),
    players: [...frame.players].sort((a, b) => String(a.id).localeCompare(String(b.id))).map(normalizePlayer),
    events: frame.events ?? [],
    casts: frame.casts ?? [],
    comms: frame.comms ?? [],
    smokes: frame.smokes ?? [],
    mollys: frame.mollys ?? [],
    throwables: frame.throwables ?? [],
    droppedGuns: frame.droppedGuns ?? [],
    droppedBomb: frame.droppedBomb ?? null,
    doorStates: frame.doorStates ?? {},
  };
}

function outputProjection(sim) {
  return {
    result: {
      tScore: sim.tScore,
      ctScore: sim.ctScore,
      rounds: sim.rounds,
      roundHist: sim.roundHist,
      players: [...sim.players].sort((a, b) => String(a.id).localeCompare(String(b.id))).map(normalizePlayer),
    },
    frames: sim.frames.map(normalizeFrame),
  };
}

function rngDigest(values) {
  return sha256(json(values));
}

function instrumentSource(source) {
  let transformed = replaceExact(source, RETURN_MARKER, RETURN_REPLACEMENT, "RETURN");
  transformed = replaceExact(transformed, EXPORT_MARKER, EXPORT_REPLACEMENT, "EXPORT");
  const rngMarker = "const rand=mkRng(seed);";
  const rngReplacement = `const __csR16aRng=mkRng(seed);const rand=()=>{const __v=__csR16aRng();globalThis.__CS_SYNERGY_R16A_RNG__?.push(__v);return __v;};`;
  transformed = replaceExact(transformed, rngMarker, rngReplacement, "RNG_INSTRUMENT");
  return transformed;
}

function treatmentRoster(baseRoster, targetId, before, after) {
  const roster = clone(baseRoster);
  const target = roster.find((player) => player.id === targetId);
  gate(target?.stats?.coo === before, "TREATMENT_INPUT_MISMATCH", `${targetId} expected=${before} actual=${target?.stats?.coo}`);
  target.stats.coo = after;
  return roster;
}

function runOnce(api, scenario) {
  const capture = [];
  globalThis.__CS_SYNERGY_R16A_RNG__ = capture;
  try {
    const sim = api.simulateFps(scenario.mapKey, scenario.tTactic, scenario.ctTactic, scenario.seed, scenario.roster);
    const projection = outputProjection(sim);
    return {
      projection,
      outputSha256: sha256(json(projection)),
      rngCount: capture.length,
      rngSha256: rngDigest(capture),
      rngValues: [...capture],
    };
  } finally {
    delete globalThis.__CS_SYNERGY_R16A_RNG__;
  }
}

function staticAudit(fpsSource, rosterSource, playerModelSource) {
  const normalized = fpsSource.replace(/\r\n/g, "\n");
  const sourceSha = sha256(normalized);
  gate(sourceSha === SOURCE_SHA256, "FPS_SOURCE_SHA256", `expected=${SOURCE_SHA256} actual=${sourceSha}`);
  gate((normalized.match(/\brand\s*\(\s*\)/g) ?? []).length === RNG_CALL_SITES, "RNG_CALL_SITES");
  gate(json(generatedSeeds()) === json(FIXED_SEEDS), "SEED_GENERATION");
  gate(sha256(json(FIXED_SEEDS)) === SEED_SET_SHA256, "SEED_SET_SHA256");

  gate(rosterSource.includes('synergy: "coo"') || rosterSource.includes('synergy:"coo"'), "STAT_L2S_SYNERGY_MAPPING");
  gate(rosterSource.includes('learning: "lrn"') || rosterSource.includes('learning:"lrn"'), "STAT_L2S_LEARNING_MAPPING");
  gate(rosterSource.includes('"輔助": "igl"') || rosterSource.includes('"輔助":"igl"'), "PLAYER_ROLE_MAPPING_CHANGED");
  gate(/"FPS輔助"\s*:\s*\{\s*key:\s*\["synergy",\s*"tacticalIQ",\s*"comms",\s*"positioning",\s*"mapAware"\]/.test(playerModelSource), "PLAYER_MODEL_SUPPORT_SEMANTICS");

  const profile = sourceBlock(normalized, "const POS_PROFILE=", "const FPS_W=", "POS_PROFILE");
  gate(profile.includes('support:["coo","tac","com","pos","vis"]'), "SUPPORT_COO_READ_MISSING");
  const mechanics = sourceBlock(normalized, "const _mechKeys=", "function posSkill", "MECHANICS");
  gate(!mechanics.includes("coo") && !mechanics.includes("lrn"), "TEAM_STATS_IN_MECHANICS");
  const combat = sourceBlock(normalized, "function combatSkill", "// 進攻性", "COMBAT_SKILL");
  gate(!combat.includes('S("coo")') && !combat.includes('S("lrn")'), "DIRECT_COMBAT_TEAM_STAT_READ");
  const aggro = sourceBlock(normalized, "function aggr", "// ── 戰術剋制", "AGGRO");
  gate(!aggro.includes("coo") && !aggro.includes("lrn"), "AGGRO_TEAM_STAT_READ");
  const tactic = sourceBlock(normalized, "function tacticEdge", "const GUNS=", "TACTIC_EDGE");
  gate(!tactic.includes("coo") && !tactic.includes("lrn"), "TACTIC_EDGE_TEAM_STAT_READ");
  const simulatorStart = normalized.indexOf("function simulateFps(");
  const simulatorEnd = normalized.indexOf("\nfunction buildMatchResult", simulatorStart);
  gate(simulatorStart >= 0 && simulatorEnd > simulatorStart, "SIMULATOR_BLOCK");
  const simulator = normalized.slice(simulatorStart, simulatorEnd);
  gate(!/\blrn\b/.test(simulator), "LEARNING_SIMULATOR_READ");
  gate(!/\bcoo\b/.test(simulator), "SYNERGY_SIMULATOR_DIRECT_READ");

  const candidates = [
    { id: "tacticEdge", evidence: "tacticEdge(tacticT,tacticCT)", readsSynergy: false },
    { id: "contactCalled", evidence: "contactCalled", readsSynergy: false },
    { id: "commsEvents", evidence: "comms.push", readsSynergy: false },
    { id: "teamEconomy", evidence: "const teamAvg=side=>", readsSynergy: false },
    { id: "individualRoleFit", evidence: "const role=posSkill(p)", readsSynergy: true },
  ];
  for (const candidate of candidates) gate(normalized.includes(candidate.evidence), "CANDIDATE_READ_POINT_MISSING", candidate.id);
  return {
    sourceSha256: sourceSha,
    rngCallSites: RNG_CALL_SITES,
    playerRoleMapping: { "上路": "entry", "打野": "lurker", "中路": "rifler", "下路": "awp", "輔助": "igl" },
    reachablePlayerRoles: ["entry", "lurker", "rifler", "awp", "igl"],
    supportProfileReads: ["coo", "tac", "com", "pos", "vis"],
    learningSimulatorRead: false,
    candidates,
  };
}

async function main() {
  gate(process.argv.slice(2).length === 0, "CLI_FLAGS_FORBIDDEN");
  const liveFpsSource = readFileSync(FPS_FILE, "utf8");
  // R16-A is historical evidence.  View the current source through the
  // byte-exact R15 adapter rather than silently rebaselining its digest.
  const historical = csR15EvidenceSources(liveFpsSource);
  gate(historical?.r15, "R16A_HISTORICAL_ADAPTER");
  const fpsSource = historical.r15;
  const rosterSource = readFileSync(FPS_ROSTER_FILE, "utf8");
  const playerModelSource = readFileSync(PLAYER_MODEL_FILE, "utf8");
  const staticEvidence = staticAudit(fpsSource, rosterSource, playerModelSource);

  const tempRoot = mkdtempSync(join(tmpdir(), "esmo-cs-synergy-r16a-"));
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
        name: "cs-synergy-semantics-r16a-memory-transform",
        enforce: "pre",
        transform(code, id) {
          if (resolve(id.split("?")[0]).toLowerCase() !== FPS_FILE.toLowerCase()) return null;
          if (!(id.split("?")[1] ?? "").includes("cs-r16a")) return null;
          transformSeen += 1;
          gate(code === liveFpsSource, "VITE_SOURCE_MISMATCH");
          return { code: instrumentSource(fpsSource), map: null };
        },
      }],
    });

    const module = await vite.ssrLoadModule(`${FPS_MODULE_ID}?cs-r16a=memory`);
    gate(transformSeen === 1, "TRANSFORM_COUNT", String(transformSeen));
    const api = module.__CS_SYNERGY_R16A_TEST_API__;
    gate(typeof api?.simulateFps === "function", "SIMULATOR_EXPORT_MISSING");
    gate(Array.isArray(api?.ROSTER), "ROSTER_EXPORT_MISSING");
    gate(api?.TACTICS_DB?.inferno, "TACTICS_EXPORT_MISSING");

    const mapKey = "inferno";
    const tTactic = clone(api.TACTICS_DB.inferno.t.find((item) => item.id === "t_aexec"));
    const ctTactic = clone(api.TACTICS_DB.inferno.ct.find((item) => item.id === "c_std"));
    gate(tTactic?.id === "t_aexec" && ctTactic?.id === "c_std", "TACTIC_FIXTURE_MISSING");
    const baseRoster = clone(api.ROSTER);
    const cases = [
      { id: "player-t1-entry", side: "player", targetId: "t1", role: "entry", before: 70, after: 50 },
      { id: "player-t2-rifler", side: "player", targetId: "t2", role: "rifler", before: 82, after: 62 },
      { id: "player-t3-awp", side: "player", targetId: "t3", role: "awp", before: 80, after: 60 },
      { id: "player-t4-lurker", side: "player", targetId: "t4", role: "lurker", before: 78, after: 58 },
      { id: "player-t5-igl", side: "player", targetId: "t5", role: "igl", before: 88, after: 68 },
      { id: "ct-ct5-support", side: "ct", targetId: "ct5", role: "support", before: 90, after: 70 },
      { id: "ct-ct1-igl-control", side: "ct", targetId: "ct1", role: "igl", before: 86, after: 66 },
    ];
    for (const item of cases) {
      const target = baseRoster.find((player) => player.id === item.targetId);
      gate(target?.role === item.role, "ROLE_FIXTURE_MISMATCH", `${item.id} actual=${target?.role}`);
    }

    const baselineBySeed = new Map();
    const records = [];
    for (const seed of FIXED_SEEDS) {
      const scenario = { mapKey, tTactic, ctTactic, seed, roster: baseRoster };
      const baselineA = runOnce(api, scenario);
      const baselineB = runOnce(api, scenario);
      gate(baselineA.outputSha256 === baselineB.outputSha256, "BASELINE_NONDETERMINISTIC", String(seed));
      gate(baselineA.rngCount === baselineB.rngCount && baselineA.rngSha256 === baselineB.rngSha256,
        "BASELINE_RNG_NONDETERMINISTIC", String(seed));
      baselineBySeed.set(seed, baselineA);
    }

    for (const item of cases) {
      const roster = treatmentRoster(baseRoster, item.targetId, item.before, item.after);
      for (const seed of FIXED_SEEDS) {
        const baseline = baselineBySeed.get(seed);
        const candidateScenario = { mapKey, tTactic, ctTactic, seed, roster };
        const candidateA = runOnce(api, candidateScenario);
        const candidateB = runOnce(api, candidateScenario);
        gate(candidateA.outputSha256 === candidateB.outputSha256, "CANDIDATE_NONDETERMINISTIC", `${item.id} seed=${seed}`);
        gate(candidateA.rngCount === candidateB.rngCount && candidateA.rngSha256 === candidateB.rngSha256,
          "CANDIDATE_RNG_NONDETERMINISTIC", `${item.id} seed=${seed}`);
        records.push({
          caseId: item.id,
          side: item.side,
          targetId: item.targetId,
          role: item.role,
          seed,
          before: item.before,
          after: item.after,
          baselineOutputSha256: baseline.outputSha256,
          candidateOutputSha256: candidateA.outputSha256,
          baselineRngCount: baseline.rngCount,
          candidateRngCount: candidateA.rngCount,
          baselineRngSha256: baseline.rngSha256,
          candidateRngSha256: candidateA.rngSha256,
          outputChanged: baseline.outputSha256 !== candidateA.outputSha256,
          rngChanged: baseline.rngCount !== candidateA.rngCount || baseline.rngSha256 !== candidateA.rngSha256,
        });
      }
    }
    gate(records.length === cases.length * FIXED_SEEDS.length, "PAIRED_RUN_COUNT", String(records.length));

    const byCase = cases.map((item) => {
      const rows = records.filter((record) => record.caseId === item.id);
      return {
        ...item,
        pairedRuns: rows.length,
        outputChangedSeeds: rows.filter((record) => record.outputChanged).length,
        rngChangedSeeds: rows.filter((record) => record.rngChanged).length,
        rngCounts: [...new Set(rows.flatMap((record) => [record.baselineRngCount, record.candidateRngCount]))].sort((a, b) => a - b),
      };
    });
    const suiteEvidence = {
      schema: SCHEMA,
      sourceSha256: SOURCE_SHA256,
      seedGenerationVersion: SEED_GENERATION_VERSION,
      seedSetSha256: SEED_SET_SHA256,
      staticEvidence,
      cases: byCase,
      records,
    };
    const suiteSha256 = sha256(json(suiteEvidence));

    console.log(`schema: ${SCHEMA}`);
    console.log(`sourceSha256: ${SOURCE_SHA256}`);
    console.log(`static rand() call sites: ${RNG_CALL_SITES}`);
    console.log(`matrix: ${cases.length} focused treatments x ${FIXED_SEEDS.length} seeds = ${records.length} paired runs`);
    for (const item of byCase) {
      console.log(`case ${item.id}: outputChangedSeeds=${item.outputChangedSeeds}/${item.pairedRuns} rngChangedSeeds=${item.rngChangedSeeds}/${item.pairedRuns} rngCounts=${item.rngCounts.join(",")}`);
    }
    console.log(`${SCHEMA}: ${suiteSha256}`);

    const playerRows = records.filter((record) => record.side === "player");
    const playerChanged = playerRows.filter((record) => record.outputChanged || record.rngChanged);
    gate(playerChanged.length === 0, "PLAYER_SYNERGY_NOT_ZERO_DIFF", JSON.stringify(playerChanged.slice(0, 3)));
    const ctSupportRows = records.filter((record) => record.caseId === "ct-ct5-support");
    gate(ctSupportRows.some((record) => record.outputChanged), "CT_SUPPORT_PATH_NOT_OBSERVED");
    const ctControlRows = records.filter((record) => record.caseId === "ct-ct1-igl-control");
    gate(ctControlRows.every((record) => !record.outputChanged && !record.rngChanged), "CT_NON_SUPPORT_CONTROL_CHANGED");
    gate(EXPECTED_SUITE_SHA256 !== "__LOCK_AFTER_REVIEW__", "SUITE_NOT_LOCKED", suiteSha256);
    gate(suiteSha256 === EXPECTED_SUITE_SHA256, "SUITE_SHA256_MISMATCH",
      `expected=${EXPECTED_SUITE_SHA256}\nactual=${suiteSha256}`);
    console.log("CS Synergy Semantics / Read-Chain R16-A: PASS");
  } finally {
    if (vite) await vite.close();
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
