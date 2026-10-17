import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {readFpsRigTestAssets} from '../../lib/fpsRigTestAssets.mjs';

// 舊真幀只供來源矩陣；兩次逐SHA整合ledger及已反算patch證明當前基線。
// 只輸出private形體差異，不能聲稱取得新Browser幀或遊戲艺术通過。
const [packetPath,baselinePatchPath,modulePath,statesPath,skinPath,out]=process.argv.slice(2);
const sha=b=>createHash('sha256').update(b).digest('hex'),read=p=>JSON.parse(fs.readFileSync(p));
assert(out?.startsWith('review/cs-major-upgrade/evidence/')&&!fs.existsSync(out));
const packet=read(packetPath),baseline=read(baselinePatchPath),states=read(statesPath),skin=read(skinPath),run='review/cs-major-upgrade/evidence/retention-policy-20261011/';
const anatomy=read(run+'anatomy-integration-manifest.json'),proportion=read(run+'proportion-integration-manifest.json');
assert.equal(packet.status,'TRUE_BROWSER_SAVED_FRAME_AUTHOR_PACKET_NOT_ART_PASS');assert.equal(baseline.packetSha256,sha(fs.readFileSync(packetPath)));
assert.equal(baseline.geometryModuleSha256,proportion.privateGeometryCandidateSha256);
assert.equal(baseline.candidatePoseSha256,proportion.privatePoseCandidateSha256);
assert.equal(sha(fs.readFileSync('src/battle/fps/presentation/fpsGloveAnatomy.js')),anatomy.productHelperSha256);
assert.equal(sha(fs.readFileSync('src/battle/fps/presentation/fpsGloveProportion.js')),proportion.productHelperSha256);
for(const [file,expected] of Object.entries(packet.sourceHashes)){
 let resolved=expected;
 for(const ledger of [anatomy,proportion]){
  const row=ledger.files.find(r=>r.file===file);
  if(row){assert.equal(row.beforeSha256,resolved);resolved=row.afterSha256;}
 }
 assert.equal(sha(fs.readFileSync(file)),resolved,'未證明的產品改動：'+file);
}
const moduleSha=sha(fs.readFileSync(modulePath)),poseSha=sha(fs.readFileSync('src/battle/fps/presentation/fpsSupportGripPose.js'));
assert.equal(states.geometryModuleSha256,moduleSha);assert.equal(skin.geometryModuleSha256,moduleSha);
assert.equal(states.poseCandidateSha256,poseSha);assert.equal(skin.candidateSha256,poseSha);
assert.equal(states.status,'AUTHOR_GLOVE_SIX_STATE_GEOMETRY_PASS_NOT_PRODUCT_OR_ART_PASS');assert.equal(states.samples,180);
assert(states.cases.every(c=>c.posedFlips===0&&c.posedDegenerates===0&&c.maximumSeamGapMetres<1e-4));
assert.equal(skin.status,'AUTHOR_EXISTING_SKIN_GUARD_PASS_NOT_ART_GATE');assert(skin.results.every(r=>r.passed));
assert.equal(poseSha,proportion.privatePoseCandidateSha256);
const angles=JSON.parse(fs.readFileSync('src/battle/fps/presentation/fpsSupportGripPose.js','utf8').match(/const SNIPER_SUPPORT_FLEX=Object.freeze\((\[.*\])\);/)[1]);
const {applyFpsGloveSurface}=await import(pathToFileURL(path.resolve(modulePath))),assets=await readFpsRigTestAssets(),f=assets.make({continuousClothing:true,importedWeapons:true,operatorId:'ct2',side:'ct',gun:packet.observed.gun,role:'support'}),mesh=f.c.c2c.tailored.mesh,g=mesh.geometry.clone();
try{
 const row=packet.meshes[baseline.meshIndex],names=row.boneNames,worlds=row.boneWorldMatrices.map(m=>new THREE.Matrix4().fromArray(m)),parents=new Map(packet.bones.map(b=>[b.name,b.parent]));
 assert.deepEqual(Array.from(g.index.array),row.indices);
 const locals=new Map();
 for(const [i,name] of names.entries()){
  const parent=parents.get(name),parentId=names.indexOf(parent),local=parentId>=0?worlds[parentId].clone().invert().multiply(worlds[i]):worlds[i].clone();
  const position=new THREE.Vector3(),quaternion=new THREE.Quaternion(),scale=new THREE.Vector3();local.decompose(position,quaternion,scale);locals.set(name,{position,quaternion,scale,parent:parentId>=0?parent:null});
 }
 for(const [d,digit] of ['index','middle','ring','pinky'].entries())for(let j=0;j<3;j++){
  const q=locals.get(digit+'_0'+(j+1)+'_l').quaternion;q.setFromAxisAngle(new THREE.Vector3(1,0,0),angles[d][j]);
  if(j===0)q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI/2));
 }
 const revised=new Map(),world=name=>{
  if(revised.has(name))return revised.get(name);const r=locals.get(name),m=new THREE.Matrix4().compose(r.position,r.quaternion,r.scale);
  if(r.parent)m.premultiply(world(r.parent));revised.set(name,m);return m;
 };
 const matrices=names.map((name,i)=>world(name).clone().multiply(new THREE.Matrix4().fromArray(row.boneInverses[i]))),bind=new THREE.Matrix4().fromArray(row.bindMatrix),unbind=new THREE.Matrix4().fromArray(row.bindMatrixInverse),objectWorld=new THREE.Matrix4().fromArray(row.matrixWorld),origin=new THREE.Vector3(...row.origin);
 const posed=i=>{
  const v=new THREE.Vector3().fromBufferAttribute(g.attributes.position,i).applyMatrix4(bind),p=new THREE.Vector3();
  for(let j=0;j<4;j++)p.addScaledVector(v.clone().applyMatrix4(matrices[row.skinIndex[i*4+j]]),row.skinWeight[i*4+j]);
  return p.applyMatrix4(unbind).applyMatrix4(objectWorld).sub(origin);
 };
 const expected=new Map(row.positions.map((p,i)=>[i,p]));for(const [i,...p] of baseline.posedRows)expected.set(i,p);
 let error=0;for(let i=0;i<g.attributes.position.count;i++)error=Math.max(error,posed(i).distanceTo(new THREE.Vector3(...expected.get(i))));
 assert(error<1e-6,'當前產品與逐SHA已整合patch不符，不猜來源');
 const geometryReport=applyFpsGloveSurface(g,mesh),posedRows=[],colorRows=new Map(baseline.colorRows.map(r=>[r[0],r]));
 for(let i=0;i<g.attributes.position.count;i++){
  const p=posed(i);assert(p.toArray().every(Number.isFinite));if(p.distanceTo(new THREE.Vector3(...row.positions[i]))>1e-7)posedRows.push([i,...p.toArray()]);
  const old=mesh.geometry.attributes.color,c=g.attributes.color;
  if([0,1,2].some(j=>Math.abs(old.getComponent(i,j)-c.getComponent(i,j))>1e-7))colorRows.set(i,[i,c.getX(i),c.getY(i),c.getZ(i)]);
 }
 assert(assets.unchanged());
 const report={version:'cs-glove-surface-patch.v1',status:'PRIVATE_SURFACE_PATCH_VERIFIED_CURRENT_BASE_NOT_NEW_BROWSER_FRAME_NOT_ART_PASS',packetSha256:sha(fs.readFileSync(packetPath)),baselinePatchSha256:sha(fs.readFileSync(baselinePatchPath)),geometryModuleSha256:moduleSha,poseCandidateSha256:poseSha,sourceFingerprint:packet.sourceFingerprint,lineageLedgerCanonicalJsonSha256:[anatomy,proportion].map(l=>sha(JSON.stringify(l))),meshIndex:baseline.meshIndex,geometryReport,maximumReconstructionErrorMetres:error,posedRows,colorRows:[...colorRows.values()],caveat:'舊真幀＋兩次逐SHA產品整合ledger及保存patch重現目前形體／四指姿態；候選只private，非新的Browser保存幀，不替代GPU或藝術驗收。ledger欄位為解析後canonical JSON的SHA，非檔案bytes SHA。'};
 const bytes=JSON.stringify(report);fs.writeFileSync(out,bytes,{flag:'wx'});console.log(JSON.stringify({status:report.status,out,bytes:Buffer.byteLength(bytes),sha256:sha(bytes),posedRows:posedRows.length,maximumReconstructionErrorMetres:error}));
}finally{g.dispose();f.dispose();assets.dispose();}
