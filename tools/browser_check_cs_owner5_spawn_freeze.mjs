#!/usr/bin/env node
// PREPARED only; run exclusively through supervisor after other GPU work ends.
// Existing scene-probe archive, genuine native seeks/play, read-only mixer samples.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {preview} from 'vite';
import {runGate,finishGate,HarnessError} from './browser/harness.mjs';
import {clickFpsDNative} from './browser/fpsReplayUiProbe.mjs';
import {seekFpsNativeTimeline} from './browser/fpsNativeTimeline.mjs';

const hash=x=>createHash('sha256').update(x).digest('hex');
const inside=(root,file)=>{const rel=path.relative(root,file);return rel&&!rel.startsWith('..')&&!path.isAbsolute(rel);};
const args={},evidence={schema:'cs-owner5-spawn-freeze.v1',buildRun:false,simulationPatch:false,savedPngs:0,scope:'Two genuine different-round saved buy-phase windows; real scene/mixer at 1x; idle breathing allowed; no visual/mobile PASS',series:[],checks:[]};
let out,server,result;
const read=`const st=window.__ESMO_FPS_SCENE__,live=st.liveRef.current,f=live.sim.frames[live.fIdx];return{atMs:performance.now(),frame:live.fIdx,round:f.rnd,roundSec:f.roundSec,buyP:f.buyP,playing:live.playing,speed:live.speed,selected:live.selected,savedPlayers:f.players.map(p=>({id:p.id,dead:p.dead,pos:p.pos,state:p.state,velocity:p.velocityUnitsPerSec})),poseProbe:st.readonlyAnimationPoseProbe(),actors:st.players.map(p=>({id:p.id,worldRoot:p.g.position.toArray(),riggedRoot:p.rigged.root.position.toArray(),animation:p.rigged.animationState,action:p.rigged.currentAction,layers:p.rigged.poseLayers?.diagnostics()||null,modelPosition:p.rigged.model?.position.toArray(),mixerTime:p.rigged.mixer?.time}))};`;
const vectorDistance=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length?Math.hypot(...a.map((x,i)=>x-b[i])):Infinity;
function save(){if(out){const json=JSON.stringify(evidence,null,2);fs.writeFileSync(path.join(out,'freeze.json'),json);if(Buffer.byteLength(json)>1024*1024)throw new HarnessError('Freeze evidence exceeds 1MiB; retained');}}
try{
 for(const arg of process.argv.slice(2)){const m=/^--(buildDir|outDir)=(.+)$/.exec(arg);if(!m)throw new HarnessError('Explicit --buildDir and --outDir only');args[m[1]]=m[2];}
 if(!args.buildDir||!args.outDir)throw new HarnessError('Existing build/new evidence required');
 const buildDir=path.resolve(args.buildDir);out=path.resolve(args.outDir);
 if(!inside(path.resolve('review/cs-major-upgrade/profile-builds'),buildDir)||!inside(path.resolve('review/cs-major-upgrade/evidence'),out)||fs.existsSync(out))throw new HarnessError('Own archive and NEW evidence child required');
 fs.mkdirSync(out,{recursive:true});
 const raw=fs.readFileSync(path.join(buildDir,'build-manifest.json')),manifest=JSON.parse(raw),bundle=createHash('sha256');let probe=false,animationProbe=false;
 for(const name of fs.readdirSync(path.join(buildDir,'assets')).filter(n=>n.endsWith('.js')).sort()){const bytes=fs.readFileSync(path.join(buildDir,'assets',name));bundle.update(name+'\0');bundle.update(bytes);probe ||= bytes.includes(Buffer.from('__ESMO_FPS_SCENE__'));animationProbe ||= bytes.includes(Buffer.from('readonlyAnimationPoseProbe'));}
 if(bundle.digest('hex')!==manifest.bundleSha256||!probe||!animationProbe)throw new HarnessError('Archive bundle or real read-only pose probe mismatch');
 const sourceFiles=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','--','src/battle/fps','src/screens/fps/CsMatchScreen.jsx','src/screens/fps/CsResultScreen.jsx','src/platform/contracts/CsMatchResult.js','public/assets/fps','public/audio/cs'],{encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/).filter(Boolean).sort(),current=createHash('sha256');
 for(const file of sourceFiles){current.update(file+'\0');current.update(fs.readFileSync(file));current.update('\0');}
 const currentSHA=current.digest('hex');if(currentSHA!==manifest.sourceFingerprint?.sha256||sourceFiles.length!==manifest.sourceFingerprint?.files)throw new HarnessError('Current product source differs from archive');
 evidence.archive={path:buildDir,manifestSha256:hash(raw),bundleSha256:manifest.bundleSha256,sourceFingerprint:manifest.sourceFingerprint,currentSHA,matchesCurrentSource:true,probeVersion:manifest.probeVersion};
 server=await preview({build:{outDir:buildDir},preview:{host:'127.0.0.1',port:0,open:false}});const url=`http://127.0.0.1:${server.httpServer.address().port}/ESMO-/`;
 result=await runGate({name:'Owner5 real two-round spawn freeze mixer',externalUrl:url,workspaceOnly:true,headless:false,timeoutMs:180000,evidenceOut:path.join(out,'harness.json'),async run({chrome,ck,sleep}){
  const check=(label,ok,detail)=>{ck(label,Boolean(ok),JSON.stringify(detail??{}));evidence.checks.push({label,ok:Boolean(ok),detail});};
  const native=selector=>clickFpsDNative({chrome,sleep,selector});
  const pause=async()=>{if(await chrome.evaluate('return window.__ESMO_FPS_SCENE__.liveRef.current.playing;'))await native('[data-testid="cs-playback-controls"] button[aria-label="暫停比賽播放"]');};
  await chrome.send('Emulation.setDeviceMetricsOverride',{width:1366,height:900,deviceScaleFactor:1,mobile:false});
  await chrome.navigate(`${url}?c5c=battle&map=mirage&seed=505001`);
  const until=Date.now()+150000;let ready=false;do{ready=await chrome.evaluate(`return Boolean(window.__ESMO_FPS_SCENE__?.players?.length===10&&window.__ESMO_FPS_SCENE__.players.every(p=>p.rigged?.mode==='rigged')&&typeof window.__ESMO_FPS_SCENE__.readonlyAnimationPoseProbe==='function');`);if(!ready)await sleep(200);}while(!ready&&Date.now()<until);
  if(!ready)throw new HarnessError('Actual ten rigged actors/pose probe readiness timeout');await pause();
  const windows=await chrome.evaluate(`const st=window.__ESMO_FPS_SCENE__,frames=st.liveRef.current.sim.frames,found=[],rounds=new Set();for(let i=0;i<frames.length;i++){const f=frames[i];if(!f.buyP||f.roundSec<4||f.roundSec>8||rounds.has(f.rnd)||f.players.length!==10||f.players.some(p=>p.dead))continue;const tail=frames.filter(a=>a.rnd===f.rnd&&a.roundSec>=f.roundSec&&a.roundSec<=f.roundSec+2);if(tail.length<4||tail.some(a=>!a.buyP))continue;rounds.add(f.rnd);found.push({index:i,round:f.rnd,roundSec:f.roundSec,id:f.players[0].id,savedWindow:tail.map(a=>({index:frames.indexOf(a),roundSec:a.roundSec,buyP:a.buyP}))});if(found.length===2)break;}return found;`);
  check('Two genuinely different-round mid-buy windows exist',windows.length===2&&windows[0].round!==windows[1].round,windows);if(windows.length!==2)return;
  for(const window of windows){
   await seekFpsNativeTimeline({chrome,sleep,index:window.index});await native(`[data-esmo-fps-player-card="${window.id}"]`);await native('[data-testid="match-speed-1"]');await sleep(200);
   const row={window,pre:await chrome.evaluate(read),samples:[]};evidence.series.push(row);
   const valid=!row.pre.playing&&row.pre.frame===window.index&&row.pre.buyP===true&&row.pre.round===window.round&&row.pre.selected===window.id&&row.pre.speed===1;
   check(`R${window.round+1} real native seek/selected/1x/buy precondition`,valid,{frame:row.pre.frame,round:row.pre.round,buyP:row.pre.buyP,selected:row.pre.selected,speed:row.pre.speed});if(!valid){row.status='PRECONDITION_FAILED';save();continue;}
   await native('[data-testid="cs-playback-controls"] button[aria-label="播放比賽"]');
   for(let n=0;n<12;n++){await sleep(100);row.samples.push(await chrome.evaluate(read));}await pause();row.post=await chrome.evaluate(read);
   check(`R${window.round+1} real playback remains inside same saved buy phase`,row.samples.every(s=>s.playing&&s.speed===1&&s.buyP===true&&s.round===window.round)&&row.samples.at(-1).frame>row.pre.frame&&row.samples.at(-1).atMs-row.samples[0].atMs>=900);
   const ids=row.pre.savedPlayers.map(p=>p.id).sort(),all=[row.pre,...row.samples,row.post];
   check(`R${window.round+1} all ten real living actors/probe identities present`,all.every(s=>s.savedPlayers.length===10&&s.savedPlayers.every(p=>!p.dead&&p.state==='BUY')&&s.actors.length===10&&s.poseProbe.length===10&&JSON.stringify(s.actors.map(p=>p.id).sort())===JSON.stringify(ids)&&JSON.stringify(s.poseProbe.map(p=>p.id).sort())===JSON.stringify(ids)));
   check(`R${window.round+1} actual lower mixer clips remain idle without walking/running`,all.every(s=>s.actors.every(p=>p.animation==='idle'&&p.layers?.lowerClip==='Idle_Loop'&&!/walk|sprint|run|strafe/i.test(p.layers.lowerClip))));
   const drift=ids.map(id=>{const a=row.pre.actors.find(p=>p.id===id),saved=row.pre.savedPlayers.find(p=>p.id===id),probe=row.pre.poseProbe.find(p=>p.id===id);return{id,worldRoot:Math.max(...all.map(s=>vectorDistance(a.worldRoot,s.actors.find(p=>p.id===id)?.worldRoot))),riggedRoot:Math.max(...all.map(s=>vectorDistance(a.riggedRoot,s.actors.find(p=>p.id===id)?.riggedRoot))),modelPosition:Math.max(...all.map(s=>vectorDistance(probe.modelPosition,s.poseProbe.find(p=>p.id===id)?.modelPosition))),savedPosition:Math.max(...all.map(s=>{const p=s.savedPlayers.find(p=>p.id===id);return p?Math.hypot(p.pos.x-saved.pos.x,p.pos.y-saved.pos.y):Infinity;}))};});row.drift=drift;
   check(`R${window.round+1} saved/root/model translation zero while idle breathing allowed`,drift.every(p=>[p.worldRoot,p.riggedRoot,p.modelPosition,p.savedPosition].every(value=>Number.isFinite(value)&&value<=1e-5)),drift);
   const mixerProgress=ids.map(id=>{const a=row.samples[0].poseProbe.find(p=>p.id===id),b=row.samples.at(-1).poseProbe.find(p=>p.id===id);return{id,start:a?.mixerTime,end:b?.mixerTime,delta:b?.mixerTime-a?.mixerTime};});row.mixerProgress=mixerProgress;
   check(`R${window.round+1} actual mixers advance instead of faking a frozen pose`,mixerProgress.every(p=>Number.isFinite(p.delta)&&p.delta>.5),mixerProgress);
   row.status='COLLECTED';save();
  }
  evidence.browserErrors={page:chrome.pageErrors,console:chrome.consoleLines.filter(x=>x.startsWith('[error]')),allConsole:chrome.consoleLines};check('Page/console errors zero',!evidence.browserErrors.page.length&&!evidence.browserErrors.console.length,evidence.browserErrors);save();
 }});
 if(result.evidence?.cleanup?.chromeClose&&(!result.evidence.cleanup.chromeClose.confirmed||result.evidence.cleanup.chromeClose.profileRemoved===false))result={...result,verdict:'HARNESS_FAIL',failurePhase:'Owned Chrome cleanup not confirmed'};
}catch(error){result={verdict:'HARNESS_FAIL',pass:0,fail:0,failurePhase:String(error.stack||error)};console.error(error.message);}
finally{
 if(server)try{await Promise.race([new Promise((resolve,reject)=>server.httpServer.close(error=>error?reject(error):resolve())),new Promise((_,reject)=>{const t=setTimeout(()=>reject(Error('Preview close timeout')),6000);t.unref();})]);}catch(error){result={...result,verdict:'HARNESS_FAIL',failurePhase:error.message};}
 evidence.result=result;if(out&&fs.existsSync(out))fs.writeFileSync(path.join(out,'gate.json'),JSON.stringify(evidence,null,2));
}
console.log(`Owner5 spawn freeze: ${result?.pass||0}/${(result?.pass||0)+(result?.fail||0)} RESULT=${result?.verdict||'HARNESS_FAIL'} REAL_DEVICE=NOT_RUN`);
await finishGate(result);
