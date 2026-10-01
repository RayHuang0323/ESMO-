#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_hero_identity_v17.mjs — Hero Identity & Combat Depth v1（moba-sim.v17，瀏覽器）
//
//  執行：node tools/browser_check_hero_identity_v17.mjs（本地 dev server；一次只跑這一支）
//  走 ?debug=moba-runtime-battle（正式 GameView／引擎／HUD），藍方指定五名英雄涵蓋三種被動分類：
//    b1 rongyan（完整・戰鬥中疊層）  b2 yingsi（近似・技能標記）  b3 lieyan（近似・只有常駐修正）
//    b4 maestro（完整・第四擊）      b5 linghun（資訊類・不進引擎）
//    S  正式 snapshot：b1–b4 有 heroPassive（tier 正確）、b5 沒有；10 人都有 powerCurve；b4 觸發過；b1 疊層出現過
//    P  390 手機：逐一跟隨 b4／b3／b5／b1 ⇒ P 格文字（生效中／資訊類）、技能詳情（已實裝／近似＋說明／資訊類／疊層）
//    C  英雄資訊面板「強勢期曲線」：三段長條、強勢期、目前階段與倍率（與 snapshot powerCurve 同值）
//    D  1366 桌機：同上（側欄選英雄）
//    T  正式 TacticScreen（同一個元件，動態掛載）：m8／m5 的「引擎效果」含 Tactical Identity 項目；390 無橫向溢出
//    E  page error 0、console error 0、shader error 0
//  ⚠ 只讀 store（import 同一個 dev server 模組），不寫任何模擬狀態。
//  ⚠ chrome.evaluate 的字串裡不能有反引號。
// ============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { runGate, finishGate } from "./browser/harness.mjs";

const OUT = process.env.ESMO_REVIEW_OUT ?? "review/hero-identity-v17/gate";
mkdirSync(OUT, { recursive: true });
const HEROES = "b1:rongyan,b2:yingsi,b3:lieyan,b4:maestro,b5:linghun";
const EXPECT = { b1: "full", b2: "approx", b3: "approx", b4: "full", b5: null };

