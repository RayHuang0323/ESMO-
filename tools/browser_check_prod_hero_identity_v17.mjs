#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_prod_hero_identity_v17.mjs — moba-sim.v17 正式站 smoke（Hero Identity ＋ Objective HUD）
//
//  執行：node tools/browser_check_prod_hero_identity_v17.mjs --prod   （正式站；ESMO_PROD_URL 可覆寫）
//        node tools/browser_check_prod_hero_identity_v17.mjs          （本地 dev server 自驗）
//  ⚠ 正式站只能用 DOM ＋ ?debug=moba-runtime-battle（打包後讀不到 /src/，TD-31）。
//    P0 線上 bundle 是 v17（moba-sim.v17、hero-passive.v2、hero-power-curve.v1、TacticIdentity.v1、TEAM_STYLE 戰術對應、objective SVG）
//    H  390／1366：b1 rongyan（完整・疊層）、b3 lieyan（近似）、b4 maestro（完整）、b5 linghun（資訊類）
//       ⇒ P 格與技能詳情文字、觸發次數；英雄資訊的強勢期曲線
//    O  物件列：緊貼記分板下方（手機在 5v5 戰況列之上）、無重疊、SVG 巨龍／巴龍、無 🐉／👑 emoji、data-state 合法
//    T  Tactical Identity：TacticScreen 在正式站需走完整賽前流程，這支只驗 bundle 內的契約與 UI 文案（本地已用正式元件驗 35/35）
//    E  page error 0、console error 0、shader error 0
//  ⚠ chrome.evaluate 字串裡不能有反引號。
// ============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { runGate, finishGate } from "./browser/harness.mjs";

const PROD = process.env.ESMO_PROD_URL || (process.argv.includes("--prod") ? "https://rayhuang0323.github.io/ESMO-/" : null);
const OUT = process.env.ESMO_REVIEW_OUT ?? (PROD ? "review/hero-identity-v17/prod-smoke" : "review/hero-identity-v17/prod-smoke-local");
mkdirSync(OUT, { recursive: true });
const HEROES = "b1:rongyan,b2:yingsi,b3:lieyan,b4:maestro,b5:linghun";

