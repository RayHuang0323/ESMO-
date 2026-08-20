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
import { CS_AI_TEAMS } from "../../data/csAiTeams.js";
import { generateSchedule } from "./scheduleGenerator.js";
import { seedForSeason } from "../identity/teamIdentity.js";

// ── CS 官方聯賽的參賽名單（CS Season M1）────────────────────────────────────
//
//  MOBA 的 `AI_TEAMS` 剛好是 7 支（`LEAGUE_TEAM_COUNT - 1`），玩家補第 8 位。
//  CS 的 `CS_AI_TEAMS` 是 **8 支**——它是 R56 為 CS battle matchup 建的內容池，
//  不是為聯賽建的。8 支 AI ＋ 玩家 ＝ 9 隊是奇數，雙循環排不出來。
//
//  ⚠ 因此必須有一支不進 M1 的官方聯賽。規則寫成**語意的**、不是 `slice(0, 7)`：
//    排除 `strengthBand === "developing"` 的隊伍（目前唯一一支是 Neon Comets，
//    資料上就標成「高潛力新秀」）。新秀隊還沒打進頂級聯賽是講得通的設定，
//    而排掉唯一的 elite（Iron Vanguard）會讓聯賽沒有頭號強隊——那是更糟的產品結果。
//
//  ⚠ 這是 M1 為了湊 8 隊而做的**內容決定**，規格沒有寫死。真正該做的是把
//    CS 聯賽擴到 10 隊、或讓新秀隊透過 Major／升降級進來（M3 之後）。
//    下面的 `length !== CS_LEAGUE_AI_COUNT` 會在內容池變動時立刻炸掉，
//    不會靜默地排出一個隊數不對的賽季。
export const CS_LEAGUE_TEAM_COUNT = 8;
const CS_LEAGUE_AI_COUNT = CS_LEAGUE_TEAM_COUNT - 1;
export const CS_LEAGUE_AI_TEAMS = CS_AI_TEAMS.filter((t) => t.strengthBand !== "developing");

/** CS 官方聯賽參賽者（玩家 ＋ 7 支 AI）。形狀與 `leagueParticipants` 完全相同。 */
export function csLeagueParticipants(playerTeam) {
  if (CS_LEAGUE_AI_TEAMS.length !== CS_LEAGUE_AI_COUNT) {
    throw new Error(
      `CS 聯賽需要 ${CS_LEAGUE_AI_COUNT} 支 AI 隊，實際取到 ${CS_LEAGUE_AI_TEAMS.length} 支`
      + `（csAiTeams.js 的 strengthBand 分布變了 ⇒ 請重新決定聯賽名單，不要讓它靜默排出奇數隊）`,
    );
  }
  const me = {
    id: playerTeam?.id ?? null,
    name: playerTeam?.name ?? "我的戰隊",
    tag: playerTeam?.tag ?? "ME",
    emoji: playerTeam?.emoji ?? "🎮",
    isAi: false,
  };
  //  ⚠ CS 的隊伍資料沒有 emoji 欄位（它有 color）。參賽者形狀要與 MOBA 一致，
  //    缺的欄位給一個中性預設，**不從 color 硬編出一個 emoji**。
  return [me, ...CS_LEAGUE_AI_TEAMS.map((t) => ({ id: t.id, name: t.name, tag: t.tag, emoji: t.emoji ?? "🔫", isAi: true }))];
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
  const participants = gameMode === "cs" ? csLeagueParticipants(playerTeam) : leagueParticipants(playerTeam);
  const expectedTeams = gameMode === "cs" ? CS_LEAGUE_TEAM_COUNT : LEAGUE_TEAM_COUNT;
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
