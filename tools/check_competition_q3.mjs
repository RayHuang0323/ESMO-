#!/usr/bin/env node
// ============================================================================
//  tools/check_competition_q3.mjs — Milestone Q3：出賽 / 日曆 / 棄權
//
//  執行：repo 根目錄 `node tools/check_competition_q3.mjs`；**失敗時 exit 1**。
//
//  Q3 的五件事：
//    ① 棄權產生正式 FixtureOutcome（`forfeited`），不偽造任何 Combat 資料
//    ② competitionGateway：Fixture → Assignment → 既有 Room/Session/Launch
//    ③ advanceDay 遇玩家賽事日停下（規格 D15）
//    ④ Fixture 狀態機：launched 不得回到 scheduled
//    ⑤ 不建立第二條比賽流程
//
//  最關鍵的四組：
//    §1j  **棄權不進 Combat Analytics**（沒發生過的比賽不得汙染場均數據）
//    §3b  **走得進比賽日，但走不出去**——且刻意不自動判棄權
//    §5b  **沒有賽季時 advanceDay 行為與 Q3 之前逐值相同**（既有存檔零影響）
//    §6d  賽程路徑用的是 contracts 的 createRoom/createSession，不是自己的房間
// ============================================================================
import fs from "node:fs";

//  ⚠ 制度教訓（第十一次，Q2b 記錄）：掃原始碼前先剝註解，否則會掃到說明文字
//    本身而假紅。工具放模組層級全檔共用，各節不得自己寫掃描。
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const readCode = (p) => stripComments(fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8"));

//  profileStore 會在 import 時讀 localStorage ⇒ 必須在 import 之前備好
const KEY = "esmo.profile.v1";
let LS = null;
globalThis.localStorage = {
  getItem: (k) => (k === KEY ? LS : null),
  setItem: (k, v) => { if (k === KEY) LS = v; },
  removeItem: () => { LS = null; },
};

const {
  RESULT_SOURCES, resultSourceLabel, FORFEIT_SCORE,
  createFixtureOutcome, createForfeitOutcome, validateFixtureOutcome,
  competitionOutcomes, combatOutcomes, isForfeitOutcome, loserOf,
} = await import("../src/platform/contracts/fixtureOutcome.js");
const {
  computeStandings, standingOf, outcomeSourceMix,
} = await import("../src/platform/competition/standings.js");
const {
  createSeasonState, advanceSeasonDays, applyLaunch, applyCompleted, applyForfeit,
  sweepOverdue, fixtureById, nextPlayerFixture, pendingPlayerFixtureOn,
  isPlayerFixture, simulateAiFixturesOn, seasonStandings,
} = await import("../src/platform/competition/seasonState.js");
const {
  issueFor, seedForFixture, openRoomForFixture, openSessionForFixture,
  isCompetitionAssignment, fixtureIdOfAssignment, COMPETITION_SERVER,
} = await import("../src/platform/competition/competitionGateway.js");
const { validateAssignment } = await import("../src/platform/contracts/matchmaking.js");
const { FIXTURE_STATES, transitionFixture } = await import("../src/platform/contracts/competition.js");
const { deriveTeamId, deriveSeasonSeed } = await import("../src/platform/identity/teamIdentity.js");
const { STAT_DEF } = await import("../src/data/playerModel.js");
const { useProfileStore } = await import("../src/platform/profileStore.js");

let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`✅ ${name}${detail ? "　" + detail : ""}`); }
  else { fail++; console.log(`❌ ${name}${detail ? "　" + detail : ""}`); }
};

// ── 共用賽季（真實資料，不另造假的）────────────────────────────────────
const TEAM = {
  id: deriveTeamId({ name: "白貓戰隊", tag: "GSEAL", scenario: "standard", createdDay: 1 }),
  name: "白貓戰隊", tag: "GSEAL", emoji: "🐱",
};
const SEED = deriveSeasonSeed({ teamId: TEAM.id, scenario: "standard" });
const mkSeason = () => createSeasonState({ playerTeam: TEAM, season: 1, seasonSeed: SEED }).state;
const S0 = mkSeason();
const MY_FIXTURE = nextPlayerFixture(S0, 1);
const AI_FIXTURE = S0.fixtures.find((f) => !isPlayerFixture(S0, f));

