#!/usr/bin/env node
// CS-C5V browser smoke：中文 UI、Practice 三圖、matchmaking intersection、BO1/BO3、390px、Battle handoff。
import { launchChrome } from "./browser/cdp.mjs";
import fs from 'node:fs';
import path from 'node:path';

const APP = process.env.C5V_PREVIEW_URL ?? "http://127.0.0.1:5187/ESMO-/";
const CDP_PORT = 9487;
const KEY = "esmo.profile.v1";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const waitFor = async (chrome, expression, timeoutMs, label) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { if (await chrome.evaluate(`return Boolean(${expression});`)) return; } catch {}
    await sleep(200);
  }
  throw new Error(`${label} timeout`);
};
const click = async (chrome, selector, label) => {
  const result = await chrome.evaluate(`
    const node=document.querySelector(${JSON.stringify(selector)});
    if(!node||node.disabled)return {ok:false,html:document.body.innerText.slice(0,1200)};
    node.click(); return {ok:true,text:node.innerText};
  `);
  if (!result?.ok) throw new Error(`${label}: ${JSON.stringify(result)}`);
};
const readSaved = (chrome) => chrome.evaluate(`return JSON.parse(localStorage.getItem(${JSON.stringify(KEY)})||"null")`);

let LS = null;
globalThis.localStorage = {
  getItem: (key) => (key === KEY ? LS : null),
  setItem: (key, value) => { if (key === KEY) LS = value; },
  removeItem: () => { LS = null; },
};
const { useProfileStore } = await import("../src/platform/profileStore.js");
const { csMajorFixturesOf, regularFixturesOf } = await import("../src/platform/competition/seasonState.js");
const { isFixtureTerminal } = await import("../src/platform/contracts/competition.js");
const st = () => useProfileStore.getState();

const freshSave = ({ practiceMapKey = "mirage", acceptedPool = ["dust2", "mirage", "inferno"] } = {}) => {
  st().startNewGame("standard");
  st().autoFillLineup("cs");
  st().setCsPracticeMap(practiceMapKey);
  st().setCsAcceptedMapPool(acceptedPool);
  st().save();
  return JSON.parse(LS);
};

let fixtureClock = 1_000;
const driveFixtureToLaunch = () => {
  for (let i = 0; i < 20; i += 1) {
    fixtureClock += 1500;
    st().pollMatchRoom(fixtureClock);
    const room = st().matchmaking?.room;
    if (room?.state === "ready_check" && !room.confirmations?.us) st().confirmMatchReady(fixtureClock + 1);
    if (st().matchmaking?.room?.state === "confirmed") break;
  }
  st().createMatchSession(fixtureClock + 10);
  st().launchMatchSession(fixtureClock + 20);
};

const officialSave = (format, skip = 0, declaredMap = null) => {
  freshSave();
  st().ensureCompetitionSeason("cs");
  let fixture = null;
  if (format === "bo1") {
    for (let i = 0; i < 120 && !fixture; i += 1) {
      fixture = st().competitionView("cs").today;
      if(fixture&&skip>0){st().forfeitFixture(fixture.id);fixture=null;skip--;}
      if (!fixture) st().advanceDay(1);
    }
  } else {
    for (let i = 0; i < 400; i += 1) {
      const cs = st().competitionByMode.cs;
      if (regularFixturesOf(cs).length && regularFixturesOf(cs).every(isFixtureTerminal)) break;
      const view = st().competitionView("cs");
      if (view.today) st().forfeitFixture(view.today.id);
      else if ((st().advanceDay(1).daysAdvanced ?? 0) <= 0) break;
    }
    const cs = st().competitionByMode.cs;
    const semifinal = csMajorFixturesOf(cs).find((item) => item.playoffKey === "sf1");
    const swap = (stage) => ({ ...stage, participants: [
      { id: cs.playerTeamId, name: "我的戰隊", tag: "ME", isAi: false },
      ...stage.participants.slice(1),
    ] });
    const patched = {
      ...cs,
      fixtures: cs.fixtures.map((item) => (item.id === semifinal.id ? { ...item, sideA: cs.playerTeamId } : item)),
      competitions: Object.fromEntries(Object.entries(cs.competitions).map(([key, entry]) => [key,
        entry.stage?.id === semifinal.stageId
          ? { ...entry, stage: swap(entry.stage), playoff: { ...entry.playoff, stage: swap(entry.playoff.stage) } }
          : entry])),
    };
    st()._setCompetitionStateFor("cs", patched);
    fixture = patched.fixtures.find((item) => item.id === semifinal.id);
  }
  fixtureClock += 10_000;
  if(declaredMap){const cs=st().competitionByMode.cs;st()._setCompetitionStateFor('cs',{...cs,fixtures:cs.fixtures.map(f=>f.id===fixture.id?{...f,matchFormat:{...f.matchFormat,mapPool:[declaredMap]}}:f)});}
  const started = st().startFixtureMatch(fixture.id, fixtureClock);
  if (!started.ok) throw new Error(`fixture ${format} start failed: ${started.reason}`);
  driveFixtureToLaunch();
  st().save();
  return { fixtureId: fixture.id, save: JSON.parse(LS) };
};

