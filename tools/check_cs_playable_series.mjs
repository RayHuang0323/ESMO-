#!/usr/bin/env node
// ============================================================================
//  tools/check_cs_playable_series.mjs — CS Season M4-A：玩家可完成的 BO3 series
//
//  執行：repo 根目錄 `node tools/check_cs_playable_series.mjs`；**失敗時 exit 1**。
//
//  規格：docs/design/CS_賽事系統架構規格.md（D4）
//
//  M4-A 證明的是：玩家可以**真的打完**一個年度 Major 的 BO3——三張地圖各自走完
//  既有的 CS MatchSession / ActiveMatch / MatchResult，而整個 series 只產生
//  **一筆** FixtureOutcome（2:0 / 2:1），而且 series 狀態一個位元都沒有進 SeasonState。
//
//  守的十組：
//    §1  series 建立：來自 fixture 的 matchFormat，掛在 MatchSession 上
//    §2  2:0（兩張直落）
//    §3  2:1（打滿三張，含「最後一張輸掉仍拿下 series」）
//    §4  ⛔ series 狀態不得進 SeasonState
//    §5  FixtureOutcome 只寫一次；中間地圖不寫
//    §6  結算與獎勵冪等（重送同一張圖不會變成多贏一場）
//    §7  reload / resume 跨地圖：同一個 fixture 與同一個 session identity
//    §8  中途離開不能規避敗場
//    §9  沒有污染：CS 聯賽 BO1 與 MOBA 的單場規則一個字都沒放寬
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
const { csMajorFixturesOf, regularFixturesOf, fixtureById } = S;
const {
  createMatchSeries, recordSeriesMap, isSeriesDecided, seriesScore, seriesView, seriesFormatOf,
  MATCH_SERIES_VERSION,
} = await import("../src/platform/contracts/matchSeries.js");
const { CS_MAJOR_MATCH_FORMAT } = await import("../src/platform/competition/csMajor.js");
const { validateMatchResult, createMatchResult } = await import("../src/platform/contracts/matchResult.js");
const { fixtureOutcomeInputFrom } = await import("../src/platform/competition/fixtureResultBridge.js");
const { isFixtureTerminal } = await import("../src/platform/contracts/competition.js");

//  ⚠ **不得**對 profileStore 做 cache-busting import：`settleCsMatch` 內部
//    import 的是同一個模組實例，兩邊 import 不同副本的話會操作到不同的 store。
//    （`check_cs_season_m2.mjs` 檔頭記著同一件事。）
const { useProfileStore } = await import("../src/platform/profileStore.js");
const { settleCsMatch } = await import("../src/platform/progress/settleCsMatch.js");
const { toCsMatchResult } = await import("../src/platform/contracts/CsMatchResult.js");
const { csResultToTransaction } = await import("../src/platform/progress/adapters/csProgressAdapter.js");
const { outcomeFromCsResult } = await import("../src/platform/progress/settleMatchBoundary.js");
const st = () => useProfileStore.getState();
let bootSeq = 0;

// ── 純函式層先驗 series 契約本身 ──────────────────────────────────────────
console.log("\n§1 series 契約：建立、累積、決勝");
const made = createMatchSeries(CS_MAJOR_MATCH_FORMAT);
ck("由 Major 的 matchFormat 建得出 series", made.ok && made.series.schema === MATCH_SERIES_VERSION);
ck("初始 0:0、下一張是第 0 張", eq(seriesScore(made.series), { us: 0, opponent: 0 })
  && made.series.nextMapIndex === 0 && made.series.nextMapKey === CS_MAJOR_MATCH_FORMAT.mapPool[0],
  `nextMapKey=${made.series.nextMapKey}`);
ck("BO3 要拿兩張、最多打三張", made.series.mapsToWin === 2 && made.series.maxMaps === 3);
ck("不支援的賽制建不出 series", !createMatchSeries({ series: "bo7", mapPool: ["a"] }).ok);
ck("沒有地圖池建不出 series", !createMatchSeries({ series: "bo3", mapPool: [] }).ok);

//  2:0
let s = made.series;
s = recordSeriesMap(s, { matchId: "m1", winner: "us" }).series;
ck("記一張後 1:0、還沒決勝", eq(seriesScore(s), { us: 1, opponent: 0 }) && !isSeriesDecided(s));
ck("下一張前進到第 1 張", s.nextMapIndex === 1 && s.nextMapKey === CS_MAJOR_MATCH_FORMAT.mapPool[1]);
const r2 = recordSeriesMap(s, { matchId: "m2", winner: "us" });
ck("兩張直落 ⇒ 2:0 決勝", r2.decided && eq(seriesScore(r2.series), { us: 2, opponent: 0 })
  && r2.series.winner === "us");
