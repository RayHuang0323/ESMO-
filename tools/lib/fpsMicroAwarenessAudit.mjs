// Observational addendum over already-created canonical frames. No simulation,
// new assertion denominator, outcome change or inference from a helper call.
export function inspectFpsMicroAwareness(result,api,mapKey){
  const finite=p=>Number.isFinite(p?.x)&&Number.isFinite(p?.y),distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const walls=api.c5a2SolidObstacles(api.MAPS[mapKey]),active=new Map(),peekEpisodes=[];
  const audit={schema:'cs-micro-awareness-observation.v1',mapKey,method:'Saved authoritative frames and cover-peek events; no extra simulation. Out/back arrival is observed within .65 map units at a later saved tick. Corner/scan samples prove recorded movement/look intent; no RGB or professional-quality claim.',counts:{awareness:0,routePreaim:0,cornerPreaim:0,cornerPaceWhileMoving:0,scanWhileMoving:0,publicApproach:0,peekStarted:0,peekOutObserved:0,peekReturnedObserved:0},samples:{corner:[],route:[],scan:[]},peekEpisodes,issues:[],coverage:{},navigation:{wallSegmentCrossings:result.movementAudit?.wallSegmentCrossings??null,teleportViolations:result.movementAudit?.teleportViolations??null}};
  const note=(kind,detail)=>{if(audit.issues.length<32)audit.issues.push({kind,...detail});};
  const close=(id,status,sec)=>{const e=active.get(id);if(!e)return;e.status=status;e.closedAtSec=sec;active.delete(id);};
  let previousRound=null;
  for(const frame of result.frames){
    if(previousRound!==null&&frame.rnd!==previousRound)for(const [id,e]of active)close(id,'ROUND_ENDED',e.lastAtSec);
    previousRound=frame.rnd;
    for(const p of frame.players){const a=p.awareness;if(!a||p.dead||frame.buyP)continue;
      audit.counts.awareness++;
      const move=finite(p.prevPos)&&finite(p._preSeparationPos||p.pos)?distance(p.prevPos,p._preSeparationPos||p.pos):0;
      const sample={frame:frame.fi,round:frame.rnd+1,roundSec:frame.roundSec,id:p.id,side:p.side,pos:{...p.pos},va:p.va,state:p.state,stage:p.tacticalStage,duty:p.tacticalDuty,routeKind:p._routePlan?.kind,routeIdx:p.routeIdx,next:p.routePoints?.[p.routeIdx+1]||null,awareness:a,moved:Number(move.toFixed(4))};
      if(!Number.isFinite(a.va)||!Number.isFinite(a.turnDegrees)||!finite(p.pos))note('NONFINITE_LOOK_OR_POSITION',{frame:frame.fi,id:p.id});
      if(a.source==='route'){audit.counts.routePreaim++;if(audit.samples.route.length<8)audit.samples.route.push(sample);}
      if(a.source==='corner-preaim'){audit.counts.cornerPreaim++;if(move>.02&&a.pace>0&&a.pace<1)audit.counts.cornerPaceWhileMoving++;if(audit.samples.corner.length<16)audit.samples.corner.push(sample);}
      if(Math.abs(a.scanDegrees||0)>.5&&move>.02){audit.counts.scanWhileMoving++;if(audit.samples.scan.length<12)audit.samples.scan.push(sample);}
      if(a.source==='own-map-approach')audit.counts.publicApproach++;
    }
    for(const event of frame.events||[])if(event.type==='cover-peek'){
      const p=frame.players.find(p=>p.id===event.playerId),id=`${frame.rnd}:${event.playerId}`;
      if(active.has(id))close(id,'SUPERSEDED_BY_NEW_PEEK',frame.roundSec);
      const points=event.points||[],e={round:frame.rnd+1,id:event.playerId,eventId:event.id,startedAtSec:event.roundSec??frame.roundSec,points,source:event.source,approachKey:event.approachKey,stageAtStart:p?.tacticalStage??null,dutyAtStart:p?.tacticalDuty??null,status:'ACTIVE',outAtSec:null,returnAtSec:null,samples:[]};
      peekEpisodes.push(e);active.set(id,e);audit.counts.peekStarted++;
      const approach=api.MAPS[mapKey].nodes[event.approachKey];
      e.geometry={finite:points.length===3&&points.every(finite),returnsToSameCover:points.length===3&&distance(points[0],points[2])<1e-6,walkable:points.length===3&&points.every(point=>!api.blocked(point,walls,api.PLAYER_R)),segmentsClear:points.length===3&&points.slice(1).every((point,i)=>!api.lineBlocked(points[i],point,walls)),coverLOSBlocked:finite(approach)&&points.length===3?api.lineBlocked(points[0],approach,walls):null,outLOSOpened:finite(approach)&&points.length===3?!api.lineBlocked(points[1],approach,walls):null};
      if(Object.values(e.geometry).some(value=>value===false))note('PEEK_GEOMETRY',{eventId:event.id,geometry:e.geometry,points});
    }
    for(const [id,e]of active){const p=frame.players.find(p=>p.id===e.id);e.lastAtSec=frame.roundSec;
      if(!p||p.dead){close(id,'ACTOR_DIED_OR_MISSING',frame.roundSec);continue;}
      const position=p.pos,cover=e.points[0],out=e.points[1];
      if(!finite(position)||!finite(cover)||!finite(out)){close(id,'INVALID_POINTS',frame.roundSec);continue;}
      const outDistance=distance(position,out),coverDistance=distance(position,cover);
      if(e.samples.length<32)e.samples.push({frame:frame.fi,roundSec:frame.roundSec,pos:{...position},outDistance:Number(outDistance.toFixed(4)),coverDistance:Number(coverDistance.toFixed(4)),routeKind:p._routePlan?.kind,routeIdx:p.routeIdx,stage:p.tacticalStage,duty:p.tacticalDuty,state:p.state,intent:p.tacticalIntent?.kind??null});
      if(JSON.stringify(p.tacticalDuty)!==JSON.stringify(e.dutyAtStart))note('DUTY_CHANGED_DURING_PEEK',{eventId:e.eventId,frame:frame.fi,before:e.dutyAtStart,after:p.tacticalDuty});
      if(e.outAtSec===null&&outDistance<=.65&&frame.roundSec>e.startedAtSec){e.outAtSec=frame.roundSec;audit.counts.peekOutObserved++;}
      if(e.outAtSec!==null&&frame.roundSec>e.outAtSec&&coverDistance<=.65){e.returnAtSec=frame.roundSec;audit.counts.peekReturnedObserved++;close(id,'OUT_AND_BACK_OBSERVED',frame.roundSec);continue;}
      if(frame.roundSec>e.startedAtSec&&p._routePlan?.kind!=='cover-peek'){e.interruption={routeKind:p._routePlan?.kind,intent:p.tacticalIntent?.kind??null,stage:p.tacticalStage,planted:frame.planted};close(id,'ROUTE_INTERRUPTED',frame.roundSec);continue;}
      if(frame.roundSec>e.startedAtSec&&p.routeIdx>=p.routePoints.length-1)close(id,'ROUTE_ENDED_WITHOUT_OBSERVED_OUT_AND_BACK',frame.roundSec);
    }
  }
  for(const [id,e]of active)close(id,'MATCH_ENDED',e.lastAtSec);
  for(const [name,count]of Object.entries(audit.counts))audit.coverage[name]={status:count?'OBSERVED':'NOT_TRIGGERED',count};
  audit.peekStatuses={};for(const e of peekEpisodes)audit.peekStatuses[e.status]=(audit.peekStatuses[e.status]||0)+1;
  audit.assessment=audit.issues.length?'OBSERVED_ISSUES_REVIEW_REQUIRED':'OBSERVATION_ONLY';
  return audit;
}