const baseSaves = {
  dust2: freshSave({ practiceMapKey: "dust2" }),
  mirage: freshSave({ practiceMapKey: "mirage" }),
  inferno: freshSave({ practiceMapKey: "inferno" }),
  general: freshSave(),
  bo1: officialSave("bo1"),
  bo3: officialSave("bo3"),
  bo1next: officialSave('bo1',1),
  bo1confluence:officialSave('bo1',0,'mirage'),
  bo1dune:officialSave('bo1',0,'dust2'),
};

let pass = 0;
let fail = 0;
const evidence = { practice: [], general: null, bo1: null, bo3: null, errors: [] };
const ck = (name, ok, detail = "") => {
  if (ok) { pass += 1; console.log(`PASS ${name}${detail ? `　${detail}` : ""}`); }
  else { fail += 1; console.log(`FAIL ${name}${detail ? `　${detail}` : ""}`); }
};

const inject = async (chrome, save, viewport = { width: 1280, height: 900, mobile: false }) => {
  await chrome.send("Emulation.setDeviceMetricsOverride", { ...viewport, deviceScaleFactor: 1 });
  await chrome.navigate(APP);
  await chrome.evaluate(`localStorage.setItem(${JSON.stringify(KEY)},${JSON.stringify(JSON.stringify(save))});sessionStorage.clear();return true;`);
  await chrome.reload();
  await waitFor(chrome, `document.querySelector('[data-testid="home-mode-cs"]')||document.querySelector('[data-testid="resume-active-match"]')`, 30_000, "dashboard");
};

const enterCsPrep = async (chrome) => {
  await click(chrome, '[data-testid="home-mode-cs"]', "CS entry");
  await waitFor(chrome, `document.querySelector('[data-testid="prep-primary-action"]')`, 30_000, "CS prep");
};

const waitReadyAndConfirm = async (chrome) => {
  await waitFor(chrome, `document.querySelector('[data-testid="prep-primary-action"]')?.dataset.action==="confirm"||document.querySelector('[data-testid="cs-map-selection-kind"]')`, 60_000, "ready check");
  const action = await chrome.evaluate(`return document.querySelector('[data-testid="prep-primary-action"]')?.dataset.action||null`);
  if (action === "confirm") await click(chrome, '[data-testid="prep-primary-action"]', "ready confirm");
  await waitFor(chrome, `document.querySelector('[data-testid="cs-map-selection-kind"]')`, 45_000, "map screen");
};

const enterBattleFromMap = async (chrome) => {
  if(process.env.C5V_CAPTURE_ARGS==='1')await chrome.evaluate(`if(!window.__csWorkerObserver){window.__csWorkerObserver=true;window.__csWorkerEvents=[];const original=Worker.prototype.postMessage;Worker.prototype.postMessage=function(message,...rest){if(Array.isArray(message?.args)){window.__csWorkerArgs=structuredClone(message.args);window.__csWorkerEvents.push({type:'sent',at:performance.now()});this.addEventListener('message',e=>window.__csWorkerEvents.push({type:'received',at:performance.now(),ok:e.data?.ok,ms:e.data?.ms,frames:e.data?.sim?.frames?.length}));this.addEventListener('error',e=>window.__csWorkerEvents.push({type:'error',message:e.message}));}return original.call(this,message,...rest);};}return true;`);
  await click(chrome, '[data-testid="cs-map-confirm"]', "map confirm");
  await waitFor(chrome, `document.querySelector('[data-testid="cs-tactic-confirm"]')`, 30_000, "tactic screen");
  await click(chrome, '[data-testid="cs-tactic-confirm"]', "tactic confirm");
  try{await waitFor(chrome, `document.querySelector('[data-testid="cs-match-speed-controls"]')`, 45_000, "Battle");}catch(error){if(process.env.C5V_DIAG_WAIT!=='1')throw error;console.error('DIAGNOSTIC_ONLY original 45s gate failed: '+error.message);await waitFor(chrome,`document.querySelector('[data-testid="cs-match-speed-controls"]')`,90000,'diagnostic only extended observation');throw error;}
};

