#!/usr/bin/env node
// R58 unified MOBA / CS roster UI verifier.
// 這支只驗證 UI 是否沿用同一份 profile player 與既有能力模型，
// 不建立第二套 player data，也不把 CS role 當成固定席位。
import fs from "node:fs";
import { STAT_DEF, CS_ROLE_BY_MOBA_ROLE, bestPositions } from "../src/data/playerModel.js";
import { INITIAL_PLAYERS } from "../src/data/players.js";
import { CS_AI_TEAMS } from "../src/data/csAiTeams.js";
import { withDerivedStats } from "../src/platform/talents/playerDerivedStats.js";

const gate = (ok, code, detail = "") => {
  if (!ok) throw new Error(`[${code}]${detail ? ` ${detail}` : ""}`);
};
const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const rosterSource = read("../src/screens/manage/RosterScreen.jsx");
const detailSource = read("../src/screens/manage/PlayerDetailScreen.jsx");
const statKeys = STAT_DEF.map(({ key }) => key).sort();

function main() {
  gate(STAT_DEF.length === 16, "STAT_DEF_COUNT", String(STAT_DEF.length));
  gate(JSON.stringify(Object.keys(CS_ROLE_BY_MOBA_ROLE).sort()) === JSON.stringify(["上路", "中路", "下路", "打野", "輔助"].sort()), "CS_ROLE_MAPPING");

  const ids = INITIAL_PLAYERS.map((player) => player.id);
  gate(ids.length > 0, "PROFILE_ROSTER_EMPTY");
  gate(new Set(ids).size === ids.length, "PROFILE_PLAYER_ID_UNIQUE");
  gate(INITIAL_PLAYERS.every((player) => JSON.stringify(Object.keys(player.stats).sort()) === JSON.stringify(statKeys)), "PROFILE_STAT_COMPLETENESS");
  gate(INITIAL_PLAYERS.every((player) => Object.values(withDerivedStats(player).stats).every((value) => Number.isFinite(value) && value >= 1 && value <= 99)), "DERIVED_STAT_DOMAIN");
  gate(INITIAL_PLAYERS.every((player) => bestPositions(withDerivedStats(player)).fpsAll.length === 5), "FPS_SUITABILITY_MODEL");

  gate(rosterSource.includes('const GAME_FILTERS = ["全部", "MOBA", "CS"]'), "GAME_FILTERS");
  gate(rosterSource.includes("useState(\"全部\")") && rosterSource.includes("useState(\"MOBA\")"), "FILTER_STATE");
  gate(rosterSource.includes("data-testid=\"roster-game-filter\"") && rosterSource.includes("data-testid=\"roster-status-filter\""), "FILTER_LAYERS");
  gate(rosterSource.includes("const players = useProfileStore((s) => s.players) ?? []") && rosterSource.includes("key={p.id}"), "SINGLE_PLAYER_IDENTITY");
  gate(rosterSource.includes("calcPower(dp, \"fps\")") && rosterSource.includes("CsStatChips") && rosterSource.includes("CS_ROLE_BY_MOBA_ROLE"), "CS_CARD_DATA_SOURCES");
  gate(rosterSource.includes("data-testid=\"roster-cs-detail\"") && rosterSource.includes("MobaStatChips") && !rosterSource.includes("STAT_CATS.map"), "SUMMARY_REPRESENTATIVE_STATS_ONLY");
  gate(!rosterSource.includes("role identity") && !rosterSource.includes("roster slot") && rosterSource.includes("setDetailMode"), "PLAYER_LANGUAGE_AND_PREMATCH_COPY");
  gate(!rosterSource.includes("CS_SEATS") && !rosterSource.includes("每隊一定"), "NO_FIXED_CS_SLOTS");

  gate(detailSource.includes("data-testid=\"player-detail-game-mode\"") && detailSource.includes("data-testid=\"cs-profile-summary\""), "DETAIL_GAME_MODES");
  gate(detailSource.includes("STAT_DEF.map") && detailSource.includes("data-testid={gameMode === \"CS\" ? \"cs-stat-grid\" : \"moba-stat-grid\"}"), "DETAIL_FULL_STATS");
  gate(detailSource.includes("data-testid={gameMode === \"CS\" ? \"cs-stat-grid\" : \"moba-stat-grid\"}"), "DETAIL_STAT_GRID");
  gate(detailSource.includes("calcPower(derivedPlayer, gameMode === \"CS\" ? \"fps\" : \"moba\")"), "DETAIL_MODE_POWER");
  gate(detailSource.includes("layers.derived.learning") && detailSource.includes("growthLogOf(p)"), "DETAIL_GROWTH_DATA");

  const duplicateRoleTeam = CS_AI_TEAMS.find((team) => new Set(team.roster.map((player) => player.csRole)).size < team.roster.length);
  gate(Boolean(duplicateRoleTeam), "DUPLICATE_ROLE_ALLOWED");
  gate(CS_AI_TEAMS.every((team) => team.roster.length === 5), "CS_TEAM_ROSTER_SHAPE");

  console.log(`profile players: ${INITIAL_PLAYERS.length}; shared stats: ${STAT_DEF.length}/16; ids unique: PASS`);
  console.log(`game filters: 全部 / MOBA / CS; status filters: 全部 / 主力 / 預備隊 / 訓練中 / 閒置`);
  console.log(`CS card/detail: current-game power + player language + derived stats; full 16-stat detail: PASS`);
  console.log(`role composition: duplicate role accepted (${duplicateRoleTeam.key}); fixed CS slots: 0; pre-match path unchanged: PASS`);
  console.log("Roster UI R58: PASS");
}

main();
