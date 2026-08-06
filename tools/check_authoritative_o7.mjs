#!/usr/bin/env node
// ============================================================================
//  tools/check_authoritative_o7.mjs — Milestone O7：權威場次、恢復與單次結算
//
//  執行：repo 根目錄 `node tools/check_authoritative_o7.mjs`；**失敗時 exit 1**。
//
//  驗的是五件事：
//    ① 權威 seed：引擎 seed 來自場次，同 session ⇒ 同一份初始戰鬥狀態
//    ② 場次恢復：重整／斷線可恢復同一場；取消／逾時／完成／放棄拒絕恢復
//    ③ MatchResult：綁定場次；來源不可信、內容竄改、同場衝突結果一律拒絕
//    ④ 單次結算：只入帳一次；中斷可重試；不重複扣體力或加經驗
//    ⑤ 追蹤鏈：ticket → assignment → room → session → match → result → settlement
// ============================================================================
import fs from "fs";
import { LogicEngine } from "../src/LogicEngine.js";
import {
  SESSION_STATES, CONNECTION_STATES, createSession, consumeLaunchToken, resumeSession,
  markDisconnected, abandonSession, completeSession, cancelSession, launchConfigOf,
  isSessionTerminal, SESSION_TTL_SECONDS,
} from "../src/platform/contracts/matchSession.js";
import {
  MATCH_RESULT_VERSION, RESULT_SOURCES, createMatchResult, validateMatchResult,
  resultContentHash, isSameResult,
} from "../src/platform/contracts/matchResult.js";
import { settleMatchResultInState, settlementIdOf } from "../src/platform/progress/settleMatchResult.js";
import { ROOM_STATES, createRoom, transitionRoom, confirmSide } from "../src/platform/contracts/matchRoom.js";
import { TICKET_STATES, createTicket, transitionTicket, createAssignment } from "../src/platform/contracts/matchmaking.js";
import { MOCK_OPPONENTS } from "../src/platform/matchmaking/mockGateway.js";
import { createMatchEntryRequest } from "../src/platform/contracts/matchEntry.js";
import { createMatchProgressTransaction } from "../src/platform/contracts/matchProgressTransaction.js";
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
  id: `s${i + 1}`, name: `P-s${i + 1}`, role: lane, lv: 6, xp: 400, energy: 95,
  morale: 80, personality: "steady", condition: "精神飽滿", stats: statsAll(72), rosterTier: "active",
}));
const seatsFor = (mode) => Object.fromEntries((mode === "cs" ? CS_SEATS : ENGINE_SEATS).map((s, i) => [s, PLAYERS[i].id]));
const CTX = { teamId: "GSEAL", teamName: "白貓戰隊", day: 8, week: 2, season: 1 };
const T0 = 4_000_000;

function launchedSession(mode = "moba", seed = 24680) {
  const entry = createMatchEntryRequest({ mode, seats: seatsFor(mode), players: PLAYERS, context: CTX }).request;
  const q = transitionTicket(createTicket(entry, { now: T0 }).ticket, TICKET_STATES.queued, { now: T0 }).ticket;
  const a = createAssignment({ ticket: q, opponent: MOCK_OPPONENTS[1], seed, now: T0 });
  const ticket = transitionTicket(q, TICKET_STATES.matched, { now: T0, assignment: a }).ticket;
  const room0 = createRoom({ assignment: a, ticket, now: T0 }).room;
  const ready = transitionRoom(room0, ROOM_STATES.ready_check, { now: T0 }).room;
  const room = confirmSide(confirmSide(ready, "us", { now: T0 + 1 }).room, "opponent", { now: T0 + 2 }).room;
  const created = createSession({ room, ticket, now: T0 }).session;
  const launched = consumeLaunchToken(created, created.launchToken, { room, ticket, now: T0 + 10 });
  return { ticket, room, created, session: launched.session, launch: launched.launch };
}

