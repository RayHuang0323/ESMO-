#!/usr/bin/env node
// ============================================================================
//  tools/check_q7a_3d_asia_circuit.mjs — Q7a-3d：第一條可運作的亞洲巡迴賽
//
//  執行：repo 根目錄 `node tools/check_q7a_3d_asia_circuit.mjs`；失敗 exit 1。
//
//  ── 這一支在證明什麼 ────────────────────────────────────────────────────
//  3c 把積分機制做完了但沒有人用；3d 造出第一條真的會跑的巡迴賽。
//  所以要證明的是**兩件事同時成立**：
//    ① 打開旗標 ⇒ 三站真的會跑完，積分、巡迴排名、Top 4 晉級一路到底
//    ② 關著旗標 ⇒ 現況**逐場不變**（Q3／Q5 那三條「新賽季 56 場」仍然對）
//  以及 ③ 舊存檔在任何情況下都不會被插入新賽事。
// ============================================================================
const KEY = "esmo.profile.v1";
let LS = null;
globalThis.localStorage = {
  getItem: (k) => (k === KEY ? LS : null),
  setItem: (k, v) => { if (k === KEY) LS = v; },
  removeItem: () => { LS = null; },
};
//  ⚠ 旗標預設關閉。驗證器用**正式的**網址參數開關（`?asiaCircuit=1`），
//    不另外開一個測試專用後門——後門會讓「production 真的讀得到旗標嗎」失去驗證。
globalThis.window = { location: { search: "" } };
const setFlag = (on) => { globalThis.window.location.search = on == null ? "" : `?asiaCircuit=${on ? 1 : 0}`; };
import { readFileSync } from "node:fs";

const S = await import("../src/platform/competition/seasonState.js");
const P = await import("../src/platform/competition/circuitPoints.js");
const A = await import("../src/platform/competition/asiaCircuit.js");
const { asiaCircuitEnabled, FEATURE_FLAGS } = await import("../src/featureFlags.js");
const { useProfileStore } = await import("../src/platform/profileStore.js");

const store = () => useProfileStore.getState();
let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`✅ ${name}${detail ? "　" + detail : ""}`); }
  else { fail++; console.log(`❌ ${name}${detail ? "　" + detail : ""}`); }
};
const readCode = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const J = (x) => JSON.stringify(x);

const TEAM = { id: "team:aaaaaaaa", name: "白貓戰隊", tag: "GSEAL" };
const freshSeason = () => S.createSeasonState({ playerTeam: TEAM, season: 1, seasonSeed: 4242 }).state;

console.log("══ Q7a-3d：第一條可運作的亞洲巡迴賽 ══\n");

// ── §1 旗標 ─────────────────────────────────────────────────────────────
{
  console.log("── §1 旗標 ──");
  //  ⚠ Q7a-3f.2：**這三條的產品規則翻面了**。
  //    原本守的是「旗標預設關閉，所以『新賽季 56 場』的既有斷言仍然成立」——
  //    在基線還沒重新定義之前那是對的。3f 把基線改成「**官方聯賽** 56 場」、
  //    3f.1 把生涯成績的讀取路徑補齊之後，
  //    「新賽季包含亞洲巡迴賽」正式成為預設產品規則。
  //    現在守的是：**預設開啟**，而且 `?asiaCircuit=0` 仍是明確的逃生口。
  setFlag(null);
  ck("1a) **預設開啟**（新賽季正式包含亞洲巡迴賽）",
    FEATURE_FLAGS.asiaCircuit === true && asiaCircuitEnabled() === true);
  setFlag(true);
  ck("1b) `?asiaCircuit=1` 明確打開", asiaCircuitEnabled() === true);
  setFlag(false);
  ck("1c) **`?asiaCircuit=0` 是逃生口**（明確關閉、可回退到舊制）",
    asiaCircuitEnabled() === false);
}

