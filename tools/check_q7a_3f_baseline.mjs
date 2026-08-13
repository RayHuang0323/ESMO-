#!/usr/bin/env node
// ============================================================================
//  tools/check_q7a_3f_baseline.mjs — 賽季基線與 legacy 政策（Q7a-3f）
//
//  執行：repo 根目錄 `node tools/check_q7a_3f_baseline.mjs`；失敗 exit 1。
//
//  ── 這一支在證明什麼 ────────────────────────────────────────────────────
//  3f 的核心主張是：**「MOBA 官方聯賽 56 場」才是不變式，「整季總共 56 場」
//  不是。** 本檔把這個主張釘成可執行的斷言，並且**兩種旗標組態都要成立**——
//  只在一種組態下成立的基線不叫基線。
//
//  另外釘住 legacy 政策：**舊存檔在任何情況下都不得被偷偷插入巡迴賽。**
//  旗標打開後載入舊存檔、再呼叫一次建立、甚至重載，場次與賽事數都不准變。
//
//  ⚠ 本檔**不打開旗標預設值**。它用網址參數驅動兩種組態，正式預設維持 false。
// ============================================================================
const KEY = "esmo.profile.v1";
let LS = null;
globalThis.localStorage = {
  getItem: (k) => (k === KEY ? LS : null),
  setItem: (k, v) => { if (k === KEY) LS = v; },
  removeItem: () => { LS = null; },
};
globalThis.window = { location: { search: "" } };
const setFlag = (on) => { globalThis.window.location.search = on == null ? "" : `?asiaCircuit=${on ? 1 : 0}`; };

const S = await import("../src/platform/competition/seasonState.js");
const P = await import("../src/platform/competition/circuitPoints.js");
const A = await import("../src/platform/competition/asiaCircuit.js");
const { FEATURE_FLAGS, asiaCircuitEnabled } = await import("../src/featureFlags.js");
const { useProfileStore } = await import("../src/platform/profileStore.js");

const st = () => useProfileStore.getState();
let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`✅ ${name}${detail ? "　" + detail : ""}`); }
  else { fail++; console.log(`❌ ${name}${detail ? "　" + detail : ""}`); }
};
const J = (x) => JSON.stringify(x);

//  ── 新基線的兩條表達式（與 Q3／Q5 改寫後用的是同一組概念）──────────────
const officialLeagueId = (state) => S.activeCompetitionOf(state)?.id ?? null;
const leagueCount = (state) => S.fixturesOfCompetition(state, officialLeagueId(state)).length;
const addsUp = (state) =>
  (state?.fixtures ?? []).length ===
  S.competitionEntries(state).reduce((n, e) => n + S.fixturesOfCompetition(state, e.competition.id).length, 0);

console.log("══ Q7a-3f：賽季基線與 legacy 政策 ══\n");

// ── §1 旗標預設 ─────────────────────────────────────────────────────────
{
  console.log("── §1 旗標 ──");
  //  ⚠ Q7a-3f.2：3f 那一輪這裡守的是「本輪未啟用」。前置條件（新基線、
  //    生涯成績相容層、效能量測、legacy 政策）全部完成之後，預設正式翻成開啟。
  setFlag(null);
  ck("1a) `asiaCircuit` **預設為 true**（新賽季正式包含亞洲巡迴賽）",
    FEATURE_FLAGS.asiaCircuit === true && asiaCircuitEnabled() === true);
  setFlag(true);
  ck("1b) `?asiaCircuit=1` 打得開", asiaCircuitEnabled() === true);
  setFlag(false);
  ck("1c) **`?asiaCircuit=0` 是逃生口**（日後預設打開時用來回退）",
    asiaCircuitEnabled() === false);
}

// ── §2 新基線：兩種組態都成立 ───────────────────────────────────────────
let baseOff = null, baseOn = null;
{
  console.log("\n── §2 新基線（官方聯賽 56 場，不是全季 56 場）──");
  setFlag(false);
  st().startNewGame("standard");
  st().ensureCompetitionSeason();
  baseOff = st().competition;

  setFlag(true);
  st().startNewGame("standard");
  st().ensureCompetitionSeason();
  baseOn = st().competition;

  ck("2a) **官方聯賽 56 場**——旗標關著", leagueCount(baseOff) === 56, `${leagueCount(baseOff)} 場`);
  ck("2b) **官方聯賽 56 場**——旗標開著（真正的不變式，兩種組態都成立）",
    leagueCount(baseOn) === 56, `${leagueCount(baseOn)} 場／全季 ${baseOn.fixtures.length} 場`);
  ck("2c) 主賽制在兩種組態下是同一個（巡迴賽沒有把聯賽擠掉）",
    officialLeagueId(baseOn) === officialLeagueId(baseOff), officialLeagueId(baseOn));
  ck("2d) 聯賽**每一場的 id 與日期逐字相同**（巡迴賽沒有動到它）",
    J(S.fixturesOfCompetition(baseOff, officialLeagueId(baseOff)).map((f) => [f.id, f.day])) ===
    J(S.fixturesOfCompetition(baseOn, officialLeagueId(baseOn)).map((f) => [f.id, f.day])));
  ck("2e) **總場次 ＝ 各賽制加總**——旗標關著（沒有孤兒場次）", addsUp(baseOff));
  ck("2f) **總場次 ＝ 各賽制加總**——旗標開著", addsUp(baseOn));
  ck("2g) 新制整季總場次 ＝ 56 ＋ 3 × 28 ＝ 140",
    baseOn.fixtures.length === 140 && baseOn.fixtures.length - leagueCount(baseOn) === 84,
    `${baseOn.fixtures.length} 場`);
  ck("2h) 舊的全域斷言若還在，**旗標開著時必然誤紅**（這就是它該退場的理由）",
    baseOff.fixtures.length === 56 && baseOn.fixtures.length !== 56);
}

