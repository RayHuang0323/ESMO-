import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {loadFpsMajorTestApi} from './lib/fpsMajorTestApi.mjs';
const out=process.argv[2];if(!out||!fs.existsSync(out)||fs.existsSync(path.join(out,'pairs.ndjson')))throw Error('Unique output directory required');
const hash=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const baseline=execFileSync('git',['show','4f681c34b0e59b02d7a5bb0e6bed00576c8af4b5:src/battle/fps/EsportsFPS3D.jsx'],{maxBuffer:8*1024*1024,encoding:'utf8'});
const rows=[];
for(const [version,source] of [['before',baseline],['after',fs.readFileSync('src/battle/fps/EsportsFPS3D.jsx','utf8')]])for(const start of ['t','ct']){
 const marker='currentSideByTeam:{[CS_TEAM_US]:"t",[CS_TEAM_ENEMY]:"ct"}';if(source.split(marker).length!==2)throw Error('Side hook changed');
 const api=await loadFpsMajorTestApi(start==='t'?source:source.replace(marker,'currentSideByTeam:{[CS_TEAM_US]:"ct",[CS_TEAM_ENEMY]:"t"}'));
 const roster=['t','ct'].flatMap(side=>api.ROSTER.filter(p=>p.side==='t').slice(0,5).map((p,i)=>({...structuredClone(p),id:`${side}${i+1}`,side,name:`${side}-${i}-${p.role}`,stats:Object.fromEntries(Object.keys(p.stats).map(k=>[k,70]))})));
 for(const [map,scene] of [['mirage','major.v3'],['dust2','major.v4'],['inferno','major.v5']])for(const seed of [61001,61002]){
  const tactic=api.TACTICS_DB[map].t.find(t=>t.type==='default')||api.TACTICS_DB[map].t[0];let sim=api.simulateFps(map,tactic,tactic,seed,roster,null,scene);
  if(!sim.completed)throw Error('Incomplete simulation');
  const row={version,sourceHash:hash(source),map,scene,seed,start,inputHash:hash({roster,tactic,seed,map,scene}),roundHash:hash(sim.roundHist),rounds:sim.roundHist.length,ct:sim.roundHist.filter(r=>r.winnerSide==='ct').length,timeouts:sim.roundHist.filter(r=>r.how==='time').length,plants:sim.bombAudit.plantEvents.length,defuses:sim.bombAudit.defuseEvents.length,illegalWalls:sim.navigationAudit.illegalWallCrossings,spawnViolations:sim.navigationAudit.spawnAnchorViolations};
  rows.push(row);fs.appendFileSync(path.join(out,'pairs.ndjson'),JSON.stringify(row)+'\n');console.log(`PAIR ${rows.length}/24 ${version} ${map} ${seed} ${start} CT ${row.ct}/${row.rounds} plants ${row.plants}`);
  sim=null;globalThis.gc?.();
 }
}
for(const r of rows.filter(r=>r.version==='after'))if(rows.find(x=>x.version==='before'&&x.map===r.map&&x.seed===r.seed&&x.start===r.start)?.inputHash!==r.inputHash)throw Error('Inputs changed');
const groups=[];for(const version of ['before','after'])for(const map of ['mirage','dust2','inferno']){const rs=rows.filter(r=>r.version===version&&r.map===map);groups.push({version,map,ct:rs.reduce((n,r)=>n+r.ct,0),rounds:rs.reduce((n,r)=>n+r.rounds,0),timeouts:rs.reduce((n,r)=>n+r.timeouts,0),plants:rs.reduce((n,r)=>n+r.plants,0),seedPairs:[61001,61002].map(seed=>{const pair=rs.filter(r=>r.seed===seed);return {seed,ct:pair.reduce((n,r)=>n+r.ct,0),rounds:pair.reduce((n,r)=>n+r.rounds,0)};})});}
fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify({groups,method:'24 bounded full matches: 3 maps, 2 paired seeds, swapped starting sides, before/after. Same identities, stats 70, native side weapon policy, identical tactics and input hash. Side swap is a read-only loader hook, not an official fixture. Rounds are correlated; 2 seed pairs cannot establish population balance.'},null,2),{flag:'wx'});
console.log('CS_C4_ROUTE_PAIRS RESULT=PASS runs=24');