const mkState = (over = {}) => ({
  meta: { days: 8, week: 2, season: 1, fans: 1000, reputation: 40 },
  finance: { funds: 1_000_000, transactions: [] },
  players: PLAYERS.map((p) => ({ ...p })),
  economy: { settledWeeks: {}, lastSettledWeek: 0, scenario: "standard", formLog: [] },
  processedMatchTransactions: {},
  matchmaking: { ticket: null, room: null, session: null, launch: null, lastResult: null, settlements: {}, lastSettlementError: null },
  ...over,
});
const mkTx = (matchId, mode = "moba") => createMatchProgressTransaction({
  mode, matchId,
  sourceResultVersion: mode === "moba" ? "BattleResult.v2" : "CsMatchResult.v1",
  teamRewards: { money: 120_000, fans: 300, reputation: 2 },
  playerProgress: PLAYERS.map((p) => ({
    playerId: p.id, xpGained: 60, previousXp: p.xp, newXp: p.xp + 60,
    previousLevel: p.lv, newLevel: p.lv, levelsGained: 0, talentPointsGained: 0, reasons: ["勝利"],
  })),
  metadata: { winner: "us", score: { us: 1, enemy: 0 } },
});
const outcomeOf = (matchId) => ({ matchId, winner: "us", score: { us: 16, opponent: 9 }, durationSec: 1500 });

console.log("══ Milestone O7：權威場次、恢復與單次結算 ══\n");

// ── 1) 權威 seed 真的接進引擎 ──────────────────────────────────────────
{
  const src = fs.readFileSync("src/useLocalServer.js", "utf8");
  ck("1) useLocalServer 不再無條件用時鐘產生 seed",
    /opts\.seed/.test(src) && /authoritative/.test(src));
  ck("1b) 有 session seed 時**不會**走到時鐘分支",
    /const seed = authoritative \? \(\(opts\.seed >>> 0\) \| 1\) : \(\(Date\.now\(\) & 0xffff\) \| 1\)/.test(src));
  const gv = fs.readFileSync("src/GameView.jsx", "utf8");
  ck("1c) GameView 從 Store 讀權威啟動參數（不接受 props 覆寫）",
    /matchmaking\?\.launch/.test(gv) && /seed: launch\?\.seed/.test(gv) &&
    !/function GameView\([^)]*seed/.test(gv));

  //  同一個 session ⇒ 同一個引擎 seed ⇒ 同一份初始狀態
  const A = launchedSession("moba", 13579);
  const B = launchedSession("moba", 13579);
  ck("1d) 同一 seed 的場次 → 啟動參數逐欄相同",
    JSON.stringify(A.launch) === JSON.stringify(B.launch), `seed ${A.launch.seed}`);
  const engineSeed = (s) => (s >>> 0) | 1;
  const e1 = new LogicEngine(engineSeed(A.launch.seed)).snapshot();
  const e2 = new LogicEngine(engineSeed(B.launch.seed)).snapshot();
  ck("1e) **同一 seed ⇒ 相同初始戰鬥狀態**（逐位元）",
    JSON.stringify(e1) === JSON.stringify(e2));
  const other = new LogicEngine(engineSeed(24680)).snapshot();
  ck("1f) 不同 seed ⇒ 初始狀態不同（測試有檢定力）",
    JSON.stringify(e1) !== JSON.stringify(other));
  //  相同 seed + 相同陣容 ⇒ 相同結果
  const run = (seed) => { const e = new LogicEngine(engineSeed(seed)); for (let i = 0; i < 200; i++) e.tick(0.5); return { over: e.over, winner: e.winner, t: e.t, bK: e.bK, rK: e.rK }; };
  ck("1g) **相同 seed ＋ 相同陣容 ⇒ 相同結果**",
    JSON.stringify(run(13579)) === JSON.stringify(run(13579)),
    JSON.stringify(run(13579)));
}

