#!/usr/bin/env node
// ============================================================================
//  tools/browser_measure_moba_battle_perf.mjs — MOBA Battle 實際瀏覽器效能量測（量測工具，不是驗收 gate）
//
//  ⚠ 一定要用 --headed（真 GPU）：headless 會加 --disable-gpu，軟體渲染只有 2–4 fps，不能當效能結論。
//  執行：ESMO_EXTERNAL_URL=http://127.0.0.1:<port>/ESMO-/ node tools/browser/run-gate.mjs tools/browser_measure_moba_battle_perf.mjs --timeout 1200000 -- --headed
//    （打 `vite preview` 的正式 bundle；不開 ?diag=1，避免診斷面板本身吃效能）
//
//  走正式流程進 MOBA Battle（迷霧開、戰鬥特效開），在頁面內用 requestAnimationFrame 量：
//    1× 導播 20 秒、4× 導播 20 秒、4× 近戰鏡頭 15 秒 ⇒ 平均 FPS、p95／最大幀時間、> 50ms 的卡頓幀數
//  桌機 1366×900 與 390×844（在同一台機器的 GPU 上模擬手機視窗，不等於實機手機）各一輪。
//  ⚠ evaluate 字串不可含反引號。
// ============================================================================
import { writeFileSync, mkdirSync } from "node:fs";
import { runGate, finishGate } from "./browser/harness.mjs";

const TARGET_URL = process.env.ESMO_EXTERNAL_URL?.trim() || null;
const OUT = process.env.ESMO_REVIEW_OUT ?? "tmp/moba-battle-perf";
mkdirSync(OUT, { recursive: true });
const VIS = "const vis=(e)=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;}; const q=(s)=>[...document.querySelectorAll(s)].find(vis);";

const result = await runGate({
  name: "MOBA battle perf（headed）", timeoutMs: 1_150_000, externalUrl: TARGET_URL,
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
    //  頁面內 rAF 取樣：回傳平均 FPS、p50／p95／最大幀時間、>50ms 幀數
    const sample = (ms) => ev("return (async () => { const d=[]; let last=performance.now(); const end=last+" + ms + "; await new Promise((res)=>{ const f=(t)=>{ d.push(t-last); last=t; if(t<end) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); }); d.shift(); const s=[...d].sort((a,b)=>a-b); const sum=d.reduce((a,b)=>a+b,0); return JSON.stringify({ frames:d.length, fps:+(1000*d.length/sum).toFixed(1), p50:+s[Math.floor(s.length*0.5)].toFixed(1), p95:+s[Math.floor(s.length*0.95)].toFixed(1), max:+s[s.length-1].toFixed(1), jank50:d.filter(x=>x>50).length, jank100:d.filter(x=>x>100).length }); })();");
    const gpu = await ev("const c=document.createElement('canvas'); const g=c.getContext('webgl2')||c.getContext('webgl'); if(!g) return JSON.stringify(null); const x=g.getExtension('WEBGL_debug_renderer_info'); return JSON.stringify(x?g.getParameter(x.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER));");
    console.log("GPU renderer:", gpu);
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
      ck(`${vp.label}｜迷霧開啟`, fog === "on", String(fog));
      await click('[data-testid="match-speed-1"]'); await sleep(1500);
      const r1 = await sample(20000);
      await click('[data-testid="match-speed-4"]'); await sleep(1500);
      const r4 = await sample(20000);
      for (let i = 0; i < 4; i++) { if ((await ev("const b=document.querySelector('[data-testid=camera-shot-cycle]'); return JSON.stringify(b?b.dataset.shot:null);")) === "close") break; await click('[data-testid="camera-shot-cycle"]'); await sleep(300); }
      await sleep(2500);
      const rc = await sample(15000);
      const s = await chrome.send("Page.captureScreenshot", { format: "png" }); writeFileSync(`${OUT}/${vp.label}-close-4x.png`, Buffer.from(s.data, "base64"));
      rows.push({ vp: vp.label, "1x-auto": r1, "4x-auto": r4, "4x-close": rc });
      console.log(JSON.stringify(rows[rows.length - 1]));
      ck(`${vp.label}｜量得到幀資料`, r1?.frames > 0 && r4?.frames > 0 && rc?.frames > 0);
    }
    writeFileSync(`${OUT}/perf.json`, JSON.stringify({ gpu, rows }, null, 2));
    const errs = chrome.consoleLines.filter((l) => /shader error|VALIDATE_STATUS|WebGL.*error|Uncaught|TypeError|ReferenceError|CONTEXT_LOST/i.test(JSON.stringify(l)));
    ck("page error = 0", chrome.pageErrors.length === 0, JSON.stringify(chrome.pageErrors).slice(0, 300));
    ck("console／shader error = 0", errs.length === 0, JSON.stringify(errs).slice(0, 300));
  },
});
await finishGate(result);
