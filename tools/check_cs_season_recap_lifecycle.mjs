#!/usr/bin/env node
// ============================================================================
//  tools/check_cs_season_recap_lifecycle.mjs — CS Season M4-B：Recap ＋ 換季 ＋ 完整 lifecycle
//
//  執行：repo 根目錄 `node tools/check_cs_season_recap_lifecycle.mjs`；**失敗時 exit 1**。
//
//  走一次真實存檔的完整 CS lifecycle：
//    S1 → CS 聯賽 → 前四晉級 → Major(BO3) → Major FinalStandings
//       → honor / award → SeasonSeal → Recap read model → 換季 → S2 → reload
//
//  守的八組：
//    §1  Recap read model：全部來自 canonical，沒有第二套真相
//    §2  Major 投影：對戰表、種子、地圖數、冠軍、獎金收據
//    §3  換季：歷史正確、榮耀不重複、獎金不重複
//    §4  S2 是乾淨的新賽季（不繼承上一季任何痕跡）
//    §5  ⛔ seriesByFixture 不把舊季進度帶到新季
//    §6  不污染 MOBA：SeasonState、歷史、榮耀、獎金四項都不受影響
//    §7  ActiveMatch / MatchSession 無殘留錯誤
//    §8  reload 後結果一致
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
const { eventFinalOf, csMajorFixturesOf, regularFixturesOf } = S;
const { HONOR_TYPES, honorsByType, validateHonors } = await import("../src/platform/competition/honors.js");
const { CS_MAJOR_EVENT_KEY } = await import("../src/platform/competition/csMajor.js");
const { isFixtureTerminal } = await import("../src/platform/contracts/competition.js");
const { isSessionTerminal } = await import("../src/platform/contracts/matchSession.js");

let bootSeq = 0;
const freshStore = async () => {
  LS = null;
  const mod = await import(`../src/platform/profileStore.js?boot=${++bootSeq}`);
  mod.useProfileStore.getState().startNewGame("standard");
  return mod.useProfileStore;
};

/** 把 CS 一整季（聯賽 ＋ Major）跑到封存為止。玩家場次一律棄權。 */
const runCsSeasonToSeal = (s, limit = 500) => {
  for (let i = 0; i < limit; i++) {
    if (s().competitionByMode.cs?.final) break;
    const v = s().competitionView("cs");
    if (v.today) { s().forfeitFixture(v.today.id); continue; }
    const moved = s().advanceDay(1);
    if ((moved.daysAdvanced ?? 0) <= 0 && !s().competitionView("cs").today) break;
  }
};

// ── S1：建立 → 打完 → 封存 ────────────────────────────────────────────────
const store = await freshStore();
const st = () => store.getState();
st().autoFillLineup("cs");
st().ensureCompetitionSeason("cs");
runCsSeasonToSeal(st);

const cs1 = st().competitionByMode.cs;
const view1 = st().competitionView("cs");
const majorEid = Object.keys(cs1.events).find((id) => cs1.events[id].eventKey === CS_MAJOR_EVENT_KEY);
const leagueEid = Object.keys(cs1.events).find((id) => id !== majorEid);
const majorFinal = eventFinalOf(cs1, majorEid);
const leagueFinal = eventFinalOf(cs1, leagueEid);

console.log("\n§1 Recap read model 來自 canonical");
ck("前置：S1 走得到封存", !!cs1.final, cs1.final?.schema);
ck("view.season 是 1", view1.season === 1, String(view1.season));
ck("view.final 就是賽季封存物（SeasonSeal.v1）",
  view1.final === cs1.final && cs1.final.schema === "SeasonSeal.v1");
ck("view.careerFinal 就是**聯賽**的 FinalStandings（同一個物件，不是複製）",
  view1.careerFinal === leagueFinal, view1.careerFinal?.id);
ck("careerFinal 有 8 列", (view1.careerFinal?.rows ?? []).length === 8);
ck("view.history 是 CS 的歷史（此刻還空）", eq(view1.history, []));
ck("honorsView 讀得到 CS 年度冠軍",
  (view1.honorsView?.csAnnualChampions ?? []).length === 1);
ck("honorsView 的 CS 榮耀就是 store 裡那一份（不是第二套）",
  eq(view1.honorsView.csAnnualChampions, honorsByType(st().honors, HONOR_TYPES.csAnnualChampion)));
ck("honorsView 沒有把 MOBA 的年度冠軍算進 CS",
  (view1.honorsView?.annualChampions ?? []).length === 0);

console.log("\n§2 Major 投影");
const M = view1.csMajor;
ck("csMajor 存在", M?.exists === true, M?.reason ?? "");
ck("csMajor.final 就是 Major 的 FinalStandings（同一個物件）", M.final === majorFinal, M.final?.id);
ck("晉級名單四隊、種子 1..4",
  (M.qualified ?? []).length === 4 && eq(M.qualified.map((q) => q.seed), [1, 2, 3, 4]));
