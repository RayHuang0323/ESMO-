import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import * as THREE from 'three';
import {MeshBVH} from 'three-mesh-bvh';
import {readFpsRigTestAssets} from '../../lib/fpsRigTestAssets.mjs';
const modulePath=process.argv[2];
const {createFpsSupportGripPose}=await import(pathToFileURL(path.resolve(modulePath)));
const assets=await readFpsRigTestAssets(),f=assets.make({gun:'awp',operatorId:'ct2',importedWeapons:true,continuousClothing:true}),parts=[];
const phase=process.argv[3];if(!/^b7-[a-z0-9-]+$/.test(phase??''))throw Error('新phase必填，不覆寫候選');
const refinePath=process.argv[4],prior=refinePath?JSON.parse(fs.readFileSync(refinePath)):null;
if(prior&&prior.candidateSha256!==crypto.createHash('sha256').update(fs.readFileSync(modulePath)).digest('hex'))throw Error('不能借另一握姿的四指結果');
const X=new THREE.Vector3(1,0,0),Y=new THREE.Vector3(0,1,0),Z=new THREE.Vector3(0,0,1),point=new THREE.Vector3(),tri=new THREE.Triangle(),normal=new THREE.Vector3(),q=new THREE.Quaternion();
try{
 f.update({dt:0,playbackActive:false});f.c.gripPose.restore();f.c.gripPose=createFpsSupportGripPose({model:f.c.model,presentation:f.c.c2c});f.c.gripPose.apply();if(!f.c.gripPose.diagnostics().applied)throw Error('作者握姿不可達');f.c.c2c.syncAnchors();
 f.parent.updateMatrixWorld(true);
 const weapon=f.c.c2c.weaponGroups.sniper;
 weapon.traverse(o=>{if(!o.isMesh)return;const g=o.geometry.clone();g.applyMatrix4(o.matrixWorld);g.clearGroups();parts.push({g,bvh:new MeshBVH(g)});});
 const contactPoint=point=>{let best=null;
  for(const part of parts){const h=part.bvh.closestPointToPoint(point,{});if(!h||best&&h.distance>=best.distance)continue;
   const p=part.g.attributes.position,idx=part.g.index,k=h.faceIndex*3;tri.a.fromBufferAttribute(p,idx.getX(k));tri.b.fromBufferAttribute(p,idx.getX(k+1));tri.c.fromBufferAttribute(p,idx.getX(k+2));tri.getNormal(normal);
   best={distance:h.distance,signed:point.clone().sub(h.point).dot(normal)};
  }return best;
 };
 const contact=bone=>contactPoint(bone.getWorldPosition(point));
 const mesh=f.c.model.getObjectByName('SuperHero_Male'),g=mesh.geometry;
 const vertexIds=digit=>Array.from({length:g.attributes.position.count},(_,i)=>i).filter(i=>{let weight=0;for(const fn of ['getX','getY','getZ','getW'])if(mesh.skeleton.bones[g.attributes.skinIndex[fn](i)]?.name.startsWith(digit+'_')&&mesh.skeleton.bones[g.attributes.skinIndex[fn](i)]?.name.endsWith('_l'))weight+=g.attributes.skinWeight[fn](i);return weight>.1;});
 const surface=ids=>{mesh.skeleton.update();let negativeOver2mm=0,depth=0,minSigned=Infinity;for(const i of ids){point.fromBufferAttribute(g.attributes.position,i);mesh.applyBoneTransform(i,point);mesh.localToWorld(point);const hit=contactPoint(point);minSigned=Math.min(minSigned,hit.signed);if(hit.signed<-.002){negativeOver2mm++;depth+=-.002-hit.signed;}}return{vertices:ids.length,negativeOver2mm,depth,minSigned};};
 const rows=[];
 for(const digit of ['index','middle','ring','pinky']){
  const bones=[1,2,3].map(n=>f.c.model.getObjectByName(`${digit}_0${n}_l`)),tip=f.c.model.getObjectByName(digit+'_04_leaf_l'),ids=vertexIds(digit);let best=null,samples=0;
  if(prior){const row=prior.fingers.find(r=>r.digit===digit);if(!row)throw Error('缺先前四指結果');row.best.angles.forEach((v,i)=>bones[i].quaternion.setFromAxisAngle(X,v));bones[0].quaternion.premultiply(q.setFromAxisAngle(Y,Math.PI/2));f.c.model.updateMatrixWorld(true);rows.push(row);continue;}
  for(const a of[.5,.75,1,1.25,1.5,1.75])for(const b of[.75,1,1.25,1.5,1.75,2])for(const c of[.5,.75,1,1.25,1.5]){
   [a,b,c].forEach((value,i)=>bones[i].quaternion.setFromAxisAngle(X,value));q.setFromAxisAngle(Y,Math.PI/2);bones[0].quaternion.premultiply(q);f.c.model.updateMatrixWorld(true);
   const hit=contact(tip),skin=surface(ids),score=hit.distance+(hit.signed<-.0005?.10:0)+skin.negativeOver2mm*.01+skin.depth*5;samples++;
   if(!best||score<best.score)best={angles:[a,b,c],...hit,skin,score};
  }
  rows.push({digit,samples,best});best.angles.forEach((value,i)=>bones[i].quaternion.setFromAxisAngle(X,value));bones[0].quaternion.premultiply(q.setFromAxisAngle(Y,Math.PI/2));f.c.model.updateMatrixWorld(true);
 }
 const bones=[1,2,3].map(n=>f.c.model.getObjectByName(`thumb_0${n}_l`)),tip=f.c.model.getObjectByName('thumb_04_leaf_l'),base=new THREE.Quaternion(.2474129945,.9457944632,.2034414262,.0535840280).normalize(),ids=vertexIds('thumb');let best=null,samples=0;
 const bases=prior?[bones[0].quaternion.clone()]:[base,bones[0].quaternion.clone()];
 for(const base of bases)for(const y of(prior?[-.5,-.25,0,.25,.5]:[-1,-.5,0,.5,1]))for(const z of(prior?[.5,.75,1,1.25,1.5]:[-1,-.5,0,.5,1]))for(const b of(prior?[.75,1,1.25,1.5,1.75,2]:[.5,1,1.5,2]))for(const c of(prior?[.25,.5,.75,1,1.25]:[.5,1,1.5])){
  bones[0].quaternion.copy(base).multiply(q.setFromAxisAngle(Y,y)).multiply(new THREE.Quaternion().setFromAxisAngle(Z,z));bones[1].quaternion.setFromAxisAngle(X,b);bones[2].quaternion.setFromAxisAngle(X,c);f.c.model.updateMatrixWorld(true);
  const hit=contact(tip),skin=surface(ids),score=hit.distance+(hit.signed<-.0005?.10:0)+skin.negativeOver2mm*.01+skin.depth*5;samples++;if(!best||score<best.score)best={rotation: bones[0].quaternion.toArray(),offset:[y,z],flex:[b,c],...hit,skin,score};
 }
 const report={status:'AUTHOR_FINGER_CANDIDATE_NOT_INTEGRATED_NOT_ART_PASS',candidateSha256:crypto.createHash('sha256').update(fs.readFileSync(modulePath)).digest('hex'),sourceAssetsUnchanged:assets.unchanged(),method:'private authored hold point; unchanged hand/palm/skeleton/source socket; bounded existing finger quaternion candidates nearest actual weapon triangle, reject tip local signed penetration beyond 0.5mm; not whole hand collision proof',fingers:rows,thumb:{samples,best}};
 fs.writeFileSync(`review/cs-major-upgrade/evidence/${phase}.json`,JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify(report));
}finally{parts.forEach(p=>p.g.dispose());f.dispose();assets.dispose();}
