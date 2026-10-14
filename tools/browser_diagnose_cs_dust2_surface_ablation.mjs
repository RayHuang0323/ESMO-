#!/usr/bin/env node
// 單圖 v8 artifact 診斷：只暫改 render visibility / shadow enabled；不改 domain 或產品。
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import zlib from 'node:zlib';
import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';import {preview} from 'vite';
import {runGate,finishGate,HarnessError} from './browser/harness.mjs';
import {clickFpsDNative} from './browser/fpsReplayUiProbe.mjs';import {seekFpsNativeTimeline} from './browser/fpsNativeTimeline.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex'),start=Date.now(),args={};let out,server,result;
const evidence={schema:'cs-dust2-render-ablation.v1',diagnosticOnly:true,visualAcceptance:false,productFix:false,savedPngs:0,buildRun:false,simulationPatched:false,series:[],checks:[]};
const within=(a,b)=>{const r=path.relative(a,b);return r&&!r.startsWith('..')&&!path.isAbsolute(r);};
function cim(){try{const script="$rows=@(Get-CimInstance Win32_Process | Where-Object {$_.Name -eq 'chrome.exe' -and $_.CommandLine -like '*--user-data-dir=*esmo-cdp-*'} | Select-Object ProcessId,ParentProcessId); ConvertTo-Json -InputObject $rows -Compress";return{checkedAt:new Date().toISOString(),scope:'Only isolated esmo-cdp Chrome roots; ordinary Chrome not operated',roots:JSON.parse(execFileSync('powershell.exe',['-NoProfile','-Command',script],{encoding:'utf8',windowsHide:true,timeout:10000}).replace(/^\uFEFF/,''))};}catch(e){return{checkedAt:new Date().toISOString(),status:'UNKNOWN',error:e.message};}}
const source=fs.readFileSync('tools/browser_check_cs_major_temporal_surface.mjs','utf8'),first=source.indexOf('function decoder(){'),last=source.indexOf('\ntry{');
if(first<0||last<first)throw Error('Existing read-only temporal helper marker drift');
const helpers=vm.runInNewContext(source.slice(first,last)+'\n;({decoder,delta,writeMovie,sceneRead})',{fs,path,vm,zlib,sha,evidence,Buffer,HarnessError});
evidence.helperSource={path:'tools/browser_check_cs_major_temporal_surface.mjs',sha256:sha(source),reuse:'Only existing decoder/movie/readout helper definitions; original gate is not executed'};
const targetRead=`const targets=[];st.worldGroup.traverse(o=>{if(!o.isMesh)return;const role=o.userData.fpsMarkerType==='objective-site'?'marker':o.name==='Service-streets_walkable-route-source'?'road':o.name==='Courtyards_and_service-paving'?'paving':null;if(!role)return;const a=o.material;targets.push({uuid:o.uuid,role,name:o.name,visible:o.visible,geometry:o.geometry.type,vertices:o.geometry.attributes.position.count,triangles:(o.geometry.index?.count||o.geometry.attributes.position.count)/3,material:{type:a.type,depthWrite:a.depthWrite,depthTest:a.depthTest,transparent:a.transparent,opacity:a.opacity,version:a.version,renderOrder:o.renderOrder,polygonOffset:a.polygonOffset,customProgramCacheKey:a.customProgramCacheKey?.()}});});`;
const read=helpers.sceneRead.replace('const objectiveMarkers=[];',targetRead+'const objectiveMarkers=[];').replace('return{timeMs:','return{ablationTargets:targets,domainFrame:JSON.stringify(f),domainFrameCount:live.sim.frames.length,timeMs:');
const conditions=[{id:'baseline'}, {id:'road-hidden',hide:'road'}, {id:'road-restored'}, {id:'markers-hidden',hide:'marker'}, {id:'markers-restored'}, {id:'paving-hidden',hide:'paving'}, {id:'paving-restored'}, {id:'shadows-disabled',shadow:false}, {id:'shadows-restored'}];
try{
 for(const arg of process.argv.slice(2)){const m=/^--([^=]+)=(.+)$/.exec(arg);if(!m||!['buildDir','outDir'].includes(m[1]))throw new HarnessError('Use --buildDir=<existing v8> --outDir=<new CS evidence>');args[m[1]]=m[2];}
 if(!args.buildDir||!args.outDir)throw new HarnessError('Explicit buildDir/outDir required');
 const buildDir=path.resolve(args.buildDir);out=path.resolve(args.outDir);
 if(!within(path.resolve('review/cs-major-upgrade/profile-builds'),buildDir)||!within(path.resolve('review/cs-major-upgrade/evidence'),out)||fs.existsSync(out))throw new HarnessError('Own existing archive/new evidence directory required');
 fs.mkdirSync(out,{recursive:true});const referencePath='review/cs-major-upgrade/evidence/authenticity-closure-20261012/owner7-temporal-v8-after/gate.json',referenceBytes=fs.readFileSync(referencePath),reference=JSON.parse(referenceBytes),ref=reference.series.find(s=>s.map==='dust2'&&s.cameraMode==='overview');
 const manifestBytes=fs.readFileSync(path.join(buildDir,'build-manifest.json')),manifest=JSON.parse(manifestBytes),bundle=createHash('sha256');let probe=false;
 for(const name of fs.readdirSync(path.join(buildDir,'assets')).filter(n=>n.endsWith('.js')).sort()){const bytes=fs.readFileSync(path.join(buildDir,'assets',name));bundle.update(name+'\0');bundle.update(bytes);probe ||= bytes.includes(Buffer.from('__ESMO_FPS_SCENE__'));}
 if(!probe||bundle.digest('hex')!==manifest.bundleSha256||manifest.bundleSha256!==reference.archive.bundleSha256||sha(manifestBytes)!==reference.archive.manifestSha256)throw new HarnessError('Exact v8 archive/reference bundle and manifest required');
 evidence.archive={...reference.archive,sourceMode:'historical-v8-diagnostic',sourceCurrentNotRequired:true};evidence.reference={path:referencePath,sha256:sha(referenceBytes),frame:ref.selectedFrame,roi:ref.samples[0].clip,pose:ref.samples[0].pose,movieSha256:ref.movie.sha256};
 const decode=helpers.decoder();evidence.cim={before:cim()};if(evidence.cim.before.status==='UNKNOWN'||evidence.cim.before.roots.length)throw new HarnessError('CIM isolation precondition unknown or isolated Browser already running');
 server=await preview({build:{outDir:buildDir},preview:{host:'127.0.0.1',port:0,open:false}});const url=`http://127.0.0.1:${server.httpServer.address().port}/ESMO-/`;
 result=await runGate({name:'Dust II v8 render ablation collection (diagnostic only)',externalUrl:url,workspaceOnly:true,headless:false,timeoutMs:540000,evidenceOut:path.join(out,'harness.json'),async run({chrome,ck,sleep}){
  const check=(label,ok,detail)=>{ck(label,Boolean(ok),detail?JSON.stringify(detail):'');evidence.checks.push({label,ok:Boolean(ok),detail});};
  const native=selector=>clickFpsDNative({chrome,sleep,selector});await chrome.send('Emulation.setDeviceMetricsOverride',{width:1366,height:900,deviceScaleFactor:1,mobile:false});
  await chrome.navigate(`${url}?c5c=battle&map=dust2&seed=505001`);let ready=false;const end=Date.now()+150000;
  do{ready=await chrome.evaluate(`return Boolean(window.__ESMO_FPS_SCENE__?.players?.length===10&&window.__ESMO_FPS_SCENE__.players.every(p=>p.rigged?.mode==='rigged')&&window.__ESMO_FPS_SCENE__.c3Environment?.summary?.atlasLoaded&&document.querySelector('[data-testid="cs-camera-presets"]'));`);if(!ready)await sleep(200);}while(!ready&&Date.now()<end);
  if(!ready)throw new HarnessError('Actual rigs/atlas/camera UI not ready');
  if(await chrome.evaluate(`return window.__ESMO_FPS_SCENE__.liveRef.current.playing;`))await native('[data-testid="cs-playback-controls"] button[aria-label="暫停比賽播放"]');
  await seekFpsNativeTimeline({chrome,sleep,index:ref.selectedFrame.index});await native('[data-testid="cs-camera-preset-overview"]');
  await chrome.evaluate(`document.querySelector('canvas').scrollIntoView({block:'center',behavior:'instant'});return true;`);await sleep(1200);
  const original=await chrome.evaluate(read);evidence.original={frame:original.frame,frameSha256:sha(original.domainFrame),frameCount:original.domainFrameCount,targets:original.ablationTargets,lighting:original.lighting};
  if(original.frame!==ref.selectedFrame.index||original.roundSec!==12||original.playing||original.map!=='dust2'||original.selected!==null||original.sceneVersion!=='major.v1')throw new HarnessError('Exact v8 paused frame/overview scenario absent');
  if(original.ablationTargets.filter(t=>t.role==='road').length!==1||original.ablationTargets.filter(t=>t.role==='paving').length!==1||original.ablationTargets.filter(t=>t.role==='marker').length!==6)throw new HarnessError('Exact ablation target shapes required');
  evidence.targetGeometry=await chrome.evaluate(`const st=window.__ESMO_FPS_SCENE__,rows=[];st.worldGroup.traverse(o=>{if(!o.isMesh||!['Service-streets_walkable-route-source','Courtyards_and_service-paving'].includes(o.name))return;const p=o.geometry.attributes.position,u=o.geometry.attributes.uv,n=o.geometry.attributes.normal,ix=o.geometry.index;const hits=[];for(const query of [{x:26,y:58},{x:29.62,y:58.62},{x:28,y:59}])for(let i=0;i<(ix?.count||p.count);i+=3){const ids=[0,1,2].map(k=>ix?ix.getX(i+k):i+k),v=ids.map(k=>[p.getX(k),p.getY(k),p.getZ(k)]),point=[query.x-50,query.y-50],cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]),t=v.map(q=>[q[0],q[2]]),den=cross(...t);if(Math.abs(den)<1e-9)continue;const w=[cross(t[1],t[2],point)/den,cross(t[2],t[0],point)/den,cross(t[0],t[1],point)/den];if(w.some(a=>a< -1e-6))continue;const uv=[0,1].map(k=>w.reduce((s,a,j)=>s+a*(k?u.getY(ids[j]):u.getX(ids[j])),0));hits.push({query,triangle:i/3,height:w.reduce((s,a,j)=>s+a*v[j][1],0),uv,shaderCell:uv.map(a=>Math.floor(a*2)*.5),normals:ids.map(k=>[n.getX(k),n.getY(k),n.getZ(k)])});}rows.push({name:o.name,visible:o.visible,castShadow:o.castShadow,receiveShadow:o.receiveShadow,material:{opacity:o.material.opacity,transparent:o.material.transparent,depthWrite:o.material.depthWrite,depthTest:o.material.depthTest,shaderKey:o.material.customProgramCacheKey()},hits});});return rows;`);
  check('真v8 frame24/paused與指定三種mesh前提',true,evidence.original);
  const restore=async()=>chrome.evaluate(`const st=window.__ESMO_FPS_SCENE__,orig=${JSON.stringify(original.ablationTargets.map(t=>({uuid:t.uuid,visible:t.visible})))};st.worldGroup.traverse(o=>{const row=orig.find(r=>r.uuid===o.uuid);if(row)o.visible=row.visible;});st.renderer.shadowMap.enabled=${Boolean(original.lighting.enabled)};return true;`);
  try{
   for(const condition of conditions){
    await restore();if(condition.hide)await chrome.evaluate(`const st=window.__ESMO_FPS_SCENE__,ids=${JSON.stringify(original.ablationTargets.filter(t=>t.role===condition.hide).map(t=>t.uuid))};st.worldGroup.traverse(o=>{if(ids.includes(o.uuid))o.visible=false;});return true;`);
    if(condition.shadow===false)await chrome.evaluate(`window.__ESMO_FPS_SCENE__.renderer.shadowMap.enabled=false;return true;`);
    // 同一原生preset重置＋同20px微拖，不直接寫相機、時間或frame。
    await native('[data-testid="cs-camera-preset-overview"]');await chrome.evaluate(`document.querySelector('canvas').scrollIntoView({block:'center',behavior:'instant'});return true;`);await sleep(1200);
    const initial=await chrome.evaluate(read),c=initial.canvas,origin={x:c.x+c.width*.5,y:c.y+c.height*.65};
    await chrome.send('Input.dispatchMouseEvent',{type:'mousePressed',...origin,button:'left',buttons:1,clickCount:1});await chrome.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:origin.x+20,y:origin.y,button:'left',buttons:1});await sleep(1200);
    const frames=[],samples=[];
    for(let i=0;i<20;i++){
     const state=await chrome.evaluate(read),clip={x:Math.round(state.canvas.x+state.canvas.width*.5-48),y:Math.round(state.canvas.y+state.canvas.height*.65-32),width:96,height:64,scale:1};
     if(JSON.stringify(clip)!==JSON.stringify(ref.samples[0].clip))throw new HarnessError('Same observed v8 canvas ROI prerequisite drift');
     const shot=await chrome.send('Page.captureScreenshot',{format:'png',clip,captureBeyondViewport:false}),png=decode(Buffer.from(shot.data,'base64'));if(png.width!==96||png.height!==64)throw new HarnessError('ROI decoder shape drift');
     const rgb=Buffer.alloc(96*64*3);for(let p=0;p<96*64;p++)for(let k=0;k<3;k++)rgb[p*3+k]=png.pixels[p*png.channels+k];
     const after=await chrome.evaluate(`return {frame:window.__ESMO_FPS_SCENE__.liveRef.current.fIdx,playing:window.__ESMO_FPS_SCENE__.liveRef.current.playing};`),frameSha256=sha(state.domainFrame);delete state.domainFrame;
     samples.push({...state,phase:condition.id,clip,frameSha256,captureAfter:after,pixelSha256:sha(rgb),deltaFromPrevious:frames.length?helpers.delta(rgb,frames.at(-1)):null});frames.push(rgb);await sleep(100);
    }
    await chrome.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:origin.x+20,y:origin.y,button:'left',buttons:0,clickCount:1});
    const poseError=Math.hypot(...samples[0].pose.map((n,k)=>n-ref.samples[0].pose[k])),quaternionError=Math.max(...samples[0].quaternion.map((n,k)=>Math.abs(n-ref.samples[0].quaternion[k])));
    if(poseError>.02||quaternionError>.0001)throw new HarnessError('Actual native overview pose differs from original v8 ROI camera; no substitute accepted');
    const stableDomain=samples.every(s=>s.frame===original.frame&&s.frameSha256===evidence.original.frameSha256&&s.domainFrameCount===original.domainFrameCount&&!s.playing&&s.captureAfter.frame===original.frame&&!s.captureAfter.playing);
    const validTargets=samples.every(s=>s.ablationTargets.every(t=>t.visible===(condition.hide===t.role?false:original.ablationTargets.find(a=>a.uuid===t.uuid).visible))&&s.lighting.enabled===(condition.shadow===false?false:original.lighting.enabled));
    check(condition.id+' 20真samples且domain frame／pause保持不變',samples.length===20&&stableDomain);
    check(condition.id+' 只指定render層被暫關',validTargets);
    if(!stableDomain||!validTargets)throw new HarnessError('Ablation scenario drift; diagnostic invalid, not a product finding');
    const movie=helpers.writeMovie(path.join(out,'dust2-'+condition.id+'-temporal.html'),frames,{map:'dust2',mode:'ablation-'+condition.id,samples});
    evidence.series.push({map:'dust2',cameraMode:'overview-ablation',condition,movie,samples,referencePoseError:poseError,referenceQuaternionError:quaternionError,maxAdjacentMean:Math.max(...samples.slice(1).map(s=>s.deltaFromPrevious.maxChannelMean)),poseSpan:Math.max(...samples.map(s=>Math.hypot(...s.pose.map((n,k)=>n-samples[0].pose[k])))),limitation:'Diagnostic visibility/shadow isolation only; no visual acceptance threshold.'});
    fs.writeFileSync(path.join(out,'ablation.json'),JSON.stringify(evidence,null,2));if(fs.readdirSync(out).reduce((n,f)=>n+fs.statSync(path.join(out,f)).size,0)>16*1024*1024)throw new HarnessError('16MiB evidence budget exceeded; evidence preserved');
   }
  }finally{await restore();const restored=await chrome.evaluate(read);evidence.restored={targets:restored.ablationTargets,lighting:restored.lighting,frameSha256:sha(restored.domainFrame),frame:restored.frame};}
  check('最後真restore visibility/shadow與domain一致',evidence.restored.frameSha256===evidence.original.frameSha256&&evidence.restored.lighting.enabled===original.lighting.enabled&&evidence.restored.targets.every(t=>t.visible===original.ablationTargets.find(o=>o.uuid===t.uuid).visible));
  evidence.browserErrors={page:chrome.pageErrors,allConsole:chrome.consoleLines};check('診斷page/console errors零',!chrome.pageErrors.length&&!chrome.consoleLines.some(l=>l.startsWith('[error]')));
 }});
 if(!result.evidence?.cleanup?.chromeClose?.confirmed||result.evidence.cleanup.chromeClose.profileRemoved===false)result={...result,verdict:'HARNESS_FAIL',failurePhase:'Owned Chrome cleanup not confirmed'};
}catch(error){result={verdict:'HARNESS_FAIL',pass:0,fail:0,elapsedMs:Date.now()-start,failurePhase:String(error.stack||error)};console.error(error.message);}
finally{
 if(server)try{await Promise.race([new Promise((resolve,reject)=>server.httpServer.close(e=>e?reject(e):resolve())),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Preview close timeout')),6000);timer.unref();})]);}catch(error){result={...result,verdict:'HARNESS_FAIL',failurePhase:error.message};}
 evidence.cim={...evidence.cim,after:cim()};if(evidence.cim.after.status==='UNKNOWN'||evidence.cim.after.roots.length)result={...result,verdict:'HARNESS_FAIL',failurePhase:'CIM cleanup boundary unknown or isolated Browser root remains'};
 evidence.result=result;evidence.status=result?.verdict||'HARNESS_FAIL';if(out&&fs.existsSync(out))fs.writeFileSync(path.join(out,'gate.json'),JSON.stringify(evidence,null,2));
}
console.log(`Dust II render ablation: ${result?.pass||0}/${(result?.pass||0)+(result?.fail||0)} RESULT=${result?.verdict||'HARNESS_FAIL'} DIAGNOSTIC_ONLY=true VISUAL_ACCEPTANCE=false`);await finishGate(result);