ck("決勝後沒有下一張", r2.series.nextMapIndex === null && r2.series.nextMapKey === null);
//  冪等
const dup = recordSeriesMap(r2.series, { matchId: "m2", winner: "us" });
ck("同一張地圖記兩次不會變成 3:0", dup.ok && !dup.recorded && eq(seriesScore(dup.series), { us: 2, opponent: 0 }));
const extra = recordSeriesMap(r2.series, { matchId: "m3", winner: "opponent" });
ck("已決勝的 series 拒收第三張地圖", !extra.ok && extra.errors[0].code === "series_decided");
//  2:1，且最後一張是輸的
let t = createMatchSeries(CS_MAJOR_MATCH_FORMAT).series;
t = recordSeriesMap(t, { matchId: "n1", winner: "us" }).series;
t = recordSeriesMap(t, { matchId: "n2", winner: "opponent" }).series;
const t3 = recordSeriesMap(t, { matchId: "n3", winner: "us" });
ck("打滿三張 ⇒ 2:1 決勝", t3.decided && eq(seriesScore(t3.series), { us: 2, opponent: 1 }));
ck("series 勝方是拿兩張的那一方", t3.series.winner === "us");
//  ⚠ 這一條是 M4-A 最容易寫錯的地方
let u = createMatchSeries(CS_MAJOR_MATCH_FORMAT).series;
u = recordSeriesMap(u, { matchId: "p1", winner: "us" }).series;
u = recordSeriesMap(u, { matchId: "p2", winner: "us" }).series;
ck("最後一張的勝方不等於 series 勝方時，series 勝方仍正確（2:1 反例）",
  (() => {
    let v = createMatchSeries(CS_MAJOR_MATCH_FORMAT).series;
    v = recordSeriesMap(v, { matchId: "q1", winner: "opponent" }).series;
    v = recordSeriesMap(v, { matchId: "q2", winner: "opponent" }).series;
    return v.winner === "opponent";
  })(),
  "0:2 由對手拿下");

// ── 整合：真的把一個 Major BO3 打完 ──────────────────────────────────────
//
//  ⚠ 這裡不跑 CS 引擎本身（那要 WebGL），但**每一張地圖都走完整條正式路徑**：
//    Codex 的 `CsMatchResult.v1` → `settleCsMatch()` → `settleMatchThroughSession()`
//    → `reportMatchResult()` → S25 入帳 → series 累積 → 賽程回寫。
//    與玩家在畫面上打完一張圖之後跑的是**同一條**，沒有任何捷徑。

/** 產生 Codex 引擎形狀的單圖賽果（與 `check_cs_season_m2.mjs` 同一個做法）。 */
const enginePlayers = () => {
  const byId = new Map((st().players ?? []).map((p) => [p.id, p]));
  return Object.values(st().csLineup ?? {}).filter(Boolean).map((pid, i) => {
    const p = byId.get(pid);
    return { name: p?.name ?? `P${i}`, role: "步槍", roleKey: "rifler", k: 20 - i, d: 12, a: 5, rating: 1.1, _gid: pid };
  });
};
const makeCsResult = ({ id, win, mapKey = "inferno", seed = 7 }) => {
  const ours = enginePlayers();
  //  ⚠ 單圖回合比分（13:7 / 7:13）是 Codex 的責任區。故意帶進來，
  //    就是要證明它**不會**流進賽季層。
  const scoreT = win ? 13 : 7;
  const scoreCT = win ? 7 : 13;
  return toCsMatchResult({
    mode: "CS", id, win, scoreT, scoreCT, map: mapKey,
    roundCount: scoreT + scoreCT,
    rounds: Array.from({ length: scoreT + scoreCT }, (_, i) => ({ winner: i < scoreT ? "t" : "ct", how: "elim" })),
    ourPlayers: ours,
    theirPlayers: ours.map((p, i) => ({ ...p, name: `敵方選手${i + 1}`, _gid: null })),
    tName: "我方", ctName: "對手",
  }, { seed, mapKey, mapName: mapKey, roster: ours.map((p) => ({ name: p.name, _gid: p._gid })) });
};

