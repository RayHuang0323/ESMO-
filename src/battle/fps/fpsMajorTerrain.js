import {duneGroundHeight} from './fpsDuneTerrain.js';
import {foundryGroundHeight} from './fpsFoundryTerrain.js';
// 原創 Bombsite 的平台／緩坡；同一純函式供地形與 simulation frame 使用。
// 不改平面導航半徑或牆體真相。舊存檔仍使用高度 0。
export const FPS_MAJOR_PLATFORMS = Object.freeze({
  mirage:{x:71,y:18,w:14,h:14,height:2.4,ramp:4},
  dust2:{x:68,y:17,w:17,h:17,height:1.8,ramp:4},
  inferno:{x:73,y:65,w:17,h:18,height:2.2,ramp:4},
});
const smooth=t=>{const u=Math.max(0,Math.min(1,t));return u*u*(3-2*u);};
export function fpsMajorElevation(mapKey,point,sceneVersion){
  if(sceneVersion==='major.v5')return mapKey==='inferno'?foundryGroundHeight(point):0;
  if(sceneVersion==='major.v4')return mapKey==='dust2'?duneGroundHeight(point):0;
  const p=FPS_MAJOR_PLATFORMS[mapKey];if(!p||!point)return 0;
  const edge=Math.min(point.x-p.x,p.x+p.w-point.x,point.y-p.y,p.y+p.h-point.y);
  const base=p.height*smooth(edge/p.ramp);
  if(sceneVersion!=='major.v3')return base;
  const plateau=(x,y,w,h,height,ramp)=>height*smooth(Math.min(point.x-x,x+w-point.x,point.y-y,y+h-point.y)/ramp);
  return base+plateau(74,43,10,12,1.8,4)-plateau(45,61,10,13,1.2,2.5);
}

// Only the new layout uses height-aware fire/eyesight. Navigation remains the
// established capsule graph; buildings retain opaque foundations below grade.
export function fpsMajorHeightSightBlocked(a,b,walls,mapKey,sceneVersion,{fromEyeHeight=1.45,toEyeHeight=1.45}={}){
 const ah=fpsMajorElevation(mapKey,a,sceneVersion)+fromEyeHeight,bh=fpsMajorElevation(mapKey,b,sceneVersion)+toEyeHeight;
 for(const w of walls){
  let enter=0,exit=1;
  for(const [origin,delta,min,max]of [[a.x,b.x-a.x,w.x,w.x+w.w],[a.y,b.y-a.y,w.y,w.y+w.h]]){
   if(Math.abs(delta)<1e-9){if(origin<min||origin>max){enter=2;break;}}
   else {const p=(min-origin)/delta,q=(max-origin)/delta;enter=Math.max(enter,Math.min(p,q));exit=Math.min(exit,Math.max(p,q));}
  }
  if(enter>exit||exit<=0||enter>=1)continue;
  const top=fpsMajorElevation(mapKey,{x:w.x+w.w/2,y:w.y+w.h/2},sceneVersion)+(w.hgt??7);
  if(Math.min(ah+(bh-ah)*enter,ah+(bh-ah)*exit)<=top)return true;
 }
 if(sceneVersion==='major.v4'||sceneVersion==='major.v5'){
  const n=Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/.75);
  const height=sceneVersion==='major.v5'?foundryGroundHeight:duneGroundHeight;
  for(let i=1;i<n;i++){const t=i/n;if(height({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t})>ah+(bh-ah)*t)return true;}
 }
 return false;
}
