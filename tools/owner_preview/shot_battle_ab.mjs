#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/shot_battle_ab.mjs — 對戰畫面的 Before／After 截圖（畫質回歸用，2026-11-11；不是 gate、不改任何程式）
//  同一組操作在兩個網址各跑一次：開局全景、放大中路、拖到藍方基地、4× 跑 45 秒後的全景與近景。
//  開局幾秒內場景幾乎靜止（塔完整、英雄在泉水）⇒ 前三張可以直接對照；後兩張每場戰況不同，只用來看血條／特效有沒有壞。
//  執行：ESMO_EXTERNAL_URL=... ESMO_REVIEW_OUT=<資料夾> ESMO_PERF_LABEL=before|after node tools/browser/run-gate.mjs tools/owner_preview/shot_battle_ab.mjs --timeout 600000 -- --headed
// ============================================================================
import { writeFileSync, mkdirSync } from "node:fs";
import { runGate, finishGate } from "../browser/harness.mjs";
import { flowOf } from "./lib_battle_flow.mjs";

const TARGET_URL = process.env.ESMO_EXTERNAL_URL?.trim() || null;
const LABEL = process.env.ESMO_PERF_LABEL ?? "run";
const OUT = process.env.ESMO_REVIEW_OUT ?? "tmp/moba-shots";
mkdirSync(OUT, { recursive: true });

const result = await runGate({
  name: `MOBA battle shots（${LABEL}）`, timeoutMs: 550_000, externalUrl: TARGET_URL,
  async run({ chrome, url, ck, sleep }) {
    const { click, toBattle } = flowOf({ chrome, url, sleep });
    await chrome.send("Emulation.setDeviceMetricsOverride", { label: "Desktop", width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    const ok = await toBattle();
    ck("進入 MOBA 戰鬥", ok);
    if (!ok) return;
    const shot = async (name) => { const { data } = await chrome.send("Page.captureScreenshot", { format: "png" }); writeFileSync(`${OUT}/${LABEL}-${name}.png`, Buffer.from(data, "base64")); };
    const mouse = (type, x, y, extra = {}) => chrome.send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1, ...extra });
    const wheel = async (n, dy) => { for (let i = 0; i < n; i++) { await chrome.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 683, y: 450, deltaX: 0, deltaY: dy }); await sleep(80); } };
    const drag = async (x0, y0, x1, y1) => { await mouse("mousePressed", x0, y0); for (let i = 1; i <= 10; i++) { await mouse("mouseMoved", x0 + (x1 - x0) * i / 10, y0 + (y1 - y0) * i / 10); await sleep(30); } await mouse("mouseReleased", x1, y1); };
    await click('[data-testid="match-speed-1"]');
    await sleep(1500);
    await shot("1-overview");
    await wheel(9, -100); await sleep(900);
    await shot("2-zoom-mid");
    await drag(500, 400, 950, 150); await sleep(900);
    await shot("3-zoom-blue-side");
    await drag(950, 150, 500, 400); await wheel(9, 100);
    await click('[data-testid="match-speed-4"]');
    await sleep(45000);
    await click('[data-testid="match-speed-1"]'); await sleep(600);
    await shot("4-midgame-overview");
    await wheel(7, -100); await sleep(900);
    await shot("5-midgame-zoom");
    ck("page error = 0", chrome.pageErrors.length === 0, JSON.stringify(chrome.pageErrors).slice(0, 300));
  },
});
await finishGate(result);