// ── §3 三站身分 / 層級 / 積分政策 ───────────────────────────────────────
{
  console.log("\n── §3 三站身分正確 ──");
  const cid = A.asiaCircuitIdFor("moba", baseOn.season);
  const evs = Object.values(baseOn.events).filter((e) => e.circuitId === cid);
  ck("3a) 一條巡迴賽、三站", !!baseOn.circuits[cid] && evs.length === 3);
  ck("3b) **層級恰好 regular / major / championship**（沒有新增層級）",
    J(evs.map((e) => e.tier)) === J(["regular", "major", "championship"]), J(evs.map((e) => e.tier)));
  ck("3c) 巡迴賽掛的是 3c 的 `DEFAULT_POINTS_POLICY`（積分數字未被改動）",
    baseOn.circuits[cid].pointsPolicy === P.DEFAULT_POINTS_POLICY);
  ck("3d) 每一站的倍率查得到（不會卡在 policy_required）",
    evs.every((e) => P.multiplierFor(P.DEFAULT_POINTS_POLICY, e) != null),
    J(evs.map((e) => P.multiplierFor(P.DEFAULT_POINTS_POLICY, e))));
  ck("3e) 每一站有名次來源、無獎金、無季後賽",
    evs.every((e) => !!e.rankingCompetitionId && e.prizePolicy === null) &&
    Object.values(baseOn.competitions).filter((c) => c.competition.circuitId === cid)
      .every((c) => c.expectsPlayoff === false));
  ck("3f) 賽事識別碼走 v2 推導",
    Object.values(baseOn.competitions).filter((c) => c.competition.circuitId === cid)
      .every((c) => c.competition.idScheme === "event-v2"));
  ck("3g) 範圍驗證全過", S.validateSeasonScope(baseOn).ok, J(S.validateSeasonScope(baseOn).errors));
}

// ── §4 legacy 政策：舊存檔不得被注入 ────────────────────────────────────
{
  console.log("\n── §4 舊存檔在任何情況下都不得被注入 ──");
  //  ① 旗標關著建立一個「進行中的舊賽季」，而且已經打了幾場
  setFlag(false);
  st().startNewGame("standard");
  st().ensureCompetitionSeason();
  st().advanceDay(20);
  st().save();
  const before = {
    fixtures: st().competition.fixtures.length,
    events: Object.keys(st().competition.events).length,
    circuits: Object.keys(st().competition.circuits).length,
    outcomes: (st().competition.outcomes ?? []).length,
    ids: J(st().competition.fixtures.map((f) => f.id)),
    season: st().competition.season,
  };
  ck("4a) 起點：舊賽季 56 場、1 個賽事、已經打過幾場",
    before.fixtures === 56 && before.events === 1 && before.outcomes > 0,
    `${before.fixtures} 場 / ${before.outcomes} 筆賽果`);

  //  ② 旗標打開之後重載
  setFlag(true);
  const fresh = (await import("../src/platform/profileStore.js?q7a3f=1")).useProfileStore;
  const f = () => fresh.getState();
  ck("4b) **旗標打開後重載舊存檔：場次數不變**",
    f().competition.fixtures.length === before.fixtures, `${f().competition.fixtures.length} 場`);
  ck("4c) **賽事數與巡迴賽數不變**（沒有被插入三站）",
    Object.keys(f().competition.events).length === before.events &&
    Object.keys(f().competition.circuits).length === before.circuits);
  ck("4d) **每一個 fixture id 逐字未變**", J(f().competition.fixtures.map((x) => x.id)) === before.ids);
  ck("4e) 已經打過的賽果沒有被動到", (f().competition.outcomes ?? []).length === before.outcomes);

  //  ③ 再呼叫一次建立（畫面每次進賽事頁都會呼叫）
  const again = f().ensureCompetitionSeason();
  ck("4f) **再呼叫 `ensureCompetitionSeason()` 也不會補上**（已有賽季就 return）",
    again.created === false && f().competition.fixtures.length === before.fixtures);
  ck("4g) 舊存檔沒有任何積分政策 ⇒ 巡迴積分機制對它維持休眠",
    Object.values(f().competition.circuits).every((c) => c.pointsPolicy == null) &&
    P.pointsLogOf(f().competition).length === 0);
}

