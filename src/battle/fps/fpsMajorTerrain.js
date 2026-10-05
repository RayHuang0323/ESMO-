// 原創 Bombsite 的平台／緩坡；同一純函式供地形與 simulation frame 使用。
// 不改平面導航半徑或牆體真相。舊存檔仍使用高度 0。
export const FPS_MAJOR_PLATFORMS = Object.freeze({
  mirage:{x:71,y:18,w:14,h:14,height:2.4,ramp:4},
  dust2:{x:68,y:17,w:17,h:17,height:1.8,ramp:4},
  inferno:{x:73,y:65,w:17,h:18,height:2.2,ramp:4},
});
const smooth=t=>{const u=Math.max(0,Math.min(1,t));return u*u*(3-2*u);};
export function fpsMajorElevation(mapKey,point){
  const p=FPS_MAJOR_PLATFORMS[mapKey];if(!p||!point)return 0;
  const edge=Math.min(point.x-p.x,p.x+p.w-point.x,point.y-p.y,p.y+p.h-point.y);
  return p.height*smooth(edge/p.ramp);
}