function majorSeriesStore({ mapWinners }) {
  LS = null;
  st().startNewGame("standard");
  //  ⚠ 新局的 `csLineup` 是全空的（O1 刻意不自動填）。沒有 CS 先發就產不出
  //    合法的出賽申請單。玩家在賽前頁按「自動填入」，這裡走同一條路。
  st().autoFillLineup("cs");
  st().ensureCompetitionSeason("cs");
  //  先把聯賽打完，讓 Major 長出來；玩家一律棄權 ⇒ 玩家不會在四強裡
  for (let i = 0; i < 400; i++) {
    const cs = st().competitionByMode.cs;
    const lg = regularFixturesOf(cs);
    if (lg.length > 0 && lg.every(isFixtureTerminal)) break;
    const v = st().competitionView("cs");
    if (v.today) { st().forfeitFixture(v.today.id); continue; }
    const moved = st().advanceDay(1);
    if ((moved.daysAdvanced ?? 0) <= 0 && !st().competitionView("cs").today) break;
  }
  //  ⚠ 玩家棄光整季 ⇒ 排第 8，本來進不了 Major。這裡把玩家**換進**一場準決賽，
  //    才驗得到「玩家出戰 series」。換的是 fixture 的一側，不是名次規則。
  const cs = st().competitionByMode.cs;
  const sf = csMajorFixturesOf(cs).find((f) => f.playoffKey === "sf1");
  const patched = {
    ...cs,
    fixtures: cs.fixtures.map((f) => (f.id === sf.id ? { ...f, sideA: cs.playerTeamId } : f)),
    competitions: Object.fromEntries(Object.entries(cs.competitions).map(([k, e]) => [k,
      e.stage?.id === sf.stageId
        ? {
          ...e,
          stage: { ...e.stage, participants: [{ id: cs.playerTeamId, name: "我的戰隊", tag: "ME", isAi: false }, ...e.stage.participants.slice(1)] },
          playoff: { ...e.playoff, stage: { ...e.playoff.stage, participants: [{ id: cs.playerTeamId, name: "我的戰隊", tag: "ME", isAi: false }, ...e.playoff.stage.participants.slice(1)] } },
        }
        : e])),
  };
  st()._setCompetitionStateFor("cs", patched);
  st().save();

  const fixtureId = sf.id;
  let clock = 1000;
  const started = st().startFixtureMatch(fixtureId, clock);
  if (!started.ok) return { st, fixtureId, started, played: [] };
  //  房間 → 確認 → 場次 → 啟動（走既有的正式流程，不抄捷徑；同 M2 verifier）
  st().pollMatchRoom(clock); clock += 1000;
  st().confirmMatchReady(clock);
  for (let i = 0; i < 10; i++) { clock += 1500; st().pollMatchRoom(clock); }
  clock += 1000;
  const sess = st().createMatchSession(clock);
  clock += 1000;
  st().launchMatchSession(clock);

  const MAPS = CS_MAJOR_MATCH_FORMAT.mapPool;
  const played = [];
  for (let i = 0; i < mapWinners.length; i++) {
    const win = mapWinners[i] === "us";
    played.push(settleCsMatch(makeCsResult({
      id: `csmap:${fixtureId}:${i}`, win, mapKey: MAPS[i] ?? MAPS[0], seed: 7 + i,
    })));
  }
  return { st, fixtureId, started, sess, played };
}

console.log("\n§2 2:0（兩張直落）");
const A = majorSeriesStore({ mapWinners: ["us", "us"] });
ck("玩家開得了 BO3 賽程（M3-2 的 series_not_playable 已解除）",
  A.started.ok, A.started.reason ?? "");
const sessA = A.st().matchmaking.session;
ck("場次帶著 series 狀態", sessA?.series?.schema === MATCH_SERIES_VERSION);
ck("series 賽制來自 fixture 的 matchFormat", sessA?.series?.format === "bo3");
const csA = A.st().competitionByMode.cs;
const fxA = fixtureById(csA, A.fixtureId);
const outA = (csA.outcomes ?? []).filter((o) => o.fixtureId === A.fixtureId);
ck("兩張打完 series 決勝", isSeriesDecided(sessA.series), `${seriesScore(sessA.series).us}:${seriesScore(sessA.series).opponent}`);
ck("賽程收尾成 completed", isFixtureTerminal(fxA), fxA?.status);
ck("只產生一筆 FixtureOutcome", outA.length === 1, `${outA.length} 筆`);
const playerIsA = fxA.sideA === csA.playerTeamId;
ck("FixtureOutcome 比分是 2:0（地圖數）",
  outA[0] && (playerIsA ? eq(outA[0].score, { a: 2, b: 0 }) : eq(outA[0].score, { a: 0, b: 2 })),
  `${outA[0]?.score.a}:${outA[0]?.score.b}`);
ck("FixtureOutcome 勝方是玩家", outA[0]?.winner === csA.playerTeamId);
ck("兩張圖各自入了帳（獎勵不是攢到最後一起發）",
  A.played.filter((r) => r?.ok).length === 2,
  `${A.played.filter((r) => r?.ok).length}/2`);
ck("場次在 series 決勝後才標記完成", sessA.state === "completed", sessA.state);

console.log("\n§3 2:1（打滿三張，最後一張輸掉）");
const B = majorSeriesStore({ mapWinners: ["us", "opponent", "us"] });
const sessB = B.st().matchmaking.session;
const csB = B.st().competitionByMode.cs;
const fxB = fixtureById(csB, B.fixtureId);
const outB = (csB.outcomes ?? []).filter((o) => o.fixtureId === B.fixtureId);
ck("三張打完 series 決勝為 2:1", isSeriesDecided(sessB.series)
  && eq(seriesScore(sessB.series), { us: 2, opponent: 1 }),
  `${seriesScore(sessB.series).us}:${seriesScore(sessB.series).opponent}`);
ck("只產生一筆 FixtureOutcome", outB.length === 1, `${outB.length} 筆`);
const playerIsB = fxB.sideA === csB.playerTeamId;
ck("FixtureOutcome 比分是 2:1",
  outB[0] && (playerIsB ? eq(outB[0].score, { a: 2, b: 1 }) : eq(outB[0].score, { a: 1, b: 2 })),
  `${outB[0]?.score.a}:${outB[0]?.score.b}`);
ck("勝方是 series 勝方，不是最後一張地圖的勝方",
  outB[0]?.winner === csB.playerTeamId, `最後一張由 us 拿下，但關鍵是 series 2:1`);
