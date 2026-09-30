#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_moba_objective_v16.mjs — Objective Stakes v1＋TD-CS1（moba-sim.v16）瀏覽器 gate
//
//  執行：node tools/browser_check_moba_objective_v16.mjs
//  本地 dev server、?debug=moba-runtime-battle&heroes=b4:liuxing,r4:miwu（其餘席位＝預設 ROSTER），4× 播放。
//  桌機 1366（現場）：
//    O1 物件面板出現、龍層圓點與 snapshot.teamBuffs 一致（前置：本場至少拿到 1 層）
//    O2 巴龍徽章＝snapshot 巴龍剩餘；持有巴龍期間小兵金環實例數 > 0（前置：本場有巴龍）
//    O3 龍魂徽章＝snapshot soul（本場有人龍魂才驗；沒有則記錄「未發生」，不當通過）
//    O4 大型物件擊殺提示出現（objectiveLog）
//    T1 TD-CS1：liuxing:Q 施放後，紅方有英雄出現 hero-slow（現場 snapshot）
//  桌機（Replay）：
//    R1 replay 帶 objectiveEvents、團隊 CombatState 與 hero-slow 紀錄
//    R2 seek 到持有巴龍／龍層的時刻 ⇒ 重播物件面板與 replay 紀錄一致
//    R3 seek 到 TD-CS1 減速的時刻、點選被減速英雄 ⇒ 底欄狀態列有「減速」
//  手機 390：
//    M1 物件面板在畫面內、無橫向溢出、不壓 5v5 戰況列
//  E page error 0；console error 0；shader error 0
//  截圖輸出：review/moba-objective-v16/owner/（Owner Review 用）
//  ⚠ 前置條件都先由受測系統自己的輸出證明（snapshot／replay／DOM），沒發生就明說，不當 PASS。
//  ⚠ chrome.evaluate 的字串裡不能有反引號。
// ============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { runGate, finishGate } from "./browser/harness.mjs";

const OUT = process.env.ESMO_REVIEW_OUT ?? "review/moba-objective-v16/owner";
mkdirSync(OUT, { recursive: true });

