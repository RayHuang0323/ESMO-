// ============================================================================
//  platform/seasonStore.js — Season / History 儲存（Sprint09，zustand 薄包裝）
//  純邏輯全在 seasonData.js；本檔只做持久化與入史（唯一入口 recordResult）。
//  唯一資料來源：BattleResult（由 useBattleFeed 終局送入一次）。
// ============================================================================
import { create } from "zustand";
import { resultKey } from "./seasonData.js";

const KEY = "esmo.season.v1";
const HISTORY_CAP = 50;
const canLS = typeof localStorage !== "undefined";
const persist = {
  load() { if (!canLS) return null; try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } },
  save(h) { if (!canLS) return; try { localStorage.setItem(KEY, JSON.stringify(h)); } catch {} },
};

export const useSeasonStore = create((set, get) => ({
  history: persist.load() ?? [],   // BattleResult[]（含 timeline；上限 50 場）

  /** 唯一入口：終局 BattleResult 入史（防重複） */
  recordResult(result) {
    if (!result || result.schema !== "BattleResult.v2") return;
    const key = resultKey(result);
    if (get().history.some((r) => resultKey(r) === key)) return;
    const history = [...get().history, result].slice(-HISTORY_CAP);
    persist.save(history);
    set({ history });
  },

  resetSeason() { persist.save([]); set({ history: [] }); },
}));