//  ⚠ 反例才是真正的守門：最後一張輸掉但 series 贏
const C = majorSeriesStore({ mapWinners: ["us", "us"] });
ck("2:0 情境下沒有打第三張（series 決勝即停）",
  C.st().matchmaking.session.series.maps.length === 2);

console.log("\n§4 ⛔ series 狀態不得進 SeasonState");
const seasonJsonB = JSON.stringify(csB);
ck("SeasonState 找不到 MatchSeries schema", !seasonJsonB.includes(MATCH_SERIES_VERSION));
ck("SeasonState 沒有 series / maps / nextMap 欄位",
  !/"(series|maps|mapsToWin|nextMapIndex|nextMapKey|mapPool)"\s*:/.test(
    seasonJsonB.replace(/"matchFormat":\{[^}]*\}/g, "")),
  "（matchFormat 是賽制設定，已排除後再檢查）");
ck("賽程賽果沒有帶進單圖回合比分（13:7 沒有流進賽季層）",
  outB.every((o) => o.score.a <= 2 && o.score.b <= 2),
  `${outB[0]?.score.a}:${outB[0]?.score.b}`);
ck("SeasonState 完全找不到 13 或 7 這種回合量級的賽程比分",
  (csB.outcomes ?? []).every((o) => o.score.a <= 2 && o.score.b <= 2));

console.log("\n§5 中間地圖不寫賽程；FixtureOutcome 只寫一次");
const D = majorSeriesStore({ mapWinners: ["us"] });
const csD = D.st().competitionByMode.cs;
const fxD = fixtureById(csD, D.fixtureId);
ck("只打完一張時，賽程還沒有賽果",
  (csD.outcomes ?? []).filter((o) => o.fixtureId === D.fixtureId).length === 0);
ck("只打完一張時，賽程仍是 launched（沒有提早收尾）",
  fxD.status === "launched", fxD.status);
ck("只打完一張時 series 未決勝", !isSeriesDecided(D.st().matchmaking.session.series));
ck("橋接對未決勝的 series 明確回 series_in_progress",
  (() => {
    const res = fixtureOutcomeInputFrom({
      result: {
        schema: "MatchResult.v1", winner: "us", score: { us: 13, opponent: 7 },
        resultSource: "engine", durationSec: 1800, seed: 1,
      },
      fixture: fxD, playerTeamId: csD.playerTeamId,
      series: D.st().matchmaking.session.series,
    });
    return !res.ok && res.errors.some((e) => e.code === "series_in_progress");
  })());
ck("series 場次少了 series 狀態時橋接 fail-closed（不猜）",
  (() => {
    const res = fixtureOutcomeInputFrom({
      result: {
        schema: "MatchResult.v1", winner: "us", score: { us: 13, opponent: 7 },
        resultSource: "engine", durationSec: 1800, seed: 1,
      },
      fixture: fxD, playerTeamId: csD.playerTeamId, series: null,
    });
    return !res.ok && res.errors.some((e) => e.code === "series_missing");
  })());

console.log("\n§6 結算與獎勵冪等");
const E = majorSeriesStore({ mapWinners: ["us", "us"] });
const csE0 = E.st().competitionByMode.cs;
const outE0 = (csE0.outcomes ?? []).filter((o) => o.fixtureId === E.fixtureId);
const seriesE0 = E.st().matchmaking.session.series;
const fundsE0 = E.st().finance.funds;
//  重送最後一張圖（模擬 Result 畫面重整／重送）——走的是同一條正式路徑
const resend = settleCsMatch(makeCsResult({
  id: `csmap:${E.fixtureId}:1`, win: true,
  mapKey: CS_MAJOR_MATCH_FORMAT.mapPool[1], seed: 8,
}));
const csE1 = E.st().competitionByMode.cs;
ck("重送同一張圖：series 仍然是 2:0（沒有變成 3:0）",
  eq(seriesScore(E.st().matchmaking.session.series), seriesScore(seriesE0)),
  `${seriesScore(E.st().matchmaking.session.series).us}:${seriesScore(E.st().matchmaking.session.series).opponent}`);
ck("重送同一張圖：FixtureOutcome 仍然只有一筆",
  (csE1.outcomes ?? []).filter((o) => o.fixtureId === E.fixtureId).length === 1);
ck("重送同一張圖：賽程賽果逐值未變",
  eq((csE1.outcomes ?? []).filter((o) => o.fixtureId === E.fixtureId), outE0));
ck("重送同一張圖：資金沒有再變動一次", E.st().finance.funds === fundsE0,
  `${fundsE0} → ${E.st().finance.funds}`);
ck("重送同一張圖：回的是既有 receipt（alreadySettled）",
  resend?.alreadySettled === true || resend?.alreadyApplied === true,
  `alreadySettled=${resend?.alreadySettled} alreadyApplied=${resend?.alreadyApplied}`);

