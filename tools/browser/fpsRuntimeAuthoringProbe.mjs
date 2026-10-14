import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {HarnessError} from './harness.mjs';
import {seekFpsNativeTimeline} from './fpsNativeTimeline.mjs';

// 真遊戲保存幀唯讀匯出；不改pose、槍型、權威幀或相機，零PNG。
export async function captureFpsRuntimeAuthoring({chrome,sleep,map,out,ck,sourceFingerprint,archivedProductionArtifact,sourceHashes}){
 if(!sourceHashes||Object.keys(sourceHashes).length!==sourceFingerprint.files)throw new HarnessError('真作者packet缺逐檔來源hash，不猜回傳映射');
 const targets=await chrome.evaluate(`const s=window.__ESMO_FPS_SCENE__,found={};for(let frame=0;frame<s.liveRef.current.sim.frames.length;frame++){for(const p of s.liveRef.current.sim.frames[frame].players){const c=s.players.find(a=>a.id===p.id)?.rigged?.c2c;if(!p.dead&&!p.reloading&&c?.variationId==='support'&&c.weaponFamilyMap[p.gun]==='sniper'&&!found[p.side])found[p.side]={id:p.id,side:p.side,frame,gun:p.gun};}}return Object.values(found);`);
 if(targets.length!==2||!['ct','t'].every(side=>targets.some(t=>t.side===side)))throw new HarnessError('缺兩隊真support狙擊保存幀，不製造作者情境');
 const files=[];
 for(const target of targets){
  await seekFpsNativeTimeline({chrome,sleep,index:target.frame});
  await chrome.evaluate(`const card=document.querySelector('[data-esmo-fps-player-card="${target.id}"]');if(!card)throw Error('缺真選手卡');card.click();return true;`);await sleep(600);
  const packet=await chrome.evaluate(`
   const s=window.__ESMO_FPS_SCENE__,l=s.liveRef.current,a=s.players.find(a=>a.id===l.selected),c=a.rigged,V=s.camera.position.constructor,origin=c.root.getWorldPosition(new V()),p=l.sim.frames[l.fIdx].players.find(p=>p.id===l.selected),card=document.querySelector('[data-esmo-fps-player-card="${target.id}"]');
   const values=a=>a?Array.from({length:a.count},(_,i)=>Array.from({length:a.itemSize},(_,j)=>a[['getX','getY','getZ','getW'][j]](i))).flat():null,meshes=[],bones=[];
   c.root.traverse(o=>{
    if(o.isBone)bones.push({name:o.name,parent:o.parent?.isBone?o.parent.name:null,position:o.getWorldPosition(new V()).sub(origin).toArray()});
    if(!o.isMesh)return;for(let parent=o;parent;parent=parent.parent){if(!parent.visible)return;if(parent===c.root)break;}
    const g=o.geometry,pos=g.attributes.position;if(!pos)return;
    const materials=(Array.isArray(o.material)?o.material:[o.material]).map(m=>({name:m.name,color:m.color?.toArray()||[.4,.4,.4],roughness:m.roughness??.8,metalness:m.metalness??0}));
    meshes.push({name:o.name||'mesh-'+meshes.length,positions:Array.from({length:pos.count},(_,i)=>{const v=new V().fromBufferAttribute(pos,i);if(o.isSkinnedMesh)o.applyBoneTransform(i,v);return o.localToWorld(v).sub(origin).toArray();}),bindPositions:values(pos),indices:g.index?values(g.index):Array.from({length:pos.count},(_,i)=>i),groups:g.groups,materials,uv:values(g.attributes.uv),skinIndex:values(g.attributes.skinIndex),skinWeight:values(g.attributes.skinWeight),boneNames:o.isSkinnedMesh?o.skeleton.bones.map(b=>b.name):null,boneInverses:o.isSkinnedMesh?o.skeleton.boneInverses.map(m=>m.toArray()):null,boneWorldMatrices:o.isSkinnedMesh?o.skeleton.bones.map(b=>b.matrixWorld.toArray()):null,bindMatrix:o.isSkinnedMesh?o.bindMatrix.toArray():null,bindMatrixInverse:o.isSkinnedMesh?o.bindMatrixInverse.toArray():null,matrixWorld:o.matrixWorld.toArray(),origin:origin.toArray(),cuff:g.userData.esmoCuffRoll??null});
   });
   return {version:'cs-runtime-authoring.v1',status:'TRUE_BROWSER_SAVED_FRAME_AUTHOR_PACKET_NOT_ART_PASS',observed:{id:l.selected,frame:l.fIdx,playing:l.playing,gun:p.gun,dead:p.dead,reloading:p.reloading,bodyVisible:c.root.visible,family:c.c2c.weaponFamily,variation:c.c2c.variationId,cardText:card.textContent},coordinateSystem:'Three.js Y-up metres; Blender maps (x,y,z) to (x,-z,y)',meshes,bones,caveat:'真Browser保存幀幾何；作者材料僅factor，未轉移shader／貼圖。不是完整藝術驗收。'};
  `);
  const o=packet.observed;
  if(o.id!==target.id||o.frame!==target.frame||o.playing||o.dead||o.reloading||!o.bodyVisible||o.gun!==target.gun||o.family!=='sniper'||o.variation!=='support'||!o.cardText)throw new HarnessError('真畫面保存幀前提未成立，不保存冒名packet');
  const body=packet.meshes.find(m=>m.name==='ESMO_Major_ContinuousClothing');
  const valid=body?.positions.length===7806&&body.indices.length/3===13286&&body.boneNames.length===65&&packet.meshes.every(m=>m.positions.flat().every(Number.isFinite)&&m.indices.every(i=>Number.isInteger(i)&&i>=0&&i<m.positions.length)&&[['bindPositions',3],['uv',2],['skinIndex',4],['skinWeight',4]].every(([name,size])=>!m[name]||(m[name].length===m.positions.length*size&&m[name].every(Number.isFinite))));
  ck(`${map} ${target.id} 真保存幀作者幾何與蒙皮有效`,valid,JSON.stringify({observed:o,meshes:packet.meshes.length,bones:packet.bones.length}));
  if(!valid){files.push({notSaved:true,observed:o,reason:'INVALID_AUTHOR_GEOMETRY'});continue;}
  for(const [file,expected] of Object.entries(sourceHashes))if(createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==expected)throw new HarnessError('匯出期間產品來源已變，不保存過時作者packet');
  packet.sourceFingerprint=sourceFingerprint;packet.archivedProductionArtifact=archivedProductionArtifact;packet.sourceHashes=sourceHashes;
  const file=`${map}-${target.id}-runtime-authoring.json`;fs.writeFileSync(path.join(out,file),JSON.stringify(packet),{flag:'wx'});files.push({file,observed:o,meshes:packet.meshes.length,bones:packet.bones.length});
 }
 return {scope:'TWO_TRUE_SAVED_FRAME_PACKETS_ZERO_PNG_NOT_ART_PASS',files};
}
