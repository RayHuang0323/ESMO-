// ============================================================================
//  hero/heroProgressStore.js — Hero Progress 唯一儲存（Sprint08）
//  模型邏輯全在 heroProgress.js（純）；本檔只做 zustand 包裝 + 持久化適配。
//  持久化：瀏覽器 localStorage；無 localStorage（Node/SSR）自動退化為記憶體。
//  觸發：useBattleFeed 偵測終局 → recordBattleResult(finalSnap)（單向，一場一次）。
// ============================================================================
import { create } from "zustand";
import { snapshotToBattleResult } from "../battle/battleResult.js";
import { applyMatchResult, buildLoadout, createInitialProgress } from "./heroProgress.js";
import { HERO_ASSIGN, ALL_HERO_IDS } from "../data/roster.js";

const KEY = "esmo.heroProgress.v1";
const canLS = typeof localStorage !== "undefined";
const persist = {
  load() { if (!canLS) return null; try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } },
  save(p) { if (!canLS) return; try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {} },
};

export const useHeroProgressStore = create((set, get) => ({
  progress: persist.load() ?? createInitialProgress(ALL_HERO_IDS),
  lastDetail: null,          // 本場 EXP/升級明細（BattleEndScreen 用）
  lastRecordedKey: null,     // 防同場重複入帳

  /** 終局 snapshot → BattleResult → 唯一模型入帳 → 持久化 */
  recordBattleResult(finalSnap) {
    const key = `${finalSnap.winner}|${finalSnap.ts}|${finalSnap.bK}:${finalSnap.rK}`;
    if (!finalSnap.over || get().lastRecordedKey === key) return null;
    const br = snapshotToBattleResult(finalSnap);
    const { progress, detail } = applyMatchResult(get().progress, br, HERO_ASSIGN);
    persist.save(progress);
    set({ progress, lastDetail: detail, lastRecordedKey: key });
    return detail;
  },

  /** 下場沿用：目前 progress → 引擎 loadout */
  getLoadout() { return buildLoadout(get().progress, HERO_ASSIGN); },

  resetProgress() {
    const p = createInitialProgress(ALL_HERO_IDS);
    persist.save(p);
    set({ progress: p, lastDetail: null, lastRecordedKey: null });
  },
}));
