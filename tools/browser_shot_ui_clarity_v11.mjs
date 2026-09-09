#!/usr/bin/env node
// ============================================================================
//  UI Clarity Pass v1.1 — 第二批頁面的密度量測 ＋ 全頁截圖 ＋ 工程術語判定
//
//  執行：
//    ESMO_SHOT_LABEL=before node tools/browser/run-gate.mjs tools/browser_shot_ui_clarity_v11.mjs --timeout 900000
//
//  ⚠ 工程術語的判定**讀實際渲染出來的文字**，不掃原始碼。理由有兩個，
//    而且兩個都是這個 repo 踩過的坑：
//      ① 掃原始碼會掃到自己的註解（本 session 已經踩過三次）
//      ② 掃原始碼分不出「玩家看得到」與「debug 分支才有」，而 Owner 要的是前者。
//
//  ⚠ **但要知道這支 gate 跑在 dev server 上，而 dev server 的 debug 是開著的。**
//    `isDebugMode()` 第一個判斷就是 `import.meta.env.DEV` 且無法覆蓋（?debug=0 也關不掉）。
//    後果分兩邊看：
//      · 術語檢查：debug 會**多**顯示東西 ⇒ 這裡的綠燈比正式站更嚴格，可信。
//      · 版面數據與截圖：**包含玩家看不到的 debug 區塊**（例如「查看技術內容」），
//        所以高度會比正式站高。前後對照仍然有效（兩邊條件一樣），
//        但不可以拿這裡的絕對高度去描述正式站。
//  ⚠ 也順便釘住上一輪的溢出判定（又高又窄 / 內容塞不下 / 超出卡片）。
// ============================================================================
import { writeFileSync, mkdirSync } from "node:fs";
import { RESOLVE_APP_MODULES } from "./browser/cdp.mjs";
import { runGate, finishGate } from "./browser/harness.mjs";

const J = (raw) => JSON.parse(String(raw).replace(/^"|"$/g, ""));
const LABEL = process.env.ESMO_SHOT_LABEL || "shot";
const OUT = new URL(`../review/ui-clarity-v11/${LABEL}/`, import.meta.url);

/**
 * 不得出現在玩家正式介面的字串。
 *
 * ⚠ 只列**純程式識別字**。像「戰術」「熟練」這種遊戲名詞不算，
 *   而 `Lv` / `KDA` 這種玩家本來就懂的縮寫也不算。
 */
const FORBIDDEN = [
  "CHAMPIONS_100", "BattleResult", "profileStore", "Hero Progress",
  "heroProgress", "Zustand", "zustand", "LogicEngine", "MatchSession",
  "SquadSnapshot", "ChallengeInstance", "DraftPolicy", "DraftResult",
  "MatchSource", "SnapshotAuthority",
];

const seed = () => `
  ${RESOLVE_APP_MODULES}
  const store = profile.useProfileStore;
  localStorage.removeItem("esmo.profile.v1");
  localStorage.removeItem("esmo.heroProgress.v2");
  localStorage.removeItem("esmo_debug");
  store.getState().startNewGame("elite");
  await new Promise((r) => setTimeout(r, 400));
  store.getState().save();
  return JSON.stringify({ players: store.getState().players.length });
`;

const clickByText = (text) => `
  const vis = (e) => {
    const r = e.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const st = getComputedStyle(e);
    return st.visibility !== 'hidden' && st.display !== 'none' && st.opacity !== '0';
  };
  const els = [...document.querySelectorAll('button,[role="button"],a,[data-testid]')].filter(vis);
  const el = els.find((e) => (e.innerText || "").trim().includes(${JSON.stringify(text)}));
  if (!el) return JSON.stringify({ ok: false, why: "找不到 " + ${JSON.stringify(text)} });
  el.scrollIntoView({ block: "center" });
  el.click();
  //  ⚠ 手機有轉場動畫，700ms 不夠 —— 實測會在畫面還沒換完時就去檢查，
  //    然後把「還沒到」誤判成「進不去」。
  await new Promise((d) => setTimeout(d, 1300));
  return JSON.stringify({ ok: true });
`;

/**
 * 用 testid 點。
 *
 * ⚠ 比文字精準，而且有實測理由：首頁的模式卡在桌機與手機**各有一份**，
 *   testid 與文字都相同。按文字找會挑到其中一份，而那一份在手機上點了
 *   不會換頁——看起來就像「手機進不了賽前頁」的產品 bug，其實不是。
 */
const clickByTestid = (id) => `
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const sel = "[data-testid=" + JSON.stringify(${JSON.stringify(id)}) + "]";
  const list = [...document.querySelectorAll(sel)].filter(vis);
  if (!list.length) return JSON.stringify({ ok: false, why: "找不到可見的 " + ${JSON.stringify(id)} });
  list[0].scrollIntoView({ block: "center" });
  list[0].click();
  await new Promise((d) => setTimeout(d, 1300));
  return JSON.stringify({ ok: true });
`;

