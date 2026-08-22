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
  matchSeries: "src/platform/contracts/matchSeries.js",
  finalStandings: "src/platform/contracts/finalStandings.js",
  csMatchResult: "src/platform/contracts/CsMatchResult.js",
  seasonState: "src/platform/competition/seasonState.js",
  regularSeason: "src/platform/competition/regularSeason.js",
  csSeasonConfig: "src/platform/competition/csSeasonConfig.js",
  csPrepScreen: "src/screens/fps/CsPrepScreen.jsx",
  //  UI-3：CS 賽季的入口責任（開季／今日賽程出戰）從賽前頁搬到賽事中心。
  csHubScreen: "src/screens/fps/CsCompetitionHubScreen.jsx",
  scheduleGenerator: "src/platform/competition/scheduleGenerator.js",
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
//  ⚠ 只看**程式碼**，不看註解。這些檔案的註解**必須**寫得出「MR12 /
//    first-to-13 是 Codex 的責任區」、「strengthBand 不是參賽資格」——
//    那是在說明規則，不是違反它。連註解一起 grep 會讓「把規則寫清楚」
//    變成紅燈，那是反效果的守衛。
const codeOnly = (key) => (text.get(key) ?? "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

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

// ── (1b) Temporary ownership lock: CS round system is Codex-owned ────────
check("handoff records the temporary CS round-system ownership lock",
  has("handoff", "Temporary ownership lock") && has("handoff", "CS round-system stable checkpoint"));
check("lock names the CS battle runtime files Claude must not touch",
  has("handoff", "EsportsFPS3D.jsx") && has("handoff", "check_cs_match_completion.mjs"));
check("lock confines Claude to season-level orchestration",
  has("handoff", "BO series orchestration"));
check("lock forbids recomputing Codex map-level results",
  has("handoff", "不得自行重算") && has("handoff", "map-level result"));
check("lock states M0 must not touch CS battle runtime",
  has("handoff", "不得碰上述任何 CS battle runtime"));

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
  has("profileStore", "competitionView(mode = DEFAULT_GAME_MODE)") && has("profileStore", "activeMatchView"));

// ── ⑧ schema v11：keyed by gameMode（M0 落地後的結構性錨點）──────────────
//  這一組守的是「別名不得變回第二份 truth」。marker 從 M0 起就在 profileStore 裡，
//  往後 M1–M4 任何一次改寫把 canonical 拿掉，這裡就會紅。
check("profileStore declares the canonical keyed-by-gameMode structure",
  has("profileStore", "competitionByMode") && has("profileStore", "competitionHistoryByMode"));
check("profileStore routes alias writes back into canonical (no dual write)",
  has("profileStore", "routeCompetitionWrite") && has("profileStore", "withCompetitionAliases"));
check("profileStore also routes the external zustand setState",
  /useProfileStore\.setState\s*=/.test(text.get("profileStore") ?? ""));
check("profileStore rejects an unknown game mode instead of silently defaulting",
  has("profileStore", "assertGameMode") && has("profileStore", "unknown gameMode"));
check("profileStore keeps the v10 -> v11 migration a pure addition",
  has("profileStore", "saved.competitionByMode?.moba ?? saved.competition"));

// ── ⑨ CS Season M1：CS 聯賽 lifecycle 的結構性錨點 ──────────────────────
check("regular season assembly builds the CS league from the season config",
  has("regularSeason", "csLeagueParticipants") && has("regularSeason", "csLeagueAiTeamsFor"));
check("CS league eligibility is an explicit roster, not a derived one",
  has("csSeasonConfig", "aiTeamKeys") && has("csSeasonConfig", "CS_TEAM_STATUS")
  && has("csSeasonConfig", "development"));
//  ⚠ 反向斷言：參賽資格的兩個檔案**都不得**讀 strengthBand。
//    `strengthBand` 是實力描述；用它決定誰能參賽，等於讓內容平衡默默改變賽制。
//    （2026-08-21 的第一版就是這樣寫的，使用者退回，已改為明文設定。）
check("league eligibility never reads a strength descriptor",
  !/strengthBand/.test(codeOnly("csSeasonConfig")) && !/strengthBand/.test(codeOnly("regularSeason")));
check("CS league refuses to build a wrong-sized field instead of failing quietly",
  /throw new Error/.test(text.get("csSeasonConfig") ?? "") && has("csSeasonConfig", "teamCount"));
check("Major seats come only from the league standings",
  has("csSeasonConfig", "CS_MAJOR_QUALIFICATION") && has("csSeasonConfig", "league_standings")
  && has("csSeasonConfig", "csMajorQualifiers"));
//  ⚠ 隊數是**產品決策**，不是排程器的限制。奇數隊可以用輪空排循環賽，
//    只是排程器還沒實作 —— 那條限制要留在排程器自己身上，不得被寫成產品規則。
check("the odd-field limit stays a scheduler limitation, not a product rule",
  has("scheduleGenerator", "目前不支援奇數隊"));
check("simulation rosters follow the season's own game mode",
  has("seasonState", "gameModeOf") && has("seasonState", "CS_AI_TEAMS"));
check("CS season declares no playoff and no prize policy in M1",
  has("seasonState", 'expectsPlayoff: gameMode !== "cs"') &&
  has("seasonState", 'gameMode === "cs" ? null : LEGACY_PRIZE_POLICY'));
