#!/usr/bin/env node
/**
 * CS Season / Competition shared contract guard.
 *
 * Static, read-only checks only. Deliberately does not import React, Vite,
 * Zustand, or production modules — it protects ownership markers and the
 * structural invariants that stop a second Season truth from appearing,
 * before any CS implementation lands.
 *
 * ⚠ Never relax an assertion or rebaseline to make this green. If a contract
 *   really must change, update docs/ai/跨模型交接流程.md §13 and
 *   docs/design/CS_賽事系統架構規格.md FIRST, then this file, then the code.
 *
 * Usage:
 *   node tools/check_cs_season_contract.mjs
 *   node tools/check_cs_season_contract.mjs --root=<另一棵 worktree>
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const argRoot = process.argv.slice(2).find((arg) => arg.startsWith("--root="));
const root = path.resolve(argRoot ? argRoot.slice("--root=".length) : process.cwd());

const files = Object.freeze({
  handoff: "docs/ai/跨模型交接流程.md",
  spec: "docs/design/CS_賽事系統架構規格.md",
  plan: "docs/superpowers/plans/2026-08-21-cs-season-competition.md",
  competition: "src/platform/contracts/competition.js",
  matchResult: "src/platform/contracts/matchResult.js",
  matchSession: "src/platform/contracts/matchSession.js",
  finalStandings: "src/platform/contracts/finalStandings.js",
  csMatchResult: "src/platform/contracts/CsMatchResult.js",
  seasonState: "src/platform/competition/seasonState.js",
  seasonStateV2: "src/platform/competition/seasonStateV2.js",
  fixtureBridge: "src/platform/competition/fixtureResultBridge.js",
  simulateFixture: "src/platform/competition/simulateFixture.js",
  teamStrength: "src/platform/competition/teamStrength.js",
  profileStore: "src/platform/profileStore.js",
  csAiTeams: "src/data/csAiTeams.js",
});

const text = new Map();
const missing = [];
for (const [key, relative] of Object.entries(files)) {
  try {
    text.set(key, fs.readFileSync(path.join(root, relative), "utf8"));
  } catch (error) {
    missing.push(relative + " (" + (error.code ?? "read error") + ")");
    text.set(key, "");
  }
}

const checks = [];
const check = (name, condition, detail = "") =>
  checks.push({ name, ok: Boolean(condition), detail });
const has = (key, marker) => (text.get(key) ?? "").includes(marker);

// ── ① Ownership markers（不能只存在於對話裡）─────────────────────────────
check("handoff §13 exists", has("handoff", "## 13. CS Season / Competition"));
check("handoff names Claude Code as CS architecture owner",
  has("handoff", "CS Season / Competition architecture owner ＝ Claude Code"));
check("handoff marks Competition / Season core as protected contract",
  has("handoff", "Protected contract") && has("handoff", "protected contract"));
check("handoff scopes Codex to reading existing selectors during the UI stage",
  has("handoff", "只能**讀取**既有 selectors") && has("handoff", "Codex"));
check("handoff forbids a second CS season truth",
  has("handoff", "csSeasonStore") && has("handoff", "csCompetition"));
check("handoff forbids silent semantic changes to the season objects",
  has("handoff", "SeasonState") && has("handoff", "FinalStandings") && has("handoff", "SeasonSeal"));
check("handoff marks implementation owners for high-conflict files",
  has("handoff", "高衝突檔案") && has("handoff", "implementation owner"));
check("handoff forbids whole-file overwrite / stale cherry-pick from UI branches",
  has("handoff", "不得整檔覆蓋") && has("handoff", "cherry-pick"));
check("handoff requires the shared verifier before integration",
  has("handoff", "check_cs_season_contract.mjs") && has("handoff", "check_home_team_contract.mjs"));
check("handoff forbids editing the contract just to go green",
  has("handoff", "不得為了綠燈修改契約"));
check("handoff keeps R65 frozen and separates CS from R64",
  has("handoff", "不解凍 R65") && has("handoff", "不同責任區"));

// ── ② 規格與計畫存在且互相指認 ──────────────────────────────────────────
check("spec exists and declares Claude Code as architecture owner",
  has("spec", "Architecture owner") && has("spec", "Claude Code"));
check("spec records the keyed-by-gameMode decision",
  has("spec", "competitionByMode") && has("spec", "keyed by gameMode"));
check("spec records the read-alias rule (no dual write)",
  has("spec", "read alias") && has("spec", "不得雙寫"));
check("spec documents the discipline variation points for a third game",
  has("spec", "Discipline Variation Points") && has("spec", "outcomeFrom"));
check("plan exists and points back at the spec",
  has("plan", "docs/design/CS_賽事系統架構規格.md"));
check("plan states M2 is the MVP floor, not M1",
  has("plan", "M1 只是技術 milestone"));

// ── ③ 結構性封鎖：不存在第二套 Season truth ──────────────────────────────
const forbiddenPaths = [
  "src/platform/csSeasonStore.js",
  "src/platform/competition/csSeasonState.js",
  "src/platform/csCompetition.js",
  "src/platform/competition/csCompetition.js",
];
const present = forbiddenPaths.filter((p) => fs.existsSync(path.join(root, p)));
check("no parallel CS season store exists", present.length === 0, present.join(", "));
check("profileStore does not declare a csCompetition slice",
  !/\bcsCompetition\s*:/.test(text.get("profileStore") ?? ""));
check("profileStore does not declare a csSeasonState slice",
  !/\bcsSeasonState\s*:/.test(text.get("profileStore") ?? ""));

// ── ④ 多遊戲命名不得退化 ────────────────────────────────────────────────
check("createCompetition still accepts moba and cs",
  has("competition", 'gameMode !== "moba" && gameMode !== "cs"'));
check("competition ids stay namespaced by game mode",
  has("competition", "comp:${gameMode}:s${season}") && has("competition", "season:${gameMode}:s${season}"));
check("fixture ids stay namespaced by game mode",
  has("competition", "fx:${stage.gameMode}"));
check("matchFormat stays opaque to the shared layer",
  has("competition", "matchFormat") && has("competition", "共用層不解讀"));
check("elimination formats remain declared for later implementation",
  has("competition", "single_elim") && has("competition", "double_elim"));

// ── ⑤ 賽果鏈路的中立性（CS 要沿用的那條）────────────────────────────────
check("fixture bridge still refuses BattleResult by signature",
  has("fixtureBridge", "MatchResult.v1") && has("fixtureBridge", "不接受 BattleResult"));
check("MatchResult stays parameterised by session mode",
  has("matchResult", "result:${session.mode}"));
check("simulateFixture stays game-mode aware",
  has("simulateFixture", "fixture.gameMode"));
check("teamStrength stays game-mode aware",
  has("teamStrength", '"moba"|"cs"') || has("teamStrength", 'mode = "moba"'));
check("CsMatchResult.v1 contract remains present",
  has("csMatchResult", 'CS_RESULT_SCHEMA = "CsMatchResult.v1"'));
check("CS AI team pool remains present for the CS league",
  has("csAiTeams", 'CS_AI_TEAM_SCHEMA = "CsAiTeam.v1"') && has("csAiTeams", "CS_AI_TEAM_COUNT"));

// ── ⑥ 既有 Season 語義錨點（不得倒退）──────────────────────────────────
check("SeasonState keeps its per-instance season anchor",
  has("seasonState", "startDay") && has("seasonState", "function rollToNextSeason"));
check("SeasonState keeps career event and rollover rules",
  has("seasonState", "careerEventId") && has("seasonState", "function canRollSeason"));
check("SeasonState v2 keeps validation and event-scoped indexes",
  has("seasonStateV2", "validateSeasonStateV2") && has("seasonStateV2", "buildSeasonStateV2Indexes"));
check("FinalStandings contract remains present", (text.get("finalStandings") ?? "").length > 0);
check("ActiveMatch contract remains v1",
  has("matchSession", 'ACTIVE_MATCH_SCHEMA = "ActiveMatch.v1"'));
check("profileStore keeps the competition and active match projections",
  has("profileStore", "competitionView()") && has("profileStore", "activeMatchView"));

// ── ⑦ Mutation sentinel ────────────────────────────────────────────────
//  證明本檔真的有鑑別力：把「多遊戲命名」拿掉之後，④ 那組必須轉紅。
const mutated = (text.get("competition") ?? "")
  .replace('gameMode !== "moba" && gameMode !== "cs"', 'gameMode !== "moba"')
  .replace("comp:${gameMode}:s${season}", "comp:s${season}");
check(
  "mutation sentinel catches a single-game regression of the Competition contract",
  !mutated.includes('gameMode !== "moba" && gameMode !== "cs"') &&
  !mutated.includes("comp:${gameMode}:s${season}"),
  "memory-only mutation: 拿掉 cs 驗證與 gameMode 命名空間",
);

const passed = checks.filter((entry) => entry.ok).length;
console.log("CS Season / Competition contract: " + passed + "/" + checks.length + " PASS");
for (const entry of checks) {
  console.log((entry.ok ? "PASS " : "FAIL ") + entry.name + (entry.detail ? " — " + entry.detail : ""));
}
if (missing.length > 0) {
  console.error("Missing files: " + missing.join("; "));
  process.exitCode = 1;
}
if (passed !== checks.length) process.exitCode = 1;
