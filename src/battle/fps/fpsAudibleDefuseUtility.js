import {chooseFpsContextUtility as previous} from './fpsBombObjectivePlanning.js';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

// Hearing gives the public C4 position, never a hidden defuser position/id.
// Use only a grenade actually carried, with the existing cooldown and actual
// blast/fire envelope. Damage, flight, inventory and defuse interruption stay
// in their existing authoritative owners.
export function chooseFpsContextUtility(args){
 const {player,players=[],bombPos,roundSec,sceneVersion,planted,throwables=[],mollys=[],utilityGeometry}=args;
 const cue=player.perceptionCue;
 if(!['major.v3','major.v4','major.v5'].includes(sceneVersion)||!planted||player.side!=='t'||!bombPos||player.dead||player.blindSec>0||
  cue?.source!=='defuse-sound'||roundSec<cue.observedAtSec||roundSec-cue.observedAtSec>1||
  distance(cue.pos,bombPos)>.1||distance(player.pos,bombPos)>26||roundSec<12||roundSec-(player.lastUtilityAtSec??-Infinity)<3)return previous(args);
 for(const type of ['molly','he']){
  if(!player.nades?.includes(type))continue;
  const radius=type==='molly'?utilityGeometry?.mollyRadius:utilityGeometry?.heRadius;
  if(!Number.isFinite(radius)||!Number.isFinite(utilityGeometry?.playerRadius))continue;
  const safeDistance=Math.max(8,radius+utilityGeometry.playerRadius+.2);
  if(players.some(p=>!p.dead&&p.side===player.side&&distance(p.pos,bombPos)<safeDistance))continue;
  if(throwables.some(t=>t.type===type&&distance(t.to,bombPos)<7)||type==='molly'&&mollys.some(m=>m.tl>0&&distance(m.pos,bombPos)<radius))continue;
  const plan=player.utilityPlans?.find(p=>p.type===type);
  args.onWindow?.(type,'eligible-audible-defuse',plan);
  return {type,to:{...bombPos},intent:'deny-defuse',planId:plan?.id||null,purchasePurpose:plan?.purpose||null,
   informationSource:'audible-defuse-at-public-c4',observedAtSec:cue.observedAtSec};
 }
 return previous(args);
}
