// ============================================================================
//  platform/progress/growthLog.js — 選手近期成長紀錄（Milestone P1）
//
//  ── 這一層要解決什麼 ──────────────────────────────────────────────────────
//  P0／P0-2／P0-3 讓「練了會變強」成立，但玩家**看不見**：
//    · 賽後 receipt 有 `growth.gains`，`RewardReceiptPanel` 卻只顯示 XP 與等級。
//    · 訓練成長根本沒有任何憑證——`applyCourse` 在 `advanceDay` 的 map 裡直接
//      換掉選手物件，差值當場丟棄。訓練頁的日誌是**照課程定義猜的**
//      （「→ 專注、抗壓 提升」），不是實際套用值，而且存在 React state 裡，
//      重整就消失。
//
//  本檔補上那份憑證。
//
//  ── 設計原則 ──────────────────────────────────────────────────────────────
//  ① **不是第二套資料**。這裡只存「已經套用完成的差值」，不存能力現值、
//     不存 XP 總量、不存等級——那些的唯一事實來源仍是 `player.stats` / `xp` / `lv`。
//     紀錄刪光了，選手一點都不會變弱。它是**帳簿**，不是帳戶。
//  ② **不重算**。呼叫端一律傳入結算當下算好的差值（比賽＝receipt 的
//     `growth.gains`；訓練＝套用 `applyCourse` 前後的實際 diff）。
//     本檔沒有任何成長公式，改不動 P0／P0-2／P0-3 的演算。
//  ③ **決定性去重**。每筆有 `id`（比賽＝`${transactionId}:${playerId}`；
//     訓練＝`train:${playerId}:${day}:${courseId}`）。重送同一筆不會重複入帳，
//     這與 S25 `processedMatchTransactions` 的冪等立場一致。
//  ④ **完全決定性**：沒有亂數、沒有 `Date.now()`。時間由呼叫端傳入。
//
//  純函式：不 import React / zustand / localStorage。
// ============================================================================

/** 每位選手保留幾筆。任務單要求「至少 10 筆」，這裡留 12 筆的餘裕。 */
export const GROWTH_LOG_CAP = 12;

/** 成長來源。 */
export const GROWTH_SOURCES = Object.freeze(["match", "training"]);

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const r1 = (v) => Math.round(v * 10) / 10;

/**
 * 只留下**真的有變動**的項目。
 *
 * ⚠ 這是「不得產生假的能力成長」的執行點：0、負數、NaN、非數字一律濾掉。
 * 能力已達潛力上限時 `applyLevelGrowth` 會回傳空的 gains，經過這裡仍是空的，
 * 畫面就會顯示「本次無能力成長」而不是捏造一個 +0。
 */
export function cleanGains(gains) {
  const out = {};
  for (const k in gains ?? {}) {
    const v = num(gains[k]);
    if (v > 0) out[k] = r1(v);
  }
  return out;
}

/** 差值總和（顯示用；`gains` 已經是實際套用值，這裡不再放大縮小）。 */
export const gainsTotal = (gains) =>
  r1(Object.values(cleanGains(gains)).reduce((s, v) => s + v, 0));

/**
 * 建立一筆成長紀錄。
 *
 * @param {object} p
 * @param {string} p.id            決定性去重鍵（必填）
 * @param {"match"|"training"} p.source
 * @param {string} [p.mode]        比賽模式 "moba" | "cs"
 * @param {string} [p.courseId]    訓練課程 id
 * @param {string} [p.label]       顯示用來源名稱（如「覆盤分析」「MOBA 勝利」）
 * @param {number} [p.day]         第幾天（meta.days）
 * @param {number} [p.week]        第幾週
 * @param {string} [p.at]          時間字串（由呼叫端給；本檔不讀時鐘）
 * @param {number} [p.xpGained]    本次經驗（訓練為 0）
 * @param {number} [p.levelBefore]
 * @param {number} [p.levelAfter]
 * @param {object} [p.gains]       能力差值（實際套用值）
 * @param {object} [p.statsAfter]   成長**後**的能力全表（用來還原「成長前 → 成長後」）
 * @returns {object|null} 沒有 id ⇒ null（不建立無法去重的紀錄）
 */
