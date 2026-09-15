#!/usr/bin/env node
// ============================================================================
//  tools/browser_review_moba_items_m3a.mjs — 裝備 UI M3a 視覺樣張：四寬度截圖＋版面量測
//
//  執行：node tools/browser/run-gate.mjs tools/browser_review_moba_items_m3a.mjs --timeout 600000
//
//  每個寬度（320／390／768／1366）：
//    · 等樣張頁用真實引擎產生資料（data-gallery-ready）
//    · 九個必備區塊都在、不水平溢出、console／page 錯誤 = 0、玩家可見文字無工程術語
//    · ≤ 700px：所有 data-touch 元素 ≥ 44×44
//    · 整頁截圖；320 與 1366 另存英雄詳情與戰術卡近拍
//  另外 390px 以 prefers-reduced-motion: reduce 重載：通知是最終狀態、沒有掃光層。
//  截圖存 review/moba-items-m3a/（可用 ESMO_REVIEW_OUT 覆寫）。
//  ⚠ 「像不像電競 HUD」無法機器判定：這支只提供證據，外觀由 Owner Review。
// ============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { runGate, finishGate } from "./browser/harness.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SHOT_DIR = resolve(ROOT, process.env.ESMO_REVIEW_OUT ?? "review/moba-items-m3a");
mkdirSync(SHOT_DIR, { recursive: true });

const SECTIONS = ["icons", "slots", "gold", "toast", "next-item", "build-path", "coach-note", "strategy-cards", "hero-detail"];
const VIEWPORTS = [
  { label: "手機 320px", slug: "320", width: 320, height: 720, mobile: true, closeups: true },
  { label: "手機 390px", slug: "390", width: 390, height: 844, mobile: true, closeups: false },
  { label: "平板 768px", slug: "768", width: 768, height: 1024, mobile: true, closeups: false },
  { label: "桌機 1366px", slug: "1366", width: 1366, height: 900, mobile: false, closeups: true },
];

const report = [];
const note = (line) => { report.push(line); console.log(line); };
const J = (raw) => JSON.parse(String(raw).replace(/^"|"$/g, ""));

const WAIT_READY = `
  for (let i = 0; i < 160; i++) {
    if (document.querySelector('[data-gallery-ready="1"]')) return "ready";
    await new Promise((r) => setTimeout(r, 250));
  }
  return "timeout";
`;

const MEASURE = `
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };
  const sections = ${JSON.stringify(SECTIONS)}.map((id) => ({ id, present: !!document.querySelector('[data-gallery-section="' + id + '"]') }));
  const touch = [...document.querySelectorAll("[data-touch]")].filter(vis).map((el) => {
    const r = el.getBoundingClientRect();
    return { label: (el.getAttribute("aria-label") || el.innerText || "").trim().slice(0, 14), w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 };
  });
  const body = (document.body.innerText || "").toLowerCase();
  const JARGON = ["ledger", "schema", "milli", "snapshot", "targetid", "reasons", "undefined", "nan"];
  const toasts = [...document.querySelectorAll("[data-toast]")].map((el) => Number(getComputedStyle(el).opacity));
  return JSON.stringify({
    sections,
    overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    smallTouch: touch.filter((t) => t.w < 44 || t.h < 44),
    touchCount: touch.length,
    jargon: JARGON.filter((w) => body.includes(w)),
    toasts,
    shineLayers: document.querySelectorAll("[data-toast-shine]").length,
    detailFrames: document.querySelectorAll("[data-hero-item-detail]").length,
    //  ⚠ 不能只量「看得見的」可點元素：寬度塌成 0 的格子會被 vis() 濾掉而假綠（M3a 第二輪踩過）。
    invSlots: [...document.querySelectorAll('[data-hero-item-detail] [data-inventory-fluid="1"] [data-slot-state]')].map((el) => {
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 };
    }),
    strategyCards: document.querySelectorAll("[data-strategy]").length,
  });
`;

const rectOf = (selector) => `
  const el = document.querySelector('${selector}');
  if (!el) return "null";
  const r = el.getBoundingClientRect();
  return JSON.stringify({ x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height });
`;

async function shoot(chrome, name, clip) {
  const data = await chrome.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { ...clip, scale: 1 } });
  if (!data?.data) return;
  const file = resolve(SHOT_DIR, name);
  writeFileSync(file, Buffer.from(data.data, "base64"));
  note(`   截圖 ${relative(ROOT, file).replace(/\\/g, "/")}`);
}

async function fullPage(chrome, name) {
  const m = await chrome.send("Page.getLayoutMetrics");
  const size = m.cssContentSize ?? m.contentSize;
  await shoot(chrome, name, { x: 0, y: 0, width: Math.ceil(size.width), height: Math.ceil(size.height) });
}

