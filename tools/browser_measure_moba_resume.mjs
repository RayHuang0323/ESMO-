#!/usr/bin/env node
// ============================================================================
//  tools/browser_measure_moba_resume.mjs — 「返回進行中的比賽」耗時量測（量測工具）
//
//  問題：首頁按「返回進行中的比賽」會卡住 30 秒～1 分鐘才進戰鬥。
//  流程：正式流程開一場 MOBA → 4× 打到 ESMO_RESUME_AT 模擬秒（預設 600）→ 暫停並離開 →
//        首頁按「返回進行中的比賽」→ 量：點擊 → 戰鬥時間重新前進的秒數、期間最長的主執行緒阻塞（long task）、
//        是否有可見的進度提示。
//  執行（真 GPU）：ESMO_EXTERNAL_URL=http://127.0.0.1:<port>/ESMO-/ node tools/browser/run-gate.mjs tools/browser_measure_moba_resume.mjs --timeout 1500000 -- --headed
//  ⚠ evaluate 字串不可含反引號。
// ============================================================================
import { runGate, finishGate } from "./browser/harness.mjs";

const TARGET_URL = process.env.ESMO_EXTERNAL_URL?.trim() || null;
const RESUME_AT = Number(process.env.ESMO_RESUME_AT || 600);
const RELOAD = process.env.ESMO_RESUME_RELOAD === "1";   // 1 = 離開後重新整理頁面再返回（冷啟動：Rift／模型要重新載入）
const VIS = "const vis=(e)=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;}; const q=(s)=>[...document.querySelectorAll(s)].find(vis);";

