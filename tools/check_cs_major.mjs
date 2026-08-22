#!/usr/bin/env node
// ============================================================================
//  tools/check_cs_major.mjs — CS Season M3-1：年度 Major（single_elim lifecycle）
//
//  執行：repo 根目錄 `node tools/check_cs_major.mjs`；**失敗時 exit 1**。
//
//  規格：docs/design/CS_賽事系統架構規格.md（D3 / D4 / §5 賽事模型）
//  計畫：docs/superpowers/plans/2026-08-21-cs-season-competition.md（M3-1）
//
//  M3-1 證明的是：CS 聯賽打完之後，年度 Major 會**自己長出來**——四強席位取自
//  聯賽積分榜、對戰表是決定性的、AI 能把它打完、冠軍決定 Major 的最終名次，
//  而且這一切都沒有讓 Season 層看見任何一張地圖或任何一個回合。
//
//  守的七組：
//    §1  Major 建立：時機、四強席位、種子順序、與聯賽同一條 circuit
//    §2  bracket：決定性 ＋ 冪等，sf1/sf2 先出、bronze/final 等準決賽收尾
//    §3  ⛔ ownership lock：Major 的比分是地圖數，Season 層看不到 round/map
//    §4  完整 lifecycle：4 隊 → 準決賽 → 決賽 → 冠軍 → Major FinalStandings
//    §5  封存接線：Major 沒打完不得封季；打完之後 CS 賽季才封得起來
//    §6  不污染 MOBA：MOBA 賽季／季後賽／歷屆名次一格都沒動
//    §7  mutation sentinel
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
const {
  ensureCsMajor, csMajorEntryOf, csMajorFixturesOf, isCsMajorDone,
  eventFinalOf, standingsOf, seasonStandings, tryCareerFinalStandingsOf,
  fixtureById, isFixtureLaunched,
} = S;
const { CS_MAJOR_SLOTS, CS_MAJOR_TIER, CS_MAJOR_EVENT_KEY, csMajorCompetitionId } =
  await import("../src/platform/competition/csMajor.js");
const { csMajorQualifiers, CS_MAJOR_QUALIFICATION } =
  await import("../src/platform/competition/csSeasonConfig.js");
const { PLAYOFF_MATCHES } = await import("../src/platform/competition/playoffs.js");
const { isFixtureTerminal } = await import("../src/platform/contracts/competition.js");
const { CS_SIMULATOR_VERSION, CS_SERIES_SIMULATOR_VERSION } =
  await import("../src/platform/competition/simulateFixture.js");

let bootSeq = 0;
const freshStore = async () => {
  LS = null;
  const mod = await import(`../src/platform/profileStore.js?boot=${++bootSeq}`);
  mod.useProfileStore.getState().startNewGame("standard");
  return mod.useProfileStore;
};

/**
 * 把 CS 賽季推到「聯賽全部收尾」為止（玩家場次一律棄權，其餘靠推進模擬）。
 * ⚠ 不直接呼叫任何內部封存函式——要證明的是**正式 gameplay action** 走得到。
 */
const runCsLeagueToEnd = (s, limit = 400) => {
  for (let i = 0; i < limit; i++) {
    const st = s().competitionByMode.cs;
    if (!st) break;
    const league = S.regularFixturesOf(st);
    if (league.length > 0 && league.every(isFixtureTerminal)) break;
    const v = s().competitionView("cs");
    if (v.today) { s().forfeitFixture(v.today.id); continue; }
    const moved = s().advanceDay(1);
    if ((moved.daysAdvanced ?? 0) <= 0 && !s().competitionView("cs").today) break;
  }
};

/** 再往下把整季（含 Major）跑到封存為止。 */
const runCsSeasonToSeal = (s, limit = 400) => {
  for (let i = 0; i < limit; i++) {
    if (s().competitionByMode.cs?.final) break;
    const v = s().competitionView("cs");
    if (v.today) { s().forfeitFixture(v.today.id); continue; }
    const moved = s().advanceDay(1);
    if ((moved.daysAdvanced ?? 0) <= 0 && !s().competitionView("cs").today) break;
  }
};

// ── §1 Major 建立 ──────────────────────────────────────────────────────────
console.log("\n§1 Major 建立：時機、席位、種子");
const store1 = await freshStore();
const s1 = () => store1.getState();
s1().ensureCompetitionSeason("cs");

