#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_prod_objective_layout_v16.mjs — moba-sim.v16 正式站 smoke（Objective Layout／坑位／TD-CS1）
//
//  執行：node tools/browser_check_prod_objective_layout_v16.mjs          （本地 dev server，push 前自驗）
//        node tools/browser_check_prod_objective_layout_v16.mjs --prod   （正式站；ESMO_PROD_URL 可覆寫）
//  正式站無法 import /src（TD-31）⇒ 只用 DOM、canvas 像素與 ?shot= 診斷掛勾（__ESMO_RUNTIME_DIAG／__ESMO_RUNTIME_CAM）。
//  除錯對戰頁每次載入用新的本機 seed ⇒ Objective Layout 約各半；重複載入直到 STANDARD 與 SWAPPED 都看過。
//    P0 線上 bundle 含 moba-sim.v16、objective-pit-markers、objectiveLayout、TD-CS1 規則；Rift GLB HTTP 200 且大小＝13,370,736
//    L[STANDARD／SWAPPED] 畫面坑位標記 layout＝frame layout、兩個標記在該 layout 的坑上；巨龍 boss 在該 layout 的巨龍坑；
//       物件面板存在；小地圖：巨龍紫環在該 layout 的巨龍坑、巴龍琥珀環在巴龍坑
//    D  導播：巨龍期鎖定物件（objectiveFocus）時，鏡頭朝向本場 layout 的巨龍坑（鏡頭平滑移動，不用距離門檻）
//    T  TD-CS1：liuxing（b4）施放後，紅方英雄出現 hero-slow（診斷介面的 frame 狀態）
//    R  SWAPPED 對局 → 快速完成 → 重播：重播 layout＝SWAPPED、標記與 boss 在正確的坑
//    M  390 手機：標記正確、無橫向溢出
//    E  page error 0、console error 0、shader error 0；H 首頁 HTTP 200
//  ⚠ 前置條件都先證明成立，沒看到就明說，不當通過。⚠ chrome.evaluate 字串裡不能有反引號。
// ============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { runGate, finishGate } from "./browser/harness.mjs";

const PROD = process.env.ESMO_PROD_URL || (process.argv.includes("--prod") ? "https://rayhuang0323.github.io/ESMO-/" : null);
const OUT = process.env.ESMO_REVIEW_OUT ?? (PROD ? "review/moba-objective-v16/prod-smoke" : "review/moba-objective-v16/prod-smoke-local");
mkdirSync(OUT, { recursive: true });
//  坑的世界座標（coordinateMapping.simToWorld；Node 端由 src 算好寫死，正式站不能 import）
const PIT = { bot: { x: 85, z: 81.3043 }, top: { x: -85, z: -81.3043 } };
const MINI = { bot: { x: 156.36, y: 154.78 }, top: { x: 83.64, y: 85.22 } };
const LAYOUT_PITS = { STANDARD: { dragon: "bot", baron: "top" }, SWAPPED: { dragon: "top", baron: "bot" } };
const GLB_BYTES = 13370736;

