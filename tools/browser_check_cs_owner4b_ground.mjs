import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {preview} from 'vite';
import {runGate,finishGate,HarnessError} from './browser/harness.mjs';
import {clickFpsDNative} from './browser/fpsReplayUiProbe.mjs';
import {seekFpsNativeTimeline} from './browser/fpsNativeTimeline.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex'),args={};let server,out,result;
const evidence={schema:'cs-owner4b-actual-ground-browser.v1',scenarios:[],checks:[],savedPngs:0,visualClosure:'OWNER_REVIEW_REQUIRED',mobile:'NOT_RUN'};
try{
 for(const arg of process.argv.slice(2)){const m=/^--(buildDir|outDir)=(.+)$/.exec(arg);if(!m)throw new HarnessError('Explicit buildDir/outDir required');args[m[1]]=m[2];}
 if(!args.buildDir||!args.outDir)throw new HarnessError('Missing archive/evidence arguments');
 const dir=path.resolve(args.buildDir);out=path.resolve(args.outDir);
 for(const [base,file]of [['review/cs-major-upgrade/profile-builds',dir],['review/cs-major-upgrade/evidence',out]]){const rel=path.relative(path.resolve(base),file);if(!rel||rel.startsWith('..')||path.isAbsolute(rel))throw new HarnessError('Outside own archive/evidence');}
 if(fs.existsSync(out))throw new HarnessError('Refuse evidence overwrite');fs.mkdirSync(out,{recursive:true});
 const manifest=JSON.parse(fs.readFileSync(path.join(dir,'build-manifest.json'))),source=createHash('sha256'),bundle=createHash('sha256');
 const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','--','src/battle/fps','src/screens/fps/CsMatchScreen.jsx','src/screens/fps/CsResultScreen.jsx','src/platform/contracts/CsMatchResult.js','public/assets/fps','public/audio/cs'],{encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/).filter(Boolean).sort();for(const f of files){source.update(f+'\0');source.update(fs.readFileSync(f));source.update('\0');}
 for(const f of fs.readdirSync(path.join(dir,'assets')).filter(f=>f.endsWith('.js')).sort()){bundle.update(f+'\0');bundle.update(fs.readFileSync(path.join(dir,'assets',f)));}
 if(source.digest('hex')!==manifest.sourceFingerprint.sha256||bundle.digest('hex')!==manifest.bundleSha256)throw new HarnessError('Source/archive mismatch');evidence.archive={dir,manifest};
 server=await preview({build:{outDir:dir},preview:{host:'127.0.0.1',port:0,open:false}});
 result=await runGate({name:'Owner4B actual visible ground',externalUrl:`http://127.0.0.1:${server.httpServer.address().port}/ESMO-/`,workspaceOnly:true,headless:false,timeoutMs:360000,evidenceOut:path.join(out,'harness.json'),async run({chrome,ck,sleep}){
  const native=selector=>clickFpsDNative({chrome,sleep,selector}),check=(label,ok,data)=>{ck(label,ok,JSON.stringify(data));evidence.checks.push({label,ok,data});};
  await chrome.send('Emulation.setDeviceMetricsOverride',{width:1366,height:900,deviceScaleFactor:1,mobile:false});
  for(const map of ['mirage','dust2','inferno']){
   await chrome.navigate(`http://127.0.0.1:${server.httpServer.address().port}/ESMO-/?c5c=battle&map=${map}&seed=505001`);
   let ready=false;const end=Date.now()+150000;do{ready=await chrome.evaluate(`return Boolean(window.__ESMO_FPS_SCENE__?.players?.length===10&&window.__ESMO_FPS_SCENE__.players.every(p=>p.rigged?.mode==='rigged')&&window.__ESMO_FPS_SCENE__.c3Environment?.summary?.atlasLoaded);`);if(!ready)await sleep(200);}while(!ready&&Date.now()<end);if(!ready)throw new HarnessError(map+' assets readiness timeout');
   if(await chrome.evaluate('return window.__ESMO_FPS_SCENE__.liveRef.current.playing;'))await native('[data-testid="cs-playback-controls"] button[aria-label="暫停比賽播放"]');
   const scenarios=await chrome.evaluate(`const fs=window.__ESMO_FPS_SCENE__.liveRef.current.sim.frames,found={};for(let i=1;i<fs.length;i++){const f=fs[i];if(f.buyP)continue;for(const p of f.players){if(!found.crouch&&!p.dead&&p.stance==='crouched')found.crouch={kind:'crouch',index:i,id:p.id,round:f.rnd,roundSec:f.roundSec};if(!found.death&&p.dead&&fs[i-1]?.rnd===f.rnd&&fs[i-1].players.find(a=>a.id===p.id)?.dead)found.death={kind:'death',index:i,id:p.id,round:f.rnd,roundSec:f.roundSec};}if(found.crouch&&found.death)break;}return ['crouch','death'].map(kind=>found[kind]||{kind,status:'NOT_TRIGGERED'});`);
   for(const scenario of scenarios){
    const row={map,scenario};evidence.scenarios.push(row);if(scenario.status==='NOT_TRIGGERED'){console.log(map+'/'+scenario.kind+' NOT_TRIGGERED');continue;}
    await seekFpsNativeTimeline({chrome,sleep,index:scenario.index});await native(`[data-esmo-fps-player-card="${scenario.id}"]`);await sleep(300);
    row.observed=await chrome.evaluate(`const st=window.__ESMO_FPS_SCENE__,live=st.liveRef.current,f=live.sim.frames[live.fIdx],p=f.players.find(p=>p.id===${JSON.stringify(scenario.id)}),c=st.players.find(p=>p.id===${JSON.stringify(scenario.id)}).rigged,v=c.root.position.clone();c.root.updateWorldMatrix(true,false);c.root.updateMatrixWorld(true);const meshRows=[];let minBody=Infinity,minFoot=Infinity,vertices=0,feet=0;c.root.traverseVisible(mesh=>{if(!mesh.isMesh||!mesh.geometry?.attributes.position)return;if(mesh.isSkinnedMesh)mesh.skeleton.update();let meshMin=Infinity;const a=mesh.geometry.attributes.position,si=mesh.geometry.attributes.skinIndex,sw=mesh.geometry.attributes.skinWeight;for(let i=0;i<a.count;i++){v.fromBufferAttribute(a,i);if(mesh.isSkinnedMesh)mesh.applyBoneTransform(i,v);mesh.localToWorld(v);const gap=v.y-st.sampleGroundHeight(v.x,v.z);meshMin=Math.min(meshMin,gap);minBody=Math.min(minBody,gap);vertices++;let w=0;if(si&&sw)for(const key of ['getX','getY','getZ','getW'])if(/^(foot|ball|toe)_/.test(mesh.skeleton.bones[si[key](i)]?.name||''))w+=sw[key](i);if(w>=.5){minFoot=Math.min(minFoot,gap);feet++;}}meshRows.push({name:mesh.name,gap:meshMin,skinned:mesh.isSkinnedMesh||false,importedWeapon:!!mesh.userData?.esmoMajorImportedWeapon});});return{frame:live.fIdx,map:st.mapKey,playing:live.playing,selected:live.selected,actor:{id:p.id,dead:p.dead,stance:p.stance,state:p.state,pos:p.pos,elevation:p.elevation},minBody,minFoot,vertices,feet,meshRows,groundOffset:c.groundOffset,action:c.currentAction,actionTime:c.actions.get(c.currentAction)?.time,actionDuration:c.actions.get(c.currentAction)?.getClip()?.duration,modelY:c.model.position.y,renderCalls:st.renderer.info.render.calls};`);
    const a=row.observed;if(scenario.kind==='death')check(map+'/death paused seek really reaches settled corpse',a.action==='Death01'&&a.actionTime>=a.actionDuration-.00001,{action:a.action,time:a.actionTime,duration:a.actionDuration});check(map+'/'+scenario.kind+' native saved pose precondition',a.frame===scenario.index&&a.map===map&&!a.playing&&a.selected===scenario.id&&(scenario.kind==='death'?a.actor.dead:a.actor.stance==='crouched'&&!a.actor.dead),a);
    check(map+'/'+scenario.kind+' actual visible support geometry',a.vertices>10000&&a.feet>100,{vertices:a.vertices,feet:a.feet});const gap=scenario.kind==='death'?a.minBody:a.minFoot;check(map+'/'+scenario.kind+' visible skin against same rendered ground within 8cm',Number.isFinite(gap)&&Math.abs(gap)<=.08,{gap});
    if(evidence.savedPngs<4){await chrome.evaluate(`document.querySelector('canvas').scrollIntoView({block:'center',behavior:'instant'});return true;`);const clip=await chrome.evaluate(`const r=document.querySelector('canvas').getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,scale:1};`);const shot=await chrome.send('Page.captureScreenshot',{format:'png',clip,captureBeyondViewport:false});const bytes=Buffer.from(shot.data,'base64'),file=map+'-'+scenario.kind+'.png';fs.writeFileSync(path.join(out,file),bytes,{flag:'wx'});row.png={file,sha256:hash(bytes),bytes:bytes.length};evidence.savedPngs++;}
    fs.writeFileSync(path.join(out,'ground.json'),JSON.stringify(evidence,null,2));
   }
  }
  check('No browser page/error console',!chrome.pageErrors.length&&!chrome.consoleLines.some(s=>s.startsWith('[error]')),{page:chrome.pageErrors,console:chrome.consoleLines.filter(s=>s.startsWith('[error]'))});
 }});
}catch(e){result={verdict:'HARNESS_FAIL',pass:0,fail:0,failurePhase:String(e.stack)};console.error(e.stack);}finally{if(server)await new Promise(resolve=>server.httpServer.close(resolve));if(out&&fs.existsSync(out))fs.writeFileSync(path.join(out,'gate.json'),JSON.stringify({...evidence,result},null,2));}
console.log(`Owner4B ground browser ${result?.pass||0}/${(result?.pass||0)+(result?.fail||0)} RESULT=${result?.verdict}`);await finishGate(result);
