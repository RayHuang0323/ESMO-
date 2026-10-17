import fs from 'node:fs';
import {streamFpsSavedFrames} from '../../../tools/lib/fpsSavedFrameStream.mjs';
const [input,out]=process.argv.slice(2);if(!input?.startsWith('review/cs-major-upgrade/evidence/')||!out?.startsWith('review/cs-major-upgrade/evidence/')||fs.existsSync(out))throw Error('Explicit own saved evidence required');
const report={input,scope:'Actual saved Mirage full match; actor x 0.5sec samples, no re-simulation. Transit and deliberate new plan excluded from settled reversal diagnostic.',frames:0,rounds:0,holdSamples:0,transitSamples:0,arrivedSamples:0,settledPairSamples:0,settledMovementSamples:0,settledMaxStep:0,settledReversals:0,planChanges:0,changes:[],reversals:[]};
const rounds=new Set(),previous=new Map();
for await(const f of streamFpsSavedFrames(input)){
 report.frames++;rounds.add(f.rnd);
 for(const p of f.players){
  if(p.dead||p.side!=='t'||!f.planted||!p.postPlantPlan)continue;
  report.holdSamples++;const plan=p.postPlantPlan,distance=Math.hypot(p.pos.x-plan.point.x,p.pos.y-plan.point.y),key=f.rnd+':'+p.id,prior=previous.get(key);
  if(distance<=.55)report.arrivedSamples++;else report.transitSamples++;
  const changed=prior&&prior.selectedAt!==plan.selectedAtSec;
  if(changed){report.planChanges++;if(report.changes.length<24)report.changes.push({round:f.rnd,actor:p.id,sec:f.roundSec,from:prior.point,to:plan.point,reason:plan.reason});}
  const step=prior?{x:p.pos.x-prior.pos.x,y:p.pos.y-prior.pos.y}:null;
  if(prior&&!changed&&prior.arrived&&distance<=.8){
   const moved=Math.hypot(step.x,step.y);report.settledPairSamples++;report.settledMaxStep=Math.max(report.settledMaxStep,moved);
   if(moved>.05)report.settledMovementSamples++;
   if(prior.step&&moved>.05&&Math.hypot(prior.step.x,prior.step.y)>.05&&step.x*prior.step.x+step.y*prior.step.y<-.0025){report.settledReversals++;if(report.reversals.length<24)report.reversals.push({round:f.rnd,sec:f.roundSec,actor:p.id,role:p.role,step,priorStep:prior.step,pos:p.pos,goal:plan.point,routeKind:p._routePlan?.kind,intent:p.tacticalIntent?.kind});}
  }
  previous.set(key,{selectedAt:plan.selectedAtSec,point:plan.point,pos:p.pos,arrived:distance<=.55,step});
 }
}
report.rounds=rounds.size;fs.writeFileSync(out,JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify({...report,changes:undefined,reversals:undefined}));
