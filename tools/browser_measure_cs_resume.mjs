#!/usr/bin/env node
// ============================================================================
//  tools/browser_measure_cs_resume.mjs — CS「返回進行中的比賽」耗時量測（量測工具，不是 gate）
//
//  Owner 回報：手機上有一場 CS 進行中，首頁按「返回進行中的比賽」卡約 1 分鐘才進去。
//  這支重現兩條路徑並量「點擊 → 回到戰鬥畫面」與主執行緒阻塞：
//    ① 同一分頁離開後返回（記憶體裡的模擬快取還在）
//    ② 離開後**重新整理頁面**再返回（手機切背景、分頁被回收的情境 ⇒ 快取消失）
//  執行：ESMO_EXTERNAL_URL=<url> ESMO_CPU_THROTTLE=4 node tools/browser/run-gate.mjs tools/browser_measure_cs_resume.mjs --timeout 1500000 [-- --headed]
//    ESMO_CPU_THROTTLE：CDP Emulation.setCPUThrottlingRate（1＝不降速；4 ≈ 中階手機）
//  ⚠ evaluate 字串不可含反引號。
// ============================================================================
import { runGate, finishGate } from "./browser/harness.mjs";

const THROTTLE = Number(process.env.ESMO_CPU_THROTTLE || 1);
const DIAG = process.env.ESMO_DIAG === "1";   // 1 ⇒ ?diag=1：讀 Worker 與主執行緒同步計算的雜湊比對（會在主執行緒多算一次，數字不拿來比速度）
const VW = Number(process.env.ESMO_VIEW_W || 390);
const VIS = "const vis=(e)=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;}; const q=(s)=>[...document.querySelectorAll(s)].find(vis);";
const IN_CS = "document.querySelector('[data-testid=\"cs-match-speed-controls\"]') && document.querySelector('canvas')";

