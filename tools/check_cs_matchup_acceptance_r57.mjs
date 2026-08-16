#!/usr/bin/env node
// R57: deterministic CS AI-team matchup acceptance.
// This verifier observes the existing simulator through an in-memory Vite
// transform. It does not change roster data, stats, RNG, seeds, map, tactics,
// coefficients, or production behavior.
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { CS_AI_TEAMS } from "../src/data/csAiTeams.js";
import { toFpsRoster } from "../src/battle/fps/fpsRoster.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FPS_FILE = resolve(ROOT, "src/battle/fps/EsportsFPS3D.jsx");
const FPS_MODULE_ID = "/src/battle/fps/EsportsFPS3D.jsx";
const MAP_KEY = "inferno";
const FIXED_SEEDS = Object.freeze([
  3978742910, 4200255727, 541349949, 1011896540, 44863398, 1878380147,
]);
const EXPECTED_RNG_TOKENS = 21;
const ACTIVE_STAT_KEYS = Object.freeze([
  "rxn", "acc", "apm", "pos", "vis", "tac", "dec", "adp",
  "cou", "str", "foc", "res", "com", "led", "coo", "lrn",
]);
const THRESHOLD_KEYS = Object.freeze({ adp: 80, tac: 90, com: 88, led: 90, coo: 90 });
const RETURN_MARKER = "return { EsportsFPS3D, buildMatchResult };";
const EXPORT_MARKER = "export { EsportsFPS3D, buildMatchResult };";
const SIMULATE_MARKER = "function simulateFps(mapKey,tacticT,tacticCT,seed=42,roster){";

// R57 accepts the current roster under the same fixed simulator treatment as
// R54. Production has no style->tactic adapter yet; inventing one in this
// verifier would confound roster strength with an unshipped tactical system.
const FIXED_TACTIC_IDS = Object.freeze({ t: "t_aexec", ct: "c_std" });

// Each pair is played in both side orientations. This keeps the suite small
// while preventing a single fixed T/CT assignment from deciding the result.
const MATCHUP_PAIRS = Object.freeze([
  ["ironvanguard", "neoncomets", "strong-vs-weak"],
  ["ironvanguard", "flamephoenix", "strong-vs-strong"],
  ["emeralddragon", "silvereagle", "mid-vs-mid"],
  ["flamephoenix", "shadowwolf", "awp-vs-aggressive"],
  ["shadowwolf", "emeralddragon", "aggressive-vs-tactical"],
  ["thunderbear", "iceguard", "synergy-vs-defense"],
  ["emeralddragon", "neoncomets", "tactical-vs-rookie"],
  ["flamephoenix", "iceguard", "awp-vs-defense"],
  ["thunderbear", "silvereagle", "synergy-vs-stable"],
  ["ironvanguard", "shadowwolf", "elite-vs-aggressive"],
]);

const OBSERVABLE_FUNCTIONS = Object.freeze([
  ["adaptiveRouteGoal", "function adaptiveRouteGoal(p,target,N){"],
  ["tacticalRouteKeys", "function tacticalRouteKeys(p,tactic,tr,RKF){"],
  ["adaptivePostPlantGoal", "function adaptivePostPlantGoal(p,planted,c4pos){"],
  ["tacticalRetakeRoute", "function tacticalRetakeRoute(p,tactic,N,c4pos){"],
  ["applyCommsHandoff", "function applyCommsHandoff(spotter,enemy,players,walls){"],
  ["leadershipRouteKeys", "function leadershipRouteKeys(p,tactic,tr,RKF,roster){"],
  ["synergyTradeCandidate", "function synergyTradeCandidate(attacker,victim,players,walls){"],
  ["leadershipFollowUpRoute", "function leadershipFollowUpRoute(leader,teammate,goal){"],
  ["leadershipFollowUpAfterKill", "function leadershipFollowUpAfterKill(victim,players,target,N){"],
  ["synergyCoverFollowUpRoute", "function synergyCoverFollowUpRoute(attacker,partner,victim){"],
  ["applyCommsBombAwareness", "function applyCommsBombAwareness(carrier,sitePos,players){"],
]);