export function makeGrowthEntry({
  id, source, mode = null, courseId = null, label = "",
  day = 0, week = 0, at = "", xpGained = 0,
  levelBefore = 1, levelAfter = 1, gains = null, statsAfter = null,
}) {
  if (!id || !GROWTH_SOURCES.includes(source)) return null;
  const g = cleanGains(gains);
  //  「成長前」必須由**當時**的成長後值減差值還原，不能拿選手現值回推——
  //  再成長一次之後那樣算就錯了。所以在這裡把當下的成長後值一起釘住。
  const after = {};
  for (const k in g) {
    const v = Number(statsAfter?.[k]);
    if (Number.isFinite(v)) after[k] = r1(v);
  }
  return {
    id: String(id),
    source,
    mode: mode ?? null,
    courseId: courseId ?? null,
    label: String(label ?? ""),
    day: num(day),
    week: num(week),
    at: String(at ?? ""),
    xpGained: Math.max(0, num(xpGained)),
    levelBefore: Math.max(1, num(levelBefore) || 1),
    levelAfter: Math.max(1, num(levelAfter) || 1),
    levelsGained: Math.max(0, num(levelAfter) - num(levelBefore)),
    gains: g,
    after,
    total: gainsTotal(g),
  };
}

/**
 * 某一項能力的「成長前 → 成長後」。
 * 沒有釘住成長後值的舊紀錄 ⇒ 回 null，畫面只顯示增加值（不編造前後值）。
 */
export function beforeAfter(entry, key) {
  const gain = Number(entry?.gains?.[key]);
  const to = Number(entry?.after?.[key]);
  if (!Number.isFinite(gain) || !Number.isFinite(to)) return null;
  return { from: r1(to - gain), to: r1(to), gain: r1(gain) };
}

/**
 * 這筆紀錄有沒有東西可看？
 *
 * ⚠ 刻意**保留「有升級但能力已滿」與「有經驗沒升級」**兩種情況——那是真實發生的事，
 * 玩家該看到「這場拿了經驗但能力沒漲」，而不是被靜靜藏起來。
 * 只有「經驗 0、沒升級、能力也沒動」才真的無事可記。
 */
export const isEmptyGrowth = (e) =>
  !e || (e.xpGained <= 0 && e.levelsGained <= 0 && e.total <= 0);

/**
 * 追加一筆到成長紀錄（最新在前，上限 `GROWTH_LOG_CAP`）。
 *
 * · `id` 已存在 ⇒ **原樣回傳**（重送同一筆不重複加入，也不覆寫既有內容）
 * · 空紀錄 ⇒ 不加入
 *
 * @returns {Array} 新的紀錄陣列（輸入不被變更）
 */
export function appendGrowth(log, entry) {
  const cur = Array.isArray(log) ? log : [];
  if (!entry || isEmptyGrowth(entry)) return cur;
  if (cur.some((e) => e?.id === entry.id)) return cur;
  return [entry, ...cur].slice(0, GROWTH_LOG_CAP);
}

/** 讀取某位選手的成長紀錄（永遠回傳陣列，畫面不必自己防 undefined）。 */
export const growthLogOf = (player) =>
  (Array.isArray(player?.growthLog) ? player.growthLog : []);

/** 最近一筆（名單卡的「最近一次成長提示」用）。 */
export const latestGrowth = (player) => growthLogOf(player)[0] ?? null;

/**
 * 一行摘要文字（畫面不自己組字串）。
 * @param {object} entry
 * @param {(k:string)=>string} statZh 能力鍵 → 中文（由呼叫端注入 playerModel.statZh）
 */
export function growthText(entry, statZh = (k) => k) {
  if (!entry) return "";
  const parts = Object.entries(entry.gains ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${statZh(k)} +${v}`);
  if (parts.length) return parts.join("、");
  if (entry.levelsGained > 0) return "已達潛力上限，本次無能力成長";
  return entry.xpGained > 0 ? "累積經驗中" : "";
}
