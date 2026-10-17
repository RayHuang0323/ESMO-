// Owner4C: current archive only; native controls and read-only frame/scene observers.
// Screenshots and collection PASS do not establish every map angle or real-device UX.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {preview} from 'vite';
import {runGate,finishGate,HarnessError} from './browser/harness.mjs';
import {clickFpsDNative} from './browser/fpsReplayUiProbe.mjs';
import {seekFpsNativeTimeline} from './browser/fpsNativeTimeline.mjs';
const args=Object.fromEntries(process.argv.slice(2).map(a=>{const m=/^--(buildDir|outDir|mode|rooms)=(.+)$/.exec(a);if(!m)throw Error('Explicit archive/output/mode required');return[m[1],m[2]];}));
const sha=b=>createHash('sha256').update(b).digest('hex');
let server,result,out;
const evidence={schema:'cs-owner4c-native-closure.v1',mode:args.mode,checks:[],scenarios:[],sceneMutated:false,framesMutated:false,realDevice:'NOT_RUN',visualClosure:'REQUIRES_IMAGE_REVIEW'};
const observe=`const st=window.__ESMO_FPS_SCENE__,l=st.liveRef.current,f=l.sim.frames[l.fIdx],n=l.sim.frames[l.fIdx+1],p=f.players.find(p=>p.id===l.selected),fb=document.querySelector('[data-fps-pov-feedback]'),fe=fb?.querySelector('.fps-pov-flash');
const pool=st.fxGroup.children,roots=pool.filter(o=>o.isGroup&&/^fps-utility-body-\\d+$/.test(o.name)),after=pool.slice(pool.indexOf(roots.at(-1))+1),caps=st.utilityFx.contract.caps,bursts=after.filter(o=>o.isSprite&&o.material.map===st.tex.flash).slice(0,caps.flashBursts*2),halos=after.filter(o=>o.isSprite&&o.material.map===st.tex.glow).slice(0,caps.flashBursts);
if(roots.length!==caps.throwableEvents||bursts.length!==caps.flashBursts*2||halos.length!==caps.flashBursts)throw Error('Exact bounded utility pool mapping absent');
const visible=o=>{for(let a=o;a;a=a.parent)if(!a.visible)return false;return true;},shape=o=>({name:o.name,pos:o.getWorldPosition(st.camera.position.clone()).toArray(),scale:o.scale.toArray(),opacity:o.material.opacity,color:o.material.color?.getHex(),floor:st.sampleGroundHeight(o.getWorldPosition(st.camera.position.clone()).x,o.getWorldPosition(st.camera.position.clone()).z)}),objects=[];
st.fxGroup.traverse(o=>{if(o.material&&visible(o))objects.push({...shape(o),texture:halos.includes(o)?'glow':bursts.includes(o)?'flash':o.material.map===st.tex.glow||o.material.map===st.tex.flash?'shared-gunplay-texture':'other'});});
const span=n?.rnd===f.rnd?n.roundSec-f.roundSec:0,sec=f.roundSec+st.subT*span,c=st.renderer.domElement.getBoundingClientRect();
return{ms:performance.now(),index:l.fIdx,round:f.rnd,sec,sub:st.subT,playing:l.playing,speed:l.speed,mode:l.cameraMode,selected:l.selected,actor:p?{id:p.id,dead:p.dead,blindSec:p.blindSec,pos:p.pos,va:p.va}:null,pose:st.camera.position.toArray(),quaternion:st.camera.quaternion.toArray(),he:st.utilityFxEvidence.heVfx,objects,flashes:(f.throwables||[]).filter(t=>t.type==='flash'&&!t.flying&&t.boom>0).map(t=>({id:t.id,age:sec-t.detonatedAtRoundSec})),feedback:{blind:fb?.dataset.blind,opacity:fe?getComputedStyle(fe).opacity:null},povBlindSec:st.povWeaponDiagnostics?.blindSec,canvas:{x:c.x,y:c.y,width:c.width,height:c.height},render:{calls:st.renderer.info.render.calls,triangles:st.renderer.info.render.triangles,programs:(st.renderer.info.programs||[]).map(p=>({name:p.name,runnable:p.diagnostics?.runnable}))}};`;
try{
 if(!['effects','walls'].includes(args.mode))throw new HarnessError('mode effects/walls required');
 const dir=path.resolve(args.buildDir||'');out=path.resolve(args.outDir||'');
 for(const [root,p]of [['review/cs-major-upgrade/profile-builds',dir],['review/cs-major-upgrade/evidence',out]]){const r=path.relative(path.resolve(root),p);if(!r||r.startsWith('..')||path.isAbsolute(r))throw new HarnessError('Outside own scope');}
 if(fs.existsSync(out))throw new HarnessError('Never overwrite evidence');fs.mkdirSync(out,{recursive:true});
 const manifest=JSON.parse(fs.readFileSync(path.join(dir,'build-manifest.json'))),h=createHash('sha256'),bundle=createHash('sha256');
 const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','--','src/battle/fps','src/screens/fps/CsMatchScreen.jsx','src/screens/fps/CsResultScreen.jsx','src/screens/fps/CsProfessionalReport.jsx','src/screens/fps/csProfessionalReport.css','src/platform/contracts/CsMatchResult.js','src/data/playerModel.js','src/platform/contracts/matchSquad.js','src/screens/manage/RosterScreen.jsx','src/screens/manage/PlayerDetailScreen.jsx','public/assets/fps','public/audio/cs'],{encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/).filter(Boolean).sort();
 for(const f of files){h.update(f+'\0');h.update(fs.readFileSync(f));h.update('\0');}
 for(const f of fs.readdirSync(path.join(dir,'assets')).filter(f=>f.endsWith('.js')).sort()){bundle.update(f+'\0');bundle.update(fs.readFileSync(path.join(dir,'assets',f)));}
 if(h.digest('hex')!==manifest.sourceFingerprint.sha256||files.length!==manifest.sourceFingerprint.files||bundle.digest('hex')!==manifest.bundleSha256)throw new HarnessError('Source or bundle mismatch');evidence.archive={dir,manifest};
 server=await preview({build:{outDir:dir},preview:{host:'127.0.0.1',port:0,open:false}});const url=`http://127.0.0.1:${server.httpServer.address().port}/ESMO-/`;
 result=await runGate({name:'Owner4C '+args.mode,externalUrl:url,workspaceOnly:true,headless:false,timeoutMs:540000,evidenceOut:path.join(out,'harness.json'),async run({chrome,ck,sleep}){
  const check=(label,ok,detail)=>{ck(label,Boolean(ok),JSON.stringify(detail??{}));evidence.checks.push({label,ok:Boolean(ok),detail});};
  const save=()=>fs.writeFileSync(path.join(out,'observations.json'),JSON.stringify(evidence,null,2));
  const native=selector=>clickFpsDNative({chrome,sleep,selector});
  const pause=async()=>{if(await chrome.evaluate('return window.__ESMO_FPS_SCENE__.liveRef.current.playing;'))await native('[aria-label="暫停比賽播放"]');};
  const shot=async(name)=>{await chrome.evaluate(`document.querySelector('canvas').scrollIntoView({block:'center',behavior:'instant'});return true;`);const before=await chrome.evaluate(observe),clip={...before.canvas,scale:1};if(clip.x<0||clip.y<0||clip.x+clip.width>1367||clip.y+clip.height>901)throw new HarnessError('Canvas outside viewport');const r=await chrome.send('Page.captureScreenshot',{format:'png',clip,captureBeyondViewport:false}),bytes=Buffer.from(r.data,'base64');fs.writeFileSync(path.join(out,name+'.png'),bytes,{flag:'wx'});return{file:name+'.png',sha256:sha(bytes),before,after:await chrome.evaluate(observe)};};
  const collect=()=>chrome.evaluate(`const read=()=>{${observe}},rows=[],start=performance.now();return await new Promise(resolve=>{function sample(){rows.push(read());if(performance.now()-start>=1700)resolve(rows);else requestAnimationFrame(sample);}requestAnimationFrame(sample);});`);
  await chrome.send('Emulation.setDeviceMetricsOverride',{width:1366,height:900,deviceScaleFactor:1,mobile:false});
  for(const map of args.mode==='effects'?['dust2','inferno']:['mirage']){
   await chrome.navigate(url+`?c5c=battle&map=${map}&seed=505001`);const until=Date.now()+150000;let ready;do{ready=await chrome.evaluate(`return Boolean(window.__ESMO_FPS_SCENE__?.players?.length===10&&window.__ESMO_FPS_SCENE__.players.every(p=>p.rigged?.mode==='rigged')&&window.__ESMO_FPS_SCENE__.c3Environment?.summary?.atlasLoaded);`);if(!ready)await sleep(200);}while(!ready&&Date.now()<until);if(!ready)throw new HarnessError(map+' assets not ready');await pause();await native('[data-testid="match-speed-1"]');
   if(args.mode==='effects')for(const type of ['he','flash']){
    const scenario=await chrome.evaluate(`const fs=window.__ESMO_FPS_SCENE__.liveRef.current.sim.frames;for(let i=1;i<fs.length-4;i++){const f=fs[i];if(f.buyP||fs[i+4].rnd!==f.rnd)continue;for(const t of f.throwables||[]){if(t.type!==${JSON.stringify(type)}||t.flying||t.boom!==3||t.detonatedAtRoundSec!==f.roundSec)continue;const p=f.players.find(p=>!p.dead&&(${JSON.stringify(type)}==='flash'?p.blindSec>.75:!p.blindSec));if(p)return{index:i,id:p.id,type:t.type,throwable:t,round:f.rnd};}}return null;`);
    const row={map,type,scenario};evidence.scenarios.push(row);check(map+'/'+type+' genuine saved event exists',Boolean(scenario));if(!scenario){save();continue;}
    await seekFpsNativeTimeline({chrome,sleep,index:scenario.index});await native(`[data-esmo-fps-player-card="${scenario.id}"]`);await native('[data-testid="cs-camera-preset-pov"]');await sleep(200);
    row.onset=await chrome.evaluate(observe);check(map+'/'+type+' native paused onset/POV/1x',!row.onset.playing&&row.onset.index===scenario.index&&row.onset.selected===scenario.id&&row.onset.mode==='pov'&&row.onset.speed===1);
    row.onsetPng=await shot(map+'-'+type+'-onset');
    await native('[aria-label="播放比賽"]');row.samples=await collect();await pause();row.expired=await chrome.evaluate(observe);row.expiredPng=await shot(map+'-'+type+'-expired');
    check(map+'/'+type+' actual 1x render advances continuously',row.samples.length>=20&&row.samples.every(s=>s.playing&&s.speed===1)&&row.samples.at(-1).index>row.onset.index,{samples:row.samples.length,first:row.samples[0].sec,last:row.samples.at(-1).sec});
    if(type==='he'){
     const parts=row.onset.objects.filter(o=>/^fps-he-/.test(o.name));check(map+' HE contact/sparks/dust above true surface',parts.some(o=>o.name.includes('contact'))&&parts.some(o=>o.name.includes('spark'))&&parts.some(o=>o.name.includes('dust'))&&parts.every(o=>o.pos[1]>o.floor),parts);
     const heRows=[row.onset,...row.samples],contact=s=>s.objects.some(o=>o.name.startsWith('fps-he-contact-')),dust=s=>s.objects.some(o=>o.name.startsWith('fps-he-dust-'));
     check(map+' HE true contact expires .18s and dust survives then expires 1.10s',heRows.some(s=>s.sec-row.onset.sec>=.18&&s.sec-row.onset.sec<1.05&&!contact(s)&&dust(s))&&heRows.some(s=>s.sec-row.onset.sec>=1.1&&!contact(s)&&!dust(s)));
     check(map+' HE visible samples never use glow/white world sprites',heRows.every(s=>!s.objects.some(o=>o.texture==='glow'||o.texture==='flash')));
    }else{
     check(map+' flash genuine short world onset',row.onset.objects.some(o=>o.texture==='flash')&&row.onset.flashes.some(t=>t.id===scenario.throwable.id&&t.age===0));
     const rows=[row.onset,...row.samples,row.expired];check(map+' blind actors never emit white glow halos',rows.every(s=>!s.objects.some(o=>o.texture==='glow')));
     const after=rows.filter(s=>s.flashes.some(t=>t.id===scenario.throwable.id&&t.age>=.12)&&!s.flashes.some(t=>t.age>=0&&t.age<.12));
     check(map+' world flash gone after .12s while genuine POV blindness persists',after.length>=5&&after.every(s=>!s.objects.some(o=>o.texture==='flash'))&&after.some(s=>s.actor.blindSec>.75&&s.povBlindSec>0&&s.feedback.blind==='true'&&Number(s.feedback.opacity)>0),{samples:after.length});
    }save();
   }
   if(args.mode==='walls'){
    const rooms=await chrome.evaluate(`const st=window.__ESMO_FPS_SCENE__,rooms=[];st.c3Environment.group.traverse(o=>{if(o.isMesh&&/^Room_.*room-wall$/.test(o.name)){o.geometry.computeBoundingBox();const b=o.geometry.boundingBox;rooms.push({name:o.name,min:b.min.toArray(),max:b.max.toArray()});}});return rooms;`);evidence.rooms=rooms;
    const requested=args.rooms?.split(',');if(requested?.some(id=>!rooms.some(r=>r.name==='Room_'+id+'_room-wall')))throw new HarnessError('Unknown room selection');
    for(const room of rooms.filter(r=>!requested||requested.some(id=>r.name==='Room_'+id+'_room-wall'))){
     const candidates=await chrome.evaluate(`const room=${JSON.stringify(room)},fs=window.__ESMO_FPS_SCENE__.liveRef.current.sim.frames,rows=[],cx=(room.min[0]+room.max[0])/2+50,cy=(room.min[2]+room.max[2])/2+50;for(let i=1;i<fs.length-7;i++){const f=fs[i];if(f.buyP||fs[i+7].rnd!==f.rnd)continue;for(const p of f.players){if(p.dead||p.blindSec>0||p.shooting>0)continue;const x=p.pos.x-50,z=p.pos.y-50,d=Math.hypot(Math.max(room.min[0]-x,0,x-room.max[0]),Math.max(room.min[2]-z,0,z-room.max[2])),angle=Math.atan2(cy-p.pos.y,cx-p.pos.x)*180/Math.PI,err=Math.abs(((angle-p.va+540)%360)-180),later=fs[i+4].players.find(q=>q.id===p.id);if(d<9&&err<65&&later&&!later.dead&&Math.hypot(later.pos.x-p.pos.x,later.pos.y-p.pos.y)>.6)rows.push({index:i,id:p.id,d,err,score:d+err*.1});}}return rows.sort((a,b)=>a.score-b.score).slice(0,8);`);
     // The first scored frames often belong to the same actor within one second.
     // Search diverse genuine windows rather than changing any visibility criterion.
     const diverse=await chrome.evaluate(`const room=${JSON.stringify(room)},fs=window.__ESMO_FPS_SCENE__.liveRef.current.sim.frames,rows=[],cx=(room.min[0]+room.max[0])/2+50,cy=(room.min[2]+room.max[2])/2+50;for(let i=1;i<fs.length-7;i++){const f=fs[i];if(f.buyP||fs[i+7].rnd!==f.rnd)continue;for(const p of f.players){if(p.dead||p.blindSec>0||p.shooting>0)continue;const x=p.pos.x-50,z=p.pos.y-50,d=Math.hypot(Math.max(room.min[0]-x,0,x-room.max[0]),Math.max(room.min[2]-z,0,z-room.max[2])),angle=Math.atan2(cy-p.pos.y,cx-p.pos.x)*180/Math.PI,err=Math.abs(((angle-p.va+540)%360)-180),later=fs[i+4].players.find(q=>q.id===p.id);if(d<9&&err<65&&later&&!later.dead&&Math.hypot(later.pos.x-p.pos.x,later.pos.y-p.pos.y)>.6)rows.push({index:i,id:p.id,d,err,score:d+err*.1,round:f.rnd,sec:f.roundSec});}}const chosen=[];for(const r of rows.sort((a,b)=>a.score-b.score)){if(chosen.some(q=>q.id===r.id&&q.round===r.round&&Math.abs(q.sec-r.sec)<3))continue;chosen.push(r);if(chosen.length===32)break;}return chosen;`);
     const row={room,candidates:diverse,originalTopCandidates:candidates,status:'NOT_TRIGGERED',attempts:[]};evidence.scenarios.push(row);
     for(const c of diverse){await pause();await seekFpsNativeTimeline({chrome,sleep,index:c.index});await native(`[data-esmo-fps-player-card="${c.id}"]`);await native('[data-testid="cs-camera-preset-pov"]');await chrome.evaluate(`document.querySelector('canvas').scrollIntoView({block:'center',behavior:'instant'});return true;`);await sleep(250);
      // Intersect actual indexed triangles at the actual eye height. Fixed world
      // vertex bands miss raised floors and large triangles spanning eye level.
      const surface=await chrome.evaluate(`const st=window.__ESMO_FPS_SCENE__,o=st.c3Environment.group.getObjectByName(${JSON.stringify(room.name)}),a=o.geometry.attributes.position,idx=o.geometry.index,points=[];st.scene.updateMatrixWorld(true);for(let i=0;i<(idx?idx.count:a.count);i+=3){const tri=[0,1,2].map(k=>st.camera.position.clone().fromBufferAttribute(a,idx?idx.getX(i+k):i+k).applyMatrix4(o.matrixWorld));for(const offset of [0,-.4,.4]){const y=st.camera.position.y+offset,cross=[];for(let k=0;k<3;k++){const p=tri[k],q=tri[(k+1)%3];if(Math.abs(q.y-p.y)<1e-8||y<Math.min(p.y,q.y)||y>Math.max(p.y,q.y))continue;cross.push(p.clone().lerp(q,(y-p.y)/(q.y-p.y)));}if(cross.length<2)continue;const v=cross[0].clone().lerp(cross[1],.5),ndc=v.clone().project(st.camera);if(Math.abs(ndc.x)>.85||Math.abs(ndc.y)>.85||ndc.z<0||ndc.z>1)continue;const target=v.clone().addScaledVector(v.clone().sub(st.camera.position).normalize(),.01),ray=st.readonlyWorldPointRayProbe(target.toArray()),hit=ray.hits[0],prefix=o.name.replace('room-wall','');if(hit?.name.startsWith(prefix)&&hit.distance<12)points.push({point:v.toArray(),ndc:ndc.toArray(),triangle:i/3,eyeOffset:offset,ray});if(points.length>=4)break;}if(points.length>=4)break;}return{points,camera:st.camera.position.toArray()};`);row.attempts.push({candidate:c,surface});if(!surface.points.length)continue;
      row.scenario=c;row.surface=surface;row.before=await chrome.evaluate(observe);row.pngs=[await shot(room.name+'-start')];await native('[aria-label="播放比賽"]');
      await chrome.evaluate(`document.querySelector('canvas').scrollIntoView({block:'center',behavior:'instant'});return true;`);
      row.pixelSequence=[];row.samples=[];
      for(let n=0;n<12;n++){
       const state=await chrome.evaluate(observe);row.samples.push(state);
       const projected=await chrome.evaluate(`const st=window.__ESMO_FPS_SCENE__,v=st.camera.position.clone().fromArray(${JSON.stringify(surface.points[0].point)}).project(st.camera);return v.toArray();`),r=state.canvas;
       const clip={x:Math.round(Math.max(r.x,Math.min(r.x+r.width-320,r.x+(projected[0]+1)*r.width/2-160))),y:Math.round(Math.max(r.y,Math.min(r.y+r.height-240,r.y+(1-projected[1])*r.height/2-120))),width:320,height:240,scale:1};
       const capture=await chrome.send('Page.captureScreenshot',{format:'png',clip,captureBeyondViewport:false}),bytes=Buffer.from(capture.data,'base64'),file=room.name+'-moving-'+String(n).padStart(2,'0')+'.png';fs.writeFileSync(path.join(out,file),bytes,{flag:'wx'});row.pixelSequence.push({file,sha256:sha(bytes),clip,projected,state});await sleep(65);
      }
      row.pngs.push(await shot(room.name+'-moving'));await pause();row.pngs.push(await shot(room.name+'-end'));row.after=await chrome.evaluate(observe);await sleep(200);row.still=await chrome.evaluate(observe);row.status='COLLECTED';
      check(room.name+' real near-wall visible triangles and movement',surface.points.length>0&&row.pixelSequence.length===12&&row.samples.every(s=>s.playing&&s.mode==='pov'&&s.selected===c.id)&&Math.max(...row.samples.map(s=>Math.hypot(...s.pose.map((v,k)=>v-row.before.pose[k]))))>.1,{points:surface.points.length,samples:row.samples.length});
      check(room.name+' pause freezes camera and authoritative frame',!row.still.playing&&row.still.index===row.after.index&&JSON.stringify(row.still.pose)===JSON.stringify(row.after.pose));break;
     }check(room.name+' genuine near-room window collected',row.status==='COLLECTED',{attempts:row.attempts.length,status:row.status});save();
    }
   }
  }
  evidence.errors={page:chrome.pageErrors,console:chrome.consoleLines.filter(l=>l.startsWith('[error]'))};check('Zero page/console errors',!evidence.errors.page.length&&!evidence.errors.console.length,evidence.errors);save();
 }});
 if(result.evidence?.cleanup?.chromeClose?.confirmed!==true)result={...result,verdict:'HARNESS_FAIL',failurePhase:'Chrome cleanup not confirmed'};
}catch(e){result={verdict:'HARNESS_FAIL',pass:0,fail:0,failurePhase:String(e.stack)};console.error(e.stack);}
finally{if(server)await new Promise(r=>server.httpServer.close(r));if(out&&fs.existsSync(out))fs.writeFileSync(path.join(out,'gate.json'),JSON.stringify({...evidence,result},null,2));}
console.log(`Owner4C ${args.mode}: ${result?.pass||0}/${(result?.pass||0)+(result?.fail||0)} RESULT=${result?.verdict}`);await finishGate(result);
