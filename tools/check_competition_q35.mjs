#!/usr/bin/env node
// ============================================================================
//  tools/check_competition_q35.mjs — Milestone Q3.5：賽事 UI ＋ 賽果回寫
//
//  執行：repo 根目錄 `node tools/check_competition_q35.mjs`；**失敗時 exit 1**。
//
//  Q3.5 的三件事：
//    ① `MatchResult.v1` → `FixtureOutcome`（純換座標，不重算）
//    ② 回寫掛在既有唯一結算邊界之後（不產生第二套結算）
//    ③ 最小賽事 UI，沿用既有「🏆 賽事」入口與既有賽前流程
//
//  最關鍵的四組：
//    §1b  **客場時比分要對調**（玩家 24 殺在 sideB ⇒ score.b = 24）
//    §2a  跑**真實鏈路**：BattleResult → outcome → reportMatchResult → 賽程回寫
//    §2d  **票券路徑不得碰到賽季**（排隊打的比賽不是聯賽）
//    §3   engine / simulated / forfeited 三種賽果都要進 Standings
// ============================================================================
import fs from "node:fs";

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const readCode = (p) => stripComments(fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8"));
const readRaw = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const KEY = "esmo.profile.v1";
let LS = null;
globalThis.localStorage = {
  getItem: (k) => (k === KEY ? LS : null),
  setItem: (k, v) => { if (k === KEY) LS = v; },
  removeItem: () => { LS = null; },
};

const { fixtureOutcomeInputFrom, isFixtureSession, fixtureIdOfSession } =
  await import("../src/platform/competition/fixtureResultBridge.js");
const { useProfileStore } = await import("../src/platform/profileStore.js");
const { activeCompetitionOf, fixturesOfCompetition } =
  await import("../src/platform/competition/seasonState.js");

// ── Q7a-3f.2：要「今天的**官方聯賽**場次」就得指名，不能拿當日第一場 ──────
//  ⚠ 多賽事並存之後，`competitionView().today` 是**當日清單的第一場**，
//    可能是巡迴賽的比賽。本檔 §3 驗的是**官方聯賽積分榜**，拿錯場次去打／棄權，
//    聯賽榜上自然什麼都沒有（實測就是這樣紅的）。
const leagueTodayFixture = (st) => {
  const c = st().competition;
  const ids = new Set(fixturesOfCompetition(c, activeCompetitionOf(c)?.id ?? null).map((f) => f.id));
  return (st().competitionView().todayPending ?? []).find((f) => ids.has(f.id)) ?? null;
};
/** 推進到「今天有官方聯賽的比賽」為止；沿途別的賽事場次先棄權清掉。 */
const advanceToLeagueFixture = (st, maxSteps = 60) => {
  for (let i = 0; i < maxSteps; i++) {
    const f = leagueTodayFixture(st);
    if (f) return f;
    const pending = st().competitionView().todayPending ?? [];
    if (pending.length) { st().forfeitFixture(pending[0].id); continue; }
    if (st().advanceDay(7).daysAdvanced === 0) break;
  }
  return null;
};
const { settleMatchThroughSession, outcomeFromBattleResult } =
  await import("../src/platform/progress/settleMatchBoundary.js");
const { mobaResultToTransaction } =
  await import("../src/platform/progress/adapters/mobaProgressAdapter.js");

let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`✅ ${name}${detail ? "　" + detail : ""}`); }
  else { fail++; console.log(`❌ ${name}${detail ? "　" + detail : ""}`); }
};
const st = () => useProfileStore.getState();

