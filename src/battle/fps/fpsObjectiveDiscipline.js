// Major-only decisions. Team bomb location, public geometry and TTL team intel;
// no hidden enemies, RNG, damage or forced round results.
import {FPS_PLAYER_COLLISION_RADIUS} from './fpsInteractionGeometry.js';
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const finite=p=>Number.isFinite(p?.x)&&Number.isFinite(p?.y);
export function fpsNeedsObjectiveRouteRecovery(player,intent){
 return ['post-plant-hold','defuse-cover'].includes(intent?.kind)&&finite(intent.routeTarget)&&dist(player.pos,intent.routeTarget)>.55&&player.routeIdx>=player.route.length-1;
}
export function chooseFpsBombRecoverer({players,droppedBomb,currentId,findRoute,intel=[],roundSec=0}){
 if(!finite(droppedBomb?.pos))return null;
 const team=players.filter(p=>!p.dead&&p.side==='t'&&!p.hasBomb),prior=team.find(p=>p.id===currentId);
 const options=[];
 for(const p of prior?[prior]:team){
  const route=findRoute(p.pos,droppedBomb.pos);if(!route||route.length<2)continue;
  const length=route.slice(1).reduce((sum,q,i)=>sum+dist(route[i],q),0);
  const danger=intel.filter(i=>i.side==='t'&&roundSec>=i.observedAtSec&&roundSec-i.observedAtSec<=3&&dist(i.pos,droppedBomb.pos)<14).length;
  options.push({playerId:p.id,route,length,score:length+(p.blindSec>0?12:0)+(p.hp<35?5:0)+danger*2,source:'team-dropped-c4-and-canonical-navigation'});
 }
 if(prior&&!options.length)return chooseFpsBombRecoverer({players,droppedBomb,currentId:null,findRoute,intel,roundSec});
 options.sort((a,b)=>a.score-b.score||String(a.playerId).localeCompare(String(b.playerId)));return options[0]||null;
}

export function fpsObjectiveTimePressure({player,site,roundSec,roundLimitSec=115,movementPerSec=3.12}){
 if(!finite(site)||!finite(player.pos))return false;
 const remaining=[player.pos,...(player.route||[]).slice((player.routeIdx||0)+1)];
 const path=remaining.slice(1).reduce((sum,p,i)=>sum+dist(remaining[i],p),0)+dist(remaining.at(-1),site);
 // Three seconds planting plus twelve seconds to group/clear/recover the angle.
 return roundLimitSec-roundSec<=Math.max(dist(player.pos,site),path)/Math.max(.1,movementPerSec)+15;
}

export function findFpsThreatCover({player,threat,walls,players=[],blocked,navLineBlocked,lineBlocked,radius=1.35}){
 if(!finite(threat)||player.dead)return null;
 const candidates=[];
 for(const w of walls){
  const near={x:Math.max(w.x,Math.min(w.x+w.w,player.pos.x)),y:Math.max(w.y,Math.min(w.y+w.h,player.pos.y))};if(dist(player.pos,near)>12)continue;
  const pad=radius+.22,xs=[w.x-pad,w.x+w.w+pad],ys=[w.y-pad,w.y+w.h+pad];
  for(const point of [...xs.flatMap(x=>[...ys.map(y=>({x,y})),{x,y:Math.max(w.y,Math.min(w.y+w.h,player.pos.y))}]),...ys.map(y=>({x:Math.max(w.x,Math.min(w.x+w.w,player.pos.x)),y}))]){
   if(point.x<2||point.x>98||point.y<2||point.y>98||blocked(point,walls,radius)||dist(player.pos,point)>12||navLineBlocked(player.pos,point,walls)||!hasFpsDirectionalCover({player:{...player,pos:point},threat,walls:[w],lineBlocked})||players.some(p=>p.id!==player.id&&!p.dead&&p.side===player.side&&(dist(p.pos,point)<radius*2||['take-cover','post-plant-cover'].includes(p._routePlan?.kind)&&p.route?.length&&dist(p.route.at(-1),point)<radius*2)))continue;
   candidates.push({point,score:dist(player.pos,point),wall:{x:w.x,y:w.y,w:w.w,h:w.h},threat:{...threat},source:'actual-occlusion-against-known-threat'});
  }
 }
 candidates.sort((a,b)=>a.score-b.score||a.point.x-b.point.x||a.point.y-b.point.y);return candidates[0]||null;
}

export function hasFpsDirectionalCover({player,threat,walls,lineBlocked}){
 if(!finite(threat))return false;
 const length=dist(player.pos,threat);if(length<.001)return false;
 const dx=-(threat.y-player.pos.y)/length*FPS_PLAYER_COLLISION_RADIUS,dy=(threat.x-player.pos.x)/length*FPS_PLAYER_COLLISION_RADIUS;
 return walls.some(w=>{
  if(dist(player.pos,{x:Math.max(w.x,Math.min(w.x+w.w,player.pos.x)),y:Math.max(w.y,Math.min(w.y+w.h,player.pos.y))})>=3.5||!lineBlocked(player.pos,threat,[w]))return false;
  // Require center plus at least one shoulder, not a single infinitesimal ray.
  return lineBlocked({x:player.pos.x+dx,y:player.pos.y+dy},threat,[w])||lineBlocked({x:player.pos.x-dx,y:player.pos.y-dy},threat,[w]);
 });
}
