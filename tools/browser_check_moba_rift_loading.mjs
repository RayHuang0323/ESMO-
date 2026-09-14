#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_moba_rift_loading.mjs — MOBA Rift Loading Fix 瀏覽器實測
//
//  走玩家真的會走的路：首頁 → MOBA 賽前 → Ban/Pick（真的點英雄）→ Tactic →
//  Loading → Battle，讀 ?diag=1 的 __ESMO_RIFT_DIAG／__ESMO_RUNTIME_DIAG 逐幀記帳。
//
//    npm run build && npx vite preview --port 4317 --strictPort
//    node tools/browser/run-gate.mjs tools/browser_check_moba_rift_loading.mjs --timeout 1200000 -- \
//      --url http://127.0.0.1:4317/ESMO-/ --scenario normal [--mobile] [--shots <dir>]
//
//  --scenario normal   正常路徑：首頁不下載、Ban/Pick 起跑、第一幀 Rift、blockout 0 幀
//  --scenario failure  CDP Fetch 讓 GLB 請求失敗：不等滿期限就進場、blockout／error
//  --scenario timeout  CDP Fetch 攔住 GLB 不放行：Loading 等滿 20s、blockout／timeout，
//                      放行後換回 Rift
//  --mobile            390×844 DPR3 觸控 ＋ 4G（1.125 MB/s、60ms）
//
//  ⚠ chrome.evaluate 的字串裡不能有反引號。
// ============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { runGate, finishGate } from "./browser/harness.mjs";

const argValue = (name, fallback = null) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : fallback;
};
const URL_ = argValue("--url", "http://127.0.0.1:4317/ESMO-/");
const SCENARIO = argValue("--scenario", "normal");
const SHOTS = argValue("--shots");
const MOBILE = process.argv.includes("--mobile");
const GATE_TIMEOUT_MS = 20_000;   // 與 src/battle/moba/map/riftMapGate.js 的 RIFT_GATE_TIMEOUT_MS 相同

const J = (raw) => { const s = String(raw).replace(/^"|"$/g, ""); try { return JSON.parse(s); } catch { return null; } };
const waitFor = async (chrome, sleep, expr, timeoutMs, everyMs = 300) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const r = J(await chrome.evaluate("return JSON.stringify({ v: Boolean(" + expr + ") });"));
    if (r?.v) return true;
    await sleep(everyMs);
  }
  return false;
};
const clickSel = (sel) => "const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }; const el = [...document.querySelectorAll(" + JSON.stringify(sel) + ")].find(vis); if (!el || el.disabled) return JSON.stringify({ ok: false }); el.scrollIntoView({ block: 'center' }); el.click(); return JSON.stringify({ ok: true });";
const clickText = (needle) => "const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }; const el = [...document.querySelectorAll('button')].filter(vis).find((n) => !n.disabled && (n.innerText || '').includes(" + JSON.stringify(needle) + ")); if (!el) return JSON.stringify({ ok: false }); el.scrollIntoView({ block: 'center' }); el.click(); return JSON.stringify({ ok: true });";
const RIFT_ENTRIES = "performance.getEntriesByType('resource').filter((x) => /esmo-rift/.test(x.name)).map((x) => ({ name: x.name.split('/').pop(), start: Math.round(x.startTime), end: Math.round(x.responseEnd), transfer: x.transferSize, body: x.decodedBodySize }))";
const readRift = (chrome) => chrome.evaluate("return JSON.stringify({ now: Math.round(performance.now()), diag: typeof window.__ESMO_RIFT_DIAG === 'function' ? window.__ESMO_RIFT_DIAG() : null, entries: " + RIFT_ENTRIES + " });").then(J);