const result = await runGate({
  name: PROD ? "正式站 moba-sim.v16 Objective Layout／坑位／TD-CS1" : "（本地）moba-sim.v16 正式站 smoke 自驗",
  ...(PROD ? { externalUrl: PROD } : {}),
  timeoutMs: 2400000,
  async run({ chrome, url, ck, sleep }) {
    const ev = async (body) => { const r = String(await chrome.evaluate(body)); for (const t of [r, r.replace(/^"|"$/g, "")]) { try { return JSON.parse(t); } catch { /* next */ } } return null; };
    const shot = async (name) => { const s = await chrome.send("Page.captureScreenshot", { format: "png" }); writeFileSync(`${OUT}/${name}.png`, Buffer.from(s.data, "base64")); };
    const d2 = (a, b) => (a && b ? Math.hypot(a.x - b.x, a.z - b.z) : null);

    await chrome.navigate(url); await sleep(2000);
    const home = await ev("return fetch(location.href,{cache:'no-store'}).then(r=>JSON.stringify(r.status));");
    ck("H 首頁 HTTP 200", home === 200, String(home));
    if (PROD) {
      const b = await ev("const s=[...document.scripts].map(x=>x.src).find(x=>x.includes('/assets/index-')); return fetch(s).then(r=>r.text()).then(t=>{const g=(t.match(/esmo-rift-[A-Za-z0-9_-]+\\.glb/)||[])[0]; return (g?fetch(new URL('assets/'+g, location.href)).then(r=>r.arrayBuffer().then(a=>({st:r.status,n:a.byteLength}))):Promise.resolve(null)).then(glb=>JSON.stringify({src:s, v16:t.includes('moba-sim.v17'), v15only:!t.includes('moba-sim.v16'), markers:t.includes('objective-pit-markers'), layout:t.includes('SWAPPED')&&t.includes('objectiveLayout'), tdcs1:t.includes('splitProjectileSlowV16'), glb:g, glbStatus:glb&&glb.st, glbBytes:glb&&glb.n}));});");
      ck("P0 線上 bundle 含目前 moba-sim 版本（v17 起；TD-HI1）、坑位標記、objectiveLayout、TD-CS1；Rift GLB HTTP 200 且為新版（13,370,736 bytes）",
        b?.v16 && b?.markers && b?.layout && b?.tdcs1 && b?.glbStatus === 200 && b?.glbBytes === GLB_BYTES, JSON.stringify(b));
    }

    const probe = () => ev("const d=window.__ESMO_RUNTIME_DIAG?window.__ESMO_RUNTIME_DIAG():null; const c=window.__ESMO_RUNTIME_CAM?window.__ESMO_RUNTIME_CAM():null;"
      + "const cv=document.querySelector('[data-testid=battle-minimap]'); let mini=null; if(cv){const g=cv.getContext('2d'); const cnt=(cx,cy,rgb)=>{let n=0; const im=g.getImageData(Math.round(cx)-7,Math.round(cy)-7,15,15).data; for(let i=0;i<im.length;i+=4){ if(Math.abs(im[i]-rgb[0])<40&&Math.abs(im[i+1]-rgb[1])<40&&Math.abs(im[i+2]-rgb[2])<40) n++; } return n;};"
      + "const k=cv.width/240; mini={botPurple:cnt(" + MINI.bot.x + "*k," + MINI.bot.y + "*k,[192,132,252]),topPurple:cnt(" + MINI.top.x + "*k," + MINI.top.y + "*k,[192,132,252]),botAmber:cnt(" + MINI.bot.x + "*k," + MINI.bot.y + "*k,[245,158,11]),topAmber:cnt(" + MINI.top.x + "*k," + MINI.top.y + "*k,[245,158,11])};}"
      + "return JSON.stringify({ts:d&&d.ts,layout:d&&d.objectiveLayout,markers:d&&d.pitMarkers,bosses:d&&d.bosses,status:d&&d.heroStatus,cam:c&&{mode:c.mode,pan:c.pan},panel:!!document.querySelector('[data-testid=objective-panel]'),mini,over:document.documentElement.scrollWidth-innerWidth});");
    const layoutOk = (p) => { const L = LAYOUT_PITS[p?.layout]; if (!L) return false;
      return p.markers?.layout === p.layout && d2(p.markers.dragon, PIT[L.dragon]) < 0.01 && d2(p.markers.baron, PIT[L.baron]) < 0.01; };
    const bossOk = (p) => { const L = LAYOUT_PITS[p?.layout]; const b = p?.bosses?.dragon; return !!(L && b && d2(b, PIT[L.dragon]) < d2(b, PIT[L.dragon === "bot" ? "top" : "bot"])); };
    const miniOk = (p) => { const L = LAYOUT_PITS[p?.layout]; const m = p?.mini; if (!L || !m) return false;
      return m[L.dragon + "Purple"] > 0 && m[L.baron + "Amber"] > 0 && m[L.baron + "Purple"] === 0 && m[L.dragon + "Amber"] === 0; };
    const startLive = async (w, h, mob) => {
      await chrome.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: mob ? 2 : 1, mobile: mob });
      await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: mob, maxTouchPoints: mob ? 5 : 1 });
      await chrome.navigate(`${url}?debug=moba-runtime-battle&shot=v16prod&waitTs=5&quality=low&heroes=b4:liuxing,r4:miwu`);
      let ready = false;
      for (let i = 0; i < 200 && !ready; i++) { await sleep(1500); ready = String(await chrome.evaluate("return JSON.stringify(window.__BATTLE_SHOT_READY || null);")).includes("v16prod"); }
      if (ready) await ev("const b=[...document.querySelectorAll('button')].find(x=>(x.innerText||'').trim()==='4×'); if(b) b.click(); return JSON.stringify(!!b);");
      return ready;
    };

    const seen = {}, director = { focus: 0, bad: 0, ex: [], dist: [] }; let slow = null, replayDone = false, loads = 0;
    for (let run = 0; run < 10 && (!seen.STANDARD || !seen.SWAPPED || !replayDone); run++) {
      loads++;
      if (!(await startLive(1366, 900, false))) { ck(`B${run} 戰鬥開始`, false); continue; }
      let p = null;
      //  等巨龍刷新（240 s）後才驗 boss／小地圖實心點；期間持續取樣導播與 TD-CS1
      //  導播的前置條件是「雙方在坑邊爭奪」⇒ 巨龍刷新後繼續取樣到觀察到 objectiveFocus 或遊戲時間 600 s
      for (let i = 0; i < 420; i++) {
        p = await probe();
        //  導播：鏡頭是平滑移動的（鎖定瞬間不一定到位）⇒ 不以距離門檻判定。巴龍 480 s 才刷新，之前只有巨龍活著：
        //  鎖定物件時，鏡頭必須離「本場的巨龍」比離另一個坑近（＝導播讀的是本場 layout 的坑）。距離另記資訊。
        if (p?.cam?.mode === "objectiveFocus" && p.bosses?.dragon && p.bosses?.baron && (p.ts ?? 0) < 480) {
          director.focus++;
          const dd = d2(p.cam.pan, p.bosses.dragon), db = d2(p.cam.pan, p.bosses.baron);
          director.dist.push(Math.round(dd));
          if (!(dd < db)) { director.bad++; if (director.ex.length < 3) director.ex.push(JSON.stringify({ layout: p.layout, pan: p.cam.pan, bosses: p.bosses })); }
        }
        if (!slow && p?.status) for (const [id, st] of Object.entries(p.status)) if (id[0] === "r" && st.includes("hero-slow")) slow = { ts: p.ts, id };
        if ((p?.ts ?? 0) >= 262 && (director.focus > 0 || (p?.ts ?? 0) >= 600)) break;
        await sleep(700);
      }
      const L = p?.layout;
      if (!L) { ck(`L${run} 讀到 frame layout`, false, JSON.stringify(p)); continue; }
      if (!seen[L]) {
        seen[L] = true;
        await shot(`${L.toLowerCase()}-live-1366`);
        ck(`L[${L}] 坑位標記 layout＝frame、兩個標記在 ${L} 的坑上；巨龍 boss 在 ${L} 的巨龍坑；物件面板存在`, layoutOk(p) && bossOk(p) && p.panel,
          JSON.stringify({ ts: p.ts, markers: p.markers, dragon: p.bosses?.dragon, panel: p.panel }));
        ck(`L[${L}] 小地圖：巨龍紫環在 ${LAYOUT_PITS[L].dragon === "bot" ? "下方" : "上方"}坑、巴龍琥珀環在另一坑（沒有畫反）`, miniOk(p), JSON.stringify(p.mini));
      }
      if (L === "SWAPPED" && !replayDone) {
        replayDone = true;
        await chrome.evaluate("window.confirm = () => true; return JSON.stringify(1);");
        await ev("const b=document.querySelector('[data-testid=quick-finish-match]'); if(b) b.click(); return JSON.stringify(!!b);");
        let atResult = false;
        for (let i = 0; i < 240 && !atResult; i++) { await sleep(1000); atResult = !!(await ev("return JSON.stringify(!![...document.querySelectorAll('button')].find(b=>/觀看重播/.test(b.innerText||'')));")); }
        if (!atResult) { ck("R SWAPPED 對局快速完成後可開重播", false); continue; }
        await ev("[...document.querySelectorAll('button')].find(b=>/觀看重播/.test(b.innerText||'')).click(); return JSON.stringify(1);");
        let opened = false;
        for (let i = 0; i < 90 && !opened; i++) { await sleep(1000); opened = !!(await ev("return JSON.stringify(!!document.querySelector('[data-testid=replay-play-toggle]') && !document.querySelector('[data-testid=rift-entry-loading]'));")); }
        if (!opened) { ck("R 重播開啟、地圖載入", false); continue; }
        await ev("const btn=document.querySelector('[data-testid=replay-play-toggle]'); if(btn&&/暫停/.test(btn.innerText||'')) btn.click(); return JSON.stringify(1);");
        await ev("const s=document.querySelector('input[aria-label=\"重播時間軸\"]'); const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; set.call(s,255); s.dispatchEvent(new Event('input',{bubbles:true})); s.dispatchEvent(new Event('change',{bubbles:true})); return JSON.stringify(1);");
        await sleep(2000);
        const r = await probe();
        await shot("swapped-replay-1366");
        ck("R 重播 SWAPPED：重播 layout＝SWAPPED、標記在 SWAPPED 的坑、巨龍 boss 在上方坑", r?.layout === "SWAPPED" && layoutOk(r) && bossOk(r), JSON.stringify({ ts: r?.ts, layout: r?.layout, markers: r?.markers, dragon: r?.bosses?.dragon }));
      }
    }
    ck("L 兩種 layout 都在正式畫面出現過（STANDARD 與 SWAPPED）", !!seen.STANDARD && !!seen.SWAPPED, `${JSON.stringify(seen)}（載入 ${loads} 次）`);
    ck("D 導播：巨龍期鎖定物件時，鏡頭朝向本場 layout 的巨龍坑（離巨龍比離另一坑近；至少 1 次 objectiveFocus）", director.focus > 0 && director.bad === 0,
      `objectiveFocus ${director.focus} 次、朝錯坑 ${director.bad} 次；鏡頭到巨龍距離 ${director.dist.join("／")} ${director.ex.join(" ¦ ")}`);
    ck("T TD-CS1：liuxing 施放後紅方英雄出現 hero-slow（正式 frame 狀態）", !!slow, JSON.stringify(slow));

    if (await startLive(390, 844, true)) {
      let p = null; for (let i = 0; i < 40; i++) { p = await probe(); if ((p?.ts ?? 0) >= 30) break; await sleep(700); }
      await shot(`${String(p?.layout).toLowerCase()}-live-390`);
      ck(`M 390 手機（${p?.layout}）：坑位標記正確、物件面板存在、無橫向溢出`, layoutOk(p) && p.panel && p.over <= 0, JSON.stringify({ layout: p?.layout, panel: p?.panel, over: p?.over }));
    } else ck("M 390 手機戰鬥開始", false);

    const errs = chrome.pageErrors ?? [];
    ck("E1 page error 0", errs.length === 0, errs.slice(0, 3).join(" ¦ "));
    const consoleErrs = (chrome.consoleLines ?? []).filter((l) => l.startsWith("[error]"));
    const shaderErrs = (chrome.consoleLines ?? []).filter((l) => /shader|WebGL.*error|THREE\.WebGLProgram/i.test(l));
    ck("E2 console error 0、shader error 0", consoleErrs.length === 0 && shaderErrs.length === 0, [...consoleErrs, ...shaderErrs].slice(0, 3).join(" ¦ "));
    writeFileSync(`${OUT}/summary.json`, JSON.stringify({ prod: !!PROD, seen, loads, director, slow }, null, 2));
  },
});
finishGate(result);
