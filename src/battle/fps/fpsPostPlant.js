// Public map geometry and expiring team information only. A reserved angle
// persists until a newly reported flank invalidates its cover.
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
// Teammates share reserved positions. Do not plan a transit through a teammate's
// holding body, especially in a single-file doorway. Leaving an already crowded
// start is legal; re-entering a reserved disc later in the path is not.
export function fpsRouteCrossesTeamReservation(route,player,players,radius=1.35){
 const gap=radius*2+.3;
 return players.some(p=>{
  if(p.id===player.id||p.dead||p.side!==player.side)return false;
  const point=p.postPlantPlan?.point||p.retakeCoverPlan?.point;
  if(!point)return false;
  let leaving=distance(route[0],point)<gap;
  for(let i=1;i<route.length;i++){
   const a=route[i-1],b=route[i];
   if(leaving){if(distance(b,point)>=gap)leaving=false;continue;}
   const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/(dx*dx+dy*dy||1)));
   if(distance({x:a.x+t*dx,y:a.y+t*dy},point)<gap)return true;
  }
  return false;
 });
}
export function planFpsPostPlant({player,players,nodes,bombPos,intel=[],roundSec,walls,blocked,lineBlocked,findRoute,radius=1.35}){
 const known=intel.filter(i=>i.side===player.side&&roundSec>=i.observedAtSec&&roundSec-i.observedAtSec<=3).sort((a,b)=>distance(player.pos,a.pos)-distance(player.pos,b.pos))[0];
 const old=player.postPlantPlan;
 const invalidated=old&&known&&distance(old.threat,known.pos)>12&&!lineBlocked(old.point,known.pos,walls)&&roundSec-old.selectedAtSec>=4;
 if(old&&!invalidated)return old;
 const approach=known?.pos||nodes.ctSpawn,role=player.role;
 const candidates=[];
 for(const [key,node]of Object.entries(nodes)){
  if(key.endsWith('Spawn')||distance(node,bombPos)>32||distance(node,bombPos)<4||blocked(node,walls,radius))continue;
  for(const [dx,dy]of [[0,0],[2.9,0],[-2.9,0],[0,2.9],[0,-2.9]]){
   const point={x:node.x+dx,y:node.y+dy};
   if(point.x<2||point.x>98||point.y<2||point.y>98||distance(point,bombPos)<=4||distance(point,bombPos)>32||blocked(point,walls,radius))continue;
   const reservations=players.filter(p=>p.id!==player.id&&!p.dead&&p.side===player.side);
   if(reservations.some(p=>distance(p.postPlantPlan?.point||p.retakeCoverPlan?.point||p.pos,point)<radius*2+.3))continue;
   const cover=walls.some(w=>distance(point,{x:Math.max(w.x,Math.min(w.x+w.w,point.x)),y:Math.max(w.y,Math.min(w.y+w.h,point.y))})<3.5);
   const bombVisible=!lineBlocked(point,bombPos,walls),exposed=known&&!lineBlocked(point,known.pos,walls);
   const desired=role==='awp'?22:role==='lurker'?26:role==='support'?9:role==='igl'?14:12;
   const score=Math.abs(distance(point,bombPos)-desired)+distance(player.pos,point)*.3+(cover?0:10)+(bombVisible?0:8)+(exposed?12:0);
   candidates.push({key,point,score,cover,bombVisible});
  }
 }
 candidates.sort((a,b)=>a.score-b.score||a.key.localeCompare(b.key)||a.point.x-b.point.x||a.point.y-b.point.y);
 for(const candidate of candidates){
  const route=findRoute(player.pos,candidate.point);
  if(route?.length>1&&distance(route.at(-1),candidate.point)<.1&&!fpsRouteCrossesTeamReservation(route,player,players,radius)){
   const visible=Object.entries(nodes).filter(([key,p])=>!key.endsWith('Spawn')&&distance(candidate.point,p)>8&&!lineBlocked(candidate.point,p,walls))
    .sort((a,b)=>distance(a[1],nodes.ctSpawn)-distance(b[1],nodes.ctSpawn)||a[0].localeCompare(b[0]));
   return {...candidate,threat:{...(known?.pos||visible[0]?.[1]||bombPos)},selectedAtSec:roundSec,reason:invalidated?'reported-flank':'role-cover-bomb-angle',role};
  }
 }
 return old||{point:{...player.pos},threat:{...approach},selectedAtSec:roundSec,reason:'hold-until-reachable-angle',role};
}
