#!/usr/bin/env node
// ============================================================================
//  tools/browser_probe_battle_rate.mjs — 戰鬥推進速度／幀率探針（量測工具，不是 gate）
//
//  執行：node tools/browser_probe_battle_rate.mjs [--secs=60] [--quality=low] [--w=390 --h=844 --mobile=1] [--headed]
//  ?debug=moba-runtime-battle 開局，等到戰鬥開始後取樣 secs 秒：模擬秒推進速度（ts／實秒）、rAF 平均 fps。
//  headless 是軟體渲染，絕對值偏低；用途是在同一台機器上比較 candidate 與 main。
// ============================================================================
import { runGate, finishGate } from "./browser/harness.mjs";

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `=${d}`).split("=").slice(1).join("=");
const SECS = Number(arg("secs", "60"));
const Q = arg("quality", "low");
const W = Number(arg("w", "1366")), H = Number(arg("h", "900")), MOBILE = arg("mobile", "0") === "1";

const result = await runGate({
  name: "戰鬥推進速度探針",
  timeoutMs: (SECS + 240) * 1000,
  async run({ chrome, url, ck, sleep }) {
    const J = (r) => { const s = String(r); for (const t of [s, s.replace(/^"|"$/g, "")]) { try { return JSON.parse(t); } catch { /* next */ } } return null; };
    await chrome.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: MOBILE ? 2 : 1, mobile: MOBILE });
    await chrome.send("Runtime.enable").catch(() => {});
    await chrome.navigate(`${url}?debug=moba-runtime-battle&shot=rate&waitTs=99999&quality=${Q}`);
    await chrome.evaluate("window.__errs=[]; const oe=console.error; console.error=(...a)=>{ window.__errs.push(a.map(String).join(' ').slice(0,300)); oe(...a); }; window.addEventListener('error',e=>window.__errs.push('onerror '+e.message)); window.addEventListener('unhandledrejection',e=>window.__errs.push('rej '+(e.reason&&e.reason.stack||e.reason))); return JSON.stringify(1);");
    let ts0 = 0;
    for (let i = 0; i < 120 && ts0 <= 1; i++) { await sleep(1000); ts0 = Number(J(await chrome.evaluate("return JSON.stringify(window.__BATTLE_TS||0);"))) || 0; }
    await chrome.evaluate("window.__rafN=0; (function f(){ window.__rafN++; requestAnimationFrame(f); })(); return JSON.stringify(1);");
    const a = Number(J(await chrome.evaluate("return JSON.stringify(window.__BATTLE_TS||0);"))) || 0;
    const t0 = Date.now();
    await sleep(SECS * 1000);
    const b = J(await chrome.evaluate("return JSON.stringify({ts:window.__BATTLE_TS||0, raf:window.__rafN||0});"));
    const dt = (Date.now() - t0) / 1000;
    const rate = (b.ts - a) / dt, fps = b.raf / dt;
    console.log(`PROBE ${W}x${H} q=${Q}: 模擬推進 ${rate.toFixed(2)} 模擬秒／實秒，rAF ${fps.toFixed(1)} fps（${dt.toFixed(0)} 秒，ts ${a.toFixed(0)}→${b.ts.toFixed(0)}）`);
    const errs = chrome.pageErrors ?? [];
    console.log("pageErrors", errs.length, errs.slice(0, 3).join(" ¦ ").slice(0, 600));
    console.log("consoleErrors", JSON.stringify(J(await chrome.evaluate("return JSON.stringify((window.__errs||[]).slice(0,5));"))).slice(0, 1200));
    const st = J(await chrome.evaluate("return JSON.stringify(window.__BATTLE_STATS||null);"));
    console.log("stats", JSON.stringify(st).slice(0, 300));
    ck("取樣完成", Number.isFinite(rate));
  },
});
finishGate(result);
