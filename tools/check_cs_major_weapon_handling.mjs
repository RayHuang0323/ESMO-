import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createFpsWeaponHandling, advanceFpsWeaponHandling, consumeFpsWeaponShot, fpsWeaponHandlingProfile, fpsWeaponReadyAtMs, resolveFpsWeaponStance } from '../src/battle/fps/fpsWeaponHandling.js';
import { deriveFpsAnimationState } from '../src/battle/fps/presentation/fpsAnimationState.js';
import { readFpsRigTestAssets } from './lib/fpsRigTestAssets.mjs';
import { loadFpsMajorTestApi } from './lib/fpsMajorTestApi.mjs';

let pass=0,fail=0;
function ck(name,fn){try{fn();pass++;console.log(`PASS ${name}`);}catch(e){fail++;console.error(`FAIL ${name}: ${e.stack}`);}}
const player=(gun='deagle')=>({gun,dead:false,pos:{x:0,y:0},prevPos:{x:0,y:0},state:'HOLD',...createFpsWeaponHandling(gun)});
const empty=()=>({...player(),ammo:0});
ck('扣彈與輸入不可變',()=>{const p=Object.freeze(player()),shot=consumeFpsWeaponShot(p,1000);assert.equal(shot.fired,true);assert.equal(shot.state.ammo,6);assert.equal(p.ammo,7);});
ck('最後一發只扣一次並啟動真換彈',()=>{const p={...player(),ammo:1},shot=consumeFpsWeaponShot(p,1000);assert.equal(shot.fired,true);assert.equal(shot.state.ammo,0);assert.equal(shot.state.reloadStartedAtMs,1000);assert.equal(shot.state.reloadEndsAtMs,2800);});
ck('換彈期間不能射擊',()=>{const p={...empty(),...advanceFpsWeaponHandling(empty(),1000)},shot=consumeFpsWeaponShot(p,2799);assert.equal(shot.fired,false);assert.equal(shot.state.reserveAmmo,p.reserveAmmo);assert.equal(fpsWeaponReadyAtMs(p,1000),2800);});
ck('邊界完成換彈只搬運真備彈',()=>{const p={...empty(),reserveAmmo:3},loading={...p,...advanceFpsWeaponHandling(p,1000)},done=advanceFpsWeaponHandling(loading,2800);assert.equal(done.ammo,3);assert.equal(done.reserveAmmo,0);assert.equal(done.reloading,false);});
ck('換彈完成時間可合法開槍',()=>{const p={...empty(),...advanceFpsWeaponHandling(empty(),1000)},shot=consumeFpsWeaponShot(p,2800);assert.equal(shot.fired,true);assert.equal(shot.ammoBefore,7);assert.equal(shot.state.ammo,6);assert.equal(shot.state.reserveAmmo,14);});
ck('彈藥完全耗盡不生射擊或負數',()=>{const p={...empty(),reserveAmmo:0};for(let t=0;t<10000;t+=100){const shot=consumeFpsWeaponShot(p,t);assert.equal(shot.fired,false);assert.equal(shot.state.ammo,0);assert.equal(shot.state.reserveAmmo,0);}assert.equal(fpsWeaponReadyAtMs(p,0),Infinity);});
ck('死亡取消換彈且不補彈',()=>{const p={...empty(),...advanceFpsWeaponHandling(empty(),1000),dead:true},done=advanceFpsWeaponHandling(p,10000);assert.equal(done.reloading,false);assert.equal(done.ammo,0);assert.equal(done.reserveAmmo,21);assert.equal(consumeFpsWeaponShot(p,10000).fired,false);});
ck('拾槍保留真剩餘彈量並取消舊換彈',()=>{const p=createFpsWeaponHandling('ak',{ammo:4,reserveAmmo:12});assert.equal(p.ammo,4);assert.equal(p.reserveAmmo,12);assert.equal(p.reloading,false);assert.equal(createFpsWeaponHandling('ak',{ammo:0,reserveAmmo:0}).ammo,0);});
ck('重設回合使用完整獨立純量狀態',()=>{const a=createFpsWeaponHandling('ak'),b=createFpsWeaponHandling('ak');a.ammo=0;assert.equal(b.ammo,30);assert.ok(Object.values(b).every(v=>v===null||typeof v!=='object'));});
ck('掉落資料邊界不產生超量或負量',()=>{const p=createFpsWeaponHandling('awp',{ammo:999,reserveAmmo:-1});assert.equal(p.ammo,5);assert.equal(p.reserveAmmo,0);assert.throws(()=>fpsWeaponHandlingProfile('unknown'));});
ck('實際掩體保護下防守靜止才蹲姿、空地／移動／死亡站姿',()=>{assert.equal(resolveFpsWeaponStance(player()),'standing');assert.equal(resolveFpsWeaponStance({...player(),coverAssessment:{protected:true}}),'crouched');assert.equal(resolveFpsWeaponStance({...player(),coverAssessment:{protected:true},pos:{x:1,y:0}}),'standing');assert.equal(resolveFpsWeaponStance({...player(),coverAssessment:{protected:true},dead:true}),'standing');});
ck('動畫讀權威換彈進度、不借未來起點',()=>{const p={...empty(),...advanceFpsWeaponHandling(empty(),1000)};assert.equal(deriveFpsAnimationState({player:p,roundTimeMs:999}).reloading,false);const a=deriveFpsAnimationState({player:p,roundTimeMs:1900});assert.equal(a.reloading,true);assert.equal(a.reloadProgress,.5);assert.equal(deriveFpsAnimationState({player:p,roundTimeMs:2800}).reloading,false);});
ck('舊資料不猜蹲換彈、死亡優先',()=>{assert.equal(deriveFpsAnimationState({player:{stance:'crouched',reloading:true}}).crouched,false);assert.equal(deriveFpsAnimationState({player:{...player(),stance:'crouched',dead:true}}).crouched,false);});

