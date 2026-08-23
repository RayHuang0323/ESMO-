// ============================================================================
//  platform/economy/seasonFanAward.js — 賽季名次粉絲獎勵（Fan System F2）
//
//  ── 這一層要解決什麼 ──────────────────────────────────────────────────────
//  F1 之前粉絲只來自單場比賽；F1 讓正式比賽比練習賽值錢。但**賽季結果本身**
//  仍然對粉絲毫無影響——拿冠軍與墊底，賽季結束的那一刻粉絲一樣多。
//  本檔補上那一段：名次、晉級、Major、冠軍，各自值多少粉絲。
//
//  ── 為什麼是純函式、而且只吃 `FinalStandings.v1` ──────────────────────────
//  · `final` 裡已經有全部需要的東西：`competitionId`（末段是 tier）、`playerRank`、
//    `championTeamId`、`rows.length`。**不需要知道賽制、更不需要知道 CS 的地圖細節。**
//    「1 Fixture = 1 series = 1 FixtureOutcome」的語意在上游就收斂完了，
//    本檔看不到也不該看到 map internals。
//  · MOBA 與 CS **共用這一支**。兩者的賽季結果都是 `FinalStandings.v1`，
//    所以不存在「CS 專用的賽季粉絲邏輯」——那會是第二套規則。
//
//  ⚠ 數值是 **calibration target**，不是契約。驗證器守的是**順序**
//    （冠軍 > Major 名次 > 一般名次），不是絕對值。
//    可達性證據：`node tools/fan_calibration.mjs`。
//
//  ⚠ 本檔**不寫任何狀態**。入帳由 `competitionAward.js` 的
//    `settleCompetitionAwardInState()` 負責，並沿用既有的
//    `processedCompetitionAwards[finalStandingsId]` 冪等帳本——**不新增第二個帳本**。
//
//  純函式：不 import React / zustand / localStorage / 亂數 / 時鐘。
// ============================================================================
import { tierFromCompetitionId } from "../progress/fanSourceWeight.js";

/**
 * 各層級的名次粉絲表。索引 0 = 第 1 名。
 *
 * 設計約束（產品要求，逐條對應）：
 *   · **一般名次不得壓過整季比賽的 fanGain**：中後段 400–2,000，
 *     而一季比賽本身是 6.4k–20.5k ⇒ 名次獎勵是點綴，不是主餐。
 *   · **高名次要有感**：聯賽第 1 名 6,000 是第 5 名 1,200 的 5 倍。
 *   · **Major 高於普通聯賽名次**：Major 冠軍 10,000 > 聯賽冠軍 6,000。
 *   · **冠軍要有約 10k 級別的跳升**：聯賽奪冠 = 名次 6,000 ＋ 冠軍 6,000 = 12,000。
 *   · **一冠不得跳完整個 Sponsor 階梯**：12,000 只佔 128k→200k 全程的 ~17%。
 */
export const SEASON_FAN_AWARD = Object.freeze({
  //  常規賽 / 聯賽（`tier: "regular"`）
  regular: Object.freeze({
    placement: Object.freeze([6000, 4000, 2800, 2000, 1200, 900, 600, 400]),
    champion: 6000,
  }),
  //  Major / 大型賽（`tier: "major"`）——4 隊單淘汰，名次只有 1–4
  major: Object.freeze({
    placement: Object.freeze([10000, 6000, 4000, 3000]),
    champion: 10000,
  }),
  //  年度總決賽（`tier: "championship"`）——一季一次的最高舞台
  championship: Object.freeze({
    placement: Object.freeze([12000, 7500, 5000, 3500]),
    champion: 12000,
  }),
  //  資格賽：目前沒有生產者（只在 csSeasonConfig 的未來規劃註解裡），
  //  先給一份很小的表，免得哪天真的出現時靜默掉進 regular 的量級。
  qualifier: Object.freeze({
    placement: Object.freeze([1500, 900, 600, 400]),
    champion: 800,
  }),
});

/** 認不得的 tier → 用聯賽表。fixture 至少是正式比賽，不該掉到 0。 */
const tableFor = (tier) => SEASON_FAN_AWARD[tier] ?? SEASON_FAN_AWARD.regular;

/**
 * 名次 → 粉絲。超出表格長度（隊伍比表格多）⇒ 取最後一格，
 * **不外推、不歸零**：第 12 名與第 8 名都是「後段班」，給一樣的下限就好。
 */
function placementFansOf(table, rank) {
  if (!Number.isFinite(rank) || rank < 1) return 0;
  const list = table.placement;
  return list[Math.min(Math.floor(rank) - 1, list.length - 1)] ?? 0;
}

/**
 * 一份最終名次，發給**玩家隊**多少粉絲。
 *
 * ⚠ 只發玩家隊——與 `playerAwardOf()`（獎金）同一條規則：AI 隊沒有經營狀態，
 *   也沒有任何系統會消費它們的粉絲。
 *
 * @param {object} final  FinalStandings.v1
 * @returns {{fans:number, tier:string, rank:number|null, placementFans:number,
 *            championFans:number, isChampion:boolean, teams:number}}
 */
export function seasonFanAwardOf(final) {
  const none = {
    fans: 0, tier: null, rank: null,
    placementFans: 0, championFans: 0, isChampion: false, teams: 0,
  };
  if (!final || typeof final !== "object") return none;

  const playerTeamId = final.playerTeamId ?? null;
  const rank = Number.isFinite(final.playerRank) ? final.playerRank : null;
  //  玩家不在這份名次裡（AI 專屬賽事）⇒ 不發。
  if (!playerTeamId || rank === null) return none;

  const tier = tierFromCompetitionId(final.competitionId) ?? "regular";
  const table = tableFor(tier);

  const placementFans = placementFansOf(table, rank);
  //  冠軍以 `championTeamId` 為準，**不是**「rank === 1」——季後賽重排之後
  //  兩者通常一致，但契約把冠軍另外記了一欄，就該用那一欄。
  const isChampion = !!playerTeamId && final.championTeamId === playerTeamId;
  const championFans = isChampion ? table.champion : 0;

  return {
    fans: placementFans + championFans,
    tier,
    rank,
    placementFans,
    championFans,
    isChampion,
    teams: Array.isArray(final.rows) ? final.rows.length : 0,
  };
}
