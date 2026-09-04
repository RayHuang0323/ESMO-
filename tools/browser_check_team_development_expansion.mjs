#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_team_development_expansion.mjs — Expansion v1 真實瀏覽器驗證
//
//  執行：`node tools/browser/run-gate.mjs tools/browser_check_team_development_expansion.mjs --timeout 900000`
//
//  ⚠ 契約由 `check_team_development_expansion_v1` 守；這裡只驗**玩家真的看得到、
//    真的按得到**的部分：六個新節點的可見狀態、投入後 UI 有沒有更新、
//    細節層是不是真的預設收合且點得開、手機上按不按得到。
//
//  ⚠ 每個情境都先斷言「precondition 真的成立」再驗結果——
//    `AGENTS.md` §7 的規則（TD-56 正式站 smoke 踩過靜默假綠）。
// ============================================================================
import { RESOLVE_APP_MODULES } from "./browser/cdp.mjs";
import { runGate, finishGate } from "./browser/harness.mjs";

const J = (raw) => JSON.parse(String(raw).replace(/^"|"$/g, ""));

/** 六個 adopted 節點：id → 解鎖旗標。 */
const ADOPTED = [
  ["general_growth_support", "growthPlanning", "general"],
  ["moba_tactical_prep", "mobaTacticInsight", "moba"],
  ["moba_match_analysis", "mobaMatchOverview", "moba"],
  ["cs_tactical_prep", "csTacticInsight", "cs"],
  ["cs_match_intel", "csMatchOverview", "cs"],
  ["management_sponsorship", "sponsorInsight", "management"],
];

const seedFresh = `
  ${RESOLVE_APP_MODULES}
  localStorage.removeItem("esmo.profile.v1");
  profile.useProfileStore.getState().startNewGame("elite");
  profile.useProfileStore.getState().save();
  return "fresh";
`;

/** 有點數可投入（但什麼都還沒買）。 */
const seedRich = (points) => `
  ${RESOLVE_APP_MODULES}
  const store = profile.useProfileStore;
  const { sanitizeTeamDevelopment } = await import(B + "/src/platform/development/teamDevelopment.js");
  localStorage.removeItem("esmo.profile.v1");
  store.getState().startNewGame("elite");
  await new Promise((r) => setTimeout(r, 260));
  store.setState({ teamDevelopment: sanitizeTeamDevelopment({
    availablePoints: ${points}, ranks: {}, grants: { seed: 1, legacy: ${points - 1} },
  }) });
  store.getState().save();
  return String(store.getState().teamDevelopment.availablePoints);
`;

/** 已把六個新節點與其前置全部買下 ⇒ 六個面板都該出現。 */
const seedUnlockedAll = `
  ${RESOLVE_APP_MODULES}
  const store = profile.useProfileStore;
  const { sanitizeTeamDevelopment } = await import(B + "/src/platform/development/teamDevelopment.js");
  localStorage.removeItem("esmo.profile.v1");
  store.getState().startNewGame("elite");
  await new Promise((r) => setTimeout(r, 260));
  store.setState({ teamDevelopment: sanitizeTeamDevelopment({
    availablePoints: 4,
    ranks: {
      general_training_flow: 1, general_recovery: 1, general_growth_support: 1,
      moba_hero_lab: 1, moba_draft_intel: 1, moba_opponent_research: 1,
      moba_tactical_prep: 1, moba_match_analysis: 1,
      cs_map_lab: 1, cs_team_drill: 1, cs_demo_analysis: 1,
      cs_tactical_prep: 1, cs_match_intel: 1,
      management_scout_network: 1, management_contracts: 1, management_sponsorship: 1,
    },
    grants: { seed: 1, legacy: 23 },
  }) });
  store.getState().save();
  const u = store.getState().clubCapabilities().total.unlocks;
  return JSON.stringify({ points: store.getState().teamDevelopment.availablePoints, unlocks: Object.keys(u) });
`;

const ENTER = `
  const direct = () => document.querySelector('[data-testid="home-utility-development"]')
    || document.querySelector('[data-testid="home-sheet-development"]')
    || [...document.querySelectorAll("button,[role=button]")].find((x) => (x.innerText || "").includes("戰隊發展"));
  const opened = () => (document.body.innerText || "").includes("可用發展點");
  let b = direct();
  if (b) { b.click(); await new Promise((r) => setTimeout(r, 900)); if (opened()) return "open:direct"; }
  for (const name of ["戰隊", "更多"]) {
    const tab = [...document.querySelectorAll("button")].find((x) => (x.innerText || "").trim() === name);
    if (!tab) continue;
    tab.click(); await new Promise((r) => setTimeout(r, 650));
    b = direct();
    if (!b) continue;
    b.click(); await new Promise((r) => setTimeout(r, 900));
    if (opened()) return "open:" + name;
  }
  return "no-entry";
`;

const SWITCH_TAB = (cat) => `
  const t = document.querySelector('[data-testid="development-tab-${cat}"]');
  if (!t) return "no-tab";
  t.click();
  await new Promise((r) => setTimeout(r, 450));
  return "switched";
`;

