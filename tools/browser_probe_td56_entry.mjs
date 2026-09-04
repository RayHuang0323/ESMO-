#!/usr/bin/env node
// ============================================================================
//  tools/browser_probe_td56_entry.mjs — 「0 點時還進得去戰隊發展嗎」探測
//
//  背景：UI/UX Review 量測時，`broke`（可用發展點 = 0）情境在桌機與手機
//  都回報 `no-entry`。這支只做一件事：把兩種裝置在 0 點時的**所有入口**
//  列出來，確認那是產品缺口還是量測腳本沒找對地方。
// ============================================================================
import { RESOLVE_APP_MODULES } from "./browser/cdp.mjs";
import { runGate, finishGate } from "./browser/harness.mjs";

const J = (raw) => JSON.parse(String(raw).replace(/^"|"$/g, ""));

const seedBroke = `
  ${RESOLVE_APP_MODULES}
  const store = profile.useProfileStore;
  const { sanitizeTeamDevelopment } = await import(B + "/src/platform/development/teamDevelopment.js");
  localStorage.removeItem("esmo.profile.v1");
  store.getState().startNewGame("elite");
  await new Promise((r) => setTimeout(r, 260));
  store.setState({ teamDevelopment: sanitizeTeamDevelopment({
    availablePoints: 0, ranks: { general_training_flow: 1 }, grants: { seed: 1 },
  }) });
  store.getState().save();
  return JSON.stringify({ points: store.getState().teamDevelopment.availablePoints });
`;

/** 列出目前畫面上所有提到「戰隊發展」的可點元素。 */
const SCAN = `
  const hits = [...document.querySelectorAll("button,[role=button],a")]
    .filter((el) => (el.innerText || "").includes("戰隊發展"))
    .map((el) => ({ tag: el.tagName, testid: el.getAttribute("data-testid"), text: (el.innerText||"").trim().slice(0,30) }));
  const tabs = [...document.querySelectorAll("button")]
    .map((el) => (el.innerText || "").trim()).filter((t) => t && t.length <= 6);
  return JSON.stringify({ hits, tabs: [...new Set(tabs)].slice(0, 20) });
`;

/** 手機：先開「戰隊」分頁再找。 */
const OPEN_TEAM_TAB = `
  const tab = [...document.querySelectorAll("button")].find((x) => (x.innerText||"").trim() === "戰隊");
  if (!tab) return "no-team-tab";
  tab.click();
  await new Promise((r) => setTimeout(r, 700));
  const b = document.querySelector('[data-testid="home-sheet-development"]')
    || [...document.querySelectorAll("button")].find((x) => (x.innerText||"").includes("戰隊發展"));
  if (!b) return "team-tab-open-but-no-development";
  b.click();
  await new Promise((r) => setTimeout(r, 900));
  return (document.body.innerText||"").includes("可用發展點") ? "reached" : "clicked-but-not-open";
`;

const result = await runGate({
  name: "TD-56 0 點入口探測",
  run: async ({ chrome, url, ck, sleep }) => {
    for (const [label, width, height, mobile] of [["桌機 1366px", 1366, 900, false], ["手機 390px", 390, 844, true]]) {
      console.log(`\n── ${label} ──`);
      await chrome.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
      await chrome.navigate(url);
      await sleep(900);
      const seeded = J(await chrome.evaluate(seedBroke));
      await chrome.navigate(url);
      await sleep(1600);
      const scan = J(await chrome.evaluate(SCAN));
      console.log(`   可用發展點 = ${seeded.points}`);
      console.log(`   首頁上提到「戰隊發展」的可點元素：${scan.hits.length} 個 ${JSON.stringify(scan.hits)}`);
      console.log(`   分頁／短按鈕：${scan.tabs.join(" / ")}`);
      //  ⚠ 兩種裝置的「常駐入口」長相不同，不可以用同一條斷言：
      //    桌機是首頁的管理工具磚；手機是底部「戰隊」分頁裡的項目（首頁本來就沒有磚）。
      //    要守的是「0 點時進得去」，不是「首頁一定要有一個磚」。
      if (mobile) {
        console.log(`   手機首頁磚：${scan.hits.length} 個（分頁式 IA，常駐入口在「戰隊」分頁）`);
      } else {
        ck(`${label}｜0 點時首頁仍找得到戰隊發展入口`, scan.hits.length > 0,
          scan.hits.length ? "" : "首頁完全沒有這個入口");
      }

      if (mobile) {
        const viaTab = String(await chrome.evaluate(OPEN_TEAM_TAB)).replace(/"/g, "");
        console.log(`   走「戰隊」分頁：${viaTab}`);
        ck(`${label}｜0 點時可經「戰隊」分頁抵達`, viaTab === "reached", viaTab);
      } else {
        //  桌機：管理工具磚有哪些？
        const util = J(await chrome.evaluate(`
          const items = [...document.querySelectorAll('[data-testid^="home-utility-"]')]
            .map((el) => ({ testid: el.getAttribute("data-testid"), text: (el.innerText||"").trim() }));
          return JSON.stringify({ items });
        `));
        console.log(`   桌機管理工具磚：${util.items.map((i) => i.text.replace(/\n/g, " ")).join(" / ") || "(無)"}`);
        ck(`${label}｜管理工具區有常駐的戰隊發展磚`,
          util.items.some((i) => i.text.includes("戰隊發展")),
          util.items.map((i) => i.testid).join(", "));
      }
    }
  },
});

finishGate(result);
