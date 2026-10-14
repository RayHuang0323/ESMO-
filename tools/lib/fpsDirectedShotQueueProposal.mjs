// Review proposal only. No product import, RNG, damage, ammo spending or movement.
// Candidate actors/targets remain canonical references; the emitter owns mutations.
export function createFpsDirectedShotQueue({
  candidates, windowStartMs, windowEndMs,
  getWeaponReadyAtMs, getCadenceReadyAtMs=()=>windowStartMs,
  getIntervalMs, isActorAvailable=actor=>!actor.dead,
  isTargetAvailable=target=>!target.dead,
  isCandidateVisible=()=>true, maxOperations=10000,
}) {
  if(!Number.isFinite(windowStartMs)||!Number.isFinite(windowEndMs)||windowEndMs<=windowStartMs)throw Error('Invalid shot window');
  const byActor=new Map(),versions=new Map(),pending=new Map(),actorFloors=new Map(),queue=[];
  let watermarkMs=windowStartMs,operations=0;
  const count=()=>{if(++operations>maxOperations)throw Error('Directed shot queue operation bound exceeded');};
  const actorKey=actor=>String(actor.id),targetKey=target=>String(target.id);
  for(const candidate of candidates){
    if(!candidate.actor?.id||!candidate.target?.id)throw Error('Directed candidate needs canonical actor/target ids');
    const id=actorKey(candidate.actor);if(!byActor.has(id))byActor.set(id,[]);byActor.get(id).push(candidate);
  }
  const legal=candidate=>isActorAvailable(candidate.actor)&&isTargetAvailable(candidate.target)&&isCandidateVisible(candidate);
  const timeFor=(candidate,floorMs)=>{
    if(!legal(candidate)||!Number.isFinite(candidate.reactionReadyAtMs))return Infinity;
    const weaponMs=getWeaponReadyAtMs(candidate.actor,floorMs),cadenceMs=getCadenceReadyAtMs(candidate.actor,floorMs);
    if(!Number.isFinite(weaponMs)||!Number.isFinite(cadenceMs))return Infinity;
    return Math.max(windowStartMs,watermarkMs,floorMs,actorFloors.get(actorKey(candidate.actor))??windowStartMs,candidate.reactionReadyAtMs,weaponMs,cadenceMs);
  };
  const compare=(a,b)=>a.shotAtMs-b.shotAtMs||String(a.actor.id).localeCompare(String(b.actor.id))||String(a.target.id).localeCompare(String(b.target.id));
  const candidateCompare=(a,b)=>a.shotAtMs-b.shotAtMs||(Number(b.priority)||0)-(Number(a.priority)||0)||(Number(a.distance)||0)-(Number(b.distance)||0)||targetKey(a.target).localeCompare(targetKey(b.target));
  function enqueueActor(id,floorMs=watermarkMs){
    count();const version=(versions.get(id)||0)+1;versions.set(id,version);
    actorFloors.set(id,Math.max(actorFloors.get(id)??windowStartMs,floorMs));
    const choices=(byActor.get(id)||[]).map(candidate=>({...candidate,shotAtMs:timeFor(candidate,floorMs)})).filter(item=>item.shotAtMs<windowEndMs).sort(candidateCompare);
    if(!choices.length)return;
    queue.push({...choices[0],actorId:id,version});queue.sort(compare);
  }
  for(const id of [...byActor.keys()].sort())enqueueActor(id,windowStartMs);
  function next(){
    if(pending.size)throw Error('afterShot must acknowledge the prior opportunity before next');
    while(queue.length){
      count();const item=queue.shift();if(versions.get(item.actorId)!==item.version)continue;
      if(pending.has(item.actorId))throw Error('afterShot must acknowledge the prior actor opportunity');
      if(!legal(item)){
        // A newly dead target may release another acquired target before this
        // stale opportunity's old time, but never before already emitted events.
        enqueueActor(item.actorId,watermarkMs);continue;
      }
      const actualReady=timeFor(item,watermarkMs);
      if(!Number.isFinite(actualReady)||actualReady>=windowEndMs)continue;
      if(actualReady!==item.shotAtMs){enqueueActor(item.actorId,watermarkMs);continue;}
      watermarkMs=item.shotAtMs;pending.set(item.actorId,item);
      return item;
    }
    return null;
  }
  function afterShot(item,{fired,shotAtMs=item.shotAtMs,nextReadyAtMs}={}){
    const issued=pending.get(item.actorId);if(issued!==item)throw Error('Opportunity must be acknowledged once');
    if(!Number.isFinite(shotAtMs)||shotAtMs<item.shotAtMs||shotAtMs<watermarkMs)throw Error('Emitter cannot backdate a shot');
    pending.delete(item.actorId);
    watermarkMs=shotAtMs;
    if(fired){
      const interval=getIntervalMs(item.actor);if(!Number.isFinite(interval)||interval<=0)throw Error('Invalid actor cadence interval');
      enqueueActor(item.actorId,Math.max(shotAtMs+interval,Number.isFinite(nextReadyAtMs)?nextReadyAtMs:-Infinity));
    }else if(Number.isFinite(nextReadyAtMs)&&nextReadyAtMs>shotAtMs){
      // Reload / handling denial may retry at its real future time. An
      // unexplained refusal is not retried forever at the same timestamp.
      enqueueActor(item.actorId,nextReadyAtMs);
    }
  }
  return {next,afterShot,get watermarkMs(){return watermarkMs;},get operations(){return operations;}};
}
