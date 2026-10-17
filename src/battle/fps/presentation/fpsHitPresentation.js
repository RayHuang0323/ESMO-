import * as THREE from 'three';
import {fpsMajorElevation} from '../fpsMajorTerrain.js';

export const FPS_HIT_FX_LIMITS=Object.freeze({decals:48,droplets:24,lifetimeSec:20,spraySec:.18});
const finite=p=>Number.isFinite(p?.x)&&Number.isFinite(p?.y);
const hash=s=>{let h=2166136261;for(const c of String(s))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};

// Original procedural splatter, shared by both instanced draws. Non-emissive,
// normal blending: blood remains dark against smoke and does not glow.
function bloodTexture(){
 const size=32,data=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const dx=(x-15.5)/15.5,dy=(y-15.5)/15.5,r=Math.hypot(dx,dy),a=Math.atan2(dy,dx);
  const edge=.61+.13*Math.sin(a*7)+.09*Math.cos(a*11),speck=((x*17+y*31)%29===0&&r<.95);
  const i=(y*size+x)*4;data[i]=data[i+1]=data[i+2]=255;data[i+3]=r<edge||speck?220:0;
 }
 const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);texture.needsUpdate=true;return texture;
}

// A mark can reach only the first actual solid surface behind the impact.
export function fpsBloodWallContact(from,to,walls,maxDistance=3.5){
 if(!finite(from)||!finite(to))return null;
 const length=Math.hypot(to.x-from.x,to.y-from.y);if(length<.001)return null;
 const dx=(to.x-from.x)/length,dy=(to.y-from.y)/length,candidates=[];
 for(const w of walls){
  if(w.hgt<1.1)continue;
  for(const [axis,value,normal]of [['x',w.x,-1],['x',w.x+w.w,1],['y',w.y,-1],['y',w.y+w.h,1]]){
   const d=axis==='x'?dx:dy;if(Math.abs(d)<1e-6)continue;
   const t=(value-to[axis])/d;if(t<.02||t>maxDistance)continue;
   const x=to.x+dx*t,y=to.y+dy*t;
   if(x<w.x-.001||x>w.x+w.w+.001||y<w.y-.001||y>w.y+w.h+.001||d*normal>=0)continue;
   candidates.push({x,y,t,axis,normal,wallHeight:w.hgt});
  }
 }
 candidates.sort((a,b)=>a.t-b.t);return candidates[0]||null;
}

