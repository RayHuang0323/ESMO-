// ============================================================================
//  platform/contracts/matchmakingPolicy.js — MatchmakingPolicy.v1（V7-2.9 宣告層）
//
//  ── 這一層只做一件事：把五個概念釘開 ──────────────────────────────────────
//  線上競技很容易把「這支隊伍值多少」與「這個玩家打得多好」混成同一個數字，
//  混掉之後就再也分不開了——一個常見結局是：買強選手直接換到高 Rating，
//  Rating 於是變成資產的代理指標，而不是實力的度量。
//
//    A `squadValuation`   這支陣容**估計**多強（`onlineValuation.js`）
//    B `capBracket`       這份成本**能不能**用在這個級別（`onlineCbr.js`）
//    C `matchBand`        對手成本必須落在多寬的帶內（`onlineCbr.js`）
//    D `opponentSelection`在帶內**怎麼挑**對手（尚未實作）
//    E `onlineRating`     打完之後的**相對強弱**（`onlineCbr.js`，僅資料契約）
//
//  ⚠ **紅線：E 不得與 A 混成同一個數值。**
//    `onlineCbr.js` 的 `RATING_FORBIDDEN` 已經在欄位層擋住
//    （評分不得夾帶 power／strength／stats），本檔把它升級成**架構宣告**，
//    並由 `tools/check_online_valuation_v29.mjs` 斷言。
//
//  ── 保留的產品原則 ────────────────────────────────────────────────────────
//  **生涯決定玩家擁有什麼戰隊；線上規則決定如何公平使用這支戰隊。**
//  所以 B/C/D 只准讀快照與估值，永遠不准讀生涯欄位
//  （資金／天數／賽季／粉絲——`squadSnapshot.js` 的 `FORBIDDEN_KEYS` 已經擋住）。
//
//  ⚠ 本檔**不改變任何 production 行為**，也不被 production 呼叫。
//    它是宣告與守門用的常數，讓「層級被悄悄合併」這件事會在 verifier 失敗。
//
//  純函式：不 import React / zustand / localStorage / 亂數 / 時鐘。
// ============================================================================

export const MATCHMAKING_POLICY_VERSION = "MatchmakingPolicy.v1";

export const POLICY_LAYERS = Object.freeze([
  Object.freeze({
    id: "squadValuation", order: "A", label: "陣容估值",
    module: "contracts/onlineValuation.js",
    reads: Object.freeze(["SquadSnapshot.v1", "roleAssignment?", "matchContext?"]),
    emits: "OnlineValuation.v1",
    status: "boundary-only（v1 的 estimatedPower 就是 squadCostOf，未新增定價）",
  }),
  Object.freeze({
    id: "capBracket", order: "B", label: "成本上限與分級",
    module: "contracts/onlineCbr.js",
    reads: Object.freeze(["SquadSnapshot.v1"]),
    emits: "BRACKETS / capOf / validateAgainstCap",
    status: "provisional（取值未經真實引擎校準）",
  }),
  Object.freeze({
    id: "matchBand", order: "C", label: "配對成本帶",
    module: "contracts/onlineCbr.js",
    reads: Object.freeze(["SquadSnapshot.v1"]),
    emits: "MATCH_BAND / matchBandOf / withinMatchBand",
    status: "CONTESTED（CS 真實引擎實測與現行註解不符，見下）",
  }),
  Object.freeze({
    id: "opponentSelection", order: "D", label: "對手選擇",
    module: null,
    reads: Object.freeze(["matchBand", "onlineRating"]),
    emits: null,
    status: "未實作",
  }),
  Object.freeze({
    id: "onlineRating", order: "E", label: "線上評分",
    module: "contracts/onlineCbr.js",
    reads: Object.freeze(["正式線上比賽結果"]),
    emits: "OnlineRating.v1",
    status: "資料契約only（無結算演算法）",
  }),
]);

/**
 * `MATCH_BAND = 4` 的證據衝突。**這是目前最該被看見的一條。**
 *
 * `onlineCbr.js` 對 `MATCH_BAND` 的註解寫「帶內最壞情況約 67%（差 4）」，
 * 那是對 `simulateFixture` 校準的。CS 真實引擎的實測完全不同：
 */
export const MATCH_BAND_EVIDENCE_CONFLICT = Object.freeze({
  declaredWorstCase: 0.67,
  declaredSource: "cbr_calibration2.mjs §B（simulateFixture）",
  measured: Object.freeze([
    Object.freeze({ mode: "cs", map: "mirage", tactic: "t_apalace", costDelta: 4, winRate: 0.908, ci95: 0.020, n: 800 }),
    Object.freeze({ mode: "cs", map: "inferno", tactic: "t_banana", costDelta: 4, winRate: 0.850, ci95: 0.050, n: 200 }),
    Object.freeze({ mode: "cs", map: "dust2", tactic: "t_bsplit", costDelta: 4, winRate: 0.765, ci95: 0.058, n: 200 }),
  ]),
  measuredSource: "artifacts/cbr-fairness/td52_mirror.json、td52_cross_{inferno,dust2}.json",
  conclusion: "宣稱的 67% 在 CS 真實引擎不成立；實測 76.5–90.8%，三張圖皆顯著",
  //  ⚠ 但**現在不改**：改 band 是 production matchmaking behavior 的變更，
  //    且應該由「估值形狀確定之後」推導出來，不是再猜一個常數。
  action: "記錄衝突，等 AWP triage 與 valuation 形狀確定後由估值推導 band 寬度",
});

/** A 與 E 不得混同——這裡列出評分**永遠不准**帶的東西。 */
export const RATING_MUST_NOT_CARRY = Object.freeze([
  "estimatedPower", "valuation", "components", "cost", "strength", "power",
]);

/** 取某一層的宣告。 */
export function layerOf(id) {
  return POLICY_LAYERS.find((l) => l.id === id) ?? null;
}

/**
 * 檢查一筆線上評分有沒有把估值混進來。
 *
 * ⚠ 與 `onlineCbr.js` 的 `validateOnlineRating()` **不重複**：那支擋的是
 * 生涯／能力欄位外洩，本函式擋的是**估值層**的欄位滲進評分層。
 */
export function assertRatingIsNotValuation(rating) {
  if (!rating || typeof rating !== "object") return { ok: false, errors: [{ code: "invalid", message: "評分不是物件" }] };
  const leaked = Object.keys(rating).filter((k) => RATING_MUST_NOT_CARRY.includes(k));
  return leaked.length
    ? { ok: false, errors: [{ code: "layer_merge", message: `評分不得夾帶估值欄位：${leaked.join(", ")}——A 與 E 是兩件事` }] }
    : { ok: true, errors: [] };
}
