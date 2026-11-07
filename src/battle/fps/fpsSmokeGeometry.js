import {FPS_SMOKE_DOMAIN_RADIUS,getSmokeField,smokeFieldContains,smokeFieldBlocks} from './fpsSmokeDomain.js';
// 同一半徑與可達場服務模擬、POV及3D；沒有標記的舊Replay保留原水平圓。
export const FPS_SMOKE_RADIUS = FPS_SMOKE_DOMAIN_RADIUS;
// Saved simulation windows are 0.5 seconds; utility lifetime uses 2-second units.
export const FPS_SMOKE_WINDOW_UNITS = .25;
export function fpsAdvanceSmokeWindow(smoke){
 const next={...smoke,age:(smoke.age||0)+FPS_SMOKE_WINDOW_UNITS,tl:smoke.tl-FPS_SMOKE_WINDOW_UNITS};
 return {...next,radius:fpsSmokeLifecycleRadius(next)};
}
// Optional saved radius preserves old Replay geometry. New Major clouds grow
// and disperse in the simulation; renderer/POV consume exactly that radius.
export function fpsSmokeRadius(smoke){return Number.isFinite(smoke?.radius)?Math.max(0,Math.min(FPS_SMOKE_RADIUS,smoke.radius)):FPS_SMOKE_RADIUS;}
export function fpsSmokeLifecycleRadius(smoke){
 if(smoke?.model==='continuous.v2'){
  const smooth=t=>{const u=Math.max(0,Math.min(1,t));return u*u*(3-2*u);};
  return FPS_SMOKE_RADIUS*Math.min(smooth((Number(smoke.age)||0)/1.5),smooth((Number(smoke.tl)||0)/6));
 }
 const grow=Math.max(.15,Math.min(1,(Number(smoke.age)||0)/.45)),fade=Math.max(0,Math.min(1,(Number(smoke.tl)||0)/6));
 return FPS_SMOKE_RADIUS*Math.min(grow,fade);
}
// Saved endpoints are the source for every seek/playback direction. Interpolate
// only the new model; old Replay envelopes retain their exact presentation.
export function fpsSmokeAtSubframe(smoke,next,sub=0){
 if(smoke?.model!=='continuous.v2')return smoke;
 const endpoint=next||fpsAdvanceSmokeWindow(smoke);
 const t=Math.max(0,Math.min(1,sub)),mix=(a,b)=>a+(b-a)*t;
 return {...smoke,age:mix(smoke.age||0,endpoint.age),tl:mix(smoke.tl||0,endpoint.tl),
  radius:mix(fpsSmokeRadius(smoke),fpsSmokeRadius(endpoint))};
}
export function fpsSmokeSegmentBlockedAtSubframe(a,b,smokes,sub=0){
 const dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy;
 return (smokes||[]).some(saved=>{
  const s=fpsSmokeAtSubframe(saved,null,sub);if((s.tl??1)<=0)return false;
  const t=l2?Math.max(0,Math.min(1,((s.pos.x-a.x)*dx+(s.pos.y-a.y)*dy)/l2)):0;
  if(Math.hypot(a.x+t*dx-s.pos.x,a.y+t*dy-s.pos.y)>=fpsSmokeRadius(s))return false;
  const field=getSmokeField(s);return field?smokeFieldBlocks(field,a,b,fpsSmokeRadius(s)):true;
 });
}
export function fpsPointInSmoke(point,smokes) {
 if(!Number.isFinite(point?.x)||!Number.isFinite(point?.y))return false;
 for(const smoke of smokes||[])if((smoke.tl??1)>0&&Math.hypot(point.x-smoke.pos.x,point.y-smoke.pos.y)<fpsSmokeRadius(smoke)){
  const field=getSmokeField(smoke);if(!field||smokeFieldContains(field,point,fpsSmokeRadius(smoke)))return true;
 }
 return false;
}
