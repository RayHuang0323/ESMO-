// ============================================================================
//  platform/economy/newGame.js — 新局的初始財務狀態（Milestone N3.1）
//
//  ── 為什麼要抽出來 ────────────────────────────────────────────────────────
//  N3 時「開新局長什麼樣」寫在 `profileStore.startNewGame` 裡，驗證器只好**自己
//  再組一份**（它不能 import profileStore，那會拉進 zustand）。N3.1 給新手加了
//  開局扶持贊助之後，兩邊就不一致了：驗證器仍以為新手開局沒有贊助，
//  於是它驗的是一個**現實中不存在的狀態**——綠燈但沒有意義。
//
//  現在規則只有一份：store 與驗證器都呼叫本檔。純函式，可直接 Node 測。
// ============================================================================
import { scenarioById } from "./economyConfig.js";
import { resolveSponsor } from "./sponsors.js";
import { deriveTime } from "./timeline.js";
import { WAN } from "./units.js";

/**
 * 新局的財務起點（只回傳與經濟有關的欄位；選手／名單／收件匣由 store 負責）。
 *
 * @param {string} scenarioId 情境 id（未知 → 預設情境）
 * @returns {{scenario:string, funds:number, activeSponsor:object|null,
 *            starter:object|null, time:{day:number,week:number,season:number},
 *            economy:object}}
 */
export function newGameFinancials(scenarioId) {
  const sc = scenarioById(scenarioId);
  const time = deriveTime(1);
  //  情境可附帶開局扶持贊助（目前只有新手）。它不在贊助市集、不可主動簽，
  //  但**照一般合約規則倒數到期**——扶持是緩衝期，不是永久補貼。
  const starter = sc.starterSponsor ? resolveSponsor(sc.starterSponsor) : null;
  return {
    scenario: sc.id,
    funds: sc.startingFunds * WAN,
    starter,
    activeSponsor: starter
      ? { id: starter.id, weeksLeft: starter.weeks, signedWeek: time.week }
      : null,
    time: { day: time.day, week: time.week, season: time.season },
    economy: { settledWeeks: {}, lastSettledWeek: 0, scenario: sc.id, formLog: [] },
  };
}
