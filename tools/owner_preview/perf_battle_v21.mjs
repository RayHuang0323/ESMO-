#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/perf_battle_v21.mjs — MOBA 對戰的瀏覽器效能（Owner Preview Lag 調查，2026-11-10；量測工具，不是 gate）
//
//  流程與取樣照抄 tools/browser_measure_moba_battle_perf.mjs（走正式流程進 MOBA 對戰；1× 導播 20 s、4× 導播 20 s、4× 近戰 15 s；
//  桌機 1366×900 與 390×844）。另外加：
//   · CDP Performance.getMetrics：每段取樣前後的 JSHeapUsedSize、Nodes、LayoutCount、RecalcStyleCount、ScriptDuration、TaskDuration
//   · 4× 導播期間錄 10 秒 CPU profile（Profiler，取樣 1 ms），自用時間依來源歸類：
//       engine（src/LogicEngine.js）、battle（src/battle/**）、three（three.js）、r3f（@react-three）、react（react-dom／scheduler）、
//       app（其他 src/**）、bundle（打包後的 assets/*.js，build 模式下分不開）、gc、idle、program、other
//  ⚠ 一定要 --headed（真 GPU）。打外部網址：ESMO_EXTERNAL_URL=http://127.0.0.1:<port>/ESMO-/
//  執行：ESMO_EXTERNAL_URL=... ESMO_REVIEW_OUT=<repo 外資料夾> node tools/browser/run-gate.mjs tools/owner_preview/perf_battle_v21.mjs --timeout 1200000 -- --headed
//  ⚠ harness 用自己的暫存 Chrome profile：頁面裡的 localStorage.clear() 只清那個 profile，不會碰到 Owner 瀏覽器裡的存檔。
// ============================================================================
import { writeFileSync, mkdirSync } from "node:fs";
import { runGate, finishGate } from "../browser/harness.mjs";

const TARGET_URL = process.env.ESMO_EXTERNAL_URL?.trim() || null;
const LABEL = process.env.ESMO_PERF_LABEL ?? "run";
const OUT = process.env.ESMO_REVIEW_OUT ?? "tmp/moba-battle-perf-v21";
mkdirSync(OUT, { recursive: true });
const VIS = "const vis=(e)=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;}; const q=(s)=>[...document.querySelectorAll(s)].find(vis);";

function bucketOf(cf) {
  const u = cf.url || "", f = cf.functionName || "";
  if (!u) return f === "(garbage collector)" ? "gc" : f === "(idle)" ? "idle" : f === "(program)" ? "program" : "other";
  if (/\/src\/LogicEngine\.js/.test(u)) return "engine";
  if (/\/src\/battle\//.test(u)) return "battle";
  if (/three(\.module)?(\.min)?\.js|\/three\/|deps\/three/.test(u)) return "three";
  if (/@react-three|react-three|deps\/@react-three/.test(u)) return "r3f";
  if (/react-dom|scheduler|deps\/react/.test(u)) return "react";
  if (/\/src\//.test(u)) return "app";
  if (/\/assets\/[^/]+\.js/.test(u)) return "bundle";
  return "other";
}
function summarizeProfile(p) {
  const byId = new Map(p.nodes.map((n) => [n.id, n]));
  const ms = {}, fileMs = {};
  for (let i = 0; i < p.samples.length; i++) {
    const n = byId.get(p.samples[i]); const dt = (p.timeDeltas[i] ?? 0) / 1000;
    const b = bucketOf(n.callFrame); ms[b] = (ms[b] ?? 0) + dt;
    const u = n.callFrame.url ? n.callFrame.url.replace(/^.*\/ESMO-\//, "").replace(/\?.*$/, "") : n.callFrame.functionName;
    fileMs[u] = (fileMs[u] ?? 0) + dt;
  }
  const total = Object.values(ms).reduce((a, b) => a + b, 0);
  const busy = total - (ms.idle ?? 0);
  const topFiles = Object.entries(fileMs).filter(([k]) => k !== "(idle)").sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => [k, +v.toFixed(0)]);
  return { totalMs: Math.round(total), busyMs: Math.round(busy), busyPct: +(100 * busy / total).toFixed(1),
    bucketsMs: Object.fromEntries(Object.entries(ms).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, Math.round(v)])), topFiles };
}

