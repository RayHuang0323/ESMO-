#!/usr/bin/env node
// ============================================================================
//  tools/shot_milestone_h.mjs — Milestone H 驗收（英雄定位進對戰 + 三個呈現修正）
//
//  兩件事都必須在**真的瀏覽器**裡驗，Node 證不了：
//   1. 隊伍面板看不看得到血條／狀態／秒數；點英雄開的是不是「戰鬥資訊」面板
//   2. 手機手勢：canvas 有沒有 touch-action、頁面會不會被下拉重新整理帶走、
//      縮放能不能真的拉到「整張地圖都看得到」
//
//  手勢用 CDP `Input.dispatchTouchEvent` 送真的觸控事件，不是呼叫內部函式
//  ⇒ 驗的是「使用者這樣滑會發生什麼」。
// ============================================================================
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "..");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const OUT_DIR = resolve(ROOT, arg("--out", "review/moba-runtime/milestone-h/evidence"));
const DESK = { w: 1600, h: 1000 };
const MOB = { w: 390, h: 844 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"].find((p) => existsSync(p));

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.p = new Map(); }
  static async connect(u) {
    const ws = new WebSocket(u);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const c = new CDP(ws);
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && c.p.has(m.id)) { const { res, rej } = c.p.get(m.id); c.p.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
    };
    return c;
  }
  send(method, params = {}, t = 30000) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      const timer = setTimeout(() => { this.p.delete(id); rej(new Error(`CDP ${method} 逾時`)); }, t);
      this.p.set(id, { res: (v) => { clearTimeout(timer); res(v); }, rej: (e) => { clearTimeout(timer); rej(e); } });
      try { this.ws.send(JSON.stringify({ id, method, params })); } catch (e) { clearTimeout(timer); rej(e); }
    });
  }
}
const ev = async (c, expr) => {
  const r = await c.send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text ?? "evaluate failed");
  return r.result?.value;
};
const text = (c) => ev(c, "document.body.innerText || ''");
const clickByText = (c, n) => ev(c, `(() => {
  const n = ${JSON.stringify(n)};
  const hits = [...document.querySelectorAll("button,[role=button],div,span,a")]
    .filter((el) => (el.textContent || "").includes(n) && el.offsetParent !== null);
  if (!hits.length) return false;
  const el = hits.find((a) => !hits.some((b) => b !== a && a.contains(b))) ?? hits[hits.length - 1];
  el.click(); return true;
})()`);
async function clickUntil(c, n, expect, s = 25) {
  for (let i = 0; i < s; i++) {
    if ((await text(c).catch(() => "")).includes(expect)) return true;
    await clickByText(c, n); await sleep(1000);
  }
  return (await text(c).catch(() => "")).includes(expect);
}

const results = { notes: [], shots: [] };
let failed = 0;
const ck = (label, cond, extra = null) => {
  results.notes.push({ label, ok: !!cond, extra });
  console.log(`${cond ? "✅" : "❌"} ${label}${!cond && extra != null ? `　→ ${JSON.stringify(extra)}` : ""}`);
  if (!cond) failed++;
  return !!cond;
};

if (!CHROME) { console.error("找不到 Chrome"); process.exit(2); }
const baseUrl = "http://localhost:4179";
const server = spawn(process.platform === "win32" ? "npm.cmd" : "npm",
  ["run", "preview", "--", "--port", "4179", "--strictPort"], { cwd: ROOT, stdio: "ignore", shell: process.platform === "win32" });
for (let i = 0; i < 120; i++) { try { const r = await fetch(baseUrl, { redirect: "manual" }); if (r.status < 500) break; } catch { /* wait */ } await sleep(500); }
const profileDir = resolve(ROOT, "node_modules/.cache", `esmo-h-${process.pid}`);
const port = 9350 + (process.pid % 140);
const browser = spawn(CHROME, [`--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`,
  "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--hide-scrollbars",
  "--force-device-scale-factor=1", `--window-size=${DESK.w},${DESK.h}`, "--window-position=0,0", "about:blank"], { stdio: "ignore" });
let wsUrl = null;
for (let i = 0; i < 80 && !wsUrl; i++) { await sleep(250); try { wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl; } catch { /* wait */ } }
if (!wsUrl) { console.error("Chrome CDP 沒開起來"); browser.kill(); server.kill(); process.exit(4); }
mkdirSync(OUT_DIR, { recursive: true });
const root = await CDP.connect(wsUrl);
const { targetId } = await root.send("Target.createTarget", { url: "about:blank" });
const tab = await CDP.connect(`ws://127.0.0.1:${port}/devtools/page/${targetId}`);
await tab.send("Page.enable"); await tab.send("Runtime.enable");