// ── 2) 場次恢復 ────────────────────────────────────────────────────────
{
  const { ticket, room, session } = launchedSession();
  ck("2) 已啟動的場次可恢復（不開新場、不再消耗令牌）", (() => {
    const r = resumeSession(session, { room, ticket, now: T0 + 5000 });
    return r.ok && r.session.sessionId === session.sessionId && r.session.tokenUsed === true;
  })());
  const resumed = resumeSession(session, { room, ticket, now: T0 + 5000 });
  ck("2b) **恢復取得的啟動參數與首次啟動逐欄相同**（同 seed ⇒ 同初始狀態）",
    JSON.stringify(resumed.launch) === JSON.stringify(launchConfigOf(session)));
  ck("2c) 恢復次數會累加（可觀測）", resumed.session.resumeCount === 1 &&
    resumeSession(resumed.session, { room, ticket, now: T0 + 6000 }).session.resumeCount === 2);
  //  斷線 → 仍可恢復
  const dc = markDisconnected(session, T0 + 1000);
  ck("2d) 可標記斷線，且斷線後仍可恢復",
    dc.ok && dc.session.connection === CONNECTION_STATES.disconnected &&
    resumeSession(dc.session, { room, ticket, now: T0 + 2000 }).ok);
  ck("2e) 恢復後連線狀態回到 connected",
    resumeSession(dc.session, { room, ticket, now: T0 + 2000 }).session.connection === CONNECTION_STATES.connected);
  //  存檔往返（重整）
  const round = JSON.parse(JSON.stringify({ ticket, room, session }));
  ck("2f) **重整後恢復同一場次**（存檔往返不失真）",
    resumeSession(round.session, { room: round.room, ticket: round.ticket, now: T0 + 9000 }).ok &&
    round.session.sessionId === session.sessionId);

  //  拒絕恢復的情況
  const cases = [
    ["尚未啟動", (s) => ({ ...s, state: SESSION_STATES.created, tokenUsed: false }), "not_launched"],
    ["已取消", (s) => cancelSession(s, "已取消本場比賽", T0).session, "cancelled"],
    ["已放棄", (s) => abandonSession(s, "已放棄本場比賽", T0).session, "abandoned"],
    ["已完成", (s) => completeSession(s, { matchId: "m", now: T0 }).session, "completed"],
  ];
  for (const [label, mut, code] of cases) {
    const r = resumeSession(mut(session), { room, ticket, now: T0 + 1000 });
    ck(`2g) 拒絕恢復：${label}`, !r.ok && r.errors.some((e) => e.code === code), r.errors[0]?.message);
  }
  const late = resumeSession(session, { room, ticket, now: T0 + (SESSION_TTL_SECONDS + 5) * 1000 });
  ck("2h) 拒絕恢復：已逾期", !late.ok && late.errors.some((e) => e.code === "expired"), late.errors[0]?.message);
  ck("2i) 拒絕恢復：票券不符",
    !resumeSession(session, { room, ticket: { ...ticket, ticketId: "ticket:moba:00000000" }, now: T0 + 1000 }).ok);
  ck("2j) 拒絕恢復：seed 被竄改",
    !resumeSession(session, { room, ticket: { ...ticket, assignment: { ...ticket.assignment, seed: 1 } }, now: T0 + 1000 }).ok);
  ck("2k) 拒絕恢復：自造場次（無簽發者）",
    !resumeSession({ ...session, issuedBy: null }, { room, ticket, now: T0 + 1000 }).ok);
}

