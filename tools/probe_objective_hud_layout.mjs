#!/usr/bin/env node
// 只讀量測：正式戰鬥畫面頂部 HUD 各元件的位置（給 Objective 資訊列重新定位用）。不是 gate。
import { runGate, finishGate } from "./browser/harness.mjs";

const result = await runGate({
  name: "Objective HUD 版面量測",
  timeoutMs: 900000,
  async run({ chrome, url, ck, sleep }) {
    const ev = async (body) => { const r = String(await chrome.evaluate(body)); for (const t of [r, r.replace(/^"|"$/g, "")]) { try { return JSON.parse(t); } catch { /* next */ } } return null; };
    await chrome.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await chrome.navigate(`${url}?debug=moba-runtime-battle&shot=probe&waitTs=60&quality=low`);
    let ready = false;
    for (let i = 0; i < 200 && !ready; i++) { await sleep(1500); ready = String(await chrome.evaluate("return JSON.stringify(window.__BATTLE_SHOT_READY || null);")).includes("probe"); }
    ck("ready", ready);
    const M = "const R=(s)=>{const e=document.querySelector(s); if(!e) return null; const r=e.getBoundingClientRect(); return {t:Math.round(r.top),b:Math.round(r.bottom),l:Math.round(r.left),r:Math.round(r.right),h:Math.round(r.height)};};"
      + "const tl=[...document.querySelectorAll('div')].find(d=>(d.innerText||'').startsWith('戰報')); const tr=tl?tl.getBoundingClientRect():null;"
      + "const speed=[...document.querySelectorAll('button')].find(b=>(b.textContent||'').trim()==='2×'||(b.textContent||'').trim()==='2x'); const sr=speed?speed.getBoundingClientRect():null;"
      + "return JSON.stringify({w:innerWidth,hud:R('[data-testid=\"battle-hud\"]'),strip:R('[data-testid=\"mobile-team-strip\"]'),leave:R('[data-testid=\"leave-active-match\"]'),speed:sr&&{t:Math.round(sr.top),b:Math.round(sr.bottom),l:Math.round(sr.left)},timeline:tr&&{t:Math.round(tr.top),b:Math.round(tr.bottom),r:Math.round(tr.right)},obj:R('[data-testid=\"objective-panel\"]'),mm:R('[data-testid=\"battle-minimap\"]'),dock:R('[data-testid=\"observer-dock\"]'),rails:R('.observer-rail.blue')});";
    console.log("390", JSON.stringify(await ev(M)));
    await chrome.send("Emulation.clearDeviceMetricsOverride", {});
    await chrome.send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await sleep(1500);
    console.log("1366", JSON.stringify(await ev(M)));
  },
});
finishGate(result);
