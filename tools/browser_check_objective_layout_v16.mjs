#!/usr/bin/env node
// ============================================================================
//  tools/browser_check_objective_layout_v16.mjs — Objective Layout（STANDARD／SWAPPED）瀏覽器 gate（moba-sim.v16）
//
//  執行：node tools/browser_check_objective_layout_v16.mjs [--seed=1]
//  全部走正式路徑，驗的是**畫面實際渲染**（scene graph 世界座標），不是資料層推論：
//    V1 現場（debug 對戰頁；layout 由 useLocalServer 依本場 seed 推導）：畫面坑位標記的 layout＝frame.objectiveLayout，
//       兩個標記的世界座標＝該 layout 下巨龍／巴龍坑
//    R1 同頁用正式 LogicEngine 強制 SWAPPED 跑 seed N、逐 tick 餵正式 replayBuffer（beginReplayCapture 帶 objectiveLayout）
//    R2 開重播、seek 到第二次巨龍刷新後（已有龍層 ⇒ 物件面板存在；巨龍存活）⇒ frame／標記 layout＝SWAPPED；巨龍標記在上方坑；巨龍 boss 離上方坑比離下方坑近；物件面板存在
//    R3 390 手機同一時刻：同上，且無橫向溢出
//    E1 page error 0；E2 console error 0、shader error 0
//  截圖：review/moba-objective-v16/owner/12-*（Owner Review）
//  ⚠ 導播焦點與小地圖的坑位由 Node gate check_objective_layout_contract（L9／L10）覆蓋。
//  ⚠ chrome.evaluate 的字串裡不能有反引號。
// ============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { runGate, finishGate } from "./browser/harness.mjs";

const OUT = process.env.ESMO_REVIEW_OUT ?? "review/moba-objective-v16/owner";
mkdirSync(OUT, { recursive: true });
const SEED = Number(process.argv.find((a) => a.startsWith("--seed="))?.slice(7) ?? 1);

