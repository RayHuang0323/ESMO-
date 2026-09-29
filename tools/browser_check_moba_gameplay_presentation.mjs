#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_moba_gameplay_presentation.mjs — Gameplay/Presentation Audit（瀏覽器）
//
//  執行：node tools/browser_check_moba_gameplay_presentation.mjs
//  走 ?debug=moba-runtime-battle（正式 GameView／引擎／HUD），本地 dev server，390 手機 ＋ 1366 桌機。
//    H  底欄血條有刻度（data-max-hp ＝ snapshot mhp，> 0），生命文字仍在
//    L  等待期間觀戰英雄升級 ⇒ 出現「升級」角標（同一正式 snapshot mlv）
//    S  等待期間出現英雄狀態列（statusEffects：護盾／增益／控制…，含秒數）
//    I  手機「英雄資訊」P/Q/W/E/R 5 張技能圖真的載入（naturalWidth > 0）
//    C  「英雄生涯」面板（原本只有字母方塊）也有 5 張同源技能圖且載入
//    E  page error 0
//  ⚠ chrome.evaluate 的字串裡不能有反引號。
// ============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { runGate, finishGate } from "./browser/harness.mjs";

const OUT = process.env.ESMO_REVIEW_OUT ?? "review/moba-gameplay-audit/gate";
mkdirSync(OUT, { recursive: true });

const result = await runGate({
  name: "MOBA Gameplay／Presentation Audit",
  timeoutMs: 1200000,
  async run({ chrome, url, ck, sleep }) {
    const ev = async (body) => { const r = String(await chrome.evaluate(body)); for (const t of [r, r.replace(/^"|"$/g, "")]) { try { return JSON.parse(t); } catch { /* next */ } } return null; };
    const shot = async (name) => { await chrome.evaluate(HIDE); const s = await chrome.send("Page.captureScreenshot", { format: "png" }); writeFileSync(`${OUT}/${name}.png`, Buffer.from(s.data, "base64")); };
    const HIDE = "const up=(el)=>{let n=el,i=0;while(n&&i<8){const p=getComputedStyle(n).position;if((p==='absolute'||p==='fixed')&&n!==document.body)return n;n=n.parentElement;i++;}const t=el.closest('table');return t?t.parentElement:null;};"
      + "[...document.querySelectorAll('strong')].filter(s=>(s.textContent||'').startsWith('Android WebGL')).forEach(s=>{const b=up(s);if(b)b.style.display='none';});"
      + "[...document.querySelectorAll('th')].filter(t=>(t.textContent||'')==='避碰修正').forEach(t=>{const b=up(t);if(b)b.style.display='none';});return JSON.stringify(1);";
    const mobile = async (w, h) => {
      await chrome.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile: true });
      await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    };
    const click = (sel) => ev("const el=document.querySelector(" + JSON.stringify(sel) + "); if(!el) return JSON.stringify(false); el.click(); return JSON.stringify(true);");
    const clickText = (text) => ev("const el=[...document.querySelectorAll('button')].find(b=>(b.innerText||'').includes(" + JSON.stringify(text) + ")); if(!el) return JSON.stringify(false); el.click(); return JSON.stringify(true);");
    const icons = (sel) => ev("const imgs=[...document.querySelectorAll(" + JSON.stringify(sel) + ")]; return JSON.stringify({n:imgs.length, loaded:imgs.filter(i=>i.complete&&i.naturalWidth>0).length, fallback:document.querySelectorAll('[data-skill-icon-fallback]').length});");

    await mobile(390, 844);
    await chrome.navigate(`${url}?debug=moba-runtime-battle&shot=hud&waitTs=150&quality=low`);
    let ready = false;
    for (let i = 0; i < 300 && !ready; i++) { await sleep(1500); ready = String(await chrome.evaluate("return JSON.stringify(window.__BATTLE_SHOT_READY || null);")).includes("hud"); }
    ck("戰鬥開始並推進到 ts ≥ 150", ready);
    if (!ready) return;

    // ── H 血條刻度 ────────────────────────────────────────────────────────
    const H = await ev("const h=document.querySelector('.observer-health'); return JSON.stringify(h?{cls:h.className,max:h.getAttribute('data-max-hp'),txt:(h.innerText||'').trim()}:null);");
    ck("H1 底欄血條有刻度且帶絕對最大血量（snapshot mhp）", H && /ticked/.test(H.cls) && Number(H.max) > 300, JSON.stringify(H));
    ck("H2 生命文字仍在血條上", H && /生命|陣亡/.test(H.txt), H?.txt);
    await shot("m390_hud");

    // ── L／S 等待升級與狀態列（最多 ~120 秒實際時間）─────────────────────
    let sawLevel = false, sawStatus = null;
    for (let i = 0; i < 240 && !(sawLevel && sawStatus); i++) {
      const r = await ev("const l=document.querySelector('[data-testid=\"observer-level-up\"]'); const s=[...document.querySelectorAll('.observer-status')].map(e=>e.getAttribute('data-status')+':'+(e.innerText||'').replace(/\\s+/g,' ')); return JSON.stringify({l:!!l,s});");
      if (r?.l && !sawLevel) { sawLevel = true; await shot("m390_levelup"); }
      if (r?.s?.length && !sawStatus) { sawStatus = r.s; await shot("m390_status"); }
      await sleep(500);
    }
    ck("L1 觀戰英雄升級時出現「升級」角標", sawLevel);
    ck("S1 英雄狀態列出現（含剩餘秒數）", !!sawStatus && sawStatus.every((t) => /\d+s/.test(t)), JSON.stringify(sawStatus));

    // ── I 英雄資訊（BattleHeroSheet）技能圖 ─────────────────────────────
    await click('button[aria-label="查看英雄戰鬥資訊"]'); await sleep(900);
    const I = await icons("[data-skill-slot] img");
    ck("I1 手機英雄資訊 P/Q/W/E/R 圖示 5 張全部載入", I && I.n >= 5 && I.loaded >= 5, JSON.stringify(I));
    await shot("m390_hero_sheet");

    // ── C 英雄生涯（HeroDetailPanel）技能圖 ─────────────────────────────
    const opened = await clickText("英雄生涯"); await sleep(900);
    const C = await icons("img[data-skill-icon]");
    ck("C1 英雄生涯面板有 5 張同源技能圖且全部載入（原本只有字母）", opened && C && C.n === 5 && C.loaded === 5, JSON.stringify({ opened, ...C }));
    await shot("m390_hero_career");
    await clickText("✕"); await sleep(500);

    // ── 桌機截圖（血條刻度／狀態列在桌機底欄）────────────────────────────
    await chrome.send("Emulation.clearDeviceMetricsOverride", {});
    await chrome.send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await sleep(1500);
    const D = await ev("const h=document.querySelector('.observer-health'); return JSON.stringify(h?{cls:h.className,max:h.getAttribute('data-max-hp')}:null);");
    ck("D1 桌機底欄血條同樣有刻度", D && /ticked/.test(D.cls), JSON.stringify(D));
    await shot("d1366_hud");

    const errs = chrome.pageErrors ?? [];
    ck("E1 page error 0", errs.length === 0, errs.slice(0, 3).join(" ¦ "));
  },
});
finishGate(result);
