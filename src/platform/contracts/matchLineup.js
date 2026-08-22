// ============================================================================
//  matchLineup.js — 先發指派契約 MatchLineup.v1（Milestone E）
//
//  身分：**席位 → 選手** 的唯一映射規則。純函式 + 常數，不 import React、
//    不 import 引擎、不碰任何 Store（profileStore 與 battle 兩層都 import 本檔，
//    所以它必須留在 platform/contracts，不能塞進 battle/ 造成分層反轉）。
//
//  ── 為什麼需要這一層（Sprint28 技術債 4 的根因）──────────────────────────
//  LogicEngine 的席位是寫死的 b1–b5（`side[0] + (i+1)`，見 LogicEngine 建構子），
//  而 profileStore 的選手 id 只有種子五人恰好也是 b1–b5；招募的新秀 id 是
//  `"r" + timestamp` ⇒ **永遠對不上任何席位、永遠不可能上場**。
//  本檔把「引擎席位」與「選手身分」正式分離：
//      seat（b1–b5，引擎的位置）  ←─ lineup ─→  playerId（profileStore 的人）
//  引擎完全不需要知道這件事：注入時仍以 seat 當 key，形狀與 S28 完全相同。
//
//  ── 相容性紅線 ────────────────────────────────────────────────────────────
//  · 無 lineup（舊存檔 / 驗證 fixture）⇒ normalizeLineup 回退成 identity
//    （b1→b1 … b5→b5）⇒ 與 Milestone E 之前**逐鍵相同**，行為不變。
//  · 一名選手不可能同時佔兩個席位（pass 1 的 used 集合保證）。
//  · 席位可以是 null（該席位沒有指派到人）⇒ 呼叫端一律解讀為「沿用引擎預設 /
//    靜態名單」，**不編造選手**。
// ============================================================================

/** 契約版本（進 profileStore 與驗證腳本；改變語意才升版）。 */
export const MATCH_LINEUP_VERSION = "MatchLineup.v1";

/** 引擎席位（順序 = LogicEngine ROLES = gameData.ROLES）。⚠ 必須與引擎一致。 */
export const ENGINE_SEATS = Object.freeze(["b1", "b2", "b3", "b4", "b5"]);

/** 席位 → 引擎 role（對齊 mobaRosterAdapter.ROLE_ORDER）。 */
export const SEAT_ROLE = Object.freeze({
  b1: "top", b2: "jungle", b3: "mid", b4: "adc", b5: "sup",
});

/** 席位 → 中文路名（對齊 heroDatabase.lane 與 data/players.js 的 role 欄位）。 */
export const SEAT_LANE_ZH = Object.freeze({
  b1: "上路", b2: "打野", b3: "中路", b4: "下路", b5: "輔助",
});

/** 席位 → 位置碼（LineupScreen 的 POSITIONS 顯示用）。 */
export const SEAT_CODE = Object.freeze({
  b1: "TOP", b2: "JUNGLE", b3: "MID", b4: "ADC", b5: "SUPPORT",
});

/** 預設指派：identity（種子五人的 id 恰好就是席位 id）。 */
export const DEFAULT_LINEUP = Object.freeze({
  b1: "b1", b2: "b2", b3: "b3", b4: "b4", b5: "b5",
});

/**
 * 清洗／修復指派表。**不信任持久層**（同 sanitizeTalents 的立場）。
 *
 * @param {Object|null} lineup   { seat: playerId }，可為 null / 損壞
 * @param {Array|null}  players  profileStore.players；傳 null ⇒ 不驗證選手是否存在
 *                               （驗證腳本／單元測試可用）
 * @returns {Object} { b1..b5: playerId|null }，保證：鍵齊全、無重複 playerId
 */
