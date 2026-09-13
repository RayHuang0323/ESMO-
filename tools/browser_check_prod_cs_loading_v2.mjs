#!/usr/bin/env node
// ============================================================================
//  正式站 CS Loading v2 release smoke（GitHub Pages）
//
//  執行：
//    node tools/browser/run-gate.mjs tools/browser_check_prod_cs_loading_v2.mjs --timeout 1500000 -- \
//      --save-in <乾淨存檔.json> [--url https://rayhuang0323.github.io/ESMO-/] [--shots <截圖資料夾>] [--headed]
//  乾淨存檔：`browser_measure_cs_loading.mjs` 的 dev 模式加 `--save-out <檔>` 產生。
//
//  流程：CS → Prep → Loading → 10 名 rigged 就位 → Battle（取樣動畫、確認比賽推進）
//        → 離場 → 返回同一場 → 離場 → 返回同一場 → 快速完成 → 賽後結果。
//
//  ⚠ 正式站是打包後的 bundle：沒有 `/src/...`，也沒有 DEV-only 的 `__ESMO_FPS_SCENE__`。
//    只讀一定會發佈的東西：`__ESMO_FPS_C2A__`（角色 controller 診斷）、`__ESMO_FPS_TEARDOWN__`、
//    `__ESMO_CS_LOAD_TIMING__`（CS Loading v2 的階段時間）、localStorage 存檔、DOM。
//  ⚠ 模擬 hash 在正式站讀不到（sim 物件沒有對外 handle）。這裡驗的是「返回時沒有重跑模擬」
//    （`sim:reuse` 有、`sim:simulateFps` 沒有）與總 frame 數不變；逐位元組等價由
//    `check_cs_loading_v2_sim_equivalence.mjs` 在同一份原始碼上證明。
//  ⚠ 「快速完成」用 window.confirm 確認；原生對話框會卡死 CDP，所以測試時先把 confirm 換成回 true。
//  ⚠ 送進 chrome.evaluate 的字串裡不能有反引號。
// ============================================================================
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { runGate, finishGate } from "./browser/harness.mjs";

const argValue = (name, fallback = null) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : fallback;
};
const URL_ = argValue("--url", "https://rayhuang0323.github.io/ESMO-/");
const SAVE_IN = argValue("--save-in");
const SHOTS = argValue("--shots");
const HEADED = process.argv.includes("--headed");
const J = (raw) => { const s = String(raw).replace(/^"|"$/g, ""); try { return JSON.parse(s); } catch { return null; } };
const OUT = new URL("../review/cs-loading/", import.meta.url);

//  必須出現的動作片段（fpsCharacterAssets.js 的 manifest）：Idle / Walk / Sprint / Aim / Fire / Hit / Death。
const REQUIRED_CLIPS = ["Idle_Loop", "Walk_Loop", "Sprint_Loop", "Pistol_Aim_Neutral", "Pistol_Shoot", "Hit_Chest", "Death01"];

const PROBE = `
(() => {
  if (window.__ESMO_PROD_PROBE__) return;
  const P = { glContexts: 0, ctxRefs: [], lostAttached: 0, lostDetached: 0 };
  window.__ESMO_PROD_PROBE__ = P;
  const gc = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (t) {
    const ctx = gc.apply(this, arguments);
    if (String(t).includes("webgl") && ctx && !P.ctxRefs.includes(ctx)) {
      P.glContexts += 1; P.ctxRefs.push(ctx);
      //  離場時 runtime 會先移除 canvas 再 forceContextLoss（刻意釋放）⇒ 那種不算異常。
      this.addEventListener("webglcontextlost", () => { if (this.isConnected) P.lostAttached += 1; else P.lostDetached += 1; });
    }
    return ctx;
  };
})();
`;

