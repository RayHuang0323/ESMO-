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
 * 比賽來源。**唯一來源**——呼叫端不得自創第五種。
 *
 * · `unknown`     **查不到來源**。舊存檔／debug harness／沒有場次的流程。
 *                 ⚠ V0D 之前這一格是 `practice`，而那正是 TD-36：
 *                 「資料遺失」與「玩家真的在打練習賽」被當成同一件事，
 *                 於是 `practice` 的倍率永遠動不了——調低它就等於默默懲罰資料遺失。
 * · `practice`    **快速練習**（V0D）。由**明確的 practice origin** 產生，
 *                 純測試場：不給成長、不給獎勵、不計戰績。
 * · `competitive` 競技比賽。**今天的「一般比賽」就是這一層**，
 *                 未來會長出評分／牌位／排行榜。
 * · `official`    正式季賽。既有的 Competition / Season（含 Major、年度總決賽）。
 */
export const MATCH_SOURCE = Object.freeze({
  unknown: "unknown",
  practice: "practice",
  competitive: "competitive",
  official: "official",
});

/**
 * `MatchOrigin.v1` → 比賽來源。
 *
 * · 沒有 origin（debug harness／舊存檔／舊流程）⇒ **unknown**。
 *   ⚠ **不是 practice。** 這是 V0D 修掉的 TD-36：把「查不到」歸成「練習賽」，
 *   等於讓資料遺失去承擔練習賽的產品規則。`unknown` 的倍率恆為中性 1.0
 *   （見 `careerGrowth.js`），既不慷慨也不懲罰。
 *   它仍然低於 `official` ⇒ 沒有人有動機去弄掉 origin 換成長。
 * · `kind: "practice"`（快速練習）⇒ practice。
 * · `kind: "ticket"`（玩家自己排隊配對）⇒ competitive。
 * · `kind: "fixture"`（賽程排定）⇒ official。
 *   ⚠ 這裡**不再細分** league / major——成長不需要那一層，
 *     粉絲才需要，而那由 `fanSourceWeight` 自己處理。
 */
export function matchSourceFromOrigin(origin) {
  if (!origin || typeof origin !== "object") return MATCH_SOURCE.unknown;
  if (origin.kind === ORIGIN_KINDS.fixture) return MATCH_SOURCE.official;
  if (origin.kind === ORIGIN_KINDS.ticket) return MATCH_SOURCE.competitive;
  if (origin.kind === ORIGIN_KINDS.practice) return MATCH_SOURCE.practice;
  return MATCH_SOURCE.unknown;
}

/** 認不得的字串一律回 unknown（與上面同一個方向：查不到 ≠ 練習賽）。 */
export const normalizeMatchSource = (v) =>
  (v && MATCH_SOURCE[v]) ? MATCH_SOURCE[v] : MATCH_SOURCE.unknown;

/**
 * 這場是不是**明確的**快速練習。
 *
 * ⚠ 產品規則（0 成長／0 獎勵／不計戰績）一律走這一支判定，
 *   呼叫端不得自己比對字串——否則 `unknown` 與 `practice` 遲早會被混為一談，
 *   那正是 TD-36 的形狀。
 */
export const isPracticeSource = (v) => normalizeMatchSource(v) === MATCH_SOURCE.practice;
