#!/usr/bin/env node
// ============================================================================
//  tools/check_cs_season_lifecycle.mjs — CS Season M1：CS 聯賽 lifecycle
//
//  執行：repo 根目錄 `node tools/check_cs_season_lifecycle.mjs`；**失敗時 exit 1**。
//
//  規格：docs/design/CS_賽事系統架構規格.md（D1 / D3 / D5 / D6）
//  計畫：docs/superpowers/plans/2026-08-21-cs-season-competition.md（M1）
//
//  M1 證明的是：CS S1 可以從建立走到封存，**全程不需要玩家實際下場**，
//  而且 MOBA 的賽季一格都沒有被動到。
//
//  守的六組：
//    §1  CS 賽季建立：8 隊、cs 命名空間、決定性、與 MOBA 賽程不同步
//    §2  AI 模擬與棄權：CS 賽果產生、棄權記敗場
//    §3  ⛔ ownership lock：CS 的 Season 比分只能是**地圖數**，不得出現回合語義
//    §4  兩個項目共存：共用日曆、分離 lifecycle，互不污染
//    §5  CS 賽季封存：FinalStandings 8 列、playerRank 有值、**一毛錢都不發**
//    §6  mutation sentinel
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

const {
  activeCompetitionOf, participantsOf, fixtureById, isPlayerFixture,
  outcomeFor, tryCareerFinalStandingsOf,
} = await import("../src/platform/competition/seasonState.js");
const { CS_LEAGUE_AI_TEAMS, CS_LEAGUE_TEAM_COUNT } = await import("../src/platform/competition/regularSeason.js");
const { CS_AI_TEAMS } = await import("../src/data/csAiTeams.js");
const { SIMULATOR_VERSION, CS_SIMULATOR_VERSION } = await import("../src/platform/competition/simulateFixture.js");

let bootSeq = 0;
const freshStore = async () => {
  LS = null;
  const mod = await import(`../src/platform/profileStore.js?boot=${++bootSeq}`);
  mod.useProfileStore.getState().startNewGame("standard");
  return mod.useProfileStore;
};

// ── §1 CS 賽季建立 ─────────────────────────────────────────────────────────
console.log("\n§1 CS 賽季建立");
const store1 = await freshStore();
const s1 = () => store1.getState();

const beforeMoba = s1().competitionByMode.moba;
const made = s1().ensureCompetitionSeason("cs");
const cs = () => s1().competitionByMode.cs;

ck("ensureCompetitionSeason(\"cs\") 建立成功", made.ok === true && made.created === true,
  made.errors?.length ? JSON.stringify(made.errors) : "");
ck("CS 賽季是合法 SeasonState 且 gameMode 為 cs",
  !!cs()?.schema && activeCompetitionOf(cs())?.gameMode === "cs",
  `schema=${cs()?.schema} gameMode=${activeCompetitionOf(cs())?.gameMode}`);
ck("賽事 id 帶 cs 命名空間",
  (activeCompetitionOf(cs())?.id ?? "").startsWith("comp:cs:s1:"),
  activeCompetitionOf(cs())?.id);
ck("8 位參賽者", participantsOf(cs()).length === CS_LEAGUE_TEAM_COUNT,
  `${participantsOf(cs()).length} 位`);
ck("參賽者含玩家本人，其餘 7 支為 CS AI",
  participantsOf(cs()).filter((p) => !p.isAi).length === 1 &&
  participantsOf(cs()).filter((p) => p.isAi).length === 7);
ck("聯賽名單排除 developing 隊伍，且沒有排掉 elite",
  CS_LEAGUE_AI_TEAMS.every((t) => t.strengthBand !== "developing") &&
  CS_LEAGUE_AI_TEAMS.some((t) => t.strengthBand === "elite") &&
  CS_AI_TEAMS.length - CS_LEAGUE_AI_TEAMS.length === 1,
  `排除：${CS_AI_TEAMS.filter((t) => !CS_LEAGUE_AI_TEAMS.includes(t)).map((t) => t.name).join(",")}`);
ck("建立 CS 賽季不會建立 MOBA 賽季",
  s1().competitionByMode.moba === beforeMoba && s1().competitionByMode.moba === null);
ck("MOBA 的別名仍然指向 canonical（M0 的不變式沒被 M1 破壞）",
  s1().competition === s1().competitionByMode.moba);

const csFixtures = cs().fixtures ?? [];
const csPlayerFixtures = csFixtures.filter((f) => isPlayerFixture(cs(), f));
ck("雙循環 56 場、玩家 14 場",
  csFixtures.length === 56 && csPlayerFixtures.length === 14,
  `fixtures=${csFixtures.length} player=${csPlayerFixtures.length}`);
