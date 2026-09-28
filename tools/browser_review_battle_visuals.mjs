#!/usr/bin/env node
// ============================================================================
//  tools/browser_review_battle_visuals.mjs — 小兵外觀／技能地面語彙的近景截圖（只截圖）
//
//  執行：node tools/browser_review_battle_visuals.mjs [--out=review/moba-mobile-hud/visuals] [--waitTs=150] [--seat=b3] [--zoom=2.2]
//  走 ?debug=moba-runtime-battle（正式 GameView），推進到 waitTs 後鏡頭跟隨 seat 並拉近，
//  桌機 1366 連拍 8 張（每 0.6 秒）、手機 390 連拍 4 張。
// ============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { runGate, finishGate } from "./browser/harness.mjs";

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `=${d}`).split("=").slice(1).join("=");
const OUT = arg("out", "review/moba-mobile-hud/visuals");
const WAIT = Number(arg("waitTs", "150"));
const SEAT = arg("seat", "b3");
const ZOOM = Number(arg("zoom", "2.2"));
//  --target=minions：對準離地圖中心最近的一群小兵，並把鏡頭拉到最近（zoom 9）
const TARGET = arg("target", "hero");
mkdirSync(OUT, { recursive: true });

const result = await runGate({
  name: "戰鬥近景截圖",
  timeoutMs: 900000,
  async run({ chrome, url, ck, sleep }) {
    const CAM_URL = new URL("src/battle/cameraStore.js", url.endsWith("/") ? url : url + "/").pathname;
    const GS_URL = new URL("src/useGameStore.js", url.endsWith("/") ? url : url + "/").pathname;
    //  拉近後平移到該席位英雄（userZoomTo 會切 free，所以不用 focusHero）
    const GD_URL = new URL("src/gameData.js", url.endsWith("/") ? url : url + "/").pathname;
    const aimMinions = () => chrome.evaluate("return Promise.all([import('" + CAM_URL + "'),import('" + GS_URL + "'),import('" + GD_URL + "')]).then(([c,g,d])=>{const snap=g.useGameStore.getState().snapshot; const ms=[...(snap?.lanes?.mid?.bm||[]),...(snap?.lanes?.mid?.rm||[])]; if(!ms.length) return JSON.stringify(null); const avg=ms.reduce((a,m)=>a+m.t,0)/ms.length; const p=d.posOnLane('mid',avg); c.useCameraStore.getState().userZoomTo(9); c.useCameraStore.getState().userPanTo(p.x,p.y); return JSON.stringify({n:ms.length,p});});");
    const aim = (zoomK) => TARGET === "minions" ? aimMinions() : chrome.evaluate("return Promise.all([import('" + CAM_URL + "'),import('" + GS_URL + "')]).then(([c,g])=>{const s=c.useCameraStore.getState(); const p=(g.useGameStore.getState().snapshot?.players||[]).find(x=>x.id==='" + SEAT + "'); if(" + zoomK + "!==1) s.userZoomTo(s.zoom*" + zoomK + "); if(p) c.useCameraStore.getState().userPanTo(p.pos.x,p.pos.y); return JSON.stringify(!!p);});");
    const HIDE = "const up=(el)=>{let n=el,i=0;while(n&&i<8){const p=getComputedStyle(n).position;if((p==='absolute'||p==='fixed')&&n!==document.body)return n;n=n.parentElement;i++;}const t=el.closest('table');return t?t.parentElement:null;};"
      + "[...document.querySelectorAll('strong')].filter(s=>(s.textContent||'').startsWith('Android WebGL')).forEach(s=>{const b=up(s);if(b)b.style.display='none';});"
      + "[...document.querySelectorAll('th')].filter(t=>(t.textContent||'')==='避碰修正').forEach(t=>{const b=up(t);if(b)b.style.display='none';});return JSON.stringify(1);";
    const shot = async (name) => { await chrome.evaluate(HIDE); const s = await chrome.send("Page.captureScreenshot", { format: "png" }); writeFileSync(`${OUT}/${name}.png`, Buffer.from(s.data, "base64")); };
    await chrome.send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    await chrome.navigate(`${url}?debug=moba-runtime-battle&shot=vis&waitTs=${WAIT}&quality=low`);
    let ready = false;
    for (let i = 0; i < 300 && !ready; i++) { await sleep(1500); ready = String(await chrome.evaluate("return JSON.stringify(window.__BATTLE_SHOT_READY || null);")).includes("vis"); }
    ck(`戰鬥推進到 ts ≥ ${WAIT}`, ready);
    if (!ready) return;
    await aim(ZOOM);
    await sleep(900);
    for (let i = 0; i < 8; i++) { await aim(1); await sleep(150); await shot(`desk-${String(i).padStart(2, "0")}`); await sleep(500); }
    await chrome.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await sleep(1000);
    for (let i = 0; i < 4; i++) { await aim(1); await sleep(150); await shot(`m390-${i}`); await sleep(600); }
    const errs = chrome.pageErrors ?? [];
    ck("page error 0", errs.length === 0, errs.slice(0, 3).join(" ¦ "));
  },
});
finishGate(result);
