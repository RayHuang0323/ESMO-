#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_moba_rift_loading.mjs — MOBA Rift Loading 瀏覽器實測（progress-aware 閘門）
//
//  走玩家真的會走的路：首頁 → MOBA 賽前 → Ban/Pick（真的點英雄）→ Tactic →
//  Loading → Battle，讀 ?diag=1 的 __ESMO_RIFT_DIAG／__ESMO_RUNTIME_DIAG 逐幀記帳。
//
//  本機（production build，由本工具自己起靜態伺服器控制 GLB 傳輸速度）：
//    npm run build
//    node tools/browser/run-gate.mjs tools/browser_check_moba_rift_loading.mjs --timeout 1200000 -- \
//      --serve dist --entry resume --scenario slow [--mobile] [--shots <dir>]
//  正式站（只能 normal／failure）：
//    ... -- --url https://rayhuang0323.github.io/ESMO-/ --entry normal --scenario normal --replay
//
//  --entry normal   Ban/Pick → Loading → Battle（--replay：賽後再開 Replay）
//  --entry resume   先打到戰鬥，停用快取重新整理（新的 session）→ 首頁「返回進行中的比賽」
//  --entry replay   戰鬥期間讓 GLB 失敗（以 blockout 進場）→ 快速完成 → 第一次開 Replay
//
//  --scenario normal   正常速度
//  --scenario slow     （--serve）GLB 以固定速度 30 秒傳完、持續有進度 ⇒ 不得 fallback
//  --scenario stall    （--serve）傳到 40% 後完全停住 ⇒ 最後進度後約 10 秒 blockout／stall；放行後換回 Rift
//  --scenario crawl    （--serve）持續極慢（100 KB/s）⇒ 滿 60 秒 blockout／timeout
//  --scenario failure  連線錯誤 ⇒ 立即 blockout／error（--serve 由伺服器斷線；正式站用 CDP Fetch）
//  --mobile            390×844 DPR3 觸控 ＋ 4G（1.125 MB/s、60ms）
//
//  ⚠ chrome.evaluate 的字串裡不能有反引號。
// ============================================================================
import http from "node:http";
import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync, createReadStream } from "node:fs";
import { resolve, extname, join, normalize, sep } from "node:path";
import { runGate, finishGate } from "./browser/harness.mjs";

const argValue = (name, fallback = null) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : fallback;
};
const SERVE = argValue("--serve");
const ENTRY = argValue("--entry", "normal");
const SCENARIO = argValue("--scenario", "normal");
const SHOTS = argValue("--shots");
const MOBILE = process.argv.includes("--mobile");
const WITH_REPLAY = process.argv.includes("--replay");
//  與 src/battle/moba/map/riftMapGate.js 相同
const STALL_MS = 10_000;
const HARD_MS = 60_000;
const SCENARIO_MODE = { normal: "pass", slow: "slow", stall: "stall", crawl: "crawl", failure: "fail" }[SCENARIO];
if (!SCENARIO_MODE || (!SERVE && ["slow", "stall", "crawl"].includes(SCENARIO))) {
  console.error("unsupported scenario " + SCENARIO + (SERVE ? "" : " (slow/stall/crawl need --serve)"));
  process.exit(2);
}

// ── 本機靜態伺服器：只服務 dist，GLB 傳輸速度由 riftMode 控制（產品程式碼沒有測試開關）──────
let riftMode = "pass";          // pass | slow | stall | crawl | fail
const PACE = { slow: 447_506, crawl: 100_000, stall: 2_000_000 };   // bytes/s；slow ≈ 13.4 MB / 30s
const STALL_AT = 0.4;
const riftStreams = new Set();
const riftRequests = [];
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".json": "application/json", ".glb": "model/gltf-binary",
  ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav", ".woff2": "font/woff2", ".woff": "font/woff", ".ico": "image/x-icon" };
