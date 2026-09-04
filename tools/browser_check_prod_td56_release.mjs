#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_prod_td56_release.mjs — TD-56 正式站 smoke
//
//  執行：`node tools/browser/run-gate.mjs tools/browser_check_prod_td56_release.mjs --timeout 900000`
//
//  ⚠ **正式站是打包後的 bundle，沒有 `/src/...`** ⇒ 這支**只能**走
//    UI 操作 ＋ localStorage，不能 import 任何應用程式模組
//    （dev gate 才做得到那件事：`browser_check_team_development_progression`）。
//  ⚠ 種子狀態一律**直接改存檔再 reload**：那是玩家真的會遇到的路徑，
//    而且不需要 Store 存取權。
// ============================================================================
import { runGate, finishGate } from "./browser/harness.mjs";

const PROD = process.env.ESMO_PROD_URL ?? "https://rayhuang0323.github.io/ESMO-/";
const KEY = "esmo.profile.v1";
const J = (raw) => JSON.parse(String(raw).replace(/^"|"$/g, ""));

/** 全新玩家：清掉存檔，讓 App 以預設狀態開局（Onboarding 1 點）。 */
const seedFresh = `
  localStorage.removeItem("${KEY}");
  return "fresh";
`;

/**
 * 0 點狀態：**直接寫一份只帶 `teamDevelopment` 的存檔**。
 *
 * ⚠ 不能沿用「先讀既有存檔再改」——正式站剛開時 App 還沒觸發過 `save()`，
 *   localStorage 是空的（第一版就是這樣靜默跳過，讓 0 點情境根本沒被測到）。
 * ⚠ 缺的欄位由 `load()` 以 DEFAULT 補齊，所以一個最小物件就夠，
 *   而且不需要任何模組存取權。
 */
const seedBroke = `
  localStorage.setItem("${KEY}", JSON.stringify({
    teamDevelopment: {
      version: "TeamDevelopmentState.v1",
      availablePoints: 0, spentPoints: 1,
      ranks: { general_training_flow: 1 },
      grants: { seed: 1 }, updatedAt: null,
    },
  }));
  return "broke";
`;

/** 走真實導覽路徑：桌機管理工具磚；手機底部「戰隊」分頁。 */
const ENTER = `
  const direct = () => document.querySelector('[data-testid="home-utility-development"]')
    || document.querySelector('[data-testid="home-sheet-development"]')
    || [...document.querySelectorAll("button,[role=button]")].find((x) => (x.innerText || "").includes("戰隊發展"));
  const opened = () => (document.body.innerText || "").includes("可用發展點");
  let b = direct();
  if (b) { b.click(); await new Promise((r) => setTimeout(r, 1000)); if (opened()) return "open:direct"; }
  for (const name of ["戰隊", "更多"]) {
    const tab = [...document.querySelectorAll("button")].find((x) => (x.innerText || "").trim() === name);
    if (!tab) continue;
    tab.click();
    await new Promise((r) => setTimeout(r, 700));
    b = direct();
    if (!b) continue;
    b.click();
    await new Promise((r) => setTimeout(r, 1000));
    if (opened()) return "open:" + name;
  }
  return "no-entry";
`;