const snap = () => `
  const P = window.__ESMO_PROD_PROBE__ || {};
  const C = window.__ESMO_FPS_C2A__ || { players: {} };
  const players = Object.entries(C.players || {});
  const T = (window.__ESMO_CS_LOAD_TIMING__ || { entries: [] }).entries;
  const text = (id) => { const el = document.querySelector('[data-testid="' + id + '"]'); return el ? el.innerText : null; };
  return JSON.stringify({
    now: performance.now(),
    canvas: document.querySelectorAll("canvas").length,
    glAcquired: P.glContexts || 0,
    glAlive: (P.ctxRefs || []).filter((c) => { try { return !c.isContextLost(); } catch (e) { return false; } }).length,
    lostAttached: P.lostAttached || 0, lostDetached: P.lostDetached || 0,
    sceneHandle: Boolean(window.__ESMO_FPS_SCENE__),
    teardown: window.__ESMO_FPS_TEARDOWN__ || null,
    rigged: players.filter((e) => e[1].mode === "rigged").length,
    mixers: players.filter((e) => e[1].mixer).length,
    playerIds: players.map((e) => e[0]).sort(),
    clips: players.map((e) => e[1].currentClip).filter(Boolean),
    heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
    frameText: text("cs-match-frame-progress"), scoreText: text("cs-match-live-score"),
    entries: T,
  });
`;

const identity = () => `
  const raw = localStorage.getItem("esmo.profile.v1");
  if (!raw) return JSON.stringify(null);
  let data; try { data = JSON.parse(raw); } catch (e) { return JSON.stringify({ parseError: true }); }
  let found = null;
  const walk = (o, depth) => {
    if (found || !o || typeof o !== "object" || depth > 14) return;
    if (o.sessionId && o.activeMatch && typeof o.activeMatch === "object") {
      const a = o.activeMatch, cs = a.config && a.config.csConfig ? a.config.csConfig : {};
      const snapShot = a.simulation && a.simulation.snapshot ? a.simulation.snapshot : {};
      found = { sessionId: o.sessionId, matchId: a.matchId || null, status: a.status || null, seed: a.seed != null ? a.seed : (o.seed != null ? o.seed : null),
        mapKey: cs.mapKey || null, tacticId: cs.tacticId || null, lineup: a.lineup ? JSON.stringify(a.lineup) : null,
        frameIndex: snapShot.frameIndex != null ? snapShot.frameIndex : null, totalFrames: snapShot.totalFrames != null ? snapShot.totalFrames : null };
      return;
    }
    for (const k of Object.keys(o)) walk(o[k], depth + 1);
  };
  walk(data, 0);
  return JSON.stringify(found);
`;