const measure = (terms) => `
  const vh = window.innerHeight;
  const doc = document.documentElement;
  //  ⚠ 有些畫面（例如賽前頁）的 innerText 幾乎是空的——版面把內容放在
  //    不參與 innerText 計算的結構裡。用它做術語檢查會得到「什麼都沒找到」，
  //    然後被當成 clean。⇒ 退回 textContent，而且下面會**檢查讀到的量**。
  const seen = ((document.body.innerText || "").length > 40
    ? document.body.innerText
    : (document.body.textContent || ""));
  const text = seen.replace(/\\s+/g, "");
  const inFirst = [...document.querySelectorAll("body *")].filter((el) => {
    if (el.children.length) return false;
    const r = el.getBoundingClientRect();
    return r.top >= 0 && r.top < vh && r.height > 0 && (el.innerText || "").trim();
  });
  const firstChars = inFirst.map((el) => (el.innerText || "").replace(/\\s+/g, "")).join("").length;
  //  ⚠ 讀的是**畫面上真的看得到的字**：註解不會在這裡，debug 分支預設也不在。
  const bad = ${JSON.stringify(terms)}.filter((t) => seen.includes(t));
  const escaped = (() => {
    const out = [];
    const name = (el) => (el.getAttribute('data-testid') || el.tagName.toLowerCase());
    for (const el of document.querySelectorAll('button, a[role="button"]')) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      const t = (el.innerText || "").trim();
      if (el.scrollWidth > el.clientWidth + 1) { out.push(name(el) + ':內容塞不下'); continue; }
      if (t.length >= 2 && r.height > r.width * 1.6) { out.push(name(el) + ':又高又窄'); continue; }
      //  ⚠ 刻意的水平捲動容器（首頁模式選單那種「左右滑動」）裡面，
      //    元素本來就會在視窗外——那是設計，不是壞掉。誤報會讓這條規則被關掉。
      let scroller = el.parentElement, inScroller = false;
      while (scroller && scroller !== document.body) {
        const ov = getComputedStyle(scroller).overflowX;
        if ((ov === 'auto' || ov === 'scroll') && scroller.scrollWidth > scroller.clientWidth + 1) { inScroller = true; break; }
        scroller = scroller.parentElement;
      }
      if (!inScroller && (r.right > window.innerWidth + 1 || r.left < -1)) { out.push(name(el) + ':超出畫面'); continue; }
    }
    return out.slice(0, 6);
  })();
  return JSON.stringify({
    pageHeight: Math.round(doc.scrollHeight), screens: Math.round((doc.scrollHeight / vh) * 10) / 10,
    totalChars: text.length, firstScreenChars: firstChars,
    badTerms: bad, escaped, pageOverflow: doc.scrollWidth > window.innerWidth + 1,
    sample: seen.replace(/\\s+/g, " ").slice(0, 90),
  });
`;

/**
 * 每一頁怎麼進去。⚠ 只走玩家真的會走的路徑，不用 setScreen 作弊。
 *
 * ⚠ 桌機與手機的路徑**本來就不同**，不要硬套同一條：名單入口在桌機是
 *   戰隊狀態卡上的「查看名單」，在手機是「戰隊」分頁裡的「選手名單」。
 *   硬用同一條會得到「進不去」，然後被誤判成畫面壞掉。
 * ⚠ 天賦樹的按鈕在名單詳情欄叫「查看天賦」（RosterScreen），
 *   在選手詳情頁才叫「查看個人特質」（PlayerDetailScreen）。
 */
const PAGES = [
  //  `must`：進到該頁之後**一定**看得到的 testid。沒有它就代表根本沒換頁。
  //  ⚠ 識別元素要挑**一定會渲染**的。我先後挑錯兩次（`hero-source-note` 在手機
  //    不一定在、`team-development-growth-planning` 是條件渲染），兩次都把
  //    「其實有進到頁面」誤判成「沒換頁」。
  { id: "lineup", desktop: ["#home-mode-moba"], mobile: ["#home-mode-moba"], must: "prep-tier-banner" },
  { id: "team-development", desktop: ["戰隊發展"], mobile: ["戰隊發展"], must: "development-route-summary" },
  //  ⚠ **天賦頁不在這張表上，而且原因值得記下來。**
  //    「查看天賦」只在 RosterScreen 的 `talentMode` 才渲染，而那個模式只有
  //    `talentPick` 路由會開；`talentPick` 目前**沒有任何首頁入口**（`DashboardScreen`
  //    的註解說天賦入口已改到選手詳情頁）。一般模式下點選手列也只是在名單內
  //    選取，不會進選手詳情頁。
  //    ⇒ 用瀏覽器走不到它，不是這支工具寫壞了。這件事本身要回報給 Owner，
  //      不可以用 setScreen 硬跳過去假裝走得到 —— 那會讓「入口不見了」被蓋掉。
];

