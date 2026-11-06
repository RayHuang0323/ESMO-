// CT-only objective arbitration. Inputs contain teammates, public C4 geometry,
// canonical route estimates and expiring reported threats; no enemy actors/RNG.
import {fpsBombInteractionGeometry} from './fpsInteractionGeometry.js';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export const FPS_RETAKE_SAFETY_SEC=1;
export const FPS_RETAKE_CLEARANCE_SEC=2;
export const FPS_RETAKE_ESCAPE_DISTANCE=24;

export function fpsRetakeDestinationEligible(pos,bombPos,{groundHeightAt,lineBlocked,walls}){
 return fpsBombInteractionGeometry({pos},bombPos,{groundHeightAt}).eligible&&!lineBlocked(pos,bombPos,walls);
}

export function estimateFpsRetakeTravelSec(route,speed){
 if(!route?.length)return Infinity;
 let length=0,slowDistance=0;
 for(let i=1;i<route.length;i++){
  const segment=distance(route[i-1],route[i]);length+=segment;
  if(i<route.length-1){const a=route[i-1],b=route[i],c=route[i+1],next=distance(b,c);
   if(segment>1e-9&&next>1e-9&&((b.x-a.x)*(c.x-b.x)+(b.y-a.y)*(c.y-b.y))/(segment*next)<Math.cos(Math.PI/6))slowDistance+=Math.min(5,segment);
  }
 }
 return (length+slowDistance*(1/.58-1))/Math.max(.1,speed);
}

export function planFpsRetakeObjective({players,bombPos,bombTimeSec,roundSec,defuse,previousOwnerId,travelSecFor,durationSecFor,canInteract,isThreatened}){
 const profiles=players.filter(p=>p.side==='ct'&&!p.dead).map(p=>{
  const interacting=canInteract(p),travelSec=interacting?0:travelSecFor(p),threatened=isThreatened(p);
  const continuing=p.id===defuse?.defuserId&&defuse.progress>0&&!threatened,durationSec=durationSecFor(p,continuing);
  const readySec=Math.max(travelSec,Math.max(0,p.blindSec||0));
  const marginSec=continuing?0:FPS_RETAKE_SAFETY_SEC;
  const clearSec=threatened?FPS_RETAKE_CLEARANCE_SEC:0;
  const requiredSec=readySec+durationSec+marginSec+clearSec;
  return {id:p.id,interacting,threatened,travelSec,durationSec,marginSec,clearSec,requiredSec,
   viable:!p.interactionDisabled&&Number.isFinite(requiredSec)&&requiredSec<=bombTimeSec+1e-12,
   continuing,distance:distance(p.pos,bombPos)};
 });
 const candidates=profiles.filter(p=>p.viable).sort((a,b)=>Number(b.continuing)-Number(a.continuing)||Number(b.interacting&&!b.threatened)-Number(a.interacting&&!a.threatened)||Number(a.threatened)-Number(b.threatened)||a.requiredSec-b.requiredSec||String(a.id).localeCompare(String(b.id)));
 const best=candidates[0],old=candidates.find(p=>p.id===previousOwnerId);
 const owner=old&&!best?.continuing&&(!old.threatened||best.threatened)&&old.requiredSec<=best.requiredSec+1?old:best;
 return {ownerId:owner?.id??null,roundSec,bombTimeSec,source:'public-c4-route-and-expiring-team-intel',profiles};
}

export function fpsRetakeIntent({player,plan,bombPos,base,escapeTarget}){
 const own=plan.profiles.find(p=>p.id===player.id),owner=plan.profiles.find(p=>p.id===plan.ownerId);
 const common={...base,stopMovement:false,pace:1,routeTarget:{...bombPos},retakeOwnerId:plan.ownerId};
 if(!owner){const arrived=escapeTarget&&distance(player.pos,escapeTarget)<=.55;return {...common,kind:'save',routeTarget:escapeTarget,stopMovement:!!arrived,pace:arrived?0:1,source:'public-c4-time-budget',targetId:null,aim:null,observedAtSec:null};}
 if(player.id===owner.id)return {...common,kind:own?.threatened&&own.distance<12?'clear-site':'retake'};
 return {...common,kind:owner.distance<=14?'defuse-cover':'retake'};
}

// Pick a reachable public egress once, then keep it. This is a navigation goal,
// not a new blast/damage rule or a promise that a saving player survives.
export function chooseFpsRetakeEscape({player,bombPos,nodes,findRoute,previous}){
 if(previous&&distance(previous,bombPos)>=FPS_RETAKE_ESCAPE_DISTANCE)return {...previous};
 if(distance(player.pos,bombPos)>=FPS_RETAKE_ESCAPE_DISTANCE)return {...player.pos};
 const candidates=Object.entries(nodes).filter(([,p])=>Number.isFinite(p?.x)&&Number.isFinite(p?.y)&&distance(p,bombPos)>=FPS_RETAKE_ESCAPE_DISTANCE)
  .sort(([a,ap],[b,bp])=>distance(player.pos,ap)-distance(player.pos,bp)||a.localeCompare(b));
 let best=null;
 for(const [key,point]of candidates){
  if(best&&distance(player.pos,point)>best.length)continue;
  const route=findRoute(player.pos,point);if(!route?.length||distance(route.at(-1),point)>.55)continue;
  const length=route.slice(1).reduce((sum,p,i)=>sum+distance(route[i],p),0);
  if(!best||length<best.length)best={key,point,length};
 }
 return best?{...best.point}:null;
}