const MEASURE = `
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };
  const cards = [...document.querySelectorAll("[data-development-card]")].map((el) => ({
    id: el.getAttribute("data-development-node-id"),
    text: (el.innerText || "").trim(),
  }));
  const ctas = [...document.querySelectorAll("[data-development-cta]")].filter(vis).map((el) => {
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });
  const CONTRADICTIONS = [["待解鎖", "目前可生效"], ["點數不足", "目前可生效"], ["規劃中", "目前可生效"]];
  const blocked = cards.filter((c) => c.text.includes("待解鎖") || c.text.includes("點數不足")).map((c) => ({
    id: c.id,
    badge: c.text.includes("點數不足") ? "點數不足" : "待解鎖",
    reason: (document.querySelector('[data-development-blocked-reason="' + c.id + '"]')?.innerText || "").trim() || null,
  }));
  const body = document.body.innerText || "";
  const JARGON = ["ledger","reconcile","canonical","authority","derived","writer","settlement",
    "persistence","schema","consumer","reducer","grant","CBR","migration","idempotent"];
  const save = (() => { try { return JSON.parse(localStorage.getItem("${KEY}") || "null"); } catch { return null; } })();
  //  ⚠ 斷言一律用**畫面上的數字**：正式站第一次進來時 App 還沒 save()，
  //    localStorage 會是空的，拿它當真相會靜默跳過整個情境。
  const displayedPoints = (() => {
    const lab = [...document.querySelectorAll("div")].find((el) => (el.textContent || "").trim() === "可用發展點");
    const val = lab?.parentElement?.querySelector("div:last-child");
    const n = Number((val?.innerText || "").trim());
    return Number.isFinite(n) ? n : null;
  })();
  return JSON.stringify({
    displayedPoints,
    points: save?.teamDevelopment?.availablePoints ?? null,
    grantKeys: Object.keys(save?.teamDevelopment?.grants ?? {}),
    cardCount: cards.length,
    showsAvailable: body.includes("可用發展點"),
    showsNextHint: body.includes("下一個發展點"),
    nextLevel: (document.querySelector('[data-testid="development-next-level"]')?.innerText || "").trim() || null,
    nextSeason: (document.querySelector('[data-testid="development-next-season"]')?.innerText || "").trim() || null,
    detailOpen: document.querySelector('[data-testid="development-point-detail"]') !== null,
    hasDetailToggle: document.querySelector('[data-testid="development-point-detail-toggle"]') !== null,
    contradictory: cards.filter((c) => CONTRADICTIONS.some(([a, b]) => c.text.includes(a) && c.text.includes(b))).map((c) => c.id),
    blocked,
    ctas,
    jargonHits: JARGON.filter((w) => new RegExp(w, "i").test(body)),
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  });
`;

