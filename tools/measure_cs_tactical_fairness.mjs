// Bounded counterfactual experiment, not a new gameplay rule or formal match.
// Same actor identities/abilities/tactics; vary only initial side and kit policy.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {loadFpsMajorTestApi} from './lib/fpsMajorTestApi.mjs';
const out=process.argv[2];if(!out||!fs.existsSync(out)||fs.existsSync(path.join(out,'fairness.ndjson')))throw Error('Unique existing output required');
const source=fs.readFileSync('src/battle/fps/EsportsFPS3D.jsx','utf8'),hash=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const replaceOnce=(s,a,b)=>{if(s.split(a).length!==2)throw Error('Counterfactual hook changed: '+a);return s.replace(a,b);};
const apis={};
for(const policy of ['native','shared-p250'])for(const start of ['t','ct']){
 let code=source;
 if(start==='ct')code=replaceOnce(code,'currentSideByTeam:{[CS_TEAM_US]:"t",[CS_TEAM_ENEMY]:"ct"}','currentSideByTeam:{[CS_TEAM_US]:"ct",[CS_TEAM_ENEMY]:"t"}');
 if(policy==='shared-p250')code=replaceOnce(code,'      e.money=money;','      gun="p250";armor=true;helmet=true;nades=[];\n      e.money=money;');
 apis[policy+'/'+start]=await loadFpsMajorTestApi(code);
}
const rows=[],maps=[['mirage','major.v3'],['dust2','major.v4'],['inferno','major.v5']],sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const matrix=[];for(const [map,scene] of maps)for(const seed of map==='dust2'?[61001,61002,61003,61004]:[61001,61002])for(const policy of ['native','shared-p250'])for(const start of ['t','ct'])matrix.push({map,scene,seed,policy,start,route:'baseline'});
for(const seed of [61001,61002])for(const start of ['t','ct'])matrix.push({map:'dust2',scene:'major.v4',seed,policy:'shared-p250',start,route:'alternate-site'});
if(matrix.length!==36)throw Error('Experiment budget changed');
for(const spec of matrix){
 const {map,scene,seed,policy,start,route}=spec,api=apis[policy+'/'+start],template=api.ROSTER.filter(p=>p.side==='t').slice(0,5);
 const roster=['t','ct'].flatMap(side=>template.map((p,i)=>({...structuredClone(p),id:`${side}${i+1}`,side,name:`${side}-${i}-${p.role}`,stats:Object.fromEntries(Object.keys(p.stats).map(k=>[k,70]))})));
 const lib=api.TACTICS_DB[map],baseline=lib.t.find(t=>t.type==='default')||lib.t[0],tactic=route==='alternate-site'?lib.t.find(t=>t.site!==baseline.site&&t.site!=='mid'):baseline;
 if(!tactic)throw Error('Authored tactic missing');
 // Both teams use the identical authored tactic; side projection remains native.
 let sim=api.simulateFps(map,tactic,tactic,seed,roster,null,scene);
 if(!sim.completed)throw Error('Incomplete match');
 const shots=sim.shotCadenceTelemetry||[];if(policy==='shared-p250'&&shots.some(s=>s.gun!=='p250'))throw Error('Shared weapon precondition failed');
 const sides=sim.roundHist.map(r=>({round:r.round,winner:r.winnerSide,how:r.how,sides:r.currentSideByTeam,score:[r.tS,r.cS]}));
 const counts={};for(const r of sides){const key=r.winner+'/'+r.how;counts[key]=(counts[key]||0)+1;}
 const plants=sim.bombAudit?.plantEvents||[],defuses=sim.bombAudit?.defuseEvents||[];
 const row={sourceSha:sha,sourceHash:hash(source),...spec,inputHash:hash({roster,tactic,seed,map,scene}),roundHash:hash(sim.roundHist),score:[sim.tScore,sim.ctScore],rounds:sides.length,tWins:sides.filter(r=>r.winner==='t').length,ctWins:sides.filter(r=>r.winner==='ct').length,usWon:sim.winner==='us',counts,plantCount:plants.length,defuseCount:defuses.length,plants:plants.slice(0,8),roundsDetail:sides,gunShots:Object.fromEntries([...new Set(shots.map(s=>s.gun))].map(g=>[g,shots.filter(s=>s.gun===g).length])),audit:{wallCrossings:sim.navigationAudit?.illegalWallCrossings,spawnAnchorViolations:sim.navigationAudit?.spawnAnchorViolations},tactic:{id:tactic.id,type:tactic.type,site:tactic.site}};
 rows.push(row);fs.appendFileSync(path.join(out,'fairness.ndjson'),JSON.stringify(row)+'\n');console.log(`FAIRNESS ${rows.length}/36 ${map} ${seed} ${policy} start-${start} ${route} T:${row.tWins} CT:${row.ctWins} plants:${row.plantCount}`);
 sim=null;globalThis.gc?.();
}
const groups=[];
for(const map of maps.map(([key])=>key))for(const policy of ['native','shared-p250'])for(const route of ['baseline','alternate-site']){
 const rs=rows.filter(r=>r.map===map&&r.policy===policy&&r.route===route);if(!rs.length)continue;
 const pairs=[...new Set(rs.map(r=>r.seed))].map(seed=>{const pair=rs.filter(r=>r.seed===seed);if(pair.length!==2||new Set(pair.map(r=>r.start)).size!==2||pair[0].inputHash!==pair[1].inputHash)throw Error('Mirror pair precondition failed');const t=pair.reduce((s,r)=>s+r.tWins,0),ct=pair.reduce((s,r)=>s+r.ctWins,0);return {seed,t,ct,ctShare:ct/(t+ct),usWins:pair.filter(r=>r.usWon).length};});
 const totalT=rs.reduce((s,r)=>s+r.tWins,0),totalCT=rs.reduce((s,r)=>s+r.ctWins,0);
 groups.push({map,policy,route,matches:rs.length,pairs,totalT,totalCT,ctShare:totalCT/(totalT+totalCT),seedRange:[Math.min(...pairs.map(p=>p.ctShare)),Math.max(...pairs.map(p=>p.ctShare))],plants:rs.reduce((s,r)=>s+r.plantCount,0),defuses:rs.reduce((s,r)=>s+r.defuseCount,0)});
}
fs.writeFileSync(path.join(out,'fairness-summary.json'),JSON.stringify({status:'PASS',sourceSha:sha,sourceHash:hash(source),runs:rows.length,groups,method:'36 bounded whole matches. Exact actor identities and input hash retained across initial-side swap via read-only in-memory rule-state hook. Shared-p250 replaces only initial per-round kit/armor/nades; all actual shots checked p250. This is a diagnostic controlled kit, not an official competition result. Native weapon policy retains legal side-specific purchases. No disk source edits, no forced results. Seed ranges are descriptive, not confidence intervals; rounds within a match are correlated.'},null,2),{flag:'wx'});console.log('CS_TACTICAL_FAIRNESS RESULT=PASS runs=36');
