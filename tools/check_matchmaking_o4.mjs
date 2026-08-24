#!/usr/bin/env node
// ============================================================================
//  tools/check_matchmaking_o4.mjs — Milestone O4：配對票券與等待狀態
//
//  執行：repo 根目錄 `node tools/check_matchmaking_o4.mjs`；**失敗時 exit 1**。
//
//  驗的是這個閉環的六件事：
//    ① 由 O3 申請單建票，六種狀態齊全，非法轉移一律拒絕
//    ② 同一隊伍只能有一張有效票券（防重複排隊）
//    ③ queued 期間可取得等待時間、模式、隊伍版本；可取消
//    ④ **取消或被拒絕之後不得進入對戰**
//    ⑤ matched 只接受 gateway 簽發的 MatchAssignment；
//       客戶端不得指定對手數值或比賽結果
//    ⑥ mock gateway 決定性，且**每次輪詢都用當下名單重驗資格**
// ============================================================================
import {
  TICKET_VERSION, ASSIGNMENT_VERSION, TICKET_STATES, TERMINAL_STATES, ACTIVE_STATES,
  createTicket, transitionTicket, canTransition, canEnterMatch, waitedSeconds,
  stateLabel, createAssignment, validateAssignment, isActiveTicket, isTerminalTicket,
} from "../src/platform/contracts/matchmaking.js";
import { pollGateway, waitSecondsFor, opponentFor, seedFor, MOCK_OPPONENTS } from "../src/platform/matchmaking/mockGateway.js";
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
const mkPlayer = (id, role, over = {}) => ({
  id, name: `P-${id}`, role, lv: 8, xp: 900, energy: 90, morale: 80,
  personality: "steady", condition: "精神飽滿", stats: statsAll(72), rosterTier: "active", ...over,
});
const LANES = ["上路", "打野", "中路", "下路", "輔助"];
const PLAYERS = LANES.map((lane, i) => mkPlayer(`s${i + 1}`, lane));
const mobaSeats = Object.fromEntries(ENGINE_SEATS.map((s, i) => [s, PLAYERS[i].id]));
const csSeats = Object.fromEntries(CS_SEATS.map((s, i) => [s, PLAYERS[i].id]));
const CTX = { teamId: "GSEAL", teamName: "白貓戰隊", day: 8, week: 2, season: 1 };
const entryOf = (mode, seats, players = PLAYERS) =>
  createMatchEntryRequest({ mode, seats, players, context: CTX }).request;

const T0 = 1_000_000;
const newTicket = (mode = "moba", seats = mobaSeats) => createTicket(entryOf(mode, seats), { now: T0 }).ticket;
const queuedTicket = (mode = "moba", seats = mobaSeats) =>
  transitionTicket(newTicket(mode, seats), TICKET_STATES.queued, { now: T0 }).ticket;

console.log("══ Milestone O4：配對票券與等待狀態 ══\n");