const waitFor = async (chrome, sleep, expr, timeoutMs, everyMs = 150) => {
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
const heapAfterGc = async (chrome, sleep) => {
  try { await chrome.send("HeapProfiler.collectGarbage", {}); await sleep(400); await chrome.send("HeapProfiler.collectGarbage", {}); } catch { return null; }
  await sleep(400);
  return J(await chrome.evaluate("return JSON.stringify(performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null);"));
};

/** 同 browser_measure_cs_loading.mjs 的進場序列（已在打包版走通）。回傳按下戰術確認的頁面時間。 */
async function enterBattle(chrome, sleep) {
  if (!(await waitFor(chrome, sleep, `document.body.innerText.includes("CS")`, 30000))) return { ok: false, why: "首頁沒有 CS" };
  if (!J(await chrome.evaluate(clickText("CS")))?.ok) return { ok: false, why: "點不到 CS" };
  if (!(await waitFor(chrome, sleep, `document.querySelector('[data-testid="prep-primary-action"]')`, 30000))) return { ok: false, why: "沒有賽前畫面" };
  let a = J(await chrome.evaluate(prepAction()));
  if (a?.action === "blocked") {
    await chrome.evaluate(clickText("自動"));
    if (!(await waitFor(chrome, sleep, `document.querySelector('[data-testid="prep-primary-action"]')?.dataset.action === "enqueue"`, 20000))) return { ok: false, why: "陣容補不滿" };
    a = J(await chrome.evaluate(prepAction()));
  }
  if (a?.action === "enqueue" || a?.ok) {
    await waitFor(chrome, sleep, `document.querySelector('[data-testid="prep-primary-action"]')?.dataset.action === "confirm" || document.querySelector('[data-map-key]')`, 60000);
    if (J(await chrome.evaluate(`return JSON.stringify({ v: document.querySelector('[data-testid="prep-primary-action"]')?.dataset.action === "confirm" });`))?.v) await chrome.evaluate(prepAction());
  }
  if (!(await waitFor(chrome, sleep, `document.querySelector('[data-map-key]')`, 60000))) return { ok: false, why: "沒有地圖選擇" };
  await chrome.evaluate(`document.querySelector('[data-map-key]')?.click(); return JSON.stringify({});`);
  await sleep(400);
  await chrome.evaluate(`const b = [...document.querySelectorAll("button")].filter((n) => !n.disabled && !n.dataset.mapKey); b.at(-1)?.click(); return JSON.stringify({});`);
  await sleep(900);
  await chrome.evaluate(`const b = [...document.querySelectorAll("button")].filter((n) => !n.disabled && (n.innerText || "").length > 20); b[0]?.click(); return JSON.stringify({});`);
  await sleep(400);
  const confirmAt = await pageNow(chrome);
  await chrome.evaluate(`const b = [...document.querySelectorAll("button")].filter((n) => !n.disabled); b.at(-1)?.click(); return JSON.stringify({});`);
  return { ok: true, confirmAt };
}

const result = await runGate({
  name: "正式站 CS Loading v2 release smoke",
  externalUrl: URL_,
  timeoutMs: 1_400_000,
  run: async ({ chrome, ck, sleep }) => {
    mkdirSync(OUT, { recursive: true });
    if (SHOTS) mkdirSync(SHOTS, { recursive: true });
    const shot = async (name) => {
      if (!SHOTS) return;
      try {
        const { data } = await chrome.send("Page.captureScreenshot", { format: "jpeg", quality: 70 });
        writeFileSync(`${SHOTS}/${name}.jpg`, Buffer.from(data, "base64"));
      } catch { /* 截圖失敗不影響判定 */ }
    };
    await chrome.send("Page.addScriptToEvaluateOnNewDocument", { source: PROBE });
    await chrome.send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });

    ck("precondition：給了乾淨存檔", Boolean(SAVE_IN), SAVE_IN ?? "缺 --save-in");
    if (!SAVE_IN) return;
    await chrome.navigate(URL_); await sleep(1600);
    const dump = JSON.parse(readFileSync(SAVE_IN, "utf8"));
    await chrome.evaluate("localStorage.clear(); const d = " + JSON.stringify(dump) + "; for (const k of Object.keys(d)) localStorage.setItem(k, d[k]); return JSON.stringify({});");
    await chrome.navigate(URL_); await sleep(2500);
    const bundle = J(await chrome.evaluate(`return JSON.stringify([...document.querySelectorAll("script[src]")].map((s) => s.getAttribute("src")));`));
    ck("正式站載入的是 CS Loading v2 bundle（entry 可讀）", Array.isArray(bundle) && bundle.some((s) => /assets\/index-/.test(s)), (bundle || []).join(" "));

    const report = { url: URL_, headed: HEADED, at: new Date().toISOString(), bundle, cycles: [] };
    const spansSince = (entries, name, at) => entries.filter((e) => e.name === name && e.at >= at && e.dur != null);
    const marksSince = (entries, name, at) => entries.filter((e) => e.name === name && e.at >= at);

    // ── 第 1 次：完整進場 ───────────────────────────────────────────────────
    const t0 = await pageNow(chrome);
    const enter = await enterBattle(chrome, sleep);
    ck("首次：CS → Prep → 地圖 → 戰術 流程走得通", enter.ok, enter.why ?? "");
    if (!enter.ok) return;
    const ready1 = await waitFor(chrome, sleep, markSince("battle:rigged-ready", t0), 240000, 100);
    const s1 = J(await chrome.evaluate(snap()));
    const loadingMount = marksSince(s1.entries, "ui:cs-loading-mount", t0)[0];
    const readyMark = marksSince(s1.entries, "battle:rigged-ready", t0)[0];
    const firstLoadMs = readyMark && loadingMount ? Math.round(readyMark.at - loadingMount.at) : null;
    const sims1 = spansSince(s1.entries, "sim:simulateFps", t0);
    ck("首次：10 名角色 ready 並進入 Battle", ready1 && s1.rigged === 10 && s1.mixers === 10, `rigged ${s1.rigged}／mixer ${s1.mixers}`);
    ck("首次：進場時間明顯低於舊版 80 秒級（< 45s）", firstLoadMs != null && firstLoadMs < 45000, `${(firstLoadMs / 1000).toFixed(1)}s（Loading 出現 → 10 名 rigged 就位）`);
    ck("首次：整場模擬只跑一次", sims1.length === 1, `${sims1.length} 次，${sims1.map((e) => Math.round(e.dur)).join(",")}ms`);
    ck("首次：對戰中存活 WebGL context = 1、沒有 context lost", s1.glAlive === 1 && s1.lostAttached === 0, `alive ${s1.glAlive}｜lost(掛載中) ${s1.lostAttached}`);
    await shot("01-battle-first-entry");

    //  動畫取樣：4 倍速播放，收集每位選手目前的片段，直到 Idle/Walk/Sprint/Aim/Fire/Hit/Death 都出現或逾時。
    await chrome.evaluate(click('[data-testid="match-speed-4"]'));
    const seen = new Set();
    let frameA = s1.frameText, frameB = null;
    const tSample = Date.now();
    while (Date.now() - tSample < 150000) {
      const s = J(await chrome.evaluate(snap()));
      for (const c of s.clips) seen.add(c);
      frameB = s.frameText;
      if (REQUIRED_CLIPS.every((c) => seen.has(c))) break;
      await sleep(350);
    }
    await shot("02-battle-mid");
    const missing = REQUIRED_CLIPS.filter((c) => !seen.has(c));
    ck("動畫：Idle／Walk／Sprint／Aim／Fire／Hit／Death 都有播放", missing.length === 0, missing.length ? `缺 ${missing.join(",")}｜看到 ${[...seen].join(",")}` : [...seen].join(","));
    ck("比賽會正常推進（frame 進度有前進）", Boolean(frameB) && frameB !== frameA, `${(frameA || "").replace(/\s+/g, " ").slice(0, 60)} → ${(frameB || "").replace(/\s+/g, " ").slice(0, 60)}`);
    await chrome.evaluate(click('[data-testid="match-speed-1"]'));
    await sleep(1500);
    const idBefore = J(await chrome.evaluate(identity()));
    const idsBefore = J(await chrome.evaluate(snap())).playerIds;
    report.cycles.push({ kind: "first", firstLoadMs, simulateMs: sims1.map((e) => Math.round(e.dur)), rigged: s1.rigged, clipsSeen: [...seen], identity: idBefore });

    // ── 離場 → 返回同一場（兩次）─────────────────────────────────────────────
    const returnLoads = [];
    for (let i = 1; i <= 2; i++) {
      await chrome.evaluate(click('[data-testid="leave-active-match"]'));
      await sleep(2500);
      const heap = await heapAfterGc(chrome, sleep);
      const left = J(await chrome.evaluate(snap()));
      ck(`離場 ${i}：canvas 清掉、WebGL context 釋放、場景清空`,
        left.canvas === 0 && left.glAlive === 0 && left.teardown?.sceneChildren === 0 && left.sceneHandle === false,
        `canvas ${left.canvas}｜alive ${left.glAlive}｜teardown sceneChildren ${left.teardown?.sceneChildren}｜sceneHandle ${left.sceneHandle}｜heap(GC) ${heap}MB`);
      await shot(`0${2 + i}-home-after-leave-${i}`);

      const tr = await pageNow(chrome);
      const resumed = J(await chrome.evaluate(click('[data-testid="resume-active-match"]')));
      ck(`返回 ${i}：首頁有「返回對戰」並可點`, resumed?.ok === true);
      if (!resumed?.ok) break;
      const ready = await waitFor(chrome, sleep, markSince("battle:rigged-ready", tr), 120000, 100);
      const s = J(await chrome.evaluate(snap()));
      const r = marksSince(s.entries, "battle:rigged-ready", tr)[0];
      const loadMs = r ? Math.round(r.at - tr) : null;
      returnLoads.push(loadMs);
      const reuse = marksSince(s.entries, "sim:reuse", tr).length, resim = spansSince(s.entries, "sim:simulateFps", tr).length;
      const idAfter = J(await chrome.evaluate(identity()));
      ck(`返回 ${i}：10 名角色 ready`, ready && s.rigged === 10 && s.mixers === 10, `rigged ${s.rigged}／mixer ${s.mixers}`);
      ck(`返回 ${i}：秒級（< 5s）`, loadMs != null && loadMs < 5000, `${(loadMs / 1000).toFixed(2)}s`);
      ck(`返回 ${i}：沒有重跑整場模擬（沿用）`, reuse >= 1 && resim === 0, `reuse ${reuse}｜simulateFps ${resim}`);
      for (const key of ["sessionId", "matchId", "seed", "mapKey", "tacticId", "lineup", "totalFrames"]) {
        ck(`返回 ${i}：${key} 不變`, idBefore && idAfter && idBefore[key] != null && String(idBefore[key]) === String(idAfter[key]),
          key === "lineup" ? `${String(idBefore?.lineup).length} chars` : `${idBefore?.[key]} → ${idAfter?.[key]}`);
      }
      ck(`返回 ${i}：選手 identity 相同（10 人同一組 id）`, JSON.stringify(s.playerIds) === JSON.stringify(idsBefore), s.playerIds.join(","));
      ck(`返回 ${i}：沒有 WebGL context lost`, s.glAlive === 1 && s.lostAttached === 0, `alive ${s.glAlive}｜lost(掛載中) ${s.lostAttached}`);
      await sleep(2500);
      report.cycles.push({ kind: "return", loadMs, reuse, resim, rigged: s.rigged, heapAfterPreviousLeaveGcMB: heap, identity: idAfter });
      await shot(`0${4 + i}-battle-return-${i}`);
    }
    ck("返回不會越來越慢", returnLoads.length === 2 && returnLoads[1] <= returnLoads[0] * 2 + 1000, returnLoads.map((m) => `${m}ms`).join(" → "));

    // ── 快速完成 → 賽後結果 ────────────────────────────────────────────────
    await chrome.evaluate("window.confirm = () => true; return JSON.stringify({});");
    const qf = J(await chrome.evaluate(click('[data-testid="quick-finish-match"]')));
    ck("快速完成可以按", qf?.ok === true);
    const resultBar = await waitFor(chrome, sleep, `[...document.querySelectorAll("button")].some((b) => (b.innerText || "").includes("查看賽後戰報"))`, 120000, 250);
    ck("比賽完成後出現賽後戰報入口", resultBar);
    await shot("08-match-complete");
    await chrome.evaluate(clickText("查看賽後戰報"));
    const resultScreen = await waitFor(chrome, sleep, `document.body.innerText.includes("返回 Dashboard") && document.body.innerText.includes("MVP")`, 60000, 250);
    const resultText = J(await chrome.evaluate(`return JSON.stringify(document.body.innerText.slice(0, 400));`));
    ck("賽後結果畫面正常（有 MVP 與返回 Dashboard）", resultScreen, String(resultText || "").replace(/\s+/g, " ").slice(0, 120));
    await shot("09-result");

    const consoleErrors = (chrome.consoleLines ?? []).filter((l) => l.startsWith("[error]"));
    const pageErrors = chrome.pageErrors ?? [];
    ck("console 無 page-origin uncaught error", pageErrors.length === 0, pageErrors.slice(0, 2).join(" ¦ ") || "clean");
    report.consoleErrors = consoleErrors.slice(0, 20);
    report.pageErrors = pageErrors.slice(0, 20);
    report.returnLoads = returnLoads;
    writeFileSync(new URL("prod-release-smoke.json", OUT), JSON.stringify(report, null, 2));
    console.log(`\nFIRST_LOAD_PRODUCTION = ${(firstLoadMs / 1000).toFixed(1)}s ｜ RETURN_LOAD_PRODUCTION = ${returnLoads.map((m) => (m / 1000).toFixed(2) + "s").join(" / ")}`);
    console.log(`console [error] 行數：${consoleErrors.length}${consoleErrors.length ? "｜" + consoleErrors.slice(0, 3).join(" ¦ ") : ""}`);
    console.log("數據：review/cs-loading/prod-release-smoke.json");
  },
});

finishGate(result);