ck("對戰表四場齊全", (M.bracket ?? []).length === 4
  && eq([...M.bracket.map((t) => t.key)].sort(), ["bronze", "final", "sf1", "sf2"]));
ck("對戰表每一場都完賽", M.bracket.every((t) => t.exists && t.done));
ck("isCsMajorDone 為 true", M.done === true);
//  ⛔ ownership lock：投影出來的比分只能是地圖數
ck("⛔ 對戰表的比分兩側都 ≤ 2（地圖數，不是回合數）",
  M.bracket.every((t) => (t.score?.a ?? 0) <= 2 && (t.score?.b ?? 0) <= 2),
  M.bracket.map((t) => `${t.key} ${t.score?.a}:${t.score?.b}`).join(" "));
ck("每一場都分得出勝方", M.bracket.every((t) => !!t.winner));
ck("冠軍＝決賽勝方",
  M.championTeamId === M.bracket.find((t) => t.key === "final")?.winner, M.championTeamId);
ck("matchFormat 原樣傳遞（畫面不必寫死 BO3）",
  M.matchFormat?.series === "bo3", M.matchFormat?.series);
ck("Major 的獎金收據掛在投影上",
  !!M.award && M.award.settled === true, `amount=${M.award?.amount}`);
ck("生涯主賽事（聯賽）沒有獎金 ⇒ view.award 為 null（錢在 Major 那一邊）",
  view1.award === null);
const honor1 = view1.honorsView.csAnnualChampions[0];
ck("榮耀的冠軍＝Major 投影的冠軍", honor1.championTeamId === M.championTeamId);

// ── §3 換季 ───────────────────────────────────────────────────────────────
console.log("\n§3 換季");
const honorsBefore = st().honors.length;
const awardsBefore = Object.keys(st().processedCompetitionAwards ?? {}).length;
const fundsBefore = st().finance.funds;
ck("封存之後可以換季", st().competitionView("cs").canRoll.ok === true);
const rolled = st().rollToNextCsSeason();
ck("換季成功", rolled.ok === true, rolled.reason ?? "");
ck("換到第 2 季", rolled.season === 2, String(rolled.season));

const hist = st().competitionHistoryByMode.cs;
ck("歷史多一筆", hist.length === 1, `${hist.length} 筆`);
ck("歷史存的是**聯賽的 FinalStandings**（不是 SeasonSeal）",
  hist[0]?.id === leagueFinal.id && (hist[0]?.rows ?? []).length === 8, hist[0]?.id);
ck("⛔ 榮耀沒有重複", st().honors.length === honorsBefore, `${honorsBefore} → ${st().honors.length}`);
ck("榮耀仍然只有一筆 CS 年度冠軍",
  honorsByType(st().honors, HONOR_TYPES.csAnnualChampion).length === 1);
ck("榮耀通過一致性驗證", validateHonors(st().honors).ok);
ck("⛔ 獎金沒有重複發",
  Object.keys(st().processedCompetitionAwards ?? {}).length === awardsBefore
  && st().finance.funds === fundsBefore,
  `帳本 ${awardsBefore} → ${Object.keys(st().processedCompetitionAwards ?? {}).length} · funds ${fundsBefore} → ${st().finance.funds}`);

// ── §4 S2 乾淨 ────────────────────────────────────────────────────────────
console.log("\n§4 S2 是乾淨的新賽季");
const cs2 = st().competitionByMode.cs;
ck("S2 的 season 是 2", cs2.season === 2);
ck("S2 沒有任何賽果", (cs2.outcomes ?? []).length === 0);
ck("S2 沒有封存", cs2.final === null || cs2.final === undefined);
ck("S2 只有聯賽一個 Event（Major 要等聯賽打完才長出來）",
  Object.keys(cs2.events).length === 1, Object.keys(cs2.events).join(","));
ck("S2 沒有 Major 賽制", !S.csMajorEntryOf(cs2));
ck("S2 的聯賽賽程是 56 場", regularFixturesOf(cs2).length === 56, `${regularFixturesOf(cs2).length} 場`);
ck("S2 的賽程與 S1 不同（逐賽季派生種子）",
  !eq(regularFixturesOf(cs2).map((f) => f.id), regularFixturesOf(cs1).map((f) => f.id)));
ck("S2 的 view 讀不到上一季的 Major", st().competitionView("cs").csMajor.exists === false);
ck("S2 的 view.history 讀得到 S1", st().competitionView("cs").history.length === 1);
ck("S2 還不能再換季", st().competitionView("cs").canRoll.ok === false);

// ── §5 seriesByFixture 不跨季 ────────────────────────────────────────────
console.log("\n§5 ⛔ series 進度不跨季");
ck("換季後 series 帳本是空的",
  Object.keys(st().matchmaking.seriesByFixture ?? {}).length === 0,
  JSON.stringify(Object.keys(st().matchmaking.seriesByFixture ?? {})));
