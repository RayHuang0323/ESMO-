#!/usr/bin/env node
// E production formal flow only: Dashboard → CS prep → matchmaking → map → tactics → Battle → Quick Finish → Result.
// Never builds, enables c5c=battle, imports fixtures, clears localStorage, or changes product/store/contracts.
// Pristine formal dist is supported: no scene/callback probe required. Fresh profile is owned by Browser Harness.
// node tools/browser/run-gate.mjs tools/browser_check_cs_major_formal_flow.mjs --timeout 720000 -- --buildDir=<formal-dist> --outDir=<new-evidence-dir> --width=1366
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {preview} from 'vite';
import {runGate,finishGate,HarnessError} from './browser/harness.mjs';
import {clickFpsDNative,clickFpsFormalButtonByText} from './browser/fpsReplayUiProbe.mjs';

const started=Date.now(),args={},sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const within=(root,target)=>{const r=path.relative(root,target);return r&&!r.startsWith('..')&&!path.isAbsolute(r);};
let out,server,result;
const evidence={schema:'cs-major-formal-production-flow.v1',status:'PREPARING',entry:'Dashboard UI; no query shortcut',realDevice:'NOT_RUN',fixtureInjected:false,localStorageCleared:false,localStorageSeeded:false,completionRequests:0,screenshots:[],checks:[],stages:[],dialogs:[]};