// ── §2 產生器（純函式）──────────────────────────────────────────────────
let base = null, withC = null, circuitId = null;
{
  console.log("\n── §2 產生器 ──");
  base = freshSeason();
  const r = A.applyAsiaCircuit(base, { playerTeam: TEAM, seasonSeed: 4242 });
  ck("2a) 掛得上去", r.ok, `新增 ${r.added} 場`);
  withC = r.state; circuitId = r.circuitId;

  ck("2b) **1 條巡迴賽、3 站 Event、3 個賽制**",
    Object.keys(withC.circuits).length === 2 &&           // legacy 聯賽 + 亞洲巡迴
    Object.keys(withC.events).length === 4 &&
    Object.keys(withC.competitions).length === 4,
    `circuits ${Object.keys(withC.circuits).length} / events ${Object.keys(withC.events).length}`);

  const asiaEvents = Object.values(withC.events).filter((e) => e.circuitId === circuitId);
  ck("2c) **層級恰好是 regular / major / championship**（沒有新增 cup）",
    J(asiaEvents.map((e) => e.tier)) === J(["regular", "major", "championship"]),
    J(asiaEvents.map((e) => e.tier)));
  ck("2d) 巡迴賽掛的是 3c 的 `DEFAULT_POINTS_POLICY`（沒有新政策數字）",
    withC.circuits[circuitId].pointsPolicy === P.DEFAULT_POINTS_POLICY);
  ck("2e) 每一站：有名次來源、**沒有獎金**、沒有季後賽",
    asiaEvents.every((e) => !!e.rankingCompetitionId && e.prizePolicy === null) &&
    Object.values(withC.competitions).filter((c) => c.competition.circuitId === circuitId)
      .every((c) => c.expectsPlayoff === false));
  ck("2f) 每一站 8 隊單循環 ⇒ 28 場 × 3 = 84 場", r.added === 84, `${r.added} 場`);
  ck("2g) 賽制身分走 v2 推導（`idScheme: event-v2`）",
    Object.values(withC.competitions).filter((c) => c.competition.circuitId === circuitId)
      .every((c) => c.competition.idScheme === "event-v2"));
  ck("2h) 範圍驗證全過（賽制→Event→Circuit 都指得對）",
    S.validateSeasonScope(withC).ok, J(S.validateSeasonScope(withC).errors));
}

// ── §3 不動既有聯賽 ─────────────────────────────────────────────────────
{
  console.log("\n── §3 既有聯賽一場都沒動 ──");
  const leagueId = S.activeCompetitionOf(base).id;
  ck("3a) **主賽制仍是聯賽**（巡迴賽沒有把它擠掉）",
    S.activeCompetitionOf(withC).id === leagueId, leagueId);
  ck("3b) 聯賽仍是 56 場，且**每一場 id 與日期逐字未變**",
    J(S.fixturesOfCompetition(base, leagueId).map((f) => [f.id, f.day])) ===
    J(S.fixturesOfCompetition(withC, leagueId).map((f) => [f.id, f.day])) &&
    S.fixturesOfCompetition(withC, leagueId).length === 56);
  ck("3c) 聯賽那個 Event 的獎金政策沒被動到",
    J(withC.events[base.activeEventId].prizePolicy) === J(base.events[base.activeEventId].prizePolicy));
  ck("3d) 原物件沒有被就地改動", J(base.fixtures.length) === J(56));
}

// ── §4 賽程分佈 ─────────────────────────────────────────────────────────
{
  console.log("\n── §4 三站分散、不刻意同日多場 ──");
  const stops = A.ASIA_EVENTS;
  const daysOf = (i) => {
    const ev = Object.values(withC.events).find((e) => e.eventKey === stops[i].key);
    return S.fixturesOfCompetition(withC, ev.rankingCompetitionId).map((f) => f.day);
  };
  for (let i = 0; i < 3; i++) {
    const d = daysOf(i);
    ck(`4${"abc"[i]}) 第 ${i + 1} 站（${stops[i].name}）全部落在第 ${stops[i].dayRange.from}–${stops[i].dayRange.to} 天`,
      d.every((x) => x >= stops[i].dayRange.from && x <= stops[i].dayRange.to),
      `${Math.min(...d)}–${Math.max(...d)} 天，${new Set(d).size} 個比賽日`);
  }
  ck("4d) **三站的日期區間互不重疊**",
    Math.max(...daysOf(0)) < Math.min(...daysOf(1)) && Math.max(...daysOf(1)) < Math.min(...daysOf(2)));

  //  玩家自己的場次不得同日兩場（能力保留，但不刻意安排）
  const mine = withC.fixtures.filter((f) => S.isPlayerFixture(withC, f)).map((f) => f.day);
  const dup = mine.filter((d, i) => mine.indexOf(d) !== i);
  ck("4e) **玩家自己沒有同日兩場**（同日多場能力保留，但不刻意製造）",
    dup.length === 0, `玩家共 ${mine.length} 場，重複日 ${J([...new Set(dup)])}`);
  ck("4f) 玩家一季的場次數 ＝ 聯賽 14 ＋ 巡迴 21", mine.length === 35, `${mine.length} 場`);
}