//  ① 聯賽還沒打完 ⇒ 不得先排 Major（種子來自完整的聯賽積分榜）
const early = ensureCsMajor(s1().competitionByMode.cs);
ck("聯賽還沒打完時 Major 不會被建立", !csMajorEntryOf(early.state),
  `added=${early.added}`);

runCsLeagueToEnd(s1);
const leagueDone = S.regularFixturesOf(s1().competitionByMode.cs).every(isFixtureTerminal);
ck("CS 聯賽走得完（前置條件）", leagueDone,
  `${S.regularFixturesOf(s1().competitionByMode.cs).length} 場`);

const cs1 = s1().competitionByMode.cs;
const major1 = csMajorEntryOf(cs1);
ck("聯賽收尾後 Major 自己長出來", !!major1,
  major1 ? major1.competition.id : "沒有 Major");
ck("Major 的 competition id 與規格一致（comp:cs:s1:official:major）",
  major1?.competition?.id === csMajorCompetitionId(1), major1?.competition?.id);
ck("Major 的 tier 是 major", major1?.competition?.tier === CS_MAJOR_TIER);
ck("Major 是 single_elim", major1?.stage?.format === "single_elim", major1?.stage?.format);
ck("Major 正好 4 隊", (major1?.stage?.participants ?? []).length === CS_MAJOR_SLOTS,
  `${(major1?.stage?.participants ?? []).length} 隊`);

//  ② 席位＝聯賽 standings 前四，順序＝名次順序
const leagueStandings = seasonStandings(cs1);
const expectQual = csMajorQualifiers(leagueStandings);
const gotQual = (major1?.playoff?.qualification?.qualified ?? [])
  .map(({ seed, teamId }) => ({ seed, teamId }));
ck("四強席位逐值等於 csMajorQualifiers(聯賽積分榜)", eq(gotQual, expectQual),
  `${gotQual.map((q) => `${q.seed}.${q.teamId}`).join(" ")}`);
ck("晉級名額是設定裡的 topN", expectQual.length === CS_MAJOR_QUALIFICATION.topN);
ck("種子順序就是聯賽名次順序",
  eq(gotQual.map((q) => q.teamId), leagueStandings.rows.slice(0, 4).map((r) => r.teamId)));
ck("不在聯賽裡的隊伍進不了 Major",
  gotQual.every((q) => leagueStandings.rows.some((r) => r.teamId === q.teamId)));

//  ③ Event / Circuit 接線
const majorEvent = Object.values(cs1.events ?? {}).find((e) => e.eventKey === CS_MAJOR_EVENT_KEY);
ck("Major 有自己的 Event", !!majorEvent, majorEvent?.id);
ck("Major Event 掛在聯賽同一條 circuit 上",
  !!majorEvent && majorEvent.circuitId === Object.values(cs1.circuits ?? {})[0]?.id,
  majorEvent?.circuitId);
ck("Major Event 的 rankingCompetitionId 指向 Major 自己",
  majorEvent?.rankingCompetitionId === major1?.competition?.id);
//  ⚠ M3-3 起 Major **有**獎金政策（M3-1 時是 null，那條斷言已隨行為更新）。
//    換成更嚴的版本：政策要在、要是 CS 自己那一份、而且**不得**是 MOBA 的 legacy。
ck("Major Event 有 CS 自己的獎金政策", !!majorEvent?.prizePolicy,
  JSON.stringify(majorEvent?.prizePolicy));
ck("Major 的獎金政策指向 CS 的表，不是 MOBA 的 legacy",
  majorEvent?.prizePolicy?.table === "cs_major"
  && majorEvent?.prizePolicy?.table !== S.LEGACY_PRIZE_POLICY.table,
  `${majorEvent?.prizePolicy?.table} vs legacy=${S.LEGACY_PRIZE_POLICY.table}`);
ck("CS 聯賽的 Event 仍然沒有獎金政策（它是通往 Major 的資格賽）",
  Object.values(cs1.events).find((e) => e.eventKey !== CS_MAJOR_EVENT_KEY)?.prizePolicy === null);
ck("Major 的 competition 掛在 Major Event 底下",
  major1?.competition?.eventId === majorEvent?.id);
ck("生涯主線 Event 仍然是聯賽，沒有被 Major 換掉",
  cs1.careerEventId && cs1.careerEventId !== majorEvent?.id, cs1.careerEventId);
ck("主賽制（activeEntryOf）仍然是聯賽，規則不跟著 Major 跑",
  S.activeCompetitionOf(cs1).tier === "regular", S.activeCompetitionOf(cs1).tier);

