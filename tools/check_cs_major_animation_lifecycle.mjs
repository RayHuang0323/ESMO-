import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { readFpsRigTestAssets } from './lib/fpsRigTestAssets.mjs';
const assets=await readFpsRigTestAssets();let passed=0,failed=0;
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);
function check(name,fn){try{fn();passed++;console.log(`PASS ${name}`);}catch(e){failed++;console.log(`FAIL ${name}: ${e.stack||e.message}`);}}
function fixtureTest(options,fn){const f=assets.make(options);try{fn(f);}finally{f.dispose();}}
const bounds=c=>{c.root.updateWorldMatrix(true,true);return new THREE.Box3().setFromObject(c.root);};
function die(f,{edge=true,paused=false}={}){const dead={...f.player,dead:true,hp:0,state:'DEAD'};f.update({player:dead,previousPlayer:edge?f.player:dead,frameIndex:11,playbackActive:!paused});return dead;}

try{
  for(const gun of ['usp','mp9','m4','awp','nova'])check(`${gun} 暫停保持真clip時間／手骨／槍口與timer`,()=>fixtureTest({gun},f=>{
    const moving={...f.player,pos:{x:19,y:23},state:'ROTATE'};
    f.update({player:moving,previousPlayer:f.player});for(let i=0;i<8;i++)f.update({player:moving,previousPlayer:f.player});
    const c=f.c,action=c.actions.get(c.currentAction),time=action.time,mixer=c.mixer.time,hand=c.model.getObjectByName('hand_r').quaternion.clone(),muzzle=c.getMuzzleWorldPosition(new THREE.Vector3()).clone(),name=c.currentAction;
    c.fireTimer=.12;c.hitTimer=.2;
    for(let i=0;i<12;i++)f.update({player:moving,previousPlayer:f.player,playbackActive:false});
    assert.equal(c.mixer.time,mixer);assert.equal(action.time,time);assert.equal(c.currentAction,name);assert.ok(c.model.getObjectByName('hand_r').quaternion.equals(hand));near(c.getMuzzleWorldPosition(new THREE.Vector3()).distanceTo(muzzle),0);near(c.fireTimer,.12);near(c.hitTimer,.2);
  }));
  for(const floor of [0,2.4,-1.2])check(`死亡在真parent地坪 ${floor}，不改權威X/Z`,()=>fixtureTest({floor},f=>{
    const dead=die(f);for(let i=0;i<40;i++)f.update({player:dead,previousPlayer:dead,frameIndex:12});near(bounds(f.c).min.y,floor);near(f.c.deathGroundContactY,floor);assert.deepEqual(f.parent.position.toArray(),[17,floor,23]);
  }));
  check('新回合還原死亡偏移與事件latch，不沿用地底model',()=>fixtureTest({floor:2.4},f=>{
    const dead=die(f);for(let i=0;i<12;i++)f.update({player:dead,previousPlayer:dead,frameIndex:12});assert.ok(f.c.model.position.distanceTo(f.c.baseModelPosition)>1e-4);f.c.resetForRound(2);assert.equal(f.c.deathTriggered,false);assert.ok(f.c.model.position.equals(f.c.baseModelPosition));assert.equal(f.c.lastFireSignature,null);assert.equal(f.c.lastHitSignature,null);
  }));
  check('同回合rewind至alive恢復人物與正常clip',()=>fixtureTest({},f=>{
    die(f);f.update({player:f.player,previousPlayer:f.player,frameIndex:3,playbackActive:false});assert.equal(f.c.deathTriggered,false);assert.ok(f.c.model.position.equals(f.c.baseModelPosition));assert.notEqual(f.c.currentAction,'Death01');
  }));
  check('明確seek nonce使向前跳轉也重新建立alive姿態',()=>fixtureTest({},f=>{
    die(f);f.update({player:f.player,previousPlayer:f.player,frameIndex:80,seekNonce:1,playbackActive:false});assert.equal(f.c.deathTriggered,false);assert.ok(f.c.model.position.equals(f.c.baseModelPosition));assert.equal(f.c.lastSeekNonce,1);
  }));
  check('直接進入已死後續frame顯示原death終態，不重播死亡',()=>fixtureTest({floor:2.4},f=>{
    die(f,{edge:false,paused:true});const action=f.c.actions.get(f.c.currentAction);near(action.time,action.getClip().duration);assert.equal(action.paused,true);near(bounds(f.c).min.y,2.4);const position=f.c.model.position.clone();for(let i=0;i<8;i++)f.update({player:{...f.player,dead:true,hp:0},previousPlayer:{...f.player,dead:true,hp:0},frameIndex:11,playbackActive:false});assert.ok(f.c.model.position.equals(position));
  }));
  check('死亡edge暫停不推進fall clip或重複校正',()=>fixtureTest({floor:1.8},f=>{
    const dead=die(f,{paused:true}),action=f.c.actions.get(f.c.currentAction),time=action.time,position=f.c.model.position.clone();for(let i=0;i<12;i++)f.update({player:dead,previousPlayer:dead,frameIndex:11,playbackActive:false});assert.equal(action.time,time);assert.ok(f.c.model.position.equals(position));near(bounds(f.c).min.y,1.8);
  }));
  check('每次major更新只sync一次cloth anchors，含死亡',()=>fixtureTest({},f=>{
    let calls=0;const sync=f.c.c2c.syncAnchors;f.c.c2c.syncAnchors=()=>{calls++;sync();};f.update();assert.equal(calls,1);calls=0;die(f);assert.equal(calls,1);
  }));
  check('legacy暫停動畫仍按原dt，不套major凍結路徑',()=>fixtureTest({optimized:false},f=>{
    f.update();const before=f.c.mixer.time;f.update({playbackActive:false});assert.ok(f.c.mixer.time>before);assert.equal(f.c.getMuzzleWorldPosition(new THREE.Vector3()),null);
  }));
  check('legacy維持原world-zero校正順序，高低parent呈現結果等價',()=>fixtureTest({optimized:false,floor:2.4},f=>{
    die(f);near(f.c.deathGroundContactY,0);
    // Legacy是先量測接地再sync衣物；最後bounds可能略低於0。
    // 比較兩個真rig的原流程，不把major的新同步順序寫成legacy假設。
    fixtureTest({optimized:false,floor:0},g=>{die(g);near(bounds(f.c).min.y,bounds(g.c).min.y);near(f.c.model.position.y-g.c.model.position.y,-2.4);});
  }));
  check('輸入player／frame不改寫，seek不改模擬座標',()=>fixtureTest({},f=>{const before=JSON.stringify(f.player);f.update({seekNonce:3,frameIndex:0});assert.equal(JSON.stringify(f.player),before);assert.deepEqual(f.parent.position.toArray(),[17,0,23]);}));
  check('正式產品傳入seekNonce，沒有以frame skip當seek',()=>{
    const source=fs.readFileSync(new URL('../src/battle/fps/EsportsFPS3D.jsx',import.meta.url),'utf8'),renderer=fs.readFileSync(new URL('../src/battle/fps/presentation/FpsCharacterRenderer.js',import.meta.url),'utf8');assert.match(source,/playbackActive:Boolean\(live\.playing\),seekNonce:live\.seekNonce/);assert.match(renderer,/frameIndex < controller\.lastPresentationFrame/);assert.ok(!renderer.includes('frameIndex > controller.lastPresentationFrame + 1'));
  });
  check('真素材保持原磁碟bytes／65 bones與原死亡clip',()=>{assert.ok(assets.unchanged());assert.ok(assets.clips.some(c=>c.name==='Death01'));fixtureTest({},f=>assert.equal(f.c.model.getObjectsByProperty('isBone',true).length,65));});
}finally{assets.dispose();}
console.log(`CS Major Animation Lifecycle B2: ${passed}/${passed+failed} PASS`);if(failed)process.exitCode=1;