const result = await runGate({
  name: `MOBA battle perf v21 investigation（${LABEL}）`, timeoutMs: 1_150_000, externalUrl: TARGET_URL,
  async run({ chrome, url, ck, sleep }) {
    const ev = async (body) => { const r = String(await chrome.evaluate(body)); try { return JSON.parse(r); } catch { try { return JSON.parse(r.replace(/^"|"$/g, "")); } catch { return r; } } };
    const wait = async (expr, ms) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await ev(VIS + "return JSON.stringify(!!(" + expr + "));")) return true; } catch { /* 換頁中 */ } await sleep(400); } return false; };
    const click = (sel) => chrome.evaluate(VIS + "const el=q(" + JSON.stringify(sel) + "); if(el) el.click(); return JSON.stringify(!!el);");
    const clickText = (t) => chrome.evaluate(VIS + "const el=[...document.querySelectorAll('button')].filter(vis).find(b=>(b.innerText||'').includes(" + JSON.stringify(t) + ")); if(el) el.click(); return JSON.stringify(!!el);");
    const inBattle = "document.querySelector('[data-testid=\"battle-hud\"]') && document.querySelector('canvas')";
    async function toBattle() {
      await chrome.navigate(url);
      await chrome.evaluate("try{localStorage.clear();sessionStorage.clear();}catch(e){} return 1;");
      await chrome.navigate(url);
      if (!(await wait("q('[data-testid=\"home-mode-moba\"]')", 90000))) return false;
      await click('[data-testid="home-mode-moba"]');
      await wait("q('[data-testid=\"prep-primary-action\"]')", 60000);
      const t0 = Date.now();
      while (Date.now() - t0 < 150000) {
        const s = await ev(VIS + "if(q('[data-testid=\"hero-grid-scroll\"]')) return JSON.stringify('bp'); const b=q('[data-testid=\"matchmaking-enter-banpick\"]'); if(b&&!b.disabled){b.click();return JSON.stringify('mm');} const a=q('[data-testid=\"prep-primary-action\"]'); if(a&&a.dataset.action==='blocked'){const x=[...document.querySelectorAll('button')].filter(vis).find(n=>(n.innerText||'').includes('自動')); if(x) x.click(); return JSON.stringify('auto');} if(a&&!a.disabled){a.click(); return JSON.stringify('prep');} return JSON.stringify('wait');");
        if (s === "bp") break; await sleep(900);
      }
      const t1 = Date.now();
      while (Date.now() - t1 < 150000) {
        const done = await ev(VIS + "const c=q('[data-testid=\"confirm-draft\"]'); if(c&&!c.disabled){c.click(); return JSON.stringify(true);} const h=q('[data-testid=\"hero-choose\"]'); if(h){for(const t of ['pointerdown','mousedown','pointerup','mouseup','click']) h.dispatchEvent(new MouseEvent(t,{bubbles:true,cancelable:true}));} return JSON.stringify(false);");
        if (done) break; await sleep(1200);
      }
      await wait("[...document.querySelectorAll('button')].some(b=>(b.innerText||'').includes('開始載入'))", 60000);
      await clickText("開始載入");
      const t2 = Date.now();
      while (Date.now() - t2 < 150000) {
        if (await ev(VIS + "return JSON.stringify(!!(" + inBattle + "));")) return true;
        await chrome.evaluate(VIS + "const s=[...document.querySelectorAll('button')].filter(vis).find(b=>/開始比賽|進入戰鬥|開始戰鬥/.test(b.innerText||'')); if(s&&!s.disabled) s.click(); return 1;");
        await sleep(700);
      }
      return false;
    }
    const sample = (ms) => ev("return (async () => { const d=[]; let last=performance.now(); const end=last+" + ms + "; await new Promise((res)=>{ const f=(t)=>{ d.push(t-last); last=t; if(t<end) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); }); d.shift(); const s=[...d].sort((a,b)=>a-b); const sum=d.reduce((a,b)=>a+b,0); return JSON.stringify({ frames:d.length, fps:+(1000*d.length/sum).toFixed(1), p50:+s[Math.floor(s.length*0.5)].toFixed(1), p95:+s[Math.floor(s.length*0.95)].toFixed(1), max:+s[s.length-1].toFixed(1), jank50:d.filter(x=>x>50).length, jank100:d.filter(x=>x>100).length }); })();");
    const metrics = async () => {
      const r = await chrome.send("Performance.getMetrics");
      const m = Object.fromEntries(r.metrics.map((x) => [x.name, x.value]));
      return { heapMB: +(m.JSHeapUsedSize / 1048576).toFixed(1), heapTotalMB: +(m.JSHeapTotalSize / 1048576).toFixed(1), nodes: m.Nodes, layouts: m.LayoutCount, recalcStyles: m.RecalcStyleCount, scriptS: +m.ScriptDuration.toFixed(2), taskS: +m.TaskDuration.toFixed(2), listeners: m.JSEventListeners };
    };
    const delta = (a, b) => ({ heapMB: b.heapMB, heapDeltaMB: +(b.heapMB - a.heapMB).toFixed(1), nodes: b.nodes, layoutsPerS: null, scriptS: +(b.scriptS - a.scriptS).toFixed(2), taskS: +(b.taskS - a.taskS).toFixed(2), layouts: b.layouts - a.layouts, recalcStyles: b.recalcStyles - a.recalcStyles });
    await chrome.send("Performance.enable", { timeDomain: "timeTicks" }).catch(() => {});
    await chrome.send("Profiler.enable").catch(() => {});
    //  ⚠ mode／預覽標示要在頁面載入之後才判斷（第一版在 about:blank 上判斷，結果無效）。
    await chrome.navigate(url);
    await wait("q('[data-testid=\"home-mode-moba\"]')", 90000);
    const mode = await ev("return JSON.stringify([...document.scripts].some((s)=>/@vite\\/client/.test(s.src)) ? 'dev' : 'build');");
    const flags = await ev("return JSON.stringify(!!document.querySelector('[data-owner-preview=v21]'));");
    const gpu = await ev("const c=document.createElement('canvas'); const g=c.getContext('webgl2')||c.getContext('webgl'); if(!g) return JSON.stringify(null); const x=g.getExtension('WEBGL_debug_renderer_info'); return JSON.stringify(x?g.getParameter(x.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER));");
    console.log("mode:", mode, "| v21 preview banner:", flags, "| GPU:", gpu);
    ck("真 GPU（不是軟體渲染）", !!gpu && !/SwiftShader|Basic Render|llvmpipe|Software/i.test(String(gpu)), String(gpu));
    const rows = [];
    for (const vp of [
      { label: "Desktop", width: 1366, height: 900, deviceScaleFactor: 1, mobile: false },
      { label: "390", width: 390, height: 844, deviceScaleFactor: 3, mobile: true },
    ]) {
      await chrome.send("Emulation.setDeviceMetricsOverride", vp);
      const ok = await toBattle();
      ck(`${vp.label}｜進入 MOBA 戰鬥`, ok);
      if (!ok) continue;
      await sleep(2000);
      const fog = await ev("const b=document.querySelector('[data-testid=fog-toggle]'); return JSON.stringify(b?b.dataset.fog:null);");
      await click('[data-testid="match-speed-1"]'); await sleep(1500);
      const m0 = await metrics();
      const r1 = await sample(20000);
      const m1 = await metrics();
      await click('[data-testid="match-speed-4"]'); await sleep(1500);
      const m2 = await metrics();
      await chrome.send("Profiler.setSamplingInterval", { interval: 1000 }).catch(() => {});
      await chrome.send("Profiler.start");
      const r4 = await sample(20000);
      const prof = await chrome.send("Profiler.stop");
      const m3 = await metrics();
      for (let i = 0; i < 4; i++) { if ((await ev("const b=document.querySelector('[data-testid=camera-shot-cycle]'); return JSON.stringify(b?b.dataset.shot:null);")) === "close") break; await click('[data-testid="camera-shot-cycle"]'); await sleep(300); }
      await sleep(2500);
      const m4 = await metrics();
      const rc = await sample(15000);
      const m5 = await metrics();
      const cpu4x = summarizeProfile(prof.profile);
      const s = await chrome.send("Page.captureScreenshot", { format: "png" }); writeFileSync(`${OUT}/${LABEL}-${vp.label}-close-4x.png`, Buffer.from(s.data, "base64"));
      const row = { vp: vp.label, fog, "1x-auto": { ...r1, ...delta(m0, m1) }, "4x-auto": { ...r4, ...delta(m2, m3) }, "4x-close": { ...rc, ...delta(m4, m5) }, cpuProfile4x: cpu4x };
      rows.push(row);
      console.log(JSON.stringify(row));
      ck(`${vp.label}｜量得到幀資料`, r1?.frames > 0 && r4?.frames > 0 && rc?.frames > 0);
    }
    writeFileSync(`${OUT}/${LABEL}-perf.json`, JSON.stringify({ label: LABEL, url, mode, v21Banner: flags, gpu, rows }, null, 2));
    const errs = chrome.consoleLines.filter((l) => /shader error|VALIDATE_STATUS|WebGL.*error|Uncaught|TypeError|ReferenceError|CONTEXT_LOST/i.test(JSON.stringify(l)));
    ck("page error = 0", chrome.pageErrors.length === 0, JSON.stringify(chrome.pageErrors).slice(0, 300));
    ck("console／shader error = 0", errs.length === 0, JSON.stringify(errs).slice(0, 300));
  },
});
await finishGate(result);
