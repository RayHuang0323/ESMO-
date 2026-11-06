import {foundryGroundHeight} from '../fpsFoundryTerrain.js';

// 封閉設備內的檢修窗。玻璃與外殼保持原實體外表面，機件和五面內襯
// 全在原實體包絡內；不產生能走入或能看穿到另一側的空洞。
export function foundryInspectionWindows(w,index,obstacles=[]){
 const presets={6:[3,1.75,.5,'cooler'],9:[3,1.6,1.2,'electrical'],10:[3,1.4,1.8,'air-handler'],11:[2,1.6,1.2,'regulator-core'],12:[2,1.9,.55,'regulator'],13:[3,1.75,.5,'cooler'],47:[4,1.35,.55,'control'],48:[3,1.35,.5,'feed'],49:[3,1.25,.45,'casting'],50:[3,1.35,.5,'maintenance'],51:[3,1.2,.45,'air-handler']};
 const wallPanel=Boolean(w.architecture&&obstacles.filter(other=>other.architecture===w.architecture)[1]===w),wallStyle={'foundry-control':'control','foundry-feed':'feed','foundry-cast':'casting','foundry-maint':'maintenance','foundry-high':'air-handler'},preset=presets[index]||(wallPanel?[2,2.15,.65,wallStyle[w.architecture]]:null);if(!preset)return[];const[count,height,bottom,style]=preset,axis=w.w<2?'x':'z',length=axis==='x'?w.h:w.w,start=axis==='x'?w.y:w.x,thickness=axis==='x'?w.w:w.h,ground=foundryGroundHeight({x:w.x+w.w/2,y:w.y+w.h/2});
 const width=Math.min(1.5,length/count-.3),depth=Math.min(.65,thickness*(wallPanel ? .7 : .3)),rows=[];
 for(let n=0;n<count;n++)for(const side of wallPanel?[-1]:[-1,1])rows.push({index,axis,side,style,variant:n,along:start+(n+.5)*length/count,width:wallPanel?Math.min(3.6,length/count-.8):width,height,bottom:ground+bottom,depth,face:axis==='x'?(side<0?w.x:w.x+w.w):(side<0?w.y:w.y+w.h)});
 const ownTop=ground+(w.hgt??7);
 return rows.filter(c=>!obstacles.some(other=>{
  if(other===w||foundryGroundHeight({x:other.x+other.w/2,y:other.y+other.h/2})+(other.hgt??7)<=ownTop+.01)return false;
  const [lo,hi,alongLo,alongHi]=axis==='x'?[other.x,other.x+other.w,other.y,other.y+other.h]:[other.y,other.y+other.h,other.x,other.x+other.w];
  return lo<=c.face+.025&&hi>=c.face-.025&&alongLo<c.along+c.width/2&&alongHi>c.along-c.width/2;
 }));
}