try{
 for(const argument of process.argv.slice(2)){
  const at=argument.indexOf('=');if(!argument.startsWith('--')||at<3)throw new HarnessError('E flow參數必須--name=value');
  const key=argument.slice(2,at);if(!['buildDir','outDir','width','height','bundleSha256'].includes(key)||args[key])throw new HarnessError('未知／重複 E flow 參數：'+key);args[key]=argument.slice(at+1);
 }
 if(!args.buildDir||!args.outDir)throw new HarnessError('E flow必須指定既有buildDir與新outDir，不會自行建置');
 const workspace=fs.realpathSync(process.cwd()),buildDir=fs.realpathSync(path.resolve(args.buildDir));
 if(!within(workspace,buildDir)||!fs.existsSync(path.join(buildDir,'index.html')))throw new HarnessError('buildDir須為本工作區的既有正式production建置');
 const width=Number(args.width||1366),height=Number(args.height||(width===390?844:900));
 if(![1366,390].includes(width)||!Number.isInteger(height)||height<600||height>1200)throw new HarnessError('E正式flow僅1366或390，height600–1200整數');
 out=path.resolve(args.outDir);
 const evidenceRoot=fs.realpathSync(path.resolve('review/cs-major-upgrade/evidence'));
 if(!within(evidenceRoot,out)||fs.existsSync(out))throw new HarnessError('outDir必須為新的CS evidence子目錄，不覆寫既有證據');
 fs.mkdirSync(out,{recursive:true});if(!within(evidenceRoot,fs.realpathSync(out)))throw new HarnessError('outDir resolved path越界');
 const assetDir=path.join(buildDir,'assets'),scripts=fs.readdirSync(assetDir).filter(f=>f.endsWith('.js')).sort();
 if(!scripts.some(f=>f.startsWith('index-'))||!scripts.some(f=>f.startsWith('fpsSim.worker-')))throw new HarnessError('buildDir缺正式app與FPS worker JS');
 const h=createHash('sha256');let hasSceneProbe=false,hasCallbackProbe=false;
 for(const name of scripts){const bytes=fs.readFileSync(path.join(assetDir,name));h.update(name+'\0');h.update(bytes);hasSceneProbe ||= bytes.includes(Buffer.from('window.__ESMO_FPS_SCENE__='));hasCallbackProbe ||= bytes.includes(Buffer.from('__ESMO_CS_D_CALLBACK_PROBE__'));}
 const bundleSha256=h.digest('hex');if(args.bundleSha256&&args.bundleSha256!==bundleSha256)throw new HarnessError('正式bundle SHA與owner固定來源不同');
 const manifestPath=path.join(buildDir,'build-manifest.json'),manifest=fs.existsSync(manifestPath)?JSON.parse(fs.readFileSync(manifestPath,'utf8')):null;
 if(manifest?.bundleSha256&&manifest.bundleSha256!==bundleSha256)throw new HarnessError('archive manifest bundle SHA不符');
 evidence.archive={buildDir,indexSha256:sha(fs.readFileSync(path.join(buildDir,'index.html'))),bundleSha256,jsFiles:scripts.length,sourceFingerprint:manifest?.sourceFingerprint||null,probeVersion:manifest?.probeVersion||null,hasSceneProbe,hasCallbackProbe,sourceAssociation:manifest?'archive manifest＋本輪JS bundle實SHA':'owner supplied pristine formal build; no generation manifest; source freshness requires owner build record'};
 evidence.viewport={width,height,mobileEmulation:width===390};
 server=await preview({build:{outDir:buildDir},preview:{host:'127.0.0.1',port:0,open:false}});
 const url=`http://127.0.0.1:${server.httpServer.address().port}/ESMO-/`;
 result=await runGate({name:`CS Major E formal production flow ${width}`,externalUrl:url,workspaceOnly:true,headless:false,timeoutMs:650000,evidenceOut:path.join(out,'harness.json'),async run({chrome,ck,sleep}){
  const check=(label,ok,detail=null)=>{ck(label,Boolean(ok),detail?JSON.stringify(detail):'');evidence.checks.push({label,ok:Boolean(ok),detail});return Boolean(ok);};
  const poll=async(expression,timeoutMs,label)=>{const deadline=Date.now()+timeoutMs;while(Date.now()<deadline){if(await chrome.evaluate(`return Boolean(${expression});`))return;await sleep(250);}evidence.failureUI=await chrome.evaluate(`return {text:document.body.innerText.slice(0,6000),buttons:[...document.querySelectorAll('button')].map(b=>({text:b.textContent.slice(0,80),testid:b.dataset.testid,disabled:b.disabled})),url:location.href};`);throw new HarnessError(label+' timeout；前置未成立，不借其它情境PASS');};
  const snapshot=async stage=>{const value=await chrome.evaluate(`
   const text=document.body.innerText||'',btns=[...document.querySelectorAll('button')],sel=s=>document.querySelector(s),e=sel('[data-testid="prep-primary-action"]'),canvas=sel('canvas'),range=sel('[data-testid="cs-playback-controls"] input[type="range"]'),score=text.match(/(勝利|敗北)\\s+(\\d+):(\\d+)/);
   return {url:location.href,width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth+1||document.body.scrollWidth>innerWidth+1,title:document.querySelector('h2')?.textContent||null,homeCs:Boolean(sel('[data-testid="home-mode-cs"]')),prepAction:e?{action:e.dataset.action,disabled:e.disabled,text:e.textContent.trim()}:null,tier:sel('[data-testid="prep-tier-banner"]')?.dataset.tier||null,tierText:sel('[data-testid="prep-tier-name"]')?.textContent.trim()||null,seats:[...document.querySelectorAll('[data-testid="squad-seat"]')].map(s=>s.dataset.seated),mapKind:sel('[data-testid="cs-map-selection-kind"]')?.textContent.trim()||null,maps:[...document.querySelectorAll('button[data-map-key]')].map(m=>({key:m.dataset.mapKey,state:m.dataset.vetoState,disabled:m.disabled})),battleControls:Boolean(sel('[data-testid="cs-match-speed-controls"]')),quickFinish:sel('[data-testid="quick-finish-match"]')?{text:sel('[data-testid="quick-finish-match"]').textContent.trim(),disabled:sel('[data-testid="quick-finish-match"]').disabled}:null,cards:[...document.querySelectorAll('[data-esmo-fps-player-card]')].map(c=>c.dataset.esmoFpsPlayerCard),majorHud:Boolean(sel('[data-testid="cs-c5c-presentation-hud"]')),canvas:canvas?{width:canvas.width,height:canvas.height}:null,range:range?{index:Number(range.value),max:Number(range.max)}:null,resultAction:btns.some(b=>b.textContent.includes('查看賽後戰報')),returnAction:btns.some(b=>b.textContent.trim()==='返回 Dashboard'),score:score?{label:score[1],ours:Number(score[2]),enemy:Number(score[3])}:null,recorded:text.includes('已儲存 CS 對戰紀錄'),receiptApplied:text.includes('已入帳')||text.includes('本場已結算（不重複發放）'),receiptError:text.includes('結算未完成')||text.includes('尚無賽後資料'),textExcerpt:text.slice(0,700)};`);evidence.stages.push({stage,at:new Date().toISOString(),...value});return value;};
  const saved=()=>chrome.evaluate(`const raw=localStorage.getItem('esmo.profile.v1');if(!raw)return {profilePresent:false,history:[],transactions:[]};const p=JSON.parse(raw);return {profilePresent:true,history:(p.csHistory||[]).map(r=>({matchId:r.matchId,mode:r.mode,ourScore:r.ourScore,enemyScore:r.enemyScore,mapId:r.mapId})),transactions:Object.keys(p.processedMatchTransactions||{}),activeMode:p.matchmaking?.session?.mode||null};`);
  let dialogFailure=null;
  chrome.on('Page.javascriptDialogOpening',params=>{const item={type:params.type,message:params.message,accepted:false};evidence.dialogs.push(item);const accept=params.type==='confirm'&&params.message.includes('快速完成');chrome.send('Page.handleJavaScriptDialog',{accept}).then(()=>{item.accepted=accept;}).catch(e=>{dialogFailure=e.message;});});
  await chrome.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width===390});
  await chrome.navigate(url);
  await poll(`document.querySelector('[data-testid="home-mode-cs"]')`,30000,'正式Dashboard');
  const dashboard=await snapshot('dashboard');
  if(!check('正式Dashboard CS入口且無c5c捷徑',dashboard.homeCs&&!new URL(dashboard.url).searchParams.has('c5c'),dashboard))return;
  check('Dashboard指定viewport無水平溢出',dashboard.width===width&&!dashboard.overflow,{width:dashboard.width,overflow:dashboard.overflow});
  evidence.savedBefore=await saved();
  if(!check('隔離fresh profile無既有CS結果',evidence.savedBefore.history.length===0,evidence.savedBefore))return;
  evidence.entryClick=await clickFpsDNative({chrome,sleep,selector:'[data-testid="home-mode-cs"]'});
  await poll(`document.querySelector('[data-testid="prep-primary-action"]')&&document.body.innerText.includes('CS 賽前準備')`,30000,'CS正式賽前');
  let prep=await snapshot('prep-initial');
  if(!check('CS賽前為一般對戰、未走快速練習',prep.tier==='competitive'&&prep.tierText?.includes('一般對戰'),{tier:prep.tier,tierText:prep.tierText}))return;
  if(prep.prepAction?.action==='blocked'){
   await clickFpsFormalButtonByText({chrome,sleep,text:'自動填入',exact:false});
   await poll(`document.querySelector('[data-testid="prep-primary-action"]')?.dataset.action==='enqueue'`,15000,'UI自動填入陣容');
   prep=await snapshot('prep-auto-filled');
  }
  if(!check('UI五人陣容完整且正式enqueue可用',prep.seats.length===5&&prep.seats.every(s=>s==='1')&&prep.prepAction?.action==='enqueue'&&!prep.prepAction.disabled,{seats:prep.seats,action:prep.prepAction}))return;
  check('CS賽前無水平溢出',!prep.overflow,{overflow:prep.overflow});
  await clickFpsDNative({chrome,sleep,selector:'[data-testid="prep-primary-action"]'});
  await poll(`document.querySelector('[data-testid="cs-map-confirm"]')||document.querySelector('[data-testid="prep-primary-action"]')?.dataset.action==='confirm'`,90000,'正式配對／ready check');
  if(await chrome.evaluate(`return document.querySelector('[data-testid="prep-primary-action"]')?.dataset.action==='confirm';`)){
   evidence.readyCheck=await snapshot('ready-check');
   if(!check('正式ready-check確認入口可用',!evidence.readyCheck.prepAction.disabled,evidence.readyCheck.prepAction))return;
   await clickFpsDNative({chrome,sleep,selector:'[data-testid="prep-primary-action"]'});
  }
  await poll(`document.querySelector('[data-testid="cs-map-confirm"]')`,45000,'正式地圖決定');
  const map=await snapshot('map');
  const selected=map.maps.filter(m=>m.state==='selected');
  if(!check('一般對戰地圖交集由正式UI決定一圖',map.mapKind?.includes('一般對戰')&&selected.length===1,{kind:map.mapKind,selected}))return;
  evidence.selectedMap=selected[0].key;
  if(!check('正式地圖確認可用',await chrome.evaluate(`const e=document.querySelector('[data-testid="cs-map-confirm"]');return Boolean(e&&!e.disabled);`)))return;
  await clickFpsDNative({chrome,sleep,selector:'[data-testid="cs-map-confirm"]'});
  await poll(`document.querySelector('[data-testid="cs-tactic-confirm"]')`,30000,'正式四層戰術');
  const tactics=await snapshot('tactics');
  check('正式四層戰術UI含開局中局後段安包後',await chrome.evaluate(`return ['opening','mid-round','late-round','post-plant'].every(k=>document.querySelector('[data-testid="cs-tactic-phase-'+k+'"]'))&&document.body.innerText.includes('目前四層配置');`));
  check('正式戰術頁無水平溢出',!tactics.overflow,{overflow:tactics.overflow});
  evidence.loadingStart=Date.now();
  await clickFpsDNative({chrome,sleep,selector:'[data-testid="cs-tactic-confirm"]'});
  await poll(`document.querySelector('canvas')&&document.querySelector('[data-testid="cs-match-speed-controls"]')&&document.querySelector('[data-testid="cs-playback-controls"] input[type="range"]')`,180000,'正式Loading→Battle');
  const battle=await snapshot('battle');evidence.loadingToBattleMs=Date.now()-evidence.loadingStart;
  if(!check('正式Battle十選手、major HUD與非空canvas',new Set(battle.cards).size===10&&battle.majorHud&&battle.canvas?.width>0&&battle.canvas?.height>0,{cards:battle.cards,majorHud:battle.majorHud,canvas:battle.canvas}))return;
  if(!check('真比賽已有保存幀、QuickFinish可用且未先結案',battle.range?.max>0&&battle.quickFinish&&!battle.quickFinish.disabled&&!battle.resultAction,{range:battle.range,quickFinish:battle.quickFinish,resultAction:battle.resultAction}))return;
  check('正式Battle非示範陣容且非保存重播',await chrome.evaluate(`return !document.body.innerText.includes('本場使用引擎內建示範陣容')&&!document.querySelector('[data-testid="cs-replay-mode"]')?.textContent.includes('重播');`));
  check('正式Battle無水平溢出',!battle.overflow,{overflow:battle.overflow});
  evidence.completionRequests++;
  const finishStart=Date.now();
  await clickFpsDNative({chrome,sleep,selector:'[data-testid="quick-finish-match"]'});
  await poll(`[...document.querySelectorAll('button')].some(b=>b.textContent.includes('查看賽後戰報'))`,25000,'真QuickFinish結果');
  evidence.quickFinishMs=Date.now()-finishStart;const terminal=await snapshot('quick-finish');
  check('QuickFinish原生confirm一次且真結果可見',evidence.completionRequests===1&&evidence.dialogs.length===1&&evidence.dialogs[0].accepted&&!dialogFailure&&terminal.resultAction,{requests:evidence.completionRequests,dialogs:evidence.dialogs,dialogFailure});
  check('真終局比分可見且非預設0:0',terminal.score&&Number.isInteger(terminal.score.ours)&&Number.isInteger(terminal.score.enemy)&&terminal.score.ours+terminal.score.enemy>0,terminal.score);
  const resultControl=await chrome.evaluate(`const e=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('查看賽後戰報'));if(!e)return null;const r=e.getBoundingClientRect();return {width:r.width,height:r.height};`);
  check('正式終局戰報按鈕至少44px',resultControl?.width>=44&&resultControl?.height>=44,resultControl);
  // Result入口觸發真AppShell settlement；不patch onComplete或profile。
  await clickFpsFormalButtonByText({chrome,sleep,text:'查看賽後戰報',exact:false});
  await poll(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='返回 Dashboard')`,20000,'CS正式Result');
  await poll(`document.body.innerText.includes('已儲存 CS 對戰紀錄')&&(document.body.innerText.includes('已入帳')||document.body.innerText.includes('本場已結算（不重複發放）'))`,15000,'正式Result實際入帳與入史');
  const report=await snapshot('result');evidence.savedAfter=await saved();
  check('正式Result回合數據戰報可見',report.returnAction&&await chrome.evaluate(`return document.body.innerText.includes('本隊數據')&&document.body.innerText.includes('回合走勢')&&document.body.innerText.includes('K/D/A');`));
  check('正式Result UI確認已入帳與入史、無結算錯誤',report.receiptApplied&&report.recorded&&!report.receiptError,{receiptApplied:report.receiptApplied,recorded:report.recorded,receiptError:report.receiptError});
  check('正式Result新增唯一真CS match紀錄',evidence.savedAfter.history.length===1&&evidence.savedAfter.history[0].mode==='cs'&&Boolean(evidence.savedAfter.history[0].matchId),evidence.savedAfter.history);
  const history=evidence.savedAfter.history[0];
  check('正式Result入史比分等於Battle真結果',history&&terminal.score&&history.ourScore===terminal.score.ours&&history.enemyScore===terminal.score.enemy,{history,terminalScore:terminal.score});
  check('正式Result無水平溢出',!report.overflow,{overflow:report.overflow});
  await clickFpsFormalButtonByText({chrome,sleep,text:'返回 Dashboard'});
  await poll(`document.querySelector('[data-testid="home-mode-cs"]')`,20000,'正式Result返回Dashboard');
  const returned=await snapshot('dashboard-return'),afterReturn=await saved();
  check('返回Dashboard沿用同一CS紀錄與交易、無第二次完成',returned.homeCs&&JSON.stringify(afterReturn.history)===JSON.stringify(evidence.savedAfter.history)&&JSON.stringify(afterReturn.transactions)===JSON.stringify(evidence.savedAfter.transactions)&&evidence.completionRequests===1,{history:afterReturn.history,transactions:afterReturn.transactions,requests:evidence.completionRequests});
  evidence.browserErrors={page:chrome.pageErrors,console:chrome.consoleLines.filter(l=>l.startsWith('[error]'))};
  check('正式flow console/page error零',!evidence.browserErrors.page.length&&!evidence.browserErrors.console.length,evidence.browserErrors);
  check('全流程無c5c捷徑、無fixture／LS清除或seed',evidence.stages.every(s=>!new URL(s.url).searchParams.has('c5c'))&&!evidence.fixtureInjected&&!evidence.localStorageCleared&&!evidence.localStorageSeeded);
 }});
 const cleanup=result.evidence?.cleanup?.chromeClose;
 if(cleanup&&(!cleanup.confirmed||cleanup.profileRemoved===false))result={...result,verdict:'HARNESS_FAIL',failurePhase:'E Chrome／自有profile cleanup未確認'};
}catch(error){result={verdict:'HARNESS_FAIL',pass:0,fail:0,elapsedMs:Date.now()-started,failurePhase:String(error.stack||error)};console.error('E formal flow準備／環境失敗：'+error.message);}
finally{
 if(server)try{await Promise.race([new Promise((resolve,reject)=>server.httpServer.close(e=>e?reject(e):resolve())),new Promise((_,reject)=>{const t=setTimeout(()=>reject(new Error('E preview cleanup timeout')),6000);t.unref();})]);}catch(error){result={...result,verdict:'HARNESS_FAIL',failurePhase:'E preview cleanup: '+error.message};}
 evidence.status=result?.verdict||'HARNESS_FAIL';evidence.result=result;
 if(out&&fs.existsSync(out))fs.writeFileSync(path.join(out,'gate.json'),JSON.stringify(evidence,null,2));
}
console.log(`CS Major E formal production flow final: ${result?.pass||0}/${(result?.pass||0)+(result?.fail||0)} RESULT=${result?.verdict||'HARNESS_FAIL'}`);
await finishGate(result);
