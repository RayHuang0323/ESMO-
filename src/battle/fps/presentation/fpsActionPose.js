import * as THREE from 'three';
// Saved-event semantics, not a fabricated animation clip or gameplay timer.
const UTILITY=new Set(['flash','he','smoke','molly']);
const AIM_STATES=new Set(['ENGAGE','HOLD','架槍','HOLD_ANGLE','COVER','POST_PLANT','ANCHOR']);
const clamp=x=>Math.max(0,Math.min(1,x));
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const smooth=x=>{const t=clamp(x);return t*t*(3-2*t);};
export function fpsAimingSemantic(player={}){
 if(!player)return false;
 if(player.dead)return false;
 return AIM_STATES.has(String(player.state||'').toUpperCase())||AIM_STATES.has(String(player.objectiveState||'').toUpperCase())||Number(player.shooting)>0;
}
function validEvent(event,player,frameRound){
 return event?.type==='utility-throw'&&event.playerId===player.id&&UTILITY.has(event.utility)&&finite(event.roundSec)
  &&(!finite(frameRound)||!finite(event.round)||event.round===frameRound+1);
}
export function deriveFpsActionPose({player={},roundSec,frameRound,events=[],nextEvents=[],defuse=null}={}){
 player=player||{};
 const base={active:false,kind:'none',phase:null,weight:0,aiming:fpsAimingSemantic(player),claimsAuthoredClip:false,writeDomain:false,disableWeaponGrip:false,hideFirearm:false,heldUtility:null,releaseAtRoundSec:null};
 if(player.dead||!finite(roundSec))return base;
 const thrown=events.filter(e=>validEvent(e,player,frameRound)&&e.roundSec<=roundSec).sort((a,b)=>b.roundSec-a.roundSec)[0];
 const historical=finite(player.lastUtilityAtSec)&&UTILITY.has(player.lastUtilityType)&&player.lastUtilityAtSec<=roundSec?{roundSec:player.lastUtilityAtSec,utility:player.lastUtilityType}:null;
 const upcoming=nextEvents.filter(e=>validEvent(e,player,frameRound)&&e.roundSec>roundSec&&e.roundSec-roundSec<=.22).sort((a,b)=>a.roundSec-b.roundSec)[0];
 const released=[thrown,historical].filter(Boolean).sort((a,b)=>b.roundSec-a.roundSec)[0];
 const release=upcoming||released;
 if(release){
  const age=roundSec-release.roundSec;
  if(age>=-.22-1e-9&&age<.56-1e-9){
   const phase=age<0?'draw':age<.14?'release':'recover';
   const progress=phase==='draw'?clamp((age+.22)/.22):phase==='release'?clamp(age/.14):clamp((age-.14)/.42);
   const weight=phase==='draw'?smooth(progress):phase==='release'?1:1-smooth(progress);
   // Release remains at the saved authoritative time. Never delay the projectile for animation.
   return{...base,active:true,kind:'utility',phase,progress,weight,utility:release.utility,releaseAtRoundSec:release.roundSec,source:upcoming?'next-authoritative-event':thrown&&thrown.roundSec===release.roundSec?'authoritative-event':'saved-player-lastUtility',disableWeaponGrip:true,hideFirearm:true,heldUtility:age<0?release.utility:null,provisionalBoneGuides:{upperarm_r:{pitch:weight*(phase==='draw'?-.75:.55),yaw:weight*-.18},lowerarm_r:{flex:weight*.9},hand_r:{pitch:weight*-.16},upperarm_l:{pitch:weight*-.18},hand_l:{pitch:weight*.1}}};
  }
 }
 const plant=player.hasBomb===true&&['安裝中','安裝前進'].includes(player.state)&&finite(player.plantProgressSec)&&player.plantProgressSec>0&&player.plantProgressSec<3;
 const disarm=player.state==='拆彈中'&&defuse?.defuserId===player.id&&finite(defuse.progress)&&defuse.progress>0&&defuse.progress<3.5;
 if(plant||disarm){
  const progress=clamp((plant?player.plantProgressSec:defuse.progress)/(plant?3:3.5));
  return{...base,active:true,kind:plant?'plant':'defuse',phase:'interact',progress,weight:1,source:plant?'actual-plantProgressSec-and-state':'actual-frame-defuse-owner-and-progress',disableWeaponGrip:true,hideFirearm:true,heldUtility:null,provisionalBoneGuides:{upperarm_r:{pitch:.42},lowerarm_r:{flex:.72},hand_r:{pitch:-.18},upperarm_l:{pitch:.42},lowerarm_l:{flex:.72},hand_l:{pitch:-.18}},object:'C4',isThrow:false};
 }
 return base;
}

