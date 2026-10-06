import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Matrix4,Vector3,Quaternion} from 'three';
// Every visible rock vertex (and every tree trunk vertex) in the shipped GLB must
// sit inside an authoritative navigation obstacle: a wall capsule (source.walls)
// or a wall mass polygon (source.masses, Topology Final). Anything outside would be
// "an obstacle the player can see but heroes walk through".
const source=JSON.parse(fs.readFileSync(process.argv[2]??'art/moba-rift/source.json','utf8'));
const bytes=fs.readFileSync(process.argv[3]??'src/assets/moba/rift-v1/esmo-rift.glb');
assert.equal(bytes.readUInt32LE(0),0x46546c67);
const jsonLength=bytes.readUInt32LE(12);
const gltf=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
const binary=bytes.subarray(28+jsonLength);
const cells=new Map(),CELL=16;
const addCell=(x,y,item)=>{const key=`${x},${y}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(item);};
for(const w of source.walls) {
 const radius=(w.len+w.thick)/2;
 for(let x=Math.floor((w.x-radius)/CELL);x<=Math.floor((w.x+radius)/CELL);x++)
  for(let y=Math.floor((w.y-radius)/CELL);y<=Math.floor((w.y+radius)/CELL);y++) addCell(x,y,{w});
}
const masses=(source.masses??[]).map(m=>{
 let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
 for(const p of m.poly){x0=Math.min(x0,p.x);y0=Math.min(y0,p.y);x1=Math.max(x1,p.x);y1=Math.max(y1,p.y);}
 return {poly:m.poly,x0,y0,x1,y1};
});
for(const m of masses)
 for(let x=Math.floor(m.x0/CELL);x<=Math.floor(m.x1/CELL);x++)
  for(let y=Math.floor(m.y0/CELL);y<=Math.floor(m.y1/CELL);y++) addCell(x,y,{m});
const inPoly=(px,py,poly)=>{let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];
 if((a.y>py)!==(b.y>py)&&px<((b.x-a.x)*(py-a.y))/(b.y-a.y)+a.x)inside=!inside;}return inside;};
// A closed polygon includes its outline: the cliff's top ring IS the outline, and
// float32 GLB quantisation makes points exactly on an edge flip either way.
const EDGE_EPS=0.01;
const nearEdge=(px,py,poly)=>{for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[j],b=poly[i];
 const dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy||1e-12,t=Math.max(0,Math.min(1,((px-a.x)*dx+(py-a.y)*dy)/l2));
 if(Math.hypot(px-a.x-t*dx,py-a.y-t*dy)<=EDGE_EPS)return true;}return false;};
const covered=(x,y)=> (cells.get(`${Math.floor(x/CELL)},${Math.floor(y/CELL)}`)??[]).some(({w,m})=>{
 if(m) return inPoly(x,y,m.poly)||nearEdge(x,y,m.poly);
 const ux=Math.sin(w.angle),uy=Math.cos(w.angle),dx=x-w.x,dy=y-w.y;
 const t=Math.max(-w.len/2,Math.min(w.len/2,dx*ux+dy*uy));
 return Math.hypot(dx-t*ux,dy-t*uy)<=w.thick/2+.001;
});
let checked=0,violations=0,rockNodes=0,trunkChecked=0,trunkViolations=0;
const samples=[];
function visit(index,parent) {
 const n=gltf.nodes[index],local=n.matrix?new Matrix4().fromArray(n.matrix):new Matrix4().compose(
  new Vector3(...(n.translation??[0,0,0])),new Quaternion(...(n.rotation??[0,0,0,1])),new Vector3(...(n.scale??[1,1,1])));
 const world=new Matrix4().multiplyMatrices(parent,local);
 const isRock=/Rift_rock(Warm)?_/.test(n.name??''), isTrunk=/Rift_wood_/.test(n.name??'');
 if(n.mesh!==undefined&&(isRock||isTrunk)) {
  if(isRock) rockNodes++;
  for(const primitive of gltf.meshes[n.mesh].primitives) {
   const a=gltf.accessors[primitive.attributes.POSITION],v=gltf.bufferViews[a.bufferView];
   assert.equal(a.componentType,5126);assert.equal(a.type,'VEC3');
   for(let i=0;i<a.count;i++) {
    const offset=(v.byteOffset??0)+(a.byteOffset??0)+i*(v.byteStride??12);
    const p=new Vector3(binary.readFloatLE(offset),binary.readFloatLE(offset+4),binary.readFloatLE(offset+8)).applyMatrix4(world);
    const x=p.x+source.WORLD_BOUNDS.centerX,y=p.z+source.WORLD_BOUNDS.centerY;
    if(isRock){checked++;
     if(!covered(x,y)){violations++;if(samples.length<5)samples.push({node:n.name,x,y});}}
    else{trunkChecked++;
     if(!covered(x,y)){trunkViolations++;if(samples.length<5)samples.push({node:n.name,x,y});}}
   }
  }
 }
 for(const child of n.children??[])visit(child,world);
}
for(const node of gltf.scenes[gltf.scene??0].nodes)visit(node,new Matrix4());
console.log(JSON.stringify({rockNodes,masses:masses.length,checked,violations,trunkChecked,trunkViolations,samples},null,2));
assert(checked>1000,'No substantive rock geometry inspected');
assert.equal(violations,0,'Visible rock vertices extend outside authoritative navigation walls');
assert.equal(trunkViolations,0,'Tree trunks stand outside authoritative navigation walls');
console.log('RIFT_MESH_NAVIGATION: PASS');
