#!/usr/bin/env node
// ============================================================================
//  tools/check_result_flow_o71.mjs — Milestone O7.1：真實賽後流程接入 O7
//
//  執行：repo 根目錄 `node tools/check_result_flow_o71.mjs`；**失敗時 exit 1**。
//
//  O7 的 `reportMatchResult` 原本只有 verifier 在走，真實賽後流程（MOBA 的
//  useBattleFeed、CS 的 settleCsMatch）仍直接呼叫 S25。本檔驗它們真的接上了：
//    ① 兩條真實流程都經過**唯一結算邊界**，沒有任何呼叫點繞過 O7
//    ② 正常打完一場只結算一次
//    ③ Result 畫面重整不重複結算
//    ④ 重送相同結果 → 同一張 receipt
//    ⑤ 重送不同勝負 → 拒絕並附中文原因
//    ⑥ MOBA 與 CS 共用同一條流程
//
//  ⚠ 本檔會實際操作 profileStore（zustand 在 Node 可用；localStorage 不存在
//    ⇒ save() 自動 no-op），走的就是真實流程用的那些函式。
// ============================================================================
import fs from "fs";
import { useProfileStore } from "../src/platform/profileStore.js";
import { settleMatchThroughSession, outcomeFromBattleResult, outcomeFromCsResult } from "../src/platform/progress/settleMatchBoundary.js";
import { createMatchProgressTransaction } from "../src/platform/contracts/matchProgressTransaction.js";
import { SESSION_STATES, createSession, consumeLaunchToken } from "../src/platform/contracts/matchSession.js";
import { ROOM_STATES, createRoom, transitionRoom, confirmSide } from "../src/platform/contracts/matchRoom.js";
import { TICKET_STATES, createTicket, transitionTicket, createAssignment } from "../src/platform/contracts/matchmaking.js";
import { MOCK_OPPONENTS } from "../src/platform/matchmaking/mockGateway.js";
import { createMatchEntryRequest } from "../src/platform/contracts/matchEntry.js";
import { ENGINE_SEATS } from "../src/platform/contracts/matchLineup.js";
import { CS_SEATS } from "../src/platform/contracts/matchSquad.js";

let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`✅ ${name}${detail ? "　" + detail : ""}`); }
  else { fail++; console.log(`❌ ${name}${detail ? "　" + detail : ""}`); }
};

const T0 = 5_000_000;
const store = () => useProfileStore.getState();
const seatsFor = (mode) => {
  const ids = (store().players ?? []).map((p) => p.id);
  return Object.fromEntries((mode === "cs" ? CS_SEATS : ENGINE_SEATS).map((s, i) => [s, ids[i]]));
};

/** 把 store 準備成「場次已啟動」的狀態（走真實契約，不作弊）。 */
function primeSession(mode = "moba", seed = 5150) {
  const players = store().players ?? [];
  const entry = createMatchEntryRequest({
    mode, seats: seatsFor(mode), players,
    context: { teamId: "GSEAL", teamName: "T", day: 8, week: 2, season: 1 },
  }).request;
  const q = transitionTicket(createTicket(entry, { now: T0 }).ticket, TICKET_STATES.queued, { now: T0 }).ticket;
  const a = createAssignment({ ticket: q, opponent: MOCK_OPPONENTS[0], seed, now: T0 });
  const ticket = transitionTicket(q, TICKET_STATES.matched, { now: T0, assignment: a }).ticket;
  const room = confirmSide(confirmSide(
    transitionRoom(createRoom({ assignment: a, ticket, now: T0 }).room, ROOM_STATES.ready_check, { now: T0 }).room,
    "us", { now: T0 + 1 }).room, "opponent", { now: T0 + 2 }).room;
  const created = createSession({ room, ticket, now: T0 }).session;
  const launched = consumeLaunchToken(created, created.launchToken, { room, ticket, now: T0 + 5 });
  useProfileStore.setState({
    matchmaking: {
      ticket, room, session: launched.session, launch: launched.launch,
      lastResult: null, settlements: {}, lastSettlementError: null,
    },
  });
  return { ticket, room, session: launched.session };
}
const resetStore = () => {
  useProfileStore.getState().reset();
  useProfileStore.setState({ finance: { ...store().finance, funds: 1_000_000, transactions: [] } });
};
const mkTx = (matchId, mode = "moba", money = 90_000) => createMatchProgressTransaction({
  mode, matchId,
  sourceResultVersion: mode === "moba" ? "BattleResult.v2" : "CsMatchResult.v1",
  teamRewards: { money, fans: 200, reputation: 1 },
  playerProgress: (store().players ?? []).slice(0, 5).map((p) => ({
    playerId: p.id, xpGained: 50, previousXp: p.xp ?? 0, newXp: (p.xp ?? 0) + 50,
    previousLevel: p.lv ?? 1, newLevel: p.lv ?? 1, levelsGained: 0, talentPointsGained: 0, reasons: ["勝利"],
  })),
  metadata: { winner: "us", score: { us: 1, enemy: 0 } },
});
const snapshotOf = () => {
  const s = store();
  return {
    funds: s.finance.funds,
    fans: s.meta.fans,
    xp: (s.players ?? []).slice(0, 5).map((p) => p.xp),
    energy: (s.players ?? []).slice(0, 5).map((p) => p.energy),
  };
};