const assets=await readFpsRigTestAssets();
function fixture(fn){const f=assets.make({optimized:true});try{fn(f);}finally{f.dispose();}}
try{
  ck('真GLB crouch與reload來源存在',()=>{for(const name of ['Crouch_Idle_Loop','Crouch_Fwd_Loop','Pistol_Reload'])assert.ok(assets.clips.some(c=>c.name===name));});
  ck('真GLB蹲姿下層與持槍上層互斥',()=>fixture(f=>{const p={...f.player,...createFpsWeaponHandling(f.player.gun),stance:'crouched'};f.update({player:p});assert.equal(f.c.poseLayers.lowerName,'Crouch_Idle_Loop');assert.equal(f.c.poseLayers.upperName,'Pistol_Aim_Neutral');const top=new Set(f.c.poseLayers.upperAction.getClip().tracks.map(t=>t.name));assert.ok(f.c.poseLayers.lowerAction.getClip().tracks.every(t=>!top.has(t.name)));}));
  ck('真GLB换彈按權威進度定位、不依RAF累加',()=>fixture(f=>{const p={...f.player,...createFpsWeaponHandling(f.player.gun),reloading:true,reloadStartedAtMs:1000,reloadEndsAtMs:3000};f.update({player:p,roundTimeMs:2000});const a=f.c.poseLayers.upperAction;assert.equal(f.c.poseLayers.upperName,'Pistol_Reload');assert.ok(Math.abs(a.time-a.getClip().duration*.5)<1e-6);f.update({player:p,roundTimeMs:2000});assert.ok(Math.abs(a.time-a.getClip().duration*.5)<1e-6);}));
  ck('真GLB pause與seek換彈中途還原',()=>fixture(f=>{const p={...f.player,...createFpsWeaponHandling(f.player.gun),reloading:true,reloadStartedAtMs:1000,reloadEndsAtMs:3000};f.update({player:p,roundTimeMs:1500});const before=f.c.poseLayers.upperAction.time;f.update({player:p,playbackActive:false,roundTimeMs:1500});assert.equal(f.c.poseLayers.upperAction.time,before);f.update({player:p,playbackActive:false,seekNonce:1,frameIndex:20,roundTimeMs:2500});const a=f.c.poseLayers.upperAction;assert.ok(Math.abs(a.time-a.getClip().duration*.75)<1e-6);}));
  ck('真GLB死亡蓋過换彈且来源bytes不變',()=>fixture(f=>{const p={...f.player,...createFpsWeaponHandling(f.player.gun),dead:true,reloading:true,reloadStartedAtMs:0,reloadEndsAtMs:3000};f.update({player:p,roundTimeMs:1000});assert.equal(f.c.currentAction,'Death01');assert.equal(f.c.poseLayers.active,false);assert.equal(assets.unchanged(),true);}));
}finally{assets.dispose();}

const api=await loadFpsMajorTestApi(fs.readFileSync('src/battle/fps/EsportsFPS3D.jsx','utf8'));
const sim=api.simulateFps('mirage',api.TACTICS_DB.mirage.t[0],api.TACTICS_DB.mirage.ct[0],505001,api.ROSTER,null,'major.v1');
ck('真模擬完整完成且快照彈量合法',()=>{assert.equal(sim.completed,true);assert.ok(sim.frames.every(f=>f.players.every(p=>{const profile=fpsWeaponHandlingProfile(p.gun);return p.weaponHandlingVersion===1&&p.ammo>=0&&p.ammo<=profile.capacity&&p.reserveAmmo>=0&&p.reserveAmmo<=profile.reserve;})));});
ck('真射擊事件逐發扣彈且沒有空匣幽靈射擊',()=>{assert.ok(sim.shotCadenceTelemetry.length>0);assert.ok(sim.shotCadenceTelemetry.every(e=>e.ammoBefore>0&&e.ammoAfter===e.ammoBefore-1));});
ck('真快照包含權威蹲姿且不回寫舊快照',()=>{assert.ok(sim.frames.some(f=>f.players.some(p=>p.stance==='crouched')));const frame=sim.frames[0],saved=JSON.stringify(frame);sim.frames.at(-1).players[0].ammo=0;assert.equal(JSON.stringify(frame),saved);});
console.log(`CS Major Weapon Handling B7: ${pass}/${pass+fail} PASS`);
if(fail)process.exitCode=1;
