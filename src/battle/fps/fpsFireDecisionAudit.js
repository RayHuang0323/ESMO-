// Read-only, bounded explanation of real scheduler decisions. Never grants a
// shot, changes target priority, advances a clock, or consumes ammunition.
export function explainFpsUnfiredContact(s,shots,windowEndMs) {
 if(shots.some(e=>e.attackerId===s.actorId&&e.targetId===s.targetId))return 'fired';
 if(s.actor.dead)return 'actor-died';
 if(s.target.dead)return 'target-died';
 if(!s.lineOfSight)return 'wall';
 if(!s.fov)return 'outside-fov';
 if(!s.inRange)return 'outside-weapon-range';
 if(s.smokeBlocked)return 'smoke';
 if(!s.mapAware)return 'outside-awareness';
 if(s.blindSec>0)return 'blind';
 if(s.picking>0)return 'picking';
 if(s.state==='BUY'||s.state==='撤退')return 'ineligible-contact-state';
 if(s.objectiveLocked)return 'objective-interaction';
 if(s.planting)return 'planting';
 if(s.ammo===0&&s.reserveAmmo===0)return 'empty';
 if(s.weaponReadyAtMs>=windowEndMs)return 'reloading';
 if(s.reactionReadyAtMs==null||s.reactionReadyAtMs>=windowEndMs)return 'reaction';
 if(s.cadenceReadyAtMs>=windowEndMs)return 'cadence';
 if(shots.some(e=>e.attackerId===s.actorId))return 'engaged-other-target';
 return 'unexplained';
}
export function createFpsFireDecisionAudit(limit=512) {
 const last=new Map(),samples=[],reasons={},byActor={};let observations=0,unexplained=0;
 return {
  record(s,shots,windowEndMs){
   const reason=explainFpsUnfiredContact(s,shots,windowEndMs);observations++;reasons[reason]=(reasons[reason]||0)+1;
   const actor=byActor[s.actorId]??={};actor[reason]=(actor[reason]||0)+1;if(reason==='unexplained')unexplained++;
   // Keep changing explanations for physically visible contacts and objective
   // contests. Geometry-denied ordinary pairs need counters, not replay bloat.
   const key=s.round+':'+s.actorId+':'+s.targetId;
   if((s.lineOfSight&&s.fov&&s.inRange||s.defuser)&&last.get(key)!==reason){
    last.set(key,reason);samples.push({round:s.round,roundSec:s.roundSec,actorId:s.actorId,targetId:s.targetId,gun:s.gun,state:s.state,picking:s.picking,distance:s.distance,defuser:s.defuser,reason,blindSec:s.blindSec,ammo:s.ammo,reserveAmmo:s.reserveAmmo,lineOfSight:s.lineOfSight,smokeBlocked:s.smokeBlocked,fov:s.fov,inRange:s.inRange,mapAware:s.mapAware,reactionReadyAtMs:s.reactionReadyAtMs,weaponReadyAtMs:s.weaponReadyAtMs,cadenceReadyAtMs:s.cadenceReadyAtMs});if(samples.length>limit)samples.shift();
   }
   if(last.size>100)for(const k of last.keys())if(!k.startsWith(s.round+':'))last.delete(k);
   return reason;
  },
  snapshot(){return{version:1,observations,unexplained,reasons:{...reasons},byActor,sampleLimit:limit,samples,scope:'actual pre-scheduler state plus authoritative emitted shots; bounded, no gameplay mutations'};},
 };
}
