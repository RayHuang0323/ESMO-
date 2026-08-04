#!/usr/bin/env node
// ============================================================================
//  tools/check_match_session_o6.mjs — Milestone O6：比賽場次與進場
//
//  執行：repo 根目錄 `node tools/check_match_session_o6.mjs`；**失敗時 exit 1**。
//
//  驗的是這個閉環的六件事：
//    ① 雙方確認後才簽發場次；綁定 room / assignment / ticket / 模式 /
//       雙方隊伍版本 / seed / 簽發者
//    ② **launchToken 只能用一次**——重複進場一律拒絕
//    ③ 過期、取消、資料不一致都拒絕，並附中文原因
//    ④ 啟動參數由場次提供：**沒有陣容數值、沒有比賽結果**，前端不得自訂
//    ⑤ 同一房間不會重複建立比賽（sessionId 決定性）
//    ⑥ 尚未啟動的場次可在重整後恢復；MOBA 與 CS 共用同一套契約
// ============================================================================
import {
  SESSION_VERSION, SESSION_STATES, SESSION_TERMINAL, SESSION_TTL_SECONDS,
  createSession, validateSession, consumeLaunchToken, launchConfigOf,
  cancelSession, sessionStateLabel, isSessionExpired, isSessionTerminal,
} from "../src/platform/contracts/matchSession.js";
import { ROOM_STATES, createRoom, transitionRoom, confirmSide } from "../src/platform/contracts/matchRoom.js";
import { TICKET_STATES, createTicket, transitionTicket, createAssignment } from "../src/platform/contracts/matchmaking.js";
import { openSession, MOCK_OPPONENTS } from "../src/platform/matchmaking/mockGateway.js";
import { createMatchEntryRequest } from "../src/platform/contracts/matchEntry.js";
import { ENGINE_SEATS } from "../src/platform/contracts/matchLineup.js";
import { CS_SEATS } from "../src/platform/contracts/matchSquad.js";

let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`✅ ${name}${detail ? "　" + detail : ""}`); }
  else { fail++; console.log(`❌ ${name}${detail ? "　" + detail : ""}`); }
};

const statsAll = (v) => Object.fromEntries(
  ["reflex", "accuracy", "apm", "positioning", "mapAware", "tacticalIQ", "decision", "adaptability",
    "courage", "clutch", "focus", "resilience", "comms", "leadership", "synergy", "learning"].map((k) => [k, v]));
const LANES = ["上路", "打野", "中路", "下路", "輔助"];
const PLAYERS = LANES.map((lane, i) => ({
  id: `s${i + 1}`, name: `P-s${i + 1}`, role: lane, lv: 8, xp: 900, energy: 90,
  morale: 80, personality: "steady", condition: "精神飽滿", stats: statsAll(72), rosterTier: "active",
}));
const seatsFor = (mode) => Object.fromEntries((mode === "cs" ? CS_SEATS : ENGINE_SEATS).map((s, i) => [s, PLAYERS[i].id]));
const CTX = { teamId: "GSEAL", teamName: "白貓戰隊", day: 8, week: 2, season: 1 };
const T0 = 3_000_000;

/** 走完 O3→O5 拿到「雙方已確認的房間 ＋ 票券」。 */
function confirmedSetup(mode = "moba") {
  const entry = createMatchEntryRequest({ mode, seats: seatsFor(mode), players: PLAYERS, context: CTX }).request;
  const t0 = createTicket(entry, { now: T0 }).ticket;
  const q = transitionTicket(t0, TICKET_STATES.queued, { now: T0 }).ticket;
  const a = createAssignment({ ticket: q, opponent: MOCK_OPPONENTS[2], seed: 8888, now: T0 });
  const ticket = transitionTicket(q, TICKET_STATES.matched, { now: T0, assignment: a }).ticket;
  const room0 = createRoom({ assignment: a, ticket, now: T0 }).room;
  const ready = transitionRoom(room0, ROOM_STATES.ready_check, { now: T0 }).room;
  const room = confirmSide(confirmSide(ready, "us", { now: T0 + 1 }).room, "opponent", { now: T0 + 2 }).room;
  return { ticket, room };
}
const sessionOf = (mode = "moba") => {
  const { ticket, room } = confirmedSetup(mode);
  return { ticket, room, session: openSession({ room, ticket, now: T0 }).session };
};

console.log("══ Milestone O6：比賽場次與進場 ══\n");

