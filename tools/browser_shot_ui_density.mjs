#!/usr/bin/env node
// ============================================================================
//  UI Clarity Pass — 三頁的版面密度量測 ＋ 全頁截圖（桌機 1366 / 手機 390）
//
//  執行：
//    node tools/browser/run-gate.mjs tools/browser_shot_ui_density.mjs --timeout 900000
//  標籤（before / after）由環境變數決定：
//    ESMO_SHOT_LABEL=before node tools/browser/run-gate.mjs tools/browser_shot_ui_density.mjs
//
//  ⚠ 這支**不是**驗收 gate，是量測工具：它不判定好壞，只產出
//    「第一屏能看到什麼」「整頁多高」「有多少字」＋ 截圖，讓人眼自己比。
//    用驗證器宣稱 UI 好看是不誠實的（Owner 明令）。
// ============================================================================
import { writeFileSync, mkdirSync } from "node:fs";
import { RESOLVE_APP_MODULES } from "./browser/cdp.mjs";
import { runGate, finishGate } from "./browser/harness.mjs";

const J = (raw) => JSON.parse(String(raw).replace(/^"|"$/g, ""));
const LABEL = process.env.ESMO_SHOT_LABEL || "shot";
const OUT = new URL(`../review/ui-clarity/${LABEL}/`, import.meta.url);

const seed = () => `
  ${RESOLVE_APP_MODULES}
  const store = profile.useProfileStore;
  localStorage.removeItem("esmo.profile.v1");
  localStorage.removeItem("esmo.heroProgress.v2");
  store.getState().startNewGame("elite");
  await new Promise((r) => setTimeout(r, 400));
  //  讓三頁都有東西可看：專精選一條、資產有點數、挑戰發布防守陣容。
  try { store.getState().setActiveDoctrine("tempo"); } catch (e) {}
  try { store.getState().publishDefenseSnapshot("m1", { heroProgress: {} }); } catch (e) {}
  store.getState().save();
  return JSON.stringify({ players: store.getState().players.length });
`;

const clickByText = (text) => `
  const els = [...document.querySelectorAll('button,[role="button"],a,[data-testid]')];
  const el = els.find((e) => (e.innerText || "").trim().includes(${JSON.stringify(text)}));
  if (!el) return JSON.stringify({ ok: false, why: "找不到 " + ${JSON.stringify(text)} });
  el.scrollIntoView({ block: "center" });
  el.click();
  await new Promise((d) => setTimeout(d, 650));
  return JSON.stringify({ ok: true });
`;

/** 版面密度：整頁高度、第一屏字數、整頁字數、卡片高度。 */
const measure = () => `
  const vh = window.innerHeight;
  const doc = document.documentElement;
  const text = (document.body.innerText || "").replace(/\\s+/g, "");
  //  第一屏：所有 top < vh 的可見文字節點
  const inFirst = [...document.querySelectorAll("body *")].filter((el) => {
    if (el.children.length) return false;
    const r = el.getBoundingClientRect();
    return r.top >= 0 && r.top < vh && r.height > 0 && (el.innerText || "").trim();
  });
  const firstChars = inFirst.map((el) => (el.innerText || "").replace(/\\s+/g, "")).join("").length;
  //  主要操作按鈕（CTA）第一個出現在哪個高度
  const ctas = [...document.querySelectorAll("button")].filter((b) => {
    const r = b.getBoundingClientRect();
    return r.height > 0 && (b.innerText || "").trim().length > 1;
  });
  const firstCtaTop = ctas.length ? Math.round(ctas[0].getBoundingClientRect().top + window.scrollY) : null;
  //  最高的一張卡
  const cards = [...document.querySelectorAll('[data-testid]')].map((el) => el.getBoundingClientRect().height);
  return JSON.stringify({
    pageHeight: Math.round(doc.scrollHeight),
    viewportHeight: vh,
    screens: Math.round((doc.scrollHeight / vh) * 10) / 10,
    totalChars: text.length,
    firstScreenChars: firstChars,
    firstCtaTop,
    tallestCard: cards.length ? Math.round(Math.max(...cards)) : null,
    ctaCount: ctas.length,
    //  ⚠ 這幾條是**實際踩過的坑**：把兩顆 width:100% 的按鈕併成一列，
    //    主要 CTA 溢出卡片、文字被擠成一行一個字。DOM 都在、testid 都在、
    //    點得到 ⇒ 所有既有斷言都是綠的，只有看截圖才發現。
    //  ⚠ 第一版的偵測比對的是**視窗**邊界，結果抓不到 —— 那顆按鈕溢出的是
    //    **卡片**，本身還留在畫面內。要量的是真正的症狀：
    //      ① 元素的內容塞不進自己（scrollWidth > clientWidth）
    //      ② 元素超出它所屬的卡片
    //      ③ 有文字的按鈕變成又高又窄（一行一個字）
    pageOverflow: doc.scrollWidth > window.innerWidth + 1,
    escaped: (() => {
      const bad = [];
      const name = (el) => (el.getAttribute('data-testid') || el.tagName.toLowerCase());
      for (const el of document.querySelectorAll('button, a[role="button"]')) {
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        const txt = (el.innerText || '').trim();
        if (el.scrollWidth > el.clientWidth + 1) { bad.push(name(el) + ':內容塞不下'); continue; }
        if (txt.length >= 2 && r.height > r.width * 1.6) { bad.push(name(el) + ':又高又窄'); continue; }
        if (r.right > window.innerWidth + 1 || r.left < -1) { bad.push(name(el) + ':超出畫面'); continue; }
        const card = el.closest('[data-testid]');
        if (card && card !== el) {
          const c = card.getBoundingClientRect();
          if (r.right > c.right + 1 || r.left < c.left - 1) bad.push(name(el) + ':超出卡片');
        }
      }
      return bad.slice(0, 6);
    })(),
  });
`;

