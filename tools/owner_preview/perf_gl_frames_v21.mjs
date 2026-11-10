#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/perf_gl_frames_v21.mjs — 對戰的逐幀 WebGL 量測（Lag 根因調查，2026-11-11；量測工具，不是 gate；不改任何程式）
//
//  做法：在頁面載入前注入一段腳本（Page.addScriptToEvaluateOnNewDocument），包住 WebGL2RenderingContext 的方法並**逐幀**累計：
//    drawCalls、三角形數（drawElements／drawArrays 的 count 換算）、bufferBytes（bufferData／bufferSubData）、
//    texUploads／texPixels（texImage2D／texSubImage2D）、programLinks／programLinkMs（linkProgram 到第一次 getProgramParameter 的阻塞時間＋getProgramInfoLog）、
//    useProgram 次數、readPixels（會強制同步）。
//  每一幀的 rAF 時間差一起記，之後可以回答：長幀（> 33 ms）是不是剛好有著色器連結、大量紋理／緩衝上傳、或 draw call 暴增。
//  流程與 tools/browser_measure_moba_battle_perf.mjs 相同（走正式流程進 MOBA 對戰；桌機 1366×900）。段落：1× 導播 20 秒、4× 導播 40 秒、4× 近戰 20 秒。
//  ⚠ 一定要 --headed（真 GPU）。ESMO_EXTERNAL_URL＝要量的網址（dev 或 build preview）；ESMO_PERF_LABEL＝標籤。
//  執行：ESMO_EXTERNAL_URL=... ESMO_REVIEW_OUT=<資料夾> ESMO_PERF_LABEL=... node tools/browser/run-gate.mjs tools/owner_preview/perf_gl_frames_v21.mjs --timeout 1200000 -- --headed
//  ⚠ chrome.evaluate 的字串裡不能有反引號。
// ============================================================================
import { writeFileSync, mkdirSync } from "node:fs";
import { runGate, finishGate } from "../browser/harness.mjs";

const TARGET_URL = process.env.ESMO_EXTERNAL_URL?.trim() || null;
const LABEL = process.env.ESMO_PERF_LABEL ?? "run";
const OUT = process.env.ESMO_REVIEW_OUT ?? "tmp/moba-gl-frames";
mkdirSync(OUT, { recursive: true });
const VIS = "const vis=(e)=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;}; const q=(s)=>[...document.querySelectorAll(s)].find(vis);";

//  注入腳本：只計數，不改任何呼叫的結果；包裝失敗就原樣放行。
const INJECT = `(() => {
  if (window.__glprobe) return;
  const P = window.__glprobe = { frame: { draw: 0, tris: 0, bufB: 0, texN: 0, texPx: 0, links: 0, linkMs: 0, useProg: 0, readPx: 0, uniform: 0 }, frames: [], armed: false, last: 0, linkStart: new WeakMap(), totals: { links: 0, linkMs: 0 }, texKinds: {} };
  const wrap = (proto, name, fn) => { const o = proto[name]; if (typeof o !== 'function') return; proto[name] = function (...a) { try { fn.call(this, a); } catch (e) {} return o.apply(this, a); }; };
  for (const C of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) {
    if (!C) continue; const p = C.prototype;
    wrap(p, 'drawElements', (a) => { P.frame.draw++; P.frame.tris += (a[1] | 0) / 3; });
    wrap(p, 'drawArrays', (a) => { P.frame.draw++; P.frame.tris += (a[2] | 0) / 3; });
    wrap(p, 'drawElementsInstanced', (a) => { P.frame.draw++; P.frame.tris += ((a[1] | 0) / 3) * (a[4] | 0); });
    wrap(p, 'drawArraysInstanced', (a) => { P.frame.draw++; P.frame.tris += ((a[2] | 0) / 3) * (a[3] | 0); });
    wrap(p, 'bufferData', (a) => { const d = a[1]; P.frame.bufB += d && d.byteLength != null ? d.byteLength : (typeof d === 'number' ? d : 0); });
    wrap(p, 'bufferSubData', (a) => { const d = a[2]; P.frame.bufB += d && d.byteLength != null ? d.byteLength : 0; });
    //  兩種多載：有寬高數字（texImage2D 9+ 參數、texSubImage2D 9+ 參數）與來源物件（canvas／image／video／ImageBitmap，寬高要從來源讀）。
    //  第一版把來源多載的『格式／型別』列舉值當寬高相乘，高估了上傳量 ⇒ 這裡分開處理，並記錄種類。
    const dimsOf = (a, sized, src, wi) => { if (a.length >= sized) { const px = a[sized === 9 ? sized - 1 : sized - 1]; return [a[wi] | 0, a[wi + 1] | 0, 'buf' + (px && px.byteLength != null ? '' : ':offset')]; } const s = a[src]; return s && (s.width != null || s.videoWidth != null) ? [(s.videoWidth ?? s.width) | 0, (s.videoHeight ?? s.height) | 0, (s.constructor && s.constructor.name) || 'src'] : [0, 0, 'unknown']; };
    const noteTex = (name, d) => { P.frame.texN++; P.frame.texPx += d[0] * d[1]; const k = name + ':' + d[0] + 'x' + d[1] + ':' + d[2]; P.texKinds[k] = (P.texKinds[k] || 0) + 1; };
    wrap(p, 'texImage2D', (a) => noteTex('texImage2D', dimsOf(a, 9, 5, 3)));
    wrap(p, 'texSubImage2D', (a) => noteTex('texSubImage2D', dimsOf(a, 9, 6, 4)));
    wrap(p, 'useProgram', () => { P.frame.useProg++; });
    wrap(p, 'readPixels', () => { P.frame.readPx++; });
    wrap(p, 'linkProgram', function (a) { P.linkStart.set(a[0], performance.now()); P.frame.links++; P.totals.links++; });
    const gp = p.getProgramParameter; p.getProgramParameter = function (prog, pname) { const t0 = P.linkStart.get(prog); const r = gp.call(this, prog, pname); if (t0 !== undefined && pname === this.LINK_STATUS) { const d = performance.now() - t0; P.frame.linkMs += d; P.totals.linkMs += d; P.linkStart.delete(prog); } return r; };
  }
  const tick = (t) => {
    if (P.armed && P.last) { const f = P.frame; P.frames.push({ dt: +(t - P.last).toFixed(2), draw: f.draw, tris: Math.round(f.tris), bufB: f.bufB, texN: f.texN, texPx: f.texPx, links: f.links, linkMs: +f.linkMs.toFixed(2), useProg: f.useProg, readPx: f.readPx }); }
    P.frame = { draw: 0, tris: 0, bufB: 0, texN: 0, texPx: 0, links: 0, linkMs: 0, useProg: 0, readPx: 0, uniform: 0 };
    P.last = t; requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();`;