const result = await runGate({
  name: "CS resume timing", timeoutMs: 1_450_000, externalUrl: process.env.ESMO_EXTERNAL_URL?.trim() || null,
  async run({ chrome, url: baseUrl, ck, sleep }) {
    let url = baseUrl;
    const ev = async (body) => { const r = String(await chrome.evaluate(body)); for (const t of [r, r.replace(/^"|"$/g, "")]) { try { return JSON.parse(t); } catch { /* 下一個 */ } } return r; };
    const wait = async (expr, ms, every = 400) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await ev(VIS + "return JSON.stringify(!!(" + expr + "));")) return true; } catch { /* 主執行緒忙／換頁 */ } await sleep(every); } return false; };
    const clickText = (t) => ev(VIS + "const el=[...document.querySelectorAll('button')].filter(vis).find(b=>!b.disabled&&(b.innerText||'').includes(" + JSON.stringify(t) + ")); if(el) el.click(); return JSON.stringify(!!el);");
    const prep = () => ev("const b=document.querySelector('[data-testid=\"prep-primary-action\"]'); if(!b) return JSON.stringify({ok:false}); const a=b.dataset.action||null; if(b.disabled) return JSON.stringify({ok:false,action:a}); b.click(); return JSON.stringify({ok:true,action:a});");
    await chrome.send("Emulation.setDeviceMetricsOverride", VW === 390 ? { width: 390, height: 844, deviceScaleFactor: 2, mobile: true } : { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    if (DIAG) url = url + (url.includes("?") ? "&" : "?") + "diag=1";
    await chrome.navigate(url);
    await chrome.evaluate("try{localStorage.clear();sessionStorage.clear();}catch(e){} return 1;");
    await chrome.navigate(url);
    //  進場（沿用 browser_measure_cs_lifecycle 的序列）：不降速，只量返回那一段
    ck("首頁", await wait("document.body.innerText.includes('CS')", 60000));
    await clickText("CS");
    await wait("document.querySelector('[data-testid=\"prep-primary-action\"]')", 30000);
    let a = await prep();
    if (a?.action === "blocked") { await clickText("自動"); await wait("document.querySelector('[data-testid=\"prep-primary-action\"]')?.dataset.action==='enqueue'", 20000); a = await prep(); }
    if (a?.action === "enqueue" || a?.ok) {
      await wait("document.querySelector('[data-testid=\"prep-primary-action\"]')?.dataset.action==='confirm' || document.querySelector('[data-map-key]')", 60000);
      if (await ev("return JSON.stringify(document.querySelector('[data-testid=\"prep-primary-action\"]')?.dataset.action==='confirm');")) await prep();
    }
    await wait("document.querySelector('[data-map-key]')", 60000);
    await ev("document.querySelector('[data-map-key]')?.click(); return JSON.stringify(1);"); await sleep(400);
    await ev("const b=[...document.querySelectorAll('button')].filter(n=>!n.disabled&&!n.dataset.mapKey); b.at(-1)?.click(); return JSON.stringify(1);"); await sleep(900);
    await ev("const b=[...document.querySelectorAll('button')].filter(n=>!n.disabled&&(n.innerText||'').length>20); b[0]?.click(); return JSON.stringify(1);"); await sleep(400);
    await ev("const b=[...document.querySelectorAll('button')].filter(n=>!n.disabled); b.at(-1)?.click(); return JSON.stringify(1);");
    const tEnter = Date.now();
    ck("首次進入 CS 戰鬥", await wait(IN_CS, 240000, 700), `${Date.now() - tEnter}ms`);
    await sleep(8000);

    const rows = [];
    //  返回前後的比賽狀態：frame 游標、回合、比分欄位、整份 sim 的總幀數與勝方（同一份輸入 ⇒ 必須相同）
    //  ⚠ __ESMO_FPS_SCENE__ 只在 DEV 才掛 ⇒ 改讀**存檔裡的 activeMatch snapshot**（遊戲自己恢復時用的就是它）
    const state = () => ev("let raw=null; try{raw=JSON.parse(localStorage.getItem('esmo.profile.v1')||'null');}catch(e){} const seen=new Set(); const find=(o,d)=>{ if(!o||typeof o!=='object'||d>8||seen.has(o)) return null; seen.add(o); if(o.snapshot&&typeof o.snapshot==='object'&&'totalFrames' in o.snapshot) return o.snapshot; for(const k of Object.keys(o)){ const r=find(o[k],d+1); if(r) return r; } return null; }; const sn=find(raw,0); return JSON.stringify(sn?{fIdx:sn.frameIndex,total:sn.totalFrames,rnd:sn.rnd,tScore:sn.tScore,ctScore:sn.ctScore}:null);");
    for (const reload of [false, true]) {
      const before = await state();
      await ev(VIS + "const el=q('[data-testid=\"leave-active-match\"]'); if(el) el.click(); return JSON.stringify(!!el);");
      ck(`${reload ? "②" : "①"} 離開後首頁有返回入口`, await wait("q('[data-testid=\"resume-active-match\"]')", 30000));
      if (reload) { await sleep(2000); await chrome.navigate(url); await wait("q('[data-testid=\"resume-active-match\"]')", 90000); }
      await sleep(1500);
      if (THROTTLE > 1) await chrome.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
      await chrome.evaluate("window.__LT=[]; try{ new PerformanceObserver((l)=>{ for(const e of l.getEntries()) window.__LT.push(Math.round(e.duration)); }).observe({type:'longtask', buffered:false}); }catch(e){} return 1;");
      const t0 = Date.now();
      await ev(VIS + "const el=q('[data-testid=\"resume-active-match\"]'); if(el){el.scrollIntoView({block:'center'}); el.click();} return JSON.stringify(!!el);");
      let screens = [], back = null, stalls = 0, lastOk = Date.now();
      while (Date.now() - t0 < 240000) {
        let s = null;
        const tq = Date.now();
        try { s = await ev("return JSON.stringify({load:!!document.querySelector('[data-testid=\"cs-resume-progress\"]'), cs:!!(" + IN_CS + ")});"); } catch { /* busy */ }
        if (Date.now() - tq > 2000) stalls++;
        if (s?.load && !screens.includes("loading")) screens.push("loading");
        if (s?.cs) { back = Date.now() - t0; break; }
        lastOk = Date.now(); await sleep(250);
      }
      void lastOk;
      if (THROTTLE > 1) await chrome.send("Emulation.setCPUThrottlingRate", { rate: 1 });
      await sleep(600);
      const after = await state();
      await sleep(3000);
      const after2 = await state();
      const sameMatch = !!before && !!after2 && before.total === after2.total && after2.rnd >= before.rnd && after2.tScore >= before.tScore && after2.ctScore >= before.ctScore;
      const cursorOk = !!before && !!after2 && after2.fIdx >= before.fIdx && after2.fIdx <= before.fIdx + 200;
      const lt = await ev("return JSON.stringify(window.__LT||[]);");
      const timing = await ev("const t=window.__ESMO_CS_LOAD_TIMING__; const e=(t&&(t.entries||t))||[]; return JSON.stringify(Array.isArray(e)?e.slice(-40).map(x=>[x.name||x.label||x.mark, Math.round(x.ms||x.duration||0)]):null);");
      const simMarks = (timing ?? []).filter((x) => /sim/.test(String(x[0])));
      const workerDiag = await ev("return JSON.stringify(window.__CS_SIM_WORKER_DIAG||null);");
      const row = { viewport: VW, workerDiag, sameMatch, cursorOk, before, after: after2, path: reload ? "reload-then-resume" : "same-tab-resume", throttle: THROTTLE, clickToBattleMs: back, longestTaskMs: Math.max(0, ...(lt ?? [])),
        longTasksOver5s: (lt ?? []).filter((x) => x > 5000).length, evaluateStalls: stalls, sawLoadingScreen: screens.includes("loading"), simMarks: simMarks.slice(-4) };
      rows.push(row);
      console.log("CS_RESUME", JSON.stringify(row));
      ck(`${reload ? "②" : "①"} 回到戰鬥畫面`, back != null, JSON.stringify(row));
      ck(`${reload ? "②" : "①"} 同一場（總幀數相同、回合與比分不倒退）且時間點接續（游標不倒退）`, sameMatch && cursorOk, JSON.stringify({ before, after: after2 }));
      await sleep(4000);
    }
    const errs = chrome.consoleLines.filter((l) => /Uncaught|TypeError|ReferenceError/i.test(JSON.stringify(l)));
    ck("page／console error = 0", chrome.pageErrors.length === 0 && errs.length === 0, JSON.stringify(errs).slice(0, 200));
  },
});
await finishGate(result);
