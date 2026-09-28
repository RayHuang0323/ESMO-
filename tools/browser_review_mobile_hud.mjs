#!/usr/bin/env node
// ============================================================================
//  tools/browser_review_mobile_hud.mjs — MOBA 手機 HUD 截圖工具（Mobile & Presentation Polish）
//
//  執行：node tools/browser_review_mobile_hud.mjs [--out=review/moba-mobile-hud/before] [--waitTs=240]
//  走 ?debug=moba-runtime-battle（正式 GameView，同一個引擎與 HUD，只是跳過賽前流程），
//  同一場戰鬥推進到 waitTs 後，依序切 320／360／390／430／1366 截圖。
//  只截圖，不下斷言（斷言在 browser_check_moba_mobile_hud.mjs）。
// ============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { runGate, finishGate } from "./browser/harness.mjs";

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `=${d}`).split("=").slice(1).join("=");
const OUT = arg("out", "review/moba-mobile-hud/before");
const WAIT = Number(arg("waitTs", "240"));
mkdirSync(OUT, { recursive: true });

const WIDTHS = [[320, 640], [360, 740], [390, 844], [430, 932]];

const result = await runGate({
  name: "MOBA 手機 HUD 截圖",
  timeoutMs: 900000,
  async run({ chrome, url, ck, sleep }) {
    //  ?shot= 會掛上兩個只給截圖模式用的除錯面板（WebGL 診斷、戰鬥 Debug 表），
    //  它們蓋住手機底部 HUD；截圖前在 DOM 上隱藏，不動產品程式碼。
    const HIDE_DEBUG = "const up=(el)=>{let n=el,i=0;while(n&&i<8){const p=getComputedStyle(n).position;if((p==='absolute'||p==='fixed')&&n!==document.body)return n;n=n.parentElement;i++;}const t=el.closest('table');return t?t.parentElement:null;};"
      + "[...document.querySelectorAll('strong')].filter(s=>(s.textContent||'').startsWith('Android WebGL')).forEach(s=>{const b=up(s);if(b)b.style.display='none';});"
      + "[...document.querySelectorAll('th')].filter(t=>(t.textContent||'')==='避碰修正').forEach(t=>{const b=up(t);if(b)b.style.display='none';});"
      + "return JSON.stringify(true);";
    const shot = async (name) => {
      await chrome.evaluate(HIDE_DEBUG);
      await sleep(150);
      const s = await chrome.send("Page.captureScreenshot", { format: "png" });
      writeFileSync(`${OUT}/${name}.png`, Buffer.from(s.data, "base64"));
    };
    const mobile = async (w, h) => {
      await chrome.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile: true });
      await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    };
    await mobile(390, 844);
    await chrome.navigate(`${url}?debug=moba-runtime-battle&shot=hud&waitTs=${WAIT}&quality=low`);
    const t0 = Date.now();
    let ready = false;
    while (Date.now() - t0 < 600000) {
      ready = String(await chrome.evaluate("return JSON.stringify(window.__BATTLE_SHOT_READY || null);")).includes("hud");
      if (ready) break;
      await sleep(1500);
    }
    ck(`戰鬥推進到 ts ≥ ${WAIT}`, ready);
    for (const [w, h] of WIDTHS) {
      await mobile(w, h);
      await sleep(1200);
      await shot(`m${w}`);
    }
    //  390：展開手機記分板（有 5v5 戰況列才拍；修改前沒有這個元件）
    await mobile(390, 844);
    await sleep(800);
    const hasStrip = String(await chrome.evaluate("const b=document.querySelector('[data-testid=\"team-strip-center\"]'); if(b) b.click(); return JSON.stringify(!!b);")).includes("true");
    if (hasStrip) { await sleep(900); await shot("m390-board"); await chrome.evaluate("document.querySelector('[data-testid=\"mobile-board-close\"]')?.click(); return JSON.stringify(1);"); }
    await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: false });
    await chrome.send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    await sleep(1200);
    await shot("desktop1366");
    const errs = chrome.pageErrors ?? [];
    ck("page error 0", errs.length === 0, errs.slice(0, 3).join(" ¦ "));
  },
});
finishGate(result);
