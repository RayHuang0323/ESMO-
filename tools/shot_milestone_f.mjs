#!/usr/bin/env node
// ============================================================================
//  tools/shot_milestone_f.mjs — Milestone F 的正式 GameView 觀察
//
//  F 改的是戰鬥節奏與團戰收益轉化，Node 已經有統計證據；本工具要回答的是
//  **Node 證不了的那一半**：畫面上團戰是不是自然形成、有沒有過度群聚、
//  有沒有卡位或抖動、FPS 掉不掉、HUD 會不會被擠爆。
//
//  作法：走正式流程進 GameView，用 4× 看完一整場，每秒取樣一次
//    · FPS（頁面內 rAF 計數）
//    · 十名英雄的世界座標（`?diag=1` 的 __ESMO_RUNTIME_DIAG）
//      → 群聚度（任一人 12 單位內的人數上限）、平均兩兩距離
//    · 抖動／卡位：逐英雄的位移方向反轉次數、以及「幾乎沒動但不在泉水」的比例
//  團戰成形（群聚 ≥6）時自動截圖，另外固定時點各留一張。
//
//  用法：
//    node tools/shot_milestone_f.mjs
//    node tools/shot_milestone_f.mjs --mobile-only
// ============================================================================
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "..");
const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const OUT_DIR = resolve(ROOT, arg("--out", "review/moba-runtime/milestone-f/evidence"));
const MOBILE_ONLY = process.argv.includes("--mobile-only");
const DESK = { w: 1600, h: 1000 };
const MOB = { w: 390, h: 844 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
].find((p) => existsSync(p));

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); }
  static async connect(u) {
    const ws = new WebSocket(u);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const c = new CDP(ws);
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && c.pending.has(m.id)) {
        const { res, rej } = c.pending.get(m.id); c.pending.delete(m.id);
        m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
      }
    };
    return c;
  }
  send(method, params = {}, timeoutMs = 30000) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      const timer = setTimeout(() => { this.pending.delete(id); rej(new Error(`CDP ${method} 逾時`)); }, timeoutMs);
      this.pending.set(id, {
        res: (v) => { clearTimeout(timer); res(v); },
        rej: (e) => { clearTimeout(timer); rej(e); },
      });
      try { this.ws.send(JSON.stringify({ id, method, params })); }
      catch (e) { clearTimeout(timer); this.pending.delete(id); rej(e); }
    });
  }
}
const ev = async (cdp, expr) => {
  const r = await cdp.send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text ?? "evaluate failed");
  return r.result?.value;
};
const text = (cdp) => ev(cdp, "document.body.innerText || ''");
const clickByText = (cdp, needle) => ev(cdp, `(() => {
  const n = ${JSON.stringify(needle)};
  const hits = [...document.querySelectorAll("button,[role=button],div,span,a")]
    .filter((el) => (el.textContent || "").includes(n) && el.offsetParent !== null);
  if (!hits.length) return false;
  const el = hits.find((a) => !hits.some((b) => b !== a && a.contains(b))) ?? hits[hits.length - 1];
  el.click(); return true;
})()`);
const clickExact = (cdp, re) => ev(cdp, `(() => {
  const re = new RegExp(${JSON.stringify(re)});
  const hits = [...document.querySelectorAll("button,[role=button],div,a")]
    .filter((el) => el.offsetParent !== null && re.test((el.textContent || "").trim()));
  if (!hits.length) return false;
  const el = hits.find((a) => !hits.some((b) => b !== a && a.contains(b))) ?? hits[0];
  el.click(); return true;
})()`);
async function clickUntil(cdp, needle, expect, seconds = 25) {
  for (let i = 0; i < seconds; i++) {
    if ((await text(cdp).catch(() => "")).includes(expect)) return true;
    await clickByText(cdp, needle);
    await sleep(1000);
  }
  return (await text(cdp).catch(() => "")).includes(expect);
}

const results = { samples: [], shots: [], notes: [] };
let failed = 0;
const ck = (label, cond, extra = null) => {
  results.notes.push({ label, ok: !!cond, extra });
  console.log(`${cond ? "✅" : "❌"} ${label}${extra != null && !cond ? `　→ ${JSON.stringify(extra)}` : ""}`);
  if (!cond) failed++;
  return !!cond;
};

