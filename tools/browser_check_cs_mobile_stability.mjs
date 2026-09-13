#!/usr/bin/env node
// ============================================================================
//  CS Mobile Stability Pass：手機 390px／類 Android 環境下的 Loading v2 快取與 runtime 穩定度
//
//  執行（打包後 bundle；先 `npm run build`，再用 vite preview 起站）：
//    node tools/browser/run-gate.mjs tools/browser_check_cs_mobile_stability.mjs --timeout 2700000 -- \
//      --external-url http://localhost:<port>/ESMO-/ --save-in <乾淨存檔.json> [--label full] [--shots <dir>]
//      [--throttle]   CPU 4× 降速＋4G 網路（估低階手機；只跑首次進場＋一次返回）
//  乾淨存檔：`browser_measure_cs_loading.mjs` 的 dev 模式加 `--save-out <檔>` 產生。
//
//  完整流程（未加 --throttle）：
//    首頁 → 首次進場 → 離場 → 返回同一場 ×5（每次離場後送 critical memory pressure、強制 GC）
//    → 快速完成 → 賽後結果 → 返回 Dashboard → 開新的一場 → 離場
//
//  ⚠ 不改任何遊戲邏輯、不關快取、沒有 mobile 特例；只換 viewport／UA／觸控，與 CDP 層的壓力模擬。
//  ⚠ 「低記憶體」只用 Memory.simulatePressureNotification（瀏覽器會回收可回收的快取、觸發 GC），
//    **不**真的把系統推到 OOM。
//  ⚠ 快取狀態讀 `window.__ESMO_CS_SIM_CACHE__`（csLoadTiming.csSimCacheEvent，只有數字）。
//  ⚠ 送進 chrome.evaluate 的字串裡不能有反引號。
// ============================================================================
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { runGate, finishGate } from "./browser/harness.mjs";

const argValue = (name, fallback = null) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : fallback;
};
const EXTERNAL_URL = argValue("--external-url");
const SAVE_IN = argValue("--save-in");
const SHOTS = argValue("--shots");
const LABEL = argValue("--label", "run");
const THROTTLE = process.argv.includes("--throttle");
const RESUME_CYCLES = THROTTLE ? 1 : 5;
const J = (raw) => { const s = String(raw).replace(/^"|"$/g, ""); try { return JSON.parse(s); } catch { return null; } };
const OUT = new URL("../review/cs-mobile-stability/", import.meta.url);

const ANDROID_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";

const PROBE = `
(() => {
  if (window.__ESMO_MOBILE_PROBE__) return;
  const P = { rafLive: 0, listeners: new Map(), intervals: 0, glContexts: 0, ctxRefs: [], lostAttached: 0, lostDetached: 0 };
  window.__ESMO_MOBILE_PROBE__ = P;
  const raf = window.requestAnimationFrame.bind(window), caf = window.cancelAnimationFrame.bind(window);
  const live = new Set();
  window.requestAnimationFrame = (cb) => { const id = raf((t) => { live.delete(id); P.rafLive = live.size; cb(t); }); live.add(id); P.rafLive = live.size; return id; };
  window.cancelAnimationFrame = (id) => { live.delete(id); P.rafLive = live.size; return caf(id); };
  for (const target of [window, document]) {
    const add = target.addEventListener.bind(target), rm = target.removeEventListener.bind(target);
    const pre = target === window ? "window:" : "document:";
    target.addEventListener = function (type, fn, opt) { P.listeners.set(pre + type, (P.listeners.get(pre + type) || 0) + 1); return add(type, fn, opt); };
    target.removeEventListener = function (type, fn, opt) { P.listeners.set(pre + type, Math.max(0, (P.listeners.get(pre + type) || 0) - 1)); return rm(type, fn, opt); };
  }
  const si = window.setInterval.bind(window), ci = window.clearInterval.bind(window);
  const ints = new Set();
  window.setInterval = (...a) => { const id = si(...a); ints.add(id); P.intervals = ints.size; return id; };
  window.clearInterval = (id) => { ints.delete(id); P.intervals = ints.size; return ci(id); };
  const gc = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (t) {
    const ctx = gc.apply(this, arguments);
    if (String(t).includes("webgl") && ctx && !P.ctxRefs.includes(ctx)) {
      P.glContexts += 1; P.ctxRefs.push(ctx);
      this.addEventListener("webglcontextlost", () => { if (this.isConnected) P.lostAttached += 1; else P.lostDetached += 1; });
    }
    return ctx;
  };
})();
`;