async function realClick(chrome, sleep, sel) {
  const p = J(await chrome.evaluate("const el = [...document.querySelectorAll(" + JSON.stringify(sel) + ")].find((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight && !n.disabled; }); if (!el) return JSON.stringify(null); const r = el.getBoundingClientRect(); return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });"));
  if (!p) return null;
  if (MOBILE) {
    await chrome.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: p.x, y: p.y, radiusX: 10, radiusY: 10, force: 1 }] });
    await sleep(60);
    await chrome.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } else {
    for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) {
      await chrome.send("Input.dispatchMouseEvent", { type, x: p.x, y: p.y, button: "left", clickCount: 1 });
    }
  }
  return p;
}

const result = await runGate({
  name: "MOBA Rift Loading (" + SCENARIO + (MOBILE ? ", 390 + 4G" : ", desktop") + ")",
  externalUrl: URL_,
  timeoutMs: 1_100_000,
  run: async ({ chrome, ck, sleep }) => {
    if (SHOTS) mkdirSync(SHOTS, { recursive: true });
    const tag = SCENARIO + "-" + (MOBILE ? "mobile" : "desktop");
    const shot = async (name) => {
      if (!SHOTS) return;
      try { const { data } = await chrome.send("Page.captureScreenshot", { format: "jpeg", quality: 70 }); writeFileSync(SHOTS + "/" + tag + "-" + name + ".jpg", Buffer.from(data, "base64")); } catch { /* ignore */ }
    };
    const report = {};
    await chrome.send("Page.addScriptToEvaluateOnNewDocument", { source: "try { performance.setResourceTimingBufferSize(20000); } catch (e) {}" });
    if (MOBILE) {
      await chrome.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
      await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
      await chrome.send("Network.enable", {});
      await chrome.send("Network.emulateNetworkConditions", { offline: false, latency: 60, downloadThroughput: 1_125_000, uploadThroughput: 187_500 });
    } else {
      await chrome.send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    }

    //  失敗／逾時情境：用 CDP Fetch 攔 GLB（產品程式碼沒有任何測試開關）。
    const paused = [];
    if (SCENARIO === "failure" || SCENARIO === "timeout") {
      chrome.on("Fetch.requestPaused", (p) => {
        paused.push({ id: p.requestId, url: p.request?.url ?? "" });
        if (SCENARIO === "failure") chrome.send("Fetch.failRequest", { requestId: p.requestId, errorReason: "Failed" }).catch(() => {});
      });
      await chrome.send("Fetch.enable", { patterns: [{ urlPattern: "*esmo-rift*", requestStage: "Request" }] });
    }

    const url = URL_ + (URL_.includes("?") ? "&" : "?") + "diag=1";
    await chrome.navigate(url); await sleep(2500);
    await chrome.evaluate("localStorage.removeItem('esmo.profile.v1'); return JSON.stringify({});");
    await chrome.navigate(url); await sleep(3000);

    ck("首頁有 MOBA 入口", await waitFor(chrome, sleep, "document.querySelector('[data-testid=\"home-mode-moba\"]')", 60000));
    await sleep(2000);
    const atHome = await readRift(chrome);
    ck("首頁不下載 Rift（無請求、下載器未啟動）", atHome.entries.length === 0 && !atHome.diag && paused.length === 0,
      JSON.stringify(atHome.entries));

    await chrome.evaluate(clickSel("[data-testid=\"home-mode-moba\"]"));
    ck("進入賽前頁", await waitFor(chrome, sleep, "document.querySelector('[data-testid=\"prep-primary-action\"]')", 60000));
    let prepChecked = false, prepClean = true;
    const prepDeadline = Date.now() + 180000;
    while (Date.now() < prepDeadline) {
      if (J(await chrome.evaluate("return JSON.stringify({ v: !!document.querySelector('[data-testid=\"hero-grid-scroll\"]') });"))?.v) break;
      if (!prepChecked) { const r = await readRift(chrome); prepChecked = true; prepClean = r.entries.length === 0 && !r.diag; }
      if (J(await chrome.evaluate("return JSON.stringify({ v: !!document.querySelector('[data-testid=\"matchmaking-enter-banpick\"]') && !document.querySelector('[data-testid=\"matchmaking-enter-banpick\"]').disabled });"))?.v) {
        await chrome.evaluate(clickSel("[data-testid=\"matchmaking-enter-banpick\"]")); await sleep(1000); continue;
      }
      const a = J(await chrome.evaluate("const el = document.querySelector('[data-testid=\"prep-primary-action\"]'); return JSON.stringify({ action: el ? el.dataset.action : null, disabled: !!(el && el.disabled) });"));
      if (a?.action === "blocked") { await chrome.evaluate(clickText("自動")); await sleep(800); continue; }
      if (a?.action && !a.disabled) { await chrome.evaluate(clickSel("[data-testid=\"prep-primary-action\"]")); await sleep(900); continue; }
      await sleep(600);
    }
    ck("賽前頁（選角之前）也不下載 Rift", prepClean);
    const inBanPick = await waitFor(chrome, sleep, "document.querySelector('[data-testid=\"hero-grid-scroll\"]')", 60000);
    ck("進入 Ban/Pick", inBanPick);
    if (!inBanPick) return;
    const banpickAt = Number(J(await chrome.evaluate("return JSON.stringify(Math.round(performance.now()));")));
    await waitFor(chrome, sleep, "typeof window.__ESMO_RIFT_DIAG === 'function' && window.__ESMO_RIFT_DIAG().firstSource", 5000, 100);
    const atBanpick = await readRift(chrome);
    report.RIFT_PRELOAD_START = { source: atBanpick.diag?.firstSource ?? null, startedAt: atBanpick.diag?.firstStartedAt ?? null, banpickDetectedAt: banpickAt };
    ck("RIFT_PRELOAD_START：由 Ban/Pick 觸發", atBanpick.diag?.firstSource === "banpick"
      && Number.isFinite(atBanpick.diag?.firstStartedAt) && atBanpick.diag.firstStartedAt <= banpickAt + 1000,
      JSON.stringify(report.RIFT_PRELOAD_START));

    let picks = 0;
    const draftDeadline = Date.now() + 300000;
    while (Date.now() < draftDeadline) {
      if (J(await chrome.evaluate("const b = document.querySelector('[data-testid=\"confirm-draft\"]'); return JSON.stringify({ v: !!b && !b.disabled });"))?.v) break;
      if (await realClick(chrome, sleep, "[data-testid=\"hero-choose\"]")) picks += 1;
      await sleep(1200);
    }
    const canConfirm = J(await chrome.evaluate("const b = document.querySelector('[data-testid=\"confirm-draft\"]'); return JSON.stringify({ v: !!b && !b.disabled });"))?.v;
    ck("選角完成", !!canConfirm, "hero clicks " + picks);
    if (!canConfirm) { await shot("draft-stuck"); return; }
    await chrome.evaluate(clickSel("[data-testid=\"confirm-draft\"]"));
    ck("進入戰術頁", await waitFor(chrome, sleep, "[...document.querySelectorAll('button')].some((b) => (b.innerText || '').includes('開始載入'))", 60000));
    const beforeLoading = await readRift(chrome);
    await chrome.evaluate(clickText("開始載入"));
    const loadClickAt = Number(J(await chrome.evaluate("return JSON.stringify(Math.round(performance.now()));")));

    //  Loading：逐 200ms 讀閘門，直到戰場掛上。
    const gates = [];
    let battleAt = null;
    const loadDeadline = Date.now() + 240000;
    while (Date.now() < loadDeadline) {
      const r = J(await chrome.evaluate("const b = document.querySelector('[data-testid=\"moba-loading-progress\"]'); return JSON.stringify({ now: Math.round(performance.now()), gate: b ? b.dataset.mapGate : null, battle: !!(document.querySelector('[data-testid=\"battle-hud\"]') && document.querySelector('canvas')) });"));
      if (r?.gate && gates[gates.length - 1]?.gate !== r.gate) gates.push({ at: r.now, gate: r.gate });
      if (r?.battle) { battleAt = r.now; break; }
      await sleep(200);
    }
    ck("戰場掛上（battle-hud + canvas）", battleAt !== null, battleAt ? ((battleAt - loadClickAt) / 1000).toFixed(1) + "s after 開始載入" : "");
    if (battleAt === null) { await shot("loading-stuck"); return; }
    await sleep(1000);
    await shot("battle-01s");
    await sleep(2000);
    const early = await readRift(chrome);
    const runtime = J(await chrome.evaluate("const d = typeof window.__ESMO_RUNTIME_DIAG === 'function' ? window.__ESMO_RUNTIME_DIAG() : null; return JSON.stringify(d ? { mapMode: d.mapMode, mapFallbackReason: d.mapFallbackReason, mapFrames: d.mapFrames, firstMapFrameMode: d.firstMapFrameMode, heroCount: d.heroCount, visibleHeroes: d.visibleHeroIds.length, towers: d.towerAliveCount, nexus: d.nexusCount, objectives: d.objectiveState.length, fallbackObjectives: d.objectiveState.filter((o) => o.fallbackPosition).length, fps: d.performance.fps } : null);"));
    const map = early.diag?.map ?? null;
    const loadingMs = battleAt - loadClickAt;
    report.LOADING_MS = loadingMs;
    report.GATES = gates;
    report.RIFT = early.diag ? { status: early.diag.status, attempts: early.diag.attempts, startedAt: early.diag.firstStartedAt, readyAt: early.diag.readyAt, failedAt: early.diag.failedAt, error: early.diag.error, deadlineArmedBy: early.diag.deadlineArmedBy } : null;
    report.MAP = map;
    report.RUNTIME = runtime;
    report.ENTRIES = early.entries;
    report.BEFORE_LOADING_STATUS = beforeLoading.diag?.status ?? null;

    if (SCENARIO === "normal") {
      const d = early.diag;
      report.RIFT_READY = d?.readyAt != null ? { msAfterPreloadStart: d.readyAt - d.firstStartedAt, msBeforeBattleMount: (map?.mountedAt ?? battleAt) - d.readyAt } : null;
      ck("RIFT_READY：戰場掛載前 Rift 已就緒", d?.status === "ready" && Number.isFinite(d.readyAt) && Number.isFinite(map?.mountedAt) && d.readyAt <= map.mountedAt,
        JSON.stringify(report.RIFT_READY));
      ck("FIRST_BATTLE_FRAME_MAP = rift", map?.firstFrameMode === "rift" && runtime?.firstMapFrameMode === "rift", JSON.stringify({ first: map?.firstFrameMode }));
      ck("BLOCKOUT_NORMAL_FRAMES = 0（loading 空白幀也是 0）", map?.frames.blockout === 0 && map?.frames.loading === 0 && map?.frames.rift > 0,
        JSON.stringify(map?.frames));
      ck("mapMode = rift（__ESMO_RUNTIME_DIAG）", runtime?.mapMode === "rift" && runtime?.mapFallbackReason === null);
      const riftReq = early.entries.filter((e) => /\.glb/.test(e.name));
      ck("快取：GLB 只請求一次、雜湊檔名、無查詢字串", riftReq.length === 1 && /^esmo-rift-[\w-]+\.glb$/.test(riftReq[0].name),
        JSON.stringify(riftReq));
      ck("對戰畫面正常：10 名英雄、塔、主堡、營地都在", runtime?.heroCount === 10 && runtime?.towers > 0 && runtime?.nexus === 2 && runtime?.objectives > 0,
        JSON.stringify(runtime));
      const cam = J(await chrome.evaluate("return JSON.stringify(typeof window.__ESMO_RUNTIME_SETCAM === 'function' ? window.__ESMO_RUNTIME_SETCAM({ fitAll: true }) : null);"));
      ck("相機：收全場指令可用", !!cam && Number.isFinite(cam.zoom), JSON.stringify(cam));
      await sleep(1500);
      await shot("battle-fitall");
      await sleep(8000);
      const later = await readRift(chrome);
      ck("持續 ≥10 秒：blockout 仍 0 幀、沒有切換", later.diag?.map.frames.blockout === 0 && later.diag?.map.switches.length === 0,
        JSON.stringify(later.diag?.map.frames));
      report.MAP_LATER = later.diag?.map ?? null;
    } else if (SCENARIO === "failure") {
      ck("FALLBACK_FAILURE：請求真的被攔下失敗（Ban/Pick 一次 ＋ Loading 重試一次）", paused.length >= 2 && early.diag?.attempts >= 2, "paused " + paused.length + " attempts " + early.diag?.attempts);
      ck("FALLBACK_FAILURE：資產狀態 failed", early.diag?.status === "failed", String(early.diag?.error));
      ck("FALLBACK_FAILURE：不必等滿 20s 期限就進場", loadingMs < GATE_TIMEOUT_MS, loadingMs + "ms");
      ck("FALLBACK_FAILURE：第一幀 blockout／error，Rift 0 幀", map?.firstFrameMode === "blockout" && map?.firstFrameReason === "error" && map?.frames.rift === 0 && map?.frames.loading === 0,
        JSON.stringify(map?.frames));
      ck("FALLBACK_FAILURE：對戰照常（10 名英雄、主堡、營地）", runtime?.heroCount === 10 && runtime?.nexus === 2 && runtime?.objectives > 0, JSON.stringify(runtime));
    } else if (SCENARIO === "timeout") {
      ck("TIMEOUT：請求真的被攔住不放行", paused.length >= 1 && early.diag?.status === "loading", "paused " + paused.length);
      ck("TIMEOUT：Loading 等滿期限才進場（20s ± 容差）", loadingMs >= GATE_TIMEOUT_MS - 300 && loadingMs <= GATE_TIMEOUT_MS + 6000, loadingMs + "ms");
      ck("TIMEOUT：閘門順序 loading → blockout", gates.map((g) => g.gate).join(">").startsWith("loading") && gates.some((g) => g.gate === "blockout"), JSON.stringify(gates));
      ck("TIMEOUT：第一幀 blockout／timeout，Rift 0 幀、空白 0 幀", map?.firstFrameMode === "blockout" && map?.firstFrameReason === "timeout" && map?.frames.rift === 0 && map?.frames.loading === 0,
        JSON.stringify(map?.frames));
      for (const p of paused) await chrome.send("Fetch.continueRequest", { requestId: p.id }).catch(() => {});
      await chrome.send("Fetch.disable", {}).catch(() => {});
      const swapped = await waitFor(chrome, sleep, "window.__ESMO_RIFT_DIAG().map.mapMode === 'rift'", 120000, 500);
      const after = await readRift(chrome);
      ck("TIMEOUT：放行後就緒優先，戰場換回 Rift", swapped && after.diag?.status === "ready" && after.diag?.map.frames.rift > 0
        && after.diag.map.switches.some((s) => s.from === "blockout" && s.to === "rift"), JSON.stringify(after.diag?.map.switches));
      await sleep(1000);
      await shot("battle-after-release");
      report.MAP_AFTER_RELEASE = after.diag?.map ?? null;
    }

    const consoleErrors = (chrome.consoleLines ?? []).filter((l) => /^\[error\]/.test(l));
    const warnings = [...new Set((chrome.consoleLines ?? []).filter((l) => /^\[warning\]/.test(l)).map((l) => l.slice(0, 120)))];
    const pageErrors = chrome.pageErrors ?? [];
    ck("無 page uncaught error", pageErrors.length === 0, JSON.stringify(pageErrors.slice(0, 3)));
    if (SCENARIO === "normal") ck("console 無 error", consoleErrors.length === 0, JSON.stringify(consoleErrors.slice(0, 5)));
    report.CONSOLE_ERRORS = consoleErrors.slice(0, 8);
    report.CONSOLE_WARNINGS = warnings.slice(0, 8);
    console.log("RIFT_REPORT " + JSON.stringify(report));
  },
});

finishGate(result);
