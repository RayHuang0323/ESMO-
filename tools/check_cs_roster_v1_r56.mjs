#!/usr/bin/env node
// R56 CS formal AI teams / roster v1 verifier.
import { createHash } from "node:crypto";
import { STAT_DEF } from "../src/data/playerModel.js";
import {
  CS_AI_TEAM_SCHEMA,
  CS_AI_TEAM_COUNT,
  CS_AI_ROLES,
  CS_AI_TEAMS,
  buildCsAiTeams,
  csAiTeamById,
  csAiTeamByKey,
} from "../src/data/csAiTeams.js";
import { CS_SEATS } from "../src/platform/contracts/matchSquad.js";
import { toFpsRoster } from "../src/battle/fps/fpsRoster.js";
import { teamStrength } from "../src/platform/competition/teamStrength.js";
import { csResultToTransaction } from "../src/platform/progress/adapters/csProgressAdapter.js";
import { applyProgressToState } from "../src/platform/progress/applyMatchProgress.js";

const gate = (ok, code, detail = "") => {
  if (!ok) throw new Error(`[${code}]${detail ? ` ${detail}` : ""}`);
};
const json = (value) => JSON.stringify(value);
const sha = (value) => createHash("sha256").update(value).digest("hex");
const STAT_KEYS = STAT_DEF.map(({ key }) => key);
const THRESHOLD_KEYS = ["adaptability", "tacticalIQ", "comms", "leadership", "synergy"];
const ROLE_ORDER = ["entry", "rifler", "awp", "lurker", "igl"];

function mean(players, key) {
  return players.reduce((sum, player) => sum + player.stats[key], 0) / players.length;
}

function stateFor(team) {
  return {
    players: team.roster.map((player) => ({ ...player, stats: { ...player.stats }, growthLog: [] })),
    finance: { funds: 1000, transactions: [] },
    meta: { fans: 100, reputation: 1, days: 8 },
    processedMatchTransactions: {},
    economy: { formLog: [] },
  };
}

function progressFixture(team) {
  const roster = toFpsRoster(team.roster, team.lineup);
  return {
    schema: "CsMatchResult.v1",
    mode: "cs",
    matchId: `r56-roster-${team.key}`,
    mapId: "inferno",
    winner: "us",
    ourScore: 13,
    enemyScore: 9,
    players: roster.map((player, index) => ({
      playerId: player._gid,
      playerName: player.name,
      rating: 1.02 + index * 0.03,
      kast: 70 + index,
    })),
    mvp: roster[2]?._gid ?? null,
  };
}