const snap = () => `
  const P = window.__ESMO_MOBILE_PROBE__ || {};
  const C = window.__ESMO_FPS_C2A__ || { players: {} };
  const players = Object.values(C.players || {});
  let listenerTotal = 0; const listeners = {};
  if (P.listeners) for (const [k, v] of P.listeners) if (v > 0) { listeners[k] = v; listenerTotal += v; }
  return JSON.stringify({
    now: performance.now(),
    canvas: document.querySelectorAll("canvas").length,
    rafLive: P.rafLive ?? null, listenerTotal, listeners, intervals: P.intervals ?? null,
    glAcquired: P.glContexts || 0,
    glAlive: (P.ctxRefs || []).filter((c) => { try { return !c.isContextLost(); } catch (e) { return false; } }).length,
    lostAttached: P.lostAttached || 0, lostDetached: P.lostDetached || 0,
    rigged: players.filter((p) => p.mode === "rigged").length, mixers: players.filter((p) => p.mixer).length,
    cache: window.__ESMO_CS_SIM_CACHE__ || null,
    teardown: window.__ESMO_FPS_TEARDOWN__ || null,
    viewport: [window.innerWidth, window.innerHeight, window.devicePixelRatio],
    entries: (window.__ESMO_CS_LOAD_TIMING__ || { entries: [] }).entries,
  });
`;

const identity = () => `
  const raw = localStorage.getItem("esmo.profile.v1");
  if (!raw) return JSON.stringify(null);
  let data; try { data = JSON.parse(raw); } catch (e) { return JSON.stringify(null); }
  let found = null;
  const walk = (o, d) => {
    if (found || !o || typeof o !== "object" || d > 14) return;
    if (o.sessionId && o.activeMatch && typeof o.activeMatch === "object") { found = { sessionId: o.sessionId, seed: o.activeMatch.seed != null ? o.activeMatch.seed : null, status: o.activeMatch.status || null }; return; }
    for (const k of Object.keys(o)) walk(o[k], d + 1);
  };
  walk(data, 0);
  return JSON.stringify(found);
`;

const waitFor = async (chrome, sleep, expr, timeoutMs, everyMs = 200) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const r = J(await chrome.evaluate("return JSON.stringify({ v: Boolean(" + expr + ") });"));
    if (r?.v) return true;
    await sleep(everyMs);
  }
  return false;
};
const pageNow = async (chrome) => Number(J(await chrome.evaluate("return JSON.stringify(performance.now());")));
const markSince = (name, at) =>
  "(window.__ESMO_CS_LOAD_TIMING__ && window.__ESMO_CS_LOAD_TIMING__.entries || []).some((e) => e.name === " + JSON.stringify(name) + " && e.at >= " + at + ")";
const click = (selector) => `
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el || el.disabled) return JSON.stringify({ ok: false });
  el.scrollIntoView({ block: "center" }); el.click();
  return JSON.stringify({ ok: true });
`;
const clickText = (needle) => `
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const el = [...document.querySelectorAll("button")].filter(vis).find((n) => !n.disabled && (n.innerText || "").includes(${JSON.stringify(needle)}));
  if (!el) return JSON.stringify({ ok: false });
  el.scrollIntoView({ block: "center" }); el.click();
  return JSON.stringify({ ok: true });
`;
const prepAction = () => `
  const b = document.querySelector('[data-testid="prep-primary-action"]');
  if (!b) return JSON.stringify({ ok: false, action: null });
  const action = b.dataset.action || null;
  if (b.disabled) return JSON.stringify({ ok: false, action });
  b.click();
  return JSON.stringify({ ok: true, action });
`;