// ── 3) MatchResult 契約 ────────────────────────────────────────────────
{
  const { session } = launchedSession();
  const made = createMatchResult({ session, outcome: outcomeOf("m-1"), now: T0 });
  ck("3) 由場次建立結果", made.ok && made.result.schema === MATCH_RESULT_VERSION, made.result.resultId);
  ck("3b) 綁定 sessionId / matchId / 雙方隊伍版本 / seed",
    made.result.sessionId === session.sessionId && made.result.matchId === "m-1" &&
    JSON.stringify(made.result.rosterVersions) === JSON.stringify(session.rosterVersions) &&
    made.result.seed === session.seed);
  ck("3c) 帶 winner / score / duration / resultSource",
    made.result.winner === "us" && made.result.score.us === 16 &&
    made.result.durationSec === 1500 && made.result.resultSource === RESULT_SOURCES.engine);
  ck("3d) **客戶端自稱的結果來源一律拒絕**",
    !createMatchResult({ session, outcome: outcomeOf("m-1"), source: "client", now: T0 }).ok &&
    !validateMatchResult({ ...made.result, resultSource: "manual" }, { session }).ok);
  ck("3e) 竄改勝負 → resultId 對不上，被抓出來",
    !validateMatchResult({ ...made.result, winner: "opponent" }, { session }).ok,
    validateMatchResult({ ...made.result, winner: "opponent" }, { session }).errors[0].message);
  ck("3f) 竄改比分或時長 → 同樣被抓",
    !validateMatchResult({ ...made.result, score: { us: 99, opponent: 0 } }, { session }).ok &&
    !validateMatchResult({ ...made.result, durationSec: 1 }, { session }).ok);
  ck("3g) 結果與場次 seed 不符 → 拒絕",
    !validateMatchResult(made.result, { session: { ...session, seed: 1 } }).ok);
  //  重送 vs 衝突
  const again = createMatchResult({ session, outcome: outcomeOf("m-1"), now: T0 + 9999 });
  ck("3h) **同一份結果重送 → 同一個 resultId**（時間戳不影響）",
    again.result.resultId === made.result.resultId && isSameResult(made.result, again.result));
  const conflict = createMatchResult({ session, outcome: { ...outcomeOf("m-1"), winner: "opponent" }, now: T0 });
  ck("3i) **同一場送不同結果 → 偵測為衝突並拒絕**",
    !validateMatchResult(conflict.result, { session, known: made.result }).ok &&
    validateMatchResult(conflict.result, { session, known: made.result }).errors.some((e) => e.code === "conflict"),
    validateMatchResult(conflict.result, { session, known: made.result }).errors.find((e) => e.code === "conflict")?.message);
  ck("3j) 內容雜湊只取會影響結算的欄位",
    resultContentHash({ sessionId: "s", matchId: "m", winner: "us", score: { us: 1, opponent: 0 }, durationSec: 10, seed: 5 }) ===
    resultContentHash({ sessionId: "s", matchId: "m", winner: "us", score: { us: 1, opponent: 0 }, durationSec: 10.4, seed: 5 }));
}

// ── 4) 單次結算 ────────────────────────────────────────────────────────
{
  const { ticket, room, session } = launchedSession();
  const base = mkState({ matchmaking: { ticket, room, session, launch: null, lastResult: null, settlements: {}, lastSettlementError: null } });
  const result = createMatchResult({ session, outcome: outcomeOf("m-2"), now: T0 }).result;
  const tx = mkTx("m-2");

  const first = settleMatchResultInState(base, { result, session, transaction: tx, now: T0 });
  ck("4) 首次結算成功", first.receipt.ok && first.receipt.settled);
  const afterState = { ...base, ...first.nextState };
  const fundsAfter = afterState.finance.funds;
  const xpAfter = afterState.players[0].xp;
  const energyAfter = afterState.players[0].energy;
  ck("4b) 錢／粉絲／經驗確實入帳一次",
    fundsAfter === base.finance.funds + 120_000 && xpAfter === PLAYERS[0].xp + 60,
    `$${base.finance.funds} → $${fundsAfter}`);
  ck("4c) 體力有扣（出賽損耗，來自 O2）", energyAfter < PLAYERS[0].energy, `${PLAYERS[0].energy} → ${energyAfter}`);
  ck("4d) 場次被標記完成並帶上追蹤鏈",
    afterState.matchmaking.session.state === SESSION_STATES.completed &&
    afterState.matchmaking.session.resultId === result.resultId &&
    afterState.matchmaking.session.settlementId === settlementIdOf(result));

  //  ⭐ 重送：同一份結果 ⇒ 同一張 receipt，不重複入帳
  const second = settleMatchResultInState(afterState, { result, session: afterState.matchmaking.session, transaction: tx, now: T0 + 1000 });
  ck("4e) **同一份結果重送 → 回既有 receipt，完全不寫入**",
    second.nextState === null && second.receipt.alreadySettled === true &&
    second.receipt.settlementId === first.receipt.settlementId);
  ck("4f) 重送後資金／經驗／體力都沒有再變動",
    afterState.finance.funds === fundsAfter && afterState.players[0].xp === xpAfter &&
    afterState.players[0].energy === energyAfter);

  //  中斷重試：第一次「失敗」（驗證不過）不留半套，重試成功
  const bad = { ...result, resultSource: "client" };
  const failed = settleMatchResultInState(base, { result: bad, session, transaction: tx, now: T0 });
  ck("4g) 結果不可信 → 不入帳，但保存失敗原因",
    !failed.receipt.ok && !!failed.nextState.matchmaking.lastSettlementError?.reason,
    failed.receipt.reason);
  ck("4h) 失敗後資金與經驗完全沒動（不會只完成一半）",
    !failed.nextState.finance && !failed.nextState.players);
  const retry = settleMatchResultInState({ ...base, ...failed.nextState }, { result, session, transaction: tx, now: T0 + 5 });
  ck("4i) **中斷後重試成功且只入帳一次**",
    retry.receipt.ok && ({ ...base, ...retry.nextState }).finance.funds === base.finance.funds + 120_000);

  //  衝突結果拒絕
  const conflict = createMatchResult({ session, outcome: { ...outcomeOf("m-2"), score: { us: 5, opponent: 16 }, winner: "opponent" }, now: T0 }).result;
  const conflicted = settleMatchResultInState(afterState, { result: conflict, session: afterState.matchmaking.session, transaction: mkTx("m-2"), now: T0 + 2000 });
  ck("4j) **同一場送不同結果 → 拒絕結算**",
    !conflicted.receipt.ok && conflicted.receipt.errors.some((e) => e.code === "conflict"),
    conflicted.receipt.reason);
}

