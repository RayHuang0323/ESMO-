#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_moba_objective_hud_polish.mjs — Mobile Objective HUD polish（v17 Release 前，瀏覽器）
//
//  執行：node tools/browser_check_moba_objective_hud_polish.mjs（本地 dev server；一次只跑這一支）
//  走 ?debug=moba-runtime-battle（正式 GameView／引擎／HUD），4× 速度跑一場：
//    S  巨龍與巴龍各自真的經過四種狀態：pre（出生前）／alive（可搶）／fight（交戰中）／respawn（重生倒數）
//       ⇒ 每種狀態第一次出現時（390 手機）量：物件列不與 記分板／5v5 戰況列／暫停離開／速度鈕／戰報／
//         Boss 血條／小地圖／底欄 重疊，且在畫面內；data-state 與 snapshot 一致
//    L  320／360／390／430 手機與 1366 桌機：物件列緊貼記分板下方（手機在戰況列之上），無重疊、無橫向溢出
//    I  圖示是 SVG（data-objective-icon＝dragon／baron），物件列與戰況列不再出現 🐉／👑 emoji；
//       另輸出 12／16／24／48px 圖示對照圖（Owner 看小尺寸辨識度）
//    E  page error 0、console error 0、shader error 0
//  ⚠ 只讀 store；chrome.evaluate 字串裡不能有反引號。
// ============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { runGate, finishGate } from "./browser/harness.mjs";

const OUT = process.env.ESMO_REVIEW_OUT ?? "review/moba-objective-hud-polish/gate";
mkdirSync(OUT, { recursive: true });
const STATES = ["pre", "alive", "fight", "respawn"];