// ── 1) 建票與狀態機 ─────────────────────────────────────────────────────
{
  ck("1) 六種狀態齊全",
    Object.keys(TICKET_STATES).sort().join() === "cancelled,idle,matched,queued,rejected,validating",
    Object.values(TICKET_STATES).map(stateLabel).join("／"));
  const t = newTicket();
  ck("1b) 由 O3 申請單建票，初始狀態為驗證中",
    t.schema === TICKET_VERSION && t.state === TICKET_STATES.validating, t.ticketId);
  ck("1c) 票券只保留識別，不複製整張申請單",
    Object.keys(t).sort().join() === //  ⚠ 精確比對（排序後）：任何新欄位都必須在這裡明確登記，這是紅線的執行機制。
    //  2026-08-07 新增 `attempt`（同一套陣容第幾次排隊）。它是 ticketId 的推導來源
    //  之一，屬於**識別**，不是把申請單複製進來——加入後重新配對才會產生
    //  可分辨的新票券；`attempt = 0` 的 id 與加入前逐位元相同（見 1d）。
    "assignment,attempt,createdAt,entryTransactionId,mode,queuedAt,reason,rosterVersion,schema,state,teamId,ticketId,updatedAt",
    Object.keys(t).join(","));
  ck("1d) ticketId 由申請單決定性推導（重複建票同一個 id）",
    newTicket().ticketId === t.ticketId);
  ck("1e) 無效申請單不能建票",
    createTicket(null, { now: T0 }).ok === false && createTicket({ schema: "x" }, { now: T0 }).ticket === null);

  //  合法／非法轉移
  ck("1f) 合法轉移：驗證中 → 配對中 → 已配對",
    canTransition("validating", "queued") && canTransition("queued", "matched"));
  ck("1g) 非法轉移一律拒絕（終局狀態不能再變）",
    !canTransition("matched", "queued") && !canTransition("cancelled", "queued") && !canTransition("rejected", "matched"));
  const bad = transitionTicket(t, TICKET_STATES.matched, { now: T0 });
  ck("1h) 直接從驗證中跳到已配對 → 拒絕且有中文理由",
    !bad.ok && bad.ticket === null && bad.errors[0].message.includes("無法從"), bad.errors[0].message);
  ck("1i) 拒絕必須附原因",
    !transitionTicket(queuedTicket(), TICKET_STATES.rejected, { now: T0 }).ok);
  ck("1j) 終局／進行中判定正確",
    TERMINAL_STATES.length === 3 && ACTIVE_STATES.length === 2 &&
    isActiveTicket(queuedTicket()) && isTerminalTicket({ state: "cancelled" }));
}

// ── 2) 排隊資訊與取消 ───────────────────────────────────────────────────
{
  const q = queuedTicket();
  ck("2) 進入佇列時記錄時間", q.state === TICKET_STATES.queued && q.queuedAt === T0);
  ck("2b) 等待秒數可計算", waitedSeconds(q, T0 + 7000) === 7, `${waitedSeconds(q, T0 + 7000)}s`);
  ck("2c) 票券帶模式與隊伍版本（畫面要顯示）",
    q.mode === "moba" && typeof q.rosterVersion === "string" && q.rosterVersion.length === 8);
  const c = transitionTicket(q, TICKET_STATES.cancelled, { now: T0 + 3000 });
  ck("2d) 排隊中可取消", c.ok && c.ticket.state === TICKET_STATES.cancelled);
  ck("2e) 取消後不能再轉回配對中", !transitionTicket(c.ticket, TICKET_STATES.queued, { now: T0 }).ok);
}

// ── 3) 取消／拒絕之後不得進入對戰 ───────────────────────────────────────
{
  const q = queuedTicket();
  ck("3) 排隊中不可進場", !canEnterMatch(q).ok, canEnterMatch(q).message);
  const cancelled = transitionTicket(q, TICKET_STATES.cancelled, { now: T0 }).ticket;
  ck("3b) **取消後不可進場**", !canEnterMatch(cancelled).ok, canEnterMatch(cancelled).message);
  const rejected = transitionTicket(q, TICKET_STATES.rejected, { now: T0, reason: "名單已變更" }).ticket;
  ck("3c) **被拒絕後不可進場**，且原因是中文",
    !canEnterMatch(rejected).ok && rejected.reason === "名單已變更");
  ck("3d) 沒有票券時不可進場", !canEnterMatch(null).ok);
  //  matched 但指派單被抽掉 ⇒ 仍然不可進場
  const okAssign = createAssignment({ ticket: q, opponent: MOCK_OPPONENTS[0], seed: 42, now: T0 });
  const matched = transitionTicket(q, TICKET_STATES.matched, { now: T0, assignment: okAssign }).ticket;
  ck("3e) 已配對且指派單合法 → 可進場", canEnterMatch(matched).ok);
  ck("3f) 已配對但指派單被抽掉 → 不可進場",
    !canEnterMatch({ ...matched, assignment: null }).ok);
}

