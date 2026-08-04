// ============================================================================
//  platform/economy/formLog.js — 統一賽績紀錄（Milestone N3）
//
//  ── 為什麼需要這支 ────────────────────────────────────────────────────────
//  N2 的贊助績效獎金由 `recentForm()` 決定，而它只讀 `csHistory`（CS 訓練賽）。
//  MOBA 戰績存在 **seasonStore**，不在 profileStore ⇒ 打再多 MOBA 也不影響收入。
//  那是 N2 明確記錄在案的收入盲點。
//
//  ── 為什麼不是「第二套統計」──────────────────────────────────────────────
//  這裡**不重新統計任何東西**：勝負直接取自
//  `MatchProgressTransaction.metadata.winner`（契約既有欄位，"us" | "enemy"，
//  兩種模式統一語意），寫入點就是 S25 唯一的發獎點 `applyMatchProgress`。
//  ⚠ 它**不是**戰績來源：Result / Season / Dashboard 一律不得讀本檔算勝率或戰績
//  （那些仍以 BattleResult / seasonStore 為唯一來源，見 03_開發規範）。
//  本檔只服務一件事：經濟層的「近期狀態」。
//
//  冪等由呼叫端保證：`applyMatchProgress` 以 transactionId 冪等，
//  同一場比賽不可能進來兩次；本檔另外再擋一次同 id（防禦性，成本極低）。
//
//  純函式：不 import React / zustand / localStorage。
// ============================================================================
import { FORM } from "./economyConfig.js";

/** 紀錄保留筆數。取樣視窗是 FORM.window，多留一些方便日後調視窗不必補資料。 */
export const FORM_LOG_CAP = 20;

/**
 * 把一場比賽的勝負追加到統一賽績紀錄（最新在前）。
 *
 * @param {object} economy state.economy 切片
 * @param {{id:string, mode:string, win:boolean, week:number}} entry
 * @returns {object} 新的 economy 切片（不變更原物件）
 */
export function appendFormEntry(economy, entry) {
  const base = economy && typeof economy === "object" ? economy : {};
  const log = Array.isArray(base.formLog) ? base.formLog : [];
  if (!entry?.id || log.some((e) => e.id === entry.id)) return base;   // 同一場不重複計入
  return {
    ...base,
    formLog: [{
      id: entry.id,
      mode: entry.mode ?? null,
      win: !!entry.win,
      week: Number.isFinite(Number(entry.week)) ? Number(entry.week) : null,
    }, ...log].slice(0, FORM_LOG_CAP),
  };
}

/**
 * 由統一賽績紀錄算近期戰績（0–1）。**MOBA 與 CS 一視同仁。**
 * 沒有紀錄 ⇒ 回 null（呼叫端決定要不要退回舊資料或中性值）。
 */
export function formFromLog(economy) {
  const log = Array.isArray(economy?.formLog) ? economy.formLog.slice(0, FORM.window) : [];
  if (!log.length) return null;
  return log.filter((e) => e.win).length / log.length;
}

/**
 * Migration：把舊存檔的 `csHistory` 轉成統一紀錄。
 *
 * N3 之前只有 CS 進得了績效，舊存檔的 csHistory 就是當時唯一的資料；
 * 直接丟掉會讓老玩家的績效獎金在升級後莫名歸零（回中性值）。
 * ⚠ 只在 formLog 還不存在時做一次，之後一律以 formLog 為準。
 */
export function seedFormLogFromCsHistory(economy, csHistory) {
  const base = economy && typeof economy === "object" ? economy : {};
  if (Array.isArray(base.formLog)) return base;
  const hist = Array.isArray(csHistory) ? csHistory : [];
  return {
    ...base,
    formLog: hist.slice(0, FORM_LOG_CAP).map((h, i) => ({
      id: h?.matchId ? `cs:${h.matchId}:progress-v1` : `legacy-cs-${i}`,
      mode: "cs",
      win: h?.winner === "us",
      week: null,
    })),
  };
}