async function startServer(distDir) {
  const root = resolve(distDir);
  let glbCache = null;
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    if (!u.pathname.startsWith("/ESMO-/")) { res.writeHead(302, { location: "/ESMO-/" }); res.end(); return; }
    let rel = decodeURIComponent(u.pathname.slice("/ESMO-/".length)) || "index.html";
    let file = normalize(join(root, rel));
    if (!file.startsWith(root + sep) && file !== root) { res.writeHead(403); res.end(); return; }
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, "index.html");
    if (/esmo-rift-[\w-]+\.glb$/.test(file)) {
      const mode = riftMode;
      riftRequests.push({ at: Date.now(), mode });
      if (mode === "fail") { req.socket.destroy(); return; }
      glbCache ??= readFileSync(file);
      const buf = glbCache;
      res.writeHead(200, { "content-type": "model/gltf-binary", "content-length": buf.length, "cache-control": "no-store" });
      if (mode === "pass") { res.end(buf); return; }
      const s = { released: false, sent: 0 };
      riftStreams.add(s);
      const tick = setInterval(() => {
        if (mode === "stall" && !s.released && s.sent >= buf.length * STALL_AT) return;   // 完全停住：不送任何位元組
        const n = Math.min(buf.length - s.sent, Math.ceil(PACE[mode] / 10));
        res.write(buf.subarray(s.sent, s.sent + n)); s.sent += n;
        if (s.sent >= buf.length) { clearInterval(tick); riftStreams.delete(s); res.end(); }
      }, 100);
      req.on("close", () => { clearInterval(tick); riftStreams.delete(s); });
      return;
    }
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-cache" });
    createReadStream(file).pipe(res);
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  return { url: "http://127.0.0.1:" + server.address().port + "/ESMO-/", close: () => { server.closeAllConnections?.(); server.close(); } };
}
const releaseStalls = () => { for (const s of riftStreams) s.released = true; };

