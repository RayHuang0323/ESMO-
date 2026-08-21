#!/usr/bin/env node
// ============================================================================
//  tools/check_cs_series.mjs — CS Season M3-2：BO3 series 語義
//
//  執行：repo 根目錄 `node tools/check_cs_series.mjs`；**失敗時 exit 1**。
//
//  規格：docs/design/CS_賽事系統架構規格.md（D4）
//  計畫：docs/superpowers/plans/2026-08-21-cs-season-competition.md（M3-2）
//
//  M3-2 證明的是：年度 Major 的一場 ＝ **一個 BO3 series**，賽季層記的是
//  **拿下幾張地圖**（2:0 / 2:1），而且**永遠不知道任何一張地圖裡發生什麼**。
//
//  ── 這一支真正在守的那條線 ────────────────────────────────────────────────
//  「地圖數」與「回合數」只差一個投影，但語義天差地別：回合／半場／加時是
//  Codex 的責任區（MR12）。Season 層只要寫出一次 `13:7`，就等於在發明 CS 的
//  回合語義，而且那筆賽果是**不可變的**——寫進去就再也改不了。
//
//  守的九組：
//    §1  matchFormat：Major 帶 bo3、聯賽不帶（BO1 隱含）
//    §2  合法 series score：只可能是 2:0 / 2:1 / 0:2 / 1:2
//    §3  1 Fixture = 1 series = 1 FixtureOutcome
//    §4  ⛔ ownership lock：賽季層看不到地圖識別碼、round / half / overtime
//    §5  決定性與冪等
//    §6  勝方＝拿到兩張地圖那一方
//    §7  bracket 晉級與 FinalStandings 只認 series outcome
//    §8  玩家出戰 BO3：fail-closed（不得用一張地圖結算一個 series）
//    §9  沒有污染：CS 聯賽仍是 BO1、MOBA 仍是擊殺數
//    §10 mutation sentinel
//
//  ⚠ 不得為了讓這一支變綠而放寬斷言。契約要改，先改規格與交接文件。
// ============================================================================
const KEY = "esmo.profile.v1";
let LS = null;
globalThis.localStorage = {
  getItem: (k) => (k === KEY ? LS : null),
  setItem: (k, v) => { if (k === KEY) LS = v; },
  removeItem: () => { LS = null; },
};

let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`PASS ${name}${detail ? "　" + detail : ""}`); }
  else { fail++; console.log(`FAIL ${name}${detail ? "　" + detail : ""}`); }
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const S = await import("../src/platform/competition/seasonState.js");
const { csMajorEntryOf, csMajorFixturesOf, regularFixturesOf, rostersFor, isCsMajorDone } = S;
const { CS_MAJOR_MATCH_FORMAT, CS_MAJOR_SERIES, CS_MAJOR_MAPS_TO_WIN } =
  await import("../src/platform/competition/csMajor.js");
const {
  simulateFixture, simSeedFor, CS_SIMULATOR_VERSION, CS_SERIES_SIMULATOR_VERSION,
  SIMULATOR_VERSION, simulatorVersionFor,
} = await import("../src/platform/competition/simulateFixture.js");
const { CS_MAPS } = await import("../src/battle/fps/csPrepData.js");
const { isFixtureTerminal, RESULT_SOURCES: FX } = await import("../src/platform/contracts/competition.js");
const { RESULT_SOURCES, FORFEIT_SCORE } = await import("../src/platform/contracts/fixtureOutcome.js");
const { fixtureOutcomeInputFrom } = await import("../src/platform/competition/fixtureResultBridge.js");

let bootSeq = 0;
const freshStore = async () => {
  LS = null;
  const mod = await import(`../src/platform/profileStore.js?boot=${++bootSeq}`);
  mod.useProfileStore.getState().startNewGame("standard");
  return mod.useProfileStore;
};

/** 把 CS 一整季（聯賽 ＋ Major）跑到封存為止。玩家場次一律棄權。 */
const runCsSeasonToSeal = (s, limit = 400) => {
  for (let i = 0; i < limit; i++) {
    if (s().competitionByMode.cs?.final) break;
    const v = s().competitionView("cs");
    if (v.today) { s().forfeitFixture(v.today.id); continue; }
    const moved = s().advanceDay(1);
    if ((moved.daysAdvanced ?? 0) <= 0 && !s().competitionView("cs").today) break;
  }
};