async function enterBattle(chrome, sleep) {
  if (!(await waitFor(chrome, sleep, `document.body.innerText.includes("CS")`, 30000))) return { ok: false, why: "首頁沒有 CS" };
  if (!J(await chrome.evaluate(clickText("CS")))?.ok) return { ok: false, why: "點不到 CS" };
  if (!(await waitFor(chrome, sleep, `document.querySelector('[data-testid="prep-primary-action"]')`, 30000))) return { ok: false, why: "沒有賽前畫面" };
  let a = J(await chrome.evaluate(prepAction()));
  if (a?.action === "blocked") {
    await chrome.evaluate(clickText("自動"));
    if (!(await waitFor(chrome, sleep, `document.querySelector('[data-testid="prep-primary-action"]')?.dataset.action === "enqueue"`, 20000))) return { ok: false, why: `陣容補不滿（action=${a?.action}）` };
    a = J(await chrome.evaluate(prepAction()));
  }
  if (a?.action === "enqueue" || a?.ok) {
    await waitFor(chrome, sleep, `document.querySelector('[data-testid="prep-primary-action"]')?.dataset.action === "confirm" || document.querySelector('[data-map-key]')`, 60000);
    if (J(await chrome.evaluate(`return JSON.stringify({ v: document.querySelector('[data-testid="prep-primary-action"]')?.dataset.action === "confirm" });`))?.v) await chrome.evaluate(prepAction());
  } else {
    return { ok: false, why: `賽前主按鈕無法進行（action=${a?.action}）` };
  }
  if (!(await waitFor(chrome, sleep, `document.querySelector('[data-map-key]')`, 60000))) return { ok: false, why: "沒有地圖選擇" };
  await chrome.evaluate(`document.querySelector('[data-map-key]')?.click(); return JSON.stringify({});`);
  await sleep(400);
  await chrome.evaluate(`const b = [...document.querySelectorAll("button")].filter((n) => !n.disabled && !n.dataset.mapKey); b.at(-1)?.click(); return JSON.stringify({});`);
  await sleep(900);
  await chrome.evaluate(`const b = [...document.querySelectorAll("button")].filter((n) => !n.disabled && (n.innerText || "").length > 20); b[0]?.click(); return JSON.stringify({});`);
  await sleep(400);
  await chrome.evaluate(`const b = [...document.querySelectorAll("button")].filter((n) => !n.disabled); b.at(-1)?.click(); return JSON.stringify({});`);
  return { ok: true };
}

