#!/usr/bin/env node
// ============================================================================
//  tools/check_q7a_safety.mjs — Q7a 的兩個安全前提
//
//  執行：repo 根目錄 `node tools/check_q7a_safety.mjs`；**失敗時 exit 1**。
//
//  ── 這兩件事為什麼是「前提」而不是功能 ──────────────────────────────────
//  Q7a 的產品規則：Season → Circuit → Event → Competition/Stage → Fixture，
//  **同季多個賽事可以並存、同一天也可以有多場玩家賽事**，但玩家隊伍同一時間
//  只能有一個進行中的 battle session。
//
//  現行主幹在這兩點上會出事，而且是在 Q7a 真的排出重疊賽程之後才會爆：
//
//    ① `startFixtureMatch` 以前只擋「同一個 fixture 且已 launched」。另一場還是
//       `scheduled` 的賽程可以直接開下去，而它會把 `matchmaking.session` 設成
//       null ⇒ **前一場進行中的場次無聲消失**，賽果之後只走 S25 路徑、不寫進
//       賽程，那場 fixture 永遠停在 `launched`。
//
//    ② `pendingPlayerFixtureOn` 只回第一場。一天兩場時第二場在畫面上看不見，
//       但推進日曆又被它擋住 ⇒ 玩家卡在「走不出今天、也不知道還要打什麼」。
//
//  兩者都與 Circuit / Event 的資料形狀無關，所以先做，不必等 Q7a 定案。
// ============================================================================

//  profileStore 會在 import 時讀 localStorage ⇒ 必須在 import 之前備好
const KEY = "esmo.profile.v1";
let LS = null;
globalThis.localStorage = {
  getItem: (k) => (k === KEY ? LS : null),
  setItem: (k, v) => { if (k === KEY) LS = v; },
  removeItem: () => { LS = null; },
};

const {
  createSeasonState, advanceSeasonDays, applyLaunch, applyForfeit,
  pendingPlayerFixtureOn, pendingPlayerFixturesOn, isPlayerFixture, fixtureById,
} = await import("../src/platform/competition/seasonState.js");
const { SESSION_STATES } = await import("../src/platform/contracts/matchSession.js");
const { useProfileStore } = await import("../src/platform/profileStore.js");

const store = () => useProfileStore.getState();
let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`✅ ${name}${detail ? "　" + detail : ""}`); }
  else { fail++; console.log(`❌ ${name}${detail ? "　" + detail : ""}`); }
};

/** 把賽程場次一路推到「已啟動的 battle session」。走的全是既有 action。 */
function launchFixture(fixtureId, t0) {
  const r = store().startFixtureMatch(fixtureId, t0);
  if (!r.ok) return { ok: false, at: "start", reason: r.reason };
  let u = t0 + 200;
  for (let i = 1; i <= 30 && store().matchmaking.room?.state === "waiting"; i++) {
    u = t0 + 200 + i * 500; store().pollMatchRoom(u);
  }
  store().confirmMatchReady(u + 10);
  for (let i = 1; i <= 30 && store().matchmaking.room?.state !== "confirmed"; i++) store().pollMatchRoom(u + 10 + i * 400);
  if (store().matchmaking.room?.state !== "confirmed") return { ok: false, at: "confirm" };
  if (!store().createMatchSession(u + 13000).ok) return { ok: false, at: "session" };
  if (!store().launchMatchSession(u + 13100).ok) return { ok: false, at: "launch" };
  return { ok: true, sessionId: store().matchmaking.session.sessionId, state: store().matchmaking.session.state };
}

/** 推進到玩家的下一個賽事日（advanceDay 會自己停在那一天）。 */
function advanceToPlayerFixtureDay() {
  for (let i = 0; i < 60; i++) {
    const v = store().competitionView();
    if (v.today) return v.today;
    const before = store().meta.days;
    store().advanceDay(7);
    if (store().meta.days === before) return null;
  }
  return null;
}

console.log("══ Q7a 安全前提：單一進行中場次 ＋ 同日多場可見 ══\n");

// ── 1) 一次只能有一場進行中的對戰 ──────────────────────────────────────
{
  store().startNewGame("standard");
  store().ensureCompetitionSeason();
  const fxA = advanceToPlayerFixtureDay();
  ck("1) 找得到玩家賽程 A", !!fxA?.id, fxA?.id);

  const T0 = 4_000_000;
  const A = launchFixture(fxA.id, T0);
  ck("1b) 賽程 A 啟動成 launched session", A.ok && A.state === SESSION_STATES.launched,
    A.ok ? A.sessionId : JSON.stringify(A));

  //  另一場**還沒開打**的玩家賽程（scheduled）
  const later = store().competition.fixtures.find(
    (f) => f.id !== fxA.id && isPlayerFixture(store().competition, f) && f.status === "scheduled");
  ck("1c) 另有一場 scheduled 的玩家賽程可用來測", !!later?.id, later?.id);

  const blocked = store().startFixtureMatch(later.id, T0 + 60_000);
  ck("1d) **有進行中場次時，開另一場賽程必須被擋**",
    blocked.ok === false && blocked.errors?.some((e) => e.code === "other_live_session"),
    blocked.reason);
  ck("1e) **A 的場次沒有被清掉**（這正是以前會無聲消失的地方）",
    store().matchmaking.session?.sessionId === A.sessionId &&
    store().matchmaking.session?.state === SESSION_STATES.launched);
  ck("1f) 被擋時也沒有動到那場賽程的狀態",
    fixtureById(store().competition, later.id).status === "scheduled");

  //  同一場重複進場 ⇒ 沿用既有訊息（行為不變）
  const same = store().startFixtureMatch(fxA.id, T0 + 61_000);
  ck("1g) 同一場重複進場 → 仍是 live_session（既有行為不變）",
    same.ok === false && same.errors?.some((e) => e.code === "live_session"), same.reason);

  //  放棄之後才能開下一場
  store().abandonMatchSession("測試：放棄本場", T0 + 62_000);
  const after = store().startFixtureMatch(later.id, T0 + 63_000);
  ck("1h) 放棄那一場之後就開得了下一場", after.ok === true, after.reason ?? "ok");
}

