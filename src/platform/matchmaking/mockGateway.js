// ============================================================================
//  platform/matchmaking/mockGateway.js — 本機決定性配對閘道（Milestone O4）
//
//  ── 這是什麼 ──────────────────────────────────────────────────────────────
//  **不是後端**。它是一個純函式，模擬「未來伺服器會回什麼」，讓票券狀態流程
//  可以被完整走完與驗證。日後接上真伺服器時，把 `pollGateway` 換成一次網路
//  請求即可，票券契約與畫面都不必改。
//
//  ── 為什麼要決定性 ────────────────────────────────────────────────────────
//  等待時間、對手、對戰種子全部由 `ticketId` 雜湊推導 ⇒ 同一張票券每次跑
//  都得到同一個結果，驗證器才驗得動。真伺服器當然不是決定性的，但**契約形狀
//  與狀態流程**是同一套。
//
//  ── 它守的界線 ────────────────────────────────────────────────────────────
//  · 對手與種子**由 gateway 決定**，客戶端不能指定（這是 O4 的重點之一）。
//  · 每次輪詢都會**用當下的名單重新驗證出賽資格**——客戶端排隊時健康、
//    排隊中體力掉到門檻以下或被改成未登錄，一樣會被拒絕。
//  · 拒絕一定附中文原因。
// ============================================================================
import { createAssignment, TICKET_STATES } from "../contracts/matchmaking.js";
import {
  createRoom, ROOM_STATES, isRoomTerminal, isExpired, remainingSeconds,
} from "../contracts/matchRoom.js";
import { createSession } from "../contracts/matchSession.js";
import { validateMatchEntryRequest } from "../contracts/matchEntry.js";

/** 模擬的等待區間（秒）。真伺服器由實際佇列長度決定。 */
export const MOCK_WAIT = Object.freeze({ minSec: 3, maxSec: 9 });

/** 模擬對手池（只有識別，沒有戰力數值——真實數值由伺服器持有）。 */
export const MOCK_OPPONENTS = Object.freeze([
  { id: "ai-crimson", name: "赤焰軍團" },
  { id: "ai-azure", name: "蒼藍艦隊" },
  { id: "ai-verdant", name: "翠光學院" },
  { id: "ai-obsidian", name: "黑曜守望" },
  { id: "ai-golden", name: "鎏金王朝" },
]);

