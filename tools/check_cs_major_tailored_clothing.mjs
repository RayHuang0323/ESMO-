import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { readFpsRigTestAssets } from './lib/fpsRigTestAssets.mjs';
import { TAILORED_PROXY } from '../src/battle/fps/presentation/fpsTailoredClothing.js';
import { splitTailoredSeams } from '../src/battle/fps/presentation/fpsTailoredSeams.js';

let passed=0,failed=0;
function check(name,fn){try{fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+': '+e.message);}}
const assets=await readFpsRigTestAssets(),fixtures=[];
const make=options=>{const f=assets.make({continuousClothing:true,...options});fixtures.push(f);return f;};
try {
  const a=make(),b=make({mobile:true}),mesh=a.c.c2c.tailored.mesh,g=mesh.geometry,source=a.c.model.getObjectByName('SuperHero_Male');
  check('真人體連續SkinnedMesh與原65骨架',()=>{assert.equal(mesh.isSkinnedMesh,true);assert.equal(mesh.skeleton,source.skeleton);assert.equal(mesh.skeleton.bones.length,65);assert.equal(source.visible,false);});
  check('各actor骨架私有但服裝geometry共用',()=>{assert.notEqual(mesh.skeleton,b.c.c2c.tailored.mesh.skeleton);assert.equal(g,b.c.c2c.tailored.geometry);assert.notEqual(g,source.geometry);});
  check('來源交錯position不變，衍生position全部有限且改形',()=>{const p=g.attributes.position,old=source.geometry.attributes.position;assert.equal(p.count,old.count+g.userData.esmoSeams.addedVertices);assert.equal(p.isInterleavedBufferAttribute,undefined);let difference=0;for(let i=0;i<p.count;i++){for(const fn of ['getX','getY','getZ']){assert.ok(Number.isFinite(p[fn](i)));if(i<old.count)difference+=Math.abs(p[fn](i)-old[fn](i));}}assert.ok(difference>1);});
  check('真joint及weights完整保留，新接縫權重正規化且合法',()=>{for(const key of ['skinIndex','skinWeight']){const attr=g.attributes[key],old=source.geometry.attributes[key];assert.equal(attr.count,old.count+g.userData.esmoSeams.addedVertices);for(let i=0;i<old.count;i++)for(const fn of ['getX','getY','getZ','getW'])assert.equal(attr[fn](i),old[fn](i));}for(let i=source.geometry.attributes.position.count;i<g.attributes.position.count;i++){let sum=0;for(const fn of ['getX','getY','getZ','getW']){const j=g.attributes.skinIndex[fn](i),w=g.attributes.skinWeight[fn](i);assert.ok(Number.isInteger(j)&&j>=0&&j<65);assert.ok(Number.isFinite(w)&&w>=0);sum+=w;}assert.ok(Math.abs(sum-1)<1e-6);}});
  check('UV重複頂點接縫在bind及真骨姿均不撕裂',()=>{
    const groups=new Map(),p=source.geometry.attributes.position,q=g.attributes.position;
    for(let i=0;i<p.count;i++){const key=[p.getX(i),p.getY(i),p.getZ(i)].map(v=>v.toFixed(6)).join(',');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(i);}
    let duplicates=0;
    for(const ids of groups.values())for(const i of ids.slice(1)){
      duplicates++;
      const first=new THREE.Vector3().fromBufferAttribute(q,ids[0]),other=new THREE.Vector3().fromBufferAttribute(q,i);
      assert.ok(first.distanceTo(other)<1e-6,'bind接縫分離');
      mesh.applyBoneTransform(ids[0],first);mesh.applyBoneTransform(i,other);
      assert.ok(first.distanceTo(other)<1e-4,'蒙皮接縫分離');
    }
    assert.equal(duplicates,996);
    assert.ok(g.attributes.normal.array.every(Number.isFinite));
  });
  check('全部原三角逐面積守恆，接縫分割成本完整計入',()=>{const s=g.userData.esmoSeams;assert.equal(s.originalTriangles,source.geometry.index.count/3);assert.equal(s.originalTriangles,12566);assert.ok(s.maxCoverageError<1e-8);assert.equal(g.index.count/3,s.originalTriangles+s.addedTriangles);assert.equal(a.c.c2c.tailored.triangles,g.index.count/3);assert.ok(s.addedTriangles>0&&s.addedTriangles<500);assert.ok(Array.from(g.index.array).every(i=>i>=0&&i<g.attributes.position.count));});
  check('已知三角接縫切割面積、UV與權重插值正確',()=>{const t=new THREE.BufferGeometry();t.setAttribute('position',new THREE.Float32BufferAttribute([-1,0,0,1,0,0,0,1,0],3));t.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,.5,1],2));t.setAttribute('skinIndex',new THREE.Uint16BufferAttribute([0,0,0,0,1,0,0,0,2,0,0,0],4));t.setAttribute('skinWeight',new THREE.Float32BufferAttribute([1,0,0,0,1,0,0,0,1,0,0,0],4));t.setIndex([0,1,2]);const s=splitTailoredSeams(t,[.5]);assert.equal(s.addedVertices,2);assert.equal(s.addedTriangles,2);assert.ok(s.maxCoverageError<1e-12);for(let i=3;i<5;i++){assert.equal(t.attributes.position.getY(i),.5);assert.equal(t.attributes.uv.getY(i),.5);assert.equal(t.attributes.skinWeight.getX(i),.5);assert.equal(t.attributes.skinWeight.getY(i),.5);}t.dispose();});
  check('領線腰線三角不跨材質分界且成本有界',()=>{const s=g.userData.esmoSeams;assert.equal(s.planes.length,2);assert.equal(s.crossingTriangles,0);assert.equal(s.addedVertices,151);assert.equal(s.addedTriangles,296);assert.equal(g.attributes.position.count,7432);assert.equal(g.index.count/3,12862);});
  check('手套與靴共用深色group、蒙皮材質隔離但保留原表面',()=>{assert.equal(g.groups.length,4);assert.equal(g.attributes.color,undefined);const rigid=[a.c.c2c.materials.fabric,a.c.c2c.materials.pants,a.c.c2c.materials.skin,a.c.c2c.materials.armor];mesh.material.forEach((m,i)=>{assert.notEqual(m,rigid[i]);assert.equal(m.color.getHex(),rigid[i].color.getHex());assert.equal(m.roughness,rigid[i].roughness);assert.equal(m.metalness,rigid[i].metalness);assert.equal(m.side,rigid[i].side);assert.equal(m.map,null);});for(const n of ['Eyes','Eyebrows']){const eye=a.c.model.getObjectByName(n);assert.equal(eye.visible,true);assert.equal(eye.skeleton,mesh.skeleton);assert.equal(eye.material.emissiveIntensity,0);assert.equal(eye.castShadow,false);}});
  check('替換26proxy而非疊加，包括球頭與上下袖',()=>{let n=0;a.c.model.traverse(o=>{if(o.isMesh&&TAILORED_PROXY.test(o.name)){n++;assert.equal(o.visible,false);assert.equal(o.userData.esmoTailoredReplaced,true);}});assert.equal(n,26);assert.equal(a.c.c2c.tailored.removedProxies,n);});
  check('major停止21個隱藏零件逐幀更新，保留真骨架与可見anchors',()=>{assert.equal(a.c.c2c.removedClothingUpdaters,21);assert.equal(a.c.c2c.clothingUpdaters.length,11);assert.ok(a.c.c2c.clothingUpdaters.every(update=>!update.mesh?.userData.esmoTailoredReplaced));const original=assets.make({continuousClothing:false});fixtures.push(original);assert.equal(original.c.c2c.removedClothingUpdaters,0);assert.equal(original.c.c2c.clothingUpdaters.length,32);});
  check('可見總成本誠實包含來源skin且owned預算仍保留',()=>{assert.ok(a.c.c2c.visibleTriangles>=12566);assert.ok(a.c.c2c.visibleTriangles<17000);assert.ok(a.c.c2c.triangleCount<=5200);assert.ok(a.c.c2c.materialCount<=8);});
  check('mobile服裝不castShadow、不新增texture或light',()=>{assert.equal(b.c.c2c.tailored.mesh.castShadow,false);assert.equal(mesh.castShadow,true);assert.ok(!mesh.children.length);});
  check('bind matrix完整保留、finite bounds與頭戴真尺寸',()=>{assert.deepEqual(mesh.bindMatrix.toArray(),source.bindMatrix.toArray());assert.ok([...g.boundingBox.min.toArray(),...g.boundingBox.max.toArray()].every(Number.isFinite));assert.ok(Number.isFinite(g.boundingSphere.radius));assert.equal(a.c.model.getObjectByName('ESMO_C2C_HeadClothingMount').scale.x,.15);});
  check('折領合批且頭戴跟隨Head真旋轉，不只頸骨方向',()=>{
    const head=source.skeleton.bones.find(b=>b.name==='Head'),mount=a.c.model.getObjectByName('ESMO_C2C_HeadClothingMount');
    assert.ok(mount.children.some(o=>o.name==='C2C_TailoredFoldedCollar'||o.userData.parts?.some(p=>p.name==='C2C_TailoredFoldedCollar')));
    const boneBefore=head.quaternion.clone(),mountBefore=mount.quaternion.clone();
    head.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),.2));
    a.c.model.updateWorldMatrix(true,true);a.c.c2c.syncAnchors();
    assert.ok(mountBefore.angleTo(mount.quaternion)>.15);
    head.quaternion.copy(boneBefore);a.c.model.updateWorldMatrix(true,true);a.c.c2c.syncAnchors();
    assert.ok(mountBefore.angleTo(mount.quaternion)<1e-6);
  });
  check('真跑射動作影響新skin、socket維持有效',()=>{const p=new THREE.Vector3().fromBufferAttribute(g.attributes.position,1000);mesh.applyBoneTransform(1000,p);a.update({player:{...a.player,pos:{x:17.5,y:23},shooting:1},previousPlayer:a.player,frameIndex:11});const q=new THREE.Vector3().fromBufferAttribute(g.attributes.position,1000);mesh.applyBoneTransform(1000,q);assert.ok(p.distanceTo(q)>1e-6);assert.ok(a.c.getMuzzleWorldPosition(new THREE.Vector3(),'rifle'));assert.ok(a.c.poseLayers?.active);});
  check('暫停凍結新skin真骨架、不重播歷史shoot',()=>{const before=mesh.skeleton.bones.map(o=>o.quaternion.toArray());a.update({player:{...a.player,pos:{x:17.5,y:23},shooting:1},previousPlayer:a.player,frameIndex:11,playbackActive:false});assert.deepEqual(mesh.skeleton.bones.map(o=>o.quaternion.toArray()),before);});
  check('legacy與opt-out不加入新服裝',()=>{const f=assets.make({optimized:false});fixtures.push(f);assert.equal(f.c.c2c.tailored,null);assert.ok(f.c.model.getObjectByName('C2C_HeadBase').visible);});
  check('共用geometry末一釋放、私有骨貼圖與蒙皮材質各釋放一次',()=>{let n=0,textures=0,skinMaterials=0;g.addEventListener('dispose',()=>n++);for(const f of [a,b]){f.c.c2c.tailored.mesh.material.forEach(m=>m.addEventListener('dispose',()=>skinMaterials++));f.c.c2c.tailored.mesh.skeleton.computeBoneTexture();f.c.c2c.tailored.mesh.skeleton.boneTexture.addEventListener('dispose',()=>textures++);}a.dispose();assert.equal(n,0);assert.equal(textures,1);assert.equal(skinMaterials,4);assert.ok(b.c.c2c.tailored.mesh.parent);assert.ok(b.c.c2c.tailored.mesh.skeleton.boneTexture);b.dispose();assert.equal(n,1);assert.equal(textures,2);assert.equal(skinMaterials,8);b.dispose();assert.equal(n,1);assert.equal(textures,2);assert.equal(skinMaterials,8);});
  check('production只在major optimized啟用、GLB磁碟bytes不變',()=>{const s=fs.readFileSync(new URL('../src/battle/fps/presentation/FpsCharacterRenderer.js',import.meta.url),'utf8');assert.ok(s.includes('continuousClothing: optimized'));assert.ok(assets.unchanged());});
} finally { fixtures.forEach(f=>f.dispose()); assets.dispose(); }
console.log(`CS Major Tailored Clothing B6: ${passed}/${passed+failed} PASS`);if(failed)process.exitCode=1;
