#!/usr/bin/env node
// ============================================================================
//  CS 進場耗時量測（CS Loading Performance Pass v2）
//
//  執行（dev server，與 browser_measure_cs_lifecycle 同環境）：
//    node tools/browser/run-gate.mjs tools/browser_measure_cs_loading.mjs --timeout 1800000 -- --label before
//  執行（打包後的 bundle，玩家真正拿到的版本）：
//    1. dev 模式加 `--save-out <檔>` 存下乾淨存檔
//    2. `npm run build` 後起 `vite preview --port <p> --strictPort`
//    3. 加 `--external-url http://localhost:<p>/ESMO-/ --save-in <檔>`
//  其他旗標：
//    --headed      真 GPU（預設 headless + --disable-gpu，shader 會被軟體 GL 放大）
//    --cycles N    預設 3：第 1 次完整進場，之後「離開 → 返回同一場」
//    --profile     第 1 次進場錄 CPU profile，只看熱點；開 profiler 的那一輪數字不拿來比較
//
//  ⚠ 這支是**量測工具**，不是驗收 gate：ck() 只檢查「量得到」，不檢查「夠快」。
//  ⚠ 階段時間來自 runtime 自己寫的 `window.__ESMO_CS_LOAD_TIMING__`（csLoadTiming.js）；
//    shader compile／貼圖上傳／ImageBitmap 解碼／long task 由 PROBE 在頁面腳本**之前**注入攔截。
//  ⚠ 進場的點擊序列沿用 browser_measure_cs_lifecycle.mjs（已驗證走得通），不另猜一套。
//  ⚠ 送進 chrome.evaluate 的字串裡不能有反引號（會提早結束樣板字串）。
// ============================================================================
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { RESOLVE_APP_MODULES } from "./browser/cdp.mjs";
import { runGate, finishGate } from "./browser/harness.mjs";

const argValue = (name, fallback = null) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : fallback;
};
const LABEL = argValue("--label", "run");
const CYCLES = Math.max(1, Number(argValue("--cycles", "3")) || 3);
const EXTERNAL_URL = argValue("--external-url");
const SAVE_IN = argValue("--save-in");
const SAVE_OUT = argValue("--save-out");
const PROFILE = process.argv.includes("--profile");
const HEADED = process.argv.includes("--headed");
const PROD = Boolean(EXTERNAL_URL);

const J = (raw) => { const s = String(raw).replace(/^"|"$/g, ""); try { return JSON.parse(s); } catch { return null; } };
const OUT = new URL("../review/cs-loading/", import.meta.url);

const PROBE = `
(() => {
  if (window.__ESMO_LOAD_PROBE__) return;
  const P = { longtasks: [], bitmaps: [], gl: { compileMs: 0, compileCalls: 0, linkMs: 0, linkCalls: 0, statusMs: 0, statusCalls: 0, texUploadMs: 0, texUploadCalls: 0 } };
  window.__ESMO_LOAD_PROBE__ = P;
  //  dev 模式啟動時會載入上百個 module，預設 250 筆的 resource timing 會被塞滿，後面的 .glb 就量不到。
  try { performance.setResourceTimingBufferSize(20000); } catch (e) {}
  try {
    new PerformanceObserver((list) => { for (const e of list.getEntries()) P.longtasks.push([e.startTime, e.duration]); })
      .observe({ type: "longtask", buffered: true });
  } catch (e) {}
  const wrap = (proto, name, bucket) => {
    const orig = proto && proto[name];
    if (typeof orig !== "function") return;
    proto[name] = function () {
      const t = performance.now();
      try { return orig.apply(this, arguments); }
      finally { P.gl[bucket + "Ms"] += performance.now() - t; P.gl[bucket + "Calls"] += 1; }
    };
  };
  for (const C of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) {
    if (!C) continue;
    const p = C.prototype;
    wrap(p, "compileShader", "compile");
    wrap(p, "linkProgram", "link");
    //  Chrome 的 compile/link 是延後的；真正卡住 main thread 的是第一次查狀態。
    wrap(p, "getProgramParameter", "status");
    wrap(p, "getShaderParameter", "status");
    wrap(p, "getProgramInfoLog", "status");
    wrap(p, "getShaderInfoLog", "status");
    wrap(p, "texImage2D", "texUpload");
    wrap(p, "texSubImage2D", "texUpload");
    wrap(p, "texStorage2D", "texUpload");
    wrap(p, "generateMipmap", "texUpload");
  }
  const cib = window.createImageBitmap;
  if (typeof cib === "function") {
    window.createImageBitmap = function () {
      const t = performance.now();
      return cib.apply(this, arguments).then((b) => { P.bitmaps.push([t, performance.now() - t]); return b; });
    };
  }
})();
`;

