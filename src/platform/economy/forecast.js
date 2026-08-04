// ============================================================================
//  platform/economy/forecast.js — 未來現金預測（Milestone N2）
//
//  Dashboard 要回答的問題是「照這樣下去，我還撐得了幾週」。
//
//  預測**沿用週結算同一份計算**（buildWeekLines），只是往前推：
//    · 逐週把贊助合約遞減，合約到期那一週之後就不再有贊助收入
//      ⇒ 「贊助到期會讓現金跳水」在預測圖上看得到，不是事後才發現。
//    · 賽事獎金以帳本裡的**真實紀錄**估計（見 estimateWeeklyPrize），
//      不編造一個假的期望值。沒有紀錄就估 0，寧可保守。
//
//  ⚠ 預測是唯讀的：不寫入任何狀態、不動合約。它跑的是 state 的複本。
//
//  純函式：不 import React / zustand / localStorage。
// ============================================================================
import { buildWeekLines } from "./weeklySettlement.js";
import { WARN } from "./economyConfig.js";
import { deriveTime } from "./timeline.js";

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * 由交易帳本估計「每週賽事獎金」。
 *
 * 只認真實紀錄：`finance.transactions` 裡 `cat === "prize"` 的正數金額
 * （那是 S25 applyMatchProgress 賽後入帳寫進去的）。
 * 取最近 `weeks` 週的總額 ÷ weeks。沒有紀錄 ⇒ 0。
 */
export function estimateWeeklyPrize(state, weeks = 4) {
  const txs = Array.isArray(state?.finance?.transactions) ? state.finance.transactions : [];
  const currentWeek = deriveTime(state?.meta?.days ?? 1).week;
  const since = currentWeek - weeks;
  let total = 0;
  for (const t of txs) {
    if (t?.cat !== "prize" || num(t.amount) <= 0) continue;
    //  週結算寫的交易帶 week；賽後獎金那些舊格式沒有 week ⇒ 一律計入
    //  （保守方向：寧可把舊紀錄算進來，也不要憑空生出收入）。
    if (Number.isFinite(Number(t.week)) && Number(t.week) < since) continue;
    total += num(t.amount);
  }
  return Math.round(total / Math.max(1, weeks));
}

/**
 * 未來 n 週的現金預測。
 *
 * @param {object} state profileStore 狀態
 * @param {number} weeks 展望週數（預設 economyConfig.WARN.forecastWeeks）
 * @returns {{weeks:Array, endFunds:number, minFunds:number, bankruptWeek:number|null,
 *            weeklyPrize:number, level:"ok"|"warn"|"danger"}}
 */
export function forecastWeeks(state, weeks = WARN.forecastWeeks) {
  const n = Math.max(1, Math.floor(Number(weeks) || 1));
  const startWeek = deriveTime(state?.meta?.days ?? 1).week;
  const weeklyPrize = estimateWeeklyPrize(state);
  //  只複製預測會動到的部分（合約週數）；其餘沿用參考，確保不寫回原 state。
  let sponsor = state?.activeSponsor ? { ...state.activeSponsor } : null;
  let funds = num(state?.finance?.funds);
  const out = [];
  let bankruptWeek = null;
  let minFunds = funds;

  for (let i = 0; i < n; i++) {
    const week = startWeek + i;
    //  用當下的合約狀態算這一週（buildWeekLines 只讀 activeSponsor / players / economy）
    const probe = { ...state, activeSponsor: sponsor };
    const { income, expense, net } = buildWeekLines(probe);
    const totalIncome = income + weeklyPrize;
    const weekNet = totalIncome - expense;
    funds += weekNet;
    minFunds = Math.min(minFunds, funds);
    if (funds < 0 && bankruptWeek === null) bankruptWeek = week;
    const expiring = !!sponsor && num(sponsor.weeksLeft) === 1;
    out.push({
      week,
      income: totalIncome,
      expense,
      net: weekNet,
      funds,
      prize: weeklyPrize,
      sponsorWeeksLeft: sponsor ? num(sponsor.weeksLeft) : 0,
      sponsorExpiring: expiring,
    });
    //  推進合約（與 settleWeekInState 同一規則：先入帳、再遞減、歸零即失效）
    if (sponsor && num(sponsor.weeksLeft) > 0) {
      const left = num(sponsor.weeksLeft) - 1;
      sponsor = left <= 0 ? null : { ...sponsor, weeksLeft: left };
    }
  }

  const level = bankruptWeek !== null ? "danger"
    : out.length && out[out.length - 1].net < 0 ? "warn"
      : "ok";
  return { weeks: out, endFunds: funds, minFunds, bankruptWeek, weeklyPrize, level };
}
