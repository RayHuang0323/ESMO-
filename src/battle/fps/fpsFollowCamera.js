// Presentation only: actor heading owns the forward view; no enemy lookup.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function clipFpsFollowCamera(anchor,eye,walls=[]){
  const n=Math.max(1,Math.ceil(Math.hypot(eye.x-anchor.x,eye.y-anchor.y,eye.z-anchor.z)/.15));
  for(let i=1;i<=n;i++){
    const t=i/n,x=anchor.x+(eye.x-anchor.x)*t,y=anchor.y+(eye.y-anchor.y)*t,z=anchor.z+(eye.z-anchor.z)*t;
    if(walls.some(w=>x>=w.x0-.2&&x<=w.x1+.2&&z>=w.z0-.2&&z<=w.z1+.2&&y>=(w.y0??-Infinity)-.15&&y<=(w.y1??Infinity)+.15)){
      const safe=Math.max(0,(i-2)/n);return{x:anchor.x+(eye.x-anchor.x)*safe,y:anchor.y+(eye.y-anchor.y)*safe,z:anchor.z+(eye.z-anchor.z)*safe,clipped:true};
    }
  }
  return{...eye,clipped:false};
}
export function resolveFpsFollowCamera({x,z,elevation=0,heading=0,yaw=0,pitch=0,radius=null,walls=[],preferredOffset=0}){
  const a=heading*Math.PI/180,r=clamp(radius??7,4,12),anchor={x,y:elevation+1.65,z};let best=null;
  candidates: for(const lift of [0,1.25])for(const offset of [0,-30,30,-60,60,-90,90,180]){
    const c=a+yaw+offset*Math.PI/180,eye=clipFpsFollowCamera(anchor,{x:x-Math.cos(c)*r+Math.sin(c)*.75,y:elevation+3.35+lift+clamp(pitch,-.3,.6)*2,z:z-Math.sin(c)*r-Math.cos(c)*.75},walls),distance=Math.hypot(eye.x-x,eye.z-z);
    const score=distance-Math.abs(offset)*.025-lift*.6-Math.abs(offset-preferredOffset)*.005;
    if(!best||score>best.score)best={eye,offset,lift,distance,score};
    if(offset===0&&lift===0&&!eye.clipped){best={eye,offset,lift,distance,score};break candidates;}
  }
  const forward=Math.max(.6,8*Math.max(0,Math.cos(yaw+best.offset*Math.PI/180))**3);
  return{anchor,eye:best.eye,look:{x:x+Math.cos(a)*forward,y:elevation+1.5,z:z+Math.sin(a)*forward},fov:42,offset:best.offset,lift:best.lift,distance:best.distance};
}
