#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_prod_moba_mobile_hud_release.mjs — 正式站 smoke：MOBA Mobile & Presentation Polish
//
//  執行：node tools/browser/run-gate.mjs tools/browser_check_prod_moba_mobile_hud_release.mjs --timeout 1500000
//  （或直接 node 本檔；ESMO_PROD_URL 可覆寫網址）
//
//  以本機 gate `browser_check_moba_mobile_hud.mjs` 為底改寫成打**線上網址**：
//  ⚠ 正式站讀不到 `/src/`（TD-31）⇒ 鏡頭狀態改讀 `window.__ESMO_RUNTIME_CAM`
//    （`?shot=` 時由 MobaRuntimeView3D 掛上，正式 build 也有），切 free 用 `__ESMO_RUNTIME_SETCAM`。
//    它不回報 heroId ⇒ 「跟隨」改以頭像 aria-pressed ＋ 鏡頭離開 free 判定。
//  ⚠ 前置先證明成立：bundle 是 v15、戰鬥真的推進到 ts ≥ 180、鏡頭真的在 free。
//    L  320／360／390／430：5v5 戰況列、經濟差、拆塔、小地圖 92px、無橫向溢出
//    T  390 真觸控：滑過／長按小地圖鏡頭不動、點一下鏡頭移動
//    H  點頭像跟隨、手機記分板 10 列可開關
//    D  桌機 1366：十人側欄、小地圖 180px、滑鼠拖曳移動鏡頭
//    V  技能地面語彙：非圓環 pool（3 方塊／2 點）有實際畫出；小兵數 > 0；近景截圖
//    A  對線：抽樣英雄狀態（只記錄＋截圖，模擬正確性以 candidate 的 sim gate 為準）
//    E  page error 0、console error 0、shader error 0
// ============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { runGate, finishGate } from "./browser/harness.mjs";

const OUT = process.env.ESMO_REVIEW_OUT ?? "review/moba-mobile-hud/prod-smoke";
mkdirSync(OUT, { recursive: true });
const PROD = process.env.ESMO_PROD_URL ?? "https://rayhuang0323.github.io/ESMO-/";
const WIDTHS = [[320, 640], [360, 740], [390, 844], [430, 932]];

