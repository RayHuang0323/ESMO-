#!/usr/bin/env node
// Actual immutable GLB bones + real imported Idle_Loop; no sim/GPU/browser.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {readFpsRigTestAssets} from './lib/fpsRigTestAssets.mjs';
import {createFpsActionArmPose,deriveFpsActionPose} from '../src/battle/fps/presentation/fpsActionPose.js';
const opts=Object.fromEntries(process.argv.slice(2).map(arg=>{const m=/^--out=(.+)$/.exec(arg);if(!m)throw Error('Use --out=<new CS evidence json>');return['out',m[1]];}));
const out=path.resolve(opts.out||''),root=path.resolve('review/cs-major-upgrade/evidence');if(!opts.out||!out.startsWith(root+path.sep)||fs.existsSync(out))throw Error('New evidence file required');
const sourceFiles=['src/battle/fps/presentation/fpsActionPose.js','src/battle/fps/presentation/FpsCharacterRenderer.js','public/assets/fps/c2a/esmo-fps-character.glb','public/assets/fps/c2a/esmo-fps-animation-library.glb'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),sources=sourceFiles.map(file=>({file,sha256:hash(fs.readFileSync(file))}));
const report={schema:'cs-owner4-action-arm-real-glb.v1',sourceFiles:sources,checkedAt:new Date().toISOString(),checks:[],samples:[],scope:'Real normalized GLB rig + actual Idle_Loop + production action solver, synthetic explicit semantic event timestamps; no actual saved-match evidence or visual/mobile PASS',gpuRun:false,simulationRun:false,productChanged:false};
const assets=await readFpsRigTestAssets();let passed=0,failed=0;
function check(label,fn){try{fn();passed++;report.checks.push({label,ok:true});console.log('PASS '+label);}catch(error){failed++;report.checks.push({label,ok:false,error:String(error.stack)});console.error('FAIL '+label+' '+error.stack);}}
const boneNames=['upperarm_r','lowerarm_r','hand_r','upperarm_l','lowerarm_l','hand_l'];
const world=bone=>bone.getWorldPosition(new THREE.Vector3());
const boneState=model=>boneNames.map(name=>{const bone=model.getObjectByName(name);return{name,position:bone.position.toArray(),scale:bone.scale.toArray(),quaternion:bone.quaternion.toArray()};});
function measure(model,side){const chain=['upperarm','lowerarm','hand'].map(name=>model.getObjectByName(name+'_'+side)),points=chain.map(world);return{a:points[0].distanceTo(points[1]),b:points[1].distanceTo(points[2]),shoulder:points[0],wrist:points[2]};}
try{
 for(const yaw of [0,90,225]){
  const f=assets.make({gun:'m4',importedWeapons:false});
  try{
   f.c.setFacingDegrees(yaw);f.update({dt:0,player:{...f.player,va:yaw},playbackActive:false});f.c.gripPose?.restore();f.parent.updateMatrixWorld(true);
   const model=f.c.model,controller=createFpsActionArmPose({model});assert(controller,'Actual arm bones required');
   const baseline=boneState(model),rootPosition=f.parent.position.clone(),modelPosition=model.position.clone();
   const player={...f.player,va:yaw,lastUtilityAtSec:20,lastUtilityType:'he'},event={type:'utility-throw',round:2,roundSec:20,playerId:player.id,utility:'he'};
   const specs=[{name:'draw',time:19.9},{name:'release',time:20.04},{name:'recover',time:20.3},{name:'plant',time:30,player:{...player,state:'安裝中',hasBomb:true,plantProgressSec:1.5,lastUtilityAtSec:0}},{name:'defuse',time:40,player:{...player,state:'拆彈中',lastUtilityAtSec:0},defuse:{defuserId:player.id,progress:1.75}}];
   for(const spec of specs){
    check(`${yaw}deg ${spec.name} real bone lengths and reachable world wrists`,()=>{
     controller.restore();model.updateWorldMatrix(true,true);
     const actor=spec.player||player,pose=deriveFpsActionPose({player:actor,roundSec:spec.time,frameRound:1,events:[event],nextEvents:[event],defuse:spec.defuse});assert(pose.active);assert.equal(spec.name==='plant'||spec.name==='defuse'?pose.kind:pose.phase,spec.name);
     const before=boneState(model),lengths=['r','l'].map(side=>measure(model,side));controller.apply({pose,player:actor});model.updateWorldMatrix(true,true);
     const after=boneState(model),arms=['r','l'].map((side,index)=>{
      const actual=measure(model,side),base=lengths[index],reach=pose.kind==='utility'?(index===0?(pose.phase==='draw'?-.13:.50):.20):.34,height=pose.kind==='utility'?(index===0?(pose.phase==='draw'?.26:.16):-.18):-.46;
      const rad=yaw*Math.PI/180,forward=new THREE.Vector3(Math.cos(rad),0,Math.sin(rad)),right=new THREE.Vector3(-Math.sin(rad),0,Math.cos(rad));
      const target=base.shoulder.clone().addScaledVector(forward,reach).addScaledVector(right,index===0?.04:-.04);target.y+=height;target.lerp(base.wrist,1-pose.weight);
      const requestedDistance=target.distanceTo(base.shoulder),d=Math.max(Math.abs(base.a-base.b)+.005,Math.min(base.a+base.b-.005,requestedDistance)),reachable=base.shoulder.clone().add(target.clone().sub(base.shoulder).normalize().multiplyScalar(d));
      assert(Math.abs(actual.a-base.a)<1e-6&&Math.abs(actual.b-base.b)<1e-6,'World bone lengths must be preserved');
      assert(actual.wrist.distanceTo(reachable)<1e-5,'Actual wrist must reach solver-clamped measured target');
      assert(Number.isFinite(actual.wrist.x)&&Number.isFinite(actual.wrist.y)&&Number.isFinite(actual.wrist.z));
      return{side,boneLengthsBefore:[base.a,base.b],boneLengthsAfter:[actual.a,actual.b],requestedTarget:target.toArray(),requestedDistance,reachableTarget:reachable.toArray(),worldWrist:actual.wrist.toArray(),targetError:actual.wrist.distanceTo(reachable),wristMotion:actual.wrist.distanceTo(base.wrist),clamped:Math.abs(requestedDistance-d)>1e-6};
     });
     assert.deepEqual(after.map(b=>[b.position,b.scale]),before.map(b=>[b.position,b.scale]));assert(f.parent.position.equals(rootPosition));assert(model.position.equals(modelPosition));assert(arms[0].wristMotion>.02,'Real visible arm gesture must move wrist');
     report.samples.push({yaw,name:spec.name,semanticTimeSec:spec.time,pose,arms,diagnostic:controller.diagnostics()});controller.restore();assert.deepEqual(boneState(model),baseline);
    });
   }
   check(`${yaw}deg 100 repeated apply/restore cycles do not accumulate drift`,()=>{
    const pose=deriveFpsActionPose({player,roundSec:20.04,frameRound:1,events:[event]});
    for(let n=0;n<100;n++){controller.restore();controller.apply({pose,player});controller.restore();assert.deepEqual(boneState(model),baseline);}
    assert.equal(controller.active,false);
   });
   check(`${yaw}deg dead/inactive action cannot modify restored bones`,()=>{
    controller.restore();controller.apply({pose:{active:false},player});assert.deepEqual(boneState(model),baseline);controller.apply({pose:{active:true},player:{...player,dead:true}});assert.deepEqual(boneState(model),baseline);
   });
  }finally{f.dispose();}
 }
 check('Actual GLB/animation assets remain byte-for-byte unchanged',()=>assert(assets.unchanged()));
 check('No concurrent source drift across real rig measurements',()=>{for(const row of sources)assert.equal(hash(fs.readFileSync(row.file)),row.sha256,row.file);});
}finally{assets.dispose();report.summary={passed,failed,verdict:failed?'CPU_POSE_FAIL':'CPU_POSE_PASS_VISUAL_NOT_RUN'};fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});}
console.log(`Owner4 real GLB action arms: ${passed}/${passed+failed}; ${report.summary.verdict}; report=${opts.out}`);process.exitCode=failed?1:0;
