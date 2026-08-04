// ============================================================================
//  platform/contracts/matchRoom.js — MatchRoom.v1（Milestone O5）
//
//  ── 這一層要解決什麼 ──────────────────────────────────────────────────────
//  O4 配對成功之後拿到 `MatchAssignment`，但「進對戰之前雙方要不要確認」
//  沒有形狀：沒有房間、沒有確認、沒有倒數、沒有逾時，也沒有
//  「舊票券能不能進新房間」的界線。
//
//  本檔定義房間與確認流程。三條紅線：
//    ① **房間由 gateway 開**（`roomId` 帶簽發者），客戶端不得自己造一個房間就進場。
//    ② **雙方都確認**才可進場；逾時／取消／票券失效一律擋下，並附中文原因。
//    ③ 房間與**票券＋指派單**綁定 ⇒ 舊票券不可能進新房間。
//
//  ⚠ 沒有真正的後端：對手的確認由 `matchmaking/mockGateway.js` 決定性模擬。
//    契約形狀以「日後換成真伺服器」為前提。
//
//  純函式：不 import React / zustand / localStorage。
// ============================================================================
import { ASSIGNMENT_VERSION, validateAssignment } from "./matchmaking.js";

export const ROOM_VERSION = "MatchRoom.v1";

/**
 * 房間狀態。
 *   waiting     房間已開，尚未開始確認（等雙方就位）
 *   ready_check 確認中，倒數進行
 *   confirmed   雙方都已確認，可進入對戰
 *   cancelled   任一方取消
 *   expired     倒數結束仍未雙方確認
 */
export const ROOM_STATES = Object.freeze({
  waiting: "waiting",
  ready_check: "ready_check",
  confirmed: "confirmed",
  cancelled: "cancelled",
  expired: "expired",
});

export const ROOM_TERMINAL = Object.freeze(["confirmed", "cancelled", "expired"]);

/** 合法轉移表。**唯一來源**——呼叫端不得自己判斷。 */
const TRANSITIONS = Object.freeze({
  waiting: ["ready_check", "cancelled", "expired"],
  ready_check: ["confirmed", "cancelled", "expired"],
  confirmed: [],
  cancelled: [],
  expired: [],
});

/** 確認倒數秒數。真伺服器可由設定下發；本機固定。 */
export const READY_SECONDS = 20;

export const SIDES = Object.freeze(["us", "opponent"]);
export const isRoomTerminal = (r) => !!r && ROOM_TERMINAL.includes(r.state);
export const canRoomTransition = (from, to) => (TRANSITIONS[from] ?? []).includes(to);