const READ_CARDS = `
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };
  const cards = [...document.querySelectorAll("[data-development-card]")].map((el) => ({
    id: el.getAttribute("data-development-node-id"),
    lines: (el.innerText || "").trim().split(String.fromCharCode(10)).filter((x) => x.trim()).length,
    text: (el.innerText || "").trim(),
    height: Math.round(el.getBoundingClientRect().height),
  }));
  const toggles = [...document.querySelectorAll('[data-testid^="development-detail-toggle-"]')].filter(vis).map((el) => {
    const r = el.getBoundingClientRect();
    return { id: el.getAttribute("data-testid").replace("development-detail-toggle-", ""), w: Math.round(r.width), h: Math.round(r.height) };
  });
  const ctas = [...document.querySelectorAll("[data-development-cta]")].filter(vis).map((el) => {
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });
  return JSON.stringify({
    cards, toggles, ctas,
    openDetails: document.querySelectorAll('[data-testid^="development-detail-"]:not([data-testid*="toggle"])').length,
    availablePoints: (() => {
      const lab = [...document.querySelectorAll("div")].find((el) => (el.textContent || "").trim() === "可用發展點");
      const v = lab?.parentElement?.querySelector("div:last-child");
      const n = Number((v?.innerText || "").trim());
      return Number.isFinite(n) ? n : null;
    })(),
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    docScrollable: document.documentElement.scrollHeight > window.innerHeight,
  });
`;