const result = await runGate({
  name: "MOBA Objective Stakes v1＋TD-CS1（v16）",
  timeoutMs: 2700000,
  async run({ chrome, url, ck, sleep }) {
    const ev = async (body) => { const r = String(await chrome.evaluate(body)); for (const t of [r, r.replace(/^"|"$/g, "")]) { try { return JSON.parse(t); } catch { /* next */ } } return null; };
    const HIDE = "const up=(el)=>{let n=el,i=0;while(n&&i<8){const p=getComputedStyle(n).position;if((p==='absolute'||p==='fixed')&&n!==document.body)return n;n=n.parentElement;i++;}const t=el.closest('table');return t?t.parentElement:null;};"
      + "[...document.querySelectorAll('strong')].filter(s=>(s.textContent||'').startsWith('Android WebGL')).forEach(s=>{const b=up(s);if(b)b.style.display='none';});"
      + "[...document.querySelectorAll('th')].filter(t=>(t.textContent||'')==='避碰修正').forEach(t=>{const b=up(t);if(b)b.style.display='none';});return JSON.stringify(1);";
    const shot = async (name) => { await chrome.evaluate(HIDE); const s = await chrome.send("Page.captureScreenshot", { format: "png" }); writeFileSync(`${OUT}/${name}.png`, Buffer.from(s.data, "base64")); };
    const base = new URL(url.endsWith("/") ? url : url + "/").pathname;
    const STORE = base + "src/useGameStore.js";
    const REPLAY = base + "src/battle/moba/replay/replayBuffer.js";
    const clickText = (t) => ev("const b=[...document.querySelectorAll('button')].find(x=>(x.innerText||'').trim()===" + JSON.stringify(t) + "); if(b) b.click(); return JSON.stringify(!!b);");
    const start = async (w, h, mob) => {
      await chrome.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: mob ? 2 : 1, mobile: mob });
      await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: mob, maxTouchPoints: mob ? 5 : 1 });
      await chrome.navigate(`${url}?debug=moba-runtime-battle&shot=obj&waitTs=20&quality=low&heroes=b4:liuxing,r4:miwu`);
      let ready = false;
      for (let i = 0; i < 200 && !ready; i++) { await sleep(1500); ready = String(await chrome.evaluate("return JSON.stringify(window.__BATTLE_SHOT_READY || null);")).includes("obj"); }
      return ready;
    };
    //  每次取樣：snapshot 的團隊物件狀態＋面板 DOM＋光環實例數＋TD-CS1 線索
    const probe = () => ev("return import('" + STORE + "').then(m=>{const s=m.useGameStore.getState().snapshot; if(!s) return JSON.stringify(null);"
      + "const d=window.__ESMO_RUNTIME_DIAG?window.__ESMO_RUNTIME_DIAG():null;"
      + "const q=(sel)=>document.querySelector(sel);"
      + "const team=(side)=>{const el=q('[data-testid=objective-team-'+side+']'); return el?{stacks:Number(el.getAttribute('data-dragon-stacks')),soul:el.getAttribute('data-soul')==='1',baron:Number(el.getAttribute('data-baron-remaining'))}:null;};"
      + "const liuxingQ=(s.fx||[]).some(f=>f.skillId==='liuxing:Q'&&s.ts-f.at<1.2);"
      + "const slowed=s.players.filter(p=>p.side==='red'&&!p.dead&&(p.statusEffects||[]).some(e=>e.id==='hero-slow')).map(p=>p.id);"
      + "return JSON.stringify({ts:s.ts,over:!!s.over,tb:s.teamBuffs,ui:{panel:!!q('[data-testid=objective-panel]'),blue:team('blue'),red:team('red'),toast:(q('[data-testid=objective-toast]')||{}).innerText||null},rings:d?d.minionRings:null,liuxingQ,slowed});});");

    // ═══ 桌機現場 ═══════════════════════════════════════════════════════
    const ok = await start(1366, 900, false);
    ck("B0 桌機戰鬥開始（heroes=b4:liuxing,r4:miwu）", ok);
    if (!ok) return;
    await clickText("4×");
    const seen = { dragon: null, baron: null, soul: null, toast: null, slow: null };
    let mismatch = 0, samples = 0, ringOk = null; const ex = [];
    //  現場段真實時間上限 12 分鐘；需要的畫面都拿到（龍魂是加分項）就提早結束，其餘交給快速完成。
    const liveDeadline = Date.now() + 22 * 60 * 1000;
    for (let i = 0; i < 4000 && Date.now() < liveDeadline; i++) {
      if (seen.dragon && seen.baron && seen.toast && seen.slow && (seen.soul || i > 1500)) break;
      const p = await probe();
      if (!p) { await sleep(300); continue; }
      if (p.over) break;
      if (p.ui.panel && p.tb) {
        samples++;
        for (const side of ["blue", "red"]) {
          const tb = p.tb[side], ui = p.ui[side];
          const same = ui && ui.stacks === Math.round(tb.dragonStacks ?? 0) && ui.soul === !!tb.soul
            && Math.abs(ui.baron - Math.ceil(tb.baronRemaining ?? 0)) <= 1;
          if (!same) { mismatch++; if (ex.length < 3) ex.push(JSON.stringify({ side, tb, ui })); }
          if (!seen.dragon && (tb.dragonStacks ?? 0) >= 1) { seen.dragon = p.ts; await shot("01-dragon-stack-desktop"); }
          if (!seen.baron && (tb.baronRemaining ?? 0) > 5) {
            seen.baron = p.ts; ringOk = (p.rings?.baron ?? 0) > 0;
            await shot("02-baron-buff-desktop");
            await sleep(400); await shot("03-baron-minions-desktop");
          }
          if (!seen.soul && tb.soul) { seen.soul = p.ts; await shot("04-dragon-soul-desktop"); }
        }
        if (!seen.toast && p.ui.toast) { seen.toast = p.ui.toast; await shot("05-objective-toast-desktop"); }
      }
      if (!seen.slow && p.liuxingQ && p.slowed.length) {
        seen.slow = { ts: p.ts, ids: p.slowed };
        await ev("const b=document.querySelector('[data-seat=\"" + p.slowed[0] + "\"]'); if(b) b.click(); return JSON.stringify(!!b);");
        await sleep(250); await shot("06-td-cs1-slow-live-desktop");
      }
      await sleep(300);
    }
    ck("O1 物件面板與 snapshot.teamBuffs 逐次一致（前置：本場拿到龍層）", !!seen.dragon && samples > 0 && mismatch <= Math.ceil(samples * 0.02),
      `samples=${samples} mismatch=${mismatch} ${ex.join(" ¦ ")}`);
    ck("O2 巴龍徽章出現，且持有巴龍時小兵金環實例數 > 0（前置：本場有巴龍）", !!seen.baron && ringOk === true, `baronAt=${seen.baron} ring=${ringOk}`);
    if (seen.soul) ck("O3 龍魂徽章與 snapshot soul 一致", true, `soulAt=${seen.soul}`);
    else console.log("   ⓘ O3 本場沒有隊伍達成龍魂（隨機 seed）；龍魂的 UI／Replay 一致性另由 Node 驗證器 R2 覆蓋，這裡不當通過。");
    ck("O4 大型物件擊殺提示出現", !!seen.toast, String(seen.toast));
    ck("T1 TD-CS1：liuxing:Q 施放後紅方英雄出現 hero-slow（現場）", !!seen.slow, JSON.stringify(seen.slow));

    // ═══ 桌機 Replay ════════════════════════════════════════════════════
    await chrome.evaluate("window.confirm = () => true; return JSON.stringify(1);");
    await ev("const b=document.querySelector('[data-testid=quick-finish-match]'); if(b) b.click(); return JSON.stringify(!!b);");
    let canReplay = false;
    for (let i = 0; i < 240 && !canReplay; i++) { await sleep(1000); canReplay = !!(await ev("return JSON.stringify(!![...document.querySelectorAll('button')].find(b=>/觀看重播/.test(b.innerText||'')));")); }
    if (!canReplay) { ck("R0 結算後可開重播", false); return; }
    const plan = await ev("return import('" + REPLAY + "').then(m=>{const r=m.getCurrentReplay(); if(!r||!r.combatStates) return JSON.stringify(null);"
      + "const cs=r.combatStates, ids=r.playersMeta.map(p=>p.id);"
      + "const rows=cs.rows.map((x,i)=>({kind:cs.kinds[x[0]],target:x[1]>=0?ids[x[1]]:null,start:x[4],until:x[5],side:cs.sides?cs.sides[i]:null}));"
      + "const baron=rows.find(x=>x.kind==='team-baron'); const dragon=rows.find(x=>x.kind==='team-dragon'); const soul=rows.find(x=>x.kind==='team-soul');"
      + "const fxT=[]; for(const f of r.frames){for(const row of (f.fx||[])){ if(row[8]==='hero:Q'&&row[10]==='b4') fxT.push(row[6]); }}"
      + "const slow=rows.find(x=>x.kind==='hero-slow'&&x.target&&x.target[0]==='r'&&fxT.some(t=>x.start>=t-0.05&&x.start<=t+1.2));"
      + "return JSON.stringify({events:(r.objectiveEvents||[]).length,baron,dragon,soul,slow,duration:r.duration});});");
    ck("R1 replay 帶 objectiveEvents、團隊 CombatState（龍層／巴龍）與 TD-CS1 hero-slow 紀錄", !!plan && plan.events > 0 && !!plan.dragon && !!plan.baron && !!plan.slow, JSON.stringify(plan));
    await ev("[...document.querySelectorAll('button')].find(b=>/觀看重播/.test(b.innerText||'')).click(); return JSON.stringify(1);");
    const opened = await (async () => { for (let i = 0; i < 90; i++) { await sleep(1000); if (await ev("return JSON.stringify(!!document.querySelector('[data-testid=replay-play-toggle]') && !document.querySelector('[data-testid=rift-entry-loading]'));")) return true; } return false; })();
    if (!opened || !plan) { ck("R1b 重播畫面開啟、地圖載入", false); return; }
    const seekTo = async (t) => {
      await ev("const btn=document.querySelector('[data-testid=replay-play-toggle]'); if(btn&&/暫停/.test(btn.innerText||'')) btn.click(); return JSON.stringify(1);");
      await ev("const s=document.querySelector('input[aria-label=\"重播時間軸\"]'); const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; set.call(s," + t + "); s.dispatchEvent(new Event('input',{bubbles:true})); s.dispatchEvent(new Event('change',{bubbles:true})); return JSON.stringify(Number(s.value));");
      await sleep(1200);
    };
    const panelState = () => ev("const t=(side)=>{const el=document.querySelector('[data-testid=objective-team-'+side+']'); return el?{stacks:Number(el.getAttribute('data-dragon-stacks')),soul:el.getAttribute('data-soul')==='1',baron:Number(el.getAttribute('data-baron-remaining'))}:null;}; return JSON.stringify({blue:t('blue'),red:t('red')});");
    const bt = plan.baron.start + 5;
    await seekTo(bt);
    const pb = await panelState();
    const bside = plan.baron.side === "b" ? "blue" : "red";
    await shot("07-replay-baron-desktop");
    ck("R2 Replay seek 到巴龍期間 ⇒ 重播物件面板顯示該隊巴龍徽章（剩餘秒數＝紀錄 ±2）", pb?.[bside]?.baron > 0
      && Math.abs(pb[bside].baron - Math.ceil(plan.baron.until - bt)) <= 2, JSON.stringify({ at: bt, side: bside, pb }));
    const st = plan.slow.start + 0.3;
    await seekTo(st);
    await ev("const b=document.querySelector('[data-seat=\"" + plan.slow.target + "\"]'); if(b) b.click(); return JSON.stringify(!!b);");
    await sleep(800);
    const statuses = await ev("return JSON.stringify([...document.querySelectorAll('.observer-status')].map(e=>e.getAttribute('data-status')));");
    await shot("08-replay-td-cs1-slow-desktop");
    ck("R3 Replay seek 到 TD-CS1 減速時刻並點選被減速英雄 ⇒ 底欄狀態列有 hero-slow", (statuses ?? []).includes("hero-slow"), JSON.stringify({ at: st, target: plan.slow.target, statuses }));

    // ═══ 手機 390 ═══════════════════════════════════════════════════════
    const okm = await start(390, 844, true);
    if (okm) {
      await clickText("4×");
      let lay = null;
      for (let i = 0; i < 600; i++) {
        const p = await probe();
        if (p?.over) break;
        if (p?.tb && ((p.tb.blue.dragonStacks ?? 0) + (p.tb.red.dragonStacks ?? 0) >= 2 || (p.tb.blue.baronRemaining ?? 0) + (p.tb.red.baronRemaining ?? 0) > 5)) {
          lay = await ev("const R=(s)=>{const e=document.querySelector(s); if(!e) return null; const r=e.getBoundingClientRect(); return {l:r.left,r:r.right,t:r.top,b:r.bottom};};"
            + "const tl=[...document.querySelectorAll('div')].filter(d=>(d.innerText||'').startsWith('戰報')).map(d=>d.getBoundingClientRect()).filter(r=>r.height>20&&r.height<400).sort((a,b)=>b.bottom-a.bottom)[0];"
            + "return JSON.stringify({panel:R('[data-testid=objective-panel]'),strip:R('[data-testid=mobile-team-strip]'),timelineB:tl?tl.bottom:null,vw:innerWidth,over:document.documentElement.scrollWidth-innerWidth});");
          await shot("09-objective-panel-mobile");
          break;
        }
        await sleep(300);
      }
      ck("M1 手機：物件面板在畫面內、無橫向溢出、不壓 5v5 戰況列與戰報", !!lay?.panel && lay.panel.l >= 0 && lay.panel.r <= lay.vw && lay.over <= 0
        && (!lay.strip || lay.panel.t >= lay.strip.b - 0.5) && (lay.timelineB === null || lay.panel.t >= lay.timelineB - 0.5), JSON.stringify(lay));
    } else ck("M0 手機戰鬥開始", false);

    const errs = chrome.pageErrors ?? [];
    ck("E1 page error 0", errs.length === 0, errs.slice(0, 3).join(" ¦ "));
    const consoleErrs = (chrome.consoleLines ?? []).filter((l) => l.startsWith("[error]"));
    const shaderErrs = (chrome.consoleLines ?? []).filter((l) => /shader|WebGL.*error|THREE\.WebGLProgram/i.test(l));
    ck("E2 console error 0、shader error 0", consoleErrs.length === 0 && shaderErrs.length === 0, [...consoleErrs, ...shaderErrs].slice(0, 3).join(" ¦ "));
  },
});
finishGate(result);
