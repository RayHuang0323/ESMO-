import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {loadFpsMajorTestApi} from '../../../tools/lib/fpsMajorTestApi.mjs';
const root='review/cs-major-upgrade/evidence/owner4g-review-20261016/';
fs.mkdirSync(root,{recursive:true});
if(process.argv[2]==='snapshot'){
 const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','--','src/battle/fps','src/screens/fps/CsMatchScreen.jsx','src/screens/fps/CsPrepScreen.jsx','src/screens/fps/CsResultScreen.jsx','src/screens/fps/CsProfessionalReport.jsx','src/screens/fps/csProfessionalReport.css','src/platform/contracts/CsMatchResult.js','src/data/playerModel.js','src/platform/contracts/matchSquad.js','src/screens/manage/RosterScreen.jsx','src/screens/manage/PlayerDetailScreen.jsx','public/assets/fps','public/audio/cs'],{encoding:'utf8'}).trim().split(/\r?\n/).sort();
 const hash=createHash('sha256');for(const f of files){hash.update(f+'\0');hash.update(fs.readFileSync(f));hash.update('\0');const dest=root+'before-source/'+f;fs.mkdirSync(dest.slice(0,dest.lastIndexOf('/')),{recursive:true});fs.writeFileSync(dest,fs.readFileSync(f),{flag:'wx'});}
 const sha=hash.digest('hex');if(sha!=='307c9e99a2a0884374bbee4b986ee3593841834a5358e3cf76e05c536099cd11')throw Error('Owner4F source changed');
 fs.writeFileSync(root+'before-source-proof.json',JSON.stringify({sha256:sha,files,exactOwner4F:true,at:new Date().toISOString()},null,2),{flag:'wx'});console.log(sha);process.exit(0);
}
const [map,seedText]=process.argv.slice(2),seed=Number(seedText);
if(!['mirage','dust2','inferno'].includes(map)||!Number.isInteger(seed))throw Error('Explicit map seed');
const phase=process.env.ESMO_OWNER4G_PHASE||'before';if(!['before','defuse-r1','audit-r1','after'].includes(phase))throw Error('Explicit audit phase');const out=root+`${phase}-${map}-${seed}.json`;if(fs.existsSync(out))throw Error('Refuse overwrite');
const api=await loadFpsMajorTestApi(fs.readFileSync('src/battle/fps/EsportsFPS3D.jsx','utf8'));
const sim=api.simulateFps(map,api.TACTICS_DB[map].t[0],api.TACTICS_DB[map].ct[0],seed,api.ROSTER,{postPlantMode:'crossfire'},'major.v1');
const walls=api.c5a2SolidObstacles(api.MAPS[map]),rows=[],defuses=[];
for(const [index,f]of sim.frames.entries()){
 const ct=f.players.find(p=>p.id===f.defuse?.defuserId);if(!f.planted||!ct)continue;
 defuses.push({index,round:f.rnd,sec:f.roundSec,progress:f.defuse.progress,distance:Math.hypot(ct.pos.x-f.c4pos.x,ct.pos.y-f.c4pos.y),actor:ct.id,pos:ct.pos,c4pos:f.c4pos,locked:ct._objectiveLocked});
 for(const t of f.players.filter(p=>p.side==='t'&&!p.dead)){
  const distance=Math.hypot(t.pos.x-ct.pos.x,t.pos.y-ct.pos.y),auth=api.weaponAuthority(t.gun),wall=api.lineBlocked(t.pos,ct.pos,walls),smoke=api.smokeBlocks(t.pos,ct.pos,f.smokes),fov=api.csTargetInFov(t,ct),range=api.weaponInRange(distance,auth);
  const shots=sim.shotCadenceTelemetry.filter(s=>s.round===f.rnd&&s.attackerId===t.id&&s.targetId===ct.id&&s.shotAtMs>=f.roundSec*1000&&s.shotAtMs<(f.roundSec+.5)*1000);
  rows.push({index,round:f.rnd,sec:f.roundSec,actor:t.id,target:ct.id,distance,wall,smoke,fov,range,canEngage:api.canEngage(t,ct,walls,f.smokes,1),blindSec:t.blindSec||0,reloading:t.reloading,ammo:t.ammo,gun:t.gun,state:t.state,picking:t.picking,plantProgressSec:t.plantProgressSec,hasBomb:t.hasBomb,locked:t._objectiveLocked,pos:t.pos,targetPos:ct.pos,va:t.va,intent:t.tacticalIntent,awareness:t.awareness,shots:shots.length,reaction:sim.reactionTelemetry.filter(r=>r.observerId===t.id&&r.targetId===ct.id&&r.round===f.rnd).slice(-2)});
 }
}
const legalNoShot=rows.filter(r=>!r.wall&&!r.smoke&&r.fov&&r.range&&!r.blindSec&&!r.reloading&&r.ammo>0&&!r.locked&&!r.shots);
const report={schema:'owner4g-audit.v1',phase,map,seed,completed:sim.completed,rounds:sim.roundHist.length,frames:sim.frames.length,score:[sim.tScore,sim.ctScore],plants:sim.bombAudit.plantEvents,defuseEvents:sim.bombAudit.defuseEvents,defuseSamples:defuses,combatAgainstDefuser:rows,legalNoShot,legalNoShotCount:legalNoShot.length,maxDefuseDistance:Math.max(0,...defuses.map(r=>r.distance)),fireDecisionAudit:sim.fireDecisionAudit,sourceSHA:createHash('sha256').update(fs.readFileSync('src/battle/fps/EsportsFPS3D.jsx')).digest('hex')};
fs.writeFileSync(out,JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify({map,seed,completed:report.completed,plants:report.plants.length,defuseSamples:defuses.length,legalNoShot:legalNoShot.length,maxDefuseDistance:report.maxDefuseDistance}));
