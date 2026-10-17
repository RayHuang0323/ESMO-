import * as THREE from 'three';

// Build-time presentation geometry: one owner for a coplanar patch. Later
// authored details own their overlap; earlier faces retain the exact remainder.
// No depth bias, moved vertices, collision edits or per-frame work.
const EPS=1e-7,PLANE_EPS=2e-5;
const cross=(a,b,p)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
const area=p=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-a[1]*b[0];},0))/2;
function split(poly,a,b,sign){
 const inside=[],outside=[];
 for(let i=0;i<poly.length;i++){
  const p=poly[i],q=poly[(i+1)%poly.length],dp=cross(a,b,p)*sign,dq=cross(a,b,q)*sign,pi=dp>=-EPS,qi=dq>=-EPS;
  (pi?inside:outside).push(p);
  if(pi!==qi){const t=dp/(dp-dq),v=[p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t];inside.push(v);outside.push(v);}
 }
 return{inside,outside};
}
function subtract(poly,triangle){
 let remainder=poly;const pieces=[],sign=Math.sign(cross(...triangle))||1;
 for(let i=0;i<3&&remainder.length>=3;i++){
  const {inside,outside}=split(remainder,triangle[i],triangle[(i+1)%3],sign);
  if(outside.length>=3&&area(outside)>EPS)pieces.push(outside);remainder=inside;
 }
 return pieces;
}
const overlaps=(a,b)=>a.min[0]<b.max[0]-EPS&&a.max[0]>b.min[0]+EPS&&a.min[1]<b.max[1]-EPS&&a.max[1]>b.min[1]+EPS;

export function resolveFpsCoplanarSurfaces(group){
 const meshes=[],rows=[],buckets=new Map(),stats={inputTriangles:0,outputTriangles:0,clippedTriangles:0,removedTriangles:0,replacedMeshes:0};
 group.updateMatrixWorld(true);
 group.traverse(mesh=>{
  if(!mesh.isMesh||mesh.isInstancedMesh||Array.isArray(mesh.material)||!mesh.visible||mesh.material.transparent||mesh.material.opacity<.999||!mesh.geometry?.attributes.position)return;
  // Environment batches are authored directly in world coordinates. Refuse a
  // transformed batch rather than applying a second coordinate convention.
  if(!mesh.matrixWorld.equals(new THREE.Matrix4()))return;
  const g=mesh.geometry,p=g.attributes.position,idx=g.index,entry={mesh,rows:[],changed:false};meshes.push(entry);
  for(let i=0;i<(idx?.count??p.count);i+=3){
   const ids=[0,1,2].map(k=>idx?idx.getX(i+k):i+k),vertices=ids.map(id=>new THREE.Vector3().fromBufferAttribute(p,id)),n=vertices[1].clone().sub(vertices[0]).cross(vertices[2].clone().sub(vertices[0]));
   if(n.lengthSq()<1e-16)continue;n.normalize();
   const axis=[Math.abs(n.x),Math.abs(n.y),Math.abs(n.z)].indexOf(Math.max(Math.abs(n.x),Math.abs(n.y),Math.abs(n.z))),coords=[0,1,2].filter(c=>c!==axis),direction=n.getComponent(axis)>0?1:-1,canonical=n.clone().multiplyScalar(direction),plane=canonical.dot(vertices[0]),poly=vertices.map(v=>coords.map(c=>v.getComponent(c)));
   const row={entry,ids,vertices,n,canonical,plane,direction,axis,coords,poly,pieces:[poly],min:[Math.min(...poly.map(p=>p[0])),Math.min(...poly.map(p=>p[1]))],max:[Math.max(...poly.map(p=>p[0])),Math.max(...poly.map(p=>p[1]))]};entry.rows.push(row);rows.push(row);stats.inputTriangles++;
  }
 });
 // Spatial cells limit comparisons to actual neighbouring surfaces. Register
 // original higher-priority triangles: their union is unchanged by ownership.
 for(const row of rows.slice().reverse()){
  const key=row.canonical.toArray().map(v=>Math.round(v*1e5)).join(':'),depth=Math.round(row.plane/PLANE_EPS),seen=new Set(),cells=[];
  for(let x=Math.floor(row.min[0]/4);x<=Math.floor(row.max[0]/4);x++)for(let y=Math.floor(row.min[1]/4);y<=Math.floor(row.max[1]/4);y++){
   cells.push([x,y]);for(let d=depth-1;d<=depth+1;d++)for(const other of buckets.get(`${key}:${d}:${x}:${y}`)||[]){
    if(seen.has(other))continue;seen.add(other);
    if(Math.abs(row.plane-other.plane)>PLANE_EPS||!overlaps(row,other)||row.direction!==other.direction&&(row.entry.mesh.material.side!==THREE.DoubleSide&&other.entry.mesh.material.side!==THREE.DoubleSide))continue;
    const before=row.pieces.reduce((s,p)=>s+area(p),0),pieces=row.pieces.flatMap(p=>subtract(p,other.poly)),after=pieces.reduce((s,p)=>s+area(p),0);
    if(before-after>EPS){row.pieces=pieces;row.entry.changed=true;}
   }
  }
  for(const [x,y]of cells){const cell=`${key}:${depth}:${x}:${y}`,list=buckets.get(cell)||[];list.push(row);buckets.set(cell,list);}
 }
 const replaced=[];
 for(const entry of meshes){
  if(!entry.changed){stats.outputTriangles+=entry.rows.length;continue;}
  const old=entry.mesh.geometry,attributes=Object.entries(old.attributes),data=Object.fromEntries(attributes.map(([name])=>[name,[]]));
  for(const row of entry.rows){
   const unchanged=row.pieces.length===1&&row.pieces[0]===row.poly;if(!unchanged)stats.clippedTriangles++;if(!row.pieces.length)stats.removedTriangles++;
   const [a,b,c]=row.poly,den=cross(a,b,c);
   for(const poly of row.pieces)for(let j=1;j<poly.length-1;j++)for(const point of [poly[0],poly[j],poly[j+1]]){
    const weights=[cross(b,c,point)/den,cross(c,a,point)/den,cross(a,b,point)/den];
    for(const [name,attribute]of attributes)for(let k=0;k<attribute.itemSize;k++)data[name].push(weights.reduce((v,w,i)=>v+w*attribute.array[row.ids[i]*attribute.itemSize+k],0));
   }
  }
  const geometry=new THREE.BufferGeometry();for(const [name,attribute]of attributes)geometry.setAttribute(name,new THREE.Float32BufferAttribute(data[name],attribute.itemSize));geometry.computeBoundingBox();geometry.computeBoundingSphere();
  entry.mesh.geometry=geometry;replaced.push({old,geometry});stats.replacedMeshes++;stats.outputTriangles+=geometry.attributes.position.count/3;
 }
 return{stats,replaced};
}