// ── §5 決定性與冪等 ─────────────────────────────────────────────────────
{
  console.log("\n── §5 決定性與冪等 ──");
  const again = A.applyAsiaCircuit(freshSeason(), { playerTeam: TEAM, seasonSeed: 4242 }).state;
  const print = (s) => J(s.fixtures.map((f) => [f.id, f.day]));
  ck("5a) **同輸入逐場逐日完全相同**", print(again) === print(withC));

  const other = A.applyAsiaCircuit(
    S.createSeasonState({ playerTeam: TEAM, season: 2, seasonSeed: 4242 }).state,
    { playerTeam: TEAM, seasonSeed: 4242 }).state;
  ck("5b) 不同賽季 ⇒ 不同賽程（種子有逐季派生）", print(other) !== print(withC));

  const twice = A.applyAsiaCircuit(withC, { playerTeam: TEAM, seasonSeed: 4242 });
  ck("5c) **冪等**：已經有了就原樣回傳（同一個參考、不重複加）",
    twice.alreadyApplied && twice.state === withC && twice.added === 0);
  ck("5d) `hasAsiaCircuit` 判得出來", A.hasAsiaCircuit(withC) && !A.hasAsiaCircuit(base));
}

// ── §6 Store：旗標關著 ⇒ 現況不變 ───────────────────────────────────────
{
  console.log("\n── §6 預設開啟；逃生口仍然有效 ──");
  //  ⚠ Q7a-3f.2：原本這一節驗「旗標關著 ⇒ 現況逐場不變」。預設翻成開啟之後，
  //    那個「現況」已經是新制。改守兩件事：
  //      ① **不帶參數（預設）就會建出新制**
  //      ② **`?asiaCircuit=0` 仍然建得出完整的舊制新局**（回退路徑沒壞）
  setFlag(null);
  store().startNewGame("standard");
  const def = store().ensureCompetitionSeason();
  ck("6a) **預設新局就有三站**（56 ＋ 84 ＝ 140 場、4 個賽事）",
    def.ok && store().competition.fixtures.length === 140 &&
    Object.keys(store().competition.events).length === 4,
    `${store().competition.fixtures.length} 場`);
  ck("6a2) 預設新局的**官方聯賽仍然 56 場**", (() => {
    const c = store().competition;
    return S.fixturesOfCompetition(c, S.activeCompetitionOf(c).id).length === 56;
  })());

  setFlag(false);
  store().startNewGame("standard");
  const off = store().ensureCompetitionSeason();
  ck("6b) **`?asiaCircuit=0` 建得出舊制新局**：56 場、一個賽事、一條巡迴賽",
    off.ok && store().competition.fixtures.length === 56 &&
    Object.keys(store().competition.events).length === 1 &&
    Object.keys(store().competition.circuits).length === 1,
    `${store().competition.fixtures.length} 場`);
  ck("6c) 舊制新局沒有任何積分政策 ⇒ 巡迴積分對它維持休眠",
    Object.values(store().competition.circuits).every((c) => c.pointsPolicy == null));
  ck("6d) 舊制新局**一樣有 careerEventId**（生涯主線與旗標無關）",
    !!store().competition.careerEventId);
}