// ── 4) 指派單只能由 gateway 簽發，且不得夾帶結果 ────────────────────────
{
  const q = queuedTicket();
  const a = createAssignment({ ticket: q, opponent: MOCK_OPPONENTS[1], seed: 7, now: T0 });
  ck("4) 指派單形狀正確", validateAssignment(a, q).ok && a.schema === ASSIGNMENT_VERSION);
  ck("4b) 指派單標明簽發者", a.issuedBy === "mock-gateway");
  ck("4c) 對手只有識別，沒有戰力數值",
    Object.keys(a.opponent).sort().join() === "id,name");
  //  ⛔ 客戶端不得指定比賽結果
  for (const key of ["winner", "result", "score", "rewards", "mvp"]) {
    const tampered = { ...a, [key]: "us" };
    ck(`4d) 夾帶「${key}」的指派單 → 拒絕`,
      !validateAssignment(tampered, q).ok &&
      validateAssignment(tampered, q).errors.some((e) => e.code === "result_leak"));
  }
  ck("4e) 對手夾帶戰力數值 → 拒絕",
    !validateAssignment({ ...a, opponent: { ...a.opponent, power: 999 } }, q).ok);
  ck("4f) 指派單與票券不符 → 拒絕",
    !validateAssignment({ ...a, ticketId: "ticket:moba:deadbeef" }, q).ok);
  ck("4g) 缺對手或缺種子 → 拒絕",
    !validateAssignment({ ...a, opponent: null }, q).ok &&
    !validateAssignment({ ...a, seed: null }, q).ok);
  //  transitionTicket 也會擋
  ck("4h) 用不合法指派單轉到已配對 → 拒絕",
    !transitionTicket(q, TICKET_STATES.matched, { now: T0, assignment: { ...a, winner: "us" } }).ok);
}

// ── 5) mock gateway：決定性 ＋ 等待 ＋ 配對 ────────────────────────────
{
  const q = queuedTicket();
  const entry = entryOf("moba", mobaSeats);
  ck("5) 等待秒數決定性且落在設定區間",
    waitSecondsFor(q) === waitSecondsFor(q) && waitSecondsFor(q) >= 3 && waitSecondsFor(q) <= 9,
    `${waitSecondsFor(q)}s`);
  ck("5b) 對手與種子決定性",
    opponentFor(q).id === opponentFor(q).id && seedFor(q) === seedFor(q),
    `${opponentFor(q).name} / seed ${seedFor(q)}`);
  const need = waitSecondsFor(q);
  const early = pollGateway({ ticket: q, entryRequest: entry, players: PLAYERS, now: T0 + (need - 1) * 1000 });
  ck("5c) 時間未到 → waiting 並回報剩餘秒數",
    early.decision === "waiting" && early.etaSec === 1, `etaSec=${early.etaSec}`);
  const done = pollGateway({ ticket: q, entryRequest: entry, players: PLAYERS, now: T0 + need * 1000 });
  ck("5d) 時間到 → matched 並簽發指派單",
    done.decision === "matched" && validateAssignment(done.assignment, q).ok,
    done.assignment?.opponent?.name);
  ck("5e) 同一張票券重複輪詢 → 結果逐欄相同（可驗證）",
    JSON.stringify(done) === JSON.stringify(pollGateway({ ticket: q, entryRequest: entry, players: PLAYERS, now: T0 + need * 1000 })));
  ck("5f) 非 queued 的票券輪詢不會有動作",
    pollGateway({ ticket: newTicket(), entryRequest: entry, players: PLAYERS, now: T0 + 99999 }).decision === "waiting");
}

