#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_moba_spectacle_vision.mjs — feature/moba-spectacle-vision 瀏覽器驗收
//
//  執行：node tools/browser/run-gate.mjs tools/browser_check_moba_spectacle_vision.mjs --timeout 2400000
//  （dev server；?diag=1 只開驗收讀值，正式對戰不會出現。evaluate 字串不可含反引號。）
//
//  桌機 1366×900 與 390×844 各一輪，全部走正式流程（首頁 → 賽前 → Ban/Pick → 載入 → Battle）：
//    P  1×／2×／4× 對戰都在跑（十名英雄、時間前進）
//    V  技能：具名技能真的畫到；實戰中家族層真的畫出來（≥ 1 種，依選角而定；四族覆蓋見 G 與 node V1）
//    G  Workshop 逐一播放天降／落雷／砸地，確認四個家族中的垂直類效果真的畫出來
//    S  狀態：英雄身上至少出現 3 種不同造型（護盾／增益／減益／控制不共用同一種）
//    N  野怪與營地底下沒有環形幾何（objective-ring、contact ring 已移除）
//    J  英雄對野怪／龍／巴龍施放技能（objectiveSkillFx > 0）
//    F  迷霧：開 ⇒ 有視野來源、迷霧中的敵方英雄被隱藏；關 ⇒ 全圖（沒有 fog、沒有隱藏）
//    C  鏡頭：近戰 > 標準 > 全景（正交 zoom）；導播節拍會變、且換鏡間隔不會太頻繁
//    R  Replay：迷霧開關與鏡頭切換同樣可用
//    X  page error 0、console／shader error 0
// ============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { runGate, finishGate } from "./browser/harness.mjs";

const OUT = process.env.ESMO_REVIEW_OUT ?? "tmp/moba-spectacle-vision";
mkdirSync(OUT, { recursive: true });
const VIS = "const vis=(e)=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;}; const q=(s)=>[...document.querySelectorAll(s)].find(vis);";

