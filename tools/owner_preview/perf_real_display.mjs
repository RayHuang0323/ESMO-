#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/perf_real_display.mjs — 以 Owner 的真實顯示條件量測 MOBA 對戰（2026-11-12；量測工具，不是 gate；不改任何程式）
//
//  與 perf_gl_frames_v21.mjs 的差別：**不**用 Emulation 覆寫解析度與 DPR。Chrome 開成全螢幕，DPR 用系統縮放（這台 150% ⇒ 1.5），
//  也就是 Owner 錄影時的條件（1920×1080 實體像素）。之前所有量測都釘在 1366×900、DPR 1，沒有量到這個情況。
//
//  每段量：
//   · rAF 間隔（fps、P50／P95／P99、> 50／100 ms 的幀數、最長）
//   · 主執行緒忙碌 %（CDP Performance.TaskDuration）、long task 的總時間與次數
//   · 模擬 tick：包住 window.setInterval，記每次 callback 的執行時間與「晚到多少」（依間隔分組；1× 500 ms、2× 250、4× 125）
//   · 遊戲時間推進：讀 HUD 的比賽時間（m:ss），算「遊戲秒／真實秒」——2× 應該接近 2
//   · canvas 實際繪圖緩衝大小與 devicePixelRatio
//  段落：畫質高 2× 30 秒 → 畫質低 2× 30 秒 → 畫質低 1× 20 秒（ESMO_SEGMENTS 可改，格式 "high:2:30,low:2:30"）。
//  ESMO_ANGLE=d3d11-warp-webgl：模擬『硬體加速關閉』的 Chrome（Owner 的實際狀態，2026-11-12 查到；改用 lib_cdp_chrome.mjs 啟動）。
//  執行：ESMO_EXTERNAL_URL=... ESMO_REVIEW_OUT=<資料夾> ESMO_PERF_LABEL=... node tools/browser/run-gate.mjs tools/owner_preview/perf_real_display.mjs --timeout 900000 -- --headed
//  ⚠ 一定要 --headed。⚠ chrome.evaluate 的字串裡不能有反引號。
// ============================================================================
import { writeFileSync, mkdirSync } from "node:fs";
import { runGate, finishGate } from "../browser/harness.mjs";
import { flowOf } from "./lib_battle_flow.mjs";
import { launchChrome } from "./lib_cdp_chrome.mjs";

const TARGET_URL = process.env.ESMO_EXTERNAL_URL?.trim() || null;
const LABEL = process.env.ESMO_PERF_LABEL ?? "run";
const OUT = process.env.ESMO_REVIEW_OUT ?? "tmp/moba-real-display";
const SEGMENTS = (process.env.ESMO_SEGMENTS ?? "high:2:30,low:2:30,low:1:20").split(",").map((s) => { const [q, r, sec] = s.split(":"); return { q, rate: Number(r), sec: Number(sec) }; });
mkdirSync(OUT, { recursive: true });

const INJECT = `(() => {
  if (window.__rd) return;
  const R = window.__rd = { on: false, frames: [], last: 0, iv: [], lt: [] };
  const raf = (t) => { if (R.on && R.last) R.frames.push(+(t - R.last).toFixed(2)); R.last = t; requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
  const si = window.setInterval;
  window.setInterval = function (fn, ms, ...a) {
    if (typeof fn !== 'function') return si.call(this, fn, ms, ...a);
    let due = performance.now() + (ms || 0);
    const w = function () { const s = performance.now(); try { return fn.apply(this, arguments); } finally { const e = performance.now(); if (R.on && ms >= 100) R.iv.push({ ms: ms, dur: +(e - s).toFixed(2), late: +(s - due).toFixed(1) }); due = s + (ms || 0); } };
    return si.call(this, w, ms, ...a);
  };
  try { new PerformanceObserver((l) => { if (!R.on) return; for (const e of l.getEntries()) R.lt.push(+e.duration.toFixed(1)); }).observe({ type: 'longtask', buffered: false }); } catch (e) {}
})();`;

const pct = (s, q) => (s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : null);
function frameStats(fr) {
  const s = fr.slice().sort((a, b) => a - b); const sum = fr.reduce((a, b) => a + b, 0);
  return { frames: fr.length, fps: fr.length ? +(1000 * fr.length / sum).toFixed(1) : 0, p50: pct(s, 0.5), p95: pct(s, 0.95), p99: pct(s, 0.99), max: s[s.length - 1] ?? null, over50: fr.filter((x) => x > 50).length, over100: fr.filter((x) => x > 100).length, over200: fr.filter((x) => x > 200).length };
}
function ivStats(iv) {
  const by = {};
  for (const x of iv) (by[x.ms] ??= []).push(x);
  return Object.fromEntries(Object.entries(by).map(([ms, l]) => { const d = l.map((x) => x.dur).sort((a, b) => a - b); const late = l.map((x) => x.late).sort((a, b) => a - b); return [ms, { n: l.length, durMean: +(d.reduce((a, b) => a + b, 0) / d.length).toFixed(1), durP95: pct(d, 0.95), durMax: d[d.length - 1], lateP50: pct(late, 0.5), lateP95: pct(late, 0.95), lateMax: late[late.length - 1] }]; }));
}

