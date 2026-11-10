#!/usr/bin/env node
// ============================================================================
//  tools/owner_preview/shot_tactic_book_v21.mjs — v21 戰術書畫面截圖＋版面量測（Owner Preview UI 改善的 Before／After；不是 gate）
//
//  掛載方式與 tools/browser_check_tactic_book_v21.mjs 相同：harness 自己的 dev server＋隔離 Chrome，CDP 攔截 featureFlags.js
//  把 mobaTacticalDirectorV21 那一行換成 true（不改 src）。桌機 1366 與手機 390 各拍：
//    book-default（剛進來）、book-set（std＋前期滾雪球＋快速強邊下路＋後期成團）、intel、confirm
//  量測：橫向溢出、整頁高度、太小的選項按鈕數（高 < 32 或寬 < 40）、所有可點按鈕中觸控高度 < 32 的數量。
//  執行：ESMO_REVIEW_OUT=<資料夾> ESMO_SHOT_LABEL=before|after node tools/owner_preview/shot_tactic_book_v21.mjs
//  ⚠ chrome.evaluate 的字串裡不能有反引號。
// ============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { runGate, finishGate } from "../browser/harness.mjs";

const OUT = process.env.ESMO_REVIEW_OUT ?? "tmp/tactic-book-shots";
const LABEL = process.env.ESMO_SHOT_LABEL ?? "shot";
mkdirSync(OUT, { recursive: true });
const J = JSON.stringify;
const FLAG_LINE = "mobaTacticalDirectorV21: false,";

