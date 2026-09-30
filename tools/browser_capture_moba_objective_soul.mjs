#!/usr/bin/env node
// ============================================================================
//  tools/browser_capture_moba_objective_soul.mjs — Owner Review：龍魂畫面（v16）
//
//  執行：node tools/browser_capture_moba_objective_soul.mjs [--seed=1]
//  為什麼需要這支：除錯對戰頁的 seed 刻意不可覆寫（O6：seed 只來自一次性場次令牌），
//  龍魂只在約 39% 的對局出現，瀏覽器內又要跑 15 分鐘以上才會發生。
//  做法（全部走正式路徑，不造假）：
//    1. 開一場正式對戰（debug 頁）→ 快速完成 → 結算畫面
//    2. 在同一頁用**正式 LogicEngine**（預設 ROSTER＋正式設定）跑 seed N，逐 tick 餵**正式 replayBuffer**，
//       以本場 matchId finalize ⇒ 結算畫面的「觀看重播」讀到的是這份 replay
//    3. 開重播 → seek 到龍魂之後 ⇒ 檢查物件面板 soul＝1、小兵紫環實例數 > 0 → 桌機／手機截圖
//  ⚠ 只給 Owner Review 截圖與一致性確認；seed 預設 1（Node 實測藍方 916 秒取得龍魂）。
//  ⚠ chrome.evaluate 的字串裡不能有反引號。
// ============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { runGate, finishGate } from "./browser/harness.mjs";

const OUT = process.env.ESMO_REVIEW_OUT ?? "review/moba-objective-v16/owner";
mkdirSync(OUT, { recursive: true });
const SEED = Number(process.argv.find((a) => a.startsWith("--seed="))?.slice(7) ?? 1);

