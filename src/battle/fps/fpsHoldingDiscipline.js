import {hasFpsDirectionalCover} from './fpsObjectiveDiscipline.js';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const finite=p=>Number.isFinite(p?.x)&&Number.isFinite(p?.y);

// Public approaches are map knowledge, never live opponent coordinates. Keep
// separated directions so a wall on the spawn axis cannot certify every flank.
export function fpsPublicApproaches({player,nodes,anchor=player.pos}){
 const spawn=nodes[player.side==='ct'?'tSpawn':'ctSpawn'];
 if(!finite(spawn))return [];
 const candidates=Object.entries(nodes).filter(([key,p])=>finite(p)&&!key.endsWith('Spawn')&&distance(anchor,p)>=8&&distance(anchor,p)<=38&&distance(p,spawn)<distance(anchor,spawn)+4)
  .sort((a,b)=>distance(a[1],spawn)-distance(b[1],spawn)||a[0].localeCompare(b[0]));
 const chosen=[];
 for(const [key,pos]of candidates){const bearing=Math.atan2(pos.y-anchor.y,pos.x-anchor.x);if(chosen.every(c=>Math.abs(Math.atan2(Math.sin(bearing-c.bearing),Math.cos(bearing-c.bearing)))>.55))chosen.push({key,pos:{...pos},bearing});if(chosen.length===3)break;}
 return chosen.length?chosen:[{key:'public-spawn-approach',pos:{...spawn}}];
}

export function assessFpsHold({player,approaches,walls,lineBlocked}){
 const lanes=approaches.filter(a=>finite(a.pos)).map(a=>({...a,protected:hasFpsDirectionalCover({player,threat:a.pos,walls,lineBlocked})}));
 const protectedCount=lanes.filter(a=>a.protected).length;
 return {protected:protectedCount>0,protectedCount,exposedCount:lanes.length-protectedCount,lanes,source:'public-route-directions'};
}

// A real cover assignment has a destination and an arrival condition. Becoming
// partly occluded half way along its route is not task completion, nor a reason
// to replay the old authored patrol. A newly visible threat may interrupt it.
export function continueFpsCoverAssignment({player,intent,phase,roundSec,walls,lineBlocked}){
 const plan=player.holdCoverPlan;
 if(!plan||plan.phase!==phase||!['hold','peek','take-cover'].includes(intent.kind))return null;
 const threatChanged=finite(intent.aim)&&distance(intent.aim,plan.threat)>10&&!hasFpsDirectionalCover({player:{...player,pos:plan.point},threat:intent.aim,walls,lineBlocked});
 if(threatChanged)return null;
 const arrived=distance(player.pos,plan.point)<=.55;
 return {...intent,kind:'take-cover',routeTarget:{...plan.point},pace:arrived?0:1,stopMovement:arrived,coverAssignment:{selectedAtSec:plan.selectedAtSec,reason:arrived?'arrived-hold-covered-angle':'finish-reachable-cover',phase,ageSec:roundSec-plan.selectedAtSec}};
}

export function chooseFpsPublicHold({player,nodes,walls,players,blocked,lineBlocked,findRoute,radius,roundSec,phase,canHold=null}){
 const anchor=player.route?.at(-1)||player.pos,approaches=fpsPublicApproaches({player,nodes,anchor});
 const current=assessFpsHold({player,approaches,walls,lineBlocked});
 if(current.protected&&current.exposedCount<=1&&(!canHold||canHold(player.pos)))return null;
 const candidates=[];
 for(const wall of walls){
  const near={x:Math.max(wall.x,Math.min(wall.x+wall.w,anchor.x)),y:Math.max(wall.y,Math.min(wall.y+wall.h,anchor.y))};
  if(distance(anchor,near)>10)continue;
  // Match plannerSafePoint's existing R+0.65 clearance. Closer samples were
  // projected away by navigation, so the actor could never reach its cover goal.
  const pad=radius+.70;
  const xs=[wall.x-pad,wall.x+wall.w+pad],ys=[wall.y-pad,wall.y+wall.h+pad];
  const points=[...xs.flatMap(x=>ys.map(y=>({x,y}))),...xs.map(x=>({x,y:near.y})),...ys.map(y=>({x:near.x,y}))];
  if(canHold)for(const offset of [-4,-2,2,4]){
   const x=Math.max(wall.x,Math.min(wall.x+wall.w,near.x+offset)),y=Math.max(wall.y,Math.min(wall.y+wall.h,near.y+offset));
   for(const edge of ys)points.push({x,y:edge});
   for(const edge of xs)points.push({x:edge,y});
  }
  for(const point of points){
   const {x,y}=point;if(x<3||x>97||y<3||y>97||distance(point,anchor)>10||blocked(point,walls,radius))continue;
   if(players.some(p=>p.id!==player.id&&!p.dead&&p.side===player.side&&distance(p.holdCoverPlan?.point||p.pos,point)<radius*2+.3))continue;
   const quality=assessFpsHold({player:{...player,pos:point},approaches,walls,lineBlocked});
   // A position with no firing lane cannot improve unless one covered
   // approach becomes a controlled peek. Retain cover on another approach;
   // score the added exposure normally rather than accepting open ground.
   if(!quality.protected||quality.exposedCount>(canHold?Math.max(1,current.exposedCount+1):current.exposedCount))continue;
   if(canHold&&!canHold(point))continue;
   const visibleAngle=approaches.some(a=>!lineBlocked(point,a.pos,walls));
   const score=quality.exposedCount*7+(visibleAngle?0:4)+distance(player.pos,point)*.5+distance(point,anchor)*.3;
   candidates.push({point,quality,score});
  }
 }
 candidates.sort((a,b)=>a.score-b.score||a.point.x-b.point.x||a.point.y-b.point.y);
 for(const candidate of candidates.slice(0,12)){
  const route=findRoute(player.pos,candidate.point);
  if(!route?.length||distance(route.at(-1),candidate.point)>.3)continue;
  const length=route.slice(1).reduce((n,p,i)=>n+distance(p,route[i]),0);
  if(length>18)continue;
  return {...candidate,threat:{...approaches[0].pos},phase,selectedAtSec:roundSec,reason:'public-lanes-directional-cover',approaches};
 }
 return null;
}
