import fs from 'node:fs';
import assert from 'node:assert/strict';
import {runGate,finishGate} from './browser/harness.mjs';
import {networkArchive,networkFixture,foundryReviewImport} from './browser/fpsFoundryReview.mjs';
import {uploadFpsDNativeFile,clickFpsDNative} from './browser/fpsReplayUiProbe.mjs';
const rev=process.argv[2];assert.match(rev||'',/^r\d+$/);
const out='review/cs-integration-20261107/evidence/phase3-reset-'+rev;assert(!fs.existsSync(out));fs.mkdirSync(out,{recursive:true});
const archive=await networkArchive('review/cs-major-upgrade/profile-builds/'+(process.argv[3]||'foundry-diagnostic-r1-20261024'));
const prior=JSON.parse(fs.readFileSync('review/cs-major-upgrade/evidence/cs-map-v2-release-gate-20261107/performance-r1/audit.json'));
const report={build:archive.manifest,plannedCyclesPerMap:Number(process.argv[4]||3),cycles:[],scope:'桌機三圖原生匯入／返回；次數見plannedCyclesPerMap。無強制GC，非完整長局或Android。'};let result;
try{result=await runGate({name:'CS reset seek 與重複卸載',externalUrl:archive.url,workspaceOnly:true,headless:false,timeoutMs:600000,evidenceOut:out+'/harness.json',async run({chrome,ck,sleep}){
 await chrome.send('Performance.enable');
 const memory=async()=>{const m=await chrome.send('Performance.getMetrics');return Object.fromEntries(m.metrics.filter(x=>['JSHeapUsedSize','JSHeapTotalSize','Nodes','Documents'].includes(x.name)).map(x=>[x.name,x.value]));};
 const state=()=>chrome.evaluate('const s=window.__ESMO_FPS_SCENE__,l=s.liveRef.current;return{replayMode:!!document.querySelector("[data-testid=cs-replay-mode]"),index:l.fIdx,slider:Number(document.querySelector("input[type=range]").value),drift:s.c5a1AuthoritativeDriftMax,render:s.renderer.info.render.frame,rigged:s.players.filter(p=>p.rigged?.mode==="rigged").length,memory:{...s.renderer.info.memory}};');
 for(const map of ['confluence','dune','foundry']){
  const file=map==='foundry'?'review/cs-major-upgrade/evidence/foundry-20261024/match-foundry-execute-b-830102-r14.replay.json.gz':'review/cs-major-upgrade/evidence/cs-map-v2-release-gate-20261107/performance-r1/'+map+'-match.replay.json.gz';
  const fixture=networkFixture(file,out,map);assert.equal(fixture.sha256,prior.samples.find(x=>x.map===map&&!x.synthetic).fixtureSha256);
  const ui=await foundryReviewImport({chrome,sleep,archive,fixture});
  for(let cycle=0;cycle<Number(process.argv[4]||3);cycle++){
   await ui.pause();const reset=await state();ck(map+' replay reset '+cycle,reset.index===0&&reset.slider===0);
   const row={map,cycle,sha:fixture.sha256,reset,importMemory:await memory(),seeks:[]};
   for(const index of [24,fixture.replay.simulation.frames.length-2,12]){await ui.seek(index);const a=await state();await sleep(150);const b=await state();row.seeks.push(b);if(index===24){const shot=await chrome.send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});fs.writeFileSync(out+"/"+map+"-"+cycle+".png",Buffer.from(shot.data,"base64"));}ck(map+' native seek '+index,b.index===index&&b.slider===index&&b.render>a.render&&b.drift<1e-6&&b.rigged===10);}
   await ui.native('[data-testid=cs-replay-exit]');await ui.pause();const returned=await state();const originalRestored=await chrome.evaluate('const sim=window.__ESMO_FPS_SCENE__.liveRef.current.sim;if(!window.__phase3Normal)window.__phase3Normal=new WeakRef(sim);return window.__phase3Normal.deref()===sim;');row.returned=returned;row.originalRestored=originalRestored;ck(map+' original reset '+cycle,!returned.replayMode&&originalRestored&&returned.index===returned.slider&&returned.rigged===10&&returned.drift<1e-6);
   await sleep(1500);row.returnMemory=await memory();report.cycles.push(row);fs.writeFileSync(out+'/progress.json',JSON.stringify(report,null,2));
   if(cycle<Number(process.argv[4]||3)-1){await uploadFpsDNativeFile({chrome,selector:'.fps-major-replay input[type=file]',filePath:fixture.nativeFile});let ready=false;for(let n=0;n<100;n++){await sleep(100);ready=await chrome.evaluate('return !!document.querySelector("[data-testid=cs-replay-mode]")&&window.__ESMO_FPS_SCENE__.liveRef.current.fIdx===0;');if(ready)break;}assert(ready,'reimport must finish');}
  }
  await chrome.evaluate('const s=window.__ESMO_FPS_SCENE__;window.__rgExit={canvas:s.renderer.domElement,env:s.c3Environment.group};return true;');await clickFpsDNative({chrome,sleep,selector:'[data-testid=leave-active-match]'});await sleep(1000);
  const exit=await chrome.evaluate('const e=window.__rgExit;const r={connected:e.canvas.isConnected,children:e.env.children.length,probe:!!window.__ESMO_FPS_SCENE__};delete window.__rgExit;return r;');ck(map+' unload',!exit.connected&&exit.children===0&&!exit.probe);await sleep(10000);report.cycles.at(-1).exit={...exit,memory:await memory()};
 }
 ck('無頁面錯誤',!chrome.pageErrors.length&&!chrome.consoleLines.some(l=>l.startsWith('[error]')));
 }});}finally{await archive.close();fs.writeFileSync(out+'/audit.json',JSON.stringify({...report,result},null,2));}await finishGate(result);
