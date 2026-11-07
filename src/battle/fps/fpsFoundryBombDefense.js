// Foundry B 安包後責任：公開C4互動區／牆／隊友與有效情報，沒有敵方真座標。
import {FPS_C4_CASE,fpsBombInteractionGeometry} from './fpsInteractionGeometry.js';
import {foundryGroundHeight} from './fpsFoundryTerrain.js';
import {FPS_FOUNDRY_CIRCUIT} from './fpsFoundryCircuit.js';
import {foundryPlantZoneContains} from './fpsFoundryPlant.js';
import {assessFpsPostPlantPeek} from './fpsPostPlantCover.js';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const geometryCache=new WeakMap();

// 將C4最大互動矩形依原膠囊禁行邊界切開，保守保留所有可能合法落點。
// 不用敵人當前位置；圓角外的小區域也保留，避免只驗中心／稀疏射線。
export function foundryDefuseEnvelope(bomb,walls,radius=1.35){
 const ex=radius+FPS_C4_CASE.width/2,ey=radius+FPS_C4_CASE.depth/2;
 const cuts=(lo,hi,values)=>[...new Set([lo,hi,...values.filter(v=>v>lo&&v<hi)])].sort((a,b)=>a-b);
 const xs=cuts(bomb.x-ex,bomb.x+ex,walls.flatMap(w=>[w.x-radius,w.x+w.w+radius])),ys=cuts(bomb.y-ey,bomb.y+ey,walls.flatMap(w=>[w.y-radius,w.y+w.h+radius])),cells=[];
 for(let i=1;i<xs.length;i++)for(let j=1;j<ys.length;j++){
  const x=xs[i-1],y=ys[j-1],w=xs[i]-x,h=ys[j]-y,m={x:x+w/2,y:y+h/2};
  if(walls.some(a=>m.x>a.x-radius&&m.x<a.x+a.w+radius&&m.y>a.y-radius&&m.y<a.y+a.h+radius))continue;
  const q={x:Math.max(x,Math.min(x+w,bomb.x)),y:Math.max(y,Math.min(y+h,bomb.y))};
  if(Math.hypot(Math.max(0,Math.abs(q.x-bomb.x)-FPS_C4_CASE.width/2),Math.max(0,Math.abs(q.y-bomb.y)-FPS_C4_CASE.depth/2))<=radius+1e-12)cells.push({x,y,w,h});
 }
 return cells;
}
export function foundryDefuseEnvelopeVisible(point,cells,walls){
 const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
 const hull=points=>{const sorted=points.sort((a,b)=>a.x-b.x||a.y-b.y),a=[],b=[];for(const p of sorted){while(a.length>1&&cross(a.at(-2),a.at(-1),p)<=0)a.pop();a.push(p);}for(const p of sorted.toReversed()){while(b.length>1&&cross(b.at(-2),b.at(-1),p)<=0)b.pop();b.push(p);}return[...a.slice(0,-1),...b.slice(0,-1)];};
 const corners=r=>[{x:r.x,y:r.y},{x:r.x+r.w,y:r.y},{x:r.x+r.w,y:r.y+r.h},{x:r.x,y:r.y+r.h}];
 const intersects=(a,b)=>!a.concat(b).some((p,i,all)=>{const poly=i<a.length?a:b,k=i<a.length?i:i-a.length,q=poly[(k+1)%poly.length],axis={x:-(q.y-p.y),y:q.x-p.x};if(!axis.x&&!axis.y)return false;const A=a.map(v=>v.x*axis.x+v.y*axis.y),B=b.map(v=>v.x*axis.x+v.y*axis.y);return Math.max(...A)<Math.min(...B)-1e-9||Math.max(...B)<Math.min(...A)-1e-9;});
 return cells.length>0&&cells.every(c=>{const swept=hull([{...point},...corners(c)]);return walls.every(w=>!intersects(swept,corners(w)));});
}