const statsAll = (v) => Object.fromEntries(STAT_DEF.map((s) => [s.key, v]));
const ROSTER = ["上路", "打野", "中路", "下路", "輔助"].map((role, i) => ({
  id: `me-p${i + 1}`, name: `ME-${role}`, role, personality: "steady",
  morale: 80, condition: "正常", stats: statsAll(74),
}));

// ── §1 棄權契約 ─────────────────────────────────────────────────────────
{
  console.log("\n── §1 棄權賽果 ──");
  ck("1a) 來源多了 forfeited，中文名齊全",
    RESULT_SOURCES.forfeited === "forfeited" && resultSourceLabel("forfeited") === "棄權判負");

  const ff = createForfeitOutcome({ fixture: MY_FIXTURE, loser: TEAM.id, reason: "玩家棄權" });
  ck("1b) 棄權可建立，勝方是對手（不是雙方都輸）",
    ff.ok && ff.outcome.winner !== TEAM.id && loserOf(ff.outcome) === TEAM.id, ff.outcome?.winner);
  ck("1c) 比分 0:0、時長 0、種子 0、原因有記",
    ff.outcome.score.a === 0 && ff.outcome.score.b === 0 &&
    ff.outcome.duration === 0 && ff.outcome.seed === 0 && ff.outcome.reason === "玩家棄權");
  ck("1c2) FORFEIT_SCORE 是唯一定義且凍結",
    FORFEIT_SCORE.a === 0 && FORFEIT_SCORE.b === 0 && Object.isFrozen(FORFEIT_SCORE));

  const bad = (p) => !createFixtureOutcome({
    fixture: MY_FIXTURE, resultSource: "forfeited", winner: MY_FIXTURE.sideB,
    score: { a: 0, b: 0 }, duration: 0, seed: 0, ...p,
  }).ok;
  ck("1d) **拒絕偽造比分**", bad({ score: { a: 16, b: 0 } }));
  ck("1e) **拒絕偽造時長**", bad({ duration: 1800 }));
  ck("1f) **拒絕非零種子**（棄權沒有亂數過程）", bad({ seed: 7 }));
  ck("1g) 拒絕關鍵事件摘要", bad({ highlights: ["一面倒"] }));
  ck("1h) 拒絕標記模擬器版本", bad({ simulatorVersion: "x" }));
  ck("1i) 只有棄權可以帶 reason", !createFixtureOutcome({
    fixture: MY_FIXTURE, resultSource: "engine", winner: MY_FIXTURE.sideA,
    score: { a: 1, b: 0 }, duration: 60, seed: 1, reason: "亂填",
  }).ok);
  ck("1j) 棄權方必須是對戰雙方之一",
    !createForfeitOutcome({ fixture: MY_FIXTURE, loser: "team:deadbeef" }).ok);
  ck("1k) 驗證面也擋得住被竄改的棄權賽果", (() => {
    const tampered = { ...ff.outcome, score: { a: 16, b: 0 } };
    return !validateFixtureOutcome(tampered).ok;
  })());

  console.log("── §1 兩類 Analytics 的分界 ──");
  const eng = createFixtureOutcome({
    fixture: AI_FIXTURE, resultSource: "engine", winner: AI_FIXTURE.sideA,
    score: { a: 20, b: 11 }, duration: 1500, seed: 3,
  }).outcome;
  const mixed = [ff.outcome, eng];
  ck("1l) 判別函式正確", isForfeitOutcome(ff.outcome) && !isForfeitOutcome(eng));
  ck("1m) **Competition Analytics 收棄權**（棄權是正式敗場）",
    competitionOutcomes(mixed).length === 2);
  ck("1n) **Combat/Balance Analytics 排除棄權**（沒發生的比賽不得進場均數據）",
    combatOutcomes(mixed).length === 1 && combatOutcomes(mixed)[0].resultSource === "engine");
  ck("1o) 來源分佈把棄權與模擬分開數（不是塞進 else）", (() => {
    const mix = outcomeSourceMix(mixed);
    return mix.forfeited === 1 && mix.simulated === 0 && mix.engine === 1 && mix.total === 2;
  })());

  console.log("── §1 Standings 計入棄權 ──");
  const st = computeStandings({ outcomes: [ff.outcome], participants: S0.stage.participants });
  const me = standingOf(st, TEAM.id);
  const opp = standingOf(st, ff.outcome.winner);
  ck("1p) **棄權方記一敗**", me.losses === 1 && me.wins === 0 && me.played === 1);
  ck("1q) **對手記一勝 3 分**", opp.wins === 1 && opp.points === 3);
  ck("1r) 棄權對淨勝分零貢獻（勝方拿分不拿分差）",
    opp.scoreFor === 0 && opp.scoreDiff === 0 && me.scoreDiff === 0);
  ck("1s) 積分榜把棄權分開列",
    me.forfeitedGames === 1 && me.engineGames === 0 && me.simulatedGames === 0);
  ck("1t) **MVP 不追加懲罰**：賽果沒有聲望／罰款／降級欄位", (() => {
    const keys = Object.keys(ff.outcome);
    return !keys.some((k) => /reputation|fine|penalt|relegat|funds|money|award/i.test(k));
  })());
}

