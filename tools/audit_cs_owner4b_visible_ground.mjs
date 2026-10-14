#!/usr/bin/env node
// CPU Before: actual GLB, actual renderer, visible posed vertices; no GPU/simulation.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import * as THREE from 'three';
import {readFpsRigTestAssets} from './lib/fpsRigTestAssets.mjs';
import {fpsMajorElevation,FPS_MAJOR_PLATFORMS} from '../src/battle/fps/fpsMajorTerrain.js';
import {projectNonDeathPelvisWorldVertical,createVisibleGroundingProposal} from './lib/fpsGroundingProposal.mjs';
const out=path.resolve(process.argv[2]||''),root=path.resolve('review/cs-major-upgrade/evidence');if(!process.argv[2]||!out.startsWith(root+path.sep)||fs.existsSync(out))throw Error('New CS evidence directory required');fs.mkdirSync(out,{recursive:true});
const files=['src/battle/fps/presentation/FpsCharacterRenderer.js','src/battle/fps/presentation/fpsBoundsSampler.js','src/battle/fps/presentation/fpsTailoredClothing.js','src/battle/fps/fpsMajorTerrain.js','tools/lib/fpsRigTestAssets.mjs','public/assets/fps/c2a/esmo-fps-character.glb','public/assets/fps/c2a/esmo-fps-animation-library.glb'];
const hash=b=>createHash('sha256').update(b).digest('hex'),sourceFiles=files.map(file=>({file,sha256:hash(fs.readFileSync(file))}));
fs.writeFileSync(path.join(out,'before-source.json.gz'),gzipSync(JSON.stringify({savedAt:new Date().toISOString(),files:files.filter(file=>file.endsWith('.js')||file.endsWith('.mjs')).map(file=>({path:file,sha256:hash(fs.readFileSync(file)),base64:fs.readFileSync(file).toString('base64')}))})),{flag:'wx'});
const proposal=process.argv[3]==='--proposal';
const report={schema:'cs-owner4b-visible-ground-before.v1',sourceFiles,proposalOnly:proposal,samples:[],checks:[],scope:'Actual immutable GLB + production renderer, explicit synthetic states; visible CPU skinned vertices against actual canonical terrain; no real match/GPU/visual/mobile PASS',limitations:['Canonical terrain excludes 45–105mm paint/paving lift, reported separately.','Proposal callback explicitly adds 45mm paving for these chosen patches; real renderer must select its own surface lift.','Slope contact requires stance/feet treatment; a flat pose cannot guarantee both feet contact an inclined surface.','Foot-influenced vertices are actual mesh skin weights, not bone centres; death contact is visible-body support rather than mandatory sole contact.']};let pass=0,fail=0;
const assets=await readFpsRigTestAssets();
function scan(f,mapKey){
 f.parent.updateMatrixWorld(true);const point=new THREE.Vector3(),rows=[];let minVisibleGap=Infinity,minFootGap=Infinity,visibleVertices=0,footVertices=0;
 f.c.root.traverseVisible(mesh=>{
  if(!mesh.isMesh||!mesh.geometry?.attributes.position)return;
  if(mesh.isSkinnedMesh)mesh.skeleton.update();const attr=mesh.geometry.attributes.position,skinI=mesh.geometry.attributes.skinIndex,skinW=mesh.geometry.attributes.skinWeight;let minGap=Infinity,minFeet=Infinity,feet=0;
  for(let i=0;i<attr.count;i++){
   point.fromBufferAttribute(attr,i);if(mesh.isSkinnedMesh)mesh.applyBoneTransform(i,point);mesh.localToWorld(point);
   const surface=fpsMajorElevation(mapKey,{x:point.x+50,y:point.z+50}),gap=point.y-surface;minGap=Math.min(minGap,gap);visibleVertices++;
   let influence=0;if(skinI&&skinW)for(const key of ['getX','getY','getZ','getW'])if(/^(foot|ball|toe)_/.test(mesh.skeleton.bones[skinI[key](i)]?.name||''))influence+=skinW[key](i);
   if(influence>=.5){feet++;footVertices++;minFeet=Math.min(minFeet,gap);}
  }
  rows.push({name:mesh.name,skinned:mesh.isSkinnedMesh||false,vertices:attr.count,footVertices:feet,minCanonicalGap:minGap,minCanonicalFootGap:feet?minFeet:null});minVisibleGap=Math.min(minVisibleGap,minGap);minFootGap=Math.min(minFootGap,minFeet);
 });
 return{visibleVertices,footVertices,minVisibleCanonicalGap:minVisibleGap,minVisiblePavingGap:minVisibleGap-.045,minFootCanonicalGap:minFootGap,minFootPavingGap:minFootGap-.045,meshes:rows,footBoneWorld:['foot_l','foot_r'].map(name=>({name,position:f.c.model.getObjectByName(name).getWorldPosition(new THREE.Vector3()).toArray()})),boundsSamplerMinY:f.c.boundsSampler?.().min.y,deathGroundContactY:f.c.deathGroundContactY,deathGroundCorrection:f.c.deathGroundCorrection,modelPosition:f.c.model.position.toArray(),pose:f.c.poseLayers?.diagnostics(),currentClip:f.c.currentAction};
}
function ck(label,ok,detail){ok?pass++:fail++;report.checks.push({label,ok,detail});console.log(`${ok?'PASS':'FAIL'} ${label} ${JSON.stringify(detail)}`);}
try{
 const platform=FPS_MAJOR_PLATFORMS.dust2,scenes=[{name:'flat',map:'dust2',x:20,y:50},{name:'elevated-platform',map:'dust2',x:platform.x+platform.w/2,y:platform.y+platform.h/2},{name:'real-sloped-ramp',map:'dust2',x:platform.x+2,y:platform.y+platform.h/2}];
 const states=[{name:'stand',state:'HOLD'},{name:'crouch',state:'HOLD',weaponHandlingVersion:1,stance:'crouched'},{name:'plant',state:'安裝中',hasBomb:true,plantProgressSec:1.5},{name:'defuse',state:'拆彈中',defuse:true},{name:'death-paused-seek',state:'DEATH',dead:true}];
 for(const scene of scenes)for(const spec of states){
  const floor=fpsMajorElevation(scene.map,scene),f=assets.make({floor,gun:'m4',importedWeapons:true,continuousClothing:true});
  try{f.parent.position.set(scene.x-50,floor,scene.y-50);f.c.root.visible=true;const p={...f.player,...spec,pos:{x:scene.x,y:scene.y},elevation:floor};
   // The fixture bypasses async loading (enabled:false); mirror the renderer identity pool's visible rigged-root ownership.
   if(proposal){f.c.mixer.stopAllAction();f.c.mixer=new THREE.AnimationMixer(f.c.model);f.c.actions=new Map(assets.originalClips.map(original=>{const clip=projectNonDeathPelvisWorldVertical(original,f.c.model);return[clip.name,f.c.mixer.clipAction(clip)];}));}
   // This is exactly the supported renderer paused-seek contract: fresh rig and explicit current/previous dead state.
   f.update({sampleGroundHeight:(x,z)=>fpsMajorElevation(scene.map,{x:x+50,y:z+50})+.045,player:p,previousPlayer:p,dt:0,playbackActive:false,roundTimeMs:30000,frameIndex:60,seekNonce:1,defuse:spec.defuse?{defuserId:p.id,progress:1.75}:null,presentationVelocity:{x:0,y:0}});
   let proposalMeasure=null;
   if(proposal){const fast=createVisibleGroundingProposal({root:f.c.root,fastAlive:true,sampleGroundHeight:(x,z)=>fpsMajorElevation(scene.map,{x:x+50,y:z+50})+.045}),before=scan(f,scene.map),start=performance.now(),result=fast.apply({model:f.c.model,dead:!!spec.dead}),elapsedMs=performance.now()-start;proposalMeasure={before:before.minVisiblePavingGap,fast:result,elapsedMs,catalogue:fast.catalogue};}
   const measured=scan(f,scene.map),sample={scenario:scene.name,state:spec.name,ground:{map:scene.map,x:scene.x,y:scene.y,canonicalAtRoot:floor,pavingLift:.045},proposalMeasure,...measured};report.samples.push(sample);
   ck(scene.name+'/'+spec.name+' actual visible foot/body samples exist',measured.visibleVertices>0&&measured.footVertices>100,{vertices:measured.visibleVertices,footVertices:measured.footVertices});
   const minimum=spec.dead?measured.minVisibleCanonicalGap:measured.minFootCanonicalGap;
   if(scene.name!=='real-sloped-ramp')ck(scene.name+'/'+spec.name+' actual visible support stays within 8cm of canonical floor',Number.isFinite(minimum)&&minimum>=-.08&&minimum<=.08,{minimum,boundsMin:measured.boundsSamplerMinY,root:floor,reportedDeath:measured.deathGroundContactY});
   console.log('DIAG '+scene.name+'/'+spec.name+' '+JSON.stringify({minFoot:measured.minFootCanonicalGap,minVisible:measured.minVisibleCanonicalGap,boundsMin:measured.boundsSamplerMinY,root:floor,deathGround:measured.deathGroundContactY}));
  }finally{f.dispose();}
 }
 ck('actual GLB bytes unchanged',assets.unchanged(),{});ck('source stable during Before audit',sourceFiles.every(r=>hash(fs.readFileSync(r.file))===r.sha256),{});
}finally{assets.dispose();report.result={passed:pass,failed:fail,verdict:fail?'CPU_VISIBLE_CONTACT_COUNTEREXAMPLE':'CPU_VISIBLE_CONTACT_PASS_VISUAL_NOT_RUN'};fs.writeFileSync(path.join(out,'visible-ground.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});}
console.log(`Owner4B visible ground Before: ${pass}/${pass+fail} ${report.result.verdict}`);process.exitCode=fail?1:0;
