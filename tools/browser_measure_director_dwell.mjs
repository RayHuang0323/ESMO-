#!/usr/bin/env node
// ============================================================================
//  tools/browser_measure_director_dwell.mjs — 自動導播換鏡間隔的精確量測（量測工具）
//
//  spectacle gate 的 C1 每 500ms 輪詢一次 data-beat ⇒ 兩次換鏡的「觀測間隔」會有 ±0.5 秒以上的誤差。
//  這支用 MutationObserver 在頁面內記下每次 data-beat 變化的 performance.now()，得到真實間隔。
//  執行：ESMO_EXTERNAL_URL=<url> node tools/browser/run-gate.mjs tools/browser_measure_director_dwell.mjs --timeout 900000
//  ⚠ evaluate 字串不可含反引號。
// ============================================================================
import { runGate, finishGate } from "./browser/harness.mjs";

const VIS = "const vis=(e)=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;}; const q=(s)=>[...document.querySelectorAll(s)].find(vis);";
const result = await runGate({
  name: "Director dwell（精確量測）", timeoutMs: 850_000, externalUrl: process.env.ESMO_EXTERNAL_URL?.trim() || null,
  async run({ chrome, url, ck, sleep }) {
    const ev = async (body) => { const r = String(await chrome.evaluate(body)); for (const t of [r, r.replace(/^"|"$/g, "")]) { try { return JSON.parse(t); } catch { /* 下一個 */ } } return r; };
    const wait = async (expr, ms) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await ev(VIS + "return JSON.stringify(!!(" + expr + "));")) return true; } catch { /* 換頁中 */ } await sleep(400); } return false; };
    const click = (sel) => chrome.evaluate(VIS + "const el=q(" + JSON.stringify(sel) + "); if(el) el.click(); return JSON.stringify(!!el);");
    await chrome.send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    await chrome.navigate(url); await chrome.evaluate("try{localStorage.clear();sessionStorage.clear();}catch(e){} return 1;"); await chrome.navigate(url);
    await wait("q('[data-testid=\"home-mode-moba\"]')", 90000);
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
    await chrome.evaluate(VIS + "const el=[...document.querySelectorAll('button')].filter(vis).find(b=>(b.innerText||'').includes('開始載入')); if(el) el.click(); return 1;");
    ck("進入戰鬥", await wait("q('[data-testid=\"camera-shot-cycle\"]')", 150000));
    await click('[data-testid="match-speed-4"]');
    await chrome.evaluate("window.__BEATS=[]; const b=document.querySelector('[data-testid=camera-shot-cycle]'); new MutationObserver(()=>window.__BEATS.push([performance.now(), b.dataset.beat])).observe(b,{attributes:true,attributeFilter:['data-beat']}); return 1;");
    await sleep(120000);
    const beats = await ev("return JSON.stringify(window.__BEATS||[]);");
    const gaps = beats.slice(1).map((x, i) => [Math.round(x[0] - beats[i][0]), x[1]]);
    const minGap = gaps.length ? Math.min(...gaps.map((g) => g[0])) : null;
    console.log("BEATS", JSON.stringify({ changes: beats.length, minGapMs: minGap, gaps: gaps.slice(0, 40) }));
    ck("換鏡 ≥ 2 次", beats.length >= 2, String(beats.length));
    ck("真實換鏡間隔 ≥ 1.5 秒（擊殺特寫最短停留）", minGap != null && minGap >= 1490, `${minGap}ms`);
  },
});
await finishGate(result);