// ── §2 competitionGateway ───────────────────────────────────────────────
{
  console.log("\n── §2 賽程出賽閘道 ──");
  const entry = {
    schema: "MatchEntryRequest.v1", transactionId: "entry:moba:test", mode: "moba",
    rosterVersion: "abc12345", teamId: TEAM.id,
  };
  //  用真的驗證器會要求完整名單；這裡改用 store 產生的申請單（見 §5）。
  //  §2 只驗閘道自己的規則，所以用一個「驗得過」的最小替身：
  const okEntry = { ...entry };
  const issue = (over = {}) => issueFor({
    fixture: MY_FIXTURE, entryRequest: okEntry, playerTeamId: TEAM.id,
    players: [], participants: S0.stage.participants, now: 1000, ...over,
  });

  const r = issue();
  //  entryRequest 是替身 ⇒ validateMatchEntryRequest 可能不過；分兩種情況都要能說清楚
  if (!r.ok) {
    ck("2a) 閘道對不合格申請單會拒絕並給中文理由", typeof r.reason === "string" && r.reason.length > 0, r.reason);
  }
  //  取一張真的申請單來測成功路徑（來自 store）
  useProfileStore.getState().startNewGame("standard");
  const store = () => useProfileStore.getState();
  const realTeamId = store().team.id;
  const realSeason = createSeasonState({
    playerTeam: store().team, season: 1, seasonSeed: store().meta.seasonSeed,
  }).state;
  const realFixture = nextPlayerFixture(realSeason, 1);
  const realEntry = store().matchEntry("moba").request;
  const good = issueFor({
    fixture: realFixture, entryRequest: realEntry, playerTeamId: realTeamId,
    players: store().players, participants: realSeason.stage.participants, now: 1000,
  });
  ck("2b) 合格申請單可簽發指派單", good.ok, good.reason ?? "");
  ck("2c) 來源是賽程（kind = fixture）",
    good.assignment?.origin?.kind === "fixture" && isCompetitionAssignment(good.assignment));
  ck("2d) 指派單指回同一場賽程",
    fixtureIdOfAssignment(good.assignment) === realFixture.id);
  ck("2e) 由賽事閘道簽發（與 mock-gateway 分得開）",
    good.assignment.issuedBy === COMPETITION_SERVER && COMPETITION_SERVER !== "mock-gateway");
  ck("2f) **ticketId 相容欄位為 null**（賽程沒有票券）", good.assignment.ticketId === null);
  ck("2g) 指派單通過既有 validateAssignment（以 origin 為憑證）",
    validateAssignment(good.assignment, good.origin).ok);
  ck("2h) 對手只有 id 與隊名，**沒有戰力**", (() => {
    const k = Object.keys(good.assignment.opponent);
    return good.assignment.opponent.id && !k.some((x) => ["power", "stats", "rating", "lv"].includes(x));
  })());
  ck("2i) 種子決定性：同一場重簽逐值相同",
    seedForFixture(realFixture) === seedForFixture(realFixture) &&
    issueFor({ fixture: realFixture, entryRequest: realEntry, playerTeamId: realTeamId,
      players: store().players, participants: realSeason.stage.participants, now: 9999,
    }).assignment.assignmentId === good.assignment.assignmentId);

  console.log("── §2 拒絕條件 ──");
  const notMine = realSeason.fixtures.find((f) => !isPlayerFixture(realSeason, f));
  ck("2j) 拒絕「這場沒有你的隊伍」", !issueFor({
    fixture: notMine, entryRequest: realEntry, playerTeamId: realTeamId,
    players: store().players, participants: realSeason.stage.participants,
  }).ok);
  for (const s of ["launched", "completed", "forfeited"]) {
    const f = { ...realFixture, status: s };
    ck(`2k) 拒絕已是「${s}」的場次（不得重發入場券）`, !issueFor({
      fixture: f, entryRequest: realEntry, playerTeamId: realTeamId,
      players: store().players, participants: realSeason.stage.participants,
    }).ok);
  }
  ck("2l) 拒絕模式不符的申請單", !issueFor({
    fixture: realFixture, entryRequest: { ...realEntry, mode: "cs" }, playerTeamId: realTeamId,
    players: store().players, participants: realSeason.stage.participants,
  }).ok);

  console.log("── §2 開房與場次沿用既有契約 ──");
  const room = openRoomForFixture({ assignment: good.assignment, now: 1000 });
  ck("2m) 開得出房間，且房間帶賽程來源",
    room.ok && room.room.schema === "MatchRoom.v1" && room.room.origin.kind === "fixture");
  ck("2n) 房間的 ticketId 為 null（衍生相容欄位）", room.room.ticketId === null);
  ck("2o) 房間 roomId 由指派單推導（同一張單不會有兩間房）",
    openRoomForFixture({ assignment: good.assignment, now: 5000 }).room.roomId === room.room.roomId);
  ck("2p) 未確認的房間不得建立場次",
    !openSessionForFixture({ room: room.room, assignment: good.assignment }).ok);
  ck("2q) 非賽程指派單不得用賽事閘道開房",
    !openRoomForFixture({ assignment: { ...good.assignment, origin: { ...good.assignment.origin, kind: "ticket" } } }).ok);
}

