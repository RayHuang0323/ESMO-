#!/usr/bin/env node
// ============================================================================
//  tools/check_q7d_honors.mjs — 生涯榮耀（Milestone Q7d）
//
//  執行：repo 根目錄 `node tools/check_q7d_honors.mjs`；失敗 exit 1。
//
//  ── 這一支在證明什麼 ────────────────────────────────────────────────────
//  榮耀是**會累積一輩子**的東西：寫錯一次不會當場爆掉，只會讓歷史頁多一筆
//  或少一筆，而那筆錯誤永遠留著。所以重點在三件事：
//    ① 來源唯一（只從年度總決賽已封存的 `Event.final`）
//    ② 一季一筆（重跑／重載／換季／重送都不會多）
//    ③ 換季之後不會消失，而且**是世界歷史**——AI 奪冠照樣寫
// ============================================================================
const KEY = "esmo.profile.v1";
let LS = null;
globalThis.localStorage = {
  getItem: (k) => (k === KEY ? LS : null),
  setItem: (k, v) => { if (k === KEY) LS = v; },
  removeItem: () => { LS = null; },
};
globalThis.window = { location: { search: "" } };   // 預設 asiaCircuit = true
import { readFileSync } from "node:fs";

const S = await import("../src/platform/competition/seasonState.js");
const P = await import("../src/platform/competition/circuitPoints.js");
const A = await import("../src/platform/competition/asiaCircuit.js");
const F = await import("../src/platform/competition/asiaFinals.js");
const H = await import("../src/platform/competition/honors.js");
const { useProfileStore } = await import("../src/platform/profileStore.js");

const st = () => useProfileStore.getState();
let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`✅ ${name}${detail ? "　" + detail : ""}`); }
  else { fail++; console.log(`❌ ${name}${detail ? "　" + detail : ""}`); }
};
const readCode = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const J = (x) => JSON.stringify(x);
const short = (id) => String(id).slice(5, 9);

/** 打完三站巡迴賽 ⇒ 資格核發 ⇒ 年度總決賽建立。 */
function playThreeStops() {
  let s = st().competition;
  const cid = A.asiaCircuitIdFor("moba", s.season);
  const ids = Object.entries(s.events).filter(([, e]) => e.circuitId === cid).map(([id]) => id);
  ids.forEach((eid, i) => {
    const comp = s.events[eid].rankingCompetitionId;
    for (const f of S.fixturesOfCompetition(s, comp)) {
      const cmp = String(f.sideA).localeCompare(String(f.sideB));
      const w = i === 0 ? (cmp < 0 ? f.sideA : f.sideB)
        : i === 1 ? (cmp > 0 ? f.sideA : f.sideB)
        : (f.round % 2 === 1 ? f.sideA : f.sideB);
      s = S.applyLaunch(s, f.id).state;
      s = S.applyCompleted(s, { fixtureId: f.id, winner: w, score: { a: 2, b: 0 }, duration: 1800, seed: 7 }).state;
    }
  });
  useProfileStore.setState({ competition: s });
  st()._sealSeasonIfFinished();
}

/** 打完年度總決賽的四場（勝方由 pick 決定）。 */
function playFinals(pick) {
  for (const key of ["sf1", "sf2", "bronze", "final"]) {
    let s = st().competition;
    const ev = F.asiaFinalsEventOf(s);
    const entry = s.competitions[ev.rankingCompetitionId];
    const f = (s.fixtures ?? []).find((x) => x.stageId === entry.playoff.stage.id && x.playoffKey === key);
    if (!f) continue;
    s = S.applyLaunch(s, f.id).state;
    s = S.applyCompleted(s, { fixtureId: f.id, winner: pick(f, key), score: { a: 2, b: 1 }, duration: 1800, seed: 11 }).state;
    useProfileStore.setState({ competition: s });
    st()._sealSeasonIfFinished();
  }
}

/** 把整季打完（官方聯賽用棄權快速收尾）。 */
function finishSeason(limit = 700) {
  for (let i = 0; i < limit; i++) {
    const v = st().competitionView();
    if (v.final) return;
    const pend = v.todayPending ?? [];
    if (pend.length) { for (const f of pend) st().forfeitFixture(f.id); continue; }
    const b = st().meta.days; st().advanceDay(7); if (st().meta.days === b) return;
  }
}