// ── §5 換季才進新制 ─────────────────────────────────────────────────────
{
  console.log("\n── §5 舊存檔要換季之後才進新制 ──");
  setFlag(true);
  //  沿用上面那個舊賽季，把它打完並換季
  st().startNewGame("standard");
  setFlag(false);
  st().ensureCompetitionSeason();            // 舊制：56 場
  const s1 = st().competition.fixtures.length;
  setFlag(true);                             // 從這裡開始旗標是開的
  for (let i = 0; i < 400; i++) {
    const v = st().competitionView();
    if (v.final) break;
    const pend = v.todayPending ?? [];
    if (pend.length) { for (const x of pend) st().forfeitFixture(x.id); continue; }
    const b = st().meta.days; st().advanceDay(7); if (st().meta.days === b) break;
  }
  //  ⚠ 整季跑完之後聯賽會多出 4 場**季後賽**（Q6），所以這裡要看**常規賽**場次，
  //    不能看總數——第一版拿總數比，量到 60 就以為被插入了，其實是季後賽。
  const leagueRegular = S.regularFixturesOfCompetition(st().competition, officialLeagueId(st().competition)).length;
  ck("5a) 舊賽季整季維持舊制（常規賽仍 56 場、**沒有多出任何賽事或巡迴賽**）",
    s1 === 56 && leagueRegular === 56 &&
    Object.keys(st().competition.events).length === 1 &&
    Object.keys(st().competition.circuits).length === 1,
    `常規賽 ${leagueRegular} 場＋季後賽 ${st().competition.fixtures.length - leagueRegular} 場`);
  const rolled = st().rollToNextCompetitionSeason();
  ck("5b) 換得了季", rolled.ok, rolled.reason ?? `第 ${rolled.season} 季`);
  ck("5c) **換季之後的新賽季才進新制**（140 場、4 個賽事）",
    st().competition.fixtures.length === 140 && Object.keys(st().competition.events).length === 4,
    `${st().competition.fixtures.length} 場`);
  ck("5d) 新賽季的官方聯賽仍然 56 場", leagueCount(st().competition) === 56);
  ck("5e) 新賽季總場次 ＝ 各賽制加總", addsUp(st().competition));
}

// ── §6 新制整季：積分 / 資格 / 歷史仍然正確 ─────────────────────────────
{
  console.log("\n── §6 新制整季端到端 ──");
  setFlag(true);
  st().startNewGame("standard");
  st().ensureCompetitionSeason();
  let s = st().competition;
  const cid = A.asiaCircuitIdFor("moba", s.season);
  const ids = Object.entries(s.events).filter(([, e]) => e.circuitId === cid).map(([id]) => id);
  ids.forEach((eid, i) => {
    const compId = s.events[eid].rankingCompetitionId;
    for (const fx of S.fixturesOfCompetition(s, compId)) {
      const cmp = String(fx.sideA).localeCompare(String(fx.sideB));
      const winner = i === 0 ? (cmp < 0 ? fx.sideA : fx.sideB)
        : i === 1 ? (cmp > 0 ? fx.sideA : fx.sideB)
        : (fx.round % 2 === 1 ? fx.sideA : fx.sideB);
      s = S.applyLaunch(s, fx.id).state;
      s = S.applyCompleted(s, { fixtureId: fx.id, winner, score: { a: 2, b: 0 }, duration: 1800, seed: 7 }).state;
    }
  });
  useProfileStore.setState({ competition: s });
  const fundsBefore = st().finance.funds;
  st()._sealSeasonIfFinished();
  const after = st().competition;

  ck("6a) 三站封存、積分 24 筆", ids.every((id) => !!S.eventFinalOf(after, id)) &&
    P.pointsLogOf(after).length === 24, `${P.pointsLogOf(after).length} 筆`);
  const table = P.circuitStandings(after, cid);
  ck("6b) 巡迴排名 8 隊、名次 1..8 全序",
    J(table.rows.map((r) => r.rank)) === J([1, 2, 3, 4, 5, 6, 7, 8]),
    J(table.rows.map((r) => r.points)));
  ck("6c) Top 4 資格已核發，且與榜一致",
    P.qualificationsOf(after).length === 1 &&
    J(P.qualificationsOf(after)[0].qualified.map((x) => x.teamId)) === J(table.rows.slice(0, 4).map((r) => r.teamId)));
  ck("6d) **巡迴賽不碰錢**（三站無獎金政策）", st().finance.funds === fundsBefore, `$${fundsBefore}`);
  ck("6e) 官方聯賽此時尚未封存（三站與聯賽互不影響）", !S.eventFinalOf(after, after.activeEventId));

  //  換季摘要
  for (let i = 0; i < 500; i++) {
    const v = st().competitionView();
    if (v.final) break;
    const pend = v.todayPending ?? [];
    if (pend.length) { for (const x of pend) st().forfeitFixture(x.id); continue; }
    const b = st().meta.days; st().advanceDay(7); if (st().meta.days === b) break;
  }
  const rolled = st().rollToNextCompetitionSeason();
  ck("6f) 整季封存並換得了季", rolled.ok, rolled.reason ?? "");
  const hist = st().circuitHistory ?? [];
  ck("6g) 巡迴摘要進了歷史（各站名次與得分、總分、總排名、晉級名單）",
    hist.length === 1 && hist[0].events.length === 3 && hist[0].standings.length === 8 &&
    hist[0].qualification?.qualified?.length === 4);
  ck("6h) 新賽季積分歸零、且帶著新的三站",
    P.pointsLogOf(st().competition).length === 0 &&
    Object.keys(st().competition.events).length === 4);
}

