import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {gunzipSync} from 'node:zlib';import {preview} from 'vite';
import {HarnessError} from './harness.mjs';
import {clickFpsDNative,uploadFpsDNativeFile} from './fpsReplayUiProbe.mjs';
import {seekFpsNativeTimeline} from './fpsNativeTimeline.mjs';
import {readCsReplay} from '../../src/battle/fps/fpsReplay.js';

export async function networkArchive(buildDir){
 const dir=path.resolve(buildDir);if(!dir.startsWith(path.resolve('review/cs-major-upgrade/profile-builds')+path.sep))throw new HarnessError('Archive outside own workspace');
 const manifest=JSON.parse(fs.readFileSync(dir+'/build-manifest.json')),hash=createHash('sha256');
 for(const file of fs.readdirSync(dir+'/assets').filter(f=>f.endsWith('.js')).sort()){hash.update(file+'\0');hash.update(fs.readFileSync(dir+'/assets/'+file));}
 if(hash.digest('hex')!==manifest.bundleSha256)throw new HarnessError('Immutable archive checksum mismatch');
 const server=await preview({build:{outDir:dir},preview:{host:'127.0.0.1',port:0,open:false}});
 return {manifest,server,url:`http://127.0.0.1:${server.httpServer.address().port}/ESMO-/`,async close(){await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new HarnessError('Preview cleanup timeout')),6000);server.httpServer.close(e=>{clearTimeout(timer);e?reject(e):resolve();});});}};
}
export function networkFixture(file,outDir,name){
 const bytes=fs.readFileSync(file),wire=(file.endsWith('.gz')?gunzipSync(bytes):bytes).toString();
 const replay=readCsReplay(wire),nativeFile=path.resolve(outDir,name+(file.endsWith('.gz')?'.replay.json.gz':'.replay.json'));fs.writeFileSync(nativeFile,file.endsWith('.gz')?bytes:Buffer.from(wire),{flag:'wx'});
 return {replay,nativeFile,source:file,sha256:createHash('sha256').update(bytes).digest('hex')};
}
export async function networkImport({chrome,sleep,archive,fixture,width=1366}){
 const restoreView=()=>chrome.evaluate('window.__ESMO_FPS_SCENE__?.renderer.domElement.scrollIntoView({block:"center"});return true;');
 const native=async selector=>{await clickFpsDNative({chrome,sleep,selector});await restoreView();};
 await chrome.send('Emulation.setDeviceMetricsOverride',{width,height:width<600?844:900,deviceScaleFactor:1,mobile:width<600});
 await chrome.navigate(archive.url+'?c5c=battle&map=mirage&seed=505001&scene='+fixture.replay.metadata.sceneVersion);
 const wait=async(fn,what)=>{const end=Date.now()+150000;while(Date.now()<end){if(await chrome.evaluate(fn))return;if(what==='Native saved Replay import'){const error=await chrome.evaluate('return document.querySelector("[data-testid=cs-replay-error]")?.textContent||null;');if(error){fs.writeFileSync(path.join(path.dirname(fixture.nativeFile),'import-rejection.json'),JSON.stringify({error,nativeFile:fixture.nativeFile,bytes:fs.statSync(fixture.nativeFile).size},null,2),{flag:'wx'});const shot=await chrome.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(path.dirname(fixture.nativeFile),'import-rejection.png'),Buffer.from(shot.data,'base64'),{flag:'wx'});throw new HarnessError(what+': '+error);}}await sleep(200);}throw new HarnessError(what);};
 const ready='return Boolean(window.__ESMO_FPS_SCENE__?.players?.length===10&&window.__ESMO_FPS_SCENE__.players.every(p=>p.rigged?.mode==="rigged")&&window.__ESMO_FPS_SCENE__.c3Environment?.summary.atlasLoaded);';
 await wait(ready,'Native battle mount/real assets readiness');
 if(await chrome.evaluate('return window.__ESMO_FPS_SCENE__.liveRef.current.playing;'))await native('[aria-label="暫停比賽播放"]');
 if(!await chrome.evaluate('return document.querySelector(".fps-major-replay").open;'))await native('.fps-major-replay > summary');
 await uploadFpsDNativeFile({chrome,selector:'.fps-major-replay input[type="file"]',filePath:fixture.nativeFile});
 await wait('return Boolean(document.querySelector("[data-testid=cs-replay-mode]"));','Native saved Replay import');await wait(ready,'Imported assets readiness');
 if(await chrome.evaluate('return window.__ESMO_FPS_SCENE__.liveRef.current.playing;'))await native('[aria-label="暫停比賽播放"]');
 await native('[data-testid="match-speed-1"]');await native('[data-testid="cs-camera-preset-overview"]');
 await restoreView();
 return {native,async seek(index){await seekFpsNativeTimeline({chrome,sleep,index});await restoreView();await sleep(120);},async pause(){if(await chrome.evaluate('return window.__ESMO_FPS_SCENE__.liveRef.current.playing;'))await native('[aria-label="暫停比賽播放"]');}};
}
export const networkWatchScript=`
 const st=window.__ESMO_FPS_SCENE__,cores=[];st.scene.traverse(o=>{if(o.name==='fps-smoke-core')cores.push(o);});
 const watch=window.__NETWORK_WATCH={frames:0,rounds:[],smokeFrames:0,mismatches:[],stages:[],last:-1,running:true};
 function tick(){if(!watch.running)return;const l=st.liveRef.current,f=l.sim.frames[l.fIdx],n=l.sim.frames[l.fIdx+1],sub=l.playing?Math.max(0,Math.min(1,st.subT||0)):0;
  if(l.fIdx!==watch.last){watch.last=l.fIdx;watch.frames++;if(!watch.rounds.includes(f.rnd))watch.rounds.push(f.rnd);
   const saved=f.smokes.filter(s=>s.tl>0),visible=cores.filter(o=>o.visible);
   const bad=saved.length!==visible.length||visible.some(o=>{const s=saved.find(c=>c.id===o.userData.smokeId);if(!s)return true;
    const next=n?.rnd===f.rnd?n.smokes.find(c=>c.id===s.id):null,t=sub,smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
    const endpoint=next?.radius??6*Math.min(smooth(((s.age||0)+.25)/1.5),smooth(((s.tl||0)-.25)/6));
    const radius=s.model==='continuous.v2'?(s.radius??6)+(endpoint-(s.radius??6))*t:(s.radius??6);
    return Math.abs(o.scale.x-radius)>1e-7||Math.abs(o.userData.authoritativeRadius-radius)>1e-7;});
   if(saved.length)watch.smokeFrames++;
   for(const s of saved){const stage=s.age<(s.model==='continuous.v2'?1.5:.45)?'grow':s.tl>6?'hold':'dissipate';if(!watch.stages.includes(stage))watch.stages.push(stage);}
   if(bad&&watch.mismatches.length<64)watch.mismatches.push({index:l.fIdx,round:f.rnd,sub,clouds:saved.length,visible:visible.length});
  }requestAnimationFrame(tick);
 }requestAnimationFrame(tick);return true;`;
export async function networkStartVideo(chrome){
 return chrome.evaluate(`const canvas=window.__ESMO_FPS_SCENE__.renderer.domElement,stream=canvas.captureStream(12),type=['video/webm;codecs=vp8','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));if(!type)throw Error('Browser WebM recorder unavailable');const recorder=new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:1500000}),capture=window.__NETWORK_VIDEO={stream,recorder,chunks:[],started:performance.now(),type};recorder.ondataavailable=e=>{if(e.data.size)capture.chunks.push(e.data);};recorder.start(1000);return {type,width:canvas.width,height:canvas.height,fps:12};`);
}
export async function networkStopVideo(chrome,file){
 const value=await chrome.evaluate(`const c=window.__NETWORK_VIDEO;await new Promise(resolve=>{c.recorder.onstop=resolve;c.recorder.stop();});c.stream.getTracks().forEach(t=>t.stop());const blob=new Blob(c.chunks,{type:c.type}),data=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(blob);});return {data,bytes:blob.size,durationMs:performance.now()-c.started,type:c.type};`);
 fs.writeFileSync(file,Buffer.from(value.data,'base64'),{flag:'wx'});const {data,...meta}=value;return {...meta,file};
}
