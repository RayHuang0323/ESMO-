import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {readFpsRigTestAssets} from '../../lib/fpsRigTestAssets.mjs';
const [packetPath,modulePath,statesPath,skinPath,out,priorSurfacePatchPath]=process.argv.slice(2),sha=b=>createHash('sha256').update(b).digest('hex');
assert(out?.startsWith('review/cs-major-upgrade/evidence/')&&!fs.existsSync(out));
const raw=fs.readFileSync(packetPath),packet=JSON.parse(raw),moduleSha=sha(fs.readFileSync(modulePath)),states=JSON.parse(fs.readFileSync(statesPath)),skin=JSON.parse(fs.readFileSync(skinPath));
assert.equal(packet.status,'TRUE_BROWSER_SAVED_FRAME_AUTHOR_PACKET_NOT_ART_PASS');
let priorSurface=null, integrationLedger=null;
if(priorSurfacePatchPath){
 priorSurface=JSON.parse(fs.readFileSync(priorSurfacePatchPath));assert.equal(priorSurface.packetSha256,sha(raw));
 integrationLedger=JSON.parse(fs.readFileSync('review/cs-major-upgrade/evidence/retention-policy-20261011/anatomy-integration-manifest.json'));
 assert.equal(integrationLedger.privateCandidateSha256,priorSurface.geometryModuleSha256);
 assert.equal(integrationLedger.productHelperSha256,sha(fs.readFileSync('src/battle/fps/presentation/fpsGloveAnatomy.js')));
}
for(const [file,expected] of Object.entries(packet.sourceHashes)){
 if(priorSurface&&file==='src/battle/fps/presentation/fpsTailoredClothing.js'){
  const item=integrationLedger.files.find(f=>f.file===file);assert.equal(item.beforeSha256,expected);assert.equal(item.afterSha256,sha(fs.readFileSync(file)));
 }else assert.equal(sha(fs.readFileSync(file)),expected);
}
assert.equal(states.geometryModuleSha256,moduleSha);assert.equal(skin.geometryModuleSha256,moduleSha);
assert.equal(states.status,'AUTHOR_GLOVE_SIX_STATE_GEOMETRY_PASS_NOT_PRODUCT_OR_ART_PASS');assert.equal(states.samples,180);
assert(states.cases.every(c=>c.posedFlips===0&&c.posedDegenerates===0&&c.maximumSeamGapMetres<1e-4));
assert.equal(skin.status,'AUTHOR_EXISTING_SKIN_GUARD_PASS_NOT_ART_GATE');assert(skin.results.every(r=>r.passed));
const poseSha=packet.sourceHashes['src/battle/fps/presentation/fpsSupportGripPose.js'];assert.equal(states.poseCandidateSha256,poseSha);assert.equal(skin.candidateSha256,poseSha);
const {applyFpsGloveSurface}=await import(pathToFileURL(path.resolve(modulePath))),assets=await readFpsRigTestAssets(),f=assets.make({continuousClothing:true,importedWeapons:true,operatorId:packet.observed.id,side:'ct',gun:packet.observed.gun,role:'support'}),mesh=f.c.c2c.tailored.mesh,original=mesh.geometry,g=original.clone();
try{
 const meshIndex=packet.meshes.findIndex(m=>m.name==='ESMO_Major_ContinuousClothing'),row=packet.meshes[meshIndex];
 assert.deepEqual(row.indices,Array.from(g.index.array));assert.equal(row.bindPositions.length,g.attributes.position.array.length);
 if(!priorSurface)for(let i=0;i<row.bindPositions.length;i++)assert(Math.abs(row.bindPositions[i]-g.attributes.position.array[i])<1e-6);
 const matrices=row.boneWorldMatrices.map((m,i)=>new THREE.Matrix4().fromArray(m).multiply(new THREE.Matrix4().fromArray(row.boneInverses[i]))),bind=new THREE.Matrix4().fromArray(row.bindMatrix),unbind=new THREE.Matrix4().fromArray(row.bindMatrixInverse),objectWorld=new THREE.Matrix4().fromArray(row.matrixWorld),origin=new THREE.Vector3(...row.origin);
 function posed(geometry,i){
  const v=new THREE.Vector3().fromBufferAttribute(geometry.attributes.position,i).applyMatrix4(bind),result=new THREE.Vector3();
  for(let j=0;j<4;j++)result.addScaledVector(v.clone().applyMatrix4(matrices[row.skinIndex[i*4+j]]),row.skinWeight[i*4+j]);
  return result.applyMatrix4(unbind).applyMatrix4(objectWorld).sub(origin);
 }
 let maximumReconstructionErrorMetres=0;
 const referencePositions=new Map(row.positions.map((p,i)=>[i,p]));
 if(priorSurface)for(const [i,...p] of priorSurface.posedRows)referencePositions.set(i,p);
 for(let i=0;i<g.attributes.position.count;i++)maximumReconstructionErrorMetres=Math.max(maximumReconstructionErrorMetres,posed(original,i).distanceTo(new THREE.Vector3(...referencePositions.get(i))));
 assert(maximumReconstructionErrorMetres<1e-6,'真保存幀反算不一致，不用fixture姿態代替');
 const geometryReport=applyFpsGloveSurface(g,mesh),posedRows=[],colorsById=new Map(priorSurface?.colorRows.map(r=>[r[0],r])??[]);
 for(let i=0;i<g.attributes.position.count;i++){
  const p=posed(g,i);assert(p.toArray().every(Number.isFinite));if(p.distanceTo(new THREE.Vector3(...row.positions[i]))>1e-7)posedRows.push([i,...p.toArray()]);
  const a=new THREE.Color().fromBufferAttribute(original.attributes.color,i),b=new THREE.Color().fromBufferAttribute(g.attributes.color,i);
  if(Math.max(Math.abs(a.r-b.r),Math.abs(a.g-b.g),Math.abs(a.b-b.b))>1e-7)colorsById.set(i,[i,b.r,b.g,b.b]);
 }
 assert(assets.unchanged());
 const colorRows=[...colorsById.values()];
 const report={version:'cs-glove-surface-patch.v1',status:priorSurface?'PRIVATE_SURFACE_PATCH_DERIVED_FROM_TRUE_FRAME_NOT_PRODUCT_OR_ART_PASS':'PRIVATE_SURFACE_PATCH_SAME_TRUE_FRAME_NOT_PRODUCT_OR_ART_PASS',packetSha256:sha(raw),priorSurfacePatchSha256:priorSurfacePatchPath?sha(fs.readFileSync(priorSurfacePatchPath)):null,geometryModuleSha256:moduleSha,statesSha256:sha(fs.readFileSync(statesPath)),skinSha256:sha(fs.readFileSync(skinPath)),sourceFingerprint:packet.sourceFingerprint,meshIndex,geometryReport,maximumReconstructionErrorMetres,posedRows,colorRows,caveat:'只存真幀骨矩陣下稀疏候選皮面／色層差異；原bone world matrices、骨姿、拓撲、源packet保持。後續surface僅接受已整合ledger逐SHA證明的基線。不是新Browser幀，不重複packet、GLB或blend；作者shader不等於遊戲shader。'};
 const bytes=JSON.stringify(report);fs.writeFileSync(out,bytes,{flag:'wx'});
 console.log(JSON.stringify({status:report.status,out,bytes:Buffer.byteLength(bytes),sha256:sha(bytes),packetSha256:report.packetSha256,geometryModuleSha256:moduleSha,posedRows:posedRows.length,colorRows:colorRows.length,maximumReconstructionErrorMetres}));
}finally{g.dispose();f.dispose();assets.dispose();}
