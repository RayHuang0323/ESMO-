#!/usr/bin/env node
// ============================================================================
//  tools/check_cs_competition_hub.mjs — CS Season M4-C：賽事中心（唯讀）
//
//  執行：repo 根目錄 `node tools/check_cs_competition_hub.mjs`；**失敗時 exit 1**。
//
//  M4-C 只做**唯讀 UI**。所以這一支守的不是「畫面長怎樣」，而是兩件事：
//    ① 賽事中心要的每一個數字，canonical 讀模型都給得出來（畫面不必自己算）
//    ② 那些數字在**三個階段**（聯賽中／Major 中／封存後）都正確且自洽
//
//  守的六組：
//    §1  聯賽進行中：排名 / 戰績 / 下一場 / 晉級線 / 階段
//    §2  ⛔ 晉級線只有一份規則（與 Major 真正產生時同一支）
//    §3  Major 產生後：階段轉換、對戰表、玩家處境
//    §4  封存後：階段是「賽季結算」，Recap 入口條件成立
//    §5  ⛔ 唯讀：讀模型不改變任何狀態
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
const { regularFixturesOf } = S;
const { csMajorQualifiers, CS_MAJOR_QUALIFICATION } =
  await import("../src/platform/competition/csSeasonConfig.js");
const { isFixtureTerminal } = await import("../src/platform/contracts/competition.js");

let bootSeq = 0;
const freshStore = async () => {
  LS = null;
  const mod = await import(`../src/platform/profileStore.js?boot=${++bootSeq}`);
  mod.useProfileStore.getState().startNewGame("standard");
  return mod.useProfileStore;
};

const store = await freshStore();
const st = () => store.getState();
st().autoFillLineup("cs");
st().ensureCompetitionSeason("cs");

// ── §1 聯賽進行中 ─────────────────────────────────────────────────────────
console.log("\n§1 聯賽進行中：賽事中心要的數字都讀得到");
//  推進幾天讓賽果累積出來（玩家場次棄權）
for (let i = 0; i < 60; i++) {
  const v = st().competitionView("cs");
  if (v.today) { st().forfeitFixture(v.today.id); continue; }
  if ((st().advanceDay(1).daysAdvanced ?? 0) <= 0) break;
}
const v1 = st().competitionView("cs");
const myTeamId = st().team.id;
const rows1 = v1.standings?.rows ?? [];
const me1 = rows1.find((r) => r.teamId === myTeamId) ?? null;

ck("階段是「聯賽進行中」", v1.csStage?.phase === "league", v1.csStage?.label);
ck("賽季日讀得到", Number.isInteger(v1.seasonDay) && Number.isInteger(v1.seasonDays),
  `第 ${v1.seasonDay} / ${v1.seasonDays} 天`);
ck("積分榜有 8 列", rows1.length === 8, `${rows1.length} 列`);
ck("名次是 1..8 的全序",
  eq([...rows1].map((r) => r.rank).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8]));
ck("玩家有自己的一列，且帶勝敗與積分", !!me1
  && Number.isInteger(me1.wins) && Number.isInteger(me1.losses) && Number.isInteger(me1.points),
  me1 ? `第 ${me1.rank} 名 ${me1.wins}-${me1.losses} ${me1.points} 分` : "找不到");
ck("已經打過的場數等於勝＋敗", rows1.every((r) => r.played === r.wins + r.losses));
ck("下一場讀得到（fixture ＋ 遊戲日）",
  !v1.next || (v1.next.id && Number.isInteger(v1.nextDay)),
  v1.next ? `${v1.next.id} 第 ${v1.nextDay} 天` : "本季已無賽程");
ck("下一場的對手可由 participants 查得到名字",
  !v1.next || !!v1.participants.find((p) =>
    p.id === (v1.next.sideA === myTeamId ? v1.next.sideB : v1.next.sideA)));
ck("Major 此刻尚未產生", v1.csMajor?.exists === false, v1.csMajor?.reason ?? "");

// ── §2 晉級線只有一份規則 ────────────────────────────────────────────────
console.log("\n§2 ⛔ 晉級線只有一份規則");
ck("csMajorLine.topN 來自設定，不是畫面寫死的 4",
  v1.csMajorLine?.topN === CS_MAJOR_QUALIFICATION.topN, String(v1.csMajorLine?.topN));
ck("晉級名單逐值等於 csMajorQualifiers(聯賽積分榜)",
  eq(v1.csMajorLine.qualifiers, csMajorQualifiers(v1.standings)),
  v1.csMajorLine.qualifiers.map((q) => `${q.seed}.${q.teamId.slice(0, 12)}`).join(" "));
ck("晉級名單就是積分榜前 topN（順序＝名次）",
  eq(v1.csMajorLine.qualifiers.map((q) => q.teamId),
     rows1.slice(0, v1.csMajorLine.topN).map((r) => r.teamId)));
ck("晉級名單長度等於 topN", v1.csMajorLine.qualifiers.length === v1.csMajorLine.topN);
//  「我在不在線內」是畫面用 rank ≤ topN 判的——這裡確認那個判斷與名單一致
const inLineByRank = me1 != null && me1.rank <= v1.csMajorLine.topN;
const inLineByList = v1.csMajorLine.qualifiers.some((q) => q.teamId === myTeamId);
ck("「rank ≤ topN」與「在晉級名單裡」是同一件事（畫面不會說兩種話）",
  inLineByRank === inLineByList, `rank=${me1?.rank} inLine=${inLineByRank}`);