// ── §2 bracket：決定性 ＋ 冪等 ────────────────────────────────────────────
console.log("\n§2 bracket 決定性與冪等");
const bracket1 = csMajorFixturesOf(cs1);
ck("第一輪只排得出兩場準決賽", bracket1.length === 2,
  `${bracket1.length} 場：${bracket1.map((f) => f.playoffKey).join(",")}`);
ck("兩場準決賽是 sf1 / sf2",
  eq(bracket1.map((f) => f.playoffKey).sort(), ["sf1", "sf2"]));
const sf1 = bracket1.find((f) => f.playoffKey === "sf1");
const sf2 = bracket1.find((f) => f.playoffKey === "sf2");
const seedOf = (n) => gotQual.find((q) => q.seed === n)?.teamId;
ck("sf1 是 1 號種子 vs 4 號種子",
  sf1?.sideA === seedOf(1) && sf1?.sideB === seedOf(4), `${sf1?.sideA} vs ${sf1?.sideB}`);
ck("sf2 是 2 號種子 vs 3 號種子",
  sf2?.sideA === seedOf(2) && sf2?.sideB === seedOf(3), `${sf2?.sideA} vs ${sf2?.sideB}`);
ck("Major 場次排在最後一場聯賽之後",
  Math.min(...bracket1.map((f) => f.day)) > Math.max(...S.regularFixturesOf(cs1).map((f) => f.day)),
  `major day ${Math.min(...bracket1.map((f) => f.day))}`);

//  冪等：再呼叫幾次都不得多出場次或換掉既有場次
const again = ensureCsMajor(ensureCsMajor(cs1).state).state;
ck("ensureCsMajor 冪等：重複呼叫不會多出場次",
  csMajorFixturesOf(again).length === bracket1.length,
  `${csMajorFixturesOf(again).length} 場`);
ck("ensureCsMajor 冪等：對戰表逐值不變",
  eq(csMajorFixturesOf(again).map((f) => [f.id, f.sideA, f.sideB, f.day]),
     bracket1.map((f) => [f.id, f.sideA, f.sideB, f.day])));
ck("ensureCsMajor 冪等：已建立時原樣回傳同一個 state 參考",
  ensureCsMajor(cs1).state === cs1);

//  決定性：同一顆種子重跑，Major 對戰表逐場相同
const store1b = await freshStore();
const s1b = () => store1b.getState();
s1b().ensureCompetitionSeason("cs");
runCsLeagueToEnd(s1b);
const bracket1b = csMajorFixturesOf(s1b().competitionByMode.cs);
ck("Major 對戰表是決定性的（同一新局重跑逐場相同）",
  eq(bracket1b.map((f) => [f.playoffKey, f.sideA, f.sideB, f.day]),
     bracket1.map((f) => [f.playoffKey, f.sideA, f.sideB, f.day])),
  `${bracket1b.length} 場`);

// ── §3 ownership lock ─────────────────────────────────────────────────────
console.log("\n§3 ownership lock：Major 的比分是地圖數");
const store3 = await freshStore();
const s3 = () => store3.getState();
s3().ensureCompetitionSeason("cs");
runCsLeagueToEnd(s3);
runCsSeasonToSeal(s3);
const cs3 = s3().competitionByMode.cs;
const majorFx3 = csMajorFixturesOf(cs3);
const majorOutcomes = (cs3.outcomes ?? []).filter((o) => majorFx3.some((f) => f.id === o.fixtureId));
ck("Major 每一場都有賽果", majorOutcomes.length === PLAYOFF_MATCHES.length,
  `${majorOutcomes.length}/${PLAYOFF_MATCHES.length}`);
//  ⛔ 這是 Codex ownership lock 的守門：Season 層寫出 13:7 就是在發明 CS 回合語義
const scores = majorOutcomes.map((o) => o.score ?? {});
ck("Major 比分兩側都 ≤ 2（地圖數，不是回合數）",
  scores.every((sc) => (sc.a ?? 0) <= 2 && (sc.b ?? 0) <= 2),
  scores.map((sc) => `${sc.a}:${sc.b}`).join(" "));
ck("Major 比分沒有出現任何回合量級的數字（>2）",
  scores.every((sc) => Number(sc.a) <= 2 && Number(sc.b) <= 2));