const result = await runGate({
  name: `Tactic Book v21 screenshots（${LABEL}）`, timeoutMs: 420000,
  async run({ chrome, url, ck, sleep }) {
    const BASE = new URL(".", url.endsWith("/") ? url : url + "/").pathname;
    const ev = async (body) => { const r = String(await chrome.evaluate(body)); try { return JSON.parse(r); } catch { return r; } };
    const tid = (id) => "[data-testid=\"" + id + "\"]";
    const click = (sel) => ev("const el=document.querySelector('#tb-host '+" + J(sel) + "); if(!el) return JSON.stringify(false); el.click(); return JSON.stringify(true);");
    chrome.on("Fetch.requestPaused", async (p) => {
      try {
        const body = await chrome.send("Fetch.getResponseBody", { requestId: p.requestId });
        const text = body.base64Encoded ? Buffer.from(body.body, "base64").toString("utf8") : body.body;
        const n = text.split(FLAG_LINE).length - 1;
        const out = n === 1 ? text.replace(FLAG_LINE, "mobaTacticalDirectorV21: true,") : text;
        await chrome.send("Fetch.fulfillRequest", { requestId: p.requestId, responseCode: p.responseStatusCode ?? 200,
          responseHeaders: (p.responseHeaders ?? []).filter((h) => !/^content-length$/i.test(h.name)), body: Buffer.from(out, "utf8").toString("base64") });
      } catch { await chrome.send("Fetch.continueRequest", { requestId: p.requestId }).catch(() => {}); }
    });
    await chrome.send("Network.enable").catch(() => {});
    await chrome.send("Network.setCacheDisabled", { cacheDisabled: true }).catch(() => {});
    await chrome.send("Fetch.enable", { patterns: [{ urlPattern: "*src/featureFlags.js*", requestStage: "Response" }] });

    const mountPage = async () => {
      await chrome.navigate(url);
      await sleep(4000);
      const mount = await ev("const B=" + J(BASE) + "; return (async()=>{ const ts=await (await fetch(B+'src/screens/moba/TacticScreen.jsx')).text(); const mn=await (await fetch(B+'src/main.jsx')).text();"
        + "const ru=(ts.match(/from\\s+\"([^\"]*\\/deps\\/react\\.js[^\"]*)\"/)||[])[1]; const du=(mn.match(/from\\s+\"([^\"]*\\/deps\\/react-dom_client\\.js[^\"]*)\"/)||[])[1];"
        + "if(!ru||!du) return JSON.stringify({ok:false,ru,du}); const R=await import(ru); const D=await import(du); const T=await import(B+'src/screens/moba/TacticScreen.jsx');"
        + "const React=R.default||R; const createRoot=(D.default||D).createRoot; for(const c of [...document.body.children]) c.style.display='none';"
        + "const host=document.createElement('div'); host.id='tb-host'; host.style.cssText='position:absolute;left:0;top:0;right:0;min-height:100vh;background:#0b0f14;overflow-x:hidden';"
        + "document.documentElement.style.overflow='auto'; document.body.style.overflow='auto'; document.body.style.height='auto'; document.documentElement.style.height='auto';"
        + "document.body.appendChild(host); createRoot(host).render(React.createElement(T.default,{onNext:()=>{},onBack:()=>{}})); return JSON.stringify({ok:true}); })();");
      await sleep(1500);
      return mount;
    };
    const measure = () => ev("const h=document.getElementById('tb-host'); const bs=[...h.querySelectorAll('button')].filter(b=>{const r=b.getBoundingClientRect();return r.width>0&&r.height>0;});"
      + "const small=(b)=>{const r=b.getBoundingClientRect(); return r.height<32||r.width<40;};"
      + "return JSON.stringify({overflow:h.scrollWidth-h.clientWidth, height:h.scrollHeight, buttons:bs.length, smallChoice:bs.filter(b=>(b.getAttribute('data-testid')||'').startsWith('tb-choice-')&&small(b)).length,"
      + "shortButtons:bs.filter(b=>b.getBoundingClientRect().height<32).length, templates:h.querySelectorAll('[data-testid^=\"tb-template-\"]').length, dims:h.querySelectorAll('[data-testid^=\"tb-dim-\"]').length});");
    const shot = async (name, vp) => {
      const m = await measure();
      const height = Math.min(Math.max(m.height, vp.height), 9000);
      await chrome.send("Emulation.setDeviceMetricsOverride", { ...vp, height });
      await sleep(500);
      const s = await chrome.send("Page.captureScreenshot", { format: "png" });
      writeFileSync(`${OUT}/${LABEL}-${vp.label}-${name}.png`, Buffer.from(s.data, "base64"));
      await chrome.send("Emulation.setDeviceMetricsOverride", vp);
      await sleep(250);
      return m;
    };
    const rows = {};
    for (const vp of [
      { label: "desktop1366", width: 1366, height: 900, deviceScaleFactor: 1, mobile: false },
      { label: "mobile390", width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
    ]) {
      await chrome.send("Emulation.setDeviceMetricsOverride", vp);
      const mount = await mountPage();
      ck(`${vp.label}｜TacticScreen 掛載`, mount?.ok, J(mount));
      if (!mount?.ok) continue;
      const r = {};
      r.bookDefault = await shot("1-book-default", vp);
      await click(tid("tb-template-std")); await sleep(500);
      await click(tid("tb-choice-winCondition-earlySnowball")); await sleep(400);
      await click(tid("tb-choice-quick.strongSide-bot")); await sleep(400);
      await click(tid("tb-choice-phases.late.grouping-group")); await sleep(500);
      r.bookSet = await shot("2-book-set", vp);
      await click(tid("tb-step-intel")); await sleep(500);
      r.intel = await shot("3-intel", vp);
      await click(tid("tb-step-confirm")); await sleep(500);
      r.confirm = await shot("4-confirm", vp);
      rows[vp.label] = r;
      console.log(vp.label, J(r));
      ck(`${vp.label}｜沒有橫向溢出`, Object.values(r).every((x) => x.overflow <= 0), J(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.overflow]))));
      ck(`${vp.label}｜選項按鈕觸控大小足夠`, r.bookSet.smallChoice === 0, String(r.bookSet.smallChoice));
    }
    writeFileSync(`${OUT}/${LABEL}-layout.json`, J({ label: LABEL, rows }, null, 1));
    ck("page error = 0", chrome.pageErrors.length === 0, J(chrome.pageErrors).slice(0, 300));
  },
});
await finishGate(result);
