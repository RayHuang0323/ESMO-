// ============================================================================
//  platform/contracts/matchSession.js — MatchSession.v1（Milestone O6）
//
//  ── 這一層要解決什麼 ──────────────────────────────────────────────────────
//  O5 結束於「雙方都確認了」。但確認完到真的開打之間還有一個缺口：
//  **誰有資格啟動這場比賽、可以啟動幾次、用什麼參數啟動。**
//  沒有這一層的話，畫面只要呼叫一次進場函式就能開打，而且可以呼叫很多次
//  （重整、連點、回上一頁再進來），每次都是一場新比賽。
//
//  本檔補上「場次」與「一次性啟動令牌」：
//    · **場次**綁定 roomId / assignmentId / ticketId / 模式 / 雙方隊伍版本 /
//      比賽 seed / 簽發者。任何一項對不上就拒絕啟動。
//    · **launchToken 只能用一次**。用過、過期、場次被取消、令牌不符、
//      綁定資料不一致 —— 一律拒絕，並附中文原因。
//    · 啟動參數（模式／seed／對手）**由場次提供**，前端不得自行指定，
//      更不得夾帶比賽結果。
//
//  ⚠ 沒有真正的後端：場次由 `matchmaking/mockGateway.js` 決定性簽發。
//    契約形狀以「日後換成真伺服器」為前提。
//
//  純函式：不 import React / zustand / localStorage。
// ============================================================================
import { ROOM_VERSION, ROOM_STATES } from "./matchRoom.js";
import { ASSIGNMENT_VERSION } from "./matchmaking.js";
import { originFromTicket, sameOrigin } from "./matchOrigin.js";

export const SESSION_VERSION = "MatchSession.v1";

/**
 * 場次狀態。
 *   created   已簽發，令牌尚未使用（**重整後可恢復的就是這個狀態**）
 *   launched  令牌已使用，比賽已啟動（不可再啟動）
 *   cancelled 已取消
 *   expired   逾期未啟動
 */
export const SESSION_STATES = Object.freeze({
  created: "created",
  launched: "launched",
  //  O7：比賽真的打完 ⇒ completed；中途放棄 ⇒ abandoned
  completed: "completed",
  abandoned: "abandoned",
  cancelled: "cancelled",
  expired: "expired",
});
//  ⚠ O7：`launched` 不再是終局——比賽開打之後還要能恢復、結束或放棄。
export const SESSION_TERMINAL = Object.freeze(["completed", "abandoned", "cancelled", "expired"]);

/**
 * O7：連線狀態（與場次狀態正交）。
 *   connected    正常進行中
 *   disconnected 短暫斷線／重整中——**仍可恢復同一場**
 */
export const CONNECTION_STATES = Object.freeze({ connected: "connected", disconnected: "disconnected" });

/** 場次有效期（秒）。逾期未啟動就作廢，避免留下永遠可用的入場券。 */
export const SESSION_TTL_SECONDS = 300;
export const ACTIVE_MATCH_SCHEMA = "ActiveMatch.v1";
export const ACTIVE_MATCH_STATUSES = Object.freeze(["active", "paused", "finished", "abandoned", "invalid"]);