if (!CHROME) { console.error("找不到 Chrome"); process.exit(2); }
const baseUrl = "http://localhost:4177";
const server = spawn(process.platform === "win32" ? "npm.cmd" : "npm",
  ["run", "preview", "--", "--port", "4177", "--strictPort"],
  { cwd: ROOT, stdio: "ignore", shell: process.platform === "win32" });
for (let i = 0; i < 120; i++) {
  try { const r = await fetch(baseUrl, { redirect: "manual" }); if (r.status < 500) break; } catch { /* wait */ }
  await sleep(500);
}
const profileDir = resolve(ROOT, "node_modules/.cache", `esmo-f-${process.pid}`);
const port = 9700 + (process.pid % 150);
const browser = spawn(CHROME, [
  `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`,
  "--no-first-run", "--no-default-browser-check", "--disable-extensions",
  "--hide-scrollbars", "--force-device-scale-factor=1",
  `--window-size=${DESK.w},${DESK.h}`, "--window-position=0,0", "about:blank",
], { stdio: "ignore" });
let wsUrl = null;
for (let i = 0; i < 80 && !wsUrl; i++) {
  await sleep(250);
  try { wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl; } catch { /* wait */ }
}
if (!wsUrl) { console.error("Chrome CDP 沒開起來"); browser.kill(); server.kill(); process.exit(4); }
mkdirSync(OUT_DIR, { recursive: true });
const root = await CDP.connect(wsUrl);
const { targetId } = await root.send("Target.createTarget", { url: "about:blank" });
const tab = await CDP.connect(`ws://127.0.0.1:${port}/devtools/page/${targetId}`);
await tab.send("Page.enable"); await tab.send("Runtime.enable");

async function shot(name) {
  try { await tab.send("Page.bringToFront", {}, 10000); } catch { /* non-fatal */ }
  for (const params of [{ format: "png" }, { format: "png", fromSurface: false }]) {
    try {
      const { data } = await tab.send("Page.captureScreenshot", params, 45000);
      writeFileSync(resolve(OUT_DIR, name), Buffer.from(data, "base64"));
      results.shots.push(name); console.log(`  📸 ${name}`);
      return true;
    } catch { /* try fallback */ }
  }
  console.log(`  ⚠ ${name} 截圖失敗`);
  return false;
}

/** 走正式流程直到 GameView 掛載。diag=false ⇒ 乾淨畫面（診斷面板會蓋住手機視窗）。 */
async function toGameView(size, tag, diag = true) {
  await tab.send("Emulation.setDeviceMetricsOverride",
    { width: size.w, height: size.h, deviceScaleFactor: 1, mobile: size.w < 600 });
  await tab.send("Page.navigate", { url: `${baseUrl}/?debug=1${diag ? "&diag=1" : ""}` });
  await sleep(3000);
  ck(`${tag}：進入賽前配置`, await clickUntil(tab, "MOBA", "先發五人", 20));
  await clickUntil(tab, "確認陣容", "進入 Ban/Pick", 20);
  ck(`${tag}：進入 Ban/Pick`, await clickUntil(tab, "進入 Ban/Pick", "選角動態", 25));
  for (let i = 0; i < 60; i++) {
    if ((await text(tab)).includes("選角完成")) break;
    await ev(tab, `(() => {
      const grid = [...document.querySelectorAll("div")].find((d) =>
        (d.style.gridTemplateColumns || "").includes("repeat(5") && d.offsetParent !== null);
      if (!grid || !grid.children.length) return false;
      const b = grid.children[0].querySelectorAll("button");
      if (b.length < 2) return false; b[1].click(); return true;
    })()`);
    await sleep(700);
  }
  ck(`${tag}：進入 Loading`, await clickUntil(tab, "開始載入", "VS", 20));
  for (let i = 0; i < 120; i++) {
    await sleep(500);
    if (await ev(tab, "!!document.querySelector('canvas')").catch(() => false)) break;
  }
  ck(`${tag}：正式 GameView 掛載`, await ev(tab, "!!document.querySelector('canvas')"));
  // 頁面內 FPS 計數器
  await ev(tab, `(() => {
    window.__F_FPS = { frames: 0 };
    const loop = () => { window.__F_FPS.frames++; requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    return true;
  })()`);
}

