#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_moba_combat_feedback.mjs — MOBA Combat Feedback Polish（瀏覽器 smoke）
//
//  執行：node tools/browser_check_moba_combat_feedback.mjs（本地 dev server；一次只跑這一支）
//  走 ?debug=moba-runtime-battle（正式 GameView／引擎／HUD），桌機 1366 與手機 390 各跑一段 4×：
//    F  浮動數字真的畫出來：英雄／中立／塔的傷害、補血、+Gold；同時存在數 ≤ 物件池
//    R  回城：畫面正在畫的引導數 ＝ snapshot 可見的引導數（逐幀）；有完成特效
//    O  頭頂名牌：截圖（團戰 10 人附近、回城中、推塔）給人工審；名牌預設開、手機也開
//    E  page error 0、console error 0、shader error 0
//  ⚠ 只讀 store 與驗收計數鉤子（__ESMO_COMBAT_FEEDBACK／__ESMO_RECALL_FX，只有 ?shot= 才存在）。
//  ⚠ chrome.evaluate 字串裡不能有反引號。
// ============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { runGate, finishGate } from "./browser/harness.mjs";

const OUT = process.env.ESMO_REVIEW_OUT ?? "review/moba-combat-feedback/gate";
mkdirSync(OUT, { recursive: true });