//  ⚠ 真正的風險：fixture id 是**決定性推導**的，新賽季可能出現同一個 id。
//    若帳本沒清，新賽季的同名場次會撿到上一季的地圖進度。
const s1Ids = new Set(csMajorFixturesOf(cs1).map((f) => f.id));
const s2Ids = new Set(regularFixturesOf(cs2).map((f) => f.id));
ck("（背景）S1 的 Major 場次 id 與 S2 的聯賽場次 id 有沒有重疊都不影響——帳本已清空",
  [...s1Ids].every((id) => !st().matchmaking.seriesByFixture?.[id]),
  `S1 major ${s1Ids.size} 場 · S2 league ${s2Ids.size} 場`);

// ── §6 不污染 MOBA ────────────────────────────────────────────────────────
console.log("\n§6 不污染 MOBA");
ck("MOBA 的 SeasonState 仍是 null（整段 CS lifecycle 沒建立它）",
  st().competitionByMode.moba === null);
ck("MOBA 的歷屆名次仍是空的",
  eq(st().competitionHistoryByMode.moba, []) && eq(st().competitionHistory, []));
ck("沒有產生任何 MOBA 榮耀",
  honorsByType(st().honors, HONOR_TYPES.asiaAnnualChampion).length === 0);
ck("MOBA 的唯讀別名仍指向 competitionByMode.moba",
  st().competition === st().competitionByMode.moba);
ck("competitionView(\"moba\") 明確回「沒有賽季」",
  st().competitionView("moba").hasSeason === false);

// ── §7 ActiveMatch / MatchSession 無殘留 ─────────────────────────────────
console.log("\n§7 ActiveMatch / MatchSession 無殘留");
const mm = st().matchmaking ?? {};
ck("沒有殘留的進行中場次",
  !mm.session || isSessionTerminal(mm.session), mm.session?.state ?? "無場次");
ck("activeMatchView 不回報可恢復的比賽", st().activeMatchView() === null
  || st().activeMatchView()?.restoreable === false,
  String(st().activeMatchView()?.kind ?? "null"));
ck("沒有殘留的賽程指派單", mm.fixtureAssignment === null || mm.fixtureAssignment === undefined);
ck("沒有結算錯誤殘留", !mm.lastSettlementError, mm.lastSettlementError?.reason ?? "無");
ck("S2 沒有任何未收尾的場次擋住日曆",
  (st().advanceDay(1).daysAdvanced ?? 0) > 0);

// ── §8 reload 一致 ───────────────────────────────────────────────────────
console.log("\n§8 reload 後結果一致");
st().save();
const persisted = LS;
const mod2 = await import(`../src/platform/profileStore.js?boot=reload${++bootSeq}`);
const st2 = () => mod2.useProfileStore.getState();
ck("重載後 CS 賽季是 S2", st2().competitionByMode.cs?.season === 2);
ck("重載後歷史仍是一筆，且逐值相同",
  eq(st2().competitionHistoryByMode.cs, hist));
ck("重載後榮耀逐值相同", eq(st2().honors, st().honors));
ck("重載後獎金帳本逐值相同",
  eq(st2().processedCompetitionAwards, st().processedCompetitionAwards));
ck("重載後 series 帳本仍是空的",
  Object.keys(st2().matchmaking.seriesByFixture ?? {}).length === 0);
ck("重載後 MOBA 仍是 null", st2().competitionByMode.moba === null);
ck("重載後的 view 與重載前逐值相同（season / history / canRoll）",
  st2().competitionView("cs").season === st().competitionView("cs").season
  && eq(st2().competitionView("cs").history, st().competitionView("cs").history)
  && eq(st2().competitionView("cs").canRoll, st().competitionView("cs").canRoll));
ck("持久化 payload 帶得動 CS 歷史",
  Array.isArray(JSON.parse(persisted).competitionHistoryByMode?.cs));

// ── §9 mutation sentinel ─────────────────────────────────────────────────
console.log("\n§9 Mutation sentinel");
ck("mutation sentinel：歷史若存 SeasonSeal 而非 careerFinal，§3 的斷言會失敗",
  cs1.final.id === undefined && hist[0].id === leagueFinal.id,
  "SeasonSeal 沒有 id ⇒ 存錯東西時「歷史存的是聯賽 final」會轉紅");
ck("mutation sentinel：series 帳本若沒清，§5 會失敗",
  !Object.keys(st().matchmaking.seriesByFixture ?? {}).length,
  "memory-only：模擬換季忘了清帳本");
ck("mutation sentinel：Recap 若自己算冠軍而非讀 final，§2 會與榮耀對不上",
  honor1.championTeamId === M.final.championTeamId,
  "兩者同源 ⇒ 任一邊自己算就會分岔");

console.log(`\nCS Season M4-B recap + rollover lifecycle: ${pass}/${pass + fail} PASS`);
if (fail > 0) { console.log(`FAILED ${fail}`); process.exit(1); }
