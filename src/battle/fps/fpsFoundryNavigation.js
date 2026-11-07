import {continueFpsAuthoredRoute,advanceFpsAuthoredRoute} from './fpsRouteContinuation.js';
import {FOUNDRY_CIRCUIT_ROUTES,FPS_FOUNDRY_CIRCUIT} from './fpsFoundryCircuit.js';
import {planFpsTacticalPostPlant} from './fpsTacticalPostPlant.js';
import {estimateFpsRetakeTravelSec} from './fpsRetakeObjective.js';
import {createFoundryBombDefense,planFoundryBombDenial} from './fpsFoundryBombDefense.js';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const route=id=>FOUNDRY_CIRCUIT_ROUTES.find(r=>r.id===id).keys;

// 僅由major.v5呼叫。舊角色查詢可取別名，但枚舉仍只計一次實際入口。
export function bindFoundryNavigationAliases(map,nodes,snap){
 for(const key of Object.getOwnPropertyNames(map.nodes))if(!Object.hasOwn(nodes,key))Object.defineProperty(nodes,key,{value:snap(map.nodes[key]),enumerable:false});
}
export function foundryObjectiveRoute(player,plan,target){
 if(player.side==='t'&&plan.kind==='split-mid')return {...plan,keys:[...route(target==='b'?'b-mid':'a-mid')]};
 if(player.side!=='ct'||plan.kind==='information-peek')return plan;
 const anchor=plan.keys?.at(-1);
 if(plan.kind==='information'){
  const keys=route('ct-a-mid');return {...plan,keys:keys.slice(0,keys.indexOf('midEast')+1)};
 }
 const id={aWestGate:'ct-a-mid',aNorthGate:'ct-a-rear',bEastGate:'ct-b-mid',bHighGate:'ct-b-rear'}[anchor];
 if(!id)return plan;
 const keys=route(id);return {...plan,keys:keys.slice(0,keys.indexOf(anchor)+1)};
}
export function foundryEarnedRoute(player,points,keys,roundReset){
 if(roundReset){player._foundryEarnedLanes=[];return keys?.[0]?.endsWith('Spawn')?1:0;}
 return Math.max(0,...[player._routePlan,...(player._foundryEarnedLanes||[])].map(previous=>continueFpsAuthoredRoute(previous,points,keys)));
}
export function rememberFoundryRoute(player,plan){
 if(!plan.keys?.length||plan.keys.length!==plan.points?.length||!plan.keys.some(k=>k.endsWith('Spawn')))return;
 const lanes=player._foundryEarnedLanes||(player._foundryEarnedLanes=[]),signature=plan.keys.join('>');
 const index=lanes.findIndex(p=>p.keys.join('>')===signature);if(index>=0)lanes[index]=plan;else lanes.push(plan);
 if(lanes.length>24)lanes.shift();
}
export function advanceFoundryRoute(player,point){
 advanceFpsAuthoredRoute(player._routePlan,point);
 for(const plan of player._foundryEarnedLanes||[])advanceFpsAuthoredRoute(plan,point);
}
// 到達保槍／守點目標後，舊移動路線已失效；結束路線而非反覆乘零步長。
export function settleFoundryIntent(player,intent,roundSec){
 if(!['save','post-plant-hold','defuse-cover','take-cover'].includes(intent?.kind)||!intent.stopMovement||intent.pace!==0||!intent.routeTarget||distance(player.pos,intent.routeTarget)>(intent.kind==='take-cover'?.3:.55))return false;
 if(intent.kind==='post-plant-hold'&&player.postPlantPlan?.cover!==true||intent.kind==='defuse-cover'&&player.retakeCoverPlan?.cover!==true)return false;
 player.route=[{...player.pos}];player.routeIdx=0;player.routeT=0;
 player._routeProgressKey=null;player._routeBestRemaining=null;player._stuckN=0;player._stuckSinceSec=null;player._awaitingReplanProgress=false;
 if(player._activeStuckEpisode){player._activeStuckEpisode.status='intent-ended';player._activeStuckEpisode.intentEndedAtSec=roundSec;player._activeStuckEpisode.endedByIntent=intent.kind;player._activeStuckEpisode=null;}
 player.state=intent.kind==='save'?'SAVE':intent.kind==='post-plant-hold'?'POST_PLANT':'COVER';
 player.objectiveState=intent.kind==='save'?'SAVE':intent.kind==='post-plant-hold'?'HOLD_ANGLE':'COVER';
 return true;
}
export function planFoundryPostPlant(args){
 const defense=args.player.side==='t'?(args.bombDefense||createFoundryBombDefense({...args,stepClear:foundryRouteSegmentClear})):null;
 if(defense&&args.player.id===defense.ownerId)return planFoundryBombDenial(args,defense);
 const tag=plan=>defense?{...plan,duty:'entrance-cover',denialOwnerId:defense.ownerId}:plan;
 if(defense&&args.player.postPlantPlan?.duty==='bomb-denial')args={...args,player:{...args.player,postPlantPlan:null}};
 const previous=args.player.postPlantPlan;
 if(previous?.reason==='post-plant-join'&&args.roundSec-previous.selectedAtSec<2&&distance(args.player.pos,previous.point)>.75)return tag(previous);
 const clean=p=>({...p,postPlantPlan:p.postPlantPlan?.cover===false?null:p.postPlantPlan,retakeCoverPlan:p.retakeCoverPlan?.cover===false?null:p.retakeCoverPlan});
 const player=clean(args.player),players=args.players.map(clean);
 const result=planFpsTacticalPostPlant({...args,player,players,requirePeekCover:true,stepClear:foundryRouteSegmentClear});if(result.cover!==false)return tag(result);
 // 遠端選手先沿公開入口的真實導航接近，再重試掩體；不把失敗點當防守成功。
 const entries=(args.entries||[]).map(k=>({key:k,point:args.nodes[k]})).filter(v=>v.point&&distance(v.point,player.pos)>1)
  .sort((a,b)=>distance(a.point,player.pos)-distance(b.point,player.pos)||a.key.localeCompare(b.key));
 for(const entry of entries){
  const path=args.findRoute(player.pos,entry.point);if(!path?.length||distance(path.at(-1),entry.point)>.1)continue;
  let next=path.at(-1),remaining=12;
  for(let i=1;i<path.length;i++){const n=distance(path[i-1],path[i]);if(n>=remaining){const t=remaining/(n||1);next={x:path[i-1].x+(path[i].x-path[i-1].x)*t,y:path[i-1].y+(path[i].y-path[i-1].y)*t};break;}remaining-=n;}
  return tag({...result,point:{...next},cover:false,bombVisible:!args.lineBlocked(next,args.bombPos,args.walls),reason:'post-plant-join',joinEntryKey:entry.key,selectedAtSec:args.roundSec,informationSource:'public-geometry-and-own-reachable-route'});
 }
 return tag(result);
}

