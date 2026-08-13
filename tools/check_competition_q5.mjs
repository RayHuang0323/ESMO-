#!/usr/bin/env node
// ============================================================================
//  tools/check_competition_q5.mjs — Milestone Q5：跨賽季換季
//
//  執行：repo 根目錄 `node tools/check_competition_q5.mjs`；**失敗時 exit 1**。
//
//  Q5 只做「換容器」：舊季封存保留、新季 56 場全新賽程、standings/outcomes 歸零，
//  選手／資金／成長／贊助完全不動。**不做選手老化、不做季後賽。**
//
//  最關鍵的四組：
//    §2   S1 → S2 → S3 連續換季，且**逐季賽程決定性**（同存檔重跑逐場相同）
//    §3   舊季 FinalStandings **不可被新賽季覆寫**，且查得到
//    §4   換季**冪等**：連按不會產生第二個新賽季
//    §6   選手／資金／成長資料**完全保留**
// ============================================================================
import fs from "node:fs";

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const readCode = (p) => stripComments(fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8"));

const KEY = "esmo.profile.v1";
let LS = null;
globalThis.localStorage = {
  getItem: (k) => (k === KEY ? LS : null),
  setItem: (k, v) => { if (k === KEY) LS = v; },
  removeItem: () => { LS = null; },
};

const { canRollSeason, rollToNextSeason, seasonDayOf, canSealSeason,
  activeCompetitionOf, fixturesOfCompetition, competitionEntries } =
  await import("../src/platform/competition/seasonState.js");

// ── Q7a-3f：賽季基線改用**範圍明確**的斷言 ─────────────────────────────────
//  原本寫 `fixtures.length === 56`，那個數字守的是「MOBA 官方聯賽 8 隊雙循環」，
//  卻用全域總數表達；同季一旦多出別的賽事就會誤紅。改成聯賽本身 56 場，
//  再加一條「總場次 ＝ 各賽制加總」——後者比寫死總數更強（抓得到孤兒場次），
//  而且賽事增減都不必回來改。
const leagueFixtureCount = (state) =>
  fixturesOfCompetition(state, activeCompetitionOf(state)?.id ?? null).length;
const fixturesAddUp = (state) =>
  (state?.fixtures ?? []).length ===
  competitionEntries(state).reduce((n, e) => n + fixturesOfCompetition(state, e.competition.id).length, 0);
const { seedForSeason } = await import("../src/platform/identity/teamIdentity.js");
const { useProfileStore } = await import("../src/platform/profileStore.js");

let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`✅ ${name}${detail ? "　" + detail : ""}`); }
  else { fail++; console.log(`❌ ${name}${detail ? "　" + detail : ""}`); }
};
const st = () => useProfileStore.getState();

/** 把當前賽季打完（玩家場次一律棄權），直到封存。 */
const finishSeason = (maxSteps = 200) => {
  for (let i = 0; i < maxSteps; i++) {
    const v = st().competitionView();
    if (v.final) return v;
    if (v.progress.remaining === 0) break;
    const today = v.today;
    if (today) { st().forfeitFixture(today.id); continue; }
    const before = st().meta.days;
    st().advanceDay(7);
    if (st().meta.days === before) break;
  }
  return st().competitionView();
};

/** 賽程指紋：逐場「第幾天 主隊 客隊」——換季決定性就是驗這個。 */
const scheduleFingerprint = (state) =>
  (state?.fixtures ?? []).map((f) => `${f.day}:${f.sideA}>${f.sideB}`).join("|");

// ── §1 純函式：換季的前置條件 ───────────────────────────────────────────
{
  console.log("\n── §1 canRollSeason / rollToNextSeason ──");
  ck("1a) 沒有賽季 ⇒ 不能換季", canRollSeason(null).ok === false);
  ck("1b) 賽季沒封存 ⇒ 不能換季",
    canRollSeason({ schema: "SeasonState.v1", season: 1, final: null }).ok === false,
    canRollSeason({ schema: "SeasonState.v1", season: 1, final: null }).reason ?? "");
  const okState = { schema: "SeasonState.v1", season: 3, final: { id: "final:x" } };
  ck("1c) 已封存 ⇒ 可以換季，下一季是 +1",
    canRollSeason(okState).ok === true && canRollSeason(okState).nextSeason === 4);
  ck("1d) 沒封存就呼叫 rollToNextSeason ⇒ 完全不產生新賽季",
    rollToNextSeason({ state: { schema: "SeasonState.v1", season: 1 } }).ok === false);

  //  賽季相對天數（顯示問題的修正）
  ck("1e) 賽季第 1 天", seasonDayOf({ startDay: 8 }, 8).seasonDay === 1);
  ck("1f) 賽季第 84 天", seasonDayOf({ startDay: 8 }, 91).seasonDay === 84);
  ck("1g) **超過賽季長度時夾在 84，不再顯示「第 95 / 84 天」**",
    seasonDayOf({ startDay: 8 }, 95).seasonDay === 84 && seasonDayOf({ startDay: 8 }, 95).overrun === true);
  ck("1h) 早於錨點也不會變成 0 或負數", seasonDayOf({ startDay: 8 }, 1).seasonDay === 1);
}

