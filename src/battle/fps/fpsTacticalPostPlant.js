import {planFpsPostPlant,fpsRouteCrossesTeamReservation} from './fpsPostPlant.js';
import {hasFpsDirectionalCover} from './fpsObjectiveDiscipline.js';
import {assessFpsPostPlantPeek} from './fpsPostPlantCover.js';
const d=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const angle=(a,b,c)=>{
 const ux=a.x-c.x,uy=a.y-c.y,vx=b.x-c.x,vy=b.y-c.y;
 return Math.acos(Math.max(-1,Math.min(1,(ux*vx+uy*vy)/(Math.hypot(ux,uy)*Math.hypot(vx,vy)||1))))*180/Math.PI;
};

// Public entrance geometry and expiring team reports only. No opponent actor
// list or authored ambush coordinates enter this planner. Wall faces generate
// candidates; the canonical navigator proves that the reservation is reachable.
export function planFpsTacticalPostPlant(args){
 if(!args.entries?.length)return planFpsPostPlant(args);
 const {player,players,nodes,bombPos,intel=[],roundSec,walls,blocked,lineBlocked,findRoute,radius=1.35}=args;
 const teammates=players.filter(p=>p.id!==player.id&&!p.dead&&p.side===player.side);
 const teamKey=teammates.map(p=>p.id).sort().join(',');
 const known=intel.filter(i=>i.side===player.side&&roundSec>=i.observedAtSec&&roundSec-i.observedAtSec<=3)
  .sort((a,b)=>d(player.pos,a.pos)-d(player.pos,b.pos))[0];
 const old=player.postPlantPlan;
 const exposedFlank=old&&known&&d(old.threat,known.pos)>10&&!lineBlocked(old.point,known.pos,walls);
 const teamChanged=old&&old.teamKey!==teamKey;
 const audibleDefuse=args.defuseHeard&&old&&!old.bombVisible;
 const needsThrowSpace=args.defuseHeard&&args.utilitySafetyDistance&&old&&d(old.point,bombPos)<args.utilitySafetyDistance+.3;
 if(old&&roundSec-old.selectedAtSec<4)return old;
 if(old&&!exposedFlank&&!teamChanged&&!audibleDefuse&&!needsThrowSpace&&old.reason!=='waiting-for-reachable-cover')return old;
 const entries=args.entries.map(key=>({key,pos:nodes[key]})).filter(e=>e.pos&&d(e.pos,bombPos)>5);
 const reservations=teammates.map(p=>p.postPlantPlan||p.retakeCoverPlan).filter(Boolean);
 const points=[];
 for(const [key,p]of Object.entries(nodes))if(!key.endsWith('Spawn'))points.push({key,point:p});
 const pad=radius+.8;
 for(const [i,w]of walls.entries()){
  const near={x:Math.max(w.x,Math.min(w.x+w.w,bombPos.x)),y:Math.max(w.y,Math.min(w.y+w.h,bombPos.y))};
  if(d(near,bombPos)>29)continue;
  const xs=[w.x-pad,w.x+w.w+pad],ys=[w.y-pad,w.y+w.h+pad];
  for(const x of xs)for(const y of ys)points.push({key:`wall-${i}-corner`,point:{x,y}});
  for(const x of xs)points.push({key:`wall-${i}-face`,point:{x,y:near.y}});
  for(const y of ys)points.push({key:`wall-${i}-face`,point:{x:near.x,y}});
  // Foundry只增加真牆角的探頭位置；normal方向仍保持原導航淨空，
  // tangent方向靠近遮擋邊緣，不再只站在兩軸都退開的遠角落。
  if(args.requirePeekCover){
   for(const x of xs)for(const y of[w.y-radius*.5,w.y+w.h+radius*.5])points.push({key:`wall-${i}-peek`,point:{x,y}});
   for(const y of ys)for(const x of[w.x-radius*.5,w.x+w.w+radius*.5])points.push({key:`wall-${i}-peek`,point:{x,y}});
   // 入口→牆角的遮擋邊界投影到合法淨空面，再向開口側微退。
   // 中心能看入口、半身仍在牆影內；後面的可見身體與退步檢查
   // 決定是否採用，不將導航膠囊邊緣的遮擋當成角色掩護。
   for(const entry of entries){
    const e=entry.pos;
    for(const [x,cx]of[[xs[0],w.x],[xs[1],w.x+w.w]])for(const [cy,sign]of[[w.y,-1],[w.y+w.h,1]]){
     const t=(x-e.x)/(cx-e.x);
     if(Number.isFinite(t)&&t>1)points.push({key:`wall-${i}-peek-${entry.key}`,point:{x,y:e.y+t*(cy-e.y)+sign*.04}});
    }
    for(const [y,cy]of[[ys[0],w.y],[ys[1],w.y+w.h]])for(const [cx,sign]of[[w.x,-1],[w.x+w.w,1]]){
     const t=(y-e.y)/(cy-e.y);
     if(Number.isFinite(t)&&t>1)points.push({key:`wall-${i}-peek-${entry.key}`,point:{x:e.x+t*(cx-e.x)+sign*.04,y}});
    }
   }
  }
 }
 const candidates=[],dedup=new Set();
 for(const {key,point}of points){
  const id=`${point.x.toFixed(2)},${point.y.toFixed(2)}`;
  if(dedup.has(id))continue;dedup.add(id);
  const bombDistance=d(point,bombPos);
  if(args.defuseHeard&&args.utilitySafetyDistance&&bombDistance<args.utilitySafetyDistance+.3)continue;
  if(point.x<8||point.x>92||point.y<8||point.y>92||bombDistance<4||bombDistance>30||blocked(point,walls,radius+.65))continue;
  if(teammates.some(p=>d(p.postPlantPlan?.point||p.retakeCoverPlan?.point||p.pos,point)<radius*2+.4))continue;
  const nearby=walls.filter(w=>d(point,{x:Math.max(w.x,Math.min(w.x+w.w,point.x)),y:Math.max(w.y,Math.min(w.y+w.h,point.y))})<3.6);
  if(!nearby.length)continue;
  const visible=entries.filter(e=>!lineBlocked(point,e.pos,walls));
  const shielded=entries.filter(e=>hasFpsDirectionalCover({player:{pos:point},threat:e.pos,walls:nearby,lineBlocked}));
  const bombVisible=!lineBlocked(point,bombPos,walls);
  if(!shielded.length||!visible.length&&!bombVisible)continue;
  for(const entry of visible.length?visible:[{key:'bomb-denial',pos:bombPos}]){
   if(args.requirePeekCover&&!assessFpsPostPlantPeek({point,entry:entry.pos,walls,lineBlocked,blocked,stepClear:args.stepClear,radius}).valid)continue;
   const sameLane=reservations.filter(r=>r.entryKey===entry.key);
   const crossfire=sameLane.some(r=>angle(point,r.point,entry.pos)>=25&&d(point,r.point)>=5);
   const duplicate=sameLane.some(r=>angle(point,r.point,entry.pos)<25);
   const exposed=known&&!lineBlocked(point,known.pos,walls);
   const desired=player.role==='awp'?21:player.role==='lurker'?24:player.role==='support'?10:14;
   const score=Math.abs(bombDistance-desired)*.45+d(player.pos,point)*.7+
    (bombVisible?0:args.defuseHeard?24:7)+(exposed?9:0)+Math.max(0,visible.length-2)*3+
    (duplicate?9:0)+(sameLane.length&&!crossfire?5:0)-(crossfire?5:0);
   candidates.push({key,point:{...point},score,cover:true,bombVisible,entryKey:entry.key,threat:{...entry.pos},
    coveredEntries:shielded.map(e=>e.key),visibleEntries:visible.map(e=>e.key),crossfire});
  }
 }
 candidates.sort((a,b)=>a.score-b.score||a.key.localeCompare(b.key)||a.entryKey.localeCompare(b.entryKey));
 for(const c of candidates.slice(0,24)){
  const route=findRoute(player.pos,c.point);
  if(!route?.length||d(route.at(-1),c.point)>.1||fpsRouteCrossesTeamReservation(route,player,players,radius))continue;
  const routeLength=route.slice(1).reduce((n,p,i)=>n+d(p,route[i]),0);
  if(routeLength>45)continue;
  return {...c,routeLength,selectedAtSec:roundSec,teamKey,role:player.role,
   reason:audibleDefuse?'audible-defuse':exposedFlank?'reported-flank':teamChanged?'teammate-loss-rebalance':'entrance-cover-crossfire',
   informationSource:known?'ttl-team-report-and-public-geometry':'public-geometry-and-teammate-reservations'};
 }
 // A failed search is explicit and retried after the commitment interval. It
 // cannot certify exposed ground as valid cover or run a perpetual patrol.
 if(args.requirePeekCover)return{point:{...player.pos},threat:{...(known?.pos||entries[0]?.pos||bombPos)},selectedAtSec:roundSec,teamKey,cover:false,bombVisible:!lineBlocked(player.pos,bombPos,walls),reason:'waiting-for-reachable-cover',role:player.role};
 return old?{...old,teamKey,selectedAtSec:roundSec}:{point:{...player.pos},threat:{...(known?.pos||entries[0]?.pos||bombPos)},
  selectedAtSec:roundSec,teamKey,cover:false,bombVisible:!lineBlocked(player.pos,bombPos,walls),reason:'waiting-for-reachable-cover',role:player.role};
}