// 與原回防驗證相同的capsule矩形交線；只用公開幾何，不讀敵人位置。
export function foundryRouteSegmentClear(a,b,walls,radius){
 return !walls.some(w=>{
  let enter=0,exit=1;
  for(const [v,delta,lo,hi]of [[a.x,b.x-a.x,w.x-radius,w.x+w.w+radius],[a.y,b.y-a.y,w.y-radius,w.y+w.h+radius]]){
   if(Math.abs(delta)<1e-10){if(v<=lo||v>=hi)return false;}
   else{const p=(lo-v)/delta,q=(hi-v)/delta;enter=Math.max(enter,Math.min(p,q));exit=Math.min(exit,Math.max(p,q));}
  }
  return enter<exit-1e-9&&exit>1e-9&&enter<1-1e-9;
 });
}
// 原有三條輪轉線提供額外候選；從真實位置加入可見節點，不繞回包點刷統計。
export function foundryRotationPaths({player,goal,walls,radius}){
 const nodes=FPS_FOUNDRY_CIRCUIT.nodes,rows=[],seen=new Set(),clear=(a,b)=>foundryRouteSegmentClear(a,b,walls,radius);
 for(const lane of FOUNDRY_CIRCUIT_ROUTES.filter(r=>r.id.startsWith('rotate-')))for(const reverse of [false,true]){
  const keys=reverse?lane.keys.toReversed():lane.keys;
  if(distance(nodes[keys.at(-1)],goal)>14)continue;
  const tail=clear(nodes[keys.at(-2)],goal)?keys.slice(0,-1):keys;
  if(!clear(nodes[tail.at(-1)],goal))continue;
  for(let join=0;join<tail.length;join++){
   const node=nodes[tail[join]];if(distance(player.pos,node)>20||!clear(player.pos,node))continue;
   const path=[{...player.pos},...tail.slice(join).map(k=>({...nodes[k]})),{...goal}].filter((p,i,a)=>!i||distance(p,a[i-1])>.02);
   if(path.length<2||!path.slice(1).every((p,i)=>clear(path[i],p)))continue;
   const signature=path.map(p=>p.x.toFixed(3)+','+p.y.toFixed(3)).join('>');if(seen.has(signature))continue;seen.add(signature);
   rows.push({path,source:'authored-rotation',routeId:lane.id,direction:reverse?'reverse':'forward',joinKey:tail[join]});
  }
 }
 return rows;
}
// 安包後先比較所有合法行程時間，再交回既有工時／威脅／撤退決策；不改倒數或成功率。
export function selectFoundryRetakePath({player,bombPos,walls,radius,findRoute,eligible,speed}){
 const clear=(a,b)=>foundryRouteSegmentClear(a,b,walls,radius);
 const valid=path=>path?.length>1&&eligible(path.at(-1))&&path.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))&&path.slice(1).every((p,i)=>clear(path[i],p));
 // canonical grid memo可回傳鄰近但非本tick真位置的起點；連接段也必須計時、驗碰撞及執行。
 const fromPosition=path=>path?.length?[{...player.pos},...path].filter((p,i,a)=>!i||distance(p,a[i-1])>1e-9):[];
 const fresh=fromPosition(findRoute(player.pos,bombPos)),suffix=Array.isArray(player.route)?[{...player.pos},...player.route.slice((player.routeIdx||0)+1)]:[];
 const freshSec=valid(fresh)?estimateFpsRetakeTravelSec(fresh,speed):Infinity,committedSec=valid(suffix)?estimateFpsRetakeTravelSec(suffix,speed):Infinity;
 const candidates=[{path:fresh,source:'fresh',travelSec:freshSec,priority:2},{path:suffix,source:'committed-suffix',travelSec:committedSec,priority:0},
  ...foundryRotationPaths({player,goal:bombPos,walls,radius}).filter(r=>valid(r.path)).map(r=>({...r,travelSec:estimateFpsRetakeTravelSec(r.path,speed),priority:1}))]
  .filter(r=>Number.isFinite(r.travelSec)).sort((a,b)=>a.travelSec-b.travelSec||a.priority-b.priority);
 const selected=candidates[0]||{path:[],source:'fresh',travelSec:Infinity};
 return {...selected,freshSec,committedSec};
}