//  ⚠ M3-2 起 Major 是 BO3 ⇒ 賽果用 series 專屬的模擬器版本，不再是 BO1 的 cs1。
//    兩者都是「CS 專屬」，但投影公式不同就必須分版（見 simulateFixture.js 檔頭）。
ck("Major 賽果的模擬器版本是 CS series 專屬版（BO3）",
  majorOutcomes.every((o) => o.simulatorVersion === CS_SERIES_SIMULATOR_VERSION),
  majorOutcomes[0]?.simulatorVersion);
ck("Major 沒有沿用 CS 聯賽（BO1）的模擬器版本",
  CS_SERIES_SIMULATOR_VERSION !== CS_SIMULATOR_VERSION
  && majorOutcomes.every((o) => o.simulatorVersion !== CS_SIMULATOR_VERSION));
//  ⚠ M3-2 起 fixture 的 `matchFormat.mapPool` 會列出地圖 key。**那是賽制設定，
//    不是賽果**：它宣告「這個 series 可以用哪幾張圖」，不是「哪張圖發生了什麼」。
//    ownership lock 擋的是後者 —— 所以檢查對象縮到**賽果**，並額外釘住
//    「地圖 key 只准出現在 mapPool 裡」，避免它從別的欄位滲進賽季狀態。
const MAP_RE = /\b(dust2?|mirage|inferno|nuke|overpass|ancient|anubis|vertigo|train)\b/i;
ck("Major 的**賽果**裡找不到任何地圖識別碼",
  !MAP_RE.test(JSON.stringify(majorOutcomes)));
ck("地圖識別碼只出現在 matchFormat.mapPool（賽制設定），沒有滲進賽程的其他欄位",
  majorFx3.every((f) => !MAP_RE.test(JSON.stringify({ ...f, matchFormat: null }))),
  `mapPool=${(majorFx3[0]?.matchFormat?.mapPool ?? []).join(",")}`);
ck("Major 的 SeasonState 內容沒有 round / half / overtime 語義欄位",
  !/"(round(s|sPlayed|Score)?|half|halftime|overtime|otGroup|roundWins)"\s*:/i
    .test(JSON.stringify(majorOutcomes)),
  "outcomes 只帶 winner / score(地圖數) / 稽核欄位");

// ── §4 完整 lifecycle：4 隊 → 準決賽 → 決賽 → 冠軍 ───────────────────────
console.log("\n§4 4 隊 → 準決賽 → 決賽 → 冠軍");
ck("Major 一共 4 場（sf1 / sf2 / bronze / final）",
  majorFx3.length === PLAYOFF_MATCHES.length, `${majorFx3.length} 場`);
ck("四場的 playoffKey 齊全",
  eq(majorFx3.map((f) => f.playoffKey).sort(), [...PLAYOFF_MATCHES].sort()));
ck("Major 全部收尾", majorFx3.every(isFixtureTerminal));
ck("isCsMajorDone 認得完賽", isCsMajorDone(cs3) === true);

const finalFx = majorFx3.find((f) => f.playoffKey === "final");
const bronzeFx = majorFx3.find((f) => f.playoffKey === "bronze");
const winnerOf = (f) => (cs3.outcomes ?? []).find((o) => o.fixtureId === f.id)?.winner ?? null;
const loserOf = (f) => (winnerOf(f) === f.sideA ? f.sideB : f.sideA);
const sfWinners = ["sf1", "sf2"].map((k) => winnerOf(majorFx3.find((f) => f.playoffKey === k)));
const sfLosers = ["sf1", "sf2"].map((k) => {
  const f = majorFx3.find((x) => x.playoffKey === k);
  return winnerOf(f) === f.sideA ? f.sideB : f.sideA;
});
ck("決賽的兩邊就是兩場準決賽的勝方",
  eq([finalFx.sideA, finalFx.sideB].sort(), [...sfWinners].sort()),
  `${finalFx.sideA} vs ${finalFx.sideB}`);
ck("季軍戰的兩邊就是兩場準決賽的敗方",
  eq([bronzeFx.sideA, bronzeFx.sideB].sort(), [...sfLosers].sort()));

const majorFinal = eventFinalOf(cs3, majorEvent?.id ?? Object.keys(cs3.events).find((id) => cs3.events[id].eventKey === CS_MAJOR_EVENT_KEY));
ck("Major 產生了自己的 FinalStandings", !!majorFinal, majorFinal?.id);
ck("Major 冠軍＝決賽勝方", majorFinal?.championTeamId === winnerOf(finalFx),
  `${majorFinal?.championTeamId}`);
