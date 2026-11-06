import {fpsSmokeWorld,smokeWorldHit} from './fpsSmokeDomain.js';

export const FPS_SMOKE_FLIGHT_VERSION='wall-stop.v1';
const RADIUS=.04,GRAVITY=9.81;
const mix=(a,b,t)=>a+(b-a)*t;
function arcPoint(from,to,startHeight,endHeight,arc,t){return[mix(from.x,to.x,t),mix(startHeight,endHeight,t)+Math.sin(t*Math.PI)*arc,mix(from.y,to.y,t)];}

// 僅在投擲時掃掠一次；保存接觸與落點，Replay只依保存描述取樣。
// 實牆接觸後停住水平位移並落下，不讓目標座標把煙彈拉過牆。
export function planSmokeFlight({space,from,to,flightDurationSec,arcHeightUnits}){
 const world=fpsSmokeWorld(space);if(!world)return null;
 const startHeight=world.ground(from)+.72,endHeight=world.ground(to)+RADIUS;
 const duration=flightDurationSec,arc=arcHeightUnits,steps=Math.max(48,Math.ceil((Math.hypot(to.x-from.x,to.y-from.y)+arc*2)/.12));
 let previous=arcPoint(from,to,startHeight,endHeight,arc,0),impact=null;
 for(let i=1;i<=steps;i++){
  const next=arcPoint(from,to,startHeight,endHeight,arc,i/steps),hit=smokeWorldHit(world,previous,next,RADIUS);
  if(hit){const t=((i-1)+hit.t)/steps,p=previous.map((v,k)=>mix(v,next[k],hit.t)+hit.normal[k]*.004);impact={t,p};break;}previous=next;
 }
 const impactAtSec=(impact?.t??1)*duration,impactPoint=impact?.p??arcPoint(from,to,startHeight,endHeight,arc,1);
 let landing=impactPoint.slice(),settleSec=0;
 if(impact){
  const bottom=[impactPoint[0],world.ground({x:impactPoint[0],y:impactPoint[2]})+RADIUS,impactPoint[2]],hit=smokeWorldHit(world,impactPoint,bottom,RADIUS);
  if(hit)landing=impactPoint.map((v,k)=>mix(v,bottom[k],hit.t)+hit.normal[k]*.004);else landing=bottom;
  settleSec=Math.sqrt(Math.max(0,2*(impactPoint[1]-landing[1])/GRAVITY));
 }
 const flight={model:FPS_SMOKE_FLIGHT_VERSION,space,originalTo:{...to},startHeight,endHeight,naturalDurationSec:duration,impactAtSec,impactPoint,landing,settleSec};
 return{flight,to:{x:landing[0],y:landing[2]},baseHeight:landing[1]-RADIUS,flightDurationSec:Math.max(.05,impactAtSec+settleSec)};
}

export function smokeFlightPoint(throwable,t){
 const f=throwable.flight;if(f?.model!==FPS_SMOKE_FLIGHT_VERSION)return null;
 const time=Math.max(0,Math.min(1,t))*throwable.flightDurationSec;
 if(time<f.impactAtSec)return arcPoint(throwable.from,f.originalTo,f.startHeight,f.endHeight,throwable.arcHeightUnits,time/f.naturalDurationSec);
 const dt=Math.max(0,time-f.impactAtSec);return[f.landing[0],Math.max(f.landing[1],f.impactPoint[1]-.5*GRAVITY*dt*dt),f.landing[2]];
}

export function validSmokeFlight(f){
 return f?.model===FPS_SMOKE_FLIGHT_VERSION&&['dune','confluence','foundry'].includes(f.space)&&Number.isFinite(f.originalTo?.x)&&Number.isFinite(f.originalTo?.y)
  &&['startHeight','endHeight','naturalDurationSec','impactAtSec','settleSec'].every(k=>Number.isFinite(f[k]))&&f.naturalDurationSec>0&&f.impactAtSec>=0&&f.impactAtSec<=f.naturalDurationSec&&f.settleSec>=0
  &&[f.impactPoint,f.landing].every(p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite));
}