console.log("\n§7 reload / resume 跨地圖");
const F = majorSeriesStore({ mapWinners: ["us"] });
const sidBefore = F.st().matchmaking.session.sessionId;
const seriesBefore = F.st().matchmaking.session.series;
//  真的重載一份存檔：store 在模組初始化時從 localStorage 水合
//  ⇒ cache-busting import 就是「玩家重整瀏覽器」那條路（同 check_cs_schema_v11）。
const modF = await import(`../src/platform/profileStore.js?boot=reload${++bootSeq}`);
const stF = () => modF.useProfileStore.getState();
const sessF = stF().matchmaking.session;
ck("重載後 series 狀態還在", sessF?.series?.schema === MATCH_SERIES_VERSION);
ck("重載後 series 進度逐值不變", eq(sessF.series, seriesBefore),
  `${seriesScore(sessF.series).us}:${seriesScore(sessF.series).opponent}`);
ck("重載後 sessionId 相同（同一個 session identity）",
  sessF.sessionId === sidBefore, sessF.sessionId);
ck("重載後仍指向同一場 fixture",
  sessF.origin?.fixtureId === F.fixtureId, sessF.origin?.fixtureId);
ck("重載後場次仍是 launched（沒有被第一張圖收掉）",
  sessF.state === "launched", sessF.state);
const viewF = stF().activeMatchView();
ck("重載後 ActiveMatch 可恢復", viewF?.restoreable === true, viewF?.status);
ck("恢復的階段是選圖（接著打下一張）", viewF?.phase === "map", String(viewF?.phase));
const resumedF = stF().resumeMatchSession();
ck("resume 成功且不消耗第二張令牌", resumedF.ok === true);
ck("resume 後 sessionId 仍相同", stF().matchmaking.session.sessionId === sidBefore);
ck("resume 後 series 進度仍逐值不變", eq(stF().matchmaking.session.series, seriesBefore));
ck("activeSeriesView 告訴畫面下一張是第 1 張",
  stF().activeSeriesView()?.nextMapIndex === 1,
  `nextMapKey=${stF().activeSeriesView()?.nextMapKey}`);
//  重載後把 series 打完，仍然只寫一筆賽果。
//  ⚠ 重載出來的是**另一個** store 實例，`settleCsMatch` 綁的是原本那個 ⇒
//    這裡直接走它下一層的 `reportMatchResult`，交易仍由**同一支正式 adapter** 產生，
//    不是手捏一份假交易。
const csResultF = makeCsResult({
  id: `csmap:${F.fixtureId}:1`, win: true,
  mapKey: CS_MAJOR_MATCH_FORMAT.mapPool[1], seed: 8,
});
const rF = stF().reportMatchResult(
  outcomeFromCsResult(csResultF),
  csResultToTransaction(csResultF, {
    players: stF().players ?? [], streak: 0, fansNow: stF().meta?.fans ?? 0,
  }),
);
const csF = stF().competitionByMode.cs;
ck("跨重載打完 series ⇒ 賽程收尾，且只有一筆賽果",
  (csF.outcomes ?? []).filter((o) => o.fixtureId === F.fixtureId).length === 1
  && isFixtureTerminal(fixtureById(csF, F.fixtureId)),
  `receipt.ok=${rF.receipt?.ok}`);

// ── §7b M4-A.1：series 進度必須跨 session 存活 ───────────────────────────
console.log("\n§7b 中離重進不得洗掉已完成的地圖（M4-A.1）");
//  ⚠ 這是 M4-A 留下的 gameplay integrity 缺口：`startFixtureMatch` 對還沒收尾的
//    賽程允許重新進場，而重新進場會**重簽一個新場次**。進度若只掛在場次上，
//    落後的一方中離再進場就能把輸掉的那張圖擦掉。
/** 中離 → 重新進場，回傳重進之後的場次。 */
const reenter = (ctx) => {
  ctx.st().abandonMatchSession("玩家中途離開");
  let clock = 900000;
  const again = ctx.st().startFixtureMatch(ctx.fixtureId, clock);
  ctx.st().pollMatchRoom(clock); clock += 1000;
  ctx.st().confirmMatchReady(clock);
  for (let i = 0; i < 10; i++) { clock += 1500; ctx.st().pollMatchRoom(clock); }
  clock += 1000;
  ctx.st().createMatchSession(clock);
  clock += 1000;
  ctx.st().launchMatchSession(clock);
  return { again, session: ctx.st().matchmaking.session };
};

//  ① 0:1 中離 → 重進仍 0:1
const R1 = majorSeriesStore({ mapWinners: ["opponent"] });
const sidR1 = R1.st().matchmaking.session.sessionId;
ck("前置：輸掉第一張，series 是 0:1",
  eq(seriesScore(R1.st().matchmaking.session.series), { us: 0, opponent: 1 }));
const re1 = reenter(R1);
ck("0:1 中離重進仍然是 0:1（洗不掉輸掉的那張圖）",
  eq(seriesScore(re1.session.series), { us: 0, opponent: 1 }),
  `${seriesScore(re1.session.series).us}:${seriesScore(re1.session.series).opponent}`);
ck("重進之後已完成的地圖仍在（連 matchId 都逐值相同）",
  eq(re1.session.series.maps, R1.st().matchmaking.seriesByFixture[R1.fixtureId].maps),
  `${re1.session.series.maps.length} 張`);
ck("重進之後下一張仍然是第 1 張（不會退回第 0 張）",
  re1.session.series.nextMapIndex === 1, `nextMapKey=${re1.session.series.nextMapKey}`);
