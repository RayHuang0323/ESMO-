import fs from 'node:fs';
import {runGate,finishGate} from './browser/harness.mjs';
import {networkArchive,networkFixture,foundryReviewImport} from './browser/fpsFoundryReview.mjs';
import {uploadFpsDNativeFile} from './browser/fpsReplayUiProbe.mjs';
const out='review/cs-integration-20261107/evidence/allocation-r1';if(fs.existsSync(out))throw Error('不得覆寫');fs.mkdirSync(out);
const archive=await networkArchive('review/cs-major-upgrade/profile-builds/foundry-diagnostic-r31-20261024');
const fixture=networkFixture('review/cs-major-upgrade/evidence/foundry-20261024/match-foundry-execute-b-830102-r14.replay.json.gz',out,'foundry');
const report={build:archive.manifest,fixture:fixture.sha256,profiles:[],scope:'V8 Allocation Sampling，包含已GC樣本，非全體配置精確值／retained bytes；無強制GC。native解壓及Worker未歸因。'};let result;
try{result=await runGate({name:'CS Allocation Sampling',externalUrl:archive.url,workspaceOnly:true,headless:false,timeoutMs:480000,evidenceOut:out+'/harness.json',async run({chrome,ck,sleep}){
 await chrome.send('HeapProfiler.enable');await chrome.send('Performance.enable');
 const start=()=>chrome.send('HeapProfiler.startSampling',{samplingInterval:32768,includeObjectsCollectedByMajorGC:true,includeObjectsCollectedByMinorGC:true});
 const heap=async()=>Object.fromEntries((await chrome.send('Performance.getMetrics')).metrics.filter(x=>['JSHeapUsedSize','JSHeapTotalSize'].includes(x.name)).map(x=>[x.name,x.value]));
 const stop=async label=>{const {profile}=await chrome.send('HeapProfiler.stopSampling');fs.writeFileSync(out+'/'+label+'.heapprofile',JSON.stringify(profile));const sums={decode:0,join:0,jsonParse:0,playerPool:0,foundryPool:0,other:0};const walk=(n,cat='other')=>{const name=n.callFrame.functionName;if(name==='allocationDecode')cat='decode';if(name==='allocationJoin')cat='join';if(name==='allocationJSONParse')cat='jsonParse';if(name==='unpackCsReplayPlayers')cat='playerPool';if(name==='unpackFoundryReplayExtras')cat='foundryPool';sums[cat]+=n.selfSize;for(const c of n.children||[])walk(c,cat);};walk(profile.head);report.profiles.push({label,sampledBytes:sums,heap:await heap(),samples:profile.samples.length});fs.writeFileSync(out+'/progress.json',JSON.stringify(report,null,2));};
 await start();
 const ui=await foundryReviewImport({chrome,sleep,archive,fixture,beforeImport:async()=>{await stop('normal-mount');await start();}});
 await stop('import-0');
 for(let i=0;i<3;i++){
  await start();await ui.native('[data-testid=cs-replay-exit]');await ui.pause();await stop('return-'+i);
  if(i===2)break;
  await start();await uploadFpsDNativeFile({chrome,selector:'.fps-major-replay input[type=file]',filePath:fixture.nativeFile});let ready=false;for(let k=0;k<300;k++){await sleep(100);ready=await chrome.evaluate('return !!document.querySelector("[data-testid=cs-replay-mode]")&&!document.querySelector(".fps-major-replay input[type=file]").disabled;');if(ready)break;}ck('重新匯入完成 '+i,ready);await ui.pause();await stop('import-'+(i+1));
 }
 ck('三次匯入採樣存在',report.profiles.filter(x=>x.label.startsWith('import-')).length===3);
 ck('JSON parse有實際樣本',report.profiles.some(x=>x.sampledBytes.jsonParse>0));
 ck('原場已返回、十人且位置無偏差',await chrome.evaluate('const s=window.__ESMO_FPS_SCENE__;return !document.querySelector("[data-testid=cs-replay-mode]")&&s.players.length===10&&s.c5a1AuthoritativeDriftMax<1e-6;'));
 ck('無頁面錯誤',chrome.pageErrors.length===0);
 }});}finally{await archive.close();fs.writeFileSync(out+'/audit.json',JSON.stringify({...report,result},null,2));}await finishGate(result);
