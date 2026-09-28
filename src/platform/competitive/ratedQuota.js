// ============================================================================
//  platform/competitive/ratedQuota.js — RatedQuota.v1（Competitive Enablement v1）
//
//  ── 這一層與「一般對戰每日容量」是兩件事 ──────────────────────────────────
//  | | 一般對戰容量（既有） | Rated 配額（本檔） |
//  |---|---|---|
//  | 常數 | `worldClock.COMPETITIVE_BLOCK` | `RATED_QUOTA` |
//  | 綁哪個時鐘 | **CareerTime**（`meta.days`） | **ServerTime**（伺服器日） |
//  | 節流什麼 | 生涯成長（打滿要推進世界日） | 線上評分場次 |
//  | 分不分模式 | 不分（俱樂部層級一份） | **分**（I9：MOBA / CS 不共用配額） |
//  | 存在哪 | 生涯存檔 `meta.competitiveBlock` | **ranked authority**（未來的後端） |
//
//  ⚠ 兩者**不得**互相引用。Rated 配額若接到 `meta.days`，生涯快轉就能重置它（I16）；
//    一般對戰容量若接到伺服器日，線上就在推生涯節奏（I5）。
//
//  ── Owner Decision（Player Challenge §7.4）──────────────────────────────
//  · 產品基準 **3 場 Rated／伺服器日**（起始基準，非最終數值）。
//  · 用完之後 Challenge / Practice / Career **照常可玩**（本檔只管 Rated）。
//  · **永不可付費增加**：本檔沒有任何「額外場次」參數；傳進來也一律忽略。
//
//  純函式：不 import React / zustand / localStorage / 任何 Store / 生涯時鐘。
// ============================================================================

export const RATED_QUOTA = Object.freeze({
  version: "RatedQuota.v1",
  /** ⚠ 唯一的配額常數。產品起始基準，要調只改這一處。 */
  ratedPerServerDay: 3,
  /** ⚠ 契約，不是設定：Rated 配額永不可購買、永不可由道具／會員增加。 */
  purchasable: false,
  resetBy: "serverDay",
});

export const QUOTA_MODES = Object.freeze(["moba", "cs"]);

const intOr = (v, d) => (Number.isFinite(Number(v)) ? Math.floor(Number(v)) : d);

/**
 * 某模式在某伺服器日的 Rated 配額。
 *
 * ⚠ **跨伺服器日自動歸零**（與 `competitiveBlockOf` 同一個手法：
 *   「(哪一天, 用了幾場)」的推導結果，不需要任何重置程式）。
 * ⚠ 第四個參數刻意接受並**忽略**任何東西：生涯日、bonus、購買數量……
 *   容量只由 `RATED_QUOTA` 決定，重置只由 `serverDay` 決定。
 *
 * @param {object|null} stored  `{ moba: {serverDay, used}, cs: {serverDay, used} }`
 * @param {number|null} serverDay  由 `serverClock` 推導；`null` ⇒ unavailable
 * @param {"moba"|"cs"} mode
 */
// eslint-disable-next-line no-unused-vars
export function ratedQuotaOf(stored, serverDay, mode, _ignored = undefined) {
  const capacity = RATED_QUOTA.ratedPerServerDay;
  const day = serverDay === null || serverDay === undefined ? null : intOr(serverDay, null);
  if (day === null || !QUOTA_MODES.includes(mode)) {
    return { available: false, mode, serverDay: null, used: 0, capacity, remaining: 0 };
  }
  const slot = stored?.[mode];
  const used = slot && intOr(slot.serverDay, NaN) === day ? Math.max(0, intOr(slot.used, 0)) : 0;
  return {
    available: true,
    mode,
    serverDay: day,
    used: Math.min(used, capacity),
    capacity,
    remaining: Math.max(0, capacity - used),
  };
}

/**
 * 扣一場 Rated 配額。**純函式**：回傳下一份狀態，不改輸入。
 * 用完 ⇒ `ok:false`，`next` 與輸入逐值相同。
 */
export function consumeRatedQuota(stored, serverDay, mode) {
  const q = ratedQuotaOf(stored, serverDay, mode);
  const base = stored && typeof stored === "object" ? stored : {};
  if (!q.available) {
    return { ok: false, next: stored ?? null, quota: q,
      error: { code: "server_time_unavailable", message: "目前沒有伺服器時間，無法使用競技排位配額" } };
  }
  if (q.remaining <= 0) {
    return { ok: false, next: stored ?? null, quota: q,
      error: { code: "rated_quota_exhausted", message: `今天的競技排位場次已用完（${q.used}/${q.capacity}），伺服器換日後恢復` } };
  }
  const next = { ...base, [mode]: { serverDay: q.serverDay, used: q.used + 1 } };
  return { ok: true, next, quota: ratedQuotaOf(next, serverDay, mode), error: null };
}
