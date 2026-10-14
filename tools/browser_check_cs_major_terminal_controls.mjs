#!/usr/bin/env node
// E scoped終局CTA：只补已確認44px缺陷；不重正式25項、不點戰報、不入史發獎。
// node tools/browser/run-gate.mjs tools/browser_check_cs_major_terminal_controls.mjs --timeout 300000 -- --buildDir=<latest-v2-archive> --outDir=<new-CS-evidence>
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { preview } from 'vite';
import { runGate, finishGate, HarnessError } from './browser/harness.mjs';
import { clickFpsDNative } from './browser/fpsReplayUiProbe.mjs';

const started=Date.now(),args={},name='CS Major E terminal controls scoped';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const within=(root,target)=>{const relative=path.relative(path.resolve(root),path.resolve(target));return Boolean(relative)&&!relative.startsWith('..')&&!path.isAbsolute(relative);};
let out,server,result;
const evidence={schema:'cs-major-terminal-controls-browser.v1',status:'PREPARING',entry:'c5c=battle → production CsMatchScreen outer shell',formalFlow:'NOT_REPEATED：原25 PASS保留',replayBehavior:'NOT_REPEATED：原48 PASS保留',resultActionClicked:false,rewardsTouched:false,localStorageCleared:false,realDevice:'NOT_RUN',screenshots:[],checks:[],dialogs:[],layouts:[]};
try{
  for(const arg of process.argv.slice(2)){const at=arg.indexOf('=');if(!arg.startsWith('--')||at<3)throw new HarnessError('終局scoped參數必須--name=value');const key=arg.slice(2,at);if(!['buildDir','outDir'].includes(key)||args[key])throw new HarnessError('未知／重複終局scoped參數：'+key);args[key]=arg.slice(at+1);}
  if(!args.buildDir||!args.outDir)throw new HarnessError('終局scoped必須指定既有v2 archive及新outDir');
  const buildDir=fs.realpathSync(path.resolve(args.buildDir)),archiveRoot=fs.realpathSync('review/cs-major-upgrade/profile-builds');
  if(!within(archiveRoot,buildDir))throw new HarnessError('archive resolved path必須在本CS profile-builds內');
  out=path.resolve(args.outDir);const evidenceRoot=fs.realpathSync('review/cs-major-upgrade/evidence');
  if(!within(evidenceRoot,out)||fs.existsSync(out))throw new HarnessError('outDir須為新的CS evidence子目錄，不覆寫');
  fs.mkdirSync(out,{recursive:true});if(!within(evidenceRoot,fs.realpathSync(out)))throw new HarnessError('outDir resolved path越界');
  const manifest=JSON.parse(fs.readFileSync(path.join(buildDir,'build-manifest.json'),'utf8'));
  if(manifest.version!==1||manifest.probeVersion!=='cs-major-readonly-scene.v2'||!manifest.sourceFingerprint?.sha256)throw new HarnessError('終局scoped需要D共用v2 readonly scene／callback archive');
  const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','--','src/battle/fps','src/screens/fps/CsMatchScreen.jsx','src/screens/fps/CsResultScreen.jsx','src/platform/contracts/CsMatchResult.js','public/assets/fps','public/audio/cs'],{encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/).filter(Boolean).sort();
  const sourceHash=createHash('sha256');for(const file of files){sourceHash.update(file+'\0');sourceHash.update(fs.readFileSync(file));sourceHash.update('\0');}
  if(sourceHash.digest('hex')!==manifest.sourceFingerprint.sha256||files.length!==manifest.sourceFingerprint.files)throw new HarnessError('目前CS source與archive fingerprint不同，不借舊source驗收');
  const bundleHash=createHash('sha256');let callbackProbe=false;
  for(const file of fs.readdirSync(path.join(buildDir,'assets')).filter(file=>file.endsWith('.js')).sort()){const bytes=fs.readFileSync(path.join(buildDir,'assets',file));bundleHash.update(file+'\0');bundleHash.update(bytes);callbackProbe ||= bytes.includes(Buffer.from('__ESMO_CS_D_CALLBACK_PROBE__'));}
  if(bundleHash.digest('hex')!==manifest.bundleSha256||!callbackProbe)throw new HarnessError('v2 bundle SHA或callback probe前提不成立');
  evidence.archive={buildDir,sourceFingerprint:manifest.sourceFingerprint,bundleSha256:manifest.bundleSha256,probeVersion:manifest.probeVersion,indexSHA256:sha(fs.readFileSync(path.join(buildDir,'index.html')))};
  server=await preview({build:{outDir:buildDir},preview:{host:'127.0.0.1',port:0,open:false}});
  const url=`http://127.0.0.1:${server.httpServer.address().port}/ESMO-/`;
  result=await runGate({name,externalUrl:url,workspaceOnly:true,headless:false,timeoutMs:250000,evidenceOut:path.join(out,'harness.json'),async run({chrome,ck,sleep}){
    const check=(label,ok,detail=null)=>{ck(label,Boolean(ok),detail?JSON.stringify(detail):'');evidence.checks.push({label,ok:Boolean(ok),detail});return Boolean(ok);};
    const poll=async(expression,timeoutMs)=>{const end=Date.now()+timeoutMs;do{if(await chrome.evaluate(`return Boolean(${expression});`))return true;await sleep(200);}while(Date.now()<end);return false;};
    await chrome.send('Emulation.setDeviceMetricsOverride',{width:1366,height:900,deviceScaleFactor:1,mobile:false});
    await chrome.navigate(`${url}?c5c=battle&map=mirage&seed=505001`);
    const mounted=await poll(`document.querySelector('canvas')&&document.querySelector('[data-testid="quick-finish-match"]')&&window.__ESMO_FPS_SCENE__?.players?.length===10`,150000);
    if(!mounted)throw new HarnessError('終局scoped Battle啟動逾時，真UI前置未成立');
    const battle=await chrome.evaluate(`const canvas=document.querySelector('canvas'),quick=document.querySelector('[data-testid="quick-finish-match"]'),range=document.querySelector('[data-testid="cs-playback-controls"] input[type="range"]');return {outerHeader:!!document.querySelector('.fps-cs-match-header [data-testid="leave-active-match"]'),canvas:!!canvas&&canvas.width>0&&canvas.height>0,major:!!document.querySelector('.fps-major-battle'),players:new Set([...document.querySelectorAll('[data-esmo-fps-player-card]')].map(p=>p.dataset.esmoFpsPlayerCard)).size,quick:!!quick&&!quick.disabled,frames:Number(range?.max),resultAlreadyVisible:[...document.querySelectorAll('button')].some(b=>b.textContent.includes('查看賽後戰報'))};`);
    if(!check('正式CsMatchScreen outer shell真Battle／十人／QuickFinish前提',battle.outerHeader&&battle.canvas&&battle.major&&battle.players===10&&battle.quick&&battle.frames>0&&!battle.resultAlreadyVisible,battle))return;
    const normal=await chrome.evaluate(`return {replay:!!document.querySelector('[data-testid="cs-replay-mode"]')?.textContent?.includes('重播'),sceneVersion:window.__ESMO_FPS_SCENE__.liveRef.current.sim.sceneVersion};`);
    if(!check('當前真major比賽非保存重播',!normal.replay&&normal.sceneVersion==='major.v1',normal))return;
    let dialogFailure=null;let requests=0;
    chrome.on('Page.javascriptDialogOpening',params=>{const item={type:params.type,message:params.message,accepted:false};evidence.dialogs.push(item);const accept=params.type==='confirm'&&params.message.includes('快速完成')&&evidence.dialogs.length===1;chrome.send('Page.handleJavaScriptDialog',{accept}).then(()=>{item.accepted=accept;}).catch(error=>{dialogFailure=error.message;});});
    requests++;await clickFpsDNative({chrome,sleep,selector:'[data-testid="quick-finish-match"]'});
    const terminal=await poll(`[...document.querySelectorAll('button')].some(b=>b.textContent.includes('查看賽後戰報'))`,25000);
    if(!check('原生QuickFinish及合法confirm一次產生可見真終局',terminal&&requests===1&&evidence.dialogs.length===1&&evidence.dialogs[0].accepted&&!dialogFailure,{requests,dialogs:evidence.dialogs,dialogFailure}))return;
    const terminalState=await chrome.evaluate(`const text=document.body.innerText,score=text.match(/(勝利|敗北)\\s+(\\d+):(\\d+)/);return {score:score?{state:score[1],ours:Number(score[2]),enemy:Number(score[3])}:null,replay:!!document.querySelector('[data-testid="cs-replay-mode"]')};`);
    if(!check('終局CTA真比分可見且仍為非重播',terminalState.score&&terminalState.score.ours+terminalState.score.enemy>0&&!terminalState.replay,terminalState))return;
    evidence.terminal=terminalState;
    for(const width of [1366,390,320]){
      await chrome.send('Emulation.setDeviceMetricsOverride',{width,height:width===1366?900:844,deviceScaleFactor:1,mobile:width!==1366});await sleep(200);
      const layout=await chrome.evaluate(`const e=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('查看賽後戰報'));if(!e)return null;const r=e.getBoundingClientRect();return {viewport:innerWidth,text:e.textContent.trim(),disabled:e.disabled,width:r.width,height:r.height,left:r.left,right:r.right,overflow:document.documentElement.scrollWidth>innerWidth+1||document.body.scrollWidth>innerWidth+1};`);
      check(`${width}px終局戰報控制至少44px且無水平overflow`,layout&&layout.viewport===width&&!layout.disabled&&layout.width>=44&&layout.height>=44&&layout.left>=-1&&layout.right<=width+1&&!layout.overflow,layout);evidence.layouts.push(layout);
    }
    const errors={page:chrome.pageErrors,console:chrome.consoleLines.filter(line=>line.startsWith('[error]'))};
    check('終局scoped console／page error零',errors.page.length===0&&errors.console.length===0,errors);
  }});
  const cleanup=result.evidence?.cleanup?.chromeClose;if(cleanup&&(!cleanup.confirmed||cleanup.profileRemoved===false))result={...result,verdict:'HARNESS_FAIL',failurePhase:'終局scoped Chrome／自有profile cleanup未確認'};
}catch(error){result={verdict:'HARNESS_FAIL',pass:0,fail:0,elapsedMs:Date.now()-started,failurePhase:String(error.stack||error)};console.error(name+'準備／環境失敗：'+error.message);}
finally{
  if(server)try{await Promise.race([new Promise((resolve,reject)=>server.httpServer.close(error=>error?reject(error):resolve())),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('終局scoped preview cleanup timeout')),6000);timer.unref();})]);}catch(error){result={...result,verdict:'HARNESS_FAIL',failurePhase:'終局scoped preview cleanup: '+error.message};}
  evidence.status=result?.verdict||'HARNESS_FAIL';evidence.result=result;
  if(out&&fs.existsSync(out))fs.writeFileSync(path.join(out,'gate.json'),JSON.stringify(evidence,null,2));
}
console.log(`${name} final: ${result?.pass||0}/${(result?.pass||0)+(result?.fail||0)} RESULT=${result?.verdict||'HARNESS_FAIL'}`);
await finishGate(result);
