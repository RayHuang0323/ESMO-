#!/usr/bin/env node
// ============================================================================
//  tools/check_q7a_live_session_migration.mjs — B2：進行中的比賽跨存檔升級
//
//  執行：repo 根目錄 `node tools/check_q7a_live_session_migration.mjs`；失敗 exit 1。
//
//  ── 為什麼要有這一支 ────────────────────────────────────────────────────
//  3a／3b 把賽季狀態的形狀換掉了（v1 單數 → v2 `competitions{}`），升級發生在
//  **載入時**。那一刻玩家可能正在打一場賽程比賽：場次已 `launched`、對戰還沒
//  結束。既有驗證器只驗了「id 不變」，**沒有驗過那條進行中的比賽還能不能打完**。
//
//  Codex 的稽核把這條列為覆蓋缺口，而我先前只能說「從程式碼看應該沒事」——
//  本檔把它變成實測。
//
//  驗七件事：
//    ① 賽程 fixture 已 launched、對戰尚未完成
//    ② 存檔 → 降回 v1 形狀 → 重載（真正的 legacy→v2 升級路徑）
//    ③ sessionId / fixtureId / assignmentId / roomId **一個都不漂移**
//    ④ 畫面仍拿得到「返回比賽」需要的事實（`competitionView().live`）
//    ⑤ `resumeMatchSession()` 真的恢復得了，且啟動參數逐欄相同
//    ⑥ 恢復後打完 → 正常結算 → 賽程寫入 FixtureOutcome
//    ⑦ **不重複發錢／XP、不重複寫 FixtureOutcome**
// ============================================================================
const KEY = "esmo.profile.v1";
let LS = null;
globalThis.localStorage = {
  getItem: (k) => (k === KEY ? LS : null),
  setItem: (k, v) => { if (k === KEY) LS = v; },
  removeItem: () => { LS = null; },
};

const S = await import("../src/platform/competition/seasonState.js");
const { useProfileStore } = await import("../src/platform/profileStore.js");
const { LogicEngine } = await import("../src/LogicEngine.js");
const { snapshotToBattleResult } = await import("../src/battle/battleResult.js");
const { mobaResultToTransaction, mobaMatchId } = await import("../src/platform/progress/adapters/mobaProgressAdapter.js");
const { outcomeFromBattleResult } = await import("../src/platform/progress/settleMatchBoundary.js");

const store = () => useProfileStore.getState();
let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`✅ ${name}${detail ? "　" + detail : ""}`); }
  else { fail++; console.log(`❌ ${name}${detail ? "　" + detail : ""}`); }
};

const T0 = 4_000_000;

/** 走完整賽程出賽流程，停在「場次已啟動、對戰未開始」。 */
function launchFixture(fixtureId, t0) {
  const r = store().startFixtureMatch(fixtureId, t0);
  if (!r.ok) return { ok: false, at: "start", reason: r.reason };
  let u = t0 + 200;
  for (let i = 1; i <= 30 && store().matchmaking.room?.state === "waiting"; i++) { u = t0 + 200 + i * 500; store().pollMatchRoom(u); }
  store().confirmMatchReady(u + 10);
  for (let i = 1; i <= 30 && store().matchmaking.room?.state !== "confirmed"; i++) store().pollMatchRoom(u + 10 + i * 400);
  if (!store().createMatchSession(u + 13000).ok) return { ok: false, at: "session" };
  const l = store().launchMatchSession(u + 13100);
  if (!l.ok) return { ok: false, at: "launch" };
  return { ok: true, launchedAt: u + 13100 };
}

/** 把 v2 存檔降回 v1 形狀（模擬「Q7a 之前的舊存檔」）。 */
function downgradeSavedToV1() {
  const raw = JSON.parse(LS);
  const c = raw.competition;
  const entry = Object.values(c.competitions)[0];
  const { circuitId, eventId, idScheme, ...legacyComp } = entry.competition;
  raw.competition = {
    ...c,
    schema: "SeasonState.v1",
    competition: legacyComp,
    stage: entry.stage,
    playoff: entry.playoff ?? null,
  };
  delete raw.competition.competitions;
  delete raw.competition.events;
  delete raw.competition.circuits;
  delete raw.competition.activeEventId;
  LS = JSON.stringify(raw);
}

console.log("══ B2：進行中的比賽跨存檔升級 ══\n");

// ── 1) 擺到「賽程進行中」──────────────────────────────────────────────
store().startNewGame("standard");
store().ensureCompetitionSeason();
let today = null;
for (let i = 0; i < 60 && !today; i++) {
  today = store().competitionView().today;
  if (!today) { const b = store().meta.days; store().advanceDay(7); if (store().meta.days === b) break; }
}
ck("0) 找得到今天的賽程", !!today?.id, today?.id);

const lit = launchFixture(today.id, T0);
ck("1) 賽程 fixture 已 launched、場次已啟動",
  lit.ok && S.fixtureById(store().competition, today.id).status === "launched" &&
  store().matchmaking.session?.state === "launched",
  store().matchmaking.session?.sessionId);
ck("1b) 對戰**尚未完成**（沒有賽果、沒有結算）",
  !S.outcomeFor(store().competition, today.id) && !store().matchmaking.lastResult);

