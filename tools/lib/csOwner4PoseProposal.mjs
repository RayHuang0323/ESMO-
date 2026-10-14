// Review-only semantic proposal. No product imports, clip claims, mixer/Store writes.
// Angles below are provisional local-space art guides; actual GLB axes need calibration.
const UTILITY=new Set(['flash','he','smoke','molly']);
const AIM_STATES=new Set(['ENGAGE','HOLD','架槍','HOLD_ANGLE','COVER','POST_PLANT','ANCHOR']);
const clamp=x=>Math.max(0,Math.min(1,x));
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const smooth=x=>{const t=clamp(x);return t*t*(3-2*t);};
export function owner4AimingSemantic(player={}){
 if(player.dead)return false;
 return AIM_STATES.has(String(player.state||'').toUpperCase())||AIM_STATES.has(String(player.objectiveState||'').toUpperCase())||Number(player.shooting)>0;
}
function validEvent(event,player,frameRound){
 return event?.type==='utility-throw'&&event.playerId===player.id&&UTILITY.has(event.utility)&&finite(event.roundSec)
  &&(!finite(frameRound)||!finite(event.round)||event.round===frameRound+1);
}
export function deriveOwner4PoseProposal({player={},roundSec,frameRound,events=[],nextEvents=[],defuse=null}={}){
 const base={active:false,kind:'none',phase:null,weight:0,aiming:owner4AimingSemantic(player),claimsAuthoredClip:false,writeDomain:false,disableWeaponGrip:false,hideFirearm:false,heldUtility:null,releaseAtRoundSec:null,requiresBoneAxisCalibration:true};
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
 const plant=player.hasBomb===true&&player.state==='安裝中'&&finite(player.plantProgressSec)&&player.plantProgressSec>0&&player.plantProgressSec<3;
 const disarm=player.state==='拆彈中'&&defuse?.defuserId===player.id&&finite(defuse.progress)&&defuse.progress>0&&defuse.progress<3.5;
 if(plant||disarm){
  const progress=clamp((plant?player.plantProgressSec:defuse.progress)/(plant?3:3.5));
  return{...base,active:true,kind:plant?'plant':'defuse',phase:'interact',progress,weight:1,source:plant?'actual-plantProgressSec-and-state':'actual-frame-defuse-owner-and-progress',disableWeaponGrip:true,hideFirearm:true,heldUtility:null,provisionalBoneGuides:{upperarm_r:{pitch:.42},lowerarm_r:{flex:.72},hand_r:{pitch:-.18},upperarm_l:{pitch:.42},lowerarm_l:{flex:.72},hand_l:{pitch:-.18}},object:'C4',isThrow:false};
 }
 return base;
}
