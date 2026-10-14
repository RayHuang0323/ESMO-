import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {loadFpsMajorTestApi} from './lib/fpsMajorTestApi.mjs';
import {INITIAL_PLAYERS} from '../src/data/players.js';
import {toFpsRoster} from '../src/battle/fps/fpsRoster.js';
import {FPS_TACTIC_TYPE} from '../src/battle/fps/csPrepData.js';
import {fpsWeaponReadyAtMs} from '../src/battle/fps/fpsWeaponHandling.js';

// Root coordinates execution through verify.mjs. This verifier never changes
// the simulation, reaction timings, seed, ammo or outcome to make a contact pass.
if(process.env.ESMO_VERIFY_FLAT!=='1')throw Error('Run through tools/verify.mjs');
const output=process.env.ESMO_CS_OWNER4_CONTACT_REPORT;
if(!output||fs.existsSync(output))throw Error('Require unique ESMO_CS_OWNER4_CONTACT_REPORT');
const maps=(process.env.ESMO_CS_OWNER4_CONTACT_MAPS||'dust2,mirage,inferno').split(',');
if(maps.some(map=>!['dust2','mirage','inferno'].includes(map))||new Set(maps).size!==maps.length)throw Error('Invalid contact map list');
const selection=process.env.ESMO_CS_OWNER4_CONTACT_SELECTION||'f5',seed=505001;
if(!FPS_TACTIC_TYPE[selection])throw Error('Invalid requested UI selection');
const rosterKind=process.env.ESMO_CS_OWNER4_CONTACT_ROSTER||'fresh';
if(!['fresh','canonical'].includes(rosterKind))throw Error('Invalid contact roster kind');
const source=fs.readFileSync('src/battle/fps/EsportsFPS3D.jsx','utf8'),api=await loadFpsMajorTestApi(source);
for(const name of ['canEngage','csTargetInFov','weaponAuthority','weaponInRange','smokeBlocks','mapAwareCanReadVisibleCandidate','lineBlocked'])if(typeof api[name]!=='function')throw Error('HARNESS_FAIL missing authoritative API '+name);
if(!Number.isFinite(api.C5A2_SIM_STEP_SEC)||api.C5A2_SIM_STEP_SEC<=0)throw Error('HARNESS_FAIL missing authoritative timestep');
const tickMs=api.C5A2_SIM_STEP_SEC*1000;
const roster=rosterKind==='canonical'?api.ROSTER:[...toFpsRoster(INITIAL_PLAYERS),...api.ROSTER.filter(p=>p.side==='ct')];
if(roster.length!==10||roster.filter(p=>p.side==='t').length!==5||roster.filter(p=>p.side==='ct').length!==5)throw Error('HARNESS_FAIL 5v5 precondition');
const sha=value=>createHash('sha256').update(value).digest('hex');
const report={schema:'cs-owner4-actual-contact-runtime.v1',seed,rosterKind,roster:roster.map(p=>({id:p.id,name:p.name,role:p.role,side:p.side})),rosterSHA:sha(JSON.stringify(roster)),selection,tickMs,thresholdMs:1500,
  method:'Saved canonical end-of-tick actor states; exact product LOS/FOV/smoke/weapon/awareness helpers; per-actor any authoritative shot resets idle. Reaction readiness from completed simulation telemetry is compared to its actual acquisition timestamp, never borrowed from another target. Sampled timelines are not RGB/POV verification.',
  sources:['src/battle/fps/EsportsFPS3D.jsx','src/battle/fps/fpsDirectedShotQueue.js','src/battle/fps/fpsTacticalCoordinator.js','src/battle/fps/fpsBombObjectivePlanning.js','src/battle/fps/fpsWeaponHandling.js'].map(path=>({path,sha256:sha(fs.readFileSync(path))})),cases:[]};