const readLoad = () => `
  const T = window.__ESMO_CS_LOAD_TIMING__ || { entries: [] };
  const P = window.__ESMO_LOAD_PROBE__ || {};
  const re = /[.](glb|gltf|wav|ogg|mp3|png|jpe?g|webp|ktx2|hdr|bin)([?]|$)/i;
  const resources = performance.getEntriesByType("resource").filter((e) => re.test(e.name)).map((e) => ({
    name: e.name.split("/").slice(-2).join("/"), start: e.startTime, end: e.responseEnd, dur: e.duration,
    transfer: e.transferSize, body: e.encodedBodySize,
  }));
  return JSON.stringify({ now: performance.now(), entries: T.entries, gl: P.gl || null, bitmaps: P.bitmaps || [], longtasks: P.longtasks || [], resources });
`;

//  dev 模式才有 __ESMO_FPS_SCENE__。進場量測結束後才算（不在計時區間內）。
//  返回同一場時若 runtime 沿用上一次的模擬結果，這個 hash 必須與首次進場時完全相同——
//  否則代表播放過程改寫了 frames，沿用就不安全。
const simHash = () => `
  const st = window.__ESMO_FPS_SCENE__;
  const sim = st && st.liveRef && st.liveRef.current ? st.liveRef.current.sim : null;
  if (!sim) return JSON.stringify(null);
  const text = JSON.stringify(sim, (k, v) => (v instanceof Map ? { __map: [...v.entries()] } : v instanceof Set ? { __set: [...v] } : v));
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return JSON.stringify({ sha: [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join(""), bytes: text.length, frames: sim.frames.length });
`;

//  強制 GC 後的 heap（MB）。沒有 GC 的 performance.memory 取決於 GC 剛好跑了沒，前後比較沒有意義。
const heapAfterGc = async (chrome, sleep) => {
  try { await chrome.send("HeapProfiler.collectGarbage", {}); } catch { return null; }
  await sleep(400);
  try { await chrome.send("HeapProfiler.collectGarbage", {}); } catch { return null; }
  await sleep(400);
  return J(await chrome.evaluate("return JSON.stringify(performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null);"));
};

const pageNow = async (chrome) => Number(J(await chrome.evaluate("return JSON.stringify(performance.now());")));

const waitFor = async (chrome, sleep, expr, timeoutMs, everyMs = 150) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const r = J(await chrome.evaluate("return JSON.stringify({ v: Boolean(" + expr + ") });"));
    if (r?.v) return { ok: true, ms: Date.now() - t0 };
    await sleep(everyMs);
  }
  return { ok: false, ms: Date.now() - t0 };
};

const markSince = (name, at) =>
  "(window.__ESMO_CS_LOAD_TIMING__ && window.__ESMO_CS_LOAD_TIMING__.entries || []).some((e) => e.name === " + JSON.stringify(name) + " && e.at >= " + at + ")";