console.log("══ Q7d：生涯榮耀 ══\n");

// ── §1 沒打完就沒有榮耀 ─────────────────────────────────────────────────
{
  console.log("── §1 fail-closed ──");
  st().startNewGame("standard");
  st().ensureCompetitionSeason();
  ck("1a) 新賽季榮耀是空的", H.honorsOf(st().honors).length === 0);

  playThreeStops();
  ck("1b) 三站打完、年度總決賽已建立，但**還沒有榮耀**",
    F.hasAsiaFinals(st().competition) && H.honorsOf(st().honors).length === 0);

  //  只打準決賽 ⇒ Event 未封存 ⇒ 不得有榮耀
  for (const key of ["sf1", "sf2"]) {
    let s = st().competition;
    const ev = F.asiaFinalsEventOf(s);
    const entry = s.competitions[ev.rankingCompetitionId];
    const f = (s.fixtures ?? []).find((x) => x.stageId === entry.playoff.stage.id && x.playoffKey === key);
    s = S.applyLaunch(s, f.id).state;
    s = S.applyCompleted(s, { fixtureId: f.id, winner: f.sideB, score: { a: 2, b: 1 }, duration: 1800, seed: 11 }).state;
    useProfileStore.setState({ competition: s });
    st()._sealSeasonIfFinished();
  }
  ck("1c) **準決賽打完但 Event 未封存 ⇒ 仍然沒有榮耀**",
    !S.eventFinalOf(st().competition, F.asiaFinalsEventOf(st().competition).id) &&
    H.honorsOf(st().honors).length === 0);
  ck("1d) 純函式層也回 null（不是靠 Store 擋的）",
    H.annualChampionHonorOf(st().competition, S.eventFinalOf) === null);
}

// ── §2 封存後自動寫入一筆 ───────────────────────────────────────────────
let honor = null, championId = null;
{
  console.log("\n── §2 封存 ⇒ 自動記錄 ──");
  //  補完季軍戰與決賽
  playFinals((f, key) => f.sideA);
  const c = st().competition;
  const ev = F.asiaFinalsEventOf(c);
  const final = S.eventFinalOf(c, ev.id);
  championId = final.championTeamId;

  ck("2a) 年度總決賽已封存", !!final && final.schema === "FinalStandings.v1");
  const honors = H.honorsOf(st().honors);
  ck("2b) **自動寫入一筆榮耀**", honors.length === 1, J(honors.map((h) => h.id)));
  honor = honors[0];

  ck("2c) **冠軍逐 teamId 等於 `Event.final.championTeamId`**",
    honor.championTeamId === final.championTeamId, short(honor.championTeamId));
  ck("2d) 隊名與名次來自 final 的那一列",
    honor.championTeamName === final.rows.find((r) => r.teamId === final.championTeamId).name &&
    honor.finalRank === 1, `${honor.championTeamName} 第 ${honor.finalRank} 名`);
  ck("2e) **帶來源存證** `sourceFinalId`", honor.sourceFinalId === final.id, honor.sourceFinalId);
  ck("2f) 欄位齊備（season／gameMode／eventId／eventName／honorType／earnedAt）",
    honor.season === c.season && honor.gameMode === "moba" &&
    honor.eventId === ev.id && honor.eventName === ev.name &&
    honor.honorType === H.HONOR_TYPES.asiaAnnualChampion &&
    typeof honor.earnedAtDay === "number",
    `S${honor.season} · ${honor.eventName} · 第 ${honor.earnedAtDay} 天`);
  ck("2g) id 由**類型＋項目＋賽季**決定性推導",
    honor.id === H.honorIdFor(H.HONOR_TYPES.asiaAnnualChampion, "moba", c.season), honor.id);
  ck("2h) 結構驗證通過", H.validateHonors(st().honors).ok, J(H.validateHonors(st().honors).errors));
  ck("2i) 玩家收得到通知", (st().inbox ?? []).some((m) => /年度冠軍/.test(m.subject ?? "")));
}