function gate(ok, code, detail = "") {
  if (!ok) throw new Error(`[${code}]${detail ? ` ${detail}` : ""}`);
}
function json(value) { return JSON.stringify(value); }
function sha(value) { return createHash("sha256").update(value).digest("hex"); }
function digest(value) { return sha(json(value)); }
function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
function pct(value, digits = 1) { return round(value * 100, digits); }
function mean(values) { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0; }
function randTokens(source) { return source.match(/\brand\s*\(\s*\)/g) ?? []; }

function instrumentSource(source) {
  let transformed = source;
  for (const [name, marker] of OBSERVABLE_FUNCTIONS) {
    gate(transformed.split(marker).length - 1 === 1, "OBSERVABLE_MARKER_COUNT", name);
    const replacement = `${marker}globalThis.__CS_R57_EVENTS__?.("${name}");`;
    transformed = transformed.replace(marker, replacement);
  }
  return transformed;
}

async function loadApi(source) {
  const instrumented = instrumentSource(source);
  const transforms = [
    ["instrumentation", source, instrumented],
    ["return export", RETURN_MARKER,
      "return { EsportsFPS3D, buildMatchResult, simulateFps, ROSTER, TACTICS_DB, persStat, aggr };"],
    ["module export", EXPORT_MARKER, [
      "const __CS_R57_TEST_API__ = Object.freeze({",
      "  simulateFps: __FPS3D_MODULE.simulateFps, ROSTER: __FPS3D_MODULE.ROSTER, TACTICS_DB: __FPS3D_MODULE.TACTICS_DB, persStat: __FPS3D_MODULE.persStat, aggr: __FPS3D_MODULE.aggr,",
      "});",
      "export { EsportsFPS3D, buildMatchResult, __CS_R57_TEST_API__ };",
    ].join("\n")],
  ];
  const tempRoot = mkdtempSync(join(tmpdir(), "esmo-cs-r57-matchup-"));
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
        name: "cs-matchup-r57-memory",
        enforce: "pre",
        transform(code, id) {
          if (resolve(id.split("?")[0]).toLowerCase() !== FPS_FILE.toLowerCase()) return null;
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
    const loaded = await vite.ssrLoadModule(`${FPS_MODULE_ID}?r57=matchup-acceptance`);
    gate(loaded.__CS_R57_TEST_API__, "TEST_API_MISSING");
    return loaded.__CS_R57_TEST_API__;
  } finally {
    if (vite) await vite.close();
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function teamByKey(key) {
  const team = CS_AI_TEAMS.find((candidate) => candidate.key === key);
  gate(team, "TEAM_MISSING", key);
  return team;
}

function rosterFor(team, side) {
  const roster = toFpsRoster(team.roster, team.lineup);
  gate(Array.isArray(roster) && roster.length === 5, "ADAPTER_ROSTER_SHAPE", team.key);
  return roster.map((player, index) => ({
    ...player,
    id: `${side === "t" ? "t" : "ct"}${index + 1}`,
    side,
    _teamKey: team.key,
    _teamName: team.name,
    _teamStyle: team.style,
  }));
}

function combinedRoster(teamT, teamCT) {
  return [...rosterFor(teamT, "t"), ...rosterFor(teamCT, "ct")];
}

function findTactic(api, side) {
  const id = FIXED_TACTIC_IDS[side];
  const tactic = api.TACTICS_DB[MAP_KEY]?.[side]?.find((candidate) => candidate.id === id);
  gate(tactic, "TACTIC_MISSING", `${side}/fixed/${id}`);
  return tactic;
}

function emptyTeamRow(team) {
  return { key: team.key, name: team.name, style: team.style, matches: 0, wins: 0, roundsFor: 0, roundsAgainst: 0, kills: 0, damage: 0, rounds: 0 };
}

function emptyRoleRow(role) {
  return { role, matches: 0, kills: 0, damage: 0, entryKills: 0, clutches: 0, mvpRounds: 0, rounds: 0 };
}

function mergeFrameObservations(result, sourceById) {
  const commsByTeam = {};
  const stateTransitionsByTeam = {};
  const nameToPlayer = new Map(Object.values(sourceById).map((player) => [player.name, player]));
  let previousStates = null;
  for (const frame of result.frames ?? []) {
    for (const comm of frame.comms ?? []) {
      const name = typeof comm === "string" ? comm : comm?.name ?? comm?.player?.name ?? comm?.sender?.name;
      const player = nameToPlayer.get(name);
      if (player) commsByTeam[player._teamKey] = (commsByTeam[player._teamKey] ?? 0) + 1;
    }
    for (const player of frame.players ?? []) {
      const source = sourceById[player.id];
      if (!source) continue;
      const prior = previousStates?.get(player.id);
      if (prior !== undefined && prior !== player.state) {
        stateTransitionsByTeam[source._teamKey] = (stateTransitionsByTeam[source._teamKey] ?? 0) + 1;
      }
    }
    previousStates = new Map((frame.players ?? []).map((player) => [player.id, player.state]));
  }
  return { commsByTeam, stateTransitionsByTeam };
}

function observeResult(result, roster, events) {
  const sourceById = Object.fromEntries(roster.map((player) => [player.id, player]));
  const teamKeys = [...new Set(roster.map((player) => player._teamKey))];
  const roleRows = Object.fromEntries(["entry", "rifler", "awp", "lurker", "igl"].map((role) => [role, emptyRoleRow(role)]));
  const teams = Object.fromEntries(teamKeys.map((key) => [key, { matches: 1, wins: 0, roundsFor: 0, roundsAgainst: 0, kills: 0, damage: 0, comms: 0, stateTransitions: 0 }]));
  const rows = result.players ?? [];
  const frames = mergeFrameObservations(result, sourceById);
  for (const [key, count] of Object.entries(frames.commsByTeam)) if (teams[key]) teams[key].comms += count;
  for (const [key, count] of Object.entries(frames.stateTransitionsByTeam)) if (teams[key]) teams[key].stateTransitions += count;
  for (const player of rows) {
    const source = sourceById[player.id];
    if (!source) continue;
    const team = teams[source._teamKey];
    const role = roleRows[source.role];
    gate(team && role, "SIM_PLAYER_ID_MISSING", player.id);
    const kills = Number(player.k ?? 0);
    // The public player result exposes ADR, while per-round raw damage is only
    // present in the transient round summary. ADR × rounds is the stable
    // whole-match damage proxy used for cross-match role comparison.
    const damage = Number(player.adr ?? 0) * Number(result.rounds ?? 0);
    const entryKills = Number(player.entryKills ?? player.entry ?? 0);
    const clutches = Number(player.clutches ?? player.clutch ?? 0);
    const mvpRounds = Number(player.mvpRounds ?? player.mvpR ?? 0);
    team.kills += kills;
    team.damage += damage;
    role.matches += 1;
    role.kills += kills;
    role.damage += damage;
    role.entryKills += entryKills;
    role.clutches += clutches;
    role.mvpRounds += mvpRounds;
    role.rounds += Number(result.rounds ?? 0);
  }
  for (const roundResult of result.roundHist ?? []) {
    const winnerKey = roundResult.winner === "t" ? roster.find((player) => player.side === "t")._teamKey : roster.find((player) => player.side === "ct")._teamKey;
    const loserKey = teamKeys.find((key) => key !== winnerKey);
    if (teams[winnerKey]) teams[winnerKey].roundsFor += 1;
    if (teams[loserKey]) teams[loserKey].roundsAgainst += 1;
  }
  const tTeam = roster.find((player) => player.side === "t")._teamKey;
  const ctTeam = roster.find((player) => player.side === "ct")._teamKey;
  const winnerTeam = result.tScore > result.ctScore ? tTeam : ctTeam;
  teams[winnerTeam].wins += 1;
  return { teams, roleRows, eventCounts: Object.fromEntries(Object.entries(events).map(([key, value]) => [key, value])), rounds: Number(result.rounds ?? 0), tScore: result.tScore, ctScore: result.ctScore };
}

function addInto(target, source) {
  for (const [key, row] of Object.entries(source)) {
    if (!target[key]) target[key] = { ...row };
    else for (const field of Object.keys(row)) if (field !== "key" && field !== "name" && field !== "style" && field !== "role") target[key][field] = (target[key][field] ?? 0) + (row[field] ?? 0);
  }
}

function teamStrength(team) {
  const keys = ["reflex", "accuracy", "apm", "positioning", "mapAware", "tacticalIQ", "decision", "adaptability", "courage", "clutch", "focus", "resilience", "comms", "leadership", "synergy", "learning"];
  return mean(team.roster.flatMap((player) => keys.map((key) => Number(player.stats[key] ?? 0))));
}

function printTeamSummary(teams, strengths) {
  const order = Object.values(teams).sort((a, b) => (b.wins / Math.max(1, b.matches)) - (a.wins / Math.max(1, a.matches)) || b.roundDiff - a.roundDiff);
  console.log(`strength order: ${strengths.map((row) => `${row.key}=${round(row.strength)}`).join(" > ")}`);
  console.log(`matchup order: ${order.map((row) => `${row.key}=${row.wins}/${row.matches} (${pct(row.wins / Math.max(1, row.matches))}%)`).join(" > ")}`);
  for (const row of order) console.log(`team ${row.key}: win=${row.wins}/${row.matches}, rounds=${row.roundsFor}-${row.roundsAgainst}, K=${row.kills}, dmg=${round(row.damage)}, comms=${row.comms}, transitions=${row.stateTransitions}`);
}

function rosterThresholdSummary(api) {
  const players = CS_AI_TEAMS.flatMap((team) => rosterFor(team, "t"));
  const cells = players.flatMap((player) => ACTIVE_STAT_KEYS.map((key) => ({ key, value: Number(player.stats?.[key] ?? 0), effective: api.persStat(player, key) })));
  const rawNinetyPlus = cells.filter(({ value }) => value >= 90).length;
  const ninetyPlus = cells.filter(({ effective }) => effective >= 90).length;
  const clamp99 = cells.filter(({ value }) => value === 99).length;
  const effectiveClamp99 = cells.filter(({ effective }) => effective >= 99).length;
  const thresholds = Object.fromEntries(Object.entries(THRESHOLD_KEYS).map(([key, threshold]) => [key, cells.filter((cell) => cell.key === key && cell.effective >= threshold).length]));
  gate(cells.length === 640, "ROSTER_STAT_CELL_COUNT", String(cells.length));
  gate(clamp99 === 0 && effectiveClamp99 / cells.length < 0.02, "ROSTER_CLAMP_SPIKE", `${clamp99}/${effectiveClamp99}`);
  gate(ninetyPlus / cells.length < 0.12, "ROSTER_90_PLUS_SPIKE", String(ninetyPlus));
  return { cells: cells.length, rawNinetyPlus, ninetyPlus, clamp99, effectiveClamp99, thresholds };
}

async function main() {
  const source = readFileSync(FPS_FILE, "utf8");
  gate(source.includes(SIMULATE_MARKER), "SIMULATOR_MARKER_MISSING");
  gate(randTokens(source).length === EXPECTED_RNG_TOKENS, "PRODUCTION_RNG_TOKEN_COUNT", String(randTokens(source).length));
  for (const [, marker] of OBSERVABLE_FUNCTIONS) gate(source.includes(marker), "PRODUCTION_CONSUMER_MARKER_MISSING", marker);
  gate(CS_AI_TEAMS.length === 8, "AI_TEAM_COUNT", String(CS_AI_TEAMS.length));
  const api = await loadApi(source);
  const thresholdSummary = rosterThresholdSummary(api);
  const teamSnapshot = JSON.stringify(CS_AI_TEAMS);
  const teamRows = Object.fromEntries(CS_AI_TEAMS.map((team) => [team.key, emptyTeamRow(team)]));
  const roleRows = Object.fromEntries(["entry", "rifler", "awp", "lurker", "igl"].map((role) => [role, emptyRoleRow(role)]));
  const eventTotals = {};
  const matchupRows = [];
  const resultDigests = [];
  let totalMatches = 0;
  let neonWins = 0;
  let totalRounds = 0;
  let totalKills = 0;
  let totalAwpKills = 0;
  let totalEntryKills = 0;
  const runOne = (teamT, teamCT, category, seed, includeInSummary = true) => {
    const roster = combinedRoster(teamT, teamCT);
    const before = JSON.stringify(roster);
    const events = {};
    globalThis.__CS_R57_EVENTS__ = (name) => { events[name] = (events[name] ?? 0) + 1; };
    const result = api.simulateFps(MAP_KEY, findTactic(api, "t"), findTactic(api, "ct"), seed, roster);
    delete globalThis.__CS_R57_EVENTS__;
    gate(JSON.stringify(roster) === before, "SIM_MUTATED_INPUT", `${teamT.key}/${teamCT.key}/${seed}`);
    const observed = observeResult(result, roster, events);
    if (includeInSummary) {
      addInto(teamRows, observed.teams);
      addInto(roleRows, observed.roleRows);
      for (const [name, count] of Object.entries(observed.eventCounts)) eventTotals[name] = (eventTotals[name] ?? 0) + count;
    }
    const digestValue = digest({ result, roster });
    resultDigests.push(digestValue);
    if (includeInSummary) {
      totalMatches += 1;
      totalRounds += observed.rounds;
      totalKills += Object.values(observed.teams).reduce((sum, row) => sum + row.kills, 0);
      totalAwpKills += observed.roleRows.awp.kills;
      totalEntryKills += observed.roleRows.entry.entryKills;
      if (teamT.key === "neoncomets" && result.tScore > result.ctScore) neonWins += 1;
      if (teamCT.key === "neoncomets" && result.ctScore > result.tScore) neonWins += 1;
    }
    return { category, t: teamT.key, ct: teamCT.key, seed, tScore: result.tScore, ctScore: result.ctScore, rounds: observed.rounds, digest: digestValue };
  };
  for (const [firstKey, secondKey, category] of MATCHUP_PAIRS) {
    for (const [tKey, ctKey] of [[firstKey, secondKey], [secondKey, firstKey]]) {
      const teamT = teamByKey(tKey);
      const teamCT = teamByKey(ctKey);
      for (const seed of FIXED_SEEDS) matchupRows.push(runOne(teamT, teamCT, category, seed));
    }
  }
  const repeatA = teamByKey("ironvanguard");
  const repeatB = teamByKey("neoncomets");
  const repeat = runOne(repeatA, repeatB, "determinism-repeat", FIXED_SEEDS[0], false);
  gate(repeat.digest === matchupRows[0].digest, "DETERMINISM_DIGEST_MISMATCH");
  gate(JSON.stringify(CS_AI_TEAMS) === teamSnapshot, "TEAM_DATA_MUTATED");
  gate(totalMatches === MATCHUP_PAIRS.length * 2 * FIXED_SEEDS.length, "MATCH_COUNT", String(totalMatches));
  gate(neonWins > 0, "NEON_NO_UPSET", String(neonWins));
  const resultWinPct = Object.values(teamRows).map((row) => row.wins / Math.max(1, row.matches));
  gate(Math.max(...resultWinPct) < 1, "PERFECT_SUPPRESSION", String(Math.max(...resultWinPct)));
  gate(Math.min(...resultWinPct) > 0, "ZERO_WIN_TEAM", String(Math.min(...resultWinPct)));
  const awpKillShare = totalKills ? totalAwpKills / totalKills : 0;
  const entryKillShare = totalKills ? totalEntryKills / totalKills : 0;
  gate(awpKillShare < 0.55, "AWP_SYSTEMIC_SHARE", String(round(awpKillShare, 3)));
  gate(entryKillShare < 0.55, "ENTRY_SYSTEMIC_SHARE", String(round(entryKillShare, 3)));
  for (const name of ["adaptiveRouteGoal", "tacticalRouteKeys", "leadershipRouteKeys", "synergyTradeCandidate"]) gate((eventTotals[name] ?? 0) > 0, "CONSUMER_NOT_OBSERVED", name);
  const strengths = CS_AI_TEAMS.map((team) => ({ key: team.key, strength: teamStrength(team) })).sort((a, b) => b.strength - a.strength);
  const roundDiff = Object.fromEntries(Object.entries(teamRows).map(([key, row]) => [key, row.roundsFor - row.roundsAgainst]));
  for (const [key, value] of Object.entries(roundDiff)) teamRows[key].roundDiff = value;
  console.log(`matchups: ${MATCHUP_PAIRS.length} pairs x 2 sides x ${FIXED_SEEDS.length} seeds = ${totalMatches}; deterministic repeat=1`);
  console.log(`team styles: ${CS_AI_TEAMS.map((team) => `${team.key}/${team.style}/${team.roster.map((player) => player.csRole).join("+")}`).join("; ")}`);
  printTeamSummary(teamRows, strengths);
  for (const [firstKey, secondKey, category] of MATCHUP_PAIRS) {
    const rows = matchupRows.filter((row) => row.category === category);
    const firstWins = rows.filter((row) => (row.t === firstKey ? row.tScore > row.ctScore : row.ctScore > row.tScore)).length;
    console.log(`matchup ${category}: ${firstKey} ${firstWins}/${rows.length} vs ${secondKey}`);
  }
  console.log(`categories: ${[...new Set(matchupRows.map((row) => row.category))].join(", ")}`);
  console.log(`roles: ${Object.values(roleRows).map((row) => `${row.role}/K${row.kills}/Kpm${round(row.kills / Math.max(1, row.matches), 2)}/ADR${round(row.damage / Math.max(1, row.rounds), 1)}/D${round(row.damage)}/entry${row.entryKills}/clutch${row.clutches}`).join("; ")}`);
  console.log(`roster thresholds: cells=${thresholdSummary.cells}; raw90+=${thresholdSummary.rawNinetyPlus}; effective90+=${thresholdSummary.ninetyPlus}; raw99-clamp=${thresholdSummary.clamp99}; effective99-clamp=${thresholdSummary.effectiveClamp99}; ${Object.entries(thresholdSummary.thresholds).map(([key, count]) => `${key}>=${THRESHOLD_KEYS[key]}:${count}`).join(", ")}`);
  console.log(`rounds=${totalRounds}; kills=${totalKills}; awp kill share=${pct(awpKillShare)}%; entry kill share=${pct(entryKillShare)}%; neon wins=${neonWins}`);
  console.log(`consumer triggers: ${Object.entries(eventTotals).sort(([a], [b]) => a.localeCompare(b)).map(([name, count]) => `${name}=${count}`).join(", ")}`);
  console.log(`scenario: ${MAP_KEY}; fixed seeds=${FIXED_SEEDS.join(",")}; source RNG tokens=${randTokens(source).length}; deterministic digest=${sha(resultDigests.join("|"))}`);
  console.log("CS Matchup Acceptance R57: PASS");
}

main().catch((error) => {
  console.error(`CS Matchup Acceptance R57: FAIL ${error.message}`);
  process.exitCode = 1;
});
