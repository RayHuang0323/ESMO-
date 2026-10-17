#!/usr/bin/env node
// 新 authenticity 範圍：真 saved frames＋真 GLB；不 simulate／Browser／GPU。
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import * as THREE from 'three';
import { readCsReplay } from '../src/battle/fps/fpsReplay.js';
import { deriveFpsAnimationState, FPS_LOCOMOTION_CLIP_SPEED, fpsLocomotionTimeScale } from '../src/battle/fps/presentation/fpsAnimationState.js';
import { createFpsMatchPresentation } from '../src/battle/fps/presentation/fpsMatchPresentation.js';
import { readFpsRigTestAssets } from './lib/fpsRigTestAssets.mjs';
const fixture=process.argv.find(a=>a.startsWith('--fixture='))?.slice(10);
if(!fixture)throw new Error('需要 --fixture=<既有真 Major replay.gz>');
const bytes=fs.readFileSync(fixture), replay=readCsReplay(gunzipSync(bytes).toString('utf8')), frames=replay.simulation.frames;
let passed=0,failed=0;
function ck(name,fn){try{fn();passed++;console.log(`PASS ${name}`);}catch(e){failed++;console.error(`FAIL ${name}: ${e.stack}`);}}
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
console.log(JSON.stringify({fixture,sha256:sha(bytes),frames:frames.length,engineCalls:0,kind:'true-saved-frame-and-rig-consumer'}));
const before=sha(JSON.stringify(replay.simulation));
const velocity=(p,n,f,nf)=>({x:(n.pos.x-p.pos.x)/(nf.roundSec-f.roundSec),y:(n.pos.y-p.pos.y)/(nf.roundSec-f.roundSec)});
ck('真 saved-frame outgoing 3552+樣本的moving/speed與畫面位置斜率相同',()=>{
 let samples=0;for(let i=0;i<frames.length-1;i++){const f=frames[i],nf=frames[i+1];if(f.buyP||f.rnd!==nf.rnd||nf.roundSec<=f.roundSec)continue;for(const p of f.players){const n=nf.players.find(n=>n.id===p.id);if(p.dead||n.dead)continue;const v=velocity(p,n,f,nf),a=deriveFpsAnimationState({player:p,presentationVelocity:v});assert.equal(a.moving,Math.hypot(v.x,v.y)>.22);assert.equal(a.speed,Math.hypot(v.x,v.y));samples++;}}assert.ok(samples>=3552);console.log(`SAMPLES=${samples}`);
});
ck('Legacy未傳presentationVelocity仍讀保存velocity原行為',()=>{const p=frames[35].players.find(p=>p.id==='ct5'),a=deriveFpsAnimationState({player:p,previousPlayer:frames[34].players.find(previous=>previous.id===p.id)});assert.equal(a.speed,p.velocityUnitsPerSec);assert.equal(a.moving,true);});
ck('真frame35 ct5停住，覆蓋旧moving metadata後下肢idle',()=>{const p=frames[35].players.find(p=>p.id==='ct5');assert.ok(p.velocityUnitsPerSec>3);const a=deriveFpsAnimationState({player:p,presentationVelocity:{x:0,y:0}});assert.equal(a.locomotion,'idle');assert.equal(a.speed,0);});
const assets=await readFpsRigTestAssets(),rig=assets.make();
try{
 for(const name of Object.keys(FPS_LOCOMOTION_CLIP_SPEED))ck(`${name} nominal步頻來自真GLB足部excursion`,()=>{
  const c=rig.c;c.actions.forEach(a=>a.stop());const a=c.actions.get(name);assert.ok(a);a.reset().play();const points=[];for(let i=0;i<=120;i++){a.time=a.getClip().duration*i/120;c.mixer.update(0);c.model.updateWorldMatrix(true,true);points.push(['foot_l','foot_r'].map(n=>c.model.getObjectByName(n).getWorldPosition(new THREE.Vector3()).x));}const excursions=[0,1].map(f=>Math.max(...points.map(p=>p[f]))-Math.min(...points.map(p=>p[f])));const measured=(excursions[0]+excursions[1])/a.getClip().duration;assert.ok(Math.abs(measured-FPS_LOCOMOTION_CLIP_SPEED[name])<1e-7);console.log(JSON.stringify({name,duration:a.getClip().duration,excursions,nominalSpeed:measured}));
 });
 const current=frames[24].players.find(p=>p.id==='ct5'),next=frames[25].players.find(p=>p.id===current.id),v=velocity(current,next,frames[24],frames[25]);
 const testRig=(optimized,speed)=>{const r=assets.make({optimized,operatorId:current.id});for(let i=0;i<10;i++)r.update({player:current,previousPlayer:current,nextPlayer:next,dt:.02,playbackDeltaSec:.02,playbackSpeed:speed,presentationVelocity:v,frameRound:frames[24].rnd,frameIndex:24});return r;};
 const a=testRig(true,1),b=testRig(true,2),legacy=testRig(false,2);
 try{
  ck('真rig moving lower action步頻隨播放2x等比例，upper仍獨立',()=>{assert.equal(a.c.poseLayers.lowerName,b.c.poseLayers.lowerName);assert.ok(Math.abs(b.c.poseLayers.lowerAction.getEffectiveTimeScale()-2*a.c.poseLayers.lowerAction.getEffectiveTimeScale())<1e-9);assert.equal(a.c.poseLayers.upperAction.getEffectiveTimeScale(),1);assert.equal(b.c.poseLayers.upperAction.getEffectiveTimeScale(),1);});
  ck('真rig停住立即Idle，不以移動舊frame掩蓋',()=>{a.update({player:current,previousPlayer:current,nextPlayer:next,presentationVelocity:{x:0,y:0},dt:.02,playbackDeltaSec:.02,playbackSpeed:1});assert.equal(a.c.poseLayers.lowerName,'Idle_Loop');});
  ck('暫停真rig mixer與下肢時間不前進',()=>{const t=b.c.mixer.time,lower=b.c.poseLayers.lowerAction.time;b.update({player:current,previousPlayer:current,nextPlayer:next,presentationVelocity:v,playbackActive:false,dt:.05,playbackDeltaSec:.15,frameRound:frames[24].rnd,frameIndex:24});assert.equal(b.c.mixer.time,t);assert.equal(b.c.poseLayers.lowerAction.time,lower);});
  ck('Major低頻RAF用同wallDelta；Legacy仍保留.05上限',()=>{const am=b.c.mixer.time,lm=legacy.c.mixer.time;b.update({player:current,previousPlayer:current,presentationVelocity:v,dt:.05,playbackDeltaSec:.15});legacy.update({player:current,previousPlayer:current,presentationVelocity:v,dt:.15,playbackDeltaSec:.15});assert.ok(Math.abs(b.c.mixer.time-am-.15)<1e-8);assert.ok(Math.abs(legacy.c.mixer.time-lm-.05)<1e-8);});
 }finally{a.dispose();b.dispose();legacy.dispose();}
 ck('素材bytes與footage來源無寫入',()=>assert.equal(assets.unchanged(),true));
}finally{rig.dispose();assets.dispose();}
let cueCount=0,footsteps=0,scheduled=0,duplicates=0,sameFrame=0,invalidDelay=0,maxBatch=0;
const p=createFpsMatchPresentation({major:true}),ids=new Set();
for(let i=0;i<frames.length;i++){
 const options={frame:frames[i],previousFrame:frames[Math.max(0,i-1)],nextFrame:frames[i+1]||null,frameIndex:i};p.update(options);const cues=p.drainAudio();maxBatch=Math.max(maxBatch,cues.filter(c=>c.type==='footstep').length);for(const c of cues){cueCount++;if(ids.has(c.eventId))duplicates++;ids.add(c.eventId);if(c.type==='footstep'){footsteps++;if(c.delaySec>0)scheduled++;if(!(c.delaySec>=0&&c.delaySec<=.5)||!Number.isFinite(c.position?.x)||!Number.isFinite(c.position?.y))invalidDelay++;}}p.update(options);sameFrame+=p.drainAudio().length;
}
console.log(JSON.stringify({cueCount,footsteps,scheduled,duplicates,sameFrame,invalidDelay,maxBatch,source:'actual outgoing frame distance and sampled GLB stride'}));
ck('真移動腳步有各自落點/排程，不每格全隊在0秒播放',()=>{assert.ok(footsteps>0);assert.equal(scheduled,footsteps);assert.equal(invalidDelay,0);});
ck('同frame與eventId無重複audio',()=>{assert.equal(duplicates,0);assert.equal(sameFrame,0);});
ck('已存全sim完整SHA不變；沒有simulate',()=>assert.equal(sha(JSON.stringify(replay.simulation)),before));
console.log(`CS Authenticity Owner234: ${passed}/${passed+failed} ${failed?'FAIL':'PASS'}`);
process.exitCode=failed?1:0;
