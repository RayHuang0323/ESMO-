import * as THREE from 'three';
import {MeshBVH} from 'three-mesh-bvh';

// 幾何遮擋檢查；不量測 shader、像素或藝術分數。
export function measureHandExposure(packet,side='r') {
 const body=packet.meshes.find(m=>m.name==='ESMO_Major_ContinuousClothing');
 const hand=new THREE.Vector3().fromArray(packet.bones.find(b=>b.name==='hand_'+side).position);
 const targets=[];
 for(let i=0;i<body.positions.length;i++){
  let weight=0;
  for(let j=0;j<4;j++){
   const name=body.boneNames[body.skinIndex[i*4+j]];
   if(name.endsWith('_'+side)&&/^(hand|index|thumb|middle|ring|pinky)_/.test(name))weight+=body.skinWeight[i*4+j];
  }
  const p=new THREE.Vector3().fromArray(body.positions[i]);
  if(weight>.7&&p.distanceTo(hand)<.20)targets.push(p);
 }
 if(targets.length<20)throw Error('真手皮樣本不足');
 const samples=targets.filter((_,i)=>i%Math.max(1,Math.floor(targets.length/100))===0);
 const positions=[],indices=[];
 for(const m of packet.meshes){const offset=positions.length/3;positions.push(...m.positions.flat());for(const i of m.indices)indices.push(offset+i);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);
 const bvh=new MeshBVH(g,{maxLeafTris:8}),center=samples.reduce((p,v)=>p.add(v),new THREE.Vector3()).divideScalar(samples.length),views=[];
 try{
  for(const elevation of [-20,0,20,40,60])for(let azimuth=0;azimuth<360;azimuth+=15){
   const el=THREE.MathUtils.degToRad(elevation),az=THREE.MathUtils.degToRad(azimuth);
   const eye=center.clone().add(new THREE.Vector3(Math.sin(az)*Math.cos(el),Math.sin(el),Math.cos(az)*Math.cos(el)).multiplyScalar(1.2));
   let visible=0;
   for(const target of samples){const delta=target.clone().sub(eye),hit=bvh.raycastFirst(new THREE.Ray(eye,delta.clone().normalize()),THREE.DoubleSide,0,delta.length()+.004);if(hit&&hit.point.distanceTo(target)<.004)visible++;}
   views.push({azimuth,elevation,visibleSamples:visible});
  }
  views.sort((a,b)=>b.visibleSamples-a.visibleSamples);
  return {side,handVertices:targets.length,sampleCount:samples.length,testedViews:views.length,bestVisible:views[0].visibleSamples,topViews:views.slice(0,3),toleranceMetres:.004};
 }finally{g.dispose();}
}