// ── §2 S1 → S2 → S3 連續換季 ────────────────────────────────────────────
const runs = [];
{
  console.log("\n── §2 S1 → S2 → S3 ──");
  st().startNewGame("standard");
  st().ensureCompetitionSeason();

  const seeds = [], prints = [], sealedIds = [];
  for (let n = 1; n <= 3; n++) {
    const v0 = st().competitionView();
    ck(`2-${n}a) 目前是第 ${n} 賽季`, v0.season === n, `season=${v0.season}`);
    ck(`2-${n}b) 新賽季**官方聯賽 56 場**、賽果與封存都是空的`,
      leagueFixtureCount(st().competition) === 56 &&
      (st().competition.outcomes ?? []).length === 0 && !st().competition.final,
      `聯賽 ${leagueFixtureCount(st().competition)} 場／全季 ${st().competition.fixtures.length} 場`);
    ck(`2-${n}b2) 新賽季**總場次 ＝ 各賽制加總**（沒有孤兒場次）`,
      fixturesAddUp(st().competition));
    seeds.push(st().competition.seed);
    prints.push(scheduleFingerprint(st().competition));

    const done = finishSeason();
    ck(`2-${n}c) 第 ${n} 季打得完並封存`, !!done.final, done.final ? `第 ${done.final.playerRank} 名` : "");
    sealedIds.push(done.final?.id);

    if (n < 3) {
      const r = st().rollToNextCompetitionSeason();
      ck(`2-${n}d) 換到第 ${n + 1} 季`, r.ok === true && r.season === n + 1, r.reason ?? "");
    }
  }
  runs.push({ seeds, prints, sealedIds, funds: st().finance.funds });

  ck("2e) 三季的種子各不相同", new Set(seeds).size === 3, seeds.join(","));
  ck("2e2) 種子是由 `seedForSeason(seasonSeed, 季號)` 決定性派生的",
    seeds.every((s, i) => s === seedForSeason(st().meta.seasonSeed, i + 1)));
  ck("2f) 三季的賽程各不相同（不是同一張表重播）", new Set(prints).size === 3);
  ck("2g) 三季的賽事識別碼各不相同", new Set(sealedIds).size === 3, sealedIds.join(" / "));
}

// ── §2R 決定性：同一個存檔重跑一次，三季逐場相同 ────────────────────────
{
  console.log("\n── §2R 換季的決定性（重跑逐場相同）──");
  //  用同一顆 seasonSeed 與 team.id 重建 ⇒ 三季賽程必須逐場一致
  const seed0 = st().meta.seasonSeed, teamId0 = st().team.id;
  st().startNewGame("standard");
  useProfileStore.setState({
    meta: { ...st().meta, seasonSeed: seed0 },
    team: { ...st().team, id: teamId0 },
    competition: null, competitionHistory: [],
  });
  st().ensureCompetitionSeason();

  const seeds = [], prints = [];
  for (let n = 1; n <= 3; n++) {
    seeds.push(st().competition.seed);
    prints.push(scheduleFingerprint(st().competition));
    finishSeason();
    if (n < 3) st().rollToNextCompetitionSeason();
  }
  ck("2R-a) **三季種子逐季相同**", JSON.stringify(seeds) === JSON.stringify(runs[0].seeds),
    `${seeds.join(",")} vs ${runs[0].seeds.join(",")}`);
  ck("2R-b) **三季賽程逐場相同**", JSON.stringify(prints) === JSON.stringify(runs[0].prints));
}

