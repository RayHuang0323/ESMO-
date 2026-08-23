#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_fan_f0.mjs — Fan F0 整合後的最小瀏覽器 smoke
//
//  執行：`node tools/browser_check_fan_f0.mjs`（加 --headed 可看畫面）
//
//  ── 這一支在守什麼 ──────────────────────────────────────────────────────
//  F0 動到兩個賽後畫面。靜態 verifier 只能證明「原始碼長這樣」，
//  這裡要證明「瀏覽器真的把它渲染出來、而且渲染成該有的樣子」：
//    · 賽後收據沒有「聲望」格，而且**粉絲那一格還在、值正確**
//    · MOBA 賽後那一格顯示「粉絲」而不是「聲望」，值仍是 fanGain
//
//  ── 為什麼不打一場真的比賽 ────────────────────────────────────────────
//  MOBA 一場 20–30 分鐘，而 Quick Finish 在自動化 harness 下有既有的卡死問題
//  （已登記為驗收工具債，非玩家路徑）。這裡改成**用 app 自己的 React 把元件
//  掛到一個獨立 root**——收據不是捏的，是真的呼叫 `applyProgressToState()`
//  產生的 receipt ⇒ 「Store 寫什麼」與「畫面顯示什麼」仍然同源。
//
//  ⚠ React / ReactDOM 的 URL **從 dev server 服出來的原始碼推導**，不自己組
//    `/node_modules/.vite/deps/...`（那個路徑帶 hash，猜一定會壞）。
// ============================================================================
import { launchChrome, startDevServer, RESOLVE_APP_MODULES } from "./browser/cdp.mjs";

const VITE_PORT = 5341;
const CDP_PORT = 9371;
const HEADLESS = !process.argv.includes("--headed");