const result = await runGate({
  name: `UI 密度量測（${LABEL}）`,
  run: async ({ chrome, url, ck, sleep }) => {
    mkdirSync(OUT, { recursive: true });
    const rows = [];
    for (const [L, width, height, mobile] of [["desktop-1366", 1366, 900, false], ["mobile-390", 390, 844, true]]) {
      console.log(`\n════ ${L} ════`);
      await chrome.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
      await chrome.navigate(url); await sleep(1200);
      const s = J(await chrome.evaluate(seed()));
      ck(`${L}｜precondition：乾淨存檔`, s.players > 0, `${s.players} 名選手`);

      for (const [page, entry] of [["club-mastery", "俱樂部專精"], ["club-assets", "俱樂部資產"], ["player-challenge", "玩家挑戰"]]) {
        await chrome.navigate(url); await sleep(1400);
        if (mobile) await chrome.evaluate(clickByText("更多"));
        const open = J(await chrome.evaluate(clickByText(entry)));
        ck(`${L}｜${page} 進得去`, open.ok, open.why ?? "");
        if (!open.ok) continue;
        await sleep(700);

        const m = J(await chrome.evaluate(measure()));
        rows.push({ width: L, page, ...m });
        //  ⚠ 這是本工具唯一的**判定**（其餘只是量測）：跑出畫面就是壞了，
        //    不需要人眼也能確定。
        ck(`${L}｜${page} 沒有元素跑出畫面`, m.pageOverflow === false && m.escaped.length === 0,
          m.escaped.join(" ") || "clean");
        console.log(`   ${page.padEnd(18)} 高 ${String(m.pageHeight).padStart(5)}px（${m.screens} 屏）`
          + ` 總字 ${String(m.totalChars).padStart(4)} 首屏字 ${String(m.firstScreenChars).padStart(4)}`
          + ` 首個CTA@${m.firstCtaTop}px 最高卡 ${m.tallestCard}px`);

        //  全頁截圖：把視窗高度暫時撐到整頁高，拍完再還原。
        await chrome.send("Emulation.setDeviceMetricsOverride", {
          width, height: Math.min(m.pageHeight + 40, 6000), deviceScaleFactor: 1, mobile,
        });
        await sleep(500);
        const shot = await chrome.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
        writeFileSync(new URL(`${LABEL}-${L}-${page}.png`, OUT), Buffer.from(shot.data, "base64"));
        await chrome.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
        await sleep(200);
      }
    }
    writeFileSync(new URL(`${LABEL}-metrics.json`, OUT), JSON.stringify(rows, null, 2));
    console.log(`\n截圖與數據：review/ui-clarity/${LABEL}/`);
  },
});

finishGate(result);
