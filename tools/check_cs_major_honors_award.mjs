#!/usr/bin/env node
// ============================================================================
//  tools/check_cs_major_honors_award.mjs — CS Season M3-3：年度冠軍榮耀 ＋ CS 獎金
//
//  執行：repo 根目錄 `node tools/check_cs_major_honors_award.mjs`；**失敗時 exit 1**。
//
//  規格：docs/design/CS_賽事系統架構規格.md（§5 賽事模型）
//  計畫：docs/superpowers/plans/2026-08-21-cs-season-competition.md（M3-3）
//
//  M3-3 補上 M1 就寫在 `_sealCsSeasonIfFinished` 註解裡的那兩件事：
//    ① CS 年度 Major 的冠軍寫進 **生涯榮耀**
//    ② CS 開始發名次獎金 —— 用**自己的**獎金表，不是沿用 MOBA 的
//
//  守的六組：
//    §1  榮耀：來源、id、冪等、AI 奪冠照樣記
//    §2  獎金：只有 Major 發、CS 聯賽不發、冪等、cat 是 award
//    §3  ⛔ CS 用自己的獎金表（與 MOBA 的可獨立調整）
//    §4  不污染 MOBA：honors 與獎金帳本互不干擾
//    §5  封存契約沒有被弄壞（FinalStandings 仍不可變）
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

const S = await import("../src/platform/competition/seasonState.js");
const { regularFixturesOf, csMajorFixturesOf, eventFinalOf } = S;
const {
  HONOR_TYPES, HONOR_LABELS, honorIdFor, honorsByType, teamHonorCount, validateHonors,
} = await import("../src/platform/competition/honors.js");
const { CS_MAJOR_EVENT_KEY, CS_MAJOR_PRIZE_POLICY } =
  await import("../src/platform/competition/csMajor.js");
const { COMPETITION_PRIZE, CS_MAJOR_PRIZE, prizeForRank, prizeTableFor } =
  await import("../src/platform/economy/economyConfig.js");
const { AWARD_CAT } = await import("../src/platform/economy/competitionAward.js");
const { isFixtureTerminal } = await import("../src/platform/contracts/competition.js");

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

const store = await freshStore();
const st = () => store.getState();
const fundsBefore = st().finance.funds;
const awardsBefore = Object.keys(st().processedCompetitionAwards ?? {}).length;
st().ensureCompetitionSeason("cs");
runCsSeasonToSeal(st);
const cs = st().competitionByMode.cs;
const majorEventId = Object.keys(cs.events).find((id) => cs.events[id].eventKey === CS_MAJOR_EVENT_KEY);
const majorFinal = eventFinalOf(cs, majorEventId);
const leagueEventId = Object.keys(cs.events).find((id) => id !== majorEventId);

// ── §1 榮耀 ───────────────────────────────────────────────────────────────
console.log("\n§1 CS 年度冠軍寫進生涯榮耀");
ck("前置：CS 賽季走得到封存", !!cs.final, cs.final?.schema);
ck("前置：Major 有自己的 FinalStandings", !!majorFinal?.championTeamId, majorFinal?.id);

const csHonors = honorsByType(st().honors, HONOR_TYPES.csAnnualChampion, { gameMode: "cs" });
ck("CS 年度冠軍榮耀有一筆", csHonors.length === 1, `${csHonors.length} 筆`);
const h = csHonors[0] ?? {};
ck("榮耀 id 由類型／項目／賽季決定性推導",
  h.id === honorIdFor(HONOR_TYPES.csAnnualChampion, "cs", cs.season), h.id);
ck("榮耀的冠軍＝Major FinalStandings 的冠軍",
  h.championTeamId === majorFinal?.championTeamId, h.championTeamId);
ck("榮耀帶來源存證（sourceFinalId 指向 Major 的 final）",
  h.sourceFinalId === majorFinal?.id, h.sourceFinalId);
ck("榮耀的 gameMode 是 cs", h.gameMode === "cs");
ck("榮耀掛在 Major 的 Event 上", h.eventId === majorEventId, h.eventId);
ck("榮耀有中文標籤", typeof HONOR_LABELS[HONOR_TYPES.csAnnualChampion] === "string"
  && h.label === HONOR_LABELS[HONOR_TYPES.csAnnualChampion], h.label);
ck("榮耀通過一致性驗證", validateHonors(st().honors).ok,
  (validateHonors(st().honors).errors[0]?.message) ?? "");