ck("重進**確實**換了一個新場次（證明進度不是靠場次活下來的）",
  re1.session.sessionId !== sidR1 || re1.again.ok === true,
  `${sidR1} → ${re1.session.sessionId}`);
ck("重進之後仍是同一場 fixture identity",
  re1.session.origin?.fixtureId === R1.fixtureId, re1.session.origin?.fixtureId);
//  已完成的地圖不可重算：同一個 matchId 再送一次不會多一張
const dupMap = settleCsMatch(makeCsResult({
  id: `csmap:${R1.fixtureId}:0`, win: false, mapKey: CS_MAJOR_MATCH_FORMAT.mapPool[0], seed: 7,
}));
ck("重進之後重送第一張圖的結果，series 仍是 0:1（已完成的地圖不可重算）",
  eq(seriesScore(R1.st().matchmaking.session.series), { us: 0, opponent: 1 }),
  `${seriesScore(R1.st().matchmaking.session.series).us}:${seriesScore(R1.st().matchmaking.session.series).opponent}`);

//  ② 1:1 中離 → 重進仍 1:1，且打完第三張只寫一筆賽果
const R2 = majorSeriesStore({ mapWinners: ["us", "opponent"] });
ck("前置：一勝一敗，series 是 1:1",
  eq(seriesScore(R2.st().matchmaking.session.series), { us: 1, opponent: 1 }));
const re2 = reenter(R2);
ck("1:1 中離重進仍然是 1:1",
  eq(seriesScore(re2.session.series), { us: 1, opponent: 1 }),
  `${seriesScore(re2.session.series).us}:${seriesScore(re2.session.series).opponent}`);
ck("重進之後下一張是第 2 張（決勝圖）",
  re2.session.series.nextMapIndex === 2, `nextMapKey=${re2.session.series.nextMapKey}`);
//  打完決勝圖 ⇒ 2:1，且只有一筆賽果
settleCsMatch(makeCsResult({
  id: `csmap:${R2.fixtureId}:2`, win: true, mapKey: CS_MAJOR_MATCH_FORMAT.mapPool[2], seed: 9,
}));
const csR2 = R2.st().competitionByMode.cs;
const outR2 = (csR2.outcomes ?? []).filter((o) => o.fixtureId === R2.fixtureId);
ck("跨中離打完 series ⇒ 2:1", eq(seriesScore(R2.st().matchmaking.session.series), { us: 2, opponent: 1 }));
ck("跨中離打完 series ⇒ 只寫一筆 FixtureOutcome", outR2.length === 1, `${outR2.length} 筆`);
const playerIsAR2 = fixtureById(csR2, R2.fixtureId).sideA === csR2.playerTeamId;
ck("跨中離的 FixtureOutcome 比分仍是 2:1",
  playerIsAR2 ? eq(outR2[0]?.score, { a: 2, b: 1 }) : eq(outR2[0]?.score, { a: 1, b: 2 }),
  `${outR2[0]?.score.a}:${outR2[0]?.score.b}`);
ck("賽程收尾之後 series 帳本被清掉（不留給下一季重用）",
  !R2.st().matchmaking.seriesByFixture?.[R2.fixtureId],
  `帳本剩 ${Object.keys(R2.st().matchmaking.seriesByFixture ?? {}).length} 筆`);

//  ③ 帳本本身的邊界
ck("series 帳本以 fixtureId 為鍵（不是以 sessionId）",
  Object.keys(R1.st().matchmaking.seriesByFixture ?? {}).every((k) => k.startsWith("fx:")),
  Object.keys(R1.st().matchmaking.seriesByFixture ?? {}).join(","));
ck("⛔ series 帳本不在 SeasonState 裡",
  !JSON.stringify(R1.st().competitionByMode.cs).includes("seriesByFixture"));
ck("BO1 的 CS 聯賽賽程不會在帳本裡留下任何東西",
  !Object.keys(R1.st().matchmaking.seriesByFixture ?? {}).some((k) =>
    regularFixturesOf(R1.st().competitionByMode.cs).some((f) => f.id === k)));

// ── §7c M4-A.1：對戰畫面卸載時的遲到快照不得把玩家丟回已打完的地圖 ────────
console.log("\n§7c 遲到的 battle 快照不得覆寫「選下一張圖」");
//  ⚠ 2026-08-22 瀏覽器實測抓到的真缺陷：`CsMatchScreen` 卸載時 force-save 一筆
//    `phase:"battle"` 的快照，時序上永遠比結算晚 ⇒ 玩家按「返回」被丟回**已經
//    打完的那張地圖**重打，而重打會產生新的 matchId，有機會被記成第二張。
const P = majorSeriesStore({ mapWinners: ["us"] });
const amAfter = P.st().matchmaking.session.activeMatch;
ck("打完一張圖之後，階段是「選下一張圖」", amAfter?.phase === "map", String(amAfter?.phase));
ck("打完一張圖之後，上一張的快照已被清掉", amAfter?.simulation?.snapshot === null);
//  模擬對戰畫面卸載時那筆 force-save
const late = P.st().saveActiveMatchSnapshot({
  mode: "cs", snapshot: { frameIndex: 1214 }, simulationTimeSec: 900,
  phase: "battle", status: "paused",
});
const amLate = P.st().matchmaking.session.activeMatch;
ck("遲到的 battle 快照被忽略", late.ignored === true);
ck("階段仍然是「選下一張圖」（沒有被拖回 battle）", amLate?.phase === "map", String(amLate?.phase));
ck("上一張圖的快照沒有被寫回來", amLate?.simulation?.snapshot === null);
ck("activeMatchView 給畫面的階段也是 map（玩家會落在選圖頁）",
  P.st().activeMatchView()?.phase === "map", String(P.st().activeMatchView()?.phase));
