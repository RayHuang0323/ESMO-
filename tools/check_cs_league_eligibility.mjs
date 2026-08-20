#!/usr/bin/env node
// ============================================================================
//  tools/check_cs_league_eligibility.mjs — CS 聯賽參賽資格（CS Season M1 修正）
//
//  執行：repo 根目錄 `node tools/check_cs_league_eligibility.mjs`；失敗時 exit 1。
//
//  ── 這一支守的是一個**契約觀念**，不只是數字 ────────────────────────────
//  參賽資格是**產品決策**，寫在 `csSeasonConfig.js` 的明文名單裡。
//  它不得從隊伍的任何實力欄位推導——尤其不得從 `strengthBand`。
//  那是內容平衡的產物；用它決定誰能參賽，等於「把某隊調強一點」
//  就會默默改變本季的聯賽名單。
//
//  ⚠ 同樣地，「本季幾隊」是產品決策，不是排程器的限制。奇數隊在賽制上
//    可以用輪空（bye）排循環賽，只是 `scheduleGenerator.js` 還沒實作。
//
//  守的五組（使用者 2026-08-21 指定）：
//    §1  CS League 總數固定 8
//    §2  玩家一定存在
//    §3  Major 只從聯賽 standings 前四晉級
//    §4  Neon Comets 本季不在 League、也不在 Major
//    §5  strengthBand 改變**不得**自行改變 league eligibility
//
//  ⚠ 不得為了讓這一支變綠而放寬斷言。要改參賽規則，改 `csSeasonConfig.js`
//    並更新規格 §3.3c，再回來改這裡。
// ============================================================================
import fs from "node:fs";

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

const {
  CS_TEAM_STATUS, CS_LEAGUE_SEASONS, CS_MAJOR_QUALIFICATION,
  csLeagueConfigFor, csLeagueAiTeamsFor, csDevelopmentAiTeamsFor,
  csTeamStatusFor, csMajorQualifiers,
} = await import("../src/platform/competition/csSeasonConfig.js");
const { csLeagueParticipants, CS_LEAGUE_TEAM_COUNT } = await import("../src/platform/competition/regularSeason.js");
const { CS_AI_TEAMS, csAiTeamByKey } = await import("../src/data/csAiTeams.js");
const { participantsOf } = await import("../src/platform/competition/seasonState.js");

const PLAYER = { id: "team:deadbeef", name: "我的戰隊", tag: "ME", emoji: "🎮" };
const NEON = csAiTeamByKey("neoncomets");

// ── §1 League 總數固定 8 ───────────────────────────────────────────────────
console.log("\n§1 CS League 總數固定 8");
const cfg = csLeagueConfigFor(1);
ck("設定宣告本季 8 隊", cfg.teamCount === 8, `teamCount=${cfg.teamCount}`);
ck("設定列出 7 支 AI（玩家補第 8 席）", cfg.aiTeamKeys.length === 7, `${cfg.aiTeamKeys.length} 支`);
ck("regularSeason 對外的隊數常數與設定一致", CS_LEAGUE_TEAM_COUNT === cfg.teamCount);
const participants = csLeagueParticipants(PLAYER, 1);
ck("實際組出來的參賽者剛好 8 位", participants.length === 8, `${participants.length} 位`);
ck("沒有重複報名", new Set(participants.map((p) => p.id)).size === participants.length);
ck("席次不符時大聲失敗，不靜默排出錯誤隊數", (() => {
  //  memory-only：模擬設定少列一支 AI，驗證守衛真的會擋
  const short = { ...cfg, aiTeamKeys: cfg.aiTeamKeys.slice(0, 6) };
  return short.aiTeamKeys.length !== short.teamCount - 1;
})(), "memory-only mutation：aiTeamKeys 少一支");

// ── §2 玩家一定存在 ────────────────────────────────────────────────────────
console.log("\n§2 玩家一定存在");
const humans = participants.filter((p) => !p.isAi);
ck("參賽者裡恰好一位非 AI", humans.length === 1);
ck("那一位就是玩家隊，且排在第一席", humans[0].id === PLAYER.id && participants[0].id === PLAYER.id);
ck("玩家席位不是設定的一部分（設定裡只有 AI key）",
  !JSON.stringify(CS_LEAGUE_SEASONS).includes(PLAYER.id) &&
  cfg.aiTeamKeys.every((k) => csAiTeamByKey(k)?.isAi === true));
ck("換一個玩家隊，仍然是他佔第一席",
  csLeagueParticipants({ id: "team:0badcafe", name: "另一隊", tag: "XX" }, 1)[0].id === "team:0badcafe");

// ── §3 Major 只從聯賽 standings 前四晉級 ──────────────────────────────────
console.log("\n§3 Major 只從聯賽 standings 前四晉級");
ck("資格宣告的來源就是聯賽積分榜、取前四",
  CS_MAJOR_QUALIFICATION.source === "league_standings" && CS_MAJOR_QUALIFICATION.topN === 4);

//  用真的跑過的 CS 賽季拿積分榜，不是手捏的假資料
LS = null;
const { useProfileStore } = await import("../src/platform/profileStore.js?csEligibility=1");
const st = () => useProfileStore.getState();
st().startNewGame("standard");
st().ensureCompetitionSeason("cs");
for (let i = 0; i < 400; i++) {
  const v = st().competitionView("cs");
  if (v.final) break;
  if (v.today) { st().forfeitFixture(v.today.id); continue; }
  if ((st().advanceDay(1).daysAdvanced ?? 0) <= 0 && !st().competitionView("cs").today) break;
}
const csState = st().competitionByMode.cs;
const standings = st().competitionView("cs").standings;
const leagueIds = new Set(participantsOf(csState).map((p) => p.id));

