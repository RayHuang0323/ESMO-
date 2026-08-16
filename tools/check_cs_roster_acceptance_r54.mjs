#!/usr/bin/env node
// R54: first-version CS roster / gameplay balance acceptance.
// The verifier uses the existing deterministic simulator in memory. It does
// not add a production consumer, RNG, scenario, seed, or balance coefficient.
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FPS_FILE = resolve(ROOT, "src/battle/fps/EsportsFPS3D.jsx");
const FPS_MODULE_ID = "/src/battle/fps/EsportsFPS3D.jsx";
const MAP_KEY = "inferno";
const T_TACTIC_ID = "t_aexec";
const CT_TACTIC_ID = "c_std";
const FIXED_SEEDS = Object.freeze([
  3978742910, 4200255727, 541349949, 1011896540, 44863398, 1878380147,
]);
const ACTIVE_KEYS = Object.freeze([
  "rxn", "acc", "apm", "pos", "vis", "tac", "dec", "adp",
  "cou", "str", "foc", "res", "com", "led", "coo",
]);
const ROLE_ORDER = Object.freeze(["entry", "rifler", "awp", "lurker", "igl"]);
const ROLE_TARGETS = Object.freeze({ entry: "t1", rifler: "t2", awp: "t3", lurker: "t4", igl: "t5" });
const ROLE_SIGNATURES = Object.freeze({
  entry: Object.freeze(["rxn", "apm", "cou"]),
  rifler: Object.freeze(["acc", "rxn", "pos", "foc"]),
  awp: Object.freeze(["acc", "foc", "pos"]),
  lurker: Object.freeze(["dec", "pos", "str", "adp"]),
  igl: Object.freeze(["tac", "dec", "com", "led"]),
});
const THRESHOLDS = Object.freeze({ adp: 80, tac: 90, com: 88, led: 90, coo: 90 });
const EXPECTED_RNG_TOKENS = 21;
const RETURN_MARKER = "return { EsportsFPS3D, buildMatchResult };";
const EXPORT_MARKER = "export { EsportsFPS3D, buildMatchResult };";
const SIMULATE_MARKER = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster){";

function gate(ok, code, detail = "") {
  if (!ok) throw new Error(`[${code}]${detail ? ` ${detail}` : ""}`);
}
function clone(value) { return structuredClone(value); }
function json(value) { return JSON.stringify(value); }
function sha(value) { return createHash("sha256").update(value).digest("hex"); }
function clamp(value, min = 1, max = 99) { return Math.max(min, Math.min(max, value)); }
function mean(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
function pct(value, digits = 2) { return round(value * 100, digits); }
function digest(value) { return sha(json(value)); }
function inputDigest(mapKey, tacticT, tacticCT, roster) {
  return digest({ mapKey, tacticT, tacticCT, roster });
}

function randTokens(source) { return source.match(/\brand\s*\(\s*\)/g) ?? []; }

async function loadApi(source) {
  const transforms = [
    ["return export", RETURN_MARKER,
      "return { EsportsFPS3D, buildMatchResult, simulateFps, ROSTER, TACTICS_DB, persStat, aggr };"],
    ["module export", EXPORT_MARKER, [
      "const __CS_R54_TEST_API__ = Object.freeze({",
      "  simulateFps: __FPS3D_MODULE.simulateFps, ROSTER: __FPS3D_MODULE.ROSTER, TACTICS_DB: __FPS3D_MODULE.TACTICS_DB, persStat: __FPS3D_MODULE.persStat, aggr: __FPS3D_MODULE.aggr,",
      "});",
      "export { EsportsFPS3D, buildMatchResult, __CS_R54_TEST_API__ };",
    ].join("\n")],
  ];
  let seen = 0;
  const tempRoot = mkdtempSync(join(tmpdir(), "esmo-cs-r54-roster-"));
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
        name: "cs-roster-r54-memory",
        enforce: "pre",
        transform(code, id) {
          if (resolve(id.split("?")[0]).toLowerCase() !== FPS_FILE.toLowerCase()) return null;
          seen++;
          gate(code === source, "VITE_SOURCE_MISMATCH");
          let transformed = source;
          for (const [name, marker, replacement] of transforms) {
            gate(transformed.split(marker).length - 1 === 1, "TRANSFORM_MARKER_COUNT", name);
            transformed = transformed.replace(marker, replacement);
          }
          let roundTrip = transformed;
          for (const [, marker, replacement] of [...transforms].reverse()) roundTrip = roundTrip.replace(replacement, marker);
          gate(roundTrip === source, "TRANSFORM_NOT_REVERSIBLE");
          gate(randTokens(transformed).length === randTokens(source).length, "RNG_TOKEN_COUNT_CHANGED");
          return { code: transformed, map: null };
        },
      }],
    });
    const loaded = await vite.ssrLoadModule(`${FPS_MODULE_ID}?r54=roster-acceptance`);
    gate(seen === 1, "TRANSFORM_LOAD_COUNT", String(seen));
    gate(loaded.__CS_R54_TEST_API__, "TEST_API_MISSING");
    return loaded.__CS_R54_TEST_API__;
  } finally {
    if (vite) await vite.close();
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function verifyRosterShape(api) {
  gate(Array.isArray(api.ROSTER) && api.ROSTER.length === 10, "ROSTER_SHAPE", String(api.ROSTER?.length));
  gate(typeof api.simulateFps === "function" && typeof api.persStat === "function" && typeof api.aggr === "function", "API_SHAPE");
  const ids = new Set(api.ROSTER.map((player) => player.id));
  gate(ids.size === 10, "ROSTER_DUPLICATE_ID");
  for (const player of api.ROSTER) {
    gate(player.side === "t" || player.side === "ct", "ROSTER_SIDE", player.id);
    gate(typeof player.role === "string", "ROSTER_ROLE", player.id);
    for (const key of ACTIVE_KEYS) gate(Number.isFinite(player.stats?.[key]), "ACTIVE_STAT_MISSING", `${player.id}/${key}`);
  }
  for (const role of ROLE_ORDER) gate(api.ROSTER.some((player) => player.side === "t" && player.role === role), "ROLE_MISSING", role);
}

function effectiveProfile(api, roster) {
  const rows = roster.map((player) => {
    const effective = Object.fromEntries(ACTIVE_KEYS.map((key) => [key, api.persStat(player, key)]));
    return { id: player.id, name: player.name, side: player.side, role: player.role, effective, aggr: api.aggr(player) };
  });
  const cells = rows.flatMap((row) => ACTIVE_KEYS.map((key) => row.effective[key]));
  const thresholdIncidence = Object.fromEntries(Object.entries(THRESHOLDS).map(([key, threshold]) => {
    const hits = rows.filter((row) => row.effective[key] >= threshold).length;
    return [key, { threshold, hits, total: rows.length, rate: pct(hits / rows.length) }];
  }));
  const roleProfileEntries = ROLE_ORDER.map((role) => {
    const roleRows = rows.filter((row) => row.role === role);
    const signature = ROLE_SIGNATURES[role];
    const signatureMean = mean(roleRows.flatMap((row) => signature.map((key) => row.effective[key])));
    const rosterSignatureMean = mean(rows.flatMap((row) => signature.map((key) => row.effective[key])));
    const strategyMean = role === "igl" ? mean(roleRows.flatMap((row) => ["tac", "dec", "com", "led"].map((key) => row.effective[key]))) : null;
    const combatMean = role === "igl" ? mean(roleRows.flatMap((row) => ["rxn", "acc", "apm"].map((key) => row.effective[key]))) : null;
    return [role, {
      players: roleRows.map((row) => row.id),
      signature,
      signatureMean: round(signatureMean),
      rosterSignatureMean: round(rosterSignatureMean),
      advantage: round(signatureMean - rosterSignatureMean),
      stats: Object.fromEntries(ACTIVE_KEYS.map((key) => [key, round(mean(roleRows.map((row) => row.effective[key])))])),
      strategyMean: strategyMean === null ? null : round(strategyMean),
      combatMean: combatMean === null ? null : round(combatMean),
      strategyOverCombat: strategyMean === null ? null : round(strategyMean - combatMean),
    }];
  });
  return {
    playerCount: rows.length,
    activeStatCells: cells.length,
    high90: cells.filter((value) => value >= 90).length,
    high90Rate: pct(cells.filter((value) => value >= 90).length / cells.length),
    clamp99: cells.filter((value) => value === 99).length,
    clamp99Rate: pct(cells.filter((value) => value === 99).length / cells.length),
    thresholdIncidence,
    retreatAggrBelow082: rows.filter((row) => row.aggr < 0.82).length,
    aggr: { min: round(Math.min(...rows.map((row) => row.aggr))), max: round(Math.max(...rows.map((row) => row.aggr))), mean: round(mean(rows.map((row) => row.aggr))) },
    roleProfiles: Object.fromEntries(roleProfileEntries),
  };
}

function changedRoster(base, predicate, keys, delta) {
  const next = clone(base);
  for (const player of next) {
    if (!predicate(player)) continue;
    for (const key of keys) player.stats[key] = clamp(player.stats[key] + delta);
  }
  return next;
}

function buildVariants(base) {
  const variants = {
    baseline: clone(base),
    stronger: changedRoster(base, (player) => player.side === "t", ACTIVE_KEYS, 8),
    weaker: changedRoster(base, (player) => player.side === "t", ACTIVE_KEYS, -8),
  };
  for (const role of ROLE_ORDER) {
    const targetId = ROLE_TARGETS[role];
    variants[`role-${role}`] = changedRoster(base, (player) => player.id === targetId, ROLE_SIGNATURES[role], 8);
  }
  return variants;
}

function summarizeResult(result) {
  gate(result && Array.isArray(result.frames) && Array.isArray(result.players), "SIM_RESULT_SHAPE");
  gate(result.frames.length > 0 && result.roundHist?.length > 0, "SIM_EMPTY_RESULT");
  const events = result.frames.flatMap((frame) => frame.events ?? []);
  const comms = result.frames.flatMap((frame) => frame.comms ?? []);
  const stateCounts = {};
  for (const frame of result.frames) {
    for (const player of frame.players ?? []) {
      stateCounts[player.role] ??= {};
      stateCounts[player.role][player.state] = (stateCounts[player.role][player.state] ?? 0) + 1;
    }
  }
  const tPlayers = result.players.filter((player) => player.side === "t");
  const ctPlayers = result.players.filter((player) => player.side === "ct");
  const teamKills = { t: tPlayers.reduce((sum, player) => sum + player.k, 0), ct: ctPlayers.reduce((sum, player) => sum + player.k, 0) };
  const playerKillShare = result.players.map((player) => ({ id: player.id, role: player.role, side: player.side, share: teamKills[player.side] ? player.k / teamKills[player.side] : 0 }));
  const roleKills = Object.fromEntries([...new Set(result.players.map((player) => player.role))].map((role) => [role, result.players.filter((player) => player.role === role).reduce((sum, player) => sum + player.k, 0)]));
  return {
    tScore: result.tScore,
    ctScore: result.ctScore,
    rounds: result.rounds,
    tWin: result.tScore > result.ctScore,
    teamKills,
    roleKills,
    maxPlayerKillShare: Math.max(...playerKillShare.map((row) => row.share)),
    maxPlayerKill: playerKillShare.sort((a, b) => b.share - a.share)[0],
    maxRating: Math.max(...result.players.map((player) => player.rating)),
    avgRating: mean(result.players.map((player) => player.rating)),
    players: result.players.map((player) => ({ id: player.id, side: player.side, role: player.role, k: player.k, d: player.d, adr: player.adr, rating: player.rating, clutches: player.clutches, entryKills: player.entryKills })),
    eventTypes: Object.fromEntries([...new Set(events.map((event) => event.type))].sort().map((type) => [type, events.filter((event) => event.type === type).length])),
    comms: comms.length,
    stateCounts,
  };
}

function runScenario(api, tacticT, tacticCT, seed, roster) {
  const passedRoster = clone(roster);
  const before = inputDigest(MAP_KEY, tacticT, tacticCT, passedRoster);
  const result = api.simulateFps(MAP_KEY, tacticT, tacticCT, seed, passedRoster);
  gate(before === inputDigest(MAP_KEY, tacticT, tacticCT, passedRoster), "SIM_MUTATED_INPUT", String(seed));
  const summary = summarizeResult(result);
  return { seed, digest: digest(result), summary };
}

function aggregate(rows) {
  const tScores = rows.map((row) => row.summary.tScore);
  const ctScores = rows.map((row) => row.summary.ctScore);
  const tWins = rows.filter((row) => row.summary.tWin).length;
  const tKills = rows.map((row) => row.summary.teamKills.t);
  const ctKills = rows.map((row) => row.summary.teamKills.ct);
  const maxShares = rows.map((row) => row.summary.maxPlayerKillShare);
  const ratings = rows.flatMap((row) => row.summary.players.map((player) => player.rating));
  const stateTotals = {};
  for (const row of rows) for (const [role, states] of Object.entries(row.summary.stateCounts)) {
    stateTotals[role] ??= {};
    for (const [state, count] of Object.entries(states)) stateTotals[role][state] = (stateTotals[role][state] ?? 0) + count;
  }
  return {
    matches: rows.length,
    tWins,
    tWinRate: pct(tWins / rows.length),
    tScoreMean: round(mean(tScores)),
    ctScoreMean: round(mean(ctScores)),
    roundDiffMean: round(mean(rows.map((row) => row.summary.tScore - row.summary.ctScore))),
    tKillsMean: round(mean(tKills)),
    ctKillsMean: round(mean(ctKills)),
    maxPlayerKillShare: round(Math.max(...maxShares)),
    meanPlayerRating: round(mean(ratings)),
    maxRating: round(Math.max(...ratings)),
    stateTotals,
    eventTotals: Object.fromEntries([...new Set(rows.flatMap((row) => Object.keys(row.summary.eventTypes)))].sort().map((type) => [type, rows.reduce((sum, row) => sum + (row.summary.eventTypes[type] ?? 0), 0)])),
    commsTotal: rows.reduce((sum, row) => sum + row.summary.comms, 0),
  };
}

function compactAggregate(summary) {
  return {
    matches: summary.matches,
    tWinRate: summary.tWinRate,
    tScoreMean: summary.tScoreMean,
    ctScoreMean: summary.ctScoreMean,
    roundDiffMean: summary.roundDiffMean,
    tKillsMean: summary.tKillsMean,
    ctKillsMean: summary.ctKillsMean,
    maxPlayerKillShare: summary.maxPlayerKillShare,
    meanPlayerRating: summary.meanPlayerRating,
    maxRating: summary.maxRating,
    engageFramesByRole: Object.fromEntries(Object.entries(summary.stateTotals).map(([role, states]) => [role, states.ENGAGE ?? 0])),
    eventTotals: summary.eventTotals,
    commsTotal: summary.commsTotal,
  };
}

function roleFocusSummary(api, variants, baselineRows, tacticT, tacticCT) {
  const baselineBySeed = Object.fromEntries(baselineRows.map((row) => [row.seed, row.summary]));
  const rows = {};
  for (const role of ROLE_ORDER) {
    const variant = `role-${role}`;
    const focused = FIXED_SEEDS.map((seed) => runScenario(api, tacticT, tacticCT, seed, variants[variant]));
    const deltas = focused.map((row) => {
      const base = baselineBySeed[row.seed];
      const targetId = ROLE_TARGETS[role];
      const focusedPlayer = row.summary.players.find((player) => player.id === targetId);
      const baselinePlayer = base.players.find((player) => player.id === targetId);
      return {
        seed: row.seed,
        ratingDelta: focusedPlayer.rating - baselinePlayer.rating,
        adrDelta: focusedPlayer.adr - baselinePlayer.adr,
        kDelta: focusedPlayer.k - baselinePlayer.k,
        dDelta: focusedPlayer.d - baselinePlayer.d,
      };
    });
    rows[role] = { targetId: ROLE_TARGETS[role], aggregate: aggregate(focused), deltas, meanRatingDelta: round(mean(deltas.map((row) => row.ratingDelta))), meanAdrDelta: round(mean(deltas.map((row) => row.adrDelta))), meanKDelta: round(mean(deltas.map((row) => row.kDelta))) };
  }
  return rows;
}

function acceptanceGates(api, source, profile, variants, aggregates, focus) {
  gate(source.includes(SIMULATE_MARKER), "SIMULATOR_MARKER_MISSING");
  gate(randTokens(source).length === EXPECTED_RNG_TOKENS, "RNG_SOURCE_CHECK", String(randTokens(source).length));
  gate(profile.activeStatCells === 150, "ACTIVE_STAT_CELL_COUNT", String(profile.activeStatCells));
  gate(profile.high90Rate < 35, "HIGH90_MASS_TRIGGER", `${profile.high90Rate}%`);
  gate(profile.clamp99Rate < 8, "CLAMP99_MASS_TRIGGER", `${profile.clamp99Rate}%`);
  gate(profile.thresholdIncidence.tac.rate <= 60, "THRESHOLD_MASS_TRIGGER", "tac");
  gate(profile.thresholdIncidence.com.rate <= 60 && profile.thresholdIncidence.led.rate <= 60 && profile.thresholdIncidence.coo.rate <= 60, "THRESHOLD_MASS_TRIGGER", "com/led/coo");
  gate(profile.roleProfiles.igl.strategyOverCombat >= 5, "IGL_ROLE_COLLAPSE", String(profile.roleProfiles.igl.strategyOverCombat));
  gate(profile.roleProfiles.awp.advantage < 12, "AWP_CORE_OVERWEIGHT", String(profile.roleProfiles.awp.advantage));
  gate(profile.aggr.max < 1.15 && profile.aggr.min >= 0.2, "AGGRESSION_CLAMP_INVALID");
  gate(aggregates.stronger.tScoreMean > aggregates.weaker.tScoreMean || aggregates.stronger.roundDiffMean > aggregates.weaker.roundDiffMean, "TEAM_ORDERING_COLLAPSE", "stronger must improve T aggregate");
  gate(aggregates.baseline.maxPlayerKillShare <= 0.75, "BASELINE_FRAG_COLLAPSE", String(aggregates.baseline.maxPlayerKillShare));
  gate(aggregates.baseline.maxRating <= 4, "BASELINE_RATING_OUTLIER", String(aggregates.baseline.maxRating));
  for (const [variant, summary] of Object.entries(aggregates)) {
    gate(summary.maxPlayerKillShare <= 0.8, "VARIANT_FRAG_COLLAPSE", `${variant}/${summary.maxPlayerKillShare}`);
  }
  for (const role of ROLE_ORDER) {
    gate(Number.isFinite(focus[role].meanRatingDelta), "ROLE_FOCUS_MISSING", role);
    gate(focus[role].aggregate.matches === FIXED_SEEDS.length, "ROLE_FOCUS_MATCH_COUNT", role);
  }
  gate(Object.keys(variants).length === 8, "VARIANT_COUNT", String(Object.keys(variants).length));
}

async function main() {
  const source = readFileSync(FPS_FILE, "utf8");
  const sourceDigest = sha(source);
  const api = await loadApi(source);
  verifyRosterShape(api);
  const baseline = clone(api.ROSTER);
  const variants = buildVariants(baseline);
  const tacticT = api.TACTICS_DB?.[MAP_KEY]?.t?.find((tactic) => tactic.id === T_TACTIC_ID);
  const tacticCT = api.TACTICS_DB?.[MAP_KEY]?.ct?.find((tactic) => tactic.id === CT_TACTIC_ID);
  gate(tacticT && tacticCT, "FIXED_TACTIC_MISSING");

  const profile = effectiveProfile(api, baseline);
  const rowsByVariant = {};
  for (const [name, roster] of Object.entries(variants)) rowsByVariant[name] = FIXED_SEEDS.map((seed) => runScenario(api, tacticT, tacticCT, seed, roster));
  const aggregates = Object.fromEntries(Object.entries(rowsByVariant).map(([name, rows]) => [name, aggregate(rows)]));
  const baselineRows = rowsByVariant.baseline;
  const determinism = FIXED_SEEDS.map((seed, index) => {
    const repeat = runScenario(api, tacticT, tacticCT, seed, baseline);
    return { seed, sameDigest: repeat.digest === baselineRows[index].digest, digest: repeat.digest };
  });
  determinism.forEach((row) => gate(row.sameDigest, "NON_DETERMINISTIC", String(row.seed)));
  const focus = roleFocusSummary(api, variants, baselineRows, tacticT, tacticCT);
  acceptanceGates(api, source, profile, variants, aggregates, focus);

  const output = {
    verifier: "check_cs_roster_acceptance_r54",
    status: "PASS",
    fixedScenario: { map: MAP_KEY, tTactic: T_TACTIC_ID, ctTactic: CT_TACTIC_ID, seeds: FIXED_SEEDS },
    sourceDigest,
    sourceInvariant: { productionConsumerAdded: false, productionBalanceChanged: false, rngTokens: randTokens(source).length },
    baselineProfile: profile,
    variants: Object.fromEntries(Object.entries(aggregates).map(([name, value]) => [name, compactAggregate(value)])),
    deterministic: { matches: determinism.length, allStable: true, digests: determinism },
    roleFocusedComparison: Object.fromEntries(Object.entries(focus).map(([role, value]) => [role, {
      targetId: value.targetId,
      aggregate: compactAggregate(value.aggregate),
      deltas: value.deltas,
      meanRatingDelta: value.meanRatingDelta,
      meanAdrDelta: value.meanAdrDelta,
      meanKDelta: value.meanKDelta,
    }])),
    acceptance: {
      roleIdentity: "PASS",
      newVsHighDistribution: "PASS",
      statStacking: "PASS",
      thresholdClampIncidence: "PASS",
      teamStrengthOrdering: "PASS",
      gameplaySanity: "PASS",
      readyLimitedSideEffects: "PASS",
      productionBalancePatch: "NONE",
    },
  };
  console.log(JSON.stringify(output, null, 2));
  console.log("CS Roster Acceptance R54: PASS");
}

main().catch((error) => {
  console.error(`CS Roster Acceptance R54: FAIL ${error.stack || error.message}`);
  process.exitCode = 1;
});