// Solve in measured world-space arm lengths, rather than guessing GLB Euler axes.
export function createFpsActionArmPose({model}){
 if(!model)return null;
 const chains=['r','l'].map(s=>['upperarm','lowerarm','hand'].map(n=>model.getObjectByName(n+'_'+s)));
 if(chains.some(c=>c.some(b=>!b?.isBone)))return null;
 const bones=[...new Set(chains.flat())],saved=new Map(),vectors=Array.from({length:12},()=>new THREE.Vector3()),q=Array.from({length:4},()=>new THREE.Quaternion());
 let active=false,diagnostic={kind:'none',applied:false};
 const restore=()=>{for(const [b,rotation]of saved)b.quaternion.copy(rotation);saved.clear();active=false;};
 const orient=(bone,child,target)=>{
  bone.getWorldPosition(vectors[0]);child.getWorldPosition(vectors[1]);vectors[2].subVectors(vectors[1],vectors[0]).normalize();vectors[3].subVectors(target,vectors[0]).normalize();
  q[0].setFromUnitVectors(vectors[2],vectors[3]);bone.getWorldQuaternion(q[1]);q[1].premultiply(q[0]);bone.parent.getWorldQuaternion(q[2]).invert();bone.quaternion.copy(q[2].multiply(q[1]));model.updateWorldMatrix(true,true);
 };
 function solve(chain,target,pole){
  const [upper,lower,hand]=chain;upper.getWorldPosition(vectors[4]);lower.getWorldPosition(vectors[5]);hand.getWorldPosition(vectors[6]);
  const a=vectors[4].distanceTo(vectors[5]),b=vectors[5].distanceTo(vectors[6]);if(a<.01||b<.01)return;
  vectors[7].subVectors(target,vectors[4]);const d=Math.max(Math.abs(a-b)+.005,Math.min(a+b-.005,vectors[7].length()));vectors[7].normalize();
  vectors[8].copy(pole).addScaledVector(vectors[7],-pole.dot(vectors[7])).normalize();if(vectors[8].lengthSq()<.1)vectors[8].set(0,-1,0);
  const along=(a*a+d*d-b*b)/(2*d),off=Math.sqrt(Math.max(0,a*a-along*along));
  vectors[9].copy(vectors[4]).addScaledVector(vectors[7],along).addScaledVector(vectors[8],off);
  vectors[10].copy(vectors[4]).addScaledVector(vectors[7],d);const elbow=vectors[9].clone(),wrist=vectors[10].clone();orient(upper,lower,elbow);orient(lower,hand,wrist);
 }
 return{restore,apply({pose,player}){
  if(!pose.active||player.dead){diagnostic={kind:'none',applied:false};return;}
  for(const b of bones)saved.set(b,b.quaternion.clone());model.updateWorldMatrix(true,true);
  const yaw=(Number(player.va)||0)*Math.PI/180,forward=new THREE.Vector3(Math.cos(yaw),0,Math.sin(yaw)),right=new THREE.Vector3(-Math.sin(yaw),0,Math.cos(yaw));
  for(let side=0;side<2;side++){
   const chain=chains[side];chain[0].getWorldPosition(vectors[11]);chain[2].getWorldPosition(vectors[6]);let reach,height;
   if(pose.kind==='utility'){reach=pose.phase==='draw'?-.13:.50;height=pose.phase==='draw'?.26:.16;if(side===1){reach=.20;height=-.18;}}
   else{reach=.34;height=-.46;}
   const target=vectors[11].clone().addScaledVector(forward,reach).addScaledVector(right,side===0?.04:-.04);target.y+=height;
   target.lerp(vectors[6],1-pose.weight);solve(chain,target,right.clone().multiplyScalar(side===0?1:-1).add(new THREE.Vector3(0,-.35,0)));
  }
  active=true;diagnostic={kind:pose.kind,phase:pose.phase,applied:true,releaseAtRoundSec:pose.releaseAtRoundSec,source:pose.source,handRight:chains[0][2].getWorldPosition(new THREE.Vector3()).toArray()};
 },get active(){return active;},diagnostics:()=>diagnostic};
}
