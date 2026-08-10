// ============================================================================
//  platform/contracts/matchmaking.js — MatchmakingTicket.v1 / MatchAssignment.v1
//  （Milestone O4）
//
//  ── 這一層要解決什麼 ──────────────────────────────────────────────────────
//  O3 產生了「出賽申請單」，但按下配對之後發生什麼事沒有形狀：沒有排隊狀態、
//  沒有等待、沒有取消、沒有拒絕理由，也沒有「對手是誰由誰決定」的界線。
//
//  本檔定義兩份契約：
//    · **MatchmakingTicket.v1** —— 一次排隊。狀態機明確，轉移規則寫死在契約裡，
//      畫面與 Store 都不得自己判斷「這個狀態可以變成那個狀態嗎」。
//    · **MatchAssignment.v1** —— 配對結果。**只能由 gateway（未來的伺服器）產生**，
//      客戶端不得自行指定對手或比賽結果；契約會拒絕夾帶結果的指派單。
//
//  ⚠ 目前沒有真正的後端：`matchmaking/mockGateway.js` 是本機決定性模擬。
//    契約形狀以「日後換成真伺服器」為前提，換掉 gateway 即可，其餘不動。
//
//  純函式：不 import React / zustand / localStorage。
// ============================================================================
import { MATCH_ENTRY_VERSION } from "./matchEntry.js";

export const TICKET_VERSION = "MatchmakingTicket.v1";
export const ASSIGNMENT_VERSION = "MatchAssignment.v1";

/**
 * 票券狀態。
 *   idle       尚未排隊（沒有票券時的呈現狀態）
 *   validating 送出前的驗證中
 *   queued     已進入佇列，等待配對
 *   matched    已配對，拿到 MatchAssignment
 *   cancelled  玩家主動取消
 *   rejected   伺服器（或驗證）拒絕，帶中文原因
 */
export const TICKET_STATES = Object.freeze({
  idle: "idle",
  validating: "validating",
  queued: "queued",
  matched: "matched",
  cancelled: "cancelled",
  rejected: "rejected",
});

/** 終局狀態：不能再轉移。 */
export const TERMINAL_STATES = Object.freeze(["matched", "cancelled", "rejected"]);
/** 仍在進行中（佔用「同一隊伍只能有一張有效票券」的名額）。 */
export const ACTIVE_STATES = Object.freeze(["validating", "queued"]);

/** 合法轉移表。**唯一來源**——呼叫端不得自己判斷。 */
const TRANSITIONS = Object.freeze({
  idle: ["validating"],
  validating: ["queued", "rejected", "cancelled"],
  queued: ["matched", "cancelled", "rejected"],
  matched: [],
  cancelled: [],
  rejected: [],
});

export const isActiveTicket = (t) => !!t && ACTIVE_STATES.includes(t.state);
export const isTerminalTicket = (t) => !!t && TERMINAL_STATES.includes(t.state);
export const canTransition = (from, to) => (TRANSITIONS[from] ?? []).includes(to);

