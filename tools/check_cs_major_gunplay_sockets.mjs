import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { createGunplayPresentation, C5A_WEAPON_FX } from '../src/battle/fps/presentation/fpsGunplayPresentation.js';
import { fpsMajorElevation } from '../src/battle/fps/fpsMajorTerrain.js';

let passed=0,failed=0;
function check(name,fn){try{fn();passed++;console.log(`PASS ${name}`);}catch(error){failed++;console.log(`FAIL ${name}: ${error.message}`);}}
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);
function vector(actual,expected){near(actual.x,expected.x);near(actual.y,expected.y);near(actual.z,expected.z);}
const W={vx:x=>x*2-100,vz:y=>y*3-150};
function fixture(sceneVersion='major-v1',family='rifle'){
  const group=new THREE.Group(),beamGeometry=new THREE.BoxGeometry(1,1,1);
  const fx=createGunplayPresentation({group,scene:new THREE.Scene(),tex:{flash:null,glow:null},beamGeometry,mapKey:'mirage',sceneVersion:sceneVersion==='default'?undefined:sceneVersion});
  const player={id:'t1',pos:{x:10,y:10},va:0,elevation:2.4,gun:'ak',hp:100,dead:false};
  const frame={rnd:1,roundSec:1,players:[player],muzzles:[{id:'mz-shot',eventId:'shot',attackerId:'t1',pos:{...player.pos},va:0,weaponFamily:family,shotAtMs:1000}],tracers:[{id:'tr-shot',eventId:'shot',attackerId:'t1',from:{...player.pos},to:{x:78,y:25},weaponFamily:family,hit:true,surface:'player',shotAtMs:1000}]};
  const origin=new THREE.Vector3(7,5,11),direction=new THREE.Vector3(0,0,2);
  const resolveMuzzle=(id,expectedFamily,target)=>id==='t1'&&expectedFamily===family?target.copy(origin):null;
  const resolveMuzzleDirection=(id,expectedFamily,target)=>id==='t1'&&expectedFamily===family?target.copy(direction):null;
  const args={frame,previousFrame:null,time:10,W,frameIndex:2,sub:0,resolveMuzzle,resolveMuzzleDirection};
  return{group,beamGeometry,fx,frame,origin,args,flash:group.children[0],core:group.children[20],flashBeam:group.children[40],tracer:group.children[60],ring:group.children[132],dispose(){fx.dispose();beamGeometry.dispose();}};
}
function endpoints(beam){const axis=new THREE.Vector3(1,0,0).applyQuaternion(beam.quaternion).multiplyScalar(beam.scale.x/2);return[beam.position.clone().sub(axis),beam.position.clone().add(axis)];}

