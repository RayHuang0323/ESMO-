#!/usr/bin/env node
// Real production GLB/mixer/sampler; synthetic input states; no simulation/GPU.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import * as THREE from 'three';
import {readFpsRigTestAssets} from './lib/fpsRigTestAssets.mjs';import {createVisibleGroundingSampler} from '../src/battle/fps/presentation/fpsVisibleGrounding.js';
const out=path.resolve(process.argv[2]||''),root=path.resolve('review/cs-major-upgrade/evidence');if(!process.argv[2]||!out.startsWith(root+path.sep)||fs.existsSync(out))throw Error('New CS evidence JSON required');
const hash=b=>createHash('sha256').update(b).digest('hex'),files=['src/battle/fps/presentation/fpsVisibleGrounding.js','src/battle/fps/presentation/FpsCharacterRenderer.js','tools/lib/fpsRigTestAssets.mjs'],sourceFiles=files.map(file=>({file,sha256:hash(fs.readFileSync(file))}));
const report={schema:'cs-owner4b-grounding-runtime.v1',sourceFiles,samples:[],checks:[],benchmark:{height:1.8,pavingLift:.045,source:'Explicit CPU benchmark constant surface 1.8 + .045, not a claim about an actual map patch.'},scope:'True GLB and production clips/mixer/sampler, explicit synthetic actor inputs; no match/browser/mobile evidence'};let passed=0,failed=0;
const ground=()=>1.845,assets=await readFpsRigTestAssets();
function ck(label,fn){try{fn();passed++;report.checks.push({label,ok:true});console.log('PASS '+label);}catch(e){failed++;report.checks.push({label,ok:false,error:String(e.stack)});console.error('PRODUCT_FAIL '+label+' '+e.stack);}}
function oracle(f,dead){
 f.parent.updateWorldMatrix(true,false);f.parent.updateMatrixWorld(true);const point=new THREE.Vector3();let body=Infinity,sole=Infinity,vertices=0,feet=0;
 f.c.root.traverseVisible(mesh=>{if(!mesh.isMesh||!mesh.geometry?.attributes.position)return;if(mesh.isSkinnedMesh)mesh.skeleton.update();const p=mesh.geometry.attributes.position,idx=mesh.geometry.attributes.skinIndex,w=mesh.geometry.attributes.skinWeight;
  for(let i=0;i<p.count;i++){point.fromBufferAttribute(p,i);if(mesh.isSkinnedMesh)mesh.applyBoneTransform(i,point);mesh.localToWorld(point);const gap=point.y-ground();body=Math.min(body,gap);vertices++;let influence=0;if(idx&&w)for(const k of ['getX','getY','getZ','getW'])if(/^(foot|ball|toe)_/.test(mesh.skeleton.bones[idx[k](i)]?.name||''))influence+=w[k](i);if(influence>=.5){sole=Math.min(sole,gap);feet++;}}
 });return{gap:dead?body:sole,body,sole,vertices,feet};
}
try{
 for(const yaw of [0,90,225])for(const mode of ['walk-cycle','crouch-cycle','death-animated']){
  const f=assets.make({floor:1.8,importedWeapons:true,continuousClothing:true});try{
   f.c.root.visible=true;f.c.setFacingDegrees(yaw);const p={...f.player,va:yaw,state:mode==='walk-cycle'?'ROTATE':'HOLD',weaponHandlingVersion:1,stance:mode==='crouch-cycle'?'crouched':'standing',dead:mode==='death-animated'},authority=JSON.stringify(p),rootPos=f.parent.position.clone(),samples=[];
   for(let i=0;i<40;i++){
    f.update({player:p,previousPlayer:i===0&&p.dead?{...p,dead:false}:p,dt:.06,playbackDeltaSec:.06,playbackActive:true,frameIndex:100+i,roundTimeMs:30000+i*60,presentationVelocity:mode==='walk-cycle'?{x:Math.cos(yaw*Math.PI/180)*.955,y:Math.sin(yaw*Math.PI/180)*.955}:{x:0,y:0},sampleGroundHeight:ground});
    if(i%4===0||i===39){const full=oracle(f,p.dead),fast=f.c.visibleGrounding.evaluate(p.dead),row={yaw,mode,step:i,...full,candidates:fast.samples,candidateGap:fast.gap,candidateError:Math.abs(fast.gap-full.gap),layers:f.c.poseLayers?.diagnostics(),clip:f.c.currentAction,mixerTime:f.c.mixer.time};samples.push(row);report.samples.push(row);}
   }
   ck(`${yaw}deg ${mode} actual visible oracle within unchanged 8cm`,()=>{assert(samples.every(s=>s.vertices>10000&&s.feet===800&&Number.isFinite(s.gap)&&Math.abs(s.gap)<=.08));assert(f.parent.position.equals(rootPos));assert.equal(JSON.stringify(p),authority);});
   ck(`${yaw}deg ${mode} bounded real support sample count`,()=>assert(samples.every(s=>s.candidates===(p.dead?1597:80))));
   if(mode==='walk-cycle')ck(`${yaw}deg real Walk_Loop advances entire authored cycle`,()=>{assert(samples.every(s=>s.layers?.lowerClip==='Walk_Loop'));assert(f.c.mixer.time>f.c.poseLayers.lowerAction.getClip().duration);});
   ck(`${yaw}deg ${mode} repeated pause/seek grounding pose`,()=>{const seek={player:p,previousPlayer:p,dt:0,playbackActive:false,frameIndex:20,seekNonce:1,roundTimeMs:31000,presentationVelocity:{x:0,y:0},sampleGroundHeight:ground};f.update(seek);const base=f.c.model.position.clone(),time=f.c.mixer.time;for(let i=0;i<15;i++){f.update(seek);assert(f.c.model.position.distanceTo(base)<1e-8);}assert.equal(f.c.mixer.time,time);assert(Math.abs(oracle(f,p.dead).gap)<=.08);});
  }finally{f.dispose();}
 }
 ck('Production restore/reapply exact modelY/rootXZ/authority over 100 cycles',()=>{const f=assets.make({floor:1.8,importedWeapons:true,continuousClothing:true});try{
  f.c.root.visible=true;f.update({dt:0,playbackActive:false,sampleGroundHeight:ground});f.c.visibleGrounding.restore();const s=createVisibleGroundingSampler({root:f.c.root,sampleGroundHeight:ground,fastAlive:true}),base=f.c.model.position.clone(),rootPos=f.parent.position.clone(),before=JSON.stringify(f.player),r=s.apply({model:f.c.model});s.restore();for(let i=0;i<100;i++){s.reapply({model:f.c.model,offset:r.offset});s.restore();assert(f.c.model.position.equals(base));assert(f.parent.position.equals(rootPos));assert.equal(JSON.stringify(f.player),before);}
 }finally{f.dispose();}});
 ck('POV hidden ancestor does not retain zero support after revealing same paused pose',()=>{const f=assets.make({floor:1.8,importedWeapons:true,continuousClothing:true});try{
  f.c.root.visible=true;const input={player:f.player,previousPlayer:f.player,frameIndex:100,roundTimeMs:30000,sampleGroundHeight:ground,presentationVelocity:{x:0,y:0}};f.update({...input,dt:.05,playbackActive:true});f.parent.visible=false;f.update({...input,dt:.05,playbackActive:true});f.update({...input,dt:0,playbackActive:false});f.parent.visible=true;f.update({...input,dt:0,playbackActive:false});assert(f.c.groundSupportSamples>0,'Revealed actor must measure support instead of reusing hidden zero-sample cache');assert(Math.abs(oracle(f,false).gap)<=.08);
 }finally{f.dispose();}});
 ck('Actual GLB bytes unchanged',()=>assert(assets.unchanged()));ck('Source stable during runtime test',()=>{for(const r of sourceFiles)assert.equal(hash(fs.readFileSync(r.file)),r.sha256,r.file);});
}finally{assets.dispose();report.result={passed,failed,verdict:failed?'PRODUCT_FAIL':'CPU_PASS_VISUAL_NOT_RUN',maxCandidateError:Math.max(...report.samples.map(s=>s.candidateError)),over5mm:report.samples.filter(s=>s.candidateError>.005).map(s=>({yaw:s.yaw,mode:s.mode,step:s.step,error:s.candidateError}))};fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});}
console.log(`Owner4B production grounding runtime: ${passed}/${passed+failed} ${report.result.verdict}; candidateMaxError=${report.result.maxCandidateError}m; over5mm=${report.result.over5mm.length}`);process.exitCode=failed?1:0;