/** 合法的 BO3 series 比分。**只有這四種。** */
const LEGAL_BO3 = [[2, 0], [2, 1], [0, 2], [1, 2]];
const isLegalBo3 = (sc) => LEGAL_BO3.some(([a, b]) => sc?.a === a && sc?.b === b);

const store = await freshStore();
const st = () => store.getState();
st().ensureCompetitionSeason("cs");
runCsSeasonToSeal(st);
const cs = st().competitionByMode.cs;
const majorFx = csMajorFixturesOf(cs);
const outcomeOf = (f) => (cs.outcomes ?? []).find((o) => o.fixtureId === f.id) ?? null;
const majorOutcomes = majorFx.map(outcomeOf).filter(Boolean);

// ── §1 matchFormat ────────────────────────────────────────────────────────
console.log("\n§1 matchFormat：Major 帶 bo3，聯賽不帶");
ck("Major 走得完（前置條件）", majorFx.length === 4 && isCsMajorDone(cs),
  `${majorFx.length} 場`);
ck("每一場 Major 都帶 matchFormat", majorFx.every((f) => !!f.matchFormat),
  JSON.stringify(majorFx[0]?.matchFormat));
ck("series 是 bo3", majorFx.every((f) => f.matchFormat?.series === CS_MAJOR_SERIES),
  majorFx[0]?.matchFormat?.series);
ck("bo3 的定義是先拿兩張地圖", CS_MAJOR_MAPS_TO_WIN === 2, `${CS_MAJOR_MAPS_TO_WIN}`);
ck("mapPool 逐值等於引擎現役地圖的 key",
  majorFx.every((f) => eq(f.matchFormat?.mapPool, CS_MAPS.map((m) => m.key))),
  (majorFx[0]?.matchFormat?.mapPool ?? []).join(","));
//  ⚠ 三張池下 BO3 的 veto 近乎裝飾（規格 D4）⇒ 明文寫 null，不假裝有博弈
ck("veto 明文為 null（不假裝有 ban/pick 博弈）",
  majorFx.every((f) => f.matchFormat?.veto === null));
ck("CS 聯賽場次不帶 matchFormat（BO1 隱含，既有行為未變）",
  regularFixturesOf(cs).every((f) => f.matchFormat === null),
  `${regularFixturesOf(cs).length} 場聯賽`);

// ── §2 合法 series score ──────────────────────────────────────────────────
console.log("\n§2 合法的 series score");
const played = majorOutcomes.filter((o) => o.resultSource !== RESULT_SOURCES.forfeited);
const forfeited = majorOutcomes.filter((o) => o.resultSource === RESULT_SOURCES.forfeited);
ck("Major 每一場都有賽果", majorOutcomes.length === 4, `${majorOutcomes.length}/4`);
ck("實際打完的 series 比分只可能是 2:0 / 2:1 / 0:2 / 1:2",
  played.length > 0 && played.every((o) => isLegalBo3(o.score)),
  played.map((o) => `${o.score.a}:${o.score.b}`).join(" "));
ck("勝方一定拿滿兩張地圖",
  played.every((o) => Math.max(o.score.a, o.score.b) === CS_MAJOR_MAPS_TO_WIN));
ck("敗方的地圖數是 0 或 1（不會出現第三張多餘的地圖）",
  played.every((o) => [0, 1].includes(Math.min(o.score.a, o.score.b))));
ck("沒有任何一側超過 2（回合量級的數字絕不會出現）",
  played.every((o) => o.score.a <= 2 && o.score.b <= 2));
//  ⚠ 棄權**不是** series 比分：一張地圖都沒打，兩邊都是 0。
//    這是 MOBA / CS 共用的既有契約（FORFEIT_SCORE），M3-2 刻意不動它。
ck("棄權的 Major 場次仍記 0:0（沒打就是沒打，不編一個 2:0 出來）",
  forfeited.every((o) => eq(o.score, FORFEIT_SCORE)),
  `${forfeited.length} 場棄權`);

