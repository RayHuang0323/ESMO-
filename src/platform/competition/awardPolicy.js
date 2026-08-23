// ============================================================================
//  platform/competition/awardPolicy.js — 賽事獎勵政策（Fan System F2.1）
//
//  ── 為什麼需要「政策」這個概念，而不是直接發 ──────────────────────────────
//  賽季結算的合法性由 **policy reference** 決定。`SeasonState.v2` 明文規定：
//
//      award_without_policy — "award receipt requires a prize policy reference"
//
//  而且刻意寫著「Arbitrary v2 events never infer a policy from a receipt」——
//  「沒有政策卻有收據」在架構上就是非法，那不是可以繞過的檢查，是設計。
//
//  F2.1 的作法不是解開那道檢查，而是**補上缺的那一種政策**：
//
//      prizePolicy → 現金／賽事獎金（既有）
//      fanPolicy   → **只有粉絲、沒有現金**的品牌獎勵（本檔新增）
//
//  兩者平行：任一存在 ⇒ award receipt 合法；**兩者都沒有 ⇒ 仍然 fail-closed**。
//  這樣既解決 TD-28（CS 聯賽與 MOBA 巡迴站拿不到粉絲），
//  又沒有把原本「無政策不得憑空生收據」的安全邊界打開。
//
//  ── 為什麼獨立成一支模組 ──────────────────────────────────────────────────
//  v1（`seasonState` / `asiaCircuit` / `asiaFinals`）與 v2（`seasonStateV2`）
//  兩層都要引用它。放在任何一邊都會製造 import 迴圈；這支**零 import**，不會。
//
//  ⚠ 本檔只定義「政策是什麼」，不決定「發多少」——金額在 `economyConfig`，
//    粉絲在 `economy/seasonFanAward.js`。政策只回答「這個賽事該不該發、發哪一種」。
// ============================================================================

/**
 * Fan-only 獎勵政策：**有粉絲、沒有現金**。
 *
 * ⚠ `table: "none"` 是刻意的：結算時它對應一張空的獎金表 ⇒ 金額恆 0、
 *   不寫任何交易。`fanPolicy` **永遠不得發現金**，由 `check_fan_system.mjs` 守著。
 */
export const FAN_AWARD_POLICY = Object.freeze({ kind: "fan_award", table: "none" });

/** 空獎金表：`prizeForRank()` 查不到任何名次 ⇒ 一律回 0。 */
export const NO_PRIZE_TABLE = Object.freeze({ currency: "funds", byRank: Object.freeze({}) });

/** 這是不是 fan-only 政策。 */
export const isFanAwardPolicy = (policy) => policy?.kind === FAN_AWARD_POLICY.kind;

/**
 * 這個賽事該不該結算（任一種政策都算數）。
 * **唯一的判定出口**——呼叫端不要各自寫 `ev.prizePolicy || ev.fanPolicy`。
 */
export const hasAwardPolicy = (event) => !!(event?.prizePolicy || event?.fanPolicy);

/**
 * v2 的 fan policy reference。與 `legacyPrizePolicyRefFor()` 同一個形狀，
 * 只是 schema／path 指向 fan 政策。
 *
 * ⚠ 與獎金那支一樣：**只由既有的 v1 `fanPolicy` 投影而來，不從收據反推**。
 *   「never infer a policy from a receipt」對兩種政策一視同仁。
 */
export function fanPolicyRefFor(competitionId = null) {
  if (!competitionId) return null;
  return {
    schema: "CompetitionFanPolicy.v1",
    id: "fan-award:competition-fan:v1",
    path: "competition:FAN_AWARD_POLICY",
    competitionId,
  };
}