// ── §3 Major 產生之後 ────────────────────────────────────────────────────
console.log("\n§3 Major 產生後");
for (let i = 0; i < 500; i++) {
  const cs = st().competitionByMode.cs;
  const lg = regularFixturesOf(cs);
  if (lg.length > 0 && lg.every(isFixtureTerminal)) break;
  const v = st().competitionView("cs");
  if (v.today) { st().forfeitFixture(v.today.id); continue; }
  if ((st().advanceDay(1).daysAdvanced ?? 0) <= 0 && !st().competitionView("cs").today) break;
}
const v2 = st().competitionView("cs");
ck("聯賽打完之後 Major 已產生", v2.csMajor?.exists === true);
ck("階段轉成「年度 Major 進行中」", v2.csStage?.phase === "major", v2.csStage?.label);
ck("對戰表此刻至少有兩場準決賽",
  (v2.csMajor.bracket ?? []).filter((t) => t.exists).length >= 2,
  `${(v2.csMajor.bracket ?? []).filter((t) => t.exists).length} 場`);
ck("Major 的四強就是聯賽最終前四",
  eq((v2.csMajor.qualified ?? []).map((q) => q.teamId),
     csMajorQualifiers(S.seasonStandings(st().competitionByMode.cs)).map((q) => q.teamId)));
//  玩家整季棄權 ⇒ 第 8 名 ⇒ 進不了 Major
ck("玩家沒進 Major ⇒ playerPath.inMajor 為 false",
  v2.csMajor.playerPath?.inMajor === false,
  JSON.stringify(v2.csMajor.playerPath));
ck("沒進 Major 的玩家不會被標成「已遭淘汰」",
  v2.csMajor.playerPath?.eliminated === false);

// ── §4 封存後 ─────────────────────────────────────────────────────────────
console.log("\n§4 封存後");
for (let i = 0; i < 500; i++) {
  if (st().competitionByMode.cs?.final) break;
  const v = st().competitionView("cs");
  if (v.today) { st().forfeitFixture(v.today.id); continue; }
  if ((st().advanceDay(1).daysAdvanced ?? 0) <= 0 && !st().competitionView("cs").today) break;
}
const v3 = st().competitionView("cs");
ck("階段轉成「賽季結算」", v3.csStage?.phase === "sealed", v3.csStage?.label);
ck("封存後 view.final 存在 ⇒ 賽事中心的成績單入口成立", !!v3.final);
ck("對戰表四場齊全且完賽",
  (v3.csMajor.bracket ?? []).filter((t) => t.exists && t.done).length === 4);
ck("⛔ 對戰表比分仍只有地圖數（≤ 2）",
  v3.csMajor.bracket.every((t) => (t.score?.a ?? 0) <= 2 && (t.score?.b ?? 0) <= 2));
ck("封存後仍讀得到最終積分榜（賽事中心不會突然空白）",
  (v3.standings?.rows ?? []).length === 8);

// ── §5 唯讀 ───────────────────────────────────────────────────────────────
console.log("\n§5 ⛔ 讀模型不改變任何狀態");
const before = JSON.stringify({
  cs: st().competitionByMode.cs,
  honors: st().honors,
  awards: st().processedCompetitionAwards,
  funds: st().finance.funds,
  mm: st().matchmaking,
});
for (let i = 0; i < 5; i++) st().competitionView("cs");
const after = JSON.stringify({
  cs: st().competitionByMode.cs,
  honors: st().honors,
  awards: st().processedCompetitionAwards,
  funds: st().finance.funds,
  mm: st().matchmaking,
});
ck("連續呼叫 competitionView 五次，狀態逐位元不變", before === after);
ck("兩次呼叫回傳的關鍵欄位逐值相同（無隨機、無時鐘）",
  eq(st().competitionView("cs").csStage, st().competitionView("cs").csStage)
  && eq(st().competitionView("cs").csMajorLine, st().competitionView("cs").csMajorLine)
  && eq(st().competitionView("cs").standings.rows, st().competitionView("cs").standings.rows));
ck("MOBA 沒有被賽事中心的讀取碰到", st().competitionByMode.moba === null);

// ── §6 mutation sentinel ─────────────────────────────────────────────────
console.log("\n§6 Mutation sentinel");
ck("mutation sentinel：晉級線若寫死 4 而非讀設定，改設定就會不一致",
  v1.csMajorLine.topN === CS_MAJOR_QUALIFICATION.topN,
  `目前兩者都是 ${CS_MAJOR_QUALIFICATION.topN}；設定改了而畫面沒跟著改就會轉紅`);
ck("mutation sentinel：階段若自己數場次，Major 產生前後會分不開",
  v1.csStage.phase !== v2.csStage.phase && v2.csStage.phase !== v3.csStage.phase,
  `${v1.csStage.phase} → ${v2.csStage.phase} → ${v3.csStage.phase}`);
ck("mutation sentinel：對戰表若自己算勝方，會與 final 的冠軍分岔",
  v3.csMajor.championTeamId === v3.csMajor.final.championTeamId,
  "兩者同源 ⇒ 任一邊自己算就會不一致");

console.log(`\nCS Season M4-C competition hub: ${pass}/${pass + fail} PASS`);
if (fail > 0) { console.log(`FAILED ${fail}`); process.exit(1); }