// ── §3 1 Fixture = 1 series = 1 FixtureOutcome ───────────────────────────
console.log("\n§3 一個 Fixture ＝ 一個 series ＝ 一筆 FixtureOutcome");
ck("四場 Major 對應四筆賽果，不多不少", majorOutcomes.length === majorFx.length);
const majorIds = new Set(majorFx.map((f) => f.id));
const perFixture = new Map();
for (const o of (cs.outcomes ?? [])) {
  if (!majorIds.has(o.fixtureId)) continue;
  perFixture.set(o.fixtureId, (perFixture.get(o.fixtureId) ?? 0) + 1);
}
ck("沒有任何一場 Major 產生第二筆賽果",
  [...perFixture.values()].every((n) => n === 1), `${[...perFixture.values()].join(",")}`);
ck("BO3 沒有讓賽程多長出地圖層級的場次（Major 仍然只有 4 場）",
  majorFx.length === 4);

// ── §4 ownership lock ────────────────────────────────────────────────────
console.log("\n§4 ownership lock：賽季層看不到地圖裡的事");
const seasonJson = JSON.stringify(cs);
ck("整個 SeasonState 找不到任何地圖識別碼",
  !CS_MAPS.some((m) => new RegExp(`"${m.key}"`).test(seasonJson.replace(/"mapPool":\[[^\]]*\]/g, ""))),
  "（mapPool 是賽制設定，不是賽果；已排除後再檢查）");
ck("Major 賽果沒有 round / half / overtime / 地圖清單欄位",
  majorOutcomes.every((o) => !/"(rounds?|roundsPlayed|roundScore|half|halftime|overtime|otGroup|maps|mapResults|mapScores)"\s*:/i
    .test(JSON.stringify(o))));
ck("Major 賽果沒有夾帶任何單圖比分陣列",
  majorOutcomes.every((o) => !Array.isArray(o.maps) && o.mapResults === undefined));
ck("bo3 賽果用自己的模擬器版本（不冒用 BO1 的 cs1）",
  played.every((o) => o.simulatorVersion === CS_SERIES_SIMULATOR_VERSION),
  played[0]?.simulatorVersion);
ck("三個模擬器版本互不相同（MOBA / CS BO1 / CS BO3）",
  new Set([SIMULATOR_VERSION, CS_SIMULATOR_VERSION, CS_SERIES_SIMULATOR_VERSION]).size === 3,
  `${SIMULATOR_VERSION} / ${CS_SIMULATOR_VERSION} / ${CS_SERIES_SIMULATOR_VERSION}`);
ck("simulatorVersionFor 認得 matchFormat",
  simulatorVersionFor("cs", CS_MAJOR_MATCH_FORMAT) === CS_SERIES_SIMULATOR_VERSION
  && simulatorVersionFor("cs", null) === CS_SIMULATOR_VERSION
  && simulatorVersionFor("moba", CS_MAJOR_MATCH_FORMAT) === SIMULATOR_VERSION);

// ── §5 決定性與冪等 ──────────────────────────────────────────────────────
console.log("\n§5 決定性與冪等");
const rosters = rostersFor(cs, st().players ?? []);
const reSim = (f) => simulateFixture({ fixture: f, rosters, seed: simSeedFor(cs.seed, f.id) });
const first = majorFx.map((f) => reSim(f));
const second = majorFx.map((f) => reSim(f));
ck("同一場 BO3 重跑逐值相同",
  eq(first.map((r) => r.outcome?.score), second.map((r) => r.outcome?.score)),
  first.map((r) => `${r.outcome?.score.a}:${r.outcome?.score.b}`).join(" "));
ck("重跑的勝方也相同",
  eq(first.map((r) => r.outcome?.winner), second.map((r) => r.outcome?.winner)));
ck("重跑的結果全部是合法 series 比分",
  first.every((r) => isLegalBo3(r.outcome?.score)));
