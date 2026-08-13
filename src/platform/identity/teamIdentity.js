// ============================================================================
//  platform/identity/teamIdentity.js — 隊伍身分與賽季種子（Milestone Q1）
//
//  ── 為什麼需要這一支 ──────────────────────────────────────────────────────
//  Q1 之前，全專案唯一被當成「隊伍識別碼」用的東西是 `profileStore.team.tag`
//  （值是 "GSEAL"）——那是**顯示用的隊伍縮寫**。單機看不出問題，但賽季系統一接上
//  就會壞：玩家改隊名或改 tag，他的積分榜、Circuit Points、歷史賽果全部斷開。
//  AI 隊伍也需要活在同一個命名空間裡。
//
//  同理，賽程產生器需要一個**賽季種子**。規格說「同一賽季重排逐場相同」，
//  那個種子若來自 `Date.now()`，O 系列一路守住的決定性鏈當場就斷了。
//
//  ── 這一支的紅線 ──────────────────────────────────────────────────────────
//  · `team.id` 與 `meta.seasonSeed` **建檔後不可變**。改隊名不影響。
//  · 兩者都由決定性雜湊產生：**沒有 Math.random()、沒有 Date.now()**。
//  · `tag` / `name` 自此純顯示用，不得再被當識別碼。
//
//  純函式：不 import React / zustand / localStorage ⇒ 驗證器可直接 Node 測。
//  （比照 economy/newGame.js：規則只有一份，store 與驗證器共用，
//    避免驗證器自己再組一份而驗到一個現實中不存在的狀態。）
// ============================================================================

/** 隊伍識別碼的前綴。 */
export const TEAM_ID_PREFIX = "team:";

/** FNV-1a → 8 位十六進位（與 matchEntry / matchmaking 同一套決定性雜湊手法）。 */
function hash8(input) {
  const s = typeof input === "string" ? input : JSON.stringify(input);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

/** FNV-1a → uint32（種子用；與 mockGateway 的 hash32 同一套）。 */
function hash32(input) {
  const s = String(input);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/**
 * 產生隊伍識別碼。**只在建檔（或舊存檔第一次載入）時呼叫一次，之後釘住不動。**
 *
 * @param {object} p
 * @param {string} p.name       隊名（僅參與雜湊，日後改名不影響已產生的 id）
 * @param {string} p.tag        隊伍縮寫（同上）
 * @param {string} p.scenario   財務情境 id
 * @param {number} p.createdDay 建檔當下的遊戲日（新局固定 1；舊存檔用當時的 meta.days）
 */
export function deriveTeamId({ name = "", tag = "", scenario = "", createdDay = 1 } = {}) {
  return `${TEAM_ID_PREFIX}${hash8(`${name}|${tag}|${scenario}|d${createdDay}`)}`;
}

/**
 * 產生賽季種子（uint32）。**建檔時一次，之後釘住不動。**
 * 由 `team.id` 推導 ⇒ 同一支隊伍的賽程永遠可重現。
 */
export function deriveSeasonSeed({ teamId = "", scenario = "" } = {}) {
  return hash32(`${teamId}|${scenario}|seasonSeed`);
}

/**
 * 由賽季種子派生「第 N 個賽季」的種子。
 * 跨賽季不重置、不重複 ⇒ 每個賽季的賽程都不同，但都可重現。
 *
 * ⚠ 賽程產生器（Q2a）必須用這一支，不得直接用 `meta.seasonSeed`，
 *   否則每個賽季會排出完全一樣的賽程。
 */
export function seedForSeason(seasonSeed, seasonNumber) {
  return hash32(`${(seasonSeed ?? 0) >>> 0}|s${seasonNumber}`);
}

/** 是不是一個形狀正確的隊伍識別碼。 */
export function isTeamId(x) {
  return typeof x === "string" && new RegExp(`^${TEAM_ID_PREFIX}[0-9a-f]{8}$`).test(x);
}

/** 是不是一個形狀正確的賽季種子。 */
export function isSeasonSeed(x) {
  return typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= 0xffffffff;
}

/**
 * 補齊身分欄位。**唯一的補齊規則**——store 的 migration 與驗證器都呼叫本函式。
 *
 * 冪等：已經有合法值就原樣回傳（**這就是「不可變」的實作**——
 * 第二次呼叫不會因為隊名變了就重新產生）。
 *
 * @param {object} p
 * @param {object} p.team      profileStore.team
 * @param {object} p.meta      profileStore.meta
 * @param {string} p.scenario  economy.scenario
 * @returns {{team:object, meta:object, created:{teamId:boolean, seasonSeed:boolean}}}
 */
export function ensureTeamIdentity({ team = {}, meta = {}, scenario = "" } = {}) {
  const hadTeamId = isTeamId(team.id);
  const id = hadTeamId
    ? team.id
    : deriveTeamId({ name: team.name, tag: team.tag, scenario, createdDay: meta.days ?? 1 });

  const hadSeed = isSeasonSeed(meta.seasonSeed);
  const seasonSeed = hadSeed ? meta.seasonSeed : deriveSeasonSeed({ teamId: id, scenario });

  return {
    team: hadTeamId ? team : { ...team, id },
    meta: hadSeed ? meta : { ...meta, seasonSeed },
    created: { teamId: !hadTeamId, seasonSeed: !hadSeed },
  };
}
