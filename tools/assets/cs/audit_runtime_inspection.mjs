import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';

const [packetPath,glbPath]=process.argv.slice(2);
if(!packetPath||!glbPath)throw Error('需明確packet與inspection GLB路徑');
const raw=fs.readFileSync(packetPath),packet=JSON.parse(raw),bytes=fs.readFileSync(glbPath);
assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(8),bytes.length);
const header=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8'));
assert.equal(header.scenes?.length,1,'不得混入其他scene');
assert.equal(header.meshes?.length,packet.meshes.length,'不得混入其他mesh');
assert.equal(header.skins?.length??0,0,'inspection不是production rig');
assert.equal(header.animations?.length??0,0,'inspection不是production動畫');
assert.equal(header.images?.length??0,0,'未轉移texture不得冒充完整material');
const gltf=await new Promise((resolve,reject)=>new GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',resolve,reject));
gltf.scene.updateMatrixWorld(true);
const bySource=new Map();let triangles=0,maximumBoundsError=0;
const packetSha=crypto.createHash('sha256').update(raw).digest('hex');
gltf.scene.traverse(o=>{
 if(!o.isMesh)return;
 let ancestor=o;while(ancestor&&ancestor.userData.packet_mesh_index===undefined)ancestor=ancestor.parent;
 assert(ancestor,'匯出mesh缺來源ID');assert.equal(ancestor.userData.packet_sha256,packetSha,'mesh來源SHA錯配');
 const id=ancestor.userData.packet_mesh_index;assert(Number.isInteger(id)&&packet.meshes[id],'來源ID無效');
 const box=bySource.get(id)??new THREE.Box3();bySource.set(id,box);
 const p=o.geometry.attributes.position;
 for(let i=0;i<p.count;i++){
  const point=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);
  assert(point.toArray().every(Number.isFinite),'GLB真頂點非有限');box.expandByPoint(point);
 }
 triangles+=(o.geometry.index?.count??p.count)/3;
});
assert.equal(bySource.size,packet.meshes.length,'來源mesh覆蓋不完整');
const expectedTriangles=packet.meshes.reduce((n,m)=>n+m.indices.length/3,0);
assert.equal(triangles,expectedTriangles,'GLB增減真三角形');
for(const [i,actual] of bySource){
 const expected=new THREE.Box3();for(const p of packet.meshes[i].positions)expected.expandByPoint(new THREE.Vector3(...p));
 maximumBoundsError=Math.max(maximumBoundsError,actual.min.distanceTo(expected.min),actual.max.distanceTo(expected.max));
}
assert(maximumBoundsError<=1e-6,'軸向／尺度／bounds回傳不符');
const report={status:'AUTHOR_INSPECTION_ROUNDTRIP_VALID_NOT_PRODUCT_PASS',packetSha256:packetSha,glbSha256:crypto.createHash('sha256').update(bytes).digest('hex'),meshes:bySource.size,triangles,maximumBoundsErrorMetres:maximumBoundsError,scenes:1,skins:0,animations:0,images:0};
console.log(JSON.stringify(report));
const output=glbPath+'.audit.json';fs.writeFileSync(output,JSON.stringify(report,null,2),{flag:'wx'});
const resources=new Set();gltf.scene.traverse(o=>{if(o.geometry)resources.add(o.geometry);for(const m of (Array.isArray(o.material)?o.material:[o.material]).filter(Boolean))resources.add(m);});for(const resource of resources)resource.dispose();
