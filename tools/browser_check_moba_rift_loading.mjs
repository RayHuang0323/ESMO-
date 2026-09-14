#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_moba_rift_loading.mjs — MOBA Rift Loading Fix 瀏覽器實測
//
//  走玩家真的會走的路：首頁 → MOBA 賽前 → Ban/Pick（真的點英雄）→ Tactic →
//  Loading → Battle，讀 ?diag=1 的 __ESMO_RIFT_DIAG／__ESMO_RUNTIME_DIAG 逐幀記帳。
//
//    npm run build && npx vite preview --port 4317 --strictPort
//    node tools/browser/run-gate.mjs tools/browser_check_moba_rift_loading.mjs --timeout 1200000 -- \
//      --url http://127.0.0.1:4317/ESMO-/ --entry normal --scenario normal [--replay] [--mobile] [--shots <dir>]
//
//  --entry normal   Ban/Pick → Loading → Battle（--replay：賽後再開 Replay，Rift 已就緒）
//  --entry resume   先打到戰鬥，停用快取重新整理（新的 session、Rift 未載入）→ 首頁「返回進行中的比賽」
//  --entry replay   戰鬥期間讓 GLB 失敗（以 blockout 進場）→ 快速完成 → 開 Replay（Rift 未就緒）
//
//  --scenario normal   正常：第一個看得到的地圖是 Rift、blockout 0 幀
//                      （replay：請求先卡住 4 秒再放行，驗證載入畫面與時間軸暫停）
//  --scenario failure  CDP Fetch 讓 GLB 請求失敗 ⇒ 不等滿期限、blockout／error
//  --scenario timeout  CDP Fetch 攔住 GLB 不放行 ⇒ 等滿 20s、blockout／timeout，放行後換回 Rift
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
const ENTRY = argValue("--entry", "normal");
const SCENARIO = argValue("--scenario", "normal");
const SHOTS = argValue("--shots");
const MOBILE = process.argv.includes("--mobile");
const WITH_REPLAY = process.argv.includes("--replay");
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
const pageNow = async (chrome) => Number(J(await chrome.evaluate("return JSON.stringify(Math.round(performance.now()));")));
const RUNTIME = "const d = typeof window.__ESMO_RUNTIME_DIAG === 'function' ? window.__ESMO_RUNTIME_DIAG() : null; return JSON.stringify(d ? { ts: d.ts, mapMode: d.mapMode, mapFallbackReason: d.mapFallbackReason, mapFrames: d.mapFrames, firstMapFrameMode: d.firstMapFrameMode, heroCount: d.heroCount, towers: d.towerAliveCount, nexus: d.nexusCount, objectives: d.objectiveState.length, fallbackObjectives: d.objectiveState.filter((o) => o.fallbackPosition).length } : null);";

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
  name: "MOBA Rift Loading (entry " + ENTRY + ", " + SCENARIO + (WITH_REPLAY ? " + replay" : "") + (MOBILE ? ", 390 + 4G" : ", desktop") + ")",
  externalUrl: URL_,
  timeoutMs: 1_100_000,
  run: async ({ chrome, ck, sleep }) => {
    if (SHOTS) mkdirSync(SHOTS, { recursive: true });
    const tag = ENTRY + "-" + SCENARIO + "-" + (MOBILE ? "mobile" : "desktop");
    const shot = async (name) => {
      if (!SHOTS) return;
      try { const { data } = await chrome.send("Page.captureScreenshot", { format: "jpeg", quality: 70 }); writeFileSync(SHOTS + "/" + tag + "-" + name + ".jpg", Buffer.from(data, "base64")); } catch { /* ignore */ }
    };
    const report = { entry: ENTRY, scenario: SCENARIO, mobile: MOBILE };
    await chrome.send("Page.addScriptToEvaluateOnNewDocument", { source: "try { performance.setResourceTimingBufferSize(20000); } catch (e) {}" });
    await chrome.send("Network.enable", {});
    if (MOBILE) {
      await chrome.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
      await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
      await chrome.send("Network.emulateNetworkConditions", { offline: false, latency: 60, downloadThroughput: 1_125_000, uploadThroughput: 187_500 });
    } else {
      await chrome.send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    }

    //  CDP Fetch 攔 GLB（產品程式碼沒有任何測試開關）。mode：pass 放行／fail 失敗／stall 攔住。
    const paused = [];
    let fetchMode = "pass";
    const needFetch = SCENARIO !== "normal" || ENTRY === "replay";
    if (needFetch) {
      chrome.on("Fetch.requestPaused", (p) => {
        const item = { id: p.requestId, mode: fetchMode, held: false, released: false };
        paused.push(item);
        if (fetchMode === "fail") chrome.send("Fetch.failRequest", { requestId: p.requestId, errorReason: "Failed" }).catch(() => {});
        else if (fetchMode === "pass") chrome.send("Fetch.continueRequest", { requestId: p.requestId }).catch(() => {});
        else item.held = true;
      });
      await chrome.send("Fetch.enable", { patterns: [{ urlPattern: "*esmo-rift*", requestStage: "Request" }] });
    }
    const release = async () => {
      fetchMode = "pass";
      for (const p of paused.filter((x) => x.held && !x.released)) {
        p.released = true;
        await chrome.send("Fetch.continueRequest", { requestId: p.id }).catch(() => {});
      }
    };
    //  進戰鬥前的攔截方式
    if (ENTRY === "normal") fetchMode = SCENARIO === "failure" ? "fail" : SCENARIO === "timeout" ? "stall" : "pass";
    else if (ENTRY === "replay") fetchMode = "fail";

    const url = URL_ + (URL_.includes("?") ? "&" : "?") + "diag=1";
    await chrome.navigate(url); await sleep(2500);
    await chrome.evaluate("localStorage.removeItem('esmo.profile.v1'); return JSON.stringify({});");
    await chrome.navigate(url); await sleep(3000);

    // ── 1. 打到戰鬥 ──────────────────────────────────────────────────────────
    ck("首頁有 MOBA 入口", await waitFor(chrome, sleep, "document.querySelector('[data-testid=\"home-mode-moba\"]')", 60000));
    await sleep(2000);
    const atHome = await readRift(chrome);
    ck("首頁不下載 Rift（無請求、下載器未啟動）", atHome.entries.length === 0 && !atHome.diag && paused.length === 0, JSON.stringify(atHome.entries));
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
    const banpickAt = await pageNow(chrome);
    await waitFor(chrome, sleep, "typeof window.__ESMO_RIFT_DIAG === 'function' && window.__ESMO_RIFT_DIAG().firstSource", 5000, 100);
    const atBanpick = await readRift(chrome);
    report.RIFT_PRELOAD_START = { source: atBanpick.diag?.firstSource ?? null, startedAt: atBanpick.diag?.firstStartedAt ?? null, banpickDetectedAt: banpickAt };
    ck("RIFT_PRELOAD_START：由 Ban/Pick 觸發", atBanpick.diag?.firstSource === "banpick"
      && Number.isFinite(atBanpick.diag?.firstStartedAt) && atBanpick.diag.firstStartedAt <= banpickAt + 1000, JSON.stringify(report.RIFT_PRELOAD_START));

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
    await chrome.evaluate(clickText("開始載入"));

    /** 從目前畫面等到戰場掛上，途中記 Loading 閘門。 */
    const waitBattle = async (startAt, timeoutMs = 240000) => {
      const gates = [];
      let loadingSeen = false, battleAt = null;
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const r = J(await chrome.evaluate("const b = document.querySelector('[data-testid=\"moba-loading-progress\"]'); return JSON.stringify({ now: Math.round(performance.now()), gate: b ? b.dataset.mapGate : null, battle: !!(document.querySelector('[data-testid=\"battle-hud\"]') && document.querySelector('canvas')) });"));
        if (r?.gate) { loadingSeen = true; if (gates[gates.length - 1]?.gate !== r.gate) gates.push({ at: r.now, gate: r.gate }); }
        if (r?.battle) { battleAt = r.now; break; }
        await sleep(200);
      }
      return { gates, loadingSeen, battleAt, loadingMs: battleAt === null ? null : battleAt - startAt };
    };
    const loadClickAt = await pageNow(chrome);
    const first = await waitBattle(loadClickAt);
    ck("戰場掛上（battle-hud + canvas）", first.battleAt !== null, first.battleAt ? (first.loadingMs / 1000).toFixed(1) + "s after 開始載入" : "");
    if (first.battleAt === null) { await shot("loading-stuck"); return; }
    await sleep(1000);
    await shot("battle-01s");
    await sleep(2000);

    const checkBattleBasics = (runtime, label) => ck(label + "：對戰畫面正常（10 名英雄、塔、主堡、營地）",
      runtime?.heroCount === 10 && runtime?.towers > 0 && runtime?.nexus === 2 && runtime?.objectives > 0 && runtime?.fallbackObjectives === 0, JSON.stringify(runtime));

    /** 快速完成 → 賽後 → 開 Replay，逐 200ms 記載入畫面／時間軸，直到 Replay 戰場 canvas 掛上。 */
    const openReplay = async ({ onShell = null, timeoutMs = 120000 } = {}) => {
      await chrome.evaluate("window.confirm = () => true; return JSON.stringify({});");
      await chrome.evaluate(clickSel("[data-testid=\"quick-finish-match\"]"));
      const ended = await waitFor(chrome, sleep, "[...document.querySelectorAll('button')].some((b) => (b.innerText || '').includes('觀看重播'))", 300000, 500);
      ck("前置：快速完成後出現「觀看重播」", ended);
      if (!ended) return null;
      await sleep(800);
      await chrome.evaluate(clickText("觀看重播"));
      const openAt = await pageNow(chrome);
      const samples = [];
      let shellFirstAt = null, shellLastAt = null, revealAt = null, shellSlider = [];
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const r = J(await chrome.evaluate("const s = document.querySelector('[data-testid=\"rift-entry-loading\"]'); const sl = document.querySelector('input[aria-label=\"重播時間軸\"]'); return JSON.stringify({ now: Math.round(performance.now()), shell: !!s, gate: s ? s.dataset.mapGate : null, canvas: !!document.querySelector('[data-replay-presentation] canvas'), slider: sl ? Number(sl.value) : null });"));
        if (r?.shell) { if (shellFirstAt === null) shellFirstAt = r.now; shellLastAt = r.now; shellSlider.push(r.slider); if (onShell) await onShell(r.now - shellFirstAt); }
        if (samples.length < 400) samples.push(r);
        if (r?.canvas) { revealAt = r.now; break; }
        await sleep(200);
      }
      await sleep(3000);
      const tally = (await readRift(chrome)).diag;
      const slider = J(await chrome.evaluate("const sl = document.querySelector('input[aria-label=\"重播時間軸\"]'); return JSON.stringify(sl ? Number(sl.value) : null);"));
      await shot("replay-03s");
      return { openAt, shellFirstAt, shellLastAt, revealAt, shellSlider, sliderAfter: slider, tally, map: tally?.map ?? null };
    };

    // ── 2A. 正常入口 ─────────────────────────────────────────────────────────
    if (ENTRY === "normal") {
      const early = await readRift(chrome);
      const runtime = J(await chrome.evaluate(RUNTIME));
      const map = early.diag?.map ?? null;
      report.LOADING_MS = first.loadingMs; report.GATES = first.gates; report.MAP = map; report.ENTRIES = early.entries;
      report.RIFT = early.diag ? { status: early.diag.status, attempts: early.diag.attempts, startedAt: early.diag.firstStartedAt, readyAt: early.diag.readyAt, failedAt: early.diag.failedAt, error: early.diag.error } : null;
      if (SCENARIO === "normal") {
        const d = early.diag;
        report.RIFT_READY = d?.readyAt != null ? { msAfterPreloadStart: d.readyAt - d.firstStartedAt, msBeforeBattleMount: (map?.mountedAt ?? first.battleAt) - d.readyAt } : null;
        ck("RIFT_READY：戰場掛載前 Rift 已就緒", d?.status === "ready" && Number.isFinite(d.readyAt) && Number.isFinite(map?.mountedAt) && d.readyAt <= map.mountedAt, JSON.stringify(report.RIFT_READY));
        ck("NORMAL_ENTRY_FIRST_FRAME = rift", map?.firstFrameMode === "rift" && runtime?.firstMapFrameMode === "rift");
        ck("NORMAL_BLOCKOUT_FRAMES = 0（loading 空白幀也是 0）", map?.frames.blockout === 0 && map?.frames.loading === 0 && map?.frames.rift > 0, JSON.stringify(map?.frames));
        const riftReq = early.entries.filter((e) => /\.glb/.test(e.name));
        ck("快取：GLB 只請求一次、雜湊檔名、無查詢字串", riftReq.length === 1 && /^esmo-rift-[\w-]+\.glb$/.test(riftReq[0].name), JSON.stringify(riftReq));
        checkBattleBasics(runtime, "NORMAL");
        const cam = J(await chrome.evaluate("return JSON.stringify(typeof window.__ESMO_RUNTIME_SETCAM === 'function' ? window.__ESMO_RUNTIME_SETCAM({ fitAll: true }) : null);"));
        ck("相機：收全場指令可用", !!cam && Number.isFinite(cam.zoom), JSON.stringify(cam));
        await sleep(8000);
        const later = await readRift(chrome);
        ck("持續 ≥10 秒：blockout 仍 0 幀、沒有切換", later.diag?.map.frames.blockout === 0 && later.diag?.map.switches.length === 0, JSON.stringify(later.diag?.map.frames));
        if (WITH_REPLAY) {
          const rp = await openReplay();
          report.REPLAY_READY = rp;
          ck("REPLAY（Rift 已就緒）：第一個看得到的地圖 rift、blockout 0 幀",
            rp?.revealAt !== null && rp?.map?.mountedAt >= rp.openAt && rp.map.firstFrameMode === "rift" && rp.map.frames.blockout === 0 && rp.map.frames.loading === 0,
            JSON.stringify(rp?.map?.frames));
          ck("REPLAY（Rift 已就緒）：時間軸有前進", Number.isFinite(rp?.sliderAfter) && rp.sliderAfter > (rp.shellSlider[0] ?? 0), String(rp?.sliderAfter));
        }
      } else if (SCENARIO === "failure") {
        ck("FAILURE：請求真的被攔下失敗（Ban/Pick 一次 ＋ Loading 重試一次）", paused.length >= 2 && early.diag?.attempts >= 2, "paused " + paused.length + " attempts " + early.diag?.attempts);
        ck("FAILURE：不必等滿 20s 期限就進場", first.loadingMs < GATE_TIMEOUT_MS, first.loadingMs + "ms");
        ck("FAILURE：第一幀 blockout／error，Rift 0 幀、空白 0 幀", map?.firstFrameMode === "blockout" && map?.firstFrameReason === "error" && map?.frames.rift === 0 && map?.frames.loading === 0, JSON.stringify(map?.frames));
        checkBattleBasics(runtime, "FAILURE");
      } else if (SCENARIO === "timeout") {
        ck("TIMEOUT：請求真的被攔住不放行", paused.length >= 1 && early.diag?.status === "loading", "paused " + paused.length);
        ck("TIMEOUT：Loading 等滿期限才進場（20s ± 容差）", first.loadingMs >= GATE_TIMEOUT_MS - 300 && first.loadingMs <= GATE_TIMEOUT_MS + 6000, first.loadingMs + "ms");
        ck("TIMEOUT：第一幀 blockout／timeout，Rift 0 幀、空白 0 幀", map?.firstFrameMode === "blockout" && map?.firstFrameReason === "timeout" && map?.frames.rift === 0 && map?.frames.loading === 0, JSON.stringify(map?.frames));
        await release();
        const swapped = await waitFor(chrome, sleep, "window.__ESMO_RIFT_DIAG().map.mapMode === 'rift'", 120000, 500);
        const after = await readRift(chrome);
        ck("TIMEOUT：放行後就緒優先，戰場換回 Rift", swapped && after.diag?.map.switches.some((s) => s.from === "blockout" && s.to === "rift"), JSON.stringify(after.diag?.map.switches));
      }
    }

    // ── 2B. Resume：停用快取重新整理（新的 session）→ 返回進行中的比賽 ─────────
    if (ENTRY === "resume") {
      const before = J(await chrome.evaluate(RUNTIME));
      ck("前置：戰鬥真的開打且以 Rift 進場", before?.firstMapFrameMode === "rift" && Number.isFinite(before?.ts), JSON.stringify({ ts: before?.ts, first: before?.firstMapFrameMode }));
      await sleep(3000);
      await chrome.send("Network.setCacheDisabled", { cacheDisabled: true });
      fetchMode = SCENARIO === "failure" ? "fail" : SCENARIO === "timeout" ? "stall" : "pass";
      await chrome.navigate(url); await sleep(3000);
      const hasResume = await waitFor(chrome, sleep, "document.querySelector('[data-testid=\"resume-active-match\"]')", 60000);
      ck("前置：重新整理後首頁出現「返回進行中的比賽」", hasResume);
      if (!hasResume) { await shot("no-resume"); return; }
      const reloaded = await readRift(chrome);
      ck("前置：重新整理後是新的 session（Rift 未載入、下載器未啟動）", !reloaded.diag && reloaded.entries.length === 0, JSON.stringify(reloaded.entries));
      await chrome.evaluate(clickSel("[data-testid=\"resume-active-match\"]"));
      const resumeAt = await pageNow(chrome);
      const rs = await waitBattle(resumeAt);
      ck("Resume：戰場掛上", rs.battleAt !== null, rs.battleAt ? (rs.loadingMs / 1000).toFixed(1) + "s after 返回" : "");
      if (rs.battleAt === null) { await shot("resume-stuck"); return; }
      await sleep(1000);
      await shot("resume-01s");
      await sleep(2000);
      const early = await readRift(chrome);
      const runtime = J(await chrome.evaluate(RUNTIME));
      const map = early.diag?.map ?? null;
      report.RESUME = { loadingMs: rs.loadingMs, loadingSeen: rs.loadingSeen, gates: rs.gates, tsBefore: before?.ts, tsAfter: runtime?.ts, map, rift: early.diag ? { status: early.diag.status, firstSource: early.diag.firstSource, attempts: early.diag.attempts, startedAt: early.diag.firstStartedAt, readyAt: early.diag.readyAt } : null };
      //  ⚠ failure 情境請求幾毫秒就失敗，閘門可能在第一次 200ms 取樣前就翻成 blockout；
      //    那一刻畫面仍是 Loading（不是戰場），所以只在 normal／timeout 要求第一個取樣是 loading。
      ck("Resume：Rift 未就緒時先顯示既有 Loading 畫面（不是直接進戰場）",
        rs.loadingSeen && (SCENARIO === "failure" || rs.gates[0]?.gate === "loading"), JSON.stringify(rs.gates));
      if (SCENARIO === "normal") {
        ck("RESUME_FIRST_VISIBLE_MAP = rift", map?.firstFrameMode === "rift" && early.diag?.readyAt <= map?.mountedAt, JSON.stringify({ first: map?.firstFrameMode }));
        ck("RESUME_BLOCKOUT_FRAMES = 0（空白幀也是 0）", map?.frames.blockout === 0 && map?.frames.loading === 0 && map?.frames.rift > 0, JSON.stringify(map?.frames));
        checkBattleBasics(runtime, "RESUME");
      } else if (SCENARIO === "failure") {
        ck("Resume FAILURE：不必等滿 20s 就進場，第一幀 blockout／error，Rift 0 幀、空白 0 幀",
          rs.loadingMs < GATE_TIMEOUT_MS && map?.firstFrameMode === "blockout" && map?.firstFrameReason === "error" && map?.frames.rift === 0 && map?.frames.loading === 0,
          rs.loadingMs + "ms " + JSON.stringify(map?.frames));
        checkBattleBasics(runtime, "RESUME FAILURE");
      } else if (SCENARIO === "timeout") {
        ck("Resume TIMEOUT：Loading 等滿期限，第一幀 blockout／timeout，Rift 0 幀、空白 0 幀",
          rs.loadingMs >= GATE_TIMEOUT_MS - 300 && rs.loadingMs <= GATE_TIMEOUT_MS + 6000 && map?.firstFrameMode === "blockout" && map?.firstFrameReason === "timeout" && map?.frames.rift === 0 && map?.frames.loading === 0,
          rs.loadingMs + "ms " + JSON.stringify(map?.frames));
        await release();
        const swapped = await waitFor(chrome, sleep, "window.__ESMO_RIFT_DIAG().map.mapMode === 'rift'", 180000, 500);
        ck("Resume TIMEOUT：放行後換回 Rift", swapped);
      }
    }

    // ── 2C. Replay：戰鬥以 blockout 進場（Rift 未就緒）→ 快速完成 → 第一次開 Replay ──
    if (ENTRY === "replay") {
      const battle = (await readRift(chrome)).diag;
      ck("前置：戰鬥以 blockout 進場、Rift 未就緒", battle?.status === "failed" && battle?.map.firstFrameMode === "blockout", JSON.stringify({ status: battle?.status, first: battle?.map.firstFrameMode }));
      fetchMode = SCENARIO === "failure" ? "fail" : "stall";
      let released = false;
      const onShell = SCENARIO === "normal" ? async (heldMs) => { if (!released && heldMs >= 4000) { released = true; await release(); } } : null;
      const rp = await openReplay({ onShell, timeoutMs: SCENARIO === "timeout" ? 90000 : 120000 });
      if (!rp) return;
      report.REPLAY = { ...rp, tally: undefined, rift: rp.tally ? { status: rp.tally.status, attempts: rp.tally.attempts, lastSource: rp.tally.lastSource, readyAt: rp.tally.readyAt, failedAt: rp.tally.failedAt, deadlineArmedBy: rp.tally.deadlineArmedBy } : null };
      const shellMs = rp.shellFirstAt === null ? 0 : (rp.revealAt ?? rp.shellLastAt) - rp.shellFirstAt;
      ck("Replay：戰場 canvas 有掛上", rp.revealAt !== null);
      ck("Replay：Replay 的地圖自己記帳（掛載晚於開啟）", Number.isFinite(rp.map?.mountedAt) && rp.map.mountedAt >= rp.openAt, JSON.stringify({ openAt: rp.openAt, mountedAt: rp.map?.mountedAt }));
      if (SCENARIO === "normal") {
        ck("Replay：Rift 未就緒時先顯示載入畫面（≥ 3.5s）", rp.shellFirstAt !== null && shellMs >= 3500, shellMs + "ms");
        const heldSlider = rp.shellSlider.filter((v) => Number.isFinite(v));
        ck("Replay：載入畫面期間時間軸不走", heldSlider.length > 3 && Math.max(...heldSlider) === Math.min(...heldSlider), JSON.stringify([heldSlider[0], heldSlider[heldSlider.length - 1]]));
        ck("REPLAY_FIRST_VISIBLE_MAP = rift", rp.map?.firstFrameMode === "rift" && rp.tally?.status === "ready" && rp.tally?.lastSource === "replay", JSON.stringify({ first: rp.map?.firstFrameMode, source: rp.tally?.lastSource }));
        ck("REPLAY_BLOCKOUT_FRAMES = 0（空白幀也是 0）", rp.map?.frames.blockout === 0 && rp.map?.frames.loading === 0 && rp.map?.frames.rift > 0, JSON.stringify(rp.map?.frames));
        ck("Replay：揭露後時間軸開始前進", Number.isFinite(rp.sliderAfter) && rp.sliderAfter > (heldSlider[0] ?? 0), String(rp.sliderAfter));
      } else if (SCENARIO === "failure") {
        ck("Replay FAILURE：不必等滿 20s 就揭露，第一幀 blockout／error，Rift 0 幀、空白 0 幀",
          shellMs < GATE_TIMEOUT_MS && rp.map?.firstFrameMode === "blockout" && rp.map?.firstFrameReason === "error" && rp.map?.frames.rift === 0 && rp.map?.frames.loading === 0,
          shellMs + "ms " + JSON.stringify(rp.map?.frames));
      } else if (SCENARIO === "timeout") {
        ck("Replay TIMEOUT：載入畫面等滿期限才揭露（20s ± 容差）", shellMs >= GATE_TIMEOUT_MS - 1500 && shellMs <= GATE_TIMEOUT_MS + 6000, shellMs + "ms");
        ck("Replay TIMEOUT：第一幀 blockout／timeout，Rift 0 幀、空白 0 幀",
          rp.map?.firstFrameMode === "blockout" && rp.map?.firstFrameReason === "timeout" && rp.map?.frames.rift === 0 && rp.map?.frames.loading === 0, JSON.stringify(rp.map?.frames));
        await release();
        const swapped = await waitFor(chrome, sleep, "window.__ESMO_RIFT_DIAG().map.mapMode === 'rift'", 180000, 500);
        ck("Replay TIMEOUT：放行後換回 Rift", swapped);
        await shot("replay-after-release");
      }
    }

    const consoleErrors = (chrome.consoleLines ?? []).filter((l) => /^\[error\]/.test(l));
    const warnings = [...new Set((chrome.consoleLines ?? []).filter((l) => /^\[warning\]/.test(l)).map((l) => l.slice(0, 120)))];
    const pageErrors = chrome.pageErrors ?? [];
    ck("無 page uncaught error", pageErrors.length === 0, JSON.stringify(pageErrors.slice(0, 3)));
    if (SCENARIO === "normal" && ENTRY !== "replay") ck("console 無 error", consoleErrors.length === 0, JSON.stringify(consoleErrors.slice(0, 5)));
    report.CONSOLE_ERRORS = consoleErrors.slice(0, 8);
    report.CONSOLE_WARNINGS = warnings.slice(0, 8);
    console.log("RIFT_REPORT " + JSON.stringify(report));
  },
});

finishGate(result);
