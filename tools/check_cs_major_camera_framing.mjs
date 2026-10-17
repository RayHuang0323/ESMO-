#!/usr/bin/env node
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { fitFpsCombatCamera, fpsChaseMinimumRadius, fpsChaseForwardOffset } from '../src/battle/fps/fpsCameraFraming.js';
let pass=0,fail=0;
const check=(name,fn)=>{try{fn();pass++;console.log('PASS '+name);}catch(e){fail++;console.log('FAIL '+name+' '+e.message);}};
const cases={
  close:[{x:0,z:0},{x:5,z:4}],
  corner:[{x:-45,z:-43},{x:-33,z:-35},{x:-41,z:-22}],
  spread:[{x:-42,z:-40},{x:43,z:42},{x:0,z:12}],
  platform:[{x:22,z:-27,elevation:2.4},{x:35,z:-14,elevation:0}],
};
for(const aspect of [1366/768,370/437])for(const [name,points] of Object.entries(cases))check(`${name}/${aspect.toFixed(2)} 真實透視包含角色腳頭與近場`,()=>{
  const before=JSON.stringify(points),theta=-.76,phi=.86,fit=fitFpsCombatCamera({points,focus:points[0],aspect,theta,phi});
  const camera=new THREE.PerspectiveCamera(42,aspect,.1,1000),target=new THREE.Vector3(fit.target.x,fit.target.y,fit.target.z);
  camera.position.setFromSphericalCoords(fit.radius,phi,theta).add(target);camera.lookAt(target);camera.updateMatrixWorld();
  for(const p of points)for(const dx of [-4,4])for(const dz of [-4,4])for(const height of [0,2.5]){
    const q=new THREE.Vector3(p.x+dx,(p.elevation||0)+height,p.z+dz).project(camera);
    assert.ok(Math.abs(q.x)<=.82&&Math.abs(q.y)<=.78&&q.z>-1&&q.z<1,JSON.stringify(q));
  }
  assert.equal(JSON.stringify(points),before);assert.ok(Number.isFinite(fit.radius));
});
check('近距離對槍不再固定拉到82m以外',()=>assert.ok(fitFpsCombatCamera({points:cases.close,focus:{x:0,z:0},aspect:.85}).radius<55));
check('空集合仍有有限取景',()=>assert.deepEqual(fitFpsCombatCamera({points:[],focus:{x:5,z:8}}),{target:{x:5,y:3,z:8},radius:82,actorCount:0}));
for(const aspect of [1366/768,370/437])check(`遠端已安裝炸彈與存活角色同框/${aspect.toFixed(2)}`,()=>{
  const points=[{x:-35,z:37},{x:-30,z:33}],objective={x:32,z:-28,elevation:2.4};
  const before=JSON.stringify({points,objective}),theta=-.76,phi=.86;
  const fit=fitFpsCombatCamera({points,objective,focus:objective,targetY:3.8,aspect,theta,phi});
  const camera=new THREE.PerspectiveCamera(42,aspect,.1,1000),target=new THREE.Vector3(fit.target.x,fit.target.y,fit.target.z);
  camera.position.setFromSphericalCoords(fit.radius,phi,theta).add(target);camera.lookAt(target);camera.updateMatrixWorld();
  for(const p of [...points,objective])for(const dx of [-4,4])for(const dz of [-4,4])for(const height of [0,2.5]){
    const q=new THREE.Vector3(p.x+dx,(p.elevation||0)+height,p.z+dz).project(camera);
    assert.ok(Math.abs(q.x)<=.82&&Math.abs(q.y)<=.78&&q.z>-1&&q.z<1,JSON.stringify(q));
  }
  assert.equal(fit.actorCount,2);assert.equal(fit.target.y,3.8);assert.equal(JSON.stringify({points,objective}),before);
});
check('major手動近拍焦點隨縮放回到人物、預設槍線不變',()=>{assert.equal(fpsChaseMinimumRadius('major'),1.2);assert.equal(fpsChaseForwardOffset({sceneVersion:'major',manualRadius:1.2,close:true}),0);assert.equal(fpsChaseForwardOffset({sceneVersion:'major',manualRadius:2.7,close:true}),0);assert.equal(fpsChaseForwardOffset({sceneVersion:'major',manualRadius:14,close:true}),2.5);assert.equal(fpsChaseForwardOffset({sceneVersion:'major'}),3);assert.ok(fpsChaseForwardOffset({sceneVersion:'major',manualRadius:8,close:true})>0);assert.ok(fpsChaseForwardOffset({sceneVersion:'major',manualRadius:8,close:true})<2.5);});
check('legacy縮放下限與原近遠槍線保持',()=>{assert.equal(fpsChaseMinimumRadius('legacy'),4.5);assert.equal(fpsChaseForwardOffset({sceneVersion:'legacy',manualRadius:4.5,close:true}),2.5);assert.equal(fpsChaseForwardOffset({sceneVersion:'legacy',manualRadius:4.5}),3);});
for(const aspect of [1366/768,370/437])check(`原2.7m全身前側背均包含人體範圍/${aspect.toFixed(2)}`,()=>{for(const theta of [0,Math.PI/2,Math.PI,Math.PI*1.5]){const camera=new THREE.PerspectiveCamera(42,aspect,.1,1000),target=new THREE.Vector3(0,1.08,0);camera.position.setFromSphericalCoords(2.7,1.1,theta).add(target);camera.lookAt(target);camera.updateMatrixWorld();for(const x of [-.28,.28])for(const y of [0,1.81])for(const z of [-.15,.15]){const p=new THREE.Vector3(x,y,z).project(camera);assert.ok(Math.abs(p.x)<1&&Math.abs(p.y)<1&&p.z>-1&&p.z<1,JSON.stringify(p));}}});
console.log(`CS Major camera framing: ${pass}/${pass+fail} PASS`);if(fail)process.exitCode=1;