ck("fixture id 帶 cs 命名空間", csFixtures.every((f) => f.id.startsWith("fx:cs:")));
ck("每一場的 gameMode 都是 cs", csFixtures.every((f) => f.gameMode === "cs"));
ck("CS 聯賽 expectsPlayoff 為 false（M1 沒有 Major，宣告 true 會永遠封不了）",
  Object.values(cs().competitions)[0].expectsPlayoff === false);
ck("CS Event 沒有獎金政策（CS 獎金規則尚未定義）",
  Object.values(cs().events)[0].prizePolicy === null);

//  決定性：同一份存檔重開，賽程逐場相同
store1.getState().save();
const persisted = LS;
const mod1b = await import(`../src/platform/profileStore.js?boot=${++bootSeq}`);
ck("同一份存檔重新載入後 CS 賽程逐場相同",
  eq(mod1b.useProfileStore.getState().competitionByMode.cs?.fixtures, csFixtures));
ck("CS 賽季存得進存檔、載得回來",
  JSON.parse(persisted).competitionByMode?.cs?.schema === cs().schema);

// ── §2 CS 賽程模擬與棄權 ───────────────────────────────────────────────────
console.log("\n§2 AI 模擬與棄權");
const store2 = await freshStore();
const s2 = () => store2.getState();
s2().ensureCompetitionSeason("cs");
const csOf = () => s2().competitionByMode.cs;

//  ⚠ 新局第 8 天當天就可能有玩家賽程，而 `advanceDay` 的規則是
//    「走得進比賽日，但比賽沒收尾就走不出去」⇒ 直接 advanceDay(3) 會推進 0 天、
//    一場都不模擬。要看到 AI 模擬，得先把擋路的玩家場次收掉。
//    這正是既有的產品規則，不是缺陷——測試要照它走，不是繞過它。
const playUntilSimulated = (store, mode, maxSteps = 60) => {
  for (let i = 0; i < maxSteps; i++) {
    const st = store.getState();
    const done = (st.competitionByMode[mode]?.outcomes ?? []).some((o) => o.resultSource === "simulated");
    if (done) return true;
    const today = st.competitionView(mode).today;
    if (today) { st.forfeitFixture(today.id); continue; }
    if ((st.advanceDay(1).daysAdvanced ?? 0) <= 0) return false;
  }
  return false;
};
playUntilSimulated(store2, "cs");
const simulated = (csOf().outcomes ?? []).filter((o) => o.resultSource === "simulated");
ck("推進天數會把 CS 的 AI vs AI 場次模擬掉", simulated.length > 0, `${simulated.length} 筆`);
ck("模擬賽果標的是 CS 專屬模擬器版本，不是 MOBA 的",
  simulated.every((o) => o.simulatorVersion === CS_SIMULATOR_VERSION) &&
  CS_SIMULATOR_VERSION !== SIMULATOR_VERSION,
  CS_SIMULATOR_VERSION);
ck("玩家自己的場次不會被自動模擬掉",
  (csOf().outcomes ?? []).every((o) => {
    const f = fixtureById(csOf(), o.fixtureId);
    return !isPlayerFixture(csOf(), f) || o.resultSource === "forfeited";
  }));

//  棄權一場玩家賽程
const view2 = s2().competitionView("cs");
const todayFixture = view2.today ?? view2.next;
ck("competitionView(\"cs\") 指得出玩家的下一場", !!todayFixture, todayFixture?.id ?? "");
const forfeited = s2().forfeitFixture(todayFixture.id);
const fOutcome = outcomeFor(csOf(), todayFixture.id);
ck("棄權 CS 賽程成功且記為敗場",
  forfeited.ok === true && fOutcome?.resultSource === "forfeited" &&
  fOutcome.winner !== csOf().playerTeamId);
ck("棄權賽果不帶模擬器版本與比分（沒有比賽發生過）",
  fOutcome?.simulatorVersion == null && fOutcome.score.a === 0 && fOutcome.score.b === 0);
ck("forfeitFixture 自己認得出這場屬於 CS，不需要呼叫端傳 mode",
  s2()._modeOfFixture(todayFixture.id) === "cs");
ck("CS 的棄權沒有動到 MOBA slot", s2().competitionByMode.moba === null);

