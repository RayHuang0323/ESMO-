#!/usr/bin/env node
// ============================================================================
//  CS 首次進場「人物晚到」量測（hotfix/cs-loading-rest-ux）
//
//  問題：進 CS Battle 後地圖、名字、血條先出現，3D rigged 人物晚 10～20 秒才出現。
//  這支只量，不判好壞：走正式流程 Home → CS → Practice → 地圖 → 戰術 → Loading → Battle，
//  讀 runtime 自己寫的 `window.__ESMO_CS_LOAD_TIMING__`（正式 build 也有）：
//    ui:cs-loading-mount → ui:cs-loading-done → battle:first-frame（含 riggedPending）→ battle:rigged-ready
//    rig:download:character／rig:download:animation-library（GLB 下載區間）、rig:player-init（每名選手初始化）
//  並另外每 100ms 取樣「Battle 畫面已出現但 rigged 未就緒」的實際秒數（DOM 可見、`__ESMO_CS_LOAD_TIMING__` 尚無 rigged-ready）。
//
//  第 1 次：全新瀏覽器 profile（無 HTTP 快取）；第 2 次：reload 後再進（HTTP 快取已熱、模組快取清空）；
//  第 3 次：同一頁面離開 → 首頁「返回比賽」（模組快取還在）。
//  ESMO_THROTTLE_KBPS=500 ⇒ 限速約 4 Mbps（一般家用／手機網路）。
//
//  執行：node tools/browser/run-gate.mjs tools/browser_measure_cs_rigged_entry.mjs --timeout 1200000
//  正式站：ESMO_EXTERNAL_URL=https://rayhuang0323.github.io/ESMO-/ node tools/browser/run-gate.mjs …（同一支）
//  ⚠ 量測工具不是驗收 gate：ck() 只檢查「量得到」。⚠ evaluate 字串不可含反引號。
// ============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { runGate, finishGate } from "./browser/harness.mjs";

const TARGET_URL = process.env.ESMO_EXTERNAL_URL?.trim() || null;
const OUT = process.env.ESMO_REVIEW_OUT ?? "tmp/cs-rigged-entry";
mkdirSync(OUT, { recursive: true });
const KEY = "esmo.profile.v1";

let savedJson = null;
globalThis.localStorage = {
  getItem: (k) => (k === KEY ? savedJson : null),
  setItem: (k, v) => { if (k === KEY) savedJson = String(v); },
  removeItem: (k) => { if (k === KEY) savedJson = null; },
  clear: () => { savedJson = null; },
};
const { useProfileStore } = await import("../src/platform/profileStore.js");
const st = () => useProfileStore.getState();
st().startNewGame("standard");
st().autoFillLineup("cs");
st().setCsPracticeMap("dust2");
st().setCsAcceptedMapPool(["dust2", "mirage", "inferno"]);
st().save();
const SAVE_TEXT = savedJson;

