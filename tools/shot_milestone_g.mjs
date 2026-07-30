#!/usr/bin/env node
// ============================================================================
//  tools/shot_milestone_g.mjs — Milestone G 驗收（隊伍面板 + 手機地圖操作）
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
const OUT_DIR = resolve(ROOT, arg("--out", "review/moba-runtime/milestone-g/evidence"));
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
const baseUrl = "http://localhost:4178";
const server = spawn(process.platform === "win32" ? "npm.cmd" : "npm",
  ["run", "preview", "--", "--port", "4178", "--strictPort"], { cwd: ROOT, stdio: "ignore", shell: process.platform === "win32" });
for (let i = 0; i < 120; i++) { try { const r = await fetch(baseUrl, { redirect: "manual" }); if (r.status < 500) break; } catch { /* wait */ } await sleep(500); }
const profileDir = resolve(ROOT, "node_modules/.cache", `esmo-g-${process.pid}`);
const port = 9500 + (process.pid % 150);
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
  // ── 桌機：隊伍面板 + 戰鬥資訊面板 ───────────────────────────────────────
  await toGameView(DESK, "desktop");
  const panelText = await text(tab);
  ck("desktop：隊伍面板顯示血條百分比", /\d+%/.test(panelText));
  await shot("G01-desktop-team-panel.png");
  //  點第一個藍方選手 → 應開「戰鬥資訊」面板
  const clicked = await ev(tab, `(() => {
    //  隊伍面板的英雄格帶 data-testid="hero-cell"（BattleHeroStrip 的穩定錨點）。
    //  先前靠 cursor:pointer + 文字猜 DOM，實測會點到戰報 timeline。
    const cells = [...document.querySelectorAll('[data-testid=hero-cell]')].filter((c) => c.offsetParent !== null);
    if (!cells.length) return "no-cell";
    cells[0].click();
    return "clicked:" + cells.length + ":" + (cells[0].textContent || "").slice(0, 20);
  })()`);
  results.heroCellClick = clicked;
  await sleep(1200);
  const sheet = await text(tab);
  ck("desktop：點英雄開的是「戰鬥資訊」（不是生涯面板）", sheet.includes("戰鬥資訊") && sheet.includes("召喚師技能（即時冷卻）"));
  ck("desktop：戰鬥資訊含本場數據與生涯入口",
    sheet.includes("本場數據") && sheet.includes("英雄生涯"));
  await shot("G02-desktop-hero-sheet.png");
  await clickByText(tab, "英雄生涯");
  await sleep(1000);
  ck("desktop：生涯資訊移到獨立入口（開得到 MASTERY）", (await text(tab)).includes("MASTERY"));
  await shot("G03-desktop-career.png");
  await clickByText(tab, "✕"); await sleep(600);

  // ── 手機：手勢與縮放 ───────────────────────────────────────────────────
  await toGameView(MOB, "mobile390");
  const guards = await ev(tab, `(() => {
    const c = document.querySelector("canvas");
    return {
      canvasTouchAction: c ? getComputedStyle(c).touchAction : null,
      canvasOverscroll: c ? getComputedStyle(c).overscrollBehavior : null,
      htmlOverscrollY: getComputedStyle(document.documentElement).overscrollBehaviorY,
      bodyOverscrollY: getComputedStyle(document.body).overscrollBehaviorY,
    };
  })()`);
  results.guards = guards;
  ck("mobile：canvas 宣告 touch-action:none（瀏覽器不再攔截拖曳）", guards.canvasTouchAction === "none", guards);
  ck("mobile：戰鬥期間關閉頁面下拉重新整理（overscroll-behavior-y:none）",
    guards.htmlOverscrollY === "none" && guards.bodyOverscrollY === "none", guards);

  //  單指拖曳：pan 要真的改變，且頁面不能捲動
  const drag = await touchDrag({ x: 195, y: 300 }, { x: 195, y: 520 });
  results.drag = drag;
  const moved = drag.before && drag.after
    && (Math.abs(drag.after.pan.x - drag.before.pan.x) + Math.abs(drag.after.pan.z - drag.before.pan.z)) > 1;
  ck("mobile：單指往下拖曳有平移地圖", moved, { before: drag.before?.pan, after: drag.after?.pan });
  ck("mobile：拖曳沒有讓頁面捲動（不會觸發下拉重新整理）", drag.scrollAfter === drag.scrollBefore, drag);

  //  縮放範圍：要能拉到「整張地圖看得到」
  const zoomOut = await ev(tab, `(() => {
    const cam = window.__ESMO_RUNTIME_SETCAM;
    if (!cam) return null;
    cam({ dist: 9999 });                       // 要求拉到最遠（會被 clamp）
    const s = window.__ESMO_RUNTIME_CAM();
    return { dist: s.dist, zoom: s.zoom };
  })()`);
  results.zoomOut = zoomOut;
  ck("mobile：可以縮到足以綜觀全圖的距離（≥520）", (zoomOut?.dist ?? 0) >= 520, zoomOut);
  await sleep(600);
  await shot("G04-mobile390-zoom-out.png");
  //  近距離視角仍保留
  const zoomIn = await ev(tab, `(() => {
    window.__ESMO_RUNTIME_SETCAM({ dist: 1 });
    const s = window.__ESMO_RUNTIME_CAM(); return { dist: s.dist, zoom: s.zoom };
  })()`);
  results.zoomIn = zoomIn;
  ck("mobile：近距離視角仍在（≤120）", (zoomIn?.dist ?? 999) <= 120, zoomIn);
  await ev(tab, "window.__ESMO_RUNTIME_SETCAM({ dist: 260 })");
  await sleep(400);
  //  手機隊伍面板：血條與狀態
  await clickByText(tab, "隊伍面板"); await sleep(900);
  const mText = await text(tab);
  ck("mobile：隊伍面板顯示血條百分比", /\d+%/.test(mText));
  await shot("G05-mobile390-team-panel.png");
  const hud = await ev(tab, `(() => ({
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    innerWidth: window.innerWidth,
  }))()`);
  results.hud = hud;
  ck("mobile：無水平溢出", hud.horizontalOverflow === false, hud);
} catch (e) {
  failed++; console.error("流程中斷：", e.message); results.error = String(e.message);
}

writeFileSync(resolve(OUT_DIR, "shot_stats_g.json"), JSON.stringify(results, null, 2));
console.log(`\n${results.notes.filter((n) => n.ok).length}/${results.notes.length} 斷言通過；截圖 ${results.shots.length}`);
browser.kill(); server.kill();
try { rmSync(profileDir, { recursive: true, force: true }); } catch { /* ignore */ }
process.exit(failed ? 1 : 0);
