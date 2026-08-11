// ============================================================================
//  platform/economy/competitionAward.js — 賽季名次獎金（Milestone Q4）
//
//  ── 這是錢的第三個入口，也是最後一個 ──────────────────────────────────────
//  設計文件 §3 紅線 3：錢的入口有三個，每個都有決定性冪等鍵——
//      ① `applyMatchProgress`   單場賽後獎金（`cat: "prize"`）
//      ② `weeklySettlement`     週結算（`cat: "base"/"sponsor"/"salary"/…`）
//      ③ **本檔**                賽事名次獎金（`cat: "award"`）
//  **不得有第四個。** 本檔也不自己加錢——它產生一份 `nextState`，由呼叫端一次 set()。
//
//  ── 為什麼 `cat` 要與單場獎金分開（D8）────────────────────────────────────
//  `economy/forecast.js` 的 `estimateWeeklyPrize()` 用
//  「最近 N 週 `cat === "prize"` 的正數金額 ÷ N」估每週賽事獎金。
//  冠軍獎金不屬於任何一場比賽，若也記成 `prize`，四週現金預測會把
//  「一季一次的一大筆」當成「每週都有」，預測直接失真。
//  用 `cat: "award"` ⇒ 那支嚴格比對 `"prize"` 的過濾器天然排除它，
//  **不需要在 forecast 那邊加任何排除邏輯**（少一個會忘記維護的地方）。
//
//  ── 冪等 ──────────────────────────────────────────────────────────────────
//  冪等鍵 = `FinalStandings.id`（由 `competition.id` 推導）⇒ 同一個賽事只發一次。
//  帳本 `processedCompetitionAwards` 放在 **profileStore 頂層**，
//  刻意不放進 `matchmaking`——那一包會被 `requeueMatch()` 整個換掉
//  （2026-08-12 的 audit 已經查證過那件事）。
//
//  純函式：不 import React / zustand / localStorage / 亂數 / 時鐘。
// ============================================================================
import { COMPETITION_PRIZE, prizeForRank } from "./economyConfig.js";
import { validateFinalStandings, rowOfTeam } from "../contracts/finalStandings.js";

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** 交易分類：賽事名次獎金。與單場獎金的 `"prize"` **刻意不同**（D8）。 */
export const AWARD_CAT = "award";

/**
 * 這份最終名次會發給**玩家隊**多少獎金。
 *
 * ⚠ MVP 只發玩家隊：AI 隊沒有 `funds`，也沒有任何系統會消費它們的錢。
 *   要發給 AI，得先有 AI 的經營狀態——那不在 MVP（設計文件 §9）。
 *
 * @returns {{rank:number|null, amount:number, teamId:string|null}}
 */
export function playerAwardOf(final, playerTeamId, table = COMPETITION_PRIZE) {
  const row = rowOfTeam(final, playerTeamId ?? final?.playerTeamId ?? null);
  if (!row) return { rank: null, amount: 0, teamId: null };
  return { rank: row.rank, amount: prizeForRank(row.rank, table), teamId: row.teamId };
}

/**
 * 純 reducer：最終名次 → 名次獎金入帳。
 *
 * @param {object} state  profileStore 狀態（finance / processedCompetitionAwards）
 * @param {object} p
 * @param {object} p.final        FinalStandings.v1
 * @param {number} [p.day]        入帳當下的遊戲日（只用於帳本顯示文字）
 * @param {object} [p.prizeTable]
 * @returns {{nextState:object|null, receipt:object}}
 *   nextState = null ⇒ **完全沒有寫入**（驗證失敗，或已經發過了）
 */
export function settleCompetitionAwardInState(state, { final, day = null, prizeTable = COMPETITION_PRIZE } = {}) {
  const v = validateFinalStandings(final);
  if (!v.ok) {
    return {
      nextState: null,
      receipt: { ok: false, settled: false, alreadySettled: false, awardId: null, amount: 0, errors: v.errors },
    };
  }

  const awardId = final.id;
  const ledger = state?.processedCompetitionAwards ?? {};
  const existing = ledger[awardId];
  if (existing) {
    //  冪等：同一個賽事重複結算 ⇒ 回既有 receipt，**不再入帳**
    return { nextState: null, receipt: { ...existing, alreadySettled: true } };
  }

  const playerTeamId = final.playerTeamId ?? null;
  const { rank, amount } = playerAwardOf(final, playerTeamId, prizeTable);

  const finance = state?.finance ?? {};
  const fundsBefore = num(finance.funds);
  const fundsAfter = fundsBefore + amount;

  const receipt = {
    ok: true,
    settled: true,
    alreadySettled: false,
    awardId,
    competitionId: final.competitionId,
    season: final.season,
    teamId: playerTeamId,
    rank,
    amount,
    fundsBefore,
    fundsAfter,
    sealedAtDay: final.sealedAtDay,
    errors: [],
  };

  //  ⚠ 沒有獎金的名次**不寫交易**——帳本上不該出現一筆 $0。
  //    但 receipt 仍然要記進帳本，否則「已經結算過、只是沒錢」會被誤判成沒結算過，
  //    下次進來又跑一次（雖然金額仍是 0，但會多一次無意義的狀態寫入）。
  const tx = amount > 0
    ? [{
        id: `award-${awardId}`,
        date: day ? `第${day}天` : `S${final.season}`,
        type: "income",
        cat: AWARD_CAT,
        label: `第 ${final.season} 賽季 常規賽 第 ${rank} 名 名次獎金`,
        amount,
        color: "#fbbf24",
      }]
    : [];

  const nextState = {
    finance: {
      ...finance,
      funds: fundsAfter,
      transactions: [...tx, ...(finance.transactions ?? [])].slice(0, 60),
    },
    processedCompetitionAwards: { ...ledger, [awardId]: receipt },
  };

  return { nextState, receipt };
}

/** 查詢：這個賽事的名次獎金發過了嗎。 */
export const findCompetitionAward = (state, final) =>
  (state?.processedCompetitionAwards ?? {})[final?.id] ?? null;