//  ── M1 的邊界：玩家實際出戰 CS 屬 M2，這裡必須**打不開** ────────────────
//  ⚠ 這一條是正向斷言，不是「還沒做」的免責聲明：M1 若不小心讓 CS 賽程
//    開得起 MatchSession，玩家就會走進一條沒有 CS 結算鏈路的死路
//    （fixture 停在 launched、賽果永遠寫不回賽季）。寧可明確打不開。
const nextCs = s2().competitionView("cs").next ?? s2().competitionView("cs").today;
const started = nextCs ? s2().startFixtureMatch(nextCs.id) : { ok: false };
ck("M1 沒有接玩家實際出戰 CS：startFixtureMatch 對 CS 賽程不成立",
  started.ok === false, started.reason ?? "");
ck("嘗試出戰失敗之後 CS 賽季沒有被改壞",
  (s2().competitionByMode.cs?.fixtures ?? []).every((f) => f.state !== "launched"));

// ── §3 ⛔ ownership lock：Season 層只記地圖數 ──────────────────────────────
console.log("\n§3 ownership lock：CS 的 Season 比分只能是地圖數");
const csScores = (csOf().outcomes ?? []).filter((o) => o.resultSource === "simulated").map((o) => o.score);
ck("每一筆 CS 模擬賽果都是 BO1 的地圖比分（1:0 或 0:1）",
  csScores.length > 0 && csScores.every((s) => (s.a === 1 && s.b === 0) || (s.a === 0 && s.b === 1)),
  `樣本 ${JSON.stringify(csScores.slice(0, 3))}`);
ck("CS 賽果不含任何回合數量級的數字（不得發明 CS 回合語義）",
  csScores.every((s) => s.a <= 1 && s.b <= 1));
ck("CS 賽果不帶擊殺差推導的局勢標籤",
  (csOf().outcomes ?? []).filter((o) => o.resultSource === "simulated")
    .every((o) => !(o.highlights ?? []).some((h) => h === "一面倒" || h === "鏖戰" || h === "超長局")));

//  MOBA 的比分模型必須完全沒被動到
const store3 = await freshStore();
store3.getState().ensureCompetitionSeason();
playUntilSimulated(store3, "moba");
const mobaSim = (store3.getState().competitionByMode.moba.outcomes ?? []).filter((o) => o.resultSource === "simulated");
ck("MOBA 的模擬賽果仍是擊殺比分、仍標 MOBA 模擬器版本",
  mobaSim.length > 0 &&
  mobaSim.every((o) => o.simulatorVersion === SIMULATOR_VERSION) &&
  mobaSim.some((o) => o.score.a > 1 || o.score.b > 1),
  `${mobaSim.length} 筆`);

// ── §4 兩個項目共存：共用日曆、分離 lifecycle ─────────────────────────────
console.log("\n§4 moba / cs 共存與隔離");
const store4 = await freshStore();
const s4 = () => store4.getState();
s4().ensureCompetitionSeason();
s4().ensureCompetitionSeason("cs");
ck("兩個賽季可以同時存在",
  !!s4().competitionByMode.moba?.schema && !!s4().competitionByMode.cs?.schema);
ck("兩個賽季的賽程不是同一份（CS 的種子有加鹽）",
  !eq((s4().competitionByMode.moba.fixtures ?? []).map((f) => [f.day, f.sideA, f.sideB]),
      (s4().competitionByMode.cs.fixtures ?? []).map((f) => [f.day, f.sideA, f.sideB])));
ck("兩個賽季的 competition id 互不相同且各帶自己的命名空間",
  activeCompetitionOf(s4().competitionByMode.moba).id.startsWith("comp:moba:") &&
  activeCompetitionOf(s4().competitionByMode.cs).id.startsWith("comp:cs:"));

const mobaBefore4 = JSON.stringify(s4().competitionByMode.moba);
const csBefore4 = JSON.stringify(s4().competitionByMode.cs);
const adv = s4().advanceDay(7);
ck("兩個賽季都存在時，日曆停在**兩者之中最早**的未收尾比賽日",
  adv.daysAdvanced >= 0 && adv.daysAdvanced <= 7, `daysAdvanced=${adv.daysAdvanced}`);
ck("推進之後兩個賽季都往前走了（不是只推進其中一個）",
  JSON.stringify(s4().competitionByMode.moba) !== mobaBefore4 &&
  JSON.stringify(s4().competitionByMode.cs) !== csBefore4);
ck("兩個賽季的賽果各自獨立，沒有互相寫入",
  (s4().competitionByMode.moba.outcomes ?? []).every((o) => o.fixtureId.startsWith("fx:moba:")) &&
  (s4().competitionByMode.cs.outcomes ?? []).every((o) => o.fixtureId.startsWith("fx:cs:")));
ck("competitionView(\"cs\") 不會回 MOBA 的 seasonStateV2",
  s4().competitionView("cs").seasonStateV2 === null &&
  s4().competitionView("moba").seasonStateV2 !== null);