/**
 * 每秒取樣一次。
 * 群聚度／抖動都用 `heroRenderDiagnostics` 的 **simPosition**（模擬座標，
 * 與引擎同一把尺），行為則直接讀 `actionState` —— 這樣「團戰後有沒有轉向推塔／
 * 龍／追擊／回城」在畫面上是可量的，不是我看圖說故事。
 */
async function observe(tag, maxSeconds) {
  let lastFrames = 0;
  const prev = new Map();          // id → { pos, dir }
  const stuck = new Map();         // id → 連續幾乎沒動的秒數
  let fightShots = 0;
  for (let s = 0; s < maxSeconds; s++) {
    await sleep(1000);
    const snap = await ev(tab, `(() => {
      const d = window.__ESMO_RUNTIME_DIAG ? window.__ESMO_RUNTIME_DIAG() : null;
      const clock = (document.body.innerText || "").match(/(\\d+):(\\d\\d)/);
      const frames = window.__F_FPS ? window.__F_FPS.frames : 0;
      if (!d) return { frames, none: true };
      const hs = (d.heroRenderDiagnostics || []).map((h) => ({
        id: h.id, team: h.team, alive: h.alive, state: h.actionState,
        pos: h.simPosition, onScreen: h.onScreen, visible: h.visible,
      }));
      return {
        frames, ts: d.ts, over: !!d.over, clock: clock ? clock[0] : null,
        heroCount: d.heroCount, warnings: (d.warnings || []).length,
        towerAlive: d.towerAliveCount, towerDead: d.towerDestroyedCount,
        heroes: hs,
      };
    })()`).catch(() => null);
    if (!snap) continue;
    const fps = Math.max(0, snap.frames - lastFrames);
    lastFrames = snap.frames;
    if (snap.none) { results.samples.push({ s, fps, none: true }); continue; }

    const alive = (snap.heroes ?? []).filter((h) => h.alive && h.pos);
    // 群聚度：任一人 12 模擬單位內的人數上限（含自己）
    let cluster = 0;
    for (const a of alive) {
      const n = alive.filter((b) => Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y) <= 12).length;
      if (n > cluster) cluster = n;
    }
    // 抖動：本秒位移方向與上一秒反向（夾角 >135°）且兩次都有實際移動
    let reversals = 0, stuckNow = 0;
    for (const h of alive) {
      const p = prev.get(h.id);
      if (p) {
        const d1 = { x: h.pos.x - p.pos.x, y: h.pos.y - p.pos.y };
        const m1 = Math.hypot(d1.x, d1.y);
        if (p.dir && m1 > 0.4) {
          const m0 = Math.hypot(p.dir.x, p.dir.y);
          if (m0 > 0.4) {
            const cos = (d1.x * p.dir.x + d1.y * p.dir.y) / (m1 * m0);
            if (cos < -0.7) reversals++;
          }
        }
        // 卡位：幾乎沒動，且不是交戰／回城／死亡這類「本來就該站著」的狀態
        const standing = ["接戰", "拉扯", "團戰!", "回城", "回城中", "圍攻", "攻門牙塔", "圍攻主堡", "打野"];
        if (m1 < 0.15 && !standing.includes(h.state)) {
          stuck.set(h.id, (stuck.get(h.id) ?? 0) + 1);
          if ((stuck.get(h.id) ?? 0) >= 4) stuckNow++;
        } else stuck.set(h.id, 0);
        prev.set(h.id, { pos: { ...h.pos }, dir: d1 });
      } else prev.set(h.id, { pos: { ...h.pos }, dir: null });
    }
    const states = {};
    for (const h of alive) states[h.state ?? "?"] = (states[h.state ?? "?"] ?? 0) + 1;

    results.samples.push({
      s, fps, ts: snap.ts, clock: snap.clock, alive: alive.length,
      cluster, reversals, stuck: stuckNow, states,
      towerDead: snap.towerDead, warnings: snap.warnings,
      offScreen: alive.filter((h) => h.onScreen === false).length,
    });

    // 團戰成形時留一張圖（最多三張，避免洗版）
    if (cluster >= 6 && fightShots < 3) {
      fightShots++;
      await shot(`F0${fightShots + 2}-${tag}-teamfight-${snap.clock ?? s}.png`.replace(":", "m"));
    }
    if (snap.over) return "over";
  }
  return "timeout";
}

