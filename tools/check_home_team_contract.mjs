#!/usr/bin/env node
/**
 * P0.6B Home / Team information responsibility contract guard.
 *
 * Static, read-only checks only. This verifier intentionally does not import
 * React, Vite, Zustand, or production modules; it protects route / responsibility
 * markers before a future R64/R65 selective integration changes presentation.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const argRoot = process.argv.slice(2).find((arg) => arg.startsWith("--root="));
const root = path.resolve(argRoot ? argRoot.slice("--root=".length) : process.cwd());

const files = Object.freeze({
  handoff: "docs/ai/跨模型交接流程.md",
  architecture: "docs/handoff/06_目前主幹架構.md",
  appShell: "src/AppShell.jsx",
  dashboard: "src/screens/DashboardScreen.jsx",
  team: "src/screens/manage/TeamScreen.jsx",
  roster: "src/screens/manage/RosterScreen.jsx",
  playerDetail: "src/screens/manage/PlayerDetailScreen.jsx",
  profileFoundation: "src/ui/playerProfileFoundation.js",
  activeMatchCard: "src/screens/common/ActiveMatchCard.jsx",
  matchPrepFrame: "src/screens/common/MatchPrepFrame.jsx",
  matchEntryPanel: "src/screens/common/MatchEntryPanel.jsx",
  matchQueuePanel: "src/screens/common/MatchQueuePanel.jsx",
  matchPrepAction: "src/screens/common/matchPrepAction.js",
  profileStore: "src/platform/profileStore.js",
  teamDevelopment: "src/platform/development/teamDevelopment.js",
  banPick: "src/screens/moba/BanPickScreen.jsx",
  mobaTactic: "src/screens/moba/TacticScreen.jsx",
  csTactic: "src/screens/fps/CsTacticScreen.jsx",
  recruit: "src/screens/manage/RecruitScreen.jsx",
  seasonStateV2: "src/platform/competition/seasonStateV2.js",
  seasonState: "src/platform/competition/seasonState.js",
  competitionContract: "src/platform/contracts/competition.js",
  matchSession: "src/platform/contracts/matchSession.js",
});

const text = new Map();
const missing = [];
for (const [key, relative] of Object.entries(files)) {
  const absolute = path.join(root, relative);
  try {
    text.set(key, fs.readFileSync(absolute, "utf8"));
  } catch (error) {
    missing.push(relative + " (" + (error.code ?? "read error") + ")");
    text.set(key, "");
  }
}

const checks = [];
function check(name, condition, detail = "") {
  checks.push({ name, ok: Boolean(condition), detail });
}

function has(key, marker) {
  return (text.get(key) ?? "").includes(marker);
}

function routeMarker(screen, component) {
  const source = text.get("appShell") ?? "";
  return source.split("\n").some((line) => (
    line.includes('screen === "' + screen + '"') && line.includes(component)
  ));
}

function dashboardContract(source) {
  return {
    primaryRoute: source.includes('development: "teamDevelopment"'),
    primaryLabel: source.includes('label="戰隊發展"'),
    legacyPrimaryLabel: source.includes('label="天賦"'),
  };
}

check("shared handoff declares Home Command Center / Team Overview", has("handoff", "Home Command Center") && has("handoff", "Team Overview"));
check("shared handoff declares selective integration and frozen ownership", has("handoff", "selective integration") && has("handoff", "Codex implementation-owned") && has("handoff", "R65") && has("handoff", "frozen"));
check("shared handoff protects schema v10, R60, ActiveMatch and R63", has("handoff", "schema v10") && has("handoff", "R60") && has("handoff", "ActiveMatch") && has("handoff", "R63"));
check("architecture records the same responsibility boundary", has("architecture", "Home Command Center") && has("architecture", "Team Overview") && has("architecture", "Roster") && has("architecture", "Player Profile") && has("architecture", "Match Prep"));

check("dashboard route remains owned by DashboardScreen", routeMarker("dashboard", "DashboardScreen"));
check("team route remains owned by TeamScreen", routeMarker("team", "TeamScreen"));
check("roster route remains owned by RosterScreen", routeMarker("roster", "RosterScreen"));
check("player profile route remains owned by PlayerDetailScreen", routeMarker("playerDetail", "PlayerDetailScreen"));
check("MOBA Match Prep route remains owned by LineupScreen", routeMarker("lineup", "LineupScreen"));
check("CS Match Prep route remains owned by CsPrepScreen", routeMarker("csPrep", "CsPrepScreen"));

const dashboard = text.get("dashboard") ?? "";
const currentDashboard = dashboardContract(dashboard);
check("Home reads the shared ActiveMatch summary", has("dashboard", "ActiveMatchCard") && has("activeMatchCard", "activeMatchView"));
check("Home reads the shared Competition view", has("dashboard", "competitionView()"));
check("Home primary development navigation targets Team Development", currentDashboard.primaryRoute);
check("Home primary investment entry is 戰隊發展", currentDashboard.primaryLabel);
check("Home has no primary 天賦 tile", !currentDashboard.legacyPrimaryLabel);

check("Team Overview keeps the current identity title", has("team", 'title="戰隊詳情"'));
check("Team Overview reads the shared player identity source", has("team", "useProfileStore((s) => s.players)"));
check("Team Overview reads season history", has("team", "useSeasonStore"));
check("Team Overview keeps division presentation", has("team", "MOBA") && has("team", "CS"));
check("Team Overview keeps compact starter presentation", has("team", "先發陣容"));

check("Roster remains the player list decision layer", has("roster", "useProfileStore((s) => s.players)") && has("architecture", "Roster"));
check("Player Profile keeps the shared four-tab foundation", has("playerDetail", "PROFILE_TABS") && has("playerDetail", "player-profile-tabs") && has("profileFoundation", "overview") && has("profileFoundation", "abilities") && has("profileFoundation", "growth") && has("profileFoundation", "career"));

check("Match Prep keeps the shared frame", has("matchPrepFrame", "MatchEntryPanel") && has("matchPrepFrame", "MatchQueuePanel"));
check("Match Prep keeps its single primary action", has("matchPrepAction", "primaryActionFor"));
check("Match Prep source panels remain present", has("matchEntryPanel", "export") && has("matchQueuePanel", "export"));

//  ⚠ 2026-08-21（CS Season M0）：原本寫死 `PROFILE_SCHEMA_VERSION = 10`，
//    但共同契約寫的是「profile schema **至少**為 v10」（跨模型交接流程.md），
//    寫死等號比它要守的契約更嚴，任何純新增的升版都會誤紅。
//    改成「數值 ≥ 10」＝ 忠實編碼契約，並補上**實質**斷言：v10 的
//    teamDevelopment 遷移路徑（`sanitizeTeamDevelopment`）必須還在載入路徑上。
//    後者才是升版真正可能弄壞的東西，比版本號字串強。
const schemaVersionNumber = Number(
  (text.get("profileStore") ?? "").match(/PROFILE_SCHEMA_VERSION\s*=\s*(\d+)/)?.[1] ?? NaN,
);
check("Team Development schema is at least v10 and persisted by profileStore",
  Number.isFinite(schemaVersionNumber) && schemaVersionNumber >= 10
  && has("profileStore", "sanitizeTeamDevelopment")
  && has("profileStore", "teamDevelopment") && has("profileStore", "purchaseTeamDevelopment"),
  `PROFILE_SCHEMA_VERSION = ${schemaVersionNumber}`);
check("Team Development canonical module remains present", has("teamDevelopment", "teamDevelopmentNodeById") && has("teamDevelopment", "teamDevelopmentEffects"));
for (const [key, label] of [["banPick", "MOBA Ban/Pick"], ["mobaTactic", "MOBA Tactic"], ["csTactic", "CS Tactic"], ["roster", "Roster"], ["recruit", "Recruit"]]) {
  check("R60 consumer marker remains in " + label, has(key, "teamDevelopment") || has(key, "戰隊發展"));
}

check("ActiveMatch card reads the shared view and exposes resume", has("activeMatchCard", "activeMatchView") && has("activeMatchCard", "onResume") && has("activeMatchCard", "resume-active-match"));
check("ActiveMatch contract remains v1 and validates active status", has("matchSession", 'ACTIVE_MATCH_SCHEMA = "ActiveMatch.v1"') && has("matchSession", "isActiveMatch"));
check("profileStore keeps ActiveMatch view projection", has("profileStore", "activeMatchView"));

check("Competition contract remains canonical", has("competitionContract", "COMPETITION_VERSION") && has("competitionContract", "validateCompetition"));
check("SeasonState v2 validation and event-scoped index remain present", has("seasonStateV2", "validateSeasonStateV2") && has("seasonStateV2", "buildSeasonStateV2Indexes"));
check("SeasonState active focus remains explicit", has("seasonState", "activeEventId"));
//  ⚠ 2026-08-21（CS Season M0）：v11 起 `competitionView` 帶 mode 參數
//    （規格 §3.3）。marker 跟著改成**釘住預設值**——比原本的 `competitionView()`
//    更嚴：它同時證明投影還在、而且既有呼叫端拿到的仍然是 moba。
check("profileStore keeps Competition view (moba-defaulted) and v2 sync",
  has("profileStore", "competitionView(mode = DEFAULT_GAME_MODE)")
  && has("profileStore", 'const DEFAULT_GAME_MODE = "moba"')
  && has("profileStore", "_syncSeasonStateV2"));

const mutatedDashboard = dashboard
  .replace('development: "teamDevelopment"', 'development: "talentPick"')
  .replace('label="戰隊發展"', 'label="天賦"');
const mutatedDashboardContract = dashboardContract(mutatedDashboard);
check(
  "mutation sentinel catches Team Development route / label downgrade",
  !mutatedDashboardContract.primaryRoute && !mutatedDashboardContract.primaryLabel,
  "memory-only mutation: teamDevelopment → talentPick／戰隊發展 → 天賦",
);

const passed = checks.filter((entry) => entry.ok).length;
console.log("Home / Team responsibility contract: " + passed + "/" + checks.length + " PASS");
for (const entry of checks) {
  console.log((entry.ok ? "PASS " : "FAIL ") + entry.name + (entry.detail ? " — " + entry.detail : ""));
}
if (missing.length > 0) {
  console.error("Missing files: " + missing.join("; "));
  process.exitCode = 1;
}
if (passed !== checks.length) process.exitCode = 1;
