#!/usr/bin/env node
// 新P1/P2原生匯入反例與真Legacy保存幀；不重D48／正式flow／GPU，不build。
// node tools/browser/run-gate.mjs tools/browser_check_cs_replay_input_legacy.mjs --timeout 300000 -- --buildDir=<latest-v2> --legacyFixture=<true-legacy.json.gz> --outDir=<new-evidence>
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { preview } from 'vite';
import { runGate, finishGate, HarnessError } from './browser/harness.mjs';
import { readCsReplay } from '../src/battle/fps/fpsReplay.js';
import { getFpsFrameMessages } from '../src/battle/fps/fpsMatchUi.js';
import { clickFpsDNative, uploadFpsDNativeFile, seekFpsDAndRead, readFpsDReplayCounters } from './browser/fpsReplayUiProbe.mjs';
const name='CS Replay Input and Legacy scoped',started=Date.now(),args={};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const within=(root,target)=>{const r=path.relative(root,target);return Boolean(r)&&!r.startsWith('..')&&!path.isAbsolute(r);};
const sameCounters=(a,b)=>a.timingAvailable&&b.timingAvailable&&a.progressCalls!==null&&a.completionCalls!==null&&a.simulationCalls===b.simulationCalls&&a.progressCalls===b.progressCalls&&a.completionCalls===b.completionCalls;
let out,server,result;
const evidence={schema:'cs-replay-input-legacy-browser.v1',status:'PREPARING',checks:[],cases:[],screenshots:[],localStorageCleared:false,oldD48:'NOT_REPEATED',oldLegacyVerifier:'NOT_REPEATED',formalFlow:'NOT_REPEATED',realDevice:'NOT_RUN'};
try{
  for(const arg of process.argv.slice(2)){const at=arg.indexOf('=');if(!arg.startsWith('--')||at<3)throw new HarnessError('匯入scoped參數須--name=value');const key=arg.slice(2,at);if(!['buildDir','legacyFixture','outDir'].includes(key)||args[key])throw new HarnessError('未知／重複參數：'+key);args[key]=arg.slice(at+1);}
  if(!args.buildDir||!args.legacyFixture||!args.outDir)throw new HarnessError('須提供既有v2 archive、真Legacy fixture及新outDir');
  const buildDir=fs.realpathSync(path.resolve(args.buildDir)),archiveRoot=fs.realpathSync('review/cs-major-upgrade/profile-builds');
  if(!within(archiveRoot,buildDir))throw new HarnessError('archive resolved path越界');
  const evidenceRoot=fs.realpathSync('review/cs-major-upgrade/evidence');out=path.resolve(args.outDir);
  if(!within(evidenceRoot,out)||fs.existsSync(out))throw new HarnessError('outDir須新CS evidence子目錄');fs.mkdirSync(out,{recursive:true});if(!within(evidenceRoot,fs.realpathSync(out)))throw new HarnessError('outDir resolved path越界');
  const manifest=JSON.parse(fs.readFileSync(path.join(buildDir,'build-manifest.json'),'utf8'));
  if(manifest.version!==1||manifest.probeVersion!=='cs-major-readonly-scene.v2')throw new HarnessError('須D共用v2 readonly scene／callback archive');
  const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','--','src/battle/fps','src/screens/fps/CsMatchScreen.jsx','src/screens/fps/CsResultScreen.jsx','src/platform/contracts/CsMatchResult.js','public/assets/fps','public/audio/cs'],{encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/).filter(Boolean).sort();
  const sourceHash=createHash('sha256');for(const file of files){sourceHash.update(file+'\0');sourceHash.update(fs.readFileSync(file));sourceHash.update('\0');}
  if(sourceHash.digest('hex')!==manifest.sourceFingerprint?.sha256||files.length!==manifest.sourceFingerprint?.files)throw new HarnessError('current source與archive不同');
  const bundleHash=createHash('sha256');let callbacks=false;for(const file of fs.readdirSync(path.join(buildDir,'assets')).filter(f=>f.endsWith('.js')).sort()){const bytes=fs.readFileSync(path.join(buildDir,'assets',file));bundleHash.update(file+'\0');bundleHash.update(bytes);callbacks ||= bytes.includes(Buffer.from('__ESMO_CS_D_CALLBACK_PROBE__'));}
  if(bundleHash.digest('hex')!==manifest.bundleSha256||!callbacks)throw new HarnessError('bundle SHA／callback probe不符');
  evidence.archive={buildDir,...manifest};
  const legacyBytes=fs.readFileSync(args.legacyFixture),legacy=readCsReplay(gunzipSync(legacyBytes).toString('utf8')),legacyManifest=JSON.parse(fs.readFileSync(args.legacyFixture+'.manifest.json','utf8'));
  assert.equal(legacyManifest.sourceSHA256,sha(fs.readFileSync('src/battle/fps/EsportsFPS3D.jsx')));assert.equal(legacyManifest.simulationCalls,1);assert.equal(legacyManifest.args.sceneVersion,'legacy');assert.equal(legacyManifest.replay.gzipSHA256,sha(legacyBytes));assert.equal(legacy.metadata.sceneVersion,'legacy');assert.equal(legacy.simulation.sceneVersion,'legacy');
  const messageIndex=legacy.simulation.frames.findIndex((frame,index)=>{const view=getFpsFrameMessages(legacy.simulation.frames,index);return index>0&&view.casts.length>0&&view.comms.length>0;});
  if(messageIndex<=0)throw new HarnessError('真Legacy fixture沒有casts及comms同窗口情境，不能造訊息');
  const expectedMessages=getFpsFrameMessages(legacy.simulation.frames,messageIndex),legacyFrames=legacy.simulation.frames.length;
  evidence.legacy={path:args.legacyFixture,gzipSHA256:sha(legacyBytes),provenance:legacyManifest,messageIndex,expectedMessages};legacy.simulation.frames=[];legacy.simulation.roundHist=[];
  const majorPath='review/cs-major-upgrade/evidence/retention-policy-20261011/d-canonical-replay.json.gz',majorBytes=fs.readFileSync(majorPath),wire=JSON.parse(gunzipSync(majorBytes).toString('utf8'));
  assert.equal(wire.metadata.sceneVersion,'major.v1');assert.equal(wire.simulation.frames[0].rnd,0);
  const excerpt={...wire,simulation:{...wire.simulation,frames:[wire.simulation.frames[0],wire.simulation.frames.at(-1)]}},cases=[];
  for(const [id,field,expectedError] of [['casts-object','casts','保存事件或訊息資料不完整'],['events-object','events','保存事件或訊息資料不完整'],['rnd0-count2','roundHistCount','回合紀錄游標不合法']]){
    const value=structuredClone(excerpt);value.simulation.frames[0][field]=field==='roundHistCount'?2:{};const json=JSON.stringify(value),file=path.join(out,id+'.json');fs.writeFileSync(file,json,{flag:'wx'});cases.push({id,file,expectedError,bytes:Buffer.byteLength(json),sha256:sha(json),source:'synthetic malformed input using two unchanged real Major frames; not match outcome'});
  }
  evidence.counterexampleSource={path:majorPath,gzipSHA256:sha(majorBytes),framesUsed:[wire.simulation.frames[0].fi,wire.simulation.frames.at(-1).fi]};wire.simulation.frames=[];
  server=await preview({build:{outDir:buildDir},preview:{host:'127.0.0.1',port:0,open:false}});const url=`http://127.0.0.1:${server.httpServer.address().port}/ESMO-/`;
  result=await runGate({name,externalUrl:url,workspaceOnly:true,headless:false,timeoutMs:250000,evidenceOut:path.join(out,'harness.json'),async run({chrome,ck,sleep}){
    const check=(label,ok,detail=null)=>{ck(label,Boolean(ok),detail?JSON.stringify(detail):'');evidence.checks.push({label,ok:Boolean(ok),detail});return Boolean(ok);};
    const poll=async(expression,timeout=6000)=>{const end=Date.now()+timeout;do{if(await chrome.evaluate(`return Boolean(${expression});`))return true;await sleep(150);}while(Date.now()<end);return false;};
    const ui=()=>chrome.evaluate(`const e=document.querySelector('[data-testid="cs-playback-controls"] input[type="range"]'),live=window.__ESMO_FPS_SCENE__?.liveRef.current;return {index:Number(e?.value),liveIndex:live?.fIdx,playing:live?.playing,scene:live?.sim.sceneVersion,frames:live?.sim.frames.length,mode:document.querySelector('[data-testid="cs-replay-mode"]')?.textContent||null,error:document.querySelector('[data-testid="cs-replay-error"]')?.textContent||null,casts:[...document.querySelectorAll('.fps-major-casts > div')].map(n=>n.textContent),comms:[...document.querySelectorAll('[data-testid="cs-major-radio"] li')].map(n=>n.textContent)};`);
    const rewardDigest=()=>chrome.evaluate(`const text=localStorage.getItem('esmo.profile.v1'),p=text?JSON.parse(text):{};const bytes=new TextEncoder().encode(JSON.stringify({history:p.csHistory||[],transactions:p.processedMatchTransactions||{}})),digest=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');`);
    await chrome.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await chrome.navigate(`${url}?c5c=battle&map=mirage&seed=505001`);
    if(!await poll(`document.querySelector('canvas')&&document.querySelector('[data-testid="cs-replay-import"]')&&window.__ESMO_FPS_SCENE__?.players?.length===10`,150000))throw new HarnessError('新匯入情境Battle啟動逾時');
    const ready=await chrome.evaluate(`return {outer:!!document.querySelector('.fps-cs-match-header'),input:document.querySelector('[data-testid="cs-replay-import"]')?.type==='file',cards:new Set([...document.querySelectorAll('[data-esmo-fps-player-card]')].map(p=>p.dataset.esmoFpsPlayerCard)).size,normal:!document.querySelector('[data-testid="cs-replay-mode"]'),scene:window.__ESMO_FPS_SCENE__.liveRef.current.sim.sceneVersion};`);
    if(!check('新反例真Major正常比賽／outer shell／fileinput前提',ready.outer&&ready.input&&ready.cards===10&&ready.normal&&ready.scene==='major.v1',ready))return;
    if(await chrome.evaluate(`return window.__ESMO_FPS_SCENE__.liveRef.current.playing;`))await clickFpsDNative({chrome,sleep,selector:'[aria-label="暫停比賽播放"]'});
    const normalUI=await ui(),baseline=await readFpsDReplayCounters(chrome),rewardBefore=await rewardDigest();
    if(!check('正常游標原生暫停及真callback計數前提',!normalUI.playing&&normalUI.index===normalUI.liveIndex&&baseline.timingAvailable&&baseline.progressCalls!==null&&baseline.completionCalls===0,{normalUI,baseline}))return;
    if(!await chrome.evaluate(`return document.querySelector('.fps-major-replay')?.open;`))await clickFpsDNative({chrome,sleep,selector:'.fps-major-replay > summary'});
    for(const test of cases){
      await uploadFpsDNativeFile({chrome,selector:'[data-testid="cs-replay-import"]',filePath:test.file});await sleep(200);
      const rejected=await poll(`document.querySelector('[data-testid="cs-replay-error"]')?.textContent.includes(${JSON.stringify(test.expectedError)})&&!document.querySelector('[data-testid="cs-replay-import"]')?.disabled`),current=await ui(),counters=await readFpsDReplayCounters(chrome),rewardAfter=await rewardDigest();
      check(`${test.id} 原生匯入中文拒收且保留正常游標／模式`,rejected&&current.index===normalUI.index&&!current.mode&&!current.playing&&current.scene===normalUI.scene&&current.frames===normalUI.frames,current);
      check(`${test.id} callback／sim／Worker及獎勵增量零`,sameCounters(baseline,counters)&&rewardBefore===rewardAfter,{baseline,counters,rewardSame:rewardBefore===rewardAfter});evidence.cases.push({...test,ui:current,counters,rewardDigest:rewardAfter});
    }
    await uploadFpsDNativeFile({chrome,selector:'[data-testid="cs-replay-import"]',filePath:path.resolve(args.legacyFixture)});
    const imported=await poll(`document.querySelector('[data-testid="cs-replay-mode"]')?.textContent.includes('重播')&&document.querySelector('[data-testid="cs-replay-exit"]')&&window.__ESMO_FPS_SCENE__.liveRef.current.sim.sceneVersion==='legacy'&&!window.__ESMO_FPS_SCENE__.liveRef.current.playing&&Number(document.querySelector('[data-testid="cs-playback-controls"] input[type="range"]')?.max)===${legacyFrames-1}`,30000);
    const legacyUI=await ui();
    if(!check('真Legacy保存幀原生匯入有重播／exit／savedHUD',imported&&legacyUI.index===0&&await chrome.evaluate(`return Boolean(document.querySelector('.fps-major-saved-hud')&&document.querySelector('[data-testid="cs-major-radio"]'));`),legacyUI))return;
    if(!await chrome.evaluate(`return document.querySelector('[data-testid="cs-major-radio"]').open;`))await clickFpsDNative({chrome,sleep,selector:'[data-testid="cs-major-radio"] summary'});
    await seekFpsDAndRead({chrome,sleep,index:messageIndex});const messages=await ui();
    check('Legacy真frame cast／comm窗口一致',messages.index===messageIndex&&JSON.stringify(messages.casts)===JSON.stringify(expectedMessages.casts.map(c=>c.text))&&messages.comms.length===expectedMessages.comms.length&&expectedMessages.comms.every((c,i)=>messages.comms[i]?.includes(c.name)&&messages.comms[i]?.includes(c.text)),{ui:messages,expectedMessages});
    await sleep(4500);const held=await ui();
    check('Legacy暫停超過舊wallclock仍保存同frame訊息',!held.playing&&held.index===messageIndex&&JSON.stringify(held.casts)===JSON.stringify(messages.casts)&&JSON.stringify(held.comms)===JSON.stringify(messages.comms),held);
    const replayCounters=await readFpsDReplayCounters(chrome),replayReward=await rewardDigest();
    check('Legacy重播無callback／sim／Worker／獎勵增量',sameCounters(baseline,replayCounters)&&replayReward===rewardBefore,{baseline,replayCounters,rewardSame:replayReward===rewardBefore});
    await clickFpsDNative({chrome,sleep,selector:'[data-testid="cs-replay-exit"]'});
    const returned=await poll(`!document.querySelector('[data-testid="cs-replay-mode"]')&&Number(document.querySelector('[data-testid="cs-playback-controls"] input[type="range"]')?.value)===${normalUI.index}&&window.__ESMO_FPS_SCENE__.liveRef.current.sim.sceneVersion==='major.v1'`),restored=await ui();
    check('Legacy原生exit還原正常比賽原游標',returned&&restored.index===normalUI.index&&restored.scene===normalUI.scene&&restored.frames===normalUI.frames,restored);
    const afterExit=await readFpsDReplayCounters(chrome),exitReward=await rewardDigest();
    check('Legacy退出無resim／Worker／completion／獎勵',afterExit.simulationCalls===baseline.simulationCalls&&afterExit.completionCalls===baseline.completionCalls&&exitReward===rewardBefore,{baseline,afterExit,rewardSame:exitReward===rewardBefore});
    const errors={page:chrome.pageErrors,console:chrome.consoleLines.filter(line=>line.startsWith('[error]'))};check('新增匯入情境console／page error零',errors.page.length===0&&errors.console.length===0,errors);
    evidence.normal={before:normalUI,after:restored};evidence.counters={baseline,replay:replayCounters,afterExit};
  }});
  const cleanup=result.evidence?.cleanup?.chromeClose;if(cleanup&&(!cleanup.confirmed||cleanup.profileRemoved===false))result={...result,verdict:'HARNESS_FAIL',failurePhase:'匯入scoped Chrome／profile cleanup未確認'};
}catch(error){result={verdict:'HARNESS_FAIL',pass:0,fail:0,elapsedMs:Date.now()-started,failurePhase:String(error.stack||error)};console.error(name+'準備／環境失敗：'+error.message);}
finally{if(server)try{await Promise.race([new Promise((resolve,reject)=>server.httpServer.close(error=>error?reject(error):resolve())),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('匯入scoped preview close timeout')),6000);timer.unref();})]);}catch(error){result={...result,verdict:'HARNESS_FAIL',failurePhase:'匯入scoped preview cleanup: '+error.message};}evidence.status=result?.verdict||'HARNESS_FAIL';evidence.result=result;if(out&&fs.existsSync(out))fs.writeFileSync(path.join(out,'gate.json'),JSON.stringify(evidence,null,2));}
console.log(`${name} final: ${result?.pass||0}/${(result?.pass||0)+(result?.fail||0)} RESULT=${result?.verdict||'HARNESS_FAIL'}`);await finishGate(result);
