#!/usr/bin/env node
// 同一真 simulation fixture，逐 byte 驗證 archived Before source，再執行 After consumer。
// 不 simulate、不造 result／frame、不覆寫大 raw 副本。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { deriveFpsAnimationState as afterDerive } from '../src/battle/fps/presentation/fpsAnimationState.js';
import { createFpsMatchPresentation as afterPresentation } from '../src/battle/fps/presentation/fpsMatchPresentation.js';
import { readCsReplay } from '../src/battle/fps/fpsReplay.js';
const arg=name=>process.argv.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3);
const fixture=arg('fixture'),out=arg('out'),recovery='review/cs-major-upgrade/evidence/retention-policy-20261011/e-final-source-recovery.json.gz';
if(!fixture||!out||fs.existsSync(out))throw new Error('需要真 --fixture 及全新 --out，拒覆寫');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const gz=fs.readFileSync(fixture),input=JSON.parse(gunzipSync(gz).toString('utf8')),sim=input.schema?readCsReplay(JSON.stringify(input)).simulation:input;
const fixtureManifest=fs.existsSync(fixture+'.manifest.json')?JSON.parse(fs.readFileSync(fixture+'.manifest.json','utf8')):null;
if(fixtureManifest?.gzipSHA256&&fixtureManifest.gzipSHA256!==sha(gz))throw new Error('真fixture manifest gzip完整SHA不符');
if(sim.sceneVersion!=='major.v1'||sim.frames.length<100||sim.frames[0].players.length!==10)throw new Error('真 Major 全對局前提不足');
const saved=sha(JSON.stringify(sim)),archiveBytes=fs.readFileSync(recovery),archive=JSON.parse(gunzipSync(archiveBytes).toString('utf8')),lineage=[];
async function loadBefore(file){
 const f=archive.files.find(f=>f.path===file);if(!f?.base64)throw new Error('Before source缺bytes');
 const b=Buffer.from(f.base64,'base64');if(b.length!==f.bytes||sha(b)!==f.sha256)throw new Error('Before source完整SHA不符');
 let source=b.toString('utf8');const marker='from "./fpsAudioPlayback.js"';
 if(source.includes(marker)){if(source.split(marker).length!==2)throw new Error('Before只允許唯一import路徑解析調整');source=source.replace(marker,`from ${JSON.stringify(pathToFileURL(path.resolve('src/battle/fps/presentation/fpsAudioPlayback.js')).href)}`);}
 lineage.push({file,bytes:f.bytes,sha256:f.sha256,importResolutionOnly:source!==b.toString('utf8')});
 return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
}
const beforeAnimation=await loadBefore('src/battle/fps/presentation/fpsAnimationState.js'),beforeAudio=await loadBefore('src/battle/fps/presentation/fpsMatchPresentation.js');
function measure(derive,create,updated){
 const motion={samples:0,stationaryRun:0,slidingIdle:0,speedMismatchOverHalf:0,examples:[]},audio={types:{},sameFrameCues:0,duplicateIds:0,footsteps:0,scheduledFootsteps:0,invalidDelay:0,maxFootstepBatch:0,openingWindows:[]},ids=new Set(),roundWindows=new Map(),presentation=create({major:true});
 for(let i=0;i<sim.frames.length;i++){
  const f=sim.frames[i],pf=sim.frames[Math.max(0,i-1)],nf=sim.frames[i+1];
  if(nf?.rnd===f.rnd&&!f.buyP&&nf.roundSec>f.roundSec)for(const p of f.players){const n=nf.players.find(n=>n.id===p.id),previous=pf.players.find(n=>n.id===p.id);if(p.dead||n.dead)continue;const v={x:(n.pos.x-p.pos.x)/(nf.roundSec-f.roundSec),y:(n.pos.y-p.pos.y)/(nf.roundSec-f.roundSec)},speed=Math.hypot(v.x,v.y),a=derive({player:p,previousPlayer:previous,nextPlayer:n,playbackActive:true,...(updated?{presentationVelocity:v}:{})});motion.samples++;const sr=a.moving&&speed<=.22,si=!a.moving&&speed>.22;if(sr)motion.stationaryRun++;if(si)motion.slidingIdle++;if(Math.abs(a.speed-speed)>.5)motion.speedMismatchOverHalf++;if((sr||si)&&motion.examples.length<5)motion.examples.push({i,round:f.rnd,playerId:p.id,consumerSpeed:a.speed,outgoingSpeed:speed,locomotion:a.locomotion});}
  const options={frame:f,previousFrame:pf,frameIndex:i,...(updated?{nextFrame:nf||null}:{})};presentation.update(options);const cues=presentation.drainAudio(),steps=cues.filter(c=>c.type==='footstep');audio.maxFootstepBatch=Math.max(audio.maxFootstepBatch,steps.length);
  for(const c of cues){audio.types[c.type]=(audio.types[c.type]||0)+1;if(ids.has(c.eventId))audio.duplicateIds++;ids.add(c.eventId);if(c.type==='footstep'){audio.footsteps++;if(c.delaySec>0)audio.scheduledFootsteps++;if(updated&&(!(c.delaySec>0&&c.delaySec<=.5)||!Number.isFinite(c.position?.x)||!Number.isFinite(c.position?.y)))audio.invalidDelay++;}}
  if(steps.length&&!roundWindows.has(f.rnd))roundWindows.set(f.rnd,{round:f.rnd,start:f.roundSec,total:0,delays:[],firstBatch:steps.length});
  const w=roundWindows.get(f.rnd);if(w&&f.roundSec<w.start+2){w.total+=steps.length;w.delays.push(...steps.map(s=>s.delaySec||0));}
  presentation.update(options);audio.sameFrameCues+=presentation.drainAudio().length;
 }
 audio.openingWindows=[...roundWindows.values()].slice(0,3);return{motion,audio};
}
const before=measure(beforeAnimation.deriveFpsAnimationState,beforeAudio.createFpsMatchPresentation,false),after=measure(afterDerive,afterPresentation,true);
let pass=0,fail=0;const checks=[];const ck=(name,ok)=>{checks.push({name,ok});ok?pass++:fail++;console.log(`${ok?'PASS':'FAIL'} ${name}`);};
ck('真fixture同一全對局十人，Before/After樣本一致',before.motion.samples>100&&before.motion.samples===after.motion.samples);
ck('After真outgoing velocity消除stationary run與sliding idle',after.motion.stationaryRun===0&&after.motion.slidingIdle===0&&after.motion.speedMismatchOverHalf===0);
ck('After腳步真位移排程與event去重',after.audio.footsteps>0&&after.audio.scheduledFootsteps===after.audio.footsteps&&after.audio.invalidDelay===0&&after.audio.duplicateIds===0&&after.audio.sameFrameCues===0);
ck('真sim完整SHA保存，沒有重新simulate',saved===sha(JSON.stringify(sim)));
const report={schema:'cs-authenticity-before-after-saved-consumers.v1',at:new Date().toISOString(),fixture:{path:fixture,gzipBytes:gz.length,sha256:sha(gz),frames:sim.frames.length,rounds:sim.rounds,sceneVersion:sim.sceneVersion,mapKey:sim.mapKey,manifest:fixtureManifest},beforeSource:{recovery,gzipSHA256:sha(archiveBytes),sourceHash:archive.sourceHash,lineage},afterSource:Object.fromEntries(lineage.map(f=>[f.file,sha(fs.readFileSync(f.file))])),before,after,checks,pass,fail,limitations:['audio queue不是可聞聲音或原生source排程','Before是保留Owner Review source套在同一新fixture；未重新執行舊引擎','Browser／GPU／真機尚未在此工具執行']};
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2));
console.log(JSON.stringify({out,frames:sim.frames.length,beforeMotion:before.motion,afterMotion:after.motion,beforeFootsteps:before.audio.footsteps,afterFootsteps:after.audio.footsteps,afterScheduled:after.audio.scheduledFootsteps,openingBefore:before.audio.openingWindows.map(w=>({round:w.round,total:w.total,firstBatch:w.firstBatch})),openingAfter:after.audio.openingWindows.map(w=>({round:w.round,total:w.total,firstBatch:w.firstBatch,minDelay:Math.min(...w.delays),maxDelay:Math.max(...w.delays)}))}));
console.log(`CS Authenticity Consumer Comparison: ${pass}/${pass+fail} ${fail?'FAIL':'PASS'}`);process.exitCode=fail?1:0;
