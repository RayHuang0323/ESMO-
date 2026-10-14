import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import * as THREE from 'three';
import {readFpsRigTestAssets} from '../../lib/fpsRigTestAssets.mjs';
import {saveAuthorReport} from './authorReport.mjs';
import {FPS_CHARACTER_ASSET_MANIFEST as manifest} from '../../../src/battle/fps/presentation/fpsCharacterAssets.js';
const [posePath,out,geometryModulePath='tools/assets/cs/author_glove_surface_candidate.mjs']=process.argv.slice(2);assert(out?.startsWith('review/cs-major-upgrade/evidence/')&&!fs.existsSync(out));
const {applyFpsGloveSurface}=await import(pathToFileURL(path.resolve(geometryModulePath)));
const {createFpsSupportGripPose}=await import(pathToFileURL(path.resolve(posePath))),assets=await readFpsRigTestAssets(),cases=[];
try{
 for(const side of ['ct','t'])for(const gun of ['deagle','mp9','m4','scout','nova']){
  const f=assets.make({operatorId:side+'2',side,gun,role:'support',continuousClothing:true,importedWeapons:true}),mesh=f.c.c2c.tailored.mesh,original=mesh.geometry,g=original.clone(),beforePositions=original.attributes.position.array.slice();
  const row={side,gun,samples:0,posedFlips:0,posedDegenerates:0,posedFailures:[],maximumVertexMovementMetres:0,maximumSeamGapMetres:0,resolvedStates:[]};
  try{
   row.geometryReport=applyFpsGloveSurface(g,mesh);mesh.geometry=g;
   assert.deepEqual(Array.from(g.index.array),Array.from(original.index.array));assert.deepEqual(g.groups,original.groups);
   for(const name of ['skinIndex','skinWeight','uv','esmoSleeveCoord'])assert.deepEqual(Array.from(g.attributes[name].array),Array.from(original.attributes[name].array));
   const changed=[],groups=new Map();
   for(let i=0;i<g.attributes.position.count;i++){
    const a=new THREE.Vector3().fromBufferAttribute(original.attributes.position,i),b=new THREE.Vector3().fromBufferAttribute(g.attributes.position,i),key=a.toArray().map(v=>v.toFixed(6)).join(',');
    if(!groups.has(key))groups.set(key,[]);groups.get(key).push(i);
    if(a.distanceTo(b)>1e-7){assert(g.attributes.esmoSleeveCoord.getW(i)<.45,'手套工序不能移動原袖口／肩／肘');changed.push(i);}
   }
   assert.equal(changed.length,row.geometryReport.movedVertices);
   const idsChanged=new Set(changed),faces=[];
   for(let at=0;at<g.index.count;at+=3){const ids=[0,1,2].map(j=>g.index.getX(at+j));if(ids.some(i=>idsChanged.has(i)))faces.push(ids);}
   f.update({dt:0});f.c.gripPose.restore();f.c.gripPose=createFpsSupportGripPose({model:f.c.model,presentation:f.c.c2c});
   for(const state of ['HOLD','ROTATE','ENGAGE','RELOAD','HIT','DEAD']){
    f.c.resetForRound(1);
    const p={...f.player,state:['RELOAD','HIT'].includes(state)?'HOLD':state,hp:state==='DEAD'?0:state==='HIT'?80:100,dead:state==='DEAD',shooting:state==='ENGAGE'?1:0,weaponHandlingVersion:1,reloading:state==='RELOAD',reloadStartedAtMs:1000,reloadEndsAtMs:2000,velocityUnitsPerSec:state==='ROTATE'?3:0,velocity:{x:state==='ROTATE'?3:0,y:0}};
    for(let tick=0;tick<3;tick++){
     f.update({player:p,previousPlayer:tick===0?{...p,hp:100,dead:false,shooting:0}:p,nextPlayer:p,frameIndex:20+row.samples,roundTimeMs:1400,dt:tick===0?0:.05,playbackActive:true});f.parent.updateMatrixWorld(true);mesh.skeleton.update();row.samples++;
     const layers=f.c.poseLayers.diagnostics();
     if(state==='HOLD')assert.equal(layers.upperClip,manifest.clips.aim);
     if(state==='ROTATE')assert.equal(layers.lowerClip,manifest.clips.run);
     if(state==='ENGAGE')assert.equal(layers.upperClip,manifest.clips.fire);
     if(state==='RELOAD'){assert.equal(layers.upperClip,manifest.optionalClips.reload);assert.equal(f.c.gripPose.diagnostics().status,'animation-owned');}
     if(state==='HIT')assert.equal(f.c.currentAction,manifest.clips.hit);
     if(state==='DEAD')assert.equal(f.c.currentAction,manifest.clips.death);
     const before=new Map(),after=new Map(),posed=(geometry,i)=>mesh.applyBoneTransform(i,new THREE.Vector3().fromBufferAttribute(geometry.attributes.position,i));
     for(const ids of faces)for(const i of ids)if(!after.has(i)){const a=posed(original,i),b=posed(g,i);assert(b.toArray().every(Number.isFinite));before.set(i,a);after.set(i,b);row.maximumVertexMovementMetres=Math.max(row.maximumVertexMovementMetres,a.distanceTo(b));}
     for(const ids of faces){const normal=m=>{const [a,b,c]=ids.map(i=>m.get(i));return b.clone().sub(a).cross(c.clone().sub(a));};const a=normal(before),b=normal(after);if(a.length()>1e-10){if(b.length()<=1e-10)row.posedDegenerates++;if(a.dot(b)<=0)row.posedFlips++;if(b.length()<=1e-10||a.dot(b)<=0)row.posedFailures.push({state,tick,ids,originalNormal:a.toArray(),candidateNormal:b.toArray(),originalArea:a.length()/2,candidateArea:b.length()/2,normalDot:a.dot(b),vertexDeltas:ids.map(i=>after.get(i).clone().sub(before.get(i)).toArray())});}}
     for(const ids of groups.values())if(ids.length>1&&ids.some(i=>idsChanged.has(i)))for(const i of ids.slice(1))row.maximumSeamGapMetres=Math.max(row.maximumSeamGapMetres,posed(g,ids[0]).distanceTo(posed(g,i)));
    }
    row.resolvedStates.push({state,currentAction:f.c.currentAction,poseLayers:f.c.poseLayers.diagnostics(),grip:f.c.gripPose.diagnostics()});
   }
   assert(Array.from(original.attributes.position.array).every((v,i)=>v===beforePositions[i]),'共用原geometry被污染');cases.push(row);
  }finally{mesh.geometry=original;g.dispose();f.dispose();}
 }
 assert(assets.unchanged());const valid=cases.every(c=>c.posedFlips===0&&c.posedDegenerates===0&&c.maximumSeamGapMetres<1e-4);
 const report={status:valid?'AUTHOR_GLOVE_SIX_STATE_GEOMETRY_PASS_NOT_PRODUCT_OR_ART_PASS':'REJECTED_AUTHOR_GLOVE_GEOMETRY',geometryModuleSha256:crypto.createHash('sha256').update(fs.readFileSync(geometryModulePath)).digest('hex'),poseCandidateSha256:crypto.createHash('sha256').update(fs.readFileSync(posePath)).digest('hex'),samples:cases.reduce((n,c)=>n+c.samples,0),sourceAssetsUnchanged:true,cases};
 saveAuthorReport(out,report);if(!valid)process.exitCode=1;
}finally{assets.dispose();}
