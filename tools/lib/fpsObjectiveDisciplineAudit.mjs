const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function inspectFpsObjectiveDiscipline(sim){
 const result={droppedFrames:0,recoveryAssignments:0,recoveryRoutes:0,recovered:0,plantStarts:0,plants:sim.bombAudit.plantEvents.length,coverRoutes:0,protectedCrouchFrames:0,continuingDefuseSamples:0,violations:[],timeLosses:sim.roundHist.filter(r=>r.how==='time').map(r=>({round:r.round,winnerSide:r.winnerSide,how:r.how}))};
 let previous=null;
 const fail=row=>{if(result.violations.length<32)result.violations.push(row);};
 for(const frame of sim.frames){
  for(const event of frame.events||[]){if(event.type==='bomb-recovery-assigned')result.recoveryAssignments++;if(event.type==='bomb-recovered')result.recovered++;if(event.type==='bomb-plant-start')result.plantStarts++;}
  const alive=frame.players.filter(p=>!p.dead),recoverers=alive.filter(p=>p.tacticalIntent?.kind==='recover-c4');
  if(frame.droppedBomb&&!frame.buyP){result.droppedFrames++;result.recoveryRoutes+=recoverers.length;
   if(recoverers.length>1)fail({frame:frame.fi,issue:'more-than-one-bomb-recoverer'});
   const owners=new Set([...(previous?.players||[]).filter(p=>p.tacticalIntent?.kind==='recover-c4').map(p=>p.id),...(frame.events||[]).filter(e=>e.type==='bomb-recovery-assigned').map(e=>e.playerId)]),ownerKilled=(frame.events||[]).some(e=>e.type==='kill'&&owners.has(e.victimId));
   if(previous?.rnd===frame.rnd&&previous.droppedBomb&&distance(previous.droppedBomb.pos,frame.droppedBomb.pos)<.01&&alive.some(p=>p.side==='t')&&!recoverers.length&&!ownerKilled)fail({frame:frame.fi,issue:'dropped-bomb-without-live-recovery-duty'});
  }
  for(const p of alive){if(p.tacticalIntent?.kind==='take-cover')result.coverRoutes++;if(p.stance==='crouched'){result.protectedCrouchFrames++;if(p.coverAssessment?.protected!==true)fail({frame:frame.fi,id:p.id,issue:'crouched-without-directional-cover'});}}
  const id=frame.defuse?.defuserId;
  if(id&&previous?.rnd===frame.rnd&&previous.defuse?.defuserId===id&&frame.defuse.progress>previous.defuse.progress){
   const actor=frame.players.find(p=>p.id===id),prior=previous.players.find(p=>p.id===id);result.continuingDefuseSamples++;
   const shots=(sim.shotCadenceTelemetry||[]).filter(s=>s.round===frame.rnd&&s.attackerId===id&&s.shotAtMs>=frame.roundSec*1000&&s.shotAtMs<(frame.roundSec+.5)*1000);
   if(!actor?._objectiveLocked||!prior||distance(actor.pos,prior.pos)>1e-6||shots.length)fail({frame:frame.fi,id,issue:'continuing-defuse-moved-fired-or-without-begin-window-lock',moved:prior&&actor?distance(actor.pos,prior.pos):null,shots:shots.length});
  }
  previous=frame;
 }
 for(const plant of sim.bombAudit.plantEvents)if(!plant.carrierPosition||distance(plant.position,plant.carrierPosition)>1e-5)fail({round:plant.round,issue:'planted-C4-not-at-actual-carrier-location'});
 return result;
}
