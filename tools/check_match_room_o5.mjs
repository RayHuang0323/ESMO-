#!/usr/bin/env node
// ============================================================================
//  tools/check_match_room_o5.mjs — Milestone O5：比賽房間與雙方確認
//
//  執行：repo 根目錄 `node tools/check_match_room_o5.mjs`；**失敗時 exit 1**。
//
//  驗的是這個閉環的六件事：
//    ① 由 MatchAssignment 開房，五種狀態齊全，非法轉移一律拒絕
//    ② 雙方都確認才可進場；只有一方確認不行
//    ③ 確認倒數：逾時／取消之後不得進場，並附中文原因
//    ④ 防止重複確認、重複建立房間
//    ⑤ **舊票券不得進入新房間**；對戰入口只認 gateway 簽發的房間與指派單
//    ⑥ MOBA 與 CS 共用同一套契約與流程；mock gateway 決定性
// ============================================================================
import {
  ROOM_VERSION, ROOM_STATES, ROOM_TERMINAL, READY_SECONDS, SIDES,
  createRoom, transitionRoom, confirmSide, canEnterRoom, canRoomTransition,
  roomStateLabel, remainingSeconds, isExpired, isRoomTerminal,
} from "../src/platform/contracts/matchRoom.js";
import {
  TICKET_STATES, createTicket, transitionTicket, createAssignment,
} from "../src/platform/contracts/matchmaking.js";
import { openRoom, pollRoom, opponentReadyDelay, MOCK_OPPONENTS } from "../src/platform/matchmaking/mockGateway.js";
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
const T0 = 2_000_000;

function matchedTicket(mode = "moba") {
  const entry = createMatchEntryRequest({ mode, seats: seatsFor(mode), players: PLAYERS, context: CTX }).request;
  const t = createTicket(entry, { now: T0 }).ticket;
  const q = transitionTicket(t, TICKET_STATES.queued, { now: T0 }).ticket;
  const a = createAssignment({ ticket: q, opponent: MOCK_OPPONENTS[0], seed: 4242, now: T0 });
  return transitionTicket(q, TICKET_STATES.matched, { now: T0, assignment: a }).ticket;
}
const roomOf = (mode = "moba") => {
  const ticket = matchedTicket(mode);
  return { ticket, room: openRoom({ ticket, now: T0 }).room };
};
const toReady = (room, now = T0) => transitionRoom(room, ROOM_STATES.ready_check, { now }).room;

console.log("══ Milestone O5：比賽房間與雙方確認 ══\n");

// ── 1) 開房與狀態機 ─────────────────────────────────────────────────────
{
  ck("1) 五種房間狀態齊全",
    Object.keys(ROOM_STATES).sort().join() === "cancelled,confirmed,expired,ready_check,waiting",
    Object.values(ROOM_STATES).map(roomStateLabel).join("／"));
  const { ticket, room } = roomOf();
  ck("1b) 由 MatchAssignment 開房，初始為等待就緒",
    room.schema === ROOM_VERSION && room.state === ROOM_STATES.waiting, room.roomId);
  ck("1c) 房間由 gateway 簽發並與票券／指派單綁定",
    room.issuedBy === "mock-gateway" && room.ticketId === ticket.ticketId &&
    room.assignmentId === ticket.assignment.assignmentId);
  ck("1d) roomId 由 assignmentId 決定性推導（重複開房同一間）",
    openRoom({ ticket, now: T0 + 5000 }).room.roomId === room.roomId);
  ck("1e) 票券未配對成功不得開房",
    openRoom({ ticket: { ...ticket, state: TICKET_STATES.queued }, now: T0 }).ok === false);
  ck("1f) 指派單不合法不得開房",
    createRoom({ assignment: { ...ticket.assignment, winner: "us" }, ticket, now: T0 }).ok === false);
  //  轉移規則
  ck("1g) 合法轉移：等待就緒 → 確認中 → 雙方已確認",
    canRoomTransition("waiting", "ready_check") && canRoomTransition("ready_check", "confirmed"));
  ck("1h) 終局狀態不可再變更",
    ROOM_TERMINAL.every((s) => !canRoomTransition(s, "ready_check")));
  const bad = transitionRoom(room, ROOM_STATES.confirmed, { now: T0 });
  ck("1i) 跳過確認直接進「雙方已確認」→ 拒絕且有中文理由",
    !bad.ok && bad.errors[0].message.includes("房間無法從"), bad.errors[0].message);
  ck("1j) 取消／逾時必須附原因",
    !transitionRoom(room, ROOM_STATES.cancelled, { now: T0 }).ok &&
    !transitionRoom(room, ROOM_STATES.expired, { now: T0 }).ok);
}

