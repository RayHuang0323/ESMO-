// ============================================================================
//  platform/seasonStore.js — Season / History 儲存（Sprint09，zustand 薄包裝）
//  純邏輯全在 seasonData.js；本檔只做持久化與入史（唯一入口 recordResult）。
//  唯一資料來源：BattleResult（由 useBattleFeed 終局送入一次）。
// ============================================================================
import { create } from "zustand";
import { resultKey } from "./seasonData.js";
import { readSeasonPayload, seasonPayload, quarantine } from "./persistence/localSaveProvider.js";

//  ── B1B：版本化 ＋ 向下相容（B1A 風險 R6）────────────────────────────────
//  舊格式是**裸陣列** `BattleResult[]`；新格式是 `{ schema, history }`。
//  ⚠ **鍵名刻意不變**，靠形狀偵測相容（`Array.isArray` ⇒ 舊格式）。
//    形狀規則只有一份，住在 `platform/persistence/localSaveProvider.js`。
//
//  ── ⚠ 這一份**不進** Cloud Save Bundle ───────────────────────────────────
//  B1B 實測（50 場上限、真實對局）：單場 `BattleResult.v2` 平均 **17,093 B**
//  （最大 22,117 B），其中 90% 是 `timeline` 的中文事件字串
//  ⇒ 整份約 **854,650 B**，比 profile 存檔大 7 倍。
//  而它**不參與任何生涯數值**（獎金／排名／成長各自有帳本）。
//  ⇒ 屬 B 類「只需 Local Cache」：弄丟＝歷史列表變空，生涯數字一格都不動。
//    只有**重置**時由 `saveGateway.resetAllPersistence()` 一起清。
const KEY = "esmo.season.v1";
const HISTORY_CAP = 50;
const canLS = typeof localStorage !== "undefined";
const persist = {
  /** ⚠ B1C：讀不懂一樣先隔離（理由同 heroProgressStore）。 */
  load() {
    if (!canLS) return null;
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch { return null; }
    if (raw === null || raw === "") return null;          // 還沒入史過，正常
    const r = readSeasonPayload(raw);
    if (r.history === null) quarantine(KEY, raw, "parse_failed");
    return r.history;
  },
  save(h) {
    if (!canLS) return { ok: false, error: "no_storage" };
    //  ⚠ 回報而不是靜默吞掉（B1A 風險 R3）。
    try { localStorage.setItem(KEY, JSON.stringify(seasonPayload(h))); return { ok: true }; }
    catch (e) { return { ok: false, error: String(e?.message ?? e) }; }
  },
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
