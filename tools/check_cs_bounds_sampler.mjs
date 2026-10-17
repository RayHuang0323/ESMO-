import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createFpsBoundsSampler,setFpsBoundsFromUpdatedObject} from '../src/battle/fps/presentation/fpsBoundsSampler.js';

let passed=0,failed=0;
const check=(name,fn)=>{try{fn();passed++;console.log(`PASS ${name}`);}catch(error){failed++;console.error(`FAIL ${name}: ${error.message}`);}};
const same=(a,b)=>{assert.ok(a.min.distanceTo(b.min)<1e-8&&a.max.distanceTo(b.max)<1e-8,JSON.stringify({a,b}));};
const fixture=()=>{
  const parent=new THREE.Group(),root=new THREE.Group(),child=new THREE.Group();
  parent.position.set(5,3,-7);parent.rotation.y=.8;parent.scale.set(1.2,.7,1.1);
  root.rotation.z=.4;root.add(child);parent.add(root);
  const visible=new THREE.Mesh(new THREE.BoxGeometry(1,2,3)),hidden=new THREE.Mesh(new THREE.BoxGeometry(2,4,1));
  visible.position.set(1,2,3);hidden.position.set(-4,1,2);hidden.visible=false;
  child.add(visible,hidden);return{parent,root,child,visible,hidden};
};
const native=root=>{root.updateWorldMatrix(true,true);return new THREE.Box3().setFromObject(root);};
check('nested transforms and hidden meshes match native bounds',()=>{const f=fixture();same(createFpsBoundsSampler(f.root)(),native(f.root));});
check('moving ancestor and animated child remain current',()=>{
  const f=fixture(),sample=createFpsBoundsSampler(f.root);
  for(let i=0;i<20;i++){f.parent.position.y=i*.2;f.child.rotation.x=i*.03;f.visible.position.x=i*.1;same(sample(),native(f.root));}
});
check('skinned object boundingBox retains native semantics',()=>{
  const f=fixture(),geometry=new THREE.BoxGeometry(1,2,1),count=geometry.attributes.position.count;
  geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(Array.from({length:count},()=>[0,0,0,0]).flat(),4));
  geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(Array.from({length:count},()=>[1,0,0,0]).flat(),4));
  const mesh=new THREE.SkinnedMesh(geometry),bone=new THREE.Bone();mesh.add(bone);mesh.bind(new THREE.Skeleton([bone]));f.root.add(mesh);
  const sample=createFpsBoundsSampler(f.root);same(sample(),native(f.root));bone.rotation.z=.5;mesh.boundingBox=null;same(sample(),native(f.root));
});
check('instanced object bounds match native bounds',()=>{
  const root=new THREE.Group(),mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial(),2);
  mesh.setMatrixAt(0,new THREE.Matrix4().makeTranslation(-4,0,0));mesh.setMatrixAt(1,new THREE.Matrix4().makeTranslation(8,3,1));root.add(mesh);
  same(createFpsBoundsSampler(root)(),native(root));
});
check('empty hierarchies remain empty',()=>assert.ok(createFpsBoundsSampler(new THREE.Group())().isEmpty()));
check('geometry replacement uses the new geometry on the same mesh',()=>{
  const f=fixture(),sample=createFpsBoundsSampler(f.root);sample();f.visible.geometry=new THREE.BoxGeometry(8,9,4);same(sample(),native(f.root));
});
check('sampling clears the previous result before union',()=>{
  const root=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1));root.add(mesh);const sample=createFpsBoundsSampler(root);
  mesh.position.x=100;sample();mesh.position.x=0;same(sample(),native(root));
});
check('one matrix walk removes the native second hierarchy walk',()=>{
  const f=fixture();let nativeCalls=0,samplerCalls=0,mode='native';
  f.root.traverse(object=>{const original=object.updateWorldMatrix;object.updateWorldMatrix=function(...args){mode==='native'?nativeCalls++:samplerCalls++;return original.apply(this,args);};});
  native(f.root);mode='sampler';const sample=createFpsBoundsSampler(f.root);same(sample(),native(f.root));
  // native() above also contributes sampler calls; measure again independently.
  samplerCalls=0;sample();assert.ok(samplerCalls<nativeCalls,`${samplerCalls} >= ${nativeCalls}`);
});
check('updated-tree diagnostic bounds match native including hidden descendants',()=>{
  const f=fixture();f.root.updateWorldMatrix(true,true);same(setFpsBoundsFromUpdatedObject(f.root),native(f.root));
});
check('updated-tree diagnostics include newly added weapon children',()=>{
  const f=fixture();f.root.updateWorldMatrix(true,true);setFpsBoundsFromUpdatedObject(f.root);
  const weapon=new THREE.Mesh(new THREE.BoxGeometry(4,1,1));weapon.position.x=15;f.visible.add(weapon);
  f.root.updateWorldMatrix(true,true);same(setFpsBoundsFromUpdatedObject(f.root),native(f.root));
});
check('updated-tree subtree bounds preserve native mesh-descendant behavior',()=>{
  const f=fixture(),child=new THREE.Mesh(new THREE.BoxGeometry(5,2,1));child.position.x=8;child.visible=false;f.visible.add(child);
  f.root.updateWorldMatrix(true,true);same(setFpsBoundsFromUpdatedObject(f.visible),new THREE.Box3().setFromObject(f.visible));
});
check('updated-tree diagnostics do not repeat any matrix updates',()=>{
  const f=fixture();f.root.updateWorldMatrix(true,true);let calls=0;
  f.parent.traverse(object=>{const original=object.updateWorldMatrix;object.updateWorldMatrix=function(...args){calls++;return original.apply(this,args);};});
  setFpsBoundsFromUpdatedObject(f.root);setFpsBoundsFromUpdatedObject(f.visible);assert.equal(calls,0);
});
check('updated-tree result and scratch are reusable without stale extent',()=>{
  const f=fixture(),result=new THREE.Box3(),part=new THREE.Box3();f.root.updateWorldMatrix(true,true);
  assert.equal(setFpsBoundsFromUpdatedObject(f.root,result,part),result);f.hidden.position.x=0;f.visible.position.x=-1;f.root.updateWorldMatrix(true,true);
  same(setFpsBoundsFromUpdatedObject(f.root,result,part),native(f.root));
});
check('missing updated-tree diagnostics retain empty bounds',()=>assert.ok(setFpsBoundsFromUpdatedObject(null).isEmpty()));
console.log(`CS bounds sampler: ${passed}/${passed+failed} PASS`);if(failed)process.exitCode=1;