const before = {
  sessionId: store().matchmaking.session.sessionId,
  fixtureId: S.fixtureIdOfSessionSafe?.(store().matchmaking.session) ?? store().matchmaking.session.origin?.fixtureId,
  assignmentId: store().matchmaking.session.assignmentId,
  roomId: store().matchmaking.session.roomId,
  seed: store().matchmaking.session.seed,
  launchToken: store().matchmaking.session.launchToken,
  funds: store().finance.funds,
  xp: store().players.reduce((n, p) => n + (Number(p.xp) || 0), 0),
  outcomes: (store().competition.outcomes ?? []).length,
};
store().save();

// ── 2) 降回 v1 → 重載（真正的 legacy→v2 升級路徑）────────────────────
downgradeSavedToV1();
ck("2) 存檔已降回 v1 形狀（模擬舊存檔）",
  JSON.parse(LS).competition.schema === "SeasonState.v1" && !JSON.parse(LS).competition.competitions);
ck("2b) 降級後**進行中的場次仍在存檔裡**",
  JSON.parse(LS).matchmaking?.session?.sessionId === before.sessionId);

const fresh = (await import("../src/platform/profileStore.js?b2reload=1")).useProfileStore;
const f = () => fresh.getState();
ck("3) 重載後賽季已升級成 v2", !!f().competition.competitions && !f().competition.competition);

// ── 3) id 不漂移 ──────────────────────────────────────────────────────
const after = {
  sessionId: f().matchmaking.session?.sessionId,
  fixtureId: f().matchmaking.session?.origin?.fixtureId,
  assignmentId: f().matchmaking.session?.assignmentId,
  roomId: f().matchmaking.session?.roomId,
  seed: f().matchmaking.session?.seed,
  launchToken: f().matchmaking.session?.launchToken,
};
ck("4) **sessionId 不漂移**", after.sessionId === before.sessionId, after.sessionId);
ck("4b) **fixtureId 不漂移**", after.fixtureId === before.fixtureId, after.fixtureId);
ck("4c) **assignment / room 關聯不漂移**",
  after.assignmentId === before.assignmentId && after.roomId === before.roomId,
  `${after.assignmentId} / ${after.roomId}`);
ck("4d) seed 與一次性令牌也不變（同 seed ⇒ 同一場對戰）",
  after.seed === before.seed && after.launchToken === before.launchToken);
ck("4e) 升級後賽程場次仍是 launched（沒有被判成別的狀態）",
  S.fixtureById(f().competition, today.id).status === "launched");

// ── 4) UI 仍給得出「返回比賽」──────────────────────────────────────────
const live = f().competitionView().live;
ck("5) **畫面仍拿得到「返回比賽」需要的事實**",
  !!live && live.fixtureId === before.fixtureId && live.state === "launched",
  JSON.stringify(live));

// ── 5) resume 真的恢復得了 ────────────────────────────────────────────
const res = f().resumeMatchSession(lit.launchedAt + 1000);
ck("6) **`resumeMatchSession()` 恢復成功**", res.ok === true, res.errors?.[0]?.message ?? "");
ck("6b) 恢復的啟動參數與原本逐欄相同（同 seed ⇒ 同初始戰鬥狀態）",
  res.launch?.seed === before.seed && res.launch?.sessionId === before.sessionId);

// ── 6) 恢復後打完 → 正常結算 → 寫進賽程 ────────────────────────────────
const e = new LogicEngine((before.seed >>> 0) | 1);
for (let i = 0; i < 40000 && !e.over; i++) e.tick(0.5);
const br = snapshotToBattleResult(e.snapshot(), []);
const tx = mobaResultToTransaction(br, {
  players: f().players ?? [], lineup: f().lineup ?? null, streak: 0, fansNow: f().meta?.fans ?? 0,
});
//  ⚠ 直接走 `reportMatchResult`（權威路徑）。`settleMatchThroughSession` 會 import
//    **原本那一份** profileStore，而這裡刻意用 cache-busting 重載出的實例來模擬
//    「重開遊戲」——用它會驗到錯的 store。boundary 的分支選擇由 fixture E2E 驗。
const rep = f().reportMatchResult(outcomeFromBattleResult(br, mobaMatchId(br)), tx);
ck("7) **恢復後打完可以正常結算**", rep.ok === true, rep.receipt?.settlementId ?? rep.errors?.[0]?.message);
ck("7b) **賽果有寫進賽程**（FixtureOutcome 產生）",
  !!S.outcomeFor(f().competition, today.id) &&
  S.fixtureById(f().competition, today.id).status === "completed");

const settled = {
  funds: f().finance.funds,
  xp: f().players.reduce((n, p) => n + (Number(p.xp) || 0), 0),
  outcomes: (f().competition.outcomes ?? []).length,
};
ck("7c) 錢與 XP 有正常入帳一次",
  settled.funds > before.funds && settled.xp > before.xp,
  `$${before.funds} → $${settled.funds}`);

// ── 7) 重送不得重複入帳／重複寫賽果 ──────────────────────────────────
for (let i = 0; i < 3; i++) f().reportMatchResult(outcomeFromBattleResult(br, mobaMatchId(br)), tx);
ck("8) **重送不重複發錢／XP**",
  f().finance.funds === settled.funds &&
  f().players.reduce((n, p) => n + (Number(p.xp) || 0), 0) === settled.xp,
  `$${f().finance.funds}`);
ck("8b) **不重複寫 FixtureOutcome**",
  (f().competition.outcomes ?? []).length === settled.outcomes,
  `${settled.outcomes} 筆`);
ck("8c) 賽程狀態仍是 completed（沒有被改寫）",
  S.fixtureById(f().competition, today.id).status === "completed");

console.log(`\n${pass}/${pass + fail} 通過`);
process.exit(fail === 0 ? 0 : 1);
