// Presentation from saved actor stance + the saved, legally selected aim point.
// No opponent lookup, live target acquisition, RNG or simulation writes.
import {isFpsCalibratedPovScene} from '../fpsTacticalScene.js';
const finite=p=>Number.isFinite(p?.x)&&Number.isFinite(p?.y);
const mix=(a,b,t)=>a+(b-a)*t;
export function resolveFpsPovSightline({player,nextPlayer,sub=0,sceneVersion,layoutId,groundHeightAt}){
 if(!isFpsCalibratedPovScene(sceneVersion,layoutId))return{eyeHeight:1.56,aim:null};
 // Stable stance anchors match the measured standing/crouched rig heads;
 // following the animated bone directly would add breathing camera jitter.
 const eye=p=>p?.stance==='crouched'?1.06:1.56;
 const t=Math.max(0,Math.min(1,sub)),eyeHeight=nextPlayer?mix(eye(player),eye(nextPlayer),t):eye(player);
 const plan=player?.awareness?.anglePlan,next=nextPlayer?.awareness?.anglePlan;
 if(!finite(plan?.target))return{eyeHeight,aim:null};
 const interpolate=finite(next?.target)&&next.key===plan.key;
 const point=interpolate?{x:mix(plan.target.x,next.target.x,t),y:mix(plan.target.y,next.target.y,t)}:plan.target;
 return{eyeHeight,aim:{...point,height:groundHeightAt(point)+1.45},source:'saved-actor-stance-and-authorized-aim'};
}
export function fpsPovLookHeight({eye,look,aim}){
 const range=Math.hypot(aim.x-eye.x,aim.z-eye.z);
 if(range<.5||!Number.isFinite(aim.y))return eye.y;
 return eye.y+(aim.y-eye.y)*Math.hypot(look.x-eye.x,look.z-eye.z)/range;
}
