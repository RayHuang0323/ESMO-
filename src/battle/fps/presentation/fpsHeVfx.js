import {createOriginalUtilityTextures} from "./fpsOriginalUtilityTextures.js";
import * as THREE from 'three';

// Original supporting VFX: small warm contact, finite sparks, brown-grey dust.
// No scene lights, white glow sprites, shaders, post-processing or damage state.
// Every pose derives from the saved detonation time; wall time is never read.
export const HE_VFX_CONTRACT=Object.freeze({version:'esmo-he-vfx.v1',maximumBursts:4,sparksPerBurst:6,dustLayers:3,contactSec:.18,sparksSec:.32,dustSec:1.10,maximumVisibleObjects:44,maximumDrawCalls:44,postprocessing:'none',reducedMotion:'no moving sparks; retained warm contact and physical dust, no ground circles'});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const seed=id=>{let v=2166136261;for(const c of String(id)){v^=c.charCodeAt(0);v=Math.imul(v,16777619);}return v>>>0;};
export function getHeVisualAge({frame,nextFrame,sub=0,throwable}){
 if(throwable?.type!=='he'||throwable.flying||!Number.isFinite(throwable.detonatedAtRoundSec)||!Number.isFinite(frame?.roundSec))return null;
 const span=nextFrame?.rnd===frame.rnd&&Number.isFinite(nextFrame.roundSec)?Math.max(0,nextFrame.roundSec-frame.roundSec):0;
 const sample=frame.roundSec+clamp(Number(sub)||0,0,1)*span;
 if(sample<throwable.detonatedAtRoundSec)return null;
 return sample-throwable.detonatedAtRoundSec;
}
export function createHeVfx({group,smokeTexture,reducedMotion=false}){
 const originalTextures=createOriginalUtilityTextures(),sparkGeometry=new THREE.BoxGeometry(.014,.075,.012),materials=[],slots=[];let disposed=false;
 const mat=(color)=>{const m=new THREE.MeshBasicMaterial({color,transparent:true,opacity:0,depthTest:true,depthWrite:false,toneMapped:false,blending:THREE.NormalBlending});materials.push(m);return m;};
 const spriteMat=()=>{const m=new THREE.SpriteMaterial({map:originalTextures.smoke,color:0x6e6256,transparent:true,opacity:0,depthTest:true,depthWrite:false,toneMapped:false,fog:true});materials.push(m);return m;};
 for(let index=0;index<4;index++){
  const root=new THREE.Group();root.name='fps-he-vfx-slot-'+index;group.add(root);
  const flame=(color)=>{const m=new THREE.SpriteMaterial({map:originalTextures.fire,color,transparent:true,opacity:0,depthTest:true,depthWrite:false,toneMapped:false,blending:THREE.NormalBlending});materials.push(m);return m;};
  const contact=[new THREE.Sprite(flame(0xeab46f)),new THREE.Sprite(flame(0xde8d45))];
  const sparkMaterial=mat(0xc88d45),sparks=Array.from({length:6},()=>new THREE.Mesh(sparkGeometry,sparkMaterial)),dust=Array.from({length:3},()=>new THREE.Sprite(spriteMat()));
  contact.forEach((o,i)=>o.name=`fps-he-contact-${index}-${i}`);sparks.forEach((o,i)=>o.name=`fps-he-spark-${index}-${i}`);dust.forEach((o,i)=>o.name=`fps-he-dust-${index}-${i}`);
  [...contact,...sparks,...dust].forEach(o=>{o.visible=false;o.frustumCulled=false;root.add(o);});slots.push({root,contact,sparks,dust});
 }
 const diagnostic={active:0,contacts:0,sparks:0,dust:0,ages:[],visibleObjects:0,reducedMotion};
 const update=({frame,nextFrame,sub=0,W,sampleGroundHeight=()=>0})=>{
  if(disposed)return diagnostic;
  slots.forEach(s=>s.root.children.forEach(o=>o.visible=false));Object.assign(diagnostic,{active:0,contacts:0,sparks:0,dust:0,ages:[],visibleObjects:0});
  for(const throwable of frame?.throwables||[]){
   const age=getHeVisualAge({frame,nextFrame,sub,throwable});
   if(age===null||age>=1.10||!Number.isFinite(throwable.to?.x)||!Number.isFinite(throwable.to?.y)||diagnostic.active>=4)continue;
   const slot=slots[diagnostic.active++],hash=seed(throwable.id);diagnostic.ages.push({id:throwable.id,age});
   const x=W.vx(throwable.to.x),z=W.vz(throwable.to.y),floor=sampleGroundHeight(x,z);
   if(age<.18)slot.contact.forEach((o,i)=>{const k=age/.18;o.position.set(x,floor+.58+i*.10,z);o.scale.set(.85+k*.55,.85+k*.55,1);o.rotation.set(.2+i,.35+(hash%11)*.1,.18);o.material.opacity=(i?.42:.72)*(1-k);o.visible=o.material.opacity>.005;if(o.visible)diagnostic.contacts++;});
   if(!reducedMotion&&age<.32)slot.sparks.forEach((o,i)=>{const k=age/.32,angle=(hash%360)*Math.PI/180+i*Math.PI/3,travel=.08+age*(2.2+(i%3)*.7);o.position.set(x+Math.cos(angle)*travel,floor+.52+age*(2.1+i*.16)-age*age*5,z+Math.sin(angle)*travel);o.rotation.set(i*.43,angle,Math.PI/3+age*3);o.material.opacity=.68*(1-k);o.visible=o.material.opacity>.005;if(o.visible)diagnostic.sparks++;});
   slot.dust.forEach((o,i)=>{const k=age/1.1,angle=(hash%360)*Math.PI/180+i*2.1,drift=reducedMotion?0:age*(.25+i*.13);o.position.set(x+Math.cos(angle)*drift,floor+.44+i*.23+(reducedMotion?0:age*.42),z+Math.sin(angle)*drift);o.scale.set((.86+k*2.05)*(1-i*.12),(.60+k*1.35)*(1-i*.09),1);o.material.color.setHex(i===1?0x575a55:0x6e6256);o.material.opacity=(.64-i*.10)*(1-k);o.visible=o.material.opacity>.005;if(o.visible)diagnostic.dust++;});
  }
  diagnostic.visibleObjects=diagnostic.contacts+diagnostic.sparks+diagnostic.dust;return diagnostic;
 };
 return {update,diagnostics:()=>({...diagnostic,ages:diagnostic.ages.map(a=>({...a}))}),contract:HE_VFX_CONTRACT,dispose(){if(disposed)return;disposed=true;slots.forEach(s=>{s.root.removeFromParent();s.root.clear();});materials.forEach(m=>m.dispose());originalTextures.dispose();sparkGeometry.dispose();}};
}
