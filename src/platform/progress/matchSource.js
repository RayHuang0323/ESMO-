// ============================================================================
//  platform/progress/matchSource.js — 比賽來源（Season vNext V0C）
//
//  ── 這一層要解決什麼 ──────────────────────────────────────────────────────
//  `applyMatchProgress` 是**唯一**的永久成長寫入點，但它分不出這場是
//  「一般比賽」還是「正式季賽」——`MatchProgressTransaction` 沒有來源欄位。
//  來源其實一路都在（`MatchOrigin.v1` → adapter 的 `ctx.origin`），
//  只是 adapter 把它換算成一個 **Fan 倍率**之後就丟掉了。
//  ⇒ 「粉絲分得出來、成長分不出來」。這就是 TD-35。
//
//  ── 為什麼不直接沿用 `FAN_SOURCE` ────────────────────────────────────────
//  `fanSourceWeight.js` 的三桶是 practice / league / major，其中
//  **`kind: "ticket"`（玩家自己排隊的一般比賽）被歸進 practice**。
//  那對粉絲曲線是對的（一般比賽不該像正式賽那樣漲粉），
//  但對產品定位是錯的：**快速練習**與**競技比賽**是兩層不同的東西。
//
//  所以本檔另立一組**成長用**的來源，而 `fanSourceWeight.js`
//  **一個位元都不動**（粉絲行為逐值不變）。兩者都只讀同一份 `MatchOrigin`，
//  並由 `tools/check_match_source_v0c.mjs` §X 釘住
//  「不得在『這場是不是正式季賽』上分歧」——分桶可以不同，判斷不可以矛盾。
//
//  ⚠ **MOBA / CS 共用這一份。** 兩個項目各寫一套 = 第二套結算，規格禁止。
//  ⚠ **不得靠 UI route / 畫面名稱 / stage 猜測**。本檔是純函式，只吃 origin。
//
//  純函式：不 import React / zustand / localStorage / 任何 Store。
// ============================================================================
import { ORIGIN_KINDS } from "../contracts/matchOrigin.js";

/**
 * 比賽來源。**唯一來源**——呼叫端不得自創第四種。
 *
 * · `practice`    快速練習。試新人／陣容／戰術。**入口尚未實作**，
 *                 目前只有「拿不到 origin」會落到這裡（保守預設）。
 * · `competitive` 競技比賽。**今天的「一般比賽」就是這一層**，
 *                 未來會長出評分／牌位／排行榜。
 * · `official`    正式季賽。既有的 Competition / Season（含 Major、年度總決賽）。
 */
export const MATCH_SOURCE = Object.freeze({
  practice: "practice",
  competitive: "competitive",
  official: "official",
});

/**
 * `MatchOrigin.v1` → 比賽來源。
 *
 * · 沒有 origin（debug harness／舊存檔／舊流程）⇒ **practice**。
 *   **保守而不是慷慨**：查不到來源時給最低的一層，
 *   避免「查不到就當正式賽算」的反向漏洞。
 * · `kind: "ticket"`（玩家自己排隊配對）⇒ competitive。
 * · `kind: "fixture"`（賽程排定）⇒ official。
 *   ⚠ 這裡**不再細分** league / major——成長不需要那一層，
 *     粉絲才需要，而那由 `fanSourceWeight` 自己處理。
 */
export function matchSourceFromOrigin(origin) {
  if (!origin || typeof origin !== "object") return MATCH_SOURCE.practice;
  if (origin.kind === ORIGIN_KINDS.fixture) return MATCH_SOURCE.official;
  if (origin.kind === ORIGIN_KINDS.ticket) return MATCH_SOURCE.competitive;
  return MATCH_SOURCE.practice;
}

/** 認不得的字串一律回 practice（與上面同一個保守方向）。 */
export const normalizeMatchSource = (v) =>
  (v && MATCH_SOURCE[v]) ? MATCH_SOURCE[v] : MATCH_SOURCE.practice;