const result = await runGate({
  name: `UI Clarity v1.1 量測（${LABEL}）`,
  run: async ({ chrome, url, ck, sleep }) => {
    mkdirSync(OUT, { recursive: true });
    const rows = [];
    for (const [L, width, height, mobile] of [["desktop-1366", 1366, 900, false], ["mobile-390", 390, 844, true]]) {
      console.log(`\n════ ${L} ════`);
      await chrome.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
      await chrome.navigate(url); await sleep(1200);
      const s = J(await chrome.evaluate(seed()));
      ck(`${L}｜precondition：乾淨存檔`, s.players > 0, `${s.players} 名選手`);

      for (const page of PAGES) {
        await chrome.navigate(url); await sleep(1500);
        let ok = true, failedAt = null;
        for (const step of (mobile ? page.mobile : page.desktop)) {
          if (step === "__firstPlayer") {
            const r = J(await chrome.evaluate(`
              const el = document.querySelector('[data-testid^="roster-player-"], [data-testid^="player-row-"]');
              if (!el) return JSON.stringify({ ok: false, why: "找不到選手列" });
              el.scrollIntoView({ block: "center" }); el.click();
              await new Promise((d) => setTimeout(d, 700));
              return JSON.stringify({ ok: true });
            `));
            if (!r.ok) { ok = false; failedAt = step + ' → ' + (r.why ?? ''); break; }
            continue;
          }
          //  `#xxx` = 用 testid 點（見 clickByTestid 的說明）。
          const r = J(await chrome.evaluate(
            step.startsWith("#") ? clickByTestid(step.slice(1)) : clickByText(step)));
          if (!r.ok) { ok = false; failedAt = step + ' → ' + (r.why ?? ''); break; }
        }
        //  ⚠ 點得到 ≠ 進得去。一定要確認目標頁面自己的元素真的出現了。
        const landed = ok ? J(await chrome.evaluate(
          "const el = document.querySelector('[data-testid=\"" + page.must + "\"]');"
          + "return JSON.stringify({ on: !!el });"
        )).on : false;
        ck(`${L}｜${page.id} 進得去`, ok && landed,
          !ok ? (failedAt ?? "") : landed ? "" : "點得到但畫面沒換");
        if (!ok || !landed) continue;

        const m = J(await chrome.evaluate(measure(FORBIDDEN)));
        rows.push({ width: L, page: page.id, ...m });
        //  ⚠ **先證明真的讀到畫面文字**。在空字串上宣告「沒有術語」是假綠——
        //    這正是 smoke 必須先驗前提的那條教訓。
        ck(`${L}｜${page.id} 讀得到畫面文字`, m.totalChars > 60, `${m.totalChars} 字`);
        //  ⭐ 本輪的判定：玩家介面上不得看到程式識別字。
        ck(`${L}｜${page.id} 沒有工程術語外洩`, m.totalChars > 60 && m.badTerms.length === 0,
          m.badTerms.join(" ") || "clean");
        ck(`${L}｜${page.id} 沒有元素跑出畫面`, m.pageOverflow === false && m.escaped.length === 0,
          m.escaped.join(" ") || "clean");
        console.log(`   ${page.id.padEnd(18)} 高 ${String(m.pageHeight).padStart(5)}px（${m.screens} 屏）`
          + ` 總字 ${String(m.totalChars).padStart(4)} 首屏字 ${String(m.firstScreenChars).padStart(4)}`);

        await chrome.send("Emulation.setDeviceMetricsOverride", {
          width, height: Math.min(m.pageHeight + 40, 6000), deviceScaleFactor: 1, mobile,
        });
        await sleep(500);
        const shot = await chrome.send("Page.captureScreenshot", { format: "png" });
        writeFileSync(new URL(`${LABEL}-${L}-${page.id}.png`, OUT), Buffer.from(shot.data, "base64"));
        await chrome.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
        await sleep(200);
      }
      const pageErrs = chrome.pageErrors ?? [];
      ck(`${L}｜無 page-origin uncaught error`, pageErrs.length === 0, pageErrs.slice(0, 2).join(" ¦ ") || "clean");
    }
    writeFileSync(new URL(`${LABEL}-metrics.json`, OUT), JSON.stringify(rows, null, 2));
    console.log(`\n截圖與數據：review/ui-clarity-v11/${LABEL}/`);
  },
});

finishGate(result);
