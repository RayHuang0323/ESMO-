#!/usr/bin/env node
// R63 focused verifier：ActiveMatch snapshot、恢復、快速完成與共用速度控制。
// 不重跑大型 browser/runtime sweep；結果只接受真實 contract / simulator source evidence。
import fs from "fs";
import { LogicEngine } from "../src/LogicEngine.js";
import { ROOM_STATES, createRoom, transitionRoom, confirmSide } from "../src/platform/contracts/matchRoom.js";
import { TICKET_STATES, createTicket, transitionTicket, createAssignment } from "../src/platform/contracts/matchmaking.js";
import { createMatchEntryRequest } from "../src/platform/contracts/matchEntry.js";
import { ENGINE_SEATS } from "../src/platform/contracts/matchLineup.js";
import { MOCK_OPPONENTS } from "../src/platform/matchmaking/mockGateway.js";
import {
  createSession, consumeLaunchToken, createActiveMatch, patchActiveMatch, isActiveMatch,
  resumeSession, abandonSession, ACTIVE_MATCH_SCHEMA,
} from "../src/platform/contracts/matchSession.js";

const src = (p) => fs.readFileSync(p, "utf8");
let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`✅ ${name}${detail ? `　${detail}` : ""}`); }
  else { fail++; console.log(`❌ ${name}${detail ? `　${detail}` : ""}`); }
};

const players = ENGINE_SEATS.map((seat, i) => ({ id: `p${i + 1}`, name: `P${i + 1}`, role: seat, lv: 5, xp: 200, energy: 95, stats: Object.fromEntries(["reflex", "accuracy", "apm", "positioning", "mapAware", "tacticalIQ", "decision", "adaptability", "courage", "clutch", "focus", "resilience", "comms", "leadership", "synergy", "learning"].map((k) => [k, 70])) }));
const setup = () => {
  const entry = createMatchEntryRequest({ mode: "moba", seats: Object.fromEntries(ENGINE_SEATS.map((s, i) => [s, players[i].id])), players, context: { teamId: "R63", teamName: "ESMO", day: 1, week: 1, season: 1 } }).request;
  const t0 = createTicket(entry, { now: 1_000 }).ticket;
  const q = transitionTicket(t0, TICKET_STATES.queued, { now: 1_000 }).ticket;
  const assignment = createAssignment({ ticket: q, opponent: MOCK_OPPONENTS[0], seed: 13579, now: 1_000 });
  const ticket = transitionTicket(q, TICKET_STATES.matched, { now: 1_000, assignment }).ticket;
  const room0 = createRoom({ assignment, ticket, now: 1_000 }).room;
  const ready = transitionRoom(room0, ROOM_STATES.ready_check, { now: 1_000 }).room;
  const room = confirmSide(confirmSide(ready, "us", { now: 1_001 }).room, "opponent", { now: 1_002 }).room;
  const created = createSession({ room, ticket, now: 1_000 }).session;
  const launched = consumeLaunchToken(created, created.launchToken, { room, ticket, now: 1_010 }).session;
  const active = patchActiveMatch({ ...launched, activeMatch: createActiveMatch(launched, { lineup: { ...Object.fromEntries(ENGINE_SEATS.map((s, i) => [s, players[i].id])) }, now: 1_010 }) }, { phase: "battle" }, 1_010);
  return { ticket, room, session: active };
};

