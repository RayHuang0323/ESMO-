#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_tactic_grid_narrow.mjs — 戰術書模板列在極窄容器與手機寬度下不溢出（真實版面量測＋反向測試）
//
//  2026-11-25 C1＋C2 Release Closure（Owner 核准）。check_moba_experience26「Tactic grid 有 min() 防護（<190px 容器不溢出）」
//  的行為面：靜態判斷在 tools/lib/tacticGridGuard.mjs，本支在真實 Chrome 量版面。
//  掛載方式與 tools/owner_preview/shot_tactic_book_v21.mjs 相同：harness 自己的 dev server＋隔離 Chrome，CDP 攔截 featureFlags.js
//  把 mobaTacticalDirectorV21 那一行換成 true（不改 src、不改正式旗標；旗標關閉時玩家看不到這個畫面）。
//
//  量測點：桌機 1366 寬＋180px 容器（走桌機 grid 規則）、手機 320、手機 390、手機 320＋180px 容器（走 ≤720px 卡片規則）。
//  每點判定：①模板卡確實存在（前置條件）②沒有任何卡片比所在列還寬 ③列內容超出時一定是可捲動的列（overflow-x auto／scroll）
//           ④整個容器不橫向溢出。
//  反向測試：在同一頁注入故意拿掉防護的 CSS（桌機 minmax(205px,1fr)；手機 flex 0 0 250px），同一套判定必須抓到溢出。
//  執行：repo 根目錄 `node tools/browser_check_tactic_grid_narrow.mjs`（約 1–2 分鐘）。⚠ chrome.evaluate 字串裡不能有反引號。
// ============================================================================
import { runGate, finishGate } from "./browser/harness.mjs";

const J = JSON.stringify;
const FLAG_LINE = "mobaTacticalDirectorV21: false,";

const result = await runGate({
  name: "Tactic grid 窄容器不溢出（C1＋C2 closure）", timeoutMs: 300000,
  async run({ chrome, url, ck, sleep }) {
    const BASE = new URL(".", url.endsWith("/") ? url : url + "/").pathname;
    const ev = async (body) => { const r = String(await chrome.evaluate(body)); try { return JSON.parse(r); } catch { return r; } };
    let flagHits = 0;
    chrome.on("Fetch.requestPaused", async (p) => {
      try {
        const body = await chrome.send("Fetch.getResponseBody", { requestId: p.requestId });
        const text = body.base64Encoded ? Buffer.from(body.body, "base64").toString("utf8") : body.body;
        const n = text.split(FLAG_LINE).length - 1;
        if (n === 1) flagHits++;
        const out = n === 1 ? text.replace(FLAG_LINE, "mobaTacticalDirectorV21: true,") : text;
        await chrome.send("Fetch.fulfillRequest", { requestId: p.requestId, responseCode: p.responseStatusCode ?? 200,
          responseHeaders: (p.responseHeaders ?? []).filter((h) => !/^content-length$/i.test(h.name)), body: Buffer.from(out, "utf8").toString("base64") });
      } catch { await chrome.send("Fetch.continueRequest", { requestId: p.requestId }).catch(() => {}); }
    });
    await chrome.send("Network.enable").catch(() => {});
    await chrome.send("Network.setCacheDisabled", { cacheDisabled: true }).catch(() => {});
    await chrome.send("Fetch.enable", { patterns: [{ urlPattern: "*src/featureFlags.js*", requestStage: "Response" }] });

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
    ck("TacticScreen 掛載（v21 旗標只在本測試的瀏覽器內攔截換成 true）", mount?.ok === true && flagHits >= 1, J({ mount, flagHits }));

    const setHostWidth = (w) => ev("const h=document.getElementById('tb-host'); h.style.right=" + J(w ? "auto" : "0") + "; h.style.width=" + J(w ? w + "px" : "") + "; return JSON.stringify(true);");
    const measure = () => ev("const h=document.getElementById('tb-host'); const rows=[...h.querySelectorAll('.tbx-tpl-row')];"
      + "const rs=rows.map(r=>{const cards=[...r.children].filter(c=>c.classList.contains('tbx-tpl')); const widest=Math.max(0,...cards.map(c=>c.getBoundingClientRect().width));"
      + "return {cw:r.clientWidth, sw:r.scrollWidth, widest:Math.round(widest*10)/10, ox:getComputedStyle(r).overflowX, display:getComputedStyle(r).display, cards:cards.length};});"
      + "return JSON.stringify({hostW:h.clientWidth, hostOverflow:Math.max(0,h.scrollWidth-h.clientWidth), rows:rs.length, cards:rs.reduce((s,x)=>s+x.cards,0),"
      + "cardTooWide:rs.filter(x=>x.widest>x.cw+1).length, rowOverflowNoScroll:rs.filter(x=>x.sw>x.cw+1&&!/auto|scroll/.test(x.ox)).length,"
      + "displays:[...new Set(rs.map(x=>x.display))], sample:rs.slice(0,2)});");
    const ok = (m) => m.cards > 0 && m.cardTooWide === 0 && m.rowOverflowNoScroll === 0 && m.hostOverflow === 0;
    const caught = (m) => m.cards > 0 && (m.cardTooWide > 0 || m.rowOverflowNoScroll > 0 || m.hostOverflow > 0);
    const inject = (css) => ev("let s=document.getElementById('neg-css'); if(!s){s=document.createElement('style'); s.id='neg-css'; document.head.appendChild(s);} s.textContent=" + J(css) + "; return JSON.stringify(true);");

    const points = [
      { label: "桌機 1366＋180px 容器", vp: { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false }, host: 180, layout: "grid",
        negative: ".tbx-tpl-row{grid-template-columns:repeat(auto-fill,minmax(205px,1fr)) !important}" },
      { label: "手機 320", vp: { width: 320, height: 720, deviceScaleFactor: 2, mobile: true }, host: 0, layout: "flex" },
      { label: "手機 390", vp: { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, host: 0, layout: "flex" },
      { label: "手機 320＋180px 容器", vp: { width: 320, height: 720, deviceScaleFactor: 2, mobile: true }, host: 180, layout: "flex",
        negative: ".tbx-tpl-row > .tbx-tpl{flex:0 0 250px !important}" },
    ];
    for (const p of points) {
      await chrome.send("Emulation.setDeviceMetricsOverride", p.vp);
      await setHostWidth(p.host); await inject(""); await sleep(600);
      const m = await measure();
      ck(`${p.label}：模板卡存在、走 ${p.layout} 規則、卡片不比列寬、超出的列可捲動、容器不溢出`, ok(m) && m.displays.includes(p.layout) && (!p.host || m.hostW <= p.host), J(m));
      if (p.negative) {
        await inject(p.negative); await sleep(400);
        const n = await measure();
        ck(`反向測試（${p.label}）：注入拿掉防護的 CSS ⇒ 同一套判定抓到溢出`, caught(n), J({ cardTooWide: n.cardTooWide, rowOverflowNoScroll: n.rowOverflowNoScroll, hostOverflow: n.hostOverflow, sample: n.sample }));
        await inject(""); await sleep(300);
        const back = await measure();
        ck(`（${p.label}）移除注入後回到正常`, ok(back), J({ cardTooWide: back.cardTooWide, hostOverflow: back.hostOverflow }));
      }
    }
  },
});
finishGate(result);