// ── §1 換座標（純函式）─────────────────────────────────────────────────
{
  console.log("\n── §1 MatchResult.v1 → FixtureOutcome ──");
  const FX = { id: "fx:moba:abc", sideA: "team:aaaaaaaa", sideB: "team:bbbbbbbb", gameMode: "moba", status: "launched" };
  const mkResult = (over = {}) => ({
    schema: "MatchResult.v1", resultId: "result:moba:x", sessionId: "session:moba:x",
    matchId: "m1", mode: "moba", seed: 4242, winner: "us",
    score: { us: 24, opponent: 17 }, durationSec: 1832, resultSource: "engine", ...over,
  });

  const homeMap = fixtureOutcomeInputFrom({ result: mkResult(), fixture: FX, playerTeamId: FX.sideA });
  ck("1a) 主場：us→a、opponent→b，勝方是玩家",
    homeMap.ok && homeMap.input.score.a === 24 && homeMap.input.score.b === 17 &&
    homeMap.input.winner === FX.sideA, JSON.stringify(homeMap.input?.score));

  const awayMap = fixtureOutcomeInputFrom({ result: mkResult(), fixture: FX, playerTeamId: FX.sideB });
  ck("1b) **客場：比分要對調**（玩家 24 殺落在 sideB）",
    awayMap.ok && awayMap.input.score.a === 17 && awayMap.input.score.b === 24 &&
    awayMap.input.winner === FX.sideB, JSON.stringify(awayMap.input?.score));

  const lost = fixtureOutcomeInputFrom({ result: mkResult({ winner: "opponent" }), fixture: FX, playerTeamId: FX.sideA });
  ck("1c) 敗場：勝方是對手，比分不動",
    lost.ok && lost.input.winner === FX.sideB && lost.input.score.a === 24 && lost.input.score.b === 17);

  ck("1d) **時長與種子照抄正式賽果**（不四捨五入、不重算）",
    homeMap.input.duration === 1832 && homeMap.input.seed === 4242);
  ck("1e) fixtureId 來自賽程本身", homeMap.input.fixtureId === FX.id);

  console.log("── §1 拒絕條件 ──");
  ck("1f) 拒絕非 MatchResult.v1",
    !fixtureOutcomeInputFrom({ result: { schema: "BattleResult.v2", winner: "blue" }, fixture: FX, playerTeamId: FX.sideA }).ok);
  ck("1g) **只接受實際對戰**（模擬／其他來源不得走這條）",
    !fixtureOutcomeInputFrom({ result: mkResult({ resultSource: "simulated" }), fixture: FX, playerTeamId: FX.sideA }).ok);
  ck("1h) 拒絕 us/opponent 以外的勝負",
    !fixtureOutcomeInputFrom({ result: mkResult({ winner: "blue" }), fixture: FX, playerTeamId: FX.sideA }).ok);
  ck("1i) 拒絕「這場沒有玩家的隊伍」",
    !fixtureOutcomeInputFrom({ result: mkResult(), fixture: FX, playerTeamId: "team:cccccccc" }).ok);
  ck("1j) 缺比分要擋",
    !fixtureOutcomeInputFrom({ result: mkResult({ score: { us: 1 } }), fixture: FX, playerTeamId: FX.sideA }).ok);

  console.log("── §1 結構上拿不到戰鬥資料 ──");
  const bridge = readCode("src/platform/competition/fixtureResultBridge.js");
  ck("1k) **bridge 不讀 BattleResult**（否則勝負歸屬會有兩個決定點）",
    !/BattleResult/.test(bridge) && !/"blue"|'blue'/.test(bridge) && !/snapshotToBattleResult/.test(bridge));
  ck("1l) session 判定由 origin 決定，不看畫面狀態", (() => {
    const s = { origin: { kind: "fixture", fixtureId: "fx:moba:z" } };
    return isFixtureSession(s) && fixtureIdOfSession(s) === "fx:moba:z" &&
      !isFixtureSession({ origin: { kind: "ticket" } }) &&
      fixtureIdOfSession({ origin: { kind: "ticket" } }) === null;
  })());
}

// ── §2 真實鏈路：打完一場，賽程自己更新 ────────────────────────────────
const mkBattleResult = (over = {}) => {
  const players = (st().players ?? []).slice(0, 5).map((p, i) => ({
    id: p.id, side: "blue", role: p.role ?? "MID", heroId: null, lv: 12,
    k: 5, d: 2, a: 4, gold: 12000, dmg: 20000, heal: 0, twrDmg: 3000,
    participation: 0.7, rating: 7.5, won: true, mvp: i === 0,
  }));
  return {
    schema: "BattleResult.v2", mode: "moba",
    teams: { blue: { name: "我方" }, red: { name: "對手" } },
    winner: "blue", duration: 1832, score: { blue: 24, red: 17 },
    gold: { blue: 60000, red: 52000 }, towers: { blue: 7, red: 3 },
    dragon: 2, baron: 1, tactic: null, tacticExecution: null,
    timeline: [], mvpId: players[0]?.id ?? null, players, ...over,
  };
};
const driveToLaunch = (fixtureId) => {
  st().startFixtureMatch(fixtureId, 1000);
  let now = 2000;
  st().pollMatchRoom(now); now += 1000;
  st().confirmMatchReady(now);
  for (let i = 0; i < 10; i++) { now += 1500; st().pollMatchRoom(now); }
  st().createMatchSession(now);
  return st().launchMatchSession(now);
};
const settle = (br, matchId) => settleMatchThroughSession({
  mode: "moba",
  outcome: outcomeFromBattleResult(br, matchId),
  transaction: mobaResultToTransaction(br, {
    players: st().players, lineup: st().lineup, streak: 0, fansNow: st().meta?.fans ?? 0,
  }),
});

