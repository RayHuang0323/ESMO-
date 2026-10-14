import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { readFpsRigTestAssets } from './lib/fpsRigTestAssets.mjs';
import { createFpsPovShotClock, cloneFpsPovWeaponVariant, createMajorFpsPovWeapon, createFpsPovGloveGeometry } from '../src/battle/fps/presentation/fpsPovWeapon.js';
import { FPS_MAJOR_WEAPON_TRIANGLE_BUDGET } from '../src/battle/fps/presentation/fpsMajorWeaponAssets.js';
const assets = await readFpsRigTestAssets(); let passed = 0, failed = 0;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-5, `${a} != ${b}`);
function check(name, fn) { try { fn(); passed++; console.log(`PASS ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}: ${e.stack || e.message}`); } }
function fixture(fn) { const f = assets.make({importedWeapons:true}); try { fn(f); } finally { f.dispose(); } }
const snapshot = source => { const rows = []; source.traverse(o => rows.push([o.uuid, o.position.toArray(), o.quaternion.toArray(), o.scale.toArray(), o.visible, o.geometry?.uuid, o.material?.uuid])); return JSON.stringify(rows); };
const sim = {}, event = { eventId: 'real-1', shotAtMs: 1050 }, defaults = { sim, seekNonce: 0, round: 1, frameIndex: 10, actorId: 'ct1', active: true, playing: true, dt: .05 };
function shotClock() { const c = createFpsPovShotClock(); c.update(defaults); return c; }
try {
  for (const [family, length] of Object.entries({ pistol: .23, smg: .25, rifle: .52, sniper: .74, shotgun: .55 })) {
    check(`${family} 真模型與素材共用、來源不變`, () => fixture(f => {
      const source = f.c.c2c.weaponGroups[family], before = snapshot(source), variant = cloneFpsPovWeaponVariant(source, family);
      assert.ok(variant && variant.meshes > 0 && variant.meshes + 5 <= 12);
      const originals = new Map(); source.traverse(o => { if (o.isMesh) originals.set(o.name, o); });
      variant.group.traverse(o => { if (!o.isMesh) return; const original = originals.get(o.name); assert.equal(o.geometry, original.geometry); assert.equal(o.material, original.material); assert.equal(o.castShadow, false); });
      assert.equal(snapshot(source), before); assert.notEqual(variant.group, source);
    }));
    check(`${family} 真 grip 與 muzzle 座標、尺寸及 forward`, () => fixture(f => {
      const v = cloneFpsPovWeaponVariant(f.c.c2c.weaponGroups[family], family);
      const grip = v.group.getObjectByName(`ESMO_${family}_GripSocket`), muzzle = v.muzzle;
      const p = grip.position.clone().applyMatrix4(v.group.matrix), m = muzzle.position.clone().applyMatrix4(v.group.matrix);
      near(p.distanceTo(new THREE.Vector3(.22, -.30, -.67)), 0); near(p.z - m.z, length);
      const direction = new THREE.Vector3(1, 0, 0).transformDirection(v.group.matrix); near(direction.z, -1);
      if(family==='pistol') {
        const source=f.c.c2c.weaponGroups.pistol;source.updateWorldMatrix(true,true);
        const inverse=source.matrixWorld.clone().invert(),points=[],cuts=[];
        const actualGrip=source.getObjectByName('ESMO_pistol_GripSocket').position;
        source.traverse(mesh=>{
          if(!mesh.isMesh||!mesh.userData.esmoMajorImportedWeapon)return;
          const attr=mesh.geometry.attributes.position,index=mesh.geometry.index;
          const vertices=Array.from({length:attr.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(attr,i).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse));
          points.push(...vertices);
          for(let i=0;i<(index?.count??attr.count);i+=3){
            const triangle=[0,1,2].map(j=>vertices[index?index.getX(i+j):i+j]);
            for(let edge=0;edge<3;edge++){
              const a=triangle[edge],b=triangle[(edge+1)%3];
              if((a.y-actualGrip.y)*(b.y-actualGrip.y)>0||Math.abs(b.y-a.y)<1e-8)continue;
              cuts.push(a.clone().lerp(b,(actualGrip.y-a.y)/(b.y-a.y)));
            }
          }
        });
        const front=Math.max(...points.map(point=>point.x)),tip=points.filter(point=>front-point.x<.0001);
        const center=tip.reduce((sum,point)=>sum.add(point),new THREE.Vector3()).divideScalar(tip.length);
        assert.ok(tip.length>=8&&center.distanceTo(source.getObjectByName('ESMO_pistol_MuzzleSocket').position)<.005,'槍口須對齊真正管口，而非錯位模型的虛擬socket');
        assert.ok(Math.max(...tip.map(point=>point.y))-Math.min(...tip.map(point=>point.y))<.04,'管口截面須小於4cm，不能是旋歪的滑套');
        assert.ok(cuts.length>8,'握點高度必須穿過真握把');
        const left=Math.min(...cuts.map(point=>point.x)),right=Math.max(...cuts.map(point=>point.x));
        assert.ok(Math.abs(actualGrip.x-(left+right)*.5)<.02&&actualGrip.x>left&&actualGrip.x<right,'握點必須落在真握把截面中線附近');
      }
    }));
  }
  check('五族 geometry 形狀不是同一模型縮放', () => fixture(f => {
    const shapes = Object.values(f.c.c2c.weaponGroups).map(g => { const n = []; g.traverse(o => { if (o.isMesh) n.push([o.name, o.geometry.attributes.position.count, o.geometry.index?.count]); }); return JSON.stringify(n); });
    assert.equal(new Set(shapes).size, 5);
  }));
  check('狙擊槍真幾何前端為管口且後槍托不再朝前',()=>fixture(f=>{
    const source=f.c.c2c.weaponGroups.sniper;source.updateWorldMatrix(true,true);
    const inverse=source.matrixWorld.clone().invert(),points=[],wood=[];
    let declaredForward=false;
    source.traverse(object=>{
      declaredForward ||= object.userData.esmoSourceForwardAxis==='+Y';
      if(!object.isMesh||!object.userData.esmoMajorImportedWeapon)return;
      const position=object.geometry.attributes.position,colour=object.material.color;
      for(let i=0;i<position.count;i++){
        const point=new THREE.Vector3().fromBufferAttribute(position,i).applyMatrix4(object.matrixWorld).applyMatrix4(inverse);points.push(point);
        if(colour.r>colour.g*1.5)wood.push(point);
      }
    });
    assert.ok(declaredForward,'必須保存實際來源+Y軸校正證據');assert.ok(points.length>1000);
    const maxX=Math.max(...points.map(point=>point.x)),tip=points.filter(point=>maxX-point.x<.012);
    const centre=tip.reduce((sum,point)=>sum.add(point),new THREE.Vector3()).divideScalar(tip.length);
    const muzzle=source.getObjectByName('ESMO_sniper_MuzzleSocket').position;
    const support=source.getObjectByName('ESMO_sniper_SupportGripSocket').position,grip=source.getObjectByName('ESMO_sniper_GripSocket').position;
    assert.ok(centre.distanceTo(muzzle)<.025,'管口socket必須對齊作者最前端真幾何，不能只驗自訂socket');
    assert.ok(muzzle.x>support.x&&support.x>grip.x);assert.ok(wood.some(point=>point.x<grip.x-.3),'真木槍托必須在握點後方');
    assert.ok(Math.max(...tip.map(point=>point.y))-Math.min(...tip.map(point=>point.y))<.1,'最前端是細管口，不是大面槍托');
  }));
  check('五族真support socket隨共用來源transform且位於槍身範圍', () => fixture(f => {
    const supports=[];
    for(const [family,source] of Object.entries(f.c.c2c.weaponGroups)) {
      const v=cloneFpsPovWeaponVariant(source,family); assert.ok(v.support);
      const expected=source.getObjectByName(`ESMO_${family}_SupportGripSocket`).position.clone().applyMatrix4(v.group.matrix);
      const actual=v.support.position.clone().applyMatrix4(v.group.matrix); near(actual.distanceTo(expected),0);
      const grip=v.group.getObjectByName(`ESMO_${family}_GripSocket`).position.clone().applyMatrix4(v.group.matrix);
      const muzzle=v.muzzle.position.clone().applyMatrix4(v.group.matrix);
      assert.ok(actual.z<=grip.z+.08&&actual.z>muzzle.z); supports.push(actual.toArray().join(','));
      assert.equal(source.userData.esmoAuthoredWeapon.version,1); assert.ok(source.userData.esmoAuthoredWeapon.profileParts>=2);
      assert.ok(v.triangles<=FPS_MAJOR_WEAPON_TRIANGLE_BUDGET[family],`${family} ${v.triangles} tri`);
      assert.equal(source.userData.esmoAuthoredWeapon.imported,true);
    } assert.equal(new Set(supports).size,5);
  }));
  check('合批手套幾何有弧面與私有有限bounds、受三角形預算約束', () => {
    const right=createFpsPovGloveGeometry(),left=createFpsPovGloveGeometry(true);
    try { for(const g of[right,left]) {
      assert.ok(g.attributes.position.count/3>100&&g.attributes.position.count/3<=1500);
      assert.ok([...g.attributes.position.array].every(Number.isFinite));
      const size=g.boundingBox.getSize(new THREE.Vector3()); assert.ok(size.x>.11&&size.x<.17&&size.y<.12&&size.z>.13&&size.z<.20);
    } assert.notEqual(right,left); assert.notEqual(right.attributes.position.array,left.attributes.position.array);
    } finally {right.dispose();left.dispose();}
  });
  check('POV支撐手按來源socket切換，不再共用所有長槍固定位置', () => fixture(f => {
    const pov=createMajorFpsPovWeapon(new THREE.PerspectiveCamera()),positions=[];
    try {for(const family of['pistol','smg','rifle','sniper','shotgun']) {
      pov.update({frame:{rnd:1,ts:120,roundSec:0,muzzles:[]},chase:{...f.player,alive:true},weaponGroups:f.c.c2c.weaponGroups,pov:true,
        live:{sim,fIdx:0,seekNonce:0,playing:false},family,dt:0});
      const d=pov.diagnostics; assert.equal(d.authoredGloves,true); assert.ok(d.supportLocal?.every(Number.isFinite));
      const distance=new THREE.Vector3(...d.supportLocal).distanceTo(new THREE.Vector3(...d.supportHandLocal)); assert.ok(distance<.05);
      positions.push(d.supportHandLocal.join(','));
    } assert.equal(new Set(positions).size,5);}finally{pov.dispose();}
  }));
  check('獨立硬質材質與反射來源共用且末一釋放，POV不修改衣服材質',()=>{
    const a=assets.make(),b=assets.make();let released=0;
    const metal=a.c.c2c.materials.weaponSteel,plastic=a.c.c2c.materials.weaponPolymer,texture=metal.envMap;
    texture.addEventListener('dispose',()=>released++);
    try{assert.notEqual(metal,a.c.c2c.materials.metal);assert.notEqual(plastic,a.c.c2c.materials.polymer);
      assert.ok(metal.metalness>.8&&plastic.metalness<.1&&plastic.roughness>metal.roughness);
      assert.equal(texture,b.c.c2c.materials.weaponSteel.envMap);assert.equal(texture.image.width,128);assert.equal(texture.image.height,64);
      a.dispose();assert.equal(released,0);b.dispose();assert.equal(released,1);
    }finally{if(!a.c.disposed)a.dispose();if(!b.c.disposed)b.dispose();}
  });
  check('真來源手部有解剖輪廓、有限成本並只釋放POV私有clone',()=>fixture(f=>{
    const camera=new THREE.PerspectiveCamera(),pov=createMajorFpsPovWeapon(camera),hands=f.c.c2c.povHandGeometries;let sourceDisposals=0;
    for(const geometry of Object.values(hands))geometry.addEventListener('dispose',()=>sourceDisposals++);
    try{
      pov.update({frame:{rnd:1,ts:120,roundSec:0,muzzles:[]},chase:{...f.player,alive:true},pov:true,live:{sim,fIdx:0,seekNonce:0,playing:false},family:'pistol',dt:0,weaponGroups:f.c.c2c.weaponGroups,handGeometries:hands});
      assert.equal(pov.diagnostics.anatomicalHands,true);
      for(const[name,source]of[['ESMO_POV_GripHand',hands.right],['ESMO_POV_SupportHand',hands.left]]){
        const geometry=pov.group.getObjectByName(name).geometry;assert.notEqual(geometry,source);assert.equal(geometry.attributes.position.count,source.attributes.position.count);
        const triangles=(geometry.index?.count??geometry.attributes.position.count)/3;
        assert.ok(triangles<=1800&&triangles>1500);
        geometry.computeBoundingBox();const size=geometry.boundingBox.getSize(new THREE.Vector3());assert.ok(size.x>.07&&size.x<.15&&size.y>.04&&size.y<.13&&size.z>.12&&size.z<.25);assert.ok([...geometry.attributes.position.array].every(Number.isFinite));
        assert.equal(geometry.attributes.color.count,geometry.attributes.position.count);
        assert.ok([...geometry.attributes.normal.array].every(Number.isFinite));
        if(geometry.index)assert.ok([...geometry.index.array].every(index=>index<geometry.attributes.position.count));
      }
      const hand=pov.group.getObjectByName('ESMO_POV_GripHand');
      const supportHand=pov.group.getObjectByName('ESMO_POV_SupportHand');
      assert.ok(new THREE.Vector3(0,1,0).applyQuaternion(hand.quaternion).x<-.65,'右主掌向槍內側');
      assert.ok(new THREE.Vector3(0,1,0).applyQuaternion(supportHand.quaternion).x>.5,'左支援掌向反側包握');
      assert.ok(hand.position.distanceTo(new THREE.Vector3(.22,-.30,-.67))<.05,'主手仍貼近真握點');
      pov.group.updateMatrixWorld(true);
      const sleeves=pov.group.children.filter(mesh=>mesh.isMesh&&mesh.material?.name==='ESMO_POV_WovenSleeve');
      const ends=sleeves.map(mesh=>mesh.localToWorld(new THREE.Vector3(0,.21,0)));
      for(const name of ['ESMO_POV_GripHand','ESMO_POV_SupportHand']){
        const wrist=pov.group.getObjectByName(name).localToWorld(new THREE.Vector3(0,0,.060));
        assert.ok(ends.some(end=>end.distanceTo(wrist)<1e-6),'袖口接到真腕點');
        const sleeve=sleeves.find(mesh=>mesh.localToWorld(new THREE.Vector3(0,.21,0)).distanceTo(wrist)<1e-6);
        const wristBack=new THREE.Vector3(0,0,1).applyQuaternion(pov.group.getObjectByName(name).quaternion);
        const forearmBack=new THREE.Vector3(0,-1,0).applyQuaternion(sleeve.quaternion);
        assert.ok(wristBack.dot(forearmBack)>.95,'來源+Z腕軸須接續向肘前臂，不能只用Euler正負驗握持');
        const axis=new THREE.Vector3(0,1,0).applyQuaternion(sleeve.quaternion);
        const palm=new THREE.Vector3(0,1,0).applyQuaternion(pov.group.getObjectByName(name).quaternion);
        palm.addScaledVector(axis,-palm.dot(axis)).normalize();
        const panel=new THREE.Vector3(Math.cos(-.6),0,Math.sin(-.6)).applyQuaternion(sleeve.quaternion);
        assert.ok(panel.dot(palm)>1-1e-6,'內前臂拼片隨真手掌面，不能只有腕端點而缺roll');
      }
      pov.dispose();pov.dispose();assert.equal(sourceDisposals,0);
    }finally{pov.dispose();}
  }));
  check('缺真 socket 誠實不建立替代武器', () => { assert.equal(cloneFpsPovWeaponVariant(new THREE.Group(), 'rifle'), null); assert.equal(cloneFpsPovWeaponVariant(new THREE.Group(), 'unknown'), null); });
  check('首次進入現有射擊幀不補歷史', () => { const c = createFpsPovShotClock(), r = c.update({ ...defaults, event }); assert.equal(r.fireCount, 0); assert.equal(r.recoil, 0); assert.equal(r.activeShot, false); });
  check('真新event只觸發一次並保留shotAtMs', () => { const c = shotClock(), a = c.update({ ...defaults, event }); assert.equal(a.fireCount, 1); assert.equal(a.lastAuthoritativeFire.shotAtMs, 1050); assert.equal(a.recoil, 1); const b = c.update({ ...defaults, event }); assert.equal(b.fireCount, 1); near(b.age, .05); });
  check('暫停凍結clock、flash及recoil，resume才衰退', () => { const c = shotClock(), a = c.update({ ...defaults, event }); for (let i = 0; i < 20; i++) assert.deepEqual(c.update({ ...defaults, event, playing: false }), a); const b = c.update({ ...defaults, event }); near(b.age, .05); assert.ok(b.recoil < 1); });
  check('暫停看到新event不派送，resume不補歷史', () => { const c = shotClock(); c.update({ ...defaults, event, playing: false }); assert.equal(c.update({ ...defaults, event }).fireCount, 0); });
  check('seek／倒帶／換人／回合／sim切換清除舊kick', () => {
    for (const change of [{ seekNonce: 1 }, { frameIndex: 9 }, { actorId: 't1' }, { round: 2 }, { sim: {} }]) { const c = shotClock(); c.update({ ...defaults, event }); const r = c.update({ ...defaults, event: { ...event, eventId: 'new' }, ...change }); assert.equal(r.recoil, 0); assert.equal(r.activeShot, false); assert.equal(r.fireCount, 1); }
  });
  check('離開POV／死亡清flash、重新進入不補現有幀', () => { const c = shotClock(); c.update({ ...defaults, event }); assert.equal(c.update({ ...defaults, event, active: false }).activeShot, false); assert.equal(c.update({ ...defaults, event }).recoil, 0); });
  check('落後實際shot超過flash壽命不重放完整kick', () => { const c = shotClock(), r = c.update({ ...defaults, event, eventAgeSec: .3 }); assert.equal(r.recoil, 0); assert.equal(r.activeShot, false); assert.equal(r.fireCount, 1); });
  check('高倍dt、非有限dt有界，不改權威事件', () => { const c = shotClock(), before = JSON.stringify(event); c.update({ ...defaults, event }); const a = c.update({ ...defaults, dt: 99, event }); near(a.age, .25); const b = c.update({ ...defaults, dt: NaN, event }); near(b.age, .25); assert.equal(JSON.stringify(event), before); });
  check('真保存shot抬槍且向眼側kick、pause不衰退或改事件',()=>fixture(f=>{
    const pov=createMajorFpsPovWeapon(new THREE.PerspectiveCamera()),frame={rnd:1,ts:121,roundSec:1,muzzles:[]},chase={...f.player,alive:true};
    const input={frame,chase,pov:true,live:{sim,fIdx:10,seekNonce:0,playing:true},family:'rifle',dt:.05,weaponGroups:f.c.c2c.weaponGroups,handGeometries:f.c.c2c.povHandGeometries};
    try{
      pov.update(input);pov.group.updateMatrixWorld(true);
      const muzzle=pov.group.getObjectByName('ESMO_rifle_MuzzleSocket'),before=muzzle.getWorldPosition(new THREE.Vector3());
      const shot={eventId:'saved-physical-shot',attackerId:chase.id,shotAtMs:1100};frame.ts=121.1;frame.roundSec=1.1;frame.muzzles.push(shot);const authority=JSON.stringify(frame);
      pov.update(input);pov.group.updateMatrixWorld(true);const kicked=muzzle.getWorldPosition(new THREE.Vector3());
      assert.ok(kicked.y>before.y,'真shot必須抬槍');assert.ok(kicked.z>before.z,'真shot向眼側kick');assert.equal(pov.diagnostics.fireCount,1);
      input.live.playing=false;input.dt=.25;pov.update(input);pov.group.updateMatrixWorld(true);near(muzzle.getWorldPosition(new THREE.Vector3()).distanceTo(kicked),0);
      assert.equal(JSON.stringify(frame),authority);
    }finally{pov.dispose();}
  }));
  check('產品五族切換flash貼真muzzle，不新增light／texture', () => fixture(f => {
    const camera = new THREE.PerspectiveCamera(), pov = createMajorFpsPovWeapon(camera), live = { sim, seekNonce: 0, fIdx: 10, playing: true, speed: 1 };
    try { for (const family of ['pistol', 'smg', 'rifle', 'sniper', 'shotgun']) {
      pov.update({ frame: { rnd: 1, ts: 121, roundSec: 1, muzzles: [] }, chase: { ...f.player, alive: true }, weaponGroups: f.c.c2c.weaponGroups, pov: true, live, family, dt: .05 });
      assert.equal(pov.diagnostics.family, family); assert.equal(pov.diagnostics.visible, true); assert.ok(pov.diagnostics.weaponParts + pov.diagnostics.ownedParts <= 12); assert.ok(pov.diagnostics.muzzleLocal[2] < -.67);
      camera.traverse(o => { assert.ok(!o.isLight); if (o.isMesh) assert.ok(!o.material.map); });
    }} finally { pov.dispose(); }
  }));
  check('原生幀內shotAtMs尚未到不提前顯示fire', () => fixture(f => {
    const pov = createMajorFpsPovWeapon(new THREE.PerspectiveCamera()), live = { sim, seekNonce: 0, fIdx: 10, playing: true, speed: 1 }, chase = { ...f.player, alive: true, rigged: f.c };
    try { pov.update({ frame: { rnd: 1, ts: 121, roundSec: 1, muzzles: [] }, chase, weaponGroups: f.c.c2c.weaponGroups, pov: true, live, family: 'rifle', dt: .05 });
      const frame = { rnd: 1, ts: 121, roundSec: 1, muzzles: [{ ...event, attackerId: 'ct1', shotAtMs: 1150 }] };
      pov.update({ frame, chase, weaponGroups: f.c.c2c.weaponGroups, pov: true, live, family: 'rifle', dt: .05, frameAgeSec: .1 }); assert.equal(pov.fireCount, 0);
      pov.update({ frame, chase, weaponGroups: f.c.c2c.weaponGroups, pov: true, live, family: 'rifle', dt: .05, frameAgeSec: .15 }); assert.equal(pov.fireCount, 1); assert.equal(pov.flash.visible, true);
    } finally { pov.dispose(); }
  }));
  check('null actor離開POV不例外、清fire與bridge',()=>{
    const pov=createMajorFpsPovWeapon(new THREE.PerspectiveCamera());try{
      assert.doesNotThrow(()=>pov.update({frame:{rnd:1,ts:120,roundSec:0,muzzles:[]},chase:null,pov:false,live:{sim,fIdx:0,seekNonce:0,playing:false},family:'rifle',dt:0}));
      assert.equal(pov.group.visible,false);assert.equal(pov.flash.visible,false);assert.equal(pov.group.getObjectByName('ESMO_POV_ThrowUpperSleeve').visible,false);
    }finally{pov.dispose();}
  });
  check('throw upper sleeve只在真投擲semantic活動時出現並在expiry與離開POV清除',()=>fixture(f=>{
    const pov=createMajorFpsPovWeapon(new THREE.PerspectiveCamera()),chase={...f.player,alive:true},e={type:'utility-throw',round:2,roundSec:20,playerId:chase.id,utility:'he'};
    const update=(sec,active=true)=>pov.update({frame:{rnd:1,ts:120+sec,roundSec:sec,muzzles:[],events:sec>=20?[e]:[]},nextFrame:{rnd:1,events:sec<20?[e]:[]},chase:{...chase,...(sec>=20?{lastUtilityAtSec:20,lastUtilityType:'he'}:{})},pov:active,live:{sim,fIdx:40,seekNonce:0,playing:false},family:'rifle',dt:0,weaponGroups:f.c.c2c.weaponGroups,handGeometries:f.c.c2c.povHandGeometries});
    try{const bridge=pov.group.getObjectByName('ESMO_POV_ThrowUpperSleeve');assert(bridge?.isMesh);assert.equal(bridge.visible,false);
      for(const sec of[19.9,20.04,20.3]){update(sec);assert.equal(bridge.visible,true);assert.equal(pov.diagnostics.action.kind,'utility');assert([...bridge.matrix.elements].every(Number.isFinite));}
      update(20.6);assert.equal(bridge.visible,false);update(19.9);assert.equal(bridge.visible,true);update(19.9,false);assert.equal(bridge.visible,false);
    }finally{pov.dispose();}
  }));
  check('真draw release recover上臂橋接兩端與前臂袖口接真腕點',()=>fixture(f=>{
    const pov=createMajorFpsPovWeapon(new THREE.PerspectiveCamera()),chase={...f.player,alive:true},e={type:'utility-throw',round:2,roundSec:20,playerId:chase.id,utility:'he'};
    try{for(const sec of[19.9,20.04,20.3]){
      pov.update({frame:{rnd:1,ts:120+sec,roundSec:sec,muzzles:[],events:sec>=20?[e]:[]},nextFrame:{rnd:1,events:sec<20?[e]:[]},chase:{...chase,...(sec>=20?{lastUtilityAtSec:20,lastUtilityType:'he'}:{})},pov:true,live:{sim,fIdx:40,seekNonce:0,playing:false},family:'rifle',dt:0,weaponGroups:f.c.c2c.weaponGroups,handGeometries:f.c.c2c.povHandGeometries});
      pov.group.updateMatrixWorld(true);const bridge=pov.group.getObjectByName('ESMO_POV_ThrowUpperSleeve'),wrist=pov.group.getObjectByName('ESMO_POV_GripHand').localToWorld(new THREE.Vector3(0,0,.060));
      const cuffs=pov.group.children.filter(o=>o.isMesh&&o!==bridge&&o.material?.name==='ESMO_POV_WovenSleeve'),forearm=cuffs.find(o=>o.localToWorld(new THREE.Vector3(0,.21,0)).distanceTo(wrist)<1e-6);assert(forearm,'前臂袖口必須接真右腕');
      near(bridge.localToWorld(new THREE.Vector3(0,-.21,0)).distanceTo(pov.group.localToWorld(new THREE.Vector3(.40,-.66,-.32))),0);
      near(bridge.localToWorld(new THREE.Vector3(0,.21,0)).distanceTo(forearm.localToWorld(new THREE.Vector3(0,-.21,0))),0);
      assert(bridge.scale.y>0&&Number.isFinite(bridge.scale.y));
    }}finally{pov.dispose();}
  }));
  check('四種真投擲模型反覆切換scene slot恆四part且每型完整私有tree維持5200tri',()=>fixture(f=>{
    const pov=createMajorFpsPovWeapon(new THREE.PerspectiveCamera()),actor={...f.player,alive:true};
    try{for(let cycle=0;cycle<3;cycle++)for(const utility of ['he','flash','smoke','molly']){
      const e={type:'utility-throw',round:2,roundSec:20,playerId:actor.id,utility};
      pov.update({frame:{rnd:1,ts:139.9,roundSec:19.9,muzzles:[],events:[]},nextFrame:{rnd:1,events:[e]},chase:actor,pov:true,live:{sim,fIdx:40,seekNonce:cycle,playing:false},family:'rifle',dt:0,weaponGroups:f.c.c2c.weaponGroups,handGeometries:f.c.c2c.povHandGeometries});
      const slot=pov.group.getObjectByName('ESMO_original_utility_model');assert(slot?.visible);assert.equal(slot.userData.utilityType,utility);assert.equal(slot.children.length,4,'cached其他type不得累積到scene slot');assert(slot.children.every(child=>child.isMesh&&child.visible));
      let triangles=0;pov.group.traverse(mesh=>{if(mesh.isMesh&&!mesh.userData.esmoPovBorrowed)triangles+=(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3;});
      assert.ok(triangles<=5200,`${utility} cycle=${cycle} actual private scene tree=${triangles}tri，嚴格沿原5200門檻`);
      assert.equal(pov.diagnostics.ownedParts,6,'兩手兩前臂flash與upperbridge六原生part不能仍報五');
      console.log(`DIAG private POV scene tree ${utility} cycle=${cycle}: ${triangles}tri; slotParts=${slot.children.length}`);
    }}finally{pov.dispose();}
  }));
  check('POV dispose只釋放私有資源，不釋放人物共享資產', () => fixture(f => {
    const camera = new THREE.PerspectiveCamera(), pov = createMajorFpsPovWeapon(camera); let sharedDisposals = 0, ownDisposals = 0;
    const geometries = new Set(), materials = new Set();
    f.c.c2c.weaponGroups.rifle.traverse(o => { if (o.isMesh) { geometries.add(o.geometry); materials.add(o.material); } });
    for (const resource of [...geometries, ...materials]) resource.addEventListener('dispose', () => sharedDisposals++);
    pov.group.traverse(o => { if (o.isMesh) { o.geometry.addEventListener('dispose', () => ownDisposals++); o.material.addEventListener('dispose', () => ownDisposals++); } });
    pov.update({ frame: { rnd: 1, ts: 120, roundSec: 0, muzzles: [] }, chase: { ...f.player, alive: true }, weaponGroups: f.c.c2c.weaponGroups, pov: true, live: { sim, fIdx: 0, seekNonce: 0, playing: false }, family: 'rifle', dt: .05 });
    pov.dispose(); const n = ownDisposals; pov.dispose(); assert.equal(sharedDisposals, 0); assert.ok(n > 0); assert.equal(ownDisposals, n); assert.equal(camera.children.length, 0);
  }));
  check('major採新模型／私有清理，legacy保留原12部分與牆鐘', () => {
    const s = fs.readFileSync(new URL('../src/battle/fps/EsportsFPS3D.jsx', import.meta.url), 'utf8');
    assert.match(s, /sceneVersion==="legacy"\?createFpsPovWeapon\(camera\):createMajorFpsPovWeapon\(camera\)/); assert.match(s, /if\(st\?\.povWeapon\?\.major\)st\.povWeapon\.dispose\(\)/); assert.ok(s.includes('weapon.fireAt=st.time')); assert.ok(s.includes('weaponParts:12'));
    assert.ok(s.includes('st.players.find(player=>player.id===ch.id)')); assert.ok(s.includes('weaponGroups:actor?.rigged?.c2c?.weaponGroups'));
    assert.ok(s.includes('if(sceneVersion!=="legacy")scene.add(camera)'));
  });
  check('POV換彈只讀權威時刻、pause及前後seek還原姿態',()=>fixture(f=>{
    const pov=createMajorFpsPovWeapon(new THREE.PerspectiveCamera()),player={...f.player,alive:true,weaponHandlingVersion:1,reloading:true,reloadStartedAtMs:0,reloadEndsAtMs:2200,handlingAtMs:650};
    const update=(sec,nonce=0)=>pov.update({frame:{rnd:1,ts:sec,roundSec:sec,muzzles:[]},chase:player,pov:true,live:{sim,fIdx:10,seekNonce:nonce,playing:false},family:'rifle',dt:.1,weaponGroups:f.c.c2c.weaponGroups,handGeometries:f.c.c2c.povHandGeometries});
    const pose=()=>JSON.stringify([pov.group.position.toArray(),pov.group.quaternion.toArray(),pov.diagnostics.supportHandLocal,pov.diagnostics.reloadProgress,pov.diagnostics.magazineOffset]);
    try{const before=JSON.stringify(player),sourceBefore=snapshot(f.c.c2c.weaponGroups.rifle);update(0);const grip=pov.diagnostics.supportHandLocal.slice();assert.deepEqual(pov.diagnostics.magazineOffset,[0,0,0]);update(.65);const frozen=pose();assert.equal(pov.diagnostics.reloading,true);near(pov.diagnostics.reloadProgress,650/2200);assert.equal(pov.flash.visible,false);assert.notDeepEqual(pov.diagnostics.supportHandLocal,grip);assert.ok(pov.diagnostics.magazineOffset[1]<0);
      for(let i=0;i<20;i++)update(.65);assert.equal(pose(),frozen);update(1.3,1);assert.notEqual(pose(),frozen);near(pov.diagnostics.reloadProgress,1300/2200);update(.65,2);assert.equal(pose(),frozen);update(2.2,3);assert.deepEqual(pov.diagnostics.supportHandLocal,grip);assert.deepEqual(pov.diagnostics.magazineOffset,[0,0,0]);assert.equal(pov.diagnostics.reloading,false);assert.equal(JSON.stringify(player),before);assert.equal(snapshot(f.c.c2c.weaponGroups.rifle),sourceBefore);
    }finally{pov.dispose();}
  }));
  check('缺換彈權威、到期、死亡不演虛假POV換彈',()=>fixture(f=>{
    const pov=createMajorFpsPovWeapon(new THREE.PerspectiveCamera());
    try{for(const change of[{weaponHandlingVersion:undefined},{reloading:false},{reloadEndsAtMs:500},{dead:true,alive:false}]){
      pov.update({frame:{rnd:1,ts:.65,roundSec:.65,muzzles:[]},chase:{...f.player,alive:true,weaponHandlingVersion:1,reloading:true,reloadStartedAtMs:0,reloadEndsAtMs:2200,...change},pov:true,live:{sim,fIdx:10,seekNonce:0,playing:false},family:'pistol',dt:.1,weaponGroups:f.c.c2c.weaponGroups});
      assert.equal(pov.diagnostics.reloading,false);assert.equal(pov.diagnostics.reloadProgress,null);
    }}finally{pov.dispose();}
  }));
  check('長槍GLB確實包含PBR材質分區而非舊白色默認材質',()=>{
    for(const family of['rifle','smg','sniper']){
      const bytes=fs.readFileSync(new URL(`../public/assets/fps/major-weapons-v1/${family}.glb`,import.meta.url));
      const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8').trim());
      assert.ok(json.materials?.length>0);
      for(const material of json.materials){const p=material.pbrMetallicRoughness;
        if(family==='rifle'){
          for(const slot of[p?.baseColorTexture,p?.metallicRoughnessTexture,material.normalTexture]){
            assert.ok(Number.isInteger(slot?.index));const image=json.images?.[json.textures?.[slot.index]?.source];assert.ok(Number.isInteger(image?.bufferView),'作者PBR圖片必須真嵌入GLB');
          }
        }else{assert.ok(p?.baseColorFactor&&Math.max(...p.baseColorFactor.slice(0,3))<.2);assert.ok(p.roughnessFactor>=.35&&p.roughnessFactor<=.75);}
      }
      if(family==='sniper')assert.ok(json.materials.length>=3,'必須保留作者材質分區');
      if(family==='rifle')assert.ok(json.nodes.some(node=>node.name==='ESMO_CC0_M4A1_Magazine'),'必須保留真來源彈匣');
    }
  });
  check('真GLB原磁碟資料不變', () => assert.ok(assets.unchanged()));
  check('POV布料合法RGBA私有末一釋放、CC0法線借用與原成本保持',()=>fixture(f=>{
    const pov=createMajorFpsPovWeapon(new THREE.PerspectiveCamera());let texture,seamMask;
    const textiles=Object.fromEntries(['leatherNormal','fabricNormal','leatherColour','fabricColour'].map(key=>[key,new THREE.Texture({width:1024,height:key.startsWith('fabric')?1026:1024})]));
    textiles.leatherColour.colorSpace=textiles.fabricColour.colorSpace=THREE.SRGBColorSpace;
    const clothColor=new THREE.Color(0x65725c),sourceColor=clothColor.getHex();let borrowedDisposals=0;
    Object.values(textiles).forEach(map=>map.addEventListener('dispose',()=>borrowedDisposals++));
    pov.group.traverse(mesh=>{if(mesh.isMesh&&mesh.material.bumpMap)texture=mesh.material.bumpMap;if(mesh.isMesh&&mesh.material.userData.esmoPovDetailMap)seamMask=mesh.material.userData.esmoPovDetailMap;});
    try{
      assert.ok(texture?.isDataTexture);assert.equal(texture.format,THREE.RGBAFormat);
      assert.equal(texture.image.data.length,texture.image.width*texture.image.height*4);
      assert.ok(texture.image.data.byteLength<=65536);assert.ok(new Set(texture.image.data).size>10);
      assert.ok(seamMask?.isDataTexture);assert.equal(seamMask.format,THREE.RGBAFormat);
      assert.ok(seamMask.image.data.byteLength<=65536);assert.equal(seamMask.colorSpace,THREE.NoColorSpace);
      const sleeve=pov.group.children.find(mesh=>mesh.material?.name==='ESMO_POV_WovenSleeve').material;
      const sleeveShader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <map_fragment>\n#include <normal_fragment_maps>'};
      sleeve.onBeforeCompile(sleeveShader);
      assert.equal(sleeveShader.uniforms.esmoSleeveTailoring.value,1);assert.equal(sleeveShader.uniforms.esmoClothDetailStrength.value,.005);assert.equal(sleeveShader.uniforms.esmoClothToneStrength.value,.12);
      assert.ok(sleeveShader.fragmentShader.includes('esmoCuffThread')&&sleeveShader.fragmentShader.includes('esmoPanelEnds')&&sleeveShader.fragmentShader.includes('dFdx(esmoHeight)'),'袖口拼片不能覆蓋或移除原布面法線');
      const alphas=seamMask.image.data.filter((_,index)=>index%4===3);assert.ok(alphas.some(alpha=>alpha===0)&&alphas.some(alpha=>alpha>180),'縫線遮罩必須有透明背景與可見車線，不能蓋掉整張CC0皮革');
      for(const[file,md5]of[['leather-white-normal-1k.jpg','4226eb91e17693722f3368cd41a3b1c9'],['fabric-pattern-05-normal-1k.jpg','9cf8fe9343eb29021eb0bf9faf174e0c'],['terlenka-normal-1k.jpg','88d445044fb8519c516c97acabf93ef1'],['terlenka-colour-1k.jpg','202624e89023d9ace2845b372015490c'],['leather-white-colour-1k.jpg','a580e1c45d806a56d89331f9a549ecb2']]){
        const bytes=fs.readFileSync('public/assets/fps/major-weapons-v1/'+file);
        assert.ok(bytes.length<1024*1024);assert.equal(createHash('md5').update(bytes).digest('hex'),md5,'原作者API逐byte校驗');
      }
      pov.update({frame:{rnd:1,ts:120,roundSec:0,muzzles:[]},chase:{...f.player,alive:true},pov:true,live:{sim,fIdx:0,seekNonce:0,playing:false},family:'pistol',dt:0,weaponGroups:f.c.c2c.weaponGroups,handGeometries:f.c.c2c.povHandGeometries,textiles,clothColor});
      assert.equal(pov.diagnostics.textileNormals,true);assert.equal(clothColor.getHex(),sourceColor);
      let ownedTriangles=0,leather=0,woven=0;
      pov.group.traverse(mesh=>{if(!mesh.isMesh||mesh.userData.esmoPovBorrowed)return;
        ownedTriangles+=(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3;
        if(mesh.material.name==='ESMO_POV_LeatherGlove'){leather++;assert.equal(mesh.material.normalMap,textiles.leatherNormal);assert.equal(mesh.material.map,textiles.leatherColour);assert.equal(mesh.material.map.colorSpace,THREE.SRGBColorSpace);assert.equal(mesh.material.bumpMap,null);}
        if(mesh.material.name==='ESMO_POV_WovenSleeve'){woven++;assert.equal(mesh.material.normalMap,textiles.fabricNormal);assert.equal(mesh.material.map,textiles.fabricColour);assert.equal(mesh.material.map.colorSpace,THREE.SRGBColorSpace);assert.equal(mesh.material.bumpMap,null);}
      });
      assert.equal(leather,2);assert.equal(woven,3);
      const bridge=pov.group.getObjectByName('ESMO_POV_ThrowUpperSleeve'),forearms=pov.group.children.filter(mesh=>mesh!==bridge&&mesh.material?.name==='ESMO_POV_WovenSleeve');
      assert.equal(forearms.length,2);assert(forearms.some(mesh=>mesh.geometry===bridge.geometry&&mesh.material===bridge.material),'新增上臂橋接必須借用原前臂幾何與材質，不增加私有素材');
      assert.ok(ownedTriangles<=5200,'原手上限1800與整套私有5200成本');
      let releases=0,seamReleases=0;texture.addEventListener('dispose',()=>releases++);seamMask.addEventListener('dispose',()=>seamReleases++);pov.dispose();assert.equal(releases,1);assert.equal(seamReleases,1);pov.dispose();assert.equal(releases,1);assert.equal(seamReleases,1);assert.equal(borrowedDisposals,0);
    }finally{pov.dispose();Object.values(textiles).forEach(map=>map.dispose());}
  }));
  check('五族材質跨actor共用，末一釋放且來源材質不變',()=>{
    const a=assets.make({importedWeapons:true}),b=assets.make({importedWeapons:true});
    const firstMesh=group=>{let found;group.traverse(o=>{if(o.isMesh&&!found)found=o;});return found;};
    try{
      const material=firstMesh(a.c.c2c.weaponGroups.rifle).material;
      const smgMaterial=firstMesh(a.c.c2c.weaponGroups.smg).material;
      assert.equal(smgMaterial,firstMesh(b.c.c2c.weaponGroups.smg).material);
      const shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <map_fragment>\n#include <roughnessmap_fragment>\n#include <metalnessmap_fragment>\n#include <normal_fragment_maps>'};
      smgMaterial.onBeforeCompile(shader);assert.equal(shader.uniforms.esmoSmgMaterialRoles.value,1);
      assert.ok(shader.fragmentShader.includes('roughnessFactor=mix(roughnessFactor,.88,esmoGrip)'));
      let smgReleased=0;smgMaterial.addEventListener('dispose',()=>smgReleased++);
      const shotgunMaterial=firstMesh(a.c.c2c.weaponGroups.shotgun).material;
      assert.equal(shotgunMaterial,firstMesh(b.c.c2c.weaponGroups.shotgun).material);
      const shotgunShader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <map_fragment>\n#include <roughnessmap_fragment>\n#include <metalnessmap_fragment>\n#include <normal_fragment_maps>'};
      shotgunMaterial.onBeforeCompile(shotgunShader);assert.equal(shotgunShader.uniforms.esmoShotgunMaterialRoles.value,1);
      let shotgunReleased=0;shotgunMaterial.addEventListener('dispose',()=>shotgunReleased++);
      assert.equal(material,firstMesh(b.c.c2c.weaponGroups.rifle).material);
      assert.equal(material.userData.esmoC2cOwned,false);assert.equal(material.userData.esmoSharedWeaponMaterial,true);
      let released=0;material.addEventListener('dispose',()=>released++);
      a.dispose();assert.equal(released,0);assert.equal(smgReleased,0);assert.equal(shotgunReleased,0);assert.ok(material.envMap);
      b.dispose();assert.equal(released,1);assert.equal(smgReleased,1);assert.equal(shotgunReleased,1);b.dispose();assert.equal(released,1);assert.equal(smgReleased,1);assert.equal(shotgunReleased,1);
    }finally{a.dispose();b.dispose();}
  });
} finally { assets.dispose(); }
console.log(`CS Major POV Weapon B5: ${passed}/${passed + failed} PASS`); if (failed) process.exitCode = 1;