//  換一顆種子必須真的換結果，否則「決定性」只是「常數」
const otherSeed = majorFx.map((f) => simulateFixture({ fixture: f, rosters, seed: simSeedFor(cs.seed + 977, f.id) }));
ck("換種子會換出不同的 series 結果（不是常數）",
  !eq(first.map((r) => `${r.outcome?.winner}|${r.outcome?.score.a}:${r.outcome?.score.b}`),
      otherSeed.map((r) => `${r.outcome?.winner}|${r.outcome?.score.a}:${r.outcome?.score.b}`)),
  otherSeed.map((r) => `${r.outcome?.score.a}:${r.outcome?.score.b}`).join(" "));
ck("換種子後仍然全部是合法 series 比分",
  otherSeed.every((r) => isLegalBo3(r.outcome?.score)));
//  ⚠ 冪等的真正證據：整季重跑一次，Major 的賽果逐值相同
const store2 = await freshStore();
const st2 = () => store2.getState();
st2().ensureCompetitionSeason("cs");
runCsSeasonToSeal(st2);
const cs2 = st2().competitionByMode.cs;
const major2 = csMajorFixturesOf(cs2).map((f) => (cs2.outcomes ?? []).find((o) => o.fixtureId === f.id));
ck("整季重跑：Major 的 series 比分逐值相同",
  eq(majorOutcomes.map((o) => [o.fixtureId, o.winner, o.score]),
     major2.map((o) => [o.fixtureId, o.winner, o.score])),
  major2.filter(Boolean).map((o) => `${o.score.a}:${o.score.b}`).join(" "));

// ── §6 勝方＝拿到兩張地圖那一方 ──────────────────────────────────────────
console.log("\n§6 勝方＝拿滿兩張地圖那一方");
ck("每一場的 winner 都是地圖數較多的那一側",
  played.every((o) => {
    const f = majorFx.find((x) => x.id === o.fixtureId);
    const expect = o.score.a > o.score.b ? f.sideA : f.sideB;
    return o.winner === expect;
  }));
ck("沒有平手的 series（BO3 不可能 1:1）",
  played.every((o) => o.score.a !== o.score.b));

// ── §7 bracket 晉級與 FinalStandings 只認 series outcome ─────────────────
console.log("\n§7 晉級與名次只認 series outcome");
const byKey = (k) => majorFx.find((f) => f.playoffKey === k);
const winnerOfKey = (k) => outcomeOf(byKey(k))?.winner ?? null;
const loserOfKey = (k) => {
  const f = byKey(k);
  return winnerOfKey(k) === f.sideA ? f.sideB : f.sideA;
};
ck("決賽兩邊＝兩場準決賽的 series 勝方",
  eq([byKey("final").sideA, byKey("final").sideB].sort(),
     [winnerOfKey("sf1"), winnerOfKey("sf2")].sort()));
ck("季軍戰兩邊＝兩場準決賽的 series 敗方",
  eq([byKey("bronze").sideA, byKey("bronze").sideB].sort(),
     [loserOfKey("sf1"), loserOfKey("sf2")].sort()));
const majorEventId = Object.keys(cs.events).find((id) => cs.events[id].eventKey === "major");
const majorFinal = S.eventFinalOf(cs, majorEventId);
ck("Major FinalStandings 的冠軍＝決賽的 series 勝方",
  majorFinal?.championTeamId === winnerOfKey("final"), majorFinal?.championTeamId);
const order = [...(majorFinal?.rows ?? [])].sort((a, b) => a.rank - b.rank).map((r) => r.teamId);
ck("Major 名次順序＝冠 / 亞 / 季 / 殿（由 series 勝負決定）",
  eq(order, [winnerOfKey("final"), loserOfKey("final"), winnerOfKey("bronze"), loserOfKey("bronze")]),
  order.join(" > "));
ck("Major 名次來源標記仍是 playoff", majorFinal?.rankSource === "playoff");
//  積分榜也只看 series 勝負，不看地圖數之外的東西
const majorStandings = S.standingsOf(cs, csMajorEntryOf(cs).competition.id);
ck("Major 積分榜的淨勝分是地圖差（不會出現回合量級的數字）",
  (majorStandings.rows ?? []).every((r) => Math.abs(r.diff ?? 0) <= 4),
  (majorStandings.rows ?? []).map((r) => r.diff).join(","));