const result = await runGate({
  name: "正式站 MOBA 手機 HUD／小地圖／VFX／小兵",
  externalUrl: PROD,
  timeoutMs: 1500000,
  async run({ chrome, url, ck, sleep }) {
    const ev = async (body) => { const r = String(await chrome.evaluate(body)); for (const t of [r, r.replace(/^"|"$/g, "")]) { try { return JSON.parse(t); } catch { /* next */ } } return null; };
    const shot = async (name) => { const s = await chrome.send("Page.captureScreenshot", { format: "png" }); writeFileSync(`${OUT}/${name}.png`, Buffer.from(s.data, "base64")); };
    const HIDE = "const up=(el)=>{let n=el,i=0;while(n&&i<8){const p=getComputedStyle(n).position;if((p==='absolute'||p==='fixed')&&n!==document.body)return n;n=n.parentElement;i++;}const t=el.closest('table');return t?t.parentElement:null;};"
      + "[...document.querySelectorAll('strong')].filter(s=>(s.textContent||'').startsWith('Android WebGL')).forEach(s=>{const b=up(s);if(b)b.style.display='none';});"
      + "[...document.querySelectorAll('th')].filter(t=>(t.textContent||'')==='避碰修正').forEach(t=>{const b=up(t);if(b)b.style.display='none';});return JSON.stringify(1);";
    const mobile = async (w, h) => {
      await chrome.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile: true });
      await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    };
    const cam = () => ev("const c=window.__ESMO_RUNTIME_CAM&&window.__ESMO_RUNTIME_CAM(); return JSON.stringify(c?{x:c.pan.x,z:c.pan.z,mode:c.mode,zoom:c.zoom}:null);");
    const toFree = () => ev("const c=window.__ESMO_RUNTIME_CAM(); window.__ESMO_RUNTIME_SETCAM({panX:c.pan.x,panZ:c.pan.z}); return JSON.stringify(1);");
    const rect = (sel) => ev("const el=document.querySelector(" + JSON.stringify(sel) + "); if(!el) return JSON.stringify(null); const r=el.getBoundingClientRect(); return JSON.stringify({l:r.left,t:r.top,r:r.right,b:r.bottom,w:r.width,h:r.height});");
    const touch = async (type, x, y) => chrome.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }] });
    const same = (a, b) => a && b && Math.abs(a.x - b.x) < 0.01 && Math.abs(a.z - b.z) < 0.01;

    console.log("[phase] P0 bundle "+new Date().toISOString());
    // ── 前置：線上 bundle 是 v15 ───────────────────────────────────────────
    await chrome.navigate(url); await sleep(2000);
    const bundle = await ev("const s=[...document.scripts].map(x=>x.src).find(x=>/assets\\/index-/.test(x)); return fetch(s).then(r=>r.text()).then(t=>JSON.stringify({src:s, v15:t.includes('moba-sim.v15'), strip:t.includes('mobile-team-strip')}));");
    ck("P0 線上 bundle 含 moba-sim.v15 與 mobile-team-strip", bundle?.v15 && bundle?.strip, JSON.stringify(bundle));

    console.log("[phase] P1 navigate battle "+new Date().toISOString());
    await mobile(390, 844);
    await chrome.navigate(`${url}?debug=moba-runtime-battle&shot=hud&waitTs=180&quality=low`);
    let ready = false;
    for (let i = 0; i < 300 && !ready; i++) { await sleep(1500); const rs = String(await chrome.evaluate("return JSON.stringify(window.__BATTLE_SHOT_READY || null);")); ready = rs.includes("hud"); if (i % 10 === 0) console.log("[wait] " + i + " " + rs.slice(0, 80)); }
    ck("P1 戰鬥開始並推進到 ts ≥ 180", ready);
    if (!ready) return;
    console.log("[phase] P2 cam "+new Date().toISOString());
    const c00 = await cam();
    ck("P2 正式站有鏡頭探針（__ESMO_RUNTIME_CAM）", !!c00, JSON.stringify(c00));

    console.log("[phase] L layout "+new Date().toISOString());
    // ── L 版面 ──────────────────────────────────────────────────────────
    for (const [w, h] of WIDTHS) {
      await mobile(w, h); await sleep(900); await chrome.evaluate(HIDE);
      const L = await ev("const q=(s)=>document.querySelector(s); const R=(e)=>e?e.getBoundingClientRect():null;"
        + "const strip=R(q('[data-testid=\"mobile-team-strip\"]')), hud=R(q('[data-testid=\"battle-hud\"]')), mmEl=q('[data-testid=\"battle-minimap\"]'), mm=R(mmEl), leave=R(q('[data-testid=\"leave-active-match\"]')), dock=R(q('[data-testid=\"observer-dock\"]'));"
        + "const heroes=[...document.querySelectorAll('[data-testid=\"team-strip-hero\"]')]; const cells=heroes.map(b=>b.getBoundingClientRect());"
        + "return JSON.stringify({strip:strip&&{t:strip.top,b:strip.bottom}, hudB:hud&&hud.bottom, leaveT:leave&&leave.top, cells:cells.length, minCell:Math.min(...cells.map(c=>c.width)), cellsIn:cells.every(c=>c.left>=0&&c.right<=innerWidth), mm:mm&&{w:mmEl.clientWidth,b:mm.bottom}, dockT:dock&&dock.top, over:document.documentElement.scrollWidth-innerWidth, overBody:document.body.scrollWidth-innerWidth, gold:q('[data-testid=\"team-strip-gold-diff\"]')?.dataset.goldDiff, obj:q('[data-testid=\"team-strip-objectives\"]')?.dataset.towers, stripText:(q('[data-testid=\"mobile-team-strip\"]')?.innerText||'').replace(/\\s+/g,' ').slice(0,120)});");
      ck(`L1[${w}] 5v5 戰況列 10 格、全在畫面內`, L?.strip && L.cells === 10 && L.cellsIn, JSON.stringify({ cells: L?.cells, minCell: L?.minCell }));
      ck(`L2[${w}] 戰況列在記分板下方、不壓「暫停並離開」`, L?.strip && L.strip.t >= L.hudB - 0.5 && L.strip.b <= L.leaveT + 0.5, `hud ${L?.hudB} strip ${L?.strip?.t}–${L?.strip?.b} leave ${L?.leaveT}`);
      ck(`L3[${w}] 頭像寬 ≥ 18px`, L?.minCell >= 18, String(L?.minCell));
      ck(`L4[${w}] 經濟差與拆塔數有值`, L?.gold !== undefined && L.gold !== "" && /^\d+:\d+$/.test(L?.obj ?? ""), `${L?.gold} ${L?.obj} ｜ ${L?.stripText}`);
      ck(`L5[${w}] 小地圖 92px、在底欄上方`, L?.mm && Math.abs(L.mm.w - 92) < 1.5 && L.mm.b <= L.dockT + 0.5, JSON.stringify(L?.mm) + ` dock ${L?.dockT}`);
      ck(`L6[${w}] 無橫向溢出`, L?.over <= 0 && L?.overBody <= 0, `${L?.over} / ${L?.overBody}`);
      await shot(`m${w}`);
    }
    //  存活／HP：戰況列頭像要反映畫面上的英雄狀態（讀 DOM，不讀 localStorage）
    const hp = await ev("const hs=[...document.querySelectorAll('[data-testid=\"team-strip-hero\"]')]; return JSON.stringify(hs.map(b=>({seat:b.dataset.seat, alive:b.dataset.alive??null, hp:b.dataset.hp??null, style:(b.querySelector('[style*=\"width\"]')?.getAttribute('style')||'').slice(0,60)})));");
    ck("L7 戰況列 10 格都帶 seat（存活／HP 顯示見截圖）", Array.isArray(hp) && hp.length === 10 && hp.every((x) => x.seat), JSON.stringify(hp).slice(0, 400));

    console.log("[phase] T touch "+new Date().toISOString());
    // ── T 小地圖真觸控（390）──────────────────────────────────────────────
    await mobile(390, 844); await sleep(800); await chrome.evaluate(HIDE);
    await toFree(); await sleep(300);
    const mm = await rect('[data-testid="battle-minimap"]');
    const c0 = await cam();
    ck("T0 鏡頭已切到 free", c0?.mode === "free", JSON.stringify(c0));
    await touch("touchStart", mm.l + 12, mm.t + 12);
    for (let i = 1; i <= 6; i++) { await touch("touchMove", mm.l + 12 + i * 10, mm.t + 12 + i * 10); await sleep(16); }
    await touch("touchEnd"); await sleep(400);
    const c1 = await cam();
    ck("T1 手指滑過小地圖 ⇒ 鏡頭不動", same(c0, c1), `${JSON.stringify(c0)} → ${JSON.stringify(c1)}`);
    const c2 = await cam();
    await touch("touchStart", mm.l + mm.w * 0.8, mm.t + mm.h * 0.2); await sleep(700); await touch("touchEnd"); await sleep(400);
    const c3 = await cam();
    ck("T3 長按小地圖 ⇒ 鏡頭不動", same(c2, c3), `${JSON.stringify(c2)} → ${JSON.stringify(c3)}`);
    await touch("touchStart", mm.l + mm.w * 0.8, mm.t + mm.h * 0.2); await sleep(90); await touch("touchEnd"); await sleep(500);
    const c4 = await cam();
    ck("T4 點一下小地圖 ⇒ 鏡頭移到點擊處（往右、仍是 free）", c4 && c4.x > c3.x + 1 && Math.hypot(c4.x - c3.x, c4.z - c3.z) > 5 && c4.mode === "free", `${JSON.stringify(c3)} → ${JSON.stringify(c4)}`);
    await shot("t-minimap-tap");

    console.log("[phase] H strip "+new Date().toISOString());
    // ── H 戰況列互動 ──────────────────────────────────────────────────────
    const seat = await ev("const b=[...document.querySelectorAll('[data-testid=\"team-strip-hero\"]')].find(x=>x.dataset.seat==='r3'); if(!b) return JSON.stringify(null); const r=b.getBoundingClientRect(); return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2});");
    if (seat) { await touch("touchStart", seat.x, seat.y); await sleep(60); await touch("touchEnd"); await sleep(900); }
    const h1 = await cam();
    const pressed = await ev("return JSON.stringify(document.querySelector('[data-testid=\"team-strip-hero\"][data-seat=\"r3\"]')?.getAttribute('aria-pressed'));");
    ck("H1 點戰況列頭像 ⇒ 跟隨該英雄（頭像選取、鏡頭離開 free）", pressed === "true" && h1 && h1.mode !== "free", `${JSON.stringify(h1)} pressed=${pressed}`);
    await shot("h-follow");
    const center = await rect('[data-testid="team-strip-center"]');
    await touch("touchStart", center.l + center.w / 2, center.t + center.h / 2); await sleep(60); await touch("touchEnd"); await sleep(700);
    const board = await ev("const rows=[...document.querySelectorAll('[data-testid=\"mobile-board-row\"]')]; const b=document.querySelector('[data-testid=\"mobile-scoreboard\"]')?.getBoundingClientRect(); return JSON.stringify({rows:rows.length, kda:rows.every(r=>/\\d+\\/\\d+\\/\\d+/.test(r.innerText||'')), inView:b?b.left>=0&&b.right<=innerWidth:false});");
    ck("H2 點中央 ⇒ 手機記分板 10 列（含 K/D/A），不溢出", board?.rows === 10 && board.kda && board.inView, JSON.stringify(board));
    await shot("h-board");
    await chrome.evaluate("document.querySelector('[data-testid=\"mobile-board-close\"]')?.click(); return JSON.stringify(1);"); await sleep(400);
    ck("H3 記分板可關閉", !(await rect('[data-testid="mobile-scoreboard"]')));

    console.log("[phase] V vfx "+new Date().toISOString());
    // ── V 技能語彙／小兵／對線抽樣（桌機視角，近景）─────────────────────────
    await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: false });
    await chrome.send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    await sleep(1000); await chrome.evaluate(HIDE);
    const samples = [];
    for (let i = 0; i < 6; i++) {
      const s = await ev("const d=window.__ESMO_RUNTIME_DIAG&&window.__ESMO_RUNTIME_DIAG(); const v=window.__HERO_VFX_DIAG&&window.__HERO_VFX_DIAG(); return JSON.stringify({ts:d&&d.ts, minions:d&&d.minionCount, fx:d&&d.activeEffectCount, dead:d&&d.deadHeroCount, heroes:d&&d.heroCount, vfx:v&&{counts:v.counts,active:v.activeFrames,named:v.namedDrawnFrames,dropped:v.dropped}, act:d&&d.heroRenderDiagnostics.map(h=>h.id+':'+h.actionState).join(' ')});");
      samples.push(s);
      if (i === 2) await shot("battle-desktop-overview");
      await sleep(4000);
    }
    const last = samples[samples.length - 1];
    writeFileSync(`${OUT}/samples.json`, JSON.stringify(samples, null, 2));
    ck("V0 戰鬥持續推進（ts 增加）", samples[0]?.ts != null && last?.ts > samples[0].ts, samples.map((s) => s?.ts).join(" → "));
    ck("V1 小兵存在（minionCount > 0）", samples.some((s) => s?.minions > 0), samples.map((s) => s?.minions).join(","));
    //  ⚠ counts 是**當幀**各 pool 的 instance 數（每幀開頭 counts.fill(0)），取單點會落在
    //    沒有技能的空檔 ⇒ 連續取樣 15 秒、記每個 pool 的最大值。
    const vfxMax = await ev("return new Promise((res)=>{const mx=[0,0,0,0,0]; let n=0, hit=0; const t=setInterval(()=>{const v=window.__HERO_VFX_DIAG&&window.__HERO_VFX_DIAG(); if(v){n++; if(v.counts.some(c=>c>0)) hit++; v.counts.forEach((c,i)=>{if(c>mx[i])mx[i]=c;});} if(n>=60){clearInterval(t); res(JSON.stringify({max:mx, samples:n, nonEmpty:hit}));}},250);});");
    ck("V2 技能 VFX 有非圓環語彙實際畫出（15 秒內 pool 3 方塊 或 pool 2 點 最大值 > 0）", (vfxMax?.max?.[3] ?? 0) + (vfxMax?.max?.[2] ?? 0) > 0, JSON.stringify(vfxMax) + " ｜ 累計 " + JSON.stringify(last?.vfx));
    ck("V3 10 位英雄都在場", last?.heroes === 10, String(last?.heroes));
    //  近景：拉近到中路看小兵輪廓
    await ev("window.__ESMO_RUNTIME_SETCAM({dist:260, panX:0, panZ:0}); return JSON.stringify(1);"); await sleep(1500);
    await shot("battle-closeup-mid");
    await ev("window.__ESMO_RUNTIME_SETCAM({fitAll:true}); return JSON.stringify(1);"); await sleep(1200);
    await shot("battle-fitall");

    console.log("[phase] D desktop "+new Date().toISOString());
    // ── D 桌機 ──────────────────────────────────────────────────────────
    const D = await ev("return JSON.stringify({strip:!!document.querySelector('[data-testid=\"mobile-team-strip\"]'), rails:document.querySelectorAll('[data-testid=\"observer-hero\"]').length, mm:document.querySelector('[data-testid=\"battle-minimap\"]')?.clientWidth, over:document.documentElement.scrollWidth-innerWidth});");
    ck("D1 桌機沒有 5v5 戰況列、十人側欄仍在", D && !D.strip && D.rails === 10, JSON.stringify(D));
    ck("D2 桌機小地圖維持 180px", D && Math.abs(D.mm - 180) < 1.5, String(D?.mm));
    await toFree(); await sleep(200);
    const dm = await rect('[data-testid="battle-minimap"]');
    const d0 = await cam();
    const mouse = (type, x, y, buttons) => chrome.send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons, clickCount: 1 });
    await mouse("mouseMoved", dm.l + 20, dm.t + dm.h - 20, 0);
    await mouse("mousePressed", dm.l + 20, dm.t + dm.h - 20, 1);
    const d1 = await cam();
    for (let i = 1; i <= 5; i++) { await mouse("mouseMoved", dm.l + 20 + i * 25, dm.t + dm.h - 20 - i * 25, 1); await sleep(20); }
    await mouse("mouseReleased", dm.l + 145, dm.t + dm.h - 145, 0); await sleep(300);
    const d2 = await cam();
    ck("D3 桌機滑鼠：按下即移動、拖曳連續移動",
      d1 && d2 && Math.hypot(d1.x - d0.x, d1.z - d0.z) > 1 && d2.x > d1.x + 1, `${JSON.stringify(d0)} → ${JSON.stringify(d1)} → ${JSON.stringify(d2)}`);
    await shot("desktop1366");

    console.log("[phase] E errors "+new Date().toISOString());
    // ── E 錯誤 ──────────────────────────────────────────────────────────
    const errs = chrome.pageErrors ?? [];
    const lines = chrome.consoleLines ?? [];
    const consoleErr = lines.filter((l) => l.startsWith("[error]"));
    const shader = lines.filter((l) => /shader|WebGLProgram|GL_INVALID|CONTEXT_LOST/i.test(l));
    writeFileSync(`${OUT}/console.txt`, lines.join("\n"));
    ck("E1 page error 0", errs.length === 0, errs.slice(0, 3).join(" ¦ "));
    ck("E2 console error 0", consoleErr.length === 0, consoleErr.slice(0, 3).join(" ¦ "));
    ck("E3 shader／WebGL error 0", shader.length === 0, shader.slice(0, 3).join(" ¦ "));
  },
});
finishGate(result);