{
  console.log("\n── §2 賽後結算把賽果寫進賽程 ──");
  st().startNewGame("standard");
  st().ensureCompetitionSeason();
  st().advanceDay(30);
  const fx = st().competitionView().today;
  const myId = st().competition.playerTeamId;
  const playerIsA = fx.sideA === myId;

  const lau = driveToLaunch(fx.id);
  ck("2a0) 出賽走得到進場", lau.ok, lau.errors?.[0]?.message ?? "");

  const br = mkBattleResult();
  const res = settle(br, `moba:q35:${fx.id}`);
  ck("2a) 結算成功且走權威路徑", res.receipt?.ok === true && res.viaSession === true);

  const after = st().competition.fixtures.find((f) => f.id === fx.id);
  const oc = st().competition.outcomes.find((o) => o.fixtureId === fx.id);
  ck("2b) **賽程自動收尾成 completed**", after.status === "completed");
  ck("2c) 寫入的是 engine 賽果", oc?.resultSource === "engine");
  ck("2d) 勝方正確（玩家贏）", oc?.winner === myId);
  ck("2e) 比分依主客對應 sideA/sideB",
    playerIsA ? (oc.score.a === 24 && oc.score.b === 17) : (oc.score.a === 17 && oc.score.b === 24),
    `玩家 sideA=${playerIsA} → ${oc.score.a}:${oc.score.b}`);
  ck("2f) 時長與種子來自正式賽果",
    oc.duration === 1832 && oc.seed === st().matchmaking.session?.seed);

  console.log("── §2 不重複、不誤傷 ──");
  const before = st().competition.outcomes.length;
  settle(br, `moba:q35:${fx.id}`);
  ck("2g) **重送同一份結果不會產生第二筆賽果**",
    st().competition.outcomes.length === before &&
    st().competition.outcomes.filter((o) => o.fixtureId === fx.id).length === 1);
  ck("2h) 結算收據仍是同一張（S25 冪等未被破壞）",
    Object.keys(st().processedMatchTransactions ?? {}).length >= 1);
  ck("2i) 賽程賽果寫完後清掉 fixtureAssignment", st().matchmaking.fixtureAssignment === null);

  console.log("── §2 票券路徑不得碰賽季 ──");
  st().startNewGame("standard");
  st().ensureCompetitionSeason();
  const outcomesBefore = st().competition.outcomes.length;
  st().enqueueMatch("moba", 1000);
  for (let i = 0; i < 40; i++) st().pollMatchmaking(1000 + i * 5000);
  st().openMatchRoom(300000);
  let n = 300000;
  st().pollMatchRoom(n); n += 1000;
  st().confirmMatchReady(n);
  for (let i = 0; i < 10; i++) { n += 1500; st().pollMatchRoom(n); }
  st().createMatchSession(n);
  const tl = st().launchMatchSession(n);
  if (tl.ok) {
    const r2 = settle(mkBattleResult(), "moba:q35:ticket");
    ck("2j) **排隊打的比賽不寫進賽季**（那不是聯賽）",
      r2.receipt?.ok === true && st().competition.outcomes.length === outcomesBefore,
      `賽果數 ${st().competition.outcomes.length}`);
  } else {
    ck("2j) 票券路徑可進場（前置）", false, tl.errors?.[0]?.message ?? "");
  }
}