// 只保存每場固定幾何衍生結果；不進Replay、不跨walls身份共用。
function publicGeometry({bombPos,nodes,walls,blocked,lineBlocked,stepClear,radius=1.35}){
 let cache=geometryCache.get(walls);if(!cache){cache=new Map();geometryCache.set(walls,cache);}
 const key=[bombPos.x,bombPos.y,radius].join(':'),saved=cache.get(key);
 if(saved&&saved.nodes===nodes&&saved.blocked===blocked&&saved.lineBlocked===lineBlocked&&saved.stepClear===stepClear)return saved;
 const targets=[],cells=foundryDefuseEnvelope(bombPos,walls,radius),extent=radius+Math.max(FPS_C4_CASE.width,FPS_C4_CASE.depth)/2;
 const n=Math.ceil(extent/.3);
 for(let ix=-n;ix<=n;ix++)for(let iy=-n;iy<=n;iy++){
  const point={x:bombPos.x+ix*.3,y:bombPos.y+iy*.3};
  if(!blocked(point,walls,radius)&&fpsBombInteractionGeometry({pos:point},bombPos,{groundHeightAt:foundryGroundHeight}).eligible)targets.push(point);
 }
 const entries=FPS_FOUNDRY_CIRCUIT.retakeEntries.b.map(key=>({key,pos:nodes[key]})).filter(e=>e.pos),raw=[],seen=new Set();
 const push=point=>{const k=point.x.toFixed(5)+':'+point.y.toFixed(5);if(!seen.has(k)&&Number.isFinite(point.x)&&Number.isFinite(point.y)){seen.add(k);raw.push(point);}};
 // 從同一公開牆角陰影邊界求候選；多個合法淨空距離避免只取牆角遠端。
 for(const w of walls){
  const near={x:Math.max(w.x,Math.min(w.x+w.w,bombPos.x)),y:Math.max(w.y,Math.min(w.y+w.h,bombPos.y))};if(distance(near,bombPos)>20)continue;
  for(let i=0;i<7;i++){
   const pad=radius+.65+i*.2,xs=[w.x-pad,w.x+w.w+pad],ys=[w.y-pad,w.y+w.h+pad];
   for(const x of xs)for(const y of ys)push({x,y});
   for(const x of xs)push({x,y:near.y});for(const y of ys)push({x:near.x,y});
   for(const {pos:e}of entries){
    for(const [x,cx]of[[xs[0],w.x],[xs[1],w.x+w.w]])for(const [cy,sign]of[[w.y,-1],[w.y+w.h,1]]){const t=(x-e.x)/(cx-e.x);if(Number.isFinite(t)&&t>1)push({x,y:e.y+t*(cy-e.y)+sign*.04});}
    for(const [y,cy]of[[ys[0],w.y],[ys[1],w.y+w.h]])for(const [cx,sign]of[[w.x,-1],[w.x+w.w,1]]){const t=(y-e.y)/(cy-e.y);if(Number.isFinite(t)&&t>1)push({x:e.x+t*(cx-e.x)+sign*.04,y});}
   }
  }
 }
 const candidates=[];
 for(const point of raw){
  const d=distance(point,bombPos);if(point.x<8||point.x>92||point.y<8||point.y>92||d<4||d>18||blocked(point,walls,radius+.65)||!targets.length||targets.some(t=>lineBlocked(point,t,walls))||!foundryDefuseEnvelopeVisible(point,cells,walls))continue;
  for(const e of entries){const quality=assessFpsPostPlantPeek({point,entry:e.pos,walls,lineBlocked,blocked,stepClear,radius});if(quality.valid)candidates.push({point:{...point},threat:{...e.pos},entryKey:e.key,denialCoverage:{covered:targets.length,total:targets.length,sampleStep:.3,envelopeCells:cells.length,mode:'public-defuse-envelope.v1'},retreat:{...quality.retreat}});}
 }
 const value={targets,cells,candidates,nodes,blocked,lineBlocked,stepClear};if(cache.size>=64)cache.delete(cache.keys().next().value);cache.set(key,value);return value;
}

export function createFoundryBombDefense(args){
 const {players,bombPos,roundSec=0}=args;if(!bombPos||!foundryPlantZoneContains(bombPos,'b',FPS_FOUNDRY_CIRCUIT))return null;
 const team=players.filter(p=>p.side==='t'&&!p.dead);if(!team.length)return null;
 const geometry=publicGeometry(args);
 const prior=team.filter(p=>p.postPlantPlan?.duty==='bomb-denial'&&p.postPlantPlan.denialOwnerId===p.id&&p.postPlantPlan.cover===true).sort((a,b)=>String(a.id).localeCompare(String(b.id)))[0];
 const rank=p=>distance(p.pos,bombPos)+(['awp','scout'].includes(p.gun)?8:0)+(p.blindSec>0?3:0);
 const ranked=[...team].sort((a,b)=>rank(a)-rank(b)||String(a.id).localeCompare(String(b.id)));
 // 距離近不代表能從原膠囊位置接上導航；先證明自己真能到觀察位。
 const reachable=p=>geometry.candidates.some(c=>{const route=args.findRoute(p.pos,c.point);return route?.length&&distance(route.at(-1),c.point)<=.1&&route.slice(1).reduce((n,q,i)=>n+distance(route[i],q),0)<=60;});
 const owner=prior||ranked.find(reachable)||ranked[0];
 return{ownerId:owner.id,teamKey:team.map(p=>p.id).sort().join(','),roundSec,geometry};
}