check("profileStore seals each discipline through its own path",
  has("profileStore", "_sealCsSeasonIfFinished") && has("profileStore", "_setCompetitionStateFor"));
check("profileStore resolves a fixture's discipline instead of guessing moba",
  has("profileStore", "_modeOfFixture") && has("profileStore", "不猜 moba"));

// ── ⑩ ⛔ Ownership lock：Season 層不得發明 CS 回合語義 ───────────────────
//  Codex 擁有 CS 單場的 round / half / overtime / scoreboard。Season 層只認識
//  **地圖數**。這一組守的是「M2 以後有人為了讓畫面好看，在 Season 層編出回合比分」。
check("CS season scores are map counts, not rounds",
  has("simulateFixture", 'fixture.gameMode === "cs"') &&
  has("simulateFixture", "{ a: 1, b: 0 }"));
check("CS simulation is versioned apart from the MOBA kill model",
  has("simulateFixture", "CS_SIMULATOR_VERSION") && has("simulateFixture", "simulatorVersionFor"));
check("season layer invents no CS round vocabulary in code",
  !/\b(MR12|firstTo13|roundsWon|halfTime|overtimeRounds)\b/i.test(codeOnly("simulateFixture")) &&
  !/\b(MR12|firstTo13|roundsWon)\b/i.test(codeOnly("seasonState")));
// ── ⑪ CS Season M2：玩家實際出戰的結構性錨點 ────────────────────────────
check("fixture entry resolves the discipline from the fixture itself",
  has("profileStore", "_modeOfFixture(fixtureId) ?? DEFAULT_GAME_MODE"));
check("fixture result write-back is discipline-resolved, not session-mode-guessed",
  has("profileStore", "不可以**改用 `session.mode` 判斷"));
//  ⛔ M2 最重要的一條：玩家實打的 CS 賽果進賽程時，比分**必須**換成地圖數。
//  `MatchResult.v1` 對 CS 帶的是 Codex 的回合比分（13:7），照抄就是把回合語義
//  搬進賽季層。橋接只讀 `winner`，一個回合數都不搬。
//  ⚠ M4-A 起橋接有**兩條** CS 路徑（BO1 與 series），所以這一條跟著變嚴：
//    兩條都必須是地圖數，而 series 那條的地圖數只准來自 `seriesScore(series)`。
//    （原本 grep 的字面註解在 M4-A 改寫了。era-scoped marker 的處理原則是
//      換成**更嚴**的版本，不是拿掉——同 M2 對 q35 `4c)` 的處理。）
check("the CS fixture bridge projects maps, never rounds",
  has("fixtureBridge", 'fixture.gameMode === "cs"')
  && has("fixtureBridge", "playerWon ? 1 : 0")                    // BO1 ⇒ 1:0
  && has("fixtureBridge", "seriesScore(series)")                  // series ⇒ 地圖數
  && has("fixtureBridge", "沒有一個回合數被搬進來"));
check("the CS series bridge takes the winner from the series, not the last map",
  has("fixtureBridge", 'series.winner === "us"')
  && has("fixtureBridge", "不是最後一張地圖的勝方"));
check("the CS series bridge fails closed when the series is unfinished or missing",
  has("fixtureBridge", "series_in_progress") && has("fixtureBridge", "series_missing"));
//  ⛔ M4-A：series 狀態住在 MatchSession，**不得**出現在賽季層（規格 D4）
check("series state lives on the session, never in SeasonState",
  !/MatchSeries|nextMapKey|mapsToWin/.test(codeOnly("seasonState"))
  && has("matchSeries", "不是** SeasonState"));
check("the CS fixture bridge reads nothing but the winner Codex decided",
  !/ourScore|enemyScore|scoreT|scoreCT|roundCount/.test(codeOnly("fixtureBridge")));
//  ⚠ UI-3：這兩條的**意圖沒有變**，變的是誰擁有那個責任。開季與今日賽程出戰
//    從 CS 賽前頁搬到了賽事中心（`CsCompetitionHubScreen`）。斷言跟著責任走，
//    不跟著檔名走——否則就得為了讓 gate 保持綠色，在賽前頁留一段死程式碼。
check("player CS entry goes through the shared fixture action, not a second flow",
  has("csHubScreen", "startFixtureMatch") && !has("csHubScreen", "completeFixtureMatch"));
check("CS league entry has moved out of the single-match prep screen",
  !has("csPrepScreen", "startFixtureMatch") && !has("csPrepScreen", "ensureCompetitionSeason"));
check("CS season is never created behind the player's back",
  has("csHubScreen", 'ensureCompetitionSeason("cs")') && has("csHubScreen", "只在 onClick"));
//  ⚠ 這一條才是真正擋住「偷偷開季」的斷言：開季必須掛在 onClick 上。
//    賽事中心只要出現任何 useEffect，就可能在**掛載時**建出一整季賽程——
//    玩家什麼都沒按就多了一季。所以本檔直接禁止該畫面有 useEffect。
check("the competition hub cannot create a season on mount (no useEffect at all)",
  !/useEffect/.test(codeOnly("csHubScreen")));

check("season layer still refuses to recompute Codex map-level results",
  has("handoff", "不得自行重算") && has("handoff", "map-level result"));

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
