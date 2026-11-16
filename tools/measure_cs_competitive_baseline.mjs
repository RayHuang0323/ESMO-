// 固定seed、換起始槽位、單能力成對比較；只量測真實模擬，不調整勝率。
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {loadFpsMajorTestApi} from './lib/fpsMajorTestApi.mjs';
import {CS_AI_TEAMS,csAiRosterAt,csAiLineupAt} from '../src/data/csAiTeams.js';
import {toFpsRoster} from '../src/battle/fps/fpsRoster.js';
const out=process.argv[2];if(!out||!fs.existsSync(out)||fs.existsSync(path.join(out,'baseline.ndjson')))throw Error('Unique existing evidence directory required');
const api=await loadFpsMajorTestApi(fs.readFileSync('src/battle/fps/EsportsFPS3D.jsx','utf8'));
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const seeds=[61001,61002],maps=[['mirage','major.v3'],['dust2','major.v4'],['inferno','major.v5']];
const cases=['equal70','accuracy35','accuracy95','reflex95','alternate-site','real-teams'];
const sourceSha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const template=api.ROSTER.filter(p=>p.side==='t').slice(0,5);
const neutral=team=>template.map((p,i)=>({...structuredClone(p),name:`${team}-${p.role}-${i}`,stats:Object.fromEntries(Object.keys(p.stats).map(k=>[k,70]))}));
const real=team=>toFpsRoster(csAiRosterAt(team,1),csAiLineupAt(team,1));
const resumeFrom=process.argv[3]??null;
const rows=resumeFrom?fs.readFileSync(path.join(resumeFrom,'baseline.ndjson'),'utf8').trim().split('\n').map(JSON.parse):[];
if(rows.length)fs.writeFileSync(path.join(out,'baseline.ndjson'),rows.map(r=>JSON.stringify(r)).join('\n')+'\n',{flag:'wx'});
for(const [map,scene] of maps)for(const seed of seeds)for(const testCase of cases)for(const aStarts of ['t','ct']){
 let A=testCase==='real-teams'?real(CS_AI_TEAMS[0]):neutral('A'),B=testCase==='real-teams'?real(CS_AI_TEAMS.at(-1)):neutral('B');
 if(testCase==='accuracy35'||testCase==='accuracy95')A=A.map(p=>({...p,stats:{...p.stats,acc:testCase==='accuracy35'?35:95}}));
 if(testCase==='reflex95')A=A.map(p=>({...p,stats:{...p.stats,rxn:95}}));
 const us=aStarts==='t'?A:B,enemy=aStarts==='t'?B:A;
 const roster=[...us.map((p,i)=>({...p,id:`t${i+1}`,side:'t'})),...enemy.map((p,i)=>({...p,id:`ct${i+1}`,side:'ct'}))];
 const lib=api.TACTICS_DB[map],standard=lib.t.find(t=>t.type==='default')||lib.t[0],alternate=lib.t.find(t=>t.site!==standard.site&&t.site!=='mid');
 // Both teams consume the same tactic family; counterbalance assigns A's
 // selected tactic to its actual owning slot, not to the physical T side.
 const ownTactic=testCase==='alternate-site'?alternate:standard;
 if(!ownTactic)throw Error('Required real tactic missing');
 const tacticT=aStarts==='t'?ownTactic:standard,tacticCT=aStarts==='ct'?ownTactic:standard;
 const inputDigest=digest({map,scene,seed,roster,tacticT,tacticCT});
 const previous=rows.find(r=>r.map===map&&r.seed===seed&&r.testCase===testCase&&r.aStarts===aStarts);
 if(previous){if(previous.inputDigest!==inputDigest||previous.sourceSha!==sourceSha)throw Error('Resume input/SHA mismatch');continue;}
 const started=Date.now();let sim=api.simulateFps(map,tacticT,tacticCT,seed,roster,null,scene);
 if(!sim.completed||!['us','enemy'].includes(sim.winner))throw Error('Unfinished authoritative simulation');
 let result=api.buildMatchResult(sim,{seed,tacticT,tacticCT}),analytics=result.analytics;
 const teamA=aStarts==='t'?'us':'enemy',shots=analytics.teams.find(t=>t.id===teamA),episodes=(sim.reactionTelemetry||[]).filter(e=>roster.find(p=>p.id===e.actorId)?.name&&((e.actorId.startsWith('ct')?'enemy':'us')===teamA));
 const row={sourceSha,map,scene,seed,testCase,aStarts,inputDigest,roundDigest:digest(sim.roundHist),shotDigest:digest(sim.shotCadenceTelemetry),scoreA:teamA==='us'?sim.tScore:sim.ctScore,scoreB:teamA==='us'?sim.ctScore:sim.tScore,winnerA:sim.winner===teamA,initialTTeamWon:sim.winner==='us',rounds:sim.roundHist.length,tRounds:analytics.rounds.filter(r=>r.winnerSide==='t').length,ctRounds:analytics.rounds.filter(r=>r.winnerSide==='ct').length,teamA:shots,players:analytics.players.filter(p=>p.teamId===teamA).map(({name,role,kills,deaths,adr,rating,shots,hits,openingKills,openingDeaths,plants,defuses,dutySamples})=>({name,role,kills,deaths,adr,rating,shots,hits,openingKills,openingDeaths,plants,defuses,dutySamples})),reaction:{count:episodes.length,meanDelayMs:episodes.length?episodes.reduce((s,e)=>s+e.reactionDelayMs,0)/episodes.length:null},tactic:{a:ownTactic.id,b:standard.id,phaseSelections:sim.tacticalAudit?.phaseSelections?.length??0},audit:{illegalWallCrossings:sim.navigationAudit?.illegalWallCrossings,spawnAnchorViolations:sim.navigationAudit?.spawnAnchorViolations,unresolvedStuckEpisodes:sim.navigationAudit?.unresolvedStuckEpisodes},ms:Date.now()-started};
 rows.push(row);fs.appendFileSync(path.join(out,'baseline.ndjson'),JSON.stringify(row)+'\n');console.log(`BASELINE ${rows.length}/72 ${map} ${seed} ${testCase} A-start-${aStarts} ${row.scoreA}:${row.scoreB} ${row.ms}ms`);
 sim=null;result=null;analytics=null;globalThis.gc?.();
}
const groups=maps.map(([map])=>({map,cases:Object.fromEntries(cases.map(testCase=>{const rs=rows.filter(r=>r.map===map&&r.testCase===testCase);return[testCase,{n:rs.length,aWins:rs.filter(r=>r.winnerA).length,initialTTeamWins:rs.filter(r=>r.initialTTeamWon).length,roundMarginMean:rs.reduce((s,r)=>s+r.scoreA-r.scoreB,0)/rs.length,tRounds:rs.reduce((s,r)=>s+r.tRounds,0),ctRounds:rs.reduce((s,r)=>s+r.ctRounds,0)}];}))}));
fs.writeFileSync(path.join(out,'baseline-summary.json'),JSON.stringify({sourceSha,seeds,groups,rows:rows.length,resumeFrom,method:'72 complete simulations; 2 fixed seeds; 3 scenes; 6 cases; A/B swapped between initial engine slots. A-start-CT is counterbalanced roster placement, not a new UI setting. No fairness certification or significance claim. Real-team contrast also differs in roles/personality; only accuracy/reflex cases are single-stat interventions.'},null,2),{flag:'wx'});
console.log('CS_COMPETITIVE_BASELINE RESULT=PASS runs='+rows.length);