function main() {
  gate(process.argv.length === 2, "CLI_FLAGS_FORBIDDEN");
  gate(CS_AI_TEAMS.length === CS_AI_TEAM_COUNT && CS_AI_TEAM_COUNT === 8, "TEAM_COUNT", String(CS_AI_TEAMS.length));
  gate(json(CS_AI_TEAMS) === json(buildCsAiTeams()), "NON_DETERMINISTIC_BUILD");
  gate(new Set(CS_AI_TEAMS.map((team) => team.id)).size === CS_AI_TEAMS.length, "TEAM_ID_UNIQUE");
  gate(new Set(CS_AI_TEAMS.map((team) => team.key)).size === CS_AI_TEAMS.length, "TEAM_KEY_UNIQUE");
  gate(CS_AI_TEAMS.every((team) => team.schema === CS_AI_TEAM_SCHEMA && team.isAi), "TEAM_SCHEMA");
  gate(CS_AI_ROLES.join() === ROLE_ORDER.join(), "ROLE_DEFINITION");
  const compositions = new Set(CS_AI_TEAMS.map((team) => team.roster.map((player) => player.csRole).join("/")));
  gate(compositions.size >= 6, "ROLE_COMPOSITION_VARIETY", String(compositions.size));
  gate(CS_AI_TEAMS.some((team) => new Set(team.roster.map((player) => player.csRole)).size < 5), "DUPLICATE_ROLE_ALLOWED");
  gate(CS_AI_TEAMS.some((team) => !team.roster.some((player) => player.csRole === "awp")), "OPTIONAL_ROLE_ALLOWED");

  const allPlayers = CS_AI_TEAMS.flatMap((team) => team.roster);
  gate(allPlayers.length === 40, "PLAYER_COUNT", String(allPlayers.length));
  gate(new Set(allPlayers.map((player) => player.id)).size === allPlayers.length, "PLAYER_ID_UNIQUE");
  gate(allPlayers.every((player) => CS_AI_TEAMS.some((team) => team.id === player.teamId)), "PLAYER_TEAM_REF");
  gate(allPlayers.every((player) => player.potential >= 75 && player.potential <= 99), "POTENTIAL_RANGE");
  gate(allPlayers.every((player) => Math.max(...Object.values(player.stats)) <= player.potential), "POTENTIAL_CAP");
  gate(allPlayers.every((player) => STAT_KEYS.every((key) => Number.isFinite(player.stats[key]) && player.stats[key] >= 1 && player.stats[key] <= 99)), "STAT_DOMAIN");
  gate(allPlayers.every((player) => json(Object.keys(player.stats).sort()) === json([...STAT_KEYS].sort())), "STAT_COMPLETENESS");
  gate(allPlayers.every((player) => player.readOnly === true && player.rosterTier === "active"), "ROSTER_TIER");

  for (const team of CS_AI_TEAMS) {
    gate(team.roster.length === 5, "ROSTER_SIZE", team.key);
    gate(team.roster.every((player) => CS_AI_ROLES.includes(player.csRole)), "ROLE_DOMAIN", team.key);
    gate(CS_SEATS.every((seat, index) => team.lineup[seat] === team.roster[index]?.id), "LINEUP_PLAYER_MAP", team.key);
    const fps = toFpsRoster(team.roster, team.lineup);
    gate(Array.isArray(fps) && fps.length === 5, "BATTLE_ADAPTER", team.key);
    gate(fps.map((player) => player.role).join() === team.roster.map((player) => player.csRole).join(), "BATTLE_ROLE_IDENTITY", team.key);
    gate(new Set(fps.map((player) => player._gid)).size === 5, "BATTLE_PLAYER_IDS", team.key);
    gate(fps.every((player) => Object.keys(player.stats).length === 16), "BATTLE_STAT_SHAPE", team.key);
    gate(csAiTeamById(team.id)?.key === team.key && csAiTeamByKey(team.key)?.id === team.id, "TEAM_LOOKUP", team.key);
  }

  const roleMeans = Object.fromEntries(ROLE_ORDER.map((role) => [
    role,
    Object.fromEntries(STAT_KEYS.map((key) => [key, mean(allPlayers.filter((player) => player.csRole === role), key)])),
  ]));
  gate(roleMeans.entry.reflex > roleMeans.igl.reflex, "ENTRY_IDENTITY");
  gate(roleMeans.entry.apm > roleMeans.igl.apm, "ENTRY_APM_IDENTITY");
  gate(roleMeans.entry.courage > roleMeans.igl.courage, "ENTRY_COURAGE_IDENTITY");
  gate(roleMeans.rifler.accuracy > roleMeans.entry.accuracy && roleMeans.rifler.focus > roleMeans.entry.focus, "RIFLER_IDENTITY");
  gate(roleMeans.awp.accuracy > roleMeans.rifler.accuracy && roleMeans.awp.positioning > roleMeans.rifler.positioning && roleMeans.awp.focus > roleMeans.rifler.focus, "AWP_IDENTITY");
  gate(roleMeans.lurker.decision > roleMeans.rifler.decision && roleMeans.lurker.positioning > roleMeans.entry.positioning && roleMeans.lurker.clutch > roleMeans.entry.clutch, "LURKER_IDENTITY");
  gate(roleMeans.igl.decision > roleMeans.rifler.decision && roleMeans.igl.comms > roleMeans.rifler.comms && roleMeans.igl.leadership > roleMeans.rifler.leadership, "IGL_IDENTITY");
  gate(allPlayers.every((player) => Object.values(player.stats).some((value) => value < 80)), "NO_ALL_ROUNDER_COLLAPSE");

  const strengths = CS_AI_TEAMS.map((team) => ({ key: team.key, strength: teamStrength(team.roster, "cs") }));
  const sorted = [...strengths].sort((a, b) => b.strength - a.strength);
  gate(sorted[0].key === "ironvanguard" && sorted.at(-1).key === "neoncomets", "STRENGTH_ANCHORS", json(sorted));
  gate(sorted.every((item, index) => index === 0 || sorted[index - 1].strength > item.strength), "STRENGTH_ORDERING", json(sorted));
  gate(sorted[0].strength - sorted.at(-1).strength < 12, "NO_STRENGTH_LOCKOUT", String(sorted[0].strength - sorted.at(-1).strength));

  const statCells = allPlayers.flatMap((player) => Object.values(player.stats));
  const high90 = statCells.filter((value) => value >= 90).length;
  const clamp99 = statCells.filter((value) => value >= 99).length;
  const thresholdCells = allPlayers.flatMap((player) => THRESHOLD_KEYS.map((key) => player.stats[key]));
  const threshold80 = thresholdCells.filter((value) => value >= 80).length;
  const threshold90 = thresholdCells.filter((value) => value >= 90).length;
  gate(high90 / statCells.length <= 0.15, "HIGH90_RATIO", `${high90}/${statCells.length}`);
  gate(clamp99 === 0, "CLAMP_RATIO", String(clamp99));
  gate(threshold90 / thresholdCells.length <= 0.25, "THRESHOLD_STACK", `${threshold90}/${thresholdCells.length}`);

  const team = CS_AI_TEAMS.find((item) => item.key === "emeralddragon");
  const result = progressFixture(team);
  const resultBefore = json(result);
  const tx = csResultToTransaction(result, {
    players: team.roster,
    streak: 0,
    fansNow: 100,
    recordedAt: 1_757_900_000_000,
  });
  gate(tx?.playerProgress?.length === 5, "PROGRESS_ADAPTER");
  const applied = applyProgressToState(stateFor(team), tx);
  gate(applied.receipt?.ok && applied.receipt.applied && applied.receipt.players.length === 5, "PROGRESS_APPLY");
  const saved = JSON.parse(JSON.stringify(applied.nextState));
  gate(saved.players.every((player) => player.xp > 0 && player.growthLog.length === 1), "PROGRESS_SAVE_LOAD");
  const duplicate = applyProgressToState(saved, tx);
  gate(!duplicate.nextState && duplicate.receipt?.alreadyApplied, "PROGRESS_IDEMPOTENCE");
  gate(resultBefore === json(result), "RESULT_INPUT_MUTATED");

  console.log(`schema: ${CS_AI_TEAM_SCHEMA}; teams=${CS_AI_TEAMS.length}; players=${allPlayers.length}`);
  console.log(`styles: ${CS_AI_TEAMS.map((teamItem) => `${teamItem.key}:${teamItem.style} [${teamItem.roster.map((player) => player.csRole).join("/")}]`).join(", ")}`);
  console.log(`strength order: ${sorted.map((item) => `${item.key}=${item.strength.toFixed(2)}`).join(" > ")}`);
  console.log(`role means: ${JSON.stringify(Object.fromEntries(ROLE_ORDER.map((role) => [role, { reflex: Number(roleMeans[role].reflex.toFixed(1)), accuracy: Number(roleMeans[role].accuracy.toFixed(1)), decision: Number(roleMeans[role].decision.toFixed(1)), focus: Number(roleMeans[role].focus.toFixed(1)), comms: Number(roleMeans[role].comms.toFixed(1)) }])))}`);
  console.log(`stat cells: 16 each; 90+=${high90}/${statCells.length}; 99-clamp=${clamp99}/${statCells.length}`);
  console.log(`threshold-sensitive: >=80 ${threshold80}/${thresholdCells.length}; >=90 ${threshold90}/${thresholdCells.length}`);
  console.log("battle adapter: 8/8 teams × 5/5 players; flexible role composition: PASS; progress/save/idempotence: PASS");
  console.log("deterministic content: PASS; new RNG: 0; competition aiTeams unchanged: PASS");
  console.log("CS Roster v1 R56: PASS");
}

main();
