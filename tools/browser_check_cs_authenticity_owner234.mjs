#!/usr/bin/env node
// 新 Owner2/3/4 實際consumer；共用既有production v2 archive，不重B7/D/E舊gate。
// node tools/browser/run-gate.mjs tools/browser_check_cs_authenticity_owner234.mjs --timeout 300000 -- --buildDir=<latest-archive> --outDir=<new-CS-evidence>
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { preview } from 'vite';
import { runGate, finishGate, HarnessError } from './browser/harness.mjs';
import { clickFpsDNative } from './browser/fpsReplayUiProbe.mjs';
import { seekFpsNativeTimeline } from './browser/fpsNativeTimeline.mjs';
import { FPS_LOCOMOTION_CLIP_SPEED } from '../src/battle/fps/presentation/fpsAnimationState.js';
import { readFpsAuthenticitySnapshot, collectFpsAuthenticityMotion, assessFpsAuthenticityMotion, installFpsFootstepScheduleProbe, readFpsFootstepSchedule, readFpsNativeTones } from './browser/fpsAuthenticityMotionProbe.mjs';
const started=Date.now(),args={},name='CS Authenticity Owner234 Browser';
const within=(root,target)=>{const r=path.relative(path.resolve(root),path.resolve(target));return Boolean(r)&&!r.startsWith('..')&&!path.isAbsolute(r);};
const evidence={schema:'cs-authenticity-owner234-browser.v1',checks:[],screenshots:[],localStorageCleared:false,framesPatched:false,assetsPatched:false,realDevice:'NOT_RUN'};
let out,server,result;
try{
 for(const arg of process.argv.slice(2)){const at=arg.indexOf('=');const k=arg.slice(2,at);if(!arg.startsWith('--')||at<3||!['buildDir','outDir'].includes(k)||args[k])throw new HarnessError('只接受唯一--buildDir／--outDir');args[k]=arg.slice(at+1);}
 if(!args.buildDir||!args.outDir)throw new HarnessError('需既有readonly v2 buildDir與全新outDir');
 const buildDir=fs.realpathSync(path.resolve(args.buildDir)),archiveRoot=fs.realpathSync('review/cs-major-upgrade/profile-builds'),evidenceRoot=fs.realpathSync('review/cs-major-upgrade/evidence');
 out=path.resolve(args.outDir);if(!within(archiveRoot,buildDir)||!within(evidenceRoot,out)||fs.existsSync(out))throw new HarnessError('路徑越界或evidence已存在');fs.mkdirSync(out,{recursive:true});
 const manifest=JSON.parse(fs.readFileSync(path.join(buildDir,'build-manifest.json'),'utf8'));
 if(manifest.version!==1||manifest.probeVersion!=='cs-major-readonly-scene.v2')throw new HarnessError('需要共用D v2 source／callback probe');
 const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','--','src/battle/fps','src/screens/fps/CsMatchScreen.jsx','src/screens/fps/CsResultScreen.jsx','src/platform/contracts/CsMatchResult.js','public/assets/fps','public/audio/cs'],{encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/).filter(Boolean).sort(),hash=createHash('sha256');
 for(const file of files){hash.update(file+'\0');hash.update(fs.readFileSync(file));hash.update('\0');}
 if(hash.digest('hex')!==manifest.sourceFingerprint.sha256||files.length!==manifest.sourceFingerprint.files)throw new HarnessError('archive與目前CS source不同');
 const bundle=createHash('sha256');let callback=false;for(const file of fs.readdirSync(path.join(buildDir,'assets')).filter(f=>f.endsWith('.js')).sort()){const b=fs.readFileSync(path.join(buildDir,'assets',file));bundle.update(file+'\0');bundle.update(b);callback ||= b.includes(Buffer.from('__ESMO_CS_D_CALLBACK_PROBE__'));}
 if(bundle.digest('hex')!==manifest.bundleSha256||!callback)throw new HarnessError('archive bundle SHA／實際callbacks marker不符');evidence.archive={buildDir,sourceFingerprint:manifest.sourceFingerprint,bundleSha256:manifest.bundleSha256};
 server=await preview({build:{outDir:buildDir},preview:{host:'127.0.0.1',port:0,open:false}});const url=`http://127.0.0.1:${server.httpServer.address().port}/ESMO-/`;
 result=await runGate({name,externalUrl:url,workspaceOnly:true,headless:false,timeoutMs:250000,evidenceOut:path.join(out,'harness.json'),async run({chrome,ck,sleep}){
  const check=(name,ok,detail=null)=>{ck(name,Boolean(ok),JSON.stringify(detail));evidence.checks.push({name,ok:Boolean(ok),detail});return Boolean(ok);};
  const poll=async(expr,ms=20000)=>{const end=Date.now()+ms;while(Date.now()<end){if(await chrome.evaluate(`return Boolean(${expr});`))return true;await sleep(100);}return false;};
  const pause=async()=>{if(await chrome.evaluate('return window.__ESMO_FPS_SCENE__.liveRef.current.playing;'))await clickFpsDNative({chrome,sleep,selector:'[aria-label="暫停比賽播放"]'});await sleep(100);};
  const play=()=>clickFpsDNative({chrome,sleep,selector:'[aria-label="播放比賽"]'});
  await installFpsFootstepScheduleProbe(chrome);await chrome.send('Emulation.setDeviceMetricsOverride',{width:1366,height:900,deviceScaleFactor:1,mobile:false});
  await chrome.navigate(`${url}?c5c=battle&map=mirage&seed=505001`);
  if(!await poll('document.querySelector("canvas")&&document.querySelector(".fps-major-battle")&&window.__ESMO_FPS_SCENE__?.players?.length===10&&window.__ESMO_FPS_SCENE__.players.every(p=>p.rigged?.mode==="rigged")',150000))throw new HarnessError('真Battle／十rigged未mount，環境前提逾時');
  const pre=await chrome.evaluate('const s=window.__ESMO_FPS_SCENE__,c=document.querySelector("canvas");return {width:c.width,height:c.height,players:s.players.length,major:s.liveRef.current.sim.sceneVersion,replay:!!document.querySelector("[data-testid=cs-replay-mode]"),cards:new Set([...document.querySelectorAll("[data-esmo-fps-player-card]")].map(p=>p.dataset.esmoFpsPlayerCard)).size};');
  if(!check('真UI十人Major正常對局前提',pre.width>0&&pre.height>0&&pre.players===10&&pre.cards===10&&pre.major==='major.v1'&&!pre.replay,pre))return;
  await pause();check('原生pause游標與UI成立',!await chrome.evaluate('return window.__ESMO_FPS_SCENE__.liveRef.current.playing;'));
  const targets=await chrome.evaluate(`const frames=window.__ESMO_FPS_SCENE__.liveRef.current.sim.frames,found={};for(let i=1;i<frames.length-5;i++){const f=frames[i],n=frames[i+1];if(f.buyP||f.rnd!==n.rnd||!(n.roundSec>f.roundSec))continue;for(const p of f.players){const np=n.players.find(n=>n.id===p.id);if(p.dead||np.dead||p.reloading||p.shooting>0)continue;const speed=Math.hypot(np.pos.x-p.pos.x,np.pos.y-p.pos.y)/(n.roundSec-f.roundSec);if(!found.stopped&&speed<.05&&p.velocityUnitsPerSec>2.4)found.stopped={frame:i,id:p.id};if(!found.moving&&speed>2.5&&speed<4){const stable=frames.slice(i,i+4).every((q,j,all)=>{const a=q.players.find(a=>a.id===p.id),b=all[j+1]?.players.find(a=>a.id===p.id);return !a.dead&&!a.reloading&&q.rnd===f.rnd&&(!b||(!b.dead&&Math.hypot(b.pos.x-a.pos.x,b.pos.y-a.pos.y)>.5));});if(stable)found.moving={frame:i,id:p.id};}}if(found.stopped&&found.moving)break;}return found;`);
  if(!check('真saved-frame停住舊velocity與持續moving情境存在',targets.stopped&&targets.moving,targets))return;evidence.targets=targets;
  await seekFpsNativeTimeline({chrome,sleep,index:targets.stopped.frame});await clickFpsDNative({chrome,sleep,selector:`[data-esmo-fps-player-card="${targets.stopped.id}"]`});await sleep(120);
  await play();const stopped=await collectFpsAuthenticityMotion(chrome,{durationMs:350,intervalMs:40});await pause();const stopWindow=stopped.filter(r=>r.frameIndex===targets.stopped.frame),stoppedReport=assessFpsAuthenticityMotion(stopWindow);evidence.stopped={samples:stopped,validatedSameFrame:stopWindow,report:stoppedReport};
  check('真世界位置停住時下肢Idle而非原地跑',stopWindow.length>=3&&stopWindow.every(r=>r.players.find(p=>p.id===targets.stopped.id)?.lowerClip==='Idle_Loop')&&stoppedReport.stationaryWalks.filter(p=>p.id===targets.stopped.id).length===0);
  const movingEvidence=[];
  for(const rate of [1,2.4]){
   await clickFpsDNative({chrome,sleep,selector:`[data-testid="match-speed-${rate}"]`});await seekFpsNativeTimeline({chrome,sleep,index:targets.moving.frame});await clickFpsDNative({chrome,sleep,selector:`[data-esmo-fps-player-card="${targets.moving.id}"]`});await play();const samples=await collectFpsAuthenticityMotion(chrome,{durationMs:650,intervalMs:40});await pause();const report=assessFpsAuthenticityMotion(samples),selected=report.movingSamples.filter(p=>p.id===targets.moving.id&&FPS_LOCOMOTION_CLIP_SPEED[p.lowerClip]);
   const errors=selected.map(p=>({worldRelativeError:Math.abs(p.worldSpeed-p.outgoingWorldSpeed*rate)/Math.max(.1,p.outgoingWorldSpeed*rate),clipRateRelativeError:Math.abs(p.clipSecPerWallSec-p.effectiveTimeScale)/Math.max(.1,p.effectiveTimeScale),nominalError:Math.abs(p.effectiveTimeScale-p.outgoingWorldSpeed*rate/(FPS_LOCOMOTION_CLIP_SPEED[p.lowerClip]*p.worldScale[0]))}));
   movingEvidence.push({rate,samples,report,selected,errors});
   check(`${rate}x真world位移與下肢nominal/timeScale匹配`,selected.length>=3&&errors.every(e=>e.nominalError<1e-6)&&errors.filter(e=>e.worldRelativeError<=.25&&e.clipRateRelativeError<=.25).length>=Math.ceil(errors.length*.75),{samples:selected.length,errors});
  }
  evidence.moving=movingEvidence;
  await seekFpsNativeTimeline({chrome,sleep,index:targets.moving.frame});await clickFpsDNative({chrome,sleep,selector:`[data-esmo-fps-player-card="${targets.moving.id}"]`});await clickFpsDNative({chrome,sleep,selector:'[data-testid="cs-camera-preset-pov"]'});await sleep(200);
  const pov=await readFpsAuthenticitySnapshot(chrome);check('原生選手／POV UI與真frame aim成立',pov.selected===targets.moving.id&&pov.cameraMode==='pov'&&pov.camera.errorDeg<.05,{selected:pov.selected,mode:pov.cameraMode,camera:pov.camera});
  const drag=await chrome.evaluate('const c=document.querySelector("canvas");c.scrollIntoView({block:"center"});const r=c.getBoundingClientRect(),x=r.x+r.width*.4,y=r.y+r.height*.4;return {x,y,hit:document.elementFromPoint(x,y)===c};');
  if(!drag.hit)throw new HarnessError('POV drag命中canvas前提失敗');await chrome.send('Input.dispatchMouseEvent',{type:'mousePressed',x:drag.x,y:drag.y,button:'left',buttons:1,clickCount:1});await chrome.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:drag.x+100,y:drag.y+50,button:'left',buttons:1});await chrome.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:drag.x+100,y:drag.y+50,button:'left',buttons:0,clickCount:1});await sleep(150);
  const afterDrag=await readFpsAuthenticitySnapshot(chrome);evidence.pov={before:pov,afterDrag};check('原生100px拖曳不改Major POV權威aim',afterDrag.camera.errorDeg<.05&&Math.abs(afterDrag.camera.eyeVa-pov.camera.eyeVa)<.05,afterDrag.camera);
  await play();const povSamples=await collectFpsAuthenticityMotion(chrome,{durationMs:650,intervalMs:40});await pause();evidence.pov.dynamic=povSamples;check('播放時POV追真插值aim，沒有Orbit／雙重smooth延遲',povSamples.length>=3&&povSamples.every(p=>p.cameraMode==='pov'&&p.camera.errorDeg<.1),povSamples.map(p=>({frame:p.frameIndex,error:p.camera.errorDeg})));
  await clickFpsDNative({chrome,sleep,selector:'[data-testid="match-speed-1"]'});await seekFpsNativeTimeline({chrome,sleep,index:targets.moving.frame});
  if(await chrome.evaluate('return document.querySelector("[data-testid=cs-audio-toggle]").dataset.csAudioState!=="on";'))await clickFpsDNative({chrome,sleep,selector:'[data-testid="cs-audio-toggle"]'});
  const sound=await poll('document.querySelector("[data-testid=cs-audio-toggle]").dataset.csAudioState==="on"&&window.__ESMO_FPS_AUDIO_DIAGNOSTICS__?.contextState==="running"&&window.__ESMO_FPS_AUDIO_DIAGNOSTICS__?.preloadReadyAt!=null');
  check('原生unmute真正AudioContext running且素材預載完成',sound);
  const beforeAudio=await readFpsFootstepSchedule(chrome);await play();await sleep(1500);await pause();const nativeAudio=(await readFpsFootstepSchedule(chrome)).slice(beforeAudio.length);evidence.nativeAudio=nativeAudio;
  const times=new Set(nativeAudio.map(a=>a.atContextTime.toFixed(3)));check('真腳步AudioBufferSource有正確buffer與分散排程',nativeAudio.length>2&&times.size>1&&nativeAudio.every(a=>a.source==='native AudioBufferSourceNode.start'&&a.contextState==='running'&&a.delaySec>=-.012&&a.delaySec<=.51),{sources:nativeAudio.length,uniqueScheduleTimes:times.size,records:nativeAudio});
  const pausedBefore=(await readFpsFootstepSchedule(chrome)).length;await sleep(650);check('暫停後不重播腳步source',(await readFpsFootstepSchedule(chrome)).length===pausedBefore);
  const boundary=await chrome.evaluate('const frames=window.__ESMO_FPS_SCENE__.liveRef.current.sim.frames;const i=frames.findIndex((f,i)=>i>0&&f.rnd>0&&f.roundStart&&frames[i-1].rnd!==f.rnd);return i>0?{frame:i,round:frames[i].rnd,roundStartId:frames[i].roundStart.id,buyP:frames[i].buyP}:null;');
  if(!boundary)throw new HarnessError('新round-start原生跨回合情境缺真保存幀，無法取證');
  await seekFpsNativeTimeline({chrome,sleep,index:boundary.frame-1});const beforeTones=await readFpsNativeTones(chrome);await play();
  const crossed=await poll(`window.__ESMO_FPS_SCENE__.liveRef.current.fIdx>=${boundary.frame}`,5000);await pause();
  const visibleRound=await chrome.evaluate('const s=window.__ESMO_FPS_SCENE__,f=s.liveRef.current.sim.frames[s.liveRef.current.fIdx];return {frame:s.liveRef.current.fIdx,round:f.rnd,buyP:f.buyP,timerRoundText:document.querySelector("[data-testid=cs-match-timer]")?.parentElement?.innerText||null};');
  check('原生播放真正跨回合且UI新回合存在',crossed&&visibleRound.round===boundary.round&&visibleRound.timerRoundText?.split(/\s+/).includes(`R${boundary.round+1}`),{boundary,visibleRound});
  const chimes=(await readFpsNativeTones(chrome)).slice(beforeTones.length).filter(t=>t.frequency===420||t.frequency===620);evidence.roundBoundary={boundary,visibleRound,chimes};
  check('真round-start僅兩個420/620 OscillatorNode來源，非殘留連播',chimes.length===2&&chimes.map(t=>t.frequency).sort((a,b)=>a-b).join(',')==='420,620'&&chimes.every(t=>t.source==='native OscillatorNode.start'&&t.type==='triangle'&&t.contextState==='running'&&t.frameIndex===boundary.frame&&t.roundStartId===boundary.roundStartId),chimes);
  const toneCount=(await readFpsNativeTones(chrome)).filter(t=>t.frequency===420||t.frequency===620).length;await sleep(800);await play();await sleep(1000);await pause();const afterToneCount=(await readFpsNativeTones(chrome)).filter(t=>t.frequency===420||t.frequency===620).length;
  check('同回合pause/resume及後續buy frames無重複round-start source',afterToneCount===toneCount,{before:toneCount,after:afterToneCount});
  const errors={page:chrome.pageErrors,console:chrome.consoleLines.filter(l=>l.startsWith('[error]'))};check('新authenticity場景零page／console error',errors.page.length===0&&errors.console.length===0,errors);
 }});
 const close=result.evidence?.cleanup?.chromeClose;if(close&&(!close.confirmed||close.profileRemoved===false))result={...result,verdict:'HARNESS_FAIL',failurePhase:'Chrome自有profile未清理確認'};
}catch(e){result={verdict:'HARNESS_FAIL',pass:0,fail:0,elapsedMs:Date.now()-started,failurePhase:String(e.stack||e)};console.error(e.stack);}
finally{if(server)try{await Promise.race([new Promise((resolve,reject)=>server.httpServer.close(e=>e?reject(e):resolve())),new Promise((_,reject)=>{const t=setTimeout(()=>reject(new Error('preview cleanup timeout')),6000);t.unref();})]);}catch(e){result={...result,verdict:'HARNESS_FAIL',failurePhase:String(e)};}evidence.result=result;if(out&&fs.existsSync(out))fs.writeFileSync(path.join(out,'gate.json'),JSON.stringify(evidence,null,2));}
console.log(`${name} final: ${result?.pass||0}/${(result?.pass||0)+(result?.fail||0)} RESULT=${result?.verdict||'HARNESS_FAIL'}`);await finishGate(result);