// ── §3 日曆推進（規格 D15）──────────────────────────────────────────────
{
  console.log("\n── §3 advanceDay 遇比賽日停止 ──");
  const s = mkSeason();
  const myDay = nextPlayerFixture(s, 1).day;
  const r = advanceSeasonDays({ state: s, fromDay: 1, days: 30, playerRoster: ROSTER });
  ck("3a) **走得進比賽日**：推 30 天實際停在比賽日",
    1 + r.daysAdvanced === myDay, `第 ${1 + r.daysAdvanced} 天 / 比賽日 ${myDay}`);
  ck("3b) 停止原因可顯示且指得出場次",
    r.stoppedBy?.code === "player_fixture" && r.stoppedBy.day === myDay &&
    /第 \d+ 天有聯賽比賽/.test(r.stoppedBy.message));
  const r2 = advanceSeasonDays({ state: r.state, fromDay: myDay, days: 5, playerRoster: ROSTER });
  ck("3c) **走不出去**：比賽沒收尾就一天都推不動", r2.daysAdvanced === 0);
  ck("3d) **刻意不自動判棄權**（規格 D15 否決過這個方案）",
    fixtureById(r2.state, nextPlayerFixture(s, 1).id).status === FIXTURE_STATES.scheduled &&
    r2.state.outcomes.every((o) => o.resultSource !== "forfeited"));
  ck("3e) 經過的日子有把 AI 場次模擬掉", r.simulated.length > 0 &&
    r.simulated.every((o) => o.resultSource === "simulated"), `${r.simulated.length} 場`);
  ck("3f) **玩家場次不會被自動模擬**",
    r.state.outcomes.every((o) => o.sideA !== s.playerTeamId && o.sideB !== s.playerTeamId));

  console.log("── §3 收尾之後可以繼續 ──");
  const fx = nextPlayerFixture(r.state, myDay);
  const lit = applyLaunch(r.state, fx.id);
  const done = applyCompleted(lit.state, {
    fixtureId: fx.id, winner: s.playerTeamId, score: { a: 20, b: 12 }, duration: 1600, seed: 5,
  });
  const r3 = advanceSeasonDays({ state: done.state, fromDay: myDay, days: 30, playerRoster: ROSTER });
  ck("3g) 打完之後推得動，且停在下一個玩家賽事日",
    r3.daysAdvanced > 0 && r3.stoppedBy?.day === nextPlayerFixture(done.state, myDay + 1).day);
  const ffed = applyForfeit(r3.state, { fixtureId: r3.stoppedBy.fixtureId });
  const r4 = advanceSeasonDays({ state: ffed.state, fromDay: r3.stoppedBy.day, days: 3, playerRoster: ROSTER });
  ck("3h) 棄權之後也推得動", r4.daysAdvanced > 0);

  console.log("── §3 逾期補判與決定性 ──");
  const swept = sweepOverdue(mkSeason(), 20);
  ck("3i) 逾期未收尾的場次會被補判棄權（不變式：過去沒有未完成場次）",
    swept.outcomes.length > 0 &&
    swept.state.fixtures.filter((f) => f.day < 20).every((f) => f.status === "forfeited"));
  ck("3j) 決定性：同一個賽季重跑同樣的推進，賽果逐值相同", (() => {
    const a = advanceSeasonDays({ state: mkSeason(), fromDay: 1, days: 30, playerRoster: ROSTER });
    const b = advanceSeasonDays({ state: mkSeason(), fromDay: 1, days: 30, playerRoster: ROSTER });
    return JSON.stringify(a.state.outcomes) === JSON.stringify(b.state.outcomes) &&
      a.daysAdvanced === b.daysAdvanced;
  })());
  ck("3k) 模擬是冪等的：同一天重跑不會產生第二筆賽果", (() => {
    const one = simulateAiFixturesOn(mkSeason(), AI_FIXTURE.day, ROSTER);
    const two = simulateAiFixturesOn(one.state, AI_FIXTURE.day, ROSTER);
    return two.outcomes.length === 0 && two.state.outcomes.length === one.state.outcomes.length;
  })());
}

