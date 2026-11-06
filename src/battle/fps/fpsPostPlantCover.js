import {hasFpsDirectionalCover} from './fpsObjectiveDiscipline.js';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
// 原1.82m骨架肩關節跨度0.3892；用較窄的0.36m軀幹探針證明
// 可見身體確有遮擋。導航半徑1.35只負責通行，不能冒充身體寬度。
export const FPS_POST_PLANT_BODY_HALF_WIDTH=.18;

// 公開進入口的可射擊探頭：不是「附近有牆」或「別的方向被遮住」。
// 身體一側需有實際遮擋，並能以一小步合法退回完整遮蔽；不用敵方真位置。
export function assessFpsPostPlantPeek({point,entry,walls,lineBlocked,blocked,stepClear,radius=1.35}){
 if(!point||!entry||typeof stepClear!=='function')return{valid:false,reason:'missing-geometry'};
 const length=distance(point,entry);if(length<.001)return{valid:false,reason:'missing-angle'};
 const nearby=walls.filter(w=>distance(point,{x:Math.max(w.x,Math.min(w.x+w.w,point.x)),y:Math.max(w.y,Math.min(w.y+w.h,point.y))})<3.6);
 if(!nearby.length||lineBlocked(point,entry,walls))return{valid:false,reason:'no-visible-angle'};
 const side={x:-(entry.y-point.y)/length,y:(entry.x-point.x)/length};
 const shoulders=[-1,-.5,.5,1].map(t=>lineBlocked({x:point.x+side.x*FPS_POST_PLANT_BODY_HALF_WIDTH*t,y:point.y+side.y*FPS_POST_PLANT_BODY_HALF_WIDTH*t},entry,nearby)),protectedShoulders=shoulders.filter(Boolean).length;
 if(protectedShoulders<2)return{valid:false,reason:'fully-exposed-or-grazing',protectedShoulders};
 for(const scale of[.8,1.2,1.8])for(const sign of[-1,1]){
  const d=radius*scale*sign,retreat={x:point.x+side.x*d,y:point.y+side.y*d};
  if(retreat.x<2||retreat.x>98||retreat.y<2||retreat.y>98||blocked(retreat,walls,radius)||!stepClear(point,retreat,walls,radius))continue;
  const bodyCovered=[-1,-.5,0,.5,1].every(t=>lineBlocked({x:retreat.x+side.x*FPS_POST_PLANT_BODY_HALF_WIDTH*t,y:retreat.y+side.y*FPS_POST_PLANT_BODY_HALF_WIDTH*t},entry,nearby));
  if(bodyCovered&&hasFpsDirectionalCover({player:{pos:retreat},threat:entry,walls:nearby,lineBlocked}))return{valid:true,protectedShoulders,retreat,distance:Math.abs(d)};
 }
 return{valid:false,reason:'no-short-covered-retreat',protectedShoulders};
}