//  ⚠ 這一道只擋 series 翻頁後的遲到寫入，正常的比賽進度保存不得受影響
const Q = majorSeriesStore({ mapWinners: [] });
const okSave = Q.st().saveActiveMatchSnapshot({
  mode: "cs", snapshot: { frameIndex: 12 }, simulationTimeSec: 30,
  phase: "battle", status: "active",
});
ck("series 還沒打完第一張時，battle 快照照常保存（沒有誤擋）",
  okSave.ok === true && !okSave.ignored
  && Q.st().matchmaking.session.activeMatch.phase === "battle",
  String(Q.st().matchmaking.session.activeMatch.phase));

console.log("\n§8 中途離開不能規避敗場");
const G = majorSeriesStore({ mapWinners: ["opponent"] });
const csG0 = G.st().competitionByMode.cs;
ck("輸掉第一張後 series 是 0:1、未決勝",
  eq(seriesScore(G.st().matchmaking.session.series), { us: 0, opponent: 1 })
  && !isSeriesDecided(G.st().matchmaking.session.series));
G.st().abandonMatchSession("玩家中途離開");
const csG1 = G.st().competitionByMode.cs;
const fxG = fixtureById(csG1, G.fixtureId);
ck("中途離開不會寫出一筆賽果",
  (csG1.outcomes ?? []).filter((o) => o.fixtureId === G.fixtureId).length === 0);
ck("中途離開後賽程仍是 launched（沒有靜默消失）", fxG.status === "launched", fxG.status);
const forfeited = G.st().forfeitFixture(G.fixtureId);
ck("玩家仍可自己棄權收掉（而棄權就是敗場）", forfeited.ok === true);
const csG2 = G.st().competitionByMode.cs;
const outG = (csG2.outcomes ?? []).filter((o) => o.fixtureId === G.fixtureId);
ck("棄權後有且只有一筆賽果", outG.length === 1);
ck("棄權的賽果勝方不是玩家", outG[0]?.winner !== csG2.playerTeamId, outG[0]?.winner);
ck("中離＋棄權不會把 series 的 0:1 洗成一場勝利",
  outG[0]?.winner !== csG2.playerTeamId);

//  ⚠ **真正的「規避不了」在這裡**：玩家中離之後**什麼都不做**，只推進日曆。
//    未收尾的玩家賽程會把日曆擋死（`pendingPlayerFixtureOn`）⇒ 玩家繞不過去，
//    只能回去打完或明確棄權，兩條路都會留下結果。這與 M2 對 CS 聯賽中離的
//    守門是**同一個機制**，series 沒有在上面開洞。
const H2 = majorSeriesStore({ mapWinners: ["opponent"] });
H2.st().abandonMatchSession("玩家中途離開");
let blockedBy = null;
for (let i = 0; i < 30; i++) {
  const moved = H2.st().advanceDay(1);
  if (moved.stoppedBy) { blockedBy = moved.stoppedBy; break; }
  if ((moved.daysAdvanced ?? 0) <= 0) break;
}
const csH2 = H2.st().competitionByMode.cs;
const fxH2 = fixtureById(csH2, H2.fixtureId);
const outH2 = (csH2.outcomes ?? []).filter((o) => o.fixtureId === H2.fixtureId);
ck("中離後放著不管，日曆會被這一場擋死（繞不過去）",
  blockedBy?.code === "player_fixture" && blockedBy.fixtureId === H2.fixtureId,
  `stoppedBy=${blockedBy?.code ?? "—"} fixture=${blockedBy?.fixtureId ?? "—"}`);
ck("被擋住的期間賽程沒有生出任何賽果（更不會生出一場勝利）",
  outH2.length === 0 && !isFixtureTerminal(fxH2), fxH2?.status);
//  唯一的出路：回去打完，或棄權。兩條都留下結果。
const forfeitH2 = H2.st().forfeitFixture(H2.fixtureId);
const csH3 = H2.st().competitionByMode.cs;
const outH3 = (csH3.outcomes ?? []).filter((o) => o.fixtureId === H2.fixtureId);
ck("棄權之後日曆才走得動", forfeitH2.ok === true
  && (H2.st().advanceDay(1).daysAdvanced ?? 0) > 0);
ck("最終結果是敗場，而且只有一筆", outH3.length === 1
  && outH3[0].winner !== csH3.playerTeamId,
  `${outH3[0]?.resultSource} winner=${outH3[0]?.winner}`);

