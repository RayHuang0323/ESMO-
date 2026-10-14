import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {readFpsRigTestAssets} from '../../lib/fpsRigTestAssets.mjs';
import {applyFpsGloveSurface} from './author_glove_surface_candidate.mjs';
const [packetPath,fitPath,out,geometryValidationPath]=process.argv.slice(2),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
assert(out?.startsWith('review/cs-major-upgrade/evidence/')&&!fs.existsSync(out));
const raw=fs.readFileSync(packetPath),packet=JSON.parse(raw),fit=JSON.parse(fs.readFileSync(fitPath));
for(const [file,expected] of Object.entries(packet.sourceHashes))assert.equal(sha(fs.readFileSync(file)),expected);
const geometryModuleSha256=sha(fs.readFileSync('tools/assets/cs/author_glove_surface_candidate.mjs'));
if(geometryValidationPath){
 const validation=JSON.parse(fs.readFileSync(geometryValidationPath));
 assert.equal(validation.geometryModuleSha256,geometryModuleSha256);assert.equal(validation.status,'AUTHOR_EXISTING_SKIN_GUARD_PASS_NOT_ART_GATE');assert(validation.results.every(r=>r.passed));
 assert.equal(validation.candidateSha256,sha(fs.readFileSync('review/cs-major-upgrade/evidence/b7-visible-glove-grip-candidate-20261011.mjs')));
}else assert.equal(fit.geometryModuleSha256,geometryModuleSha256);
assert.equal(fit.sourceSha256,packet.sourceHashes['src/battle/fps/presentation/fpsSupportGripPose.js']);assert(fit.final.negativeOver2mm<=40);
const assets=await readFpsRigTestAssets(),f=assets.make({continuousClothing:true,importedWeapons:true,operatorId:'ct2',gun:'scout',role:'support'});
const mesh=f.c.c2c.tailored.mesh,original=mesh.geometry,g=original.clone();
try{
 const meshIndex=packet.meshes.findIndex(r=>r.name==='ESMO_Major_ContinuousClothing'),row=packet.meshes[meshIndex];
 assert.equal(row.bindPositions.length,g.attributes.position.array.length);
 for(let i=0;i<g.attributes.position.array.length;i++)assert(Math.abs(row.bindPositions[i]-g.attributes.position.array[i])<1e-6);
 const geometryReport=applyFpsGloveSurface(g,mesh);
 let flipped=0,degenerate=0;
 for(let at=0;at<g.index.count;at+=3){
  const ids=[0,1,2].map(j=>g.index.getX(at+j)),normal=geometry=>{const [a,b,c]=ids.map(i=>new THREE.Vector3().fromBufferAttribute(geometry.attributes.position,i));return b.sub(a).cross(c.sub(a));};
  const before=normal(original),after=normal(g);if(before.length()>1e-10){if(after.length()<=1e-10)degenerate++;if(before.dot(after)<=0)flipped++;}
 }
 assert.equal(flipped,0);assert.equal(degenerate,0);
 const boneRows=new Map(packet.bones.map(b=>[b.name,b])),names=row.boneNames,worlds=row.boneWorldMatrices.map(m=>new THREE.Matrix4().fromArray(m)),locals=new Map(),overrides=new Map();
 for(const [i,name] of names.entries()){
  const parent=boneRows.get(name)?.parent,parentIndex=names.indexOf(parent);
  const local=parentIndex>=0?worlds[parentIndex].clone().invert().multiply(worlds[i]):worlds[i].clone();
  const position=new THREE.Vector3(),quaternion=new THREE.Quaternion(),scale=new THREE.Vector3();local.decompose(position,quaternion,scale);locals.set(name,{position,quaternion,scale,parent:parentIndex>=0?parent:null});
 }
 for(const r of fit.fingers)for(let j=0;j<3;j++){
  const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),r.best.angles[j]);if(j===0)q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI/2));overrides.set(r.digit+'_0'+(j+1)+'_l',q);
 }
 overrides.set('thumb_01_l',new THREE.Quaternion().fromArray(fit.thumb.best.rotation));for(let j=0;j<2;j++)overrides.set('thumb_0'+(j+2)+'_l',new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),fit.thumb.best.flex[j]));
 const revised=new Map();
 const world=name=>{if(revised.has(name))return revised.get(name);const r=locals.get(name),m=new THREE.Matrix4().compose(r.position,overrides.get(name)??r.quaternion,r.scale);if(r.parent)m.premultiply(world(r.parent));revised.set(name,m);return m;};
 const matrices=names.map((name,i)=>world(name).clone().multiply(new THREE.Matrix4().fromArray(row.boneInverses[i])));
 const bind=new THREE.Matrix4().fromArray(row.bindMatrix),unbind=new THREE.Matrix4().fromArray(row.bindMatrixInverse),objectWorld=new THREE.Matrix4().fromArray(row.matrixWorld),origin=new THREE.Vector3(...row.origin),posedRows=[];
 for(let i=0;i<g.attributes.position.count;i++){
  const blend=new THREE.Matrix4();blend.elements.fill(0);for(let j=0;j<4;j++){const w=row.skinWeight[i*4+j],m=matrices[row.skinIndex[i*4+j]];for(let k=0;k<16;k++)blend.elements[k]+=w*m.elements[k];}blend.elements[3]=blend.elements[7]=blend.elements[11]=0;blend.elements[15]=1;
  const p=new THREE.Vector3().fromBufferAttribute(g.attributes.position,i).applyMatrix4(bind).applyMatrix4(blend).applyMatrix4(unbind).applyMatrix4(objectWorld).sub(origin);
  assert(p.toArray().every(Number.isFinite));if(p.distanceTo(new THREE.Vector3(...row.positions[i]))>1e-6)posedRows.push([i,...p.toArray()]);
 }
 const report={version:'cs-glove-author-patch.v1',status:'PRIVATE_GLOVE_POSE_PATCH_NOT_PRODUCT_FRAME_NOT_ART_PASS',packetSha256:sha(raw),fitSha256:sha(fs.readFileSync(fitPath)),geometryModuleSha256,geometryValidationSha256:geometryValidationPath?sha(fs.readFileSync(geometryValidationPath)):null,meshIndex,geometryReport,bindFlippedTriangles:flipped,bindNewDegenerateTriangles:degenerate,posedRows,colors:Array.from(g.attributes.color.array),caveat:'從真保存幀與原bone-local平移／scale組成的私有作者姿態，不是新產品Browser幀；只保存稀疏posed差異與實際衍生vertexColor，不重複完整packet／GLB。'};
 fs.writeFileSync(out,JSON.stringify(report),{flag:'wx'});console.log(JSON.stringify({...report,posedRows:posedRows.length,colors:report.colors.length}));
 assert(assets.unchanged());
}finally{g.dispose();f.dispose();assets.dispose();}