// ── §7 Store：舊存檔不得被插入 ──────────────────────────────────────────
{
  console.log("\n── §7 舊存檔不得被插入新賽事 ──");
  //  ⚠ Q7a-3f.2：舊存檔要用**明確關閉**建出來（模擬 3d 之前的存檔）。
  //    不能靠「當時的預設值剛好是關的」——預設值已經翻面了。
  setFlag(false);
  store().startNewGame("standard");
  store().ensureCompetitionSeason();
  store().save();
  const before = store().competition.fixtures.length;

  //  ⚠ 這是最容易出事的情境：玩家舊存檔已經有賽季，之後旗標被打開。
  setFlag(true);
  const fresh = (await import("../src/platform/profileStore.js?d3d=1")).useProfileStore;
  ck("7a) 旗標打開後**重載舊存檔，賽程仍是 56 場**（沒有被中途插入）",
    fresh.getState().competition.fixtures.length === before, `${fresh.getState().competition.fixtures.length} 場`);
  ck("7b) 舊存檔仍然只有一個賽事",
    Object.keys(fresh.getState().competition.events).length === 1);
  const again = fresh.getState().ensureCompetitionSeason();
  ck("7c) 再呼叫 `ensureCompetitionSeason()` 也不會補上（已有賽季就 return）",
    again.created === false && fresh.getState().competition.fixtures.length === before);
}

// ── §8 Store：旗標開著 ⇒ 三站真的會跑 ───────────────────────────────────
let live = null;
{
  console.log("\n── §8 旗標開著：新賽季帶三站 ──");
  setFlag(true);
  store().startNewGame("standard");
  const ens = store().ensureCompetitionSeason();
  live = store().competition;
  ck("8a) **新賽季 56 + 84 = 140 場**", ens.ok && live.fixtures.length === 140, `${live.fixtures.length} 場`);
  ck("8b) 4 個賽事、2 條巡迴賽",
    Object.keys(live.events).length === 4 && Object.keys(live.circuits).length === 2);
  ck("8c) 亞洲巡迴賽帶著積分政策 ⇒ **機制不再休眠**",
    !!live.circuits[A.asiaCircuitIdFor("moba", live.season)]?.pointsPolicy);
  ck("8d) 三站的積分狀態都是 `not_started`（還沒打完，不是缺政策）",
    Object.entries(live.events)
      .filter(([, e]) => e.circuitId === A.asiaCircuitIdFor("moba", live.season))
      .every(([id]) => P.pointsStatusOfEvent(live, id, S.eventFinalOf).status === P.POINTS_STATUS.not_started));
  ck("8e) 存檔存得下（重載後場次數不變）", (() => {
    store().save();
    return JSON.parse(LS).competition.fixtures.length === 140;
  })());
}

