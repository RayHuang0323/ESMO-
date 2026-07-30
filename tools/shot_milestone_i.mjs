#!/usr/bin/env node
// ============================================================================
//  tools/shot_milestone_i.mjs — Milestone I-close 正式流程驗收
//
//  走完整條路：Dashboard → Lineup → Ban/Pick → Loading → GameView → Result → Replay
//  桌機（1600×1000）與手機（390×844）各一次。
//
//  這支腳本要證的**不是**「畫面沒炸」，而是同一場比賽的
//    五路 × 選手 × 英雄 × 兩個召喚師技能
//  在五個畫面裡是**同一份資料**。所以每一站都把它抓下來，最後逐席比對。
//
//  抓法一律用 `data-testid` 的 data-* 屬性（Ban/Pick、Loading、面板、記分板、
//  Replay 都掛了），不靠讀畫面文字猜——文字會因排版換行而抓錯。
// ============================================================================
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "..");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const OUT_DIR = resolve(ROOT, arg("--out", "review/moba-runtime/milestone-i-close/evidence"));
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
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
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
/** 讀一組 data-testid 節點的 data-* → 陣列（沒有就回 []）。 */
const readRows = (c, sel, keys) => ev(c, `[...document.querySelectorAll(${JSON.stringify(sel)})].map((el) => ({
  ${keys.map((k) => `${JSON.stringify(k)}: el.getAttribute("data-${k}")`).join(",")}
}))`);

const results = { notes: [], shots: [], data: {} };
let failed = 0;
const ck = (label, cond, extra = null) => {
  results.notes.push({ label, ok: !!cond, extra });
  console.log(`${cond ? "✅" : "❌"} ${label}${!cond && extra != null ? `　→ ${JSON.stringify(extra)}` : ""}`);
  if (!cond) failed++;
  return !!cond;
};

if (!CHROME) { console.error("找不到 Chrome"); process.exit(2); }
const baseUrl = "http://localhost:4181";
const server = spawn(process.platform === "win32" ? "npm.cmd" : "npm",
  ["run", "preview", "--", "--port", "4181", "--strictPort"], { cwd: ROOT, stdio: "ignore", shell: process.platform === "win32" });
for (let i = 0; i < 120; i++) { try { const r = await fetch(baseUrl, { redirect: "manual" }); if (r.status < 500) break; } catch { /* wait */ } await sleep(500); }
const profileDir = resolve(ROOT, "node_modules/.cache", `esmo-i-${process.pid}`);
const port = 9500 + (process.pid % 140);
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