// ── §3 冪等 ─────────────────────────────────────────────────────────────
{
  console.log("\n── §3 冪等 ──");
  const snap = J(st().honors);
  for (let i = 0; i < 5; i++) st()._sealSeasonIfFinished();
  ck("3a) **重跑封存 5 次不重複寫**", J(st().honors) === snap && st().honors.length === 1);

  for (let i = 0; i < 3; i++) st()._recordHonors(st().competition);
  ck("3b) 直接重複呼叫 sweep 也不重複", J(st().honors) === snap);

  const again = H.recordPendingHonors(st().competition, st().honors, S.eventFinalOf);
  ck("3c) 純函式層：已存在 ⇒ **回傳同一個陣列參考**（不產生新物件）",
    again.added.length === 0 && again.honors === st().honors);

  //  重載
  st().save();
  const fresh = (await import("../src/platform/profileStore.js?q7d=1")).useProfileStore;
  ck("3d) **重載後榮耀還在且逐字不變**", J(fresh.getState().honors) === snap,
    `${fresh.getState().honors.length} 筆`);
  fresh.getState()._sealSeasonIfFinished();
  ck("3e) 重載後再結算一次也不重複", J(fresh.getState().honors) === snap);
}

// ── §4 換季後歷史保留、多季累積 ─────────────────────────────────────────
let s1Champion = null;
{
  console.log("\n── §4 換季與多季累積 ──");
  s1Champion = honor.championTeamId;
  finishSeason();
  ck("4a) 整季封存得了", !!st().competition.final);
  const rolled = st().rollToNextCompetitionSeason();
  ck("4b) 換得了季", rolled.ok, `第 ${rolled.season} 季`);
  ck("4c) **換季後榮耀沒有消失**", H.honorsOf(st().honors).length === 1 &&
    st().honors[0].championTeamId === s1Champion);
  ck("4d) 新賽季還沒有第二筆", H.annualChampionsOf(st().honors).length === 1);

  //  第 2 季：讓**不同的隊伍**奪冠
  playThreeStops();
  playFinals((f) => f.sideB);
  const c2 = st().competition;
  const final2 = S.eventFinalOf(c2, F.asiaFinalsEventOf(c2).id);
  ck("4e) 第 2 季也寫入一筆", H.honorsOf(st().honors).length === 2);
  ck("4f) 第 2 季的冠軍來自它自己的 final",
    st().honors[0].season === 2 && st().honors[0].championTeamId === final2.championTeamId,
    short(final2.championTeamId));
  ck("4g) **新的在前**（S2 → S1）",
    J(H.annualChampionsOf(st().honors).map((h) => h.season)) === J([2, 1]));
  ck("4h) 兩季的 id 不同、結構仍然合法",
    st().honors[0].id !== st().honors[1].id && H.validateHonors(st().honors).ok);
}

// ── §5 accessor（全部推導，不落盤索引）──────────────────────────────────
{
  console.log("\n── §5 accessor ──");
  const honors = st().honors;
  ck("5a) `annualChampionsOf` 回歷屆冠軍（新到舊）",
    H.annualChampionsOf(honors).length === 2);
  ck("5b) `latestAnnualChampion` 是最近一季",
    H.latestAnnualChampion(honors)?.season === 2);
  ck("5c) **`teamHonorCount` 正確**", (() => {
    const counts = new Map();
    for (const h of honors) counts.set(h.championTeamId, (counts.get(h.championTeamId) ?? 0) + 1);
    return [...counts].every(([teamId, n]) => H.teamHonorCount(honors, teamId, {
      honorType: H.HONOR_TYPES.asiaAnnualChampion }) === n);
  })(), [...new Set(honors.map((h) => short(h.championTeamId)))].join(" "));
  ck("5d) 沒拿過的隊伍回 0",
    H.teamHonorCount(honors, "team:00000000") === 0 && H.teamHonorCount(honors, null) === 0);
  ck("5e) `honorsOfSeason` 依賽季取得", H.honorsOfSeason(honors, 1).length === 1);
  ck("5f) `hasAnnualChampionHonor` 判得出來",
    H.hasAnnualChampionHonor(honors, "moba", 1) && !H.hasAnnualChampionHonor(honors, "moba", 99));
  const view = st().competitionView().honorsView;
  ck("5g) 畫面拿得到（`competitionView().honorsView`）",
    view.annualChampions.length === 2 && view.latestAnnualChampion.season === 2 &&
    typeof view.myAnnualChampionCount === "number",
    `我拿過 ${view.myAnnualChampionCount} 次`);
}