const result = await runGate({
  name: "MOBA Combat Feedback Polish",
  timeoutMs: 1800000,
  async run({ chrome, url, ck, sleep }) {
    const ev = async (body) => { const r = String(await chrome.evaluate(body)); for (const t of [r, r.replace(/^"|"$/g, "")]) { try { return JSON.parse(t); } catch { /* next */ } } return null; };
    const HIDE = "const up=(el)=>{let n=el,i=0;while(n&&i<8){const p=getComputedStyle(n).position;if((p==='absolute'||p==='fixed')&&n!==document.body)return n;n=n.parentElement;i++;}const t=el.closest('table');return t?t:null;};"
      + "[...document.querySelectorAll('strong')].filter(s=>(s.textContent||'').startsWith('Android WebGL')).forEach(s=>{const b=up(s);if(b)b.style.display='none';});"
      + "[...document.querySelectorAll('th')].filter(t=>(t.textContent||'')==='避碰修正').forEach(t=>{const b=up(t);if(b)b.style.display='none';});return JSON.stringify(1);";
    const shot = async (name) => { await chrome.evaluate(HIDE); const s = await chrome.send("Page.captureScreenshot", { format: "png" }); writeFileSync(`${OUT}/${name}.png`, Buffer.from(s.data, "base64")); };
    const BASE = new URL(".", url.endsWith("/") ? url : url + "/").pathname;
    const STORE = BASE + "src/useGameStore.js";
    const clickText = (t) => ev("const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').trim()===" + JSON.stringify(t) + "); if(!b) return JSON.stringify(false); b.click(); return JSON.stringify(true);");
    //  場面狀態：時間、可見回城數、最大群聚人數（團戰）、塔是否在掉血
    const scene = () => ev("return import('" + STORE + "').then(m=>{const s=m.useGameStore.getState().snapshot; if(!s) return JSON.stringify(null);"
      + "const al=(s.players||[]).filter(p=>!p.dead); let best=0, at=null; for(const a of al){const n=al.filter(b=>Math.hypot(b.pos.x-a.pos.x,b.pos.y-a.pos.y)<28).length; if(n>best){best=n; at=a.id;}}"
      + "const rc=(s.players||[]).filter(p=>p.rc>0&&!p.dead).map(p=>p.id);"
      + "const tw=Object.entries(s.towers||{}).filter(([k,t])=>t.hp>0&&t.hp<0.98).map(([k])=>k);"
      + "const rcPos=(s.players||[]).filter(p=>p.rc>0&&!p.dead).map(p=>({id:p.id,x:p.pos.x,y:p.pos.y,rc:p.rc}));"
      + "return JSON.stringify({ts:s.ts,over:!!s.over,cluster:best,clusterAt:at,rc,rcPos,tw});});");
    const counters = () => ev("return JSON.stringify({fb:window.__ESMO_COMBAT_FEEDBACK?window.__ESMO_COMBAT_FEEDBACK():null, rc:window.__ESMO_RECALL_FX?window.__ESMO_RECALL_FX():null});");

    async function runViewport(tag, setup, { quality }) {
      await setup();
      await chrome.navigate(`${url}?debug=moba-runtime-battle&shot=cfb${tag}&waitTs=1&quality=${quality}`);
      let ready = false;
      for (let i = 0; i < 200 && !ready; i++) { await sleep(1000); ready = String(await chrome.evaluate("return JSON.stringify(window.__BATTLE_SHOT_READY || null);")).includes(`cfb${tag}`); }
      ck(`${tag} 戰鬥開始`, ready);
      if (!ready) return null;
      await chrome.evaluate(HIDE);
      const shots = { recall: false, teamfight: false, tower: false, early: false };
      let sped = false;
      //  上限：比賽時間 12 分或實際 7 分鐘就收尾（缺的截圖照實記失敗，不無限等——上一版就是卡在這裡逾時）
      const t0 = Date.now();
      for (let i = 0; i < 2000; i++) {
        const s = await scene();
        if (!s || s.over || s.ts > 720 || Date.now() - t0 > 420000) break;
        if (!sped && s.ts > 3) { sped = await clickText("4×"); }
        if (!shots.early && s.ts > 60) { shots.early = true; await shot(`${tag}_laning`); }
        //  回城：先用 HUD 點英雄同一支 focusHero 把鏡頭帶到正在引導的英雄，再拍（導播鏡頭常不在他身上）
        if (!shots.recall && s.rc.length && s.ts > 60) {
          //  自動導播會把 focusHero 搶回去 ⇒ 改用自由鏡頭 userViewTo（玩家拖曳／縮放同一支），拍完交還導播
          const rp = s.rcPos[0];
          await ev("return import('" + BASE + "src/battle/cameraStore.js').then(m=>{m.useCameraStore.getState().userViewTo(" + rp.x + "," + rp.y + ",6); return JSON.stringify(1);});");
          await sleep(700);
          const again = await scene();
          if (again?.rc?.includes(rp.id)) { shots.recall = true; await shot(`${tag}_recall_channel`); }
          await ev("return import('" + BASE + "src/battle/cameraStore.js').then(m=>{m.useCameraStore.getState().backToDirector(); return JSON.stringify(1);});");
          if (process.env.ESMO_CF_ONLY === "recall" && shots.recall) break;
        }
        if (!shots.teamfight && s.cluster >= 5 && s.ts > 120) { shots.teamfight = true; await shot(`${tag}_teamfight_${s.cluster}`); }
        if (!shots.tower && s.tw.length && s.ts > 200) { shots.tower = true; await shot(`${tag}_tower_push`); }
        const c = await counters();
        const done = c?.fb && c.fb.byTarget.hero > 0 && c.fb.byTarget.neutral > 0 && c.fb.byTarget.tower > 0 && c.fb.spawned.gold > 0
          && c.fb.spawned.heal > 0 && c.rc?.bursts.done > 0 && shots.recall && shots.teamfight && shots.tower;
        if (done) break;
        await sleep(300);
      }
      const c = await counters();
      const s = await scene();
      return { c, s, shots };
    }

    const desktop = async () => {
      await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: false });
      await chrome.send("Emulation.clearDeviceMetricsOverride", {});
      await chrome.send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    };
    const mobile = async () => {
      await chrome.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
      await chrome.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    };

    for (const [tag, setup, quality] of [["desktop", desktop, "high"], ["m390", mobile, "low"]]) {
      const r = await runViewport(tag, setup, { quality });
      if (!r) continue;
      const fb = r.c?.fb, rc = r.c?.rc;
      ck(`${tag} F1 驗收計數鉤子存在（?shot= 才掛）`, !!fb && !!rc);
      if (!fb || !rc) continue;
      ck(`${tag} F2 英雄／中立／塔的傷害數字都有畫`, fb.byTarget.hero > 0 && fb.byTarget.neutral > 0 && fb.byTarget.tower > 0, JSON.stringify(fb.byTarget));
      ck(`${tag} F3 補血、+Gold 都有畫；重要傷害有強調`, fb.spawned.heal > 0 && fb.spawned.gold > 0 && fb.spawned.major > 0, JSON.stringify(fb.spawned));
      ck(`${tag} F4 同時存在的浮字 ≤ 物件池 28`, fb.peak <= 28, `peak ${fb.peak}`);
      ck(`${tag} R1 回城：逐幀「畫出的引導數 ＝ snapshot 可見引導數」`, rc.frames > 50 && rc.mismatchFrames === 0, JSON.stringify(rc));
      ck(`${tag} R2 有畫過引導、有完成特效`, rc.maxDrawn > 0 && rc.bursts.done > 0, JSON.stringify(rc.bursts));
      ck(`${tag} O1 截圖：對線、回城中、團戰、推塔`, r.shots.early && r.shots.recall && r.shots.teamfight && r.shots.tower, JSON.stringify(r.shots));
      console.log(`   ${tag} 最後 12 個數字：${JSON.stringify(fb.last)}`);
    }

    const errs = chrome.pageErrors ?? [];
    const consoleErrs = (chrome.consoleLines ?? []).filter((l) => l.startsWith("[error]"));
    const shaderErrs = (chrome.consoleLines ?? []).filter((l) => /shader|WebGL.*error|THREE\.WebGLProgram/i.test(l));
    ck("E1 page error 0", errs.length === 0, errs.slice(0, 3).join(" ¦ "));
    ck("E2 console error 0、shader error 0", consoleErrs.length === 0 && shaderErrs.length === 0, [...consoleErrs, ...shaderErrs].slice(0, 3).join(" ¦ "));
  },
});
finishGate(result);