/** 取樣結果 → 可判讀的統計。 */
function summarise(samples, tag) {
  const ok = samples.filter((x) => !x.none && Number.isFinite(x.fps));
  const fps = ok.map((x) => x.fps).filter((v) => v > 0).sort((a, b) => a - b);
  const pct = (p) => (fps.length ? fps[Math.min(fps.length - 1, Math.floor(fps.length * p))] : 0);
  const stateTotals = {};
  for (const x of ok) for (const [k, v] of Object.entries(x.states ?? {})) stateTotals[k] = (stateTotals[k] ?? 0) + v;
  const totalHeroTicks = Object.values(stateTotals).reduce((s, v) => s + v, 0) || 1;
  const share = Object.fromEntries(Object.entries(stateTotals)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => [k, +(v / totalHeroTicks).toFixed(3)]));
  return {
    tag,
    samples: ok.length,
    fps: { min: fps[0] ?? 0, p10: pct(0.1), median: pct(0.5), max: fps[fps.length - 1] ?? 0 },
    clusterMax: Math.max(...ok.map((x) => x.cluster ?? 0), 0),
    clusterMean: +(ok.reduce((s, x) => s + (x.cluster ?? 0), 0) / (ok.length || 1)).toFixed(2),
    secondsWithBigCluster: ok.filter((x) => (x.cluster ?? 0) >= 6).length,
    reversalsTotal: ok.reduce((s, x) => s + (x.reversals ?? 0), 0),
    stuckSeconds: ok.filter((x) => (x.stuck ?? 0) > 0).length,
    offScreenMax: Math.max(...ok.map((x) => x.offScreen ?? 0), 0),
    warningsMax: Math.max(...ok.map((x) => x.warnings ?? 0), 0),
    stateShare: share,
    lastClock: ok[ok.length - 1]?.clock ?? null,
    towerDeadEnd: ok[ok.length - 1]?.towerDead ?? null,
  };
}

/**
 * 乾淨畫面模式：不開 `?diag=1`（診斷面板在 390×844 會蓋掉整個視窗），
 * 只在指定的比賽時鐘取樣截圖，供人眼判斷擁擠度與 HUD。
 */
async function cleanCapture(size, tag, clocks) {
  await toGameView(size, tag, false);
  if (size.w < 600) { await clickByText(tab, "⚙"); await sleep(400); }
  await clickByText(tab, "4×");
  await sleep(500);
  const want = [...clocks];
  for (let i = 0; i < 420 && want.length; i++) {
    await sleep(1000);
    const clock = await ev(tab, `(() => {
      const m = (document.body.innerText || "").match(/(\\d+):(\\d\\d)/); return m ? m[0] : null;
    })()`).catch(() => null);
    if (!clock) continue;
    const mins = Number(clock.split(":")[0]);
    if (mins >= want[0]) {
      const at = want.shift();
      await shot(`FC-${tag}-${at}min.png`);
      if (size.w < 600 && at === clocks[0]) {   // 手機：順便看展開隊伍面板的擁擠度
        await clickByText(tab, "隊伍面板"); await sleep(900);
        await shot(`FC-${tag}-${at}min-panel.png`);
        await clickByText(tab, "隊伍面板"); await sleep(600);
      }
    }
  }
}

/** 卡位判定的實際狀態分布（前一輪量到 102/313 秒有人「幾乎沒動」，要知道那是什麼狀態）。 */
async function stuckProbe(seconds = 120) {
  const prev = new Map(), stuck = new Map(), states = {};
  let flagged = 0, checked = 0;
  for (let s = 0; s < seconds; s++) {
    await sleep(1000);
    const hs = await ev(tab, `(() => {
      const d = window.__ESMO_RUNTIME_DIAG ? window.__ESMO_RUNTIME_DIAG() : null;
      if (!d) return null;
      return (d.heroRenderDiagnostics || []).map((h) => ({ id: h.id, alive: h.alive, state: h.actionState, pos: h.simPosition }));
    })()`).catch(() => null);
    if (!hs) continue;
    for (const h of hs.filter((x) => x.alive && x.pos)) {
      checked++;
      const p = prev.get(h.id);
      if (p) {
        const m = Math.hypot(h.pos.x - p.x, h.pos.y - p.y);
        if (m < 0.15) {
          stuck.set(h.id, (stuck.get(h.id) ?? 0) + 1);
          if ((stuck.get(h.id) ?? 0) >= 4) { flagged++; states[h.state ?? "?"] = (states[h.state ?? "?"] ?? 0) + 1; }
        } else stuck.set(h.id, 0);
      }
      prev.set(h.id, { ...h.pos });
    }
  }
  return { checked, flagged, states };
}