const result = await runGate({
  name: "TD-56 正式站 smoke",
  externalUrl: PROD,
  run: async ({ chrome, url, ck, sleep }) => {
    console.log(`   正式站：${url}`);
    for (const [label, width, height, mobile] of [["桌機 1366px", 1366, 900, false], ["手機 390px", 390, 844, true]]) {
      console.log(`\n── ${label} ──`);
      await chrome.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });

      // ── A. 全新玩家（Onboarding 1 點）──────────────────────────────────
      await chrome.navigate(url);
      await sleep(1600);
      await chrome.evaluate(seedFresh);
      await chrome.navigate(url);
      await sleep(2400);
      const enteredA = String(await chrome.evaluate(ENTER)).replace(/"/g, "");
      ck(`${label}｜新玩家走得進戰隊發展`, enteredA.startsWith("open"), `路徑=${enteredA}`);
      if (!enteredA.startsWith("open")) continue;

      const a = J(await chrome.evaluate(MEASURE));
      ck(`${label}｜Onboarding 點數 = 1（畫面）`, a.displayedPoints === 1, `顯示=${a.displayedPoints}`);
      ck(`${label}｜四條路線的節點都渲染`, a.cardCount === 5, `${a.cardCount} 張`);
      ck(`${label}｜顯示「可用發展點」`, a.showsAvailable === true);
      ck(`${label}｜顯示「下一個發展點」`, a.showsNextHint === true);
      ck(`${label}｜下一個等級里程碑`, /俱樂部升到/.test(a.nextLevel ?? ""), JSON.stringify(a.nextLevel));
      ck(`${label}｜下一個賽季獎勵`, /賽季/.test(a.nextSeason ?? ""), JSON.stringify(a.nextSeason));
      ck(`${label}｜完整規則預設收合且點得開`, a.detailOpen === false && a.hasDetailToggle === true);
      ck(`${label}｜沒有自相矛盾的狀態文字`, a.contradictory.length === 0, a.contradictory.join(", ") || "無");
      ck(`${label}｜玩家端沒有工程術語`, a.jargonHits.length === 0, a.jargonHits.join(", "));
      ck(`${label}｜不水平溢出`, a.overflow === false, `${a.scrollWidth}/${a.innerWidth}`);

      // ── B. 0 點（Owner Review ① ② 的關鍵狀態）──────────────────────────
      await chrome.evaluate(seedBroke);
      await chrome.navigate(url);
      await sleep(2400);
      const enteredB = String(await chrome.evaluate(ENTER)).replace(/"/g, "");
      ck(`${label}｜**0 點時仍進得去戰隊發展**`, enteredB.startsWith("open"), `路徑=${enteredB}`);
      if (!enteredB.startsWith("open")) continue;

      const b = J(await chrome.evaluate(MEASURE));
      ck(`${label}｜0 點狀態真的生效（畫面）`, b.displayedPoints === 0,
        `顯示=${b.displayedPoints} 存檔=${b.points}`);
      ck(`${label}｜0 點存檔的帳本只有種子（沒有被重複發點）`,
        b.grantKeys.length === 1 && b.grantKeys[0] === "seed", b.grantKeys.join(","));
      ck(`${label}｜0 點時沒有自相矛盾的狀態文字`, b.contradictory.length === 0, b.contradictory.join(", ") || "無");
      console.log(`   不能投入的卡：${b.blocked.map((x) => `${x.id}[${x.badge}]→${JSON.stringify(x.reason)}`).join("  ") || "（無）"}`);
      ck(`${label}｜每張不能投入的卡都說得出原因`,
        b.blocked.length > 0 && b.blocked.every((x) => x.reason && x.reason.length > 0),
        b.blocked.filter((x) => !x.reason).map((x) => x.id).join(", "));
      ck(`${label}｜原因與徽章一致（前置 vs 點數不足）`,
        b.blocked.every((x) => x.badge === "點數不足" ? /發展點/.test(x.reason ?? "") : /需先完成/.test(x.reason ?? "")),
        b.blocked.map((x) => `${x.badge}:${x.reason}`).join(" | "));
      ck(`${label}｜0 點時不水平溢出`, b.overflow === false, `${b.scrollWidth}/${b.innerWidth}`);
      if (mobile && b.ctas.length) {
        console.log(`   主要 CTA：${b.ctas.map((c) => `${c.w}×${c.h}`).join(" ")}`);
      }

      // ── C. 有點數時的主要 CTA 觸控目標（390px）─────────────────────────
      if (mobile) {
        await chrome.evaluate(seedFresh);
        await chrome.navigate(url);
        await sleep(2400);
        await chrome.evaluate(ENTER);
        const c = J(await chrome.evaluate(MEASURE));
        console.log(`   主要 CTA（1 點）：${c.ctas.map((x) => `${x.w}×${x.h}`).join(" ") || "（無）"}`);
        ck(`${label}｜有點數時看得到主要 CTA`, c.ctas.length > 0, `${c.ctas.length} 顆`);
        ck(`${label}｜主要 CTA 觸控目標 ≥44×44`,
          c.ctas.length > 0 && c.ctas.every((x) => x.h >= 44 && x.w >= 44),
          c.ctas.map((x) => `${x.w}×${x.h}`).join(" "));
      }

      // ── D. console / page errors ───────────────────────────────────────
      const errs = (chrome.consoleLines ?? []).filter((l) => /^\[error\]/i.test(l));
      const pageErrs = chrome.pageErrors ?? [];
      ck(`${label}｜console / page 錯誤 = 0`, errs.length === 0 && pageErrs.length === 0,
        [...errs, ...pageErrs].slice(0, 3).join(" ¦ ") || "clean");
    }
  },
});

finishGate(result);
