// ============================================================================
//  platform/competitive/competitiveMode.js — CompetitiveMode.v1（Competitive Enablement v1）
//
//  ── 名詞先講清楚（這是最容易踩的坑）────────────────────────────────────────
//  `MATCH_SOURCE.competitive` **不是**本檔的 Competitive。那一格是 V0C 取的名字，
//  玩家看到的是「**一般對戰**」：生涯內排隊、有成長有收益、吃每日容量。
//  本檔的 Competitive 是**線上競技排位**：`MATCH_SOURCE.ranked`、玩家看到「**競技排位**」。
//  ⚠ 不 rename 既有的 `competitive`：它已經寫進存檔、交易單與十幾支 gate，
//    改名的風險遠大於一段說明。
//
//  ── 這一層回答什麼 ──────────────────────────────────────────────────────
//  「競技排位是什麼、跟生涯／賽季的邊界在哪、現在能不能進」。
//  它**不是**伺服器、不是配對、不是即時連線。那些都還不存在。
//
//  ── 單一開關 ──────────────────────────────────────────────────────────────
//  `COMPETITIVE_ENABLED` 住在本檔，不住 `featureFlags.js`：
//    · 它不是開發工具旗標（featureFlags 的語意是「這個 dev 工具還在不在」）；
//    · 它是產品契約的一部分，而且**打開它需要真伺服器時間**，
//      不是改一個布林就能上線。
//  ⚠ 即使改成 true，沒有權威伺服器時間時入口仍然關閉（`server_time_unavailable`）。
//
//  純函式：不 import React / zustand / localStorage / 任何 Store。
// ============================================================================
import { ratedQuotaOf, RATED_QUOTA } from "./ratedQuota.js";

export const COMPETITIVE_MODE_VERSION = "CompetitiveMode.v1";

/**
 * ⚠ 唯一的 Competitive 開關。上線條件見 docs/design/Competitive_Enablement_v1.md §8。
 * ⚠ 命名撞車：這裡的 Competitive ＝ **線上排位（`MATCH_SOURCE.ranked`）**；
 *   與 `MATCH_SOURCE.competitive`（＝畫面上的「一般對戰」，生涯內、已開放）**不是同一件事**，
 *   這個開關也**不控制**一般對戰。詳見 `progress/matchSource.js` 的 `GENERAL_MATCH_SOURCE`。
 */
export const COMPETITIVE_ENABLED = false;

/**
 * 模式契約。每一格都是**承諾**，改動任何一格等於改動玩家對
 * 「打競技排位會不會影響我的生涯／賽季」的認知 —— 必須與實際行為一致，
 * 由 `tools/check_competitive_enablement_v1.mjs` 逐格釘住。
 */
export const COMPETITIVE_MODE = Object.freeze({
  version: COMPETITIVE_MODE_VERSION,
  matchSource: "ranked",
  clock: "server",                 // ServerTime，不是 CareerTime
  modes: Object.freeze(["moba", "cs"]),
  crossModeShared: false,          // I9：MOBA / CS 不共用評分、配額、戰績
  careerWriteback: "none",         // I2 / I3 / I14
  careerGrowth: 0,                 // `PCGM_PARAMS.sourceBase.ranked`
  careerRewards: 0,                // `teamRewardsFor` 早退
  careerEnergy: "untouched",       // 不讀也不寫 players[].energy
  worldDays: 0,                    // `WORLD_TIME_COST.ranked`
  careerCapacity: "not_consumed",  // 不吃一般對戰的每日容量
  seasonLedgers: "none",           // 不寫名次／巡迴積分／冠軍
  ratedQuota: RATED_QUOTA.version, // 綁 ServerTime 的獨立配額
  ratingName: "LadderRating",      // ⚠ 不叫 rating（BattleResult 已用）
  recordOwner: "ranked-authority", // 不進生涯存檔
  fairness: "CbrPipeline.v1",      // Cap → Bracket → Rating（數值 LATER）
});

/** 正式賽季帳本的欄位名。Competitive 的任何資料出現這些鍵 ⇒ 污染賽季。 */
export const SEASON_LEDGER_KEYS = Object.freeze([
  "standings", "circuitPoints", "honors", "trophies", "finalStandings",
  "competitionId", "stageId", "fixtureId", "seasonRecord", "qualification",
]);

/** 生涯寫回的欄位名。Competitive 的任何資料出現這些鍵 ⇒ 可能被當成生涯值。 */
export const CAREER_WRITE_KEYS = Object.freeze([
  "stats", "xp", "xpGained", "lv", "talentPoints", "money", "funds", "fans",
  "prizeWan", "energy", "condition", "morale", "matchStreak", "reputation",
]);

function findKeys(node, keys, path = "", found = [], depth = 0) {
  if (!node || typeof node !== "object" || depth > 8) return found;
  for (const [k, v] of Object.entries(node)) {
    const here = path ? `${path}.${k}` : k;
    if (keys.includes(k)) found.push(here);
    if (v && typeof v === "object") findKeys(v, keys, here, found, depth + 1);
  }
  return found;
}
export const findSeasonLedgerKeys = (node) => findKeys(node, SEASON_LEDGER_KEYS);
export const findCareerWriteKeys = (node) => findKeys(node, CAREER_WRITE_KEYS);

/**
 * **正式入口**：現在能不能進競技排位？
 *
 * 回傳**所有**不可用理由（不是只回第一個），畫面可以一次說清楚。
 * 理由順序固定：開關 → 模式 → 伺服器時間 → 配額。
 *
 * @param {object} p
 * @param {boolean} [p.enabled]      預設讀 `COMPETITIVE_ENABLED`；僅 verifier 注入
 * @param {"moba"|"cs"} p.mode
 * @param {object} p.serverClock     `createServerClock(...)`；沒有權威來源 ⇒ unavailable
 * @param {object|null} p.quotaState  ranked authority 持有的配額狀態
 */
export function competitiveAvailability({ enabled = COMPETITIVE_ENABLED, mode, serverClock = null, quotaState = null } = {}) {
  const reasons = [];
  if (enabled !== true) {
    reasons.push({ code: "competitive_disabled", message: "競技排位尚未開放" });
  }
  if (!COMPETITIVE_MODE.modes.includes(mode)) {
    reasons.push({ code: "mode", message: `未知的模式：${mode}` });
  }
  const serverDay = serverClock?.available ? serverClock.serverDay() : null;
  if (serverDay === null) {
    reasons.push({ code: "server_time_unavailable", message: "無法取得伺服器時間（競技排位需要線上連線）" });
  }
  const quota = serverDay !== null && COMPETITIVE_MODE.modes.includes(mode)
    ? ratedQuotaOf(quotaState, serverDay, mode)
    : null;
  if (quota && quota.remaining <= 0) {
    reasons.push({ code: "rated_quota_exhausted", message: `今天的競技排位場次已用完（${quota.used}/${quota.capacity}），伺服器換日後恢復` });
  }
  return { available: reasons.length === 0, reasons, serverDay, quota };
}