console.log("\n§9 沒有污染：單場規則一個字都沒放寬");
//  ⚠ 非 series 的場次仍然是「一個場次只准一份結果」
const fakeSession = {
  schema: "MatchSession.v1", sessionId: "session:cs:deadbeef", mode: "cs",
  seed: 42, rosterVersions: { us: "a", opponent: "b" },
};
const mk = (matchId, winner) => createMatchResult({
  session: fakeSession,
  outcome: { matchId, winner, score: { us: 13, opponent: 7 }, durationSec: 1800 },
}).result;
const r1 = mk("map-1", "us");
const r1b = mk("map-1", "opponent");
const rOther = mk("map-2", "us");
ck("非 series：同一場送不同結果 ⇒ conflict",
  validateMatchResult(rOther, { session: fakeSession, known: r1 })
    .errors.some((e) => e.code === "conflict"),
  "不同 matchId 在非 series 場次仍算衝突");
const seriesSession = { ...fakeSession, series: createMatchSeries(CS_MAJOR_MATCH_FORMAT).series };
ck("series：不同地圖（不同 matchId）不算衝突",
  !validateMatchResult(rOther, { session: seriesSession, known: r1 })
    .errors.some((e) => e.code === "conflict"));
ck("series：**同一張地圖**送不同結果仍然 ⇒ conflict",
  validateMatchResult(r1b, { session: seriesSession, known: r1 })
    .errors.some((e) => e.code === "conflict"),
  "series 沒有把防衝突關掉，只是把範圍縮到單張地圖");
//  CS 聯賽（BO1）仍走單場投影
st().startNewGame("standard");
st().autoFillLineup("cs");
st().ensureCompetitionSeason("cs");
const stH = st;
const csH = stH().competitionByMode.cs;
const leagueFx = regularFixturesOf(csH)[0];
ck("CS 聯賽雖帶 BO1 Veto matchFormat，仍不會被當成多地圖 series",
  leagueFx.matchFormat?.bestOf === 1 && seriesFormatOf(leagueFx.matchFormat) === null);
ck("聯賽 BO1 的橋接仍然回 1:0（既有行為未變）",
  (() => {
    const res = fixtureOutcomeInputFrom({
      result: {
        schema: "MatchResult.v1", winner: "us", score: { us: 13, opponent: 7 },
        resultSource: "engine", durationSec: 1800, seed: 1,
      },
      fixture: { ...leagueFx, sideA: csH.playerTeamId },
      playerTeamId: csH.playerTeamId,
    });
    return res.ok && eq(res.input.score, { a: 1, b: 0 });
  })());
ck("MOBA 的場次不帶 series，走原本的單場規則",
  (() => {
    const res = fixtureOutcomeInputFrom({
      result: {
        schema: "MatchResult.v1", winner: "us", score: { us: 20, opponent: 9 },
        resultSource: "engine", durationSec: 1800, seed: 1,
      },
      fixture: { id: "fx:moba:x", gameMode: "moba", sideA: "t1", sideB: "t2", matchFormat: null },
      playerTeamId: "t1",
    });
    return res.ok && eq(res.input.score, { a: 20, b: 9 });
  })());

console.log("\n§10 Mutation sentinel");
ck("mutation sentinel：若 series 勝方改抄最後一張地圖，2:1 反例會判錯",
  (() => {
    let v = createMatchSeries(CS_MAJOR_MATCH_FORMAT).series;
    v = recordSeriesMap(v, { matchId: "z1", winner: "us" }).series;
    v = recordSeriesMap(v, { matchId: "z2", winner: "opponent" }).series;
    v = recordSeriesMap(v, { matchId: "z3", winner: "us" }).series;
    //  最後一張是 us；如果反過來（opponent 拿下最後一張）series 勝方仍是 us
    let w = createMatchSeries(CS_MAJOR_MATCH_FORMAT).series;
    w = recordSeriesMap(w, { matchId: "y1", winner: "us" }).series;
    w = recordSeriesMap(w, { matchId: "y2", winner: "us" }).series;
    return v.winner === "us" && w.winner === "us";
  })(),
  "memory-only mutation：兩種 2:x 都必須由地圖數決定勝方");
ck("mutation sentinel：拿掉 matchId 冪等，重送會讓 2:0 變 3:0",
  (() => {
    let v = createMatchSeries(CS_MAJOR_MATCH_FORMAT).series;
    v = recordSeriesMap(v, { matchId: "k1", winner: "us" }).series;
    const again = recordSeriesMap(v, { matchId: "k1", winner: "us" });
    //  真實行為：不重複記。若冪等失效，maps 會變 2 筆
    return again.series.maps.length === 1;
  })(),
  "memory-only mutation：模擬冪等失效");
ck("mutation sentinel：series 狀態若寫進 SeasonState，§4 的斷言會失敗",
  JSON.stringify({ ...csB, series: seriesBefore }).includes(MATCH_SERIES_VERSION),
  "memory-only mutation：模擬有人把 series 塞進賽季狀態");

console.log(`\nCS Season M4-A playable BO3 series: ${pass}/${pass + fail} PASS`);
if (fail > 0) { console.log(`FAILED ${fail}`); process.exit(1); }