async function measure({ chrome, url, ck, sleep }) {
    const { ev, click, toBattle } = flowOf({ chrome, url, sleep });
    await chrome.send("Page.addScriptToEvaluateOnNewDocument", { source: INJECT });
    //  全螢幕（與 Owner 錄影相同）。視窗狀態要經 Browser 網域設定。
    try {
      const { windowId } = await chrome.send("Browser.getWindowForTarget", {});
      await chrome.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "fullscreen" } });
    } catch (e) { console.log("fullscreen failed", e.message); }
    await sleep(1500);
    const ok = await toBattle();
    ck("進入 MOBA 戰鬥", ok);
    if (!ok) return;
    await chrome.send("Performance.enable");
    const env = await ev("const c=[...document.querySelectorAll('canvas')].sort((a,b)=>b.width*b.height-a.width*a.height)[0]; return JSON.stringify({dpr:devicePixelRatio, inner:[innerWidth,innerHeight], canvas:c?[c.width,c.height]:null, screen:[screen.width,screen.height], cores:navigator.hardwareConcurrency, mem:navigator.deviceMemory||null, gl:(()=>{try{const g=document.createElement('canvas').getContext('webgl2');const e=g.getExtension('WEBGL_debug_renderer_info');return g.getParameter(e.UNMASKED_RENDERER_WEBGL);}catch(x){return null;}})()});");
    console.log("env", JSON.stringify(env));
    const clockSec = () => ev("const els=[...document.querySelectorAll('body *')].filter(e=>e.children.length===0&&/^[0-9]{1,2}:[0-9]{2}$/.test((e.textContent||'').trim())&&e.getBoundingClientRect().top<120); const t=els.length?els[0].textContent.trim():null; if(!t) return JSON.stringify(null); const [m,s]=t.split(':').map(Number); return JSON.stringify(m*60+s);");
    const taskOf = async () => { const m = (await chrome.send("Performance.getMetrics")).metrics; const g = (n) => m.find((x) => x.name === n)?.value ?? 0; return { task: g("TaskDuration"), script: g("ScriptDuration"), ts: g("Timestamp"), heap: g("JSHeapUsedSize") }; };
    const setQuality = (q) => chrome.evaluate("const z={low:'低',medium:'中',high:'高'}[" + JSON.stringify(q) + "]; const b=[...document.querySelectorAll('button')].find(x=>(x.innerText||'').trim()===z&&(x.title||'').includes('畫質')); if(b) b.click(); return JSON.stringify(!!b);");
    const out = { label: LABEL, url, env, segments: [] };
    for (const seg of SEGMENTS) {
      const qok = await setQuality(seg.q);
      await click(`[data-testid="match-speed-${seg.rate}"]`);
      await sleep(2500);
      const c0 = await clockSec(); const a = await taskOf(); const t0 = Date.now();
      await chrome.evaluate("const R=window.__rd; R.frames.length=0; R.iv.length=0; R.lt.length=0; R.last=0; R.on=true; return 1;");
      await sleep(seg.sec * 1000);
      const raw = await ev("const R=window.__rd; R.on=false; return JSON.stringify({frames:R.frames, iv:R.iv, lt:R.lt});");
      const b = await taskOf(); const c1 = await clockSec(); const real = (Date.now() - t0) / 1000;
      const canvas = await ev("const c=[...document.querySelectorAll('canvas')].sort((a,b)=>b.width*b.height-a.width*a.height)[0]; return JSON.stringify(c?[c.width,c.height]:null);");
      const r = { quality: seg.q, qualityClicked: qok, rate: seg.rate, realSec: +real.toFixed(1), canvas,
        frame: frameStats(raw.frames), mainBusyPct: +(100 * (b.task - a.task) / (b.ts - a.ts)).toFixed(1), scriptPct: +(100 * (b.script - a.script) / (b.ts - a.ts)).toFixed(1),
        longTasks: { n: raw.lt.length, totalMs: Math.round(raw.lt.reduce((x, y) => x + y, 0)), max: raw.lt.length ? Math.max(...raw.lt) : 0 },
        simIntervals: ivStats(raw.iv), gameSec: c0 != null && c1 != null ? c1 - c0 : null, gamePerReal: c0 != null && c1 != null ? +((c1 - c0) / real).toFixed(2) : null, heapMB: +(b.heap / 1048576).toFixed(0) };
      out.segments.push(r);
      console.log("SEG", JSON.stringify(r));
    }
    writeFileSync(`${OUT}/${LABEL}-realdisplay.json`, JSON.stringify(out, null, 1));
    ck("每段都有幀資料", out.segments.every((s) => s.frame.frames > 10));
    ck("讀得到比賽時間", out.segments.every((s) => s.gameSec != null));
}

const ANGLE = process.env.ESMO_ANGLE?.trim() || null;
if (!ANGLE) {
  const result = await runGate({ name: `MOBA real-display perf（${LABEL}）`, timeoutMs: 850_000, externalUrl: TARGET_URL, run: measure });
  await finishGate(result);
} else {
  //  共用 harness 不接受 d3d11-warp-webgl ⇒ 用本工具自己的啟動器（lib_cdp_chrome.mjs）。
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let pass = 0, fail = 0;
  const ck = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${n}${d ? "　" + d : ""}`); };
  const chrome = await launchChrome({ extraArgs: [`--use-angle=${ANGLE}`] });
  try { await measure({ chrome, url: TARGET_URL, ck, sleep }); }
  catch (e) { ck("量測沒有中途失敗", false, e.message); }
  finally { await chrome.close(); }
  console.log(`MOBA real-display perf（${LABEL}，ANGLE=${ANGLE}）：${pass}/${pass + fail}`);
  process.exit(fail ? 1 : 0);
}
