#!/usr/bin/env node
// ============================================================================
//  tools/browser_review_item_art.mjs — 專屬裝備圖示截圖（MOBA Mobile & Presentation Polish）
//
//  執行：node tools/browser_review_item_art.mjs [--out=review/moba-mobile-hud/item-art]
//  打開 DEV 圖鑑 ?debug=items-ui，截「專屬裝備圖示」區塊（桌機 1366 與手機 390），只截圖。
// ============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { runGate, finishGate } from "./browser/harness.mjs";

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `=${d}`).split("=").slice(1).join("=");
const OUT = arg("out", "review/moba-mobile-hud/item-art");
mkdirSync(OUT, { recursive: true });

const result = await runGate({
  name: "專屬裝備圖示截圖",
  timeoutMs: 300000,
  async run({ chrome, url, ck, sleep }) {
    const J = (r) => { const s = String(r); for (const t of [s, s.replace(/^"|"$/g, "")]) { try { return JSON.parse(t); } catch { /* next */ } } return null; };
    const grab = async (name, w, h, mobile) => {
      await chrome.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile });
      await chrome.navigate(`${url}?debug=items-ui`);
      let rect = null;
      for (let i = 0; i < 60 && !rect; i++) {
        await sleep(500);
        rect = J(await chrome.evaluate("const el=document.getElementById('item-art')||document.querySelector('[data-art-compare]')?.closest('section'); if(!el) return JSON.stringify(null); const r=el.getBoundingClientRect(); return JSON.stringify({x:r.left+scrollX,y:r.top+scrollY,w:r.width,h:r.height, n:document.querySelectorAll('[data-art-compare]').length, art:document.querySelectorAll('svg[data-item-art]').length});"));
      }
      ck(`${name}：圖鑑有專屬圖示區塊`, !!rect && rect.n === 50, JSON.stringify(rect));
      if (!rect) return;
      const s = await chrome.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale: 1 } });
      writeFileSync(`${OUT}/${name}.png`, Buffer.from(s.data, "base64"));
    };
    await grab("gallery-1366", 1366, 900, false);
    await grab("gallery-390", 390, 844, true);
    const errs = chrome.pageErrors ?? [];
    ck("page error 0", errs.length === 0, errs.slice(0, 3).join(" ¦ "));
  },
});
finishGate(result);
