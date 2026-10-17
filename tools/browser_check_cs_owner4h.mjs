import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';import {preview} from 'vite';
import {runGate,finishGate,HarnessError} from './browser/harness.mjs';
import {clickFpsDNative,uploadFpsDNativeFile} from './browser/fpsReplayUiProbe.mjs';import {seekFpsNativeTimeline} from './browser/fpsNativeTimeline.mjs';
import {loadFpsMajorTestApi} from './lib/fpsMajorTestApi.mjs';
const args=Object.fromEntries(process.argv.slice(2).map(a=>{const m=/^--(buildDir|outDir|detailOnly|roomOnly|occlusionOnly|objectiveOnly|objectiveAudit|objectiveSecond)=(.+)$/.exec(a);if(!m)throw Error('Explicit build/output');return[m[1],m[2]];}));
let server,out,result;const evidence={schema:'owner4h-browser.v1',checks:[],maps:[],screenshots:[],statePatched:false};
try{
 const dir=path.resolve(args.buildDir||'');out=path.resolve(args.outDir||'');if(!out.startsWith(path.resolve('review/cs-major-upgrade/evidence')+path.sep)||fs.existsSync(out))throw new HarnessError('Unique evidence directory required');fs.mkdirSync(out,{recursive:true});
 const manifest=JSON.parse(fs.readFileSync(path.join(dir,'build-manifest.json'))),source=createHash('sha256'),bundle=createHash('sha256');
 const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','--','src/battle/fps','src/screens/fps/CsMatchScreen.jsx','src/screens/fps/CsPrepScreen.jsx','src/screens/fps/CsResultScreen.jsx','src/screens/fps/CsProfessionalReport.jsx','src/screens/fps/csProfessionalReport.css','src/platform/contracts/CsMatchResult.js','src/data/playerModel.js','src/platform/contracts/matchSquad.js','src/screens/manage/RosterScreen.jsx','src/screens/manage/PlayerDetailScreen.jsx','public/assets/fps','public/audio/cs'],{encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/).filter(Boolean).sort();
 for(const f of files){source.update(f+'\0');source.update(fs.readFileSync(f));source.update('\0');}for(const f of fs.readdirSync(path.join(dir,'assets')).filter(f=>f.endsWith('.js')).sort()){bundle.update(f+'\0');bundle.update(fs.readFileSync(path.join(dir,'assets',f)));}
 if(source.digest('hex')!==manifest.sourceFingerprint.sha256||bundle.digest('hex')!==manifest.bundleSha256)throw new HarnessError('Source/archive mismatch');evidence.archive=manifest;
 const api=args.roomOnly==='true'||args.occlusionOnly==='true'?await loadFpsMajorTestApi(fs.readFileSync('src/battle/fps/EsportsFPS3D.jsx','utf8')):null;
 server=await preview({build:{outDir:dir},preview:{host:'127.0.0.1',port:0,open:false}});const url=`http://127.0.0.1:${server.httpServer.address().port}/ESMO-/`;
 result=await runGate({name:'Owner4H hit markers camera interior actual GPU',externalUrl:url,workspaceOnly:true,headless:false,timeoutMs:720000,evidenceOut:path.join(out,'harness.json'),async run({chrome,ck,sleep}){
  const check=(name,ok,detail)=>{ck(name,Boolean(ok),JSON.stringify(detail??{}));evidence.checks.push({name,ok:Boolean(ok),detail});};
  const native=selector=>clickFpsDNative({chrome,sleep,selector});
  const pause=async()=>{if(await chrome.evaluate('return window.__ESMO_FPS_SCENE__.liveRef.current.playing;'))await native('[aria-label="暫停比賽播放"]');};
  const canvas=async()=>{await chrome.evaluate("document.querySelector('canvas').scrollIntoView({block:'center',behavior:'instant'});return true;");await sleep(200);return chrome.evaluate("const r=document.querySelector('canvas').getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};");};
  const capture=async(name)=>{await canvas();const file=path.join(out,name+'.png'),shot=await chrome.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(file,Buffer.from(shot.data,'base64'));evidence.screenshots.push(file);};
  const pose=()=>chrome.evaluate('const s=window.__ESMO_FPS_SCENE__,c=s.cam;return {theta:c.dTheta,phi:c.dPhi,radius:c.dRadius,target:{x:c.dTgt.x,y:c.dTgt.y,z:c.dTgt.z},selected:s.liveRef.current.selected,mode:s.liveRef.current.cameraMode,fov:s.camera.fov,position:s.camera.position.toArray()};');
  const drag=async(button,dx,dy)=>{const r=await canvas(),x=r.x+r.width*.5,y=r.y+r.height*.55;await chrome.send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button,buttons:button==='left'?1:2,clickCount:1});await chrome.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:x+dx,y:y+dy,button,buttons:button==='left'?1:2});await chrome.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:x+dx,y:y+dy,button,buttons:0,clickCount:1});await sleep(300);};
  const delta=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
  await chrome.send('Emulation.setDeviceMetricsOverride',{width:1366,height:1000,deviceScaleFactor:1,mobile:false});
  for(const map of (args.objectiveSecond==='true'?['mirage']:['mirage','dust2','inferno'])){
   await chrome.navigate(url+`?c5c=battle&map=${map}&seed=505001`);let ready=false;const until=Date.now()+150000;
   while(!ready&&Date.now()<until){ready=await chrome.evaluate("return Boolean(window.__ESMO_FPS_SCENE__?.players?.length===10&&window.__ESMO_FPS_SCENE__.players.every(p=>p.rigged?.mode==='rigged')&&window.__ESMO_FPS_SCENE__.c3Environment.summary.atlasLoaded);");if(!ready)await sleep(250);}if(!ready)throw new HarnessError(map+' actual assets readiness');
   await pause();await native('[data-testid="match-speed-1"]');
   if(args.objectiveOnly==='true'){
    const file=path.resolve('review/cs-major-upgrade/evidence/owner4h-review-20261018',args.objectiveSecond==='true'?'native-replay-final-r2/cs-replay-mirage-505002.json.gz':map==='dust2'&&args.objectiveAudit==='true'?'audit-case-dust2-505018.replay.json.gz':map==='mirage'?'saved-full-mirage-r2.replay.json.gz':`current-r2-${map}-505001.replay.json.gz`);
    if(!await chrome.evaluate("return document.querySelector('.fps-major-replay').open;"))await native('.fps-major-replay > summary');await uploadFpsDNativeFile({chrome,selector:'[data-testid="cs-replay-import"]',filePath:file});
    let imported=false;const until=Date.now()+90000;while(Date.now()<until){imported=await chrome.evaluate("return Boolean(document.querySelector('[data-testid=\"cs-replay-mode\"]')&&window.__ESMO_FPS_SCENE__.liveRef.current.sim.mapKey===new URL(location.href).searchParams.get('map')&&window.__ESMO_FPS_SCENE__.players.every(p=>p.rigged?.mode==='rigged'));");if(imported)break;await sleep(200);}if(!imported)throw new HarnessError(map+' latest genuine full Replay import');
    const scenarios=await chrome.evaluate(`const s=window.__ESMO_FPS_SCENE__.liveRef.current.sim,frames=s.frames;let hold=null,defuse=null;for(let i=1;i<frames.length-10;i++){const f=frames[i],window=frames.slice(i,i+11);if(window.some(n=>n.rnd!==f.rnd))continue;
     if(!hold&&f.planted){const p=f.players.find(p=>!p.dead&&p.side==='t'&&['awp','scout'].includes(p.gun)&&p.postPlantPlan&&!p.tacticalIntent?.aim&&Math.hypot(p.pos.x-p.postPlantPlan.point.x,p.pos.y-p.postPlantPlan.point.y)<=.55&&Math.abs(p.awareness?.turnDegrees||0)<.01&&window.every(n=>!n.muzzles.length&&n.players.some(q=>q.id===p.id&&!q.dead&&!q.tacticalIntent?.aim&&q.postPlantPlan?.selectedAtSec===p.postPlantPlan.selectedAtSec)));if(p)hold={index:i,actor:p.id,round:f.rnd};}
     if(!defuse&&f.defuse?.defuserId&&f.defuse.progress>0){const id=f.defuse.defuserId,p=f.players.find(p=>p.id===id);if(p?._objectiveLocked&&window.every(n=>n.defuse?.defuserId===id&&n.players.some(q=>q.id===id&&!q.dead&&q._objectiveLocked)))defuse={index:i,actor:id,round:f.rnd};}
     if(hold&&defuse)break;}
     return {hold,defuse,completed:s.completed,frames:frames.length,rounds:s.roundHist.length,plants:s.bombAudit.plantEvents.length,defuses:s.bombAudit.defuseEvents.length,interrupts:frames.flatMap(f=>f.events).filter(e=>e.type==='defuse-interrupt').length};`);
    check(map+' latest full match includes true plant and successful defuse',scenarios.completed&&scenarios.plants>0&&scenarios.defuses>0,scenarios);
    if(args.objectiveSecond==='true'&&!scenarios.hold)throw new HarnessError('Mirage second declared seed quiet sniper hold NOT_TRIGGERED');
    if(!scenarios.defuse)throw new HarnessError(map+' continuing successful defuse NOT_TRIGGERED');
    const cases=[];
    for(const kind of ['hold','defuse']){
     const c=scenarios[kind];if(!c){console.log('NOT_TRIGGERED '+map+' genuine quiet sniper hold');continue;}
     await seekFpsNativeTimeline({chrome,sleep,index:c.index});await native(`[data-esmo-fps-player-card="${c.actor}"]`);await native('[data-testid="cs-camera-preset-pov"]');await sleep(250);await native('[aria-label="播放比賽"]');
     const rows=[],end=Date.now()+4000;while(Date.now()<end){rows.push(await chrome.evaluate(`const s=window.__ESMO_FPS_SCENE__,f=s.liveRef.current.sim.frames[s.liveRef.current.fIdx],p=f.players.find(p=>p.id===${JSON.stringify(c.actor)});return {index:s.liveRef.current.fIdx,round:f.rnd,sec:f.roundSec,actor:p.id,role:p.role,gun:p.gun,pos:p.pos,va:p.va,locked:p._objectiveLocked,intent:p.tacticalIntent,progress:f.defuse?.defuserId===p.id?f.defuse.progress:null,shots:f.muzzles.filter(m=>m.attackerId===p.id&&m.shotAtMs>=f.roundSec*1000&&m.shotAtMs<(f.roundSec+.5)*1000).length,pov:s.povWeaponDiagnostics};`));await sleep(80);}await pause();
     const first=rows[0],last=rows.at(-1),drift=Math.max(...rows.map(r=>Math.hypot(r.pos.x-first.pos.x,r.pos.y-first.pos.y)));
     if(kind==='defuse')check(map+' actual continuous defuse advances without moving or firing',rows.length>=20&&rows.every(r=>r.round===c.round&&r.locked&&r.shots===0)&&drift<.001&&last.progress>first.progress,{first,last,drift,samples:rows.length});
     else check(map+' genuine quiet sniper holds position and reserved angle',rows.length>=20&&rows.every(r=>r.round===c.round&&['awp','scout'].includes(r.gun)&&r.intent?.kind==='post-plant-hold'&&!r.intent.aim)&&drift<.05&&rows.every(r=>Math.abs(((r.va-first.va)%360+540)%360-180)<.01),{first,last,drift,samples:rows.length});
     await capture(map+'-latest-'+kind);fs.writeFileSync(path.join(out,map+'-'+kind+'-rows.json'),JSON.stringify(rows,null,2));cases.push(kind);await native('[data-testid="cs-exit-pov"]');
    }
    evidence.maps.push({map,file,scenarios,cases});fs.writeFileSync(path.join(out,'progress.json'),JSON.stringify(evidence,null,2));continue;
   }
   if(args.occlusionOnly==='true'){
    const frames=await chrome.evaluate('return window.__ESMO_FPS_SCENE__.liveRef.current.sim.frames.slice(24,700).map((f,i)=>({index:i+24,smokes:f.smokes,players:f.players.map(p=>({id:p.id,pos:p.pos,va:p.va,side:p.side,dead:p.dead,blindSec:p.blindSec}))}));');
    const walls=api.c5a2SolidObstacles(api.MAPS[map]),candidates=[],chosen=new Set();
    for(const f of frames){for(const p of f.players){if(p.dead||p.blindSec>0||chosen.has(p.id))continue;const target=f.players.find(q=>{if(q.dead||q.side===p.side)return false;const d=Math.hypot(q.pos.x-p.pos.x,q.pos.y-p.pos.y),angle=Math.atan2(q.pos.y-p.pos.y,q.pos.x-p.pos.x)*180/Math.PI,delta=Math.abs(((angle-p.va)%360+540)%360-180);return d>12&&d<70&&delta<10&&api.lineBlocked(p.pos,q.pos,walls)&&!api.smokeBlocks(p.pos,q.pos,f.smokes);});if(target){candidates.push({index:f.index,actor:p.id,target:target.id,pos:p.pos,targetPos:target.pos});chosen.add(p.id);}if(candidates.length===5)break;}if(candidates.length===5)break;}
    if(!candidates.length)throw new HarnessError(map+' solid-wall POV scenario NOT_TRIGGERED');
    for(const [ci,c]of candidates.entries()){
     await seekFpsNativeTimeline({chrome,sleep,index:c.index});await native(`[data-esmo-fps-player-card="${c.actor}"]`);await native('[data-testid="cs-camera-preset-pov"]');await sleep(300);
     const state=await chrome.evaluate('const s=window.__ESMO_FPS_SCENE__,f=s.liveRef.current.sim.frames[s.liveRef.current.fIdx];return {selected:s.liveRef.current.selected,mode:s.liveRef.current.cameraMode,players:f.players.map(p=>({id:p.id,pos:p.pos,side:p.side,dead:p.dead,visible:s.players.find(P=>P.id===p.id)?.g.visible,label:s.players.find(P=>P.id===p.id)?.nameSpr.visible,health:s.players.find(P=>P.id===p.id)?.hpGroup.visible}))};');
     const self=state.players.find(p=>p.id===c.actor),leaks=state.players.filter(p=>!p.dead&&p.side!==self.side&&p.visible&&(p.label||p.health)&&api.lineBlocked(self.pos,p.pos,walls));
     check(map+' actual solid-wall POV '+ci+' hides enemy overlays',state.selected===c.actor&&state.mode==='pov'&&leaks.length===0,{c,leaks});await capture(map+'-occlusion-'+ci);await native('[data-testid="cs-exit-pov"]');
    }
    evidence.maps.push({map,candidates});continue;
   }
   if(args.roomOnly==='true'){
    const rooms=api.MAPS[map].rooms,coverage=[];
    for(const [ri,room]of rooms.entries()){
     const observed=await chrome.evaluate(`const room=${JSON.stringify(room)},s=window.__ESMO_FPS_SCENE__,frames=s.liveRef.current.sim.frames;for(let i=0;i<frames.length;i++){const f=frames[i];if(f.roundSec<12)continue;const p=f.players.find(p=>!p.dead&&p.pos.x>room.x+1.5&&p.pos.x<room.x+room.w-1.5&&p.pos.y>room.y+1.5&&p.pos.y<room.y+room.h-1.5);if(p)return{index:i,actor:p.id,role:p.role,pos:p.pos};}return null;`);
     if(!observed){coverage.push({room:room.id||room.label,status:'NOT_TRIGGERED',reason:'No natural saved-frame inhabitant in this canonical match'});console.log('NOT_TRIGGERED '+map+'/'+(room.id||room.label));continue;}
     await seekFpsNativeTimeline({chrome,sleep,index:observed.index});await native(`[data-esmo-fps-player-card="${observed.actor}"]`);await native('[data-testid="cs-camera-preset-pov"]');await sleep(250);
     const state=await chrome.evaluate('const s=window.__ESMO_FPS_SCENE__,f=s.liveRef.current.sim.frames[s.liveRef.current.fIdx];return {camera:s.camera.position.toArray(),mode:s.liveRef.current.cameraMode,selected:s.liveRef.current.selected,players:f.players.map(p=>({id:p.id,dead:p.dead,side:p.side,pos:p.pos,visible:s.players.find(P=>P.id===p.id)?.g.visible,label:s.players.find(P=>P.id===p.id)?.nameSpr.visible})),calls:s.renderer.info.render.calls};');
     const inside=state.camera[0]+50>room.x&&state.camera[0]+50<room.x+room.w&&state.camera[2]+50>room.y&&state.camera[2]+50<room.y+room.h;
     check(map+'/'+(room.id||room.label)+' actual actor POV enters playable interior',inside&&state.mode==='pov'&&state.selected===observed.actor&&state.calls>0,{observed,camera:state.camera,room});
     const self=state.players.find(p=>p.id===observed.actor),leaks=state.players.filter(p=>!p.dead&&p.side!==self.side&&p.visible&&p.label&&api.lineBlocked(self.pos,p.pos,api.c5a2SolidObstacles(api.MAPS[map])));
     check(map+'/'+(room.id||room.label)+' POV enemy labels do not reveal solid-wall enemies',leaks.length===0,leaks);
     await capture(map+'-room-'+ri);coverage.push({room:room.id||room.label,status:'OBSERVED',observed,state});await native('[data-testid="cs-exit-pov"]');
    }
    evidence.maps.push({map,coverage});fs.writeFileSync(path.join(out,'progress.json'),JSON.stringify(evidence,null,2));continue;
   }
   const scenario=await chrome.evaluate('const s=window.__ESMO_FPS_SCENE__,frames=s.liveRef.current.sim.frames;const i=frames.findIndex(f=>f.muzzles?.some(m=>m.hit&&m.damage>0&&m.shotAtMs<=f.roundSec*1000&&m.shotAtMs>f.roundSec*1000-160&&f.players.some(p=>p.id===m.attackerId&&!p.dead))&&f.players.some(p=>p.dead));const witness=i>=0?frames[i].muzzles.find(m=>m.hit&&m.damage>0&&m.shotAtMs<=frames[i].roundSec*1000&&m.shotAtMs>frames[i].roundSec*1000-160&&frames[i].players.some(p=>p.id===m.attackerId&&!p.dead)):null;return {index:i,hitActor:witness?.attackerId,completed:s.liveRef.current.sim.completed,frames:frames.length};');
   if(scenario.index<0)throw new HarnessError(map+' no genuine hit/death scenario');await seekFpsNativeTimeline({chrome,sleep,index:scenario.index});await sleep(250);
   const hit=await chrome.evaluate('const s=window.__ESMO_FPS_SCENE__;return {hit:s.hitFxEvidence,xVisible:s.players.filter(p=>p.dead.visible&&p.deadMat.opacity>0).map(p=>p.id),round:s.liveRef.current.sim.frames[s.liveRef.current.fIdx].rnd,scene:s.sceneVersion,children:s.fxGroup.children.filter(c=>c.name.startsWith("FPS_actual_hit")).map(c=>({name:c.name,count:c.count,visible:c.visible})),calls:s.renderer.info.render.calls,triangles:s.renderer.info.render.triangles};');
   check(map+' true hit creates bounded blood and no normal death X',hit.hit?.activeHits>0&&hit.hit.decals>0&&hit.hit.droplets>0&&hit.hit.decals<=48&&hit.hit.droplets<=24&&hit.xVisible.length===0,{scenario,hit});
   await capture(map+'-hit');
   if(scenario.hitActor){await native(`[data-esmo-fps-player-card="${scenario.hitActor}"]`);await native('[data-testid="cs-camera-preset-pov"]');await sleep(300);await capture(map+'-hit-pov');await native('[data-testid="cs-exit-pov"]');}
   if(args.detailOnly==='true'){
    await native('[data-testid="cs-camera-preset-overview"]');await sleep(1200);const r=await canvas();
    const target=await chrome.evaluate('const s=window.__ESMO_FPS_SCENE__,f=s.liveRef.current.sim.frames[s.liveRef.current.fIdx],m=f.muzzles.find(m=>m.hit&&m.damage>0&&m.shotAtMs<=f.roundSec*1000&&m.shotAtMs>f.roundSec*1000-160&&f.players.some(p=>p.id===m.attackerId&&!p.dead)),trace=f.tracers.find(t=>t.eventId===m.eventId),p=s.camera.position.clone().set(trace.to.x-50,0,trace.to.y-50).project(s.camera),r=s.renderer.domElement.getBoundingClientRect();return {x:r.x+(p.x+1)*r.width/2,y:r.y+(1-p.y)*r.height/2,world:trace.to,event:m};');
    for(const count of [1,2]){await chrome.send('Input.dispatchMouseEvent',{type:'mousePressed',x:target.x,y:target.y,button:'left',buttons:1,clickCount:count});await chrome.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:target.x,y:target.y,button:'left',buttons:0,clickCount:count});}await sleep(400);
    // The real pick may hit a nearer actor. Reframe through native spectator pan,
    // never by changing scene/camera state, before taking the visual evidence.
    const pan=await chrome.evaluate(`const c=window.__ESMO_FPS_SCENE__.cam,dx=${target.world.x}-50-c.dTgt.x,dz=${target.world.y}-50-c.dTgt.z,s=c.dRadius*.0018;return {x:(-Math.cos(c.dTheta)*dx+Math.sin(c.dTheta)*dz)/s,y:(Math.sin(c.dTheta)*dx+Math.cos(c.dTheta)*dz)/s};`);
    await drag('left',pan.x,pan.y);
    for(let i=0;i<13;i++)await chrome.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:r.x+r.width/2,y:r.y+r.height/2,deltaX:0,deltaY:-120});await sleep(900);await capture(map+'-blood-detail');
    const detail=await chrome.evaluate('const s=window.__ESMO_FPS_SCENE__;return {hit:s.hitFxEvidence,camera:s.camera.position.toArray(),target:s.cam.dTgt.toArray(),radius:s.cam.dRadius};');check(map+' genuine hit close view retains current blood',detail.hit.activeHits>0&&detail.hit.decals>0&&detail.radius<=19&&Math.hypot(detail.target[0]-(target.world.x-50),detail.target[2]-(target.world.y-50))<.1,{target,detail});
    evidence.maps.push({map,scenario,hit,target,detail});continue;
   }
   await native('[data-testid="cs-analysis-layer"]');await sleep(150);const marked=await chrome.evaluate('const s=window.__ESMO_FPS_SCENE__;return s.players.filter(p=>p.dead.visible&&p.deadMat.opacity>0).map(p=>p.id);');check(map+' optional analysis explicitly reveals actual death locations',marked.length>0,marked);await native('[data-testid="cs-analysis-layer"]');
   await seekFpsNativeTimeline({chrome,sleep,index:0});const clear=await chrome.evaluate('return window.__ESMO_FPS_SCENE__.hitFxEvidence;');check(map+' rewind removes future blood',clear.decals===0&&clear.droplets===0,clear);
   await native('[data-testid="cs-camera-preset-overview"]');await sleep(1200);let a=await pose();await drag('left',70,25);let b=await pose();check(map+' left drag pans without rotating',delta(a.target,b.target)>.5&&Math.abs(a.theta-b.theta)<.0001,{a,b});
   a=b;await drag('right',60,20);b=await pose();check(map+' right drag rotates without pan',Math.abs(a.theta-b.theta)>.1&&delta(a.target,b.target)<.001,{a,b});
   const r=await canvas();a=b;await chrome.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:r.x+r.width*.5,y:r.y+r.height*.5,deltaX:0,deltaY:-120});await sleep(200);b=await pose();check(map+' wheel zoom stays in bounds',b.radius<a.radius&&b.radius>=18&&b.radius<=200,{a,b});
   const beforeFocus=await pose();const x=r.x+r.width*.65,y=r.y+r.height*.62;for(const count of [1,2]){await chrome.send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',buttons:1,clickCount:count});await chrome.send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',buttons:0,clickCount:count});}await sleep(400);const focused=await pose();check(map+' double click focuses a world position',delta(beforeFocus.target,focused.target)>.5&&focused.radius<=65,{beforeFocus,focused});
   const actor=await chrome.evaluate('return window.__ESMO_FPS_SCENE__.liveRef.current.sim.frames[0].players.find(p=>!p.dead).id;');await native(`[data-esmo-fps-player-card="${actor}"]`);await native('[data-testid="cs-camera-preset-pov"]');await sleep(250);a=await pose();await drag('left',70,20);const pr=await canvas();await chrome.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:pr.x+pr.width/2,y:pr.y+pr.height/2,deltaX:0,deltaY:120});await sleep(200);b=await pose();check(map+' POV remains actor locked under drag and zoom',b.mode==='pov'&&b.selected===a.selected&&b.fov===a.fov&&Math.hypot(...a.position.map((v,i)=>v-b.position[i]))<.001,{a,b});
   await native('[data-testid="cs-camera-auto-director"]');await sleep(300);const reset=await pose();check(map+' reset returns to automatic overview',reset.mode==='tactical'&&reset.selected===null,reset);
   if(map==='mirage'){
    await chrome.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await sleep(500);await native('[data-testid="cs-camera-preset-overview"]');await sleep(1000);
    const r=await canvas(),x=r.x+r.width*.5,y=r.y+r.height*.5;a=await pose();
    await chrome.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});await chrome.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+45,y:y+15,id:1}]});await chrome.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(250);b=await pose();check('390 native one-finger pan',delta(a.target,b.target)>.5&&Math.abs(a.theta-b.theta)<.001,{a,b});
    a=b;await chrome.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-25,y,id:1},{x:x+25,y,id:2}]});await chrome.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-40,y,id:1},{x:x+40,y,id:2}]});await chrome.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(250);b=await pose();check('390 native two-finger zoom',b.radius<a.radius&&b.selected===null,{a,b});
    await capture('mirage-touch-390');await chrome.send('Emulation.setDeviceMetricsOverride',{width:1366,height:1000,deviceScaleFactor:1,mobile:false});await sleep(350);
   }
   evidence.maps.push({map,scenario,hit});fs.writeFileSync(path.join(out,'progress.json'),JSON.stringify(evidence,null,2));
  }
  check('zero browser page errors',chrome.pageErrors.length===0,chrome.pageErrors);
 }});if(result.evidence?.cleanup.chromeClose.confirmed!==true)result={...result,verdict:'HARNESS_FAIL',failurePhase:'cleanup'};
}catch(error){result={verdict:'HARNESS_FAIL',pass:0,fail:0,failurePhase:error.stack};console.error(error.stack);}finally{if(server)await new Promise(r=>server.httpServer.close(r));if(out&&fs.existsSync(out))fs.writeFileSync(path.join(out,'gate.json'),JSON.stringify({...evidence,result},null,2));}
console.log(`Owner4H browser: ${result?.pass||0}/${(result?.pass||0)+(result?.fail||0)} RESULT=${result?.verdict}`);await finishGate(result);