const result = await runGate({
  name: "Mobile Objective HUD polish",
  timeoutMs: 1800000,
  async run({ chrome, url, ck, sleep }) {
    const ev = async (body) => { const r = String(await chrome.evaluate(body)); for (const t of [r, r.replace(/^"|"$/g, "")]) { try { return JSON.parse(t); } catch { /* next */ } } return null; };
    const HIDE = "const up=(el)=>{let n=el,i=0;while(n&&i<8){const p=getComputedStyle(n).position;if((p==='absolute'||p==='fixed')&&n!==document.body)return n;n=n.parentElement;i++;}const t=el.closest('table');return t?t.parentElement:null;};"
      + "[...document.querySelectorAll('strong')].filter(s=>(s.textContent||'').startsWith('Android WebGL')).forEach(s=>{const b=up(s);if(b)b.style.display='none';});"
      + "[...document.querySelectorAll('th')].filter(t=>(t.textContent||'')==='避碰修正').forEach(t=>{const b=up(t);if(b)b.style.display='none';});return JSON.stringify(1);";
    const shot = async (name) => { await chrome.evaluate(HIDE); const s = await chrome.send("Page.captureScreenshot", { format: "png" }); writeFileSync(`${OUT}/${name}.png`, Buffer.from(s.data, "base64")); };
    const BASE = new URL(".", url.endsWith("/") ? url : url + "/").pathname;
    const STORE = BASE + "src/useGameStore.js";
    const mobile = async (w, h) => {
      await chrome.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile: true });
      await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    };
    const desktop = async () => {
      await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: false });
      await chrome.send("Emulation.clearDeviceMetricsOverride", {});
      await chrome.send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    };
    //  版面量測：物件列與所有可能相鄰的元件（不存在的元件回 null，不算重疊）
    const LAYOUT = "const R=(e)=>{if(!e) return null; const r=e.getBoundingClientRect(); if(!r.width||!r.height) return null; return {l:r.left,r:r.right,t:r.top,b:r.bottom};};"
      + "const q=(s)=>document.querySelector(s);"
      + "const btn=(t)=>[...document.querySelectorAll('button')].find(b=>(b.textContent||'').trim()===t);"
      + "const tl=[...document.querySelectorAll('div')].filter(d=>(d.innerText||'').startsWith('戰報')).map(d=>d).sort((a,b)=>b.getBoundingClientRect().bottom-a.getBoundingClientRect().bottom)[0];"
      + "const o={panel:R(q('[data-testid=\"objective-panel\"]')),hud:R(q('[data-testid=\"battle-hud\"]')),strip:R(q('[data-testid=\"mobile-team-strip\"]')),leave:R(q('[data-testid=\"leave-active-match\"]')),"
      + "speed1:R(btn('1×')),speed4:R(btn('4×')),fast:R(btn('快速完成')),timeline:R(tl),boss:R(q('[data-testid=\"boss-hud\"]')),mm:R(q('[data-testid=\"battle-minimap\"]')),dock:R(q('[data-testid=\"observer-dock\"]')),rail:R(q('.observer-rail.blue')),kill:(()=>{const k=q('.observer-killfeed'); return k&&k.children.length?R(k):null;})()};"
      + "const hit=(a,b)=>a&&b&&Math.min(a.r,b.r)-Math.max(a.l,b.l)>0.5&&Math.min(a.b,b.b)-Math.max(a.t,b.t)>0.5;"
      + "const others=['hud','strip','leave','speed1','speed4','fast','timeline','boss','mm','dock','rail'];"
      + "const overlaps=o.panel?others.filter(k=>hit(o.panel,o[k])):['NO_PANEL'];"
      + "const bossOverlaps=o.boss?['panel','kill','timeline','strip','leave','speed1','speed4','fast','hud','rail','mm','dock'].filter(k=>hit(o.boss,o[k])):[];"
      + "const st=(id)=>{const e=q('[data-testid=\"objective-spawn-'+id+'\"]'); return e?e.getAttribute('data-state'):null;};"
      + "return JSON.stringify({o,overlaps,bossOverlaps,vw:innerWidth,over:document.documentElement.scrollWidth-innerWidth,dragon:st('dragon'),baron:st('baron')});";
    const layout = () => ev(LAYOUT);
    const snapStates = () => ev("return import('" + STORE + "').then(m=>{const s=m.useGameStore.getState().snapshot; if(!s) return JSON.stringify(null);"
      + "const f=(id)=>{const o=(s.objectives||[]).find(x=>x.id===id); if(!o) return null; return o.alive?((o.hp??1)<0.999?'fight':'alive'):(o.spawnedOnce?'respawn':'pre');};"
      + "return JSON.stringify({ts:s.ts,over:!!s.over,dragon:f('dragon'),baron:f('baron')});});");
    const clickText = (t) => ev("const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').trim()===" + JSON.stringify(t) + "); if(!b) return JSON.stringify(false); b.click(); return JSON.stringify(true);");

    await mobile(390, 844);
    await chrome.navigate(`${url}?debug=moba-runtime-battle&shot=objhud&waitTs=1&quality=low`);
    let ready = false;
    for (let i = 0; i < 200 && !ready; i++) { await sleep(1000); ready = String(await chrome.evaluate("return JSON.stringify(window.__BATTLE_SHOT_READY || null);")).includes("objhud"); }
    ck("戰鬥開始", ready);
    if (!ready) return;

    // ── S 四種狀態（390）────────────────────────────────────────────────
    const seen = { dragon: {}, baron: {} };
    let mismatch = [];
    let firstPass = true;
    await chrome.evaluate(HIDE);
    for (let i = 0; i < 2400; i++) {
      const s = await snapStates();
      if (!s || s.over) break;
      for (const id of ["dragon", "baron"]) {
        const state = s[id];
        if (state && !seen[id][state]) {
          const L = await layout();
          seen[id][state] = { ts: Math.round(s.ts), dom: L?.[id], overlaps: L?.overlaps, boss: !!L?.o?.boss, bossOverlaps: L?.bossOverlaps, kill: !!L?.o?.kill, inView: L?.o?.panel && L.o.panel.l >= 0 && L.o.panel.r <= L.vw, over: L?.over };
          if (L?.[id] !== state) mismatch.push(`${id}:${state}≠dom ${L?.[id]}`);
          await shot(`m390_${id}_${state}`);
        }
      }
      if (firstPass && s.ts > 5) { firstPass = false; await clickText("4×"); }
      if (STATES.every((k) => seen.dragon[k]) && STATES.every((k) => seen.baron[k])) break;
      await sleep(250);
    }
    for (const id of ["dragon", "baron"]) {
      for (const k of STATES) {
        const r = seen[id][k];
        ck(`S[${id}:${k}] 狀態出現，物件列無重疊（交戰時另驗 Boss 血條不壓物件列／擊殺通知／戰報）、在畫面內、data-state 與 snapshot 一致`,
          !!r && r.overlaps?.length === 0 && (r.bossOverlaps?.length ?? 0) === 0 && r.inView && r.over <= 0 && r.dom === k, JSON.stringify(r ?? "未出現"));
      }
    }
    ck("S9 物件列狀態與 snapshot 每次取樣都一致", mismatch.length === 0, mismatch.slice(0, 4).join("、") || "ok");

    // ── L 各寬度版面 ────────────────────────────────────────────────────
    for (const [w, h] of [[320, 640], [360, 740], [390, 844], [430, 932]]) {
      await mobile(w, h); await sleep(900); await chrome.evaluate(HIDE);
      const L = await layout();
      const o = L?.o ?? {};
      const order = o.panel && o.hud && o.strip && o.panel.t >= o.hud.b - 0.5 && o.strip.t >= o.panel.b - 0.5 && (o.panel.t - o.hud.b) <= 6;
      ck(`L[${w}] 物件列緊貼記分板下方、在 5v5 戰況列之上；無任何重疊、無橫向溢出`,
        order && L.overlaps.length === 0 && L.over <= 0 && o.panel.l >= 0 && o.panel.r <= L.vw,
        JSON.stringify({ panel: o.panel, hudB: o.hud?.b, stripT: o.strip?.t, overlaps: L?.overlaps, over: L?.over }));
      await shot(`m${w}_layout`);
    }
    await desktop(); await sleep(1500);
    const D = await layout();
    const od = D?.o ?? {};
    ck("L[1366] 桌機物件列在記分板正下方（≤ 6px）、無重疊（含 Boss 血條、左側英雄欄）、無橫向溢出",
      od.panel && od.hud && od.panel.t >= od.hud.b - 0.5 && od.panel.t - od.hud.b <= 6 && D.overlaps.length === 0 && D.over <= 0,
      JSON.stringify({ panel: od.panel, hudB: od.hud?.b, boss: od.boss, overlaps: D?.overlaps }));
    await shot("d1366_layout");
    //  桌機交戰中：Boss 血條與物件列同時出現（兩者都置中）⇒ 實際等到交戰才量
    let DF = null;
    for (let i = 0; i < 1200 && !DF; i++) {
      const st = await snapStates();
      if (!st || st.over) break;
      if (st.dragon === "fight" || st.baron === "fight") {
        const L2 = await layout();
        if (L2?.o?.boss) DF = L2;
      }
      if (!DF) await sleep(250);
    }
    ck("L[1366 交戰] 桌機交戰中：Boss 血條在物件列下方，兩者與其他元件皆不重疊",
      !!DF && DF.overlaps.length === 0 && DF.bossOverlaps.length === 0 && DF.o.boss.t >= DF.o.panel.b - 0.5,
      JSON.stringify(DF ? { panel: DF.o.panel, boss: DF.o.boss, overlaps: DF.overlaps, bossOverlaps: DF.bossOverlaps } : "本場桌機段沒有等到交戰"));
    if (DF) await shot("d1366_fight");

    // ── I 圖示 ─────────────────────────────────────────────────────────
    const I = await ev("const p=document.querySelector('[data-testid=\"objective-panel\"]'); const s=document.querySelector('[data-testid=\"mobile-team-strip\"]');"
      + "return JSON.stringify({dragon:!!(p&&p.querySelector('[data-testid=\"objective-spawn-dragon\"] svg[data-objective-icon=\"dragon\"]')),baron:!!(p&&p.querySelector('[data-testid=\"objective-spawn-baron\"] svg[data-objective-icon=\"baron\"]')),"
      + "emoji:/[\\u{1F409}\\u{1F451}]/u.test(((p&&p.textContent)||'')+((s&&s.textContent)||''))});");
    ck("I1 物件列的巨龍／巴龍是 SVG 圖示，物件列與戰況列不再出現 🐉／👑 emoji", I?.dragon && I?.baron && I?.emoji === false, JSON.stringify(I));
    //  圖示對照圖：用正式 ObjectiveIcons 元件在 12／16／24／48px 渲染（與 App 同一份 React 模組）
    const sheet = await ev("const B=" + JSON.stringify(BASE) + "; return (async()=>{ const src=await (await fetch(B+'src/battle/ui/ObjectiveIcons.jsx')).text(); const mn=await (await fetch(B+'src/main.jsx')).text();"
      + "const ru=(src.match(/from\\s+\"([^\"]*\\/deps\\/react\\.js[^\"]*)\"/)||[])[1]; const du=(mn.match(/from\\s+\"([^\"]*\\/deps\\/react-dom_client\\.js[^\"]*)\"/)||[])[1];"
      + "if(!ru||!du) return JSON.stringify({ok:false,ru,du}); const R=await import(ru); const D=await import(du); const M=await import(B+'src/battle/ui/ObjectiveIcons.jsx');"
      + "const React=R.default||R; const h=React.createElement; const host=document.createElement('div'); host.id='objicon-sheet'; host.style.cssText='position:fixed;inset:0;z-index:2147483000;background:#0b0f14;color:#e5e7eb;font:700 13px system-ui;padding:24px';"
      + "document.body.appendChild(host); const sizes=[12,16,24,48]; const row=(label,Icon,color)=>h('div',{style:{display:'flex',alignItems:'center',gap:22,margin:'14px 0'}},h('b',{style:{width:60}},label),...sizes.map(z=>h('span',{key:z,style:{display:'inline-flex',flexDirection:'column',alignItems:'center',gap:4,color}},h(Icon,{size:z}),h('small',{style:{color:'#9ca3af'}},z+'px'))));"
      + "const mono=(label,Icon)=>row(label+'（單色）',Icon,'#d1d5db');"
      + "(D.default||D).createRoot(host).render(h('div',null,h('div',{style:{marginBottom:8,color:'#9ca3af'}},'Objective 圖示（ESMO 自繪 SVG）— 上：HUD 配色；下：單色（只靠輪廓）'),row('巨龍',M.DragonIcon,'#c084fc'),row('巴龍',M.BaronIcon,'#fbbf24'),mono('巨龍',M.DragonIcon),mono('巴龍',M.BaronIcon)));"
      + "return JSON.stringify({ok:true}); })();");
    ck("I2 圖示對照圖（12／16／24／48px、配色與單色）已輸出", sheet?.ok, JSON.stringify(sheet));
    await sleep(600);
    await chrome.send("Emulation.setDeviceMetricsOverride", { width: 560, height: 420, deviceScaleFactor: 2, mobile: false });
    await sleep(400);
    { const s = await chrome.send("Page.captureScreenshot", { format: "png" }); writeFileSync(`${OUT}/icons_sheet.png`, Buffer.from(s.data, "base64")); }

    // ── E 錯誤 ─────────────────────────────────────────────────────────
    const errs = chrome.pageErrors ?? [];
    const consoleErrs = (chrome.consoleLines ?? []).filter((l) => l.startsWith("[error]"));
    const shaderErrs = (chrome.consoleLines ?? []).filter((l) => /shader|WebGL.*error|THREE\.WebGLProgram/i.test(l));
    ck("E1 page error 0", errs.length === 0, errs.slice(0, 3).join(" ¦ "));
    ck("E2 console error 0、shader error 0", consoleErrs.length === 0 && shaderErrs.length === 0, [...consoleErrs, ...shaderErrs].slice(0, 3).join(" ¦ "));
  },
});
finishGate(result);
