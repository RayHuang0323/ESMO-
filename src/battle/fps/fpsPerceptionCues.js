// Causal, approximate sound/death information. Never grants a target lock or
// reads an enemy's current position. Callers still enforce FOV / LOS / smoke.
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const finite=p=>Number.isFinite(p?.x)&&Number.isFinite(p?.y);
export function fpsKnownBombThreat({player,intel=[],bombPos,roundSec,walls=[],smokes=[],lineBlocked,smokeBlocks,publicOpponentsRemain=true}){
 if(!publicOpponentsRemain||!finite(player?.pos)||!finite(bombPos))return false;
 const exposed=pos=>!lineBlocked(pos,player.pos,walls)&&!smokeBlocks(pos,player.pos,smokes);
 if(intel.some(i=>i.side===player.side&&finite(i.pos)&&roundSec>=i.observedAtSec&&roundSec-i.observedAtSec<=3&&distance(i.pos,bombPos)<9&&exposed(i.pos)))return true;
 const cue=player.perceptionCue;
 return Boolean(cue?.source==='gunshot-area'&&finite(cue.pos)&&roundSec>=cue.observedAtSec&&roundSec-cue.observedAtSec<=2&&distance(cue.pos,bombPos)<9+Math.max(0,Math.min(8,cue.uncertainty||0))*.5&&exposed(cue.pos));
}
export function fpsPerceptionCue({player,gunshots=[],deaths=[],roundSec,walls=[],lineBlocked}){
 if(player.dead||!finite(player.pos))return null;
 const cues=[];
 for(const event of gunshots){
  const at=event.shotAtMs/1000,age=roundSec-at;
  if(event.side===player.side||event.attackerId===player.id||!finite(event.pos)||!Number.isFinite(at)||age<0||age>2)continue;
  const muffled=['usp'].includes(event.gun),occluded=Boolean(lineBlocked?.(player.pos,event.pos,walls));
  const range=(muffled?16:44)*(occluded?.58:1);
  if(distance(player.pos,event.pos)>range)continue;
  // Directional area only: do not give pixel-perfect through-wall tracking.
  const cell=occluded?8:4,pos={x:Math.round(event.pos.x/cell)*cell,y:Math.round(event.pos.y/cell)*cell};
  cues.push({source:'gunshot-area',pos,observedAtSec:at,ageSec:age,uncertainty:cell,occluded,eventId:event.eventId||event.id});
 }
 for(const event of deaths){
  const age=roundSec-event.roundSec;
  if(event.victimSide!==player.side||!finite(event.pos)||age<0||age>3||distance(player.pos,event.pos)>32)continue;
  cues.push({source:'teammate-death-location',pos:{...event.pos},observedAtSec:event.roundSec,ageSec:age,uncertainty:0,eventId:event.victimId});
 }
 cues.sort((a,b)=>a.ageSec-b.ageSec||distance(player.pos,a.pos)-distance(player.pos,b.pos)||String(a.eventId).localeCompare(String(b.eventId)));
 return cues[0]||null;
}
