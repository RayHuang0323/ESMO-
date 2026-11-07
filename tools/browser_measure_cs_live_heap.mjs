import fs from 'node:fs';import assert from 'node:assert/strict';import{createHash}from'node:crypto';
import{runGate,finishGate}from'./browser/harness.mjs';
import{networkArchive,networkFixture,foundryReviewImport}from'./browser/fpsFoundryReview.mjs';
import{uploadFpsDNativeFile}from'./browser/fpsReplayUiProbe.mjs';
const [rev,buildRev]=process.argv.slice(2);assert.match(rev||'',/^r\d+$/);assert.match(buildRev||'',/^r\d+$/);
const out='review/cs-integration-20261107/evidence/live-heap-'+rev;assert(!fs.existsSync(out));fs.mkdirSync(out);
const archive=await networkArchive('review/cs-major-upgrade/profile-builds/foundry-diagnostic-'+buildRev+'-20261024');
const fixture=networkFixture('review/cs-major-upgrade/evidence/foundry-20261024/match-foundry-execute-b-830102-r14.replay.json.gz',out,'foundry');
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');const expected=fixture.replay.simulation.frames.map(hash);
const report={build:archive.manifest,fixture:fixture.sha256,heap:[],workers:[],gc:[],markers:[],cycles:[],limitations:'100ms觀測非無遺漏峰值；coarseHeap為Chrome未開precise flag的階段輔助。Tracing/Debugger會干預；無強制GC。native backing store非解壓器完整RAM。'};let result;
try{result=await runGate({name:'CS simultaneous live heap',externalUrl:archive.url,workspaceOnly:true,headless:false,timeoutMs:480000,evidenceOut:out+'/harness.json',async run({chrome,ck,sleep}){
 report.browser=await chrome.send('Browser.getVersion');await chrome.send('Performance.enable');
 let seq=0;const pending=new Map(),sessions=new Map();
 const child=(sessionId,method)=>new Promise((resolve,reject)=>{const id=++seq,t=setTimeout(()=>{pending.delete(id);reject(Error('worker response timeout'));},3000);pending.set(id,{resolve:v=>{clearTimeout(t);resolve(v)},reject});chrome.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id,method})}).catch(e=>{clearTimeout(t);pending.delete(id);reject(e)});});
 chrome.on('Target.receivedMessageFromTarget',p=>{const m=JSON.parse(p.message),w=pending.get(m.id);if(w){pending.delete(m.id);m.error?w.reject(Error(m.error.message)):w.resolve(m.result)}});
 chrome.on('Target.attachedToTarget',p=>{if(p.targetInfo.type==='worker'){sessions.set(p.sessionId,p.targetInfo.targetId);report.workers.push({event:'attached',at:Date.now(),id:p.targetInfo.targetId});}});
 chrome.on('Target.detachedFromTarget',p=>{report.workers.push({event:'detached',at:Date.now(),id:sessions.get(p.sessionId)});sessions.delete(p.sessionId);});
 await chrome.send('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:false,flatten:false});
 const trace=out+'/trace.jsonl';fs.writeFileSync(trace,'');
 chrome.on('Tracing.dataCollected',p=>{fs.appendFileSync(trace,JSON.stringify(p.value)+'\n');for(const e of p.value){if(e.name==='TimeStamp')report.markers.push(e);if(/GC/.test(e.name)&&e.args&&(e.args.usedHeapSizeBefore||e.args.usedHeapSizeAfter))report.gc.push(e);}});
 let traceDone=false;chrome.on('Tracing.tracingComplete',()=>{traceDone=true});
 await chrome.send('Tracing.start',{categories:'devtools.timeline,v8,disabled-by-default-v8.gc,disabled-by-default-devtools.timeline',transferMode:'ReportEvents'});
 let busy=false,active=true,segment='normal-mount';const poll=async()=>{if(busy||!active)return;busy=true;try{const h=await chrome.send('Runtime.getHeapUsage');report.heap.push({at:Date.now(),segment,...h});for(const [sid,id]of sessions){try{report.workers.push({event:'heap',at:Date.now(),id,...await child(sid,'Runtime.getHeapUsage')});}catch(e){report.workers.push({event:'unavailable',id,error:e.message})}}}finally{busy=false}};
 const timer=setInterval(()=>void poll().catch(e=>report.pollError=e.message),100);
 const ui=await foundryReviewImport({chrome,sleep,archive,fixture,beforeImport:async()=>{segment='import-0';await chrome.evaluate('window.__csNormalRef=new WeakRef(window.__ESMO_FPS_SCENE__.liveRef.current.sim);window.__csHeapStages=[];return true;');}});
 for(let i=0;i<3;i++){
  const imported=await chrome.evaluate('const s=window.__ESMO_FPS_SCENE__,l=s.liveRef.current;return {at:Date.now(),perfAt:performance.now(),frames:l.sim.frames.length,rigged:s.players.filter(p=>p.rigged?.mode==="rigged").length,drift:s.c5a1AuthoritativeDriftMax,stages:window.__csHeapStages};');report.cycles.push({cycle:i,imported});ck('import scene '+i,imported.frames===expected.length&&imported.rigged===10&&imported.drift<1e-6);
  segment='return-'+i;await chrome.evaluate('console.timeStamp("CS_HEAP:return-start");return true;');
  await ui.native('[data-testid=cs-replay-exit]');await ui.pause();const returned=await chrome.evaluate('const s=window.__ESMO_FPS_SCENE__;return {sameOriginal:window.__csNormalRef.deref()===s.liveRef.current.sim,replayMode:!!document.querySelector("[data-testid=cs-replay-mode]"),at:Date.now()};');report.cycles.at(-1).returned=returned;ck('original cache same object '+i,returned.sameOriginal&&!returned.replayMode);
  if(i===2)break;
  await chrome.evaluate('window.__csHeapStages=[];return true;');segment='import-'+(i+1);
  await uploadFpsDNativeFile({chrome,selector:'.fps-major-replay input[type=file]',filePath:fixture.nativeFile});let ready=false;for(let k=0;k<300;k++){await sleep(100);ready=await chrome.evaluate('return !!document.querySelector("[data-testid=cs-replay-mode]")&&window.__csHeapStages?.some(s=>s.stage==="read-complete")&&window.__ESMO_FPS_SCENE__?.presentationAssetsReady&&window.__ESMO_FPS_SCENE__?.presentationReady&&!document.querySelector("[data-testid=fps-map-preparing]")&&window.__ESMO_FPS_SCENE__?.players?.every(p=>p.rigged?.mode==="rigged");');if(ready)break;}assert(ready,'import completed');await ui.pause();
 }
 active=false;clearInterval(timer);await chrome.send('Tracing.end');for(let k=0;k<100&&!traceDone;k++)await sleep(50);
 report.postWindowWorkerGC=[];for(const [sid,id]of sessions){try{const before=await child(sid,'Runtime.getHeapUsage');await child(sid,'HeapProfiler.collectGarbage');const after=await child(sid,'Runtime.getHeapUsage');report.postWindowWorkerGC.push({id,before,after});}catch(e){report.postWindowWorkerGC.push({id,error:e.message});}}
 // 完整性檢查移到全部記憶體窗口之後，以免hash的配置污染下一輪。
 await uploadFpsDNativeFile({chrome,selector:'.fps-major-replay input[type=file]',filePath:fixture.nativeFile});for(let k=0;k<300;k++){await sleep(100);if(await chrome.evaluate('return !!document.querySelector("[data-testid=cs-replay-mode]");'))break;}await ui.pause();
 const actual=await chrome.evaluate('const enc=new TextEncoder(),frames=window.__ESMO_FPS_SCENE__.liveRef.current.sim.frames,out=[];for(const f of frames){const b=await crypto.subtle.digest("SHA-256",enc.encode(JSON.stringify(f)));out.push([...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join(""));}return out;');ck('all frame fields SHA256 outside measurement',actual.length===expected.length&&actual.every((h,n)=>h===expected[n]));await ui.native('[data-testid=cs-replay-exit]');await ui.pause();
 await chrome.send('Target.setAutoAttach',{autoAttach:false,waitForDebuggerOnStart:false,flatten:false});ck('no page errors',!chrome.pageErrors.length);ck('heap observations captured',report.heap.length>10);
 }});}finally{await archive.close();fs.writeFileSync(out+'/audit.json',JSON.stringify({...report,result},null,2));}await finishGate(result);