console.log("══ R63 Active Match / Resume / Speed focused verifier ══\n");
{
  const { ticket, room, session } = setup();
  ck("1) 啟動後建立 ActiveMatch.v1", session.activeMatch?.schema === ACTIVE_MATCH_SCHEMA && isActiveMatch(session));
  ck("2) matchId / mode / opponent / lineup / seed / startedAt 齊全",
    /^active:session:moba:/.test(session.activeMatch.matchId)
    && session.activeMatch.mode === "moba"
    && session.activeMatch.opponent?.id
    && Object.keys(session.activeMatch.lineup).length === 5
    && session.activeMatch.seed === 13579
    && session.activeMatch.startedAt === 1010);
  const snapshot = { ts: 42, over: false, bK: 3, rK: 2, winner: null, players: [] };
  const paused = patchActiveMatch(session, { status: "paused", simulation: { status: "paused", timeSec: 42, snapshot } }, 2_000);
  ck("3) 離場保存 simulation progress / snapshot", paused.activeMatch.status === "paused" && paused.activeMatch.simulation.timeSec === 42 && paused.activeMatch.simulation.snapshot === snapshot);
  const resumed = resumeSession(paused, { room, ticket, now: 9_999_999 });
  ck("4) paused active 不被舊 TTL 誤判 expired，且可 resume", resumed.ok && resumed.session.sessionId === session.sessionId && resumed.launch.seed === 13579);
  const abandoned = abandonSession(paused, "R63 verifier", 2_100);
  ck("5) abandon 進 terminal 並清除可恢復資格", abandoned.ok && abandoned.session.state === "abandoned" && abandoned.session.activeMatch.status === "abandoned" && !isActiveMatch(abandoned.session));
}
{
  const run = (seed) => { const e = new LogicEngine(seed); while (!e.over && e.t < 120) e.tick(0.5); return e.snapshot(); };
  const a = run(97531), b = run(97531);
  ck("6) 同 seed / 同條件 normal simulation 結果 deterministic", JSON.stringify(a) === JSON.stringify(b));
  const resumed = new LogicEngine(97531); while (!resumed.over && resumed.t < 42) resumed.tick(0.5); while (!resumed.over && resumed.t < 120) resumed.tick(0.5);
  ck("7) 從保存時間 deterministic replay 到終點，不建立第二 simulator", JSON.stringify(a) === JSON.stringify(resumed.snapshot()));
}
{
  const gv = src("src/GameView.jsx");
  const uls = src("src/useLocalServer.js");
  const cs = src("src/screens/fps/CsMatchScreen.jsx");
  const fps = src("src/battle/fps/EsportsFPS3D.jsx");
  const speed = src("src/battle/ui/MatchSpeedControls.jsx");
  const store = src("src/platform/profileStore.js");
  ck("8) MOBA fast finish 走同一顆 engine / 正式 tick", /fastForward/.test(uls) && /eng\.tick\(DT_SIM\)/.test(uls) && !/fastForward[\s\S]{0,800}new LogicEngine/.test(uls));
  ck("9) CS fast finish 從目前 frame 到最後 frame", /quickFinish/.test(fps) && /setFIdx\(total-1\)/.test(fps) && /simulateFps/.test(fps));
  ck("10) CS result id 不再使用 Date/random，normal / fast / restore 可比對同一結果", /stableResultId/.test(fps) && /id:matchId \?\? stableResultId/.test(fps) && !/id:\"cs_\"\+Date\.now/.test(fps));
  ck("11) MOBA / CS 共用 1×/2×/4× 與快速完成 presentation", /MatchSpeedControls/.test(gv) && /MatchSpeedControls/.test(fps) && /quick-finish-match/.test(speed) && /\[1, 2, 4\]/.test(uls));
  ck("12) Store 只有既有 matchmaking session 內保存 snapshot，無第二結果交易", /saveActiveMatchSnapshot/.test(store) && /pauseActiveMatch/.test(store) && /settleMatchThroughSession/.test(src("src/platform/progress/settleMatchBoundary.js")));
  ck("13) leave / refresh cleanup 會 pause，完成後 terminal 不會被覆寫", /persistActiveSnapshot\(\{ status: \"paused\", force: true \}\)/.test(uls) && /completeSession/.test(src("src/platform/progress/settleMatchResult.js")) && /state === \"launched\"/.test(store));
}

console.log(`\nR63 Active Match focused: ${pass}/${pass + fail} 通過`);
console.log("⚠ Node 無法證明真機觸控／視覺；需人工驗收 320/360/390/430 與瀏覽器 refresh。");
process.exit(fail ? 1 : 0);
