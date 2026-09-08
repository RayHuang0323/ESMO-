import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Matrix4,Vector3,Quaternion} from 'three';
const source=JSON.parse(fs.readFileSync(process.argv[2]??'art/moba-rift/source.json','utf8'));
const bytes=fs.readFileSync(process.argv[3]??'public/assets/moba/rift-v1/esmo-rift.glb');
assert.equal(bytes.readUInt32LE(0),0x46546c67);
const jsonLength=bytes.readUInt32LE(12);
const gltf=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
const binary=bytes.subarray(28+jsonLength);
const cells=new Map(),CELL=16;
for(const w of source.walls) {
 const radius=(w.len+w.thick)/2;
 for(let x=Math.floor((w.x-radius)/CELL);x<=Math.floor((w.x+radius)/CELL);x++)
  for(let y=Math.floor((w.y-radius)/CELL);y<=Math.floor((w.y+radius)/CELL);y++) {
   const key=`${x},${y}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(w);
  }
}
const covered=(x,y)=> (cells.get(`${Math.floor(x/CELL)},${Math.floor(y/CELL)}`)??[]).some(w=>{
 const ux=Math.sin(w.angle),uy=Math.cos(w.angle),dx=x-w.x,dy=y-w.y;
 const t=Math.max(-w.len/2,Math.min(w.len/2,dx*ux+dy*uy));
 return Math.hypot(dx-t*ux,dy-t*uy)<=w.thick/2+.001;
});
let checked=0,violations=0,rockNodes=0;
const samples=[];
function visit(index,parent) {
 const n=gltf.nodes[index],local=n.matrix?new Matrix4().fromArray(n.matrix):new Matrix4().compose(
  new Vector3(...(n.translation??[0,0,0])),new Quaternion(...(n.rotation??[0,0,0,1])),new Vector3(...(n.scale??[1,1,1])));
 const world=new Matrix4().multiplyMatrices(parent,local);
 if(n.mesh!==undefined&&/Rift_rock_/.test(n.name??'')) {
  rockNodes++;
  for(const primitive of gltf.meshes[n.mesh].primitives) {
   const a=gltf.accessors[primitive.attributes.POSITION],v=gltf.bufferViews[a.bufferView];
   assert.equal(a.componentType,5126);assert.equal(a.type,'VEC3');
   for(let i=0;i<a.count;i++) {
    const offset=(v.byteOffset??0)+(a.byteOffset??0)+i*(v.byteStride??12);
    const p=new Vector3(binary.readFloatLE(offset),binary.readFloatLE(offset+4),binary.readFloatLE(offset+8)).applyMatrix4(world);
    const x=p.x+source.WORLD_BOUNDS.centerX,y=p.z+source.WORLD_BOUNDS.centerY;
    checked++;
    if(!covered(x,y)){violations++;if(samples.length<5)samples.push({node:n.name,x,y});}
   }
  }
 }
 for(const child of n.children??[])visit(child,world);
}
for(const node of gltf.scenes[gltf.scene??0].nodes)visit(node,new Matrix4());
console.log(JSON.stringify({rockNodes,checked,violations,samples},null,2));
assert(checked>1000,'No substantive rock geometry inspected');
assert.equal(violations,0,'Visible rock vertices extend outside authoritative navigation walls');
console.log('RIFT_MESH_NAVIGATION: PASS');