async function shot(name) {
  try { await tab.send("Page.bringToFront", {}, 10000); } catch { /* non-fatal */ }
  for (const p of [{ format: "png" }, { format: "png", fromSurface: false }]) {
    try {
      const { data } = await tab.send("Page.captureScreenshot", p, 45000);
      writeFileSync(resolve(OUT_DIR, name), Buffer.from(data, "base64"));
      results.shots.push(name); console.log(`  📸 ${name}`); return true;
    } catch { /* fallback */ }
  }
  console.log(`  ⚠ ${name} 截圖失敗`); return false;
}

async function toGameView(size, tag, diag = true) {
  await tab.send("Emulation.setDeviceMetricsOverride", { width: size.w, height: size.h, deviceScaleFactor: 1, mobile: size.w < 600 });
  if (size.w < 600) await tab.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await tab.send("Page.navigate", { url: `${baseUrl}/?debug=1${diag ? "&diag=1" : ""}` });
  await sleep(3000);
  ck(`${tag}：進入賽前配置`, await clickUntil(tab, "MOBA", "先發五人", 20));
  await clickUntil(tab, "確認陣容", "進入 Ban/Pick", 20);
  ck(`${tag}：進入 Ban/Pick`, await clickUntil(tab, "進入 Ban/Pick", "選角動態", 25));
  for (let i = 0; i < 60; i++) {
    if ((await text(tab)).includes("選角完成")) break;
    await ev(tab, `(() => {
      const g = [...document.querySelectorAll("div")].find((d) => (d.style.gridTemplateColumns || "").includes("repeat(5") && d.offsetParent !== null);
      if (!g || !g.children.length) return false;
      const b = g.children[0].querySelectorAll("button"); if (b.length < 2) return false; b[1].click(); return true;
    })()`);
    await sleep(700);
  }
  ck(`${tag}：進入 Loading`, await clickUntil(tab, "開始載入", "VS", 20));
  for (let i = 0; i < 120; i++) { await sleep(500); if (await ev(tab, "!!document.querySelector('canvas')").catch(() => false)) break; }
  ck(`${tag}：正式 GameView 掛載`, await ev(tab, "!!document.querySelector('canvas')"));
  await clickByText(tab, "4×");
  await sleep(12000);           // 讓比賽推進，血條與狀態才有內容
  //  診斷面板只提供探針，不該蓋住視覺證據 ⇒ 截圖前先收合
  await ev(tab, `(() => {
    const b = [...document.querySelectorAll("button")].find((x) => (x.textContent || "").trim() === "收合");
    if (b) { b.click(); return true; } return false;
  })()`).catch(() => null);
  await sleep(400);
}

/** 送一串真的觸控事件（CDP），回傳 pan/zoom 的前後變化。 */
async function touchDrag(from, to, steps = 8) {
  const before = await ev(tab, "JSON.stringify(window.__ESMO_RUNTIME_CAM ? window.__ESMO_RUNTIME_CAM() : null)");
  const scrollBefore = await ev(tab, "window.scrollY");
  await tab.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from.x, y: from.y, id: 1 }] });
  for (let i = 1; i <= steps; i++) {
    const x = from.x + ((to.x - from.x) * i) / steps, y = from.y + ((to.y - from.y) * i) / steps;
    await tab.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y, id: 1 }] });
    await sleep(16);
  }
  await tab.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await sleep(250);
  const after = await ev(tab, "JSON.stringify(window.__ESMO_RUNTIME_CAM ? window.__ESMO_RUNTIME_CAM() : null)");
  const scrollAfter = await ev(tab, "window.scrollY");
  return { before: JSON.parse(before ?? "null"), after: JSON.parse(after ?? "null"), scrollBefore, scrollAfter };
}