const result = await runGate({
  name: "裝備 UI M3a 視覺樣張",
  run: async ({ chrome, url, ck, sleep }) => {
    const target = `${url}${url.includes("?") ? "&" : "?"}debug=items-ui`;
    for (const vp of VIEWPORTS) {
      note(`\n════ ${vp.label} ════`);
      await chrome.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
      await chrome.send("Emulation.setDeviceMetricsOverride", { width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.mobile });
      const errBefore = { console: chrome.consoleLines.length, page: chrome.pageErrors.length };
      await chrome.navigate(target);
      const ready = String(await chrome.evaluate(WAIT_READY)).replace(/"/g, "");
      ck(`${vp.label}｜樣張頁以真實引擎資料載入完成`, ready === "ready", ready);
      if (ready !== "ready") continue;
      await sleep(1400);   // 等進場動效結束再量與截圖
      const m = J(await chrome.evaluate(MEASURE));
      const missing = m.sections.filter((s) => !s.present).map((s) => s.id);
      ck(`${vp.label}｜九個必備區塊都在`, missing.length === 0, missing.join(",") || "");
      ck(`${vp.label}｜不水平溢出`, m.overflow === false, `${m.scrollWidth}/${m.innerWidth}`);
      ck(`${vp.label}｜玩家可見文字沒有工程術語／undefined／NaN`, m.jargon.length === 0, m.jargon.join(","));
      ck(`${vp.label}｜戰術卡 5 張、英雄詳情外框 ≥ 2`, m.strategyCards === 5 && m.detailFrames >= 2, `cards=${m.strategyCards} frames=${m.detailFrames}`);
      ck(`${vp.label}｜購買通知動畫結束後完整可見`, m.toasts.length > 0 && m.toasts.every((o) => o === 1), m.toasts.join("/"));
      const minSlot = vp.width <= 700 ? 44 : 30;
      ck(`${vp.label}｜英雄詳情的 6 格背包真的畫出來（${m.invSlots.length} 格，每格 ≥ ${minSlot}px）`,
        m.invSlots.length === m.detailFrames * 6 && m.invSlots.every((s) => s.w >= minSlot && s.h >= minSlot),
        m.invSlots.slice(0, 6).map((s) => `${s.w}×${s.h}`).join(" "));
      if (vp.width <= 700) {
        ck(`${vp.label}｜可點元素都 ≥ 44×44（${m.touchCount} 個）`, m.smallTouch.length === 0,
          m.smallTouch.map((t) => `${t.label}(${t.w}×${t.h})`).join(" "));
      }
      const errs = chrome.consoleLines.slice(errBefore.console).filter((l) => /^\[error\]/i.test(l));
      const pageErrs = chrome.pageErrors.slice(errBefore.page);
      ck(`${vp.label}｜console／page 錯誤 = 0`, errs.length === 0 && pageErrs.length === 0, [...errs, ...pageErrs].slice(0, 3).join(" ¦ ") || "");

      await fullPage(chrome, `gallery-${vp.slug}.png`);
      if (vp.closeups) {
        for (const [sel, name] of [['[data-gallery-section="hero-detail"]', "hero-detail"], ['[data-gallery-section="strategy-cards"]', "strategy-cards"], ['[data-gallery-section="slots"]', "slots"]]) {
          const raw = String(await chrome.evaluate(rectOf(sel)));
          if (raw.includes("null")) continue;
          const r = J(raw);
          await shoot(chrome, `${name}-${vp.slug}.png`, { x: Math.max(0, r.x), y: Math.max(0, r.y), width: Math.ceil(r.w), height: Math.ceil(r.h) });
        }
      }
    }

    note("\n════ 手機 390px｜減少動態 ════");
    await chrome.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await chrome.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await chrome.navigate(target);
    const ready = String(await chrome.evaluate(WAIT_READY)).replace(/"/g, "");
    if (ready === "ready") {
      await sleep(200);   // 不等動畫：reduced 應該一出現就是最終狀態
      const m = J(await chrome.evaluate(MEASURE));
      ck("減少動態｜通知立即完整可見、沒有掃光層", m.toasts.length > 0 && m.toasts.every((o) => o === 1) && m.shineLayers === 0, `opacity=${m.toasts.join("/")} shine=${m.shineLayers}`);
    } else {
      ck("減少動態｜樣張頁載入", false, ready);
    }
  },
});

writeFileSync(resolve(SHOT_DIR, "measurements.txt"), report.join("\n"), "utf8");
console.log(`\n量測明細：${relative(ROOT, resolve(SHOT_DIR, "measurements.txt")).replace(/\\/g, "/")}`);
finishGate(result);