// ── §6 世界歷史：AI 奪冠照樣寫 ──────────────────────────────────────────
{
  console.log("\n── §6 AI 冠軍也記錄 ──");
  const honors = st().honors;
  const myId = st().team.id;
  const aiWins = honors.filter((h) => h.championTeamId !== myId);
  ck("6a) **有 AI 隊伍奪冠的紀錄**（不是只記玩家）", aiWins.length > 0,
    aiWins.map((h) => `S${h.season} ${h.championTeamName}`).join(" / "));
  ck("6b) AI 冠軍的欄位一樣完整",
    aiWins.every((h) => !!h.championTeamName && !!h.sourceFinalId && h.finalRank === 1));
  ck("6c) 玩家的次數是**推導**出來的，與清單一致",
    H.teamHonorCount(honors, myId) === honors.filter((h) => h.championTeamId === myId).length);
}

// ── §7 不污染既有概念 ───────────────────────────────────────────────────
{
  console.log("\n── §7 不混用 ──");
  const c = st().competition;
  ck("7a) **`careerFinal` 仍是官方聯賽的生涯成績**", (() => {
    const career = S.tryCareerFinalStandingsOf(c);
    return career == null || career.competitionId === S.activeCompetitionOf(c).id;
  })());
  ck("7b) **`competitionHistory` 仍然只有 FinalStandings**",
    (st().competitionHistory ?? []).every((h) => h?.schema === "FinalStandings.v1"));
  ck("7c) **`circuitHistory` 仍然只有巡迴摘要**",
    (st().circuitHistory ?? []).every((h) => h?.schema === "CircuitSeasonSummary.v1"));
  ck("7d) **榮耀沒有混進獎金帳本**", (() => {
    const ledger = st().processedCompetitionAwards ?? {};
    return !Object.keys(ledger).some((k) => k.startsWith("honor:"));
  })());
  ck("7e) **`Event.final` 沒有被動過**（榮耀只是指過去）", (() => {
    const ev = F.asiaFinalsEventOf(c);
    const final = S.eventFinalOf(c, ev.id);
    return !("honor" in final) && !("honorType" in final) &&
      st().honors[0].sourceFinalId === final.id;
  })());
  ck("7f) 年度總決賽仍然沒有積分、沒有獎金",
    P.pointsEntriesOfCircuit(c, F.asiaFinalsEventOf(c).circuitId).length === 0 &&
    F.asiaFinalsEventOf(c).prizePolicy === null);
}

// ── §8 改名不動身分、改別的 Event 不污染 ────────────────────────────────
{
  console.log("\n── §8 身分穩定 ──");
  const before = J(st().honors);
  const c = st().competition;
  const ev = F.asiaFinalsEventOf(c);

  //  改 Event 顯示名稱 ⇒ 既有榮耀的 id 與冠軍不得改變
  useProfileStore.setState({ competition: {
    ...c, events: { ...c.events, [ev.id]: { ...c.events[ev.id], name: "改個名字而已" } } } });
  st()._sealSeasonIfFinished();
  ck("8a) **改 Event 名稱不改變既有榮耀**（id／冠軍／來源逐字不變）",
    J(st().honors) === before);

  //  改別的 Event（官方聯賽）⇒ 不得污染年度榮耀
  const c2 = st().competition;
  const leagueEventId = c2.careerEventId;
  useProfileStore.setState({ competition: {
    ...c2, events: { ...c2.events, [leagueEventId]: { ...c2.events[leagueEventId], name: "聯賽改名" } } } });
  st()._sealSeasonIfFinished();
  ck("8b) **改官方聯賽不污染年度榮耀**", J(st().honors) === before);

  //  沒有年度總決賽的賽季 ⇒ 不得產生榮耀
  const noFinals = { ...st().competition,
    circuits: Object.fromEntries(Object.entries(st().competition.circuits)
      .filter(([k]) => !k.includes("asia-finals"))),
    events: Object.fromEntries(Object.entries(st().competition.events)
      .filter(([, e]) => !String(e.circuitId).includes("asia-finals"))) };
  ck("8c) 沒有年度總決賽的賽季 ⇒ 純函式回 null",
    H.annualChampionHonorOf(noFinals, S.eventFinalOf) === null);
}