const result = await runGate({
  name: "CS rigged entry measure", timeoutMs: 1_150_000, externalUrl: TARGET_URL,
  async run({ chrome, url, ck, sleep }) {
    const ev = async (body) => { const r = String(await chrome.evaluate(body)); try { return JSON.parse(r); } catch { try { return JSON.parse(r.replace(/^"|"$/g, "")); } catch { return r; } } };
    const wait = async (expr, ms) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await ev("return JSON.stringify(!!(" + expr + "));")) return true; } catch { /* 換頁中 */ } await sleep(250); } return false; };
    const clickSel = (sel) => chrome.evaluate("const n=document.querySelector(" + JSON.stringify(sel) + "); if(n&&!n.disabled) n.click(); return JSON.stringify(!!n);");
    const vp = (process.env.ESMO_VIEWPORT === "390") ? { width: 390, height: 844, deviceScaleFactor: 2, mobile: true } : { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false };
    await chrome.send("Emulation.setDeviceMetricsOverride", vp);
    //  ESMO_THROTTLE_KBPS：模擬一般家用／手機網路（例如 500 ⇒ 約 4 Mbps）。只限下載頻寬，不加延遲。
    const kbps = Number(process.env.ESMO_THROTTLE_KBPS || 0);
    if (kbps > 0) {
      await chrome.send("Network.enable", {});
      await chrome.send("Network.emulateNetworkConditions", { offline: false, latency: 40, downloadThroughput: kbps * 1024, uploadThroughput: kbps * 1024 });
    }
    await chrome.navigate(url);
    await chrome.evaluate("try{localStorage.clear();sessionStorage.clear();localStorage.setItem(" + JSON.stringify(KEY) + "," + JSON.stringify(SAVE_TEXT) + ");}catch(e){} return 1;");

    async function enter(label, { reload }) {
      if (reload) await chrome.navigate(url);
      await chrome.evaluate("window.__ESMO_CS_LOAD_TIMING__={version:1,entries:[]}; return 1;");
      const t0 = Date.now();
      if (!(await wait("document.querySelector('[data-testid=\"home-mode-cs\"]')", 60000))) return { label, ok: false, why: "no home" };
      await clickSel('[data-testid="home-mode-cs"]');
      await wait("document.querySelector('[data-testid=\"prep-start-practice\"]')", 30000);
      await clickSel('[data-testid="prep-start-practice"]');
      await wait("document.querySelector('[data-testid=\"prep-primary-action\"]')?.dataset.action === 'confirm' || document.querySelector('[data-testid=\"cs-map-confirm\"]')", 30000);
      if (await ev("return JSON.stringify(document.querySelector('[data-testid=\"prep-primary-action\"]')?.dataset.action === 'confirm');")) await clickSel('[data-testid="prep-primary-action"]');
      await wait("document.querySelector('[data-testid=\"cs-map-confirm\"]') && !document.querySelector('[data-testid=\"cs-map-confirm\"]').disabled", 45000);
      await clickSel('[data-testid="cs-map-confirm"]');
      await wait("document.querySelector('[data-testid=\"cs-tactic-confirm\"]')", 30000);
      const tTactic = Date.now();
      await clickSel('[data-testid="cs-tactic-confirm"]');
      //  取樣：Battle DOM（記分板）出現的那一刻 → rigged-ready 的那一刻
      let battleSeenAt = null, riggedAt = null;
      const tEnd = Date.now() + 150000;
      while (Date.now() < tEnd) {
        const s = await ev("const e=(window.__ESMO_CS_LOAD_TIMING__||{entries:[]}).entries; return JSON.stringify({battle: !!document.querySelector('[data-esmo-fps-player-card]'), rigged: e.some(x=>x.name==='battle:rigged-ready'), loading: !!document.querySelector('[data-testid=\"cs-loading-state\"]')});");
        if (s?.battle && battleSeenAt == null) battleSeenAt = Date.now();
        if (s?.rigged) { riggedAt = Date.now(); break; }
        await sleep(100);
      }
      const entries = await ev("return JSON.stringify((window.__ESMO_CS_LOAD_TIMING__||{entries:[]}).entries);");
      const at = (n) => entries.find((x) => x.name === n);
      const span = (n) => entries.filter((x) => x.name === n);
      const mount = at("ui:cs-loading-mount")?.at ?? null;
      const rel = (x) => (x == null || mount == null ? null : Math.round(x - mount));
      const row = {
        label, ok: riggedAt != null,
        tacticToRiggedMs: riggedAt ? riggedAt - tTactic : null,
        battleVisibleWithoutRiggedMs: battleSeenAt && riggedAt ? Math.max(0, riggedAt - battleSeenAt) : null,
        fromLoadingMount: {
          loadingDone: rel(at("ui:cs-loading-done")?.at),
          firstFrame: rel(at("battle:first-frame")?.at),
          firstFrameRiggedPending: at("battle:first-frame")?.detail?.riggedPending ?? null,
          riggedReady: rel(at("battle:rigged-ready")?.at),
          charDownloadEnd: rel(span("rig:download:character")[0]?.end),
          animDownloadEnd: rel(span("rig:download:animation-library")[0]?.end),
        },
        downloadMs: { character: Math.round(span("rig:download:character")[0]?.dur ?? -1), animation: Math.round(span("rig:download:animation-library")[0]?.dur ?? -1) },
        playerInitMs: span("rig:player-init").map((x) => Math.round(x.dur)),
        simMs: Math.round(span("sim:simulateFps")[0]?.dur ?? -1),
        wallMs: Date.now() - t0,
      };
      const shot = await chrome.send("Page.captureScreenshot", { format: "png" });
      writeFileSync(`${OUT}/${label}.png`, Buffer.from(shot.data, "base64"));
      return row;
    }
    const leave = async () => {
      await chrome.evaluate("const b=[...document.querySelectorAll('button')].find(x=>/暫停並離開|離開/.test(x.innerText||'')); if(b) b.click(); return 1;");
      await wait("document.querySelector('[data-testid=\"home-mode-cs\"]') || document.querySelector('[data-testid=\"resume-active-match\"]')", 30000);
      //  練習賽的暫停：清掉進行中的場次，下一次才是「新的一場」
      await chrome.evaluate("try{localStorage.setItem(" + JSON.stringify(KEY) + "," + JSON.stringify(SAVE_TEXT) + ");}catch(e){} return 1;");
    };

    const rows = [];
    rows.push(await enter("1-cold", { reload: true }));
    await leave();
    rows.push(await enter("2-reload-http-warm", { reload: true }));
    //  第 3 次：同一頁面（模組快取還在）離開 → 首頁「返回比賽」→ Battle 重新掛載
    await chrome.evaluate("const b=[...document.querySelectorAll('button')].find(x=>/暫停並離開|離開/.test(x.innerText||'')); if(b) b.click(); return 1;");
    await wait("document.querySelector('[data-testid=\"resume-active-match\"]')", 30000);
    await chrome.evaluate("window.__ESMO_CS_LOAD_TIMING__={version:1,entries:[]}; return 1;");
    const r0 = Date.now(); await clickSel('[data-testid="resume-active-match"]');
    let seen = null, ready = null; while (Date.now() - r0 < 120000) { const s2 = await ev("const e=(window.__ESMO_CS_LOAD_TIMING__||{entries:[]}).entries; return JSON.stringify({battle: !!document.querySelector('[data-esmo-fps-player-card]'), rigged: e.some(x=>x.name==='battle:rigged-ready')});"); if (s2?.battle && seen == null) seen = Date.now(); if (s2?.rigged) { ready = Date.now(); break; } await sleep(100); }
    rows.push({ label: "3-resume-same-page", ok: ready != null, battleVisibleWithoutRiggedMs: seen && ready ? Math.max(0, ready - seen) : null, clickToRiggedMs: ready ? ready - r0 : null });
    for (const r of rows) console.log(JSON.stringify(r));
    writeFileSync(`${OUT}/rows.json`, JSON.stringify(rows, null, 2));
    ck("量得到第 1 次進場", rows[0]?.ok === true, JSON.stringify(rows[0]?.fromLoadingMount));
    ck("量得到第 2 次進場", rows[1]?.ok === true, JSON.stringify(rows[1]?.fromLoadingMount));
    ck("量得到第 3 次（同頁返回）", rows[2]?.ok === true, JSON.stringify(rows[2]));
  },
});
await finishGate(result);
