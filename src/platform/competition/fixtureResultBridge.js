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
  if (errors.length) return { ok: false, input: null, errors };

  //  玩家在這場是主隊還是客隊——**唯一**要判斷的事
  const playerIsSideA = fixture.sideA === playerTeamId;
  const opponentTeamId = playerIsSideA ? fixture.sideB : fixture.sideA;
  const playerWon = result.winner === "us";

  return {
    ok: true,
    errors: [],
    input: {
      fixtureId: fixture.id,
      winner: playerWon ? playerTeamId : opponentTeamId,
      //  score.a 永遠對應 sideA ⇒ 客場時 us/opponent 要對調
      score: playerIsSideA
        ? { a: result.score.us, b: result.score.opponent }
        : { a: result.score.opponent, b: result.score.us },
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
