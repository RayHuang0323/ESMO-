import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {loadFpsMajorTestApi} from './lib/fpsMajorTestApi.mjs';
import {INITIAL_PLAYERS} from '../src/data/players.js';
import {toFpsRoster} from '../src/battle/fps/fpsRoster.js';
import {deriveFpsAnimationState} from '../src/battle/fps/presentation/fpsAnimationState.js';
import {FPS_TACTIC_TYPE} from '../src/battle/fps/csPrepData.js';
if(process.env.ESMO_VERIFY_FLAT!=='1')throw Error('Run through tools/verify.mjs');
const mapKey=process.env.ESMO_CS_OWNER5_MAP||'dust2',selection=process.env.ESMO_CS_OWNER5_SELECTION||'f1';
const output=process.env.ESMO_CS_OWNER5_REPORT;
if(!output||fs.existsSync(output))throw Error('Require unique ESMO_CS_OWNER5_REPORT');
const source=fs.readFileSync('src/battle/fps/EsportsFPS3D.jsx','utf8'),api=await loadFpsMajorTestApi(source);
let fresh=toFpsRoster(INITIAL_PLAYERS);const lib=api.TACTICS_DB[mapKey];
if(process.env.ESMO_CS_OWNER5_ROLE_OVERRIDE){const roles=process.env.ESMO_CS_OWNER5_ROLE_OVERRIDE.split(',');if(roles.join(',')!=='entry,entry,awp,awp,lurker')throw Error('Only explicit legal no-priority-role counterexample allowed');fresh=fresh.map((p,i)=>({...p,role:roles[i],fpsRole:roles[i],csRole:roles[i]}));}
// Match the real component's partial-roster completion; simulateFps itself
// accepts the fully assembled ten actors, not a five-actor adapter result.
const roster=[...fresh,...api.ROSTER.filter(p=>p.side==='ct')];
if(roster.filter(p=>p.side==='t').length!==5||roster.filter(p=>p.side==='ct').length!==5)throw Error('HARNESS_FAIL: actual 5v5 roster precondition missing');
console.log(JSON.stringify({mapKey,selection,fresh:fresh.map(p=>({id:p.id,name:p.name,role:p.role})),sourceSha:createHash('sha256').update(source).digest('hex')}));
const layout={openness:'open',phases:Object.fromEntries(['opening','mid-round','late-round','post-plant'].map(phase=>[phase,{id:selection,type:FPS_TACTIC_TYPE[selection]}]))};
const started=Date.now();
const sim=api.simulateFps(mapKey,lib.t.find(t=>t.type==='default')||lib.t[0],lib.ct[0],505001,roster,layout,'major.v1');
const observedSelections=sim.tacticalAudit?.preMatchLayout?.phases;
if(!observedSelections||Object.values(observedSelections).some(p=>p.selectionId!==selection))throw Error('HARNESS_FAIL: requested phase selection did not reach simulator output; do not substitute fallback tactic');
const stats={buyMovement:0,buyWalk:0,freezeSamples:0,throwOnsets:0,wrongThrowOnsets:0,stages:{},ourTeamStages:{},firstShots:[],ctAnchors:{},stageTransitions:[],noPlantReasons:{},plant:0,rounds:sim.rounds};
const thrown=new Set();
for(let i=0;i<sim.frames.length;i++){
 const f=sim.frames[i],previous=sim.frames[i-1];
 for(const p of f.players){
  if(f.buyP&&previous?.rnd===f.rnd){const prev=previous.players.find(x=>x.id===p.id);stats.freezeSamples++;if(Math.hypot(p.pos.x-prev.pos.x,p.pos.y-prev.pos.y)>1e-6)stats.buyMovement++;
   if(deriveFpsAnimationState({player:p,previousPlayer:prev,playbackActive:true}).moving)stats.buyWalk++;}
 }
 for(const tw of f.throwables||[])if(!thrown.has(tw.id)){thrown.add(tw.id);if(tw.thrownAtRoundSec===f.roundSec){stats.throwOnsets++;if(tw.t!==0||tw.flightElapsedSec!==0)stats.wrongThrowOnsets++;}}
 for(const e of f.events||[]){if(e.type==='tactical-stage'){stats.stages[e.stage]=(stats.stages[e.stage]||0)+1;if(f.players.find(p=>p.id===e.playerId)?.teamId==='us')stats.ourTeamStages[e.stage]=(stats.ourTeamStages[e.stage]||0)+1;if(stats.stageTransitions.length<100)stats.stageTransitions.push({round:f.rnd,sec:f.roundSec,player:e.playerId,stage:e.stage,reason:e.reason});}if(e.type==='bomb-planted')stats.plant++;}
 if(f.muzzles?.length&&!stats.firstShots.some(x=>x.round===f.rnd))stats.firstShots.push({round:f.rnd,sec:f.roundSec,positions:f.players.filter(p=>!p.dead).map(p=>({id:p.id,side:p.side,pos:p.pos,stage:p.tacticalStage,role:p.role,duty:p.tacticalDuty}))});
}
stats.plant=sim.bombAudit?.plantEvents?.length||0;
const checks=[],ck=(label,ok)=>{checks.push({label,ok:Boolean(ok)});console.log(`${ok?'PASS':'FAIL'} ${label}`);};
ck('真fresh roster完整對局與非空保存幀',sim.completed&&sim.frames.length>0);
ck('購買期角色真位置固定且動畫idle',stats.freezeSamples>0&&stats.buyMovement===0&&stats.buyWalk===0);
ck('新投擲首保存幀從t0起步，非半秒後才出現',stats.throwOnsets>0&&stats.wrongThrowOnsets===0);
ck('真導航無穿牆／瞬移／非有限位置',['blockedPositions','wallSegmentCrossings','teleportViolations','nonFinitePositions'].every(k=>sim.movementAudit[k]===0));
const team=sim.frames[0].players.filter(p=>p.side==='t');
const dutyPlanConsistent=sim.buyAudit.rounds.every(r=>{const f=sim.frames.find(f=>f.rnd===r.round-1);return f&&r.players.every(p=>{const actor=f.players.find(a=>a.id===p.id),duty=actor.tacticalDuty;return p.utilityPlans.every(plan=>plan.duty===(p.side==='t'?duty.attackDuty:duty.defenseDuty));});});
ck('正式fresh組成真有持包與側翼責任，購入計畫與本回合責任相同',team.some(p=>p.hasBomb&&p.tacticalDuty?.attackDuty==='carrier')&&team.some(p=>p.tacticalDuty?.attackDuty==='flank')&&dutyPlanConsistent);
ck('真階段轉移與槍戰均有觀測',Object.keys(stats.stages).length>0&&stats.firstShots.length>0);
const report={schema:'cs-owner5-runtime.v2',mapKey,selection,observedSelections,freshRoster:fresh,seed:505001,sourceSha:createHash('sha256').update(source).digest('hex'),elapsedMs:Date.now()-started,completed:sim.completed,score:{us:sim.tScore,enemy:sim.ctScore},frames:sim.frames.length,stats,checks,movement:sim.movementAudit,limits:['單一固定seed／fresh roster診斷，不證明全部戰術或專業品質。','Node不證明真機／POV閃爍／語音與投擲體感。']};
fs.writeFileSync(output,JSON.stringify(report,null,2),{flag:'wx'});
const pass=checks.filter(c=>c.ok).length;
console.log(`CS Owner5 Runtime: ${pass}/${checks.length} PASS`);process.exitCode=pass===checks.length?0:1;