// ── §3 三種賽果都要進 Standings ─────────────────────────────────────────
{
  console.log("\n── §3 engine / simulated / forfeited 都進積分榜 ──");
  st().startNewGame("standard");
  st().ensureCompetitionSeason();
  const myId = st().competition.playerTeamId;

  st().advanceDay(30);
  const f1 = advanceToLeagueFixture(st);
  driveToLaunch(f1.id);
  settle(mkBattleResult(), `moba:q35b:${f1.id}`);

  st().advanceDay(30);
  const f2 = advanceToLeagueFixture(st);
  st().forfeitFixture(f2.id);
  st().advanceDay(10);

  const rows = st().competitionView().standings.rows;
  const me = rows.find((r) => r.teamId === myId);
  ck("3a) 玩家實打的一場計入", me.engineGames === 1);
  ck("3b) 棄權的一場計入", me.forfeitedGames === 1);
  ck("3c) 玩家 1 勝 1 敗", me.wins === 1 && me.losses === 1 && me.played === 2);
  const sim = st().competition.outcomes.filter((o) => o.resultSource === "simulated");
  ck("3d) AI 模擬場次有進賽果", sim.length > 0, `${sim.length} 場`);
  ck("3e) 模擬場次計入其他隊伍的積分",
    rows.filter((r) => r.teamId !== myId).some((r) => r.simulatedGames > 0));
  ck("3f) 三種來源相加 = 出賽數（每一列都成立）",
    rows.every((r) => r.engineGames + r.simulatedGames + r.forfeitedGames === r.played));
  ck("3g) 全聯盟總勝 = 總敗", (() => {
    const w = rows.reduce((a, r) => a + r.wins, 0);
    const l = rows.reduce((a, r) => a + r.losses, 0);
    return w === l && w > 0;
  })());
  ck("3h) 淨勝分總和為 0", rows.reduce((a, r) => a + r.scoreDiff, 0) === 0);
  ck("3i) 名次連續 1–8", rows.map((r) => r.rank).join() === "1,2,3,4,5,6,7,8");
}

// ── §3.5 賽季錨定在建立當天（瀏覽器實測抓到的 bug）─────────────────────
{
  console.log("\n── §3.5 賽季錨定（不得一建立就有過期場次）──");
  const { absoluteDayOf, createSeasonState } = await import("../src/platform/competition/seasonState.js");

  //  ⚠ bug 的真實觸發條件：**沒按過「開新局」的存檔**。`DEFAULT.meta.days` 是 8，
  //    而 `startNewGame()` 會重設成第 1 天 ⇒ 全新瀏覽器拿到的是第 8 天。
  //    這裡直接用 startDay=8 重現當時的情境。
  const anchored = createSeasonState({
    playerTeam: { id: "team:12345678", name: "測試", tag: "TST" },
    season: 1, seasonSeed: 999, startDay: 8,
  }).state;
  const anchoredDays = anchored.fixtures.map((f) => absoluteDayOf(anchored, f));
  ck("3j) **賽季錨定在第 8 天時，沒有場次落在第 8 天之前**",
    Math.min(...anchoredDays) >= 8, `最早 ${Math.min(...anchoredDays)}`);
  ck("3k) 平移不改變賽程結構（跨度與相對日一致）", (() => {
    const rel = anchored.fixtures.map((f) => f.day);
    return Math.max(...anchoredDays) - Math.min(...anchoredDays) === Math.max(...rel) - Math.min(...rel)
      && Math.min(...rel) >= 1;
  })());

  //  Store 端：賽季必須用「當下的 meta.days」當錨點
  st().startNewGame("standard");
  st().advanceDay(4);
  const day0 = st().meta.days;
  st().ensureCompetitionSeason();
  const state = st().competition;
  ck("3l) Store 用當下的遊戲日當錨點", state.startDay === day0, `startDay=${state.startDay} / day=${day0}`);
  const absDays = state.fixtures.map((f) => absoluteDayOf(state, f));
  ck("3m) **沒有任何場次落在建立日之前**（否則玩家沒看到就先輸）",
    Math.min(...absDays) >= day0, `最早 ${Math.min(...absDays)} / 建立日 ${day0}`);

  const view = st().competitionView();
  ck("3n) 下一場顯示的是遊戲日，不是賽季相對日",
    view.nextDay >= day0 && view.nextDay === absoluteDayOf(state, view.next));

  //  建立後立刻推進：不得有任何補判棄權
  st().advanceDay(30);
  ck("3o) **建立後立刻推進不會補判任何棄權**",
    st().competition.outcomes.every((o) => o.resultSource !== "forfeited"),
    `賽果 ${st().competition.outcomes.length} 筆`);
  ck("3p) 推進會停在玩家的第一場（而不是直接跳過）",
    st().competitionView().today !== null &&
    st().meta.days === absoluteDayOf(st().competition, st().competitionView().today));
}

