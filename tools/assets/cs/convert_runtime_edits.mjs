import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import * as THREE from 'three';

const [packetPath,editsPath,outputPath]=process.argv.slice(2);
if(!packetPath||!editsPath||!outputPath||!outputPath.replaceAll('\\','/').startsWith('review/cs-major-upgrade/evidence/'))throw Error('需明確packet／edits與evidence輸出，不直接改產品');
const raw=fs.readFileSync(packetPath),packet=JSON.parse(raw),edits=JSON.parse(fs.readFileSync(editsPath));
assert.equal(edits.version,'cs-runtime-author-edits.v1');
assert.equal(edits.packetSha256,crypto.createHash('sha256').update(raw).digest('hex'),'來源SHA不符');
for(const [file,sha] of Object.entries(packet.sourceHashes??{}))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),sha,'產品來源已變：'+file);
assert.notEqual(packet.status,'AUTHOR_POSE_TRIAL_NOT_PRODUCT_SOURCE_NOT_PASS','實驗骨姿不能冒充目前runtime編輯來源');
const result=[],seenMeshes=new Set();let maximumRoundtripError=0,maximumBindDelta=0;
for(const edit of edits.edits){
 assert(!seenMeshes.has(edit.meshIndex),'同一mesh不可拆成重複回傳段');seenMeshes.add(edit.meshIndex);
 const row=packet.meshes[edit.meshIndex];assert.equal(row.name,edit.meshName);assert.equal(row.name,'ESMO_Major_ContinuousClothing');
 assert(row.boneWorldMatrices&&row.bindMatrixInverse&&row.origin,'舊packet缺真蒙皮矩陣，不能猜反算');
 const matrices=row.boneWorldMatrices.map((m,i)=>new THREE.Matrix4().fromArray(m).multiply(new THREE.Matrix4().fromArray(row.boneInverses[i])));
 const bind=new THREE.Matrix4().fromArray(row.bindMatrix),unbind=new THREE.Matrix4().fromArray(row.bindMatrixInverse),world=new THREE.Matrix4().fromArray(row.matrixWorld),origin=new THREE.Vector3(...row.origin),seen=new Set();
 for(const [i,x,y,z] of edit.rows){
  assert(Number.isInteger(i)&&i>=0&&i<row.positions.length&&!seen.has(i),'頂點ID重複或越界');seen.add(i);
  const blend=new THREE.Matrix4();blend.elements.fill(0);
  for(let j=0;j<4;j++){const weight=row.skinWeight[i*4+j],m=matrices[row.skinIndex[i*4+j]];for(let k=0;k<16;k++)blend.elements[k]+=weight*m.elements[k];}
  // Three.applyBoneTransform累加Vector3，權重的float32誤差不造成齊次除法。
  // 累加Matrix4的w可能略偏1；保留真權重，只將仿射末列設為Vector3語義。
  blend.elements[3]=blend.elements[7]=blend.elements[11]=0;blend.elements[15]=1;
  const affine=world.clone().multiply(unbind).multiply(blend).multiply(bind);
  assert(Math.abs(affine.determinant())>1e-8,'蒙皮不可逆');
  const before=new THREE.Vector3(...row.bindPositions.slice(i*3,i*3+3)),original=new THREE.Vector3(...row.positions[i]).add(origin);
  const reproduced=before.clone().applyMatrix4(affine);maximumRoundtripError=Math.max(maximumRoundtripError,reproduced.distanceTo(original));
  assert(reproduced.distanceTo(original)<=1e-6,'原真表面無法反算；拒絕新候選');
  const after=new THREE.Vector3(x,y,z).add(origin).applyMatrix4(affine.clone().invert()),delta=after.clone().sub(before);
  assert(after.toArray().every(Number.isFinite)&&delta.length()<=.04,'作者單次bind位移超40mm或非有限');
  maximumBindDelta=Math.max(maximumBindDelta,delta.length());result.push({meshIndex:edit.meshIndex,index:i,referenceBind:before.toArray(),candidateBind:after.toArray(),delta:delta.toArray()});
 }
}
assert.equal(result.length,edits.changedVertices,'作者修改數不符');
const report={version:'cs-runtime-bind-edits.v1',status:'BIND_CANDIDATE_NOT_INTEGRATED_NOT_PRODUCT_PASS',packetSha256:edits.packetSha256,changedVertices:result.length,maximumRoundtripErrorMetres:maximumRoundtripError,maximumBindDeltaMetres:maximumBindDelta,rows:result};
fs.writeFileSync(outputPath,JSON.stringify(report,null,2),{flag:'wx'});
console.log(JSON.stringify({...report,rows:undefined,outputPath}));