// 安包前只在既有information/rotator的真敵情轉點intent成立後呼叫。
// 長路是否值得走由行程與3秒內隊友情報決定，不為路線覆蓋強制繞行。
export function selectFoundryRotationPath({player,goal,walls,radius,findRoute,speed,intel,roundSec,lineBlocked}){
 const raw=findRoute(player.pos,goal),fresh=raw?.length?[{...player.pos},...raw].filter((p,i,a)=>!i||distance(p,a[i-1])>1e-9):[],clear=(a,b)=>foundryRouteSegmentClear(a,b,walls,radius);
 const known=intel.filter(i=>i.side===player.side&&roundSec>=i.observedAtSec&&roundSec-i.observedAtSec<=3);
 const candidates=[{path:fresh,source:'fresh'},...foundryRotationPaths({player,goal,walls,radius})]
  .filter(r=>r.path.length>1&&distance(r.path.at(-1),goal)<.1&&r.path.slice(1).every((p,i)=>clear(r.path[i],p)))
  .map(r=>{const travelSec=estimateFpsRetakeTravelSec(r.path,speed),exposed=known.filter(i=>r.path.some(p=>distance(p,i.pos)<18&&!lineBlocked(p,i.pos,walls))).length;return{...r,travelSec,riskSec:Math.min(3,exposed)*2};})
  .sort((a,b)=>(a.travelSec+a.riskSec)-(b.travelSec+b.riskSec)||a.travelSec-b.travelSec||String(a.routeId||'').localeCompare(String(b.routeId||'')));
 return candidates[0]||null;
}