// ── §4 Fixture 狀態機 ───────────────────────────────────────────────────
{
  console.log("\n── §4 場次狀態機 ──");
  const s = mkSeason();
  const fx = nextPlayerFixture(s, 1);
  const lit = applyLaunch(s, fx.id);
  ck("4a) scheduled → launched", lit.ok && fixtureById(lit.state, fx.id).status === "launched");
  ck("4b) **launched 不得回到 scheduled**（堵死中離規避敗場）",
    !transitionFixture(fixtureById(lit.state, fx.id), FIXTURE_STATES.scheduled).ok);
  ck("4c) 不得重複 launched", !applyLaunch(lit.state, fx.id).ok);
  ck("4d) launched → completed 會寫入 engine 賽果", (() => {
    const d = applyCompleted(lit.state, { fixtureId: fx.id, winner: fx.sideA, score: { a: 1, b: 0 }, duration: 60, seed: 2 });
    return d.ok && d.outcome.resultSource === "engine" && fixtureById(d.state, fx.id).status === "completed";
  })());
  ck("4e) 還沒 launched 不能直接 completed", (() => {
    const d = applyCompleted(s, { fixtureId: fx.id, winner: fx.sideA, score: { a: 1, b: 0 }, duration: 60, seed: 2 });
    return !d.ok;
  })());
  ck("4f) scheduled 可直接 forfeited（還沒出賽就棄權）",
    applyForfeit(s, { fixtureId: fx.id }).ok);
  ck("4g) launched 也可 forfeited（開打後棄權）",
    applyForfeit(lit.state, { fixtureId: fx.id }).ok);
  ck("4h) **賽果不可覆寫**：已有賽果的場次不能再寫第二筆", (() => {
    const d = applyCompleted(lit.state, { fixtureId: fx.id, winner: fx.sideA, score: { a: 1, b: 0 }, duration: 60, seed: 2 });
    return !applyForfeit(d.state, { fixtureId: fx.id }).ok &&
      !applyCompleted(d.state, { fixtureId: fx.id, winner: fx.sideA, score: { a: 2, b: 0 }, duration: 60, seed: 3 }).ok;
  })());
  ck("4i) completed / forfeited 是終局", (() => {
    const d = applyCompleted(lit.state, { fixtureId: fx.id, winner: fx.sideA, score: { a: 1, b: 0 }, duration: 60, seed: 2 });
    const f = fixtureById(d.state, fx.id);
    return !transitionFixture(f, FIXTURE_STATES.launched).ok && !transitionFixture(f, FIXTURE_STATES.forfeited).ok;
  })());
}