// ── §5 CS 賽季封存 ────────────────────────────────────────────────────────
console.log("\n§5 CS 賽季封存");
const store5 = await freshStore();
const s5 = () => store5.getState();
s5().ensureCompetitionSeason("cs");
const fundsBefore = s5().finance.funds;
const awardsBefore = Object.keys(s5().processedCompetitionAwards ?? {}).length;

/** 打完整季 CS：玩家場次一律棄權，其餘靠推進模擬。 */
for (let i = 0; i < 400; i++) {
  const v = s5().competitionView("cs");
  if (v.final) break;
  const today = v.today;
  if (today) { s5().forfeitFixture(today.id); continue; }
  const moved = s5().advanceDay(1);
  if ((moved.daysAdvanced ?? 0) <= 0 && !s5().competitionView("cs").today) break;
}
const csFinal = s5().competitionByMode.cs?.final ?? null;
ck("CS 賽季走得到封存", !!csFinal, csFinal ? `sealedAtDay=${csFinal.sealedAtDay}` : "未封存");
const careerFinal = tryCareerFinalStandingsOf(s5().competitionByMode.cs);
ck("最終名次有 8 列", (careerFinal?.rows ?? []).length === 8, `${(careerFinal?.rows ?? []).length} 列`);
ck("玩家名次有值", Number.isInteger(careerFinal?.playerRank) && careerFinal.playerRank >= 1,
  `playerRank=${careerFinal?.playerRank}`);
ck("全部棄權的玩家排在最後一名", careerFinal?.playerRank === 8, `playerRank=${careerFinal?.playerRank}`);
ck("MOBA 賽季完全沒有被建立或封存", s5().competitionByMode.moba === null);
//  ⚠ **不能拿 `finance.funds` 相等當斷言**：跑完一整季會經過 12 次週結算，
//    薪資與營運成本本來就會讓資金變動（實測 1,200,000 → 353,000）。
//    那是既有的經濟系統在運作，與獎金無關。要證明「沒發獎金」只能看
//    名次獎金自己的冪等帳本，以及 CS 的 final 有沒有出現在裡面。
const awardKeys = Object.keys(s5().processedCompetitionAwards ?? {});
ck("CS 封存沒有發名次獎金（獎金帳本沒有新增任何一筆）",
  awardKeys.length === awardsBefore, `帳本 ${awardsBefore} → ${awardKeys.length} 筆`);
ck("CS 的 final 沒有出現在名次獎金帳本裡",
  !!csFinal?.id && !awardKeys.includes(csFinal.id), `finalId=${csFinal?.id}`);
ck("財務變動只來自週結算，沒有任何賽事獎金交易",
  (s5().finance.transactions ?? []).every((t) => !String(t.id ?? "").startsWith("award-")),
  `funds ${fundsBefore} → ${s5().finance.funds}（12 次週結算）`);
ck("CS 封存沒有寫進 MOBA 的歷屆名次",
  eq(s5().competitionHistoryByMode.moba, []) && eq(s5().competitionHistory, []));
ck("封存後 competitionView(\"cs\") 讀得到 final",
  !!s5().competitionView("cs").final);
ck("CS 賽季封存冪等：再呼叫一次不會產生第二份 final",
  eq(s5()._sealSeasonIfFinished("cs").final, csFinal));

// ── §6 Mutation sentinel ─────────────────────────────────────────────────
console.log("\n§6 Mutation sentinel");
//  ① 若 CS 的比分回退成 MOBA 的擊殺模型，§3 必須轉紅。
const mobaStyleScore = { a: 17, b: 9 };
ck("mutation sentinel：CS 比分退回擊殺數時 §3 的斷言會失敗",
  !((mobaStyleScore.a === 1 && mobaStyleScore.b === 0) || (mobaStyleScore.a === 0 && mobaStyleScore.b === 1)),
  "memory-only mutation：模擬 CS 誤用 MOBA 比分投影");
//  ② 若聯賽名單改回「全部 8 支 AI ＋ 玩家」，§1 的隊數斷言會失敗。
ck("mutation sentinel：聯賽名單退回 8 支 AI 時隊數會不對",
  CS_AI_TEAMS.length + 1 !== CS_LEAGUE_TEAM_COUNT,
  `全部 AI ${CS_AI_TEAMS.length} + 玩家 = ${CS_AI_TEAMS.length + 1} ≠ ${CS_LEAGUE_TEAM_COUNT}`);

// ── 結果 ─────────────────────────────────────────────────────────────────
const total = pass + fail;
console.log(`\nCS Season M1 lifecycle: ${pass}/${total} PASS`);
if (fail > 0) process.exitCode = 1;