// ── §3.6 房間逾時後可以重新進場（瀏覽器實測抓到的第二個缺口）─────────────
{
  console.log("\n── §3.6 確認逾時之後不能只剩棄權 ──");
  st().startNewGame("standard");
  st().ensureCompetitionSeason();
  st().advanceDay(30);
  const fx = st().competitionView().today;

  //  出賽但**不確認**，讓房間逾時（READY_SECONDS = 20）
  st().startFixtureMatch(fx.id, 1000);
  st().pollMatchRoom(2000);                       // waiting → ready_check
  st().pollMatchRoom(2000 + 60_000);              // 遠超過 20 秒 ⇒ expired
  ck("3q) 房間確實逾時", st().matchmaking.room?.state === "expired", st().matchmaking.room?.state);
  ck("3r) 賽程仍是 launched（狀態不倒退）",
    st().competition.fixtures.find((f) => f.id === fx.id).status === "launched");

  const retry = st().startFixtureMatch(fx.id, 200000);
  ck("3s) **逾時後可以重新進場**（否則手滑 20 秒就丟一場）", retry.ok, retry.reason ?? "");
  ck("3t) 重新進場拿到新房間，且賽程仍是 launched",
    st().matchmaking.room?.state === "waiting" &&
    st().competition.fixtures.find((f) => f.id === fx.id).status === "launched");
  ck("3u) 沒有產生第二筆賽果", (st().competition.outcomes ?? []).filter((o) => o.fixtureId === fx.id).length === 0);

  //  但「還活著的場次」不得重新簽發——那要走 resume
  let now = 210000;
  st().pollMatchRoom(now); now += 1000;
  st().confirmMatchReady(now);
  for (let i = 0; i < 10; i++) { now += 1500; st().pollMatchRoom(now); }
  st().createMatchSession(now);
  st().launchMatchSession(now);
  const dup = st().startFixtureMatch(fx.id, now + 1000);
  ck("3v) **場次還活著時不得重新簽發**（否則等於第二張入場券）",
    !dup.ok && /進行中/.test(dup.reason ?? ""), dup.reason ?? "");

  //  終局的場次永遠不得重簽
  st().forfeitFixture(fx.id);
  ck("3w) 終局場次永遠不得重簽", !st().startFixtureMatch(fx.id, now + 5000).ok);
}

