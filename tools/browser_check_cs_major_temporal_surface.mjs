#!/usr/bin/env node
// Owner7 diagnostic collection only. Existing scene-probe production archive required; never builds.
// Native pause/timeline/player/camera/orbit. No simulation patch, position/result override or asset edits.
// Harness PASS means temporal collection/preconditions passed, not visual flicker closure.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {preview} from 'vite';
import {runGate,finishGate,HarnessError} from './browser/harness.mjs';
import {clickFpsDNative} from './browser/fpsReplayUiProbe.mjs';
import {seekFpsNativeTimeline} from './browser/fpsNativeTimeline.mjs';

const sha=x=>createHash('sha256').update(x).digest('hex'),args={},started=Date.now();
let result,out,server;
const evidence={schema:'cs-major-temporal-surface-diagnostic.v1',visualClosure:'OWNER_REVIEW_REQUIRED',formalDashboardFlow:'NOT_RUN',realDevice:'NOT_RUN',buildRun:false,savedPngs:0,series:[],checks:[]};
const within=(root,file)=>{const rel=path.relative(root,file);return rel&&!rel.startsWith('..')&&!path.isAbsolute(rel);};
// Diagnostic stage persistence only; readiness predicate, timeout and assertions are unchanged.
function checkpoint(phase,detail={}){
 const row={phase,checkedAt:new Date().toISOString(),elapsedMs:Date.now()-started,nodePid:process.pid,parentPid:process.ppid,nodeMemory:process.memoryUsage(),...detail};
 evidence.stageHistory ||= [];evidence.stageHistory.push(row);
 if(out&&fs.existsSync(out))fs.writeFileSync(path.join(out,'stage-checkpoint.json'),JSON.stringify({schema:'cs-temporal-stage-checkpoint.v1',diagnosticOnly:true,latest:row,history:evidence.stageHistory},null,2));
 console.log('[stage] '+phase+' '+JSON.stringify(detail));return row;
}
function ownedChromeResources(pid){
 try{const script=`[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); $p=Get-CimInstance Win32_Process -Filter 'ProcessId=${Number(pid)}'; $profileArg=[regex]::Match($p.CommandLine,'--user-data-dir=("[^"]+"|\\S+)').Groups[1].Value; $m=Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory; [pscustomobject]@{pid=$p.ProcessId;parent=$p.ParentProcessId;createdUtc=$p.CreationDate.ToUniversalTime().ToString('o');profileArgument=$profileArg;workingBytes=$p.WorkingSetSize;virtualBytes=$p.VirtualSize;availableMB=$m.AvailableMBytes;committedBytes=$m.CommittedBytes;commitLimit=$m.CommitLimit} | ConvertTo-Json -Compress`;
  return JSON.parse(execFileSync('powershell.exe',['-NoProfile','-Command',script],{encoding:'utf8',windowsHide:true,timeout:5000}).replace(/^\uFEFF/,''));
 }catch(error){return{status:'UNKNOWN',error:error.message};}
}
function decoder(){
 const file='tools/audit_cs_major_pixels.mjs',source=fs.readFileSync(file,'utf8'),a=source.indexOf('const PNG_SIGNATURE ='),b=source.indexOf('function pngFiles(directory)');
 if(a<0||b<a||source.split('function decodePng(bytes)').length!==2)throw new HarnessError('Existing verified PNG decoder marker drift');
 evidence.pixelDecoder={path:file,sha256:sha(source),reuse:'Exact existing decoder definitions via read-only VM; original tool is not executed or changed'};
 return vm.runInNewContext(source.slice(a,b)+'\n;decodePng',{Buffer,zlib});
}
function delta(a,b){let sum=0,changed=0;for(let i=0;i<a.length;i+=3){const d=Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]));sum+=d;if(d>12)changed++;}return{maxChannelMean:sum/(a.length/3),changedOver12Fraction:changed/(a.length/3)};}
function writeMovie(file,frames,meta){
 const compressed=zlib.gzipSync(Buffer.concat(frames)),payload=compressed.toString('base64');
 const html=`<!doctype html><meta charset="utf-8"><title>CS surface temporal diagnostic</title><style>body{background:#101820;color:#dde5eb;font:16px system-ui;margin:30px}canvas{image-rendering:pixelated;width:480px;height:320px;border:1px solid #72818c}pre{white-space:pre-wrap;max-width:1000px}button{padding:10px}</style><h1>${meta.map} / ${meta.mode}</h1><p>真連續像素crop；不是全場畫質或真手機驗收。樣本phase標示固定幀／拖曳／原生播放。合理場景變化亦有像素差，不能據此判定閃爍。點選播放可檢視時序。</p><canvas width="96" height="64"></canvas><p><button id="play">暫停／播放</button> <input id="frame" type="range" min="0" max="${frames.length-1}" value="0"> <span id="label"></span></p><pre id="meta"></pre><script>const data=${JSON.stringify(meta)},payload=${JSON.stringify(payload)};let playing=true,index=0;const raw=Uint8Array.from(atob(payload),x=>x.charCodeAt(0)),stream=new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip'));new Response(stream).arrayBuffer().then(buffer=>{const pixels=new Uint8Array(buffer),ctx=document.querySelector('canvas').getContext('2d'),img=ctx.createImageData(96,64),slider=document.getElementById('frame');function show(){const start=index*96*64*3;for(let p=0;p<96*64;p++){img.data[p*4]=pixels[start+p*3];img.data[p*4+1]=pixels[start+p*3+1];img.data[p*4+2]=pixels[start+p*3+2];img.data[p*4+3]=255;}ctx.putImageData(img,0,0);slider.value=index;document.getElementById('label').textContent=(index+1)+'/'+data.samples.length+' '+data.samples[index].phase;document.getElementById('meta').textContent=JSON.stringify(data.samples[index],null,2);}slider.oninput=()=>{playing=false;index=Number(slider.value);show()};document.getElementById('play').onclick=()=>playing=!playing;setInterval(()=>{if(playing){index=(index+1)%data.samples.length;show()}},120);show()});</script>`;
 fs.writeFileSync(file,html,{flag:'wx'});return{path:path.basename(file),bytes:Buffer.byteLength(html),sha256:sha(html),rawRgbSha256:sha(Buffer.concat(frames)),frames:frames.length,width:96,height:64,storage:'RGB gzip embedded once in standalone HTML temporal viewer; 0 PNG files'};
}
const markerRead=`const objectiveMarkers=[];st.worldGroup.traverse(o=>{if(!o.isMesh||o.userData.fpsMarkerType!=='objective-site'||Array.isArray(o.material))return;const a=o.material,role=a.map?'letter':o.geometry.type==='RingGeometry'?'zone':'fill',pos=o.geometry.attributes.position,v=st.camera.position.clone();o.updateWorldMatrix(true,false);let minY=Infinity,maxY=-Infinity;for(let i=0;i<pos.count;i++){v.fromBufferAttribute(pos,i).applyMatrix4(o.matrixWorld);minY=Math.min(minY,v.y);maxY=Math.max(maxY,v.y);}objectiveMarkers.push({role,geometry:o.geometry.type,position:o.position.toArray(),worldY:{min:minY,max:maxY},version:a.version,opacity:a.opacity,transparent:a.transparent,depthWrite:a.depthWrite,depthTest:a.depthTest,renderOrder:o.renderOrder,polygonOffset:a.polygonOffset});});`;
const sceneRead=`const st=window.__ESMO_FPS_SCENE__,live=st.liveRef.current,f=live.sim.frames[live.fIdx],c=st.renderer.domElement.getBoundingClientRect(),m=[],p=f.players.find(p=>p.id===live.selected),ch=st._chase,direction=st.camera.getWorldDirection(st.camera.position.clone()).toArray(),va=Number(ch?.va)*Math.PI/180;${markerRead}st.c3Environment.group.traverse(o=>{if(!o.isMesh||Array.isArray(o.material))return;const a=o.material;if(/Building_|Cover_|Service-streets|Courtyards|Site_safety|Authored-rooms|Industrial_access/.test(o.name)||a.transparent&&a.opacity<.99)m.push({name:o.name,version:a.version,opacity:a.opacity,transparent:a.transparent,depthWrite:a.depthWrite,depthTest:a.depthTest,visible:o.visible,renderOrder:o.renderOrder,polygonOffset:a.polygonOffset});});return{timeMs:performance.now(),frame:live.fIdx,round:f.rnd,roundSec:f.roundSec,playing:live.playing,speed:live.speed,map:st.mapKey,sceneVersion:st.sceneVersion,selected:live.selected,cameraMode:live.cameraMode,actor:p?{id:p.id,side:p.side,pos:{...p.pos},va:p.va,dead:p.dead,state:p.state}:null,chase:ch?{id:ch.id,x:ch.x,y:ch.y,va:ch.va,alive:ch.alive,elevation:ch.elevation}:null,direction,aimDirectionError:ch&&Number.isFinite(va)?Math.hypot(direction[0]-Math.cos(va),direction[1],direction[2]-Math.sin(va)):null,pose:st.camera.position.toArray(),quaternion:st.camera.quaternion.toArray(),near:st.camera.near,far:st.camera.far,fov:st.camera.fov,canvas:{x:c.x,y:c.y,width:c.width,height:c.height},objectiveMarkers,materials:m,lighting:{position:st.sun.position.toArray(),bias:st.sun.shadow.bias,normalBias:st.sun.shadow.normalBias,shadowSize:st.sun.shadow.mapSize.x,enabled:st.renderer.shadowMap.enabled},render:{calls:st.renderer.info.render.calls,triangles:st.renderer.info.render.triangles,programs:(st.renderer.info.programs||[]).map(p=>({id:p.id,name:p.name,diagnostics:p.diagnostics?{runnable:p.diagnostics.runnable,programLog:p.diagnostics.programLog,vertexShaderLog:p.diagnostics.vertexShader?.log,fragmentShaderLog:p.diagnostics.fragmentShader?.log}:null}))}};`;
try{
 const allowed=new Set(['buildDir','outDir','sourceMode','width','expectPavingOffset','maps','expectMajorNear','roiY']);
 for(const arg of process.argv.slice(2)){const match=/^--([^=]+)=(.+)$/.exec(arg);if(!match||!allowed.has(match[1]))throw new HarnessError('Use explicit buildDir/outDir/sourceMode/width arguments');args[match[1]]=match[2];}
 if(!args.buildDir||!args.outDir)throw new HarnessError('Existing --buildDir and new --outDir required');
 const mode=args.sourceMode||'current';if(!['current','historical-before'].includes(mode))throw new HarnessError('sourceMode must be current or explicitly historical-before');
 if(args.expectPavingOffset!==undefined&&args.expectPavingOffset!=='-1')throw new HarnessError('expectPavingOffset only supports the explicit necessary After units=-1');
 if(args.expectMajorNear!==undefined&&args.expectMajorNear!=='1')throw new HarnessError('expectMajorNear only supports explicit tactical=1 / POV=.18 necessary After');
 const maps=args.maps?args.maps.split(','):['mirage','dust2','inferno'];if(!maps.length||new Set(maps).size!==maps.length||maps.some(m=>!['mirage','dust2','inferno'].includes(m)))throw new HarnessError('maps must explicitly select existing internal map ids without duplicates');evidence.requestedMaps=maps;
 const roiY=Number(args.roiY||.65);if(![.35,.65].includes(roiY))throw new HarnessError('Explicit diagnostic ROI must be .35 or .65');evidence.roiNormalizedY=roiY;
 const width=Number(args.width||1366);if(![1366,390].includes(width))throw new HarnessError('Only 1366 or 390 diagnostic viewports');const height=width===390?844:900;
 const buildDir=path.resolve(args.buildDir);out=path.resolve(args.outDir);
 if(!within(path.resolve('review/cs-major-upgrade/profile-builds'),buildDir)||!within(path.resolve('review/cs-major-upgrade/evidence'),out)||fs.existsSync(out))throw new HarnessError('Explicit own archive/new evidence child required');
 fs.mkdirSync(out,{recursive:true});checkpoint('EVIDENCE_DIRECTORY_READY');
 const manifestBytes=fs.readFileSync(path.join(buildDir,'build-manifest.json')),manifest=JSON.parse(manifestBytes),bundle=createHash('sha256');let hasProbe=false;
 for(const name of fs.readdirSync(path.join(buildDir,'assets')).filter(n=>n.endsWith('.js')).sort()){const bytes=fs.readFileSync(path.join(buildDir,'assets',name));bundle.update(name+'\0');bundle.update(bytes);hasProbe ||= bytes.includes(Buffer.from('__ESMO_FPS_SCENE__'));}
 if(bundle.digest('hex')!==manifest.bundleSha256||!hasProbe)throw new HarnessError('Actual archive JS bundle mismatch or scene read-only probe absent');
 const sourceFiles=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','--','src/battle/fps','src/screens/fps/CsMatchScreen.jsx','src/screens/fps/CsResultScreen.jsx','src/platform/contracts/CsMatchResult.js','public/assets/fps','public/audio/cs'],{encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/).filter(Boolean).sort(),currentHash=createHash('sha256');
 for(const file of sourceFiles){currentHash.update(file+'\0');currentHash.update(fs.readFileSync(file));currentHash.update('\0');}
 const sourceCurrent=currentHash.digest('hex')===manifest.sourceFingerprint?.sha256&&sourceFiles.length===manifest.sourceFingerprint?.files;
 if(mode==='current'&&!sourceCurrent)throw new HarnessError('Current source differs from archived artifact; owner must prepare correct build');
 evidence.archive={path:buildDir,manifestSha256:sha(manifestBytes),bundleSha256:manifest.bundleSha256,sourceFingerprint:manifest.sourceFingerprint,sourceMode:mode,matchesCurrentSource:sourceCurrent,probeVersion:manifest.probeVersion};
 checkpoint('ARTIFACT_PROVENANCE_VERIFIED',{archive:buildDir,sourceMode:mode,matchesCurrentSource:sourceCurrent});
 const decode=decoder();checkpoint('PREVIEW_START_PENDING');
 server=await preview({build:{outDir:buildDir},preview:{host:'127.0.0.1',port:0,open:false}});const url=`http://127.0.0.1:${server.httpServer.address().port}/ESMO-/`;
 checkpoint('PREVIEW_READY_CHROME_START_PENDING',{url});
 result=await runGate({name:'CS Major Owner7 temporal collection (visual closure not asserted)',externalUrl:url,workspaceOnly:true,headless:false,timeoutMs:540000,evidenceOut:path.join(out,'harness.json'),async run({chrome,ck,sleep}){
  checkpoint('OWNED_CHROME_STARTED',{chromePid:chrome.pid,cdpPort:chrome.port,resources:ownedChromeResources(chrome.pid)});
  const check=(label,ok,detail)=>{ck(label,Boolean(ok),detail?JSON.stringify(detail):'');evidence.checks.push({label,ok:Boolean(ok),detail});};
  await chrome.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width===390});evidence.viewport={width,height,dpr:1,scope:'Diagnostic crops; not performance or touch acceptance'};
  const native=selector=>clickFpsDNative({chrome,sleep,selector});
  for(const map of maps){
   const mapUrl=`${url}?c5c=battle&map=${map}&seed=505001`;checkpoint('MAP_URL_NAVIGATION_PENDING',{map,url:mapUrl,chromePid:chrome.pid});
   await chrome.navigate(mapUrl);checkpoint('MAP_URL_NAVIGATION_RETURNED',{map});checkpoint('SCENE_READINESS_WAIT_PENDING',{map,unchangedPredicate:'players10 + allrigged + atlasLoaded + native camera UI'});
   const end=Date.now()+150000;let ready=false;do{ready=await chrome.evaluate(`return Boolean(window.__ESMO_FPS_SCENE__?.players?.length===10&&window.__ESMO_FPS_SCENE__.players.every(p=>p.rigged?.mode==='rigged')&&window.__ESMO_FPS_SCENE__.c3Environment?.summary?.atlasLoaded&&document.querySelector('[data-testid="cs-camera-presets"]'));`);if(!ready)await sleep(200);}while(!ready&&Date.now()<end);
   if(!ready)throw new HarnessError(map+' actual rig/atlas/camera UI not ready');
   checkpoint('SCENE_AND_ASSETS_READY',{map,readyPredicateReturned:true});
   // Retain full observed console even if a later scenario or tool precondition fails.
   evidence.observedBrowser={page:chrome.pageErrors,allConsole:chrome.consoleLines};
   const playing=await chrome.evaluate(`return window.__ESMO_FPS_SCENE__.liveRef.current.playing;`);
   if(playing)await native('[data-testid="cs-playback-controls"] button[aria-label="暫停比賽播放"]');
   const selectedFrame=await chrome.evaluate(`const s=window.__ESMO_FPS_SCENE__.liveRef.current.sim,i=s.frames.findIndex(f=>!f.buyP&&f.players.filter(p=>!p.dead).length>=8);return i>=0?{index:i,id:s.frames[i].players.find(p=>!p.dead).id,roundSec:s.frames[i].roundSec,state:'canonical opening-paused surface diagnostic'}:null;`);
   if(!selectedFrame)throw new HarnessError(map+' canonical opening/alive>=8 frame absent, scenario not substituted');
   await seekFpsNativeTimeline({chrome,sleep,index:selectedFrame.index});
   const markerState=await chrome.evaluate(sceneRead),order={fill:10,zone:11,letter:12};
   if(args.expectPavingOffset!==undefined){
    const paving=await chrome.evaluate(`const st=window.__ESMO_FPS_SCENE__,p=st.c3Environment.group.getObjectByName('Courtyards_and_service-paving'),road=st.c3Environment.group.getObjectByName('Service-streets_walkable-route-source'),a=p?.material;return a?{name:p.name,visible:p.visible,depthWrite:a.depthWrite,depthTest:a.depthTest,opacity:a.opacity,transparent:a.transparent,polygonOffset:a.polygonOffset,factor:a.polygonOffsetFactor,units:a.polygonOffsetUnits,roadOffset:road?.material.polygonOffset,sameMaterialAsRoad:a===road?.material}:null;`);
    evidence.pavingOffsetMaterialChecks ||= [];evidence.pavingOffsetMaterialChecks.push({map,paving});
    check(map+' 必要After庭院真獨立材質depth保持與offset0/-1',paving&&paving.visible&&paving.depthWrite&&paving.depthTest&&!paving.transparent&&paving.opacity===1&&paving.polygonOffset&&paving.factor===0&&paving.units===-1&&!paving.sameMaterialAsRoad&&!paving.roadOffset,paving);
   }
   check(map+' 六個包點標記真depthWrite關閉/depthTest與層序',markerState.objectiveMarkers.length===6&&['fill','zone','letter'].every(role=>markerState.objectiveMarkers.filter(m=>m.role===role).length===2)&&markerState.objectiveMarkers.every(m=>m.transparent&&!m.depthWrite&&m.depthTest&&m.renderOrder===order[m.role]),markerState.objectiveMarkers);
   for(const cameraMode of ['overview','spectator','pov']){
    checkpoint('FIXED_SEQUENCE_START',{map,cameraMode});
    if(cameraMode==='overview')await native('[data-testid="cs-camera-preset-overview"]');
    else{await native('[data-esmo-fps-player-card="'+selectedFrame.id+'"]');if(cameraMode==='pov')await native('[data-testid="cs-camera-preset-pov"]');}
    await chrome.evaluate(`document.querySelector('canvas').scrollIntoView({block:'center',behavior:'instant'});return true;`);await sleep(1200);
    const initial=await chrome.evaluate(sceneRead),c=initial.canvas,origin={x:c.x+c.width*.5,y:c.y+c.height*.65};
    check(map+'/'+cameraMode+' 真固定保存幀/major/視角前提',initial.frame===selectedFrame.index&&!initial.playing&&initial.map===map&&initial.sceneVersion==='major.v1'&&(cameraMode==='overview'?initial.selected==null:initial.selected===selectedFrame.id)&&(cameraMode==='pov'?initial.cameraMode==='pov':initial.cameraMode==='tactical'),initial);
    if(initial.playing||initial.frame!==selectedFrame.index)throw new HarnessError('Pause or native timeline precondition failed');
    await chrome.send('Input.dispatchMouseEvent',{type:'mousePressed',...origin,button:'left',buttons:1,clickCount:1});
    await chrome.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:origin.x+20,y:origin.y,button:'left',buttons:1});await sleep(1200);
    const frames=[],samples=[];
    const capture=async (phase,targetFrames=frames,targetSamples=samples)=>{
     const state=await chrome.evaluate(sceneRead),rect=state.canvas;
     if(rect.width<160||rect.height<100)throw new HarnessError('Canvas crop lacks size');
     const clip={x:Math.round(rect.x+rect.width*.5-48),y:Math.round(rect.y+rect.height*roiY-32),width:96,height:64,scale:1};
     if(clip.x<0||clip.y<0||clip.x+96>width||clip.y+64>height)throw new HarnessError('Actual canvas ROI outside viewport');
     const shot=await chrome.send('Page.captureScreenshot',{format:'png',clip,captureBeyondViewport:false}),png=decode(Buffer.from(shot.data,'base64'));
     if(png.width!==96||png.height!==64)throw new HarnessError('Screenshot ROI shape drift');
     const rgb=Buffer.alloc(96*64*3);for(let p=0;p<96*64;p++){rgb[p*3]=png.pixels[p*png.channels];rgb[p*3+1]=png.pixels[p*png.channels+1];rgb[p*3+2]=png.pixels[p*png.channels+2];}
     const observedAfter=await chrome.evaluate(`return {frame:window.__ESMO_FPS_SCENE__.liveRef.current.fIdx,timeMs:performance.now()};`);
     targetSamples.push({...state,phase,clip,captureObservedAfter:observedAfter,pixelSha256:sha(rgb),deltaFromPrevious:targetFrames.length?delta(rgb,targetFrames.at(-1)):null});targetFrames.push(rgb);
    };
    for(let i=0;i<8;i++){await capture('settled-baseline');await sleep(100);}
    for(let i=1;i<=24;i++){await chrome.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:origin.x+20+60*Math.sin(i*Math.PI*2/24),y:origin.y,button:'left',buttons:1});await sleep(80);await capture('native-orbit');}
    await chrome.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:origin.x+20,y:origin.y,button:'left',buttons:0,clickCount:1});await sleep(1200);
    for(let i=0;i<8;i++){await capture('returned-settled');await sleep(100);}
    const poseDelta=Math.max(...samples.slice(8,32).map(s=>Math.hypot(...s.pose.map((v,k)=>v-samples[0].pose[k])))),rotationDelta=Math.max(...samples.slice(8,32).map(s=>Math.max(...s.quaternion.map((v,k)=>Math.abs(v-samples[0].quaternion[k])))));
    // Major POV intentionally ignores orbit drags: aim is authoritative player input.
    // Preserve that rule; POV measures a static eye view over time, while the other modes move.
    check(map+'/'+cameraMode+(cameraMode==='pov'?' 真POV保持權威aim，拖曳不另造視角':' 原生運鏡造成真pose/rotation變化'),cameraMode==='pov'?poseDelta<.01&&rotationDelta<.01:poseDelta>.01||rotationDelta>.01,{poseDelta,rotationDelta});
    check(map+'/'+cameraMode+' 全40時間sample保持同保存幀且paused',samples.length===40&&samples.every(s=>s.frame===selectedFrame.index&&!s.playing&&s.map===map));
    const movie=writeMovie(path.join(out,map+'-'+cameraMode+'-temporal.html'),frames,{map,mode:cameraMode,samples});
    const baselineDeltas=samples.slice(1,8).map(s=>s.deltaFromPrevious.maxChannelMean),returnedDeltas=samples.slice(33).map(s=>s.deltaFromPrevious.maxChannelMean),series={map,cameraMode,selectedFrame,movie,poseDelta,rotationDelta,baselineMaxChannelMeanMax:Math.max(...baselineDeltas),returnedMaxChannelMeanMax:Math.max(...returnedDeltas),returnPoseDistance:Math.hypot(...samples.at(-1).pose.map((v,k)=>v-samples[0].pose[k])),returnQuaternionMaxDelta:Math.max(...samples.at(-1).quaternion.map((v,k)=>Math.abs(v-samples[0].quaternion[k]))),returnPixelDelta:delta(frames[0],frames.at(-1)),samples};
    evidence.series.push(series);fs.writeFileSync(path.join(out,'temporal.json'),JSON.stringify(evidence,null,2));checkpoint('FIXED_SEQUENCE_SAVED',{map,cameraMode,samples:samples.length,movie:movie.path});
    if(cameraMode==='pov'){
     checkpoint('LIVE_POV_SEQUENCE_START',{map});
     // Read existing authoritative frames only; choose an alive moving interval, never change it.
     const liveWindow=await chrome.evaluate(`const fs=window.__ESMO_FPS_SCENE__.liveRef.current.sim.frames;for(let i=0;i<fs.length;i++){const f=fs[i];if(f.buyP)continue;let j=i;while(j<fs.length&&fs[j].rnd===f.rnd&&fs[j].roundSec<f.roundSec+15)j++;if(j>=fs.length||fs[j].rnd!==f.rnd)continue;for(const p of f.players){if(p.dead)continue;const window=fs.slice(i,j+1),actors=window.map(a=>a.players.find(b=>b.id===p.id));if(actors.every(a=>a&&!a.dead)&&actors.some((a,n)=>window[n].roundSec<=f.roundSec+2&&Math.hypot(a.pos.x-p.pos.x,a.pos.y-p.pos.y)>1))return {index:i,id:p.id,round:f.rnd,startSec:f.roundSec,endSec:fs[j].roundSec,criterion:'earliest canonical non-buy alive actor with 15sec same-round alive window and >1m real movement in its first 2sec'};}}return null;`);
     if(!liveWindow)throw new HarnessError(map+' canonical 15sec alive moving POV interval absent; scenario NOT RUN');
     await seekFpsNativeTimeline({chrome,sleep,index:liveWindow.index});await native('[data-esmo-fps-player-card="'+liveWindow.id+'"]');await native('[data-testid="cs-camera-preset-pov"]');
     await chrome.evaluate(`document.querySelector('canvas').scrollIntoView({block:'center',behavior:'instant'});return true;`);await sleep(300);
     const pausedBefore=await chrome.evaluate(sceneRead);
     if(pausedBefore.playing||pausedBefore.frame!==liveWindow.index||pausedBefore.selected!==liveWindow.id||pausedBefore.cameraMode!=='pov')throw new HarnessError('Live POV native selection/timeline precondition failed');
     await native('[data-testid="cs-playback-controls"] button[aria-label="播放比賽"]');
     await chrome.evaluate(`document.querySelector('canvas').scrollIntoView({block:'center',behavior:'instant'});return true;`);
     const liveFrames=[],liveSamples=[],pageErrorStart=chrome.pageErrors.length,consoleStart=chrome.consoleLines.length;
     for(let n=0;n<20;n++){await sleep(100);await capture('native-playing-authoritative-pov',liveFrames,liveSamples);}
     await native('[data-testid="cs-playback-controls"] button[aria-label="暫停比賽播放"]');
     const pausedAfter=await chrome.evaluate(sceneRead),uniqueFrames=[...new Set(liveSamples.map(s=>s.frame))],movement=Math.max(...liveSamples.map(s=>Math.hypot(...s.pose.map((v,k)=>v-liveSamples[0].pose[k])))),rotation=Math.max(...liveSamples.map(s=>Math.max(...s.quaternion.map((v,k)=>Math.abs(v-liveSamples[0].quaternion[k])))));
     const validAim=liveSamples.every(s=>s.actor&&!s.actor.dead&&s.chase?.alive&&Number.isFinite(s.chase.va)&&Number.isFinite(s.aimDirectionError)&&s.aimDirectionError<1e-5);
     check(map+'/pov-live 真原生play後frame前進再原生pause',liveSamples.length===20&&liveSamples.every(s=>s.playing&&s.cameraMode==='pov'&&s.selected===liveWindow.id&&s.map===map)&&uniqueFrames.length>=2&&liveSamples.at(-1).frame>pausedBefore.frame&&!pausedAfter.playing,{start:pausedBefore.frame,last:liveSamples.at(-1).frame,uniqueFrames,pausedAfter:pausedAfter.frame});
     check(map+'/pov-live 真actor aim控制鏡頭且真pose移動',validAim&&(movement>.01||rotation>.01),{movement,rotation,maxAimDirectionError:Math.max(...liveSamples.map(s=>s.aimDirectionError??Infinity))});
     const movie=writeMovie(path.join(out,map+'-pov-live-temporal.html'),liveFrames,{map,mode:'pov-live',samples:liveSamples});
     evidence.series.push({map,cameraMode:'pov-live',liveWindow,movie,movement,rotation,uniqueFrames,pausedBeforeFrame:pausedBefore.frame,pausedAfterFrame:pausedAfter.frame,samples:liveSamples,errors:{page:chrome.pageErrors.slice(pageErrorStart),console:chrome.consoleLines.slice(consoleStart)},limitation:'Native playback changes world/actor/light state. Pixel delta is diagnostic only, never a flicker threshold.'});
     fs.writeFileSync(path.join(out,'temporal.json'),JSON.stringify(evidence,null,2));checkpoint('LIVE_POV_SEQUENCE_SAVED',{map,samples:liveSamples.length,movie:movie.path});
    }
    if(fs.readdirSync(out).reduce((sum,f)=>sum+fs.statSync(path.join(out,f)).size,0)>16*1024*1024)throw new HarnessError('Temporal diagnostic exceeds 16MiB budget; keep evidence, do not delete');
   }
  }
  if(args.expectMajorNear!==undefined)for(const map of maps){
   const series=evidence.series.filter(s=>s.map===map),observed=series.map(s=>({mode:s.cameraMode,near:[...new Set(s.samples.map(p=>p.near))],far:[...new Set(s.samples.map(p=>p.far))],samples:s.samples.length}));
   check(map+' 必要After真Major tactical near1／POV near.18保持',series.length===4&&series.every(s=>s.samples.every(p=>p.near===(s.cameraMode.startsWith('pov')?.18:1)&&p.far===600&&p.sceneVersion==='major.v1')),observed);
   evidence.nearClipChecks ||= [];evidence.nearClipChecks.push({map,observed});
  }
  evidence.browserErrors={page:chrome.pageErrors,console:chrome.consoleLines.filter(l=>l.startsWith('[error]')),shaderMessages:chrome.consoleLines.filter(l=>/shader|webgl|compile|link program/i.test(l)),allConsole:chrome.consoleLines};check('診斷console/page error零',!evidence.browserErrors.page.length&&!evidence.browserErrors.console.length,{page:evidence.browserErrors.page,console:evidence.browserErrors.console,shader:evidence.browserErrors.shaderMessages});
  const unrunnable=evidence.series.flatMap(series=>series.samples.flatMap(sample=>sample.render.programs.filter(p=>p.diagnostics?.runnable===false).map(p=>({map:series.map,mode:series.cameraMode,frame:sample.frame,...p}))));check('已提供shader診斷無unrunnable program',unrunnable.length===0,unrunnable);
 }});
 checkpoint('HARNESS_RETURNED',{verdict:result.verdict,pass:result.pass,fail:result.fail,failurePhase:result.failurePhase,pids:result.evidence?.pids,cleanup:result.evidence?.cleanup});
 const cleanup=result.evidence?.cleanup?.chromeClose;if(cleanup&&(!cleanup.confirmed||cleanup.profileRemoved===false))result={...result,verdict:'HARNESS_FAIL',failurePhase:'Temporal owned Chrome cleanup not confirmed'};
}catch(error){result={verdict:'HARNESS_FAIL',pass:0,fail:0,elapsedMs:Date.now()-started,failurePhase:String(error.stack||error)};console.error(error.message);}
finally{
 if(server)try{await Promise.race([new Promise((resolve,reject)=>server.httpServer.close(e=>e?reject(e):resolve())),new Promise((_,reject)=>{const t=setTimeout(()=>reject(Error('Preview cleanup timeout')),6000);t.unref();})]);}catch(error){result={...result,verdict:'HARNESS_FAIL',failurePhase:error.message};}
 checkpoint('GATE_FINAL_SAVE',{verdict:result?.verdict,failurePhase:result?.failurePhase});evidence.result=result;evidence.status=result?.verdict||'HARNESS_FAIL';if(out&&fs.existsSync(out))fs.writeFileSync(path.join(out,'gate.json'),JSON.stringify(evidence,null,2));
}
console.log(`Owner7 temporal diagnostic collection: ${result?.pass||0}/${(result?.pass||0)+(result?.fail||0)} RESULT=${result?.verdict||'HARNESS_FAIL'} VISUAL_CLOSURE=OWNER_REVIEW_REQUIRED`);
await finishGate(result);