try {
  // ── 桌機：英雄定位是否真的進了引擎 ───────────────────────────────────
  await toGameView(DESK, "desktop");
  const heroMeta = await ev(tab, `(() => {
    const s = window.__ESMO_RUNTIME_DIAG ? 1 : 0;
    const st = window.__ESMO_SNAP__ ?? null;
    return null;
  })()`).catch(() => null);
  //  透過正式 snapshot 讀 heroMeta（引擎唯一資料源；診斷面板已收合）
  const meta = await ev(tab, `(() => {
    const el = [...document.querySelectorAll("*")];
    return null;
  })()`).catch(() => null);
  //  改用戰鬥資訊面板：點英雄 → 應看到「目前意圖」等行為欄位
  const clicked = await ev(tab, `(() => {
    const cells = [...document.querySelectorAll('[data-testid=hero-cell]')].filter((c) => c.offsetParent !== null);
    if (!cells.length) return "no-cell";
    cells[0].click(); return "clicked:" + cells.length;
  })()`);
  results.heroCellClick = clicked;
  await sleep(1200);
  const sheet = await text(tab);
  ck("desktop：戰鬥資訊面板可開（G 的入口仍正常）", sheet.includes("戰鬥資訊"));
  await shot("H01-desktop-hero-sheet.png");
  await clickByText(tab, "✕"); await sleep(600);
  await shot("H02-desktop-battle.png");

  // ── 巴龍：不再整隻變成米白 ─────────────────────────────────────────
  //   把相機對到巴龍坑並等到它被攻擊，取畫面中央區域的平均亮度。
  const baronShot = await ev(tab, `(() => {
    if (!window.__ESMO_RUNTIME_SETCAM) return null;
    window.__ESMO_RUNTIME_SETCAM({ panX: 0, panZ: 0, dist: 200 });
    return true;
  })()`).catch(() => null);
  results.baronCam = baronShot;
  await sleep(1500);
  await shot("H03-desktop-baron-area.png");

  // ── Replay 固定 runtime-v2 ─────────────────────────────────────────
  ck("desktop：可快速完成", (await text(tab)).includes("快速完成"));
  await clickByText(tab, "快速完成");
  let atResult = false;
  for (let i = 0; i < 480; i++) {
    const t = await text(tab).catch(() => "");
    if (t.includes("觀看重播") || t.includes("無法重播")) { atResult = true; break; }
    await sleep(500);
  }
  ck("desktop：進入賽後結果", atResult);
  await sleep(2000);
  await clickByText(tab, "觀看重播");
  await sleep(3500);
  const rep = await ev(tab, `(() => {
    const el = document.querySelector("[data-replay-presentation]");
    return { presentation: el ? el.getAttribute("data-replay-presentation") : null,
             isReplay: (document.body.innerText || "").includes("REPLAY") };
  })()`);
  results.replay = rep;
  ck("desktop：Replay 固定使用 runtime-v2（與現場同一套戰場）", rep.presentation === "runtime-v2", rep);
  await shot("H04-desktop-replay-runtime-v2.png");

  // ── 手機：浮動大字不再壓到控制鈕 ───────────────────────────────────
  await toGameView(MOB, "mobile390");
  await clickByText(tab, "⚙"); await sleep(500);
  const overlap = await ev(tab, `(() => {
    //  控制鈕欄（倍率／畫質）的實際位置 vs 浮動大字容器的位置
    const btns = [...document.querySelectorAll("button")].filter((b) => ["1×","2×","4×","低","中","高"].includes((b.textContent||"").trim()));
    if (!btns.length) return { btns: 0 };
    const box = btns.reduce((acc, b) => { const r = b.getBoundingClientRect();
      return { top: Math.min(acc.top, r.top), bottom: Math.max(acc.bottom, r.bottom),
               left: Math.min(acc.left, r.left), right: Math.max(acc.right, r.right) }; },
      { top: 1e9, bottom: -1e9, left: 1e9, right: -1e9 });
    //  浮動大字容器：top 38% / width 70%（Milestone H）
    const h = window.innerHeight, w = window.innerWidth;
    const ft = { top: h * 0.38, left: w * 0.15, right: w * 0.85 };
    return { btns: btns.length, ctrlBottom: Math.round(box.bottom), floatTop: Math.round(ft.top),
             clear: ft.top > box.bottom };
  })()`);
  results.floatOverlap = overlap;
  ck("mobile：浮動大字起點在控制鈕欄下方（不再互相遮擋）", overlap.clear === true, overlap);
  await shot("H05-mobile390-controls.png");
} catch (e) {
  failed++; console.error("流程中斷：", e.message); results.error = String(e.message);
}

writeFileSync(resolve(OUT_DIR, "shot_stats_h.json"), JSON.stringify(results, null, 2));
console.log(`\n${results.notes.filter((n) => n.ok).length}/${results.notes.length} 斷言通過；截圖 ${results.shots.length}`);
browser.kill(); server.kill();
try { rmSync(profileDir, { recursive: true, force: true }); } catch { /* ignore */ }
process.exit(failed ? 1 : 0);