// ── §5 profileStore 整合 ────────────────────────────────────────────────
{
  console.log("\n── §5 Store 整合 ──");
  const store = () => useProfileStore.getState();

  //  ★ 沒有賽季時，advanceDay 必須與 Q3 之前逐值相同
  store().startNewGame("standard");
  const before = store().meta.days;
  const rc = store().advanceDay(7);
  ck("5a) **沒有賽季時 advanceDay 行為不變**（既有存檔零影響）",
    store().meta.days === before + 7 && Array.isArray(rc) && rc.daysAdvanced === 7 && rc.stoppedBy === null);
  ck("5b) 回傳仍是陣列，且 `.trained` 仍在（既有呼叫端不受影響）",
    Array.isArray(rc) && Array.isArray(rc.trained));

  store().startNewGame("standard");
  const ens = store().ensureCompetitionSeason();
  ck("5c) 建得出賽季，56 場", ens.ok && store().competition.fixtures.length === 56);
  ck("5d) 重複呼叫不會重建（決定性、不覆寫）", (() => {
    const again = store().ensureCompetitionSeason();
    return again.created === false && again.state === ens.state;
  })());

  const myDay = store().competitionView().next.day;
  const r = store().advanceDay(30);
  ck("5e) advanceDay 停在比賽日，且 meta.days 與賽程一致",
    r.daysAdvanced === myDay - 1 && store().meta.days === myDay && r.stoppedBy?.day === myDay);
  ck("5f) 卡住時不動時鐘、不結算", (() => {
    const d = store().meta.days;
    const r2 = store().advanceDay(5);
    return r2.daysAdvanced === 0 && store().meta.days === d && r2.stoppedBy !== null;
  })());

  const today = store().competitionView().today;
  const started = store().startFixtureMatch(today.id, 1000);
  ck("5g) startFixtureMatch 走通：簽單 + 開房 + 場次轉 launched",
    started.ok && started.room?.origin?.kind === "fixture" &&
    store().competition.fixtures.find((f) => f.id === today.id).status === "launched", started.reason ?? "");
  ck("5h) 賽程路徑不留舊票券（否則 pollMatchRoom 會拿不相干的票券關房）",
    store().matchmaking.ticket === null && store().matchmaking.fixtureAssignment !== null);

  //  走既有管線
  let now = 2000;
  store().pollMatchRoom(now); now += 1000;
  store().confirmMatchReady(now);
  for (let i = 0; i < 10; i++) { now += 1500; store().pollMatchRoom(now); }
  ck("5i) **賽程房間不會被票券檢查誤殺**，能走到 confirmed",
    store().matchmaking.room?.state === "confirmed");
  const sess = store().createMatchSession(now);
  ck("5j) 用既有 createMatchSession 建得出場次（賽事閘道簽發）",
    sess.ok && sess.session.issuedBy === COMPETITION_SERVER);
  const lau = store().launchMatchSession(now);
  ck("5k) 用既有 launchMatchSession 進得去", lau.ok && lau.launch?.mode === "moba");
  ck("5l) **一次性令牌照舊擋重複進場**", !store().launchMatchSession(now).ok);

  console.log("── §5 中離重連（沿用 O6，未新增機制）──");
  store().markMatchDisconnected(now + 1000);
  const res = store().resumeMatchSession(now + 2000);
  ck("5m) 中離後可用既有 resumeSession 回來", res.ok, res.errors?.[0]?.message ?? "");
  ck("5n) 重連期間場次仍是 launched（不得回到 scheduled）",
    store().competition.fixtures.find((f) => f.id === today.id).status === "launched");

  console.log("── §5 收尾與持久化 ──");
  const done = store().completeFixtureMatch({
    fixtureId: today.id, winner: store().team.id, score: { a: 21, b: 13 }, duration: 1650, seed: 9,
  });
  ck("5o) 收尾寫入 engine 賽果", done.ok && done.outcome.resultSource === "engine");
  const r3 = store().advanceDay(30);
  ck("5p) 收尾後推得動", r3.daysAdvanced > 0);
  const f2 = store().competitionView().today;
  const ff = store().forfeitFixture(f2.id);
  ck("5q) 棄權由玩家主動觸發，寫入 forfeited 賽果",
    ff.ok && ff.outcome.resultSource === "forfeited" && ff.outcome.seed === 0);
  ck("5r) 棄權後推得動", store().advanceDay(2).daysAdvanced > 0);

  const saved = JSON.parse(LS);
  ck("5s) 賽季有進存檔（重整後不會消失）",
    !!saved.competition && saved.competition.fixtures.length === 56 && saved.competition.outcomes.length > 0);
  ck("5t) 積分榜由 store 唯一入口提供，且計入 engine 與 forfeited", (() => {
    const me = store().competitionView().standings.rows.find((x) => x.teamId === store().team.id);
    return me.engineGames === 1 && me.forfeitedGames === 1 && me.played === 2;
  })());
}