// ── §9 legacy 存檔不得補假榮耀 ──────────────────────────────────────────
{
  console.log("\n── §9 legacy ──");
  globalThis.window.location.search = "?asiaCircuit=0";
  st().startNewGame("standard");
  st().ensureCompetitionSeason();
  st().advanceDay(20);
  st().save();
  const legacy = (await import("../src/platform/profileStore.js?q7d2=1")).useProfileStore;
  ck("9a) **舊制存檔載入後榮耀是空的**（不補假榮耀）",
    H.honorsOf(legacy.getState().honors).length === 0);
  legacy.getState()._sealSeasonIfFinished();
  ck("9b) 跑結算流程也不會憑空產生",
    H.honorsOf(legacy.getState().honors).length === 0);
  ck("9c) 舊制賽季根本沒有年度總決賽 ⇒ 來源不存在",
    !F.hasAsiaFinals(legacy.getState().competition));
  globalThis.window.location.search = "";
}

// ── §10 換季前的補寫路徑 ────────────────────────────────────────────────
{
  console.log("\n── §10 換季前補寫 ──");
  //  情境：賽季與年度總決賽都封存了，但榮耀被清掉（模擬「Q7d 之前就封存好的存檔」）
  globalThis.window.location.search = "";
  st().startNewGame("standard");
  st().ensureCompetitionSeason();
  playThreeStops();
  playFinals((f) => f.sideA);
  finishSeason();
  const sealedFinal = S.eventFinalOf(st().competition, F.asiaFinalsEventOf(st().competition).id);
  useProfileStore.setState({ honors: [] });          // ← 模擬升級前的存檔
  ck("10a) 起點：年度總決賽已封存，但榮耀是空的",
    !!sealedFinal && H.honorsOf(st().honors).length === 0);
  const rolled = st().rollToNextCompetitionSeason();
  ck("10b) 換季成功", rolled.ok);
  ck("10c) **換季前補寫成功**（來源還看得到的就補得回來）",
    H.honorsOf(st().honors).length === 1 &&
    st().honors[0].sourceFinalId === sealedFinal.id, st().honors[0]?.id);
  ck("10d) 換季後來源已消失 ⇒ 再也補不出第二筆（也不會亂補）",
    !F.hasAsiaFinals(st().competition) &&
    H.annualChampionHonorOf(st().competition, S.eventFinalOf) === null);
}

// ── §11 紅線（原始碼掃描）───────────────────────────────────────────────
{
  console.log("\n── §11 紅線 ──");
  const hn = readCode("src/platform/competition/honors.js");

  ck("11a) 榮耀層是純函式（不 import React／zustand／localStorage／亂數／時鐘）",
    !/from\s+["'](react|zustand)|localStorage|Math\.random|Date\.now/.test(hn));
  ck("11b) **只從 Event.final 取冠軍**（沒有讀 bracket／standings／積分）",
    !/playoffBracket|playoffOrder|circuitStandings|pointsLogOf|standingsOf|SeasonSeal/.test(hn) &&
    /championTeamId/.test(hn));
  ck("11c) **不碰錢**", !/funds|transactions|prize|award|COMPETITION_PRIZE/i.test(hn));
  ck("11d) **不落盤可推導的索引**（沒有存計數／排名表）",
    !/countBy|indexBy|honorIndex|totals\s*[:=]/.test(hn));
  ck("11e) 沒有做成就任務／稱號裝備系統",
    !/achievement|quest|mission|equipTitle|badgeSlot/i.test(hn));
  ck("11f) 沒有碰 Battle Engine／Shop／MMR／老化／轉會",
    !/LogicEngine|battleResult|shop|\bmmr\b|agePlayer|transfer/i.test(hn));
  ck("11g) 只有一種榮耀類型（沒有泛化成 Award 系統）",
    (hn.match(/asia_annual_champion/g) ?? []).length >= 1 &&
    !/AWARD_TYPES|SeasonAward|awardRegistry/i.test(hn));
}

console.log(`\n${pass}/${pass + fail} 通過`);
process.exit(fail === 0 ? 0 : 1);
