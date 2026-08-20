// ============================================================================
//  platform/competition/csSeasonConfig.js — CS 賽季參賽資格設定（CS Season M1）
//
//  ── 這一支存在的理由 ──────────────────────────────────────────────────────
//  「誰打本季的頂級聯賽」是一個**產品決策**，必須是明文的、可以逐季改的設定，
//  不能從隊伍身上任何一個欄位推導出來。
//
//  ⚠ 尤其**不得**用 `strengthBand` 當參賽資格。那是實力描述（elite / upper /
//    middle / developing），是內容平衡的產物：日後有人把某隊調強或調弱，
//    league 名單就會跟著默默改變——參賽資格不該被實力數值決定。
//    （2026-08-21 的第一版正是這樣寫的，已修正。）
//
//  ⚠ 也**不得**把「本季幾隊」寫成排程器的限制。奇數隊在賽制上可以用輪空（bye）
//    排循環賽；目前排不出來只是 `scheduleGenerator.js` 還沒實作輪空
//    （它自己的訊息就寫得很清楚：「循環賽**目前**不支援奇數隊（需要輪空機制）」）。
//    那是實作限制，不是產品規則。本檔決定的是產品要打幾隊；
//    真要開 9 隊或 10 隊，先補輪空或補內容，設定改這裡就好。
//
//  純資料 + 純函式：不 import React / zustand / localStorage。
// ============================================================================
import { CS_AI_TEAMS, csAiTeamByKey } from "../../data/csAiTeams.js";

/**
 * 隊伍在**本季 CS 賽事體系**中的定位。
 * ⚠ 這是參賽資格，與實力無關。一支 development 隊可以很強，
 *   一支 league 隊也可以很弱——那是內容平衡的事，不影響它今年打不打得到。
 */
export const CS_TEAM_STATUS = Object.freeze({
  /** 頂級聯賽正式席位：打常規賽，名次進得了 Major。 */
  league: "league",
  /**
   * Development / Challenger：**本季**不打頂級聯賽，也不直接進 Major。
   * 進入頂級聯賽的途徑（Qualifier／升降級／擴編）尚未實作 ⇒ 見 §未來。
   */
  development: "development",
});

/**
 * 逐季的頂級聯賽設定。**參賽 AI 是明文列舉的 key，不是條件推導。**
 *
 * `teamCount` 含玩家：玩家永遠佔一席，AI 補滿其餘席次。
 */
export const CS_LEAGUE_SEASONS = Object.freeze({
  1: Object.freeze({
    teamCount: 8,
    //  ⚠ 順序不影響賽程（`generateSchedule` 自己排），列在這裡只是為了可讀。
    aiTeamKeys: Object.freeze([
      "shadowwolf",
      "emeralddragon",
      "flamephoenix",
      "thunderbear",
      "silvereagle",
      "iceguard",
      "ironvanguard",
    ]),
    //  明文記下誰不在，以及為什麼——不要讓「少了一支」變成日後的考古題。
    developmentTeamKeys: Object.freeze(["neoncomets"]),
  }),
});

/** 沒有為某一季寫設定時沿用的那一季。 */
export const CS_DEFAULT_LEAGUE_SEASON = 1;

/** 取某一季的聯賽設定。未定義的賽季沿用預設季（MVP 只有 S1 的設定）。 */
export const csLeagueConfigFor = (season = CS_DEFAULT_LEAGUE_SEASON) =>
  CS_LEAGUE_SEASONS[season] ?? CS_LEAGUE_SEASONS[CS_DEFAULT_LEAGUE_SEASON];

/** 某支 AI 隊在該季的定位。不在 league 名單上的一律是 development。 */
export function csTeamStatusFor(teamKey, season = CS_DEFAULT_LEAGUE_SEASON) {
  const cfg = csLeagueConfigFor(season);
  return cfg.aiTeamKeys.includes(teamKey) ? CS_TEAM_STATUS.league : CS_TEAM_STATUS.development;
}