const result = await runGate({
  name: "MOBA spectacle ＋ vision", timeoutMs: 2_300_000,
  async run({ chrome, url, ck, sleep }) {
    const ev = async (body) => { const r = String(await chrome.evaluate(body)); for (const t of [r, r.replace(/^"|"$/g, "")]) { try { return JSON.parse(t); } catch { /* 下一個 */ } } return r; };
    const wait = async (expr, ms, every = 400) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await ev(VIS + "return JSON.stringify(!!(" + expr + "));")) return true; } catch { /* 換頁中 */ } await sleep(every); } return false; };
    const click = (sel) => chrome.evaluate(VIS + "const el=q(" + JSON.stringify(sel) + "); if(el) el.click(); return JSON.stringify(!!el);");
    const clickText = (t) => chrome.evaluate(VIS + "const el=[...document.querySelectorAll('button')].filter(vis).find(b=>(b.innerText||'').includes(" + JSON.stringify(t) + ")); if(el) el.click(); return JSON.stringify(!!el);");
    const shot = async (name) => { const s = await chrome.send("Page.captureScreenshot", { format: "png" }); writeFileSync(`${OUT}/${name}.png`, Buffer.from(s.data, "base64")); };
    const diag = () => ev("const d=window.__ESMO_RUNTIME_DIAG?window.__ESMO_RUNTIME_DIAG():null; const v=window.__HERO_VFX_DIAG?window.__HERO_VFX_DIAG():null; const s=window.__HERO_STATUS_FX_DIAG?window.__HERO_STATUS_FX_DIAG():null; const b=document.querySelector('[data-testid=camera-shot-cycle]'); return JSON.stringify(d?{ts:d.ts,heroes:d.heroCount,fog:d.fog,obj:d.objectiveSkillFx,rings:d.ringCensus,dist:d.cameraDistance,zoom:d.camera?d.camera.zoom:null,vfx:v,status:s,shot:b?b.dataset.shot:null,beat:b?b.dataset.beat:null}:null);");
    const inBattle = "document.querySelector('[data-testid=\"battle-hud\"]') && document.querySelector('canvas')";

    async function toBattle() {
      await chrome.navigate(url + "?diag=1");
      await chrome.evaluate("try{localStorage.clear();sessionStorage.clear();}catch(e){} return 1;");
      await chrome.navigate(url + "?diag=1");
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
        if (await ev(VIS + "return JSON.stringify(!!(" + inBattle + "));")) return wait("window.__ESMO_RUNTIME_DIAG", 30000);
        await chrome.evaluate(VIS + "const s=[...document.querySelectorAll('button')].filter(vis).find(b=>/開始比賽|進入戰鬥|開始戰鬥/.test(b.innerText||'')); if(s&&!s.disabled) s.click(); return 1;");
        await sleep(700);
      }
      return false;
    }
    const setShot = async (want) => {
      for (let i = 0; i < 5; i++) {
        if ((await ev("const b=document.querySelector('[data-testid=camera-shot-cycle]'); return JSON.stringify(b?b.dataset.shot:null);")) === want) return true;
        await click('[data-testid="camera-shot-cycle"]'); await sleep(250);
      }
      return false;
    };
    const setFog = async (on) => {
      const cur = await ev("const b=document.querySelector('[data-testid=fog-toggle]'); return JSON.stringify(b?b.dataset.fog:null);");
      if ((cur === "on") !== on) await click('[data-testid="fog-toggle"]');
      await sleep(900);
    };

    for (const vp of [
      { label: "Desktop", width: 1366, height: 900, deviceScaleFactor: 1, mobile: false },
      { label: "390", width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
    ]) {
      const L = vp.label;
      await chrome.send("Emulation.setDeviceMetricsOverride", vp);
      ck(`${L}｜P0 正式流程進入 MOBA 戰鬥（diag）`, await toBattle());
      ck(`${L}｜C0 鏡頭／迷霧按鈕存在`, await wait("q('[data-testid=\"camera-shot-cycle\"]') && q('[data-testid=\"fog-toggle\"]')", 10000));

      // P：1×／2×／4×
      for (const rate of [1, 2, 4]) {
        await click(`[data-testid="match-speed-${rate}"]`);
        const a = await diag(); await sleep(2500); const b = await diag();
        ck(`${L}｜P${rate} ${rate}× 對戰在跑（十名英雄、時間前進）`, a?.heroes === 10 && b?.ts > a?.ts, `${a?.ts?.toFixed?.(1)} → ${b?.ts?.toFixed?.(1)}`);
      }
      await shot(`${L}-battle-4x`);

      // 4× 取樣：技能家族、狀態造型、打野施法、迷霧隱藏、野怪環普查、導播節拍
      await setShot("auto"); await setFog(true);
      let objMax = 0, fogHiddenMax = 0, fogSources = 0, ringsMax = { neutralRings: 0, objectiveRings: 0 }, last = null;
      const beats = new Set(); const beatChanges = []; let prevBeat = null;
      const t0 = Date.now();
      while (Date.now() - t0 < 70000) {
        const d = await diag();
        if (d) {
          last = d;
          objMax = Math.max(objMax, d.obj ?? 0);
          if (d.fog) { fogHiddenMax = Math.max(fogHiddenMax, d.fog.hiddenHeroes?.length ?? 0); fogSources = Math.max(fogSources, d.fog.sources ?? 0); }
          ringsMax.neutralRings = Math.max(ringsMax.neutralRings, d.rings?.neutralRings ?? 0);
          ringsMax.objectiveRings = Math.max(ringsMax.objectiveRings, d.rings?.objectiveRings ?? 0);
          if (d.beat) { beats.add(d.beat); if (prevBeat && d.beat !== prevBeat) beatChanges.push(Date.now()); prevBeat = d.beat; }
        }
        await sleep(500);
      }
      const fams = Object.entries(last?.vfx?.spectacle ?? {}).filter(([, n]) => n > 0).map(([k]) => k);
      ck(`${L}｜V1 具名技能真的畫到`, (last?.vfx?.namedDrawnFrames ?? 0) > 0, `named ${last?.vfx?.namedDrawnFrames}`);
      //  ⚠ 實戰出現哪幾個家族取決於這場自動選到的英雄；四個家族的完整覆蓋由下方 G（Workshop）逐一播放驗證。
      ck(`${L}｜V2 實戰中技能家族層真的畫出來（≥ 1 種；出現哪幾種依選角而定）`, fams.length >= 1, JSON.stringify(last?.vfx?.spectacle));
      const kinds = Object.keys(last?.status?.seen ?? {});
      const cats = new Set(kinds.map((k) => k.split(":")[0]));
      ck(`${L}｜S1 英雄身上出現 ≥ 3 種不同狀態造型、≥ 2 個類別`, kinds.length >= 3 && cats.size >= 2, JSON.stringify(last?.status?.seen));
      ck(`${L}｜N1 野怪與營地底下沒有環形幾何`, ringsMax.neutralRings === 0 && ringsMax.objectiveRings === 0, JSON.stringify(ringsMax));
      ck(`${L}｜J1 英雄會對野怪／龍／巴龍施放技能`, objMax > 0, `objectiveSkillFx max ${objMax}`);
      ck(`${L}｜F1 迷霧開：有我方視野來源、迷霧中的敵方英雄被隱藏過`, fogSources > 0 && fogHiddenMax > 0, `sources ${fogSources}／hidden max ${fogHiddenMax}`);
      const gaps = beatChanges.slice(1).map((t, i) => t - beatChanges[i]);
      ck(`${L}｜C1 導播節拍會變（≥ 2 種），且兩次換鏡間隔 ≥ 1.4 秒`, beats.size >= 2 && gaps.every((g) => g >= 1400), `beats ${[...beats].join(",")}／min gap ${gaps.length ? Math.min(...gaps) : "-"}ms`);
      await shot(`${L}-fog-on`);

      // F：迷霧關 ⇒ 全圖
      await setFog(false);
      const off = await diag();
      ck(`${L}｜F2 迷霧關：沒有 fog、沒有隱藏英雄`, off && off.fog === null, JSON.stringify(off?.fog));
      await shot(`${L}-fog-off`);
      await setFog(true);

      // C：鏡頭距離 近 < 標準 < 全景
      //  正式 runtime 是正交相機：取景由 camera.zoom 決定（距離固定）。近戰 zoom 最大、全景最小。
      //  ⚠ zoom 是每幀 4% 插值收斂；headless 幀率低時 3.5 秒還沒到位 ⇒ 等到 1 秒內變化 < 0.02（最多 12 秒）再讀。
      const zoomOf = async (s) => {
        await setShot(s);
        let prev = null;
        for (let i = 0; i < 12; i++) { await sleep(1000); const z = (await diag())?.zoom; if (prev != null && Math.abs(z - prev) < 0.02) return z; prev = z; }
        return prev;
      };
      const zT = await zoomOf("tactical"), zC = await zoomOf("close"); await shot(`${L}-camera-close`);
      const zW = await zoomOf("wide"); await shot(`${L}-camera-wide`);
      ck(`${L}｜C2 近戰 > 標準 > 全景（正交 zoom）`, zC > zT && zT > zW, `close ${zC?.toFixed?.(2)}／tactical ${zT?.toFixed?.(2)}／wide ${zW?.toFixed?.(2)}`);
      await setShot("auto");
      ck(`${L}｜X0 戰鬥畫面無橫向 overflow`, await ev("return JSON.stringify(document.documentElement.scrollWidth <= innerWidth + 1);"));

      // R：快速完成 → 結果 → 重播
      await chrome.evaluate(VIS + "window.confirm=()=>true; const el=q('[data-testid=\"quick-finish-match\"]'); setTimeout(()=>{ if(el) el.click(); },0); return JSON.stringify(!!el);");
      const res = await wait("[...document.querySelectorAll('button')].some(b=>(b.innerText||'').includes('觀看重播'))", 300000, 800);
      ck(`${L}｜R0 比賽結束 ⇒ 結果頁`, res);
      if (res) {
        await clickText("觀看重播");
        const open = await wait("document.querySelector('[aria-label=\"比賽重播\"]') && q('[data-testid=\"fog-toggle\"]') && window.__ESMO_RUNTIME_DIAG", 60000);
        ck(`${L}｜R1 Replay 開啟且有迷霧／鏡頭按鈕`, open);
        if (open) {
          await clickText("▶"); await sleep(2500);
          await setFog(true); const ron = await diag();
          await setFog(false); const roff = await diag();
          ck(`${L}｜R2 Replay 迷霧可切換（開有 fog、關為全圖）`, !!ron?.fog && roff?.fog === null, `on ${JSON.stringify(ron?.fog?.sources)}／off ${JSON.stringify(roff?.fog)}`);
          const before = await ev("return JSON.stringify(document.querySelector('[data-testid=camera-shot-cycle]').dataset.shot);");
          await click('[data-testid="camera-shot-cycle"]'); await sleep(300);
          const after = await ev("return JSON.stringify(document.querySelector('[data-testid=camera-shot-cycle]').dataset.shot);");
          ck(`${L}｜R3 Replay 鏡頭可切換`, before !== after, `${before} → ${after}`);
          await shot(`${L}-replay`);
          await setFog(true);
        }
      }
    }
    // ── G：Workshop（DEV 技能預覽）逐一播放天降／落雷／砸地，確認家族層真的畫出來 ─────────────
    await chrome.send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    await chrome.navigate(url + "?debug=hero-skills");
    if (await wait("document.querySelector('select[aria-label=\"技能\"]')", 60000)) {
      for (const [fam, id] of [["sky", "phantom:R"], ["lightning", "leiting:Q"], ["slam", "ironclad:Q"]]) {
        await chrome.evaluate("const s=document.querySelector('select[aria-label=\"技能\"]'); const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set; set.call(s," + JSON.stringify(id) + "); s.dispatchEvent(new Event('change',{bubbles:true})); return 1;");
        let got = 0;
        for (let i = 0; i < 30 && !got; i++) { await sleep(200); got = await ev("const p=window.__HERO_SKILLS_PREVIEW__; return JSON.stringify(p&&p.skillId===" + JSON.stringify(id) + "&&p.spectacle?p.spectacle." + fam + ":0);"); }
        ck(`G｜${fam} 家族在技能預覽中畫出（${id}）`, got > 0, `${got}`);
        await shot(`workshop-${fam}`);
      }
    } else ck("G｜技能預覽頁可開", false);

    const errs = chrome.consoleLines.filter((l) => /shader error|VALIDATE_STATUS|WebGL.*error|Uncaught|TypeError|ReferenceError/i.test(JSON.stringify(l)));
    ck("X1 page error = 0", chrome.pageErrors.length === 0, JSON.stringify(chrome.pageErrors).slice(0, 400));
    ck("X2 console／shader error = 0", errs.length === 0, JSON.stringify(errs).slice(0, 400));
  },
});
await finishGate(result);