const clickText = (needle) => `
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const el = [...document.querySelectorAll("button")].filter(vis)
    .find((n) => !n.disabled && (n.innerText || "").includes(${JSON.stringify(needle)}));
  if (!el) return JSON.stringify({ ok: false });
  el.click();
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

const BATTLE_DOM = `document.querySelector('[data-testid="cs-match-speed-controls"]') && document.querySelector("canvas")`;

/** 走完整條 CS 進場流程（同 lifecycle 量測）。回傳各 UI 時間點（頁面時鐘）。 */
async function enterBattle(chrome, sleep) {
  const ui = { clickCs: await pageNow(chrome) };
  const fail = (why) => ({ ok: false, why, ui });
  if (!(await waitFor(chrome, sleep, `document.body.innerText.includes("CS")`, 30000)).ok) return fail("首頁沒有 CS");
  if (!J(await chrome.evaluate(clickText("CS")))?.ok) return fail("點不到 CS");
  if (!(await waitFor(chrome, sleep, `document.querySelector('[data-testid="prep-primary-action"]')`, 30000)).ok) return fail("沒有賽前畫面");
  ui.prepVisible = await pageNow(chrome);

  let a = J(await chrome.evaluate(prepAction()));
  if (a?.action === "blocked") {
    await chrome.evaluate(clickText("自動"));
    if (!(await waitFor(chrome, sleep,
      `document.querySelector('[data-testid="prep-primary-action"]')?.dataset.action === "enqueue"`, 20000)).ok) return fail("陣容補不滿");
    a = J(await chrome.evaluate(prepAction()));
  }
  ui.enqueue = await pageNow(chrome);
  if (a?.action === "enqueue" || a?.ok) {
    await waitFor(chrome, sleep,
      `document.querySelector('[data-testid="prep-primary-action"]')?.dataset.action === "confirm" || document.querySelector('[data-map-key]')`, 60000);
    if (J(await chrome.evaluate(`return JSON.stringify({ v: document.querySelector('[data-testid="prep-primary-action"]')?.dataset.action === "confirm" });`))?.v) {
      ui.confirmVisible = await pageNow(chrome);
      await chrome.evaluate(prepAction());
    }
  }
  if (!(await waitFor(chrome, sleep, `document.querySelector('[data-map-key]')`, 60000)).ok) return fail("沒有地圖選擇");
  ui.mapSelectVisible = await pageNow(chrome);
  await chrome.evaluate(`document.querySelector('[data-map-key]')?.click(); return JSON.stringify({});`);
  await sleep(400);
  await chrome.evaluate(`
    const b = [...document.querySelectorAll("button")].filter((n) => !n.disabled && !n.dataset.mapKey);
    b.at(-1)?.click(); return JSON.stringify({});
  `);
  await sleep(900);
  ui.tacticVisible = await pageNow(chrome);
  await chrome.evaluate(`
    const b = [...document.querySelectorAll("button")].filter((n) => !n.disabled && (n.innerText || "").length > 20);
    b[0]?.click(); return JSON.stringify({});
  `);
  await sleep(400);
  ui.tacticConfirm = await pageNow(chrome);
  await chrome.evaluate(`
    const b = [...document.querySelectorAll("button")].filter((n) => !n.disabled);
    b.at(-1)?.click(); return JSON.stringify({});
  `);
  return { ok: true, ui };
}

async function resumeBattle(chrome) {
  const ui = { clickResume: await pageNow(chrome) };
  const r = J(await chrome.evaluate(`
    const el = document.querySelector('[data-testid="resume-active-match"]');
    if (!el) return JSON.stringify({ ok: false, why: "首頁沒有『返回對戰』入口" });
    el.scrollIntoView({ block: 'center' }); el.click();
    return JSON.stringify({ ok: true });
  `));
  return r?.ok ? { ok: true, ui } : { ok: false, why: r?.why, ui };
}

async function leaveBattle(chrome, sleep) {
  await chrome.evaluate(`
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const el = document.querySelector('[data-testid="leave-active-match"]')
      || [...document.querySelectorAll("button")].filter(vis).find((n) => /返回|離開|首頁/.test(n.innerText || ""));
    if (el) el.click();
    return JSON.stringify({ found: !!el });
  `);
  await sleep(2500);
}

const seedDev = () => `
  ${RESOLVE_APP_MODULES}
  const store = profile.useProfileStore;
  localStorage.removeItem("esmo.profile.v1");
  store.getState().startNewGame("elite");
  await new Promise((r) => setTimeout(r, 400));
  store.getState().save();
  const dump = {};
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); dump[k] = localStorage.getItem(k); }
  return JSON.stringify({ players: store.getState().players.length, dump });
