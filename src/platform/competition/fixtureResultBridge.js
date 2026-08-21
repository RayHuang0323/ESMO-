// ============================================================================
//  platform/competition/fixtureResultBridge.js — 正式賽果 → 賽程賽果（Q3.5）
//
//  ── 這一支只做一件事：換座標 ──────────────────────────────────────────────
//  `MatchResult.v1`（O7 的正式賽果）說的是**玩家視角**：
//      winner: "us" | "opponent"      score: { us, opponent }
//  `FixtureOutcome`（Q2b）說的是**賽程視角**：
//      winner: teamId                 score: { a, b } 對應 fixture.sideA / sideB
//
//  兩者是同一場比賽的兩種座標。本檔把前者翻成後者，**一個數字都不重算**。
//
//  ── 為什麼來源是 MatchResult 而不是 BattleResult ─────────────────────────
//  `BattleResult.v2` 的 winner 是 `"blue"|"red"`（戰場陣營），要換成隊伍還得
//  再知道「玩家是哪一側」——那個知識已經在 `outcomeFromBattleResult()` 裡處理過
//  一次了。若這裡再讀一次 BattleResult，就會有**兩個地方各自決定勝負歸屬**，
//  哪天藍紅分配改了就會不一致。
//
//  所以鏈路是單向的、只有一條：
//      BattleResult.v2
//        → outcomeFromBattleResult()   （既有，照抄不統計）
//        → createMatchResult()          → **MatchResult.v1（正式成立）**
//        → 本檔                          → FixtureOutcome（engine）
//
//  ⚠ 本檔**不接受 BattleResult**，簽名上就拿不到——這是刻意的，
//    讓「不得從戰鬥資料重算第二份真相」是結構上的限制，不是靠自律。
//
//  純函式：不 import React / zustand / localStorage。
// ============================================================================
import { RESULT_SOURCES as MATCH_RESULT_SOURCES } from "../contracts/matchResult.js";
import { involvesTeam } from "../contracts/competition.js";

/**
 * 由正式賽果換算賽程賽果的輸入。
 *
 * @param {object} p
 * @param {object} p.result       MatchResult.v1（**必須已經正式成立**）
 * @param {object} p.fixture      Fixture.v1
 * @param {string} p.playerTeamId 玩家隊伍 id（Q1 的不可變識別碼）
 * @returns {{ok:boolean, input:object|null, errors:Array}}
 *   input = { fixtureId, winner, score:{a,b}, duration, seed } —— 直接餵給
 *   `applyCompleted()`／`completeFixtureMatch()`
 */
export function fixtureOutcomeInputFrom({ result, fixture, playerTeamId } = {}) {
  const errors = [];
  if (!result || result.schema !== "MatchResult.v1") {
    errors.push({ code: "result", message: "缺少正式賽果（MatchResult.v1）" });
  }
  if (!fixture?.id) errors.push({ code: "fixture", message: "缺少賽程場次" });
  if (!playerTeamId) errors.push({ code: "team", message: "缺少玩家隊伍識別碼" });
  if (fixture?.id && playerTeamId && !involvesTeam(fixture, playerTeamId)) {
    errors.push({ code: "not_participant", message: "這場賽程沒有玩家的隊伍" });
  }
  if (result && result.winner !== "us" && result.winner !== "opponent") {
    errors.push({ code: "winner", message: `正式賽果的勝負必須是 us/opponent，收到 ${result.winner}` });
  }
  //  只有實打的賽果能走這條路。模擬與棄權有各自的產生點，不共用。
  if (result && result.resultSource !== MATCH_RESULT_SOURCES.engine) {
    errors.push({ code: "source", message: `賽程賽果只接受實際對戰，收到 ${result.resultSource}` });
  }
  if (result && (typeof result.score?.us !== "number" || typeof result.score?.opponent !== "number")) {
    errors.push({ code: "score", message: "正式賽果缺少比分" });
  }
  //  ── ⛔ CS Season M3-2：一場 MatchResult 結算不了一個 series ──────────────
  //  BO3 的 `FixtureOutcome.score` 是**地圖數**（2:0 / 2:1）。一場 `MatchResult.v1`
  //  只代表**一張地圖** ⇒ 拿它產生 series 比分只有兩種寫法，兩種都是錯的：
  //    · 記成 `1:0` —— 那是 BO1 的比分，等於宣稱一個 BO3 打完了卻只打了一張
  //    · 記成 `2:0` —— 憑空發明另外一張根本沒打的地圖
  //  ⇒ **fail-closed**。玩家出戰 BO3 需要一個跨三張地圖的 series 流程
  //    （地圖結果累計住在 MatchSession / ActiveMatch，**不進 SeasonState**，規格 D4），
  //    那是 M4 的工作。在它做出來之前，這條路徑明確拒絕，不猜。
  const series = fixture?.gameMode === "cs" ? (fixture?.matchFormat?.series ?? null) : null;
  if (series) {
    errors.push({
      code: "series_incomplete",
      message: `這場是 ${series} series（先拿兩張地圖），一場對戰的結果結算不了整個 series。`
        + "玩家出戰年度 Major 的 series 流程尚未實作。",
    });
  }
  if (errors.length) return { ok: false, input: null, errors };

  //  玩家在這場是主隊還是客隊——**唯一**要判斷的事
  const playerIsSideA = fixture.sideA === playerTeamId;
  const opponentTeamId = playerIsSideA ? fixture.sideB : fixture.sideA;
  const playerWon = result.winner === "us";

  //  ── ⛔ CS：賽程比分是**地圖數**，不是 MatchResult 帶來的回合數 ──────────
  //  規格 D4：`FixtureOutcome.score` 記地圖數，Season 層不認識地圖裡的事。
  //  `MatchResult.v1` 對 CS 帶的是 Codex 引擎的**回合比分**（例如 13:7）——
  //  那是 CS battle runtime 的責任區（MR12 / halftime / OT）。原樣抄進賽程
  //  等於讓賽季層把回合語義當成自己的比分，正是 ownership lock 要擋的事。
  //  ⚠ 這裡**不重算任何東西**：只讀 `result.winner`（Codex 已經判好的單圖勝負），
  //    BO1 ⇒ 勝方 1 張地圖、敗方 0 張。一個回合數都沒有被搬進來。
  //    BO3 的多地圖累計屬 M3，本函式不預先假設。
  const isCs = fixture.gameMode === "cs";
  const usScore = isCs ? (playerWon ? 1 : 0) : result.score.us;
  const oppScore = isCs ? (playerWon ? 0 : 1) : result.score.opponent;

  return {
    ok: true,
    errors: [],
    input: {
      fixtureId: fixture.id,
      winner: playerWon ? playerTeamId : opponentTeamId,
      //  score.a 永遠對應 sideA ⇒ 客場時 us/opponent 要對調
      score: playerIsSideA
        ? { a: usScore, b: oppScore }
        : { a: oppScore, b: usScore },
      //  時長與種子照抄正式賽果，不四捨五入、不重算
      duration: result.durationSec,
      seed: result.seed,
    },
  };
}

/** 這場正式賽果是不是賽程來的（`session.origin` 判定，不看畫面狀態）。 */
export const isFixtureSession = (session) => session?.origin?.kind === "fixture";

/** 這場正式賽果對應哪一場賽程（不是賽程來源就回 null）。 */
export const fixtureIdOfSession = (session) =>
  (isFixtureSession(session) ? session.origin.fixtureId : null);