// ── 2) 雙方確認才可進場 ─────────────────────────────────────────────────
{
  const { ticket, room } = roomOf();
  const ready = toReady(room);
  ck("2) 進入確認階段時開始倒數",
    ready.state === ROOM_STATES.ready_check && ready.deadline === T0 + READY_SECONDS * 1000,
    `${READY_SECONDS}s`);
  const us = confirmSide(ready, "us", { now: T0 + 1000 });
  ck("2b) 我方確認後仍不可進場（對手未確認）",
    us.ok && us.room.confirmations.us && !canEnterRoom(us.room, ticket).ok,
    canEnterRoom(us.room, ticket).message);
  const both = confirmSide(us.room, "opponent", { now: T0 + 2000 });
  ck("2c) 雙方都確認 → 自動進入「雙方已確認」",
    both.ok && both.room.state === ROOM_STATES.confirmed);
  ck("2d) 雙方已確認 → 可進場", canEnterRoom(both.room, ticket).ok);
  //  只有對手確認也不行
  const oppOnly = confirmSide(ready, "opponent", { now: T0 + 1000 }).room;
  ck("2e) 只有對手確認 → 不可進場", !canEnterRoom(oppOnly, ticket).ok);
  //  手動硬轉也擋
  ck("2f) 未雙方確認時硬轉「雙方已確認」→ 拒絕",
    !transitionRoom(oppOnly, ROOM_STATES.confirmed, { now: T0 }).ok);
  ck("2g) 確認方只認 us / opponent", SIDES.join() === "us,opponent" &&
    !confirmSide(ready, "hacker", { now: T0 }).ok);
}

// ── 3) 倒數／逾時／取消 ────────────────────────────────────────────────
{
  const { ticket, room } = roomOf();
  const ready = toReady(room);
  ck("3) 剩餘秒數可計算",
    remainingSeconds(ready, T0 + 5000) === READY_SECONDS - 5, `${remainingSeconds(ready, T0 + 5000)}s`);
  const after = T0 + (READY_SECONDS + 1) * 1000;
  ck("3b) 超過期限判定為逾時", isExpired(ready, after));
  ck("3c) 逾時後不可再確認",
    !confirmSide(ready, "us", { now: after }).ok,
    confirmSide(ready, "us", { now: after }).errors[0].message);
  const expired = transitionRoom(ready, ROOM_STATES.expired, { now: after, reason: "確認逾時，本次配對已取消" }).room;
  ck("3d) **逾時後不得進場**，且顯示中文原因",
    !canEnterRoom(expired, ticket).ok && /逾時/.test(canEnterRoom(expired, ticket).message),
    canEnterRoom(expired, ticket).message);
  const cancelled = transitionRoom(ready, ROOM_STATES.cancelled, { now: T0 + 3000, reason: "已取消本次對戰" }).room;
  ck("3e) **取消後不得進場**", !canEnterRoom(cancelled, ticket).ok, canEnterRoom(cancelled, ticket).message);
  ck("3f) 逾時／取消後不可再轉回確認中",
    !transitionRoom(expired, ROOM_STATES.ready_check, { now: after }).ok &&
    !transitionRoom(cancelled, ROOM_STATES.ready_check, { now: after }).ok);
}

// ── 4) 防止重複確認與重複開房 ──────────────────────────────────────────
{
  const { room } = roomOf();
  const ready = toReady(room);
  const once = confirmSide(ready, "us", { now: T0 + 1000 }).room;
  const twice = confirmSide(once, "us", { now: T0 + 2000 });
  ck("4) 重複確認 → 拒絕且有中文理由",
    !twice.ok && twice.errors[0].code === "already_confirmed", twice.errors[0].message);
  ck("4b) 對手也不能重複確認",
    !confirmSide(confirmSide(ready, "opponent", { now: T0 }).room, "opponent", { now: T0 + 1 }).ok);
  ck("4c) 非確認階段不能確認",
    !confirmSide(room, "us", { now: T0 }).ok, confirmSide(room, "us", { now: T0 }).errors[0].message);
  //  重複開房：同一張指派單 ⇒ 同一個 roomId
  const { ticket } = roomOf();
  const r1 = openRoom({ ticket, now: T0 }).room;
  const r2 = openRoom({ ticket, now: T0 + 9999 }).room;
  ck("4d) 同一張指派單重複開房 → 同一個 roomId（不會產生第二間）",
    r1.roomId === r2.roomId, r1.roomId);
}