const result = await runGate({
  name: "Owner Review：龍魂畫面（v16）",
  timeoutMs: 1500000,
  async run({ chrome, url, ck, sleep }) {
    const ev = async (body) => { const r = String(await chrome.evaluate(body)); for (const t of [r, r.replace(/^"|"$/g, "")]) { try { return JSON.parse(t); } catch { /* next */ } } return null; };
    const HIDE = "const up=(el)=>{let n=el,i=0;while(n&&i<8){const p=getComputedStyle(n).position;if((p==='absolute'||p==='fixed')&&n!==document.body)return n;n=n.parentElement;i++;}const t=el.closest('table');return t?t.parentElement:null;};"
      + "[...document.querySelectorAll('strong')].filter(s=>(s.textContent||'').startsWith('Android WebGL')).forEach(s=>{const b=up(s);if(b)b.style.display='none';});"
      + "[...document.querySelectorAll('th')].filter(t=>(t.textContent||'')==='避碰修正').forEach(t=>{const b=up(t);if(b)b.style.display='none';});return JSON.stringify(1);";
    const shot = async (name) => { await chrome.evaluate(HIDE); const s = await chrome.send("Page.captureScreenshot", { format: "png" }); writeFileSync(`${OUT}/${name}.png`, Buffer.from(s.data, "base64")); };
    const base = new URL(url.endsWith("/") ? url : url + "/").pathname + "src/";
    await chrome.send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    await chrome.navigate(`${url}?debug=moba-runtime-battle&shot=soul&waitTs=5&quality=low`);
    let ready = false;
    for (let i = 0; i < 200 && !ready; i++) { await sleep(1500); ready = String(await chrome.evaluate("return JSON.stringify(window.__BATTLE_SHOT_READY || null);")).includes("soul"); }
    ck("S0 戰鬥開始", ready);
    if (!ready) return;
    await chrome.evaluate("window.confirm = () => true; return JSON.stringify(1);");
    await ev("const b=document.querySelector('[data-testid=quick-finish-match]'); if(b) b.click(); return JSON.stringify(!!b);");
    let atResult = false;
    for (let i = 0; i < 240 && !atResult; i++) { await sleep(1000); atResult = !!(await ev("return JSON.stringify(!![...document.querySelectorAll('button')].find(b=>/觀看重播/.test(b.innerText||'')));")); }
    ck("S1 快速完成後到結算畫面", atResult);
    if (!atResult) return;
    //  在頁面內用正式引擎跑 seed，逐 tick 擷取（與 useLocalServer 同一組 configure 順序）
    const gen = await ev("return Promise.all(['LogicEngine.js','data/roster.js','data/heroDatabase.js','battle/moba/skills/heroSkillGameplay.js','battle/moba/mobaHeroProfile.js','battle/moba/mobaHeroLoadout.js','data/heroCombatArchetypes.js','platform/contracts/MobaTacticConfig.js','battle/moba/items/buildStrategyPrep.js','battle/moba/replay/replayBuffer.js'].map(p=>import('" + base + "'+p))).then(([LE,RO,HD,SK,HP,LO,AR,TC,IT,RB])=>{"
      + "const matchId=RB.getCurrentReplay().matchId;"
      + "const roster=Object.fromEntries(Object.entries(RO.ROSTER).map(([s,r])=>[s,Object.assign({},r)]));"
      + "for(const [s,row] of Object.entries(LO.buildLoadout(roster,HD.heroById))) roster[s].spells=row.spells;"
      + "const e=new LE.LogicEngine(" + SEED + ",null);"
      + "e.configureHeroes(HP.toEngineHeroMods(roster,HD.heroById)); e.configureHeroSkills(SK.toEngineHeroSkills(roster,null));"
      + "const am=AR.toEngineArchetypes(roster),blue={},red={}; for(const [pid,v] of Object.entries(am)) (pid[0]==='r'?red:blue)[pid]=v;"
      + "e.configureArchetypes({blue,red,meta:{version:'owner',seats:10}}); e.configureSpells(LO.toEngineSpells(roster));"
      + "e.configureMatch({blue:TC.toEngineTactic(TC.STANDARD_OPP_TACTIC),red:TC.toEngineTactic(TC.STANDARD_OPP_TACTIC),meta:{tacticId:'std'}});"
      + "e.configureItems(IT.matchItemsConfig({roster,heroLookup:HD.heroById,buildStrategy:'standard'}));"
      + "RB.beginReplayCapture({seed:" + SEED + ",config:{},roster}); let soulT=null;"
      + "for(let i=0;i<7200&&!e.over;i++){e.tick(0.5); RB.captureReplayFrame(e.snapshot()); if(soulT===null&&(e.fsm3.blue.dragonStacks>=4||e.fsm3.red.dragonStacks>=4)) soulT=e.t;}"
      + "const r=RB.finalizeReplay({matchId,events:[]});"
      + "return JSON.stringify({matchId,soulT,frames:r?r.frames.length:0,end:e.t,objEvents:(r&&r.objectiveEvents||[]).length});});");
    ck(`S2 頁面內以正式引擎跑 seed ${SEED} 並產生正式 replay（有龍魂）`, !!gen && gen.frames > 0 && gen.soulT !== null, JSON.stringify(gen));
    if (!gen?.soulT) return;
    await ev("[...document.querySelectorAll('button')].find(b=>/觀看重播/.test(b.innerText||'')).click(); return JSON.stringify(1);");
    let opened = false;
    for (let i = 0; i < 90 && !opened; i++) { await sleep(1000); opened = !!(await ev("return JSON.stringify(!!document.querySelector('[data-testid=replay-play-toggle]') && !document.querySelector('[data-testid=rift-entry-loading]'));")); }
    ck("S3 重播開啟、地圖載入", opened);
    if (!opened) return;
    const seekTo = async (t) => {
      await ev("const btn=document.querySelector('[data-testid=replay-play-toggle]'); if(btn&&/暫停/.test(btn.innerText||'')) btn.click(); return JSON.stringify(1);");
      await ev("const s=document.querySelector('input[aria-label=\"重播時間軸\"]'); const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; set.call(s," + t + "); s.dispatchEvent(new Event('input',{bubbles:true})); s.dispatchEvent(new Event('change',{bubbles:true})); return JSON.stringify(Number(s.value));");
      await sleep(1500);
    };
    const probe = () => ev("const t=(side)=>{const el=document.querySelector('[data-testid=objective-team-'+side+']'); return el?{stacks:Number(el.getAttribute('data-dragon-stacks')),soul:el.getAttribute('data-soul')==='1'}:null;};"
      + "const d=window.__ESMO_RUNTIME_DIAG?window.__ESMO_RUNTIME_DIAG():null; return JSON.stringify({blue:t('blue'),red:t('red'),rings:d?d.minionRings:null});");
    const at = Math.ceil(gen.soulT) + 12;
    await seekTo(at);
    const p = await probe();
    await shot("04-dragon-soul-replay-desktop");
    ck("S4 重播 seek 到龍魂之後 ⇒ 物件面板龍魂徽章＋4 層；小兵紫環實例數 > 0", (p?.blue?.soul || p?.red?.soul) && (p?.blue?.stacks === 4 || p?.red?.stacks === 4)
      && (p?.rings?.soul ?? 0) > 0, JSON.stringify({ at, ...p }));
    await chrome.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await sleep(1500);
    await seekTo(at + 1);
    await shot("10-dragon-soul-replay-mobile");
    const pm = await probe();
    ck("S5 手機寬度同一時刻龍魂徽章仍正確", !!(pm?.blue?.soul || pm?.red?.soul), JSON.stringify(pm));
    const errs = chrome.pageErrors ?? [];
    ck("E1 page error 0", errs.length === 0, errs.slice(0, 3).join(" ¦ "));
  },
});
finishGate(result);