const result = await runGate({
  name: "Team Development Expansion v1",
  run: async ({ chrome, url, ck, sleep }) => {
    for (const [label, width, height, mobile] of [["桌機 1366px", 1366, 900, false], ["手機 390px", 390, 844, true]]) {
      console.log(`\n── ${label} ──`);
      await chrome.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });

      // ── A. 新存檔：六個新節點都看得見，且都是「不能投入」的誠實狀態 ──────
      await chrome.navigate(url); await sleep(900);
      await chrome.evaluate(seedFresh);
      await chrome.navigate(url); await sleep(1500);
      const enteredA = String(await chrome.evaluate(ENTER)).replace(/"/g, "");
      ck(`${label}｜進得了戰隊發展`, enteredA.startsWith("open"), enteredA);
      if (!enteredA.startsWith("open")) continue;

      const seenIds = [];
      for (const cat of ["general", "moba", "cs", "management"]) {
        const sw = String(await chrome.evaluate(SWITCH_TAB(cat))).replace(/"/g, "");
        ck(`${label}｜切得到「${cat}」分頁`, sw === "switched", sw);
        const m = J(await chrome.evaluate(READ_CARDS));
        seenIds.push(...m.cards.map((c) => c.id));
        ck(`${label}/${cat}｜細節層預設全部收合`, m.openDetails === 0, `${m.openDetails} 個展開`);
        ck(`${label}/${cat}｜每張卡都有細節層開關`,
          m.toggles.length === m.cards.length, `${m.toggles.length}/${m.cards.length}`);
        ck(`${label}/${cat}｜不水平溢出`, m.overflow === false, `${m.scrollWidth}/${m.innerWidth}`);
        if (mobile) {
          const small = [...m.toggles, ...m.ctas].filter((t) => t.h < 44 || t.w < 44);
          ck(`${label}/${cat}｜所有互動目標 ≥44×44`, small.length === 0,
            small.map((t) => `${t.w}×${t.h}`).join(" ") || `${m.toggles.length + m.ctas.length} 個合格`);
        }
      }
      ck(`${label}｜六個 Expansion 節點全部渲染得出來`,
        ADOPTED.every(([id]) => seenIds.includes(id)),
        ADOPTED.filter(([id]) => !seenIds.includes(id)).map(([id]) => id).join(",") || "6/6");
      ck(`${label}｜被 REJECT 的兩個節點不再出現`,
        !seenIds.includes("general_scout_support") && !seenIds.includes("management_finance"));
      ck(`${label}｜節點總數 18`, seenIds.length === 18, `${seenIds.length}`);

      // ── B. 細節層：點得開、關得回、資訊沒有消失 ──────────────────────────
      await chrome.evaluate(SWITCH_TAB("general"));
      const disc = J(await chrome.evaluate(`
        const t = document.querySelector('[data-testid="development-detail-toggle-general_training_flow"]');
        if (!t) return JSON.stringify({ ok: false });
        const before = document.querySelectorAll('[data-testid="development-detail-general_training_flow"]').length;
        t.click(); await new Promise((r) => setTimeout(r, 320));
        const el = document.querySelector('[data-testid="development-detail-general_training_flow"]');
        const text = el ? (el.innerText || "").trim() : null;
        t.click(); await new Promise((r) => setTimeout(r, 320));
        const after = document.querySelectorAll('[data-testid="development-detail-general_training_flow"]').length;
        return JSON.stringify({ ok: true, before, opened: el !== null, text, after });
      `));
      ck(`${label}｜細節層預設關閉`, disc.before === 0);
      ck(`${label}｜細節層點得開`, disc.opened === true);
      ck(`${label}｜細節層收得回`, disc.after === 0);
      ck(`${label}｜細節層含被搬下來的資訊（敘述／影響範圍）`,
        typeof disc.text === "string" && disc.text.includes("影響範圍") && disc.text.length > 20,
        JSON.stringify((disc.text ?? "").slice(0, 44)));

      // ── C. 投入 → UI 立刻更新 ───────────────────────────────────────────
      await chrome.navigate(url); await sleep(900);
      const richSeed = String(await chrome.evaluate(seedRich(6))).replace(/"/g, "");
      ck(`${label}｜情境 precondition 成立（6 點）`, richSeed === "6", `seed=${richSeed}`);
      await chrome.navigate(url); await sleep(1500);
      await chrome.evaluate(ENTER);
      await chrome.evaluate(SWITCH_TAB("general"));
      const before = J(await chrome.evaluate(READ_CARDS));
      ck(`${label}｜投入前畫面顯示 6 點`, before.availablePoints === 6, `${before.availablePoints}`);
      const bought = J(await chrome.evaluate(`
        const cta = document.querySelector('[data-testid="development-cta-general_recovery"]');
        if (!cta) return JSON.stringify({ ok: false, why: "no-cta" });
        cta.click(); await new Promise((r) => setTimeout(r, 320));
        const confirm = [...document.querySelectorAll("button")].find((b) => (b.innerText || "").trim() === "確認升級");
        if (!confirm) return JSON.stringify({ ok: false, why: "no-confirm" });
        confirm.click(); await new Promise((r) => setTimeout(r, 620));
        const lab = [...document.querySelectorAll("div")].find((el) => (el.textContent || "").trim() === "可用發展點");
        const v = lab?.parentElement?.querySelector("div:last-child");
        return JSON.stringify({ ok: true, points: Number((v?.innerText || "").trim()), body: (document.body.innerText||"").includes("已完成「恢復中心」") });
      `));
      ck(`${label}｜投入流程走得完`, bought.ok === true, bought.why ?? "");
      ck(`${label}｜投入後畫面點數立刻 −1`, bought.points === 5, `${before.availablePoints} → ${bought.points}`);
      ck(`${label}｜投入後有成功回饋`, bought.body === true);

      // ── D. 六個解鎖面板真的出現 ──────────────────────────────────────────
      await chrome.navigate(url); await sleep(900);
      const unlocked = J(await chrome.evaluate(seedUnlockedAll));
      ck(`${label}｜情境 precondition 成立（六個旗標都解鎖）`,
        ADOPTED.every(([, flag]) => unlocked.unlocks.includes(flag)),
        ADOPTED.filter(([, f]) => !unlocked.unlocks.includes(f)).map(([, f]) => f).join(",") || "6/6");
      await chrome.navigate(url); await sleep(1500);
      await chrome.evaluate(ENTER);
      const panels = J(await chrome.evaluate(`
        return JSON.stringify({
          growth: document.querySelector('[data-testid="team-development-growth-planning"]') !== null,
          growthDetailOpen: document.querySelector('[data-testid="growth-planning-detail"]') !== null,
        });
      `));
      ck(`${label}｜N1 成長空間面板出現在戰隊發展頁`, panels.growth === true);
      ck(`${label}｜N1 逐位選手預設收合`, panels.growthDetailOpen === false);
      const growthOpen = J(await chrome.evaluate(`
        const t = document.querySelector('[data-testid="growth-planning-detail-toggle"]');
        if (!t) return JSON.stringify({ ok: false });
        t.click(); await new Promise((r) => setTimeout(r, 320));
        const d = document.querySelector('[data-testid="growth-planning-detail"]');
        return JSON.stringify({ ok: true, open: d !== null, rows: d ? d.children.length : 0 });
      `));
      ck(`${label}｜N1 逐位選手點得開且有內容`,
        growthOpen.ok && growthOpen.open === true && growthOpen.rows > 0, `${growthOpen.rows} 列`);

      // ── E. 版面與錯誤 ───────────────────────────────────────────────────
      const fin = J(await chrome.evaluate(READ_CARDS));
      ck(`${label}｜解鎖面板出現後仍不水平溢出`, fin.overflow === false, `${fin.scrollWidth}/${fin.innerWidth}`);
      ck(`${label}｜scrollWidth 等於 viewport`, fin.scrollWidth === fin.innerWidth, `${fin.scrollWidth}/${fin.innerWidth}`);
      ck(`${label}｜頁面可正常捲動（不是被鎖死的單屏）`, fin.docScrollable === true);
      const errs = (chrome.consoleLines ?? []).filter((l) => /^\[error\]/i.test(l));
      const pageErrs = chrome.pageErrors ?? [];
      ck(`${label}｜console / page 錯誤 = 0`, errs.length === 0 && pageErrs.length === 0,
        [...errs, ...pageErrs].slice(0, 3).join(" ¦ ") || "clean");
    }
  },
});

finishGate(result);