// ── §3 舊季封存保留、可查閱、不可被覆寫 ─────────────────────────────────
{
  console.log("\n── §3 歷史封存 ──");
  const v = st().competitionView();
  const hist = v.history;
  ck("3a) 歷史有兩季（S1、S2）", hist.length === 2, hist.map((h) => `S${h.season}`).join(","));
  ck("3b) 新的在前", hist[0].season === 2 && hist[1].season === 1);
  ck("3c) 歷史每一筆都是完整的 FinalStandings（八列、名次全序）",
    hist.every((h) => h.rows?.length === 8 && h.rows.every((r, i) => h.rows.filter((x) => x.rank === i + 1).length === 1)));
  ck("3d) 當前賽季（S3）不在歷史裡", !hist.some((h) => h.season === 3));

  //  ⚠ 這是規格需求 1：舊季不可被新賽季覆寫
  const s1Before = JSON.stringify(hist.find((h) => h.season === 1));
  st().rollToNextCompetitionSeason();          // S3 已封存 ⇒ 會換到 S4
  const s1After = JSON.stringify(st().competitionView().history.find((h) => h.season === 1));
  ck("3e) **換季之後 S1 的最終名次一個字都沒變**", s1Before === s1After);
  ck("3f) 歷史累積到三季", st().competitionView().history.length === 3);
  ck("3g) 現在是第 4 賽季，且是乾淨的",
    st().competitionView().season === 4 && (st().competition.outcomes ?? []).length === 0 && !st().competition.final);
}

// ── §4 換季冪等 ─────────────────────────────────────────────────────────
{
  console.log("\n── §4 冪等（規格需求 9）──");
  const before = {
    season: st().competitionView().season,
    hist: st().competitionView().history.length,
    print: scheduleFingerprint(st().competition),
  };
  //  S4 還沒打完 ⇒ 連按十次都不該有事
  const results = [];
  for (let i = 0; i < 10; i++) results.push(st().rollToNextCompetitionSeason().ok);
  ck("4a) **賽季沒結束時連按十次，一次都不會成功**", results.every((r) => r === false));
  ck("4b) 季號沒有被推進", st().competitionView().season === before.season);
  ck("4c) 沒有多出歷史紀錄", st().competitionView().history.length === before.hist);
  ck("4d) 賽程沒有被重建（逐場相同）", scheduleFingerprint(st().competition) === before.print);

  //  打完之後換一次，再連按 ⇒ 只會前進一季
  finishSeason();
  const r1 = st().rollToNextCompetitionSeason();
  const seasonAfterFirst = st().competitionView().season;
  const printAfterFirst = scheduleFingerprint(st().competition);
  for (let i = 0; i < 5; i++) st().rollToNextCompetitionSeason();
  ck("4e) 封存後連按六次，**只前進一季**",
    r1.ok === true && st().competitionView().season === seasonAfterFirst, `season=${st().competitionView().season}`);
  ck("4f) 也沒有產生第二份賽程", scheduleFingerprint(st().competition) === printAfterFirst);
  ck("4g) 歷史沒有出現重複的季號",
    new Set(st().competitionView().history.map((h) => h.season)).size === st().competitionView().history.length);
}

// ── §5 存檔往返（reload 等價）───────────────────────────────────────────
{
  console.log("\n── §5 存檔往返 ──");
  st().save();
  const before = {
    season: st().competitionView().season,
    hist: JSON.stringify(st().competitionView().history),
    print: scheduleFingerprint(st().competition),
    funds: st().finance.funds,
  };
  const fresh = (await import("../src/platform/profileStore.js?q5reload=1")).useProfileStore;
  const f = () => fresh.getState();
  ck("5a) 重載後季號不變", f().competitionView().season === before.season);
  ck("5b) 重載後歷史一字不差", JSON.stringify(f().competitionView().history) === before.hist);
  ck("5c) 重載後賽程逐場相同", scheduleFingerprint(f().competition) === before.print);
  ck("5d) 重載後資金不變", f().finance.funds === before.funds);
  ck("5e) **重載不會憑空再換一季**", f().competitionView().season === before.season);
}

// ── §6 換季不得動到賽季以外的東西 ───────────────────────────────────────
{
  console.log("\n── §6 只換容器 ──");
  st().startNewGame("standard");
  st().ensureCompetitionSeason();
  finishSeason();
  const snap = () => ({
    players: JSON.stringify((st().players ?? []).map((p) => ({ id: p.id, xp: p.xp, lv: p.lv, tp: p.talentPoints, stats: p.stats, age: p.age }))),
    funds: st().finance.funds,
    fans: st().meta.fans,
    sponsor: JSON.stringify(st().activeSponsor),
    team: JSON.stringify(st().team),
    seasonSeed: st().meta.seasonSeed,
    awards: Object.keys(st().processedCompetitionAwards ?? {}).length,
    txs: (st().finance.transactions ?? []).length,
  });
  const before = snap();
  const r = st().rollToNextCompetitionSeason();
  const after = snap();
  ck("6a0) 換季成功（前置）", r.ok === true);
  ck("6a) **選手完全沒動**（xp／等級／天賦點／能力／年齡）", before.players === after.players);
  ck("6b) **資金沒動**", before.funds === after.funds, `${before.funds} → ${after.funds}`);
  ck("6c) 粉絲沒動", before.fans === after.fans);
  ck("6d) **贊助合約沒動**（合約是週制，與賽季無關）", before.sponsor === after.sponsor);
  ck("6e) 隊伍身分沒動（`team.id` 不可變）", before.team === after.team);
  ck("6f) `meta.seasonSeed` 不可變", before.seasonSeed === after.seasonSeed);
  ck("6g) 名次獎金帳本沒有被清掉（上一季發過的仍在）", before.awards === after.awards && after.awards >= 1);
  ck("6h) 交易帳本沒有被清掉", before.txs === after.txs);
  //  新賽季本身
  ck("6i) 新賽季 standings 歸零（每隊 0 勝 0 敗）",
    st().competitionView().standings.rows.every((r2) => r2.played === 0 && r2.points === 0));
  ck("6j) 新賽季 outcomes 歸零", (st().competition.outcomes ?? []).length === 0);
  ck("6k) 新賽季錨在換季當天", st().competition.startDay === st().meta.days);
}