const result = await runGate({
  name: "Objective Layout STANDARD／SWAPPED（v16）",
  timeoutMs: 1500000,
  async run({ chrome, url, ck, sleep }) {
    const ev = async (body) => { const r = String(await chrome.evaluate(body)); for (const t of [r, r.replace(/^"|"$/g, "")]) { try { return JSON.parse(t); } catch { /* next */ } } return null; };
    const HIDE = "const up=(el)=>{let n=el,i=0;while(n&&i<8){const p=getComputedStyle(n).position;if((p==='absolute'||p==='fixed')&&n!==document.body)return n;n=n.parentElement;i++;}const t=el.closest('table');return t?t.parentElement:null;};"
      + "[...document.querySelectorAll('strong')].filter(s=>(s.textContent||'').startsWith('Android WebGL')).forEach(s=>{const b=up(s);if(b)b.style.display='none';});"
      + "[...document.querySelectorAll('th')].filter(t=>(t.textContent||'')==='避碰修正').forEach(t=>{const b=up(t);if(b)b.style.display='none';});return JSON.stringify(1);";
    const shot = async (name) => { await chrome.evaluate(HIDE); const s = await chrome.send("Page.captureScreenshot", { format: "png" }); writeFileSync(`${OUT}/${name}.png`, Buffer.from(s.data, "base64")); };
    const base = new URL(url.endsWith("/") ? url : url + "/").pathname + "src/";
    //  頁面內：某 layout 下巨龍／巴龍坑的**世界座標**（與 renderer 同一個 simToWorld）
    const EXPECT = "Promise.all([import('" + base + "platform/contracts/objectiveLayout.js'),import('" + base + "battle/moba/map/coordinateMapping.js')]).then(([C,M])=>{"
      + "const d=window.__ESMO_RUNTIME_DIAG?window.__ESMO_RUNTIME_DIAG():null; const L=d?d.objectiveLayout:null; const P=C.objectivePitsFor(L);"
      + "const w=(k)=>{const q=M.simToWorld(P[k],0);return {x:q.x,z:q.z};}; const top=M.simToWorld(C.objectivePitsFor('SWAPPED').dragon,0), bot=M.simToWorld(C.objectivePitsFor('STANDARD').dragon,0);"
      + "const dd=(a,b)=>a&&b?Math.hypot(a.x-b.x,a.z-b.z):null;"
      + "return JSON.stringify({layout:L,markerLayout:d&&d.pitMarkers.layout,markerErr:{dragon:dd(d&&d.pitMarkers.dragon,w('dragon')),baron:dd(d&&d.pitMarkers.baron,w('baron'))},"
      + "dragonBoss:d&&d.bosses.dragon?{toTop:dd(d.bosses.dragon,top),toBot:dd(d.bosses.dragon,bot)}:null,panel:!!document.querySelector('[data-testid=objective-panel]'),over:document.documentElement.scrollWidth-innerWidth});})";

    await chrome.send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    await chrome.navigate(`${url}?debug=moba-runtime-battle&shot=layout&waitTs=5&quality=low`);
    let ready = false;
    for (let i = 0; i < 200 && !ready; i++) { await sleep(1500); ready = String(await chrome.evaluate("return JSON.stringify(window.__BATTLE_SHOT_READY || null);")).includes("layout"); }
    ck("S0 戰鬥開始", ready);
    if (!ready) return;
    await sleep(2500);
    const live = await ev("return " + EXPECT + ";");
    await shot("12-objective-layout-live-desktop");
    ck("V1 現場：畫面坑位標記 layout＝frame layout，兩個標記在該 layout 的坑上（誤差 < 0.01）",
      !!live?.layout && live.markerLayout === live.layout && live.markerErr.dragon < 0.01 && live.markerErr.baron < 0.01, JSON.stringify(live));

    await chrome.evaluate("window.confirm = () => true; return JSON.stringify(1);");
    await ev("const b=document.querySelector('[data-testid=quick-finish-match]'); if(b) b.click(); return JSON.stringify(!!b);");
    let atResult = false;
    for (let i = 0; i < 240 && !atResult; i++) { await sleep(1000); atResult = !!(await ev("return JSON.stringify(!![...document.querySelectorAll('button')].find(b=>/觀看重播/.test(b.innerText||'')));")); }
    ck("S1 快速完成後到結算畫面", atResult);
    if (!atResult) return;
    //  頁面內正式引擎，強制 SWAPPED（與 useLocalServer 同序：建構後立刻設定 layout）
    const gen = await ev("return Promise.all(['LogicEngine.js','data/roster.js','data/heroDatabase.js','battle/moba/skills/heroSkillGameplay.js','battle/moba/mobaHeroProfile.js','battle/moba/mobaHeroLoadout.js','data/heroCombatArchetypes.js','platform/contracts/MobaTacticConfig.js','battle/moba/items/buildStrategyPrep.js','battle/moba/replay/replayBuffer.js'].map(p=>import('" + base + "'+p))).then(([LE,RO,HD,SK,HP,LO,AR,TC,IT,RB])=>{"
      + "const matchId=RB.getCurrentReplay().matchId;"
      + "const roster=Object.fromEntries(Object.entries(RO.ROSTER).map(([s,r])=>[s,Object.assign({},r)]));"
      + "for(const [s,row] of Object.entries(LO.buildLoadout(roster,HD.heroById))) roster[s].spells=row.spells;"
      + "const e=new LE.LogicEngine(" + SEED + ",null); const okL=e.configureObjectiveLayout('SWAPPED');"
      + "e.configureHeroes(HP.toEngineHeroMods(roster,HD.heroById)); e.configureHeroSkills(SK.toEngineHeroSkills(roster,null));"
      + "const am=AR.toEngineArchetypes(roster),blue={},red={}; for(const [pid,v] of Object.entries(am)) (pid[0]==='r'?red:blue)[pid]=v;"
      + "e.configureArchetypes({blue,red,meta:{version:'owner',seats:10}}); e.configureSpells(LO.toEngineSpells(roster));"
      + "e.configureMatch({blue:TC.toEngineTactic(TC.STANDARD_OPP_TACTIC),red:TC.toEngineTactic(TC.STANDARD_OPP_TACTIC),meta:{tacticId:'std'}});"
      + "e.configureItems(IT.matchItemsConfig({roster,heroLookup:HD.heroById,buildStrategy:'standard'}));"
      //  前置：物件面板只在已有團隊物件狀態（teamBuffs）時出現 ⇒ 取「第二次巨龍刷新」（已有龍層、巨龍仍存活）
      + "RB.beginReplayCapture({seed:" + SEED + ",config:{},roster,objectiveLayout:'SWAPPED'}); let spawnT=null,spawns=0,was=false;"
      + "for(let i=0;i<7200&&!e.over;i++){e.tick(0.5); RB.captureReplayFrame(e.snapshot()); const a=e.neutrals.dragon.alive; if(a&&!was){spawns++; if(spawns===2&&spawnT===null) spawnT=e.t;} was=a;}"
      + "const r=RB.finalizeReplay({matchId,events:[]});"
      + "return JSON.stringify({okL,matchId,spawnT,spawns,frames:r?r.frames.length:0,layout:r&&r.objectiveLayout});});");
    ck(`R1 頁面內正式引擎 SWAPPED 跑 seed ${SEED} 並產生正式 replay（replay.objectiveLayout＝SWAPPED）`,
      gen?.okL === true && gen.frames > 0 && gen.layout === "SWAPPED" && gen.spawnT !== null, JSON.stringify(gen));
    if (!gen?.spawnT) return;
    await ev("[...document.querySelectorAll('button')].find(b=>/觀看重播/.test(b.innerText||'')).click(); return JSON.stringify(1);");
    let opened = false;
    for (let i = 0; i < 90 && !opened; i++) { await sleep(1000); opened = !!(await ev("return JSON.stringify(!!document.querySelector('[data-testid=replay-play-toggle]') && !document.querySelector('[data-testid=rift-entry-loading]'));")); }
    ck("S2 重播開啟、地圖載入", opened);
    if (!opened) return;
    const seekTo = async (t) => {
      await ev("const btn=document.querySelector('[data-testid=replay-play-toggle]'); if(btn&&/暫停/.test(btn.innerText||'')) btn.click(); return JSON.stringify(1);");
      await ev("const s=document.querySelector('input[aria-label=\"重播時間軸\"]'); const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; set.call(s," + t + "); s.dispatchEvent(new Event('input',{bubbles:true})); s.dispatchEvent(new Event('change',{bubbles:true})); return JSON.stringify(Number(s.value));");
      await sleep(1800);
    };
    const at = Math.ceil(gen.spawnT) + 8;
    await seekTo(at);
    const rp = await ev("return " + EXPECT + ";");
    await shot("12-objective-layout-swapped-replay-desktop");
    const swappedOk = (p) => p?.layout === "SWAPPED" && p.markerLayout === "SWAPPED" && p.markerErr.dragon < 0.01 && p.markerErr.baron < 0.01
      && !!p.dragonBoss && p.dragonBoss.toTop < p.dragonBoss.toBot && p.panel;
    ck("R2 重播 SWAPPED：frame／標記 layout＝SWAPPED、巨龍標記在上方坑、巨龍 boss 在上方坑、物件面板存在", swappedOk(rp), JSON.stringify({ at, ...rp }));
    await chrome.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await sleep(1500); await seekTo(at + 1);
    const mp = await ev("return " + EXPECT + ";");
    await shot("12-objective-layout-swapped-replay-mobile");
    ck("R3 390 手機同一時刻：同上且無橫向溢出", swappedOk(mp) && mp.over <= 0, JSON.stringify(mp));
    const errs = chrome.pageErrors ?? [];
    ck("E1 page error 0", errs.length === 0, errs.slice(0, 3).join(" ¦ "));
    const consoleErrs = (chrome.consoleLines ?? []).filter((l) => l.startsWith("[error]"));
    const shaderErrs = (chrome.consoleLines ?? []).filter((l) => /shader|WebGL.*error|THREE\.WebGLProgram/i.test(l));
    ck("E2 console error 0、shader error 0", consoleErrs.length === 0 && shaderErrs.length === 0, [...consoleErrs, ...shaderErrs].slice(0, 3).join(" ¦ "));
  },
});
finishGate(result);
