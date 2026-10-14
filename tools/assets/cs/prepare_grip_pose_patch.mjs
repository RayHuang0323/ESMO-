import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {readFpsRigTestAssets} from '../../lib/fpsRigTestAssets.mjs';
const [packetPath,surfacePatchPath,fitPath,skinPath,statesPath,out,geometryModulePath,priorSurfacePatchPath]=process.argv.slice(2),sha=b=>createHash('sha256').update(b).digest('hex');
assert(out?.startsWith('review/cs-major-upgrade/evidence/')&&!fs.existsSync(out));
const raw=fs.readFileSync(packetPath),packet=JSON.parse(raw),surface=JSON.parse(fs.readFileSync(surfacePatchPath)),fit=JSON.parse(fs.readFileSync(fitPath)),skin=JSON.parse(fs.readFileSync(skinPath)),states=JSON.parse(fs.readFileSync(statesPath));
assert.equal(surface.packetSha256,sha(raw));assert.equal(fit.sourceSha256,packet.sourceHashes['src/battle/fps/presentation/fpsSupportGripPose.js']);assert.equal(sha(fs.readFileSync('src/battle/fps/presentation/fpsSupportGripPose.js')),fit.sourceSha256);
assert.equal(states.candidateSha256,skin.candidateSha256);assert.equal(states.status,'AUTHOR_SIX_STATE_REACH_AND_BONE_PASS_NOT_ART_GATE');assert.equal(states.failures,0);assert.equal(skin.status,'AUTHOR_EXISTING_SKIN_GUARD_PASS_NOT_ART_GATE');assert(skin.results.every(r=>r.passed));assert.equal(fit.final.samples,1030);assert(fit.final.negativeOver2mm<=40);
// 唯一已整合變更為同稀疏surface來源；核整合ledger與每個其他產品檔。
const ledger=JSON.parse(fs.readFileSync('review/cs-major-upgrade/evidence/retention-policy-20261011/anatomy-integration-manifest.json'));
const priorSurface=priorSurfacePatchPath?JSON.parse(fs.readFileSync(priorSurfacePatchPath)):null;
if(geometryModulePath){
 assert(priorSurface,'新private皮面必須提供已整合基線patch');
 assert.equal(priorSurface.packetSha256,sha(raw));assert.equal(surface.priorSurfacePatchSha256,sha(fs.readFileSync(priorSurfacePatchPath)));
 assert.equal(sha(fs.readFileSync(geometryModulePath)),surface.geometryModuleSha256);
 assert.equal(fit.geometryModuleSha256,surface.geometryModuleSha256);assert.equal(skin.geometryModuleSha256,surface.geometryModuleSha256);
}
assert.equal(ledger.privateCandidateSha256,(priorSurface??surface).geometryModuleSha256);assert.equal(ledger.productHelperSha256,sha(fs.readFileSync('src/battle/fps/presentation/fpsGloveAnatomy.js')));
for(const [file,expected] of Object.entries(packet.sourceHashes)){
 if(file==='src/battle/fps/presentation/fpsTailoredClothing.js'){
  const item=ledger.files.find(f=>f.file===file);assert.equal(item.beforeSha256,expected);assert.equal(item.afterSha256,sha(fs.readFileSync(file)));
 }else assert.equal(sha(fs.readFileSync(file)),expected);
}
const geometryModule=geometryModulePath?await import(pathToFileURL(path.resolve(geometryModulePath))):null;
const assets=await readFpsRigTestAssets(),f=assets.make({continuousClothing:true,importedWeapons:true,operatorId:'ct2',side:'ct',gun:packet.observed.gun,role:'support'}),mesh=f.c.c2c.tailored.mesh,original=mesh.geometry,g=geometryModule?original.clone():original;
try{
 const row=packet.meshes[surface.meshIndex];assert.deepEqual(Array.from(g.index.array),row.indices);
 const boneRows=new Map(packet.bones.map(b=>[b.name,b])),names=row.boneNames,worlds=row.boneWorldMatrices.map(m=>new THREE.Matrix4().fromArray(m)),locals=new Map(),overrides=new Map();
 for(const [i,name] of names.entries()){
  const parent=boneRows.get(name)?.parent,parentIndex=names.indexOf(parent),m=parentIndex>=0?worlds[parentIndex].clone().invert().multiply(worlds[i]):worlds[i].clone(),position=new THREE.Vector3(),quaternion=new THREE.Quaternion(),scale=new THREE.Vector3();m.decompose(position,quaternion,scale);locals.set(name,{position,quaternion,scale,parent:parentIndex>=0?parent:null});
 }
 const originalMatrices=worlds.map((m,i)=>m.clone().multiply(new THREE.Matrix4().fromArray(row.boneInverses[i]))),bind=new THREE.Matrix4().fromArray(row.bindMatrix),unbind=new THREE.Matrix4().fromArray(row.bindMatrixInverse),objectWorld=new THREE.Matrix4().fromArray(row.matrixWorld),origin=new THREE.Vector3(...row.origin);
 const posed=(i,matrices)=>{const v=new THREE.Vector3().fromBufferAttribute(g.attributes.position,i).applyMatrix4(bind),p=new THREE.Vector3();for(let j=0;j<4;j++)p.addScaledVector(v.clone().applyMatrix4(matrices[row.skinIndex[i*4+j]]),row.skinWeight[i*4+j]);return p.applyMatrix4(unbind).applyMatrix4(objectWorld).sub(origin);};
 const baseline=new Map(row.positions.map((p,i)=>[i,p]));for(const [i,...p] of (priorSurface??surface).posedRows)baseline.set(i,p);
 let error=0;for(let i=0;i<g.attributes.position.count;i++)error=Math.max(error,posed(i,originalMatrices).distanceTo(new THREE.Vector3(...baseline.get(i))));assert(error<1e-6,'目前產品bind與同來源surface反算不一致');
 if(geometryModule){
  geometryModule.applyFpsGloveSurface(g,mesh);
  const expected=new Map(row.positions.map((p,i)=>[i,p]));for(const [i,...p] of surface.posedRows)expected.set(i,p);
  let candidateError=0;for(let i=0;i<g.attributes.position.count;i++)candidateError=Math.max(candidateError,posed(i,originalMatrices).distanceTo(new THREE.Vector3(...expected.get(i))));
  assert(candidateError<1e-6,'private皮面與已驗候選不符');error=Math.max(error,candidateError);
 }
 for(const r of fit.fingers)for(let j=0;j<3;j++){const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),r.best.angles[j]);if(j===0)q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI/2));overrides.set(r.digit+'_0'+(j+1)+'_l',q);}
 const revised=new Map(),world=name=>{if(revised.has(name))return revised.get(name);const r=locals.get(name),m=new THREE.Matrix4().compose(r.position,overrides.get(name)??r.quaternion,r.scale);if(r.parent)m.premultiply(world(r.parent));revised.set(name,m);return m;},matrices=names.map((name,i)=>world(name).clone().multiply(new THREE.Matrix4().fromArray(row.boneInverses[i]))),posedRows=[];
 for(let i=0;i<g.attributes.position.count;i++){const p=posed(i,matrices);assert(p.toArray().every(Number.isFinite));if(p.distanceTo(new THREE.Vector3(...row.positions[i]))>1e-7)posedRows.push([i,...p.toArray()]);}
 assert(assets.unchanged());
 const report={version:'cs-glove-surface-patch.v1',status:'PRIVATE_POSE_PATCH_NOT_CURRENT_BROWSER_FRAME_NOT_ART_PASS',packetSha256:sha(raw),surfacePatchSha256:sha(fs.readFileSync(surfacePatchPath)),fitSha256:sha(fs.readFileSync(fitPath)),candidatePoseSha256:skin.candidateSha256,geometryModuleSha256:surface.geometryModuleSha256,sourceFingerprint:packet.sourceFingerprint,meshIndex:surface.meshIndex,geometryReport:surface.geometryReport,maximumReconstructionErrorMetres:error,posedRows,colorRows:surface.colorRows,caveat:'舊真幀＋已整合且逐SHA核對的surface＋新private左四指骨姿；沒有新增Browser幀。既有右手／拇指／骨平移／scale／來源頂點保持，不重複packet或GLB。'};
 const bytes=JSON.stringify(report);fs.writeFileSync(out,bytes,{flag:'wx'});console.log(JSON.stringify({status:report.status,out,bytes:Buffer.byteLength(bytes),sha256:sha(bytes),posedRows:posedRows.length,maximumReconstructionErrorMetres:error}));
}finally{if(geometryModule)g.dispose();f.dispose();assets.dispose();}