// ── §7 紅線 ─────────────────────────────────────────────────────────────
{
  console.log("\n── §7 紅線 ──");
  const ss = readCode("src/platform/competition/seasonState.js");
  const screen = readCode("src/screens/manage/CompetitionScreen.jsx");
  const ps = readCode("src/platform/profileStore.js");

  ck("7a) 換季是純函式（賽季層不 import React／zustand／localStorage／亂數／時鐘）",
    !/from\s+["']react|zustand|localStorage|Math\.random|Date\.now/.test(ss));
  ck("7b) **賽季層不碰錢**（換季不發任何獎金）",
    !/funds|transactions|COMPETITION_PRIZE|settleCompetitionAward/.test(ss));
  ck("7c) **沒有做選手老化**（Q5 邊界：只換容器）",
    !/agePlayer|ageOneSeason|retire/i.test(ss + ps.split("rollToNextCompetitionSeason")[1]?.slice(0, 2000) ?? ""));
  //  ⚠ 2026-08-12（Q6）：本條原本也擋 `playoff|single_elim`。Q6 已實作季後賽，
  //    而季後賽依規格就住在 seasonState ⇒ 原斷言必然紅。
  //    保留仍然成立的部分：**換季本身不碰季後賽的內部規則**（`rollToNextSeason`
  //    只換容器），以及 CS 巡迴／MMR／Shop 一律不得出現。
  //  ⚠ 2026-08-13（Q7a-3a）：本條原本也擋 `circuit`。Circuit 已是核准的一級實體
  //    （Season → Game Mode → Circuit → Event → Competition/Stage → Fixture），
  //    而 seasonState 必須 import 它的身分升級 ⇒ 原字面必然紅。
  //    **收窄而不是拿掉**：改擋 `circuitPoints`——身分可以進來，
  //    **積分玩法仍然擋在門外**（那是 3c，且來源必須是 Event 最終名次而非 outcomes）。
  ck("7d) 換季不碰季後賽規則；且沒有 CS 巡迴積分／MMR／Shop",
    !/double_elim|circuitPoints|\bmmr\b|tokens|entitlement/i.test(ss) &&
    !/playoff/i.test(ss.split("export function rollToNextSeason")[1]?.split("export function")[0] ?? ""));
  ck("7e) 賽季編號由賽事自己 +1，**不讀 `meta.season`**",
    !/meta[?.]*\.season/.test(ss) && /Number\(state\.season\)\s*\|\|\s*1\)\s*\+\s*1/.test(ss));
  ck("7f) 畫面不自己判能不能換季（吃 Store 的 canRoll）",
    /canRoll/.test(screen) && !/canRollSeason\(/.test(screen));
  ck("7g) 畫面不自己算賽季天數（吃 Store 的 seasonDay）",
    /seasonDay/.test(screen) && !/startDay/.test(screen));
  ck("7h) **賽事頁不再拿絕對遊戲日對 84 天**",
    !/\$\{days\}\s*\/\s*\$\{progress\.seasonDays\}/.test(screen));
  ck("7i) 經濟週期標籤不再顯示 S 號（全案唯一的賽季在賽事頁）",
    !/S\{wk\.season\}/.test(readCode("src/screens/DashboardScreen.jsx")) &&
    !/S\{wk\.season\}/.test(readCode("src/screens/manage/FinanceScreen.jsx")));
  ck("7j) 換季不自動發生（要玩家按；Store 沒有把它掛在推進天數上）",
    !/_advanceCompetition[\s\S]{0,400}rollToNextCompetitionSeason/.test(ps));
}

console.log(`\n${pass}/${pass + fail} 通過`);
if (fail) { console.log(`\n❌ ${fail} 條未通過`); process.exit(1); }