let chrome = null;
try {
  chrome = await launchChrome({ url: APP, port: CDP_PORT, headless: true });
  const dialogs=[];
  chrome.on('Page.javascriptDialogOpening',dialog=>{dialogs.push({type:dialog.type,message:dialog.message});if(dialog.type==='confirm'&&dialog.message.includes('快速完成本場'))void chrome.send('Page.handleJavaScriptDialog',{accept:true});});
  for (const mapKey of (process.env.C5V_ONLY_OFFICIAL==='1'?[]:["dust2", "mirage", "inferno"])) {
    const mobile = mapKey === "inferno";
    await inject(chrome, baseSaves[mapKey], mobile
      ? { width: 390, height: 844, mobile: true }
      : { width: 1280, height: 900, mobile: false });
    await enterCsPrep(chrome);
    ck(`Practice ${mapKey} 賽前直選按鈕存在`, await chrome.evaluate(`return document.querySelector('[data-testid="cs-practice-map-${mapKey}"]')?.getAttribute('aria-pressed')==="true"`));
    await click(chrome, '[data-testid="prep-start-practice"]', `start ${mapKey} practice`);
    await waitReadyAndConfirm(chrome);
    ck(`Practice ${mapKey} Session selection 呈現正確`, await chrome.evaluate(`return document.querySelector('[data-map-key="${mapKey}"]')?.dataset.vetoState==="selected"`));
    await enterBattleFromMap(chrome);
    const saved = await readSaved(chrome);
    const viewport = await chrome.evaluate(`return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,text:document.body.innerText.slice(0,500)}`);
    ck(`Practice ${mapKey} 正確傳入 Battle`, saved.matchmaking.session.activeMatch.config.csConfig.mapKey === mapKey
      && viewport.text.toLowerCase().includes(mapKey === "dust2" ? "dust ii" : mapKey));
    if (mobile) ck("390px 選圖到 Battle 無頁面橫向溢出", viewport.width === 390 && !viewport.overflow);
    evidence.practice.push({ mapKey, viewport, config: saved.matchmaking.session.activeMatch.config.csConfig });
  }

  if(process.env.C5V_ONLY_OFFICIAL!=='1'){
  await inject(chrome, baseSaves.general);
  await enterCsPrep(chrome);
  ck("一般對戰三圖 pool checkbox 中文 UI 可見", await chrome.evaluate(`return ["dust2","mirage","inferno"].every(k=>document.querySelector('[data-testid="cs-map-pool-' + k + '"]'))`));
  await click(chrome, '[data-testid="prep-primary-action"]', "general enqueue");
  await waitReadyAndConfirm(chrome);
  ck("一般配對顯示雙方地圖池交集", await chrome.evaluate(`return Boolean(document.querySelector('[data-testid="cs-matchmaking-map-intersection"]'))`));
  const generalSaved = await readSaved(chrome);
  const generalSelection = generalSaved.matchmaking.session.mapSelection;
  ck("一般配對 final map 屬於雙方交集", generalSelection.commonPool.includes(generalSelection.finalMapKey)
    && generalSelection.playerPool.includes(generalSelection.finalMapKey)
    && generalSelection.opponentPool.includes(generalSelection.finalMapKey));
  evidence.general = generalSelection;
  }

  for (const scenario of (process.env.C5V_EXPANDED==='1'?['bo1','bo1confluence','bo1dune','bo3']:process.env.C5V_ONLY_BO1==='1'?["bo1"]:["bo1", "bo3"])) {
    const format=scenario==='bo3'?'bo3':'bo1';
    await inject(chrome, baseSaves[scenario] .save, format === "bo1"
      ? { width: 390, height: 844, mobile: true }
      : { width: 1280, height: 900, mobile: false });
    await click(chrome, '[data-testid="resume-active-match"]', `${format} resume`);
    await waitFor(chrome, `document.querySelector('[data-testid="cs-veto-progress"]')`, 30_000, `${format} veto UI`);
    if(process.env.C5V_ORIGINAL_POOL==='1'){
      await click(chrome,'[data-testid="cs-original-competition-pool"]','original pool opt in');
      await waitFor(chrome,`document.body.innerText.includes('本系列測試地圖池')`,10000,'original pool visible precondition');
    }
    ck(`${format.toUpperCase()} 中文 Veto UI 可見`, await chrome.evaluate(`return document.body.innerText.includes("地圖 Veto")&&document.body.innerText.includes("Ban")`));
    for (let guard = 0; guard < 4; guard += 1) {
      const resolved = await chrome.evaluate(`return !document.querySelector('[data-testid="cs-map-confirm"]')?.disabled`);
      if (resolved) break;
      const result = await chrome.evaluate(`
        const choices=[...document.querySelectorAll('[data-map-key]')].filter(x=>!x.disabled);const node=${scenario==='bo1alternate'?'choices.at(-1)':'choices[0]'};
        if(!node)return false;node.click();return true;
      `);
      if (!result) break;
      await sleep(200);
    }
    await waitFor(chrome, `!document.querySelector('[data-testid="cs-map-confirm"]')?.disabled`, 10_000, `${format} resolved`);
    let saved = await readSaved(chrome);
    const selection = saved.matchmaking.session.mapSelection;
    ck(`${format.toUpperCase()} Veto resolved 寫入同一 Session`, selection.status === "resolved"
      && saved.matchmaking.session.activeMatch.config.csConfig.mapKey);
    if (format === "bo1") {
      if(['bo1confluence','bo1dune'].includes(scenario))ck(`${scenario} declared single-map fixture respected`,selection.mapPool.length===1&&selection.finalMapKey===(scenario==='bo1dune'?'dust2':'mirage'));
      else ck("BO1 雙方輪流 Ban，最後剩餘地圖為比賽地圖", selection.banned.length === 2
        && new Set(selection.banned.map((entry) => entry.side)).size === 2
        && selection.finalMapKey === selection.remaining[0]);
      ck("390px BO1 Veto 無頁面橫向溢出", await chrome.evaluate(`return innerWidth===390&&document.documentElement.scrollWidth<=innerWidth+1`));
    } else {
      ck("BO3 顯示 Pick → Pick → Decider 順序", await chrome.evaluate(`return Boolean(document.querySelector('[data-testid="cs-bo3-map-order"]'))`)
        && selection.mapOrder.length === 3 && new Set(selection.mapOrder).size === 3);
      ck("BO3 三圖池明確說明 Ban 自動略過", selection.notes.some((note) => note.includes("Ban")));
    }
    const signature = JSON.stringify({ log: selection.log, finalMapKey: selection.finalMapKey, mapOrder: selection.mapOrder });
    await chrome.reload();
    await waitFor(chrome, `document.querySelector('[data-testid="resume-active-match"]')`, 30_000, `${format} reload resume`);
    await click(chrome, '[data-testid="resume-active-match"]', `${format} reload resume click`);
    await waitFor(chrome, `document.querySelector('[data-testid="cs-map-confirm"]')`, 30_000, `${format} restored map`);
    saved = await readSaved(chrome);
    const restored = saved.matchmaking.session.mapSelection;
    ck(`${format.toUpperCase()} reload / resume 不重擲 Veto`, signature === JSON.stringify({ log: restored.log, finalMapKey: restored.finalMapKey, mapOrder: restored.mapOrder }));
    if(process.env.C5V_ORIGINAL_POOL!=='1')evidence[format] = restored;
    if(process.env.C5V_ORIGINAL_POOL==='1'){
      ck(`${format} original pool snapshot survives reload`,restored.competitionPoolId==='original-v1'&&Object.keys(restored.competitionPoolSnapshot||{}).length===3);
      if(format==='bo3')ck('BO3 order chips use original map identities',await chrome.evaluate(`const text=document.querySelector('[data-testid="cs-bo3-map-order"]')?.innerText??'';return ['Confluence Station','Dune Terminal','Foundry Circuit'].every(name=>text.includes(name))&&!/Dust II|Inferno|Mirage/.test(text);`));
      if(process.env.C5V_SCREENSHOT_DIR&&['bo1','bo3'].includes(scenario)){const shot=await chrome.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(`${process.env.C5V_SCREENSHOT_DIR}/${scenario}-original-pool.png`,Buffer.from(shot.data,'base64'),{flag:'wx'});}
      const completedMaps=[];
      for(let mapIndex=0;mapIndex<(format==='bo3'?3:1);mapIndex++){
      await enterBattleFromMap(chrome);
      const launched=await readSaved(chrome),config=launched.matchmaking.session.activeMatch.config.csConfig;
      ck(`${format} original scene is authoritative config`,['major.v3','major.v4','major.v5'].includes(config.sceneVersion));
      await waitFor(chrome,`!document.querySelector('[data-testid="fps-map-preparing"]')&&[...document.querySelectorAll('button')].some(b=>b.innerText.includes('快速完成'))`,90000,'scene and finish ready');
      if(process.env.C5V_BATTLE_RELOAD==='1'&&scenario==='bo1'&&mapIndex===0){
        const prior=await readSaved(chrome);
        await chrome.reload();await waitFor(chrome,`document.querySelector('[data-testid="resume-active-match"]')`,30000,'live battle resume prompt');await click(chrome,'[data-testid="resume-active-match"]','resume live official match');
        await waitFor(chrome,`document.querySelector('[data-testid="cs-match-speed-controls"]')&&!document.querySelector('[data-testid="fps-map-preparing"]')`,90000,'restored real scene ready');
        const resumed=await readSaved(chrome);ck('live battle reload retains session / scene / opponent',resumed.matchmaking.session.sessionId===prior.matchmaking.session.sessionId&&JSON.stringify(resumed.matchmaking.session.activeMatch.config.csConfig.opponentSnapshot)===JSON.stringify(prior.matchmaking.session.activeMatch.config.csConfig.opponentSnapshot)&&resumed.matchmaking.session.activeMatch.config.csConfig.sceneVersion===config.sceneVersion);
      }
      if(process.env.C5V_REPLAY_FIXTURES==='1'){
        const files={'major.v3':'review/cs-major-upgrade/evidence/cs-map-v2-release-gate-20261107/performance-r1/confluence-match.replay.json.gz','major.v4':'review/cs-major-upgrade/evidence/cs-map-v2-release-gate-20261107/performance-r1/dune-match.replay.json.gz','major.v5':'review/cs-major-upgrade/evidence/foundry-20261024/match-foundry-execute-b-830102-r14.replay.json.gz'};
        await chrome.evaluate(`document.querySelector('.fps-major-replay summary').click();return true;`);
        const doc=await chrome.send('DOM.getDocument'),node=await chrome.send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'[data-testid="cs-replay-import"]'});
        await chrome.send('DOM.setFileInputFiles',{nodeId:node.nodeId,files:[path.resolve(files[config.sceneVersion])]});
        await waitFor(chrome,`document.querySelector('[data-testid="cs-replay-mode"]')&&!document.querySelector('[data-testid="fps-map-preparing"]')`,60000,'saved frame replay ready');
        await click(chrome,'[data-testid="cs-replay-exit"]','return original match');
        await waitFor(chrome,`!document.querySelector('[data-testid="cs-replay-mode"]')&&!document.querySelector('[data-testid="fps-map-preparing"]')`,60000,'original match ready again');
        const replayReturn=await readSaved(chrome);ck(`${scenario} replay returns to same official session`,replayReturn.matchmaking.session.sessionId===launched.matchmaking.session.sessionId&&replayReturn.matchmaking.session.activeMatch.config.csConfig.sceneVersion===config.sceneVersion);
      }
      await chrome.evaluate(`const b=[...document.querySelectorAll('button')].find(b=>b.innerText.includes('快速完成'));if(!b)throw Error('finish missing');b.click();return true;`);
      ck(`${format} native quick-finish confirmation handled`,dialogs.some(d=>d.type==='confirm'&&d.message.includes('快速完成本場')));
      await waitFor(chrome,`[...document.querySelectorAll('button')].some(b=>b.innerText.includes('查看賽後戰報'))`,45000,'true result ready');
      await chrome.evaluate(`const b=[...document.querySelectorAll('button')].find(b=>b.innerText.includes('查看賽後戰報'));b.click();return true;`);
      await waitFor(chrome,`document.querySelector('[data-testid="cs-professional-report"]')`,45000,'true simulation result report');
      ck(`${format} real report has original map name`,await chrome.evaluate(`return ['Confluence Station','Dune Terminal','Foundry Circuit'].some(n=>document.body.innerText.includes(n))`));
      const after=await readSaved(chrome),history=after.csHistory||[],last=history[0];
      ck(`${scenario} actual history identity`,last?.sceneVersion===config.sceneVersion&&last?.mapIdentity?.mapKey===config.mapKey);
      ck(`${scenario} true result creates settlement transaction`,Object.keys(after.processedMatchTransactions||{}).length>Object.keys(launched.processedMatchTransactions||{}).length);
      if(process.env.C5V_CANONICAL_OPPONENT==='1'){
        const opponent=after.matchmaking?.session?.activeMatch?.config?.csConfig?.opponentSnapshot;
        ck(`${scenario} declared opponent name and actual roster match`,opponent?.teamId===launched.matchmaking.session.opponent.id&&last?.oppName===opponent?.name&&last?.opponents?.length===5&&last.opponents.every(p=>opponent.actors.some(a=>a.name===p.playerName)));
      }
      completedMaps.push({key:config.mapKey,scene:config.sceneVersion,matchId:last?.matchId,score:[last?.ourScore,last?.enemyScore]});
      const series=after.matchmaking?.session?.series;
      if(format!=='bo3'||series?.decided||series?.status==='decided')break;
      if(mapIndex===2)break;
      await chrome.evaluate(`const b=[...document.querySelectorAll('button')].find(b=>b.innerText==='返回 Dashboard');if(!b)throw Error('return missing');b.click();return true;`);
      await waitFor(chrome,`document.querySelector('[data-testid="cs-map-confirm"]')`,15000,'next series map');
      }
      ck(`${scenario} series maps unique`,new Set(completedMaps.map(m=>m.key)).size===completedMaps.length);
      evidence[scenario]={selection:restored,completedMaps};
      const beforeReload=await readSaved(chrome),receiptIds=Object.keys(beforeReload.processedMatchTransactions||{}),historyIds=(beforeReload.csHistory||[]).map(r=>r.matchId);
      ck(`${scenario} exactly one official fixture outcome`,(beforeReload.competitionByMode.cs.outcomes||[]).filter(o=>o.fixtureId===baseSaves[scenario].fixtureId).length===1);
      if(format==='bo3'){const final=beforeReload.matchmaking?.session?.series;ck('BO3 true series reaches two wins',final?.status==='decided'&&Math.max(final.wins.us,final.wins.opponent)===2&&completedMaps.length>=2);}
      await chrome.reload();await waitFor(chrome,`document.querySelector('[data-testid="home-mode-cs"]')||document.querySelector('[data-testid="resume-active-match"]')`,30000,'post settlement reload');
      const afterReload=await readSaved(chrome);
      ck(`${scenario} reward and history reload idempotent`,JSON.stringify(receiptIds)===JSON.stringify(Object.keys(afterReload.processedMatchTransactions||{}))&&JSON.stringify(historyIds)===JSON.stringify((afterReload.csHistory||[]).map(r=>r.matchId)));
    }
  }

  evidence.errors = {
    console: chrome.consoleLines.filter((line) => line.startsWith("[error]")),
    page: chrome.pageErrors,
  };
  if(process.env.C5V_EXPANDED==='1')ck('BO1 original three-map coverage',new Set(['bo1','bo1confluence','bo1dune'].flatMap(k=>evidence[k]?.completedMaps?.map(m=>m.key)||[])).size===3);
  ck("Browser console / page errors = 0", evidence.errors.console.length === 0 && evidence.errors.page.length === 0,
    JSON.stringify(evidence.errors));
} catch (error) {
  fail += 1;
  if(chrome){try{evidence.failure={text:await chrome.evaluate('return document.body.innerText.slice(0,2500)'),workerEvents:await chrome.evaluate('return window.__csWorkerEvents??[]'),pageErrors:chrome.pageErrors,console:chrome.consoleLines.filter(line=>line.startsWith('[error]'))};}catch{}}
  if(chrome&&process.env.C5V_CAPTURE_ARGS==='1'&&process.env.C5V_SCREENSHOT_DIR){try{const args=await chrome.evaluate('return window.__csWorkerArgs??null');fs.writeFileSync(`${process.env.C5V_SCREENSHOT_DIR}/worker-input.json`,JSON.stringify(args),{flag:'wx'});}catch(error){console.error('worker observation '+error.message);}}
  console.error(error?.stack ?? error);
} finally {
  if (chrome) await chrome.close();
}

console.log(`\nCS-C5V browser: ${pass}/${pass + fail} PASS`);
console.log(`C5V_EVIDENCE ${JSON.stringify(evidence)}`);
if (fail) process.exit(1);