// ── §6 紅線（原始碼掃描；已剝註解）──────────────────────────────────────
{
  console.log("\n── §6 紅線 ──");
  const gw = readCode("src/platform/competition/competitionGateway.js");
  const ss = readCode("src/platform/competition/seasonState.js");
  const both = gw + "\n" + ss;

  ck("6a) 沒有 Math.random()／Date.now()", !/Math\.random|Date\.now|new Date\(/.test(both));
  ck("6b) 不 import React／zustand，也不碰 localStorage",
    !/from\s+["']react|zustand|localStorage/.test(both));
  ck("6c) **沒有碰 Battle Engine**", !/LogicEngine|battleStore|useLocalServer/.test(both));
  ck("6d) **沒有第二條進場流程**：房間與場次都來自 contracts", (() => {
    const usesContracts = /from\s+["']\.\.\/contracts\/matchRoom\.js["']/.test(gw) &&
      /from\s+["']\.\.\/contracts\/matchSession\.js["']/.test(gw) &&
      /createRoom|createSession/.test(gw);
    //  不得自己造 roomId / sessionId / launchToken
    const noOwnIds = !/roomId\s*:/.test(gw) && !/sessionId\s*:/.test(gw) && !/launchToken/.test(gw);
    return usesContracts && noOwnIds;
  })());
  ck("6e) 指派單由既有 createAssignment 產生，閘道不自己組",
    /createAssignment/.test(gw) && !/assignmentId\s*:/.test(gw));
  ck("6f) seasonState 不接 profileStore（規則層不依賴 Store）", !/profileStore/.test(ss));
  ck("6g) **沒有 Shop／MMR／CS 賽事**（Q3 範圍外）",
    !/shop|tokens|entitlement|mmr|ladder/i.test(both) && !/gameMode\s*[:=]\s*["']cs["']/.test(both));
  ck("6h) **沒有 FinalStandings／獎金**（那是 Q4）",
    !/FinalStandings|settleCompetitionAward/.test(both));
  ck("6i) 棄權只有敗場：程式裡沒有聲望／罰款／降級",
    !/reputation|penalt|relegat|fine\b/i.test(both));
  ck("6j) Store 的賽事動作都轉呼叫純函式，不在 Store 裡判規則", (() => {
    const ps = readCode("src/platform/profileStore.js");
    //  Store 不得自己寫狀態轉移或自己組賽果
    return /advanceSeasonDays|applyLaunch|applyCompleted|applyForfeit/.test(ps) &&
      !/createForfeitOutcome/.test(ps) && !/transitionFixture/.test(ps);
  })());
}

console.log(`\n${pass}/${pass + fail} 通過`);
if (fail) { console.log(`\n❌ ${fail} 條未通過`); process.exit(1); }