//  ⚠ `FinalStandings` **不存** playoffOrder 欄位——它是輸入，用來重排 `rows`
//    並把 `rankSource` 標成 "playoff"。要驗名次順序就得看 rows 本身。
const majorOrder = [...(majorFinal?.rows ?? [])].sort((a, b) => a.rank - b.rank).map((r) => r.teamId);
ck("Major 的名次順序＝冠 / 亞 / 季 / 殿（由對戰表決定，不是積分）",
  eq(majorOrder, [winnerOf(finalFx), loserOf(finalFx), winnerOf(bronzeFx), loserOf(bronzeFx)]),
  majorOrder.join(" > "));
ck("Major 名次的來源標記是 playoff（不是常規賽積分）",
  majorFinal?.rankSource === "playoff", majorFinal?.rankSource);
ck("Major FinalStandings 只有 4 列（只有四強在裡面）",
  (majorFinal?.rows ?? []).length === CS_MAJOR_SLOTS, `${(majorFinal?.rows ?? []).length} 列`);
ck("Major 的冠軍是聯賽積分榜前四之一",
  expectQual.some((q) => q.teamId === majorFinal?.championTeamId),
  majorFinal?.championTeamId);

//  聯賽的 FinalStandings 不受 Major 影響
const careerFinal3 = tryCareerFinalStandingsOf(cs3);
ck("聯賽 FinalStandings 仍是 8 列", (careerFinal3?.rows ?? []).length === 8,
  `${(careerFinal3?.rows ?? []).length} 列`);
ck("聯賽 FinalStandings 的 playerRank 仍有值",
  Number.isInteger(careerFinal3?.playerRank), `playerRank=${careerFinal3?.playerRank}`);
ck("聯賽名次沒有被 Major 的四強順序覆寫",
  careerFinal3?.id !== majorFinal?.id);

// ── §5 封存接線 ───────────────────────────────────────────────────────────
console.log("\n§5 封存接線：Major 沒打完不得封季");
const store5 = await freshStore();
const s5 = () => store5.getState();
s5().ensureCompetitionSeason("cs");
runCsLeagueToEnd(s5);
//  此刻：聯賽全部收尾、Major 剛排出兩場準決賽
const cs5 = s5().competitionByMode.cs;
ck("聯賽收尾當下 CS 賽季還不能封存（Major 還沒打）",
  !cs5.final && !S.canSealSeason(cs5).ok,
  S.canSealSeason(cs5).reason ?? "—");
ck("此刻 Major 只有兩場，且都還沒打完",
  csMajorFixturesOf(cs5).length === 2 && !isCsMajorDone(cs5));
ck("只有兩場的 Major 不得被封存（不能用半個對戰表產生名次）",
  !eventFinalOf(cs5, Object.keys(cs5.events).find((id) => cs5.events[id].eventKey === CS_MAJOR_EVENT_KEY)));
runCsSeasonToSeal(s5);
const cs5b = s5().competitionByMode.cs;
ck("Major 打完之後 CS 賽季封得起來", !!cs5b.final, cs5b.final?.schema);
ck("兩個 Event 的賽季用 SeasonSeal.v1 封存",
  cs5b.final?.schema === "SeasonSeal.v1", cs5b.final?.schema);
ck("SeasonSeal 記著兩個 Event（聯賽 ＋ Major）",
  (cs5b.final?.eventIds ?? []).length === 2, `${(cs5b.final?.eventIds ?? []).length} 個`);
ck("封存後每一個 Event 都有自己的 final",
  Object.keys(cs5b.events).every((id) => !!eventFinalOf(cs5b, id)));
ck("CS 封存冪等：再呼叫一次不會產生第二份 final",
  eq(s5()._sealSeasonIfFinished("cs").final, cs5b.final));
ck("CS 走到封存之後可以換季", S.canRollSeason(cs5b).ok, S.canRollSeason(cs5b).reason ?? "可換季");
//  Major 也不發錢
ck("Major 封存沒有發任何名次獎金",
  (s5().finance.transactions ?? []).every((t) => !String(t.id ?? "").startsWith("award-")));

// ── §6 不污染 MOBA ────────────────────────────────────────────────────────
console.log("\n§6 不污染 MOBA");
ck("整段 CS Major lifecycle 沒有建立 MOBA 賽季",
  s5().competitionByMode.moba === null);
ck("MOBA 的歷屆名次仍是空的",
  eq(s5().competitionHistoryByMode.moba, []) && eq(s5().competitionHistory, []));
