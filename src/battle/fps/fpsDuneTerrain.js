// One shared triangulated height field for simulation, LOS and rendered floor.
// Single-valued XY avoids introducing stacked floors into capsule navigation.
export const DUNE_TERRAIN_SIZE=101;
const smooth=t=>{const u=Math.max(0,Math.min(1,t));return u*u*(3-2*u);};
const plateau=(x,y,rx,ry,w,h,height,ramp)=>height*smooth(Math.min(x-rx,rx+w-x,y-ry,ry+h-y)/ramp);
export const DUNE_TERRAIN_HEIGHTS=new Float32Array(DUNE_TERRAIN_SIZE*DUNE_TERRAIN_SIZE);
for(let y=0;y<DUNE_TERRAIN_SIZE;y++)for(let x=0;x<DUNE_TERRAIN_SIZE;x++){
 DUNE_TERRAIN_HEIGHTS[y*DUNE_TERRAIN_SIZE+x]=plateau(x,y,75,19,15,15,2,4)+plateau(x,y,8,18,10,18,1.4,3);
}
export function duneGroundHeight(point){
 if(!point)return 0;
 const x=Math.max(0,Math.min(100,point.x)),y=Math.max(0,Math.min(100,point.y));
 const ix=Math.min(99,Math.floor(x)),iy=Math.min(99,Math.floor(y)),u=x-ix,v=y-iy,i=iy*DUNE_TERRAIN_SIZE+ix;
 const a=DUNE_TERRAIN_HEIGHTS[i],b=DUNE_TERRAIN_HEIGHTS[i+1],c=DUNE_TERRAIN_HEIGHTS[i+DUNE_TERRAIN_SIZE],d=DUNE_TERRAIN_HEIGHTS[i+DUNE_TERRAIN_SIZE+1];
 // Cell triangles (a,c,b), (b,c,d), matching the Dune floor mesh indices.
 return u+v<=1?a+(b-a)*u+(c-a)*v:d+(c-d)*(1-u)+(b-d)*(1-v);
}
