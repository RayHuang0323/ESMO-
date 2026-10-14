// Read-only candidate planning against genuine existing saved frames.
// It never simulates, seeks, patches frames or claims rendered visibility.
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function segmentBox(a,b,w){let lo=0,hi=1;for(const [s,e,min,max] of [[a.x,b.x,w.x,w.x+w.w],[a.y,b.y,w.y,w.y+w.h]]){const d=e-s;if(Math.abs(d)<1e-9){if(s<min||s>max)return false;continue;}const p=(min-s)/d,q=(max-s)/d;lo=Math.max(lo,Math.min(p,q));hi=Math.min(hi,Math.max(p,q));}return lo<=hi&&hi>0.02&&lo<.98;}
export function selectIsolatedHeNativeCandidates({frames,walls=[],maximum=6,fovDegrees=72}){
 const candidates=[],rejected={noPrevious:0,flashOrOtherHe:0,actorBlindOrDead:0,rangeOrFov:0,opaqueRoute:0,ownMuzzle:0,smokeRoute:0};
 for(let index=1;index<frames.length&&candidates.length<maximum;index++){
  const frame=frames[index],prior=frames[index-1];if(prior.rnd!==frame.rnd){rejected.noPrevious++;continue;}
  for(const he of frame.throwables||[]){
   if(he.type!=='he'||he.flying||he.detonatedAtRoundSec!==frame.roundSec||!Number.isFinite(he.to?.x)||!Number.isFinite(he.to?.y))continue;
   const window=frames.filter(f=>f.rnd===frame.rnd&&f.roundSec>=frame.roundSec-.5&&f.roundSec<=frame.roundSec+1.2);
   if(window.some(f=>(f.throwables||[]).some(t=>t.id!==he.id&&!t.flying&&t.boom>0&&(t.type==='flash'||t.type==='he')))){rejected.flashOrOtherHe++;continue;}
   for(const actor of prior.players||[]){
    const actors=window.map(f=>f.players?.find(p=>p.id===actor.id));if(actors.some(p=>!p||p.dead||p.blindSec>0||p.flash>0)){rejected.actorBlindOrDead++;continue;}
    const good=actors.every(p=>{const d=distance(p.pos,he.to),angle=Math.atan2(he.to.y-p.pos.y,he.to.x-p.pos.x)-p.va*Math.PI/180,delta=Math.abs(Math.atan2(Math.sin(angle),Math.cos(angle)))*180/Math.PI;return d>=4&&d<=12&&delta<=fovDegrees/2-8;});if(!good){rejected.rangeOrFov++;continue;}
    if(actors.some(p=>walls.some(w=>segmentBox(p.pos,he.to,w)))){rejected.opaqueRoute++;continue;}
    if(window.some(f=>(f.muzzles||[]).some(m=>m.attackerId===actor.id))){rejected.ownMuzzle++;continue;}
    if(window.some((f,i)=>(f.smokes||[]).some(s=>{const a=actors[i].pos,b=he.to,dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((s.pos.x-a.x)*dx+(s.pos.y-a.y)*dy)/(dx*dx+dy*dy)));return(s.tl??1)>0&&Math.hypot(s.pos.x-(a.x+t*dx),s.pos.y-(a.y+t*dy))<6;}))){rejected.smokeRoute++;continue;}
    candidates.push({map:frame.mapKey??null,round:frame.rnd,actorId:actor.id,heId:he.id,seekIndex:index-1,detonationIndex:index,detonationSec:frame.roundSec,target:{...he.to},distanceAtDetonation:distance(frame.players.find(p=>p.id===actor.id).pos,he.to),authority:'genuine saved frames only',status:'NEEDS_NATIVE_CAMERA_FOV_AND_RENDERED_OCCLUSION_PRECONDITIONS',captureOffsetsSec:[-.10,.03,.10,.25,.60],requirements:['Native selected actor + POV + 1x; no scene/camera/frame patch','Actual selected camera distance 4–12m and projected HE contact inside canvas','Actual opaque environment ray from camera to HE contact is unobstructed','Actual DOM blind opacity=0 and no flash-deploy/own muzzle during captured window','Capture RGB at native play relative to observed authoritative detonation onset; dump actual age and monotonic time for every image','Rendered isolated HE film requires human visual review; material hex/CPU texture stats do not prove appearance']});break;
   }
  }
 }
 return{candidates,rejected,verdict:candidates.length?'CANDIDATES_NOT_VISUAL_PASS':'NOT_TRIGGERED_NO_SYNTHETIC_REPLACEMENT'};
}