const result = await runGate({
  name: `CS Mobile Stability（${LABEL}${THROTTLE ? "，CPU 4×＋4G" : ""}）`,
  externalUrl: EXTERNAL_URL,
  timeoutMs: 2_600_000,
  run: async ({ chrome, ck, sleep }) => {
    mkdirSync(OUT, { recursive: true });
    if (SHOTS) mkdirSync(SHOTS, { recursive: true });
    const shot = async (name) => {
      if (!SHOTS) return;
      try { const { data } = await chrome.send("Page.captureScreenshot", { format: "jpeg", quality: 70 }); writeFileSync(`${SHOTS}/${LABEL}-${name}.jpg`, Buffer.from(data, "base64")); } catch { /* 截圖失敗不影響判定 */ }
    };
    const pressureAndGc = async () => {
      let pressure = "ok";
      try { await chrome.send("Memory.simulatePressureNotification", { level: "critical" }); } catch (e) { pressure = `unsupported: ${String(e?.message ?? e).slice(0, 60)}`; }
      await sleep(500);
      try { await chrome.send("HeapProfiler.collectGarbage", {}); await sleep(300); await chrome.send("HeapProfiler.collectGarbage", {}); } catch { /* ignore */ }
      await sleep(400);
      const heapMB = J(await chrome.evaluate("return JSON.stringify(performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null);"));
      return { heapMB, pressure };
    };

    ck("precondition：給了 --external-url 與 --save-in", Boolean(EXTERNAL_URL && SAVE_IN), `${EXTERNAL_URL} ｜ ${SAVE_IN}`);
    if (!EXTERNAL_URL || !SAVE_IN) return;

    await chrome.send("Page.addScriptToEvaluateOnNewDocument", { source: PROBE });
    await chrome.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 3, mobile: true, screenWidth: 390, screenHeight: 844 });
    await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await chrome.send("Emulation.setUserAgentOverride", { userAgent: ANDROID_UA, platform: "Linux armv8l" });
    if (THROTTLE) {
      await chrome.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      await chrome.send("Network.enable", {});
      await chrome.send("Network.emulateNetworkConditions", { offline: false, latency: 60, downloadThroughput: 1_125_000, uploadThroughput: 187_500 });
    }

    await chrome.navigate(EXTERNAL_URL); await sleep(1600);
    const dump = JSON.parse(readFileSync(SAVE_IN, "utf8"));
    await chrome.evaluate("localStorage.clear(); const d = " + JSON.stringify(dump) + "; for (const k of Object.keys(d)) localStorage.setItem(k, d[k]); return JSON.stringify({});");
    await chrome.navigate(EXTERNAL_URL); await sleep(THROTTLE ? 6000 : 2500);

    const report = { label: LABEL, throttle: THROTTLE, url: EXTERNAL_URL, at: new Date().toISOString(), steps: [] };
    const record = (step, s, heap, extra = {}) => {
      const row = { step, heapMB: heap?.heapMB ?? null, pressure: heap?.pressure ?? null, canvas: s.canvas, rafLive: s.rafLive, listenerTotal: s.listenerTotal,
        intervals: s.intervals, glAlive: s.glAlive, glAcquired: s.glAcquired, lostAttached: s.lostAttached, lostDetached: s.lostDetached,
        rigged: s.rigged, mixers: s.mixers, cache: s.cache, viewport: s.viewport, ...extra };
      report.steps.push(row);
      console.log(`   ${step.padEnd(22)} heap ${String(row.heapMB).padStart(4)}MB ｜ canvas ${row.canvas} ｜ RAF ${row.rafLive} ｜ listeners ${row.listenerTotal} ｜ GL alive ${row.glAlive} ｜ lost ${row.lostAttached} ｜ cache ${row.cache ? (row.cache.held ? "held" : "none") + ` s${row.cache.stores}/r${row.cache.reuses}/c${row.cache.releasedOnComplete}/x${row.cache.replaced}` : "-"}${extra.loadMs != null ? ` ｜ load ${(extra.loadMs / 1000).toFixed(2)}s` : ""}`);
      return row;
    };

    const base = record("home-baseline", J(await chrome.evaluate(snap())), await pressureAndGc());
    ck("手機環境：390px viewport、DPR 3", base.viewport?.[0] === 390 && base.viewport?.[2] === 3, JSON.stringify(base.viewport));

    // ── 首次進場 ─────────────────────────────────────────────────────────────
    const t0 = await pageNow(chrome);
    const enter = await enterBattle(chrome, sleep);
    ck("首次進場流程走得通（390px）", enter.ok, enter.why ?? "");
    if (!enter.ok) { writeFileSync(new URL(`${LABEL}.json`, OUT), JSON.stringify(report, null, 2)); return; }
    const ready1 = await waitFor(chrome, sleep, markSince("battle:rigged-ready", t0), THROTTLE ? 600000 : 240000, 250);
    let s = J(await chrome.evaluate(snap()));
    const lm = s.entries.find((e) => e.name === "ui:cs-loading-mount" && e.at >= t0);
    const rr = s.entries.find((e) => e.name === "battle:rigged-ready" && e.at >= t0);
    const firstLoadMs = lm && rr ? Math.round(rr.at - lm.at) : null;
    await sleep(2500);
    const battle1 = record("battle-first", J(await chrome.evaluate(snap())), await pressureAndGc(), { loadMs: firstLoadMs });
    ck("首次：10 名 rigged 就位、WebGL context 1、沒有 context lost", ready1 && battle1.rigged === 10 && battle1.glAlive === 1 && battle1.lostAttached === 0, `rigged ${battle1.rigged}｜alive ${battle1.glAlive}｜lost ${battle1.lostAttached}`);
    ck("首次：快取保存一份", battle1.cache?.held === true && battle1.cache?.stores === 1, JSON.stringify(battle1.cache));
    await shot("01-battle-first");
    const firstSession = J(await chrome.evaluate(identity()));

    // ── 離場 → 返回 ×N ───────────────────────────────────────────────────────
    const leaves = [], resumes = [], resumeLoads = [];
    const leave = async (tag) => {
      await chrome.evaluate(click('[data-testid="leave-active-match"]'));
      await sleep(2500);
      const row = record(tag, J(await chrome.evaluate(snap())), await pressureAndGc());
      leaves.push(row);
      ck(`${tag}：canvas 0、GL context 釋放、RAF／listener 回首頁基準`,
        row.canvas === 0 && row.glAlive === 0 && row.rafLive <= base.rafLive && row.listenerTotal <= base.listenerTotal,
        `canvas ${row.canvas}｜alive ${row.glAlive}｜RAF ${row.rafLive}/${base.rafLive}｜listeners ${row.listenerTotal}/${base.listenerTotal}`);
      return row;
    };
    const leave1 = await leave("leave-1");
    ck("離場後快取保留（同一場中途離開）", leave1.cache?.held === true && leave1.cache?.releasedOnComplete === 0, JSON.stringify(leave1.cache));
    await shot("02-home-after-leave");

    for (let i = 1; i <= RESUME_CYCLES; i++) {
      const tr = await pageNow(chrome);
      const ok = J(await chrome.evaluate(click('[data-testid="resume-active-match"]')))?.ok;
      ck(`返回 ${i}：首頁有「返回對戰」`, ok === true);
      if (!ok) break;
      const ready = await waitFor(chrome, sleep, markSince("battle:rigged-ready", tr), THROTTLE ? 300000 : 60000, 150);
      s = J(await chrome.evaluate(snap()));
      const r = s.entries.find((e) => e.name === "battle:rigged-ready" && e.at >= tr);
      const loadMs = r ? Math.round(r.at - tr) : null;
      resumeLoads.push(loadMs);
      await sleep(1500);
      const row = record(`resume-${i}`, J(await chrome.evaluate(snap())), await pressureAndGc(), { loadMs });
      resumes.push(row);
      ck(`返回 ${i}：10 名 rigged、沿用快取（不重算）、context 正常`,
        ready && row.rigged === 10 && row.cache?.reuses === i && row.cache?.stores === 1 && row.glAlive === 1 && row.lostAttached === 0,
        `load ${loadMs}ms｜rigged ${row.rigged}｜reuses ${row.cache?.reuses}｜stores ${row.cache?.stores}｜alive ${row.glAlive}`);
      if (i === 1) await shot("03-battle-resume");
      await leave(`leave-${i + 1}`);
    }

    //  heap 在「每次離場＋記憶體壓力＋GC 之後」不得逐次累積。
    const leaveHeaps = leaves.map((r) => r.heapMB).filter((v) => Number.isFinite(v));
    const growth = leaveHeaps.length >= 2 ? leaveHeaps.at(-1) - leaveHeaps[0] : null;
    ck("離場後 heap 不隨返回次數累積（最後一次 − 第一次 ≤ 8MB）", growth != null && growth <= 8, `${leaveHeaps.join(" → ")} MB`);
    ck("記憶體壓力模擬有送出", leaves.every((r) => r.pressure === "ok"), leaves.map((r) => r.pressure).join(" / "));

    report.summary = { firstLoadMs, resumeLoads, leaveHeaps, baseHeap: base.heapMB, battleHeap: battle1.heapMB, firstSession };

    if (!THROTTLE) {
      // ── 比賽完成 → 賽後結果 → Dashboard ──────────────────────────────────
      const tr = await pageNow(chrome);
      await chrome.evaluate(click('[data-testid="resume-active-match"]'));
      await waitFor(chrome, sleep, markSince("battle:rigged-ready", tr), 60000, 150);
      await chrome.evaluate("window.confirm = () => true; return JSON.stringify({});");
      ck("快速完成可以按", J(await chrome.evaluate(click('[data-testid="quick-finish-match"]')))?.ok === true);
      const done = await waitFor(chrome, sleep, `[...document.querySelectorAll("button")].some((b) => (b.innerText || "").includes("查看賽後戰報"))`, 120000, 250);
      const completed = record("match-complete", J(await chrome.evaluate(snap())), await pressureAndGc());
      ck("比賽完成：快取釋放", done && completed.cache?.held === false && completed.cache?.releasedOnComplete === 1, JSON.stringify(completed.cache));
      await chrome.evaluate(clickText("查看賽後戰報"));
      const resultOk = await waitFor(chrome, sleep, `document.body.innerText.includes("返回 Dashboard") && document.body.innerText.includes("MVP")`, 60000, 250);
      ck("賽後結果畫面正常（390px）", resultOk);
      await shot("04-result");
      await chrome.evaluate(clickText("返回 Dashboard"));
      await sleep(2500);
      const dash = record("dashboard-after-result", J(await chrome.evaluate(snap())), await pressureAndGc());
      ck("結果後回首頁：沒有快取、canvas 0、GL context 0", dash.cache?.held === false && dash.canvas === 0 && dash.glAlive === 0, JSON.stringify(dash.cache));
      ck("結果後回首頁：heap 比「中途離場保留快取」時低（快取確實被回收）", Number.isFinite(dash.heapMB) && Number.isFinite(leaveHeaps[0]) && dash.heapMB < leaveHeaps[0],
        `離場保留時 ${leaveHeaps[0]}MB → 結果後 ${dash.heapMB}MB`);

      // ── 開新的一場 ───────────────────────────────────────────────────────
      const tn = await pageNow(chrome);
      const enter2 = await enterBattle(chrome, sleep);
      ck("開新的一場 CS 走得通", enter2.ok, enter2.why ?? "");
      if (enter2.ok) {
        const ready2 = await waitFor(chrome, sleep, markSince("battle:rigged-ready", tn), 240000, 250);
        await sleep(2500);
        const battle2 = record("battle-new-match", J(await chrome.evaluate(snap())), await pressureAndGc());
        const secondSession = J(await chrome.evaluate(identity()));
        ck("新的一場：是不同 session、10 名 rigged", ready2 && battle2.rigged === 10 && secondSession?.sessionId && secondSession.sessionId !== firstSession?.sessionId,
          `${firstSession?.sessionId} → ${secondSession?.sessionId}`);
        ck("新的一場：只保存新的一份（舊的不在）", battle2.cache?.held === true && battle2.cache?.stores === 2 && battle2.cache?.releasedOnComplete === 1,
          JSON.stringify(battle2.cache));
        await shot("05-battle-new-match");
        const leaveNew = await leave("leave-new-match");
        ck("新的一場離場後 heap 與第一場離場時同一量級（沒有兩份快取疊加，差 ≤ 10MB）",
          Number.isFinite(leaveNew.heapMB) && Math.abs(leaveNew.heapMB - leaveHeaps[0]) <= 10, `第一場 ${leaveHeaps[0]}MB ｜ 新的一場 ${leaveNew.heapMB}MB`);
        report.summary.secondSession = secondSession;
        report.summary.dashboardHeapAfterResult = dash.heapMB;
        report.summary.leaveHeapNewMatch = leaveNew.heapMB;
      }
    }

    const consoleErrors = (chrome.consoleLines ?? []).filter((l) => l.startsWith("[error]"));
    const pageErrors = chrome.pageErrors ?? [];
    ck("整段沒有 WebGL context lost（畫布掛載中）", report.steps.every((r) => r.lostAttached === 0), `${report.steps.at(-1)?.lostAttached ?? 0}`);
    ck("console 無 page-origin uncaught error", pageErrors.length === 0, pageErrors.slice(0, 2).join(" ¦ ") || "clean");
    report.consoleErrors = consoleErrors.slice(0, 20);
    report.pageErrors = pageErrors.slice(0, 20);
    writeFileSync(new URL(`${LABEL}.json`, OUT), JSON.stringify(report, null, 2));
    console.log(`\nFIRST ${(firstLoadMs / 1000).toFixed(1)}s ｜ RESUME ${resumeLoads.map((m) => (m / 1000).toFixed(2) + "s").join(" / ")} ｜ console [error] ${consoleErrors.length}`);
    console.log(`數據：review/cs-mobile-stability/${LABEL}.json`);
  },
});

finishGate(result);