try {
  if (process.argv.includes("--clean")) {
    await cleanCapture(DESK, "desktop", [8, 16]);
    await cleanCapture(MOB, "mobile390", [8, 14]);
    // 卡位狀態分布（開 diag 才讀得到 actionState）
    await toGameView(DESK, "desktop-probe");
    await clickByText(tab, "4×"); await sleep(500);
    results.stuckProbe = await stuckProbe(150);
    console.log("stuckProbe:", JSON.stringify(results.stuckProbe));
    writeFileSync(resolve(OUT_DIR, "shot_stats_f_clean.json"), JSON.stringify(results, null, 2));
    console.log(`\n截圖 ${results.shots.length}`);
    browser.kill(); server.kill();
    try { rmSync(profileDir, { recursive: true, force: true }); } catch { /* ignore */ }
    process.exit(0);
  }
  if (!MOBILE_ONLY) {
    await toGameView(DESK, "desktop");
    await clickByText(tab, "4×");        // 4× 讓一整場在可接受的實際時間內跑完
    await sleep(500);
    await shot("F01-desktop-gameview-start.png");
    const reason = await observe("desktop", 600);
    results.desktopEnd = reason;
    results.desktop = summarise(results.samples, "desktop");
    await shot("F02-desktop-late.png");
    console.log("desktop:", JSON.stringify(results.desktop));
  }
  // ── 手機 390×844：同一場流程，較短觀察窗（重點是 FPS 與 HUD 擁擠）──────
  const deskSamples = results.samples.length;
  await toGameView(MOB, "mobile390");
  await clickByText(tab, "⚙");            // 手機把倍率收在 ⚙ 裡
  await sleep(400);
  await clickByText(tab, "4×");
  await sleep(500);
  await shot("F05-mobile390-gameview.png");
  await observe("mobile390", 200);
  results.mobile = summarise(results.samples.slice(deskSamples), "mobile390");
  // HUD 擁擠：小地圖與十人面板是否重疊、有沒有水平溢出
  results.mobileHud = await ev(tab, `(() => {
    const m = document.querySelector("canvas[style*='border-radius']");
    const panels = [...document.querySelectorAll("div")].filter((d) => (d.textContent || "").includes("隊伍面板"));
    const strip = panels[panels.length - 1]?.closest("div[style*='position: absolute']") ?? null;
    const r = (el) => (el ? el.getBoundingClientRect() : null);
    const a = r(m), b = r(strip);
    const overlap = a && b && Math.max(a.left, b.left) < Math.min(a.right, b.right)
      && Math.max(a.top, b.top) < Math.min(a.bottom, b.bottom);
    return {
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      minimapFound: !!a, stripFound: !!b, minimapOverlapsStrip: !!overlap,
      innerWidth: window.innerWidth, innerHeight: window.innerHeight,
    };
  })()`).catch(() => null);
  await shot("F06-mobile390-late.png");
  console.log("mobile:", JSON.stringify(results.mobile), JSON.stringify(results.mobileHud));
} catch (e) {
  failed++; console.error("流程中斷：", e.message); results.error = String(e.message);
}

writeFileSync(resolve(OUT_DIR, "shot_stats_f.json"), JSON.stringify(results, null, 2));
console.log(`\n斷言 ${results.notes.filter((n) => n.ok).length}/${results.notes.length}；截圖 ${results.shots.length}`);
browser.kill(); server.kill();
try { rmSync(profileDir, { recursive: true, force: true }); } catch { /* ignore */ }
process.exit(failed ? 1 : 0);