// ── 1) 簽發與綁定 ───────────────────────────────────────────────────────
{
  const { ticket, room, session } = sessionOf();
  ck("1) 雙方確認後可簽發場次", !!session && session.schema === SESSION_VERSION, session.sessionId);
  ck("1b) 綁定 roomId / assignmentId / ticketId / 模式",
    session.roomId === room.roomId && session.assignmentId === room.assignmentId &&
    session.ticketId === ticket.ticketId && session.mode === "moba");
  ck("1c) 帶雙方隊伍版本",
    session.rosterVersions.us === ticket.rosterVersion && typeof session.rosterVersions.opponent === "string",
    `我方 ${session.rosterVersions.us} / 對手 ${session.rosterVersions.opponent}`);
  ck("1d) seed 沿用配對時 gateway 決定的那一個（前端不得挑）",
    session.seed === ticket.assignment.seed, `seed ${session.seed}`);
  ck("1e) 標明簽發者且帶一次性令牌",
    session.issuedBy === "mock-gateway" && /^lt_[0-9a-f]{8}$/.test(session.launchToken) && session.tokenUsed === false);
  ck("1f) 初始狀態為待啟動", session.state === SESSION_STATES.created && SESSION_TERMINAL.length === 3);

  //  房間未雙方確認不得簽發
  const { ticket: t2, room: r2 } = confirmedSetup();
  const notReady = transitionRoom(createRoom({ assignment: t2.assignment, ticket: t2, now: T0 }).room, ROOM_STATES.ready_check, { now: T0 }).room;
  ck("1g) 房間尚未雙方確認 → 不得簽發場次",
    openSession({ room: notReady, ticket: t2, now: T0 }).ok === false,
    openSession({ room: notReady, ticket: t2, now: T0 }).errors[0].message);
  ck("1h) 房間與票券不符 → 不得簽發",
    createSession({ room: r2, ticket: { ...t2, ticketId: "ticket:moba:ffffffff" }, now: T0 }).ok === false);
}

// ── 2) 一次性令牌：只能用一次 ───────────────────────────────────────────
{
  const { ticket, room, session } = sessionOf();
  const first = consumeLaunchToken(session, session.launchToken, { room, ticket, now: T0 });
  ck("2) 首次使用令牌 → 成功並取得啟動參數", first.ok && !!first.launch, first.launch.sessionId);
  ck("2b) 使用後場次轉為已啟動且令牌標記為已用",
    first.session.state === SESSION_STATES.launched && first.session.tokenUsed === true);
  const second = consumeLaunchToken(first.session, session.launchToken, { room, ticket, now: T0 + 1000 });
  ck("2c) **重複進場 → 拒絕並附中文原因**",
    !second.ok && second.errors.some((e) => e.code === "already_launched"),
    second.errors.find((e) => e.code === "already_launched")?.message);
  ck("2d) 令牌不符 → 拒絕",
    !consumeLaunchToken(session, "lt_deadbeef", { room, ticket, now: T0 }).ok,
    consumeLaunchToken(session, "lt_deadbeef", { room, ticket, now: T0 }).errors[0].message);
  ck("2e) 沒有令牌 → 拒絕", !consumeLaunchToken(session, null, { room, ticket, now: T0 }).ok);
}

// ── 3) 過期／取消／資料不一致 ──────────────────────────────────────────
{
  const { ticket, room, session } = sessionOf();
  const after = T0 + (SESSION_TTL_SECONDS + 1) * 1000;
  ck("3) 逾期判定正確", isSessionExpired(session, after) && !isSessionExpired(session, T0 + 1000));
  ck("3b) **逾期後不得進場**",
    !consumeLaunchToken(session, session.launchToken, { room, ticket, now: after }).ok,
    consumeLaunchToken(session, session.launchToken, { room, ticket, now: after }).errors[0].message);
  const cancelled = cancelSession(session, "已取消本場比賽", T0).session;
  ck("3c) **取消後不得進場**",
    !consumeLaunchToken(cancelled, cancelled.launchToken, { room, ticket, now: T0 }).ok,
    consumeLaunchToken(cancelled, cancelled.launchToken, { room, ticket, now: T0 }).errors[0].message);
  ck("3d) 已取消的場次不可再取消", !cancelSession(cancelled, "x", T0).ok);

  //  資料不一致
  const otherRoom = { ...room, roomId: "room:moba:ffffffff" };
  ck("3e) 場次與房間不符 → 拒絕",
    !consumeLaunchToken(session, session.launchToken, { room: otherRoom, ticket, now: T0 }).ok,
    validateSession(session, { room: otherRoom, ticket, now: T0 }).errors[0].message);
  ck("3f) **舊票券不可啟動比賽**",
    !consumeLaunchToken(session, session.launchToken, { room, ticket: { ...ticket, ticketId: "ticket:moba:00000000" }, now: T0 }).ok,
    validateSession(session, { room, ticket: { ...ticket, ticketId: "ticket:moba:00000000" }, now: T0 }).errors[0].message);
  ck("3g) 指派單被抽換 → 拒絕",
    !consumeLaunchToken(session, session.launchToken, { room, ticket: { ...ticket, assignment: { ...ticket.assignment, assignmentId: "assign:ffffffff" } }, now: T0 }).ok);
  ck("3h) seed 被竄改 → 拒絕",
    !consumeLaunchToken(session, session.launchToken, { room, ticket: { ...ticket, assignment: { ...ticket.assignment, seed: 1 } }, now: T0 }).ok,
    validateSession(session, { room, ticket: { ...ticket, assignment: { ...ticket.assignment, seed: 1 } }, now: T0 }).errors[0].message);
  ck("3i) 房間狀態不是雙方已確認 → 拒絕",
    !consumeLaunchToken(session, session.launchToken, { room: { ...room, state: ROOM_STATES.cancelled }, ticket, now: T0 }).ok);
  ck("3j) 自造場次（無簽發者）→ 拒絕",
    !consumeLaunchToken({ ...session, issuedBy: null }, session.launchToken, { room, ticket, now: T0 }).ok,
    validateSession({ ...session, issuedBy: null }, { room, ticket, now: T0 }).errors[0].message);
}