ck("MOBA 的唯讀別名仍指向 competitionByMode.moba",
  s5().competition === s5().competitionByMode.moba);
//  MOBA 自己開一季，季後賽仍走 ensurePlayoffs，不得被 Major 影響
const store6 = await freshStore();
const s6 = () => store6.getState();
s6().ensureCompetitionSeason("moba");
const moba6 = s6().competitionByMode.moba;
ck("MOBA 賽季裡沒有任何 Major 賽制", !csMajorEntryOf(moba6));
ck("對 MOBA 呼叫 ensureCsMajor 什麼都不做（原樣回傳）",
  ensureCsMajor(moba6).state === moba6);
//  ⚠ MOBA 新賽季本來就有 4 個 Event（legacy 聯賽 ＋ 亞洲巡迴春/夏/秋，Q7a-3b）。
//    其中 `asia:summer` 的 tier 剛好也叫 "major" ⇒ 這一條同時證明
//    `csMajorEntryOf` 沒有靠 tier 字串亂認人（它同時要求 gameMode === "cs"）。
ck("MOBA 的 Event 數不變（4 個，CS Major 沒有滲進去）",
  Object.keys(moba6.events ?? {}).length === 4,
  Object.values(moba6.events ?? {}).map((e) => e.eventKey).join(","));
ck("MOBA 那個 tier 也叫 major 的亞洲夏季賽沒有被當成 CS Major",
  Object.values(moba6.competitions ?? {}).every((e) => e.competition.gameMode === "moba")
  && !csMajorEntryOf(moba6));
ck("MOBA 聯賽仍宣告 expectsPlayoff（Q6 行為未變）",
  S.activeEntryOf(moba6).expectsPlayoff === true);

// ── §7 mutation sentinel ─────────────────────────────────────────────────
console.log("\n§7 Mutation sentinel");
//  ① 若晉級改成「取後四名」，§1 的種子斷言必須轉紅
const mutatedQual = [...leagueStandings.rows].slice(-4).map((r, i) => ({ seed: i + 1, teamId: r.teamId }));
ck("mutation sentinel：晉級改取後四名時 §1 的種子斷言會失敗",
  !eq(mutatedQual, expectQual),
  `後四名 ${mutatedQual.map((q) => q.teamId).join(",")}`);
//  ② 若 Major 比分退回回合數，§3 的斷言必須轉紅
const mutatedScore = { a: 13, b: 7 };
ck("mutation sentinel：Major 比分退回回合數時 §3 的斷言會失敗",
  !((mutatedScore.a ?? 0) <= 2 && (mutatedScore.b ?? 0) <= 2),
  "memory-only mutation：模擬 Major 誤用 Codex 的回合比分");
//  ③ 若名次改用積分榜而非對戰表，§4 的斷言必須轉紅
//  ③ 若冠亞倒過來（＝名次不是照決賽結果排的），§4 的順序斷言必須轉紅。
const swapped = [majorOrder[1], majorOrder[0], ...majorOrder.slice(2)];
ck("mutation sentinel：冠亞對調時 §4 的順序斷言會失敗",
  !eq(swapped, [winnerOf(finalFx), loserOf(finalFx), winnerOf(bronzeFx), loserOf(bronzeFx)]),
  "memory-only mutation：模擬 Major 名次沒有照決賽結果排");
//  ④ ⚠ **誠實揭露**：這一季的積分序恰好與對戰表序相同，所以「改用積分榜排名」
//    **不會**被 §4 的順序斷言抓到。真正擋住它的是 `rankSource`——所以那一條
//    不是裝飾。這裡把兩者的關係寫出來，不要讓日後的人以為順序斷言守得住。
const pointsOrder = (standingsOf(cs3, major1.competition.id).rows ?? []).map((r) => r.teamId);
ck("mutation sentinel：積分序與對戰表序相同時，守門的是 rankSource 而不是順序",
  !eq(pointsOrder, majorOrder) || majorFinal?.rankSource === "playoff",
  eq(pointsOrder, majorOrder)
    ? `本季兩序相同（${majorOrder.join(">")}）⇒ 由 rankSource=${majorFinal?.rankSource} 守門`
    : `本季兩序不同 ⇒ 順序斷言本身就守得住`);

console.log(`\nCS Season M3-1 annual Major: ${pass}/${pass + fail} PASS`);
if (fail > 0) { console.log(`FAILED ${fail}`); process.exit(1); }
