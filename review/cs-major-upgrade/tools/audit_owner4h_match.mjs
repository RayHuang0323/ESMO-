import fs from 'node:fs';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import {loadFpsMajorTestApi} from '../../../tools/lib/fpsMajorTestApi.mjs';
const [phase,map,seedText]=process.argv.slice(2),seed=Number(seedText);
if(!['before','after','after-h3','after-final','after-final-r2'].includes(phase)||!['mirage','dust2','inferno'].includes(map)||![505001,505002].includes(seed))throw Error('Predeclared A/B input required');
const root='review/cs-major-upgrade/evidence/owner4h-review-20261018/',out=root+`${phase}-v2-${map}-${seed}.json`;
if(fs.existsSync(out))throw Error('Refuse overwrite');
const snapshotRoot=phase==='before'?path.resolve(root+'before-source'):null;
const source=fs.readFileSync((snapshotRoot?snapshotRoot+'/':'')+'src/battle/fps/EsportsFPS3D.jsx','utf8');
const api=await loadFpsMajorTestApi(source,process.cwd(),{snapshotRoot});
const start=performance.now();
const sim=api.simulateFps(map,api.TACTICS_DB[map].t[0],api.TACTICS_DB[map].ct[0],seed,api.ROSTER,{postPlantMode:'crossfire'},'major.v1');
const counters={liveActorSamples:0,visibleIntentSamples:0,visibleIntentMovingSamples:0,tradeSamples:0,tradeOver26Samples:0,perceptionCueSamples:0,exposedCrouchSamples:0,crouchSamples:0,postPlantHoldSamples:0,postPlantMovingSamples:0,defuseSamples:0};
const rooms=api.MAPS[map].rooms.filter(r=>r.authored),roomVisits=Object.fromEntries(rooms.map(r=>[r.id,new Set()]));
for(const f of sim.frames)for(const p of f.players){
 if(p.dead||f.roundSec<12)continue;counters.liveActorSamples++;
 const moving=Math.hypot(p.pos.x-(p.prevPos?.x??p.pos.x),p.pos.y-(p.prevPos?.y??p.pos.y))>.05;
 if(p.tacticalIntent?.source==='visible'){counters.visibleIntentSamples++;if(moving)counters.visibleIntentMovingSamples++;}
 if(p.tacticalIntent?.kind==='trade'){counters.tradeSamples++;if(p.tacticalIntent.aim&&Math.hypot(p.pos.x-p.tacticalIntent.aim.x,p.pos.y-p.tacticalIntent.aim.y)>26)counters.tradeOver26Samples++;}
 if(p.perceptionCue)counters.perceptionCueSamples++;
 if(p.stance==='crouched'){counters.crouchSamples++;if(!p.coverAssessment?.protected)counters.exposedCrouchSamples++;}
 if(f.planted&&p.side==='t'&&p.tacticalIntent?.kind==='post-plant-hold'){counters.postPlantHoldSamples++;if(moving)counters.postPlantMovingSamples++;}
 if(f.defuse?.defuserId===p.id)counters.defuseSamples++;
 for(const r of rooms)if(p.pos.x>r.x+.8&&p.pos.x<r.x+r.w-.8&&p.pos.y>r.y+.8&&p.pos.y<r.y+r.h-.8)roomVisits[r.id].add(`${f.rnd}:${p.id}`);
}
const report={schema:'owner4h-match-audit.v1',phase,map,seed,completed:sim.completed,rounds:sim.roundHist.length,frames:sim.frames.length,score:[sim.tScore,sim.ctScore],elapsedMs:performance.now()-start,shots:sim.shotCadenceTelemetry.length,hits:sim.shotCadenceTelemetry.filter(s=>s.hit).length,plants:sim.bombAudit.plantEvents.length,defuses:sim.bombAudit.defuseEvents.length,counters,roomVisits:Object.fromEntries(Object.entries(roomVisits).map(([k,v])=>[k,v.size])),movementAudit:sim.movementAudit,fireDecisionAudit:sim.fireDecisionAudit};
fs.writeFileSync(out,JSON.stringify(report,null,2),{flag:'wx'});
console.log(JSON.stringify({...report,movementAudit:undefined,fireDecisionAudit:undefined}));
if(!sim.completed)process.exitCode=1;
