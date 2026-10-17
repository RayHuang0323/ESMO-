import * as THREE from 'three';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createUtilityPresentation,C5B_UTILITY_FX_CONTRACT} from '../src/battle/fps/presentation/fpsUtilityPresentation.js';
const results=[],measurements=[],W={vx:x=>x-50,vz:y=>y-50};
function ck(label,run){try{run();results.push({label,ok:true});console.log('PASS '+label);}catch(error){results.push({label,ok:false,error:error.message});console.log('FAIL '+label+' '+error.message);}}
const group=new THREE.Group(),texture=new THREE.Texture(),sphereGeometry=new THREE.SphereGeometry(1,16,12),fx=createUtilityPresentation({group,textures:{smoke:texture,glow:texture,flash:texture,fire:texture},sphereGeometry});
const bodies=()=>group.children.filter(o=>o.isGroup&&/^fps-utility-body-\d+$/.test(o.name));
const visibleDrawables=()=>{const rows=[];group.traverse(o=>{if(!o.isMesh&&!o.isSprite)return;for(let p=o;p;p=p.parent)if(!p.visible)return;rows.push(o);});return rows;};
const throwables=Array.from({length:12},(_,i)=>({id:'true-fixture-'+i,type:['he','smoke','flash','molly'][i%4],from:{x:10+i,y:10},to:{x:30+i,y:14},t:0,flightDurationSec:2,flightElapsedSec:0,arcHeightUnits:4,flying:true,boom:0}));
const frame={rnd:0,roundSec:20,throwables,players:[],smokes:[],mollys:[]},next={...frame,roundSec:20.5,throwables:throwables.map(t=>({...t,t:.25,flightElapsedSec:.5}))};
const update=(f=frame,n=next,sub=0,time=0)=>fx.update({frame:f,nextFrame:n,frameIndex:1,sub,time,W});
ck('actual imported FX contract is C5B.2 and has 12 model slots',()=>{assert.equal(C5B_UTILITY_FX_CONTRACT.version,'C5B.2');assert.equal(bodies().length,12);assert.equal(fx.contract.caps.throwableEvents,12);});
update();
ck('12 actual pool roots show correct four model types at unit scale',()=>{for(const [i,root] of bodies().entries()){assert.ok(root.visible);assert.equal(root.userData.utilityType,throwables[i].type);assert.deepEqual(root.scale.toArray(),[1,1,1]);assert.equal(root.children.filter(c=>c.visible).length,4);}});
for(const type of ['he','smoke','flash','molly']){
 const model=bodies().find(o=>o.userData.utilityType===type),local=new THREE.Group();model.children.filter(o=>o.visible).forEach(o=>local.add(o.clone()));const size=new THREE.Box3().setFromObject(local).getSize(new THREE.Vector3()),triangles=local.children.reduce((n,o)=>n+(o.geometry.index?.count??o.geometry.attributes.position.count)/3,0);measurements.push({type,metres:size.toArray(),visibleMeshes:local.children.length,triangles});
 ck(type+' actual FX geometry meets physical size and mesh/triangle budget',()=>{assert.ok(Math.max(size.x,size.z)>=.06&&Math.max(size.x,size.z)<=.09);assert.ok(size.y>=.12&&size.y<=.24);assert.ok(local.children.length<=6&&triangles<=1500);});
}
console.log('MODELS '+JSON.stringify(measurements));
ck('same-type live pool slots share geometry/material resources',()=>{const roots=bodies();for(let i=0;i<4;i++)for(let j=0;j<4;j++){assert.equal(roots[i].children[j].geometry,roots[i+4].children[j].geometry);assert.equal(roots[i].children[j].material,roots[i+4].children[j].material);}});
ck('four-type cache roundtrips retain four scene children and shared immutable resources',()=>{
 const roots=bodies(),cachedParts=new Map(),initialResources=fx.diagnostics().utilityModels;
 for(let cycle=0;cycle<3;cycle++)for(const type of ['he','smoke','flash','molly']){
  const f={...frame,throwables:throwables.map(t=>({...t,type}))},n={...next,throwables:next.throwables.map(t=>({...t,type}))};update(f,n,.5);
  const parts=roots.map(root=>[...root.children]);
  for(const [slot,root] of roots.entries()){
   assert.equal(root.children.length,4);assert.ok(root.children.every(part=>part.visible));assert.equal(root.userData.utilityType,type);
   for(let part=0;part<4;part++){assert.equal(root.children[part].geometry,roots[0].children[part].geometry);assert.equal(root.children[part].material,roots[0].children[part].material);if(slot)assert.notEqual(root.children[part],roots[0].children[part]);}
   if(cachedParts.has(type))for(let part=0;part<4;part++)assert.equal(root.children[part],cachedParts.get(type)[slot][part]);
  }
  for(const [otherType,rows] of cachedParts)if(otherType!==type)for(const parts of rows)for(const part of parts)assert.equal(part.parent,null);
  if(!cachedParts.has(type))cachedParts.set(type,parts);
  assert.equal(roots.reduce((n,root)=>n+root.children.length,0),48);
  assert.equal(fx.diagnostics().utilityModels.geometries,initialResources.geometries);assert.equal(fx.diagnostics().utilityModels.materials,initialResources.materials);
 }
 assert.equal(cachedParts.size,4);update(frame,next,0);
});
for(const sub of [0,.25,.5,.75,.99]){update(frame,next,sub);ck('12 actual model positions obey original 2-second trajectory at sub '+sub,()=>{for(const [i,root] of bodies().entries()){const t=.25*sub,tw=throwables[i];assert.ok(Math.abs(root.position.x-(tw.from.x+(tw.to.x-tw.from.x)*t-50))<1e-7);assert.ok(Math.abs(root.position.z-(tw.from.y+(tw.to.y-tw.from.y)*t-50))<1e-7);assert.ok(Math.abs(root.position.y-(.72+Math.sin(t*Math.PI)*tw.arcHeightUnits))<1e-7);}});}
update(frame,next,.5,0);const pausedRotations=bodies().map(root=>root.rotation.toArray()),pausedPositions=bodies().map(root=>root.position.toArray());
ck('same frame/sub keeps all paused body rotations despite different wall time',()=>{for(const time of [7,120,999]){update(frame,next,.5,time);for(const [i,root] of bodies().entries()){assert.deepEqual(root.rotation.toArray(),pausedRotations[i]);assert.deepEqual(root.position.toArray(),pausedPositions[i]);}}});
ck('body rotation is driven by actual authoritative trajectory t',()=>{for(const root of bodies()){const t=.125;assert.ok(Math.abs(root.rotation.x-t*Math.PI*6)<1e-10);assert.ok(Math.abs(root.rotation.y-t*Math.PI*8)<1e-10);assert.ok(Math.abs(root.rotation.z-t*Math.PI*4)<1e-10);}});
ck('seek to another saved flight t then back restores original body pose',()=>{const later={...frame,roundSec:21.5,throwables:throwables.map(t=>({...t,t:.75,flightElapsedSec:1.5}))},landingNext={...later,roundSec:22,throwables:later.throwables.map(t=>({...t,t:1,flying:false,boom:3}))};update(later,landingNext,.5,333);assert.notDeepEqual(bodies()[0].rotation.toArray(),pausedRotations[0]);update(frame,next,.5,555);for(const [i,root] of bodies().entries()){assert.deepEqual(root.rotation.toArray(),pausedRotations[i]);assert.deepEqual(root.position.toArray(),pausedPositions[i]);}});
ck('production trajectory has zero visible spherical tails',()=>assert.equal(group.children.filter(o=>o.geometry===sphereGeometry&&o.visible).length,0));
const overflow={...frame,throwables:[...throwables,{...throwables[0],id:'overflow'}]};update(overflow,{...next,throwables:overflow.throwables.map(t=>({...t,t:.25}))});ck('overflow remains bounded to 12 actual visible roots',()=>{assert.equal(bodies().filter(o=>o.visible).length,12);assert.equal(fx.diagnostics().activeThrowables,12);});
const before=JSON.stringify(frame);update(frame,{...next,rnd:1},.75);ck('different round does not interpolate flight toward the next round',()=>{assert.equal(bodies()[0].position.x,W.vx(throwables[0].from.x));assert.equal(JSON.stringify(frame),before);});
const deployed={...frame,throwables:[{...throwables[0],flying:false,t:1,boom:3,detonatedAtRoundSec:frame.roundSec},{...throwables[2],flying:false,t:1,boom:3,detonatedAtRoundSec:frame.roundSec}],smokes:[{id:'smoke',pos:{x:20,y:20},age:.45,tl:17}],mollys:[{id:'fire',pos:{x:25,y:25},tl:8}]};update(deployed,{...deployed,roundSec:20.5});
ck('detonated grenade roots hidden and saved-time HE/flash actually present',()=>{assert.equal(bodies().filter(o=>o.visible).length,0);assert.equal(fx.diagnostics().heBursts,1);assert.equal(fx.diagnostics().flashBursts,1);assert.ok(visibleDrawables().some(o=>o.isSprite&&o.name.startsWith('fps-he-contact-')&&o.position.x===W.vx(throwables[0].to.x)));});
ck('production smoke/molly/HE ground rings are all hidden',()=>{assert.equal(group.children.filter(o=>o.geometry?.type==='RingGeometry'&&o.visible).length,0);assert.equal(fx.diagnostics().visibleMarkers,0);});
ck('smoke reaches full .62+ alpha within .9 real seconds',()=>{const clouds=group.children.filter(o=>o.isSprite&&o.visible&&[0x9fa8ad,0x606a71].includes(o.material.color.getHex()));assert.equal(clouds.length,8);assert.ok(clouds.every(o=>o.material.opacity>=.62));});
ck('HE three authored dust layers receive exact saved-time .64/.54/.44 deployment alpha',()=>{const dust=visibleDrawables().filter(o=>o.isSprite&&o.name.startsWith('fps-he-dust-'));assert.equal(dust.length,3);dust.forEach((o,i)=>assert.ok(Math.abs(o.material.opacity-(.64-i*.10))<1e-8));});
update({...frame,throwables:[]},{...frame,throwables:[],roundSec:20.5});ck('empty saved frame clears every effective drawable without new allocation',()=>assert.equal(visibleDrawables().length,0));
// THREE.Sprite.geometry is a library-global shared quad, not an FX-owned geometry.
// Disposing it here would break other sprites; collect only actual Mesh geometries.
const geometries=new Set(),materials=new Set();group.traverse(o=>{if(o.isMesh&&o.geometry&&o.geometry!==sphereGeometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});let geoDisposed=0,matDisposed=0,externalGeoDisposed=0,externalTextureDisposed=0;geometries.forEach(g=>g.addEventListener('dispose',()=>geoDisposed++));materials.forEach(m=>m.addEventListener('dispose',()=>matDisposed++));sphereGeometry.addEventListener('dispose',()=>externalGeoDisposed++);texture.addEventListener('dispose',()=>externalTextureDisposed++);
fx.dispose();ck('FX disposes owned geometry/material once and detaches all pools',()=>{assert.equal(group.children.length,0);assert.equal(geoDisposed,geometries.size);assert.equal(matDisposed,materials.size);});fx.dispose();ck('FX dispose is idempotent and retains caller-owned sphere/textures',()=>{assert.equal(geoDisposed,geometries.size);assert.equal(matDisposed,materials.size);assert.equal(externalGeoDisposed,0);assert.equal(externalTextureDisposed,0);});
update();ck('disposed FX cannot resurrect detached pools',()=>assert.equal(group.children.length,0));sphereGeometry.dispose();texture.dispose();
const sourceFiles=['src/battle/fps/presentation/fpsUtilityPresentation.js','src/battle/fps/presentation/fpsUtilityModels.js'],report={schema:'cs-owner4-real-utility-fx-models.v1',scope:'Actual module CPU objects only; no GPU readability, physical device or frame-time claim',source:sourceFiles.map(file=>({file,sha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex')})),measurements,results,pass:results.filter(r=>r.ok).length,total:results.length};const arg=process.argv.indexOf('--report');if(arg>=0)fs.writeFileSync(process.argv[arg+1],JSON.stringify(report,null,2),{flag:'wx'});console.log(`Owner4 actual utility FX models: ${report.pass}/${report.total} PASS`);process.exitCode=report.pass===report.total?0:1;