export function normalizeLineup(lineup = null, players = null) {
  const list = Array.isArray(players)
    ? players.filter((p) => p && typeof p === "object" && typeof p.id === "string")
    : null;
  const known = list ? new Set(list.map((p) => p.id)) : null;
  const exists = (id) => typeof id === "string" && id.length > 0 && (!known || known.has(id));
  //  ⚠ **明確**被移出名單的人。判準只認寫死的 `rosterTier === "unlisted"`，
  //    刻意**不呼叫 `tierOf()`**：那一支對沒有 `rosterTier` 的舊存檔會由
  //    `status` 推導，而推導的結果只可能是 active／bench，永遠不會是 unlisted
  //    ⇒ 這裡直接讀欄位，語義與 `tierOf` 逐一致，又不必 import `matchSquad.js`
  //    （那一支 import 本檔，反向 import 會形成循環）。
  const unlisted = new Set(
    (list ?? []).filter((p) => p.rosterTier === "unlisted").map((p) => p.id));

  const used = new Set();
  const out = {};
  // pass 1：採用「有效且未被其他席位佔用」的既有指派
  for (const seat of ENGINE_SEATS) {
    const want = lineup?.[seat];
    if (exists(want) && !used.has(want)) { out[seat] = want; used.add(want); }
    else out[seat] = null;
  }
  // pass 2：空席位回填同名選手（b3 → b3）——舊存檔沒有 lineup 時，這一步讓
  //   結果等於 DEFAULT_LINEUP，行為與 Milestone E 之前完全相同。
  //
  //   ⚠ **但不回填明確 unlisted 的人。** 這一段是**遷移**用的回填，不是
  //     「先發應該是誰」的規則。預設名單的選手 id 正好就是席位名（b1..b5），
  //     所以玩家把某人移出名單、`setRosterTier` 清空席位之後，這裡會立刻把
  //     同一個人補回原位 —— 移出等於沒有發生。
  //   ⚠ 兩者要分辨的是**來源**，不是結果：舊存檔的選手沒有 `rosterTier`，
  //     不在 `unlisted` 裡 ⇒ 回填照舊，遷移行為逐值不變。
  for (const seat of ENGINE_SEATS) {
    if (out[seat]) continue;
    if (unlisted.has(seat)) continue;
    if (exists(seat) && !used.has(seat)) { out[seat] = seat; used.add(seat); }
  }
  return out;
}

/**
 * 指派一名選手到某席位。
 * · 該選手原本已在別的席位 ⇒ **兩個席位互換**（不會產生重複，也不會讓人憑空消失）。
 * · playerId 為 null ⇒ 清空該席位。
 * @returns {Object} 新的（已 normalize 的）指派表；輸入不被修改。
 */
export function assignSeat(lineup, seat, playerId, players = null) {
  if (!ENGINE_SEATS.includes(seat)) return normalizeLineup(lineup, players);
  const base = normalizeLineup(lineup, players);
  const next = { ...base };
  if (!playerId) { next[seat] = null; return normalizeLineup(next, players); }
  const from = ENGINE_SEATS.find((s) => base[s] === playerId && s !== seat) ?? null;
  const displaced = base[seat] ?? null;
  next[seat] = playerId;
  if (from) next[from] = displaced;    // 互換；被換下的人若為 null ⇒ 原席位空出來
  return normalizeLineup(next, players);
}

/** 席位 → 選手物件（找不到 ⇒ null，不編造）。 */
export function seatPlayers(lineup, players = []) {
  const map = normalizeLineup(lineup, players);
  const byId = new Map((players ?? [])
    .filter((p) => p && typeof p.id === "string")
    .map((p) => [p.id, p]));
  return Object.fromEntries(ENGINE_SEATS.map((seat) => [seat, byId.get(map[seat]) ?? null]));
}

/** 某選手目前坐哪個席位（沒上場 ⇒ null）。 */
export function seatOfPlayer(lineup, playerId, players = null) {
  if (!playerId) return null;
  const map = normalizeLineup(lineup, players);
  return ENGINE_SEATS.find((seat) => map[seat] === playerId) ?? null;
}

/** 是否為先發（＝有席位）。 */
export function isStarter(lineup, playerId, players = null) {
  return seatOfPlayer(lineup, playerId, players) != null;
}