/** 一輪完整流程；回傳每一站抓到的配置，供最後逐席比對。 */
async function runFlow(size, tag) {
  const cap = {};
  await tab.send("Emulation.setDeviceMetricsOverride", { width: size.w, height: size.h, deviceScaleFactor: 1, mobile: size.w < 600 });
  if (size.w < 600) await tab.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await tab.send("Page.navigate", { url: `${baseUrl}/?debug=1` });
  await sleep(3000);

  // ── 1. Lineup（賽前配置）────────────────────────────────────────────────
  ck(`${tag} 1) 進入賽前配置`, await clickUntil(tab, "MOBA", "先發五人", 20));
  const sources = await readRows(tab, '[data-testid="hero-source"]', ["seat", "source"]);
  cap.sources = sources;
  ck(`${tag} 2) 五個席位都標示英雄來源`, sources.length === 5, sources);
  ck(`${tag} 3) 來源值都是五種之一（沒有空徽章）`,
    sources.every((s) => ["unpicked", "locked", "mastery", "recent", "suggested"].includes(s.source)), sources);
  ck(`${tag} 4) 明講「不是固定綁定」且指向 Ban/Pick`,
    (await text(tab)).includes("不是固定綁定") && (await text(tab)).includes("Ban/Pick"));
  await shot(`${tag}-01-lineup.png`);

  // ── 2. Ban/Pick ────────────────────────────────────────────────────────
  await clickUntil(tab, "確認陣容", "進入 Ban/Pick", 20);
  ck(`${tag} 5) 進入 Ban/Pick`, await clickUntil(tab, "進入 Ban/Pick", "選角動態", 25));
  for (let i = 0; i < 60; i++) {
    if ((await text(tab)).includes("選角完成")) break;
    await ev(tab, `(() => {
      const g = [...document.querySelectorAll("div")].find((d) => (d.style.gridTemplateColumns || "").includes("repeat(5") && d.offsetParent !== null);
      if (!g || !g.children.length) return false;
      const b = g.children[0].querySelectorAll("button"); if (b.length < 2) return false; b[1].click(); return true;
    })()`);
    await sleep(700);
  }
  const plan = await readRows(tab, '[data-testid="draft-plan-row"]', ["seat", "lane", "hero", "spells"]);
  cap.plan = plan;
  ck(`${tag} 6) Ban/Pick 顯示五路出戰配置`, plan.length === 5, plan);
  ck(`${tag} 7) 五路唯一、五隻英雄不重複`,
    new Set(plan.map((r) => r.lane)).size === 5 && new Set(plan.map((r) => r.hero)).size === 5, plan);
  ck(`${tag} 8) 每一路都恰好 2 個召喚師技能`,
    plan.every((r) => (r.spells || "").split(",").filter(Boolean).length === 2), plan.map((r) => r.spells));
  ck(`${tag} 9) 打野帶懲戒，且只有打野`,
    plan.filter((r) => (r.spells || "").includes("smite")).length === 1
    && plan.find((r) => r.lane === "打野")?.spells.includes("smite"), plan.map((r) => [r.lane, r.spells]));
  await shot(`${tag}-02-banpick.png`);

  // ── 3. Loading ─────────────────────────────────────────────────────────
  ck(`${tag} 10) 進入 Loading`, await clickUntil(tab, "開始載入", "VS", 20));
  const loading = await readRows(tab, '[data-testid="loading-spells"]', ["lane", "spells"]);
  cap.loading = loading;
  ck(`${tag} 11) Loading 十人都顯示召喚師技能`,
    loading.length === 10 && loading.every((r) => (r.spells || "").split(",").filter(Boolean).length === 2),
    loading.map((r) => r.spells));
  await shot(`${tag}-03-loading.png`);

  // ── 4. GameView ────────────────────────────────────────────────────────
  for (let i = 0; i < 120; i++) { await sleep(500); if (await ev(tab, "!!document.querySelector('canvas')").catch(() => false)) break; }
  ck(`${tag} 12) 正式 GameView 掛載`, await ev(tab, "!!document.querySelector('canvas')"));
  await clickByText(tab, "4×");
  await sleep(6000);
  //  點藍方第一個英雄格 → 戰鬥資訊面板。
  //  ⚠ 手機版十人面板預設收合、只渲染目前這一路 ⇒ 不能假設索引 0 就是 b1，
  //    要記下**實際點到的席位**，最後拿那個席位的配置來比。
  cap.clickedSeat = await ev(tab, `(() => {
    const c = [...document.querySelectorAll('[data-testid="hero-cell"][data-side="blue"]')];
    if (!c.length) return null; c[0].click(); return c[0].getAttribute("data-seat");
  })()`);
  await sleep(900);
  const sheet = await readRows(tab, '[data-testid="sheet-spells"]', ["spells"]);
  cap.sheet = sheet[0]?.spells ?? null;
  ck(`${tag} 13) 戰鬥中面板顯示 2 個召喚師技能（不再有「未配置」）`,
    (cap.sheet || "").split(",").filter(Boolean).length === 2
    && !(await text(tab)).includes("未配置"), cap.sheet);
  await shot(`${tag}-04-battle-sheet.png`);
  await ev(tab, `(() => { const b = [...document.querySelectorAll("button")].find((x) => (x.getAttribute("aria-label") || "") === "關閉"); if (b) { b.click(); return true; } return false; })()`);
  await sleep(500);

  // ── 5. Result ──────────────────────────────────────────────────────────
  await clickByText(tab, "快速完成");
  for (let i = 0; i < 180; i++) { await sleep(1000); if ((await text(tab)).includes("觀看重播") || (await text(tab)).includes("查看賽後")) break; }
  const board = await readRows(tab, '[data-testid="board-spells"]', ["spells"]);
  cap.board = board;
  ck(`${tag} 14) 賽後記分板顯示召喚師技能`,
    board.length === 10 && board.every((r) => (r.spells || "").split(",").filter(Boolean).length === 2),
    board.map((r) => r.spells));
  await shot(`${tag}-05-result.png`);

  // ── 6. Replay ──────────────────────────────────────────────────────────
  const replayable = await clickUntil(tab, "觀看重播", "REPLAY", 20);
  ck(`${tag} 15) 可以進入重播`, replayable);
  if (replayable) {
    await sleep(1500);
    if (!(await ev(tab, `!!document.querySelector('[data-testid="replay-lineup"]')`))) {
      await clickByText(tab, "陣容"); await sleep(800);
    }
    const rep = await readRows(tab, '[data-testid="replay-lineup-row"]', ["seat", "hero", "spells"]);
    cap.replay = rep;
    ck(`${tag} 16) 重播帶著本場出戰配置（十席）`,
      rep.length === 10 && rep.every((r) => (r.spells || "").split(",").filter(Boolean).length === 2),
      rep.map((r) => [r.seat, r.spells]));
    await shot(`${tag}-06-replay.png`);
  }

  // ── 7. 跨畫面逐席比對（本腳本真正的目的）─────────────────────────────
  const planBySeat = Object.fromEntries((cap.plan ?? []).map((r) => [r.seat, r.spells]));
  const repBySeat = Object.fromEntries((cap.replay ?? []).map((r) => [r.seat, r.spells]));
  const blueSeats = Object.keys(planBySeat);
  ck(`${tag} 17) Ban/Pick 與 Replay 的技能逐席相同`,
    cap.replay ? blueSeats.every((s) => planBySeat[s] === repBySeat[s]) : false,
    blueSeats.map((s) => [s, planBySeat[s], repBySeat[s]]));
  ck(`${tag} 18) Ban/Pick 與 Replay 的英雄逐席相同`,
    cap.replay
      ? blueSeats.every((s) => (cap.plan.find((r) => r.seat === s)?.hero) === (cap.replay.find((r) => r.seat === s)?.hero))
      : false);
  {
    //  Loading 的藍方五列（DOM 順序＝b1–b5）要對得上 Ban/Pick
    const blueLoading = (cap.loading ?? []).slice(0, 5).map((r) => r.spells);
    const planSpells = (cap.plan ?? []).map((r) => r.spells);
    ck(`${tag} 19) Loading 與 Ban/Pick 的技能逐席相同`,
      blueLoading.length === 5 && blueLoading.every((s, i) => s === planSpells[i]),
      [blueLoading, planSpells]);
  }
  ck(`${tag} 20) 戰鬥中面板的技能＝Ban/Pick 給「實際點到的那個席位」的那一組`,
    !!cap.clickedSeat && cap.sheet === planBySeat[cap.clickedSeat],
    [cap.clickedSeat, cap.sheet, planBySeat[cap.clickedSeat]]);
  results.data[tag] = cap;
  return cap;
}

