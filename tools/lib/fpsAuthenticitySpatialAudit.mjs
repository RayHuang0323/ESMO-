// Real frame/shot measurements, no inferred outcomes or simulation.
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y), round=n=>Number(n.toFixed(4));
export function auditFpsSpatialAuthenticity(sim,anchors){
  const nearest=p=>anchors.reduce((best,node)=>{const d=distance(p,node.pos);return d<best.distance||d===best.distance&&node.key<best.key?{...node,distance:d}:best;},{distance:Infinity,key:'~'});
  const classify=p=>nearest(p).region;
  const rows=new Map(),shots=new Map();
  for(const shot of sim.shotCadenceTelemetry||[]){const prior=shots.get(shot.round);if(!prior||shot.shotAtMs<prior.shotAtMs)shots.set(shot.round,shot);}
  let previous=null;
  for(const frame of sim.frames){
    let row=rows.get(frame.rnd);
    if(!row){row={round:frame.rnd+1,eligibleFrames:0,allTenEligibleFrames:0,sameNodeRegion:{frames:0,seconds:0,longestSec:0,segments:[]},sameRegion:{frames:0,seconds:0,longestSec:0,segments:[]},compactRadius20:{frames:0,seconds:0,longestSec:0,segments:[]},allTenCompactRadius20:{frames:0,seconds:0,longestSec:0,segments:[]},firstShot:null,deaths:[],routeKinds:{},phases:{},routeEpisodes:[],prePlantRotations:[]};rows.set(frame.rnd,row);}
    const alive=frame.players.filter(p=>!p.dead),aliveT=alive.filter(p=>p.side==='t').length,aliveCT=alive.filter(p=>p.side==='ct').length;
    const eligible=!frame.buyP&&aliveT>=3&&aliveCT>=3,regions=[...new Set(alive.map(p=>classify(p.pos)))],nodes=[...new Set(alive.map(p=>nearest(p.pos).key))];
    let maxPair=0;for(let i=0;i<alive.length;i++)for(let j=i+1;j<alive.length;j++)maxPair=Math.max(maxPair,distance(alive[i].pos,alive[j].pos));
    if(eligible)row.eligibleFrames++;if(eligible&&alive.length===10)row.allTenEligibleFrames++;
    const flags={sameNodeRegion:eligible&&nodes.length===1,sameRegion:eligible&&regions.length===1,compactRadius20:eligible&&maxPair<=20,allTenCompactRadius20:eligible&&alive.length===10&&maxPair<=20};
    for(const [key,condition]of Object.entries(flags))if(condition){
      const metric=row[key];metric.frames++;let segment=metric.segments.at(-1);
      const consecutive=previous?.rnd===frame.rnd&&previous.flags[key]&&frame.roundSec-previous.roundSec<=.500001;
      if(consecutive){metric.seconds+=frame.roundSec-previous.roundSec;segment.endSec=frame.roundSec;segment.durationSec=round(segment.endSec-segment.startSec);metric.longestSec=Math.max(metric.longestSec,segment.durationSec);}
      else metric.segments.push({startSec:frame.roundSec,endSec:frame.roundSec,durationSec:0,aliveT,aliveCT,nodeKey:nodes.length===1?nodes[0]:null,region:regions.length===1?regions[0]:null,maxPairDistance:round(maxPair)});
    }
    for(const p of alive){if(p._routePlan){const key=`${p.side}/${p._routePlan.phase}/${p._routePlan.kind}`;row.routeKinds[key]=(row.routeKinds[key]||0)+1;}if(p.side==='t'&&p._routePlan?.phase)row.phases[p._routePlan.phase]=(row.phases[p._routePlan.phase]||0)+1;}
    for(const p of frame.players){
      if(!p._routePlan)continue;
      const identity=JSON.stringify([p.id,p._routePlan.routeId,p._routePlan.phase,p._routePlan.kind,p._routePlan.routeSignature,p.tacticalIntent?.kind]);
      let episode=row.routeEpisodes.findLast(e=>e.playerId===p.id);
      if(!episode||episode.identity!==identity){episode={identity,playerId:p.id,side:p.side,role:p.role,deploymentSite:p.deploymentSite??null,informationRotator:p.informationRotator??null,hasBomb:p.hasBomb,startSec:frame.roundSec,endSec:frame.roundSec,startPos:p.pos,lastPos:p.pos,traveledDistance:0,phase:p._routePlan.phase,kind:p._routePlan.kind,routeId:p._routePlan.routeId,routeSignature:p._routePlan.routeSignature,routeTarget:p.tacticalIntent?.routeTarget??null,informationSource:p._routePlan.informationSource??null,intentKind:p.tacticalIntent?.kind??null,routeIdxStart:p.routeIdx,routeIdxLast:p.routeIdx,waypoints:(p.route||[]).map(point=>({...point}))};row.routeEpisodes.push(episode);}
      else{const delta=distance(episode.lastPos,p.pos);episode.traveledDistance=round(episode.traveledDistance+delta);episode.postBuyNavigatingDistance??=0;if(!frame.buyP&&!p.dead&&['walk','run'].includes(p.locomotion))episode.postBuyNavigatingDistance=round(episode.postBuyNavigatingDistance+delta);episode.lastPos=p.pos;episode.endSec=frame.roundSec;episode.routeIdxLast=p.routeIdx;}
      if(!frame.planted&&p.side==='ct'&&!p.dead&&p.tacticalIntent?.kind==='rotate'){
        const intent=p.tacticalIntent,site=anchors.find(node=>['aSite','bSite'].includes(node.key)&&intent.routeTarget&&distance(node.pos,intent.routeTarget)<.001);
        const priorRotation=row.prePlantRotations.findLast(rotation=>rotation.playerId===p.id);
        if(!priorRotation||priorRotation.routeId!==p._routePlan.routeId){
          const intel=(frame.teamIntel||[]).filter(i=>i.side==='ct'&&frame.roundSec>=i.observedAtSec&&frame.roundSec-i.observedAtSec<=3);
          row.prePlantRotations.push({playerId:p.id,roundSec:frame.roundSec,routeId:p._routePlan.routeId,pos:p.pos,routeTarget:intent.routeTarget,siteNodeKey:site?.key??null,deploymentSite:p.deploymentSite,informationRotator:p.informationRotator,intentSource:intent.source,intentTargetId:intent.targetId,intentObservedAtSec:intent.observedAtSec,routeInformationSource:p._routePlan.informationSource,routeTargetId:p._routePlan.targetId,routeObservedAtSec:p._routePlan.observedAtSec,validIntel:intel,nearSiteObservedTargetIds:site?[...new Set(intel.filter(i=>distance(i.pos,site.pos)<20).map(i=>i.targetId))]:[],firstMotionAtSec:null,physicalDistance:0,lastPos:p.pos,endSec:frame.roundSec});
        }
      }
      const rotation=row.prePlantRotations.findLast(rotation=>rotation.playerId===p.id);
      if(rotation&&!frame.planted&&rotation.routeId===p._routePlan.routeId){const delta=distance(rotation.lastPos,p.pos);if(delta>.05&&rotation.firstMotionAtSec===null)rotation.firstMotionAtSec=frame.roundSec;rotation.physicalDistance=round(rotation.physicalDistance+delta);rotation.lastPos=p.pos;rotation.endSec=frame.roundSec;}
    }
    for(const event of frame.events||[])if(event.type==='kill')row.deaths.push({roundSec:event.roundSec,killerId:event.killerId,victimId:event.victimId,victimSide:event.victimSide,pos:event.pos});
    const shot=shots.get(frame.rnd),muzzle=shot&&(frame.muzzles||[]).find(m=>m.eventId===shot.eventId);
    if(!row.firstShot&&muzzle){
      const attacker=frame.players.find(p=>p.id===shot.attackerId),target=frame.players.find(p=>p.id===shot.targetId);
      const earlierDeaths=new Set(row.deaths.filter(d=>d.roundSec<shot.shotAtMs/1000).map(d=>d.victimId));
      const alreadyDead=new Set((previous?.rnd===frame.rnd?previous.players:[]).filter(p=>p.dead).map(p=>p.id));
      // The victim of this first shot is alive immediately before the shot.
      const atContact=frame.players.filter(p=>!alreadyDead.has(p.id)&&!earlierDeaths.has(p.id));
      let contactMax=0;for(let i=0;i<atContact.length;i++)for(let j=i+1;j<atContact.length;j++)contactMax=Math.max(contactMax,distance(atContact[i].pos,atContact[j].pos));
      const contactRegions=[...new Set(atContact.map(p=>classify(p.pos)))],contactNodes=[...new Set(atContact.map(p=>nearest(p.pos).key))];
      row.firstShot={eventId:shot.eventId,roundSec:shot.shotAtMs/1000,frameSec:frame.roundSec,attackerId:shot.attackerId,targetId:shot.targetId,attackerSide:attacker?.side,targetSide:target?.side,attackerPos:muzzle.pos,targetPos:target?.pos??null,distance:target?round(distance(muzzle.pos,target.pos)):null,lineOfSightRecorded:shot.lineOfSight,fovRecorded:shot.fov,engagementPermissionRecorded:shot.engagementPermission,weaponFamily:shot.weaponFamily,aliveT:atContact.filter(p=>p.side==='t').length,aliveCT:atContact.filter(p=>p.side==='ct').length,positions:atContact.map(p=>({id:p.id,side:p.side,pos:p.pos,region:classify(p.pos),nodeKey:nearest(p.pos).key})),sameNodeRegion:contactNodes.length===1?contactNodes[0]:null,maxPairDistance:round(contactMax),allTenCompact:atContact.length===10&&contactMax<=20,sameRegion:contactRegions.length===1?contactRegions[0]:null};
    }
    for(const p of frame.players){
      const episode=row.routeEpisodes.findLast(e=>e.playerId===p.id);
      if(episode){episode.fakeStage=p.fakeStage??null;episode.fakeNodeKey=p.fakeNodeKey??null;episode.fakeGoal=p.fakeGoal??null;episode.fakeSite=p.fakeSite??null;episode.terminalDead=p.dead;episode.terminalGun=p.gun;episode.terminalHP=p.hp;}
    }
    previous={...frame,flags};
  }
  const rounds=[...rows.values()];
  return {schema:'cs-spatial-authenticity-audit.v1',measurement:{eligible:'buyP=false; aliveT>=3 and aliveCT>=3; excludes late two-player concentration',region:'sameNodeRegion requires one exact nearest authored node key; broad sameRegion combines multiple anchors and is NOT physical concentration (Spawn merges opposite spawns); not canonical polygon',radius:'maximum Euclidean pair distance <=20 for all eligible alive players; exact all-ten subset separate',duration:'sum consecutive 0.5sec saved-frame deltas; isolated frame duration=0; no extrapolation',contact:'first real shot telemetry matched authoritative muzzle event; shooter muzzle and target same-tick saved position; living roster reconstructed before shot using prior dead and earlier death events; LOS recorded canonical permission, not recomputed from newer map'},summary:{eligibleFrames:rounds.reduce((n,r)=>n+r.eligibleFrames,0),allTenEligibleFrames:rounds.reduce((n,r)=>n+r.allTenEligibleFrames,0),sameNodeRegionSeconds:round(rounds.reduce((n,r)=>n+r.sameNodeRegion.seconds,0)),firstContactSameNodeRounds:rounds.filter(r=>r.firstShot?.sameNodeRegion).length,broadRegionOnlySeconds:round(rounds.reduce((n,r)=>n+r.sameRegion.seconds,0)),compactRadius20Seconds:round(rounds.reduce((n,r)=>n+r.compactRadius20.seconds,0)),allTenCompactRadius20Seconds:round(rounds.reduce((n,r)=>n+r.allTenCompactRadius20.seconds,0)),firstContactAllTenCompactRounds:rounds.filter(r=>r.firstShot?.allTenCompact).length,firstContactSameRegionRounds:rounds.filter(r=>r.firstShot?.sameRegion).length},rounds};
}