// ── 6) 排隊期間資格改變 → 被拒絕（伺服器用當下名單重驗）────────────────
{
  const q = queuedTicket();
  const entry = entryOf("moba", mobaSeats);
  const need = waitSecondsFor(q);
  //  排隊中有人體力掉到門檻以下
  //  ⚠ 舊版這裡用的是「排隊中有人受傷」。**選手隨機受傷／傷停已被產品取消**，
  //    情境改用仍然成立的疲勞規則；另外補一條反向斷言，確保舊存檔的傷停資料
  //    不會把人踢出隊列。守門見 `tools/check_no_player_injury.mjs`。
  const tired = PLAYERS.map((p) => (p.id === "s2" ? { ...p, energy: 3 } : p));
  const r1 = pollGateway({ ticket: q, entryRequest: entry, players: tired, now: T0 + need * 1000 });
  ck("6) 排隊中有人體力過低 → 拒絕並附中文原因",
    r1.decision === "rejected" && /體力/.test(r1.reason), r1.reason);
  const legacyHurt = PLAYERS.map((p) => (p.id === "s2" ? { ...p, injuryDays: 3, injured: true } : p));
  const r1b = pollGateway({ ticket: queuedTicket(), entryRequest: entry, players: legacyHurt, now: T0 + need * 1000 });
  ck("6a) 排隊中的舊傷停資料**不會**造成拒絕",
    r1b.decision !== "rejected", `${r1b.decision}${r1b.reason ? " / " + r1b.reason : ""}`);
  //  排隊中有人被改成未登錄
  const unl = PLAYERS.map((p) => (p.id === "s4" ? { ...p, rosterTier: "unlisted" } : p));
  const r2 = pollGateway({ ticket: q, entryRequest: entry, players: unl, now: T0 + need * 1000 });
  ck("6b) 排隊中有人被改成未登錄 → 拒絕",
    r2.decision === "rejected" && r2.reason.length > 0, r2.reason);
  //  排隊中有人離隊
  const gone = PLAYERS.filter((p) => p.id !== "s5");
  const r3 = pollGateway({ ticket: q, entryRequest: entry, players: gone, now: T0 + need * 1000 });
  ck("6c) 排隊中有人離隊 → 拒絕", r3.decision === "rejected", r3.reason);
  ck("6d) 拒絕發生在等待期間也一樣（不必等時間到）",
    pollGateway({ ticket: q, entryRequest: entry, players: tired, now: T0 + 1000 }).decision === "rejected");
}

// ── 7) MOBA 與 CS 共用同一套流程 ───────────────────────────────────────
{
  const m = queuedTicket("moba", mobaSeats);
  const c = queuedTicket("cs", csSeats);
  ck("7) CS 走同一套契約與狀態", c.schema === TICKET_VERSION && c.state === TICKET_STATES.queued && c.mode === "cs");
  ck("7b) 兩種模式的票券彼此獨立", m.ticketId !== c.ticketId);
  const csEntry = entryOf("cs", csSeats);
  const csNeed = waitSecondsFor(c);
  const csDone = pollGateway({ ticket: c, entryRequest: csEntry, players: PLAYERS, now: T0 + csNeed * 1000 });
  ck("7c) CS 也能配對成功並取得指派單",
    csDone.decision === "matched" && csDone.assignment.mode === "cs");
  ck("7d) CS 的指派單同樣拒絕夾帶結果",
    !validateAssignment({ ...csDone.assignment, winner: "us" }, c).ok);
}

console.log("\n── 流程摘要 ──────────────────────────────────────────────────");
{
  const q = queuedTicket();
  console.log(`   ${q.ticketId}｜模式 ${q.mode}｜隊伍版本 ${q.rosterVersion}`);
  console.log(`   狀態：${Object.values(TICKET_STATES).map(stateLabel).join(" → ")}`);
  console.log(`   mock 等待 ${waitSecondsFor(q)}s｜對手 ${opponentFor(q).name}｜種子 ${seedFor(q)}`);
}

console.log(`\n${pass}/${pass + fail} 通過`);
process.exit(fail === 0 ? 0 : 1);
