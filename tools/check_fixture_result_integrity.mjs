#!/usr/bin/env node
// ============================================================================
//  tools/check_fixture_result_integrity.mjs — 賽程賽果完整性（跨場次防串）
//
//  執行：repo 根目錄 `node tools/check_fixture_result_integrity.mjs`；**失敗時 exit 1**。
//
//  ── 這支在防什麼 ──────────────────────────────────────────────────────────
//  稽核發現：一份**已經結算過的舊 BattleResult**，若在另一個 active 場次
//  （賽程場次）存在時被重送，會被當成那一場的正式賽果寫進去。
//
//  成因不是「結果沒綁場次」，而是**綁定方向反了**：
//  `createMatchResult({ session, outcome })` 是把**當下場次的身分**
//  （sessionId / seed / rosterVersions）蓋到呼叫端遞來的 outcome 上。
//  於是舊對戰的 winner／score 會被重新蓋章成新場次的合法結果——
//  contentHash 重算得過、與 session 逐欄相符、與 `lastResult` 也不衝突
//  （sessionId 不同 ⇒ 衝突偵測不會觸發），一路綠燈寫進去。
//
//  ⚠ 光靠下游的 `receipt.ok && !receipt.alreadySettled && isFixtureSession()`
//    擋不住：那只擋「要不要寫 fixture 紀錄」，擋不住 **session 被舊結果佔用並
//    標成 completed**——真正的賽果從此再也結算不進去（§2c/2d 驗這件事）。
//
//  ── 修正後的不變量 ────────────────────────────────────────────────────────
//  「這筆對戰的進度交易先前已入帳，但**本場次**沒有任何對應它的結算紀錄」
//   ⇒ 這份結果來自別場，拒絕結算，且**完全不寫入**。
// ============================================================================
import {
  SESSION_STATES, createSession, consumeLaunchToken,
} from "../src/platform/contracts/matchSession.js";
import { createMatchResult } from "../src/platform/contracts/matchResult.js";
import { settleMatchResultInState, settlementIdOf } from "../src/platform/progress/settleMatchResult.js";
import { applyProgressToState } from "../src/platform/progress/applyMatchProgress.js";
import { ROOM_STATES, createRoom, transitionRoom, confirmSide } from "../src/platform/contracts/matchRoom.js";
import { TICKET_STATES, createTicket, transitionTicket, createAssignment } from "../src/platform/contracts/matchmaking.js";
import { MOCK_OPPONENTS } from "../src/platform/matchmaking/mockGateway.js";
import { createMatchEntryRequest } from "../src/platform/contracts/matchEntry.js";
import { createMatchProgressTransaction } from "../src/platform/contracts/matchProgressTransaction.js";
import { ENGINE_SEATS } from "../src/platform/contracts/matchLineup.js";

let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`✅ ${name}${detail ? "　" + detail : ""}`); }
  else { fail++; console.log(`❌ ${name}${detail ? "　" + detail : ""}`); }
};

//  ── fixtures（與 check_authoritative_o7.mjs 同一組，避免兩套假資料）──
const statsAll = (v) => Object.fromEntries(
  ["reflex", "accuracy", "apm", "positioning", "mapAware", "tacticalIQ", "decision", "adaptability",
    "courage", "clutch", "focus", "resilience", "comms", "leadership", "synergy", "learning"].map((k) => [k, v]));
const LANES = ["上路", "打野", "中路", "下路", "輔助"];
const PLAYERS = LANES.map((lane, i) => ({
  id: `s${i + 1}`, name: `P-s${i + 1}`, role: lane, lv: 6, xp: 400, energy: 95,
  morale: 80, personality: "steady", condition: "精神飽滿", stats: statsAll(72), rosterTier: "active",
}));
const CTX = { teamId: "GSEAL", teamName: "白貓戰隊", day: 8, week: 2, season: 1 };
const T0 = 4_000_000;
const seats = Object.fromEntries(ENGINE_SEATS.map((s, i) => [s, PLAYERS[i].id]));