let pass = 0, fail = 0;
const ck = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${n}${d ? "　" + d : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 從 dev server 服出來的模組原始碼裡，把 Vite 改寫過的 import URL 挖出來。 */
const DERIVE_REACT = `
  //  刻意不宣告 B：呼叫端（RESOLVE_APP_MODULES 或自己）已經宣告過，
  //    這裡再宣告一次會撞 "Identifier B has already been declared"。
  //  用字串切分找 import 來源，刻意不用正則——這支腳本要經過
  //  「.mjs template literal → CDP → 瀏覽器」三層，反斜線每一層都會被吃一次，
  //  正則跳脫在這條路上非常容易靜默壞掉（第一版就壞在這裡）。
  //  Vite 服出來的 import 一律是雙引號，split 之後挑含 marker 的那一段就夠了。
  const grab = async (modPath, marker, what) => {
    const url = B + modPath;
    const text = await (await fetch(url)).text();
    const hit = text.split(String.fromCharCode(34)).find((s) => s.includes(marker));
    if (!hit) throw new Error("在 " + modPath + " 裡找不到 " + what + " 的 import（Vite 輸出格式變了？）");
    return new URL(hit, new URL(url, location.href)).href;
  };
  const reactUrl = await grab("/src/ui/RewardReceiptPanel.jsx", "deps/react.js", "react");
  const domUrl   = await grab("/src/main.jsx", "react-dom_client", "react-dom/client");

  //  Vite 對 CJS 套件做 interop：服出來的是
  //    import ns from ".../react.js"; const React = ns.__esModule ? ns.default : ns;
  //  所以 createElement / createRoot 掛在 **default** 上，不是 named export。
  //  直接解構 named export 會拿到 undefined（第一版就是這樣壞的），這裡兩種都試，
  //  並在拿不到時**明確拋錯**——寧可紅燈，不要靜默跳過渲染。
  const pick = (ns, key) => (typeof ns?.[key] === "function" ? ns[key]
                          : typeof ns?.default?.[key] === "function" ? ns.default[key] : null);
  const reactNs = await import(reactUrl);
  const domNs   = await import(domUrl);
  const React = (typeof reactNs.createElement === "function") ? reactNs
              : (typeof reactNs.default?.createElement === "function") ? reactNs.default : null;
  const createRoot = pick(domNs, "createRoot");
  if (!React) throw new Error("拿不到 React.createElement（Vite interop 形狀變了？）");
  if (!createRoot) throw new Error("拿不到 createRoot（Vite interop 形狀變了？）");
`;

async function main() {
  console.log("══ Fan F0 整合 smoke ══\n");
  const server = await startDevServer({ port: VITE_PORT });
  const chrome = await launchChrome({ url: server.url, port: CDP_PORT, headless: HEADLESS });

  try {
    // ── Desktop 1280 ───────────────────────────────────────────────────────
    await chrome.send("Emulation.setDeviceMetricsOverride", {
      width: 1280, height: 800, deviceScaleFactor: 1, mobile: false,
    });
    await chrome.navigate(server.url);
    await chrome.evaluate(`localStorage.removeItem("esmo.profile.v1"); return true;`);
    await chrome.navigate(server.url);
    await sleep(3500);

    // ── 1) Home 正常 ───────────────────────────────────────────────────────
    const home = await chrome.evaluate(`
      return {
        modes: document.querySelectorAll('[data-testid^="home-mode-"]').length,
        bracket: !!document.querySelector('[data-testid="home-mode-bracket"]'),
        //  F0 沒有動首頁，但 fans 的清洗在載入路徑上 ⇒ 支持者數字仍要正常顯示
        fansText: /支持者/.test(document.body.innerText || ""),
        text: (document.body.innerText || "").replace(/\\s+/g, " ").slice(0, 70),
      };`);
    ck("1) Home 正常載入（三個模式入口都在）",
      home.modes === 3 && home.bracket, `${home.modes} 個入口｜${home.text}`);
    ck("1b) 首頁仍顯示「支持者」（sanitize 沒有把粉絲數弄不見）", home.fansText);

    // ── 2–4) 賽後收據：用**真的** receipt 渲染 ─────────────────────────────
    const receipt = await chrome.evaluate(`
      ${RESOLVE_APP_MODULES}
      ${DERIVE_REACT}
      const panelMod = await import(B + "/src/ui/RewardReceiptPanel.jsx");
      const contracts = await import(B + "/src/platform/contracts/matchProgressTransaction.js");
      const progress  = await import(B + "/src/platform/progress/applyMatchProgress.js");

      //  真的跑一次結算，拿到真實的 receipt（不是捏的物件）。
      //  ⚠ 刻意送 reputation: 9 —— 如果 F0 的 deprecation 沒生效，
      //    收據就會冒出一個 reputation 欄位，下面的斷言會抓到。
      const tx = {
        version: contracts.MATCH_PROGRESS_TX_VERSION,
        transactionId: contracts.makeTransactionId("moba", "smoke-1"),
        matchId: "smoke-1", mode: "moba",
        sourceResultVersion: "BattleResult.v2", recordedAt: Date.now(),
        teamRewards: { money: 120000, fans: 240, reputation: 9 },
        playerProgress: [], unlocks: [], metadata: { winner: "blue" },
      };
      const state = {
        players: [], finance: { funds: 1000000, transactions: [] },
        meta: { fans: 128000, reputation: 47, days: 8 },
        processedMatchTransactions: {},
      };
      const out = progress.applyProgressToState(state, tx);
      if (!out.nextState) return { error: "結算被拒絕：" + JSON.stringify(out.receipt).slice(0, 200) };

      //  掛到一個獨立的 root（不動 app 本身的畫面）
      const host = document.createElement("div");
      host.id = "f0-receipt-host";
      host.style.cssText = "position:fixed;left:0;top:0;width:420px;z-index:99999;background:#0b0d12";
      document.body.appendChild(host);
      createRoot(host).render(React.createElement(panelMod.default, { receipt: out.receipt }));
      await new Promise((r) => setTimeout(r, 700));

      const txt = (host.innerText || "").replace(/\\s+/g, " ");
      const cells = [...host.querySelectorAll("div")]
        .map((n) => (n.innerText || "").replace(/\\s+/g, " ").trim());
      return {
        rendered: host.childElementCount > 0 && txt.length > 0,
        text: txt.slice(0, 160),
        hasFans: /粉絲/.test(txt),
        fansValue: (txt.match(/粉絲\\s*\\+?(\\d+)/) || [])[1] ?? null,
        hasReputation: /聲望/.test(txt),
        receiptHasRepField: "reputation" in out.receipt.team,
        metaRep: out.nextState.meta.reputation,
        metaFans: out.nextState.meta.fans,
        hostWidth: host.getBoundingClientRect().width,
        cellCount: cells.length,
      };`);

    if (receipt.error) {
      ck("2) 賽後收據可 render", false, receipt.error);
    } else {
      ck("2) 賽後收據（RewardReceiptPanel）在瀏覽器正常 render",
        receipt.rendered, receipt.text);
      ck("3) 粉絲獎勵顯示正常（+240，與 Store 寫入同源）",
        receipt.hasFans && receipt.fansValue === "240" && receipt.metaFans === 128240,
        `畫面 +${receipt.fansValue}｜meta.fans ${receipt.metaFans}`);
      ck("4) deprecated「聲望」獎勵格已不存在（畫面）",
        !receipt.hasReputation, receipt.hasReputation ? "仍看得到「聲望」" : "(乾淨)");
      ck("4b) 收據資料本身也不再帶 `team.reputation`",
        receipt.receiptHasRepField === false);
      ck("4c) 送 reputation: 9 也不會寫進 meta（欄位保留、值不動）",
        receipt.metaRep === 47, `meta.reputation = ${receipt.metaRep}`);
    }

    // ── 5) MOBA 賽後那一格改標「粉絲」 ─────────────────────────────────────
    const report = await chrome.evaluate(`
      const B = location.pathname.endsWith("/") ? location.pathname.slice(0, -1) : location.pathname;
      ${DERIVE_REACT}
      const flow = await import(B + "/src/platform/ui/MobaFlowScreens.jsx");
      const host = document.createElement("div");
      host.id = "f0-report-host";
      host.style.cssText = "position:fixed;left:440px;top:0;width:520px;z-index:99999";
      document.body.appendChild(host);
      createRoot(host).render(React.createElement(flow.MobaMatchReport, {
        result: { win: true, fanGain: 240, prizeGain: 12, xpGain: 300, durationSec: 1500 },
        battleConfig: {}, heroImg: {},
        onNext: () => {}, onRematch: () => {}, onHome: () => {},
      }));
      await new Promise((r) => setTimeout(r, 700));
      const txt = (host.innerText || "").replace(/\\s+/g, " ");
      return {
        rendered: host.childElementCount > 0 && txt.length > 0,
        text: txt.slice(0, 200),
        //  值仍是 fanGain（240），只是標籤從「聲望」改成「粉絲」⇒ 改名不是改數
        labelledFans: /\\+240[\\s\\S]{0,40}粉絲|粉絲[\\s\\S]{0,40}\\+240/.test(txt),
        hasReputation: /聲望/.test(txt),
      };`);
    ck("5) MOBA 賽後把 fanGain 標成「粉絲」（值仍是 +240）",
      report.rendered && report.labelledFans, report.text);
    ck("5b) MOBA 賽後畫面沒有「聲望」字樣", !report.hasReputation);

    // ── 6) Desktop 無明顯跑版 ──────────────────────────────────────────────
    const desktop = await chrome.evaluate(`
      //  先把測試用的 host 移除，跑版要量的是**產品畫面**不是我掛上去的東西
      document.getElementById("f0-receipt-host")?.remove();
      document.getElementById("f0-report-host")?.remove();
      await new Promise((r) => setTimeout(r, 300));
      const b = document.body;
      const wide = [...document.querySelectorAll("body *")]
        .filter((n) => n.getBoundingClientRect().width > window.innerWidth + 2)
        .slice(0, 3)
        .map((n) => n.tagName + "." + (n.className || "").toString().slice(0, 24));
      return { overflow: b.scrollWidth > window.innerWidth + 1, wide,
               scrollW: b.scrollWidth, innerW: window.innerWidth };`);
    ck("6) Desktop 1280 無明顯跑版（無元素超出視窗寬）",
      !desktop.overflow && desktop.wide.length === 0,
      `body ${desktop.scrollW} / 視窗 ${desktop.innerW}${desktop.wide.length ? "｜" + desktop.wide.join(", ") : ""}`);

    // ── 7) Mobile 390 無橫向捲動 ───────────────────────────────────────────
    await chrome.send("Emulation.setDeviceMetricsOverride", {
      width: 390, height: 844, deviceScaleFactor: 1, mobile: true,
    });
    await chrome.navigate(server.url);
    await sleep(3000);
    const mobile = await chrome.evaluate(`
      return { overflow: document.body.scrollWidth > window.innerWidth + 1,
               scrollW: document.body.scrollWidth, innerW: window.innerWidth,
               modes: document.querySelectorAll('[data-testid^="home-mode-"]').length };`);
    ck("7) Mobile 390 無 body 橫向捲動",
      !mobile.overflow, `body ${mobile.scrollW} / 視窗 ${mobile.innerW}`);
    ck("7b) Mobile 首頁三個模式入口仍在", mobile.modes === 3, `${mobile.modes} 個`);

    // ── 8) console / page error ────────────────────────────────────────────
    const errs = chrome.consoleLines.filter((l) => l.startsWith("[error]"));
    ck("8) console error = 0 且無未捕捉例外",
      errs.length === 0 && chrome.pageErrors.length === 0,
      [...errs.slice(0, 3), ...chrome.pageErrors.slice(0, 3)].join(" | ") || "(無)");
  } finally {
    await chrome.close();
    await server.stop();
  }

  console.log(`\n${pass}/${pass + fail} 通過`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(`\n💥 ${e.message}`); process.exit(1); });
