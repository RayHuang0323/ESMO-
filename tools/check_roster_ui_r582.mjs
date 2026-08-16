#!/usr/bin/env node
// R58.2 focused verifier：選手名單、摘要 modal、完整選手檔案的資訊責任與玩家用語。
import fs from "node:fs";
import { STAT_DEF } from "../src/data/playerModel.js";

const gate = (ok, code, detail = "") => {
  if (!ok) throw new Error(`[${code}]${detail ? ` ${detail}` : ""}`);
};
const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

const rosterSource = read("../src/screens/manage/RosterScreen.jsx");
const detailSource = read("../src/screens/manage/PlayerDetailScreen.jsx");

function main() {
  gate(STAT_DEF.length === 16, "STAT_DEF_COUNT", String(STAT_DEF.length));

  gate(rosterSource.includes("useProfileStore((s) => s.players) ?? []"), "SHARED_PROFILE_SOURCE");
  gate(rosterSource.includes("data-testid=\"roster-game-filter\"") && rosterSource.includes("data-testid=\"roster-status-filter\""), "FILTER_LAYERS");
  gate(rosterSource.includes("MobaStatChips") && rosterSource.includes("CsStatChips"), "SUMMARY_REPRESENTATIVE_STATS");
  gate(rosterSource.includes("data-testid=\"roster-moba-summary\"") && rosterSource.includes("data-testid=\"roster-cs-detail\""), "SUMMARY_GAME_SECTIONS");
  gate(!rosterSource.includes("STAT_CATS.map"), "SUMMARY_NO_FULL_STAT_GRID");
  gate(rosterSource.includes("強項") && rosterSource.includes("弱項") && rosterSource.includes("data-testid=\"roster-detail-game-mode\""), "SUMMARY_DECISION_FIELDS");
  gate(rosterSource.includes("戰力 {isCsView ? fp : mp}"), "CARD_PLAYER_POWER_LABEL");
  gate(!rosterSource.includes("role identity") && !rosterSource.includes("roster slot") && !rosterSource.includes("CS role 是能力 identity"), "NO_DEVELOPER_TERMS");
  gate(rosterSource.includes("主要定位") && rosterSource.includes("其他適配"), "PLAYER_ROLE_LANGUAGE");
  gate(rosterSource.includes("角色代表選手擅長的打法，不限制隊伍組成。"), "ROLE_TOOLTIP_COPY");

  gate(detailSource.includes("data-testid=\"player-detail-game-mode\""), "DETAIL_GAME_MODE_TABS");
  gate(detailSource.includes("data-testid={gameMode === \"CS\" ? \"cs-stat-grid\" : \"moba-stat-grid\"}"), "DETAIL_FULL_STATS");
  gate(detailSource.includes("STAT_DEF.map") && detailSource.includes("growthLogOf(p)"), "DETAIL_DEEP_DATA");
  gate(detailSource.includes("CS 戰力") && !detailSource.includes("FPS 戰力"), "DETAIL_PLAYER_POWER_LABEL");
  gate(detailSource.includes("主要定位") && detailSource.includes("其他適配"), "DETAIL_GAME_ROLE_LANGUAGE");
  gate(!detailSource.includes("role identity") && !detailSource.includes("roster slot") && !detailSource.includes("CS role identity"), "DETAIL_NO_DEVELOPER_TERMS");
  gate(detailSource.includes("角色代表選手擅長的打法，不限制隊伍組成。"), "DETAIL_ROLE_TOOLTIP_COPY");

  console.log("R58.2 summary modal: shared identity + player language + representative stats only: PASS");
  console.log("R58.2 full profile: game mode + complete 16 stats + growth data: PASS");
  console.log("R58.2 role presentation: mode-specific suitability with free role composition: PASS");
  console.log("Roster UI R58.2: PASS");
}

main();