/** 產生一個「已啟動」的場次。不同 seed ⇒ 不同 assignment/room/session。 */
function launchedSession(seed) {
  const entry = createMatchEntryRequest({ mode: "moba", seats, players: PLAYERS, context: CTX }).request;
  const q = transitionTicket(createTicket(entry, { now: T0 }).ticket, TICKET_STATES.queued, { now: T0 }).ticket;
  const a = createAssignment({ ticket: q, opponent: MOCK_OPPONENTS[1], seed, now: T0 });
  const ticket = transitionTicket(q, TICKET_STATES.matched, { now: T0, assignment: a }).ticket;
  const room0 = createRoom({ assignment: a, ticket, now: T0 }).room;
  const ready = transitionRoom(room0, ROOM_STATES.ready_check, { now: T0 }).room;
  const room = confirmSide(confirmSide(ready, "us", { now: T0 + 1 }).room, "opponent", { now: T0 + 2 }).room;
  const created = createSession({ room, ticket, now: T0 }).session;
  const { session } = consumeLaunchToken(created, created.launchToken, { room, ticket, now: T0 + 10 });
  return { ticket, room, session };
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
const mkTx = (matchId) => createMatchProgressTransaction({
  mode: "moba", matchId, sourceResultVersion: "BattleResult.v2",
  teamRewards: { money: 120_000, fans: 300, reputation: 2 },
  playerProgress: PLAYERS.map((p) => ({
    playerId: p.id, xpGained: 60, previousXp: p.xp, newXp: p.xp + 60,
    previousLevel: p.lv, newLevel: p.lv, levelsGained: 0, talentPointsGained: 0, reasons: ["勝利"],
  })),
  metadata: { winner: "us", score: { us: 1, enemy: 0 } },
});
/** 一場舊對戰的 payload（winner/score/duration 全部照抄，matchId 由內容決定）。 */
const OLD_BATTLE = { matchId: "m-old-battle", winner: "us", score: { us: 16, opponent: 9 }, durationSec: 1500 };

/** 把 mm 換成另一個 active 場次（模擬「賽程排定的下一場已經開打」）。 */
const withSession = (state, { ticket, room, session }) => ({
  ...state,
  matchmaking: { ...state.matchmaking, ticket, room, session, launch: null },
});

console.log("══ 賽程賽果完整性：跨場次防串 ══\n");

// ── 1) 基準：正常的一場照常結算（確保沒有誤傷）────────────────────────
{
  const A = launchedSession(13579);
  const base = withSession(mkState(), A);
  const result = createMatchResult({ session: A.session, outcome: OLD_BATTLE, now: T0 }).result;
  const r = settleMatchResultInState(base, { result, session: A.session, transaction: mkTx(OLD_BATTLE.matchId), now: T0 });
  const after = { ...base, ...r.nextState };
  ck("1) 全新結果在自己的場次可正常結算", r.receipt.ok && r.receipt.settled, r.receipt.settlementId);
  ck("1b) 錢確實入帳一次", after.finance.funds === base.finance.funds + 120_000,
    `$${base.finance.funds} → $${after.finance.funds}`);
  ck("1c) 場次標記完成並帶追蹤鏈",
    after.matchmaking.session.state === SESSION_STATES.completed &&
    after.matchmaking.session.settlementId === settlementIdOf(result));
  ck("1d) 同一份結果重送 → 回既有 receipt、完全不寫入",
    settleMatchResultInState(after, { result, session: after.matchmaking.session, transaction: mkTx(OLD_BATTLE.matchId), now: T0 + 1 }).nextState === null);
}

// ── 2) 主案：已結算的舊結果，重送到另一個 active 場次 ──────────────────
{
  const A = launchedSession(13579);          // 舊的一場（已打完、已結算）
  const B = launchedSession(99991);          // 另一個 active 場次（賽程排定的下一場）
  ck("2) 兩個場次確實不同（測試有檢定力）",
    A.session.sessionId !== B.session.sessionId && A.session.seed !== B.session.seed,
    `${A.session.sessionId} vs ${B.session.sessionId}`);

  //  A 場正常結算
  const stateA = mkState();
  const resultA = createMatchResult({ session: A.session, outcome: OLD_BATTLE, now: T0 }).result;
  const settledA = settleMatchResultInState(withSession(stateA, A), {
    result: resultA, session: A.session, transaction: mkTx(OLD_BATTLE.matchId), now: T0,
  });
  const afterA = { ...withSession(stateA, A), ...settledA.nextState };

  //  B 場開打中；此時舊的 BattleResult 被重送（Result 畫面殘留／舊存檔／stale hook）
  const live = withSession(afterA, B);
  const fundsBefore = live.finance.funds;
  const xpBefore = live.players[0].xp;
  //  ⚠ 關鍵：createMatchResult 會把 **B 的身分**蓋到舊 payload 上 ⇒ 產出一份「合法」的 B 場結果
  const laundered = createMatchResult({ session: B.session, outcome: OLD_BATTLE, now: T0 + 60_000 }).result;
  ck("2b) 舊 payload 被重新蓋章成 B 場的結果（這就是漏洞的入口）",
    laundered.sessionId === B.session.sessionId && laundered.resultId !== resultA.resultId,
    laundered.resultId);

  const hijack = settleMatchResultInState(live, {
    result: laundered, session: B.session, transaction: mkTx(OLD_BATTLE.matchId), now: T0 + 60_000,
  });
  const afterHijack = { ...live, ...(hijack.nextState ?? {}) };

  ck("2c) **舊結果不得被 B 場受理**",
    hijack.receipt.ok === false && hijack.receipt.settled === false,
    hijack.receipt.reason ?? "(被受理了)");
  ck("2d) **B 場次不得被標成 completed**（真正的要害：否則正牌賽果永遠結算不進去）",
    afterHijack.matchmaking.session.state === SESSION_STATES.launched,
    `state = ${afterHijack.matchmaking.session.state}`);
  ck("2e) lastResult 不得被舊結果換掉",
    afterHijack.matchmaking.lastResult?.resultId === resultA.resultId);
  ck("2f) 不得產生第二筆結算紀錄",
    Object.keys(afterHijack.matchmaking.settlements ?? {}).length === 1 &&
    !(settlementIdOf(laundered) in (afterHijack.matchmaking.settlements ?? {})));
  ck("2g) 錢／經驗完全沒動", afterHijack.finance.funds === fundsBefore && afterHijack.players[0].xp === xpBefore);
  ck("2h) 失敗原因有保存且是中文（可稽核）",
    !!afterHijack.matchmaking.lastSettlementError?.reason &&
    hijack.receipt.errors?.some((e) => e.code === "foreign_result"),
    afterHijack.matchmaking.lastSettlementError?.reason);

  //  ⭐ B 場的**正牌**賽果，在被擋掉之後仍然結算得進去
  const realB = createMatchResult({
    session: B.session, outcome: { matchId: "m-real-b", winner: "opponent", score: { us: 7, opponent: 13 }, durationSec: 2100 }, now: T0 + 70_000,
  }).result;
  const settledB = settleMatchResultInState(afterHijack, {
    result: realB, session: B.session, transaction: mkTx("m-real-b"), now: T0 + 70_000,
  });
  const afterB = { ...afterHijack, ...(settledB.nextState ?? {}) };
  ck("2i) **B 場的正牌賽果仍可正常結算**（擋錯的沒有連正確的一起擋掉）",
    settledB.receipt.ok && settledB.receipt.winner === "opponent", settledB.receipt.settlementId);
  ck("2j) B 場此時才標記完成",
    afterB.matchmaking.session.state === SESSION_STATES.completed &&
    afterB.matchmaking.session.matchId === "m-real-b");
}

// ── 3) 變體：舊結果只經 S25 入帳、沒有 O7 結算紀錄 ────────────────────
//  （debug harness／舊存檔殘留：`settleMatchThroughSession` 的 viaSession:false 路徑）
{
  const B = launchedSession(24680);
  const seeded = applyProgressToState(mkState(), mkTx("m-orphan"));   // 只入帳，無 settlement
  const live = withSession({ ...mkState(), ...seeded.nextState }, B);
  ck("3) 前置：舊對戰的進度已入帳，但沒有任何 O7 結算紀錄",
    !!live.processedMatchTransactions["moba:m-orphan:progress-v1"] &&
    Object.keys(live.matchmaking.settlements).length === 0);

  const laundered = createMatchResult({
    session: B.session, outcome: { matchId: "m-orphan", winner: "us", score: { us: 16, opponent: 2 }, durationSec: 900 }, now: T0,
  }).result;
  const r = settleMatchResultInState(live, { result: laundered, session: B.session, transaction: mkTx("m-orphan"), now: T0 });
  const after = { ...live, ...(r.nextState ?? {}) };
  ck("3b) **無 settlement 的舊結果同樣不得佔用本場次**",
    r.receipt.ok === false && r.receipt.errors?.some((e) => e.code === "foreign_result"),
    r.receipt.reason ?? "(被受理了)");
  ck("3c) 場次仍為進行中", after.matchmaking.session.state === SESSION_STATES.launched);
}

// ── 4) 不誤傷：既有 O7 的防重送／防衝突行為不變 ────────────────────────
{
  const A = launchedSession(11111);
  const base = withSession(mkState(), A);
  const result = createMatchResult({ session: A.session, outcome: { ...OLD_BATTLE, matchId: "m-keep" }, now: T0 }).result;
  const first = settleMatchResultInState(base, { result, session: A.session, transaction: mkTx("m-keep"), now: T0 });
  const after = { ...base, ...first.nextState };
  const again = settleMatchResultInState(after, { result, session: after.matchmaking.session, transaction: mkTx("m-keep"), now: T0 + 5 });
  ck("4) 同場同結果重送 → 仍回既有 receipt（alreadySettled）",
    again.nextState === null && again.receipt.alreadySettled === true &&
    again.receipt.settlementId === first.receipt.settlementId);

  const conflict = createMatchResult({
    session: A.session, outcome: { matchId: "m-keep", winner: "opponent", score: { us: 3, opponent: 16 }, durationSec: 1200 }, now: T0,
  }).result;
  const rejected = settleMatchResultInState(after, { result: conflict, session: after.matchmaking.session, transaction: mkTx("m-keep"), now: T0 + 6 });
  ck("4b) 同場送不同結果 → 仍以 conflict 拒絕（不是被新規則吃掉）",
    !rejected.receipt.ok && rejected.receipt.errors.some((e) => e.code === "conflict"),
    rejected.receipt.reason);

  //  換場次但**結果不是本場的** ⇒ 應該由既有的 session_mismatch 擋下
  const C = launchedSession(22222);
  const mismatch = settleMatchResultInState(withSession(after, C), {
    result, session: C.session, transaction: mkTx("m-keep"), now: T0 + 7,
  });
  ck("4c) 拿 A 場的結果去 C 場結算 → 仍由 session_mismatch 擋下",
    !mismatch.receipt.ok && mismatch.receipt.errors.some((e) => e.code === "session_mismatch"),
    mismatch.receipt.reason);
}

console.log(`\n${pass}/${pass + fail} 通過`);
process.exit(fail === 0 ? 0 : 1);