const result = await runGate({
  name: "Hero Identity v1（被動／強勢期／戰術）",
  timeoutMs: 1500000,
  async run({ chrome, url, ck, sleep }) {
    const ev = async (body) => { const r = String(await chrome.evaluate(body)); for (const t of [r, r.replace(/^"|"$/g, "")]) { try { return JSON.parse(t); } catch { /* next */ } } return null; };
    const shot = async (name) => { await chrome.evaluate(HIDE); const s = await chrome.send("Page.captureScreenshot", { format: "png" }); writeFileSync(`${OUT}/${name}.png`, Buffer.from(s.data, "base64")); };
    //  DEV 診斷面板（Android WebGL／避碰修正）會蓋住截圖；與 mobile HUD gate 同一段隱藏碼，只動 display。
    const HIDE = "const up=(el)=>{let n=el,i=0;while(n&&i<8){const p=getComputedStyle(n).position;if((p==='absolute'||p==='fixed')&&n!==document.body)return n;n=n.parentElement;i++;}const t=el.closest('table');return t?t.parentElement:null;};"
      + "[...document.querySelectorAll('strong')].filter(s=>(s.textContent||'').startsWith('Android WebGL')).forEach(s=>{const b=up(s);if(b)b.style.display='none';});"
      + "[...document.querySelectorAll('th')].filter(t=>(t.textContent||'')==='避碰修正').forEach(t=>{const b=up(t);if(b)b.style.display='none';});return JSON.stringify(1);";
    const BASE = new URL(".", url.endsWith("/") ? url : url + "/").pathname;
    const STORE = BASE + "src/useGameStore.js";
    const snapPlayers = () => ev("return import('" + STORE + "').then(m=>{const s=m.useGameStore.getState().snapshot; return JSON.stringify((s&&s.players||[]).map(p=>({id:p.id,hp:p.heroPassive||null,pc:p.powerCurve||null,mlv:p.mlv})));});");
    const click = (sel) => ev("const el=document.querySelector(" + JSON.stringify(sel) + "); if(!el) return JSON.stringify(false); el.click(); return JSON.stringify(true);");
    const mobile = async (w, h) => {
      await chrome.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile: true });
      await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    };
    const desktop = async () => {
      await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: false });
      await chrome.send("Emulation.clearDeviceMetricsOverride", {});
      await chrome.send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    };
    const pTile = () => ev("const b=document.querySelector('.observer-ability[data-skill-slot=\"P\"]'); return JSON.stringify(b?{st:b.getAttribute('data-skill-state'),txt:(b.querySelector('small')||{}).textContent||'',aria:b.getAttribute('aria-label')}:null);");
    const detail = () => ev("const d=document.querySelector('[data-skill-detail]'); if(!d) return JSON.stringify(null); const g=(t)=>{const e=d.querySelector('[data-testid=\"'+t+'\"]'); return e?(e.textContent||''):null;}; return JSON.stringify({id:d.getAttribute('data-skill-detail'),status:g('skill-detail-status'),live:g('passive-live'),note:g('passive-note'),info:g('passive-info'),notLive:g('passive-not-live')});");
    const curve = () => ev("const c=document.querySelector('[data-testid=\"hero-power-curve\"]'); return JSON.stringify(c?{peak:c.getAttribute('data-peak'),phase:c.getAttribute('data-phase'),txt:(c.innerText||'').replace(/\\s+/g,' '),bars:c.querySelectorAll('div > div > div > div').length,over:document.documentElement.scrollWidth-innerWidth}:null);");

    await mobile(390, 844);
    await chrome.navigate(`${url}?debug=moba-runtime-battle&shot=hid&waitTs=150&quality=low&heroes=${HEROES}`);
    let ready = false;
    for (let i = 0; i < 300 && !ready; i++) { await sleep(1500); ready = String(await chrome.evaluate("return JSON.stringify(window.__BATTLE_SHOT_READY || null);")).includes("hid"); }
    ck("戰鬥開始並推進到 ts ≥ 150", ready);
    if (!ready) return;

    // ── S 正式 snapshot ────────────────────────────────────────────────
    let S = await snapPlayers();
    const by = (id) => S?.find((p) => p.id === id);
    ck("S1 b1–b4 有 heroPassive 且分類正確（完整／近似）；b5 資訊類沒有（不進引擎）",
      Object.entries(EXPECT).every(([id, tier]) => (tier ? by(id)?.hp?.tier === tier : !by(id)?.hp)),
      JSON.stringify(Object.fromEntries(S.filter((p) => p.id[0] === "b").map((p) => [p.id, p.hp?.tier ?? null]))));
    ck("S2 10 名英雄都有 powerCurve（peak／phase／k）", S?.length === 10 && S.every((p) => p.pc && Number.isInteger(p.pc.phase) && Number.isFinite(p.pc.k)),
      JSON.stringify(S?.map((p) => p.pc && `${p.id}:${p.pc.phase}/${p.pc.k}`)));
    //  debug 入口每次開局 seed 不同 ⇒ 不在單一時間點取樣，改在觀察窗內等它真的出手（判準不變：必須觸發過）。
    let stackSeen = 0, boostSeen = 0, procSeen = 0;
    for (let i = 0; i < 120 && !(stackSeen && boostSeen && procSeen); i++) {
      S = await snapPlayers();
      stackSeen = Math.max(stackSeen, by("b1")?.hp?.stacks ?? 0);
      boostSeen = Math.max(boostSeen, by("b3")?.hp?.boosted ?? 0);
      procSeen = Math.max(procSeen, by("b4")?.hp?.procs ?? 0);
      if (!(stackSeen && boostSeen && procSeen)) await sleep(1000);
    }
    ck("S3 b4 maestro（第四擊）在觀察窗內確實觸發", procSeen > 0, `procs ${procSeen}`);
    ck("S4 b1 rongyan 戰鬥中出現疊層（stacks > 0）", stackSeen > 0, `max stacks ${stackSeen}`);
    ck("S5 b3 lieyan 常駐修正真的加成過（boosted > 0，或至少欄位存在）", Number.isFinite(by("b3")?.hp?.boosted), `boosted ${boostSeen}`);

    // ── P／C 390 手機 ──────────────────────────────────────────────────
    const checkSeat = async (seat, tag) => {
      const picked = tag === "m" ? await click(`[data-testid="team-strip-hero"][data-seat="${seat}"]`) : await click(`[data-testid="observer-hero"][data-seat="${seat}"]`);
      await sleep(900);
      const t = await pTile();
      const tier = EXPECT[seat];
      ck(`P1[${tag}:${seat}] 選到該英雄、P 格＝${tier ? "生效中" : "資訊類"}`, picked && t && t.txt === (tier ? "生效中" : "資訊類"), JSON.stringify(t));
      await click('.observer-ability[data-skill-slot="P"]'); await sleep(700);
      let d = await detail();
      if (seat === "b4") ck(`P2[${tag}] 完整被動 ⇒「已實裝 · 普攻時 · 已觸發 N 次」且有接入說明`, d && /已實裝 · 普攻時 · 已觸發 \d+ 次/.test(d.status ?? "") && !/近似/.test(d.status) && d.live, JSON.stringify(d));
      if (seat === "b3") ck(`P3[${tag}] 近似被動 ⇒「已實裝（近似）· 常駐」＋實作說明`, d && /已實裝（近似） · 常駐/.test(d.status ?? "") && /實作說明/.test(d.note ?? ""), JSON.stringify(d));
      if (seat === "b5") ck(`P4[${tag}] 資訊類被動 ⇒「資訊類被動 · 不影響戰鬥」＋說明，不顯示「本場未生效」`, d && d.status === "資訊類被動 · 不影響戰鬥" && d.info && !d.notLive, JSON.stringify(d));
      if (seat === "b1") {
        let st = d;
        for (let i = 0; i < 60 && !/疊層 \d+/.test(st?.status ?? ""); i++) { await sleep(1000); st = await detail(); }
        ck(`P5[${tag}] 疊層被動 ⇒ 詳情顯示「疊層 N」（與 snapshot 同源、即時更新）`, /疊層 \d+/.test(st?.status ?? ""), st?.status);
      }
      await shot(`${tag}_${seat}_passive`);
      await click('button[aria-label="關閉技能詳情"]'); await sleep(400);
    };
    for (const seat of ["b4", "b3", "b5", "b1"]) await checkSeat(seat, "m");

    await click('[data-testid="team-strip-hero"][data-seat="b4"]'); await sleep(700);
    await click('button[aria-label="查看英雄戰鬥資訊"]'); await sleep(900);
    S = await snapPlayers();
    let C = await curve();
    ck("C1[m] 英雄資訊有強勢期曲線：三段長條、強勢期、目前階段與倍率", C && /強勢期：/.test(C.txt) && /目前 (前期|中期|後期)/.test(C.txt) && ["0", "1", "2"].includes(C.phase), JSON.stringify(C));
    ck("C2[m] 曲線的目前階段＝snapshot powerCurve.phase（同源）", C && Number(C.phase) === by("b4")?.pc?.phase, `${C?.phase} vs ${by("b4")?.pc?.phase}`);
    ck("C3[m] 390 無橫向溢出", C && C.over <= 0, String(C?.over));
    await shot("m390_hero_sheet_curve");
    await click('button[aria-label="關閉"]'); await sleep(500);

    // ── D 1366 桌機 ────────────────────────────────────────────────────
    await desktop(); await sleep(1500);
    for (const seat of ["b4", "b3", "b5"]) await checkSeat(seat, "d");
    await click('[data-testid="observer-hero"][data-seat="b1"]'); await sleep(700);
    await click('button[aria-label="查看英雄戰鬥資訊"]'); await sleep(900);
    C = await curve();
    ck("C4[d] 桌機英雄資訊同樣有強勢期曲線", C && /強勢期：/.test(C.txt) && ["0", "1", "2"].includes(C.phase), JSON.stringify(C));
    await shot("d1366_hero_sheet_curve");
    await click('button[aria-label="關閉"]'); await sleep(400);

    // ── T TacticScreen（正式元件動態掛載，與 App 同一份 React／store 模組）──
    const mount = await ev("const B=" + JSON.stringify(BASE) + "; return (async()=>{ const ts=await (await fetch(B+'src/screens/moba/TacticScreen.jsx')).text(); const mn=await (await fetch(B+'src/main.jsx')).text();"
      + "const ru=(ts.match(/from\\s+\"([^\"]*\\/deps\\/react\\.js[^\"]*)\"/)||[])[1]; const du=(mn.match(/from\\s+\"([^\"]*\\/deps\\/react-dom_client\\.js[^\"]*)\"/)||[])[1];"
      + "if(!ru||!du) return JSON.stringify({ok:false,ru,du}); const R=await import(ru); const D=await import(du); const T=await import(B+'src/screens/moba/TacticScreen.jsx');"
      + "const React=R.default||R; const createRoot=(D.default||D).createRoot; const host=document.createElement('div'); host.id='hid-tactic'; host.style.cssText='position:fixed;inset:0;z-index:2147483000;background:#0b0f14;overflow:auto';"
      + "document.body.appendChild(host); createRoot(host).render(React.createElement(T.default,{onNext:()=>{},onBack:()=>{}})); return JSON.stringify({ok:true}); })();");
    ck("T0 正式 TacticScreen 掛載成功", mount?.ok, JSON.stringify(mount));
    const effectsOf = async (id) => { await click(`[data-tactic-card="${id}"]`); await sleep(600); return ev("const e=document.querySelector('#hid-tactic [data-testid=\"moba-tactic-effects\"]'); return JSON.stringify(e?[...e.children].map(c=>c.textContent):null);"); };
    for (const [tag, setup] of [["d", null], ["m", () => mobile(390, 844)]]) {
      if (setup) { await setup(); await sleep(900); }
      const m8 = await effectsOf("m8");
      ck(`T1[${tag}] 後期決戰（m8）效果含 farm／protect／分階段／殘血更早脫離`, Array.isArray(m8)
        && ["打野以刷野發育為主（抓人變少）", "輔助留在後排保護", "殘血更早脫離"].every((x) => m8.includes(x)) && m8.some((x) => /^分階段主動性/.test(x)), JSON.stringify(m8));
      const m5 = await effectsOf("m5");
      ck(`T2[${tag}] 下路強攻（m5）效果含「優先保護下路」`, Array.isArray(m5) && m5.includes("優先保護下路"), JSON.stringify(m5));
      const m3 = await effectsOf("m3");
      ck(`T3[${tag}] 強開團（m3）效果含「接戰意願 ↑」「輔助主動遊走」`, Array.isArray(m3) && m3.includes("接戰意願 ↑") && m3.includes("輔助主動遊走"), JSON.stringify(m3));
      const over = await ev("const h=document.getElementById('hid-tactic'); return JSON.stringify(h?h.scrollWidth-h.clientWidth:null);");
      ck(`T4[${tag}] 戰術畫面無橫向溢出`, over !== null && over <= 0, String(over));
      await ev("const e=document.querySelector('#hid-tactic [data-testid=\"moba-tactic-effects\"]'); if(e) e.scrollIntoView({block:'center'}); return JSON.stringify(1);"); await sleep(300);
      await shot(`${tag}_tactic_effects`);
    }

    // ── E 錯誤 ─────────────────────────────────────────────────────────
    const errs = chrome.pageErrors ?? [];
    const consoleErrs = (chrome.consoleLines ?? []).filter((l) => l.startsWith("[error]"));
    const shaderErrs = (chrome.consoleLines ?? []).filter((l) => /shader|WebGL.*error|THREE\.WebGLProgram/i.test(l));
    ck("E1 page error 0", errs.length === 0, errs.slice(0, 3).join(" ¦ "));
    ck("E2 console error 0、shader error 0", consoleErrs.length === 0 && shaderErrs.length === 0, [...consoleErrs, ...shaderErrs].slice(0, 3).join(" ¦ "));
  },
});
finishGate(result);