// ── 5) 舊票券不得進入新房間 ────────────────────────────────────────────
{
  const A = roomOf("moba");
  const B = roomOf("cs");
  const readyA = toReady(A.room);
  const confirmedA = confirmSide(confirmSide(readyA, "us", { now: T0 + 1 }).room, "opponent", { now: T0 + 2 }).room;
  ck("5) 房間配自己的票券 → 可進場", canEnterRoom(confirmedA, A.ticket).ok);
  ck("5b) **拿別張票券想進這個房間 → 拒絕**",
    !canEnterRoom(confirmedA, B.ticket).ok, canEnterRoom(confirmedA, B.ticket).message);
  //  票券被換掉（重新排隊）⇒ ticketId 不同
  const reissued = { ...A.ticket, ticketId: "ticket:moba:00000000" };
  ck("5c) 票券換新後舊房間不可用",
    !canEnterRoom(confirmedA, reissued).ok);
  //  票券上的指派單被抽換
  const swappedAssign = { ...A.ticket, assignment: { ...A.ticket.assignment, assignmentId: "assign:deadbeef" } };
  ck("5d) 指派單被抽換 → 房間與配對結果不符，拒絕",
    !canEnterRoom(confirmedA, swappedAssign).ok, canEnterRoom(confirmedA, swappedAssign).message);
  ck("5e) 票券沒有指派單 → 拒絕",
    !canEnterRoom(confirmedA, { ...A.ticket, assignment: null }).ok);
  //  房間沒有簽發者（客戶端自造）⇒ 拒絕
  ck("5f) **自造房間（無簽發者）→ 拒絕進場**",
    !canEnterRoom({ ...confirmedA, issuedBy: null }, A.ticket).ok,
    canEnterRoom({ ...confirmedA, issuedBy: null }, A.ticket).message);
  ck("5g) 沒有房間 → 不可進場", !canEnterRoom(null, A.ticket).ok);
}

// ── 6) mock gateway：決定性流程 ────────────────────────────────────────
{
  const { room } = roomOf();
  ck("6) 開房後輪詢 → 進入確認階段",
    pollRoom({ room, now: T0 }).decision === "start_ready");
  const ready = toReady(room);
  const delay = opponentReadyDelay(ready);
  ck("6b) 對手確認延遲決定性且小於倒數",
    delay === opponentReadyDelay(ready) && delay < READY_SECONDS, `${delay}s`);
  ck("6c) 對手時間未到 → waiting 並回報剩餘秒數",
    pollRoom({ room: ready, now: T0 + (delay - 1) * 1000 }).decision === "waiting");
  ck("6d) 對手時間到 → opponent_ready",
    pollRoom({ room: ready, now: T0 + delay * 1000 }).decision === "opponent_ready");
  ck("6e) 倒數結束仍未雙方確認 → expired 並附原因",
    (() => {
      const r = pollRoom({ room: ready, now: T0 + (READY_SECONDS + 1) * 1000 });
      return r.decision === "expired" && /逾時/.test(r.reason);
    })());
  ck("6f) 終局房間輪詢不會有動作",
    pollRoom({ room: transitionRoom(ready, ROOM_STATES.cancelled, { now: T0, reason: "x" }).room, now: T0 + 99999 }).decision === "none");
  ck("6g) 同一房間重複輪詢 → 結果逐欄相同",
    JSON.stringify(pollRoom({ room: ready, now: T0 + delay * 1000 })) ===
    JSON.stringify(pollRoom({ room: ready, now: T0 + delay * 1000 })));
  ck("6h) isRoomTerminal 判定正確",
    isRoomTerminal({ state: "confirmed" }) && isRoomTerminal({ state: "expired" }) && !isRoomTerminal(ready));
}

// ── 7) MOBA 與 CS 共用同一套流程 ───────────────────────────────────────
{
  const cs = roomOf("cs");
  ck("7) CS 走同一套契約", cs.room.schema === ROOM_VERSION && cs.room.mode === "cs");
  const ready = toReady(cs.room);
  const done = confirmSide(confirmSide(ready, "us", { now: T0 + 1 }).room, "opponent", { now: T0 + 2 }).room;
  ck("7b) CS 也需雙方確認才可進場",
    done.state === ROOM_STATES.confirmed && canEnterRoom(done, cs.ticket).ok);
  ck("7c) MOBA 與 CS 的房間彼此獨立",
    roomOf("moba").room.roomId !== cs.room.roomId);
}

console.log("\n── 流程摘要 ──────────────────────────────────────────────────");
{
  const { room } = roomOf();
  console.log(`   ${room.roomId}｜對手 ${room.opponent.name}｜種子 ${room.seed}｜簽發 ${room.issuedBy}`);
  console.log(`   狀態：${Object.values(ROOM_STATES).map(roomStateLabel).join(" → ")}`);
  console.log(`   確認倒數 ${READY_SECONDS}s｜mock 對手 ${opponentReadyDelay(toReady(room))}s 後確認`);
}

console.log(`\n${pass}/${pass + fail} 通過`);
process.exit(fail === 0 ? 0 : 1);
