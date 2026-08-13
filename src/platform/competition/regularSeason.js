// ============================================================================
//  platform/competition/regularSeason.js — 常規賽組裝（Milestone Q2a）
//
//  把 Competition + Stage + Fixtures 兜成一個賽季。**唯一的組裝點**——
//  Q3 的 `advanceDay` 整合與畫面都呼叫這一支，不各自拼一份。
//
//  ⚠ 本檔**不產生賽果、不算積分榜**。那是 Q2b／Q4 的事。
//
//  純函式：不 import React / zustand / localStorage ⇒ 驗證器可直接 Node 測。
// ============================================================================
import { createCompetition, createStage, STAGE_FORMATS } from "../contracts/competition.js";
import { leagueParticipants, LEAGUE_TEAM_COUNT } from "./aiTeams.js";
import { generateSchedule } from "./scheduleGenerator.js";
import { seedForSeason } from "../identity/teamIdentity.js";

/** 賽季長度（與 economy/timeline 的 12 週 × 7 天一致）。 */
export const SEASON_DAYS = 84;

/**
 * 建立一個 MOBA 常規賽賽季。
 *
 * @param {object} p
 * @param {object} p.playerTeam  profileStore.team（需要 `id`——Q1 的不可變識別碼）
 * @param {number} p.season      賽季編號（meta.season）
 * @param {number} p.seasonSeed  meta.seasonSeed（**本檔負責派生逐賽季種子**）
 * @returns {{ok:boolean, competition, stage, fixtures, summary, errors}}
 */
export function buildRegularSeason({ playerTeam, season = 1, seasonSeed, gameMode = "moba" } = {}) {
  const fail = (errors) => ({ ok: false, competition: null, stage: null, fixtures: [], summary: null, errors });

  if (!playerTeam?.id) {
    return fail([{ code: "team", message: "缺少隊伍識別碼（team.id），無法建立賽季" }]);
  }
  if (typeof seasonSeed !== "number" || !Number.isFinite(seasonSeed)) {
    return fail([{ code: "season_seed", message: "缺少賽季種子（meta.seasonSeed）" }]);
  }

  const comp = createCompetition({ gameMode, season, organizerId: "official", tier: "regular" });
  if (!comp.ok) return fail(comp.errors);

  const participants = leagueParticipants(playerTeam);
  const stg = createStage({
    competition: comp.competition,
    format: STAGE_FORMATS.round_robin,
    participants,
    legs: 2,
    key: "regular",
    dayRange: { from: 1, to: SEASON_DAYS },
  });
  if (!stg.ok) return fail(stg.errors);

  //  ⚠ 逐賽季派生——不得直接用 meta.seasonSeed，否則每季賽程都一樣
  const seed = seedForSeason(seasonSeed, season);
  const sch = generateSchedule({ stage: stg.stage, seed });
  if (!sch.ok) return fail(sch.errors);

  const competition = { ...comp.competition, stageIds: [stg.stage.id] };
  return {
    ok: true,
    errors: [],
    competition,
    stage: stg.stage,
    fixtures: sch.fixtures,
    summary: { ...sch.summary, season, seed, playerTeamId: playerTeam.id, expectedTeams: LEAGUE_TEAM_COUNT },
  };
}