export function createFpsHitPresentation({group,mapKey,walls=[],sampleGroundHeight}){
 const texture=bloodTexture(),geometry=new THREE.PlaneGeometry(1,1);
 const material=new THREE.MeshBasicMaterial({map:texture,color:0x70181b,transparent:true,opacity:.78,alphaTest:.15,depthTest:true,depthWrite:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
 const decals=new THREE.InstancedMesh(geometry,material,FPS_HIT_FX_LIMITS.decals);
 const droplets=new THREE.InstancedMesh(geometry,material,FPS_HIT_FX_LIMITS.droplets);
 decals.name='FPS_actual_hit_blood_marks';droplets.name='FPS_actual_hit_blood_spray';
 for(const mesh of [decals,droplets]){mesh.count=0;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);group.add(mesh);}
 const dummy=new THREE.Object3D(),floor=p=>sampleGroundHeight?.(p.x-50,p.y-50)??fpsMajorElevation(mapKey,p);
 let simulation=null,round=null,events=[],disposed=false;
 const rebuild=(sim,rnd)=>{
  events=[];const seen=new Set();
  for(const frame of sim?.frames||[]){
   if(frame.rnd!==rnd)continue;
   for(const shot of frame.muzzles||[]){
    const key=shot.eventId||shot.id;if(!key||seen.has(key)||!shot.hit||!(shot.damage>0)||!finite(shot.pos)||!Number.isFinite(shot.shotAtMs))continue;
    const trace=frame.tracers?.find(t=>t.eventId===shot.eventId&&t.hit),target=frame.players?.find(p=>p.id===shot.targetId),pos=trace?.to||target?.pos;
    if(!finite(pos))continue;seen.add(key);
    const wall=fpsBloodWallContact(shot.pos,pos,walls);
    const length=Math.hypot(pos.x-shot.pos.x,pos.y-shot.pos.y)||1,dx=(pos.x-shot.pos.x)/length,dy=(pos.y-shot.pos.y)/length;
    const mark={x:pos.x+dx*.24,y:pos.y+dy*.24},ground=floor(pos),markGround=floor(mark);
    const normal=new THREE.Vector3((floor({x:mark.x-.1,y:mark.y})-floor({x:mark.x+.1,y:mark.y}))/.2,1,(floor({x:mark.x,y:mark.y-.1})-floor({x:mark.x,y:mark.y+.1}))/.2).normalize();
    const markRotation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),normal);
    const validWall=wall&&ground+1.05<=floor(wall)+wall.wallHeight?wall:null;
    events.push({key,sec:shot.shotAtMs/1000,pos:{...pos},from:{...shot.pos},ground,mark,markGround,markRotation,wall:validWall,seed:hash(key)});
   }
  }
  events.sort((a,b)=>a.sec-b.sec||a.key.localeCompare(b.key));simulation=sim;round=rnd;
 };
 const write=(mesh,index,x,y,z,sx,sy,rotation)=>{
  dummy.position.set(x,y,z);dummy.scale.set(sx,sy,1);dummy.quaternion.copy(rotation);dummy.updateMatrix();mesh.setMatrixAt(index,dummy.matrix);
 };
 const vertical=new THREE.Quaternion();
 const update=({sim,frame,sub=0,camera,reducedMotion=false})=>{
  if(disposed)return {decals:0,droplets:0,disposed:true};
  if(sim!==simulation||frame?.rnd!==round)rebuild(sim,frame?.rnd);
  const sec=Number(frame?.roundSec)+Math.max(0,sub)*.5;
  let di=0,pi=0,activeHits=0;
  // Newest marks win the fixed budget. Recompute from saved events, so pause,
  // backward seek and repeated frames never duplicate or retain future marks.
  for(let i=events.length-1;i>=0&&di<FPS_HIT_FX_LIMITS.decals;i--){
   const event=events[i],age=sec-event.sec;if(age<0)continue;if(age>FPS_HIT_FX_LIMITS.lifetimeSec)break;
   const seed=event.seed,fade=Math.min(1,(20-age)/5),scale=(.35+(seed%17)*.012)*Math.max(.02,fade);
   const length=Math.hypot(event.pos.x-event.from.x,event.pos.y-event.from.y)||1,dx=(event.pos.x-event.from.x)/length,dy=(event.pos.y-event.from.y)/length;
   write(decals,di++,event.mark.x-50,event.markGround+.018,event.mark.y-50,scale,scale*.72,event.markRotation);
   if(event.wall&&di<FPS_HIT_FX_LIMITS.decals){const w=event.wall;
    vertical.setFromEuler(new THREE.Euler(0,w.axis==='x'?w.normal*Math.PI/2:w.normal===1?0:Math.PI,0));
    write(decals,di++,w.x-50+(w.axis==='x'?w.normal*.014:0),event.ground+1.05,w.y-50+(w.axis==='y'?w.normal*.014:0),scale*.9,scale*.74,vertical);
   }
   if(age<=FPS_HIT_FX_LIMITS.spraySec){
    activeHits++;const t=age/FPS_HIT_FX_LIMITS.spraySec;
    for(let j=0;j<3&&pi<FPS_HIT_FX_LIMITS.droplets;j++){
     const spread=reducedMotion?0:t*.5,angle=(seed%31)*.2+j*2.1,size=.11*(1-t)+.025;
     write(droplets,pi++,event.pos.x-50+dx*spread+Math.cos(angle)*spread*.45,event.ground+1.04+j*.09-(reducedMotion?0:t*t*.22),event.pos.y-50+dy*spread+Math.sin(angle)*spread*.45,size,size*.7,camera.quaternion);
    }
   }
  }
  decals.count=di;droplets.count=pi;decals.visible=di>0;droplets.visible=pi>0;
  if(di)decals.instanceMatrix.needsUpdate=true;if(pi)droplets.instanceMatrix.needsUpdate=true;
  // Color is constant; no per-hit material, render pass, light or texture.
  return{decals:di,droplets:pi,activeHits,round,roundSec:sec,eventCount:events.length,source:'saved-muzzle-hit-damage-and-tracer',limits:FPS_HIT_FX_LIMITS};
 };
 return{update,dispose(){if(disposed)return;disposed=true;for(const mesh of [decals,droplets]){mesh.parent?.remove(mesh);mesh.dispose();}geometry.dispose();material.dispose();texture.dispose();events=[];simulation=null;}};
}
