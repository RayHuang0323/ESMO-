#!/usr/bin/env node
// ============================================================================
//  tools/check_competition_shared_ui.mjs — Competition 共用呈現元件（UI-4A）
//
//  執行：`node tools/check_competition_shared_ui.mjs`（純靜態，不起瀏覽器）
//
//  ── 這一支守的是一條界線 ────────────────────────────────────────────────
//  `screens/competition/` 底下的三個元件是**純呈現層**：收到已經算好的資料，
//  把它畫出來。它們一旦開始自己排序、自己判晉級、自己讀 Store，就會變成
//  第二份真相——本專案對這件事是明令禁止的。
//
//  所以這裡驗四組：
//    §1 三個元件確實存在，而且是純呈現（不 import Store、不排序、不算規則）
//    §2 共用元件不認得任何項目的賽制字串（phase / major / playoff…）
//    §3 兩邊畫面確實改用了共用元件，而且**既有的驗證標記沒有弄丟**
//    §4 各自的項目特色沒有被「共用」抹平
// ============================================================================
import { readFileSync, existsSync } from "node:fs";

let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`PASS ${name}${detail ? "　" + detail : ""}`); }
  else { fail++; console.log(`FAIL ${name}${detail ? "　" + detail : ""}`); }
};

const FILES = {
  stageBar: "src/screens/competition/StageBar.jsx",
  standings: "src/screens/competition/StandingsTable.jsx",
  fixtures: "src/screens/competition/FixtureList.jsx",
  csHub: "src/screens/fps/CsCompetitionHubScreen.jsx",
  mobaHub: "src/screens/manage/CompetitionScreen.jsx",
};
const text = new Map();
const missing = [];
for (const [key, path] of Object.entries(FILES)) {
  if (!existsSync(path)) { missing.push(path); continue; }
  text.set(key, readFileSync(path, "utf8"));
}
if (missing.length) {
  console.error("Missing files: " + missing.join("; "));
  process.exit(1);
}
const has = (key, marker) => (text.get(key) ?? "").includes(marker);
/** 去掉註解再檢查，才不會被「說明自己不做什麼」的註解騙過去。 */
const codeOnly = (key) => (text.get(key) ?? "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

const SHARED = ["stageBar", "standings", "fixtures"];

console.log("\n§1 三個共用元件是純呈現層");
for (const key of SHARED) {
  ck(`${key}：不 import Store／不碰 localStorage`,
    !/profileStore|useProfileStore|localStorage|zustand/.test(codeOnly(key)));
  ck(`${key}：不自己排序（沒有 .sort(）`, !/\.sort\(/.test(codeOnly(key)));
}
//  ⚠ 這裡要抓的是**重算**，不是「出現 rank 這個字」——`data-rank={row.rank}`
//    只是把算好的值輸出成屬性，那正是純呈現該做的事（第一版的正則誤中了它）。
//    真正的反模式是累加與呼叫排名函式。
ck("standings：不自己算名次／積分（無累加、無重算函式）",
  !/computeStandings|seasonStandings|reduce\(|\+=|-=/.test(codeOnly("standings")));
ck("fixtures：不建第二套狀態機（沒有 transition／canTransition）",
  !/FIXTURE_STATES|transitionFixture|canFixtureTransition|applyCompleted|applyForfeit/.test(codeOnly("fixtures")));
ck("三個元件都不呼叫 competitionView（資料由呼叫端傳入）",
  SHARED.every((k) => !/competitionView/.test(codeOnly(k))));

console.log("\n§2 共用元件不認得任何項目的賽制");
//  ⚠ 這是本檔最重要的一條：階段條若開始認得 phase 字串，第三款遊戲進來就得改它。
ck("StageBar 不認得 phase 字串（league／major／sealed／playoff 都不出現）",
  !/["'](league|major|major_pending|major_done|sealed|playoff|regular)["']/.test(codeOnly("stageBar")));
ck("StageBar 由呼叫端傳 activeIndex，不自己從 phase 推",
  has("stageBar", "activeIndex") && !/STEP_INDEX/.test(codeOnly("stageBar")));
ck("StandingsTable 不認得 Major／季後賽（晉級線由 qualify prop 決定）",
  !/Major|季後賽|playoff|csMajorLine/.test(codeOnly("standings")) && has("standings", "qualify"));
ck("FixtureList 不認得 CS／MOBA（沒有 mode 字串）",
  !/["'](cs|moba)["']/.test(codeOnly("fixtures")));

console.log("\n§3 兩邊畫面改用共用元件，且既有標記沒有弄丟");
ck("CS 賽事中心 import 了共用的 StageBar／StandingsTable／FixtureRow",
  has("csHub", 'from "../competition/StageBar.jsx"')
  && has("csHub", 'from "../competition/StandingsTable.jsx"')
  && has("csHub", 'from "../competition/FixtureList.jsx"'));
ck("MOBA 聯賽頁 import 了共用的 StandingsTable／FixtureRow",
  has("mobaHub", 'from "../competition/StandingsTable.jsx"')
  && has("mobaHub", 'from "../competition/FixtureList.jsx"'));
ck("CS 不再有自己的 StageBar／StandingRow 複本",
  !/function StageBar\(/.test(codeOnly("csHub")) && !/function StandingRow\(/.test(codeOnly("csHub")));
//  ⚠ 搬家時標記必須跟著搬，否則既有 gate 與 browser smoke 會假紅。
ck("CS 仍然傳得出 cs-hub-stage 與 cs-hub-standing 系列標記",
  has("csHub", 'testId="cs-hub-stage"')
  && has("csHub", 'stepTestId="cs-hub-stage-step"')
  && has("csHub", 'testIdPrefix="cs-hub-standing"'));
ck("StandingsTable 會產生 -row 與 -qualify-line 標記（既有 gate 讀的就是這兩個）",
  has("standings", "`${testIdPrefix}-row`") && has("standings", "-qualify-line"));
ck("StandingsTable 的列仍帶 data-team-id／data-rank／data-me／data-qualified",
  ["data-team-id", "data-rank", "data-me", "data-qualified"].every((a) => has("standings", a)));

console.log("\n§4 項目特色沒有被抹平");
ck("CS 保留：phase → 第幾格的對照仍在 CS 這一側（STEP_INDEX）",
  /STEP_INDEX/.test(codeOnly("csHub")));
ck("CS 保留：Major 晉級線讀 csMajorLine.topN，不是畫面寫死",
  has("csHub", "csMajorLine") && has("csHub", "topN"));
ck("CS 保留：Major 對戰表仍是既有的 CsRecapBracket", has("csHub", "CsRecapBracket"));
ck("MOBA 保留：巡迴積分／歷屆巡迴仍在", has("mobaHub", "CIRCUIT POINTS") && has("mobaHub", "circuitHistory"));
ck("MOBA 保留：亞洲總決賽面板仍在", has("mobaHub", "AsiaFinalsPanel"));
ck("MOBA 保留：季後賽對戰表仍在", has("mobaHub", "PLAYOFFS"));
ck("MOBA 保留：積分榜的淨勝分欄與來源分佈註腳",
  has("mobaHub", "showScoreDiff") && has("mobaHub", "engineGames"));
//  ⚠ 兩個項目的強調色不同是**刻意**的，不是還沒統一。
ck("兩邊各自傳自己的強調色（CS 橘／MOBA 紫）",
  has("csHub", "accent={ACC}") && has("mobaHub", "accent={GC.purp}"));

console.log("\n§5 Mutation sentinel");
//  把「呼叫端傳 activeIndex」換成「元件自己讀 phase」，§2 必須轉紅。
const mutated = (text.get("stageBar") ?? "").replace(/activeIndex/g, 'STEP_INDEX[phase]');
ck("mutation sentinel：StageBar 若自己從 phase 推格數，§2 會轉紅",
  !mutated.includes("activeIndex") && mutated.includes("STEP_INDEX"),
  "memory-only mutation：activeIndex → STEP_INDEX[phase]");

console.log(`\nCompetition shared UI: ${pass}/${pass + fail} PASS`);
process.exit(fail === 0 ? 0 : 1);