function hash8(input) {
  const s = typeof input === "string" ? input : JSON.stringify(input);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

/**
 * R63：正式啟動後的可恢復比賽資料。這是 MatchSession.v1 的相容擴充，
 * 不是第二個 match store；場次生命週期仍由本檔的 state 管理。
 */
export function createActiveMatch(session, { lineup = null, config = null, now = 0 } = {}) {
  return {
    schema: ACTIVE_MATCH_SCHEMA,
    matchId: `active:${session.sessionId}`,
    mode: session.mode,
    opponent: session.opponent ?? null,
    lineup: lineup ?? null,
    seed: session.seed,
    startedAt: now || session.launchedAt || session.createdAt || 0,
    status: "active",
    phase: config?.phase ?? null,
    config: config ?? null,
    simulation: {
      status: "active",
      timeSec: 0,
      snapshot: null,
      updatedAt: now,
    },
    updatedAt: now,
  };
}

export function patchActiveMatch(session, patch = {}, now = 0) {
  if (!session?.activeMatch || session.activeMatch.schema !== ACTIVE_MATCH_SCHEMA) return session;
  const current = session.activeMatch;
  const nextSimulation = patch.simulation
    ? { ...(current.simulation ?? {}), ...patch.simulation, updatedAt: now }
    : current.simulation;
  return {
    ...session,
    activeMatch: {
      ...current,
      ...patch,
      ...(patch.simulation ? { simulation: nextSimulation } : {}),
      updatedAt: now,
    },
    updatedAt: now,
  };
}

export const isActiveMatch = (session) => (
  session?.schema === SESSION_VERSION
  && session.state === SESSION_STATES.launched
  && ["active", "paused"].includes(session.activeMatch?.status)
  && session.activeMatch?.schema === ACTIVE_MATCH_SCHEMA
);

/**
 * 由已確認的房間簽發場次。**應由 gateway 呼叫。**
 *
 * `sessionId` 由 roomId 決定性推導 ⇒ 同一個房間重複簽發會得到同一個場次，
 * **不會重複建立比賽**。
 */
export function createSession({ room, ticket, origin = null, assignment: assignmentArg = null, now = 0, server = "mock-gateway", ttlSeconds = SESSION_TTL_SECONDS }) {
  const errors = [];
  if (!room || room.schema !== ROOM_VERSION) errors.push({ code: "room", message: "房間無效，無法建立場次" });
  else if (room.state !== ROOM_STATES.confirmed) errors.push({ code: "room_state", message: "房間尚未雙方確認，無法建立場次" });
  else if (!room.confirmations?.us || !room.confirmations?.opponent) errors.push({ code: "not_both_ready", message: "雙方都確認後才能建立場次" });
  //  Q1：來源可以是票券或賽程，且**必須來自呼叫端的憑證**。
  //  ⚠ 不得回退到 room.origin——那會讓下面「房間與來源不符」的檢查變成自己比自己
  //    （o6 §1h 抓到過）。房間是被檢查的對象，不是憑證。
  const src = origin ?? originFromTicket(ticket).origin;
  if (!src) errors.push({ code: "ticket", message: "缺少票券，無法建立場次" });
  //  賽程路徑的指派單由 competitionGateway 持有（Q3），故允許明確傳入
  const assignment = assignmentArg ?? ticket?.assignment ?? null;
  if (!assignment || assignment.schema !== ASSIGNMENT_VERSION) errors.push({ code: "assignment", message: "缺少有效的配對結果" });
  if (room && src && room.origin && !sameOrigin(room.origin, src)) errors.push({ code: "ticket_mismatch", message: "房間與票券不符" });
  if (room && assignment && room.assignmentId !== assignment.assignmentId) errors.push({ code: "assignment_mismatch", message: "房間與配對結果不符" });
  if (errors.length) return { ok: false, session: null, errors };

  const sessionId = `session:${room.mode}:${hash8(room.roomId)}`;
  return {
    ok: true,
    errors: [],
    session: {
      schema: SESSION_VERSION,
      sessionId,
      //  綁定來源（任何一項對不上都不得啟動）
      roomId: room.roomId,
      assignmentId: room.assignmentId,
      //  ⚠ ticketId 是 origin 的衍生相容欄位（見 matchOrigin.js），不是第二份真相
      ticketId: room.ticketId,
      origin: src,
      mode: room.mode,
      //  雙方隊伍版本：我方來自來源（票券或申請單）；對手由伺服器持有（本機 mock 以對手 id 推導）
      rosterVersions: {
        us: src.rosterVersion ?? ticket?.rosterVersion ?? null,
        opponent: hash8(`${assignment.opponent?.id ?? "unknown"}:roster`),
      },
      //  比賽 seed 沿用 gateway 在配對時決定的那一個（前端不得挑）
      seed: assignment.seed,
      opponent: { id: assignment.opponent?.id ?? null, name: assignment.opponent?.name ?? null },
      issuedBy: server,
      //  一次性啟動令牌：由場次內容推導，但**是否用過**由 tokenUsed 記錄
      launchToken: `lt_${hash8(`${sessionId}:${assignment.seed}:${room.assignmentId}`)}`,
      tokenUsed: false,
      state: SESSION_STATES.created,
      //  O7：連線狀態與追蹤鏈
      connection: CONNECTION_STATES.connected,
      resumeCount: 0,
      matchId: null,
      resultId: null,
      settlementId: null,
      createdAt: now,
      expiresAt: now + ttlSeconds * 1000,
      launchedAt: null,
      activeMatch: null,
      reason: null,
    },
  };
}

/** 場次是否過期。 */
export const isSessionExpired = (s, now = 0) => !!s?.expiresAt && now > s.expiresAt;
export const isSessionTerminal = (s) => !!s && SESSION_TERMINAL.includes(s.state);

/**
 * 驗證場次與目前的房間／票券是否一致。
 * 這是「資料不一致就拒絕進場」的具體檢查。
 */
export function validateSession(session, { room = null, ticket = null, now = 0 } = {}) {
  const errors = [];
  if (!session || session.schema !== SESSION_VERSION) {
    return { ok: false, errors: [{ code: "invalid", message: "比賽場次無效" }] };
  }
  if (!session.issuedBy) errors.push({ code: "issuer", message: "場次未標明簽發者，拒絕啟動" });
  if (session.state === SESSION_STATES.cancelled) errors.push({ code: "cancelled", message: session.reason ?? "場次已取消" });
  if (session.state === SESSION_STATES.expired || isSessionExpired(session, now)) {
    errors.push({ code: "expired", message: "場次已逾期，請重新配對" });
  }
  if (session.state === SESSION_STATES.launched || session.tokenUsed) {
    errors.push({ code: "already_launched", message: "本場比賽已經啟動過，無法重複進入" });
  }
  if (room) {
    if (room.roomId !== session.roomId) errors.push({ code: "room_mismatch", message: "場次與目前房間不符" });
    if (room.state !== ROOM_STATES.confirmed) errors.push({ code: "room_state", message: `房間狀態為「${room.state}」，不可啟動比賽` });
  }
  if (ticket) {
    if (ticket.ticketId !== session.ticketId) errors.push({ code: "ticket_mismatch", message: "場次與目前票券不符（舊票券不可啟動比賽）" });
    const a = ticket.assignment;
    if (!a || a.assignmentId !== session.assignmentId) errors.push({ code: "assignment_mismatch", message: "場次與配對結果不符" });
    if (a && a.seed !== session.seed) errors.push({ code: "seed_mismatch", message: "場次的對戰種子與配對結果不符" });
  }
  return { ok: errors.length === 0, errors };
}

/**
 * 使用一次性令牌啟動比賽。
 *
 * 拒絕的情況（全部附中文原因）：
 *   · 令牌不符
 *   · 令牌已使用過（重複進場）
 *   · 場次過期／已取消
 *   · 與目前房間／票券資料不一致
 *
 * @returns {{ok:boolean, session:object|null, launch:object|null, errors:Array}}
 *   `launch` 是交給對戰入口的啟動參數——**只有模式／種子／對手識別**，
 *   沒有陣容數值、沒有比賽結果。
 */
export function consumeLaunchToken(session, token, { room = null, ticket = null, now = 0 } = {}) {
  const v = validateSession(session, { room, ticket, now });
  if (!v.ok) return { ok: false, session: null, launch: null, errors: v.errors };
  if (!token || token !== session.launchToken) {
    return { ok: false, session: null, launch: null, errors: [{ code: "bad_token", message: "啟動憑證無效" }] };
  }
  const next = {
    ...session,
    state: SESSION_STATES.launched,
    tokenUsed: true,
    launchedAt: now,
  };
  return { ok: true, session: next, launch: launchConfigOf(next), errors: [] };
}

/**
 * 對戰入口需要的啟動參數。**由場次提供，前端不得自行指定。**
 * 刻意不含：陣容數值、雙方能力、比賽結果。
 */
export function launchConfigOf(session) {
  return {
    sessionId: session.sessionId,
    mode: session.mode,
    seed: session.seed,
    opponentId: session.opponent?.id ?? null,
    opponentName: session.opponent?.name ?? null,
    issuedBy: session.issuedBy,
  };
}

/** 取消場次（附原因）。 */
export function cancelSession(session, reason = "已取消本場比賽", now = 0) {
  if (!session || session.schema !== SESSION_VERSION) {
    return { ok: false, session: null, errors: [{ code: "invalid", message: "比賽場次無效" }] };
  }
  if (isSessionTerminal(session)) {
    return { ok: false, session, errors: [{ code: "terminal", message: `場次已是「${sessionStateLabel(session.state)}」，不可取消` }] };
  }
  return { ok: true, session: { ...session, state: SESSION_STATES.cancelled, reason, }, errors: [] };
}

/** 狀態中文名（畫面與訊息共用）。 */
export function sessionStateLabel(state) {
  return ({
    created: "待啟動",
    launched: "進行中",
    completed: "已完成",
    abandoned: "已放棄",
    cancelled: "已取消",
    expired: "已逾期",
  })[state] ?? state;
}


// ── Milestone O7：場次恢復與生命週期 ────────────────────────────────────

/**
 * 恢復同一場次（重整或短暫斷線之後）。
 *
 * **不會開新場、不會再消耗令牌**——令牌在首次啟動時就用掉了。
 * 恢復回傳的 `launch` 與首次啟動**完全相同**（同一個 seed）
 * ⇒ 同一 session 恢復必然得到相同初始戰鬥狀態。
 *
 * 拒絕的情況（皆附中文原因）：已取消、已逾期、已完成、已放棄、
 * 尚未啟動、與目前房間／票券資料不符。
 */
export function resumeSession(session, { room = null, ticket = null, now = 0 } = {}) {
  if (!session || session.schema !== SESSION_VERSION) {
    return { ok: false, session: null, launch: null, errors: [{ code: "invalid", message: "比賽場次無效" }] };
  }
  const errors = [];
  if (!session.issuedBy) errors.push({ code: "issuer", message: "場次未標明簽發者，拒絕恢復" });
  if (session.state === SESSION_STATES.created) errors.push({ code: "not_launched", message: "場次尚未啟動，請由進場流程開始" });
  if (session.state === SESSION_STATES.cancelled) errors.push({ code: "cancelled", message: session.reason ?? "場次已取消，無法恢復" });
  const resumableActive = isActiveMatch(session);
  if (session.state === SESSION_STATES.expired || (!resumableActive && isSessionExpired(session, now))) {
    errors.push({ code: "expired", message: "場次已逾期，無法恢復" });
  }
  if (session.state === SESSION_STATES.completed) errors.push({ code: "completed", message: "本場比賽已結束，無法恢復" });
  if (session.state === SESSION_STATES.abandoned) errors.push({ code: "abandoned", message: "本場比賽已放棄，無法恢復" });
  if (room && room.roomId !== session.roomId) errors.push({ code: "room_mismatch", message: "場次與目前房間不符，無法恢復" });
  if (ticket) {
    if (ticket.ticketId !== session.ticketId) errors.push({ code: "ticket_mismatch", message: "場次與目前票券不符，無法恢復" });
    const a = ticket.assignment;
    if (!a || a.assignmentId !== session.assignmentId) errors.push({ code: "assignment_mismatch", message: "場次與配對結果不符，無法恢復" });
    if (a && a.seed !== session.seed) errors.push({ code: "seed_mismatch", message: "場次的對戰種子與配對結果不符，無法恢復" });
  }
  if (errors.length) return { ok: false, session: null, launch: null, errors };
  return {
    ok: true,
    errors: [],
    session: {
      ...session,
      connection: CONNECTION_STATES.connected,
      resumeCount: (Number(session.resumeCount) || 0) + 1,
    },
    //  與首次啟動逐欄相同（seed 不變 ⇒ 初始狀態不變）
    launch: launchConfigOf(session),
  };
}

/** 標記斷線（仍可恢復）。 */
export function markDisconnected(session, now = 0) {
  if (!session || session.state !== SESSION_STATES.launched) {
    return { ok: false, session, errors: [{ code: "not_launched", message: "只有進行中的場次可以標記斷線" }] };
  }
  return {
    ok: true,
    session: patchActiveMatch({ ...session, connection: CONNECTION_STATES.disconnected }, {
      status: "paused",
      simulation: { status: "paused" },
    }, now),
    errors: [],
  };
}

/** 放棄本場（不可再恢復）。 */
export function abandonSession(session, reason = "已放棄本場比賽", now = 0) {
  if (!session || isSessionTerminal(session)) {
    return { ok: false, session, errors: [{ code: "terminal", message: "場次已結束，無法放棄" }] };
  }
  if (session.state !== SESSION_STATES.launched) {
    return { ok: false, session, errors: [{ code: "not_launched", message: "只有進行中的場次可以放棄" }] };
  }
  const next = { ...session, state: SESSION_STATES.abandoned, reason, abandonedAt: now };
  return {
    ok: true,
    session: session.activeMatch
      ? patchActiveMatch(next, { status: "abandoned", simulation: { status: "abandoned" } }, now)
      : next,
    errors: [],
  };
}

/** 標記完成（附上結果與結算識別，形成追蹤鏈）。 */
export function completeSession(session, { matchId = null, resultId = null, settlementId = null, now = 0 } = {}) {
  if (!session || session.state !== SESSION_STATES.launched) {
    return { ok: false, session, errors: [{ code: "not_launched", message: "只有進行中的場次可以標記完成" }] };
  }
  const next = {
    ...session,
    state: SESSION_STATES.completed,
    matchId: matchId ?? session.matchId,
    resultId: resultId ?? session.resultId,
    settlementId: settlementId ?? session.settlementId,
    completedAt: now,
  };
  return {
    ok: true,
    errors: [],
    session: session.activeMatch
      ? patchActiveMatch(next, { status: "finished", simulation: { status: "finished" } }, now)
      : next,
  };
}