/** 本季頂級聯賽的 AI 隊伍（依設定的 key 取，取不到就是設定寫錯 ⇒ 丟例外）。 */
export function csLeagueAiTeamsFor(season = CS_DEFAULT_LEAGUE_SEASON) {
  const cfg = csLeagueConfigFor(season);
  const teams = cfg.aiTeamKeys.map((key) => {
    const team = csAiTeamByKey(key);
    if (!team) {
      throw new Error(`CS 聯賽設定指到不存在的隊伍 key："${key}"（csSeasonConfig.js 與 csAiTeams.js 不同步）`);
    }
    return team;
  });
  //  席次守衛：設定裡的 AI 數必須剛好補滿 `teamCount - 1`（玩家佔一席）。
  //  ⚠ 這裡失敗要**大聲失敗**。靜默地少一隊會排出奇數隊，
  //    `generateSchedule` 會擋下來（`odd_participants`），但錯誤會出現在
  //    離設定很遠的地方，很難查。
  if (teams.length !== cfg.teamCount - 1) {
    throw new Error(
      `CS 聯賽本季應有 ${cfg.teamCount} 隊（玩家 ＋ ${cfg.teamCount - 1} 支 AI），`
      + `設定只列出 ${teams.length} 支 AI。請改 csSeasonConfig.js 的 aiTeamKeys 或 teamCount。`,
    );
  }
  return teams;
}

/** 本季不打頂級聯賽的 AI 隊伍（development / challenger）。 */
export const csDevelopmentAiTeamsFor = (season = CS_DEFAULT_LEAGUE_SEASON) =>
  CS_AI_TEAMS.filter((t) => csTeamStatusFor(t.key, season) === CS_TEAM_STATUS.development);

// ── Major 的晉級資格 ────────────────────────────────────────────────────────
//
//  規格 D3：年度 Major 的四個席位**只從該季聯賽 standings 前四**產生。
//  ⚠ Major 的賽制與對戰表是 M3 的工作；這裡只定義**資格從哪裡來**。
//    先把它寫成純函式的理由：資格一旦被寫成「從 standings 取」，
//    一支不在聯賽裡的隊伍在結構上就進不了 Major——不必靠記憶或事後檢查。

export const CS_MAJOR_QUALIFICATION = Object.freeze({
  source: "league_standings",
  topN: 4,
});

/**
 * 由**聯賽積分榜**產生 Major 的晉級名單。
 *
 * @param {{rows: Array<{teamId: string, rank: number}>}} standings 該季聯賽積分榜
 * @returns {Array<{seed: number, teamId: string}>} 依名次排序的前四
 *
 * ⚠ 資料源只有 standings。**不接受額外的隊伍清單、不做任何外卡、不補位。**
 *   少於四隊就回幾隊算幾隊（那代表聯賽本身不完整，該在上游擋，不在這裡編）。
 */
export function csMajorQualifiers(standings, { topN = CS_MAJOR_QUALIFICATION.topN } = {}) {
  return (standings?.rows ?? [])
    .slice()
    .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity))
    .slice(0, topN)
    .map((row, index) => ({ seed: index + 1, teamId: row.teamId }));
}

// ── 未來（不在 M1／M2 範圍）─────────────────────────────────────────────────
//
//  Neon Comets 目前是 development / challenger：本季不打頂級聯賽、不直接進 Major。
//  要讓它進來有三條路，都需要各自的實作，不是改一個旗標就好：
//    ① **Qualifier**：新增一個 `tier: "qualifier"` 的賽事，勝者取得聯賽席位。
//    ② **升降級**：換季時依名次調整 `aiTeamKeys`（需要跨季的席位帳本）。
//    ③ **擴編到 10 隊**：內容再補一支 AI，`teamCount` 改 10。
//       ⚠ 若要開 9 隊，前置是 `scheduleGenerator.js` 支援輪空（bye）。