// ── §9 端到端：打完三站 → 積分 → 巡迴排名 → Top 4 晉級 ──────────────────
{
  console.log("\n── §9 端到端：三站打完 → 晉級名單 ──");
  const cid = A.asiaCircuitIdFor("moba", live.season);
  const asiaEventIds = Object.entries(live.events).filter(([, e]) => e.circuitId === cid).map(([id]) => id);

  //  ⚠ 用**決定性**勝負把三站打完：每一站換一種排序規則，三站名次才不會一樣。
  //    （真的要模擬戰鬥的話這支要跑幾十分鐘，而這裡要驗的是積分鏈不是戰鬥。）
  let s = live;
  asiaEventIds.forEach((eid, i) => {
    const compId = s.events[eid].rankingCompetitionId;
    for (const f of S.fixturesOfCompetition(s, compId)) {
      const cmp = String(f.sideA).localeCompare(String(f.sideB));
      //  第 1 站 id 小的贏、第 2 站 id 大的贏、第 3 站看輪次奇偶 ⇒ 三張榜都不同
      const winner = i === 0 ? (cmp < 0 ? f.sideA : f.sideB)
        : i === 1 ? (cmp > 0 ? f.sideA : f.sideB)
        : (f.round % 2 === 1 ? f.sideA : f.sideB);
      s = S.applyLaunch(s, f.id).state;
      s = S.applyCompleted(s, { fixtureId: f.id, winner, score: { a: 2, b: 0 }, duration: 1800, seed: 7 }).state;
    }
  });
  useProfileStore.setState({ competition: s });
  const fundsBefore = store().finance.funds;
  const awardsBefore = Object.keys(store().processedCompetitionAwards ?? {}).length;
  store()._sealSeasonIfFinished();
  const after = store().competition;

  ck("9a) **三站都封存了**（聯賽還沒打完，不受影響）",
    asiaEventIds.every((id) => !!S.eventFinalOf(after, id)) && !S.eventFinalOf(after, after.activeEventId),
    `${asiaEventIds.filter((id) => S.eventFinalOf(after, id)).length}/3`);
  ck("9b) **積分自動結算**：8 隊 × 3 站 = 24 筆",
    P.pointsLogOf(after).length === 24, `${P.pointsLogOf(after).length} 筆`);
  ck("9c) 三站狀態都是 settled",
    asiaEventIds.every((id) => P.pointsStatusOfEvent(after, id, S.eventFinalOf).status === P.POINTS_STATUS.settled));

  const table = P.circuitStandings(after, cid);
  ck("9d) **整季巡迴排名**：8 隊、名次 1..8 連續全序",
    table.rows.length === 8 && J(table.rows.map((r) => r.rank)) === J([1, 2, 3, 4, 5, 6, 7, 8]),
    J(table.rows.map((r) => `${r.rank}.${r.points}`)));
  ck("9e) 每一列的分數 ＝ 帳本加總（驗證器獨立重算）", (() => {
    const sum = new Map();
    for (const e of P.pointsLogOf(after)) if (e.circuitId === cid) sum.set(e.teamId, (sum.get(e.teamId) ?? 0) + e.points);
    return table.rows.every((r) => r.points === sum.get(r.teamId));
  })());
  ck("9f) 三站冠軍不是同一隊（三張榜真的不同）",
    new Set(asiaEventIds.map((id) => S.eventFinalOf(after, id).rows[0].teamId)).size >= 2,
    J(asiaEventIds.map((id) => S.eventFinalOf(after, id).rows[0].teamId.slice(5, 9))));
  ck("9g) championship 站套 2.0 倍（冠軍 200 分）",
    P.pointsLogOf(after).some((e) => e.tier === "championship" && e.rank === 1 && e.points === 200));

  const quals = P.qualificationsOf(after);
  ck("9h) **Top 4 晉級資格自動核發**",
    quals.length === 1 && quals[0].qualified.length === 4 &&
    J(quals[0].qualified.map((x) => x.teamId)) === J(table.rows.slice(0, 4).map((r) => r.teamId)),
    J(quals[0]?.qualified?.map((x) => `${x.seed}.${x.points}`)));
  ck("9i) 資格是正式資料（存進賽季狀態、帶得走）",
    !!after.qualifications[quals[0].id] && quals[0].schema === "CircuitQualification.v1");
  ck("9j) **完全沒有動到錢**（三站都沒有獎金政策）",
    store().finance.funds === fundsBefore &&
    Object.keys(store().processedCompetitionAwards ?? {}).length === awardsBefore,
    `$${fundsBefore} → $${store().finance.funds}`);

  const snap = J({ log: P.pointsLogOf(after), q: P.qualificationsOf(after) });
  for (let i = 0; i < 3; i++) store()._sealSeasonIfFinished();
  ck("9k) 再跑 3 次，積分與資格逐字不變",
    J({ log: P.pointsLogOf(store().competition), q: P.qualificationsOf(store().competition) }) === snap);
}