//  ⚠ 世界歷史：冠軍是 AI 照樣記（玩家整季棄權 ⇒ 進不了四強）
ck("冠軍是 AI 隊伍也照樣寫進榮耀（這是世界歷史，不是玩家獎盃櫃）",
  h.championTeamId !== cs.playerTeamId, `champion=${h.championTeamId} player=${cs.playerTeamId}`);
ck("玩家沒奪冠 ⇒ teamHonorCount 為 0",
  teamHonorCount(st().honors, cs.playerTeamId, { gameMode: "cs" }) === 0);
//  冪等
const beforeCount = st().honors.length;
st()._sealSeasonIfFinished("cs");
ck("重跑封存不會多一筆榮耀", st().honors.length === beforeCount,
  `${beforeCount} → ${st().honors.length}`);

// ── §2 獎金 ───────────────────────────────────────────────────────────────
console.log("\n§2 CS 名次獎金");
const majorEvent = cs.events[majorEventId];
const leagueEvent = cs.events[leagueEventId];
ck("Major 的 Event 有獎金政策", !!majorEvent.prizePolicy, JSON.stringify(majorEvent.prizePolicy));
ck("Major 的獎金政策就是 CS_MAJOR_PRIZE_POLICY",
  eq(majorEvent.prizePolicy, CS_MAJOR_PRIZE_POLICY));
//  ⚠ 聯賽是通往 Major 的資格賽，本身不發名次獎金（產品決策，見 csMajor.js）
ck("CS 聯賽的 Event 仍然沒有獎金政策（它是資格賽）",
  leagueEvent.prizePolicy === null, String(leagueEvent.prizePolicy));
const awardKeys = Object.keys(st().processedCompetitionAwards ?? {});
ck("獎金帳本只多了 Major 那一筆的鍵",
  awardKeys.length === awardsBefore + (majorFinal ? 1 : 0),
  `${awardsBefore} → ${awardKeys.length}`);
ck("入帳的冪等鍵是 Major FinalStandings 的 id",
  awardKeys.includes(majorFinal.id), awardKeys.join(","));
//  玩家沒進四強 ⇒ 名次表裡沒有他 ⇒ 一毛都不該拿
ck("玩家沒進 Major ⇒ 沒有拿到名次獎金",
  (st().finance.transactions ?? []).filter((t) => t.cat === AWARD_CAT
    && String(t.id ?? "").includes(majorFinal.id)).every((t) => Number(t.amount) === 0)
  || !(st().finance.transactions ?? []).some((t) => t.cat === AWARD_CAT),
  `award 交易 ${(st().finance.transactions ?? []).filter((t) => t.cat === AWARD_CAT).length} 筆`);
//  冪等
const fundsAfter = st().finance.funds;
st()._sealSeasonIfFinished("cs");
ck("重跑封存不會重複發獎金", st().finance.funds === fundsAfter,
  `${fundsAfter} → ${st().finance.funds}`);
ck("重跑封存不會多一個獎金帳本鍵",
  Object.keys(st().processedCompetitionAwards ?? {}).length === awardKeys.length);

// ── §3 CS 用自己的獎金表 ─────────────────────────────────────────────────
console.log("\n§3 ⛔ CS 的獎金表與 MOBA 分開");
ck("CS_MAJOR_PRIZE 存在且是 rank → 金額的表", !!CS_MAJOR_PRIZE?.byRank);
ck("CS 的獎金表**不是** MOBA 那一份（可獨立調整）",
  !eq(CS_MAJOR_PRIZE.byRank, COMPETITION_PRIZE.byRank),
  `cs=${JSON.stringify(CS_MAJOR_PRIZE.byRank)} moba=${JSON.stringify(COMPETITION_PRIZE.byRank)}`);
ck("Major 只有四個名次有獎金（它就四隊）",
  Object.keys(CS_MAJOR_PRIZE.byRank).sort().join(",") === "1,2,3,4",
  Object.keys(CS_MAJOR_PRIZE.byRank).join(","));
ck("獎金隨名次遞減", [1, 2, 3].every((r) =>
  prizeForRank(r, CS_MAJOR_PRIZE) > prizeForRank(r + 1, CS_MAJOR_PRIZE)));
