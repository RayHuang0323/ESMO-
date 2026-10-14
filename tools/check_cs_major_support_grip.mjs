import assert from 'node:assert/strict';
import * as THREE from 'three';
import {MeshBVH} from 'three-mesh-bvh';
import {readFpsRigTestAssets} from './lib/fpsRigTestAssets.mjs';
const assets=await readFpsRigTestAssets();let passed=0,failed=0;
const names=['upperarm_r','lowerarm_r','hand_r','upperarm_l','lowerarm_l','hand_l',...['r','l'].flatMap(side=>['index','middle','ring','pinky','thumb'].flatMap(digit=>[1,2,3].map(n=>`${digit}_0${n}_${side}`)))];
function check(name,fn){try{fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.log('FAIL '+name+' '+e.stack);}}
function fixture(options,fn){const f=assets.make({importedWeapons:true,continuousClothing:true,...options});try{fn(f);}finally{f.dispose();}}
const boneState=f=>names.map(name=>{const b=f.c.model.getObjectByName(name);return [b.position.toArray(),b.scale.toArray(),b.quaternion.toArray()];});
function contact(f){
 f.c.c2c.syncAnchors();const c=f.c.c2c,left=f.c.model.getObjectByName('hand_l');
 const diagnostics=f.c.gripPose.diagnostics();
 const socket=diagnostics.authoredSupport
  ? c.weaponGroups[c.weaponFamily].localToWorld(new THREE.Vector3().fromArray(diagnostics.supportLocal))
  : c.weaponSockets[c.weaponFamily].support.getWorldPosition(new THREE.Vector3());
 const palm=left.localToWorld(new THREE.Vector3(0,.055,.015));
 assert.ok(palm.distanceTo(socket)<1e-4,JSON.stringify({gun:f.player.gun,distance:palm.distanceTo(socket),diag:f.c.gripPose?.diagnostics()}));
 assert.equal(f.c.gripPose.diagnostics().status,'contact');
 const right=f.c.model.getObjectByName('hand_r').localToWorld(new THREE.Vector3(0,.055,.015));
 assert.ok(right.distanceTo(c.weaponSockets[c.weaponFamily].grip.getWorldPosition(new THREE.Vector3()))<1e-4);
 const direction=f.c.getMuzzleWorldDirection(new THREE.Vector3());assert.ok(direction.x>.75);assert.ok(Math.abs(direction.length()-1)<1e-6);
}
try{
 for(const gun of ['deagle','mp9','m4','awp','nova']){
  check(`${gun} 真五族HOLD、移動、蹲姿、射擊接觸來源socket或真護面作者握點且不改骨長`,()=>fixture({gun},f=>fixture({gun},reference=>{
   // 對照相同動畫取樣的真骨長；來源clip自己的position/scale不能誤比bind pose。
   f.update({dt:0});reference.update({dt:0});reference.c.gripPose.restore();reference.c.gripPose.apply=()=>{};
   const frame=JSON.stringify(f.player);
   for(const state of ['HOLD','ROTATE','ENGAGE'])for(let i=0;i<12;i++){
    const p={...f.player,state,weaponHandlingVersion:1,stance:i%2?'crouched':'standing',shooting:state==='ENGAGE'?1:0};
    const input={player:p,previousPlayer:{...p,shooting:0},frameIndex:20+i};
    f.update(input);reference.update(input);contact(f);
    assert.deepEqual(boneState(f).map(row=>row.slice(0,2)),boneState(reference).map(row=>row.slice(0,2)));
   }
   assert.equal(JSON.stringify(f.player),frame);
  })));
  check(`${gun} 暫停連續100次骨姿態、雙層與mixer時間不漂移`,()=>fixture({gun},f=>{
   f.update();const bones=JSON.stringify(boneState(f)),layers=JSON.stringify(f.c.poseLayers.diagnostics()),time=f.c.mixer.time;
   for(let i=0;i<100;i++){f.update({playbackActive:false});contact(f);assert.equal(JSON.stringify(boneState(f)),bones);}
   assert.equal(JSON.stringify(f.c.poseLayers.diagnostics()),layers);assert.equal(f.c.mixer.time,time);
  }));
  check(`${gun} pause seek／倒帶／回合重置重建與全新dt0姿態一致`,()=>fixture({gun},f=>fixture({gun},g=>{
   for(let i=0;i<10;i++)f.update({frameIndex:30+i});
   f.update({frameIndex:5,seekNonce:1,playbackActive:false});g.update({dt:0});contact(f);contact(g);
   names.forEach(name=>assert.ok(f.c.model.getObjectByName(name).quaternion.angleTo(g.c.model.getObjectByName(name).quaternion)<1e-5));
   f.c.resetForRound(2);assert.equal(f.c.gripPose.diagnostics().applied,false);
   f.update({frameRound:2,dt:0});contact(f);
  })));
 }
 check('真狙擊五指手皮接觸窄護木且局部三角反側訊號有界、來源socket不移動',()=>fixture({gun:'awp'},f=>{
  f.update({dt:0,playbackActive:false});f.c.c2c.syncAnchors();f.parent.updateMatrixWorld(true);const c=f.c.c2c,parts=[];
  try{
   c.weaponGroups.sniper.traverse(o=>{if(!o.isMesh)return;const g=o.geometry.clone();g.applyMatrix4(o.matrixWorld);g.clearGroups();parts.push({g,bvh:new MeshBVH(g)});});
   assert.deepEqual(c.weaponSockets.sniper.support.position.toArray(),[1.304199934,.0797999948,0]);
   const mesh=f.c.c2c.tailored.mesh,g=mesh.geometry;
   assert.equal(mesh.visible,true,'需檢查玩家實際可見的連續衣料手部，不能測隱藏原模型');
   assert.equal(mesh.name,'ESMO_Major_ContinuousClothing');mesh.skeleton.update();
   const point=new THREE.Vector3(),triangle=new THREE.Triangle(),normal=new THREE.Vector3();
   const nearest=point=>{let best=null;for(const part of parts){const hit=part.bvh.closestPointToPoint(point,{});if(best&&hit.distance>=best.distance)continue;const p=part.g.attributes.position,idx=part.g.index,k=hit.faceIndex*3;triangle.a.fromBufferAttribute(p,idx.getX(k));triangle.b.fromBufferAttribute(p,idx.getX(k+1));triangle.c.fromBufferAttribute(p,idx.getX(k+2));triangle.getNormal(normal);best={distance:hit.distance,signed:point.clone().sub(hit.point).dot(normal)};}return best;};
   let negativeOver2mm=0,samples=0;const contact={index:Infinity,middle:Infinity,ring:Infinity,pinky:Infinity,thumb:Infinity};
   for(let i=0;i<g.attributes.position.count;i++){
    const influence={hand:0,index:0,middle:0,ring:0,pinky:0,thumb:0};
    for(const fn of['getX','getY','getZ','getW']){const name=mesh.skeleton.bones[g.attributes.skinIndex[fn](i)]?.name??'';for(const digit of Object.keys(influence))if(name.startsWith(digit+'_')&&name.endsWith('_l'))influence[digit]+=g.attributes.skinWeight[fn](i);}
    if(Object.values(influence).reduce((a,b)=>a+b,0)<.1)continue;
    point.fromBufferAttribute(g.attributes.position,i);mesh.applyBoneTransform(i,point);mesh.localToWorld(point);const hit=nearest(point);
    if(Object.values(influence).reduce((a,b)=>a+b,0)>.9){samples++;if(hit.signed<-.002)negativeOver2mm++;}
    for(const digit of Object.keys(contact))if(influence[digit]>.1)contact[digit]=Math.min(contact[digit],hit.distance);
   }
   assert.equal(samples,1030,'全部真左手樣本不能只挑端點');
   // 最近三角朝向是保守局部訊號，不宣稱watertight內外分類。
   assert.ok(negativeOver2mm<=40,`局部反側超2mm樣本=${negativeOver2mm}；不能以端點貼合掩蓋手皮穿入訊號`);
   for(const digit of ['index','middle','ring','pinky','thumb']){
    const tip=f.c.model.getObjectByName(digit+'_04_leaf_l').getWorldPosition(new THREE.Vector3());
    assert.ok(nearest(tip).distance<.010,`${digit}骨端需仍在護木附近，不能讓真手皮根部單點碰到而指尖離開`);
    assert.ok(contact[digit]<.002,`${digit}真手皮槍面距離=${contact[digit]}`);
   }
  }finally{parts.forEach(part=>part.g.dispose());}
 }));
 check('受擊、權威換彈與死亡完整交还原動畫',()=>fixture({},f=>{
  f.update();let p={...f.player,hp:60};f.update({player:p,previousPlayer:f.player,frameIndex:11});
  assert.equal(f.c.gripPose.diagnostics().status,'animation-owned');assert.equal(f.c.currentAction,'Hit_Chest');
  for(let i=0;i<12;i++)f.update({player:p,previousPlayer:p,frameIndex:12});contact(f);
  p={...p,weaponHandlingVersion:1,reloading:true,reloadStartedAtMs:0,reloadEndsAtMs:3000};
  f.update({player:p,previousPlayer:p,roundTimeMs:1500});assert.equal(f.c.gripPose.diagnostics().status,'animation-owned');assert.equal(f.c.poseLayers.upperName,'Pistol_Reload');
  p={...p,hp:0,dead:true,state:'DEAD',reloading:false};f.update({player:p,previousPlayer:p,frameIndex:13});
  assert.equal(f.c.gripPose.diagnostics().status,'animation-owned');assert.equal(f.c.currentAction,'Death01');
 }));
 check('不可達socket fail closed，還原兩臂而非伸骨或假接觸',()=>fixture({},f=>{
  f.update();f.c.gripPose.restore();const raw=JSON.stringify(boneState(f));
  const s=f.c.c2c.weaponSockets.rifle.support,original=s.position.clone();s.position.x+=10;
  f.c.gripPose.apply();assert.equal(f.c.gripPose.diagnostics().status,'support-unreachable');assert.equal(f.c.gripPose.diagnostics().applied,false);
  assert.equal(JSON.stringify(boneState(f)),raw);s.position.copy(original);
 }));
 check('跨角色私有姿態、無新增Mesh／geometry／材質，dispose還原',()=>fixture({},f=>fixture({gun:'awp'},g=>{
  const resources=()=>{const r=[];f.c.root.traverse(o=>{if(o.isMesh)r.push([o.uuid,o.geometry.uuid,Array.isArray(o.material)?o.material.map(m=>m.uuid):o.material.uuid]);});return JSON.stringify(r);};
  const before=resources();f.update();g.update();const other=JSON.stringify(boneState(g));f.update();
  assert.notEqual(f.c.gripPose,g.c.gripPose);assert.equal(JSON.stringify(boneState(g)),other);assert.equal(resources(),before);
  f.c.dispose();assert.equal(f.c.gripPose.diagnostics().applied,false);
 })));
 check('legacy沿用動畫／狙擊槍原比例且不建約束',()=>fixture({optimized:false,gun:'awp'},f=>{
  f.update();assert.equal(f.c.gripPose,undefined);assert.equal(f.c.c2c.weaponGroups.sniper.scale.x,.58);
 }));
 check('源GLB bytes不變、第三人稱狙擊槍真幾何同比例縮放',()=>fixture({gun:'awp'},f=>{
  f.update();const w=f.c.c2c.weaponGroups.sniper;assert.deepEqual(w.scale.toArray(),[.4,.4,.4]);assert.ok(assets.unchanged());
 }));
}finally{assets.dispose();}
console.log(`CS Major Support Grip B7: ${passed}/${passed+failed} PASS`);if(failed)process.exitCode=1;