// ── §8 玩家出戰 BO3：fail-closed ─────────────────────────────────────────
console.log("\n§8 玩家出戰 BO3：fail-closed");
//  ⚠ 一張地圖結算不了一個 BO3。M3-2 **不假裝可以**：兩道都明確拒絕。
const majorFixture = majorFx[0];
const bridged = fixtureOutcomeInputFrom({
  result: {
    schema: "MatchResult.v1", winner: "us", score: { us: 13, opponent: 7 },
    resultSource: "engine", durationSec: 1800, seed: 1,
  },
  fixture: { ...majorFixture, sideA: cs.playerTeamId },
  playerTeamId: cs.playerTeamId,
});
ck("橋接拒絕用一場 MatchResult 結算一個 BO3 series",
  bridged.ok === false && bridged.errors.some((e) => e.code === "series_incomplete"),
  bridged.errors?.[0]?.message ?? "（沒有拒絕）");
ck("橋接對 BO1 的 CS 聯賽場次仍然正常運作（既有行為未變）",
  fixtureOutcomeInputFrom({
    result: {
      schema: "MatchResult.v1", winner: "us", score: { us: 13, opponent: 7 },
      resultSource: "engine", durationSec: 1800, seed: 1,
    },
    fixture: { ...regularFixtures0(cs), sideA: cs.playerTeamId },
    playerTeamId: cs.playerTeamId,
  }).ok === true);
function regularFixtures0(state) { return regularFixturesOf(state)[0]; }

// ── §9 沒有污染 ──────────────────────────────────────────────────────────
console.log("\n§9 CS 聯賽仍是 BO1、MOBA 仍是擊殺數");
const leagueSim = (cs.outcomes ?? []).filter((o) =>
  regularFixturesOf(cs).some((f) => f.id === o.fixtureId) && o.resultSource === RESULT_SOURCES.simulated);
ck("CS 聯賽的模擬賽果仍然是 1:0（BO1，逐值未變）",
  leagueSim.length > 0 && leagueSim.every((o) => Math.max(o.score.a, o.score.b) === 1
    && Math.min(o.score.a, o.score.b) === 0),
  `${leagueSim.length} 筆`);
ck("CS 聯賽仍用 BO1 的模擬器版本",
  leagueSim.every((o) => o.simulatorVersion === CS_SIMULATOR_VERSION));
const store9 = await freshStore();
const st9 = () => store9.getState();
st9().ensureCompetitionSeason("moba");
st9().advanceDay(30);
const mobaSim = (st9().competitionByMode.moba.outcomes ?? []).filter((o) => o.resultSource === RESULT_SOURCES.simulated);
ck("MOBA 的模擬賽果仍然是擊殺數（有超過 2 的比分）",
  mobaSim.length > 0 && mobaSim.some((o) => Math.max(o.score.a, o.score.b) > 2),
  `${mobaSim.length} 筆，最大 ${Math.max(...mobaSim.map((o) => Math.max(o.score.a, o.score.b)))}`);
ck("MOBA 仍用 MOBA 的模擬器版本",
  mobaSim.every((o) => o.simulatorVersion === SIMULATOR_VERSION));

// ── §10 mutation sentinel ────────────────────────────────────────────────
console.log("\n§10 Mutation sentinel");
ck("mutation sentinel：比分退回回合數時 §2 的合法性斷言會失敗",
  !isLegalBo3({ a: 13, b: 7 }), "memory-only mutation：模擬 BO3 誤抄 Codex 的回合比分");
ck("mutation sentinel：BO1 的 1:0 在 BO3 底下不合法",
  !isLegalBo3({ a: 1, b: 0 }), "memory-only mutation：模擬 M3-2 沒生效、仍走 BO1 投影");
ck("mutation sentinel：1:1 這種未打完的 series 不合法",
  !isLegalBo3({ a: 1, b: 1 }), "memory-only mutation：模擬 series 沒打到 first-to-2");
ck("mutation sentinel：3:0 這種超過 BO3 長度的比分不合法",
  !isLegalBo3({ a: 3, b: 0 }), "memory-only mutation：模擬 BO5 的比分寫進 BO3");

console.log(`\nCS Season M3-2 BO3 series: ${pass}/${pass + fail} PASS`);
if (fail > 0) { console.log(`FAILED ${fail}`); process.exit(1); }
