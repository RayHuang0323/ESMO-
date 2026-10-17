import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createFpsMajorRoofShaderWarmup } from '../src/battle/fps/presentation/fpsMajorShaderWarmup.js';

let passed=0,failed=0;
async function check(name,fn){try{await fn();passed++;console.log(`PASS ${name}`);}catch(e){failed++;console.log(`FAIL ${name}: ${e.message}`);}}
function fixture(){
  const scene=new THREE.Scene(),group=new THREE.Group(),geometry=new THREE.BoxGeometry(4,.8,8),material=new THREE.MeshStandardMaterial({side:THREE.DoubleSide}),mesh=new THREE.Mesh(geometry,material);
  material.onBeforeCompile=()=>{};material.customProgramCacheKey=()=> 'test-roof-original';group.add(mesh);scene.add(group);
  return{scene,camera:new THREE.PerspectiveCamera(),environment:{group,fadeRoofs:[{material}]},mesh,material,geometry};
}
await check('預熱使用真屋頂geometry／同燈光targetScene與透明雙面clone',async()=>{
  const f=fixture();let calls=0;const renderer={async compileAsync(g,c,s){calls++;assert.equal(c,f.camera);assert.equal(s,f.scene);assert.equal(g.children.length,1);const p=g.children[0];assert.equal(p.geometry,f.geometry);assert.notEqual(p.material,f.material);assert.equal(p.material.side,THREE.DoubleSide);assert.equal(p.material.transparent,true);assert.equal(p.material.onBeforeCompile,f.material.onBeforeCompile);assert.equal(p.material.customProgramCacheKey(),'test-roof-original');}};
  const h=createFpsMajorRoofShaderWarmup({...f,renderer});assert.equal((await h.ready).status,'ready');assert.equal(calls,1);h.dispose();
});
await check('預熱不修改原材質／場景／geometry也不增加draw物件',async()=>{
  const f=fixture(),before=f.material.toJSON(),h=createFpsMajorRoofShaderWarmup({...f,renderer:{async compileAsync(){}}});await h.ready;
  assert.deepEqual(f.material.toJSON(),before);assert.deepEqual(f.scene.children,[f.environment.group]);assert.deepEqual(f.environment.group.children,[f.mesh]);h.dispose();
});
await check('共用屋頂材質只預熱一次且不預熱ground／真cover',async()=>{
  const f=fixture();f.environment.group.add(f.mesh.clone(false));const cover=new THREE.Mesh(f.geometry,new THREE.MeshStandardMaterial());f.environment.group.add(cover);let count=0;
  const h=createFpsMajorRoofShaderWarmup({...f,renderer:{async compileAsync(g){count=g.children.length;}}});await h.ready;assert.equal(count,1);assert.equal(h.result.materialCount,1);h.dispose();
});
await check('預熱program clone維持owner至離場，dispose冪等且不釋放共用資產',async()=>{
  const f=fixture();let cloneDisposed=0,assetDisposed=0;f.material.addEventListener('dispose',()=>assetDisposed++);f.geometry.addEventListener('dispose',()=>assetDisposed++);
  const h=createFpsMajorRoofShaderWarmup({...f,renderer:{async compileAsync(g){g.children[0].material.addEventListener('dispose',()=>cloneDisposed++);}}});await h.ready;assert.equal(cloneDisposed,0);h.dispose();h.dispose();assert.equal(cloneDisposed,1);assert.equal(assetDisposed,0);
});
await check('編譯途中離場等promise結束再釋放，避免輪詢已dispose material',async()=>{
  const f=fixture();let done,disposed=0;const h=createFpsMajorRoofShaderWarmup({...f,renderer:{compileAsync(g){g.children[0].material.addEventListener('dispose',()=>disposed++);return new Promise(r=>{done=r;});}}});await Promise.resolve();h.dispose();assert.equal(disposed,0);done();await h.ready;assert.equal(disposed,1);
});
await check('開工前取消不編譯且安全釋放clone',async()=>{
  const f=fixture();let calls=0;const h=createFpsMajorRoofShaderWarmup({...f,renderer:{async compileAsync(){calls++;}}});h.dispose();assert.equal((await h.ready).status,'cancelled');assert.equal(calls,0);
});
await check('編譯失敗誠實標示failed、清理clone且不改原場景',async()=>{
  const f=fixture();let disposed=0;const h=createFpsMajorRoofShaderWarmup({...f,renderer:{async compileAsync(g){g.children[0].material.addEventListener('dispose',()=>disposed++);throw new Error('test compile failure');}}});await h.ready;assert.equal(h.result.status,'failed');assert.match(h.result.error,/test compile failure/);assert.equal(disposed,1);assert.equal(f.scene.children.length,1);h.dispose();assert.equal(disposed,1);
});
await check('無DoubleSide屋頂時不建立多餘program',async()=>{
  const f=fixture();f.material.side=THREE.FrontSide;let calls=0;const h=createFpsMajorRoofShaderWarmup({...f,renderer:{async compileAsync(){calls++;}}});assert.equal((await h.ready).status,'not-needed');assert.equal(calls,0);h.dispose();
});
await check('真透明Standard特效在準備期預熱，保留原geometry／shader及隱藏狀態',async()=>{
  const f=fixture(),effects=new THREE.Group(),material=new THREE.MeshStandardMaterial({transparent:true,opacity:0,roughness:.76,metalness:.28}),mesh=new THREE.Mesh(new THREE.SphereGeometry(.1,8,6),material);
  mesh.name='fixture-throwable';mesh.visible=false;material.onBeforeCompile=()=>{};material.customProgramCacheKey=()=> 'fixture-utility';effects.add(mesh);f.scene.add(effects);
  const before=material.toJSON(),h=createFpsMajorRoofShaderWarmup({...f,effectGroups:[effects],renderer:{async compileAsync(g,c,s){assert.equal(s,f.scene);const probe=g.getObjectByName(mesh.name);assert.ok(probe);assert.equal(probe.geometry,mesh.geometry);assert.equal(probe.visible,true);assert.equal(probe.material.transparent,true);assert.equal(probe.material.side,THREE.FrontSide);assert.equal(probe.material.onBeforeCompile,material.onBeforeCompile);assert.equal(probe.material.customProgramCacheKey(),'fixture-utility');}}});
  await h.ready;assert.equal(h.result.roofMaterialCount,1);assert.equal(h.result.effectMaterialCount,1);assert.deepEqual(material.toJSON(),before);assert.equal(mesh.visible,false);assert.equal(effects.children.length,1);assert.equal(f.scene.children.length,2);h.dispose();
});
await check('特效共享material去重且不編譯Basic／Sprite／不透明Standard',async()=>{
  const f=fixture(),effects=new THREE.Group(),material=new THREE.MeshStandardMaterial({transparent:true}),mesh=new THREE.Mesh(f.geometry,material);effects.add(mesh,mesh.clone(false),new THREE.Mesh(f.geometry,new THREE.MeshBasicMaterial({transparent:true})),new THREE.Mesh(f.geometry,new THREE.MeshStandardMaterial()),new THREE.Sprite(new THREE.SpriteMaterial()));let count=0;
  const h=createFpsMajorRoofShaderWarmup({...f,effectGroups:[effects,effects],renderer:{async compileAsync(g){count=g.children.length;}}});await h.ready;assert.equal(count,2);assert.equal(h.result.effectMaterialCount,1);h.dispose();
});
await check('沒有雙面屋頂時仍可預熱真透明特效，dispose不釋放原特效資產',async()=>{
  const f=fixture();f.material.side=THREE.FrontSide;const effects=new THREE.Group(),material=new THREE.MeshStandardMaterial({transparent:true}),mesh=new THREE.Mesh(f.geometry,material);effects.add(mesh);let clones=0,originals=0;material.addEventListener('dispose',()=>originals++);f.geometry.addEventListener('dispose',()=>originals++);
  const h=createFpsMajorRoofShaderWarmup({...f,effectGroups:[effects],renderer:{async compileAsync(g){assert.equal(g.children.length,1);g.children[0].material.addEventListener('dispose',()=>clones++);}}});assert.equal((await h.ready).status,'ready');assert.equal(h.result.roofMaterialCount,0);assert.equal(h.result.effectMaterialCount,1);h.dispose();h.dispose();assert.equal(clones,1);assert.equal(originals,0);
});
await check('特效pending編譯的離場同樣等待完成，不提前釋放program owner',async()=>{
  const f=fixture(),effects=new THREE.Group();effects.add(new THREE.Mesh(f.geometry,new THREE.MeshStandardMaterial({transparent:true})));let done,clones=0;
  const h=createFpsMajorRoofShaderWarmup({...f,effectGroups:[effects],renderer:{compileAsync(g){g.children.forEach(p=>p.material.addEventListener('dispose',()=>clones++));return new Promise(r=>{done=r;});}}});await Promise.resolve();h.dispose();assert.equal(clones,0);done();await h.ready;assert.equal(clones,2);
});
console.log(`CS Major Shader Warmup: ${passed}/${passed+failed} PASS`);if(failed)process.exitCode=1;
