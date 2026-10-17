// Pure observation over real saved frames. A long blocked idle look is a
// review candidate, not proof that an authored defensive hold is a bug.
export function inspectFpsFrontWallDwell(result,api,mapKey,{thresholdSec=3,probeDistance=4}={}){
  const walls=api.c5a2SolidObstacles(api.MAPS[mapKey]),active=new Map(),episodes=[];
  const report={schema:'cs-front-wall-dwell-runtime-observation.v1',mapKey,thresholdSec,probeDistance,method:'Real canonical saved actor states; product LOS against a 4-unit forward ray; excludes buy/dead/moving and explicitly records intel/corner/active-cover/closed-public-space reasons. This is ground-plane authority, not RGB proof of an eye-height wall.',sampleCount:0,blockedIdleSamples:0,closedSpaceHoldSamples:0,missingLOSGeometrySamples:0,longUnexplainedCount:0,maxUnexplainedSec:0,episodes,coverage:'NOT_TRIGGERED'};
  const end=(key,at,reason)=>{const e=active.get(key);if(!e)return;e.endedAtSec=at;e.durationSec=Math.max(0,e.lastEndSec-e.startSec);e.endReason=reason;report.maxUnexplainedSec=Math.max(report.maxUnexplainedSec,e.durationSec);if(e.durationSec>=thresholdSec){report.longUnexplainedCount++;episodes.push(e);}active.delete(key);};
  let previous=null;
  for(const frame of result.frames){
    const dt=previous?.rnd===frame.rnd?frame.roundSec-previous.roundSec:.5;
    for(const [key,e]of active)if(!key.startsWith(frame.rnd+':'))end(key,e.lastEndSec,'ROUND_ENDED');
    for(const p of frame.players){
      const key=`${frame.rnd}:${p.id}`,speed=Number(p.velocityUnitsPerSec),awareness=p.awareness;
      report.sampleCount++;
      const valid=Number.isFinite(p.pos?.x)&&Number.isFinite(p.pos?.y)&&Number.isFinite(p.va)&&Number.isFinite(speed);
      const forward=valid?{x:p.pos.x+Math.cos(p.va*Math.PI/180)*probeDistance,y:p.pos.y+Math.sin(p.va*Math.PI/180)*probeDistance}:null;
      const blocked=valid&&api.lineBlocked(p.pos,forward,walls);
      const reasons=[];
      if(awareness?.corner||String(awareness?.source).includes('corner'))reasons.push('corner-preaim');
      if(p.tacticalIntent?.aim||String(awareness?.source).includes('intel'))reasons.push('reported-intel');
      if(awareness?.source==='closed-space-hold'&&awareness.reason==='no-clear-public-node-or-local-ray'){reasons.push('closed-public-space');report.closedSpaceHoldSamples++;}
      if(awareness?.source==='geometry-unavailable-hold')report.missingLOSGeometrySamples++;
      if(p._routePlan?.kind==='cover-peek'&&p.routeIdx<(p.routePoints||p.route||[]).length-1)reasons.push('active-cover-peek');
      if(p.hasBomb&&(p.plantProgressSec||0)>0)reasons.push('plant');
      const unexplained=valid&&!p.dead&&!frame.buyP&&speed<=.22&&blocked&&reasons.length===0;
      if(!unexplained){end(key,frame.roundSec,!valid?'UNKNOWN_STATE':p.dead?'DEAD':frame.buyP?'BUY':speed>.22?'MOVED':!blocked?'LOOK_RAY_OPEN':reasons.join('+'));continue;}
      report.blockedIdleSamples++;
      if(!active.has(key))active.set(key,{round:frame.rnd+1,actorId:p.id,startSec:frame.roundSec,lastEndSec:frame.roundSec,samples:[]});
      const e=active.get(key);e.lastEndSec=frame.roundSec+Math.max(0,dt);
      if(e.samples.length<24)e.samples.push({frame:frame.fi,roundSec:frame.roundSec,pos:{...p.pos},va:p.va,state:p.state,objectiveState:p.objectiveState,stage:p.tacticalStage,duty:p.tacticalDuty,speed,blindSec:p.blindSec,reloading:p.reloading,picking:p.picking,awareness:awareness?{source:awareness.source,reason:awareness.reason??null,corner:awareness.corner,scanDegrees:awareness.scanDegrees}:null,forward,frontLOSBlocked:blocked,routeKind:p._routePlan?.kind,routeIdx:p.routeIdx,routeLength:(p.routePoints||p.route||[]).length,explicitReasons:reasons});
    }
    previous=frame;
  }
  for(const [key,e]of active)end(key,e.lastEndSec,'MATCH_ENDED');
  report.coverage=report.blockedIdleSamples?'OBSERVED':'NOT_TRIGGERED';report.assessment=report.longUnexplainedCount||report.missingLOSGeometrySamples?'REVIEW_REQUIRED':'NO_LONG_UNEXPLAINED_WINDOW_OBSERVED';
  return report;
}
