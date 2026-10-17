import fs from 'node:fs';import path from 'node:path';import {preview} from 'vite';
import {runGate,finishGate,HarnessError} from './browser/harness.mjs';
import {clickFpsDNative,uploadFpsDNativeFile} from './browser/fpsReplayUiProbe.mjs';
import {seekFpsNativeTimeline} from './browser/fpsNativeTimeline.mjs';
const infernoOnly=process.argv.includes('--inferno-only');
const exportMirage=process.argv.includes('--mirage-export');
const out='review/cs-major-upgrade/evidence/owner4g-review-20261016/'+(exportMirage?'before-browser-mirage-export':infernoOnly?'before-browser-inferno-v3':'before-browser');
if(fs.existsSync(out))throw Error('Refuse overwrite');fs.mkdirSync(out,{recursive:true});
const dir='review/cs-major-upgrade/profile-builds/diagnostic-owner4f-review-20261016-1366';
const manifest=JSON.parse(fs.readFileSync(path.join(dir,'build-manifest.json')));
if(manifest.sourceFingerprint.sha256!=='307c9e99a2a0884374bbee4b986ee3593841834a5358e3cf76e05c536099cd11')throw Error('Not Owner4F baseline');
const server=await preview({build:{outDir:path.resolve(dir)},preview:{host:'127.0.0.1',port:0,open:false}}),url=`http://127.0.0.1:${server.httpServer.address().port}/ESMO-/`;
const evidence={manifest,cases:[],readOnly:true};let result;
try{result=await runGate({name:'Owner4G before actual POV and defuse geometry',externalUrl:url,workspaceOnly:true,headless:false,timeoutMs:540000,evidenceOut:out+'/harness.json',async run({chrome,ck,sleep}){
 const native=selector=>clickFpsDNative({chrome,sleep,selector});
 await chrome.send('Emulation.setDeviceMetricsOverride',{width:1366,height:900,deviceScaleFactor:1,mobile:false});
 for(const map of (exportMirage?['mirage']:infernoOnly?['inferno']:['mirage','dust2','inferno'])){
  await chrome.navigate(url+`?c5c=battle&map=${map}&seed=505002`);let ready=false;const end=Date.now()+150000;while(Date.now()<end){ready=await chrome.evaluate('return window.__ESMO_FPS_SCENE__?.players?.every(p=>p.rigged?.mode==="rigged");');if(ready)break;await sleep(200);}if(!ready)throw new HarnessError(map+' real rig precondition');
  if(await chrome.evaluate('return window.__ESMO_FPS_SCENE__.liveRef.current.playing;'))await native('[aria-label="暫停比賽播放"]');
  if(infernoOnly){
   const file='review/cs-major-upgrade/evidence/owner4g-review-20261016/before-inferno-505002-v2.replay.json.gz';
   if(!await chrome.evaluate("return document.querySelector('.fps-major-replay').open;"))await native('.fps-major-replay > summary');
   await uploadFpsDNativeFile({chrome,selector:'[data-testid="cs-replay-import"]',filePath:path.resolve(file)});
   const end=Date.now()+60000;let imported=false;while(Date.now()<end){imported=await chrome.evaluate("return Boolean(document.querySelector('[data-testid=\"cs-replay-mode\"]')&&window.__ESMO_FPS_SCENE__.liveRef.current.sim.mapKey==='inferno');");if(imported)break;await sleep(250);}if(!imported){fs.writeFileSync(out+'/import-error.json',JSON.stringify(await chrome.evaluate("return {error:document.querySelector('[data-testid=\"cs-replay-error\"]')?.textContent,text:document.body.innerText.slice(-2500)};"),null,2));throw new HarnessError('Before actual Inferno native replay import');}
   evidence.savedReplay=JSON.parse(fs.readFileSync('review/cs-major-upgrade/evidence/owner4g-review-20261016/before-inferno-fixture-v2.json'));
  }
  const scenario=await chrome.evaluate(`const frames=window.__ESMO_FPS_SCENE__.liveRef.current.sim.frames;let best=null;for(let i=0;i<frames.length;i++){const f=frames[i],p=f.players.find(p=>p.id===f.defuse?.defuserId);if(p&&f.c4pos){const distance=Math.hypot(p.pos.x-f.c4pos.x,p.pos.y-f.c4pos.y);if(!best||distance>best.distance)best={index:i,id:p.id,distance,pos:p.pos,bomb:f.c4pos};}}return best;`);
  if(!scenario)throw new HarnessError(map+' actual defuse scenario not triggered');
  ck(map+' before distant defuse reproduced',scenario.distance>3,JSON.stringify(scenario));
  await seekFpsNativeTimeline({chrome,sleep,index:scenario.index});await native(`[data-esmo-fps-player-card="${scenario.id}"]`);await native('[data-testid="cs-camera-preset-overview"]');
  await chrome.evaluate(`document.querySelector('canvas').scrollIntoView({block:'center',behavior:'instant'});return true;`);await sleep(300);
  const shot=await chrome.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(out+'/'+map+'-distance.png',Buffer.from(shot.data,'base64'));
  evidence.cases.push({map,kind:'distance',...scenario});
  if(map==='mirage'){
   const index=await chrome.evaluate(`const frames=window.__ESMO_FPS_SCENE__.liveRef.current.sim.frames;return frames.findIndex(f=>f.planted&&f.defuse?.progress>0&&f.players.some(p=>p.id==='t4'&&!p.dead&&p.ammo>0&&!p.blindSec)&&f.smokes?.length);`);
   if(index<0)throw new HarnessError('Mirage before smoke+defuse POV precondition');
   await seekFpsNativeTimeline({chrome,sleep,index});await native('[data-esmo-fps-player-card="t4"]');await native('[data-testid="cs-camera-preset-pov"]');
   await chrome.evaluate(`document.querySelector('canvas').scrollIntoView({block:'center',behavior:'instant'});return true;`);await sleep(500);
   const state=await chrome.evaluate(`const st=window.__ESMO_FPS_SCENE__,l=st.liveRef.current,f=l.sim.frames[l.fIdx],p=f.players.find(p=>p.id==='t4'),ct=f.players.find(p=>p.id===f.defuse.defuserId),entity=st.players.find(p=>p.id===ct.id),v=entity.g.position.clone();v.y+=1;v.project(st.camera);return {index:l.fIdx,round:f.rnd,sec:f.roundSec,actor:p,target:ct,smokes:f.smokes,defuse:f.defuse,projectedTarget:{x:v.x,y:v.y,z:v.z},pov:st.povWeaponDiagnostics,utility:st.utilityFxEvidence};`);
   const shot=await chrome.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(out+'/mirage-smoke-pov.png',Buffer.from(shot.data,'base64'));fs.writeFileSync(out+'/mirage-smoke-pov.json',JSON.stringify(state,null,2));evidence.cases.push({map,kind:'smoke-pov',index:state.index,projectedTarget:state.projectedTarget});
   ck('Mirage real POV target inside clip volume',Math.abs(state.projectedTarget.x)<=1&&Math.abs(state.projectedTarget.y)<=1&&state.projectedTarget.z<=1,JSON.stringify(evidence.cases.at(-1)));
   if(exportMirage){
    await chrome.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:path.resolve(out),eventsEnabled:true});
    if(!await chrome.evaluate("return document.querySelector('.fps-major-replay').open;"))await native('.fps-major-replay > summary');
    await native('[data-testid="cs-replay-export"]');
    const until=Date.now()+120000;let file=null;while(Date.now()<until){file=fs.readdirSync(out).find(f=>f.endsWith('.json.gz'));if(file)break;await sleep(250);}if(!file)throw new HarnessError('Actual old Mirage native Replay download');
    evidence.exportedReplay={file:path.resolve(out,file),bytes:fs.statSync(path.join(out,file)).size,source:'native old product UI export, no frame mutation'};
   }
  }
 }
}});}finally{await new Promise(r=>server.httpServer.close(r));fs.writeFileSync(out+'/gate.json',JSON.stringify({...evidence,result},null,2));}
await finishGate(result);