// ── §7 已知阻擋：多 Event 賽季的 `final` ────────────────────────────────
{
  console.log("\n── §7 ⚠ 已知阻擋（旗標尚不能預設打開的唯一原因）──");
  //  ⚠ 這一節**釘住現況**，不是宣稱現況是對的。
  //    3b 的設計是「多 Event ⇒ 賽季本身不再產生總名次」，於是 `state.final`
  //    變成 `SeasonSeal.v1`（沒有 rows / playerRank / championTeamId）。
  //    畫面與歷史都直接讀那幾個欄位 ⇒ 旗標一開，賽季結算頁會顯示「第 undefined 名」。
  //    要打開旗標，得先決定「多 Event 賽季的最終名次是什麼」。
  setFlag(false);
  st().startNewGame("standard"); st().ensureCompetitionSeason();
  for (let i = 0; i < 400; i++) {
    const v = st().competitionView();
    if (v.final) break;
    const pend = v.todayPending ?? [];
    if (pend.length) { for (const x of pend) st().forfeitFixture(x.id); continue; }
    const b = st().meta.days; st().advanceDay(7); if (st().meta.days === b) break;
  }
  const single = st().competition.final;
  ck("7a) 單一 Event（現況）：`state.final` 是完整的 FinalStandings",
    single?.schema === "FinalStandings.v1" && Array.isArray(single?.rows) &&
    typeof single?.playerRank === "number", `${single?.rows?.length} 列，我第 ${single?.playerRank} 名`);

  setFlag(true);
  st().startNewGame("standard"); st().ensureCompetitionSeason();
  for (let i = 0; i < 500; i++) {
    const v = st().competitionView();
    if (v.final) break;
    const pend = v.todayPending ?? [];
    if (pend.length) { for (const x of pend) st().forfeitFixture(x.id); continue; }
    const b = st().meta.days; st().advanceDay(7); if (st().meta.days === b) break;
  }
  const multi = st().competition.final;
  ck("7b) ⚠ 多 Event：`state.final` 退化成 `SeasonSeal.v1`",
    multi?.schema === "SeasonSeal.v1", multi?.schema);
  ck("7c) ⚠ 因此 `rows` / `playerRank` / `championTeamId` 全都是 undefined",
    multi?.rows === undefined && multi?.playerRank === undefined && multi?.championTeamId === undefined);
  //  ⚠ 這一條原本記錄的是**阻擋**（畫面直讀 `final.playerRank` ⇒ 會顯示
  //    「第 undefined 名」）。3f.1 把畫面改走生涯 accessor 之後，它翻面成守衛：
  //    **畫面不得再直讀賽季封存物件的名次欄位**。
  ck("7d) 畫面**不再直讀**賽季封存物件的名次欄位（改走生涯 accessor）",
    !/final\.(playerRank|rows|championTeamId)/.test(
      await (await import("node:fs")).promises.readFile(
        new URL("../src/screens/manage/CompetitionScreen.jsx", import.meta.url), "utf8")));
  ck("7e) ⚠ 但**金流不受影響**（獎金按 Event 結算，不靠 `state.final`）",
    Object.keys(st().processedCompetitionAwards ?? {}).length >= 1,
    `獎金帳本 ${Object.keys(st().processedCompetitionAwards ?? {}).length} 筆`);
}

console.log(`\n${pass}/${pass + fail} 通過`);
process.exit(fail === 0 ? 0 : 1);