// ── §4 UI 接線 ──────────────────────────────────────────────────────────
{
  console.log("\n── §4 UI 接線 ──");
  const shell = readCode("src/AppShell.jsx");
  const screen = readCode("src/screens/manage/CompetitionScreen.jsx");
  const dash = readCode("src/screens/DashboardScreen.jsx");

  ck("4a) 主畫面「🏆 賽事」指向聯賽（沿用既有入口）",
    /onSeason=\{go\("competition"\)\}/.test(shell) && /screen === "competition"/.test(shell));
  ck("4b) **沒有新增第二個賽事入口**：bracket 仍是唯一一顆",
    (readRaw("src/screens/DashboardScreen.jsx").match(/🏆/g) ?? []).length === 1 &&
    /id === "bracket"/.test(dash));
  //  ⚠ 必須是 `lineup`（真正跑 useMatchFlow 的賽前頁），不是 `matchmaking`
  //    ——後者是 Sprint11 的純過場動畫，導過去場次不會簽發，賽果寫不回賽程。
  //    這是瀏覽器實測抓到的接線錯誤。
  //  ⚠ 2026-08-21（CS Season M2）：原本 grep 的是字面 `onPlay={go("lineup")}`。
  //    M2 起賽程可能是 CS 的，導向要依**指派單的項目**決定
  //    （MOBA → `lineup`、CS → `csPrep`），所以那個字面不再成立。
  //    改成涵蓋兩個項目、且比原版更嚴的版本：導向函式必須存在、
  //    它的兩個目的地都必須是真正跑 `useMatchFlow` 的賽前頁，
  //    而且 `matchmaking`（純過場動畫）**依然**不得是 onPlay 的目的地。
  ck("4c) 出賽導向真正的賽前流程頁（不是純過場動畫）", (() => {
    if (!/onPlay=\{enterFixturePrep\}/.test(shell)) return false;
    const fn = shell.match(/const enterFixturePrep[\s\S]*?\n  \};/)?.[0] ?? "";
    if (!fn) return false;
    const destinations = [...fn.matchAll(/setScreen\(([\s\S]*?)\);/g)].map((m) => m[1]).join(" ");
    return /"lineup"/.test(destinations) && /"csPrep"/.test(destinations)
      && !/matchmaking/.test(destinations)
      && !/onPlay=\{go\("matchmaking"\)\}/.test(shell);
  })());
  ck("4c1) CS 賽前頁同樣跑真正的賽前流程框架",
    /useMatchFlow|MatchPrepFrame/.test(readCode("src/screens/fps/CsPrepScreen.jsx")));
  ck("4c2) 那一頁確實跑 useMatchFlow（房間確認／場次／一次性進場）",
    /useMatchFlow|MatchPrepFrame/.test(readCode("src/screens/moba/LineupScreen.jsx")));
  //  ⚠ UI-1 起這一頁接受 `mode` / `gameMode`，讀取是 `competitionView(gm)`。
  //    這條要驗的是「**經過 Store 出口**取資料」，不是「呼叫時不帶參數」——
  //    寫死空括號會把一個正確的參數化改動判成違規。放寬成「有呼叫這個出口」；
  //    「畫面不自己算」那一半仍由 §4e–4g 守著。
  ck("4d) 畫面只透過 Store 出口取資料",
    /competitionView\(/.test(screen) && /startFixtureMatch/.test(screen) &&
    /forfeitFixture/.test(screen) && /ensureCompetitionSeason/.test(screen));
  ck("4e) **畫面不自己算積分榜／不自己排名次**",
    !/computeStandings|seasonStandings|\.sort\(/.test(screen));
  ck("4f) 畫面不自己判斷能不能出賽（沒有狀態機字串）",
    !/FIXTURE_STATES|transitionFixture|canFixtureTransition/.test(screen));
  ck("4g) 畫面不自己造賽果", !/createFixtureOutcome|createForfeitOutcome/.test(screen));
  ck("4h) 棄權有二次確認（規格 D15：不讓玩家手滑丟掉整季）",
    /confirmForfeit/.test(screen) && /確定棄權/.test(readRaw("src/screens/manage/CompetitionScreen.jsx")));
  ck("4i) 誠實標示來源分佈（實際對戰／棄權／模擬）",
    /engineGames/.test(screen) && /forfeitedGames/.test(screen) && /simulatedGames/.test(screen));
  ck("4j) 不訂閱函式本身（正式驗收踩過的凍結 bug）",
    !/useProfileStore\(\(s\) => s\.\w+\)\(\)/.test(screen));
  ck("4k) Sprint09 賽季戰績仍在（沒有被移除，只是不再掛在賽事鈕）",
    /screen === "season"/.test(shell) && /SeasonScreen/.test(shell));
}

// ── §5 紅線 ─────────────────────────────────────────────────────────────
{
  console.log("\n── §5 紅線 ──");
  const bridge = readCode("src/platform/competition/fixtureResultBridge.js");
  const screen = readCode("src/screens/manage/CompetitionScreen.jsx");
  const ps = readCode("src/platform/profileStore.js");

  ck("5a) bridge 是純函式（無 React／zustand／localStorage／亂數／時鐘）",
    !/from\s+["']react|zustand|localStorage|Math\.random|Date\.now/.test(bridge));
  ck("5b) **沒有碰 Battle Engine**",
    !/LogicEngine|battleStore|useLocalServer/.test(bridge + screen));
  ck("5c) 回寫掛在既有結算之後，不是第二套結算",
    /_writeFixtureResultFromMatch/.test(ps) && !/applyProgressToState[\s\S]{0,200}competition/.test(ps));
  ck("5d) 回寫只在賽程來源時觸發", /isFixtureSession\(session\)/.test(ps));
  ck("5e) Store 不自己換座標（換算在 bridge）",
    /fixtureOutcomeInputFrom/.test(ps) && !/score:\s*\{\s*a:\s*result/.test(ps));
  //  ⚠ 2026-08-12（Q4）：本條原本是「**沒有** Q4 的東西（FinalStandings／獎金）」。
  //    Q4 已經實作，`profileStore` 依規格要呼叫 `settleCompetitionAwardInState`
  //    ⇒ 原斷言必然紅。保留這條守的**真正邊界**：
  //    ① 賽果回寫（bridge）與賽事畫面完全不碰名次獎金
  //    ② Store 只**委派**發獎，不自己算獎金金額（金額表在 economyConfig）
  ck("5f) 賽果回寫與畫面不碰名次獎金；Store 只委派、不自己算金額",
    !/FinalStandings|settleCompetitionAward|prizeForRank/.test(bridge + screen) &&
    /settleCompetitionAwardInState/.test(ps) &&
    !/prizeForRank|COMPETITION_PRIZE/.test(ps));
  ck("5g) 沒有 Shop／MMR", !/tokens|entitlement|mmr\b/i.test(bridge + screen));
}

console.log(`\n${pass}/${pass + fail} 通過`);
if (fail) { console.log(`\n❌ ${fail} 條未通過`); process.exit(1); }