/** FNV-1a → 8 位十六進位（與 matchEntry 同一套決定性雜湊手法）。 */
function hash8(input) {
  const s = typeof input === "string" ? input : JSON.stringify(input);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

/**
 * 由 O3 的申請單建立票券（狀態 = validating）。
 *
 * `ticketId` 由申請單的 transactionId 決定性推導 ⇒ 同一份申請重複建票
 * 會得到同一個 id，伺服器天然可去重。
 *
 * @param {object} entryRequest MatchEntryRequest.v1
 * @param {{now:number}} opts   now = 真實時間戳（等待時間用；可注入以便測試）
 */
export function createTicket(entryRequest, { now = 0, attempt = 0 } = {}) {
  if (!entryRequest || entryRequest.schema !== MATCH_ENTRY_VERSION) {
    return { ok: false, ticket: null, errors: [{ code: "invalid_entry", message: "出賽申請單無效，無法建立配對票券" }] };
  }
  //  ── `attempt`：第幾次為同一套陣容排隊 ─────────────────────────────────
  //  正式環境驗收發現的問題：`ticketId` 由 `transactionId` 決定性推導，而
  //  `transactionId` 又由陣容與週次決定 ⇒ **重新配對會得到與被丟棄那張
  //  一模一樣的 ticketId**（assignmentId、roomId 也跟著相同）。
  //  玩家的體感就是「按了重新配對沒有反應」。
  //
  //  加入 attempt 之後，重新配對是一張**可分辨的新票券**，
  //  但仍然完全決定性——給定 (申請單, attempt) 伺服器可以自己重算出同一個 id，
  //  O4「不信任前端數值」的立場沒有被放寬。
  //  ⚠ `attempt = 0` 的 id 與加入本欄位之前**逐位元相同**，舊驗證不受影響。
  const n = Math.max(0, Math.floor(Number(attempt) || 0));
  const idSeed = n > 0 ? `${entryRequest.transactionId}#${n}` : entryRequest.transactionId;
  return {
    ok: true,
    errors: [],
    ticket: {
      schema: TICKET_VERSION,
      ticketId: `ticket:${entryRequest.mode}:${hash8(idSeed)}`,
      attempt: n,
      mode: entryRequest.mode,
      //  只保留**識別**，不複製整張申請單（申請單本身可由陣容重建）
      entryTransactionId: entryRequest.transactionId,
      rosterVersion: entryRequest.rosterVersion,
      teamId: entryRequest.teamId ?? null,
      state: TICKET_STATES.validating,
      createdAt: now,
      updatedAt: now,
      queuedAt: null,
      assignment: null,
      reason: null,
    },
  };
}

/**
 * 狀態轉移。**唯一入口**——不合法的轉移一律拒絕，不會產生半套狀態。
 *
 * @param {object} ticket
 * @param {string} next   目標狀態
 * @param {object} patch  額外欄位（reason / assignment / now）
 * @returns {{ok:boolean, ticket:object|null, errors:Array}}
 */
export function transitionTicket(ticket, next, { now = 0, reason = null, assignment = null } = {}) {
  if (!ticket || ticket.schema !== TICKET_VERSION) {
    return { ok: false, ticket: null, errors: [{ code: "invalid_ticket", message: "票券無效" }] };
  }
  if (!TICKET_STATES[next]) {
    return { ok: false, ticket: null, errors: [{ code: "unknown_state", message: `未知狀態 ${next}` }] };
  }
  if (!canTransition(ticket.state, next)) {
    return {
      ok: false, ticket: null,
      errors: [{ code: "illegal_transition", message: `無法從「${stateLabel(ticket.state)}」變更為「${stateLabel(next)}」` }],
    };
  }
  if (next === TICKET_STATES.rejected && !reason) {
    return { ok: false, ticket: null, errors: [{ code: "reason_required", message: "拒絕必須附上原因" }] };
  }
  if (next === TICKET_STATES.matched) {
    const v = validateAssignment(assignment, ticket);
    if (!v.ok) return { ok: false, ticket: null, errors: v.errors };
  }
  return {
    ok: true,
    errors: [],
    ticket: {
      ...ticket,
      state: next,
      updatedAt: now,
      queuedAt: next === TICKET_STATES.queued ? now : ticket.queuedAt,
      reason: next === TICKET_STATES.rejected ? reason : ticket.reason,
      assignment: next === TICKET_STATES.matched ? assignment : ticket.assignment,
    },
  };
}

/** 狀態的中文顯示名（畫面與錯誤訊息共用，避免兩套說法）。 */
export function stateLabel(state) {
  return ({
    idle: "尚未配對",
    validating: "驗證中",
    queued: "配對中",
    matched: "已配對",
    cancelled: "已取消",
    rejected: "已拒絕",
  })[state] ?? state;
}

/** 等待秒數（queued 之後）。沒有排隊中就回 0。 */
export function waitedSeconds(ticket, now = 0) {
  if (!ticket?.queuedAt) return 0;
  return Math.max(0, Math.floor((now - ticket.queuedAt) / 1000));
}

/**
 * 這張票券可不可以進入對戰。
 * **只有 matched 且帶合法指派單**才行——取消或被拒絕一律不得進場。
 */
export function canEnterMatch(ticket) {
  if (!ticket) return { ok: false, message: "尚未配對" };
  if (ticket.state !== TICKET_STATES.matched) {
    return { ok: false, message: `目前狀態為「${stateLabel(ticket.state)}」，不可進入對戰` };
  }
  const v = validateAssignment(ticket.assignment, ticket);
  return v.ok ? { ok: true, message: null } : { ok: false, message: v.errors[0]?.message ?? "配對結果無效" };
}

/**
 * 建立配對指派單。**只應由 gateway（未來的伺服器）呼叫。**
 *
 * @param {object} p
 * @param {object} p.ticket
 * @param {object} p.opponent  { id, name, power? }  ← 由伺服器決定，客戶端不得指定
 * @param {number} p.seed      對戰亂數種子（伺服器決定 ⇒ 前端無法選有利種子）
 */
export function createAssignment({ ticket, opponent, seed, now = 0, server = "mock-gateway" }) {
  return {
    schema: ASSIGNMENT_VERSION,
    assignmentId: `assign:${hash8(`${ticket.ticketId}:${seed}`)}`,
    ticketId: ticket.ticketId,
    mode: ticket.mode,
    //  對手只有識別，沒有戰力數值——真實數值由伺服器自己持有
    opponent: { id: opponent?.id ?? null, name: opponent?.name ?? null },
    seed,
    issuedBy: server,
    issuedAt: now,
  };
}

/**
 * 驗證指派單。
 * 除了形狀，特別擋掉**客戶端自行指定比賽結果**：
 * 指派單只能說「你要跟誰打、用哪個種子」，不能夾帶勝負、比分、獎勵。
 */
export function validateAssignment(a, ticket = null) {
  const errors = [];
  if (!a || typeof a !== "object") return { ok: false, errors: [{ code: "invalid", message: "配對結果不是物件" }] };
  if (a.schema !== ASSIGNMENT_VERSION) errors.push({ code: "schema", message: `schema 必須為 ${ASSIGNMENT_VERSION}` });
  if (!a.assignmentId) errors.push({ code: "assignment_id", message: "缺少配對識別碼" });
  if (!a.opponent || !a.opponent.id) errors.push({ code: "opponent", message: "配對結果缺少對手" });
  //  ⚠ 必須檢查**型別**：`Number(null)` 是 0、`Number("")` 也是 0，
  //  只用 Number.isFinite(Number(x)) 會讓 seed: null 矇混過關（驗證器 4g 抓到過）。
  if (typeof a.seed !== "number" || !Number.isFinite(a.seed)) {
    errors.push({ code: "seed", message: "配對結果缺少對戰種子" });
  }
  if (!a.issuedBy) errors.push({ code: "issuer", message: "配對結果必須標明由誰簽發" });
  //  ⛔ 前端不得指定結果
  const forbidden = ["winner", "result", "score", "rewards", "kills", "mvp", "outcome"];
  const leaked = Object.keys(a).filter((k) => forbidden.includes(k));
  if (leaked.length) errors.push({ code: "result_leak", message: `配對結果不得夾帶比賽結果：${leaked.join(", ")}` });
  const oppLeak = Object.keys(a.opponent ?? {}).filter((k) => ["power", "stats", "rating", "lv"].includes(k));
  if (oppLeak.length) errors.push({ code: "opponent_values", message: `對手資料不得夾帶數值：${oppLeak.join(", ")}` });
  if (ticket) {
    if (a.ticketId !== ticket.ticketId) errors.push({ code: "ticket_mismatch", message: "配對結果與票券不符" });
    if (a.mode !== ticket.mode) errors.push({ code: "mode_mismatch", message: "配對結果的模式與票券不符" });
  }
  return { ok: errors.length === 0, errors };
}
