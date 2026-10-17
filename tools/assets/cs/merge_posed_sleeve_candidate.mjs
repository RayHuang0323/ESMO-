import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {FPS_POSED_SLEEVE_DATA as current} from '../../../src/battle/fps/presentation/fpsPosedSleeveData.js';

// 將Blender稀疏修改與已通過作者資料累加，不重烘焙未變頂點、不写產品。
const [packetPath,bindPath,outputPath]=process.argv.slice(2);
if(!packetPath||!bindPath||!outputPath||!outputPath.replaceAll('\\','/').startsWith('review/cs-major-upgrade/evidence/'))throw Error('輸出僅限evidence候選');
const raw=fs.readFileSync(packetPath),packet=JSON.parse(raw),bind=JSON.parse(fs.readFileSync(bindPath));
const sha=crypto.createHash('sha256').update(raw).digest('hex');assert.equal(bind.packetSha256,sha);
assert.equal(bind.status,'BIND_CANDIDATE_NOT_INTEGRATED_NOT_PRODUCT_PASS');
for(const [file,expected] of Object.entries(packet.sourceHashes??{}))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),expected,'目前來源已變：'+file);
const meshIndex=packet.meshes.findIndex(m=>m.name==='ESMO_Major_ContinuousClothing'),mesh=packet.meshes[meshIndex];
assert.equal(mesh.positions.length,current.vertices);assert.equal(mesh.indices.length/3,current.triangles);
let fingerprint=2166136261;for(const i of mesh.indices)fingerprint=Math.imul(fingerprint^i,16777619)>>>0;
assert.equal(fingerprint,current.indexFingerprint,'作者index fingerprint不符');
const rows=new Map(current.rows.map(r=>[r[0],[...r]]));let maximumDelta=0;
for(const edit of bind.rows){
 assert.equal(edit.meshIndex,meshIndex);const i=edit.index,old=rows.get(i),actual=mesh.bindPositions.slice(i*3,i*3+3);
 assert(new THREE.Vector3(...actual).distanceTo(new THREE.Vector3(...edit.referenceBind))<=1e-6,'編輯參考不是當前bind表面');
 const reference=old?old.slice(1,4):actual;
 if(old){
  const reproduced=old.slice(1,4).map((v,j)=>v+old[4+j]);assert(new THREE.Vector3(...actual).distanceTo(new THREE.Vector3(...reproduced))<=1e-6,'既有作者資料未保留');
  for(let j=0;j<4;j++){assert.equal(old[7+j],mesh.skinIndex[i*4+j]);assert(Math.abs(old[11+j]-mesh.skinWeight[i*4+j])<=1e-7,'既有蒙皮權重不符');}
 }
 const delta=edit.candidateBind.map((v,j)=>v-reference[j]);assert(delta.every(Number.isFinite)&&new THREE.Vector3(...delta).length()<=.04,'累計作者位移超40mm，不只檢查新增位移');
 maximumDelta=Math.max(maximumDelta,new THREE.Vector3(...delta).length());
 rows.set(i,[i,...reference,...delta,...mesh.skinIndex.slice(i*4,i*4+4),...mesh.skinWeight.slice(i*4,i*4+4)].map(v=>Math.round(v*1e8)/1e8));
}
assert.equal(bind.rows.length,bind.changedVertices);
const candidate={...current,sourceInputSha256:sha,sourceCandidateSha256:crypto.createHash('sha256').update(fs.readFileSync(bindPath)).digest('hex'),rows:[...rows.values()].sort((a,b)=>a[0]-b[0])};
fs.writeFileSync(outputPath,'// Blender authored bind candidate only. NOT INTEGRATED / NOT PRODUCT PASS.\nexport const FPS_POSED_SLEEVE_DATA = '+JSON.stringify(candidate)+';\n',{flag:'wx'});
console.log(JSON.stringify({status:'MERGED_AUTHOR_CANDIDATE_NOT_INTEGRATED_NOT_PRODUCT_PASS',inputRows:current.rows.length,outputRows:candidate.rows.length,changedVertices:bind.changedVertices,maximumChangedCumulativeDeltaMetres:maximumDelta,vertices:current.vertices,triangles:current.triangles,indexFingerprint:current.indexFingerprint,outputPath}));
