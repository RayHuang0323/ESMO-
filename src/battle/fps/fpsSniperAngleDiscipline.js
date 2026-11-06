// Map v2 only. Inputs are public geometry, the actor's route and expiring
// observations. No opponent collection, outcome, RNG or wall penetration.
const finite=p=>Number.isFinite(p?.x)&&Number.isFinite(p?.y);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const angle=(a,b)=>Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI;
const delta=(a,b)=>((b-a+540)%360+360)%360-180;
const normalize=a=>(a%360+360)%360;
// A covered holding pose may crouch below the very ledge it watches. Save
// a real standing pose when only that pose has a clear authorized sightline.
// Stance is presentation state; it does not alter fire, damage or outcomes.
export function fpsSniperHoldStance({player,stance,walls,lineBlocked}){
 const target=player.awareness?.anglePlan?.target;
 if(stance!=='crouched'||!['awp','scout'].includes(player.gun)||!finite(target))return stance;
 const blocked=eye=>lineBlocked(player.pos,target,walls,{fromEyeHeight:eye});
 return blocked(1.06)&&!blocked(1.56)?'standing':stance;
}
export function fpsSniperAngleLook({player,nodes,intel=[],roundSec,dtSec=.5,walls=[],lineBlocked,visibleContact=null}){
 const pos=player.pos,fromVa=Number(player.va)||0;
 const probe=(bearing,n)=>({x:pos.x+Math.cos(bearing*Math.PI/180)*n,y:pos.y+Math.sin(bearing*Math.PI/180)*n});
 const clear=target=>finite(target)&&typeof lineBlocked==='function'&&!lineBlocked(pos,target,walls);
 const laneClear=target=>{
  if(!clear(target)||distance(pos,target)<=.5)return false;
  // A node is a routing landmark, not necessarily the end of a firing lane.
  // Check beyond nearby nodes: otherwise an open floor point just in front
  // of a building lets the scope settle on that building's solid facade.
  const bearing=angle(pos,target),range=Math.max(24,distance(pos,target));
  return [0,-2,2].every(offset=>clear(probe(bearing+offset,range)));
 };
 const own=intel.filter(i=>i.side===player.side&&roundSec>=i.observedAtSec&&roundSec-i.observedAtSec<=3&&finite(i.pos));
 const personallySeen=own.filter(i=>i.observedAtSec===roundSec&&(i.observerId===player.id||i.visibleTo?.includes(player.id))).sort((a,b)=>distance(pos,a.pos)-distance(pos,b.pos))[0];
 const direct=finite(visibleContact?.pos)&&clear(visibleContact.pos)?visibleContact:personallySeen&&clear(personallySeen.pos)?personallySeen:null;
 const phase=player.tacticalPhase||player._tacticalPhase||'',old=player.awareness?.anglePlan;
 const finish=(target,source,{key=null,corner=false,reason=null,instant=false,informationKey=null}={})=>{
  const desired=finite(target)?angle(pos,target):fromVa,maxTurn=(180+Math.max(0,Math.min(100,player.stats?.apm??70))*1.4)*Math.max(0,dtSec),turn=instant?delta(fromVa,desired):Math.max(-maxTurn,Math.min(maxTurn,delta(fromVa,desired)));
  return {va:normalize(fromVa+turn),desiredVa:desired,source,reason,targetKey:key,corner,scanDegrees:0,turnDegrees:turn,pace:corner?.58:1,
   anglePlan:finite(target)?{target:{...target},key,phase,informationKey,selectedAtSec:old?.key===key&&old?.informationKey===informationKey?old.selectedAtSec:roundSec}:null};
 };
 if(direct)return finish(direct.pos,'visible',{key:'contact:'+direct.targetId,instant:true,reason:'fresh-personal-LOS'});
 const next=player.route?.[player.routeIdx+1],following=player.route?.[player.routeIdx+2];
 const moving=player.velocityUnitsPerSec>.44&&!player.tacticalIntent?.stopMovement;
 if(moving&&finite(next)){
  const corner=finite(following)&&distance(pos,next)<5&&Math.abs(delta(angle(pos,next),angle(next,following)))>30;
  return finish(corner?following:next,corner?'corner-preaim':'route',{corner,reason:'moving-public-route-preaim'});
 }
 const intent=player.tacticalIntent,known=own.find(i=>i.targetId===intent?.targetId&&i.observedAtSec===intent?.observedAtSec)||own.sort((a,b)=>distance(pos,a.pos)-distance(pos,b.pos))[0];
 const cue=player.perceptionCue&&roundSec>=player.perceptionCue.observedAtSec&&roundSec-player.perceptionCue.observedAtSec<=3?player.perceptionCue:null;
 const reserved=player.postPlantPlan||player.retakeCoverPlan;
 const information=known?.pos||cue?.pos,informationKey=known?`${known.targetId}:${known.observedAtSec}`:cue?`${cue.source}:${cue.observedAtSec}`:null;
 // A reported position behind cover only chooses a public entrance; it never
 // becomes a ray through that cover or an unbounded live target track.
 if(finite(information)&&(known||distance(pos,information)>=12)&&laneClear(information))return finish(information,known?'last-known-clear-lane':cue.source,{key:'observed-lane',informationKey,reason:'expiring-observation-with-full-LOS'});
 if(reserved?.duty==='bomb-denial'&&clear(reserved.watchTarget))return finish(reserved.watchTarget,'post-plant-bomb-watch',{key:'public-c4-watch',reason:'assigned-public-defuse-footprint'});
 if(finite(reserved?.threat)&&laneClear(reserved.threat))return finish(reserved.threat,'post-plant-reserved-angle',{key:'reserved-angle',informationKey,reason:'assigned-visible-entrance'});
 const enemySpawn=nodes[player.side==='ct'?'tSpawn':'ctSpawn'];
 const incoming=target=>phase==='post-plant'||Boolean(reserved)||!finite(enemySpawn)||distance(target,enemySpawn)<distance(pos,enemySpawn)-4;
 if(old?.phase===phase&&old.key?.startsWith('edge:')&&finite(old.target)&&distance(pos,old.target)>=12&&laneClear(old.target)&&
    (informationKey?informationKey===old.informationKey:incoming(old.target)))return finish(old.target,'sniper-held-entry',{key:old.key,informationKey,reason:'same-valid-public-angle'});
 const preferred=finite(information)?angle(pos,information):finite(reserved?.threat)?angle(pos,reserved.threat):finite(nodes[player.side==='ct'?'tSpawn':'ctSpawn'])?angle(pos,nodes[player.side==='ct'?'tSpawn':'ctSpawn']):fromVa;
 // Routing nodes can lie in open floor in front of a facade. Public corners
 // describe where an opponent can actually emerge. Keep the centre clear,
 // with an occluding edge inside the optic, rather than aiming at a facade
 // beyond an arbitrary floor node. This uses static cover, never an enemy.
 const edgeCandidates=walls.flatMap((w,i)=>{
  const pad=1.8;
  return [w.x-pad,w.x+w.w+pad].flatMap((x,xi)=>[w.y-pad,w.y+w.h+pad].map((y,yi)=>({key:`edge:${i}:${xi}:${yi}`,target:{x,y}})));
 }).filter(c=>c.target.x>=3&&c.target.x<=97&&c.target.y>=3&&c.target.y<=97&&distance(pos,c.target)>=12&&distance(pos,c.target)<=45&&(informationKey||incoming(c.target)))
  .map(c=>({...c,score:Math.abs(delta(preferred,angle(pos,c.target)))+distance(pos,c.target)*.12})).sort((a,b)=>a.score-b.score||a.key.localeCompare(b.key));
 const edge=edgeCandidates.find(c=>laneClear(c.target)&&[-8,8].some(offset=>!clear(probe(angle(pos,c.target)+offset,distance(pos,c.target)+3))));
 if(edge)return finish(edge.target,'sniper-public-entry',{key:edge.key,informationKey,reason:'visible-public-cover-edge;clear-firing-lane'});
 const candidates=Object.entries(nodes).filter(([key,p])=>!key.endsWith('Spawn')&&finite(p)&&distance(pos,p)>=12&&distance(pos,p)<=45&&(informationKey||incoming(p)))
  .map(([key,target])=>({key,target,score:Math.abs(delta(preferred,angle(pos,target)))+distance(pos,target)*.12})).sort((a,b)=>a.score-b.score||a.key.localeCompare(b.key));
 const entry=candidates.find(c=>laneClear(c.target));
 if(entry)return finish(entry.target,'sniper-public-entry',{key:entry.key,informationKey,reason:information?'last-known-occluded;watch-visible-entry':'public-entrance-full-LOS'});
 // Confined rooms may have no named node in view. A local corridor must stay
 // clear for twenty-four units; a short point before a wall is not a sniper lane.
 const offsets=[0];for(let a=5;a<=180;a+=5)offsets.push(-a,a);
 const offset=offsets.find(d=>laneClear(probe(preferred+d,24))&&(informationKey||incoming(probe(preferred+d,24))));
 if(offset!==undefined)return finish(probe(preferred+offset,24),'sniper-local-corridor',{key:'local-corridor',informationKey,reason:'no-visible-named-entry;clear-corridor'});
 return finish(null,'sniper-no-visible-entry',{reason:'enclosed-position;no-fabricated-LOS'});
}