for(const family of Object.keys(C5A_WEAPON_FX))check(`${family} 閃光與短beam使用真槍口位置及方向`,()=>{
  const f=fixture('major-v1',family);try{
    const evidence=f.fx.update(f.args),profile=C5A_WEAPON_FX[family];
    vector(f.flash.position,new THREE.Vector3(7,5,11.12));vector(f.core.position,new THREE.Vector3(7,5,11+profile.reach*.22));
    const [from,to]=endpoints(f.flashBeam);vector(from,f.origin);vector(to,new THREE.Vector3(7,5,11+profile.reach));
    assert.equal(evidence.muzzleSockets,1);assert.equal(evidence.muzzleDirections,1);assert.equal(evidence.tracerSockets,1);
  }finally{f.dispose();}
});
check('長tracer從槍口連至authoritative終點，高度使用同源地形',()=>{
  const f=fixture();try{f.fx.update(f.args);const[from,to]=endpoints(f.tracer);vector(from,f.origin);vector(to,new THREE.Vector3(W.vx(78),fpsMajorElevation('mirage',{x:78,y:25})+1.02,W.vz(25)));near(f.ring.position.y,to.y+.14);}finally{f.dispose();}
});
check('null socket回退使用authoritative actor高度，仍保留原平面槍向',()=>{
  const f=fixture();try{const e=f.fx.update({...f.args,resolveMuzzle:()=>null});assert.equal(e.muzzleFallbacks,1);assert.equal(e.muzzleSockets,0);vector(f.flash.position,new THREE.Vector3(W.vx(11.02)+.12,3.58,W.vz(10)));near(endpoints(f.tracer)[0].y,3.42);}finally{f.dispose();}
});
check('非finite socket不污染場景，回退不沿用前一事件',()=>{
  const f=fixture();try{f.fx.update(f.args);const e=f.fx.update({...f.args,resolveMuzzle:(_id,_family,target)=>target.set(NaN,0,0)});assert.equal(e.muzzleSockets,0);assert.equal(e.tracerSockets,0);assert.equal(e.muzzleFallbacks,1);near(f.flash.position.y,3.58);}finally{f.dispose();}
});
check('缺actor elevation時回退讀同源terrain，不假造額外frame欄位',()=>{
  const f=fixture();try{delete f.frame.players[0].elevation;f.frame.muzzles[0].pos={x:78,y:25};f.fx.update({...f.args,resolveMuzzle:()=>null});near(f.flash.position.y,fpsMajorElevation('mirage',{x:78,y:25})+1.18);}finally{f.dispose();}
});
check('zero direction回退va而不把flash放在零向量',()=>{
  const f=fixture();try{const e=f.fx.update({...f.args,resolveMuzzleDirection:(_id,_family,target)=>target.set(0,0,0)});assert.equal(e.muzzleSockets,1);assert.equal(e.muzzleDirections,0);vector(f.flash.position,new THREE.Vector3(7.12,5,11));}finally{f.dispose();}
});
check('legacy保持既有位置／固定高度，完全不讀major resolver',()=>{
  const f=fixture('legacy');try{const forbidden=()=>{throw new Error('legacy invoked socket');};const e=f.fx.update({...f.args,resolveMuzzle:forbidden,resolveMuzzleDirection:forbidden});vector(f.flash.position,new THREE.Vector3(W.vx(11.02)+.12,1.18,W.vz(10)));const[from,to]=endpoints(f.tracer);near(from.y,1.02);near(to.y,1.02);assert.equal(f.ring.position.y,1.16);assert.equal(e.muzzleSockets,0);assert.equal(e.muzzleFallbacks,0);}finally{f.dispose();}
});
check('未指定sceneVersion的呼叫預設仍為legacy',()=>{
  const f=fixture('default');try{const e=f.fx.update({...f.args,resolveMuzzle:()=>{throw new Error('default invoked socket');}});assert.equal(e.muzzleSockets,0);near(f.flash.position.y,1.18);}finally{f.dispose();}
});
check('短脈衝過期後清除FX，不再讀socket或增加光源',()=>{
  const f=fixture();try{f.fx.update(f.args);const e=f.fx.update({...f.args,sub:.5,resolveMuzzle:()=>{throw new Error('expired invoked socket');}});assert.equal(e.gunfire,0);assert.equal(e.tracerSockets,0);assert.ok(f.group.children.every(node=>!node.visible));assert.ok(f.group.children.every(node=>!node.isLight));}finally{f.dispose();}
});
check('重播seek後FX重新解析現姿態，不快取未來的槍口',()=>{
  const f=fixture();try{f.fx.update(f.args);f.origin.set(-4,8,-12);const e=f.fx.update({...f.args,frameIndex:0});vector(f.flash.position,new THREE.Vector3(-4,8,-11.88));assert.equal(e.frameIndex,0);assert.equal(e.muzzleSockets,1);}finally{f.dispose();}
});
check('大量event仍只有既有244個池物件，共用beam geometry',()=>{
  const f=fixture();try{const frame={...f.frame,muzzles:Array.from({length:100},(_,i)=>({...f.frame.muzzles[0],id:`m${i}`})),tracers:Array.from({length:100},(_,i)=>({...f.frame.tracers[0],id:`t${i}`}))};f.fx.update({...f.args,frame});assert.equal(f.group.children.length,244);assert.equal(f.group.children.filter(node=>node.isMesh&&node.geometry===f.beamGeometry).length,68);assert.ok(f.group.children.every(node=>[node.position.x,node.position.y,node.position.z].every(Number.isFinite)));}finally{f.dispose();}
});
check('FX不改frame／previousFrame／事件終點或權威座標',()=>{
  const f=fixture();try{const previousFrame={...f.frame,players:[{...f.frame.players[0],hp:100}]};const before=JSON.stringify([f.frame,previousFrame]);f.fx.update({...f.args,previousFrame});assert.equal(JSON.stringify([f.frame,previousFrame]),before);}finally{f.dispose();}
});
check('dispose清除池但不釋放外部共用beam geometry',()=>{
  const f=fixture();let beamDisposed=0;f.beamGeometry.addEventListener('dispose',()=>beamDisposed++);f.fx.dispose();assert.equal(f.group.children.length,0);assert.equal(beamDisposed,0);f.beamGeometry.dispose();
});
check('產品明確接通major sceneVersion及手骨position／direction resolver',()=>{
  const renderer=fs.readFileSync(new URL('../src/battle/fps/EsportsFPS3D.jsx',import.meta.url),'utf8');
  assert.match(renderer,/createGunplayPresentation\(\{group:fxGroup,scene,tex,beamGeometry:st\.beamGeo,mapKey,sceneVersion\}\)/);
  assert.match(renderer,/resolveMuzzle:st\.resolveWeaponMuzzle,resolveMuzzleDirection:st\.resolveWeaponMuzzleDirection/);
  assert.ok(renderer.indexOf('P.rigged?.setFacingDegrees?.(va)')<renderer.indexOf('st.c5aFxEvidence=st.c5aGunplayFx.update'));
});
console.log(`CS Major Gunplay Sockets: ${passed}/${passed+failed} PASS`);if(failed)process.exitCode=1;