const pct = (s, q) => s[Math.min(s.length - 1, Math.floor(q * s.length))];
function summarize(frames) {
  if (!frames.length) return null;
  const dts = frames.map((f) => f.dt).sort((a, b) => a - b);
  const sum = (k) => frames.reduce((a, f) => a + f[k], 0);
  const avg = (k) => +(sum(k) / frames.length).toFixed(1);
  const long = frames.filter((f) => f.dt > 33.4);
  const longWithLink = long.filter((f) => f.links > 0 || f.linkMs > 1);
  const longWithTex = long.filter((f) => f.texPx > 1e6);
  const longWithBuf = long.filter((f) => f.bufB > 2e6);
  const top = frames.slice().sort((a, b) => b.dt - a.dt).slice(0, 6);
  return { frames: frames.length, fps: +(1000 * frames.length / sum("dt")).toFixed(1), p50: pct(dts, 0.5), p95: pct(dts, 0.95), p99: pct(dts, 0.99), max: dts[dts.length - 1],
    over33: long.length, over50: frames.filter((f) => f.dt > 50).length, over100: frames.filter((f) => f.dt > 100).length,
    avgDraw: avg("draw"), maxDraw: Math.max(...frames.map((f) => f.draw)), avgTris: avg("tris"), maxTris: Math.max(...frames.map((f) => f.tris)),
    avgBufKB: +(sum("bufB") / frames.length / 1024).toFixed(1), maxBufKB: +(Math.max(...frames.map((f) => f.bufB)) / 1024).toFixed(0),
    avgTexUploads: avg("texN"), avgTexKPx: +(sum("texPx") / frames.length / 1000).toFixed(1), maxTexKPx: +(Math.max(...frames.map((f) => f.texPx)) / 1000).toFixed(0),
    avgUseProgram: avg("useProg"), readPixelsFrames: frames.filter((f) => f.readPx > 0).length,
    framesWithProgramLink: frames.filter((f) => f.links > 0).length, totalProgramLinks: sum("links"), totalLinkMs: +sum("linkMs").toFixed(0),
    longFrames: { n: long.length, withProgramLink: longWithLink.length, withBigTexUpload: longWithTex.length, withBigBufferUpload: longWithBuf.length },
    worst: top };
}