const result = await runGate({
  name: "MOBA resume timing", timeoutMs: 1_450_000, externalUrl: TARGET_URL,
  async run({ chrome, url, ck, sleep }) {
    const ev = async (body) => { const r = String(await chrome.evaluate(body)); try { return JSON.parse(r); } catch { try { return JSON.parse(r.replace(/^"|"$/g, "")); } catch { return r; } } };
    const wait = async (expr, ms, every = 400) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await ev(VIS + "return JSON.stringify(!!(" + expr + "));")) return true; } catch { /* 換頁／主執行緒忙 */ } await sleep(every); } return false; };
    const click = (sel) => chrome.evaluate(VIS + "const el=q(" + JSON.stringify(sel) + "); if(el) el.click(); return JSON.stringify(!!el);");
    const clickText = (t) => chrome.evaluate(VIS + "const el=[...document.querySelectorAll('button')].filter(vis).find(b=>(b.innerText||'').includes(" + JSON.stringify(t) + ")); if(el) el.click(); return JSON.stringify(!!el);");
    const clock = () => ev("const h=document.querySelector('[data-testid=\"battle-hud\"]'); const m=(h&&h.innerText||'').match(/(\\d+):(\\d\\d)/); return JSON.stringify(m?Number(m[1])*60+Number(m[2]):null);");
    await chrome.send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    await chrome.navigate(url);
    await chrome.evaluate("try{localStorage.clear();sessionStorage.clear();}catch(e){} return 1;");
    await chrome.navigate(url);
    ck("首頁", await wait("q('[data-testid=\"home-mode-moba\"]')", 90000));
    await click('[data-testid="home-mode-moba"]');
    await wait("q('[data-testid=\"prep-primary-action\"]')", 60000);
    let t0 = Date.now();
    while (Date.now() - t0 < 150000) {
      const s = await ev(VIS + "if(q('[data-testid=\"hero-grid-scroll\"]')) return JSON.stringify('bp'); const b=q('[data-testid=\"matchmaking-enter-banpick\"]'); if(b&&!b.disabled){b.click();return JSON.stringify('mm');} const a=q('[data-testid=\"prep-primary-action\"]'); if(a&&a.dataset.action==='blocked'){const x=[...document.querySelectorAll('button')].filter(vis).find(n=>(n.innerText||'').includes('自動')); if(x) x.click(); return JSON.stringify('auto');} if(a&&!a.disabled){a.click(); return JSON.stringify('prep');} return JSON.stringify('wait');");
      if (s === "bp") break; await sleep(900);
    }
    t0 = Date.now();
    while (Date.now() - t0 < 150000) {
      const done = await ev(VIS + "const c=q('[data-testid=\"confirm-draft\"]'); if(c&&!c.disabled){c.click(); return JSON.stringify(true);} const h=q('[data-testid=\"hero-choose\"]'); if(h){for(const t of ['pointerdown','mousedown','pointerup','mouseup','click']) h.dispatchEvent(new MouseEvent(t,{bubbles:true,cancelable:true}));} return JSON.stringify(false);");
      if (done) break; await sleep(1200);
    }
    await wait("[...document.querySelectorAll('button')].some(b=>(b.innerText||'').includes('開始載入'))", 60000);
    await clickText("開始載入");
    const inBattle = "document.querySelector('[data-testid=\"battle-hud\"]') && document.querySelector('canvas')";
    t0 = Date.now();
    while (Date.now() - t0 < 150000) {
      if (await ev(VIS + "return JSON.stringify(!!(" + inBattle + "));")) break;
      await chrome.evaluate(VIS + "const s=[...document.querySelectorAll('button')].filter(vis).find(b=>/開始比賽|進入戰鬥|開始戰鬥/.test(b.innerText||'')); if(s&&!s.disabled) s.click(); return 1;");
      await sleep(700);
    }
    ck("進入戰鬥", await wait(inBattle, 30000));
    await click('[data-testid="match-speed-4"]');
    t0 = Date.now();
    let simT = 0;
    while (Date.now() - t0 < 900000) { simT = (await clock()) ?? simT; if (simT >= RESUME_AT) break; await sleep(2000); }
    ck(`打到 ${RESUME_AT} 秒`, simT >= RESUME_AT, `${simT}s`);
    await click('[data-testid="leave-active-match"]');
    ck("離開後首頁有「返回進行中的比賽」", await wait("q('[data-testid=\"resume-active-match\"]')", 30000));
    if (RELOAD) { await sleep(2500); await chrome.navigate(url); ck("重新整理後首頁仍有「返回進行中的比賽」", await wait("q('[data-testid=\"resume-active-match\"]')", 90000)); }
    await sleep(1500);
    //  long task 觀察器必須在點擊之前掛上（點擊後主執行緒可能整段被佔住）
    await chrome.evaluate("window.__LT=[]; try{ new PerformanceObserver((l)=>{ for(const e of l.getEntries()) window.__LT.push(Math.round(e.duration)); }).observe({type:'longtask', buffered:false}); }catch(e){} return 1;");
    const tClick = Date.now();
    await click('[data-testid="resume-active-match"]');
    let progressSeen = false, battleAt = null, runningAt = null, first = null;
    while (Date.now() - tClick < 240000) {
      let s = null;
      try { s = await ev("const p=document.querySelector('[data-testid=\"resume-progress\"]'); const h=document.querySelector('[data-testid=\"battle-hud\"]'); const m=(h&&h.innerText||'').match(/(\\d+):(\\d\\d)/); return JSON.stringify({p:p?p.textContent:null, hud:!!h, clock:m?Number(m[1])*60+Number(m[2]):null});"); } catch { /* 主執行緒被佔住 */ }
      if (s?.p) progressSeen = true;
      if (s?.hud && battleAt == null) battleAt = Date.now() - tClick;
      if (s?.clock != null) { if (first == null) first = s.clock; else if (s.clock > first && runningAt == null) runningAt = Date.now() - tClick; }
      if (runningAt != null) break;
      await sleep(250);
    }
    const lt = await ev("return JSON.stringify(window.__LT||[]);");
    const row = { reload: RELOAD, resumeAtSim: simT, clickToHudMs: battleAt, clickToRunningMs: runningAt, longestTaskMs: Math.max(0, ...(lt ?? [])), longTasksOver1s: (lt ?? []).filter((x) => x > 1000).length, progressSeen };
    console.log("RESUME", JSON.stringify(row));
    ck("恢復後比賽時間重新前進", runningAt != null, JSON.stringify(row));
    const errs = chrome.consoleLines.filter((l) => /Uncaught|TypeError|ReferenceError|shader error/i.test(JSON.stringify(l)));
    ck("console error = 0", errs.length === 0 && chrome.pageErrors.length === 0, JSON.stringify(errs).slice(0, 200));
  },
});
await finishGate(result);