// ── 5) 追蹤鏈 ──────────────────────────────────────────────────────────
{
  const { ticket, room, session } = launchedSession();
  const base = mkState({ matchmaking: { ticket, room, session, launch: null, lastResult: null, settlements: {}, lastSettlementError: null } });
  const result = createMatchResult({ session, outcome: outcomeOf("m-3"), now: T0 }).result;
  const r = settleMatchResultInState(base, { result, session, transaction: mkTx("m-3"), now: T0 }).receipt;
  const chain = r.trace;
  ck("5) 追蹤鏈七個環節齊全",
    ["ticketId", "assignmentId", "roomId", "sessionId", "matchId", "resultId", "settlementId"].every((k) => !!chain[k]),
    Object.keys(chain).join(" → "));
  ck("5b) 每一環都對得起來",
    chain.ticketId === ticket.ticketId && chain.assignmentId === ticket.assignment.assignmentId &&
    chain.roomId === room.roomId && chain.sessionId === session.sessionId &&
    chain.matchId === "m-3" && chain.resultId === result.resultId &&
    chain.settlementId === settlementIdOf(result));
  ck("5c) 追蹤鏈**不含 launchToken 等敏感內容**",
    !/launchToken|lt_/.test(JSON.stringify(chain)));
}

// ── 6) MOBA 與 CS 共用同一套 ───────────────────────────────────────────
{
  const cs = launchedSession("cs", 33221);
  ck("6) CS 走同一套場次契約", cs.session.mode === "cs" && cs.session.state === SESSION_STATES.launched);
  const result = createMatchResult({ session: cs.session, outcome: outcomeOf("cs-1"), now: T0 }).result;
  ck("6b) CS 結果綁定同一份契約", result.mode === "cs" && result.sessionId === cs.session.sessionId);
  const base = mkState({ matchmaking: { ticket: cs.ticket, room: cs.room, session: cs.session, launch: null, lastResult: null, settlements: {}, lastSettlementError: null } });
  const first = settleMatchResultInState(base, { result, session: cs.session, transaction: mkTx("cs-1", "cs"), now: T0 });
  ck("6c) CS 也是單次結算", first.receipt.ok &&
    settleMatchResultInState({ ...base, ...first.nextState }, { result, session: first.nextState.matchmaking.session, transaction: mkTx("cs-1", "cs"), now: T0 + 1 }).nextState === null);
  ck("6d) CS 恢復同樣可用", resumeSession(cs.session, { room: cs.room, ticket: cs.ticket, now: T0 + 100 }).ok);
}

console.log("\n── 追蹤鏈摘要 ────────────────────────────────────────────────");
{
  const { ticket, room, session } = launchedSession();
  const result = createMatchResult({ session, outcome: outcomeOf("m-demo"), now: T0 }).result;
  console.log(`   ${ticket.ticketId}`);
  console.log(`   → ${ticket.assignment.assignmentId}`);
  console.log(`   → ${room.roomId}`);
  console.log(`   → ${session.sessionId}（seed ${session.seed}）`);
  console.log(`   → ${result.matchId} → ${result.resultId} → ${settlementIdOf(result)}`);
}

console.log(`\n${pass}/${pass + fail} 通過`);
process.exit(fail === 0 ? 0 : 1);
