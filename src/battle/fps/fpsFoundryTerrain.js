// Foundry單值XY高度場；地板三角形、角色腳底、LOS與煙霧共用，無上下疊層。
export const FOUNDRY_TERRAIN_SIZE=101;
export const FOUNDRY_TERRAIN_HEIGHTS=new Float32Array(FOUNDRY_TERRAIN_SIZE*FOUNDRY_TERRAIN_SIZE);
const smooth=t=>{const u=Math.max(0,Math.min(1,t));return u*u*(3-2*u);};
const mask=(v,lo,hi,ramp)=>smooth((v-lo+ramp)/ramp)*smooth((hi+ramp-v)/ramp);
const plateau=(x,y,x0,x1,y0,y1,height,ramp)=>height*mask(x,x0,x1,ramp)*mask(y,y0,y1,ramp);
for(let y=0;y<FOUNDRY_TERRAIN_SIZE;y++)for(let x=0;x<FOUNDRY_TERRAIN_SIZE;x++){
 FOUNDRY_TERRAIN_HEIGHTS[y*FOUNDRY_TERRAIN_SIZE+x]=plateau(x,y,8,20,28,54,2.2,4)+plateau(x,y,76,85,38,48,1.2,3)-plateau(x,y,61,67,63,73,1,4);
}
export function foundryGroundHeight(point){
 if(!point)return 0;
 const x=Math.max(0,Math.min(100,point.x)),y=Math.max(0,Math.min(100,point.y)),ix=Math.min(99,Math.floor(x)),iy=Math.min(99,Math.floor(y)),u=x-ix,v=y-iy,i=iy*FOUNDRY_TERRAIN_SIZE+ix;
 const a=FOUNDRY_TERRAIN_HEIGHTS[i],b=FOUNDRY_TERRAIN_HEIGHTS[i+1],c=FOUNDRY_TERRAIN_HEIGHTS[i+FOUNDRY_TERRAIN_SIZE],d=FOUNDRY_TERRAIN_HEIGHTS[i+FOUNDRY_TERRAIN_SIZE+1];
 return u+v<=1?a+(b-a)*u+(c-a)*v:d+(c-d)*(1-u)+(b-d)*(1-v);
}
