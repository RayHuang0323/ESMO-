// ============================================================================
//  platform/time/serverClock.js — ServerTime.v1（Competitive Enablement v1）
//
//  ── 兩個時鐘（Season vNext「TwoClocks」的程式落點）──────────────────────
//    CareerTime  = 每個存檔一條，可快轉。唯一來源是 `worldClock.js`（`meta.days`）。
//    ServerTime  = 全世界同一條，誰都快轉不了。**本檔**。
//
//  永久能力由 CareerTime 產生；線上配額／評分週期由 ServerTime 產生。
//  兩者**互不讀取**：
//    · I1  ServerTime 的任何事件不得寫入 `meta.days`
//    · I5  `meta.days` 不得成為線上進場條件；ServerTime 不得成為生涯操作條件
//    · I16 線上配額只由 ServerTime 重置，**不得**被 CareerTime 推進所重置
//  ⇒ 本檔不 import `worldClock.js`，`worldClock.js` 也不 import 本檔。
//
//  ── ⚠ 目前沒有真伺服器 ────────────────────────────────────────────────────
//  伺服器時間必須來自**權威來源**（未來的後端回應）。本檔只定義：
//    ① 伺服器日怎麼從權威時刻推導（`serverDayOf`）
//    ② 時間來源的形狀（`createServerClock(provider)`）
//  **沒有 provider ⇒ unavailable**，而且**刻意不退回裝置時間**：
//  裝置時間可以被玩家改，退回它等於讓「改手機日期」變成重置 Rated 配額的後門。
//  ⇒ 今天 Competitive 的入口因此一定不可用（`server_time_unavailable`），
//    這是正確的狀態，不是缺陷。
//
//  純函式：不 import React / zustand / localStorage / 任何 Store，不讀真實時鐘。
// ============================================================================

export const SERVER_TIME_VERSION = "ServerTime.v1";

/**
 * 伺服器日的切換點。**全世界同一個時刻換日**（不跟玩家時區走），
 * 否則跨時區的兩個人同一刻會落在不同的伺服器日，配額就能靠改時區多拿。
 *
 * ⚠ 這是產品參數，不是平衡數值；改它等於搬動全體玩家的換日時刻。
 */
export const SERVER_DAY = Object.freeze({
  resetUtcHour: 0,
});

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 權威時刻（epoch ms）→ 伺服器日（整數）。
 * 非有限數字 ⇒ `null`（**不猜**：查不到就是查不到）。
 */
export function serverDayOf(epochMs) {
  const ms = Number(epochMs);
  if (epochMs === null || epochMs === undefined || !Number.isFinite(ms)) return null;
  return Math.floor((ms - SERVER_DAY.resetUtcHour * 60 * 60 * 1000) / DAY_MS);
}

/**
 * 建立一個伺服器時鐘。
 *
 * @param {{kind:string, now:() => number}|null} provider
 *   權威時間來源。未來由後端回應提供；verifier 用固定時刻注入。
 *   `null` ⇒ unavailable。
 * @returns {{ available:boolean, source:string, now:() => number|null, serverDay:() => number|null }}
 */
export function createServerClock(provider = null) {
  const ok = !!provider && typeof provider.now === "function" && typeof provider.kind === "string";
  if (!ok) {
    return Object.freeze({
      available: false,
      source: "none",
      now: () => null,
      serverDay: () => null,
    });
  }
  const read = () => {
    const raw = provider.now();
    //  ⚠ provider 回 null／undefined ＝「現在沒有可信時間」（例如同步過期）。
    //    不可經 `Number(null) === 0` 變成 1970-01-01 —— 那會算出一個真的伺服器日。
    if (raw === null || raw === undefined) return null;
    const v = Number(raw);
    return Number.isFinite(v) ? v : null;
  };
  return Object.freeze({
    available: true,
    source: provider.kind,
    now: read,
    serverDay: () => serverDayOf(read()),
  });
}

/**
 * CareerTime 的欄位名。任何線上資料（配額、結果、戰力輸入）出現這些鍵，
 * 就代表生涯時間漏進了線上 ⇒ 違反 I4／I5。
 */
export const CAREER_TIME_KEYS = Object.freeze([
  "days", "careerDay", "careerYear", "worldDay", "lastPublishedCareerDay",
]);

/** 遞迴找出生涯時間欄位（回傳路徑）。 */
export function findCareerTimeKeys(node, path = "", found = [], depth = 0) {
  if (!node || typeof node !== "object" || depth > 8) return found;
  for (const [k, v] of Object.entries(node)) {
    const here = path ? `${path}.${k}` : k;
    if (CAREER_TIME_KEYS.includes(k)) found.push(here);
    if (v && typeof v === "object") findCareerTimeKeys(v, here, found, depth + 1);
  }
  return found;
}