const served = SERVE ? await startServer(SERVE) : null;
const URL_ = served ? served.url : argValue("--url", "https://rayhuang0323.github.io/ESMO-/");

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
  name: "MOBA Rift Loading (entry " + ENTRY + ", " + SCENARIO + (WITH_REPLAY ? " + replay" : "") + (MOBILE ? ", 390 + 4G" : ", desktop") + (SERVE ? ", local" : ", external") + ")",
  externalUrl: URL_,
  timeoutMs: 1_100_000,
  run: async ({ chrome, ck, sleep }) => {
    if (SHOTS) mkdirSync(SHOTS, { recursive: true });
    const tag = (SERVE ? "local-" : "ext-") + ENTRY + "-" + SCENARIO + "-" + (MOBILE ? "mobile" : "desktop");
    const shot = async (name) => {
      if (!SHOTS) return;
      try { const { data } = await chrome.send("Page.captureScreenshot", { format: "jpeg", quality: 70 }); writeFileSync(SHOTS + "/" + tag + "-" + name + ".jpg", Buffer.from(data, "base64")); } catch { /* ignore */ }
    };
    const report = { entry: ENTRY, scenario: SCENARIO, mobile: MOBILE, local: !!SERVE };
    await chrome.send("Page.addScriptToEvaluateOnNewDocument", { source: "try { performance.setResourceTimingBufferSize(20000); } catch (e) {}" });
    await chrome.send("Network.enable", {});
    if (MOBILE) {
      await chrome.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
      await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
      await chrome.send("Network.emulateNetworkConditions", { offline: false, latency: 60, downloadThroughput: 1_125_000, uploadThroughput: 187_500 });
    } else {
      await chrome.send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    }

    //  正式站沒有伺服器可控，失敗改用 CDP Fetch。
    let fetchFail = false;
    if (!SERVE && (SCENARIO === "failure" || ENTRY === "replay")) {
      chrome.on("Fetch.requestPaused", (p) => {
        if (fetchFail) chrome.send("Fetch.failRequest", { requestId: p.requestId, errorReason: "Failed" }).catch(() => {});
        else chrome.send("Fetch.continueRequest", { requestId: p.requestId }).catch(() => {});
      });
      await chrome.send("Fetch.enable", { patterns: [{ urlPattern: "*esmo-rift*", requestStage: "Request" }] });
    }
    const setMode = (m) => { riftMode = m; fetchFail = m === "fail"; };
    //  進戰鬥前的傳輸方式
    setMode(ENTRY === "normal" ? SCENARIO_MODE : ENTRY === "replay" ? "fail" : "pass");

    const url = URL_ + (URL_.includes("?") ? "&" : "?") + "diag=1";
    await chrome.navigate(url); await sleep(2500);
    await chrome.evaluate("localStorage.removeItem('esmo.profile.v1'); return JSON.stringify({});");
    await chrome.navigate(url); await sleep(3000);

    // ── 1. 打到戰鬥 ──────────────────────────────────────────────────────────
    ck("首頁有 MOBA 入口", await waitFor(chrome, sleep, "document.querySelector('[data-testid=\"home-mode-moba\"]')", 60000));
    await sleep(2000);
    const atHome = await readRift(chrome);
    ck("首頁不下載 Rift（無請求、下載器未啟動）", atHome.entries.length === 0 && !atHome.diag, JSON.stringify(atHome.entries));
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

    /** 從目前畫面等到戰場掛上，途中記 Loading 閘門；掛上當下立刻讀一次下載狀態。 */
    const waitBattle = async (startAt, timeoutMs = 240000) => {
      const gates = [];
      let loadingSeen = false, battleAt = null;
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const r = J(await chrome.evaluate("const b = document.querySelector('[data-testid=\"moba-loading-progress\"]'); return JSON.stringify({ now: Math.round(performance.now()), gate: b ? b.dataset.mapGate : null, reason: b ? b.dataset.mapGateReason : null, battle: !!(document.querySelector('[data-testid=\"battle-hud\"]') && document.querySelector('canvas')) });"));
        if (r?.gate) { loadingSeen = true; if (gates[gates.length - 1]?.gate !== r.gate) gates.push({ at: r.now, gate: r.gate, reason: r.reason }); }
        if (r?.battle) { battleAt = r.now; break; }
        await sleep(200);
      }
      const atMount = battleAt === null ? null : (await readRift(chrome)).diag;
      const fallbackAt = gates.find((g) => g.gate === "blockout")?.at ?? null;
      return { gates, loadingSeen, battleAt, loadingMs: battleAt === null ? null : battleAt - startAt, atMount, fallbackAt };
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

    /**
     * 依情境判定一個入口的結果。
     * @param r { map, atMount（揭露當下）, later（揭露 3 秒後）, waitMs, fallbackAt, downloadStartsAtEntry }
     */
    const judge = async (label, r) => {
      const frames = r.map?.frames;
      const d = r.later;
      if (SCENARIO === "normal" || SCENARIO === "slow") {
        ck(label + "：第一個看得到的地圖 = rift", r.map?.firstFrameMode === "rift", JSON.stringify({ first: r.map?.firstFrameMode, reason: r.map?.firstFrameReason }));
        ck(label + "：blockout 0 幀、空白 0 幀", frames?.blockout === 0 && frames?.loading === 0 && frames?.rift > 0, JSON.stringify(frames));
        if (SCENARIO === "slow") {
          const dl = d?.readyAt - d?.startedAt;
          ck(label + "：下載本身 25–35 秒且持續有進度", dl >= 25000 && dl <= 35000, dl + "ms");
          ck(label + "：沒有觸發 stall／hard timeout", !d?.latchedReason && d?.status === "ready", JSON.stringify({ latched: d?.latchedReason, status: d?.status }));
          if (r.downloadStartsAtEntry) ck(label + "：等待超過舊的 20 秒仍未 fallback", r.waitMs > 20000, r.waitMs + "ms");
        }
      } else if (SCENARIO === "stall") {
        ck(label + "：第一幀 blockout／stall，Rift 0 幀、空白 0 幀",
          r.map?.firstFrameMode === "blockout" && r.map?.firstFrameReason === "stall" && frames?.rift === 0 && frames?.loading === 0, JSON.stringify(frames));
        const idle = r.fallbackAt - r.atMount?.lastProgressAt;
        const sinceGate = r.fallbackAt - r.atMount?.gateStartAt;
        const idleBase = r.fallbackAt - Math.max(r.atMount?.gateStartAt ?? 0, r.atMount?.lastProgressAt ?? 0);
        ck(label + "：最後一次有效進度（或閘門開始）後約 10 秒 fallback，不等 60 秒",
          idleBase >= STALL_MS - 300 && idleBase <= STALL_MS + 3500 && sinceGate < HARD_MS - 20000, JSON.stringify({ idle, idleBase, sinceGate }));
        ck(label + "：fallback 當下下載確實停在中途", r.atMount?.status === "loading" && r.atMount?.loadedBytes > 0 && r.atMount?.loadedBytes < 13425188 * 0.6, String(r.atMount?.loadedBytes));
        releaseStalls();
        const swapped = await waitFor(chrome, sleep, "window.__ESMO_RIFT_DIAG().map.mapMode === 'rift'", 90000, 500);
        const after = (await readRift(chrome)).diag;
        ck(label + "：恢復傳輸後就緒，戰場換回 Rift", swapped && after?.map.switches.some((s) => s.from === "blockout" && s.to === "rift"), JSON.stringify(after?.map.switches));
      } else if (SCENARIO === "crawl") {
        ck(label + "：第一幀 blockout／timeout，Rift 0 幀、空白 0 幀",
          r.map?.firstFrameMode === "blockout" && r.map?.firstFrameReason === "timeout" && frames?.rift === 0 && frames?.loading === 0, JSON.stringify(frames));
        const sinceGate = r.fallbackAt - r.atMount?.gateStartAt;
        ck(label + "：閘門開始後滿 60 秒 hard cap fallback", sinceGate >= HARD_MS - 300 && sinceGate <= HARD_MS + 3500, sinceGate + "ms");
        ck(label + "：fallback 前後仍持續有下載進度（不是 stall）",
          d?.status === "loading" && d?.loadedBytes > r.atMount?.loadedBytes && (r.fallbackAt - r.atMount?.lastProgressAt) < STALL_MS,
          JSON.stringify({ atMount: r.atMount?.loadedBytes, later: d?.loadedBytes, idleAtFallback: r.fallbackAt - r.atMount?.lastProgressAt }));
      } else if (SCENARIO === "failure") {
        ck(label + "：不等 stall／hard 期限就進場（< 10 秒），第一幀 blockout／error，Rift 0 幀、空白 0 幀",
          r.waitMs < STALL_MS && r.map?.firstFrameMode === "blockout" && r.map?.firstFrameReason === "error" && frames?.rift === 0 && frames?.loading === 0,
          r.waitMs + "ms " + JSON.stringify(frames));
      }
    };

    /** 快速完成 → 賽後 → 開 Replay，逐 200ms 記載入畫面／時間軸，直到 Replay 戰場 canvas 掛上。 */
    const openReplay = async ({ timeoutMs = 150000, beforeOpen = null } = {}) => {
      await chrome.evaluate("window.confirm = () => true; return JSON.stringify({});");
      await chrome.evaluate(clickSel("[data-testid=\"quick-finish-match\"]"));
      const ended = await waitFor(chrome, sleep, "[...document.querySelectorAll('button')].some((b) => (b.innerText || '').includes('觀看重播'))", 300000, 500);
      ck("前置：快速完成後出現「觀看重播」", ended);
      if (!ended) return null;
      await sleep(800);
      beforeOpen?.();
      await chrome.evaluate(clickText("觀看重播"));
      const openAt = await pageNow(chrome);
      let shellFirstAt = null, shellLastAt = null, revealAt = null;
      const shellSlider = [];
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const r = J(await chrome.evaluate("const s = document.querySelector('[data-testid=\"rift-entry-loading\"]'); const sl = document.querySelector('input[aria-label=\"重播時間軸\"]'); return JSON.stringify({ now: Math.round(performance.now()), shell: !!s, canvas: !!document.querySelector('[data-replay-presentation] canvas'), slider: sl ? Number(sl.value) : null });"));
        if (r?.shell) { if (shellFirstAt === null) shellFirstAt = r.now; shellLastAt = r.now; shellSlider.push(r.slider); }
        if (r?.canvas) { revealAt = r.now; break; }
        await sleep(200);
      }
      const atMount = revealAt === null ? null : (await readRift(chrome)).diag;
      await sleep(3000);
      const later = (await readRift(chrome)).diag;
      const slider = J(await chrome.evaluate("const sl = document.querySelector('input[aria-label=\"重播時間軸\"]'); return JSON.stringify(sl ? Number(sl.value) : null);"));
      await shot("replay-03s");
      return { openAt, shellFirstAt, shellLastAt, revealAt, shellSlider, sliderAfter: slider, atMount, later, map: later?.map ?? null };
    };

    // ── 2A. 正常入口 ─────────────────────────────────────────────────────────
    if (ENTRY === "normal") {
      const later = (await readRift(chrome)).diag;
      const runtime = J(await chrome.evaluate(RUNTIME));
      const map = later?.map ?? null;
      report.NORMAL = { loadingMs: first.loadingMs, gates: first.gates, map, rift: later && { status: later.status, attempts: later.attempts, startedAt: later.startedAt, readyAt: later.readyAt, lastProgressAt: later.lastProgressAt, gateStartAt: later.gateStartAt, latchedReason: later.latchedReason, loadedBytes: later.loadedBytes } };
      if (SCENARIO === "normal") {
        report.RIFT_READY = later?.readyAt != null ? { msAfterPreloadStart: later.readyAt - later.firstStartedAt, msBeforeBattleMount: (map?.mountedAt ?? first.battleAt) - later.readyAt } : null;
        ck("RIFT_READY：戰場掛載前 Rift 已就緒", later?.status === "ready" && Number.isFinite(later.readyAt) && later.readyAt <= map?.mountedAt, JSON.stringify(report.RIFT_READY));
      }
      if (SCENARIO !== "normal") report.RIFT_DOWNLOAD_MS = later?.readyAt ? later.readyAt - later.startedAt : null;
      await judge("NORMAL", { map, atMount: first.atMount, later, waitMs: first.loadingMs, fallbackAt: first.fallbackAt, downloadStartsAtEntry: false });
      if (SCENARIO === "normal" || SCENARIO === "failure") checkBattleBasics(runtime, "NORMAL");
      if (SCENARIO === "normal") {
        const cam = J(await chrome.evaluate("return JSON.stringify(typeof window.__ESMO_RUNTIME_SETCAM === 'function' ? window.__ESMO_RUNTIME_SETCAM({ fitAll: true }) : null);"));
        ck("相機：收全場指令可用", !!cam && Number.isFinite(cam.zoom), JSON.stringify(cam));
        await sleep(6000);
        const cont = (await readRift(chrome)).diag;
        ck("持續 ≥ 10 秒：blockout 仍 0 幀、沒有切換", cont?.map.frames.blockout === 0 && cont?.map.switches.length === 0, JSON.stringify(cont?.map.frames));
        if (WITH_REPLAY) {
          const rp = await openReplay();
          report.REPLAY_READY = rp && { shell: rp.shellFirstAt !== null, map: rp.map };
          ck("REPLAY（Rift 已就緒）：第一個看得到的地圖 rift、blockout 0 幀、空白 0 幀",
            rp?.revealAt !== null && rp?.map?.mountedAt >= rp.openAt && rp.map.firstFrameMode === "rift" && rp.map.frames.blockout === 0 && rp.map.frames.loading === 0,
            JSON.stringify(rp?.map?.frames));
          ck("REPLAY（Rift 已就緒）：時間軸有前進", Number.isFinite(rp?.sliderAfter) && rp.sliderAfter > 0, String(rp?.sliderAfter));
        }
      }
    }

    // ── 2B. Resume：停用快取重新整理（新的 session）→ 返回進行中的比賽 ─────────
    if (ENTRY === "resume") {
      const before = J(await chrome.evaluate(RUNTIME));
      ck("前置：戰鬥真的開打且以 Rift 進場", before?.firstMapFrameMode === "rift" && Number.isFinite(before?.ts), JSON.stringify({ ts: before?.ts, first: before?.firstMapFrameMode }));
      await sleep(3000);
      const tsBeforeReload = J(await chrome.evaluate(RUNTIME))?.ts;
      await chrome.send("Network.setCacheDisabled", { cacheDisabled: true });
      setMode(SCENARIO_MODE);
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
      const later = (await readRift(chrome)).diag;
      const runtime = J(await chrome.evaluate(RUNTIME));
      report.RESUME = { loadingMs: rs.loadingMs, gates: rs.gates, tsBeforeReload, tsAfter: runtime?.ts, map: later?.map, rift: later && { status: later.status, firstSource: later.firstSource, attempts: later.attempts, startedAt: later.startedAt, readyAt: later.readyAt, lastProgressAt: later.lastProgressAt, gateStartAt: later.gateStartAt, latchedReason: later.latchedReason } };
      //  failure 情境請求幾毫秒就失敗，閘門可能在第一次 200ms 取樣前就翻成 blockout；那一刻畫面仍是 Loading。
      ck("Resume：Rift 未就緒時先顯示既有 Loading 畫面（不是直接進戰場）",
        rs.loadingSeen && (SCENARIO === "failure" || rs.gates[0]?.gate === "loading"), JSON.stringify(rs.gates));
      ck("Resume：比賽接續同一場（時間不重開）", Number.isFinite(runtime?.ts) && runtime.ts >= tsBeforeReload, JSON.stringify({ tsBeforeReload, tsAfter: runtime?.ts }));
      await judge("RESUME", { map: later?.map, atMount: rs.atMount, later, waitMs: rs.loadingMs, fallbackAt: rs.fallbackAt, downloadStartsAtEntry: true });
      if (SCENARIO === "normal" || SCENARIO === "failure" || SCENARIO === "slow") checkBattleBasics(runtime, "RESUME");
    }

    // ── 2C. Replay：戰鬥以 blockout 進場（Rift 未就緒）→ 快速完成 → 第一次開 Replay ──
    if (ENTRY === "replay") {
      const battle = (await readRift(chrome)).diag;
      ck("前置：戰鬥以 blockout 進場、Rift 未就緒", battle?.status === "failed" && battle?.map.firstFrameMode === "blockout", JSON.stringify({ status: battle?.status, first: battle?.map.firstFrameMode }));
      const rp = await openReplay({ beforeOpen: () => setMode(SCENARIO_MODE) });
      if (!rp) return;
      report.REPLAY = { openAt: rp.openAt, shellFirstAt: rp.shellFirstAt, revealAt: rp.revealAt, slider: [rp.shellSlider[0], rp.sliderAfter], map: rp.map, rift: rp.later && { status: rp.later.status, attempts: rp.later.attempts, lastSource: rp.later.lastSource, startedAt: rp.later.startedAt, readyAt: rp.later.readyAt, lastProgressAt: rp.later.lastProgressAt, gateStartAt: rp.later.gateStartAt, latchedReason: rp.later.latchedReason } };
      const shellMs = rp.shellFirstAt === null ? 0 : (rp.revealAt ?? rp.shellLastAt) - rp.shellFirstAt;
      ck("Replay：戰場 canvas 有掛上", rp.revealAt !== null);
      ck("Replay：Replay 的地圖自己記帳（掛載晚於開啟）", Number.isFinite(rp.map?.mountedAt) && rp.map.mountedAt >= rp.openAt, JSON.stringify({ openAt: rp.openAt, mountedAt: rp.map?.mountedAt }));
      if (SCENARIO !== "failure") {
        ck("Replay：Rift 未就緒時先顯示載入畫面", rp.shellFirstAt !== null && shellMs >= 1000, shellMs + "ms");
        const held = rp.shellSlider.filter((v) => Number.isFinite(v));
        ck("Replay：揭露前時間軸不前進", held.length > 3 && Math.max(...held) === Math.min(...held), JSON.stringify([held[0], held[held.length - 1]]));
      }
      await judge("REPLAY", { map: rp.map, atMount: rp.atMount, later: rp.later, waitMs: shellMs, fallbackAt: rp.revealAt, downloadStartsAtEntry: true });
      if (SCENARIO === "normal" || SCENARIO === "slow") ck("Replay：揭露後時間軸開始前進", Number.isFinite(rp.sliderAfter) && rp.sliderAfter > (rp.shellSlider[0] ?? 0), String(rp.sliderAfter));
    }

    const consoleErrors = (chrome.consoleLines ?? []).filter((l) => /^\[error\]/.test(l));
    const warnings = [...new Set((chrome.consoleLines ?? []).filter((l) => /^\[warning\]/.test(l)).map((l) => l.slice(0, 120)))];
    const pageErrors = chrome.pageErrors ?? [];
    ck("無 page uncaught error", pageErrors.length === 0, JSON.stringify(pageErrors.slice(0, 3)));
    if ((SCENARIO === "normal" || SCENARIO === "slow") && ENTRY !== "replay") ck("console 無 error", consoleErrors.length === 0, JSON.stringify(consoleErrors.slice(0, 5)));
    report.RIFT_REQUESTS = riftRequests.map((x) => x.mode);
    report.CONSOLE_ERRORS = consoleErrors.slice(0, 8);
    report.CONSOLE_WARNINGS = warnings.slice(0, 8);
    console.log("RIFT_REPORT " + JSON.stringify(report));
  },
});

served?.close();
finishGate(result);