const result = await runGate({
  name: PROD ? "正式站 moba-sim.v17 Hero Identity／Objective HUD" : "（本地）v17 正式站 smoke 自驗",
  ...(PROD ? { externalUrl: PROD } : {}),
  timeoutMs: 1500000,
  async run({ chrome, url, ck, sleep }) {
    const ev = async (body) => { const r = String(await chrome.evaluate(body)); for (const t of [r, r.replace(/^"|"$/g, "")]) { try { return JSON.parse(t); } catch { /* next */ } } return null; };
    const HIDE = "const up=(el)=>{let n=el,i=0;while(n&&i<8){const p=getComputedStyle(n).position;if((p==='absolute'||p==='fixed')&&n!==document.body)return n;n=n.parentElement;i++;}const t=el.closest('table');return t?t.parentElement:null;};"
      + "[...document.querySelectorAll('strong')].filter(s=>(s.textContent||'').startsWith('Android WebGL')).forEach(s=>{const b=up(s);if(b)b.style.display='none';});"
      + "[...document.querySelectorAll('th')].filter(t=>(t.textContent||'')==='避碰修正').forEach(t=>{const b=up(t);if(b)b.style.display='none';});return JSON.stringify(1);";
    const shot = async (name) => { await chrome.evaluate(HIDE); const s = await chrome.send("Page.captureScreenshot", { format: "png" }); writeFileSync(`${OUT}/${name}.png`, Buffer.from(s.data, "base64")); };
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
    const pTile = () => ev("const b=document.querySelector('.observer-ability[data-skill-slot=\"P\"]'); return JSON.stringify(b?{st:b.getAttribute('data-skill-state'),txt:(b.querySelector('small')||{}).textContent||''}:null);");
    const detail = () => ev("const d=document.querySelector('[data-skill-detail]'); if(!d) return JSON.stringify(null); const g=(t)=>{const e=d.querySelector('[data-testid=\"'+t+'\"]'); return e?(e.textContent||''):null;}; return JSON.stringify({status:g('skill-detail-status'),note:g('passive-note'),info:g('passive-info'),notLive:g('passive-not-live')});");
    const OBJ = "const R=(e)=>{if(!e) return null; const r=e.getBoundingClientRect(); if(!r.width||!r.height) return null; return {l:r.left,r:r.right,t:r.top,b:r.bottom};};const q=(s)=>document.querySelector(s);"
      + "const btn=(t)=>[...document.querySelectorAll('button')].find(b=>(b.textContent||'').trim()===t);"
      + "const o={panel:R(q('[data-testid=\"objective-panel\"]')),hud:R(q('[data-testid=\"battle-hud\"]')),strip:R(q('[data-testid=\"mobile-team-strip\"]')),leave:R(q('[data-testid=\"leave-active-match\"]')),s1:R(btn('1×')),fast:R(btn('快速完成')),boss:R(q('[data-testid=\"boss-hud\"]')),mm:R(q('[data-testid=\"battle-minimap\"]')),dock:R(q('[data-testid=\"observer-dock\"]')),rail:R(q('.observer-rail.blue'))};"
      + "const hit=(a,b)=>a&&b&&Math.min(a.r,b.r)-Math.max(a.l,b.l)>0.5&&Math.min(a.b,b.b)-Math.max(a.t,b.t)>0.5;"
      + "const overlaps=o.panel?['hud','strip','leave','s1','fast','boss','mm','dock','rail'].filter(k=>hit(o.panel,o[k])):['NO_PANEL'];"
      + "const p=q('[data-testid=\"objective-panel\"]'); const st=q('[data-testid=\"mobile-team-strip\"]');"
      + "const states=['dragon','baron'].map(id=>{const e=q('[data-testid=\"objective-spawn-'+id+'\"]'); return e?e.getAttribute('data-state'):null;});"
      + "return JSON.stringify({o,overlaps,vw:innerWidth,over:document.documentElement.scrollWidth-innerWidth,states,"
      + "svg:!!(p&&p.querySelector('svg[data-objective-icon=\"dragon\"]')&&p.querySelector('svg[data-objective-icon=\"baron\"]')),"
      + "emoji:/[\\u{1F409}\\u{1F451}]/u.test(((p&&p.textContent)||'')+((st&&st.textContent)||''))});";

    // ── P0 bundle ──────────────────────────────────────────────────────
    await chrome.navigate(url);
    await sleep(2500);
    const b = await ev("const s=[...document.scripts].map(x=>x.src).find(x=>x.includes('/assets/index-')); if(!s) return JSON.stringify({src:null});"
      + "return fetch(s).then(r=>r.text()).then(async t=>{ const lazy=[...new Set((t.match(/assets\\/[A-Za-z0-9_-]+\\.js/g)||[]))]; let all=t; for(const f of lazy){ try{ all+=await (await fetch(new URL(f, s.replace(/assets\\/.*$/,''))).text()); }catch(e){} }"
      + "return JSON.stringify({src:s,v17:all.includes('moba-sim.v17'),passive:all.includes('hero-passive.v2'),curve:all.includes('hero-power-curve.v1'),tid:all.includes('TacticIdentity.v1'),style:all.includes('mobaTacticForTeamStyle')||all.includes('aggressive:\"m7\"')||all.includes('aggressive:\\'m7\\''),"
      + "tidText:all.includes('打野以刷野發育為主'),icon:all.includes('data-objective-icon'),lazy:lazy.length}); });");
    ck("P0 線上 bundle 是 v17：moba-sim.v17、hero-passive.v2、hero-power-curve.v1、TacticIdentity.v1（含效果文案）、objective SVG",
      b?.v17 && b.passive && b.curve && b.tid && b.tidText && b.icon, JSON.stringify(b));

    // ── H／O 390 手機 ──────────────────────────────────────────────────
    await mobile(390, 844);
    await chrome.navigate(`${url}?debug=moba-runtime-battle&shot=prodhid&waitTs=150&quality=low&heroes=${HEROES}`);
    let ready = false;
    for (let i = 0; i < 300 && !ready; i++) { await sleep(1500); ready = String(await chrome.evaluate("return JSON.stringify(window.__BATTLE_SHOT_READY || null);")).includes("prodhid"); }
    ck("戰鬥開始並推進到 ts ≥ 150（正式站）", ready);
    if (!ready) return;
    const seat = async (id, tag, expect) => {
      await click(tag === "m" ? `[data-testid="team-strip-hero"][data-seat="${id}"]` : `[data-testid="observer-hero"][data-seat="${id}"]`); await sleep(900);
      let t = await pTile();
      await click('.observer-ability[data-skill-slot="P"]'); await sleep(700);
      let d = await detail();
      for (let i = 0; i < 40 && expect.re && !expect.re.test(d?.status ?? ""); i++) { await sleep(1000); d = await detail(); t = await pTile(); }
      ck(`H[${tag}:${id}] P 格＝${expect.tile}；詳情 ${expect.label}`, t?.txt === expect.tile && (!expect.re || expect.re.test(d?.status ?? "")) && (!expect.extra || expect.extra(d)), JSON.stringify({ t, d }));
      await shot(`${tag}_${id}_passive`);
      await click('button[aria-label="關閉技能詳情"]'); await sleep(400);
    };
    const E = {
      b4: { tile: "生效中", label: "已實裝 · 普攻時 · 已觸發 N 次", re: /已實裝 · 普攻時 · 已觸發 [1-9]\d* 次/ },
      b3: { tile: "生效中", label: "已實裝（近似）· 常駐＋實作說明", re: /已實裝（近似） · 常駐/, extra: (d) => /實作說明/.test(d?.note ?? "") },
      b5: { tile: "資訊類", label: "資訊類被動 · 不影響戰鬥", re: /^資訊類被動 · 不影響戰鬥$/, extra: (d) => !!d?.info && !d?.notLive },
      b1: { tile: "生效中", label: "疊層 N", re: /疊層 \d+/ },
    };
    for (const id of ["b4", "b3", "b5", "b1"]) await seat(id, "m", E[id]);
    await click('[data-testid="team-strip-hero"][data-seat="b4"]'); await sleep(600);
    await click('button[aria-label="查看英雄戰鬥資訊"]'); await sleep(900);
    const C = await ev("const c=document.querySelector('[data-testid=\"hero-power-curve\"]'); return JSON.stringify(c?{phase:c.getAttribute('data-phase'),txt:(c.innerText||'').replace(/\\s+/g,' ')}:null);");
    ck("H[m] 英雄資訊有強勢期曲線（強勢期／目前階段／倍率）", C && /強勢期：/.test(C.txt) && /目前 (前期|中期|後期)/.test(C.txt) && ["0", "1", "2"].includes(C.phase), JSON.stringify(C));
    await shot("m390_hero_sheet_curve");
    await click('button[aria-label="關閉"]'); await sleep(500);
    for (const [w, h] of [[360, 740], [390, 844]]) {
      await mobile(w, h); await sleep(900); await chrome.evaluate(HIDE);
      const O = await ev(OBJ); const o = O?.o ?? {};
      ck(`O[${w}] 物件列緊貼記分板下方、在 5v5 戰況列之上、無重疊／溢出；SVG 圖示、無 emoji；狀態合法`,
        o.panel && o.hud && o.strip && o.panel.t >= o.hud.b - 0.5 && o.panel.t - o.hud.b <= 6 && o.strip.t >= o.panel.b - 0.5
          && O.overlaps.length === 0 && O.over <= 0 && O.svg && O.emoji === false && O.states.every((s) => ["pre", "alive", "fight", "respawn"].includes(s)),
        JSON.stringify({ panel: o.panel, hudB: o.hud?.b, stripT: o.strip?.t, overlaps: O?.overlaps, states: O?.states, svg: O?.svg, emoji: O?.emoji }));
      await shot(`m${w}_objective`);
    }

    // ── 1366 桌機 ──────────────────────────────────────────────────────
    await desktop(); await sleep(1500);
    for (const id of ["b4", "b5"]) await seat(id, "d", E[id]);
    await click('[data-testid="observer-hero"][data-seat="b1"]'); await sleep(600);
    await click('button[aria-label="查看英雄戰鬥資訊"]'); await sleep(900);
    const C2 = await ev("const c=document.querySelector('[data-testid=\"hero-power-curve\"]'); return JSON.stringify(c?{phase:c.getAttribute('data-phase'),txt:(c.innerText||'').replace(/\\s+/g,' ')}:null);");
    ck("H[d] 桌機英雄資訊有強勢期曲線", C2 && /強勢期：/.test(C2.txt) && ["0", "1", "2"].includes(C2.phase), JSON.stringify(C2));
    await click('button[aria-label="關閉"]'); await sleep(500);
    await chrome.evaluate(HIDE);
    const OD = await ev(OBJ); const od = OD?.o ?? {};
    ck("O[1366] 桌機物件列在記分板正下方、無重疊（含 Boss 血條／英雄欄）、SVG 圖示",
      od.panel && od.hud && od.panel.t >= od.hud.b - 0.5 && od.panel.t - od.hud.b <= 6 && OD.overlaps.length === 0 && OD.over <= 0 && OD.svg && OD.emoji === false,
      JSON.stringify({ panel: od.panel, hudB: od.hud?.b, boss: od.boss, overlaps: OD?.overlaps }));
    await shot("d1366_objective");

    // ── E 錯誤 ─────────────────────────────────────────────────────────
    const errs = chrome.pageErrors ?? [];
    const consoleErrs = (chrome.consoleLines ?? []).filter((l) => l.startsWith("[error]"));
    const shaderErrs = (chrome.consoleLines ?? []).filter((l) => /shader|WebGL.*error|THREE\.WebGLProgram/i.test(l));
    ck("E1 page error 0", errs.length === 0, errs.slice(0, 3).join(" ¦ "));
    ck("E2 console error 0、shader error 0", consoleErrs.length === 0 && shaderErrs.length === 0, [...consoleErrs, ...shaderErrs].slice(0, 3).join(" ¦ "));
  },
});
finishGate(result);