`;

// ── 分析 ─────────────────────────────────────────────────────────────────────
const r1 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v));

/** 合併重疊區間後的總長（非同步工作會互相重疊，不能直接相加當牆鐘時間）。 */
function unionMs(intervals) {
  const xs = intervals.filter(([s, e]) => Number.isFinite(s) && Number.isFinite(e) && e > s).sort((a, b) => a[0] - b[0]);
  let total = 0, cs = null, ce = null;
  for (const [s, e] of xs) {
    if (cs == null) { cs = s; ce = e; continue; }
    if (s <= ce) ce = Math.max(ce, e); else { total += ce - cs; cs = s; ce = e; }
  }
  if (cs != null) total += ce - cs;
  return total;
}

function summarize({ kind, t0, before, after }) {
  const E = after.entries.filter((e) => e.at >= t0 - 0.5);
  const spans = (name) => E.filter((e) => e.name === name && e.dur != null);
  const firstOf = (name) => E.find((e) => e.name === name) ?? null;
  const sum = (name) => spans(name).reduce((s, e) => s + e.dur, 0);
  const cnt = (name) => spans(name).length;
  const endOf = (e) => (e ? (e.end ?? e.at) : null);

  const ready = firstOf("battle:rigged-ready");
  const firstFrame = firstOf("battle:first-frame");
  const readyAt = ready?.at ?? after.now;
  const inWin = ([s]) => s >= t0 && s <= readyAt;

  const gl = (k) => (after.gl && before.gl ? after.gl[k] - before.gl[k] : null);
  const res = after.resources.filter((r) => r.start >= t0 - 0.5 && r.start <= readyAt);
  const glbRes = res.filter((r) => /[.]glb/i.test(r.name));
  const audioRes = res.filter((r) => /[.](wav|ogg|mp3)/i.test(r.name));
  const longtasks = after.longtasks.filter(inWin);
  const bitmaps = after.bitmaps.filter(inWin);

  const loadingMount = firstOf("ui:cs-loading-mount");
  const loadingDone = firstOf("ui:cs-loading-done");
  const matchRender = firstOf("ui:cs-match-first-render");
  const simSpan = spans("sim:simulateFps")[0] ?? null;
  const resultSpan = spans("sim:buildMatchResult")[0] ?? null;
  const mapBuild = spans("scene:map-build")[0] ?? null;

  //  牆鐘關鍵路徑：依時間順序切段，各段相加 = 總長（誤差只在量測點本身）。
  const cuts = [
    ["ui-transition", t0],
    ["fixed-loading-timer", loadingMount?.at],
    ["react-mount", loadingDone?.at ?? (kind === "return" ? null : undefined)],
    ["simulate-match", simSpan?.at],
    ["scene-construction", endOf(resultSpan) ?? endOf(simSpan)],
    ["first-frame-render", endOf(mapBuild)],
    ["wait-rig-assets", firstFrame?.at],
    ["end", ready?.at],
  ].filter(([, at]) => Number.isFinite(at));
  const critical = {};
  for (let i = 0; i < cuts.length - 1; i++) critical[cuts[i][0]] = r1(cuts[i + 1][1] - cuts[i][1]);

  const loadStart = kind === "first" ? (loadingMount?.at ?? t0) : t0;
  return {
    kind,
    endToEndMs: r1(readyAt - t0),
    loadMs: r1(readyAt - loadStart),
    firstFrameMs: r1((firstFrame?.at ?? NaN) - loadStart),
    critical,
    phases: {
      "asset-download:glb": { wallMs: r1(unionMs(glbRes.map((r) => [r.start, r.end]))), files: glbRes.map((r) => ({ name: r.name, ms: r1(r.dur), transfer: r.transfer, body: r.body })) },
      "asset-download:audio": { wallMs: r1(unionMs(audioRes.map((r) => [r.start, r.end]))), sumMs: r1(audioRes.reduce((s, r) => s + r.dur, 0)), files: audioRes.length, bytes: audioRes.reduce((s, r) => s + (r.body || 0), 0), cachedFiles: audioRes.filter((r) => r.transfer === 0).length },
      "gltf:character": { downloadMs: r1(sum("rig:download:character")), parseMs: r1(sum("rig:parse:character")) },
      "gltf:animation-library": { downloadMs: r1(sum("rig:download:animation-library")), parseMs: r1(sum("rig:parse:animation-library")), clipMapSumMs: r1(sum("rig:player-clip-map")), clipMapCalls: cnt("rig:player-clip-map") },
      "texture-decode": { imageBitmapSumMs: r1(bitmaps.reduce((s, [, d]) => s + d, 0)), imageBitmaps: bitmaps.length, glUploadMs: r1(gl("texUploadMs")), glUploadCalls: gl("texUploadCalls"), proceduralFloorMs: r1(sum("scene:floor-texture")) },
      "map-environment": { environmentMs: r1(sum("scene:map-environment")), staticWorldMs: r1(sum("scene:static-world")) },
      "player-rig-init": { scenePlayersMs: r1(sum("scene:players")), rigInitSumMs: r1(sum("rig:player-init")), rigInitCalls: cnt("rig:player-init"), prepareRootSumMs: r1(sum("rig:player-prepare-root")) },
      "shader-compile": { blockingGlMs: r1((gl("compileMs") ?? 0) + (gl("linkMs") ?? 0) + (gl("statusMs") ?? 0)), programsLinked: gl("linkCalls"), firstRenderMs: r1(sum("gpu:first-render")), firstRiggedRenderMs: r1(sum("gpu:first-rigged-render")) },
      "audio": { fetchSumMs: r1(sum("audio:fetch")), decodeSumMs: r1(sum("audio:decode")), preloadWallMs: r1(sum("audio:preload-all")) },
      "scene-construction": { rendererInitMs: r1(sum("scene:renderer-init")), fxPoolsMs: r1(sum("scene:fx-pools")), mapBuildTotalMs: r1(sum("scene:map-build")) },
      "main-thread": { simulateFpsMs: r1(sum("sim:simulateFps")), simulateCalls: cnt("sim:simulateFps"), simReuse: E.filter((e) => e.name === "sim:reuse").length, buildMatchResultMs: r1(sum("sim:buildMatchResult")), fixedLoadingTimerMs: r1(loadingDone && loadingMount ? loadingDone.at - loadingMount.at : null), longTaskTotalMs: r1(longtasks.reduce((s, [, d]) => s + d, 0)), longTasks: longtasks.length, longestTaskMs: r1(Math.max(0, ...longtasks.map(([, d]) => d))) },
    },
    marks: {
      loadingMount: r1(loadingMount?.at - t0), loadingDone: r1(loadingDone?.at - t0), matchRender: r1(matchRender?.at - t0),
      firstFrame: r1(firstFrame?.at - t0), riggedReady: r1(ready?.at - t0), riggedCount: ready?.detail?.rigged ?? null,
      primitiveLeakFrames: ready?.detail?.primitiveLeakFrames ?? null, pendingFrames: ready?.detail?.pendingFrames ?? null,
    },
  };
}

function aggregateProfile(profile, topN = 35) {
  const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const key = (n) => {
    const cf = n.callFrame;
    const file = String(cf.url || "").split("/").pop().split("?")[0];
    return `${cf.functionName || "(anonymous)"} @ ${file}:${cf.lineNumber + 1}`;
  };
  const self = new Map(), total = new Map();
  for (let i = 0; i < profile.samples.length; i++) {
    const dt = (profile.timeDeltas[i] || 0) / 1000;
    let id = profile.samples[i];
    const n = nodes.get(id);
    if (!n) continue;
    const k = key(n);
    self.set(k, (self.get(k) || 0) + dt);
    const seen = new Set();
    while (id != null) {
      const kk = key(nodes.get(id));
      if (!seen.has(kk)) { seen.add(kk); total.set(kk, (total.get(kk) || 0) + dt); }
      id = parent.get(id);
    }
  }
  const top = (m) => [...m.entries()].filter(([k]) => !/^\((root|program|idle|garbage collector)\)/.test(k))
    .sort((a, b) => b[1] - a[1]).slice(0, topN).map(([k, ms]) => ({ fn: k, ms: Math.round(ms) }));
  const gc = [...self.entries()].filter(([k]) => k.startsWith("(garbage collector)")).reduce((s, [, v]) => s + v, 0);
  return { selfTop: top(self), totalTop: top(total), gcMs: Math.round(gc) };
}

// ── 主流程 ───────────────────────────────────────────────────────────────────
const result = await runGate({
  name: `CS 進場耗時量測（${LABEL}）`,
  externalUrl: EXTERNAL_URL,
  timeoutMs: 1_700_000,
  run: async ({ chrome, url, ck, sleep }) => {
    mkdirSync(OUT, { recursive: true });
    await chrome.send("Page.addScriptToEvaluateOnNewDocument", { source: PROBE });
    await chrome.send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });

    await chrome.navigate(url); await sleep(1600);
    if (PROD) {
      const dump = JSON.parse(readFileSync(SAVE_IN, "utf8"));
      await chrome.evaluate("localStorage.clear(); const d = " + JSON.stringify(dump) + "; for (const k of Object.keys(d)) localStorage.setItem(k, d[k]); return JSON.stringify({ n: Object.keys(d).length });");
      ck("precondition：載入乾淨存檔（打包版）", Object.keys(dump).length > 0, `${Object.keys(dump).length} keys`);
    } else {
      const s = J(await chrome.evaluate(seedDev()));
      ck("precondition：乾淨存檔", s?.players > 0, `${s?.players ?? 0} 名`);
      if (SAVE_OUT && s?.dump) writeFileSync(SAVE_OUT, JSON.stringify(s.dump));
    }
    await chrome.navigate(url); await sleep(2000);

    const cycles = [];
    let profileSummary = null;
    const baselineHeapGcMB = await heapAfterGc(chrome, sleep);
    console.log(`首頁 heap（GC 後）${baselineHeapGcMB} MB`);
    for (let cycle = 1; cycle <= CYCLES; cycle++) {
      const kind = cycle === 1 ? "first" : "return";
      console.log(`\n════ 第 ${cycle} 次（${kind === "first" ? "完整進場" : "返回同一場"}）════`);
      const before = J(await chrome.evaluate(readLoad()));
      const t0 = before.now;

      let enter;
      if (kind === "first") {
        if (PROFILE) {
          await chrome.send("Profiler.enable", {});
          await chrome.send("Profiler.setSamplingInterval", { interval: 500 });
        }
        enter = await enterBattle(chrome, sleep);
      } else {
        enter = await resumeBattle(chrome);
      }
      ck(`第 ${cycle} 次${kind === "first" ? "進場" : "返回"}流程走得通`, enter.ok, enter.why ?? "");
      if (!enter.ok) break;
      if (kind === "first" && PROFILE) await chrome.send("Profiler.start", {});

      const dom = await waitFor(chrome, sleep, BATTLE_DOM, 240000, 100);
      const rigged = await waitFor(chrome, sleep, markSince("battle:rigged-ready", t0), 240000, 100);
      ck(`第 ${cycle} 次量到 battle:rigged-ready`, dom.ok && rigged.ok);

      if (kind === "first" && PROFILE) {
        const { profile } = await chrome.send("Profiler.stop", {}, 300000);
        profileSummary = aggregateProfile(profile);
        await chrome.send("Profiler.disable", {});
      }
      await sleep(1500);
      const after = J(await chrome.evaluate(readLoad()));
      const sim = PROD ? null : J(await chrome.evaluate(simHash()));
      const summary = { cycle, ui: Object.fromEntries(Object.entries(enter.ui).map(([k, v]) => [k, r1(v - t0)])), ...summarize({ kind, t0, before, after }), sim };
      cycles.push(summary);
      console.log(`   loadMs=${summary.loadMs}  endToEnd=${summary.endToEndMs}  firstFrame=${summary.firstFrameMs}`);
      console.log(`   關鍵路徑 ${JSON.stringify(summary.critical)}`);
      console.log(`   rigged 就位前：等待 ${summary.marks.pendingFrames ?? "?"} 格，其中舊 primitive 露出 ${summary.marks.primitiveLeakFrames ?? "?"} 格`);
      if (sim) console.log(`   sim sha ${sim.sha.slice(0, 16)}（${sim.frames} frames, ${(sim.bytes / 1048576).toFixed(1)} MB JSON）｜reuse ${summary.phases["main-thread"].simReuse}`);

      await sleep(1500);
      await leaveBattle(chrome, sleep);
      summary.heapAfterLeaveGcMB = await heapAfterGc(chrome, sleep);
      console.log(`   離場後 heap（GC 後）${summary.heapAfterLeaveGcMB} MB`);
    }

    const report = {
      label: LABEL, mode: PROD ? "production-bundle" : "vite-dev", headed: HEADED, cycles: CYCLES, profile: PROFILE,
      url: PROD ? EXTERNAL_URL : "(vite dev)", at: new Date().toISOString(), baselineHeapGcMB, results: cycles, cpuProfile: profileSummary,
    };
    const file = `cs-loading-${LABEL}.json`;
    writeFileSync(new URL(file, OUT), JSON.stringify(report, null, 2));

    const first = cycles.find((c) => c.kind === "first");
    const returns = cycles.filter((c) => c.kind === "return");
    ck("量得到完整進場的 simulateFps", (first?.phases?.["main-thread"]?.simulateCalls ?? 0) >= 1);
    ck("量得到 GLB 下載或快取命中", first ? first.phases["gltf:character"].parseMs != null || first.phases["asset-download:glb"].files.length > 0 : false);
    if (!PROD && returns.length) {
      ck("返回時的模擬結果與首次進場逐位元組相同（沿用不會帶到被改寫的 frames）",
        cycles.every((c) => c.sim?.sha && c.sim.sha === cycles[0].sim?.sha),
        cycles.map((c) => c.sim?.sha?.slice(0, 12) ?? "null").join(" → "));
    }
    const pageErrs = chrome.pageErrors ?? [];
    ck("無 page-origin uncaught error", pageErrs.length === 0, pageErrs.slice(0, 2).join(" ¦ ") || "clean");

    console.log("\n── 摘要 ──");
    console.log(`模式 ${report.mode}${HEADED ? "（headed / 真 GPU）" : "（headless / 軟體 GL）"}`);
    for (const c of cycles) console.log(`第 ${c.cycle} 次 ${c.kind}: load ${(c.loadMs / 1000).toFixed(1)}s ｜ end-to-end ${(c.endToEndMs / 1000).toFixed(1)}s ｜ first frame ${(c.firstFrameMs / 1000).toFixed(1)}s`);
    if (first) {
      console.log("\n完整進場關鍵路徑（ms / 佔 load）：");
      //  ui-transition 含腳本點擊的固定等待，不屬於 load；其餘各段的百分比以 loadMs（Loading 畫面出現 → rigged 就位）為分母。
      for (const [k, v] of Object.entries(first.critical)) console.log(`  ${k.padEnd(22)} ${String(v).padStart(7)}  ${k === "ui-transition" ? "(不計入 load)" : first.loadMs ? ((v / first.loadMs) * 100).toFixed(1) + "%" : "-"}`);
      console.log("\n完整進場分項：");
      for (const [k, v] of Object.entries(first.phases)) console.log(`  ${k.padEnd(24)} ${JSON.stringify(v)}`);
    }
    if (returns.length) console.log(`\n返回：${returns.map((c) => JSON.stringify(c.critical)).join("\n      ")}`);
    if (profileSummary) {
      console.log(`\nCPU profile（第 1 次進場，GC ${profileSummary.gcMs}ms）self top 15：`);
      for (const r of profileSummary.selfTop.slice(0, 15)) console.log(`  ${String(r.ms).padStart(7)}ms  ${r.fn}`);
      console.log("total top 15：");
      for (const r of profileSummary.totalTop.slice(0, 15)) console.log(`  ${String(r.ms).padStart(7)}ms  ${r.fn}`);
    }
    console.log(`\n數據：review/cs-loading/${file}`);
  },
});

finishGate(result);