function hash8(input) {
  const s = typeof input === "string" ? input : JSON.stringify(input);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

/**
 * 開房。**應由 gateway 呼叫**（`issuedBy` 標明簽發者）。
 *
 * `roomId` 由 assignmentId 決定性推導 ⇒ 同一張指派單重複開房會得到同一個
 * roomId，天然防止重複建立房間。
 */
export function createRoom({ assignment, ticket, now = 0, server = "mock-gateway", readySeconds = READY_SECONDS }) {
  const v = validateAssignment(assignment, ticket);
  if (!v.ok) return { ok: false, room: null, errors: v.errors };
  if (!ticket?.ticketId) {
    return { ok: false, room: null, errors: [{ code: "ticket", message: "缺少票券，無法開房" }] };
  }
  return {
    ok: true,
    errors: [],
    room: {
      schema: ROOM_VERSION,
      roomId: `room:${assignment.mode}:${hash8(assignment.assignmentId)}`,
      //  綁定來源：舊票券／別張指派單都進不了這個房間
      ticketId: ticket.ticketId,
      assignmentId: assignment.assignmentId,
      mode: assignment.mode,
      opponent: { id: assignment.opponent?.id ?? null, name: assignment.opponent?.name ?? null },
      seed: assignment.seed,
      state: ROOM_STATES.waiting,
      confirmations: { us: false, opponent: false },
      readySeconds,
      //  倒數在進入 ready_check 時才開始
      readyStartedAt: null,
      deadline: null,
      issuedBy: server,
      createdAt: now,
      updatedAt: now,
      reason: null,
    },
  };
}

/** 狀態轉移（唯一入口）。 */
export function transitionRoom(room, next, { now = 0, reason = null } = {}) {
  if (!room || room.schema !== ROOM_VERSION) {
    return { ok: false, room: null, errors: [{ code: "invalid_room", message: "房間無效" }] };
  }
  if (!ROOM_STATES[next]) {
    return { ok: false, room: null, errors: [{ code: "unknown_state", message: `未知房間狀態 ${next}` }] };
  }
  if (!canRoomTransition(room.state, next)) {
    return {
      ok: false, room: null,
      errors: [{ code: "illegal_transition", message: `房間無法從「${roomStateLabel(room.state)}」變更為「${roomStateLabel(next)}」` }],
    };
  }
  if ((next === ROOM_STATES.cancelled || next === ROOM_STATES.expired) && !reason) {
    return { ok: false, room: null, errors: [{ code: "reason_required", message: "取消或逾時必須附上原因" }] };
  }
  if (next === ROOM_STATES.confirmed && !(room.confirmations.us && room.confirmations.opponent)) {
    return { ok: false, room: null, errors: [{ code: "not_both_ready", message: "雙方都確認後才能進入對戰" }] };
  }
  const startingReady = next === ROOM_STATES.ready_check;
  return {
    ok: true,
    errors: [],
    room: {
      ...room,
      state: next,
      updatedAt: now,
      readyStartedAt: startingReady ? now : room.readyStartedAt,
      deadline: startingReady ? now + room.readySeconds * 1000 : room.deadline,
      reason: (next === ROOM_STATES.cancelled || next === ROOM_STATES.expired) ? reason : room.reason,
    },
  };
}

/**
 * 某一方確認。
 *   · 只有 `ready_check` 可以確認
 *   · **重複確認一律拒絕**（防止連點灌狀態）
 *   · 逾時之後不可確認
 */
export function confirmSide(room, side, { now = 0 } = {}) {
  if (!room || room.schema !== ROOM_VERSION) {
    return { ok: false, room: null, errors: [{ code: "invalid_room", message: "房間無效" }] };
  }
  if (!SIDES.includes(side)) {
    return { ok: false, room: null, errors: [{ code: "unknown_side", message: `未知的確認方 ${side}` }] };
  }
  if (room.state !== ROOM_STATES.ready_check) {
    return { ok: false, room: null, errors: [{ code: "not_ready_check", message: `目前是「${roomStateLabel(room.state)}」，不能確認` }] };
  }
  if (isExpired(room, now)) {
    return { ok: false, room: null, errors: [{ code: "expired", message: "確認時間已過" }] };
  }
  if (room.confirmations[side]) {
    return { ok: false, room: null, errors: [{ code: "already_confirmed", message: side === "us" ? "已經確認過了" : "對手已經確認過了" }] };
  }
  const confirmations = { ...room.confirmations, [side]: true };
  const next = { ...room, confirmations, updatedAt: now };
  //  雙方到齊 ⇒ 直接進 confirmed（轉移仍走 transitionRoom 以套用規則）
  if (confirmations.us && confirmations.opponent) {
    return transitionRoom(next, ROOM_STATES.confirmed, { now });
  }
  return { ok: true, room: next, errors: [] };
}

/** 倒數是否已過。 */
export function isExpired(room, now = 0) {
  return !!room?.deadline && now > room.deadline;
}

/** 剩餘秒數（沒在倒數就回 0）。 */
export function remainingSeconds(room, now = 0) {
  if (!room?.deadline) return 0;
  return Math.max(0, Math.ceil((room.deadline - now) / 1000));
}

/**
 * 能不能進入對戰。**唯一判定**。
 *
 * 要件（缺一不可）：
 *   · 房間狀態為 confirmed 且雙方都確認
 *   · 房間帶 gateway 簽發者
 *   · 房間與**目前票券**、**該票券的指派單**三者一致（舊票券進不了新房間）
 */
export function canEnterRoom(room, ticket = null) {
  if (!room) return { ok: false, message: "尚未建立比賽房間" };
  if (room.state !== ROOM_STATES.confirmed) {
    return { ok: false, message: room.reason ?? `房間狀態為「${roomStateLabel(room.state)}」，不可進入對戰` };
  }
  if (!room.confirmations?.us || !room.confirmations?.opponent) {
    return { ok: false, message: "雙方都確認後才能進入對戰" };
  }
  if (!room.issuedBy) return { ok: false, message: "房間未標明簽發者，拒絕進入" };
  if (ticket) {
    if (room.ticketId !== ticket.ticketId) return { ok: false, message: "房間與目前票券不符（舊票券不可進入新房間）" };
    const a = ticket.assignment;
    if (!a || a.schema !== ASSIGNMENT_VERSION) return { ok: false, message: "票券缺少有效的配對結果" };
    if (room.assignmentId !== a.assignmentId) return { ok: false, message: "房間與配對結果不符" };
  }
  return { ok: true, message: null };
}

/** 狀態中文名（畫面與訊息共用，避免兩套說法）。 */
export function roomStateLabel(state) {
  return ({
    waiting: "等待就緒",
    ready_check: "確認中",
    confirmed: "雙方已確認",
    cancelled: "已取消",
    expired: "確認逾時",
  })[state] ?? state;
}
