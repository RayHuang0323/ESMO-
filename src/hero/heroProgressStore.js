// ============================================================================
//  hero/heroProgressStore.js — Hero Progress 唯一儲存（Sprint08）
//  模型邏輯全在 heroProgress.js（純）；本檔只做 zustand 包裝 + 持久化適配。
//  持久化：瀏覽器 localStorage；無 localStorage（Node/SSR）自動退化為記憶體。
//  觸發：useBattleFeed 偵測終局 → recordBattleResult(finalSnap)（單向，一場一次）。
//
//  ── B1B：版本化 ＋ 向下相容（B1A 風險 R6）────────────────────────────────
//  舊格式是**裸的** `{ heroId: {xp, level, mastery} }`，沒有版本欄位。
//  新格式包一層 `{ schema: "HeroProgress.v3", progress: {...} }`。
//  ⚠ **鍵名刻意不變**：換鍵會讓所有既有玩家的熟練歸零，而熟練是勝負的
//    主要決定者（271b31d）。改用**形狀偵測**相容，形狀規則只有一份，
//    住在 `platform/persistence/localSaveProvider.js`。
//
//  ⚠ 熟練屬 Cloud Save 的 A 類：它與生涯**必須是同一個時點**，
//    所以真正的存檔出口是 `saveGateway`（見 `installProgress`）。
//    本檔自己的 `persist.save` 只是「賽後立刻落地」的即時保險。
// ============================================================================
import { create } from "zustand";
import { applyMatchResult, buildLoadout, createInitialProgress } from "./heroProgress.js";
import { HERO_ASSIGN, ALL_HERO_IDS } from "../data/roster.js";
import { readHeroProgressPayload, heroProgressPayload, quarantine } from "../platform/persistence/localSaveProvider.js";

const KEY = "esmo.heroProgress.v2";   // Sprint09：heroId 對接 CHAMPIONS_100，鍵空間更換
const canLS = typeof localStorage !== "undefined";
const persist = {
  /**
   * ⚠ B1C：讀不懂**要先隔離**，不能靜默退回初始熟練。
   *   熟練歸零＋下一次存檔覆寫 = 玩家練了幾十場的東西無聲消失。
   *   「鍵不存在」（第一次玩）與「讀不懂」是兩件事，這裡分得開。
   */
  load() {
    if (!canLS) return null;
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch { return null; }
    if (raw === null || raw === "") return null;          // 第一次玩，正常
    const r = readHeroProgressPayload(raw);
    if (r.progress === null) quarantine(KEY, raw, "parse_failed");
    return r.progress;
  },
  save(p) {
    if (!canLS) return { ok: false, error: "no_storage" };
    //  ⚠ 這裡的 catch **回報**而不是靜默吞掉（B1A 風險 R3）。
    //    呼叫端目前只在賽後用它，真正會顯示給玩家的錯誤走 `saveGateway`。
    try { localStorage.setItem(KEY, JSON.stringify(heroProgressPayload(p))); return { ok: true }; }
    catch (e) { return { ok: false, error: String(e?.message ?? e) }; }
  },
};

export const useHeroProgressStore = create((set, get) => ({
  progress: persist.load() ?? createInitialProgress(ALL_HERO_IDS),
  lastDetail: null,          // 本場 EXP/升級明細（BattleEndScreen 用）
  lastRecordedKey: null,     // 防同場重複入帳

  /** Sprint09：只消費 BattleResult（唯一來源），不再自行從 snapshot 演算 */
  recordBattleResult(br) {
    if (!br || br.schema !== "BattleResult.v2") return null;
    const key = `${br.winner}|${br.duration}|${br.score.blue}:${br.score.red}`;
    if (get().lastRecordedKey === key) return null;
    const assign = Object.fromEntries(br.players.map((p) => [p.id, p.heroId]));  // 由 result 推導
    const { progress, detail } = applyMatchResult(get().progress, br, assign);
    persist.save(progress);
    set({ progress, lastDetail: detail, lastRecordedKey: key });
    return detail;
  },

  /** 下場沿用：目前 progress → 引擎 loadout */
  getLoadout() { return buildLoadout(get().progress, HERO_ASSIGN); },

  /**
   * B1B：把一份 progress 整個裝回去（**還原用**，不是累加）。
   *
   * ⚠ 只有 `saveGateway.applyBundle()` 該呼叫它——那是唯一能保證
   *   「生涯與熟練是同一個時點」的地方（B1A 風險 R1）。
   * ⚠ 也會清掉 `lastRecordedKey`：換了一份存檔之後，上一份的防重複鍵
   *   會讓還原後的第一場比賽被誤判成「已經記過了」。
   */
  installProgress(progress) {
    if (!progress || typeof progress !== "object") return false;
    persist.save(progress);
    set({ progress, lastDetail: null, lastRecordedKey: null });
    return true;
  },

  resetProgress() {
    const p = createInitialProgress(ALL_HERO_IDS);
    persist.save(p);
    set({ progress: p, lastDetail: null, lastRecordedKey: null });
  },
}));
