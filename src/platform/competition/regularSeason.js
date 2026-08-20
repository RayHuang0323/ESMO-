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
import { csLeagueAiTeamsFor, csLeagueConfigFor } from "./csSeasonConfig.js";
import { generateSchedule } from "./scheduleGenerator.js";
import { seedForSeason } from "../identity/teamIdentity.js";

// ── CS 官方聯賽的參賽名單（CS Season M1）────────────────────────────────────
//
//  **誰參賽由 `csSeasonConfig.js` 明文決定，本檔只負責組裝。**
//
//  ⚠ 這裡刻意**不做任何條件篩選**。第一版曾經寫成
//    `CS_AI_TEAMS.filter((t) => t.strengthBand !== "developing")`，那是錯的：
//    `strengthBand` 是**實力描述**，不是參賽資格。用它當篩選條件的話，
//    日後有人為了平衡把某隊調強或調弱，聯賽名單就會跟著默默改變。
//  ⚠ 也不要把「本季幾隊」講成排程器的限制。奇數隊在賽制上可以用輪空排循環賽，
//    只是 `scheduleGenerator.js` 還沒實作（它自己的錯誤訊息就寫著
//    「循環賽**目前**不支援奇數隊（需要輪空機制）」）。隊數是產品決策，
//    寫在 `csSeasonConfig.js`。
export const CS_LEAGUE_TEAM_COUNT = csLeagueConfigFor().teamCount;

/**
 * CS 官方聯賽參賽者（玩家 ＋ 本季設定列出的 AI）。
 * 形狀與 `leagueParticipants` 完全相同 ⇒ 下游賽制／積分榜一行都不用改。
 */
export function csLeagueParticipants(playerTeam, season = 1) {
  const aiTeams = csLeagueAiTeamsFor(season);          // 席次不符時它自己會丟例外
  const me = {
    id: playerTeam?.id ?? null,
    name: playerTeam?.name ?? "我的戰隊",
    tag: playerTeam?.tag ?? "ME",
    emoji: playerTeam?.emoji ?? "🎮",
    isAi: false,
  };
  //  ⚠ CS 的隊伍資料沒有 emoji 欄位（它有 color）。參賽者形狀要與 MOBA 一致，
  //    缺的欄位給一個中性預設，**不從 color 硬編出一個 emoji**。
  //  ⚠ 玩家永遠佔第一席，**不是**設定的一部分：CS 賽季是玩家的賽季，
  //    「玩家在不在名單裡」不該有第二種可能。
  return [me, ...aiTeams.map((t) => ({ id: t.id, name: t.name, tag: t.tag, emoji: t.emoji ?? "🔫", isAi: true }))];
}

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

  //  ⚠ 兩個項目共用同一個組裝器與同一套賽制，只有**參賽者來源**不同。
  //    這正是 D1「同一套 canonical engine」的實際樣子：不複製一份 CS 專屬的
  //    賽季組裝，也不在這裡分岔出第二種賽制。
  const participants = gameMode === "cs" ? csLeagueParticipants(playerTeam, season) : leagueParticipants(playerTeam);
  const expectedTeams = gameMode === "cs" ? csLeagueConfigFor(season).teamCount : LEAGUE_TEAM_COUNT;
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
  //  ⚠ CS Season M1：CS 再多派生一層。兩個項目共用 `meta.seasonSeed` 與同一個
  //    賽季編號，不加鹽的話 CS 會拿到**與 MOBA 逐場相同的輪次順序**——
  //    玩家每一天都同時有一場 MOBA 與一場 CS，看起來像 bug。
  //    ⚠ 鹽只加在 CS：`seedForSeason(seasonSeed, season)` 對 MOBA 逐值不變，
  //      既有存檔的 56 場賽程一場都不會換位置。
  const seed = gameMode === "cs"
    ? seedForSeason(seasonSeed, `${season}:cs`)
    : seedForSeason(seasonSeed, season);
  const sch = generateSchedule({ stage: stg.stage, seed });
  if (!sch.ok) return fail(sch.errors);

  const competition = { ...comp.competition, stageIds: [stg.stage.id] };
  return {
    ok: true,
    errors: [],
    competition,
    stage: stg.stage,
    fixtures: sch.fixtures,
    summary: { ...sch.summary, season, seed, playerTeamId: playerTeam.id, expectedTeams },
  };
}