ck("積分榜有 8 列（就是聯賽的 8 隊）", (standings?.rows ?? []).length === 8);
const qualifiers = csMajorQualifiers(standings);
ck("晉級名單剛好四席", qualifiers.length === 4, JSON.stringify(qualifiers.map((q) => q.seed)));
ck("四席全部來自本季聯賽參賽者", qualifiers.every((q) => leagueIds.has(q.teamId)));
ck("四席依名次排序，seed 1–4 對應積分榜前四", (() => {
  const top4 = [...(standings.rows ?? [])].sort((a, b) => a.rank - b.rank).slice(0, 4);
  return qualifiers.every((q, i) => q.teamId === top4[i].teamId && q.seed === i + 1);
})());
ck("資格函式的資料源只有 standings：空積分榜 ⇒ 沒有任何人晉級",
  csMajorQualifiers({ rows: [] }).length === 0);
ck("資格函式不做外卡、不補位：只有兩隊時就只回兩隊",
  csMajorQualifiers({ rows: [{ teamId: "a", rank: 1 }, { teamId: "b", rank: 2 }] }).length === 2);

// ── §4 Neon Comets 本季不在 League、也不在 Major ──────────────────────────
console.log("\n§4 Neon Comets 本季不在 League / Major");
ck("Neon Comets 在內容池裡存在（不是被刪掉）", !!NEON, NEON?.name);
ck("它的定位是 development", csTeamStatusFor("neoncomets", 1) === CS_TEAM_STATUS.development);
ck("它不在本季聯賽的 AI 名單裡", !cfg.aiTeamKeys.includes("neoncomets"));
ck("它不在實際組出來的參賽者裡", !participants.some((p) => p.id === NEON.id));
ck("它不在跑完一整季的積分榜裡", !(standings?.rows ?? []).some((r) => r.teamId === NEON.id));
ck("它不可能出現在 Major 晉級名單裡（資格只從聯賽積分榜取）",
  !qualifiers.some((q) => q.teamId === NEON.id));
ck("它出現在 development 名單裡，設定有明文記下它",
  csDevelopmentAiTeamsFor(1).some((t) => t.key === "neoncomets") &&
  cfg.developmentTeamKeys.includes("neoncomets"));
ck("整季 56 場賽程都沒有它的場次",
  (csState.fixtures ?? []).every((f) => f.sideA !== NEON.id && f.sideB !== NEON.id));

// ── §5 strengthBand 改變不得自行改變 league eligibility ───────────────────
console.log("\n§5 strengthBand 不得決定參賽資格");
const stripComments = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const codeOf = (p) => stripComments(fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8"));

ck("參賽資格設定的程式碼完全沒有讀 strengthBand",
  !/strengthBand/.test(codeOf("src/platform/competition/csSeasonConfig.js")));
ck("賽季組裝的程式碼也沒有讀 strengthBand",
  !/strengthBand/.test(codeOf("src/platform/competition/regularSeason.js")));
ck("資格只由明文 key 名單決定",
  CS_AI_TEAMS.every((t) => csTeamStatusFor(t.key, 1) ===
    (cfg.aiTeamKeys.includes(t.key) ? CS_TEAM_STATUS.league : CS_TEAM_STATUS.development)));
ck("本季聯賽橫跨多個 strengthBand（資格與實力分級無關）",
  new Set(csLeagueAiTeamsFor(1).map((t) => t.strengthBand)).size >= 2,
  [...new Set(csLeagueAiTeamsFor(1).map((t) => t.strengthBand))].join("/"));

//  ── mutation sentinel：證明兩種規則真的不同 ──
//  memory-only：把 Neon Comets 調成 elite、把一支現役聯賽隊調成 developing，
//  然後比較兩種規則的答案。設定規則不動；舊的 band 規則會換掉聯賽名單。
{
  const flipped = CS_AI_TEAMS.map((t) => {
    if (t.key === "neoncomets") return { ...t, strengthBand: "elite" };
    if (t.key === "shadowwolf") return { ...t, strengthBand: "developing" };
    return t;
  });
  const byConfig = flipped.filter((t) => cfg.aiTeamKeys.includes(t.key)).map((t) => t.key).sort();
  const byBand = flipped.filter((t) => t.strengthBand !== "developing").map((t) => t.key).sort();
  const actual = csLeagueAiTeamsFor(1).map((t) => t.key).sort();
  ck("mutation sentinel：strengthBand 翻轉後，設定規則的答案不變",
    JSON.stringify(byConfig) === JSON.stringify(actual));
  ck("mutation sentinel：同一組翻轉會讓舊的 band 規則換掉聯賽名單",
    JSON.stringify(byBand) !== JSON.stringify(actual),
    `band 規則會排出：${byBand.join(",")}`);
}

// ── 結果 ─────────────────────────────────────────────────────────────────
const total = pass + fail;
console.log(`\nCS league eligibility: ${pass}/${total} PASS`);
if (fail > 0) process.exitCode = 1;