try {
  await runFlow(DESK, "desktop");
  await runFlow(MOB, "mobile");
  //  兩個尺寸各自是獨立的一場比賽（seed 不同），所以只比對「結構」不比對英雄：
  //  兩邊都必須是 5 路唯一、每人 2 技能、打野帶懲戒。
  const d = results.data.desktop, m = results.data.mobile;
  ck("跨尺寸 21) 手機版同樣走完整條流程並取得配置",
    !!m?.plan?.length && !!m?.replay?.length);
  ck("跨尺寸 22) 兩個尺寸的配置規則一致（都是 5 路 × 2 技能 × 打野懲戒）",
    [d, m].every((c) => c?.plan?.length === 5
      && c.plan.every((r) => (r.spells || "").split(",").length === 2)
      && c.plan.find((r) => r.lane === "打野")?.spells.includes("smite")));
} catch (e) {
  ck(`流程中斷：${e.message}`, false);
} finally {
  writeFileSync(resolve(OUT_DIR, "milestone_i_close_browser.json"), JSON.stringify(results, null, 2), "utf8");
  console.log(`\n${failed === 0 ? "✅ PASS" : `❌ FAIL（${failed} 項）`}　證據：${OUT_DIR}`);
  try { await tab.send("Browser.close", {}, 5000); } catch { /* ignore */ }
  browser.kill(); server.kill();
  process.exit(failed === 0 ? 0 : 1);
}