// ── 4) 啟動參數：由場次提供，不含數值與結果 ────────────────────────────
{
  const { ticket, room, session } = sessionOf();
  const launch = consumeLaunchToken(session, session.launchToken, { room, ticket, now: T0 }).launch;
  ck("4) 啟動參數只有模式／種子／對手識別／場次識別",
    Object.keys(launch).sort().join() === "issuedBy,mode,opponentId,opponentName,seed,sessionId",
    Object.keys(launch).join(","));
  const json = JSON.stringify(launch);
  ck("4b) 啟動參數不含陣容、能力或比賽結果",
    !/stats|power|roster|squad|winner|result|score|rewards/.test(json));
  ck("4c) seed 來自 gateway 的配對結果，前端無從指定",
    launch.seed === ticket.assignment.seed);
  ck("4d) launchConfigOf 是純函式（同一場次結果相同）",
    JSON.stringify(launchConfigOf(session)) === JSON.stringify(launchConfigOf(session)));
}

// ── 5) 不重複建立比賽 ──────────────────────────────────────────────────
{
  const { ticket, room } = confirmedSetup();
  const a = openSession({ room, ticket, now: T0 }).session;
  const b = openSession({ room, ticket, now: T0 + 30_000 }).session;
  ck("5) 同一房間重複簽發 → 同一個 sessionId（不會重複建立比賽）",
    a.sessionId === b.sessionId, a.sessionId);
  ck("5b) 同一房間重複簽發 → 同一個令牌", a.launchToken === b.launchToken);
  //  不同房間 ⇒ 不同場次
  const other = sessionOf("cs").session;
  ck("5c) 不同房間 → 不同場次", other.sessionId !== a.sessionId);
}

// ── 6) 重整恢復 ＋ 兩種模式共用 ────────────────────────────────────────
{
  const { ticket, room, session } = sessionOf();
  //  模擬存檔往返（重整）
  const round = JSON.parse(JSON.stringify({ ticket, room, session }));
  ck("6) 尚未啟動的場次可在重整後恢復",
    round.session.state === SESSION_STATES.created && round.session.tokenUsed === false);
  const afterReload = consumeLaunchToken(round.session, round.session.launchToken, { room: round.room, ticket: round.ticket, now: T0 + 5000 });
  ck("6b) 重整後仍可用原令牌啟動（未啟動過）", afterReload.ok);
  //  已啟動的場次重整後仍然不可再啟動
  const usedRound = JSON.parse(JSON.stringify(afterReload.session));
  ck("6c) **已啟動的場次重整後仍不可再啟動**",
    !consumeLaunchToken(usedRound, usedRound.launchToken, { room: round.room, ticket: round.ticket, now: T0 + 6000 }).ok);
  ck("6d) isSessionTerminal 判定正確",
    isSessionTerminal(usedRound) && !isSessionTerminal(round.session));

  //  CS 共用同一套
  const cs = sessionOf("cs");
  ck("6e) CS 走同一套契約",
    cs.session.schema === SESSION_VERSION && cs.session.mode === "cs");
  ck("6f) CS 也是一次性令牌",
    (() => {
      const one = consumeLaunchToken(cs.session, cs.session.launchToken, { room: cs.room, ticket: cs.ticket, now: T0 });
      return one.ok && !consumeLaunchToken(one.session, cs.session.launchToken, { room: cs.room, ticket: cs.ticket, now: T0 + 1 }).ok;
    })());
}

console.log("\n── 場次摘要 ──────────────────────────────────────────────────");
{
  const { session } = sessionOf();
  console.log(`   ${session.sessionId}｜房間 ${session.roomId}｜票券 ${session.ticketId}`);
  console.log(`   seed ${session.seed}｜對手 ${session.opponent.name}｜簽發 ${session.issuedBy}`);
  console.log(`   狀態：${Object.values(SESSION_STATES).map(sessionStateLabel).join(" → ")}｜有效期 ${SESSION_TTL_SECONDS}s`);
}

console.log(`\n${pass}/${pass + fail} 通過`);
process.exit(fail === 0 ? 0 : 1);
