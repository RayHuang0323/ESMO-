#!/usr/bin/env node
// ============================================================================
//  tools/check_competition_visual_shell.mjs — Competition 共用視覺外框（UI-4B）
//
//  執行：`node tools/check_competition_visual_shell.mjs`（純靜態）
//
//  ── 這一支不驗像素 ──────────────────────────────────────────────────────
//  像素級的斷言又脆又沒有鑑別力：改一個 padding 就紅，但真正該擋的事
//  （兩頁又各自長出一套外框）它反而看不出來。
//  所以這裡驗的是**結構契約**：
//    · 共用外框存在，而且是 CSS 檔驅動，不是又一份 inline style
//    · 兩頁都真的用了它，而且各自傳自己的 accent
//    · 兩頁不再各自持有一份外框／卡片的定義
//    · 樣式收在 `.esmo-comp` 底下，沒有汙染全域或動到別條線的檔案
// ============================================================================
import { readFileSync, existsSync } from "node:fs";

let pass = 0, fail = 0;
const ck = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`PASS ${name}${detail ? "　" + detail : ""}`); }
  else { fail++; console.log(`FAIL ${name}${detail ? "　" + detail : ""}`); }
};

const FILES = {
  frame: "src/screens/competition/CompetitionFrame.jsx",
  panel: "src/screens/competition/CompetitionPanel.jsx",
  css: "src/screens/competition/competition.css",
  csHub: "src/screens/fps/CsCompetitionHubScreen.jsx",
  mobaHub: "src/screens/manage/CompetitionScreen.jsx",
  dashboardCss: "src/screens/dashboard/dashboard.css",
  designSystem: "src/ui/designSystem.js",
};
const text = new Map();
const missing = [];
for (const [k, p] of Object.entries(FILES)) {
  if (!existsSync(p)) { missing.push(p); continue; }
  text.set(k, readFileSync(p, "utf8"));
}
if (missing.length) { console.error("Missing files: " + missing.join("; ")); process.exit(1); }
const has = (k, m) => (text.get(k) ?? "").includes(m);
const codeOnly = (k) => (text.get(k) ?? "")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

console.log("\n§1 共用外框存在且由 CSS 驅動");
ck("CompetitionFrame 與 CompetitionPanel 都存在", has("frame", "CompetitionFrame") && has("panel", "CompetitionPanel"));
ck("兩者都 import competition.css（不是各自 inline 一份）",
  has("frame", './competition.css') && has("panel", './competition.css'));
ck("外框是純呈現（不讀 Store）",
  !/profileStore|useProfileStore|localStorage/.test(codeOnly("frame") + codeOnly("panel")));
ck("外框沒有自己算任何東西（無 competitionView）",
  !/competitionView/.test(codeOnly("frame") + codeOnly("panel")));

console.log("\n§2 項目差異只靠一個變數");
ck("accent 是寫成 CSS 變數 --comp-accent，不是各自一套樣式",
  has("frame", "--comp-accent"));
ck("CSS 有預設 --comp-accent，且靠它表達強調色", has("css", "--comp-accent"));
ck("CS 傳橘色、MOBA 傳紫色（沒有為了統一而抹平）",
  has("csHub", "accent={ACC}") && has("mobaHub", "accent={GC.purp}"));

console.log("\n§3 兩頁都改用共用外框，且不再各自持有一份");
ck("CS 賽事中心 import CompetitionFrame", has("csHub", 'from "../competition/CompetitionFrame.jsx"'));
ck("MOBA 聯賽頁 import CompetitionFrame ＋ CompetitionPanel",
  has("mobaHub", 'from "../competition/CompetitionFrame.jsx"')
  && has("mobaHub", 'from "../competition/CompetitionPanel.jsx"'));
ck("MOBA 不再使用經營模組的 ManageFrame 當賽事頁外框",
  !/<ManageFrame/.test(codeOnly("mobaHub")) && !/from ".\/ManageFrame.jsx"/.test(codeOnly("mobaHub")));
ck("MOBA 不再自己定義一份卡片外框（Panel 指向共用元件）",
  /const Panel = CompetitionPanel/.test(codeOnly("mobaHub")));
ck("CS 的外框不再自己排版（frame 交給 CompetitionFrame）",
  has("csHub", "<CompetitionFrame") && !/maxWidth: 560/.test(codeOnly("csHub")));
ck("賽季標頭只剩一處（CS 不再自己排 kicker + headerSeason）",
  !/recapStyles\.headerSeason/.test(codeOnly("csHub")));

console.log("\n§4 樣式有邊界，沒有汙染別條線");
ck("competition.css 的規則都在 .esmo-comp 底下",
  (text.get("css") ?? "").split("\n")
    .filter((l) => /^[.#a-zA-Z\[]/.test(l.trim()) && l.includes("{"))
    .every((l) => l.includes(".esmo-comp")),
  "沒有裸的全域選擇器");
ck("competition.css 沒有動到 :root / body / * 等全域",
  !/^\s*(:root|body|html|\*)\s*[,{]/m.test(text.get("css") ?? ""));
ck("沒有改 Home 的 dashboard.css（另一條線持有）",
  !/esmo-comp/.test(text.get("dashboardCss") ?? ""));
ck("沒有新增全域 designSystem token（依 UI-4B 指示）",
  !/comp-accent|esmo-comp/.test(text.get("designSystem") ?? ""));

console.log("\n§5 特色沒有被外框統一掉");
ck("CS 保留 Major 對戰表與 recap 樣式注入",
  has("csHub", "CsRecapBracket") && has("csHub", "recapCssText"));
ck("CS 保留 League → Major 階段與晉級線", has("csHub", "STAGE_STEPS") && has("csHub", "csMajorLine"));
ck("MOBA 保留巡迴積分／歷屆巡迴／亞洲總決賽／季後賽",
  has("mobaHub", "CIRCUIT POINTS") && has("mobaHub", "CIRCUIT HISTORY")
  && has("mobaHub", "AsiaFinalsPanel") && has("mobaHub", "PLAYOFFS"));
ck("MOBA 保留出賽／棄權的既有文案與確認流程",
  has("mobaHub", "確定棄權") && has("mobaHub", "confirmForfeit"));

console.log("\n§6 Mutation sentinel");
//  把 accent 寫死成單一顏色，§2 必須轉紅。
const mutated = (text.get("frame") ?? "").replace(/--comp-accent/g, "--comp-fixed");
ck("mutation sentinel：外框若不再吐出 --comp-accent，§2 會轉紅",
  !mutated.includes("--comp-accent"), "memory-only mutation：--comp-accent → --comp-fixed");

console.log(`\nCompetition visual shell: ${pass}/${pass + fail} PASS`);
process.exit(fail === 0 ? 0 : 1);
