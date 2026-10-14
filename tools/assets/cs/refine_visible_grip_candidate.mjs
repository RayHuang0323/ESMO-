import fs from 'node:fs';
import {saveAuthorReport} from './authorReport.mjs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import * as THREE from 'three';
import {MeshBVH} from 'three-mesh-bvh';
import {readFpsRigTestAssets} from '../../lib/fpsRigTestAssets.mjs';

const natural=process.argv.includes('--natural-grip=true');
const [sourcePath,out,geometryPath]=process.argv.slice(2).filter(a=>!a.startsWith('--'));
assert(out?.startsWith('review/cs-major-upgrade/evidence/')&&!fs.existsSync(out));
const code=fs.readFileSync(sourcePath,'utf8'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const initialAngles=JSON.parse(code.match(/const SNIPER_SUPPORT_FLEX=Object.freeze\((\[.*\])\);/)[1]);
const {createFpsSupportGripPose}=await import(pathToFileURL(path.resolve(sourcePath))),geometryModule=geometryPath?await import(pathToFileURL(path.resolve(geometryPath))):null;
const assets=await readFpsRigTestAssets(),f=assets.make({gun:'awp',operatorId:'ct2',continuousClothing:true,importedWeapons:true}),parts=[];
const mesh=f.c.c2c.tailored.mesh,original=mesh.geometry,g=original.clone(),X=new THREE.Vector3(1,0,0),Y=new THREE.Vector3(0,1,0),Z=new THREE.Vector3(0,0,1);
try{
 const geometryReport=geometryModule?.applyFpsGloveSurface(g,mesh)??null;mesh.geometry=g;
 f.update({dt:0,playbackActive:false});f.c.gripPose.restore();f.c.gripPose=createFpsSupportGripPose({model:f.c.model,presentation:f.c.c2c});f.c.gripPose.apply();f.c.c2c.syncAnchors();f.parent.updateMatrixWorld(true);
 f.c.c2c.weaponGroups.sniper.traverse(o=>{if(!o.isMesh)return;const geo=o.geometry.clone();geo.applyMatrix4(o.matrixWorld);geo.clearGroups();parts.push({geometry:geo,bvh:new MeshBVH(geo)});});
 const point=new THREE.Vector3(),tri=new THREE.Triangle(),normal=new THREE.Vector3();
 const nearest=v=>{let best=null;for(const part of parts){const h=part.bvh.closestPointToPoint(v,{});if(best&&h.distance>=best.distance)continue;const p=part.geometry.attributes.position,idx=part.geometry.index,k=h.faceIndex*3;tri.a.fromBufferAttribute(p,idx.getX(k));tri.b.fromBufferAttribute(p,idx.getX(k+1));tri.c.fromBufferAttribute(p,idx.getX(k+2));tri.getNormal(normal);best={distance:h.distance,signed:v.clone().sub(h.point).dot(normal)};}return best;};
 const names=mesh.skeleton.bones.map(b=>b.name),sampleIds=[],perDigit={};
 for(const d of ['hand','index','middle','ring','pinky','thumb'])perDigit[d]=[];
 for(let i=0;i<g.attributes.position.count;i++){
  const influence={};let total=0;
  for(let j=0;j<4;j++){
   const n=names[g.attributes.skinIndex.array[i*4+j]],w=g.attributes.skinWeight.array[i*4+j];
   if(/^(hand|index|middle|ring|pinky|thumb).*_l$/.test(n)){const d=n.split('_')[0];influence[d]=(influence[d]??0)+w;total+=w;}
  }
  if(total>.9)sampleIds.push(i);
  for(const [d,w] of Object.entries(influence))if(w>.1)perDigit[d].push(i);
 }
 assert.equal(sampleIds.length,1030);assert.equal(mesh.visible,true);
 const surface=ids=>{mesh.skeleton.update();let negatives=0,depth=0,minimumDistance=Infinity;const byDominant={};
  for(const i of ids){point.fromBufferAttribute(g.attributes.position,i);mesh.applyBoneTransform(i,point);mesh.localToWorld(point);const hit=nearest(point);minimumDistance=Math.min(minimumDistance,hit.distance);
   if(hit.signed<-.002){negatives++;depth+=-.002-hit.signed;let joint=0,best=-1;for(let j=0;j<4;j++)if(g.attributes.skinWeight.array[i*4+j]>best){best=g.attributes.skinWeight.array[i*4+j];joint=g.attributes.skinIndex.array[i*4+j];}const d=names[joint].split('_')[0];byDominant[d]=(byDominant[d]??0)+1;}
  }return{samples:ids.length,negativeOver2mm:negatives,depthMetres:depth,minimumDistanceMetres:minimumDistance,byDominant};};
 const baseline=surface(sampleIds),fingers=[];
 const offsets=[-.10,-.05,0,.05,.10];
 const angleRanges=natural?[[.6,.85,1.1,1.35],[.8,1.05,1.3,1.55],[.4,.65,.9,1.15]]:[offsets,offsets,offsets];
 for(const [digitIndex,digit] of ['index','middle','ring','pinky'].entries()){
  const bones=[1,2,3].map(n=>f.c.model.getObjectByName(digit+'_0'+n+'_l')),tip=f.c.model.getObjectByName(digit+'_04_leaf_l');
  const set=angles=>{angles.forEach((a,j)=>bones[j].quaternion.setFromAxisAngle(X,a));bones[0].quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(Y,Math.PI/2));f.c.model.updateMatrixWorld(true);};
  let best=null,samples=0;
  for(const a of angleRanges[0])for(const b of angleRanges[1])for(const c of angleRanges[2]){
   const angles=natural?[a,b,c]:initialAngles[digitIndex].map((v,j)=>v+[a,b,c][j]),delta=angles.map((v,j)=>v-initialAngles[digitIndex][j]);
   if(natural&&angles.reduce((n,v)=>n+v,0)>Math.PI)continue;set(angles);
   const skin=surface(perDigit[digit]),tipHit=nearest(tip.getWorldPosition(new THREE.Vector3()));samples++;
   if(skin.minimumDistanceMetres>=.002||tipHit.distance>=.010)continue;
   const score=skin.negativeOver2mm*.01+skin.depthMetres*5+tipHit.distance+delta.reduce((n,v)=>n+v*v,0)*.001;
   if(!best||score<best.score)best={angles,delta,skin,tip:tipHit,score};
  }
  if(!best&&natural){saveAuthorReport(out,{status:'REJECTED_AUTHOR_NATURAL_FINGER_CONTACT_NOT_PRODUCT_FAIL',sourceSha256:sha(code),sourceAssetsUnchanged:assets.unchanged(),failedDigit:digit,samples,fingerFlexSumBoundRadians:Math.PI,baseline,fingers});throw Error('自然指節候選無法同時滿足原2mm手皮及10mm骨端：'+digit);}
  assert(best,'無合法指節局部候選：'+digit);set(best.angles);fingers.push({digit,samples,best});
 }
 const bones=[1,2,3].map(n=>f.c.model.getObjectByName('thumb_0'+n+'_l')),tip=f.c.model.getObjectByName('thumb_04_leaf_l'),base=bones[0].quaternion.clone();
 const currentThumb=code.match(/thumbs\[4\]\.quaternion\.setFromAxisAngle\(X_AXIS,([\d.]+)\);thumbs\[5\]\.quaternion\.setFromAxisAngle\(X_AXIS,([\d.]+)\);/);
 assert(currentThumb,'不能猜拇指目前來源');
 const thumbFlex=natural?currentThumb.slice(1).map(Number):[2,.25],thumbOffsets=natural?[0]:offsets;let best=null,thumbSamples=0;
 for(const y of thumbOffsets)for(const z of thumbOffsets)for(const b of thumbOffsets)for(const c of thumbOffsets){
  bones[0].quaternion.copy(base).multiply(new THREE.Quaternion().setFromAxisAngle(Y,y)).multiply(new THREE.Quaternion().setFromAxisAngle(Z,z));bones[1].quaternion.setFromAxisAngle(X,thumbFlex[0]+b);bones[2].quaternion.setFromAxisAngle(X,thumbFlex[1]+c);f.c.model.updateMatrixWorld(true);
  const skin=surface(perDigit.thumb),tipHit=nearest(tip.getWorldPosition(new THREE.Vector3()));thumbSamples++;
  if(skin.minimumDistanceMetres>=.002||tipHit.distance>=.010)continue;
  const score=skin.negativeOver2mm*.01+skin.depthMetres*5+tipHit.distance+(y*y+z*z+b*b+c*c)*.001;
  if(!best||score<best.score)best={rotation:bones[0].quaternion.toArray(),flex:[thumbFlex[0]+b,thumbFlex[1]+c],offset:[y,z,b,c],skin,tip:tipHit,score};
 }
 assert(best,'無合法拇指局部候選');bones[0].quaternion.fromArray(best.rotation);bones[1].quaternion.setFromAxisAngle(X,best.flex[0]);bones[2].quaternion.setFromAxisAngle(X,best.flex[1]);f.c.model.updateMatrixWorld(true);
 const final=surface(sampleIds);assert(assets.unchanged());
 const report={status:'VISIBLE_SKIN_POSE_CANDIDATE_NOT_INTEGRATED_NOT_ART_PASS',method:natural?'NATURAL_FINGER_FLEX_AUTHOR_SEARCH':'LOCAL_ANGLE_REFINEMENT',sourceSha256:sha(code),geometryModuleSha256:geometryPath?sha(fs.readFileSync(geometryPath)):null,geometryReport,maximumAngleOffsetRadians:natural?null:.10,fingerFlexSumBoundRadians:natural?Math.PI:null,baseline,final,fingers,thumb:{samples:thumbSamples,best},sourceAssetsUnchanged:true,caveat:'完整1030可見手皮只作局部三角朝向診斷，候選還須原現役guard、全動作、真GPU及藝術；不是watertight碰撞證明。'};
 saveAuthorReport(out,report);
 if(final.negativeOver2mm>40)process.exitCode=1;
}finally{mesh.geometry=original;g.dispose();parts.forEach(p=>p.geometry.dispose());f.dispose();assets.dispose();}