// ── 2) 逾期的判定要分狀態 ──────────────────────────────────────────────
{
  store().startNewGame("standard");
  store().ensureCompetitionSeason();
  const fx = advanceToPlayerFixtureDay();
  const mk = (state, expiresAt) => useProfileStore.setState({
    matchmaking: {
      ...(store().matchmaking ?? {}),
      session: {
        schema: "MatchSession.v1", sessionId: "s:test", mode: "moba", state,
        origin: { kind: "fixture", fixtureId: "fx:other" }, expiresAt, opponent: { name: "測試隊" },
      },
    },
  });

  mk(SESSION_STATES.created, 1);      // created 且早已逾期 ⇒ 入場券作廢，不該卡人
  const a = store().startFixtureMatch(fx.id, 9_000_000);
  ck("2) `created` 且已逾期的場次**不擋**（作廢的入場券不該卡住玩家）",
    a.ok === true, a.reason ?? "ok");

  store().startNewGame("standard");
  store().ensureCompetitionSeason();
  const fx2 = advanceToPlayerFixtureDay();
  mk(SESSION_STATES.launched, 1);     // launched 但 TTL 過了 ⇒ 仍然在打，必須擋
  const b = store().startFixtureMatch(fx2.id, 9_000_000);
  ck("2b) `launched` 即使逾期**仍然擋**（打久一點不該能繞過去）",
    b.ok === false && b.errors?.some((e) => e.code === "other_live_session"), b.reason);
}

// ── 3) 同一天多場玩家賽事 ──────────────────────────────────────────────
{
  const team = { id: "team:aaaaaaaa", name: "白貓戰隊", tag: "GSEAL" };
  const made = createSeasonState({ playerTeam: team, season: 1, seasonSeed: 12345 });
  ck("3) 建得出賽季", made.ok && made.state.fixtures.length > 0, `${made.state.fixtures.length} 場`);

  //  把另一場玩家賽事搬到同一天 ⇒ 製造「一天兩場」
  const first = made.state.fixtures.find((f) => isPlayerFixture(made.state, f));
  const second = made.state.fixtures.find((f) => isPlayerFixture(made.state, f) && f.id !== first.id);
  const day = first.day;
  const state = { ...made.state, fixtures: made.state.fixtures.map((f) => (f.id === second.id ? { ...f, day } : f)) };

  const list = pendingPlayerFixturesOn(state, day);
  ck("3b) **同一天兩場都列得出來**", list.length === 2, list.map((f) => f.id).join(" / "));
  ck("3c) `pendingPlayerFixtureOn` 仍只回第一場（既有語意不變）",
    pendingPlayerFixtureOn(state, day)?.id === list[0].id);

  //  第一場收尾 ⇒ 還剩一場，日曆仍然走不出去
  const f1 = applyForfeit(applyLaunch(state, first.id).state, { fixtureId: first.id, reason: "測試" });
  ck("3d) 第一場收尾後，清單剩一場",
    pendingPlayerFixturesOn(f1.state, day).length === 1);
  const stuck = advanceSeasonDays({ state: f1.state, fromDay: day, days: 3, playerRoster: [] });
  ck("3e) **當天還有沒收尾的場次 ⇒ 日曆仍然走不出去**",
    stuck.stoppedBy?.code === "player_fixture" && stuck.daysAdvanced === 0,
    JSON.stringify(stuck.stoppedBy));

  //  兩場都收尾 ⇒ 走得出去
  const f2 = applyForfeit(applyLaunch(f1.state, second.id).state, { fixtureId: second.id, reason: "測試" });
  ck("3f) 兩場都收尾後，清單清空",
    pendingPlayerFixturesOn(f2.state, day).length === 0);
  const moved = advanceSeasonDays({ state: f2.state, fromDay: day, days: 1, playerRoster: [] });
  ck("3g) **兩場都收尾之後日曆才走得出去**", moved.daysAdvanced === 1 && !moved.stoppedBy,
    `前進 ${moved.daysAdvanced} 天`);
}

// ── 4) competitionView 有把整份清單給畫面 ──────────────────────────────
{
  store().startNewGame("standard");
  store().ensureCompetitionSeason();
  advanceToPlayerFixtureDay();
  const v = store().competitionView();
  ck("4) `competitionView().todayPending` 是陣列且含今天那一場",
    Array.isArray(v.todayPending) && v.todayPending.length >= 1 &&
    v.todayPending[0].id === v.today.id,
    `${v.todayPending.length} 場`);
}

console.log(`\n${pass}/${pass + fail} 通過`);
process.exit(fail === 0 ? 0 : 1);
