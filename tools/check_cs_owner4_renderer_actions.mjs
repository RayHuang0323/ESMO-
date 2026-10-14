#!/usr/bin/env node
// Actual createFpsCharacterRenderer fixture, GLB rig/Idle_Loop and imported weapons.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {readFpsRigTestAssets} from './lib/fpsRigTestAssets.mjs';
const out=path.resolve(process.argv[2]||''),root=path.resolve('review/cs-major-upgrade/evidence');if(!process.argv[2]||!out.startsWith(root+path.sep)||fs.existsSync(out))throw Error('New CS evidence JSON path required');
const files=['src/battle/fps/presentation/FpsCharacterRenderer.js','src/battle/fps/presentation/fpsActionPose.js','src/battle/fps/presentation/fpsUtilityModels.js'];
const hash=x=>createHash('sha256').update(x).digest('hex'),sourceFiles=files.map(file=>({file,sha256:hash(fs.readFileSync(file))}));
const report={schema:'cs-owner4-renderer-action-integration.v1',sourceFiles,checks:[],samples:[],scope:'Actual real-GLB renderer integration with explicit synthetic saved-event inputs; not actual match/browser/visual/mobile evidence',gpuRun:false,simulationRun:false};let passed=0,failed=0;
function check(label,fn){try{fn();passed++;report.checks.push({label,ok:true});console.log('PASS '+label);}catch(error){failed++;report.checks.push({label,ok:false,error:String(error.stack)});console.error('FAIL '+label+' '+error.stack);}}
const assets=await readFpsRigTestAssets();
function shape(group){group.updateWorldMatrix(true,true);const box=new THREE.Box3().setFromObject(group);return{visible:group.visible,worldScale:group.getWorldScale(new THREE.Vector3()).toArray(),worldSize:box.getSize(new THREE.Vector3()).toArray()};}
try{
 check('Fresh renderer can plant C4 before ever drawing a utility',()=>{
  const first=assets.make({gun:'m4',importedWeapons:true});try{first.update({dt:0,playbackActive:false,frameRound:1,frameIndex:60,seekNonce:0,roundTimeMs:30000,presentationVelocity:{x:0,y:0},player:{...first.player,hasBomb:true,state:'安裝中',plantProgressSec:1.5},events:[],nextEvents:[]});assert.equal(first.c.actionGesture.kind,'plant');assert(first.c.bombInHand.group.visible);assert(shape(first.c.bombInHand.group).worldScale.every(v=>Math.abs(v-1)<1e-6));assert.equal(first.c.utilityInHand.group.visible,false);}finally{first.dispose();}
 });
 const f=assets.make({gun:'m4',importedWeapons:true});
 try{
  const c=f.c,p=f.player,event={type:'utility-throw',round:2,roundSec:20,playerId:p.id,utility:'he'};
  const update=(time,overrides={})=>f.update({dt:0,playbackActive:false,frameRound:1,frameIndex:40,roundTimeMs:time*1000,presentationVelocity:{x:0,y:0},player:{...p,lastUtilityAtSec:20,lastUtilityType:'he'},events:time>=20?[event]:[],nextEvents:time<20?[event]:[],...overrides});
  for(const [name,time] of [['draw',19.9],['release',20.04],['recover',20.3]])check(`Real renderer ${name} owns upper arms and firearm visibility`,()=>{
   update(time);assert.equal(c.actionGesture.phase,name);assert(c.actionPose.active);assert.equal(c.gripPose.diagnostics().status,'animation-owned');assert(Object.values(c.c2c.weaponGroups).every(g=>!g.visible));assert.equal(c.utilityInHand.group.visible,name==='draw');assert.equal(c.bombInHand.group.visible,false);report.samples.push({name,gesture:c.actionGesture,arms:c.actionPose.diagnostics(),grip:c.gripPose.diagnostics(),utility:shape(c.utilityInHand.group)});
  });
  check('Held HE world scale restores real metres despite normalized skeleton scale',()=>{update(19.9,{frameIndex:39,seekNonce:1});const held=shape(c.utilityInHand.group);assert(held.worldScale.every(n=>Math.abs(n-1)<1e-6));assert(Math.max(...held.worldSize)<.25&&Math.min(...held.worldSize)>.03);report.samples.push({name:'HE-size',held});});
  check('Recovery expiry restores normal actual firearm and grip',()=>{update(20.6,{frameIndex:42,seekNonce:1});assert.equal(c.actionGesture.active,false);assert.equal(c.actionPose.active,false);assert.equal(c.utilityInHand.group.visible,false);assert.equal(c.bombInHand.group.visible,false);assert.equal(c.c2c.weaponGroups.rifle.visible,true);assert.equal(c.gripPose.diagnostics().status,'contact');});
  check('Actual plant progress selects crouch idle and only held C4',()=>{update(30,{frameIndex:60,seekNonce:2,events:[],nextEvents:[],player:{...p,hasBomb:true,state:'安裝中',plantProgressSec:1.5}});assert.equal(c.actionGesture.kind,'plant');assert.equal(c.actionGesture.isThrow,false);assert.equal(c.poseLayers.lowerName,'Crouch_Idle_Loop');assert.equal(c.utilityInHand.group.visible,false);assert.equal(c.bombInHand.group.visible,true);assert(Object.values(c.c2c.weaponGroups).every(g=>!g.visible));const bomb=shape(c.bombInHand.group);assert(bomb.worldScale.every(n=>Math.abs(n-1)<1e-6));assert(Math.max(...bomb.worldSize)<.4&&Math.min(...bomb.worldSize)>.01);report.samples.push({name:'plant-C4',gesture:c.actionGesture,layers:c.poseLayers.diagnostics(),bomb});});
  check('Actual defuser ownership selects crouch idle without fake held grenade/C4',()=>{update(40,{frameIndex:80,seekNonce:3,events:[],nextEvents:[],defuse:{defuserId:p.id,progress:1.75},player:{...p,state:'拆彈中'}});assert.equal(c.actionGesture.kind,'defuse');assert.equal(c.poseLayers.lowerName,'Crouch_Idle_Loop');assert.equal(c.utilityInHand.group.visible,false);assert.equal(c.bombInHand.group.visible,false);});
  check('Pause redraw rebuilds identical action pose without accumulating root drift',()=>{update(20.3,{frameIndex:41,seekNonce:2});const q=c.model.getObjectByName('hand_r').quaternion.clone(),world=c.model.getObjectByName('hand_r').getWorldPosition(new THREE.Vector3()),root=f.parent.position.clone(),mixer=c.mixer.time;for(let n=0;n<50;n++){update(20.3,{frameIndex:41,seekNonce:2});assert(c.model.getObjectByName('hand_r').quaternion.angleTo(q)<1e-6);assert(c.model.getObjectByName('hand_r').getWorldPosition(new THREE.Vector3()).distanceTo(world)<1e-6);assert(f.parent.position.equals(root));}assert.equal(c.mixer.time,mixer);});
  check('Round-reset/native seek nonce cannot retain a prior throw or C4',()=>{f.c.resetForRound(2);f.update({dt:0,playbackActive:false,frameRound:2,frameIndex:100,seekNonce:3,roundTimeMs:5000,player:{...p,state:'BUY'},events:[],nextEvents:[],presentationVelocity:{x:0,y:0}});assert.equal(c.actionGesture.active,false);assert.equal(c.utilityInHand.group.visible,false);assert.equal(c.bombInHand.group.visible,false);assert.equal(c.c2c.weaponGroups.rifle.visible,true);});
  check('Dispose detaches held resources and is idempotent',()=>{const held=c.utilityInHand,bomb=c.bombInHand;c.dispose();assert.equal(held.group.parent,null);assert.equal(bomb.group.parent,null);assert.equal(held.disposed,true);c.dispose();});
 }finally{f.dispose();}
 check('GLB source bytes remain unchanged',()=>assert(assets.unchanged()));
 check('Sources remained stable during renderer measurements',()=>{for(const row of sourceFiles)assert.equal(hash(fs.readFileSync(row.file)),row.sha256,row.file);});
}finally{assets.dispose();report.summary={passed,failed,verdict:failed?'CPU_INTEGRATION_FAIL':'CPU_INTEGRATION_PASS_VISUAL_NOT_RUN'};fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});}
console.log(`Owner4 real renderer actions: ${passed}/${passed+failed}; ${report.summary.verdict}; report=${process.argv[2]}`);process.exitCode=failed?1:0;

