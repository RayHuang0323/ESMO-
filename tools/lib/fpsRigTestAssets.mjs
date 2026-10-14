import {projectNonDeathPelvisWorldVertical} from "../../src/battle/fps/presentation/fpsVisibleGrounding.js";
// 真GLB fixture：只在記憶體移除Node無法decode的image slots，不修改磁碟素材。
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { createFpsCharacterRenderer } from '../../src/battle/fps/presentation/FpsCharacterRenderer.js';
import { createC2cHeroPresentation } from '../../src/battle/fps/presentation/fpsC2cHero.js';
import { createFpsBoundsSampler } from '../../src/battle/fps/presentation/fpsBoundsSampler.js';
import { FPS_CHARACTER_ASSET_MANIFEST as manifest } from '../../src/battle/fps/presentation/fpsCharacterAssets.js';

function withoutTextures(value){if(!value||typeof value!=='object')return;for(const key of Object.keys(value)){if(/Texture$/.test(key))delete value[key];else withoutTextures(value[key]);}}
async function readGlb(url){
  const original=fs.readFileSync(url),chunks=[];
  if(original.readUInt32LE(0)!==0x46546c67||original.readUInt32LE(4)!==2||original.readUInt32LE(8)!==original.length)throw new Error('fixture GLB header 不符');
  for(let at=12;at<original.length;){const size=original.readUInt32LE(at),type=original.readUInt32LE(at+4);if(size%4||at+8+size>original.length)throw new Error('fixture GLB chunk 越界');chunks.push({type,bytes:original.subarray(at+8,at+8+size)});at+=8+size;}
  const source=chunks.find(c=>c.type===0x4e4f534a),json=JSON.parse(source.bytes.toString('utf8').trim());delete json.images;delete json.textures;(json.materials||[]).forEach(withoutTextures);
  const encoded=Buffer.from(JSON.stringify(json)),padded=Buffer.alloc(Math.ceil(encoded.length/4)*4,0x20);encoded.copy(padded);
  const next=chunks.map(c=>c===source?{...c,bytes:padded}:c),bytes=Buffer.alloc(12+next.reduce((n,c)=>n+8+c.bytes.length,0));
  original.copy(bytes,0,0,12);bytes.writeUInt32LE(bytes.length,8);let at=12;
  for(const c of next){bytes.writeUInt32LE(c.bytes.length,at);bytes.writeUInt32LE(c.type,at+4);c.bytes.copy(bytes,at+8);at+=8+c.bytes.length;}
  const gltf=await new Promise((resolve,reject)=>new GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',resolve,reject));return{gltf,url,original};
}
function normalizedClone(scene){
  const model=SkeletonUtils.clone(scene);model.updateWorldMatrix(true,true);
  const box=new THREE.Box3(),point=new THREE.Vector3();
  model.traverse(o=>{if(o.isMesh){o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();for(const m of Array.isArray(o.material)?o.material:[o.material])m.userData.esmoC2aOwned=true;}if(!o.isSkinnedMesh)return;const attr=o.geometry.attributes.position;for(let i=0;i<attr.count;i++){point.fromBufferAttribute(attr,i);o.applyBoneTransform(i,point);o.localToWorld(point);box.expandByPoint(point);}});
  const scale=manifest.targetHeight/(box.max.y-box.min.y);model.scale.setScalar(scale);model.position.y=-box.min.y*scale;model.rotation.y=manifest.orientationOffset;return model;
}
export async function readFpsRigTestAssets(){
  const character=await readGlb(new URL('../../public/assets/fps/c2a/esmo-fps-character.glb',import.meta.url)),library=await readGlb(new URL('../../public/assets/fps/c2a/esmo-fps-animation-library.glb',import.meta.url));
  const pistol=await readGlb(new URL('../../public/assets/fps/major-weapons-v1/pistol.glb',import.meta.url));
  const imported=[pistol,...await Promise.all(['smg','rifle','sniper','shotgun'].map(family=>readGlb(new URL(`../../public/assets/fps/major-weapons-v1/${family}.glb`,import.meta.url))))];
  const weaponAssets=Object.fromEntries(['pistol','smg','rifle','sniper','shotgun'].map((family,index)=>[family,imported[index].gltf.scene]));
  const hands=await readGlb(new URL('../../public/assets/fps/major-weapons-v1/hands.glb',import.meta.url));imported.push(hands);
  weaponAssets.povHands={right:hands.gltf.scene.getObjectByName('ESMO_POV_Right_AnatomicalHand').geometry,left:hands.gltf.scene.getObjectByName('ESMO_POV_Left_AnatomicalHand').geometry};
  const clips=library.gltf.animations.map(original=>{const clip=original.clone(),roots=/death/i.test(clip.name)?['root']:['root','hips','pelvis'];clip.tracks=clip.tracks.filter(t=>!t.name.endsWith('.position')||!roots.some(root=>t.name.toLowerCase().includes(root)));return clip;});
  return{
    clips,
    originalClips: library.gltf.animations.map(clip=>clip.clone()),
    make({optimized=true,floor=0,gun='m4',continuousClothing=false,mobile=false,importedWeapons=false,operatorId='ct1',side='ct',role='rifler',textiles=null}={}){
      const player={id:operatorId,side,role,gun,hp:100,dead:false,shooting:0,state:'HOLD',pos:{x:17,y:23},va:0,elevation:floor};
      const parent=new THREE.Group();parent.position.set(17,floor,23);
      const c=createFpsCharacterRenderer({parent,player,enabled:false,optimized});
      const model=normalizedClone(character.gltf.scene);c.root.add(model);c.model=model;c.baseModelPosition=model.position.clone();
      c.c2c=createC2cHeroPresentation({root:model,player,optimized,handWeaponMount:optimized,continuousClothing,mobile,weaponAssets:optimized&&importedWeapons?(textiles?{...weaponAssets,povTextiles:textiles}:weaponAssets):null});c.mixer=new THREE.AnimationMixer(model);c.actions=new Map((optimized?library.gltf.animations.map(clip=>projectNonDeathPelvisWorldVertical(clip,model)):clips).map(clip=>[clip.name,c.mixer.clipAction(clip)]));c.mode='rigged';c.boundsSampler=optimized?createFpsBoundsSampler(c.root):null;
      return{c,parent,player,update(overrides={}){const current=overrides.player||player;c.update({player:current,previousPlayer:current,nextPlayer:current,frameRound:1,frameIndex:10,seekNonce:0,dt:.05,playbackActive:true,...overrides});return c;},dispose(){c.dispose();c.mixer.uncacheRoot(model);}};
    },
    unchanged(){return[character,library,...imported].every(a=>fs.readFileSync(a.url).equals(a.original));},
    dispose(){const resources=new Set();for(const a of[character,library,...imported])a.gltf.scene.traverse(o=>{if(o.geometry)resources.add(o.geometry);for(const m of(Array.isArray(o.material)?o.material:[o.material]).filter(Boolean))resources.add(m);});resources.forEach(r=>r.dispose());},
  };
}