const result = await runGate({
  name: `MOBA battle GL frames（${LABEL}）`, timeoutMs: 1_150_000, externalUrl: TARGET_URL,
  async run({ chrome, url, ck, sleep }) {
    const ev = async (body) => { const r = String(await chrome.evaluate(body)); try { return JSON.parse(r); } catch { try { return JSON.parse(r.replace(/^"|"$/g, "")); } catch { return r; } } };
    const wait = async (expr, ms) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await ev(VIS + "return JSON.stringify(!!(" + expr + "));")) return true; } catch { /* 換頁中 */ } await sleep(400); } return false; };
    const click = (sel) => chrome.evaluate(VIS + "const el=q(" + JSON.stringify(sel) + "); if(el) el.click(); return JSON.stringify(!!el);");
    const clickText = (t) => chrome.evaluate(VIS + "const el=[...document.querySelectorAll('button')].filter(vis).find(b=>(b.innerText||'').includes(" + JSON.stringify(t) + ")); if(el) el.click(); return JSON.stringify(!!el);");
    const inBattle = "document.querySelector('[data-testid=\"battle-hud\"]') && document.querySelector('canvas')";
    await chrome.send("Page.addScriptToEvaluateOnNewDocument", { source: INJECT });
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
    //  取一段：先清空，arm，睡 ms，disarm，把 frames 拿回來。
    const segment = async (ms) => {
      await chrome.evaluate("window.__glprobe.frames.length=0; window.__glprobe.armed=true; return 1;");
      await sleep(ms);
      return ev("window.__glprobe.armed=false; return JSON.stringify(window.__glprobe.frames);");
    };
    const mode = await ev("return JSON.stringify([...document.scripts].some((s)=>/@vite\\/client/.test(s.src)) ? 'dev' : 'build');").catch(() => "?");
    await chrome.send("Emulation.setDeviceMetricsOverride", { label: "Desktop", width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    const ok = await toBattle();
    ck("進入 MOBA 戰鬥", ok);
    if (!ok) return;
    const probe = await ev("return JSON.stringify(!!window.__glprobe);");
    ck("WebGL 計數腳本已注入", probe === true);
    const buildMode = await ev("return JSON.stringify([...document.scripts].some((s)=>/@vite\\/client/.test(s.src)) ? 'dev' : 'build');");
    await sleep(2500);
    await click('[data-testid="match-speed-1"]'); await sleep(1500);
    const f1 = await segment(20000);
    await click('[data-testid="match-speed-4"]'); await sleep(1500);
    const f4 = await segment(40000);
    for (let i = 0; i < 4; i++) { if ((await ev("const b=document.querySelector('[data-testid=camera-shot-cycle]'); return JSON.stringify(b?b.dataset.shot:null);")) === "close") break; await click('[data-testid="camera-shot-cycle"]'); await sleep(300); }
    await sleep(2500);
    const fc = await segment(20000);
    const totals = await ev("return JSON.stringify(window.__glprobe.totals);");
    const texKinds = await ev("return JSON.stringify(window.__glprobe.texKinds);");
    //  這一場實際用的規則集（開局時落盤在存檔的 activeMatch.config.ruleset；只讀 localStorage，不改任何東西）。
    const rulesetInBattle = await ev("try{const p=JSON.parse(localStorage.getItem('esmo.profile.v1')||'{}');const r=p?.matchmaking?.session?.activeMatch?.config?.ruleset;return JSON.stringify(r?{rulesetId:r.rulesetId,simVersion:r.simVersion,jungleCamp:r.layers&&r.layers.jungleCamp,invasion:r.layers&&r.layers.invasion,tacticalDirector:r.layers&&r.layers.tacticalDirector}:null);}catch(e){return JSON.stringify('err '+e.message);}");
    console.log('rulesetInBattle', JSON.stringify(rulesetInBattle));
    const res = { label: LABEL, url, mode: buildMode, rulesetInBattle, "1x-auto": summarize(f1), "4x-auto": summarize(f4), "4x-close": summarize(fc), pageTotals: totals, texKindsWholeRun: Object.fromEntries(Object.entries(texKinds).sort((a, b) => b[1] - a[1]).slice(0, 15)) };
    writeFileSync(`${OUT}/${LABEL}-glframes.json`, JSON.stringify(res, null, 1));
    writeFileSync(`${OUT}/${LABEL}-glframes-raw4x.json`, JSON.stringify(f4));
    console.log(JSON.stringify({ mode: buildMode, "1x": { fps: res["1x-auto"]?.fps, over50: res["1x-auto"]?.over50, draw: res["1x-auto"]?.avgDraw }, "4x": { fps: res["4x-auto"]?.fps, over50: res["4x-auto"]?.over50, max: res["4x-auto"]?.max, draw: res["4x-auto"]?.avgDraw, texKPx: res["4x-auto"]?.avgTexKPx, bufKB: res["4x-auto"]?.avgBufKB, links: res["4x-auto"]?.totalProgramLinks, linkMs: res["4x-auto"]?.totalLinkMs, long: res["4x-auto"]?.longFrames }, totals, texKinds: res.texKindsWholeRun }));
    ck("量得到逐幀資料", (f1?.length ?? 0) > 100 && (f4?.length ?? 0) > 100);
    ck("page error = 0", chrome.pageErrors.length === 0, JSON.stringify(chrome.pageErrors).slice(0, 300));
  },
});
await finishGate(result);