ck("第 5 名（不存在於 Major）沒有獎金", prizeForRank(5, CS_MAJOR_PRIZE) === 0);
//  ⚠ 政策的 `table` 欄位以前是裝飾用的（結算永遠拿預設表）。M3-3 讓它真的選表。
ck("prizeTableFor 認得 CS 政策", prizeTableFor(CS_MAJOR_PRIZE_POLICY) === CS_MAJOR_PRIZE);
ck("prizeTableFor 對 legacy 政策仍回 MOBA 的表",
  prizeTableFor(S.LEGACY_PRIZE_POLICY) === COMPETITION_PRIZE);
ck("prizeTableFor 對未知政策 fail-closed（回預設表，不憑空發明）",
  prizeTableFor({ kind: "rank_table", table: "不存在的表" }) === COMPETITION_PRIZE);

// ── §4 不污染 MOBA ────────────────────────────────────────────────────────
console.log("\n§4 不污染 MOBA");
ck("整段 CS 封存沒有建立 MOBA 賽季", st().competitionByMode.moba === null);
ck("沒有產生任何 MOBA 的榮耀",
  honorsByType(st().honors, HONOR_TYPES.asiaAnnualChampion).length === 0);
ck("MOBA 的歷屆名次仍是空的",
  eq(st().competitionHistoryByMode.moba, []) && eq(st().competitionHistory, []));
//  MOBA 自己跑一季，年度冠軍榮耀仍然走 asia 那條，不被 CS 影響
const store4 = await freshStore();
const s4 = () => store4.getState();
s4().ensureCompetitionSeason("moba");
ck("MOBA 賽季建立後沒有任何 CS 榮耀",
  honorsByType(s4().honors, HONOR_TYPES.csAnnualChampion).length === 0);
ck("兩種榮耀是不同的 honorType",
  HONOR_TYPES.csAnnualChampion !== HONOR_TYPES.asiaAnnualChampion,
  `${HONOR_TYPES.csAnnualChampion} vs ${HONOR_TYPES.asiaAnnualChampion}`);
ck("兩種榮耀的 id 不會撞（gameMode 已編進 id）",
  honorIdFor(HONOR_TYPES.csAnnualChampion, "cs", 1)
  !== honorIdFor(HONOR_TYPES.asiaAnnualChampion, "moba", 1));

// ── §5 封存契約沒被弄壞 ──────────────────────────────────────────────────
console.log("\n§5 封存契約仍然成立");
ck("Major 的 final 仍是 4 列", (majorFinal.rows ?? []).length === 4);
ck("Major 的 final 名次來源仍是 playoff", majorFinal.rankSource === "playoff");
ck("獎金收據掛在 Event 上，沒有塞進不可變的 final",
  majorFinal.award === undefined && !("award" in majorFinal),
  Object.keys(majorFinal).filter((k) => /award|receipt/i.test(k)).join(",") || "final 乾淨");
ck("Event 上有獎金收據", !!st().competitionByMode.cs.events[majorEventId].award);
ck("CS 賽季仍然封存得起來（兩個 Event 都有 final）",
  Object.keys(cs.events).every((id) => !!eventFinalOf(cs, id)));
//  ⛔ ownership lock 沒有因為發錢而鬆掉
ck("賽季層的比分仍然只有地圖數（最大 2）",
  (cs.outcomes ?? []).every((o) => o.score.a <= 2 && o.score.b <= 2));

// ── §6 mutation sentinel ─────────────────────────────────────────────────
console.log("\n§6 Mutation sentinel");
ck("mutation sentinel：榮耀改用 bracket 勝方而非 final，來源存證會消失",
  !!h.sourceFinalId && h.sourceFinalId === majorFinal.id,
  "沒有 sourceFinalId 的榮耀在 validateHonors 就會被擋下");
ck("mutation sentinel：把 sourceFinalId 拿掉會讓 validateHonors 轉紅",
  !validateHonors([{ ...h, sourceFinalId: null }]).ok,
  "memory-only mutation：模擬榮耀沒有來源存證");
ck("mutation sentinel：id 與 gameMode 不一致會被 validateHonors 抓到",
  !validateHonors([{ ...h, gameMode: "moba" }]).ok,
  "memory-only mutation：模擬 CS 榮耀被標成 MOBA");
ck("mutation sentinel：CS 若沿用 MOBA 獎金表，§3 的斷言會失敗",
  !eq(CS_MAJOR_PRIZE.byRank, COMPETITION_PRIZE.byRank),
  "memory-only mutation：模擬 CS 直接用 MOBA 的錢");

console.log(`\nCS Season M3-3 honors + prize: ${pass}/${pass + fail} PASS`);
if (fail > 0) { console.log(`FAILED ${fail}`); process.exit(1); }