let pass=0,fail=0;
const write=()=>fs.writeFileSync(output,JSON.stringify(report,null,2));
for(const mapKey of maps){
  console.log('RUN Contact '+mapKey+'/'+rosterKind+'/'+selection+'/seed'+seed);
  const lib=api.TACTICS_DB[mapKey],layout={openness:'open',phases:Object.fromEntries(['opening','mid-round','late-round','post-plant'].map(phase=>[phase,{id:selection,type:FPS_TACTIC_TYPE[selection]}]))};
  const started=Date.now(),sim=api.simulateFps(mapKey,lib.t.find(t=>t.type==='default')||lib.t[0],lib.ct[0],seed,roster,layout,'major.v1');
  if(!sim.completed||sim.frames[0]?.players.length!==10||Object.values(sim.tacticalAudit?.preMatchLayout?.phases||{}).some(p=>p.selectionId!==selection))throw Error('HARNESS_FAIL completed 5v5/requested selection precondition '+mapKey);
  const row={mapKey,elapsedMs:Date.now()-started,completed:sim.completed,frames:sim.frames.length,rounds:sim.rounds,score:{us:sim.tScore,enemy:sim.ctScore},samples:0,loadedReadyVisibleSamples:0,maxUnexplainedWaitMs:0,reasons:{},violations:[],timelineSamples:[],blockedTimelineSamples:[],coverage:{},checks:[]};report.cases.push(row);
  const walls=api.c5a2SolidObstacles(api.MAPS[mapKey]),episodes=new Map(),shots=new Map(),shotRows=sim.shotCadenceTelemetry||[],blockedSampleKeys=new Set(),active=new Map();
  for(const episode of sim.reactionTelemetry||[]){const key=`${episode.actorId}->${episode.targetId}`;if(!episodes.has(key))episodes.set(key,[]);episodes.get(key).push(episode);}
  // reaction telemetry has round-local timestamps but lacks round id. Partition
  // its monotonically generated id by the saved frame's reactionEvents (each
  // new episode is emitted exactly once) so rounds cannot borrow prior locks.
  const episodeRound=new Map();for(const frame of sim.frames)for(const e of frame.reactionEvents||[])episodeRound.set(e.id,frame.rnd);
  for(const shot of shotRows){const key=`${shot.round}:${shot.attackerId}`;if(!shots.has(key))shots.set(key,[]);shots.get(key).push(shot);}
  function latestReaction(actorId,targetId,round,nowMs){const list=episodes.get(`${actorId}->${targetId}`)||[];for(let i=list.length-1;i>=0;i--){const e=list[i];if(episodeRound.get(e.id)===round&&e.visibleAtMs<=nowMs)return e;}return null;}
  const countReason=reason=>row.reasons[reason]=(row.reasons[reason]||0)+1;
  const saveEpisode=(id,endMs)=>{const gap=active.get(id);if(!gap)return;const duration=Math.max(0,endMs-gap.startMs);row.maxUnexplainedWaitMs=Math.max(row.maxUnexplainedWaitMs,duration);if(duration>=1500)row.violations.push({...gap,endMs,durationMs:duration});if(row.timelineSamples.length<32||duration>=1500)row.timelineSamples.push({...gap,endMs,durationMs:duration});active.delete(id);};
  for(const frame of sim.frames){
    const nowMs=Math.round(frame.roundSec*1000),endMs=nowMs+tickMs,prog=frame.buyP?0:Math.max(0,(frame.roundSec-12)/90);
    for(const actor of frame.players){
      row.samples++;const key=`${frame.rnd}:${actor.id}`;
      const actorShots=(shots.get(key)||[]).filter(s=>s.shotAtMs>=nowMs&&s.shotAtMs<endMs);
      const opponents=frame.players.filter(p=>p.side!==actor.side&&!p.dead);
      const blockers=[];
      if(actor.dead)blockers.push('dead');if(frame.buyP)blockers.push('buy');if(actor.blindSec>0)blockers.push('blind');
      if(actor.hasBomb&&(actor.plantProgressSec||0)>0)blockers.push('plant');if(actor.tacticalIntent?.kind==='save')blockers.push('save');
      if(actor.reloading||fpsWeaponReadyAtMs(actor,nowMs)>nowMs)blockers.push('reload-or-handling');if(actor.ammo<=0)blockers.push(actor.reserveAmmo<=0?'dry':'empty-magazine');
      const auth=api.weaponAuthority(actor.gun),visible=[],targetObservations=[];
      for(const target of opponents){const d=Math.hypot(actor.pos.x-target.pos.x,actor.pos.y-target.pos.y),los=!api.lineBlocked(actor.pos,target.pos,walls),smoke=api.smokeBlocks(actor.pos,target.pos,frame.smokes||[]),fov=api.csTargetInFov(actor,target),range=api.weaponInRange(d,auth),candidate=los&&!smoke&&range;
        const awareness=api.mapAwareCanReadVisibleCandidate(actor,d,candidate,auth),authorityAllows=api.canEngage(actor,target,walls,frame.smokes||[],prog);
        targetObservations.push({targetId:target.id,distance:Number(d.toFixed(3)),los,smoke,fov,range,awareness,authorityAllows});
        if(!candidate||!fov||!awareness||!authorityAllows)continue;
        const reaction=latestReaction(actor.id,target.id,frame.rnd,nowMs);visible.push({targetId:target.id,distance:Number(d.toFixed(3)),los,fov,smoke,range,acquiredAtMs:reaction?.targetAcquiredAtMs??null,readyAtMs:reaction?.reactionReadyAtMs??null,episodeId:reaction?.id??null,ready:Boolean(reaction&&Number.isFinite(reaction.targetAcquiredAtMs)&&reaction.targetAcquiredAtMs<=nowMs&&Number.isFinite(reaction.reactionReadyAtMs)&&reaction.reactionReadyAtMs<=nowMs)});
      }
      if(!visible.length)blockers.push('no-authoritative-visible-in-range-target');else if(!visible.some(v=>v.ready))blockers.push('reaction-not-ready');
      if(blockers.length){for(const reason of blockers)countReason(reason);saveEpisode(key,nowMs);
        const nearest=targetObservations.sort((a,b)=>a.distance-b.distance)[0];
        if(!actor.dead&&!frame.buyP&&nearest?.distance<=30){
          for(const [flag,reason]of [[!nearest.los,'near-LOS-blocked'],[nearest.smoke,'near-smoke'],[!nearest.fov,'near-outside-FOV'],[!nearest.range,'near-out-of-weapon-range'],[!nearest.awareness,'near-awareness-denied'],[nearest.los&&nearest.fov&&nearest.range&&!nearest.smoke&&!nearest.authorityAllows,'near-authority-state-denied']])if(flag)countReason(reason);
          const sampleKey=`${actor.id}:${blockers.join(',')}:${nearest.los}:${nearest.smoke}:${nearest.fov}:${nearest.range}:${nearest.authorityAllows}`;
          if(row.blockedTimelineSamples.length<64&&!blockedSampleKeys.has(sampleKey)){blockedSampleKeys.add(sampleKey);row.blockedTimelineSamples.push({frame:frame.fi,round:frame.rnd+1,actorId:actor.id,roundSec:frame.roundSec,pos:{...actor.pos},va:actor.va,gun:actor.gun,ammo:actor.ammo,reserveAmmo:actor.reserveAmmo,reloading:actor.reloading,reloadEndsAtMs:actor.reloadEndsAtMs,blindSec:actor.blindSec,picking:actor.picking,state:actor.state,intent:actor.tacticalIntent?.kind||null,plantProgressSec:actor.plantProgressSec||0,blockers,nearest,shots:actorShots.map(s=>({atMs:s.shotAtMs,targetId:s.targetId}))});}
        }
        continue;}
      row.loadedReadyVisibleSamples++;
      const sample={frame:frame.fi,roundSec:frame.roundSec,pos:{...actor.pos},va:actor.va,gun:actor.gun,ammo:actor.ammo,reserveAmmo:actor.reserveAmmo,blindSec:actor.blindSec||0,reloading:Boolean(actor.reloading),picking:actor.picking||0,state:actor.state,intent:actor.tacticalIntent?.kind||null,targets:visible,shots:actorShots.map(s=>({atMs:s.shotAtMs,targetId:s.targetId,gun:s.gun}))};
      if(actorShots.length){saveEpisode(key,nowMs);if(row.timelineSamples.length<32)row.timelineSamples.push({round:frame.rnd+1,actorId:actor.id,kind:'fired-ready-visible',samples:[sample]});continue;}
      if(!active.has(key))active.set(key,{round:frame.rnd+1,actorId:actor.id,startMs:nowMs,samples:[]});
      const gap=active.get(key);if(gap.samples.length<24)gap.samples.push(sample);gap.lastEndMs=endMs;
    }
    // Round changes close old episodes at their own round-local endpoint.
    for(const [key,gap]of active)if(!key.startsWith(frame.rnd+':'))saveEpisode(key,gap.lastEndMs);
  }
  for(const [key,gap]of active)saveEpisode(key,gap.lastEndMs);
  const multi=new Map(),duels=new Map();for(const shot of shotRows){const bucket=`${shot.round}:${Math.floor(shot.shotAtMs/tickMs)}:${shot.targetId}`;if(!multi.has(bucket))multi.set(bucket,new Set());multi.get(bucket).add(shot.attackerId);const pair=[shot.attackerId,shot.targetId].sort().join('/'),duelKey=`${shot.round}:${pair}`;if(!duels.has(duelKey))duels.set(duelKey,new Set());duels.get(duelKey).add(shot.attackerId);}
  const shared=[...multi].filter(([,ids])=>ids.size>1),reciprocal=[...duels].filter(([,ids])=>ids.size>1);
  row.coverage.sharedVictimMultipleShooters={status:shared.length?'OBSERVED':'NOT_TRIGGERED',count:shared.length,samples:shared.slice(0,8).map(([key,ids])=>({key,actors:[...ids]}))};
  row.coverage.reciprocalDuel={status:reciprocal.length?'OBSERVED':'NOT_TRIGGERED',count:reciprocal.length,samples:reciprocal.slice(0,8).map(([key,ids])=>({key,actors:[...ids]}))};
  const checks=[['真可視loaded reaction-ready機會非空',row.loadedReadyVisibleSamples>0&&shotRows.length>0],['沒有未解釋≥1.5秒可視滿彈反應就緒等待',row.violations.length===0],['chrono ammo／LOS／FOV權威shot資料存在',shotRows.every(s=>Number.isFinite(s.shotAtMs)&&s.lineOfSight&&s.fov&&s.ammoBefore>s.ammoAfter)],['完整對局5v5與指定selection前提成立',sim.completed&&sim.frames[0].players.length===10]];
  for(const [label,ok]of checks){row.checks.push({label,ok});if(ok){pass++;console.log('PASS '+mapKey+' '+label);}else{fail++;console.error('FAIL '+mapKey+' '+label+' violations='+row.violations.length);}}
  write();
}
report.summary={pass,fail,cases:maps.length,result:fail?'PRODUCT_FAIL':'PASS',gpu:'NOT_RUN',ownerActualPOV:'NOT_RUN'};write();
console.log(`CS Owner4 Contact Runtime: ${pass}/${pass+fail} PASS`);console.log(`RESULT=${report.summary.result}`);process.exitCode=fail?1:0;