function hash32(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < String(s).length; i++) { h ^= String(s).charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/** 這張票券要等幾秒（決定性）。 */
export function waitSecondsFor(ticket) {
  const span = MOCK_WAIT.maxSec - MOCK_WAIT.minSec + 1;
  return MOCK_WAIT.minSec + (hash32(`${ticket?.ticketId}:wait`) % span);
}

/** 這張票券會配到誰（決定性）。 */
export function opponentFor(ticket) {
  return MOCK_OPPONENTS[hash32(`${ticket?.ticketId}:opp`) % MOCK_OPPONENTS.length];
}

/** 這場的對戰種子（決定性；由 gateway 決定，前端不能挑）。 */
export function seedFor(ticket) {
  return hash32(`${ticket?.ticketId}:seed`) % 100000;
}

/**
 * 輪詢閘道。純函式：不改任何狀態，只回報「伺服器會怎麼回」。
 *
 * @param {object} p
 * @param {object} p.ticket        目前票券（必須是 queued）
 * @param {object} p.entryRequest  O3 申請單（用來重新驗證資格）
 * @param {Array}  p.players       伺服器端會看到的名單（本機模擬 = 目前名單）
 * @param {number} p.now           現在時間戳
 * @returns {{decision:"waiting"|"matched"|"rejected", waitedSec:number,
 *            etaSec:number, assignment:object|null, reason:string|null}}
 */
export function pollGateway({ ticket, entryRequest, players = [], now = 0 }) {
  if (!ticket || ticket.state !== TICKET_STATES.queued) {
    return { decision: "waiting", waitedSec: 0, etaSec: 0, assignment: null, reason: null };
  }
  //  ① 每次輪詢都重新驗證資格——排隊期間狀況可能變了
  const v = validateMatchEntryRequest(entryRequest, players);
  if (!v.ok) {
    return {
      decision: "rejected", waitedSec: 0, etaSec: 0, assignment: null,
      reason: v.errors[0]?.message ?? "出賽資格驗證失敗",
    };
  }
  //  ② 等待
  const need = waitSecondsFor(ticket);
  const waited = Math.max(0, Math.floor((now - (ticket.queuedAt ?? now)) / 1000));
  if (waited < need) {
    return { decision: "waiting", waitedSec: waited, etaSec: need - waited, assignment: null, reason: null };
  }
  //  ③ 配對成功 —— 對手與種子由這裡決定，客戶端無從指定
  return {
    decision: "matched",
    waitedSec: waited,
    etaSec: 0,
    reason: null,
    assignment: createAssignment({
      ticket,
      opponent: opponentFor(ticket),
      seed: seedFor(ticket),
      now,
      server: "mock-gateway",
    }),
  };
}

// ── Milestone O5：比賽房間（同樣是決定性模擬，不是後端）────────────────────

/** 對手要花幾秒才會按確認（決定性；真伺服器是真人／AI 的實際反應）。 */
export function opponentReadyDelay(room) {
  //  2–8 秒，且一定小於確認倒數 ⇒ mock 情境下對手不會害你逾時
  return 2 + (hash32(`${room?.roomId}:ready`) % 7);
}

/**
 * 由 gateway 開房。**客戶端不得自己造房間**——roomId 與簽發者都由這裡給。
 * 同一張指派單重複開房會得到同一個 roomId（契約以 assignmentId 推導）。
 */
export function openRoom({ ticket, now = 0 }) {
  if (!ticket || ticket.state !== TICKET_STATES.matched) {
    return { ok: false, room: null, errors: [{ code: "not_matched", message: "票券尚未配對成功，無法開房" }] };
  }
  return createRoom({ assignment: ticket.assignment, ticket, now, server: "mock-gateway" });
}

/**
 * 輪詢房間。純函式：只回報「伺服器會怎麼回」，不改狀態。
 *
 * @returns {{decision:"waiting"|"start_ready"|"opponent_ready"|"expired"|"none",
 *            remainingSec:number, reason:string|null}}
 */
export function pollRoom({ room, now = 0 }) {
  if (!room || isRoomTerminal(room)) return { decision: "none", remainingSec: 0, reason: null };

  //  ① 開房後短暫等待就進入確認階段
  if (room.state === ROOM_STATES.waiting) {
    return { decision: "start_ready", remainingSec: room.readySeconds, reason: null };
  }
  //  ② 確認中：先看逾時，再看對手是否該按確認了
  if (room.state === ROOM_STATES.ready_check) {
    if (isExpired(room, now)) {
      return { decision: "expired", remainingSec: 0, reason: "確認逾時，本次配對已取消" };
    }
    const elapsed = Math.floor((now - (room.readyStartedAt ?? now)) / 1000);
    if (!room.confirmations.opponent && elapsed >= opponentReadyDelay(room)) {
      return { decision: "opponent_ready", remainingSec: remainingSeconds(room, now), reason: null };
    }
    return { decision: "waiting", remainingSec: remainingSeconds(room, now), reason: null };
  }
  return { decision: "none", remainingSec: 0, reason: null };
}

// ── Milestone O6：比賽場次（同樣是決定性模擬，不是後端）────────────────────

/**
 * 由 gateway 簽發比賽場次。**客戶端不得自己造場次或自訂 seed。**
 * 同一個房間重複簽發會得到同一個 sessionId（契約以 roomId 推導）
 * ⇒ 不會重複建立比賽。
 */
export function openSession({ room, ticket, now = 0 }) {
  if (!room || room.state !== ROOM_STATES.confirmed) {
    return { ok: false, session: null, errors: [{ code: "not_confirmed", message: "房間尚未雙方確認，無法建立比賽場次" }] };
  }
  return createSession({ room, ticket, now, server: "mock-gateway" });
}
