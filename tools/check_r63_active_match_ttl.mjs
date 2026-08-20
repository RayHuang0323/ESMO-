#!/usr/bin/env node
// R63 TTL regression guard：SESSION_TTL 只限制尚未啟動的 session。
// 有效 ActiveMatch 的 resume 必須保留同一場 identity；terminal／invalid session 仍拒絕。
import {
  SESSION_TTL_SECONDS, createSession, consumeLaunchToken,
  createActiveMatch, patchActiveMatch, resumeSession, completeSession,
  abandonSession, cancelSession,
} from "../src/platform/contracts/matchSession.js";
import { ROOM_STATES, createRoom, transitionRoom, confirmSide } from "../src/platform/contracts/matchRoom.js";
import { TICKET_STATES, createTicket, transitionTicket, createAssignment } from "../src/platform/contracts/matchmaking.js";
import { createMatchEntryRequest } from "../src/platform/contracts/matchEntry.js";
import { ENGINE_SEATS } from "../src/platform/contracts/matchLineup.js";
import { MOCK_OPPONENTS } from "../src/platform/matchmaking/mockGateway.js";
import { primaryActionFor } from "../src/screens/common/matchPrepAction.js";

let pass = 0;
let fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`✅ ${name}${detail ? `　${detail}` : ""}`); }
  else { fail++; console.log(`❌ ${name}${detail ? `　${detail}` : ""}`); }
};

const players = ENGINE_SEATS.map((seat, i) => ({ id: `p${i + 1}`, role: seat }));
const entry = createMatchEntryRequest({
  mode: "moba",
  seats: Object.fromEntries(ENGINE_SEATS.map((seat, i) => [seat, players[i].id])),
  players,
  context: { teamId: "R63-TTL", teamName: "ESMO", day: 1, week: 1, season: 1 },
}).request;
const ticket0 = createTicket(entry, { now: 1_000 }).ticket;
const queued = transitionTicket(ticket0, TICKET_STATES.queued, { now: 1_000 }).ticket;
const assignment = createAssignment({ ticket: queued, opponent: MOCK_OPPONENTS[0], seed: 13579, now: 1_000 });
const ticket = transitionTicket(queued, TICKET_STATES.matched, { now: 1_000, assignment }).ticket;
const room0 = createRoom({ assignment, ticket, now: 1_000 }).room;
const ready = transitionRoom(room0, ROOM_STATES.ready_check, { now: 1_000 }).room;
const room = confirmSide(confirmSide(ready, "us", { now: 1_001 }).room, "opponent", { now: 1_002 }).room;
const created = createSession({ room, ticket, now: 1_000 }).session;
const afterTtl = created.expiresAt + 1;

const createdResume = resumeSession(created, { room, ticket, now: afterTtl });
ck("created 超過 5 分鐘仍 expired", !createdResume.ok && createdResume.errors.some((e) => e.code === "expired"));

const launched = consumeLaunchToken(created, created.launchToken, { room, ticket, now: 1_010 }).session;
const lineup = Object.fromEntries(ENGINE_SEATS.map((seat, i) => [seat, players[i].id]));
const active = patchActiveMatch({
  ...launched,
  activeMatch: createActiveMatch(launched, { lineup, now: 1_010 }),
}, { phase: "battle" }, 1_010);
const paused = patchActiveMatch(active, {
  status: "paused",
  simulation: { status: "paused", timeSec: 42, snapshot: { frame: 42 } },
}, 2_000);
const resumed = resumeSession(paused, { room, ticket, now: afterTtl });
const sameIdentity = resumed.ok
  && resumed.session.sessionId === active.sessionId
  && resumed.session.activeMatch.matchId === active.activeMatch.matchId
  && resumed.session.activeMatch.seed === active.activeMatch.seed
  && JSON.stringify(resumed.session.activeMatch.lineup) === JSON.stringify(active.activeMatch.lineup)
  && resumed.launch.sessionId === active.sessionId
  && resumed.launch.seed === active.seed;
ck("launched + valid ActiveMatch 超過 5 分鐘仍可 resume", resumed.ok);
ck("resume 保留 matchId / sessionId / seed / lineup", sameIdentity);

for (const [label, terminal] of [
  ["completed", completeSession(active, { matchId: active.activeMatch.matchId, now: 3_000 }).session],
  ["abandoned", abandonSession(active, "TTL regression", 3_000).session],
  ["cancelled", cancelSession(created, "TTL regression", 3_000).session],
]) {
  const result = resumeSession(terminal, { room, ticket, now: afterTtl });
  ck(`${label} session 不可 resume`, !result.ok && result.errors.some((e) => e.code === label));
}

const invalidActive = { ...active, activeMatch: { ...active.activeMatch, status: "invalid" } };
const invalidResume = resumeSession(invalidActive, { room, ticket, now: afterTtl });
ck("invalid ActiveMatch 不可 resume", !invalidResume.ok && invalidResume.errors.some((e) => e.code === "expired"));

const validView = { state: "launched", restoreable: true, session: active, mode: "moba" };
const legacyView = { state: "launched", restoreable: false, session: { ...active, activeMatch: null }, mode: "moba" };
ck("valid ActiveMatch UI action 是 resume", primaryActionFor({ entryOk: true, view: {}, room: {}, session: validView, mode: "moba" }).key === "resume");
ck("legacy／invalid launched UI action 不再誤顯示 resume", primaryActionFor({ entryOk: true, view: {}, room: {}, session: legacyView, mode: "moba" }).key === "requeue");

console.log(`\nR63 ActiveMatch TTL regression: ${pass}/${pass + fail} ${fail ? "FAIL" : "PASS"}`);
process.exit(fail ? 1 : 0);