// ── §10 換季：巡迴成果不得消失 ──────────────────────────────────────────
{
  console.log("\n── §10 換季封存巡迴摘要 ──");
  //  把聯賽也打完 ⇒ 整季封存 ⇒ 才換得了季
  for (let i = 0; i < 300; i++) {
    const v = store().competitionView();
    if (v.final) break;
    const pending = v.todayPending ?? [];
    if (pending.length) { for (const f of pending) store().forfeitFixture(f.id); continue; }
    const b = store().meta.days;
    store().advanceDay(7);
    if (store().meta.days === b) break;
  }
  ck("10a) 整季封存得了", !!store().competition.final);

  const cid = A.asiaCircuitIdFor("moba", store().competition.season);
  const beforeTable = P.circuitStandings(store().competition, cid);
  const rolled = store().rollToNextCompetitionSeason();
  ck("10b) 換得了季", rolled.ok, rolled.reason ?? `第 ${rolled.season} 季`);

  const hist = store().circuitHistory ?? [];
  ck("10c) **巡迴摘要有進歷史**", hist.length === 1 && hist[0].schema === "CircuitSeasonSummary.v1",
    `${hist.length} 筆`);
  const h = hist[0];
  ck("10d) 摘要帶著**各站最終名次與該站得分**",
    h.events.length === 3 && h.events.every((e) => e.rows.length === 8 && e.rows[0].rank === 1 && "points" in e.rows[0]),
    J(h.events.map((e) => `${e.name}:${e.rows[0].points}`)));
  ck("10e) 摘要帶著**最終總分與巡迴排名**（與換季前逐字相同）",
    J(h.standings.map((r) => [r.rank, r.teamId, r.points])) ===
    J(beforeTable.rows.map((r) => [r.rank, r.teamId, r.points])));
  ck("10f) 摘要帶著**晉級名單**", h.qualification?.qualified?.length === 4);
  ck("10g) 摘要記得玩家自己的名次與分數",
    h.playerTeamId === store().team.id && typeof h.playerRank === "number" && typeof h.playerPoints === "number",
    `第 ${h.playerRank} 名 / ${h.playerPoints} 分`);

  ck("10h) **新賽季的積分歸零**（每季重來）",
    P.pointsLogOf(store().competition).length === 0 &&
    P.qualificationsOf(store().competition).length === 0);
  ck("10i) 新賽季也帶著三站（旗標仍開著）",
    Object.keys(store().competition.events).length === 4 &&
    !!store().competition.circuits[A.asiaCircuitIdFor("moba", store().competition.season)]?.pointsPolicy);

  store().save();
  const fresh = (await import("../src/platform/profileStore.js?d3d=2")).useProfileStore;
  ck("10j) **重載後歷史還在**（摘要真的落盤了）",
    J(fresh.getState().circuitHistory) === J(hist), `${(fresh.getState().circuitHistory ?? []).length} 筆`);
}

// ── §11 紅線（原始碼掃描）───────────────────────────────────────────────
{
  console.log("\n── §11 紅線 ──");
  const ac = readCode("src/platform/competition/asiaCircuit.js");
  const ss = readCode("src/platform/competition/seasonState.js");

  ck("11a) 產生器是純函式（不 import React／zustand／localStorage／亂數／時鐘）",
    !/from\s+["'](react|zustand)|localStorage|Math\.random|Date\.now/.test(ac));
  ck("11b) **不碰錢**", !/funds|transactions|COMPETITION_PRIZE|settleCompetitionAward/.test(ac));
  ck("11c) **沒有新增積分政策數字**（分數只從 DEFAULT_POINTS_POLICY 來）",
    !/\b(100|70|50|35|15)\b/.test(ac) && /DEFAULT_POINTS_POLICY/.test(ac));
  ck("11d) **沒有新增 cup tier**", !/["']cup["']/.test(ac));
  ck("11e) Q5 §7d 仍然成立：賽季層沒有積分玩法", !/circuitPoints/i.test(ss));
  ck("11f) **賽季層不知道亞洲巡迴賽**（產生器由 Store 編排，不是塞進 seasonState）",
    !/asiaCircuit/i.test(ss));
  ck("11g) 沒有做 UI／年度總決賽消費端／時段／老化／轉會／Shop／MMR",
    !/\.jsx|championshipEntry|timeSlot|agePlayer|transfer|shop|\bmmr\b/i.test(ac));
  ck("11h) 沒有動 Battle Engine", !/LogicEngine|battleResult/i.test(ac));
}

console.log(`\n${pass}/${pass + fail} 通過`);
process.exit(fail === 0 ? 0 : 1);
