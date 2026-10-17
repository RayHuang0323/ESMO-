import fs from 'node:fs';
import path from 'node:path';
import { seekFpsNativeTimeline } from './fpsNativeTimeline.mjs';
import { FPS_MAJOR_WEAPON_TRIANGLE_BUDGET } from '../../src/battle/fps/presentation/fpsMajorWeaponAssets.js';

// Inspect real recorded frames, then use only native slider/actor/camera controls.
// Missing gun families are explicitly NOT_MEASURED; no seed or frame is manufactured.
export async function captureFpsWeaponArtGallery({chrome,sleep,ck,map,out,reload=false}) {
  const targets=await chrome.evaluate(`const s=window.__ESMO_FPS_SCENE__,mapping=s.players[0]?.rigged?.c2c?.weaponFamilyMap,found={};if(!mapping)throw new Error('缺少產品槍族資料');for(let index=0;index<s.liveRef.current.sim.frames.length;index++){const f=s.liveRef.current.sim.frames[index];for(const p of f.players){const family=mapping[p.gun],progress=(f.roundSec*1000-p.reloadStartedAtMs)/(p.reloadEndsAtMs-p.reloadStartedAtMs),eligible=${reload?"p.weaponHandlingVersion===1&&p.reloading&&progress>=.25&&progress<=.75":"true"};if(!p.dead&&family&&eligible&&!found[family])found[family]={index,id:p.id,gun:p.gun,round:f.rnd};}}return found;`);
  const folder=reload?'weapon-reload-gallery':'weapon-gallery';
  const directory=path.join(out,folder);fs.mkdirSync(directory,{recursive:true});const rows=[];
  for(const family of Object.keys(FPS_MAJOR_WEAPON_TRIANGLE_BUDGET)) {
    const target=targets[family];
    if(!target){rows.push({family,status:reload?'NOT_MEASURED_NO_RECORDED_RELOAD':'NOT_MEASURED_NO_RECORDED_GUN'});continue;}
    const {nativeDragCursor}=await seekFpsNativeTimeline({chrome,sleep,index:target.index});
    await chrome.evaluate(`const card=document.querySelector('[data-esmo-fps-player-card="${target.id}"]');if(!card)throw new Error('缺少真選手卡');card.click();return true;`);await sleep(1100);
    await chrome.evaluate(`const button=document.querySelector('[data-testid="cs-camera-preset-pov"]');if(!button||button.disabled)throw new Error('缺少真POV按鈕');button.click();document.querySelector('canvas')?.scrollIntoView({block:'center'});return true;`);await sleep(1300);
    const observed=await chrome.evaluate(`const s=window.__ESMO_FPS_SCENE__,f=s.liveRef.current.sim.frames[s.liveRef.current.fIdx],p=f.players.find(p=>p.id===s.liveRef.current.selected),d=s.povWeaponDiagnostics,source=s.players.find(actor=>actor.id===p.id)?.rigged?.c2c?.weaponGroups[d?.family];const surfaceRoles=[],gl=s.renderer.getContext();if(['smg','shotgun'].includes(d?.family))source?.traverse(o=>{if(o.isMesh)for(const m of(Array.isArray(o.material)?o.material:[o.material])){const program=s.renderer.properties.get(m).currentProgram?.program,location=program?gl.getUniformLocation(program,d.family==='smg'?'esmoSmgMaterialRoles':'esmoShotgunMaterialRoles'):null;surfaceRoles.push(location===null?null:gl.getUniform(program,location));}});let magazineProjection=null;if(d?.family==='smg'){s.camera.updateMatrixWorld(true);const points=[];s.povWeapon.group.traverse(o=>{if(!o.isMesh||!o.userData.esmoPovBorrowed)return;const a=o.geometry.attributes.position;for(let i=0;i<a.count;i++){if(a.getY(i)>-.4)continue;const p=s.camera.position.clone().fromBufferAttribute(a,i);o.localToWorld(p);p.project(s.camera);points.push(p);}});magazineProjection={vertices:points.length,minY:Math.min(...points.map(p=>p.y)),maxY:Math.max(...points.map(p=>p.y)),minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),fov:s.camera.fov};}return{magazineProjection,surfaceRoles,index:s.liveRef.current.fIdx,id:p?.id,gun:p?.gun,dead:p?.dead,playing:s.liveRef.current.playing,camera:s.liveRef.current.cameraMode,diagnostics:d,source:source?.userData.esmoAuthoredWeapon};`);
    ck(`${map} ${family} 真保存槍型與POV来源前提`,observed.index===target.index&&observed.id===target.id&&observed.gun===target.gun&&!observed.dead&&!observed.playing&&observed.camera==='pov'&&observed.diagnostics?.visible&&observed.diagnostics?.family===family&&observed.source?.imported===true,JSON.stringify(observed));
    ck(`${map} ${family} 實際可見模型成本`,observed.diagnostics?.weaponTriangles<=FPS_MAJOR_WEAPON_TRIANGLE_BUDGET[family]&&observed.diagnostics?.weaponParts+observed.diagnostics?.ownedParts<=12,JSON.stringify(observed.diagnostics));
    if(family==='smg')ck(`${map} smg 真GPU鋼與橡膠材質分區`,observed.surfaceRoles?.length>0&&observed.surfaceRoles.every(value=>value===1),JSON.stringify(observed.surfaceRoles));
    if(family==='shotgun')ck(`${map} shotgun 真GPU鋼與木製握把材質分區`,observed.surfaceRoles?.length>0&&observed.surfaceRoles.every(value=>value===1),JSON.stringify(observed.surfaceRoles));
    if(reload){
      const d=observed.diagnostics;
      ck(`${map} ${family} 真POV保存換彈進度／原彈匣`,d?.reloading===true&&d.reloadProgress>=.25&&d.reloadProgress<=.75&&(family!=='rifle'||d.magazineOffset?.[1]<0),JSON.stringify(d));
      await sleep(300);const frozen=await chrome.evaluate(`return window.__ESMO_FPS_SCENE__.povWeaponDiagnostics;`);
      ck(`${map} ${family} 暫停保持手與彈匣進度`,JSON.stringify([d.supportHandLocal,d.magazineOffset,d.reloadProgress])===JSON.stringify([frozen?.supportHandLocal,frozen?.magazineOffset,frozen?.reloadProgress]),JSON.stringify(frozen));
    }
    const captureRect=await chrome.evaluate(`const r=document.querySelector('canvas').getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};`);
    const file=`${folder}/${map}-${family}.png`,shot=await chrome.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,file),Buffer.from(shot.data,'base64'));
    rows.push({family,status:'MEASURED',target,observed,file,nativeDragCursor,captureRect});
  }
  return rows;
}