export function planFoundryBombDenial(args,defense){
 const {player,players,bombPos,intel=[],roundSec,walls,lineBlocked,findRoute}=args,old=player.postPlantPlan;
 const known=intel.filter(i=>i.side===player.side&&roundSec>=i.observedAtSec&&roundSec-i.observedAtSec<=3);
 const stillValid=old?.duty==='bomb-denial'&&old.denialOwnerId===defense.ownerId&&old.teamKey===defense.teamKey&&old.cover===true&&defense.geometry.targets.every(t=>!lineBlocked(old.point,t,walls))&&foundryDefuseEnvelopeVisible(old.point,defense.geometry.cells,walls);
 const flank=stillValid&&known.some(i=>distance(i.pos,old.threat)>10&&!lineBlocked(old.point,i.pos,walls));
 if(stillValid&&!flank)return old;
 const candidates=defense.geometry.candidates.map(c=>({...c,score:distance(player.pos,c.point)+known.filter(i=>!lineBlocked(c.point,i.pos,walls)).length*9})).sort((a,b)=>a.score-b.score||a.point.x-b.point.x||a.point.y-b.point.y||a.entryKey.localeCompare(b.entryKey));
 for(const c of candidates){
  if(players.some(p=>p.id!==player.id&&p.side===player.side&&!p.dead&&p.postPlantPlan?.duty==='bomb-denial'&&distance(p.postPlantPlan.point,c.point)<3.1))continue;
  const route=findRoute(player.pos,c.point);if(!route?.length||distance(route.at(-1),c.point)>.1)continue;
  const routeLength=route.slice(1).reduce((n,p,i)=>n+distance(route[i],p),0);if(routeLength>60)continue;
  return{...c,point:{...c.point},threat:{...c.threat},cover:true,bombVisible:true,watchTarget:{...bombPos},duty:'bomb-denial',denialOwnerId:player.id,selectedAtSec:roundSec,teamKey:defense.teamKey,role:player.role,routeLength,reason:flank?'reported-flank-denial-reposition':'public-c4-denial-watch',informationSource:known.length?'ttl-team-report-and-public-c4-geometry':'public-c4-geometry-and-teammates'};
 }
 // 合法牆邊可能接不上canonical起點；先走到可見公開節點再重規劃。
 // 只接受原capsule可走的連接段與已證明可到觀察位的後段，不假稱取得掩體。
 const joins=[];
 for(const [key,point]of Object.entries(args.nodes)){
  const approach=distance(player.pos,point);if(approach<.1||approach>20||!defense.geometry.stepClear(player.pos,point,walls,args.radius||1.35))continue;
  for(const c of candidates){
   const route=findRoute(point,c.point);if(!route?.length||distance(route.at(-1),c.point)>.1)continue;
   const path=[point,...route].filter((p,i,a)=>!i||distance(p,a[i-1])>1e-9);
   if(!path.slice(1).every((p,i)=>defense.geometry.stepClear(path[i],p,walls,args.radius||1.35)))continue;
   const routeLength=approach+path.slice(1).reduce((n,p,i)=>n+distance(path[i],p),0);if(routeLength>60)continue;
   joins.push({key,point,routeLength,goal:c.point});
  }
 }
 joins.sort((a,b)=>a.routeLength-b.routeLength||a.key.localeCompare(b.key));
 if(joins.length){const j=joins[0];return{point:{...j.point},threat:{...bombPos},watchTarget:{...bombPos},cover:false,bombVisible:!lineBlocked(j.point,bombPos,walls),duty:'bomb-denial',denialOwnerId:player.id,denialCoverage:{covered:0,total:defense.geometry.targets.length,sampleStep:.3},selectedAtSec:roundSec,teamKey:defense.teamKey,role:player.role,reason:'denial-route-join',joinEntryKey:j.key,denialGoal:{...j.goal},routeLength:j.routeLength,informationSource:'public-c4-geometry-and-own-capsule-route'};}
 return{point:{...player.pos},threat:{...bombPos},watchTarget:{...bombPos},cover:false,bombVisible:!lineBlocked(player.pos,bombPos,walls),duty:'bomb-denial',denialOwnerId:player.id,denialCoverage:{covered:0,total:defense.geometry.targets.length,sampleStep:.3},selectedAtSec:roundSec,teamKey:defense.teamKey,role:player.role,reason:'no-reachable-denial-cover',informationSource:'public-c4-geometry-and-teammates'};
}