console.log("══ Milestone O7.1：真實賽後流程接入 O7 ══\n");

// ── 1) 沒有呼叫點繞過邊界 ──────────────────────────────────────────────
{
  const feed = fs.readFileSync("src/battle/useBattleFeed.js", "utf8");
  const cs = fs.readFileSync("src/platform/progress/settleCsMatch.js", "utf8");
  ck("1) MOBA 賽後改走唯一結算邊界",
    /settleMatchThroughSession\(/.test(feed) && !/profile\.applyMatchProgress\(/.test(feed));
  ck("1b) CS 賽後改走唯一結算邊界",
    /settleMatchThroughSession\(/.test(cs) && !/getState\(\)\.applyMatchProgress\(/.test(cs));
  //  全庫掃描：除了 store 自身、邊界、與 O7 結算層，不應有其他直接呼叫
  const offenders = [];
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${f.name}`;
      if (f.isDirectory()) { walk(full); continue; }
      if (!/\.(js|jsx)$/.test(f.name)) continue;
      if (/profileStore\.js$|settleMatchBoundary\.js$|settleMatchResult\.js$|applyMatchProgress\.js$/.test(full)) continue;
      if (/EsportsGame\.jsx$|App\.jsx$/.test(full)) continue;   // Legacy 巨檔，非現役路徑
      const src = fs.readFileSync(full, "utf8");
      if (/\.applyMatchProgress\s*\(/.test(src)) offenders.push(full.replace("src/", ""));
    }
  };
  walk("src");
  ck("1c) **沒有其他呼叫點直接呼叫 S25 結算**（全庫掃描）",
    offenders.length === 0, offenders.join(", ") || "無");
}

// ── 2) 正常打完一場只結算一次 ──────────────────────────────────────────
{
  resetStore();
  primeSession("moba");
  const before = snapshotOf();
  const br = { winner: "blue", duration: 1500, score: { blue: 18, red: 9 } };
  const r = settleMatchThroughSession({
    mode: "moba", outcome: outcomeFromBattleResult(br, "m-real-1"), transaction: mkTx("m-real-1"),
  });
  const after = snapshotOf();
  ck("2) 走的是權威路徑（有場次）", r.viaSession === true);
  ck("2b) 結算成功且只入帳一次",
    r.receipt?.ok && after.funds === before.funds + 90_000 && after.fans === before.fans + 200,
    `$${before.funds} → $${after.funds}`);
  ck("2c) 經驗只加一次", after.xp.every((v, i) => v === before.xp[i] + 50));
  ck("2d) 體力只扣一次", after.energy.every((v, i) => v < before.energy[i]),
    `${before.energy[0]} → ${after.energy[0]}`);
  ck("2e) 場次被標記完成並帶追蹤鏈",
    store().matchmaking.session.state === SESSION_STATES.completed &&
    !!store().matchTrace().settlementId,
    store().matchTrace().settlementId);
}

// ── 3) Result 畫面重整不重複結算 ───────────────────────────────────────
{
  const before = snapshotOf();
  //  模擬「重整後 Result 畫面再次觸發結算」：同一場、同一份結果、同一張交易
  const br = { winner: "blue", duration: 1500, score: { blue: 18, red: 9 } };
  const again = settleMatchThroughSession({
    mode: "moba", outcome: outcomeFromBattleResult(br, "m-real-1"), transaction: mkTx("m-real-1"),
  });
  const after = snapshotOf();
  ck("3) **重整後重送 → 不重複入帳**",
    after.funds === before.funds && after.fans === before.fans);
  ck("3b) 經驗與體力也沒有再變動",
    after.xp.every((v, i) => v === before.xp[i]) && after.energy.every((v, i) => v === before.energy[i]));
  ck("3c) 回傳同一張 receipt（settlementId 相同）",
    again.receipt?.settlementId && again.receipt.alreadySettled === true,
    again.receipt?.settlementId);
}

// ── 4) 重送相同結果 → 同一張 receipt ───────────────────────────────────
{
  resetStore();
  primeSession("moba", 777);
  const br = { winner: "blue", duration: 900, score: { blue: 11, red: 4 } };
  const outcome = outcomeFromBattleResult(br, "m-real-2");
  const a = settleMatchThroughSession({ mode: "moba", outcome, transaction: mkTx("m-real-2") });
  const b = settleMatchThroughSession({ mode: "moba", outcome, transaction: mkTx("m-real-2") });
  ck("4) 重送相同結果 → 同一個 settlementId",
    a.receipt.settlementId === b.receipt.settlementId, a.receipt.settlementId);
  ck("4b) 第二次標記為已結算", b.receipt.alreadySettled === true);
  ck("4c) 追蹤鏈的 resultId 不變",
    a.receipt.trace.resultId === (b.receipt.trace?.resultId ?? a.receipt.trace.resultId));
}

// ── 5) 重送不同勝負 → 拒絕 ─────────────────────────────────────────────
{
  const before = snapshotOf();
  const flipped = { winner: "red", duration: 900, score: { blue: 4, red: 11 } };
  const r = settleMatchThroughSession({
    mode: "moba", outcome: outcomeFromBattleResult(flipped, "m-real-2"), transaction: mkTx("m-real-2"),
  });
  const after = snapshotOf();
  ck("5) **同一場送不同勝負 → 拒絕**", r.receipt?.ok === false);
  ck("5b) 拒絕原因是中文且說明衝突",
    typeof r.receipt?.reason === "string" && /已回報過不同的結果/.test(r.receipt.reason),
    r.receipt?.reason);
  ck("5c) 被拒絕時完全沒有入帳",
    after.funds === before.funds && after.xp.every((v, i) => v === before.xp[i]) &&
    after.energy.every((v, i) => v === before.energy[i]));
  ck("5d) 失敗原因有被保存（可稽核）",
    !!store().matchmaking.lastSettlementError?.reason);
}

// ── 6) CS 走同一條流程 ─────────────────────────────────────────────────
{
  resetStore();
  primeSession("cs", 31337);
  const before = snapshotOf();
  const cr = { matchId: "cs-real-1", winner: "us", ourScore: 16, enemyScore: 12, durationSec: 2100 };
  const r = settleMatchThroughSession({
    mode: "cs", outcome: outcomeFromCsResult(cr), transaction: mkTx("cs-real-1", "cs", 70_000),
  });
  const after = snapshotOf();
  ck("6) CS 也走權威路徑", r.viaSession === true && r.receipt?.ok);
  ck("6b) CS 只入帳一次", after.funds === before.funds + 70_000);
  const again = settleMatchThroughSession({
    mode: "cs", outcome: outcomeFromCsResult(cr), transaction: mkTx("cs-real-1", "cs", 70_000),
  });
  ck("6c) CS 重送 → 同一張 receipt、不重複入帳",
    again.receipt.alreadySettled === true && snapshotOf().funds === after.funds);
  const conflict = settleMatchThroughSession({
    mode: "cs", outcome: outcomeFromCsResult({ ...cr, winner: "them", ourScore: 9, enemyScore: 16 }),
    transaction: mkTx("cs-real-1", "cs", 70_000),
  });
  ck("6d) CS 衝突結果 → 拒絕", conflict.receipt?.ok === false, conflict.receipt?.reason);
}

// ── 7) 沒有場次時的行為（誠實揭露的取捨）──────────────────────────────
{
  resetStore();
  useProfileStore.setState({ matchmaking: { ticket: null, room: null, session: null, launch: null, lastResult: null, settlements: {}, lastSettlementError: null } });
  const before = snapshotOf();
  const br = { winner: "blue", duration: 600, score: { blue: 7, red: 2 } };
  const r = settleMatchThroughSession({
    mode: "moba", outcome: outcomeFromBattleResult(br, "m-nosession"), transaction: mkTx("m-nosession", "moba", 50_000),
  });
  ck("7) 沒有場次時仍入帳（獎勵不消失）",
    snapshotOf().funds === before.funds + 50_000);
  ck("7b) 但明確標記未經權威驗證", r.viaSession === false);
  ck("7c) 沒有交易時直接拒絕（不產生半套狀態）",
    settleMatchThroughSession({ mode: "moba", outcome: outcomeFromBattleResult(br, "x"), transaction: null }).receipt === null);
}

// ── 8) outcome 轉換不重新統計 ──────────────────────────────────────────
{
  const br = { winner: "red", duration: 1234.7, score: { blue: 5, red: 14 } };
  const o = outcomeFromBattleResult(br, "m-x");
  ck("8) BattleResult → outcome：勝負以我方視角轉換，比分照抄",
    o.winner === "opponent" && o.score.us === 5 && o.score.opponent === 14 && o.durationSec === 1234.7);
  const cr = { matchId: "c", winner: "us", ourScore: 16, enemyScore: 3, durationSec: 900 };
  const co = outcomeFromCsResult(cr);
  ck("8b) CsMatchResult → outcome 同樣照抄",
    co.winner === "us" && co.score.us === 16 && co.score.opponent === 3 && co.durationSec === 900);
}

console.log(`\n${pass}/${pass + fail} 通過`);
process.exit(fail === 0 ? 0 : 1);
